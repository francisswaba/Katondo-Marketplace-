# Staging deployment guide

This repository now has a deployment path for the web storefront on Netlify and the API on Railway. It is intended for a private staging environment and product review, not for taking real orders or processing real payments.

## 1. Create the Railway API and database

1. Create a Railway project from the GitHub repository and use the repository root as the service root. Keep the root `railway.toml` active; it builds and starts only the API workspace.
2. Add a Railway PostgreSQL service. Set the API service's `DATABASE_URL` to the database's private connection URL/reference.
3. Generate a public API domain in Railway. The API listens on Railway's injected `PORT`; `/health` checks database connectivity.
4. Set `CORS_ORIGINS` to the exact Netlify site origin, such as `https://your-staging-site.netlify.app` (no trailing slash). Add a comma-separated list only if there are multiple trusted browser origins.
5. Configure the active market (`DEPLOYMENT_COUNTRY=ZM`, `DEPLOYMENT_COUNTRY_NAME=Zambia`, `DEFAULT_CURRENCY=ZMW`, `DEFAULT_LOCALE=en-ZM`, and `SUPPORTED_LOCALES=en-ZM,en` for the first launch), then configure `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URL` before testing protected routes. Do not put secrets in Git or `NEXT_PUBLIC_*` variables.
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
| `DEPLOYMENT_COUNTRY` | ISO two-letter active market; `ZM` for the first launch |
| `DEPLOYMENT_COUNTRY_NAME` | Public country name; `Zambia` for the first launch |
| `DEFAULT_CURRENCY` | ISO currency; `ZMW` for the first launch |
| `DEFAULT_LOCALE` | BCP 47 default locale; `en-ZM` for the first launch |
| `SUPPORTED_LOCALES` | Comma-separated locale choices; `en-ZM,en` for the first launch |
| `AUTH_ISSUER` | Issuer URL for the configured identity provider |
| `AUTH_AUDIENCE` | Expected API audience, e.g. `katondo-api` |
| `AUTH_JWKS_URL` | Provider's public JWKS endpoint |
| `AUTH_ACCOUNT_URL` | Provider's approved HTTPS self-service password, recovery and MFA portal |
| `AUTH_ENABLED` | `true` only after the identity release gate passes |
| `AUTH_DATA_PROCESSING_APPROVED` | `true` only after the approved provider arrangement is recorded |
| `AUTH_REQUIRE_MFA_FOR_STAFF` | `true`; staff tokens must include an MFA authentication-method claim |
| `AUTH_PROVIDER` | `entra` for Microsoft Entra External ID (changes password-reset handling) |
| `AUTH_REQUIRED_SCOPE` | Permission every customer/staff token must carry; `access_as_user` for Entra |
| `AUTH_DEFAULT_ROLE` | Role for customers the provider assigns none to; `buyer` (default) |
| `AUTH_EMAIL_VERIFIED_BY_PROVIDER` | `true` for Entra: it verifies email at sign-up but sends no `email_verified` claim |
| `AUTH_STAFF_MFA_ENFORCED_BY_PROVIDER` | `true` for Entra when a Conditional Access policy requires MFA for staff (tokens carry no `amr`) |
| `SELLER_ONBOARDING_ENABLED` | `true` only for the approved onboarding release |
| `REVIEWS_ENABLED` | `false` until checkout creates real orders; then `true` |
| `MESSAGING_ENABLED` | `false` until sign-in is live; then `true` |
| `SUPPORT_ENABLED` | `false` until sign-in is live and complaint handling is staffed; then `true` |
| `EMAIL_ENABLED` | `true` to send email notifications (off by default) |
| `EMAIL_PROVIDER` | `acs` (Azure Communication Services). `log` only for local testing; it is refused in production |
| `ACS_CONNECTION_STRING` | **Secret.** From the Azure Communication Services resource → Keys. Paste it into Railway yourself |
| `EMAIL_FROM` | Sender address from the connected email domain, e.g. `DoNotReply@<domain>` |
| `EMAIL_REPLY_TO` | Where replies go, e.g. the support inbox (optional) |
| `PUBLIC_WEB_URL` | Website address used in email links, e.g. `https://katondo.netlify.app` |
| `ACCOUNT_RECOVERY_HOLD_HOURS` | Hours a lost-email recovery waits before staff may approve it (default `72`) |
| `PRIVACY_REQUEST_RESPONSE_DAYS` | Days to answer a personal-data request (default `30`; confirm the legal deadline with counsel) |
| `SELLER_DATA_PROCESSING_APPROVED` | `true` only after the data-processing release gate passes |
| `SELLER_TERMS_VERSION` / `SELLER_TERMS_URL` | Exact published seller terms version and HTTPS URL |
| `PRIVACY_NOTICE_VERSION` / `PRIVACY_NOTICE_URL` | Exact published privacy notice version and HTTPS URL |
| `ACTIVITY_IP_HASH_SECRET` | Long random secret required before enabling technical-context collection |

