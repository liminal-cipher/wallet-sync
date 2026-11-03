import { BARCODE_TYPES, PROVIDERS, validateImage } from "./couponModel";
import { normaliseCatalogueMetadata } from "./catalogueModel";
import { MONEY_FIELDS } from "./catalogueForm";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export function validateCouponDraft(draft) {
  if (draft === null || draft === undefined) return null;
  try {
    if (!object(draft) || !object(draft.form) || !Number.isSafeInteger(draft.revision) || draft.revision < 0 ||
        (draft.savedAt != null && (typeof draft.savedAt !== "string" || !Number.isFinite(Date.parse(draft.savedAt))))) throw new Error();
    const form = draft.form;
    // Unfinished text is recoverable; completed-coupon validation belongs to save.
    for (const field of ["brand", "barcodeNumber", "expiryDay", "conditions", "sourceUrl", "catalogueSuggestionText"]) {
      if (form[field] !== undefined && typeof form[field] !== "string") throw new Error();
    }
    for (const field of ["isUsed", "catalogueManual"]) {
      if (form[field] !== undefined && typeof form[field] !== "boolean") throw new Error();
    }
    if ((form.kind !== undefined && !["voucher", "external"].includes(form.kind)) ||
        (form.barcodeType !== undefined && !BARCODE_TYPES.includes(form.barcodeType)) ||
        (form.provider !== undefined && !Object.prototype.hasOwnProperty.call(PROVIDERS, form.provider))) throw new Error();
    if (form.image != null) {
      if (!object(form.image)) throw new Error();
      validateImage(form.image);
    }
    normaliseCatalogueMetadata(form.catalogue);
    if (form.catalogueMoneyInput != null && (!object(form.catalogueMoneyInput) ||
        Object.entries(form.catalogueMoneyInput).some(([field, value]) => !MONEY_FIELDS.includes(field) || typeof value !== "string"))) throw new Error();
    return draft;
  } catch { throw new Error("입력 초안을 읽지 못했습니다. 기존 사본은 유지됩니다."); }
}
