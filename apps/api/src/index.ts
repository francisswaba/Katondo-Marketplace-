import './config.js';
import cors from 'cors';
import express from 'express';
import { Pool } from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Response, NextFunction } from 'express';
import type { CatalogueResponse } from '@katondo/contracts';
import {
  allowedRoles,
  requireAnyRole,
  staffRoles,
  type AuthenticatedRequest,
  type UserRole,
} from './access.js';
import { createAdministrationRouter } from './admin.js';
import { createAccountRouter, purgeClosedAccounts } from './account.js';
import { createListingsRouter, listingColumns, mapListingRow } from './listings.js';
import { productTypeIds } from '@katondo/contracts';
import { recordActivity, scheduleActivityRetention } from './activity.js';
import { ensurePlatformUser, findPlatformUserId } from './identity.js';
import { readReleaseReadiness } from './release.js';
import { createReviewsRouter } from './reviews.js';
import { createMessagingRouter } from './messaging.js';
import { createSupportRouter } from './support.js';
import { getMarketConfiguration } from './market.js';

const app = express();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const market = getMarketConfiguration();

const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
}));
app.use(express.json({ limit: '256kb' }));

const issuer = process.env.AUTH_ISSUER;
// One or more accepted audiences, comma-separated (Entra v2 tokens use the API's client ID).
const audience = process.env.AUTH_AUDIENCE?.split(',').map((value) => value.trim()).filter(Boolean);
// Delegated tokens must carry this permission (Entra: the API's exposed scope, e.g. access_as_user).
const requiredScope = process.env.AUTH_REQUIRED_SCOPE?.trim() || null;
// Customers get this role when the provider assigns none (Entra customers have no role assignment).
const defaultCustomerRole = (process.env.AUTH_DEFAULT_ROLE?.trim() || 'buyer') as UserRole;
// Entra checks email ownership at sign-up but doesn't send an email_verified claim.
const emailVerifiedByProvider = process.env.AUTH_EMAIL_VERIFIED_BY_PROVIDER === 'true';
// Staff MFA is enforced by the provider's Conditional Access policy when tokens carry no amr claim.
const staffMfaEnforcedByProvider = process.env.AUTH_STAFF_MFA_ENFORCED_BY_PROVIDER === 'true';
const jwksUrl = process.env.AUTH_JWKS_URL;
function validAuthenticationUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return process.env.NODE_ENV !== 'production' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
const authenticationEnabled = process.env.AUTH_ENABLED === 'true'
  && process.env.AUTH_DATA_PROCESSING_APPROVED === 'true'
  && validAuthenticationUrl(issuer)
  && validAuthenticationUrl(jwksUrl);
const remoteJwks = jwksUrl && validAuthenticationUrl(jwksUrl) ? createRemoteJWKSet(new URL(jwksUrl)) : null;
const sellerTermsVersion = process.env.SELLER_TERMS_VERSION;
const sellerTermsUrl = process.env.SELLER_TERMS_URL;
const privacyNoticeVersion = process.env.PRIVACY_NOTICE_VERSION;
const privacyNoticeUrl = process.env.PRIVACY_NOTICE_URL;

/** Zambian NRC numbers look like 123456/78/9; accept them typed with spaces or without slashes. */
function normaliseNrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[^0-9]/g, '');
  return digits.length === 9 ? `${digits.slice(0, 6)}/${digits.slice(6, 8)}/${digits.slice(8)}` : null;
}

/** Zambian mobile numbers (097…, 077…, +260 96…) stored as +260XXXXXXXXX. */
function normaliseZambianPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.replace(/[\s\-().]/g, '').match(/^(?:\+?260|0)?([79][0-9]{8})$/);
  return match ? `+260${match[1]}` : null;
}

