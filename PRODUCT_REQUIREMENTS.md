# Katondo Marketplace — Product Requirements

**Status:** Planning baseline  
**Launch market:** Zambia  
**Release approach:** Full marketplace capability delivered and tested in controlled phases

## 1. Product vision

Katondo is a multi-vendor marketplace for buyers in Zambia, combining standard product listings, seller storefronts, platform-owned inventory, timed auctions, and live shopping with live bidding. It will serve customers through iOS, Android, and web experiences. The platform will support local operations first while keeping country, currency, payment, delivery, and compliance rules configurable for later deployments.

## 2. Users and roles

- **Buyer:** discovers products, follows sellers or live events, purchases or bids, selects delivery, and manages orders, reviews, returns, and disputes.
- **Individual seller:** lists personal items and manages orders and seller-arranged delivery options.
- **Registered business seller:** operates a storefront, lists inventory, manages staff access where enabled, orders, fulfilment, and payouts.
- **Platform operator:** lists and sells platform-owned inventory alongside third-party inventory.
- **Administrator/support:** uses a role-specific staff workspace to verify sellers, manage catalogue and categories, review reports, handle disputes, configure fees and delivery, and monitor marketplace health. Top administrators alone manage behavioural-data collection and AI service-agent access.
- **AI service agent:** uses a non-human machine identity with an explicit allowlist of read or triage permissions. Agent recommendations require human review; agents cannot approve, reject or verify sellers.

## 3. Product scope and requirements

### Marketplace and catalogue

- Support almost all lawful product types, organised into administrator-managed categories and subcategories. Restricted/prohibited goods require policy and enforcement rules before launch.
- Listings support title, description, condition, price, stock/quantity, category, attributes, seller, location, delivery choices, and multiple images and videos.
- Provide seller storefronts and platform inventory with clear seller identity on every offer.
- Search, category browsing, filters, sorting, and product detail pages work across marketplace listings.
- Inventory and order state must prevent overselling; concurrent checkout and bidding must be handled safely.

### Shopping, payments, and orders

- Every human account has settings for provider-managed password, recovery, MFA and verified contact updates, plus Katondo-managed appearance, language/region and role-appropriate notification preferences. Buyer accounts additionally support profile, saved addresses and order history.
- Cart and checkout can contain items from multiple sellers while calculating each seller's fulfilment, shipping, fees, and order state accurately.
- Currency is selected from the active deployment configuration. Zambia launch defaults to ZMW; amounts must use integer minor units and explicit currency codes.
- Integrate payment providers that support Zambia after provider, settlement, refund, and mobile-money/card coverage are confirmed. Do not store raw payment credentials.
- Track payment, seller payout, cancellation, refund, and fulfilment states with an auditable ledger. Payouts follow configured eligibility and dispute holds.
- Buyers can rate and review eligible completed orders. Returns and disputes have defined windows, evidence, decisions, and audit history.

### Delivery

- At checkout, buyers choose platform-managed delivery or seller-arranged delivery when that seller offers it.
- Show applicable delivery charges and service terms before payment. Seller-arranged charges are paid by the buyer using the configured checkout flow.
- Platform-managed delivery needs configurable service areas, rates, tracking events, and delivery proof. Seller-arranged delivery needs seller-provided tracking/status and clear responsibility terms.
- Delivery choice and quoted cost are stored with the order and cannot silently change after purchase.

### Auctions and live shopping

- Support timed auctions with start/end time, opening bid, minimum increment, reserve/Buy Now options if enabled, bidder eligibility, bid history, winner determination, payment deadline, and no-sale handling.
- Support product livestreams and live-stream bidding. Live bidding must use server-authoritative ordering, bid validation, clear current price, and a reliable closing/winner rule.
- Prevent sellers from bidding on their own lots and provide controls for abuse, shill bidding, failed payment, stream interruption, and late bids.
- Livestream media delivery, recording/retention, moderation, and bandwidth cost require explicit launch policies and provider selection.

### Trust, safety, and administration

- Verify seller identity/business status to a policy appropriate for Zambia; keep verification state and review history.
- Provide reporting, moderation, listing takedown, user restrictions, fraud signals, and customer support tools.
- Admin dashboards cover orders, payments/payouts, sellers, listings, auctions/live sessions, disputes, delivery, and key marketplace metrics.
- Apply role-based access, least privilege, audit logs, secure account recovery, privacy controls, and data retention rules.

### Experience and accessibility

