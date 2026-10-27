# Country Configuration

Katondo is a global marketplace platform with a country-specific operating profile. Zambia is the first profile, not a hard-coded platform limitation.

## Runtime profile

Each deployed API environment has one active market configured with:

- `DEPLOYMENT_COUNTRY`: ISO 3166-1 alpha-2 country code.
- `DEPLOYMENT_COUNTRY_NAME`: public country name override.
- `DEFAULT_CURRENCY`: ISO 4217 settlement/display currency for new marketplace records.
- `DEFAULT_LOCALE`: default BCP 47 locale.
- `SUPPORTED_LOCALES`: comma-separated account locale choices.

The corresponding `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` values provide a build-time fallback while the API is unavailable. The API remains authoritative and returns its market profile from `/api/market` and `/api/catalogue`.

## Data isolation

Listings, seller applications, and release approvals carry a country code. Catalogue and seller-review queries are scoped to the active market. Release approvals use `(country_code, control_key)` identity, so an approval recorded for Zambia cannot enable onboarding in another market.

The current milestone uses one active country per deployed API environment. This is intentional: payments, payouts, taxes, delivery, prohibited goods, identity checks, privacy notices, hosting/transfers, and consumer rules require separate operational approval. A future multi-country control plane may route to these isolated market environments without weakening that boundary.

## Zambia launch profile

Production starts with `ZM`, `ZMW`, and `en-ZM`. Zambia-specific payment/mobile-money support, seller verification, delivery operations, policy documents, data protection, hosting/transfer review, and regulator approvals remain required for the Zambia environment. They do not become global platform requirements and they do not authorize another country.

## Adding a country

1. Create a separate environment and database for the country.
2. Configure the five runtime profile values and matching web/mobile fallbacks.
3. Seed country-appropriate categories/listings and configure local payment, payout, delivery, tax, identity, moderation, and support providers.
4. Publish country-appropriate privacy and seller terms versions.
5. Complete every release control in that country's admin workspace.
6. Run migrations, builds, security checks, recovery tests, and a limited invited pilot before opening registration.

Do not copy Zambia approvals, policy versions, provider contracts, or verification decisions into another country without a documented local review.
