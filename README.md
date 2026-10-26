# Katondo App

Katondo is a Zambia-first marketplace for individual and business sellers, platform inventory, standard purchases, timed auctions, and live shopping.

## Project status

The initial TypeScript monorepo and a web-to-API catalogue slice are in place. This is an early local-development scaffold, not a production marketplace.

- Product requirements, architecture recommendation, phased roadmap, risks, and Milestone 0 acceptance criteria: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md)
- Netlify + Railway staging deployment steps and current limitations: [DEPLOYMENT.md](DEPLOYMENT.md)
- Target clients: iOS, Android, and web
- Initial market and currency: Zambia, ZMW (deployment-configurable)
- Development tools: OpenAI Codex as primary; Claude as an alternative

## Run locally

1. Install Node.js 20 or newer and Docker Desktop.
2. Copy root `.env.example` to `.env` for API configuration. Copy `apps/mobile/.env.example` to `apps/mobile/.env` for the public API URL. Keep local credentials out of Git. For a physical phone, set the mobile URL to the computer's LAN IP instead of `localhost`.
3. Start local services with `docker compose up -d`.
4. Install dependencies with `npm install`.
5. Apply the schema and development catalogue with `npm run db:migrate` and `npm run db:seed`.
6. Start API and web with `npm run dev:api` and `npm run dev:web`; start the native app with `npm run dev:mobile`.
7. Open `http://localhost:3000`; the API listens on `http://localhost:4000`.

## Authentication boundary

The API validates signed JWT access tokens against a configured remote JWKS endpoint. Set `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URL` from the selected identity provider before using authenticated routes. Tokens must carry a `sub` and a top-level `roles` array containing Katondo role names. Public catalogue access remains unauthenticated; `/api/account` requires a valid token and `/api/admin/health` additionally requires the `administrator` role. No provider or login screen is configured yet.

## Current implementation

- `apps/web`: responsive marketplace storefront backed by the catalogue API.
- `apps/mobile`: Expo iOS/Android shell backed by the same catalogue API, using platform system typography.
- `apps/api`: catalogue API and configurable JWT/JWKS authorization boundary.
- `infra/postgres/migrations`: versioned schema migrations; `infra/postgres/seed.sql` contains development-only catalogue data.
- `.github/workflows/ci.yml`: install, type-check, and build validation on pushes and pull requests.
- `netlify.toml` and `railway.toml`: web/API staging deployment configuration.

Payment, payout, delivery, compliance, and livestream providers remain open decisions and are not yet integrated.

## Proposed local services

- PostgreSQL for transactional data
- Redis for short-lived coordination and realtime fanout
- Object storage/CDN adapter for listing media
- API and web app started from documented local commands

The local setup includes Docker services, typed contracts, migrations, seed data, authentication configuration seams, and setup instructions. Provider-backed login, managed delivery, payments and payouts, live shopping, and production deployment remain future work.

## Decisions to validate before production

Confirm Zambia payment and payout providers, delivery coverage and operating model, seller verification requirements, local legal/tax/privacy obligations, initial prohibited-goods policy, streaming provider, hosting region, and deployment budget. See the open-decision register in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).
