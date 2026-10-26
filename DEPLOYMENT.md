# Staging deployment guide

This repository now has a deployment path for the web storefront on Netlify and the API on Railway. It is intended for a private staging environment and product review, not for taking real orders or processing real payments.

## 1. Create the Railway API and database

1. Create a Railway project from the GitHub repository and use the repository root as the service root. Keep the root `railway.toml` active; it builds and starts only the API workspace.
2. Add a Railway PostgreSQL service. Set the API service's `DATABASE_URL` to the database's private connection URL/reference.
3. Generate a public API domain in Railway. The API listens on Railway's injected `PORT`; `/health` checks database connectivity.
4. Set `CORS_ORIGINS` to the exact Netlify site origin, such as `https://your-staging-site.netlify.app` (no trailing slash). Add a comma-separated list only if there are multiple trusted browser origins.
5. Set `DEPLOYMENT_COUNTRY=ZM`, `DEFAULT_CURRENCY=ZMW`, and configure `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URL` for the selected identity provider before testing protected routes. Do not put secrets in Git or `NEXT_PUBLIC_*` variables.
6. Railway runs database migrations before each deployment through the configured pre-deploy command. Do not run the development seed against production data. For a disposable staging database only, optionally run `npm run db:seed` once after the first migration.

## 2. Create the Netlify website

1. Import the same GitHub repository as a Netlify site and select `apps/web` as the package directory. Keep the base directory at the repository root so npm workspaces and shared contracts can be installed and built.
2. Use the root `netlify.toml`. Its build command compiles shared contracts and the Next.js web workspace; Netlify's Next.js adapter handles the `.next` output.
3. Set `NEXT_PUBLIC_API_URL` to the Railway API's HTTPS origin, for example `https://katondo-api-production.up.railway.app` (no trailing slash), and deploy.
4. Copy the final Netlify site origin into Railway's `CORS_ORIGINS`, then redeploy the API if it changed.

## Required Railway variables

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Railway PostgreSQL private connection URL |
| `CORS_ORIGINS` | Exact Netlify HTTPS site origin(s), comma-separated |
| `DEPLOYMENT_COUNTRY` | `ZM` |
| `DEFAULT_CURRENCY` | `ZMW` |
| `AUTH_ISSUER` | Issuer URL for the configured identity provider |
| `AUTH_AUDIENCE` | Expected API audience, e.g. `katondo-api` |
| `AUTH_JWKS_URL` | Provider's public JWKS endpoint |
| `AUTH_ENABLED` | `true` only after the identity release gate passes |
| `AUTH_DATA_PROCESSING_APPROVED` | `true` only after the approved provider arrangement is recorded |
| `SELLER_ONBOARDING_ENABLED` | `true` only for the approved onboarding release |
| `SELLER_DATA_PROCESSING_APPROVED` | `true` only after the data-processing release gate passes |
| `SELLER_TERMS_VERSION` / `SELLER_TERMS_URL` | Exact published seller terms version and HTTPS URL |
| `PRIVACY_NOTICE_VERSION` / `PRIVACY_NOTICE_URL` | Exact published privacy notice version and HTTPS URL |
| `ACTIVITY_IP_HASH_SECRET` | Long random secret required before enabling technical-context collection |

`PORT` is supplied by Railway. `API_PORT` is only a local-development fallback. The public web build also needs `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AUTH_AUTHORITY`, `NEXT_PUBLIC_AUTH_CLIENT_ID`, `NEXT_PUBLIC_AUTH_ACCOUNT_URL`, and the registered callback/logout URLs set in Netlify. `NEXT_PUBLIC_AUTH_ACCOUNT_URL` must be the provider's HTTPS self-service account page where human users can update passwords, recovery methods, MFA and verified contact details. Register `https://<site>/auth/callback` as the OIDC callback and `https://<site>/sell` as the post-logout URL. Public OIDC client settings are not client secrets; never place a confidential client secret in a `NEXT_PUBLIC_*` variable.

## Staff and AI access

