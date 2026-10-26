# Staging deployment guide

This repository now has a deployment path for the web storefront on Netlify and the API on Railway. It is intended for a private staging environment and product review, not for taking real orders or processing real payments.

## 1. Create the Railway API and database

1. Create a Railway project from the GitHub repository and use the repository root as the service root. Keep the root `railway.toml` active; it builds and starts only the API workspace.
2. Add a Railway PostgreSQL service. Set the API service's `DATABASE_URL` to the database's private connection URL/reference.
3. Generate a public API domain in Railway. The API listens on Railway's injected `PORT`; `/health` checks database connectivity.
4. Set `CORS_ORIGINS` to the exact Netlify site origin, such as `https://your-staging-site.netlify.app` (no trailing slash). Add a comma-separated list only if there are multiple trusted browser origins.
5. Set `DEPLOYMENT_COUNTRY=ZM`, `DEFAULT_CURRENCY=ZMW`, and configure `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URL` for the selected identity provider before testing protected routes. Do not put secrets in Git or `NEXT_PUBLIC_*` variables.
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
| `DEPLOYMENT_COUNTRY` | `ZM` |
| `DEFAULT_CURRENCY` | `ZMW` |
| `AUTH_ISSUER` | Issuer URL for the configured identity provider |
| `AUTH_AUDIENCE` | Expected API audience, e.g. `katondo-api` |
| `AUTH_JWKS_URL` | Provider's public JWKS endpoint |

`PORT` is supplied by Railway. `API_PORT` is only a local-development fallback. The public web build also needs `NEXT_PUBLIC_API_URL` set in Netlify.

## Current staging limitations

- The web storefront and catalogue API are the only functional user-facing slice. Authentication configuration is a boundary only; there is no sign-in/onboarding flow yet.
- Payment, payout, seller verification provider, delivery, media storage, and livestream integrations are not implemented. Do not collect real money or promise real fulfilment.
- The current product listing media fields are not connected to uploads or object storage.
- The dependency audit remains unresolved at 26 advisories (19 high, 7 moderate, 0 critical); see `SECURITY.md`. Do not treat this as a production security approval.
- Complete a controlled staging smoke test after deployment: `/health`, `/api/catalogue`, web catalogue rendering, CORS from the deployed site, and one deploy with a schema migration. Seed data is demo-only.

## Hosting split

Use Netlify for the Next.js web storefront and Railway for the long-running Express API and PostgreSQL. Deploy iOS/Android separately through Expo's native build and app-store release workflow; hosting these web services does not publish mobile apps.
