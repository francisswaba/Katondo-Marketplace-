# Dependency security status

Last reviewed: 2026-11-25

## Current audit

`npm audit` reports **0 vulnerabilities** (no low, moderate, high or critical findings).

## What was fixed on 2026-11-25

- **Next.js 16.4.2 → 16.4.6** (web storefront). Clears three advisories affecting 16.0–16.4.4:
  - [GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h): information disclosure across root params with `'use cache'` via `unstable_cache()`
  - [GHSA-vc7v-qv4w-wrv8](https://github.com/advisories/GHSA-vc7v-qv4w-wrv8): cache leak across root param values in nested `'use cache'` functions
  - [GHSA-7qx7-33qx-rqx2](https://github.com/advisories/GHSA-7qx7-33qx-rqx2): SVG rejection bypass in image optimisation
- **Expo SDK 58 patch updates** (`expo` 58.0.26, `@expo/cli` 58.1.21 and related packages, all within SDK 58). Clears the earlier `zod`, `node-forge` and `glob` findings in the mobile build toolchain without an SDK migration.
- **`minimatch` pinned to ^11.0.9** via `overrides` in the root `package.json` (plus a direct dev dependency in `apps/mobile` so npm installs it). Clears [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (denial of service via glob-part amplification), which reached the project only through `@expo/fingerprint`. Verified that `@expo/fingerprint` loads 11.0.9 and computes a project fingerprint, and that iOS/Android exports still build.

npm's own suggested fix for the last finding was to downgrade to Expo 52, a breaking SDK change. It was not applied.

## Handling

- Keep Expo/Metro development services on trusted local networks; do not expose the development server publicly.
- Re-run `npm audit` before each release and when Expo, React Native or Next.js publish updates. Upgrade Expo SDKs incrementally and verify with `npx expo install --check`, Expo Doctor, type checks, and iOS/Android bundle exports.
- When Expo itself depends on `minimatch` 11.0.1 or later, remove the `minimatch` override and the `apps/mobile` dev dependency.
- Review each advisory's affected code path before applying a transitive override. Never use `npm audit fix --force` to silence the report.
