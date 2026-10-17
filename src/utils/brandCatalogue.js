import data from "../data/brandCatalogue";
import { normaliseSearch, matchesSearch } from "./searchText";
import { normaliseCatalogueMetadata } from "./catalogueModel";
import { safeSourceUrl } from "./sourceUrl";
import { toDay } from "./dateUtils";

export function validateBrandCatalogue(catalogue) {
  if (catalogue?.schemaVersion !== 1 || !catalogue.version || !Array.isArray(catalogue.brands)) throw new Error("잘못된 브랜드 목록입니다.");
  const ids = new Set();
  for (const brand of catalogue.brands) {
    if (ids.has(brand.id) || !brand.name || !Array.isArray(brand.aliases) ||
        !["cafe", "retail", "bakery", "dessert"].includes(brand.category) || !["active", "retired"].includes(brand.state) ||
        !["product", "monetary", "discount"].includes(brand.defaultBenefitType) ||
        !safeSourceUrl(brand.source?.url) || toDay(brand.source?.checkedOn) !== brand.source?.checkedOn || !Array.isArray(brand.products)) throw new Error("잘못된 브랜드 정보입니다.");
    ids.add(brand.id);
    const products = new Set();
    // Validate the stable ID and snapshot contract even for a brand with no products.
    selectionMetadata(brand, null, null, brand.defaultBenefitType, catalogue.version);
    for (const product of brand.products) {
      if (products.has(product.id) || !product.name || !Array.isArray(product.aliases) || !Array.isArray(product.variants) ||
          !["active", "retired"].includes(product.state)) throw new Error("잘못된 상품 정보입니다.");
      products.add(product.id); selectionMetadata(brand, product, null, "product", catalogue.version);
      const variants = new Set();
      for (const variant of product.variants) {
        if (variants.has(variant.id) || !variant.name) throw new Error("잘못된 옵션 정보입니다.");
        variants.add(variant.id); selectionMetadata(brand, product, variant, "product", catalogue.version);
      }
    }
  }
  return catalogue;
}
export function selectionMetadata(brand, product = null, variant = null, benefitType = "product", version = data.version) {
  return normaliseCatalogueMetadata({ schemaVersion: 1, catalogueVersion: version, brandId: brand.id,
    productId: product?.id || null, variantId: variant?.id || null, segmentId: brand.segmentId || null,
    benefitType, snapshot: { brandName: brand.name, productName: product?.name || "", variantName: variant?.name || "", segmentName: brand.segmentName || "" } });
}
export const catalogue = validateBrandCatalogue(data);
export const findBrand = (id) => catalogue.brands.find((brand) => brand.id === id) || null;
export const brandSearchText = (brand) => [brand.name, ...brand.aliases].join(" ");
export function searchCatalogue(query = "", { category = "all", ids = null } = {}) {
  const results = [];
  for (const brand of catalogue.brands) {
    if (brand.state !== "active" || (category !== "all" && brand.category !== category) || (ids && !ids.includes(brand.id))) continue;
    const text = brandSearchText(brand);
    if (matchesSearch(text, query)) results.push({ brand, product: null });
    if (query.trim()) for (const product of brand.products) {
      const combinations = [brand.name, ...brand.aliases].flatMap((name) => [product.name, ...product.aliases].map((p) => `${name} ${p}`));
      if (product.state === "active" && matchesSearch(combinations.join(" "), query)) results.push({ brand, product });
    }
  }
  return results;
}
export function catalogueSuggestions(text) {
  const compact = normaliseSearch(text);
  return catalogue.brands.filter((brand) => brand.state === "active" && [brand.name, ...brand.aliases]
    .some((alias) => normaliseSearch(alias).length >= 2 && compact.includes(normaliseSearch(alias))))
    .flatMap((brand) => {
      const products = brand.products.filter((product) => product.state === "active" && [product.name, ...product.aliases]
        .some((alias) => normaliseSearch(alias).length >= 2 && compact.includes(normaliseSearch(alias))));
      return products.length ? products.sort((a, b) => b.name.length - a.name.length).map((product) => ({ brand, product })) : [{ brand, product: null }];
    }).slice(0, 6);
}