async function authenticate(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (!authenticationEnabled || !issuer || !audience?.length || !remoteJwks) {
    response.status(503).json({ error: 'Authentication provider is not configured.' });
    return;
  }

  const authorization = request.header('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    response.status(401).json({ error: 'Bearer token required.' });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, remoteJwks, {
      issuer,
      audience,
      algorithms: ['RS256', 'PS256', 'ES256'],
      requiredClaims: ['sub', 'iat', 'exp'],
      clockTolerance: 5,
    });
    if (typeof payload.sub !== 'string') {
      response.status(401).json({ error: 'Token subject is missing.' });
      return;
    }
    const realmAccess = payload.realm_access && typeof payload.realm_access === 'object'
      ? payload.realm_access as { roles?: unknown }
      : null;
    const roleClaims = Array.isArray(payload.roles)
      ? payload.roles
      : Array.isArray(realmAccess?.roles)
        ? realmAccess.roles
        : [];
    const roles = roleClaims.filter((role): role is UserRole => typeof role === 'string' && allowedRoles.includes(role as UserRole));
    const scopes = typeof payload.scp === 'string' ? payload.scp.split(' ') : typeof payload.scope === 'string' ? payload.scope.split(' ') : [];
    const clientId = typeof payload.client_id === 'string'
      ? payload.client_id
      : typeof payload.azp === 'string'
        ? payload.azp
        : undefined;

    if (roles.includes('service_agent')) {
      if (!clientId) {
        response.status(403).json({ error: 'Service-agent client identity is missing.' });
        return;
      }
      const agent = await pool.query(`
        UPDATE service_agents SET last_seen_at = NOW(), updated_at = NOW()
        WHERE client_id = $1 AND status = 'active'
        RETURNING id, permissions
      `, [clientId]);
      if (!agent.rowCount) {
        response.status(403).json({ error: 'Service agent is not registered or is disabled.' });
        return;
      }
      request.user = {
        id: payload.sub,
        roles: ['service_agent'],
        permissions: agent.rows[0].permissions,
        actorType: 'ai_agent',
        clientId,
        agentId: agent.rows[0].id,
        emailVerified: false,
        phoneVerified: false,
      };
      next();
      return;
    }

    if (requiredScope && !scopes.includes(requiredScope)) {
      response.status(403).json({ error: 'This sign-in is not allowed to use Katondo. Sign in again from the Katondo website or app.' });
      return;
    }

    // One look-up for the account's status (closing/closed) and, for customers, a verified seller record.
    const isStaff = roles.some((role) => staffRoles.includes(role));
    const account = await pool.query(`
      SELECT u.status, u.deletion_due_at, u.accepted_policy_version, (
        SELECT s.seller_type FROM sellers s
        WHERE s.user_id = u.id AND s.verification_status = 'verified' LIMIT 1
      ) AS seller_type
      FROM users u WHERE u.identity_subject = $1
    `, [payload.sub]);
    const accountRow = account.rows[0] as { status: 'active' | 'pending_deletion' | 'deleted'; deletion_due_at: Date | null; accepted_policy_version: string | null; seller_type: string | null } | undefined;
    if (accountRow?.status === 'deleted') {
      response.status(403).json({ error: 'This Katondo account was closed.', code: 'account_closed' });
      return;
    }
    // While an account is closing, only the account page and "restore" work.
    const closingAllowed = ['/api/account', '/api/account/settings', '/api/account/restore'];
    if (accountRow?.status === 'pending_deletion' && !closingAllowed.includes(request.path)) {
      response.status(403).json({ error: 'This account is being closed. Restore it from your account page to use Katondo again.', code: 'account_pending_deletion' });
      return;
    }
    // Customers confirm they are 18+ and accept the current privacy notice and terms before anything else.
    // They can still read their account, accept, or close the account if they don't agree.
    const policyRequired = !isStaff && Boolean(privacyNoticeVersion) && accountRow?.accepted_policy_version !== privacyNoticeVersion;
    const policyAllowed = ['/api/account', '/api/account/settings', '/api/account/accept-policies', '/api/account/close', '/api/account/restore'];
    if (policyRequired && !policyAllowed.includes(request.path)) {
      response.status(403).json({ error: 'Confirm you are 18 or over and accept Katondo’s privacy notice and terms to continue.', code: 'policies_required' });
      return;
    }
    // Sellers are approved in Katondo, not in the sign-in provider: add the seller role from the database.
    if (!isStaff) {
      const sellerType = accountRow?.seller_type ?? undefined;
      if (sellerType === 'individual' && !roles.includes('individual_seller')) roles.push('individual_seller');
      if (sellerType === 'business' && !roles.includes('business_seller')) roles.push('business_seller');
      if (!roles.includes(defaultCustomerRole) && allowedRoles.includes(defaultCustomerRole)) roles.push(defaultCustomerRole);
    }

    const actorType = roles.some((role) => staffRoles.includes(role))
      ? 'staff'
      : roles.some((role) => role === 'individual_seller' || role === 'business_seller')
        ? 'seller'
        : 'buyer';
    const authenticationMethods = Array.isArray(payload.amr)
      ? payload.amr.filter((method): method is string => typeof method === 'string')
      : [];
    const mfaShown = authenticationMethods.some((method) => ['mfa', 'otp', 'hwk'].includes(method));
    const mfaLeftToProvider = staffMfaEnforcedByProvider && authenticationMethods.length === 0;
    if (actorType === 'staff' && process.env.AUTH_REQUIRE_MFA_FOR_STAFF === 'true' && !mfaShown && !mfaLeftToProvider) {
      response.status(403).json({ error: 'Staff accounts must complete multi-factor authentication.' });
      return;
    }
    if (actorType === 'staff') {
      const staffStatus = await pool.query(`
        SELECT sm.status FROM users u
        JOIN staff_members sm ON sm.user_id = u.id
        WHERE u.identity_subject = $1
      `, [payload.sub]);
      if (!staffStatus.rows[0] && !['/api/admin/session', '/api/account/settings'].includes(request.path)) {
        response.status(403).json({ error: 'Complete staff sign-in before using administration APIs.' });
        return;
      }
      if (staffStatus.rows[0] && staffStatus.rows[0].status !== 'active') {
        void recordActivity(pool, request, 'security', 'staff.access_blocked', { metadata: { status: staffStatus.rows[0].status } });
        response.status(403).json({ error: 'This staff account is not active.' });
        return;
      }
    }
    const email = typeof payload.email === 'string'
      ? payload.email
      : Array.isArray(payload.emails) && typeof payload.emails[0] === 'string'
        ? payload.emails[0]
        : undefined;
    request.user = {
      id: payload.sub,
      roles,
      permissions: [],
      actorType,
      displayName: typeof payload.name === 'string'
        ? payload.name
        : typeof payload.preferred_username === 'string'
          ? payload.preferred_username
          : undefined,
      email,
      phone: typeof payload.phone_number === 'string' ? payload.phone_number : undefined,
      emailVerified: payload.email_verified === true || (emailVerifiedByProvider && Boolean(email)),
      objectId: typeof payload.oid === 'string' ? payload.oid : undefined,
      accountStatus: accountRow?.status ?? 'active',
      deletionDueAt: accountRow?.deletion_due_at instanceof Date ? accountRow.deletion_due_at.toISOString() : null,
      policiesRequired: policyRequired,
      phoneVerified: payload.phone_number_verified === true,
    };
    next();
  } catch {
    void recordActivity(pool, request, 'security', 'authentication.failed');
    response.status(401).json({ error: 'Invalid or expired bearer token.' });
  }
}

