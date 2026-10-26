import './config.js';
import cors from 'cors';
import express from 'express';
import { Pool } from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request, Response, NextFunction } from 'express';
import type { CatalogueResponse } from '@katondo/contracts';

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
app.use(express.json());

type UserRole = 'buyer' | 'individual_seller' | 'business_seller' | 'platform_operator' | 'administrator';
type AuthenticatedRequest = Request & { user?: { id: string; roles: UserRole[]; email?: string; phone?: string; emailVerified: boolean; phoneVerified: boolean } };

const issuer = process.env.AUTH_ISSUER;
const audience = process.env.AUTH_AUDIENCE;
const jwksUrl = process.env.AUTH_JWKS_URL;
const authenticationEnabled = process.env.AUTH_ENABLED === 'true' && process.env.AUTH_DATA_PROCESSING_APPROVED === 'true';
const remoteJwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;
const sellerTermsVersion = process.env.SELLER_TERMS_VERSION;
const sellerTermsUrl = process.env.SELLER_TERMS_URL;
const privacyNoticeVersion = process.env.PRIVACY_NOTICE_VERSION;
const privacyNoticeUrl = process.env.PRIVACY_NOTICE_URL;
const sellerOnboardingEnabled = process.env.SELLER_ONBOARDING_ENABLED === 'true'
  && process.env.SELLER_DATA_PROCESSING_APPROVED === 'true'
  && Boolean(sellerTermsVersion && sellerTermsUrl && privacyNoticeVersion && privacyNoticeUrl);

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
    const { payload } = await jwtVerify(token, remoteJwks, { issuer, audience });
    if (typeof payload.sub !== 'string') {
      response.status(401).json({ error: 'Token subject is missing.' });
      return;
    }
    const roleClaims = Array.isArray(payload.roles) ? payload.roles : [];
    const allowedRoles: UserRole[] = ['buyer', 'individual_seller', 'business_seller', 'platform_operator', 'administrator'];
    request.user = {
      id: payload.sub,
      roles: roleClaims.filter((role): role is UserRole => typeof role === 'string' && allowedRoles.includes(role as UserRole)),
      email: typeof payload.email === 'string' ? payload.email : undefined,
      phone: typeof payload.phone_number === 'string' ? payload.phone_number : undefined,
      emailVerified: payload.email_verified === true,
      phoneVerified: payload.phone_number_verified === true,
    };
    next();
  } catch {
    response.status(401).json({ error: 'Invalid or expired bearer token.' });
  }
}

function requireRole(role: UserRole) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    if (!request.user?.roles.includes(role)) {
      response.status(403).json({ error: 'Insufficient role.' });
      return;
    }
    next();
  };
}

app.get('/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  } catch {
    response.status(503).json({ status: 'unavailable' });
  }
});

app.get('/api/catalogue', async (_request, response) => {
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

    response.json(result);
  } catch (error) {
    console.error('Catalogue request failed', error);
    response.status(503).json({ error: 'Catalogue is temporarily unavailable.' });
  }
});

app.get('/api/account', authenticate, (request: AuthenticatedRequest, response) => {
  response.json({ id: request.user?.id, roles: request.user?.roles ?? [] });
});

app.get('/api/seller/onboarding/config', (_request, response) => {
  response.json({
    enabled: sellerOnboardingEnabled,
    authenticationEnabled,
    sellerTerms: sellerOnboardingEnabled ? { version: sellerTermsVersion, url: sellerTermsUrl } : null,
    privacyNotice: sellerOnboardingEnabled ? { version: privacyNoticeVersion, url: privacyNoticeUrl } : null,
  });
});

