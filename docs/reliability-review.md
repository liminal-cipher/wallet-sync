# Feature and reliability review

Review date: 27 October 2026. Scope: repository-owned application code, rules,
configuration, tests, documentation and asset manifests. Dependencies are inspected
through their manifests and automated checks, not individually audited.

## Feature design

- Wallet overview: counts for usable, expiring, used and expired vouchers; total
  manually recorded remaining KRW balance for usable monetary vouchers. Unknown
  balances stay unknown, product prices are never added, and trash is excluded.
- Sorting: expiry, newest registration and Korean title. Missing dates sort last;
  ties are deterministic and sorting never mutates the source list.
- Search: include barcode text and conditions alongside existing brand aliases,
  initial consonants, product names and issuer/channel metadata.
- Reminder forecast: show the next twenty calculated reminder times using the
  same schedule calculation as native notifications. Label this as a calculation,
  not proof of OS scheduling or delivery. Use saved device settings, excluding
  used/trashed/expired records and past times.

## Exception design and verification

The review distinguishes reproducible defects from external acceptance work.
Unchanged files retain their existing safeguards; a risk entry does not mean
every file in that category had a defect. This is not a proof that all possible
bugs have been eliminated.

| ID | Trigger / risk | Implemented response or retained design | Evidence |
| --- | --- | --- | --- |
| W1 | Monetary totals treat an unknown balance as zero, include trash or lose integer precision | Count unknowns separately; sum only usable manual KRW balances; report overflow instead of rounding | `walletOverview.test.js` |
| W2 | Missing dates or equal keys produce confusing order; searching a barcode requires its display title | Three stable sort modes; unknown sort dates last; search barcode and conditions without altering payload | `walletOverview.test.js`, `homeScreen.test.js` |
| W3 | An old refresh/local read finishes after a newer listener update; a recovered connection still shows an error | Compare lifecycle and data generations; prevent parallel refreshes; clear errors on valid updates | `homeScreen.test.js` |
| A1 | Repeated login/sign-up taps submit duplicate requests; native Alert is ineffective on web | Synchronous submission locks and the existing cross-platform feedback adapter | `authScreens.test.js` |
| A2 | An account changes during reads, image processing, PDF creation or file sharing | Assert the captured account after asynchronous boundaries and before mutation/sharing; ignore stale subscription callbacks | `firestoreBoundary.test.js`, `imageService.test.js`, `backupService.test.js`, existing preference tests |
| D1 | A malformed draft is restored or a reused editor keeps its old ready/saved state | Reject missing/invalid draft structure without replacing it; reset editor state on record changes; lock image selection synchronously | `addCouponScreen.test.js`; native picker re-entry still needs device acceptance |
| D2 | A timestamp adapter throws, returns an invalid Date, or a local copy holds serialised timestamp fields | Safely convert timestamp representations, reject invalid dates, preserve calendar-day arithmetic | `reminderSchedule.test.js`, `calendar.test.js`, `date.test.js` |
| D3 | Purchase dates precede expiry dates; validity periods contain two dates | Prefer the labelled expiry; use the end of a valid range; leave ambiguous/reversed/invalid dates unfilled | `voucherParser.test.js` |
| D4 | Server data has malformed or future catalogue fields and crashes a screen | Validate records before delivery; report the error and preserve the last displayed/local copy | `firestoreBoundary.test.js`; unsupported schemas require an appropriate reader |
| N1 | Cold-start empty cache or uncommitted writes remove valid OS reminders | Ignore unconfirmed empty caches and pending writes; confirmed empty server results still cancel reminders | `couponNotificationSync.test.js` |
| N2 | Preview and OS scheduling calculate different times; past/used/trashed/foreign records generate alerts | Share a pure schedule function; use saved settings and current device time; retain iOS queue budgeting | `reminderSchedule.test.js`, `notification.test.js`, `recoveryScreens.test.js` |
| R1 | Syntactically valid JSON has an invalid snapshot shape and later crashes or overwrites recovery | Validate snapshot structure and coupon models on read; preserve unreadable data; wait for queued writes before reads | `recovery.test.js` |
| R2 | Disk write is truncated or the active-file pointer is corrupt | Read back the inactive file before switching the pointer; reject unknown pointers before writing either slot | `nativeRecoveryStorage.test.js` |
| R3 | Queues retain promises indefinitely for accounts and drafts | Remove only the promise that still owns the queue entry after settlement | Recovery and preference suites, including concurrent updates |
| R4 | Another tab blocks IndexedDB upgrade; a connection arrives after failure | Reject blocked access visibly; close late connections and release connections on version changes | `localDatabase.test.js`; actual browser quota/eviction still needs browser testing |
| B1 | Non-ASCII backups exceed the documented byte limit; malformed Base64 is accepted | Enforce UTF-8 bytes, image group/padding rules, decoded image bytes and aggregate bounds | `inputLimits.test.js`, recovery/export suites |
| B2 | Invalid formats or direct invalid export ranges accidentally produce PDFs or misleading slices | Allowlist JSON/CSV/PDF exports and JSON/CSV imports; validate range integers and ordering at selection | Recovery/export suites |
| B3 | Image import leaves intermediate files; cloud references bypass owner checks; local browser storage fails despite a cloud original | Remove only the operation's temporary image, enforce ownership before fast paths and after reads, allow authenticated cloud fallback | `imageService.test.js`; native filesystem cleanup and web fallback need runtime acceptance |
| C1 | Catalogue renames, retired IDs, unknown balances or old backups lose saved meaning | Retain immutable snapshots, strict metadata versions, manual balance labels and backward imports; no inferred prices or redemption rights | Catalogue/model/backup suites and asset hash checks |
| S1 | Concurrent saves, edits, deletion or restoration lose data or cross account boundaries | Retain transactional identity reservations, revision checks, immutable history, soft deletion and additive imports | Firestore/Storage emulator suites |
| S2 | HTML, formula-like CSV cells, invalid URLs or oversized text leave the app | Retain HTML escaping and reversible CSV protection; bound HTTPS source URLs; reject invalid models before export | Recovery, provider, model and export suites |
| P1 | Expo patch mismatches or dependency warnings undermine repeatability | Align Expo 55.0.32 and sharing 55.0.25, preserve the lockfile and existing scoped override; keep unresolved advisories visible | Expo compatibility/Doctor, audit, full tests and three platform exports |
| P2 | Missing Firebase values, signing credentials or native tooling are mistaken for a working release | Retain Android preflight and upload allowlist; distinguish JS bundling from native installation and production access | `androidBuild.test.js`, configuration-only preflight; live setup remains outstanding |
| T1 | Mock-only tests conceal service or security-rule failures | Run utility/component tests together with loopback Firestore/Storage tests; use synthetic records only | Full emulator run; no production data written |
| U1 | Native module absence, unsupported symbology, denied permission or external app absence | Retain local image/manual entry, barcode errors, permission handling and HTTPS fallback | OCR plugin, barcode, notification and provider suites; hardware acceptance below |