app.get('/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  } catch {
    response.status(503).json({ status: 'unavailable' });
  }
});

app.get('/api/market', (_request, response) => {
  response.json(market);
});

app.get('/api/catalogue', async (request: AuthenticatedRequest, response) => {
  const requestedType = typeof request.query.type === 'string' ? request.query.type : '';
  const productType = (productTypeIds as string[]).includes(requestedType) ? requestedType : null;
  try {
    const [categoriesResult, listingsResult] = await Promise.all([
      pool.query('SELECT id, name, slug FROM categories ORDER BY name'),
      pool.query(`
        SELECT ${listingColumns}
        FROM listings l
        JOIN categories c ON c.id = l.category_id
        WHERE l.country_code = $1 AND l.status = 'published'
          AND ($2::text IS NULL OR l.product_type = $2)
        ORDER BY l.created_at DESC
        LIMIT 120
      `, [market.countryCode, productType]),
    ]);

    const result: CatalogueResponse = {
      market,
      categories: categoriesResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
      })),
      listings: listingsResult.rows.map(mapListingRow),
    };

    await recordActivity(pool, request, 'buyer', 'buyer.catalogue_loaded', {
      metadata: { categoryCount: result.categories.length, listingCount: result.listings.length },
    });
    response.json(result);
  } catch (error) {
    console.error('Catalogue request failed', error);
    response.status(503).json({ error: 'Catalogue is temporarily unavailable.' });
  }
});

app.get('/api/account', authenticate, (request: AuthenticatedRequest, response) => {
  response.json({ id: request.user?.id, roles: request.user?.roles ?? [], actorType: request.user?.actorType });
});

