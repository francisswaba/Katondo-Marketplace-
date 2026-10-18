# Infrastructure notes

Local PostgreSQL and Redis are defined in the root `docker-compose.yml`. Apply versioned SQL files in `postgres/migrations` with `npm run db:migrate`; load development-only sample catalogue data with `npm run db:seed`. The migration runner records applied filenames and executes each migration transactionally.

Production cloud, region, payment, payout, delivery, identity verification, and live-stream providers remain open pending Zambia coverage, legal, operational, and budget review.