`PORT` is supplied by Railway. `API_PORT` is only a local-development fallback. The public web build also needs `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AUTH_AUTHORITY`, `NEXT_PUBLIC_AUTH_CLIENT_ID`, `NEXT_PUBLIC_AUTH_ACCOUNT_URL`, and the registered callback/logout URLs set in Netlify. `AUTH_ACCOUNT_URL` and `NEXT_PUBLIC_AUTH_ACCOUNT_URL` must identify the same provider-controlled HTTPS self-service account page where human users can update passwords, recovery methods, MFA and verified contact details. Register `https://<site>/auth/callback` as the OIDC callback and `https://<site>/sell` as the post-logout URL. Public OIDC client settings are not client secrets; never place a confidential client secret in a `NEXT_PUBLIC_*` variable.

## Staff and AI access

Employees open `/admin` and use the same OIDC callback. The provider must issue server-managed staff roles; bootstrap the first `super_administrator` in the identity provider, never through a public registration flow. Require verified work contact details and MFA. Other supported roles are `administrator`, `seller_reviewer`, `customer_support`, `finance_operator`, `fulfilment_operator`, `platform_operator`, and `auditor`.

All human users open `/account` to manage Katondo preferences and follow the provider's secure account-management link for password, recovery, MFA and contact changes. Katondo must never receive or store current or replacement passwords. AI agents have no personal account page; rotate their confidential credentials in the identity provider or secret manager.

AI agents use separate confidential machine clients. Their tokens must carry `service_agent` and a `client_id` or `azp` matching an active record created by a top administrator in Katondo. Do not put machine client secrets in Netlify, source code, logs, or the agent registry. See `docs/operations/STAFF_AND_AGENT_ACCESS.md`.

Activity collection starts disabled in migration `004_staff_agents_activity.sql`. If technical context is approved, set a long random `ACTIVITY_IP_HASH_SECRET` in Railway before enabling that option. Enabling any category requires the documented purpose, lawful basis, notice, retention and hosting approval for the exact events collected.

Migrations `006_release_controls.sql` and `007_country_configuration.sql` create the fail-closed, country-scoped release register. A top administrator records the external approving authority, evidence reference, optional expiry and notes in `/admin`; an auditor can inspect the result. This record does not replace counsel, regulator, security or vendor approval. Seller onboarding opens only when every release record for the active country is effective and all environment checks pass. Revoking any record closes new applications immediately.

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

See `docs/compliance/ZAMBIA_DATA_PROTECTION_READINESS.md` for the data map. The owner reported on 2026-11-27 that Katondo is registered with the Data Protection Commissioner (reference in the privacy notice) and that the authorisation covers storage outside Zambia (Railway in the Netherlands, Entra in Europe). Legal documents, version `2026-12-01`, are in `docs/legal` and shown at `/privacy`, `/terms` and `/seller-terms`. Set `PRIVACY_NOTICE_VERSION=2026-12-01`, `PRIVACY_NOTICE_URL=<site>/privacy`, `SELLER_TERMS_VERSION=2026-12-01`, `SELLER_TERMS_URL=<site>/seller-terms`. When a document changes, raise its version; signed-in people are asked to accept the new privacy notice and terms on their next visit. Everyone must be 18 or over.

The application is country-configurable; see `docs/architecture/COUNTRY_CONFIGURATION.md`. Zambia's requirements apply to the Zambia environment and remain mandatory for the first launch. Every later country requires its own environment, providers, policies, and release approvals.

## Hosting split

Use Netlify for the Next.js web storefront and Railway for the long-running Express API and PostgreSQL. Deploy iOS/Android separately through Expo's native build and app-store release workflow; hosting these web services does not publish mobile apps.

## Reviews

