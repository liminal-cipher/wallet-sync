const fs = require("fs"), path = require("path"), { createHash } = require("crypto");
const { catalogue, findBrand, searchCatalogue, catalogueSuggestions, validateBrandCatalogue } = require("../src/utils/brandCatalogue");
const { chooseCatalogue, chooseBenefit, customProduct, changeMoneyInput, prepareCatalogueForm } = require("../src/utils/catalogueForm");
const { normaliseCoupon } = require("../src/utils/couponModel");
const { filterCoupons } = require("../src/utils/dateUtils");
const { toCsv, parseBackup } = require("../src/utils/backupData");
const { catalogueDetailLines } = require("../src/utils/catalogueDisplay");
const base = () => ({ brand: "", kind: "voucher", barcodeType: "code128", barcodeNumber: "00-12 34", expiryDay: "2027-01-01", isUsed: false, image: null });

test("the offline catalogue validates all 17 separate identities and official source records", () => {
  expect(catalogue.brands).toHaveLength(17);
  expect(validateBrandCatalogue(catalogue)).toBe(catalogue);
  expect(findBrand("compose").products).toEqual([]);
  expect(searchCatalogue("매머드").filter((item) => !item.product).map((item) => item.brand.id)).toEqual(expect.arrayContaining(["mammoth-coffee", "mammoth-express"]));
  const invalid = JSON.parse(JSON.stringify(catalogue)); invalid.brands.push(invalid.brands[0]);
  expect(() => validateBrandCatalogue(invalid)).toThrow();
  const unsafe = JSON.parse(JSON.stringify(catalogue)); unsafe.brands[0].source.url = "http://example.com";
  expect(() => validateBrandCatalogue(unsafe)).toThrow();
});
test.each(["폴바셋 룽고", "폴바셋룽고", "Paul Bassett Lungo", "ㅍㅂㅅ ㄹㄱ"])("aliases and Korean initials find a product directly: %s", (query) => {
  expect(searchCatalogue(query)).toEqual(expect.arrayContaining([expect.objectContaining({ brand: expect.objectContaining({ id: "paul-bassett" }), product: expect.objectContaining({ id: "lungo" }) })]));
});
test("category and favourite scopes do not leak other catalogue identities", () => {
  expect(searchCatalogue("", { category: "retail" }).map((x) => x.brand.id)).toEqual(["daiso", "oliveyoung"]);
  expect(searchCatalogue("", { ids: ["paul-bassett"] }).map((x) => x.brand.id)).toEqual(["paul-bassett"]);
  expect(searchCatalogue("", { ids: [] })).toEqual([]);
  expect(searchCatalogue("없는브랜드")).toEqual([]);
});
test("OCR suggestions require a brand and are suggestions rather than mutations", () => {
  const form = base();
  expect(catalogueSuggestions("폴바셋 아이스 룽고 2027년")[0]).toMatchObject({ brand: { id: "paul-bassett" }, product: { id: "iced-lungo" } });
  expect(catalogueSuggestions("룽고 1234")).toEqual([]);
  expect(form).toEqual(base());
});
test("selection generates a title but never invents a variant, price, expiry or barcode", () => {
  const form = chooseCatalogue(base(), "paul-bassett", "lungo");
  expect(form).toMatchObject({ brand: "폴 바셋 · 룽고", barcodeNumber: "00-12 34", expiryDay: "2027-01-01", image: null });
  expect(form.catalogue).toMatchObject({ productId: "lungo", variantId: null, money: null });
  expect(() => chooseCatalogue(form, "paul-bassett", "lungo", "grand")).toThrow("옵션");
  const variant = chooseCatalogue(form, "paul-bassett", "iced-latte", "grand");
  expect(variant.brand).toBe("폴 바셋 · 아이스 카페라떼 · Grand");
  expect(chooseCatalogue(variant, "daiso").catalogue).toMatchObject({ productId: null, variantId: null, benefitType: "monetary" });
});
test("custom names, edited titles and original amounts survive corrections and backup round trips", () => {
  let form = chooseCatalogue(base(), "oliveyoung");
  form = changeMoneyInput(form, "faceValue", "10000");
  form = changeMoneyInput(form, "purchasePrice", "9000");
  form = changeMoneyInput(form, "remainingBalance", "0");
  expect(form.brand).toBe("올리브영 · 10,000원 금액권");
  form.brand = "My own title";
  form = changeMoneyInput(form, "faceValue", "20000");
  expect(form.brand).toBe("My own title");
  const corrected = chooseCatalogue(form, "daiso");
  expect(corrected.catalogue.money).toMatchObject({ faceValue: 20000, purchasePrice: 9000, remainingBalance: 0, referencePrice: null });
  const restored = parseBackup(toCsv([normaliseCoupon(prepareCatalogueForm(corrected))]), "csv")[0];
  expect(restored.catalogue.money.remainingBalance).toBe(0);
  expect(restored.barcodeNumber).toBe("00-12 34");
  expect(catalogueDetailLines(restored)).toContain("수동 기록 잔액 0원");
});
test("invalid input stays in the recovery form and cannot silently save the preceding valid amount", () => {
  let form = changeMoneyInput(chooseCatalogue(base(), "daiso"), "faceValue", "10000");
  form = changeMoneyInput(form, "faceValue", "10x");
  expect(form.catalogueMoneyInput.faceValue).toBe("10x");
  expect(() => prepareCatalogueForm(form)).toThrow("금액");
  expect(prepareCatalogueForm(changeMoneyInput(form, "faceValue", "")).catalogue.money.faceValue).toBeNull();
});
test("benefit changes clear incompatible entitlements while retaining the purchase price", () => {
  let form = chooseCatalogue(base(), "daiso");
  form = changeMoneyInput(changeMoneyInput(form, "faceValue", "10000"), "purchasePrice", "8000");
  form = changeMoneyInput(chooseBenefit(form, "discount"), "discountPercent", "10");
  expect(prepareCatalogueForm(form).catalogue.money).toMatchObject({ faceValue: null, remainingBalance: null, purchasePrice: 8000, discountPercent: 10 });
  expect(() => prepareCatalogueForm(changeMoneyInput(form, "discountAmount", "1000"))).toThrow();
});
test("custom products and retired IDs remain searchable using saved snapshots", () => {
  let form = chooseCatalogue(base(), "paul-bassett", "lungo");
  form = customProduct(form, "Custom combo");
  expect(form.catalogue).toMatchObject({ productId: null, variantId: null, snapshot: { productName: "Custom combo" } });
  form.catalogue.brandId = "retired-brand"; form.brand = "Personal title";
  expect(filterCoupons([form], "all", "폴바셋 Custom combo")).toHaveLength(1);
  expect(filterCoupons([{ ...form, deletedAt: "2026-10-17" }], "all", "Personal")).toHaveLength(0);
});
test("wallet search uses aliases, products and initials even when the title is customised", () => {
  const record = { ...chooseCatalogue(base(), "paul-bassett", "lungo"), brand: "Personal title" };
  for (const query of ["폴바셋룽고", "ㅍㅂㅅ ㄹㄱ", "Paul Bassett", "Personal"]) expect(filterCoupons([record], "all", query)).toHaveLength(1);
});
test("reselecting the same item keeps historical reference prices; a custom selection clears only that reference", () => {
  const form = chooseCatalogue(base(), "paul-bassett", "lungo");
  form.catalogue.money = { currency: "KRW", purchasePrice: 4000, referencePrice: 5000, referenceSourceUrl: "https://example.com/menu", referenceCheckedOn: "2026-10-17" };
  expect(chooseCatalogue(form, "paul-bassett", "lungo").catalogue.money.referencePrice).toBe(5000);
  expect(customProduct(form, "Another menu").catalogue.money).toMatchObject({ referencePrice: null, purchasePrice: 4000 });
  expect(catalogueDetailLines(form)).not.toContain(form.brand);
});
test("bundled identity assets match their official provenance hashes without modification", () => {
  const sources = require("../assets/brands/sources.json");
  expect(sources).toHaveLength(14);
  for (const item of sources) {
    expect(item.sourcePage).toMatch(/^https:\/\//); expect(item.assetUrl).toMatch(/^https:\/\//);
    expect(createHash("sha256").update(fs.readFileSync(path.join(__dirname, "..", item.file))).digest("hex")).toBe(item.sha256);
  }
});
