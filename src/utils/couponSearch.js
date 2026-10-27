const { brands } = require("../data/brandCatalogue");
const { matchesSearch } = require("./searchText");
const couponMatchesSearch = (record, query) => {
  const c = record.catalogue, s = c?.snapshot;
  const current = brands.find((brand) => brand.id === c?.brandId);
  const names = [s?.brandName, current?.name, ...(current?.aliases || [])].filter(Boolean);
  const product = current?.products.find((item) => item.id === c?.productId);
  const products = [s?.productName, ...(product?.aliases || [])].filter(Boolean);
  const combinations = names.flatMap((name) => products.map((p) => `${name} ${p} ${s?.variantName || ""}`));
  return matchesSearch([record.brand, record.barcodeNumber, record.conditions, ...names, ...products, ...combinations, s?.variantName, s?.segmentName,
    c?.issuer, c?.purchaseChannel, c?.money?.faceValue].filter((v) => v != null).join(" "), query);
};
module.exports = { couponMatchesSearch };
