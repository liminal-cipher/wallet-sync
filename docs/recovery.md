# Recovery and Data Handling

## Recovery Paths

| Situation | Path | Boundary |
| --- | --- | --- |
| An unsaved form or failed save | Reopen the editor and choose the saved input draft | Per account and coupon, on that device only |
| Accidental removal | Open **보관·복원·알림 → 휴지통** and restore the coupon | Trash is not automatically purged |
| Incorrect edit or used-state change | Open **수정 이력** and restore an earlier version | Starts with changes made by this client; restoration also archives the current state |
| Missing server records | Restore missing coupons from an automatic device snapshot or a JSON/CSV file | Existing identities, including trashed coupons, are skipped |
| Interrupted restore | Choose **중단된 복원 다시 시도**, or select the same backup again | Successfully restored records remain; retries skip them |
| Lost phone or cleared app storage | Import an externally saved JSON backup with originals on another signed-in device | Device-only drafts, snapshots and originals cannot survive removal of that device's storage |
| Cloud image upload fails | Keep the local original, export JSON with originals, or edit and save to retry upload | Other devices cannot display an image that has never reached the cloud |

Automatic snapshots record confirmed server results, retain five recent distinct
states and preserve a non-empty recovery copy when appropriate. They are scoped to
the signed-in account. An unconfirmed empty Firestore cache cannot replace them.
Local snapshot exports remain available during a server outage. Native copies use
two alternating files and switch the active pointer only after a successful write;
web copies and images use IndexedDB. Storage failures are displayed to the user.

The server stores full pre-edit documents under `coupons/{id}/history/{revision}`.
The update and its original version commit together. A stale revision fails rather
than overwriting another device's changes. Security rules prevent client-side
permanent deletion or modification of archived versions. Administrators still
control the backend: these application safeguards are not an independently
managed disaster-recovery service or a substitute for externally stored backups.

## Backup Formats

New JSON exports use version 3 and can also include brand favourites and recent
choices. CSV retains its version 2 column contract. Both preserve optional
catalogue snapshots, issuer/channel details and amount records. Existing version
1 and 2 JSON and the legacy ten-column CSV header remain importable. Unknown
future formats fail visibly. Earlier clients cannot import version 3 JSON.
Use the updated client for complete exports and historical restoration of
metadata-bearing coupons; older clients omit these fields from their backups.
See [Catalogue Metadata and Backup Compatibility](catalogue-data.md) for the
schema, CSV column contract and mixed-client boundaries.

- **JSON with originals** contains current records, trash state and embedded
  JPEG/PNG/WebP originals. Export fails visibly if an original cannot be retrieved;
  it never silently labels a partial image export as complete.
- **JSON information only** contains the same coupon metadata without images.
- **CSV** contains the documented coupon fields, including original barcode text
  and symbology. Quoting preserves commas and newlines. Spreadsheet formula
  prefixes are escaped reversibly. It contains no images.
- **PDF** is for reading and printing. It includes static barcodes and event
  details, and cannot be imported as a structured backup. Browser printing opens
  the print dialogue; choose the browser's PDF destination.

Portable backups contain current records, not historical versions, unsaved drafts,
login credentials or reminder preferences. JSON includes the current account's
device favourites/recent choices by default, including when exporting an older
coupon snapshot. Disable **JSON에 브랜드 설정 포함** to export coupons independently
if settings are unreadable. CSV and PDF do not contain preferences.
Exported files contain redeemable
barcode data and are not encrypted by this application. Store them privately.
Changing accounts does not expose another account's device copies through the UI.
Local copies are retained on sign-out so signing back in can recover them.

An import is fully validated before its preview appears. It adds records to the
currently signed-in account and ignores any original account or document ID.
Duplicate barcode payload/symbology pairs and exact duplicate external events are
skipped, including duplicates within the file. Existing records are never replaced.
Trashed records stay in trash; restore them separately to make them active.

Brand settings require the explicit **브랜드 설정 함께 복원** option in the preview
and the in-app confirmation. Existing favourites are retained; imported IDs,
including retired brands, are appended without duplicates. More than 100 combined
favourites fails before coupon writes. Current recent choices take precedence,
with at most twelve entries retained. Settings-only JSON backups can be restored.
**브랜드 설정 복원 전으로 되돌리기** restores the saved pre-merge settings; the
displaced settings become the next undo copy. A failed safety-copy write prevents
the settings change.