## Manual acceptance still required

1. Install a newly built Android APK with real Firebase configuration. Sign in,
   restart, register/edit/use/trash/restore a synthetic voucher, then verify it
   from a second device. Confirm deployed rules, Storage access and web CORS.
2. On Android and iOS, deny then grant camera/photo/notification permissions.
   Test Korean OCR on representative voucher images, scan each supported barcode
   type and verify checkout readability. OCR suggestions still require review;
   printed spaces/hyphens may be normalised in text-derived PIN candidates.
3. Check notifications with the app foregrounded, backgrounded and terminated,
   then after reboot, timezone changes and permission revocation. The forecast
   is not a delivery receipt. Test near the iOS scheduling budget.
4. Export/share JSON with originals, CSV and PDF. Cancel sharing, reopen the app,
   restore on another device and interrupt a restore halfway. Confirm account
   switching never opens another account's pending image/share operation.
5. Test browser IndexedDB with multiple tabs, blocked storage, quota exhaustion
   and cleared site data. Confirm cloud originals remain retrievable where
   configured and that local-only copies are labelled accurately.
6. Inspect narrow screens, large system fonts, keyboard navigation, screen readers,
   long titles, horizontal barcodes and the twenty-entry reminder forecast.

Local snapshots and favourites are device storage, not an independent disaster
recovery service. Server writes require connectivity. The rules enforce ownership
and archival invariants, not a complete hostile-client schema or issuer balance
verification. Large-wallet pagination, cross-device preference sync and remote
catalogue distribution remain separate product work.

