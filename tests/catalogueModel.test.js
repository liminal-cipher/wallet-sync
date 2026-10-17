const { catalogue } = require("./catalogueFixtures");
const { normaliseCatalogueMetadata } = require("../src/utils/catalogueModel");
const { normaliseCoupon, couponIdentity } = require("../src/utils/couponModel");
const coupon = (changes = {}) => ({ brand: "Original title", barcodeNumber: "00-12 34", expiryDay: "2027-01-01", ...changes });

test("legacy data keeps its display text and barcode identity without inferred metadata", () => {
  const legacy = normaliseCoupon(coupon());
  expect(legacy).toMatchObject({ brand: "Original title", barcodeNumber: "00-12 34", catalogue: null });
  expect(couponIdentity(normaliseCoupon({ ...legacy, catalogue: catalogue() }))).toBe(couponIdentity(legacy));
  const event = normaliseCoupon(coupon({ kind: "external", provider: "kakaoPay" }));
  expect(couponIdentity(normaliseCoupon({ ...event, catalogue: catalogue() }))).toBe(couponIdentity(event));
});
test("catalogue snapshots are independent copies and do not replace a custom display title", () => {
  const input = catalogue();
  const result = normaliseCoupon(coupon({ catalogue: input }));
  expect(result.brand).toBe("Original title");
  input.snapshot.productName = "Changed live name";
  input.money.referencePrice = 9999;
  expect(result.catalogue.snapshot.productName).toBe("룽고");
  expect(result.catalogue.money.referencePrice).toBe(5000);
  expect(normaliseCoupon(result)).toEqual(result);
});
test("custom and retired catalogue IDs need no live catalogue resolution", () => {
  expect(normaliseCatalogueMetadata({ schemaVersion: 1, snapshot: { brandName: "Custom" } }).brandId).toBeNull();
  expect(normaliseCatalogueMetadata(catalogue({ brandId: "retired-brand", segmentId: "express", snapshot: {
    brandName: "Old brand", productName: "Old product", variantName: "Old size", segmentName: "Express",
  } })).segmentId).toBe("express");
});
test.each([
  { schemaVersion: 2 }, { schemaVersion: "1" }, { unknownFutureField: true },
  { brandId: "Bad ID" }, { brandId: null }, { productId: null }, { catalogueVersion: null },
  { snapshot: null }, { snapshot: { brandName: "Brand" } }, { benefitType: "constructor" },
  { snapshot: { brandName: "Brand", unsupported: "would be lost" } },
  { segmentId: "express" },
])("invalid or unsupported metadata fails visibly: %j", (changes) => {
  expect(() => normaliseCatalogueMetadata(catalogue(changes))).toThrow("카탈로그");
});
test("monetary values preserve unknown and zero independently, with manual balances", () => {
  const result = normaliseCatalogueMetadata(catalogue({ benefitType: "monetary", money: {
    currency: "KRW", faceValue: 10000, purchasePrice: 0, remainingBalance: 0, balanceMode: "manual",
  } }));
  expect(result.money).toMatchObject({ referencePrice: null, faceValue: 10000, purchasePrice: 0, remainingBalance: 0, balanceMode: "manual" });
  expect(normaliseCatalogueMetadata({ ...result, money: { ...result.money, remainingBalance: null } }).money.remainingBalance).toBeNull();
});
test.each([-1, 1.5, "1000", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, false])("unsafe KRW amount is rejected: %s", (faceValue) => {
  expect(() => normaliseCatalogueMetadata(catalogue({ money: { currency: "KRW", faceValue } }))).toThrow("faceValue");
});
test.each([
  { currency: "USD" }, { currency: "KRW", extra: 10 },
  { currency: "KRW", referencePrice: 1000 },
  { currency: "KRW", referenceCheckedOn: "2027-02-29" },
  { currency: "KRW", referenceSourceUrl: "javascript:alert(1)" },
  { currency: "KRW", remainingBalance: 100 },
  { currency: "KRW", balanceMode: "issuer" },
  { currency: "KRW", discountPercent: 20 },
])("invalid money or missing provenance is rejected: %j", (money) => {
  expect(() => normaliseCatalogueMetadata(catalogue({ money }))).toThrow();
});
test("discount benefits remain separate from monetary face value", () => {
  expect(normaliseCatalogueMetadata(catalogue({ benefitType: "discount", money: { currency: "KRW", discountPercent: 10 } })).money)
    .toMatchObject({ discountPercent: 10, faceValue: null });
  for (const money of [{ currency: "KRW", discountPercent: 101 }, { currency: "KRW", discountPercent: "10" },
    { currency: "KRW", discountAmount: 1000, discountPercent: 10 }]) {
    expect(() => normaliseCatalogueMetadata(catalogue({ benefitType: "discount", money }))).toThrow();
  }
});
