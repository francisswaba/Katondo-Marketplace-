# Dependency security status

Last reviewed: 2026-10-18 (npm audit refreshed immediately before commit)

## Current audit

The refreshed `npm audit --json` report contains 26 findings: 19 high, 7 moderate, and no critical findings (636 total dependency entries). The earlier Next.js/PostCSS findings were addressed by moving the storefront to Next.js 16.4.2. The remaining report is concentrated in the Expo SDK 58, Metro, React Native, and Xcode tooling dependency chains. npm reports a fix only by downgrading Expo to 44.0.6 or React Native to 0.72.17, which is incompatible with this Expo SDK 58 application; no downgrade was applied.

`npm audit fix --dry-run` proposes no compatible changes. Its forced recommendation to downgrade Expo to 44 and React Native to 0.72 is not acceptable for this SDK 58 application and must not be applied.

## Findings without an upstream fix

- `braces` through 3.0.3 has a stack-exhaustion denial-of-service advisory. The current published release is affected and the advisory lists no patched version: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- `node-forge` through 1.4.0 has a high-severity RSA signature-verification advisory. The advisory currently lists no patched release: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
- `uuid` below 11.1.1 is reported through Expo's `xcode` helper. A direct override was not retained because npm continued resolving the helper to uuid 7; do not claim that item is fixed without confirming the installed tree and a successful audit.

## Handling

- Keep Expo/Metro development services on trusted local networks; do not expose the development server publicly.
- Do not use Expo's transitive `node-forge` as an application trust or certificate-verification boundary.
- Re-run `npm audit` when Expo or React Native publishes compatible SDK updates. Upgrade Expo SDKs incrementally and verify with `npx expo install --check`, Expo Doctor, type checks, and iOS/Android bundle exports.
- Review each advisory's affected code path before applying a transitive override or accepting a release candidate. Never use `npm audit fix --force` to silence the report.
- Treat the remaining findings as unresolved for production readiness until patched upstream or individually assessed and accepted.