## Verification record

| Check | Result |
| --- | --- |
| Complete `npm run test:integration` | **Passed: 262 tests, 35 suites, zero skipped** using loopback Firestore/Storage and a demo project |
| Web, Android and iOS `expo export --platform all` | **Passed**; native outputs are Hermes bundles, not installed applications |
| `expo install --check` | **Passed** after the SDK 55 patch alignment |
| `expo-doctor` | **Passed: 20/20** |
| `npm ls --all` | **Passed** |
| Android configuration-only preflight | **Passed** |
| Android full preflight | Missing/placeholder/malformed local Firebase values; actual project configuration is still required |
| `npm audit` | **Not clean: 5 High package entries, 0 Moderate, 0 Critical**, two originating toolchain advisories; see dependency-maintenance.md |
| `git diff --check` | **Passed** |
| Current UI browser session, native compilation, physical devices, live Firebase | **Not verified**; follow the manual acceptance cases above |

The original PATH had no Java. A checksum-verified Adoptium Java 21 JRE was
downloaded to a task-specific temporary directory and added only to the test
process environment. No system Java installation or production deployment was
performed. An initial new native-export regression had an incomplete Jest file
adapter mock; that fixture was corrected and both the focused test and full
emulator run were rerun successfully.

Logs and generated bundles are local Git-ignored artefacts; do not publish raw
CLI debug logs because third-party tools can include environment details.

## File inventory

Each project-owned file is mapped below to the relevant exception designs above.
For static artwork this is reference/hash/package coverage, not visual or licence
revalidation. Test files were reviewed for their scenarios and executed; their
mocks do not establish native-device behaviour. Existing documentation sources
are historical evidence, not freshly verified menus or production status.

