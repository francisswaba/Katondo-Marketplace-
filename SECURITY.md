# Dependency security status

Last reviewed: 2026-10-26 (npm audit refreshed during seller-onboarding release preparation)

## Current audit

The refreshed `npm audit --json` report contains 5 findings: 5 high, no moderate, and no critical findings (639 total dependency entries). A compatible `npm audit fix` upgraded Express to 5.3.0 and body-parser to 2.4.0, removing the API request-body denial-of-service advisory and the earlier moderate mobile-tooling findings. The remaining findings are in Expo SDK 58's CLI/code-signing dependency chain (`@expo/cli`, `@expo/code-signing-certificates`, `node-forge`, and `zod`). npm offers only the incompatible Expo 44.0.6 downgrade for the full chain, so it was not applied.

After applying the compatible fixes, npm's remaining forced recommendation is to downgrade Expo to 44.0.6. That is not compatible with this Expo SDK 58 application and must not be applied without a planned mobile-platform migration.

## Findings without an upstream fix

- `node-forge` through 1.4.0 has a high-severity RSA signature-verification advisory. The advisory currently lists no patched release: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
- The web and API runtime dependency findings reported in the earlier audit are cleared. The remaining findings affect the Expo development/build toolchain; treat native builds and signing as a separate security gate and keep the build environment restricted.

## Handling

- Keep Expo/Metro development services on trusted local networks; do not expose the development server publicly.
- Do not use Expo's transitive `node-forge` as an application trust or certificate-verification boundary.
- Re-run `npm audit` when Expo or React Native publishes compatible SDK updates. Upgrade Expo SDKs incrementally and verify with `npx expo install --check`, Expo Doctor, type checks, and iOS/Android bundle exports.
- Review each advisory's affected code path before applying a transitive override or accepting a release candidate. Never use `npm audit fix --force` to silence the report.
- Treat the remaining findings as unresolved for production readiness until patched upstream or individually assessed and accepted.