const clientActivityEvents: Record<string, { category: 'buyer' | 'seller'; roles: UserRole[] }> = {
  'buyer.catalogue_viewed': { category: 'buyer', roles: ['buyer'] },
  'buyer.search_performed': { category: 'buyer', roles: ['buyer'] },
  'buyer.checkout_started': { category: 'buyer', roles: ['buyer'] },
  'seller.application_viewed': { category: 'seller', roles: ['buyer', 'individual_seller', 'business_seller'] },
  'seller.dashboard_viewed': { category: 'seller', roles: ['individual_seller', 'business_seller'] },
  'seller.listing_editor_opened': { category: 'seller', roles: ['individual_seller', 'business_seller'] },
};

app.post('/api/activity', authenticate, async (request: AuthenticatedRequest, response) => {
  const eventName = typeof request.body?.eventName === 'string' ? request.body.eventName : '';
  const definition = clientActivityEvents[eventName];
  if (!definition || !request.user?.roles.some((role) => definition.roles.includes(role))) {
    response.status(400).json({ error: 'Unsupported activity event.' });
    return;
  }
  const metadata = request.body?.metadata && typeof request.body.metadata === 'object' && !Array.isArray(request.body.metadata)
    ? request.body.metadata
    : {};
  if (JSON.stringify(metadata).length > 2048) {
    response.status(400).json({ error: 'Activity metadata is too large.' });
    return;
  }
  request.user.platformUserId = await findPlatformUserId(pool, request.user) ?? undefined;
  await recordActivity(pool, request, definition.category, eventName, { metadata });
  response.status(202).json({ recorded: true });
});

app.get('/api/seller/onboarding/config', async (_request, response) => {
  try {
    const readiness = await readReleaseReadiness(pool);
    response.json({
      enabled: readiness.onboardingOpen,
      authenticationEnabled,
      sellerTerms: readiness.onboardingOpen ? { version: sellerTermsVersion, url: sellerTermsUrl } : null,
      privacyNotice: readiness.onboardingOpen ? { version: privacyNoticeVersion, url: privacyNoticeUrl } : null,
      market,
    });
  } catch (error) {
    console.error('Seller onboarding release check failed', error);
    response.json({ enabled: false, authenticationEnabled, sellerTerms: null, privacyNotice: null, market });
  }
});

app.get('/api/seller/onboarding', authenticate, async (request: AuthenticatedRequest, response) => {
  try {
    const userId = await findPlatformUserId(pool, request.user!);
    if (!userId) {
      response.json({ application: null });
      return;
    }
    const result = await pool.query(`
      SELECT s.id, s.seller_type, s.display_name, s.verification_status,
             a.legal_name, a.business_registration_number, a.city, a.country_code, a.accepted_at
      FROM sellers s
      JOIN seller_applications a ON a.seller_id = s.id
      WHERE s.user_id = $1 AND a.country_code = $2
    `, [userId, market.countryCode]);
    await recordActivity(pool, request, 'seller', 'seller.application_viewed');
    response.json({ application: result.rows[0] ?? null });
  } catch (error) {
    console.error('Seller onboarding status request failed', error);
    response.status(503).json({ error: 'Seller application status is temporarily unavailable.' });
  }
});