- Deliver modern, premium, responsive experiences for iOS, Android, and web.
- Use Apple's native San Francisco system typography on Apple platforms where available and licensed; use platform-native system fonts elsewhere. Avoid generic decorative/AI-style font choices.
- Establish a shared design system for colour, type scale, spacing, motion, components, and accessible contrast. Respect reduced-motion and text-scaling settings.

## 4. Non-functional requirements

- Security: TLS, secure secret management, strong authentication, authorization at API boundaries, input validation, rate limits, abuse controls, and auditability.
- Reliability: payment/order transitions and auction outcomes must be idempotent and recoverable; background jobs need retries and dead-letter visibility.
- Performance: fast catalogue browsing on mobile networks; media is resized/transcoded and delivered through a CDN.
- Observability: structured logs, metrics, traces, crash reporting, payment reconciliation, and actionable alerts without exposing sensitive data.
- Portability: deployment country, currency, tax/fee rules, supported payment methods, delivery coverage, and locale are configuration, not scattered constants.
- Data: backups, restore drills, migration discipline, and documented retention/deletion policies.

## 5. Recommended architecture

Start with a **modular monolith** and explicit domain boundaries. This keeps the first release operationally manageable while allowing high-throughput capabilities to split out later.

- **Clients:** React Native with Expo for iOS/Android, plus a Next.js web storefront and seller/admin web surfaces; shared TypeScript contracts and design tokens. Validate the team’s web/native skill and SEO needs before locking this choice.
- **API:** TypeScript backend (NestJS or equivalent) exposing versioned REST endpoints and WebSocket channels for auction/live updates.
- **Core modules:** identity/access, seller onboarding, catalogue/search, inventory, cart/checkout, orders, payments/ledger/payouts, delivery, auctions, livestream sessions, reviews, returns/disputes, notifications, and administration.
- **Data:** PostgreSQL as transactional source of truth; Redis for short-lived coordination, rate limits, and realtime fanout; object storage plus CDN for product media and stream assets; managed search index when catalogue volume justifies it.
- **Async work:** transactional outbox and queue for payment webhooks, notifications, media processing, order events, reconciliation, and auction close jobs.
- **Integrations:** payment provider(s), SMS/email/push, maps/geocoding, delivery partners, identity verification, and live video provider are adapters behind interfaces.
- **Deployment:** managed cloud services, infrastructure as code, separate development/staging/production, CI/CD, secrets manager, backups, and feature flags. Select cloud/region after data residency, latency, provider availability, and budget review.

### Key data concepts

`User`, `Seller`, `Storefront`, `VerificationCase`, `Category`, `Listing`, `ListingMedia`, `Inventory`, `Cart`, `Order`, `OrderLine`, `Payment`, `LedgerEntry`, `Payout`, `DeliveryOption`, `Shipment`, `Auction`, `Bid`, `LiveSession`, `Review`, `ReturnCase`, `Dispute`, and `AuditEvent`.

Prices are stored as integer minor units plus ISO currency code. Orders snapshot item price, fees, seller, delivery selection, and address at purchase time. Auction bid acceptance and winner assignment are atomic server-side operations.

## 6. Phased release roadmap

1. **Foundation and validation:** product/design prototype, architecture decisions, Zambia provider and legal discovery, repo/CI, environments, auth, roles, and design system.
2. **Marketplace MVP:** seller onboarding and verification, categories/listings with images/video, storefronts, search/filter, buyer accounts, cart, checkout, payments, order states, delivery choice, notifications, admin basics.
3. **Trust and operations:** payouts and reconciliation, tracking, ratings/reviews, returns/disputes, moderation, operational dashboards, load/security testing, controlled pilot.
4. **Timed auctions:** auction lifecycle, bid history, server-side close/winner, payment deadlines, anti-abuse controls, and pilot.
5. **Live shopping and bidding:** provider-backed streams, realtime bidding, moderation, interruption recovery, recording/retention controls, and staged rollout.
6. **Scale and expansion:** improve search/recommendations, seller tools, delivery integrations, operational automation, and country configuration for the next market.

Each phase has a feature flag, measurable acceptance criteria, rollback path, support runbook, and pilot cohort. “Full marketplace” describes the target capability set; release gates control exposure safely.

## 7. First implementation milestone

**Milestone 0 — repository and vertical-slice foundation**

Deliver a runnable, documented monorepo skeleton with:

