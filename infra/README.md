# Infrastructure notes

Local PostgreSQL and Redis are defined in the root `docker-compose.yml`. Apply versioned SQL files in `postgres/migrations` with `npm run db:migrate`; load development-only sample catalogue data with `npm run db:seed`. The migration runner records applied filenames and executes each migration transactionally.

The selected identity pattern is a Katondo-managed Keycloak container with a dedicated PostgreSQL database hosted in Zambia. See `keycloak/README.md`. The final Zambia infrastructure vendor and contract still require commercial, security, processor-registration and data-location verification before real accounts are enabled.

Production application cloud, payment, payout, delivery, identity verification, and live-stream providers remain open pending Zambia coverage, legal, operational, and budget review.
