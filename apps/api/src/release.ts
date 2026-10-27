import type { Pool, PoolClient } from 'pg';
import { getMarketConfiguration } from './market.js';

type DatabaseClient = Pool | PoolClient;

export const releaseControlKeys = [
  'identity_provider',
  'privacy_notice',
  'seller_terms',
  'data_processing',
  'hosting_and_transfers',
  'seller_onboarding_release',
] as const;

export type ReleaseControlKey = typeof releaseControlKeys[number];

function isHttpsUrl(value: string | undefined) {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function readReleaseReadiness(database: DatabaseClient) {
  const market = getMarketConfiguration();
  await database.query(`
    INSERT INTO release_controls (country_code, control_key)
    SELECT $1, unnest($2::text[])
    ON CONFLICT (country_code, control_key) DO NOTHING
  `, [market.countryCode, releaseControlKeys]);
  const result = await database.query(`
    SELECT country_code, control_key, status, approver_authority, evidence_reference, notes,
           approved_at, expires_at, updated_at,
           status = 'approved' AND (expires_at IS NULL OR expires_at > NOW()) AS effective
    FROM release_controls WHERE country_code = $1 ORDER BY control_key
  `, [market.countryCode]);
  const controls = Object.fromEntries(result.rows.map((row) => [row.control_key, row]));
  const requiredApprovals = releaseControlKeys.every((key) => controls[key]?.effective === true);
  const checks = {
    authenticationEnabled: process.env.AUTH_ENABLED === 'true' && process.env.AUTH_DATA_PROCESSING_APPROVED === 'true',
    identityConfiguration: Boolean(process.env.AUTH_ISSUER && process.env.AUTH_AUDIENCE && process.env.AUTH_JWKS_URL),
    secureIdentityUrls: isHttpsUrl(process.env.AUTH_ISSUER) && isHttpsUrl(process.env.AUTH_JWKS_URL),
    accountRecoveryConfigured: isHttpsUrl(process.env.AUTH_ACCOUNT_URL),
    staffMfaRequired: process.env.AUTH_REQUIRE_MFA_FOR_STAFF === 'true',
    privacyNoticePublished: Boolean(process.env.PRIVACY_NOTICE_VERSION) && isHttpsUrl(process.env.PRIVACY_NOTICE_URL),
    sellerTermsPublished: Boolean(process.env.SELLER_TERMS_VERSION) && isHttpsUrl(process.env.SELLER_TERMS_URL),
    releaseRequested: process.env.SELLER_ONBOARDING_ENABLED === 'true' && process.env.SELLER_DATA_PROCESSING_APPROVED === 'true',
    requiredApprovals,
  };
  return {
    market,
    controls: result.rows,
    checks,
    onboardingOpen: Object.values(checks).every(Boolean),
  };
}