- `apps/web`, `apps/mobile`, and `apps/api` entry points, plus shared contracts/UI foundations.
- Local development configuration for PostgreSQL and Redis, environment-variable examples without secrets, and database migration setup.
- Authentication boundary and role model for buyer, individual seller, business seller, platform operator, and administrator (stubbed identity provider is acceptable initially).
- First end-to-end slice: browse seeded categories/listings on web, open a product detail, and retrieve the same listing through a typed API backed by PostgreSQL.
- CI checks for formatting, linting, type checking, and build; local setup and architecture decision records.

**Acceptance:** a new developer can follow the README to start the API and web app locally; seeded catalogue data renders; API validation and error shape are documented; no secrets are committed; the mobile app shell builds and shares the design tokens. Payment, delivery, live video, and auctions stay behind later milestones until provider and policy choices are confirmed.

## 8. Risks and open decisions

- **Payments and payouts in Zambia:** confirm provider coverage, mobile money/card methods, marketplace split payments, settlement currency, refunds, chargebacks, KYC, and payout timing.
- **Legal and policy:** confirm business registration/identity checks, consumer protection, tax/invoicing, privacy/data retention, prohibited goods, auction rules, and livestream moderation obligations with qualified local advisers.
- **Delivery operations:** define platform-managed service areas, pricing, partner responsibilities, proof of delivery, failed delivery, and seller-arranged liability.
- **Product scope:** define initial category taxonomy and restricted goods policy; “almost everything” needs enforceable boundaries.
- **Live media:** choose streaming provider, expected concurrency, latency, moderation tooling, recording policy, and cost limits.
- **Returns/disputes:** decide eligibility windows, evidence, refund authority, seller response time, and payout holds.
- **Country expansion:** specify whether launch is Zambia-only initially and which next country is prioritized; architecture supports configuration but local rules need separate review.
- **Technical choices:** validate team capacity and budget for React Native/Expo, Next.js, backend framework, hosting, search, and observability before implementation is locked.

## 8.1 Zambia pilot recommendation (research snapshot: 18 October 2026)

These are planning recommendations, not vendor commitments, legal advice, or confirmation that a provider has accepted Katondo as a customer. Obtain written commercial, technical, settlement, and compliance confirmation before selecting a production provider.

- **Payments and seller payouts — shortlist Lenco by BroadPay first, with a second licensed provider evaluated in parallel.** BroadPay publicly describes Lenco as a product of a Bank of Zambia-licensed payment system business (licence 02/PSB/2015), with API payouts to mobile money and bank accounts, same-day mobile-money settlement to the merchant, and next-working-day card settlement. This appears to cover collection/disbursement primitives, but does not establish marketplace split settlement, escrow/holding permissions, seller sub-accounts, refund/chargeback handling, or commercial eligibility. Request a marketplace-specific proposal and sandbox, and verify licence status and exact scope directly with BoZ. Treat Instacom as a comparison candidate; its public materials describe ZMW collections and payouts, but verify licensing and marketplace operation directly. Do not choose a provider solely from public API claims.
- **Safe interim funds flow:** use a provider-approved merchant-of-record/marketplace collection arrangement; keep an internal double-entry ledger and reconcile provider statements; release seller proceeds only under a written, legally reviewed payout/hold policy. Do not describe Katondo as escrow or hold customer funds in a Katondo-controlled wallet unless counsel and BoZ confirm the structure is permitted. Use manual, dual-approved payouts during a limited pilot if provider payout automation is not yet approved.
- **Delivery — pilot with Lusaka-only platform-managed fulfilment using a small contracted courier panel, plus seller-arranged delivery as an explicit separate option.** Start with scheduled pickup/drop-off and manual dispatch/tracking workflows; capture delivery fee, promised window, responsible party, proof of delivery, failed-attempt outcome, and dispute contact before payment. Zampost has public parcel/EMS shipment tracking, but a public tracking page does not prove an integration API or suitable same-day coverage. Ask Zampost and at least two Lusaka courier operators for service-area maps, rate cards, API/webhook availability, liability/insurance, reverse logistics, and proof-of-delivery process before integration. Expand to Copperbelt only after on-time delivery, loss/damage, and support metrics pass a release gate.
- **Live streaming — prototype on Amazon IVS Low-Latency, behind a replaceable provider adapter.** IVS documents global playback, low-latency delivery generally under five seconds, real-time stages under 300ms for participant experiences, and web broadcast tooling. Its pricing is metered for input and viewer-hours by delivery billing region; model realistic Zambia traffic with AWS’s current estimator and confirm the applicable viewer billing region. Implement livestream bidding as an API-owned authoritative auction, not as chat/video metadata, so provider changes cannot alter bid ordering or winners. Defer recordings by default until retention, moderation, and cost policies are approved.
- **Local compliance — launch gate, not a feature checkbox.** The Data Protection Commission states that controllers/processors handling personal data must register; the Commission’s current portal asks about cross-border storage and says separate authorization is required for storage outside Zambia. Confirm Katondo’s controller/processor roles, registration category, international hosting/processing, processor agreements, security/breach processes, and data-subject rights with a Zambian privacy professional and the DPC before production. Review consumer protection, e-commerce, tax/invoicing, seller verification, prohibited goods, auction terms, livestream moderation, courier liability, and payment-service boundaries with qualified Zambian counsel and relevant regulators. ZRA’s public tax information should inform consultation, not be used to determine Katondo or each seller’s tax treatment without advice.
- **Pilot shape:** Lusaka-based, invite-only seller cohort; limited, manually reviewed categories; mobile-money-first checkout with card availability only if the chosen provider confirms it; modest transaction/order limits; staff-supervised payment reconciliation, pickup/dispatch, returns, disputes, and livestream moderation. Keep timed auctions disabled until standard checkout/payout/dispute operations are stable; pilot timed auctions before enabling live bids. Make seller-arranged delivery optional per seller and show its charges/terms before payment.

