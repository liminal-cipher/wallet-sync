import { code128, code39, ean13, ean8, qrcode, upca, upce, drawingSVG } from "@bwip-js/generic";

const encoders = { code128, code39, ean13, ean8, qr: qrcode, upc_a: upca, upc_e: upce };
export function barcodeSvg(value, type = "code128") {
  if (!Object.prototype.hasOwnProperty.call(encoders, type)) throw new Error("지원하지 않는 바코드 종류입니다.");
  if (typeof value !== "string" || !value || value.length > 4096) throw new Error("유효한 바코드 원문이 필요합니다.");
  // No stripping, case conversion, checksum insertion or extended-ASCII substitution.
  if (type === "code128" && /[^\x20-\x7e]/.test(value)) throw new Error("Code 128은 출력 가능한 영문·숫자만 지원합니다. QR 또는 원본 이미지를 확인해 주세요.");
  if (type === "code39" && !/^[0-9A-Z .$/+%-]+$/.test(value)) throw new Error("Code 39 원문을 확인해 주세요.");
  const lengths = { ean13: 13, ean8: 8, upc_a: 12, upc_e: 8 };
  if (lengths[type] && !new RegExp(`^[0-9]{${lengths[type]}}$`).test(value)) throw new Error("체크 숫자를 포함한 바코드 원문 전체를 입력해 주세요.");
  try {
    return encoders[type]({ text: value, scale: 2, height: 15, padding: type === "qr" ? 4 : 12, includetext: false }, drawingSVG());
  } catch { throw new Error("바코드 원문·종류·체크 숫자를 확인해 주세요. 원본은 변경되지 않습니다."); }
}
