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
type AuthenticatedRequest = Request & { user?: { id: string; roles: UserRole[] } };

const issuer = process.env.AUTH_ISSUER;
const audience = process.env.AUTH_AUDIENCE;
const jwksUrl = process.env.AUTH_JWKS_URL;
const remoteJwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;

async function authenticate(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (!issuer || !audience || !remoteJwks) {
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

app.get('/api/admin/health', authenticate, requireRole('administrator'), (_request, response) => {
  response.json({ status: 'ok' });
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
