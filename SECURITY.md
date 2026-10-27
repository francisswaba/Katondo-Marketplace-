# Dependency security status

Last reviewed: 2026-10-27 (npm audit refreshed before the Zambia-hosted identity scaffold deployment)

## Current audit

The refreshed `npm audit` report contains 3 high findings, no moderate findings, and no critical findings. A compatible `npm audit fix` upgraded `node-forge` from 1.4.0 to 1.4.1 and removed its RSA signature-verification advisory. The remaining findings concern `zod` through Expo SDK 58's local CLI dependency chain (`expo` and `@expo/cli`).

After applying compatible fixes, npm's forced recommendation is to install Expo 54.0.38. That is a breaking SDK change from this Expo SDK 58 application and must not be applied without a planned mobile-platform migration. The current latest Expo 58.0.19 and `@expo/cli` 58.1.15 still declare `zod` `^3.25.76`, while the advisory reports a fix in Zod 4.6.6; a transitive major-version override could break the CLI and was not applied.

## Findings without an upstream fix

- Zod versions before 4.6.6 have a high-severity memory-exhaustion advisory for oversized constrained collections: [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). The vulnerable package is transitive through the Expo CLI used for local mobile exports.
- The web and API runtime dependency findings reported in earlier audits are cleared. The remaining findings affect the Expo development/build toolchain; treat native builds and signing as a separate security gate and keep the build environment restricted.

## Handling

- Keep Expo/Metro development services on trusted local networks; do not expose the development server publicly.
- Do not use Expo's transitive `node-forge` as an application trust or certificate-verification boundary.
- Re-run `npm audit` when Expo or React Native publishes compatible SDK updates. Upgrade Expo SDKs incrementally and verify with `npx expo install --check`, Expo Doctor, type checks, and iOS/Android bundle exports.
- Review each advisory's affected code path before applying a transitive override or accepting a release candidate. Never use `npm audit fix --force` to silence the report.
- Treat the remaining findings as unresolved for production readiness until patched upstream or individually assessed and accepted.