| File | Exception designs | Review outcome |
| --- | --- | --- |
| `.easignore` | P2 | Existing Android work preserved |
| `.env.example` | P2 | Retained / checked |
| `.gitignore` | P2 | Retained / checked |
| `App.js` | A2, N1, U1 | Retained / checked |
| `LICENSE` | C1, P2, T1 | Retained / checked |
| `README.md` | C1, P2, T1 | Updated |
| `app.json` | P2 | Existing Android work preserved |
| `assets/adaptive-icon.png` | C1, U1 | Retained / checked |
| `assets/brands/NOTICE.md` | C1, U1 | Retained / checked |
| `assets/brands/baskin-robbins.png` | C1, U1 | Retained / checked |
| `assets/brands/compose.png` | C1, U1 | Retained / checked |
| `assets/brands/daiso.png` | C1, U1 | Retained / checked |
| `assets/brands/dunkin.png` | C1, U1 | Retained / checked |
| `assets/brands/ediya.gif` | C1, U1 | Retained / checked |
| `assets/brands/gongcha.png` | C1, U1 | Retained / checked |
| `assets/brands/hollys.gif` | C1, U1 | Retained / checked |
| `assets/brands/mammoth.png` | C1, U1 | Retained / checked |
| `assets/brands/mega.png` | C1, U1 | Retained / checked |
| `assets/brands/paik.png` | C1, U1 | Retained / checked |
| `assets/brands/paris-baguette.png` | C1, U1 | Retained / checked |
| `assets/brands/paul-bassett.png` | C1, U1 | Retained / checked |
| `assets/brands/sources.json` | C1, U1 | Retained / checked |
| `assets/brands/starbucks.png` | C1, U1 | Retained / checked |
| `assets/brands/tous-les-jours.png` | C1, U1 | Retained / checked |
| `assets/favicon.png` | C1, U1 | Retained / checked |
| `assets/icon.png` | C1, U1 | Retained / checked |
| `assets/splash-icon.png` | C1, U1 | Retained / checked |
| `docs/android-preview.md` | C1, P2, T1 | Existing Android work preserved |
| `docs/brand-catalogue-plan.md` | C1, P2, T1 | Retained / checked |
| `docs/brand-catalogue.md` | C1, P2, T1 | Retained / checked |
| `docs/catalogue-data.md` | C1, P2, T1 | Retained / checked |
| `docs/dependency-maintenance.md` | C1, P2, T1 | Updated |
| `docs/images/brand-picker.png` | C1, P2, T1 | Retained / checked |
| `docs/images/wallet.png` | C1, P2, T1 | Retained / checked |
| `docs/recovery.md` | C1, P2, T1 | Retained / checked |
| `docs/reliability-review.md` | C1, P2, T1 | Added |
| `eas.json` | P2 | Existing Android work preserved |
| `firebase.emulator.json` | P2 | Retained / checked |
| `firestore.rules` | S1, T1 | Retained / checked |
| `index.js` | P1, P2 | Retained / checked |
| `jest.config.js` | P1, T1 | Retained / checked |
| `package-lock.json` | P1, T1 | Updated |
| `package.json` | P1, T1 | Updated |
| `plugins/withKoreanOcr.js` | U1, P1 | Retained / checked |
| `scripts/check-android-build.cjs` | P2 | Existing Android work preserved |
| `src/components/BarcodeRenderer.js` | U1 | Retained / checked |
| `src/components/BrandIcon.js` | C1, U1 | Retained / checked |
| `src/components/BrandPicker.js` | C1, A2 | Retained / checked |
| `src/components/CatalogueDetails.js` | C1 | Retained / checked |
| `src/components/ConfirmationDialog.js` | A2, S1 | Retained / checked |
| `src/components/WalletUi.js` | U1 | Retained / checked |
| `src/data/brandCatalogue.js` | C1 | Retained / checked |
| `src/hooks/useCalendarClock.js` | D2, N2 | Retained / checked |
| `src/screens/auth/LoginScreen.js` | A1 | Updated |
| `src/screens/auth/RegisterScreen.js` | A1 | Updated |
| `src/screens/auth/ResetPasswordScreen.js` | A1 | Retained / checked |
| `src/screens/home/AddCouponScreen.js` | D1, D3, A2, C1 | Updated |
| `src/screens/home/CouponHistoryScreen.js` | S1, A2 | Retained / checked |
| `src/screens/home/HomeScreen.js` | W1, W2, W3, A2 | Updated |
| `src/screens/home/WalletToolsScreen.js` | N2, R1, B1, B2 | Updated |
| `src/services/authService.js` | A1 | Retained / checked |
| `src/services/backupService.js` | A2, B1, B2, S1 | Updated |
| `src/services/brandPreferences.js` | R3, C1, A2 | Updated |
| `src/services/couponNotificationSync.js` | N1, A2 | Updated |
| `src/services/firebase.js` | P2 | Retained / checked |
| `src/services/firebaseAuth.js` | A1 | Retained / checked |
| `src/services/firebaseAuth.native.js` | A1 | Retained / checked |
| `src/services/firestoreService.js` | A2, D4, S1 | Updated |
| `src/services/imageService.js` | A2, B3, R4 | Updated |
| `src/services/localDatabase.js` | R4 | Added |
| `src/services/localRecovery.js` | R1, R3 | Updated |
| `src/services/notificationService.js` | N2 | Updated |
| `src/services/ocrService.js` | U1 | Retained / checked |
| `src/services/ocrService.native.js` | U1 | Retained / checked |
| `src/services/ocrService.web.js` | U1 | Retained / checked |
| `src/services/providerLinks.js` | U1, S2 | Retained / checked |
| `src/services/recoveryStorage.js` | R1 | Retained / checked |
| `src/services/recoveryStorage.native.js` | R2 | Updated |
| `src/services/recoveryStorage.web.js` | R4 | Updated |
| `src/services/reminderSettings.js` | N2, D4 | Updated |
| `src/utils/authUtils.js` | A1 | Retained / checked |
| `src/utils/backupData.js` | B1, B2, S2 | Updated |
| `src/utils/backupRange.js` | B2 | Updated |
| `src/utils/barcodeEncoder.js` | U1 | Retained / checked |
| `src/utils/barcodes.js` | U1 | Retained / checked |
| `src/utils/brandCatalogue.js` | C1 | Retained / checked |
| `src/utils/brandPreferenceData.js` | C1 | Retained / checked |
| `src/utils/catalogueDisplay.js` | C1 | Retained / checked |
| `src/utils/catalogueForm.js` | C1 | Retained / checked |
| `src/utils/catalogueModel.js` | C1 | Retained / checked |
| `src/utils/couponModel.js` | D4, S2 | Updated |
| `src/utils/couponSearch.js` | W2 | Updated |
| `src/utils/dateUtils.js` | D2 | Updated |
| `src/utils/feedback.js` | A1, U1 | Retained / checked |
| `src/utils/inputLimits.js` | B1 | Added |
| `src/utils/reminderSchedule.js` | N2 | Added |
| `src/utils/searchText.js` | W2, C1 | Retained / checked |
| `src/utils/sourceUrl.js` | S2 | Updated |
| `src/utils/voucherParser.js` | D3 | Updated |
| `src/utils/walletOverview.js` | W1, W2 | Added |
| `storage.rules` | S1, T1 | Retained / checked |
| `tests/addCouponScreen.test.js` | T1; corresponding feature scenarios | Updated |
| `tests/androidBuild.test.js` | T1; corresponding feature scenarios | Existing Android work preserved |
| `tests/assetMock.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/auth.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/authScreens.test.js` | T1; corresponding feature scenarios | Added |
| `tests/backupService.test.js` | T1; corresponding feature scenarios | Updated |
| `tests/barcode.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/barcodeTypes.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/brandCatalogue.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/brandIcon.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/brandPreferences.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/calendar.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/catalogueBackup.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/catalogueFixtures.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/catalogueModel.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/couponNotificationSync.test.js` | T1; corresponding feature scenarios | Updated |
| `tests/date.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/firebaseAuth.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/firestore.rules.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/firestoreBoundary.test.js` | T1; corresponding feature scenarios | Added |
| `tests/firestoreService.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/homeScreen.test.js` | T1; corresponding feature scenarios | Added |
| `tests/imageService.test.js` | T1; corresponding feature scenarios | Updated |
| `tests/inputLimits.test.js` | T1; corresponding feature scenarios | Added |
| `tests/localDatabase.test.js` | T1; corresponding feature scenarios | Added |
| `tests/nativeRecoveryStorage.test.js` | T1; corresponding feature scenarios | Updated |
| `tests/notification.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/ocrPlugin.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/passwordReset.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/preferenceBackup.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/providerLinks.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/recovery.test.js` | T1; corresponding feature scenarios | Updated |
| `tests/recoveryScreens.test.js` | T1; corresponding feature scenarios | Updated |
| `tests/reminderSchedule.test.js` | T1; corresponding feature scenarios | Added |
| `tests/storage.rules.test.js` | T1; corresponding feature scenarios | Retained / checked |
| `tests/voucherParser.test.js` | T1; corresponding feature scenarios | Updated |
| `tests/walletOverview.test.js` | T1; corresponding feature scenarios | Added |