Employees open `/admin` and use the same OIDC callback. The provider must issue server-managed staff roles; bootstrap the first `super_administrator` in the identity provider, never through a public registration flow. Require verified work contact details and MFA. Other supported roles are `administrator`, `seller_reviewer`, `customer_support`, `finance_operator`, `fulfilment_operator`, `platform_operator`, and `auditor`.

All human users open `/account` to manage Katondo preferences and follow the provider's secure account-management link for password, recovery, MFA and contact changes. Katondo must never receive or store current or replacement passwords. AI agents have no personal account page; rotate their confidential credentials in the identity provider or secret manager.

AI agents use separate confidential machine clients. Their tokens must carry `service_agent` and a `client_id` or `azp` matching an active record created by a top administrator in Katondo. Do not put machine client secrets in Netlify, source code, logs, or the agent registry. See `docs/operations/STAFF_AND_AGENT_ACCESS.md`.

Activity collection starts disabled in migration `004_staff_agents_activity.sql`. If technical context is approved, set a long random `ACTIVITY_IP_HASH_SECRET` in Railway before enabling that option. Enabling any category requires the documented purpose, lawful basis, notice, retention and hosting approval for the exact events collected.

## Current staging limitations

- The web storefront, catalogue API, and gated seller sign-in/application flow are implemented. The seller flow remains closed until an approved OIDC provider, published policies, data-processing approval flags, and migration are configured.
- Payment, payout, seller verification provider, delivery, media storage, and livestream integrations are not implemented. Do not collect real money or promise real fulfilment.
- The current product listing media fields are not connected to uploads or object storage.
- The dependency audit has 5 high advisories, all in Expo SDK 58's mobile CLI/code-signing toolchain; see `SECURITY.md`. The compatible API runtime fix was applied. Native build/signing still needs its own security gate.
- Complete a controlled staging smoke test after deployment: `/health`, `/api/catalogue`, web catalogue rendering, CORS from the deployed site, and one deploy with a schema migration. Seed data is demo-only.

## Seller onboarding readiness

Use `docs/compliance/SELLER_ONBOARDING_RELEASE.md` for the approval-to-launch sequence and release checks.

The API provides authenticated seller-application and administrator-review endpoints. Applications are deliberately disabled unless all of these Railway variables are reviewed and configured: `SELLER_ONBOARDING_ENABLED=true`, `SELLER_DATA_PROCESSING_APPROVED=true`, `SELLER_TERMS_VERSION`, and `PRIVACY_NOTICE_VERSION`. Do not enable data processing approval until qualified Zambian privacy counsel and the Data Protection Commission have confirmed Katondo's registration, hosting/data-location, cross-border transfer, notice, and retention requirements. The starter form stores only legal name, storefront name, seller type, city, optional business registration number, accepted policy versions, and account contact claims marked verified by the identity provider. It does not collect identity-document images, financial account details, or proof-of-address documents.

The identity provider is not selected. Signed JWTs must use a Zambian-approved provider/hosting arrangement and issue `sub`, an email or phone claim plus its corresponding `email_verified` or `phone_number_verified` claim, and only server-assigned roles. The administrator role must only be granted to trusted staff. Authenticated API routes remain disabled unless `AUTH_ENABLED=true` and `AUTH_DATA_PROCESSING_APPROVED=true`, as well as issuer/audience/JWKS values. Reviewers can move applications into review or reject them; this starter flow cannot mark a seller verified. A verified seller state must not be used as a substitute for provider-backed KYC, PACRA checks, or legal approval where those are required. Existing listings and authentication-provider configuration must be reviewed before enabling seller selling permissions.

See `docs/compliance/ZAMBIA_DATA_PROTECTION_READINESS.md` for the known data map and release gates. `docs/legal/PRIVACY_NOTICE_DRAFT.md` and `docs/legal/SELLER_TERMS_DRAFT.md` are expressly unapproved drafts; do not configure their versions as production policies or present them for acceptance until Zambian counsel approves final, product-accurate documents. Current deployment settings put the API in EU West; take no personal-data collection live until the DPC/transfer and hosting review is resolved.

## Hosting split

Use Netlify for the Next.js web storefront and Railway for the long-running Express API and PostgreSQL. Deploy iOS/Android separately through Expo's native build and app-store release workflow; hosting these web services does not publish mobile apps.