Buyers and sellers can review each other once per completed order, within 14 days of completion (migration `009_orders_reviews.sql`, `apps/api/src/reviews.ts`). Each review stays hidden until the other side has reviewed or the window has closed. A seller can reply publicly once to a buyer's review. Staff with the administrator, super administrator or customer support role can hide and restore reviews from the staff workspace; every change is written to `audit_events` with a reason.

Reviews are switched off with `REVIEWS_ENABLED=false` until checkout creates orders. While off, the public shop endpoint reports `enabled: false` and the web app shows no ratings. Buyer ratings (sellers' reviews of buyers) are shown only to sellers with an order from that buyer, never publicly. Confirm this with privacy counsel before switching on.

## Messaging

Buyers message a seller from a listing (one conversation per buyer per listing; migration `010_messaging.sql`, `apps/api/src/messaging.ts`, web `/messages`). Phone numbers and emails are never shown by Katondo; if someone types one, or a link, or asks for payment outside Katondo (mobile money, bank transfer, deposits), the message is still delivered but the recipient sees a safety warning. Either side can block the other or report the conversation. Sending is rate-limited (30 messages per 10 minutes, 20 new conversations per day).

Staff with the administrator, super administrator or customer support role see reported conversations in the staff workspace. The report list shows no message text; opening a reported conversation, removing a message and resolving a report are each written to `audit_events`. Message text is never copied into the activity ledger.

Messaging is switched off with `MESSAGING_ENABLED=false` until sign-in is live. `GET /api/features` tells the web and mobile apps which optional features are on. Decide a message retention period with privacy counsel before switching on.

## Help and complaints

People open a request from `/help` (signed in) or report a listing, shop or review from its Report link. Each request gets a reference such as `KT-2026-00001`, a status (received, being looked at, waiting for your reply, resolved), and a two-way conversation with staff (`migration 011_support_cases.sql`, `apps/api/src/support.ts`). Personal-data requests can also be sent from `/help/privacy` without an account; that form is rate-limited in memory (addresses are never stored) and has a hidden field to catch bots. Replies to people without an account are recorded on the case but must be sent by email until email notifications exist.

Target times by priority: urgent (scam or banned-item reports) first reply in 4 hours, decision in 2 days; high (order problems, other reports, privacy) 24 hours and 5 days; normal 48 hours and 10 days. Privacy requests use `PRIVACY_REQUEST_RESPONSE_DAYS`. The staff queue puts overdue cases first. Staff can reply, add internal notes, assign, change priority with a reason, decide, and reopen; each action is written to `audit_events` and shown in the case history. Staff can't handle their own request. A requester can ask once, within 30 days, for a decision to be looked at again; the original decision-maker can't handle that second look.

Switched off with `SUPPORT_ENABLED=false` until sign-in is live and someone is assigned to answer requests. Before switching on: confirm response deadlines (consumer protection and data protection) with counsel, decide how to verify identity for privacy requests, and set up email so people without an account get replies.

## Sign-in with Microsoft Entra External ID

Tenant `c43c8626-8450-43f8-9448-f6480da89b89` (external tenant "katondo", billed through the PMCS subscription). App registrations: `katondo-api` (`1d5c628b-8e5b-41a0-b586-1ab76ebda581`, exposes `access_as_user`, defines the app roles, access token version 2), `katondo-web` (`7121f258-85d9-4d20-aa92-f5532142f568`, single-page app) and `katondo-app` (`04b0ef17-8aea-4cd5-b300-51f103d8409f`, mobile, redirect `com.katondo.marketplace://auth`). These IDs are public identifiers, not secrets. User flow `signup_signin` (email with password; Google; Facebook in development mode).

| Where | Variable | Value |
|---|---|---|
| Railway API | `AUTH_PROVIDER` | `entra` |
| Railway API | `AUTH_ISSUER` | `https://c43c8626-8450-43f8-9448-f6480da89b89.ciamlogin.com/c43c8626-8450-43f8-9448-f6480da89b89/v2.0` |
| Railway API | `AUTH_JWKS_URL` | `https://c43c8626-8450-43f8-9448-f6480da89b89.ciamlogin.com/c43c8626-8450-43f8-9448-f6480da89b89/discovery/v2.0/keys` |
| Railway API | `AUTH_AUDIENCE` | `1d5c628b-8e5b-41a0-b586-1ab76ebda581` |
| Railway API | `AUTH_REQUIRED_SCOPE` | `access_as_user` |
| Railway API | `AUTH_EMAIL_VERIFIED_BY_PROVIDER`, `AUTH_REQUIRE_MFA_FOR_STAFF`, `AUTH_STAFF_MFA_ENFORCED_BY_PROVIDER` | `true` |
| Netlify | `NEXT_PUBLIC_AUTH_PROVIDER` | `entra` |
| Netlify | `NEXT_PUBLIC_AUTH_AUTHORITY` | `https://c43c8626-8450-43f8-9448-f6480da89b89.ciamlogin.com/c43c8626-8450-43f8-9448-f6480da89b89/v2.0` |
| Netlify | `NEXT_PUBLIC_AUTH_CLIENT_ID` | `7121f258-85d9-4d20-aa92-f5532142f568` |
| Netlify | `NEXT_PUBLIC_AUTH_SCOPE` | `openid profile email offline_access api://1d5c628b-8e5b-41a0-b586-1ab76ebda581/access_as_user` |
| Netlify | `NEXT_PUBLIC_AUTH_ENABLED` | `false` until the data-protection approval; the website offers no sign-in while false |

`AUTH_ENABLED` and `AUTH_DATA_PROCESSING_APPROVED` stay `false` until Zambia's data protection office approves storing sign-in data with Microsoft (EMEA). Sellers' roles come from Katondo's database (a verified seller record), not from Entra; staff roles are assigned in Entra under Enterprise applications → katondo-api → Users and groups. In katondo-api → Token configuration, add the optional claim `email` to the access token so the API receives the customer's email.

## Closing accounts, lost-email recovery and staff numbers

**Closing an account** (`/account`, migration `012_account_lifecycle_staff_ids.sql`, `apps/api/src/account.ts`): the person types CLOSE; open orders block it; staff accounts can't be closed this way. The account, shop and listings are hidden at once and every other API route answers `account_pending_deletion`. Signing in within 30 days and choosing **Restore my account** brings everything back. The API checks every 6 hours for accounts past 30 days and anonymises them (contact details, preferences, blocks, sent message text removed; shop renamed "Closed shop", listings removed; orders, payments and help cases kept), then opens a help case asking staff to delete the person's sign-in account in Entra by its object ID.

**Lost email** (`/help/recover`, no sign-in): creates an `account_recovery` help case. Staff see the matching Katondo account, the hold (no approval for `ACCOUNT_RECOVERY_HOLD_HOURS`, default 72) and step-by-step guidance. One staff member records how they checked identity; a different staff member must approve or decline (enforced in the API and the database). After approving, staff change the person's sign-in email in Entra (Users → the person → edit), and the person sets a new password with **Forgot password?**. Recovery of a staff account must be handled by a top administrator. Email notifications don't exist yet, so staff contact the person by email themselves.

**Staff numbers**: every staff record gets a random number with a check character, such as `S-7QM4-R9K` (no 0, 1, I, L, O or U; a mistyped character is caught before lookup), shown with their first name on replies to customers ("Mwila, S-7QM4-R9K, Katondo") and in case histories. Top administrators set job title and department in the staff directory. Anyone can check a number at `/help/check-staff`; only first name and job title of active staff are shown. Recommended: copy each staff number into the Entra user's **Employee ID** field so the two match.

## Email notifications

Code: `apps/api/src/email.ts`, migration `015_email_outbox.sql`. Emails are queued in `email_outbox` and sent every 20 seconds by the API through Azure Communication Services, with retries (after 1, 5, 15, 60 and 180 minutes, then marked failed). Open tracking is switched off. Sent rows are deleted after 30 days, failed ones after 90; a closed account's rows are deleted when it is anonymised. Nothing is queued while `EMAIL_ENABLED` is off.

Emails sent: help-request replies and decisions (people without an account get the full text, signed-in people get a link); confirmation of personal-data and account-recovery requests; a warning to the old address on an account when someone asks to recover it; new messages (no message text, at most one per conversation every 30 minutes, can be switched off under Account settings → Message emails); account closing and restored; seller application received and declined.

Setup in Azure (PMCS subscription): create an **Email Communication Services** resource and add a domain (the free Azure-managed domain for testing; your own domain with its DNS records for launch), create a **Communication Services** resource and connect the domain to it, then copy its connection string into Railway as `ACS_CONNECTION_STRING`.

