# Brand Selection, Search and Favourites

The bundled catalogue contains 17 separate merchant entries and 57 selected
products, reviewed on 17 October 2026. It works offline without registration-time
catalogue requests. These are descriptive menu entries, not an inventory of
issued or currently purchasable vouchers.

## Registration

Choose a brand or search for a brand and product together, such as `폴바셋 룽고`.
Whitespace, common aliases, English names and Korean initial consonants are
supported. Search can jump directly to a product. Choose a product, monetary
voucher or discount benefit independently of the static-voucher/external-app route.

Products generate an editable title. Verified size choices are optional;
`표기 없음` leaves the variant unknown. Extra size, quantity or set details can
be entered as printed on the voucher. Selecting another merchant clears
incompatible product and variant references. Mammoth Coffee and Mammoth Express
have separate entries, IDs and menus. A common alias does not imply
interchangeable redemption.

Retail entries default to monetary vouchers without requiring a product. Amount
shortcuts are typing aids, not claims about available denominations. Face value,
purchase price and manually recorded balance remain separate. A blank amount is
unknown; zero remains zero. Discount amount and percentage are mutually exclusive.
Invalid input remains in the device draft and blocks saving until corrected;
it cannot silently save the preceding valid amount instead.

The catalogue does not fill barcode payloads, expiry dates or live prices. The
current seeds contain no prices. An imported reference price retains its dated
source; a different/custom selection clears that reference without discarding
the purchase price. Ordinary title edits do not rewrite the saved selection.

Missing products can be entered within a brand. `브랜드·상품명 직접 입력` retains
manual registration for unknown merchants. Retired or unresolved catalogue IDs
display their saved snapshots and remain editable and recoverable. OCR or pasted
text can propose matches for explicit selection; recognition does not silently
replace an existing catalogue choice. Check the original barcode and expiry.

## Favourites and Recent Choices

Stars save favourites immediately. Recent choices are recorded only after a
successful coupon save, deduplicated and limited to twelve entries. Updates are
serialised per account. Storage errors are visible and do not replace unreadable
copies. Failure to remember an already saved coupon's brand is reported separately
from saving the coupon and must not trigger a duplicate submission.

Preferences use the existing durable device store and are scoped to the signed-in
account. Account changes remount the navigation tree and picker. Preferences
survive reopening on that device and can be included in JSON v3 portable backups.
They are not cloud-synchronised. Removing device storage requires an externally
saved JSON backup to recover them. Importing preferences is an explicit,
additive choice; see [Recovery and Data Handling](recovery.md).

## Sources and Maintenance

Source URLs, review dates, stable IDs and aliases live in the reviewed
[`src/data/brandCatalogue.js`](../src/data/brandCatalogue.js). Coverage includes the
eight requested brands, the separate Mammoth Express segment, and Ediya, Paik's
Coffee, Coffee Bean, Gong Cha, Baskin Robbins, Paris Baguette, Tous Les Jours and
Dunkin. Compose currently has brand selection and custom entry only because its
current menu endpoint could not be verified. Ediya has one verified coffee seed.

The [Paul Bassett iced latte details](https://www.baristapaulbassett.co.kr/menu/View.pb?cid1=A&cid2=C&dpid=PB170157)
support its Standard/Grand choices. The [Starbucks rewards guide](https://www.starbucks.co.kr/msr/msreward/level_benefit.do)
names the four seeded coffee choices and Tall size. The [Dunkin classic menu](https://www.dunkindonuts.co.kr/menu?cat=1&sub=37)
provides six classic doughnuts. Other product names use each entry's recorded
official menu source; availability takes precedence over a target menu count.
Review seasonal entries and variants before subsequent releases. Never reuse a
retired ID or substitute a menu price for a user's voucher value.

Fourteen unchanged official-site identity images are bundled. The two Mammoth
entries share an icon. Olive Young and Coffee Bean use neutral text tiles.
Image errors also fall back to text. Provenance URLs, dates and SHA-256 hashes
are in [`assets/brands/sources.json`](../assets/brands/sources.json); the
[asset notice](../assets/brands/NOTICE.md) records ownership and usage boundaries.
These images are separate from the source-code licence and do not imply merchant
endorsement, payment integration or verified issuer balances.

## Recovery and Verification

The picker uses the existing versioned metadata contract. JSON v3 and CSV v2
exports, v1/v2 imports, immutable history, drafts and device snapshots preserve selections.
Wallet search checks the editable title, saved names, current aliases and
amount/issuer text. Wallet cards, history and printable output show saved details,
with manual balances labelled explicitly.

Tests cover catalogue validation, aliases/initial consonants, account boundaries,
preference update races, invalid amount drafts, explicit OCR suggestions, titles,
variant clearing, exact barcode preservation, asset hashes and image fallbacks.
Firestore/Storage emulator tests exercise save/history/recovery boundaries.
Browser checks use only local emulators and synthetic `DEMO-` barcode data.

Native installation, physical scanners and OS-specific image decoding require
device acceptance checks. Recovery now uses in-app confirmation dialogues with
component tests for consent, cancellation and historical restoration. Current
Windows browser automation could not run because its URL-policy enforcement was
unsupported; actual browser verification of these new dialogues remains outstanding.
