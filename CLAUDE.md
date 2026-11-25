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
- Design system (in `apps/web/app/styles.css`): malachite green brand, orange only for live/bidding, Apple system type (rounded for prices), chitenge-inspired patterns until real photos exist. Avoid generic AI-UI looks.

## Stack and layout
- npm workspaces monorepo, Node 24.
- `apps/web` Next.js storefront + `/admin` staff workspace + `/account` settings + `/sell` onboarding.
- `apps/api` Express API (OIDC/JWT auth boundary, roles, activity tracking, release controls).
- `apps/mobile` Expo (iOS/Android), id `com.katondo.marketplace`.
- `packages/contracts` shared TypeScript types. Must build before web/api.
- `infra/postgres/migrations` 001–008 (latest: 008 product types and display styles). `infra/keycloak` scaffold (not deployed).

## Commands
- `npm run typecheck`, `npm run build`
- `npm run build:web` (Netlify), `npm run build:api` / `npm run start:api` (Railway)
- `npm run db:migrate:deploy` (Railway pre-deploy), `npm run db:seed` (dev only; never seed production)

## Deployment (staging, live)
- Web: Netlify, `apps/web` package dir, repo root as base. Site is access-protected (401 to anonymous) on purpose.
- API + PostgreSQL: Railway (`railway.toml`, health check `/health`). Pushing to `main` auto-deploys both.
- Last deployed commit: `124531b` (migration 007 applied, API healthy).
- See `DEPLOYMENT.md` for env vars.

## Safety rules for working on this project
- Feature gates stay **off** until real approvals exist: `AUTH_ENABLED`, `AUTH_DATA_PROCESSING_APPROVED`, seller-application flags. Never flip them to make something "work".
- Legal docs in `docs/legal` are **drafts**; never describe them as approved.
- Don't call payments "escrow" until Zambian counsel / Bank of Zambia confirm.
- Activity collection is opt-in, retention-limited, and never stores raw IPs.
- AI agents use machine identities with narrow scopes and cannot approve/reject sellers.
- Don't run `npm audit fix --force` (it downgrades Expo/React Native). Remaining advisories are documented in `SECURITY.md`.
- Ask before committing, pushing, or changing hosting/billing.

## Current status and next step
**In progress: sign-in.** Zambian data-protection law defaults to in-country storage; offshore hosting needs DPC authorisation (see `docs/compliance/ZAMBIA_DATA_PROTECTION_READINESS.md`).
- Option A (compliance-safe): Keycloak + PostgreSQL on SwiftCloud Zambia (app-3 + db-1, ~K766.50/month). Org "Katondo Marketplace" created; not yet funded.
- Option B (cheapest/easiest): Microsoft Entra External ID (free < 50k MAU; ~US$35/month extra for a branded login domain). Stores data in EMEA, so needs cross-border approval before real users.
- Owner's last direction: build global-first, keep Zambia features; was setting up Entra. Blocked on creating an Azure subscription (owner must do payment/verification).
- Code still needed for Entra: validate `scp=access_as_user` (`AUTH_REQUIRED_SCOPE`), Entra-specific password-reset/account wording, default `buyer` role assignment, service-agent client-credential test.

## Still to build (after sign-in)
Payments + payouts (shortlist: Lenco/BroadPay + a second licensed provider; mobile money and cards), seller identity/business verification, delivery (Lusaka pilot with courier panel), media storage, auctions + live bidding, livestream (prototype Amazon IVS behind an adapter), email/SMS notifications, returns/disputes/refunds, monitoring, backup/restore tests, security review, app-store releases.