app.get('/api/seller/onboarding', authenticate, async (request: AuthenticatedRequest, response) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.seller_type, s.display_name, s.verification_status,
             a.legal_name, a.business_registration_number, a.city, a.accepted_at
      FROM sellers s
      LEFT JOIN seller_applications a ON a.seller_id = s.id
      WHERE s.user_id = $1
    `, [request.user?.id]);
    response.json({ application: result.rows[0] ?? null });
  } catch (error) {
    console.error('Seller onboarding status request failed', error);
    response.status(503).json({ error: 'Seller application status is temporarily unavailable.' });
  }
});

app.post('/api/seller/onboarding', authenticate, async (request: AuthenticatedRequest, response) => {
  const { id: userId, email, phone } = request.user!;
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

  if (!sellerOnboardingEnabled || !sellerTermsVersion || !privacyNoticeVersion) {
    response.status(503).json({ error: 'Seller applications are not open until identity, privacy, data-location, and seller policy requirements are approved.' });
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
  const verifiedEmail = request.user!.emailVerified ? email : undefined;
  const verifiedPhone = request.user!.phoneVerified ? phone : undefined;
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO users (id, email, phone) VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, users.email),
        phone = COALESCE(EXCLUDED.phone, users.phone)
    `, [userId, verifiedEmail ?? null, verifiedPhone ?? null]);
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

app.get('/api/admin/health', authenticate, requireRole('administrator'), (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/admin/seller-applications', authenticate, requireRole('administrator'), async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.user_id, s.seller_type, s.display_name, s.verification_status,
             a.legal_name, a.business_registration_number, a.city, a.accepted_at,
             u.email, u.phone
      FROM sellers s
      JOIN seller_applications a ON a.seller_id = s.id
      JOIN users u ON u.id = s.user_id
      WHERE s.verification_status IN ('pending', 'in_review')
      ORDER BY a.accepted_at ASC
    `);
    response.json({ applications: result.rows });
  } catch (error) {
    console.error('Seller application review queue failed', error);
    response.status(503).json({ error: 'Seller applications are temporarily unavailable.' });
  }
});

app.post('/api/admin/seller-applications/:sellerId/review', authenticate, requireRole('administrator'), async (request: AuthenticatedRequest, response) => {
  const status = request.body?.status;
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
  if (!['in_review', 'rejected'].includes(status) || reason.length < 3 || reason.length > 500) {
    response.status(400).json({ error: 'Choose a review status and provide a reason of 3 to 500 characters.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(`
      UPDATE sellers SET verification_status = $2
      WHERE id = $1 AND verification_status IN ('pending', 'in_review')
      RETURNING id, verification_status
    `, [request.params.sellerId, status]);
    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      response.status(404).json({ error: 'No reviewable seller application was found.' });
      return;
    }
    await client.query(`
      INSERT INTO seller_verification_events (seller_id, new_status, reason, actor_user_id)
      VALUES ($1, $2, $3, $4)
    `, [request.params.sellerId, status, reason, request.user?.id]);
    await client.query(`
      INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details)
      VALUES ($1, 'seller.application_reviewed', 'seller', $2, jsonb_build_object('status', $3, 'reason', $4))
    `, [request.user?.id, request.params.sellerId, status, reason]);
    await client.query('COMMIT');
    response.json({ application: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seller application review failed', error);
    response.status(503).json({ error: 'Seller application review could not be saved.' });
  } finally {
    client.release();
  }
});

app.get('/api/admin/operations/overview', authenticate, requireRole('administrator'), async (_request, response) => {
  try {
    const [verification, payments, payouts, deliveryOptions] = await Promise.all([
      pool.query(`SELECT verification_status AS status, COUNT(*)::int AS count FROM sellers GROUP BY verification_status ORDER BY verification_status`),
      pool.query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount_minor), 0)::text AS amount_minor FROM payment_records GROUP BY status ORDER BY status`),
      pool.query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount_minor), 0)::text AS amount_minor FROM payout_records GROUP BY status ORDER BY status`),
      pool.query(`SELECT delivery_mode, COUNT(*)::int AS count FROM delivery_options WHERE is_active GROUP BY delivery_mode ORDER BY delivery_mode`),
    ]);
    response.json({
      sellerVerification: verification.rows,
      payments: payments.rows,
      payouts: payouts.rows,
      activeDeliveryOptions: deliveryOptions.rows,
      providerIntegrationsEnabled: false,
    });
  } catch (error) {
    console.error('Operations overview request failed', error);
    response.status(503).json({ error: 'Marketplace operations data is temporarily unavailable.' });
  }
});

app.listen(port, () => {
  console.log(`Katondo API listening on http://localhost:${port}`);
});
