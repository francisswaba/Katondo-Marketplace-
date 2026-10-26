import type { Pool, PoolClient } from 'pg';
import type { AuthenticatedPrincipal } from './access.js';

type DatabaseClient = Pool | PoolClient;

export async function findPlatformUserId(database: DatabaseClient, principal: AuthenticatedPrincipal) {
  if (principal.platformUserId) return principal.platformUserId;
  const result = await database.query('SELECT id FROM users WHERE identity_subject = $1', [principal.id]);
  const userId = result.rows[0]?.id as string | undefined;
  if (userId) principal.platformUserId = userId;
  return userId;
}

export async function ensurePlatformUser(database: DatabaseClient, principal: AuthenticatedPrincipal) {
  if (principal.actorType === 'ai_agent') {
    throw new Error('Service agents do not have human user records.');
  }
  if (principal.platformUserId) return principal.platformUserId;

  const email = principal.emailVerified ? principal.email : undefined;
  const phone = principal.phoneVerified ? principal.phone : undefined;
  if (!email && !phone) {
    throw new Error('A verified email address or phone number is required.');
  }

  const result = await database.query(`
    INSERT INTO users (identity_subject, email, phone)
    VALUES ($1, $2, $3)
    ON CONFLICT (identity_subject) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, users.email),
      phone = COALESCE(EXCLUDED.phone, users.phone)
    RETURNING id
  `, [principal.id, email ?? null, phone ?? null]);
  principal.platformUserId = result.rows[0].id as string;
  return principal.platformUserId;
}