Interrupted restores retain both coupons and preferences in their checkpoint.
If settings or final checkpoint storage fails after coupons were added, retrying
the same input skips existing coupons and merges settings idempotently. Replacing
an interrupted input retains its predecessor under **직전 복원 입력 다시 열기**.
Unknown checkpoint versions are preserved and rejected rather than overwritten.
Account changes invalidate a prepared restore; select the backup again.

Limits are 2,000 records, 50 MiB per input file, 10 MiB per original and 35 MiB of
embedded originals per JSON backup. Oversized exports fail explicitly. Use smaller
backups if these limits are exceeded: the export controls accept inclusive start
and end record numbers. Use a fixed automatic snapshot when exporting several
ranges, so concurrent server edits cannot change the ordering between files.
These limits prevent unbounded decoding and
memory consumption on mobile devices. Restore progress is saved locally before
network writes, but an OS/storage failure can still require selecting the source
file again. A retry remains safe because identity reservations are transactional.

## Originals and OCR

Image selection first copies the original into durable device storage without
cropping or recompressing it. Saving then attempts an authenticated upload under
`originals/{userId}/{imageId}`. URLs with public download tokens are not stored.
Originals are immutable, so older coupon versions can still reference their image.
Detaching or replacing an image does not delete an earlier original.

Firebase Storage must be configured with the actual bucket and the supplied
`storage.rules`. Web byte downloads require bucket CORS settings as described in
the [Firebase documentation](https://firebase.google.com/docs/storage/web/download-files#cors_configuration).
Storage availability, billing and existing production rules are external setup
requirements; the app does not change them. Cloud upload failures are labelled
as local-only and do not prevent saving coupon metadata.

Native OCR uses the bundled Korean and Latin models from
[rn-mlkit-ocr](https://github.com/ahmeterenodaci/rn-mlkit-ocr). It requires a native
development build and iOS 15.5 or later, and is unavailable in Expo Go. The local
config plugin corrects the dependency's iOS script-name casing. Browser OCR uses
[Tesseract.js](https://github.com/naptha/tesseract.js), which downloads its worker,
WASM and Korean/English models on first use. Recognition processes the selected
image locally. Download or recognition errors retain the image and allow manual
entry or pasted text. Recognised text is presented for review before applying it;
the original barcode and expiry must be checked by the user.

## Original-Provider Events

External events keep the provider, expiry, conditions and an HTTPS source page.
They do not generate or refresh personal payment credentials. The published
KakaoPay root scheme, described in the [official support forum](https://developers.kakaopay.com/forum/t/topic/1055), opens the app on supported devices and falls back to its
official website. No stable barcode-screen route is assumed. T Membership uses
its official event page; opening the exact membership barcode screen is not
implemented because a supported route has not been verified. Custom source links
accept HTTPS only. Opening an app or page never marks an event as used.

## Rollout and Verification

Publish the revised Firestore rules before releasing this client. New writes need
the account's identity-reservation documents and atomic history writes. Earlier
clients cannot make unarchived updates under the revised rules. Existing coupons
remain readable; no bulk migration is required. Publish the Storage rules and
configure CORS before relying on cross-device image recovery. Back up real data
before applying backend changes. Neither backend deployment nor real-data writes
are performed by the automated tests.

`npm test -- --runInBand` runs unit, component and service tests. With Java 21 on
`PATH`, `npm run test:integration` starts only loopback Firestore/Storage emulators
using a demo project and exercises the complete automated suite. Tests cover
duplicate submissions, stale edits, exact history retention, trash restoration,
account boundaries, dangling identity keys after server data loss, malformed
backups, interrupted imports, payload preservation and Sydney DST boundaries.

Browser interaction, native build installation, real coupon OCR accuracy,
point-of-sale scanning, print/share dialogues and OS notification delivery require
device acceptance checks. JavaScript exports and mocked component tests do not
establish those behaviours. Reminder settings are local to each device; iOS
schedules the nearest reminders within an application budget of 60, replenishing
the queue when the app returns to the foreground or records/settings change.
