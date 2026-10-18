# Katondo App

Katondo is a Zambia-first marketplace for individual and business sellers, platform inventory, standard purchases, timed auctions, and live shopping.

## Project status

The initial TypeScript monorepo and a web-to-API catalogue slice are in place. This is an early local-development scaffold, not a production marketplace.

- Product requirements, architecture recommendation, phased roadmap, risks, and Milestone 0 acceptance criteria: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md)
- Target clients: iOS, Android, and web
- Initial market and currency: Zambia, ZMW (deployment-configurable)
- Development tools: OpenAI Codex as primary; Claude as an alternative

## Run locally

1. Install Node.js 20 or newer and Docker Desktop.
2. Copy `.env.example` to `.env` and keep local credentials out of Git.
3. Start local services with `docker compose up -d`.
4. Install dependencies with `npm install`.
5. Start API and web in separate terminals with `npm run dev:api` and `npm run dev:web`.
6. Open `http://localhost:3000`; the API listens on `http://localhost:4000`.

## First implementation milestone

Build a TypeScript monorepo with `apps/web`, `apps/mobile`, and `apps/api`, plus shared contracts and design tokens. The first vertical slice should serve seeded categories and product listings from PostgreSQL through a typed API to the web client. Keep identity, payment, delivery, auctions, and livestream providers behind replaceable interfaces until the relevant choices are validated.

## Proposed local services

- PostgreSQL for transactional data
- Redis for short-lived coordination and realtime fanout
- Object storage/CDN adapter for listing media
- API and web app started from documented local commands

The initial scaffold includes local service configuration, a starter schema and seed data, typed contracts, and setup instructions. CI workflows, migrations beyond the bootstrap schema, authentication, mobile runtime, and automated checks remain follow-up work.

## Decisions to validate before production

Confirm Zambia payment and payout providers, delivery coverage and operating model, seller verification requirements, local legal/tax/privacy obligations, initial prohibited-goods policy, streaming provider, hosting region, and deployment budget. See the open-decision register in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).
