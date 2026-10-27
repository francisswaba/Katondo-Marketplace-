# Katondo identity deployment

Katondo uses Keycloak because the application already supports standard OpenID Connect and Keycloak can run with its PostgreSQL database entirely inside Zambia. The production target is a container and managed PostgreSQL service whose provider contract states that the primary database, replicas, backups, logs and support access remain in Zambia.

The realm import is deliberately safe for preparation:

- public registration is disabled;
- email verification is required;
- the browser client uses authorization code flow with PKCE;
- password reset and the self-service account console are available;
- buyer is the only default marketplace role;
- staff roles must be assigned manually by a super administrator;
- no administrator account or password is stored in Git.

## Local verification

1. Start `postgres`, `redis`, `keycloak-postgres` and `keycloak` with the root Compose file.
2. Change the local-only bootstrap password before using the administration console.
3. Open `http://localhost:8080/realms/katondo/.well-known/openid-configuration`.
4. Create a test user and assign `CONFIGURE_TOTP` before testing a staff role.
5. Keep `AUTH_ENABLED=false`, `AUTH_DATA_PROCESSING_APPROVED=false` and `SELLER_ONBOARDING_ENABLED=false` until the release checklist is complete.

## Zambia production configuration

Build this directory as the container image and provide secrets through the hosting platform, not source control:

| Variable | Production value |
| --- | --- |
| `KC_HOSTNAME` | `https://auth.<approved-katondo-domain>` |
| `KC_HOSTNAME_ADMIN` | Dedicated restricted administration hostname where supported |
| `KC_HTTP_ENABLED` | `true` only behind the provider's HTTPS-terminating proxy |
| `KC_PROXY_HEADERS` | Header mode confirmed by the Zambia hosting provider, normally `xforwarded` |
| `KC_DB` | `postgres` |
| `KC_DB_URL` | Private JDBC URL for the Zambia-hosted Keycloak database |
| `KC_DB_USERNAME` | Secret database username |
| `KC_DB_PASSWORD` | Secret database password |
| `KC_BOOTSTRAP_ADMIN_USERNAME` | One-time bootstrap administrator |
| `KC_BOOTSTRAP_ADMIN_PASSWORD` | One-time strong secret, removed after administrator setup |

Do not publicly expose Keycloak's management port `9000`. Restrict the administration hostname and the `master` realm, require MFA for every administrator, configure SMTP for verification and recovery, and test encrypted backup restoration before launch.

After the public hostname and custom Katondo domain are known, replace the imported Netlify callback/origin entries with the final exact URLs. Enable self-registration only after the privacy notice, age rules, DPC registration, processor contract, data map, retention schedule, incident procedure and release controls are approved.

## Application values

For a production hostname of `https://auth.example.zm`, configure:

```text
AUTH_ISSUER=https://auth.example.zm/realms/katondo
AUTH_AUDIENCE=katondo-api
AUTH_JWKS_URL=https://auth.example.zm/realms/katondo/protocol/openid-connect/certs
AUTH_ACCOUNT_URL=https://auth.example.zm/realms/katondo/account
NEXT_PUBLIC_AUTH_AUTHORITY=https://auth.example.zm/realms/katondo
NEXT_PUBLIC_AUTH_CLIENT_ID=katondo-web
NEXT_PUBLIC_AUTH_ACCOUNT_URL=https://auth.example.zm/realms/katondo/account
```

Only after approval and testing, set `AUTH_DATA_PROCESSING_APPROVED=true` and then `AUTH_ENABLED=true`. Seller applications remain independently controlled by their existing release gates.
