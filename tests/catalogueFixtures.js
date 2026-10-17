// Synthetic metadata only; no live menu, price or logo assertions.
const catalogue = (changes = {}) => ({
  schemaVersion: 1, brandId: "example-coffee", productId: "lungo", variantId: "iced",
  catalogueVersion: "test-v1", benefitType: "product",
  snapshot: { brandName: "예시 커피", productName: "룽고", variantName: "ICE" },
  issuer: 'Example, "Issuer"', purchaseChannel: "선물\n메시지",
  money: { currency: "KRW", referencePrice: 5000, referenceSourceUrl: "https://example.com/menu", referenceCheckedOn: "2026-10-17", purchasePrice: 3500 },
  ...changes,
});
module.exports = { catalogue };
