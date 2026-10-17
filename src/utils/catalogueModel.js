import { toDay } from "./dateUtils";
import { safeSourceUrl } from "./sourceUrl";

export const CATALOGUE_METADATA_VERSION = 1;
const fail = (field) => { throw new Error(`카탈로그 정보가 올바르지 않습니다: ${field}`); };
const object = (value, fields, field) => {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !fields.includes(key))) fail(field);
};
const text = (value, field, limit = 200) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > limit) fail(field);
  return value.trim();
};
const identifier = (value, field) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 80 || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value)) fail(field);
  return value;
};
const amount = (value, field) => {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) fail(field);
  return value;
};
function snapshot(value) {
  if (value === undefined || value === null) return null;
  object(value, ["brandName", "productName", "variantName", "segmentName"], "snapshot");
  const result = Object.fromEntries(["brandName", "productName", "variantName", "segmentName"]
    .map((field) => [field, text(value[field], field)]));
  if (!result.brandName) fail("brandName");
  return result;
}
function money(value, benefitType) {
  if (value === undefined || value === null) return null;
  const amounts = ["referencePrice", "faceValue", "purchasePrice", "remainingBalance", "discountAmount"];
  object(value, [...amounts, "currency", "referenceSourceUrl", "referenceCheckedOn", "balanceMode", "discountPercent"], "money");
  if (value.currency !== "KRW") fail("currency");
  const result = { currency: "KRW", ...Object.fromEntries(amounts.map((field) => [field, amount(value[field], field)])) };
  result.referenceSourceUrl = safeSourceUrl(text(value.referenceSourceUrl, "referenceSourceUrl", 2048));
  result.referenceCheckedOn = value.referenceCheckedOn ?? null;
  if (result.referenceCheckedOn !== null && (typeof result.referenceCheckedOn !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(result.referenceCheckedOn) || toDay(result.referenceCheckedOn) !== result.referenceCheckedOn)) fail("referenceCheckedOn");
  if (result.referencePrice !== null && (!result.referenceSourceUrl || !result.referenceCheckedOn)) fail("referencePrice source");
  result.balanceMode = value.balanceMode ?? "none";
  if (!["none", "manual"].includes(result.balanceMode) ||
      (result.balanceMode === "manual" && benefitType !== "monetary") ||
      (result.remainingBalance !== null && result.balanceMode !== "manual")) fail("balanceMode");
  result.discountPercent = value.discountPercent ?? null;
  if (result.discountPercent !== null && (typeof result.discountPercent !== "number" ||
      !Number.isFinite(result.discountPercent) || result.discountPercent < 0 || result.discountPercent > 100)) fail("discountPercent");
  if ((result.discountAmount !== null || result.discountPercent !== null) && benefitType !== "discount") fail("discount benefit");
  if (result.discountAmount !== null && result.discountPercent !== null) fail("discountAmount / discountPercent");
  return result;
}

// A self-contained snapshot: resolving a live catalogue is never needed to recover it.
export function normaliseCatalogueMetadata(value) {
  if (value === undefined || value === null) return null;
  const ids = ["brandId", "productId", "variantId", "segmentId"];
  object(value, ["schemaVersion", ...ids, "catalogueVersion", "benefitType", "snapshot", "issuer", "purchaseChannel", "money"], "fields");
  if (value.schemaVersion !== CATALOGUE_METADATA_VERSION) fail("schemaVersion");
  const result = { schemaVersion: CATALOGUE_METADATA_VERSION,
    ...Object.fromEntries(ids.map((field) => [field, identifier(value[field], field)])),
    catalogueVersion: text(value.catalogueVersion, "catalogueVersion", 80) || null,
    benefitType: value.benefitType ?? null, snapshot: snapshot(value.snapshot),
    issuer: text(value.issuer, "issuer"), purchaseChannel: text(value.purchaseChannel, "purchaseChannel"),
  };
  if (result.benefitType !== null && !["product", "monetary", "discount"].includes(result.benefitType)) fail("benefitType");
  if ((result.productId || result.segmentId) && !result.brandId) fail("brandId");
  if (result.variantId && !result.productId) fail("productId");
  if (result.brandId && (!result.catalogueVersion || !result.snapshot)) fail("catalogueVersion / snapshot");
  if (result.productId && !result.snapshot.productName) fail("productName");
  if (result.variantId && !result.snapshot.variantName) fail("variantName");
  if (result.segmentId && !result.snapshot.segmentName) fail("segmentName");
  result.money = money(value.money, result.benefitType);
  return result;
}
