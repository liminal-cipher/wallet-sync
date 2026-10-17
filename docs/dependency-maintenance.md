# Dependency Maintenance

Checked on 2026-10-17 with Node.js 24.20.0 and npm 11.19.0. This maintenance
retains Expo SDK 54, React Native 0.81.5 and React 19.1.0. It does not migrate
native APIs or deploy backend changes.

## Updates

| Area | Previous | Installed | Reason |
| --- | --- | --- | --- |
| Expo | 54.0.30 | 54.0.37 | Match the SDK 54 compatibility check. |
| Jest and babel-jest | 30.5.0 | 29.7.0 | Align the runner and transformer with the SDK recommendation. |
| Babel core | 7.28.5 | 7.29.7 | Apply the [source-map file-read fix](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) within Babel 7. |
| Firebase | 12.7.0 | 12.19.0 | Update within the existing Firebase 12 range. |
| React Navigation native | 7.1.26 | 7.5.1 | Update within the existing major version and declared peer requirements. |
| React Navigation native stack | 7.9.0 | 7.21.0 | Update alongside its native navigation peer. |
| React Native Web | 0.21.2 | 0.21.4 | Apply the available patch within the existing range. |

The lockfile also refreshes compatible transitive dependencies. Native packages
remain within Expo's supported version ranges. Following the
[Expo maintenance guidance](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/),
compatibility checks and regression verification accompany these updates.

Two scoped overrides address restrictive upstream ranges:

- `@expo/metro-config` resolves PostCSS 8.5.30 instead of 8.4.49, retaining
  PostCSS 8 while addressing its [source-map file-read advisories](https://github.com/advisories/GHSA-r28c-9q8g-f849).
- `@firebase/firestore` resolves `@grpc/grpc-js` 1.13.6 instead of 1.9.16.
  This remains within gRPC's major version and includes the published
  [authentication-context](https://github.com/advisories/GHSA-m9gg-hp2v-232j)
  and [error-disclosure fixes](https://github.com/advisories/GHSA-f596-whhp-79r4).
  Firestore emulator tests exercise the Node transport after the override.

Reassess these overrides when their parent packages adopt fixed dependencies.
No global major-version override or forced audit fix is used.

## Audit Results

The following are npm audit's affected-package counts, including parent packages
that inherit an advisory through dependencies. They are not counts of distinct
vulnerabilities or proof of exploitability in the shipped application.

| Severity | Before | After |
| --- | --- | --- |
| Critical | 4 | 0 |
| High | 34 | 41 |
| Moderate | 30 | 13 |
| Low | 1 | 0 |
| Total affected package entries | 69 | 54 |
| Distinct advisory URLs | 105 | 6 |

The remaining six advisories originate in five packages. High package counts
remain elevated because the compatible Jest and Metro dependency trees inherit
the same unresolved advisory through several parents.

| Package and path | Remaining Issue | Follow-up |
| --- | --- | --- |
| `braces@3.0.3`, through Jest file matching | [Stack exhaustion on nested patterns](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The advisory lists no patched version. | Monitor the upstream fix and its adoption by micromatch. |
| `image-size@1.2.1`, through Metro | [JXL/HEIF](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) and [ICNS](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) parser hangs. The fixed version is 2.0.3. | Validate a Metro/SDK migration that supports image-size 2; retain the current major-version contract for this maintenance. |
| `node-forge@1.4.0`, through Expo CLI and code-signing tools | [Signature verification issue](https://github.com/advisories/GHSA-86w9-cpqp-85rv). The advisory lists no patched version. | Monitor the upstream fix and Expo's adoption. |
| `sprintf-js@1.0.3`, through Jest coverage configuration parsing | [Unbounded precision specifiers](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). The advisory lists no patched version. | Monitor the fix or replacement in the coverage configuration dependency chain. |
| `uuid@7.0.3`, through xcode and Expo config plugins | [Missing buffer checks in v3/v5/v6](https://github.com/advisories/GHSA-w5hq-g745-h8pq), fixed in 11.1.1. The inspected xcode caller uses `v4()`, which the advisory excludes. | Monitor xcode's dependency update; retain the warning rather than force a major-version replacement. |

These paths are build/test/configuration tools, rather than coupon model imports.
Expo is a production dependency, so `npm audit --omit=dev` does not remove every
toolchain advisory. An upgrade to a newer SDK must still be audited; it is not
assumed to resolve advisories with no published patch. Expo recommends upgrading
SDK versions incrementally.

## Reproducing the Checks

The maintenance verification passed a clean `npm ci`, the complete dependency
tree check, Expo's version compatibility check, all 205 tests across 25 suites
with local Firestore/Storage emulators, and web/iOS/Android JavaScript exports.
No tests were skipped. Expo Doctor passed 17 of 18 checks, with the OCR metadata
warning described below remaining unresolved.

Use Node.js 20.19.4 or later, as required by React Native 0.81.5, and Java 21 for
the local emulators. Install from the committed lockfile:

```sh
npm ci
npm ls --all
npx expo install --check
npx expo-doctor
npm audit
npm run test:integration
npx expo export --platform all --clear
```

An audit exit code of 1 remains expected while the advisories above are present.
Keep the full audit enabled. Expo Doctor also reports `rn-mlkit-ocr` as untested
on the New Architecture; the application already enables that architecture.
That metadata warning remains visible and requires physical-device OCR
acceptance checks. Successful JavaScript exports do not establish native OCR,
scanner, notification or sharing behaviour.