app.post('/api/seller/onboarding', authenticate, async (request: AuthenticatedRequest, response) => {
  const { email, phone } = request.user!;
  const sellerType = request.body?.sellerType;
  const displayName = typeof request.body?.displayName === 'string' ? request.body.displayName.trim() : '';
  const legalName = typeof request.body?.legalName === 'string' ? request.body.legalName.trim() : '';
  const city = typeof request.body?.city === 'string' ? request.body.city.trim() : '';
  const registrationNumber = typeof request.body?.businessRegistrationNumber === 'string'
    ? request.body.businessRegistrationNumber.trim()
    : '';
  const nrcNumber = sellerType === 'individual' ? normaliseNrc(request.body?.nrcNumber) : null;
  const contactPhone = sellerType === 'individual' ? normaliseZambianPhone(request.body?.contactPhone) : null;
  if (sellerType === 'individual' && (!nrcNumber || !contactPhone)) {
    response.status(400).json({ error: 'Give your NRC number (like 123456/78/9) and a Zambian phone number you can be reached on.' });
    return;
  }
  if (request.body?.confirmAdult !== true) {
    response.status(400).json({ error: 'Sellers must be 18 or over.' });
    return;
  }

  if (!['individual', 'business'].includes(sellerType) || displayName.length < 2 || displayName.length > 120 || legalName.length < 2 || legalName.length > 160 || city.length < 2 || city.length > 100 || (sellerType === 'business' && (registrationNumber.length < 2 || registrationNumber.length > 80)) || (sellerType === 'individual' && registrationNumber.length > 0)) {
    response.status(400).json({ error: 'Check the seller type, legal name, storefront name, city, and business registration number.' });
    return;
  }

  try {
    const readiness = await readReleaseReadiness(pool);
    if (!readiness.onboardingOpen || !sellerTermsVersion || !privacyNoticeVersion) {
      response.status(503).json({ error: 'Seller applications are not open until identity, privacy, data-location, and seller policy requirements are approved.' });
      return;
    }
  } catch {
    response.status(503).json({ error: 'Seller applications are closed because release approval status is unavailable.' });
    return;
  }
  if (request.body?.acceptSellerTerms !== true || request.body?.acknowledgePrivacyNotice !== true) {
    response.status(400).json({ error: 'Review and accept the seller terms and privacy notice to continue.' });
    return;
  }
  if (!(email && request.user!.emailVerified) && !(phone && request.user!.phoneVerified)) {
    response.status(400).json({ error: 'Verify an email address or phone number on your account before applying.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = await ensurePlatformUser(client, request.user!);
    const seller = await client.query(`
      INSERT INTO sellers (user_id, seller_type, display_name)
      VALUES ($1, $2, $3)
      RETURNING id, seller_type, display_name, verification_status
    `, [userId, sellerType, displayName]);
    const sellerId = seller.rows[0].id as string;
    await client.query(`
      INSERT INTO seller_applications (
        seller_id, legal_name, business_registration_number, city,
        seller_terms_version, privacy_notice_version, country_code, nrc_number, contact_phone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [sellerId, legalName, sellerType === 'business' ? registrationNumber : null, city, sellerTermsVersion, privacyNoticeVersion, market.countryCode, nrcNumber, contactPhone]);
    await client.query(`
      INSERT INTO seller_verification_events (seller_id, new_status, reason, actor_user_id)
      VALUES ($1, 'pending', 'Seller application submitted for review', $2)
    `, [sellerId, userId]);
    await client.query(`
      INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id)
      VALUES ($1, 'seller.application_submitted', 'seller', $2)
    `, [userId, sellerId]);
    await client.query('COMMIT');
    await recordActivity(pool, request, 'seller', 'seller.application_submitted', { subjectType: 'seller', subjectId: sellerId });
    response.status(201).json({ application: { ...seller.rows[0], city, countryCode: market.countryCode, acceptedAt: new Date().toISOString() } });
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') {
      response.status(409).json({ error: 'A seller application already exists for this account.' });
      return;
    }
    console.error('Seller application submission failed', error);
    response.status(503).json({ error: 'Seller application could not be saved. Please try again later.' });
  } finally {
    client.release();
  }
});

app.get('/api/admin/health', authenticate, requireAnyRole(staffRoles), (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/admin/seller-applications', authenticate, requireAnyRole(['super_administrator', 'administrator', 'seller_reviewer', 'auditor']), async (request: AuthenticatedRequest, response) => {
  try {
    request.user!.platformUserId = await ensurePlatformUser(pool, request.user!);
    const result = await pool.query(`
      SELECT s.id, s.user_id, s.seller_type, s.display_name, s.verification_status,
             a.legal_name, a.business_registration_number, a.nrc_number, a.contact_phone, a.city, a.country_code, a.accepted_at,
             u.email, u.phone,
             triage.recommendation AS agent_recommendation,
             triage.summary AS agent_summary,
             triage.created_at AS agent_recommended_at
      FROM sellers s
      JOIN seller_applications a ON a.seller_id = s.id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN LATERAL (
        SELECT recommendation, summary, created_at
        FROM agent_triage_recommendations
        WHERE seller_id = s.id
        ORDER BY created_at DESC LIMIT 1
      ) triage ON TRUE
      WHERE s.verification_status IN ('pending', 'in_review') AND a.country_code = $1
      ORDER BY a.accepted_at ASC
    `, [market.countryCode]);
    await recordActivity(pool, request, 'staff', 'staff.seller_applications_viewed', { metadata: { count: result.rowCount } });
    response.json({ applications: result.rows });
  } catch (error) {
    console.error('Seller application review queue failed', error);
    response.status(503).json({ error: 'Seller applications are temporarily unavailable.' });
  }
});

app.post('/api/admin/seller-applications/:sellerId/review', authenticate, requireAnyRole(['super_administrator', 'administrator', 'seller_reviewer']), async (request: AuthenticatedRequest, response) => {
  const sellerId = Array.isArray(request.params.sellerId) ? request.params.sellerId[0] : request.params.sellerId;
  const status = request.body?.status;
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
  if (!['in_review', 'rejected'].includes(status) || reason.length < 3 || reason.length > 500) {
    response.status(400).json({ error: 'Choose a review status and provide a reason of 3 to 500 characters.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reviewerUserId = await ensurePlatformUser(client, request.user!);
    const updated = await client.query(`
      UPDATE sellers SET verification_status = $2
      WHERE id = $1 AND verification_status IN ('pending', 'in_review')
        AND EXISTS (
          SELECT 1 FROM seller_applications a
          WHERE a.seller_id = sellers.id AND a.country_code = $3
        )
      RETURNING id, verification_status
    `, [sellerId, status, market.countryCode]);
    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      response.status(404).json({ error: 'No reviewable seller application was found.' });
      return;
    }
    await client.query(`
      INSERT INTO seller_verification_events (seller_id, new_status, reason, actor_user_id)
      VALUES ($1, $2, $3, $4)
    `, [sellerId, status, reason, reviewerUserId]);
    await client.query(`
      INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details)
      VALUES ($1, 'seller.application_reviewed', 'seller', $2, jsonb_build_object('status', $3, 'reason', $4))
    `, [reviewerUserId, sellerId, status, reason]);
    await client.query('COMMIT');
    await recordActivity(pool, request, 'staff', 'staff.seller_application_reviewed', {
      subjectType: 'seller', subjectId: sellerId, metadata: { status },
    });
    response.json({ application: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seller application review failed', error);
    response.status(503).json({ error: 'Seller application review could not be saved.' });
  } finally {
    client.release();
  }
});

app.get('/api/admin/operations/overview', authenticate, requireAnyRole(['super_administrator', 'administrator', 'platform_operator', 'finance_operator', 'fulfilment_operator', 'auditor']), async (request: AuthenticatedRequest, response) => {
  try {
    request.user!.platformUserId = await ensurePlatformUser(pool, request.user!);
    const [verification, payments, payouts, deliveryOptions] = await Promise.all([
      pool.query(`SELECT s.verification_status AS status, COUNT(*)::int AS count FROM sellers s JOIN seller_applications a ON a.seller_id = s.id WHERE a.country_code = $1 GROUP BY s.verification_status ORDER BY s.verification_status`, [market.countryCode]),
      pool.query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount_minor), 0)::text AS amount_minor FROM payment_records WHERE country_code = $1 GROUP BY status ORDER BY status`, [market.countryCode]),
      pool.query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount_minor), 0)::text AS amount_minor FROM payout_records WHERE country_code = $1 GROUP BY status ORDER BY status`, [market.countryCode]),
      pool.query(`SELECT delivery_mode, COUNT(*)::int AS count FROM delivery_options WHERE is_active AND country_code = $1 GROUP BY delivery_mode ORDER BY delivery_mode`, [market.countryCode]),
    ]);
    const result = {
      sellerVerification: verification.rows,
      payments: payments.rows,
      payouts: payouts.rows,
      activeDeliveryOptions: deliveryOptions.rows,
      providerIntegrationsEnabled: false,
    };
    await recordActivity(pool, request, 'staff', 'staff.operations_overview_viewed');
    response.json(result);
  } catch (error) {
    console.error('Operations overview request failed', error);
    response.status(503).json({ error: 'Marketplace operations data is temporarily unavailable.' });
  }
});

app.use(createAdministrationRouter(pool, authenticate));
app.use(createAccountRouter(pool, authenticate));
app.use(createListingsRouter(pool, authenticate));
app.use(createReviewsRouter(pool, authenticate));
app.use(createMessagingRouter(pool, authenticate));
app.use(createSupportRouter(pool, authenticate));

scheduleActivityRetention(pool);

// Anonymise accounts whose 30-day restore period has ended: shortly after start, then every 6 hours.
const runAccountPurge = () => purgeClosedAccounts(pool).then((count) => {
  if (count) console.log(`Anonymised ${count} closed account(s).`);
}).catch((error) => console.error('Closed-account purge failed', error));
setTimeout(runAccountPurge, 60_000).unref();
setInterval(runAccountPurge, 6 * 3_600_000).unref();

app.listen(port, () => {
  console.log(`Katondo API listening on http://localhost:${port}`);
});