### First build slice after the foundation

Build the marketplace operations core independent of provider selection: seller application and verification states; seller storefront and listing creation; image/video metadata with storage adapter; category-backed catalogue search/filter; delivery-option quote snapshot on checkout; provider-neutral payment intent and payout ledger interfaces; immutable audit events. First enable a reviewed Lusaka catalogue, then standard orders, then timed auctions, then live-stream bidding. Production payments, payouts, and dispatch remain feature-flagged until vendor and legal gates are signed off.

### Seller onboarding implementation status

The initial technical slice supports authenticated individual/business applications, minimum contact/profile data, versioned seller-terms and privacy acknowledgements, pending status, and administrator review with an audit trail. Reviewers may mark applications in-review or rejected; this slice cannot mark sellers verified. It intentionally stores no identity document or payout account data. Applications fail closed until the identity provider, counsel-approved terms and privacy notice, data-location/cross-border transfer decision, and `SELLER_DATA_PROCESSING_APPROVED` launch gate are configured. Manual review is workflow scaffolding only; it is not KYC, a PACRA verification, or a legal compliance determination. Do not open seller applications or enable publishing until the jurisdiction-specific verification checklist and rights/retention workflow are approved.

**Current legal/hosting gate:** Railway's API was observed in EU West. For Zambia-first data locality, evaluate Zambia-based managed cloud services and a self-hosted OIDC provider (Keycloak is only a candidate); otherwise obtain counsel/DPC approval for the specific cross-border design before enabling identity or seller data processing. See [Zambia data-protection readiness](docs/compliance/ZAMBIA_DATA_PROTECTION_READINESS.md). Provider marketing claims are due-diligence leads, not compliance proof.

### Research sources

- [Bank of Zambia — Designation of Payment Systems](https://www.boz.zm/payment-systems/designation-of-payment-systems)
- [BroadPay/Lenco — payouts and licensing disclosure](https://broadpay.co.zm/payout)
- [Instacom — payment flow and licensing disclosure](https://www.instacompayzm.com/how-it-works)
- [Data Protection Commission — registration FAQ](https://www.dataprotection.gov.zm/faq/)
- [DPC registration portal](https://registration.dataprotection.gov.zm/)
- [Zambia Revenue Authority — tax information](https://www.zra.org.zm/tax-information/)
- [Zampost — track and trace](https://www.zampost.com.zm/track)
- [Amazon IVS — service latency and capabilities](https://docs.aws.amazon.com/ivs/latest/LowLatencyUserGuide/what-is.html)
- [Amazon IVS — pricing](https://aws.amazon.com/ivs/pricing/)

## 9. Recommended success measures

Track seller activation and verification completion, listing quality, search-to-product engagement, checkout conversion, payment success, order fulfilment/on-time delivery, cancellations/refunds, dispute rate and resolution time, repeat purchase, auction completion/payment rate, live-session engagement, and contribution margin by category and delivery mode.
