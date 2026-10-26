# Zambia Data-Protection and Hosting Readiness

**Status: internal working assessment — not legal advice, not a DPC filing, and not approval to process personal data.** Prepared 26 October 2026. A Zambian privacy practitioner must confirm the current Act, regulations, DPC requirements, and Katondo's facts before launch.

## Decision

Do not enable account registration or seller applications yet. The live API service has been observed in Railway's EU West region. Netlify hosts the public web application, and the identity provider has not been selected. The live seller application API therefore remains fail-closed unless the explicit server-side gates in `DEPLOYMENT.md` are enabled. No decision to transfer or store personal data outside Zambia has been made.

The DPC's registration portal currently says a separate authorization is needed when the controller stores personal data outside Zambia and when the information is transferred outside Zambia. The Data Protection Act 2021 sections 70–71 set conditions for cross-border transfers and special treatment for sensitive data. The Act and current portal requirements must be read together with current regulations and any DPC directions by Zambian counsel.

## Initial data map

| Flow | Data potentially involved | Location/provider known today | Open compliance action |
| --- | --- | --- | --- |
| Website browsing | Request IP, device/browser and operational logs (provider-dependent) | Netlify; exact request/log processing regions and retention not established | Obtain Netlify DPA, subprocessors, log locations/retention, transfer terms and deployment-region controls |
| API/database | Seller legal name, storefront name, city, business registration number, verified email/phone, application/review events | Railway API and PostgreSQL observed in EU West | Do not submit applications; obtain written location, backup, log, access/support and deletion details; determine DPC authorization and migration plan |
| Identity/login | Credentials or external identity, email/phone, verification flags, login/audit metadata | Provider not selected | Select only after data-location, contract, subprocessor, security, breach and DPC transfer review |
| Admin support | Seller details and reviewer decisions/reasons | Railway database; admin access system not configured | Define least-privilege roles, access logs, support location, retention, and data-subject request process |

This is a preliminary data map, not a complete inventory. Add payment, payout, delivery, analytics, communications, media, backups, support tooling, mobile-app telemetry, and livestream providers before those features collect data.

## Required decisions and evidence before enabling accounts

1. **Controller/processor roles:** document Katondo's purposes and means, whether Katondo is a controller, processor, or both for each flow, and each vendor's role. Confirm any joint controllers and seller responsibilities.
2. **DPC registration:** have counsel determine the applicable controller and processor registration categories, required DPO designation, application particulars and documents. Submit the required applications and retain current certificates before processing begins.
3. **Data location and international transfer:** inventory primary data, replicas, backups, logs, identity-provider records, support access and subprocessors. Prefer a Zambia-hosted design for in-scope data. For every non-Zambia location or access, obtain counsel's written analysis and any DPC authorization/approved contract or other required instrument before transfer. A user's checkbox alone does not resolve this gate.
4. **Impact and security assessment:** complete a documented privacy/data-protection impact assessment, threat model, access-control review, breach response plan, encryption/key-management review, backup/restore test, deletion test and vendor risk assessments. Avoid collecting sensitive personal data until the applicable legal basis and safeguards are approved.
5. **Purpose and lawful basis:** map each field and purpose to the legal basis approved by counsel. Collect only necessary information; explain each purpose and recipient at collection. Do not infer consent to optional marketing from application submission.
6. **Retention and rights:** approve a schedule for abandoned, rejected, active and closed accounts; backups; audit trails; legal holds; and statutory records. Establish a monitored contact for access, correction, erasure, restriction/objection and complaints, subject to applicable exceptions.
7. **Minors and seller capacity:** have counsel determine eligibility/guardian requirements and implement age/capacity controls accordingly. Do not assume an age threshold in product copy before that determination.
8. **Contract and notice review:** execute processor agreements and review cross-border clauses, subprocessors, security incidents, data-subject requests, deletion/return, audits and onward transfers. Counsel must approve the public privacy notice and seller terms against the actual product behavior.
9. **Release gate:** record named owner, evidence links, expiry/review date and written sign-off for every decision. Keep `SELLER_ONBOARDING_ENABLED` and `SELLER_DATA_PROCESSING_APPROVED` unset until all applicable gates pass.

## Hosting options to evaluate

- Ask Railway whether a Zambia region is available for the exact plan and services, and obtain written confirmation of Postgres primary, backups, logs, support access and subprocessors. The observed API location is EU West; do not assume a setting change migrates existing data or every service plane.
- Obtain the same written data-flow and transfer details from Netlify. A static page is not the only data flow once functions, authentication or logs receive identifiable requests.
- **Local-hosting vendor shortlist for due diligence, not endorsement:** [SwiftCloud](https://cloud.co.zm/data-residency) publicly describes a Lusaka `zm-lsk-1` region, managed PostgreSQL, object storage and in-region backups; obtain a signed statement, service contract, security evidence, uptime/restore commitments, subprocessors and location of support/control-plane data. [INFRATEL](https://infratel.co.zm/colocation/) lists cloud VMs, virtual storage, IaaS, backup and DRaaS; confirm which service components and replicas physically remain in Zambia. [Paratus Zambia](https://paratus.africa/zambia/business-solutions/data-center-and-cloud-services/) lists Zambia data-centre cloud VMs and DR services; confirm the location of each service and any DR replication destinations. These are vendor statements, not independent assurance or a legal finding.
- **Identity approach to evaluate:** use a standards-based OpenID Connect provider so the app can change providers. A self-hosted Keycloak deployment on counsel-approved Zambia infrastructure is a plausible local-control candidate; Keycloak documents OIDC discovery, authorization, token and JWKS endpoints. This transfers operational responsibility to Katondo, and still requires secure hosting, patching, MFA/account recovery, email/SMS delivery, backups and independent security review. No Keycloak deployment or SMS/email vendor is configured. A SaaS login provider must not be selected solely for convenience; verify identity-profile, credential, log, backup, support and subprocessor locations and get required transfer approvals.
- Evaluate Zambia-based hosting or a self-managed identity service only with an accountable operator, security patching, backups, disaster recovery and support commitments. Local physical hosting alone does not by itself establish compliance.
- If a cross-border architecture is proposed, document the applicable statutory route and obtain any required DPC approval before using real personal data. A South Africa, EU, or other nearby region is still outside Zambia.

## Sources to verify with counsel

- [Data Protection Act No. 3 of 2021, especially sections 70–71](https://www.dataprotection.gov.zm/wp-content/uploads/2024/06/Act-No.-3-The-Data-Protection-Act-2021_0-2.pdf)
- [DPC registration portal and current application prompts](https://registration.dataprotection.gov.zm/)
- [DPC registration guidance and forms](https://www.dataprotection.gov.zm/registration/)
- [DPC FAQ](https://www.dataprotection.gov.zm/faq/)
- [ZICTA 2024 Annual Market Report](https://zicta.zm/market-reports/2024_annual_market_report.pdf)
- [Keycloak OIDC endpoints and standards](https://www.keycloak.org/securing-apps/oidc-layers)

Online guidance is a starting point, not a substitute for reviewing the legislation, current regulations and written DPC directions.
