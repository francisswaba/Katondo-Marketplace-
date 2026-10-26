# Seller onboarding release sequence

This plan applies after actual written approvals. A hypothetical approval does not authorize personal-data collection. The release owner records the approver, date, document version, evidence location, and review date for every gate.

## 1. Freeze the approved design

- Record DPC registration and any required storage or transfer authorization, including scope and conditions.
- Approve the data map for Netlify, API hosting, PostgreSQL, backups, logs, staff access, identity, email/SMS, and subprocessors. Resolve hosting migration before collecting applications.
- Have Zambian counsel approve final privacy and seller terms. Publish exact versions at stable URLs and archive their effective dates.
- Approve retention, deletion, data-subject request and breach procedures, eligibility, and verification evidence for individuals and businesses.

## 2. Configure identity and operations

- Select and contract an OIDC provider under the approved data-processing arrangement. Configure issuer, API audience, JWKS, verified contact claims, MFA and account recovery.
- Assign the `administrator` role only through a restricted staff process. Test that buyer tokens cannot call admin routes; review role issuance and revocation.
- Use separate staging and production identity clients, databases and policy versions. Store credentials in service secret stores.
- Configure `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL`, `AUTH_ACCOUNT_URL`, `AUTH_REQUIRE_MFA_FOR_STAFF=true`, `AUTH_ENABLED=true`, and `AUTH_DATA_PROCESSING_APPROVED=true` in the approved environment. Verify `/api/account` rejects missing, expired, wrong-issuer, wrong-audience and disallowed-algorithm tokens, and that staff tokens without an MFA method are rejected.

## 3. Prepare the application release

- Deploy migrations through `006_release_controls.sql` through the normal pre-deploy step; verify their migration-history entries and a tested database restore.
- Verify the deployed `/sell` sign-in, application, status and policy-acceptance flow against the selected OIDC provider. Show the approved notice and terms at collection; keep optional marketing separate if introduced.
- Set `SELLER_TERMS_VERSION` and `PRIVACY_NOTICE_VERSION` to the published versions. Keep `SELLER_ONBOARDING_ENABLED=false` and `SELLER_DATA_PROCESSING_APPROVED=false` through testing.
- Test individual and business applications with synthetic identities: duplicates, unverified contact, missing acknowledgments, invalid fields, status retrieval, admin review and audit records. Review can set `in_review` or `rejected`; seller approval still needs a separately designed verification process.
- Review session security, request limits, cookie CSRF protection if applicable, log redaction, admin access and dependency advisories before public registration.

## 4. Open and monitor

- Recheck every approval against the actual providers, regions and policy versions. Record a go/no-go decision.
- In `/admin`, record each external approval with its approving authority, controlled evidence reference and expiry where applicable. The required controls are identity provider, privacy notice, seller terms, data processing, hosting/transfers and the final seller-onboarding release decision.
- Enable `SELLER_DATA_PROCESSING_APPROVED=true` and `SELLER_ONBOARDING_ENABLED=true` only after the preceding checks pass. Start with a small invited group.
- Monitor sign-in and application failures, personal data in logs, admin actions and data-subject requests. To stop new submissions, set `SELLER_ONBOARDING_ENABLED=false` without deleting existing records.

## Current state

The API intake/review boundary, OIDC sign-in client, staff-MFA enforcement option, approval register, application form, status view, and policy-version links exist behind release gates. The legal documents are unapproved drafts. The live API was observed in Railway EU West. No identity provider, DPC authorization, hosting sign-off or seller verification provider is recorded here. This plan is not yet ready for real applicants.
