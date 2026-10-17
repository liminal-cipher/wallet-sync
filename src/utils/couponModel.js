import { toDay } from "./dateUtils";
import { normaliseCatalogueMetadata } from "./catalogueModel";
import { safeSourceUrl } from "./sourceUrl";
export { safeSourceUrl } from "./sourceUrl";

export const BARCODE_TYPES = ["code128", "code39", "ean13", "ean8", "qr", "upc_a", "upc_e"];
export const PROVIDERS = {
  tMembership: { label: "T 멤버십", url: "https://sktmembership.tworld.co.kr/mps/pc-bff/program/tday.do?hl=ko-KR" },
  kakaoPay: { label: "카카오페이", url: "https://www.kakaopay.com/" },
  other: { label: "기타", url: "" },
};
export function normaliseCoupon(input) {
  const kind = input.kind || "voucher";
  if (!["voucher", "external"].includes(kind)) throw new Error("지원하지 않는 쿠폰 종류입니다.");
  const brand = typeof input.brand === "string" ? input.brand.trim() : "";
  if (!brand || brand.length > 200) throw new Error("브랜드·상품명은 1~200자로 입력해 주세요.");
  if (input.expiryDay && (typeof input.expiryDay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiryDay))) throw new Error("만료일은 YYYY-MM-DD 형식으로 입력해 주세요.");
  const expiryDay = toDay(input.expiryDay || input.expiryDate);
  if ((input.expiryDay || input.expiryDate) && !expiryDay) throw new Error("유효한 만료일을 입력해 주세요 (YYYY-MM-DD).");
  const barcodeNumber = typeof input.barcodeNumber === "string" ? input.barcodeNumber : "";
  const barcodeType = input.barcodeType || "code128";
  if (!BARCODE_TYPES.includes(barcodeType)) throw new Error("지원하지 않는 바코드 종류입니다.");
  if (kind === "voucher" && (!barcodeNumber || barcodeNumber.length > 4096)) throw new Error("바코드 원문을 입력해 주세요 (최대 4096자).");
  const provider = input.provider || "other";
  if (!Object.prototype.hasOwnProperty.call(PROVIDERS, provider)) throw new Error("지원하지 않는 제공사입니다.");
  const conditions = input.conditions || "";
  if (typeof conditions !== "string" || conditions.length > 5000) throw new Error("이용 조건은 최대 5000자입니다.");
  if (input.isUsed !== undefined && typeof input.isUsed !== "boolean") throw new Error("사용 상태가 올바르지 않습니다.");
  return {
    kind, brand, expiryDay, barcodeNumber: kind === "voucher" ? barcodeNumber : "", barcodeType,
    isUsed: input.isUsed ?? false, provider, conditions,
    sourceUrl: safeSourceUrl(input.sourceUrl || ""),
    image: validateImage(input.image),
    catalogue: normaliseCatalogueMetadata(input.catalogue),
  };
}
export function validateImage(image) {
  if (!image) return null;
  if (typeof image.id !== "string" || !/^[a-f0-9-]{36}$/i.test(image.id) || typeof image.ownerId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(image.ownerId) || !["image/jpeg", "image/png", "image/webp"].includes(image.mime) ||
      (image.cloudPath && image.cloudPath !== `originals/${image.ownerId}/${image.id}`)) throw new Error("원본 이미지 참조가 올바르지 않습니다.");
  return { id: image.id, ownerId: image.ownerId, mime: image.mime, cloudPath: image.cloudPath || null };
}
// Use the original payload, including spaces and hyphens, as the voucher identity.
export function couponIdentity(coupon) {
  return coupon.kind === "external"
    ? JSON.stringify(["external", coupon.provider, coupon.brand, coupon.expiryDay, coupon.conditions, coupon.sourceUrl])
    : JSON.stringify(["voucher", coupon.barcodeType || "code128", coupon.barcodeNumber]);
}
