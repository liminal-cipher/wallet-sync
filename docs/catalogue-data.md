# Catalogue Metadata and Backup Compatibility

The data foundation supports catalogue selections without requiring a live
catalogue. The [brand picker](brand-catalogue.md) now uses these records for
offline brand/menu selection, search and favourites. Remote catalogue updates
remain separate work.

## Saved Records

`brand` remains the editable display title. Existing coupons are not parsed,
renamed or migrated automatically. The optional `catalogue` object defaults to
`null`; it records the original selection separately from that title. An ordinary
title edit never changes a catalogue snapshot or the other way around.

| Field inside `catalogue` | Contract |
| --- | --- |
| `schemaVersion` | Integer `1`; required when the object is present |
| `brandId`, `productId`, `variantId`, `segmentId` | Stable IDs or `null`; up to 80 lowercase ASCII letters, digits and separated `.`, `_` or `-` characters |
| `catalogueVersion` | Non-empty source catalogue version when an ID is supplied; up to 80 characters |
| `benefitType` | `product`, `monetary`, `discount` or `null`; independent of the `voucher`/`external` redemption route |
| `snapshot` | Saved `brandName`, `productName`, `variantName` and `segmentName`; each up to 200 characters; optional names default to empty strings |
| `issuer`, `purchaseChannel` | Optional text, up to 200 characters; separate from the redeeming brand and external-app provider |
| `money` | Optional amount record described below |

A product or segment ID requires a brand ID; a variant ID requires a product
ID. Every referenced ID needs its corresponding saved name. A custom selection
may have a snapshot without catalogue IDs. IDs are not resolved during saving
or recovery, so retired products and unavailable catalogues remain recoverable.
The catalogue publisher must keep IDs stable and must not reuse retired IDs.

Schema versions and unknown keys are rejected rather than discarded, including
inside snapshots and amount records. Additive schema changes therefore require
an explicit reader update. These validators establish the saved-record contract;
they do not validate a public brand/menu catalogue or publish menu entries.

## Amount Records

`money.currency` must be `KRW`. `referencePrice`, `faceValue`, `purchasePrice`,
`remainingBalance` and `discountAmount` are optional non-negative safe integers
in won. Missing values become `null`; zero is retained as zero. Numeric strings,
fractions, non-finite numbers and unsafe integers are rejected without coercion.

A known `referencePrice` requires an HTTPS `referenceSourceUrl` and a valid
`referenceCheckedOn` calendar date in `YYYY-MM-DD` form. These record provenance,
not a guarantee that the price is current. A price update never changes a saved
face value, purchase price or balance.

`balanceMode` is `none` by default. A balance can only be stored with
`balanceMode: "manual"` and `benefitType: "monetary"`. An unknown manual balance
is allowed. Manual amounts are not issuer-verified. Balances may exceed the
initial face value, for example after an external top-up; no top-up or automatic
balance synchronisation feature is implemented here.

Discount benefits may record either `discountAmount` or a finite numeric
`discountPercent` between 0 and 100. Both cannot be supplied together. Their
qualifying conditions continue to use the coupon's `conditions` text.

## Portable Formats

| Format | Read | Write | Catalogue handling |
| --- | --- | --- | --- |
| JSON v1 | Supported | No | Older files import with `catalogue: null`; no catalogue match is inferred |
| JSON v2 | Supported | No | Preserves the validated metadata object, including unknown amounts |
| JSON v3 | Supported | Default | Retains coupon metadata and optional device brand preferences; preference restoration requires consent |
| Legacy CSV | Supported | No | Exact original ten-column header remains accepted |
| CSV v2 | Supported | Default | Original columns followed by a `catalogue` column containing a JSON object or JSON `null` |
| Future JSON, CSV headers or metadata schemas | Rejected | No | A newer reader is required; fields are never silently stripped |

The CSV v2 header is:

```text
kind,brand,barcodeType,barcodeNumber,expiryDay,isUsed,provider,conditions,sourceUrl,deletedAt,catalogue
```

The metadata column uses the same CSV quoting and reversible spreadsheet formula
protection as the other columns. JSON inside the column preserves nested text,
commas, quotes and newlines without flattening or locale-dependent number parsing.
Keep the JSON `null` literal for records without metadata; an empty or malformed
metadata cell fails validation. Renaming or adding columns also fails visibly.

JSON with originals still embeds the original image. CSV contains no images.
PDF includes the title, barcode, dates, conditions and saved catalogue details,
including explicitly labelled manual balances. It is not a structured backup.
Neither format introduces menu-derived barcode or expiry defaults.

Export validates records before JSON serialisation can convert non-finite
amounts into `null`, then validates the final portable file. Import validates the
whole file before its preview; restoration validates it again before saving a
checkpoint or writing any server record. Existing file, record and image limits
remain in force. Local image references are validated for snapshot/checkpoint
recovery; portable imports retain the embedded original instead of trusting
another device's local image reference.

## Editing and Recovery

Firestore writes use the same metadata validation as backups. Ordinary partial
edits preserve the stored object. Full pre-edit documents, including metadata
and manual balances, are archived atomically. Revision conflicts fail without
overwriting another device's changes. Trash and untrash operations preserve
metadata and originals.

Restoring a historical version restores its metadata snapshot. Restoring a
version from before this feature explicitly clears later metadata to `null`,
while archiving that later state for recovery. Drafts, device snapshots and
interrupted-restore checkpoints retain the full object. Offline snapshot exports
remain available without a server query.

Voucher duplicate identity remains the raw barcode payload and symbology. A
catalogue rename, changed price, different selection or changed display title
does not create another voucher. External events retain their existing identity
contract based on provider, display text, expiry, conditions and source URL;
metadata alone does not change it. Imports remain additive and skip existing
identities, including trash; they do not enrich or overwrite existing coupons.

## Mixed Client Versions

The preceding client can still read and display `brand`. Its partial Firestore
updates leave an unknown `catalogue` field untouched, so ordinary title and usage
edits preserve that object. The editable title remains authoritative for display;
the snapshot continues to describe the original selection.

Older clients cannot read v2 portable backups. They also omit catalogue metadata
from their v1 exports and cannot reliably restore it from history. Use this
updated client for complete exports and historical restoration of metadata-bearing
records. Import compatibility is backwards only; it cannot upgrade older client
binaries. No forced client-version gate or backend deployment is part of this
change. No bulk migration of existing server records is needed.

Automated tests cover v1/v2 imports, v3 JSON and v2 CSV round trips, malformed/future
metadata, exact barcode preservation, original images, device snapshots,
interrupted restores, ordinary editor drafts, Firestore history and stale edits.
No real coupon, live price or production record is needed for these tests.
