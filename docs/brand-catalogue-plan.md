# Brand and voucher catalogue plan

Research date: 17 October 2026 (Asia/Seoul).
Status: the [saved-record and backup foundation](catalogue-data.md) and
[brand picker, search, favourites and expanded catalogue](brand-catalogue.md)
are implemented. The design rationale and initial research below are retained;
the implementation guide records the shipped scope and sources.

## Recommended experience

Use a searchable brand picker followed by product or monetary-voucher selection
inside the existing registration form. Keep image recognition, scanning and
custom entry available as alternative starting points.

1. Show recent and favourite brands first, with a compact logo and name grid.
   Put categories and alphabetical browsing below the search field. Do not
   describe a curated order as a measured popularity ranking.
2. Selecting a brand reveals `메뉴 교환권`, `금액권` and, where relevant,
   `할인·이벤트`. Select a sensible default for each brand without hiding the
   other supported types. Product selection is optional for a monetary voucher.
3. Show a short list of enduring products, then searchable additional products.
   Offer `직접 입력` within every brand and `브랜드 직접 입력` globally.
4. For a product, select only the temperature, size, quantity and other variants
   stated on the original voucher. Include `표기 없음`; do not invent a size or
   imply that recording a different variant changes redemption rights.
5. For a monetary voucher, select a verified denomination or enter its value.
   Unverified denominations must not appear as officially available products.
6. Generate an editable title, such as `폴 바셋 · 아이스 룽고` or
   `올리브영 · 30,000원 금액권` (illustrative value). The user supplies or confirms
   the actual barcode, expiry and conditions before saving.

Search should also accept `폴바셋 룽고` and jump directly to a matching product,
skipping brand selection. Normalise whitespace and case, and index canonical
names, aliases and product names together. Add Korean initial-consonant search
after the basic matching flow is reliable. Recent selections and favourites
should be scoped to the signed-in user on the device and cleared on account
changes; they do not require remote catalogue queries.

Image recognition should suggest catalogue matches for review. Preserve the
original recognised text and image; never silently replace an uncertain match.
Selecting a product fills descriptive metadata, not a redeemable coupon. Do not
derive barcode formats, expiry dates or redemption conditions from a brand.

## Voucher types and money

Keep benefit type separate from the existing redemption route (`voucher` or
`external`). Product, monetary and discount benefits may require different
redemption routes depending on the actual instrument. Dynamic membership and
payment credentials continue to open the relevant external app or official
page; they must not be generated from catalogue metadata.

| Value | Meaning | Initial behaviour |
| --- | --- | --- |
| Reference price | A published product price for a specific variant and channel | Optional; show its source and verification date |
| Face value | The value printed on the user's monetary voucher | Confirm from the original; never infer from a menu price |
| Purchase price | What the user paid | Optional; do not require it to register |
| Remaining balance | The user's recorded unspent amount | Only for instruments supporting a balance; label manual updates |

Store KRW amounts as non-negative integers, with `null` for unknown values.
Distinguish an unknown balance from zero. Balance adjustments need revision
history and concurrency checks; do not present them as issuer-synchronised.
Discount vouchers need their amount or percentage and qualifying conditions,
rather than a fictitious face value. Initial amount shortcuts can remember the
user's own values without claiming those values are official denominations.

## First catalogue: the eight requested brands

The following is a source survey and proposed seed scope, not a complete menu,
sales ranking, voucher inventory or permission grant. A menu listing establishes
that a product is described by the brand, not that a transferable voucher for
it is available. Public menu prices were not verified comprehensively.

