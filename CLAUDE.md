# Katondo Marketplace

Multi-vendor marketplace (iOS, Android, web). Launch market: **Zambia** (ZMW, en-ZM), but the platform is country-configurable and built to go global. Owner: Francis Swaba (github.com/francisswaba). Work moved here from OpenAI Codex/ChatGPT in Nov 2026; `AGENTS.md` is a leftover ChatGPT mirror note and can be ignored.

## Product scope (do not drop any of these)
- Sellers: individuals (personal items), registered businesses, and Katondo's own inventory.
- Almost all product types, organised into categories. Sellers upload images and videos.
- Timed auctions **and** live-stream bidding. Bidding is decided server-side, never by the video provider.
- Delivery: buyer picks platform-managed delivery, or seller-arranged delivery if the seller offers it (buyer pays applicable charges).
- Currency/locale follow the deployment country (`apps/api/src/market.ts`, `/api/market`).
- Seller storefronts, buyer accounts, search/filter, cart/checkout, payments, seller payouts, order tracking, ratings/reviews, returns/disputes, seller verification, admin dashboards.
- UI: modern, premium; Apple system typography (San Francisco where available) via the OS font stack. No downloaded "generic AI" fonts.
- Release in phases; build the full marketplace but test feature by feature.

## Listings, product types and display styles
- Product types, display styles and shop layouts are defined once in `packages/contracts` (`productTypes`, `displayStyles`, `storefrontLayouts`). Add a type or style there, then extend the SQL check constraints in a new migration.
- Each listing stores `product_type`, `display_style` and `attributes` (JSON, validated against the type's fields in `apps/api/src/listings.ts`).
- Web cards render per style in `apps/web/components/ListingCard.tsx`; artwork per type in `PatternArt.tsx`. Seller flow: `/sell/studio`.
- Logo: the "Live" mark, a rounded K with an orange live dot (`apps/web/components/BrandMark.tsx`; tab icon `apps/web/app/icon.svg`; app icons in `apps/mobile/assets/`). The K follows the theme colour; the dot is always live orange. App icons have no ring. A ring pulses from the dot only in live moments (`BrandMark live`, page loading, live badges, header while an auction runs via `SiteHeader live`). Reduced-motion settings freeze it.
- Reviews: two-way (buyer rates seller, seller rates buyer), one per side per completed order, 14-day window, hidden until both have reviewed or the window closes, one public seller reply, staff hide/restore with audited reason. API `apps/api/src/reviews.ts`; web `components/ShopReviews.tsx`, `/orders/[orderId]/review`, staff `admin/ReviewModerationPanel.tsx`. Gated by `REVIEWS_ENABLED` (keep **off** until checkout creates orders). Buyer ratings are never public. The `orders` table is minimal and will grow with checkout.
- Messaging: buyer messages seller from a listing (one conversation per buyer per listing), safety warnings on phone numbers/emails/links/off-platform payment, block, report, rate limits; staff read only reported conversations, every read/removal/resolution audited; message text never in activity logs. API `apps/api/src/messaging.ts`; web `/messages`, `components/MessagesBadge.tsx`, staff `admin/ConversationReportsPanel.tsx`; app's listing screen links to the website's messages. Gated by `MESSAGING_ENABLED` (keep **off** until sign-in is live). `GET /api/features` reports which gated features are on.
- Help and complaints: cases with reference `KT-YYYY-NNNNN`, categories (order problem, report listing/shop/review, account, seller decision, personal data, other), status, two-way conversation, staff internal notes, priority-based target times, overdue-first staff queue, one appeal ("second look") handled by a different staff member, all staff actions audited. Personal-data requests also work without an account (`/help/privacy`). API `apps/api/src/support.ts`; web `/help`, `/help/new`, `/help/privacy`, `/help/cases/[reference]`, Report links on listings/shops/reviews, staff `admin/SupportQueuePanel.tsx`. Gated by `SUPPORT_ENABLED` (keep **off** until sign-in is live and requests are staffed).
- Design system (in `apps/web/app/styles.css`): malachite green brand, orange only for live/bidding, Apple system type (rounded for prices), chitenge-inspired patterns until real photos exist. Avoid generic AI-UI looks.

## Stack and layout
- npm workspaces monorepo, Node 24.
- `apps/web` Next.js storefront + `/admin` staff workspace + `/account` settings + `/sell` onboarding.
- `apps/api` Express API (OIDC/JWT auth boundary, roles, activity tracking, release controls).
- `apps/mobile` Expo (iOS/Android), id `com.katondo.marketplace`. Native screens: home (`app/index.tsx`), listing (`app/listing/[id].tsx`), shop with reviews (`app/shop/[id].tsx`). Shared theme/logo/artwork/stars in `components/kit.tsx`. Browse, search, sell, account and order reviews still open the website until in-app sign-in exists.
- `packages/contracts` shared TypeScript types. Must build before web/api.
- `infra/postgres/migrations` 001–015 (latest: 015 email outbox). `infra/keycloak` scaffold (not deployed).

## Commands
- `npm run typecheck`, `npm run build`
- `npm run build:web` (Netlify), `npm run build:api` / `npm run start:api` (Railway)
- `npm run db:migrate:deploy` (Railway pre-deploy), `npm run db:seed` (dev only; never seed production)

## Deployment (staging, live)
- Web: Netlify, `apps/web` package dir, repo root as base. The production site katondo.netlify.app is **public** (only previews need Netlify team login); the owner chose to keep it public during the private sign-in test (2026-11-27).
- API + PostgreSQL: Railway (`railway.toml`, health check `/health`). Pushing to `main` auto-deploys both.
- Last deployed commit: `124531b` (migration 007 applied, API healthy).
- See `DEPLOYMENT.md` for env vars.

## Safety rules for working on this project
- Feature gates change only on the owner's say-so, never to make something "work". Currently on: sign-in, messaging, help, email. Still off: seller-application flags, `REVIEWS_ENABLED`.
- Legal docs in `docs/legal` (privacy notice, terms of use, seller terms, version 2026-12-01, effective 1 Dec 2026) were written from the owner's answers on 2026-11-27 and are shown at `/privacy`, `/terms`, `/seller-terms`. The owner reports DPC registration and authorisation for storage outside Zambia. Everyone must be 18+ (Zambian law needs parental consent under 18). Signed-in customers must confirm 18+ and accept the current version (`PRIVACY_NOTICE_VERSION`) before using the API. Change a document → raise its version.
- Don't call payments "escrow" until Zambian counsel / Bank of Zambia confirm.
- Activity collection is opt-in, retention-limited, and never stores raw IPs.
- AI agents use machine identities with narrow scopes and cannot approve/reject sellers.
- Don't run `npm audit fix --force` (it downgrades Expo/React Native). Remaining advisories are documented in `SECURITY.md`.
- Ask before committing, pushing, or changing hosting/billing.

## Current status and next step
**2026-11-27: private sign-in test by the owner.** Switched on by the owner's decision: `AUTH_ENABLED`, `AUTH_DATA_PROCESSING_APPROVED`, `MESSAGING_ENABLED`, `SUPPORT_ENABLED`, `EMAIL_ENABLED` (Railway) and `NEXT_PUBLIC_AUTH_ENABLED` (Netlify); policy versions 2026-12-01 set. Seller onboarding and reviews stay off.

**Earlier: sign-in.** Zambian data-protection law defaults to in-country storage; offshore hosting needs DPC authorisation (see `docs/compliance/ZAMBIA_DATA_PROTECTION_READINESS.md`).
- Option A (compliance-safe): Keycloak + PostgreSQL on SwiftCloud Zambia (app-3 + db-1, ~K766.50/month). Org "Katondo Marketplace" created; not yet funded.
- Option B (cheapest/easiest): Microsoft Entra External ID (free < 50k MAU; ~US$35/month extra for a branded login domain). Stores data in EMEA, so needs cross-border approval before real users.
- Owner's last direction: build global-first, keep Zambia features; was setting up Entra. Blocked on creating an Azure subscription (owner must do payment/verification).
- Entra tenant `c43c8626-…` set up by the owner (2026-11-27): app registrations katondo-api/web/app, 12 app roles, `signup_signin` flow, Google (and Facebook in dev mode). Values and variables are in `DEPLOYMENT.md` → "Sign-in with Microsoft Entra External ID".
- Code done for Entra: scope check, default buyer role, seller role from database, email verified by provider, staff MFA via Conditional Access, Entra password wording, `NEXT_PUBLIC_AUTH_ENABLED` web switch, safe return paths. Still to do: in-app sign-in for the phone app (katondo-app registration exists), service-agent client-credential test, owner to add `email` optional claim on katondo-api.

## Account lifecycle (decided by the owner 2026-11-27)
- Closing an account: hidden at once, restorable for 30 days, then anonymised; legal records kept. Lost email: `/help/recover`, 72-hour hold, identity check by one staff member and approval by a different one. Staff numbers (random with a check character, e.g. `S-7QM4-R9K`; migration 013) shown on replies and checkable at `/help/check-staff`. Details in `DEPLOYMENT.md`.

## Email notifications
- Built 2026-11-27 (`apps/api/src/email.ts`): queued outbox, Azure Communication Services, retries, 30-day retention, no open tracking. Off until `EMAIL_ENABLED=true` and the owner has created the Azure resources and put `ACS_CONNECTION_STRING` in Railway. Details in `DEPLOYMENT.md` → Email notifications.

## Still to build (after sign-in)
Payments + payouts (shortlist: Lenco/BroadPay + a second licensed provider; mobile money and cards), seller identity/business verification, delivery (Lusaka pilot with courier panel), media storage, auctions + live bidding, livestream (prototype Amazon IVS behind an adapter), returns/disputes/refunds, SMS notifications, monitoring, backup/restore tests, security review, app-store releases.
