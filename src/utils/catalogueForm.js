import { findBrand, selectionMetadata } from "./brandCatalogue";
import { normaliseCatalogueMetadata } from "./catalogueModel";

export const BENEFITS = [["product", "메뉴 교환권"], ["monetary", "금액권"], ["discount", "할인·이벤트"]];
export const MONEY_FIELDS = ["faceValue", "purchasePrice", "remainingBalance", "discountAmount", "discountPercent"];
export function catalogueTitle(metadata) {
  if (!metadata?.snapshot) return "";
  const { brandName, productName, variantName } = metadata.snapshot;
  const money = metadata.money;
  let benefit = productName;
  if (metadata.benefitType === "monetary") benefit = `${money?.faceValue == null ? "" : `${money.faceValue.toLocaleString("ko-KR")}원 `}금액권`;
  if (metadata.benefitType === "discount") benefit = money?.discountPercent != null ? `${money.discountPercent}% 할인` : money?.discountAmount != null ? `${money.discountAmount.toLocaleString("ko-KR")}원 할인` : "할인·이벤트";
  return [brandName, benefit, variantName].filter(Boolean).join(" · ");
}
function replaceSelection(form, metadata) {
  // Issuer and purchase price belong to the user's voucher, not to the live menu.
  if (form.catalogue) {
    metadata.issuer = form.catalogue.issuer;
    metadata.purchaseChannel = form.catalogue.purchaseChannel;
    const previous = form.catalogue.money;
    const unchanged = ["brandId", "productId", "variantId", "segmentId", "benefitType"].every((field) => form.catalogue[field] === metadata[field]);
    if (previous) metadata.money = { currency: "KRW", purchasePrice: previous.purchasePrice,
      ...(unchanged ? { referencePrice: previous.referencePrice, referenceSourceUrl: previous.referenceSourceUrl, referenceCheckedOn: previous.referenceCheckedOn } : {}),
      ...(form.catalogue.benefitType === metadata.benefitType ? {
        faceValue: previous.faceValue, remainingBalance: previous.remainingBalance, balanceMode: previous.balanceMode,
        discountAmount: previous.discountAmount, discountPercent: previous.discountPercent,
      } : {}) };
  }
  const catalogue = normaliseCatalogueMetadata(metadata);
  return { ...form, catalogue, brand: catalogueTitle(catalogue), catalogueMoneyInput: null };
}
export function chooseCatalogue(form, brandId, productId = null, variantId = null, benefitType = null) {
  const brand = findBrand(brandId);
  if (!brand || brand.state !== "active") throw new Error("브랜드를 다시 선택해 주세요.");
  const product = productId ? brand.products.find((p) => p.id === productId && p.state === "active") : null;
  const variant = variantId ? product?.variants.find((v) => v.id === variantId) : null;
  if ((productId && !product) || (variantId && !variant)) throw new Error("메뉴·옵션을 다시 선택해 주세요.");
  const type = product ? "product" : benefitType || brand.defaultBenefitType;
  return replaceSelection(form, selectionMetadata(brand, product, variant, type));
}
export function chooseBenefit(form, benefitType) {
  if (!form.catalogue) return form;
  const metadata = { ...form.catalogue, productId: null, variantId: null, benefitType,
    snapshot: { ...form.catalogue.snapshot, productName: "", variantName: "" } };
  return replaceSelection(form, metadata);
}
export function customProduct(form, value, variant = false) {
  const metadata = normaliseCatalogueMetadata({ ...form.catalogue,
    ...(variant ? { variantId: null } : { productId: null, variantId: null }),
    snapshot: { ...form.catalogue.snapshot, ...(variant ? { variantName: value } : { productName: value, variantName: "" }) },
    money: form.catalogue.money ? { ...form.catalogue.money, referencePrice: null, referenceSourceUrl: "", referenceCheckedOn: null } : null });
  const auto = !form.brand || form.brand === catalogueTitle(form.catalogue);
  return { ...form, catalogue: metadata, brand: auto ? catalogueTitle(metadata) : form.brand };
}
export function moneyInput(form, field) {
  if (form.catalogueMoneyInput && Object.prototype.hasOwnProperty.call(form.catalogueMoneyInput, field)) return form.catalogueMoneyInput[field];
  return String(form.catalogue?.money?.[field] ?? "");
}
export function prepareCatalogueForm(form) {
  if (!form.catalogue) return form;
  const old = form.catalogue;
  const money = { currency: "KRW", ...old.money };
  for (const field of MONEY_FIELDS) {
    const raw = moneyInput(form, field).trim();
    if (raw && !(field === "discountPercent" ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/).test(raw)) throw new Error("금액은 원 단위 정수, 할인율은 소수 둘째 자리까지 입력해 주세요.");
    money[field] = raw === "" ? null : Number(raw);
  }
  money.balanceMode = old.benefitType === "monetary" ? "manual" : "none";
  const catalogue = normaliseCatalogueMetadata({ ...old, money });
  return { ...form, catalogue, brand: !form.brand || form.brand === catalogueTitle(old) ? catalogueTitle(catalogue) : form.brand };
}
export function changeMoneyInput(form, field, value) {
  const next = { ...form, catalogueMoneyInput: { ...form.catalogueMoneyInput, [field]: value } };
  try { return prepareCatalogueForm(next); } catch { return next; }
}
