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
import { createAccountRouter } from './account.js';
import { recordActivity, scheduleActivityRetention } from './activity.js';
import { ensurePlatformUser, findPlatformUserId } from './identity.js';
import { readReleaseReadiness } from './release.js';

const app = express();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
const audience = process.env.AUTH_AUDIENCE;
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

async function authenticate(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (!authenticationEnabled || !issuer || !audience || !remoteJwks) {
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

    const actorType = roles.some((role) => staffRoles.includes(role))
      ? 'staff'
      : roles.some((role) => role === 'individual_seller' || role === 'business_seller')
        ? 'seller'
        : 'buyer';
    const authenticationMethods = Array.isArray(payload.amr)
      ? payload.amr.filter((method): method is string => typeof method === 'string')
      : [];
    if (actorType === 'staff' && process.env.AUTH_REQUIRE_MFA_FOR_STAFF === 'true'
      && !authenticationMethods.some((method) => ['mfa', 'otp', 'hwk'].includes(method))) {
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
      email: typeof payload.email === 'string' ? payload.email : undefined,
      phone: typeof payload.phone_number === 'string' ? payload.phone_number : undefined,
      emailVerified: payload.email_verified === true,
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

app.get('/api/catalogue', async (request: AuthenticatedRequest, response) => {
  try {
    const [categoriesResult, listingsResult] = await Promise.all([
      pool.query('SELECT id, name, slug FROM categories ORDER BY name'),
      pool.query(`
        SELECT l.id, l.title, l.description, l.price_minor, l.currency,
               l.condition, l.category_id, c.name AS category_name,
               l.seller_name, l.quantity
        FROM listings l
        JOIN categories c ON c.id = l.category_id
        ORDER BY l.created_at DESC
      `),
    ]);

    const result: CatalogueResponse = {
      categories: categoriesResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
      })),
      listings: listingsResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        priceMinor: Number(row.price_minor),
        currency: row.currency.trim(),
        condition: row.condition,
        categoryId: row.category_id,
        categoryName: row.category_name,
        sellerName: row.seller_name,
        quantity: row.quantity,
      })),
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
    });
  } catch (error) {
    console.error('Seller onboarding release check failed', error);
    response.json({ enabled: false, authenticationEnabled, sellerTerms: null, privacyNotice: null });
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
             a.legal_name, a.business_registration_number, a.city, a.accepted_at
      FROM sellers s
      LEFT JOIN seller_applications a ON a.seller_id = s.id
      WHERE s.user_id = $1
    `, [userId]);
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
        seller_terms_version, privacy_notice_version
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [sellerId, legalName, sellerType === 'business' ? registrationNumber : null, city, sellerTermsVersion, privacyNoticeVersion]);
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
    response.status(201).json({ application: { ...seller.rows[0], city, acceptedAt: new Date().toISOString() } });
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
             a.legal_name, a.business_registration_number, a.city, a.accepted_at,
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
      WHERE s.verification_status IN ('pending', 'in_review')
      ORDER BY a.accepted_at ASC
    `);
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
      RETURNING id, verification_status
    `, [sellerId, status]);
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
      pool.query(`SELECT verification_status AS status, COUNT(*)::int AS count FROM sellers GROUP BY verification_status ORDER BY verification_status`),
      pool.query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount_minor), 0)::text AS amount_minor FROM payment_records GROUP BY status ORDER BY status`),
      pool.query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount_minor), 0)::text AS amount_minor FROM payout_records GROUP BY status ORDER BY status`),
      pool.query(`SELECT delivery_mode, COUNT(*)::int AS count FROM delivery_options WHERE is_active GROUP BY delivery_mode ORDER BY delivery_mode`),
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

scheduleActivityRetention(pool);

app.listen(port, () => {
  console.log(`Katondo API listening on http://localhost:${port}`);
});