| Brand | Proposed seed entries or flow | Official source and inspection result |
| --- | --- | --- |
| 스타벅스 | 카페 아메리카노, 카페 라떼; record the voucher's own variants | [Drink menu](https://www.starbucks.co.kr/menu/drink_list.do), [Americano](https://www.starbucks.co.kr/coffee/americano.do) and [Latte](https://www.starbucks.co.kr/coffee/latte.do) pages retrieved; the general list has dynamically loaded content |
| 컴포즈커피 | Proposed 아메리카노 and 카페라떼 seeds; verify exact names and variants before publishing | [Official menu](https://composecoffee.com/menu) returned HTTP 403; search results exposed older official menu pages, but their underlying content could not be retrieved, so current products and prices remain unverified |
| 메가MGC커피 | 아메리카노, 메가리카노 | [Official coffee list](https://www.mega-mgccoffee.com/menu/menu.php?category=1&menu_category1=1&menu_category2=1&page=1) retrieved, including both names; [official BI](https://www.mega-mgccoffee.com/about/bi/) retrieved |
| 다이소 | Monetary-voucher entry first; custom product fallback | [Official site](https://www.daiso.co.kr/), [BI](https://www.daiso.co.kr/company/bi) and [FAQ](https://www.daiso.co.kr/cs/faq?cid=21) retrieved; specific mobile-voucher denominations, balance behaviour and redemption channels were not established |
| 올리브영 | Monetary voucher or gift card, with issuer and channel conditions from the original | [Official gift-card guide](https://www.oliveyoung.co.kr/store/giftCardGuide/getGiftCardGuide.do) retrieved; it describes balance handling, online/offline use with exclusions, and differences by sales or supply channel. Do not apply these terms to every third-party voucher |
| 폴 바셋 | 룽고, 아이스 룽고, 카페라떼, 아이스 카페라떼 | [Coffee list](https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=A) and [iced latte details](https://www.baristapaulbassett.co.kr/menu/View.pb?cid1=A&cid2=C&dpid=PB170157) retrieved; variants must be verified for each product rather than copied across the menu |
| 할리스 | 바닐라 딜라이트, 카푸치노, 콜드브루 | [Official coffee menu](https://www.hollys.co.kr/menu/espresso.do) retrieved; [Hollyscon shop](https://www.hollys.co.kr/mall/product.do) also exposes some actual listed prices, which are channel-specific reference information |
| 매머드커피 / 매머드 익스프레스 | Shared family search; separate catalogue segments where menus or redemption scope differ | [Official site](https://www.mmthcoffee.com/) retrieved and explicitly separates the two menu labels; visible products include 시그니처 라떼 and 매머드 커피. The exact segment assignment, variants and voucher compatibility still need verification |

Use aliases such as `메가커피`, `메가 커피`, `폴바셋`, `폴 바셋`, `할리스커피`,
`할리스 커피` and `매머드` for discovery. An ambiguous family alias must not
silently choose a redemption segment. Do not treat the two Mammoth segments as
mutually redeemable without checking the original instrument.

Start with about 5–10 verified enduring products per cafe and the retail
monetary-voucher flow, rather than every seasonal product. Availability of
verified source material takes precedence over reaching a numerical target.

## Expansion candidates

These are editorial support priorities, not measured market-share rankings.
Product and voucher verification is required before each seed is shipped.

| Candidate | Retrieved official evidence | Proposed catalogue emphasis |
| --- | --- | --- |
| 이디야커피 | [Drinks](https://www.ediya.com/contents/drink.html), including 카페 아메리카노 | Coffee and selected enduring drinks |
| 빽다방 | [Coffee](https://paikdabang.com/menu/menu_coffee/), including 원조커피 and 아이스티샷추가(아샷추) | Coffee, signature drinks and explicit variants |
| 커피빈 | [Espresso drinks](https://www.coffeebeankorea.com/menu/list.asp?category=13), including 커피빈카노 and 커피빈라떼 | Product vouchers and a separately verified gift-card flow |
| 배스킨라빈스 | [Menu](https://www.baskinrobbins.co.kr/menu/list.php?category=A), including 엄마는 외계인 and 민트 초콜릿 칩 | Voucher packaging or serving type first; flavours only when specified |
| 파리바게뜨 | [Products](https://www.paris.co.kr/products/), including bread, cake and gift categories | Monetary vouchers and a limited product selection |
| 뚜레쥬르 | [Official homepage](https://www.tlj.co.kr/index.asp) retrieved | Monetary vouchers and verified cakes or sets |
| 던킨 | [Official homepage](https://www.dunkindonuts.co.kr/) retrieved | Verified doughnut, drink and set entries |
| 공차 | [Brand page](https://www.gong-cha.co.kr/brand) retrieved, including drink names such as 브라운슈가 시그니처 우롱 밀크티 + 펄; individual product details and voucher scope not yet verified | Drinks and voucher-specific size or topping variants |

Further candidates are 투썸플레이스, CU and GS25. The attempted Twosome and CU
pages were inaccessible through the research tool. GS25 redirected to
`https://www.gsretail.com/brand/gs25`, but no substantive page content was
retrieved. Their current menus, terms and assets are not verified by this survey.
Convenience-store support should distinguish product exchange vouchers from
monetary vouchers; postpone exhaustive stock-keeping-unit catalogues.

## Official icons and source records

Prefer official BI assets where available, then a verified official brand asset
with a documented basis for the intended use. Mega's BI page explicitly asks
that the logo's proportions and form be retained. Daiso has a retail BI page
separate from its corporate CI; use the retail identity in a consumer picker.

For every asset, record the official page URL, asset URL, retrieval date, file
hash, identity variant and applicable usage terms or authorisation evidence.
An official website hosting an image does not, by itself, establish permission
to redistribute it. The survey did not establish a blanket redistribution
licence. The shipped identity assets retain their original form, provenance and
ownership notice and are separate from the source-code licence. Do not recreate
logos or substitute third-party images labelled as official. Preserve aspect
ratios using `contain` inside a consistent tile.

When an asset's intended use is established, bundle an optimised local copy so
the picker works offline and does not depend on third-party hotlinks. Until
then, a text label and neutral initial tile keep the flow usable. Product
photographs are optional later work; they are not needed for the first release.

## Catalogue and saved-record structure

Bundle a small, reviewed catalogue with the application initially. This avoids
registration-time network dependencies and a new Firebase read for every
selection. Each entry needs stable IDs, canonical Korean names, aliases,
category, product-specific variants, active/retired status, official source URLs
and a verification date. Keep catalogue data separate from screens and from
private user voucher records. Do not put coupon images or barcodes in public
catalogue data.

Saved vouchers now carry optional `brandId`, `productId`, `variantId`,
`catalogueVersion`, `benefitType`, a name-and-variant snapshot, and the relevant
money fields inside the versioned `catalogue` object. Record a segment ID when a
brand family requires it. Keep issuer
or purchase channel separate from the redeeming brand and the existing external
provider (`tMembership`, `kakaoPay`, `other`). Unknown/custom entries need names
without fabricated catalogue IDs.

Preserve the existing `brand` field as compatible display text while older
records and clients exist. Do not change its meaning to an ID or rewrite
existing text in bulk. Older records can remain fully custom until the user
confirms a catalogue match. Catalogue changes or retired products must not
change existing names, values, barcodes or expiry dates. Render the saved
snapshot when an ID cannot be resolved; keep a neutral icon fallback.

Later, add a versioned remote catalogue only when update frequency warrants it.
Validate a complete candidate before replacing the last known good catalogue,
retain a rollback copy, and fall back to bundled data. Review source changes
before publication rather than scraping every site at application start.
Proposed maintenance: monthly review of active seeds and prices, plus targeted
review after announced changes; stale reference prices become unknown instead
of being presented as current. Retire entries without reusing their IDs.

## Integration and recovery requirements

The form stores combined names in `brand`. The data foundation now preserves
optional versioned catalogue metadata separately, exports JSON v3 and CSV v2 and
imports JSON v1/v2 and the original CSV format. See the linked contract for implemented
validation and mixed-client boundaries. Adding future picker fields requires
using this contract throughout saving and recovery.

Model validation, Firestore save/edit and immutable history, existing editor
drafts, local snapshots and JSON/CSV export/import now preserve the metadata.
Search, card presentation and printable catalogue details now use saved
metadata. The new backup formats import existing version 1 JSON
and the old CSV header and reject unsupported future versions visibly. Raw
barcodes, original images, usage state and expiry dates remain independent of
catalogue selections.

Keep voucher duplicate identity based on the existing raw barcode and symbology,
not on product IDs, so a renamed product does not create another voucher.
External-event identity requires deliberate compatibility handling because it
currently includes the display text. Ordinary catalogue matching must not
rewrite existing event identities. Include optional metadata in history and
balance adjustments, and preserve revision-conflict protection.

Test mixed client versions before rollout. An older client can change legacy
display text without understanding the new snapshot, or export a backup that
omits new metadata. Define which field wins and provide an explicit compatibility
or minimum-version policy before relying on the new fields for recovery.

## Delivery order and acceptance checks

1. The saved-record model and backwards-compatible recovery formats are
   implemented. The bundled public catalogue, aliases and asset provenance are
   validated before use.
2. Brand, product or amount selection, generated titles, custom entry and OCR
   suggestions are implemented. Wallet cards and history show saved metadata.
3. Recent choices, favourites and broader search are implemented, covering 17
   separate merchant entries and 61 selected products.
4. Add reviewed seasonal entries, richer sets and remote updates only when
   their maintenance cost is justified. Custom names cover uncommon sets early.

Before release, verify that a Paul Bassett product can be registered without
typing a coupon title; a retail voucher can be registered without a product;
unknown brands and retired products remain usable; offline selection and logo
failure work; ambiguous OCR requires review; selecting another brand clears
incompatible product selections; and temperature or size is never invented.
Test old backups, new JSON/CSV round trips, history, drafts, snapshots and
conflicting edits, including exact barcode preservation and an unknown balance.
Confirm that catalogue updates never change existing voucher snapshots, money
or expiry, and that manual balance changes are not shown as issuer verification.
