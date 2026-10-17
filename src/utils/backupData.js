import { normaliseCoupon, couponIdentity, validateImage } from "./couponModel";
import { normaliseCatalogueMetadata } from "./catalogueModel";
import { toDate } from "./dateUtils";

export const BACKUP_VERSION = 2;
export const LEGACY_CSV_FIELDS = ["kind", "brand", "barcodeType", "barcodeNumber", "expiryDay", "isUsed", "provider", "conditions", "sourceUrl", "deletedAt"];
export const CSV_FIELDS = [...LEGACY_CSV_FIELDS, "catalogue"];
const dangerousCell = /^[\s]*[=+\-@\t\r]/;
const csvCell = (value) => {
  const text = String(value ?? "");
  // Spreadsheet-safe, reversible prefix; also escape literal leading apostrophes.
  const safe = dangerousCell.test(text) || text.startsWith("'") ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
export const toCsv = (records) => "\ufeff" + [CSV_FIELDS.map(csvCell).join(","), ...records.map((record) =>
  CSV_FIELDS.map((field) => csvCell(field === "catalogue" ? JSON.stringify(normaliseCatalogueMetadata(record.catalogue)) : record[field])).join(","))].join("\r\n");
export function parseCsv(text) {
  const rows = []; let row = [], value = "", quoted = false, closed = false;
  const source = text.replace(/^\ufeff/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else value += c;
    } else if (closed && ![",", "\n", "\r"].includes(c)) throw new Error("CSV 닫는 따옴표 뒤에 잘못된 문자가 있습니다.");
    else if (c === '"' && !value && !closed) quoted = true;
    else if (c === '"') throw new Error("CSV 따옴표 위치가 올바르지 않습니다.");
    else if (c === ",") { row.push(value); value = ""; closed = false; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(value); rows.push(row); row = []; value = ""; closed = false;
    } else value += c;
  }
  if (quoted) throw new Error("CSV 따옴표가 닫히지 않았습니다.");
  if (row.length || value) { row.push(value); rows.push(row); }
  const header = rows.shift();
  if (!header || ![CSV_FIELDS, LEGACY_CSV_FIELDS].some((fields) => header.join("|") === fields.join("|"))) throw new Error("WalletSync CSV 열 형식이 올바르지 않습니다.");
  return rows.filter((r) => r.some(Boolean)).map((r) => {
    if (r.length !== header.length) throw new Error("CSV 열 개수가 올바르지 않습니다.");
    const record = Object.fromEntries(header.map((field, i) => [field, r[i].startsWith("'") ? r[i].slice(1) : r[i]]));
    if (!["true", "false"].includes(record.isUsed)) throw new Error("CSV 사용 상태가 올바르지 않습니다.");
    record.isUsed = record.isUsed === "true";
    if (header.includes("catalogue")) {
      try { record.catalogue = normaliseCatalogueMetadata(JSON.parse(record.catalogue)); }
      catch { throw new Error("CSV 카탈로그 정보를 읽지 못했습니다. 원본 백업을 확인해 주세요."); }
    }
    return record;
  });
}
export function validateBackupRecords(records, { localImages = false } = {}) {
  if (!Array.isArray(records) || records.length > 2000) throw new Error("백업은 최대 2000개 쿠폰까지 복원할 수 있습니다.");
  let imageBytes = 0;
  return records.map((record, index) => {
    try {
      if (!record || typeof record !== "object") throw new Error("잘못된 기록입니다.");
      const data = normaliseCoupon({ ...record, image: null });
      let deletedAt = null;
      if (record.deletedAt) {
        deletedAt = toDate(record.deletedAt);
        if (!deletedAt) throw new Error("삭제 날짜가 올바르지 않습니다.");
      }
      const original = record.original || null;
      if (original) {
        if (typeof original !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(original)) throw new Error("이미지 형식이 올바르지 않습니다.");
        const bytes = original.split(",")[1].length * 0.75;
        if (bytes > 10 * 1024 * 1024 + 2) throw new Error("이미지는 10MB 이하여야 합니다.");
        imageBytes += bytes;
      }
      if (imageBytes > 35 * 1024 * 1024) throw new Error("한 백업의 이미지 합계는 35MB 이하여야 합니다.");
      return { ...data, image: localImages ? validateImage(record.image) : null, deletedAt, original };
    } catch (error) { throw new Error(`${index + 1}번째 쿠폰: ${error.message}`); }
  });
}
export function parseBackup(text, format) {
  if (text.length > 50 * 1024 * 1024) throw new Error("50MB 이하 백업을 선택해 주세요.");
  if (format === "csv") return validateBackupRecords(parseCsv(text));
  let backup;
  try { backup = JSON.parse(text.replace(/^\ufeff/, "")); } catch { throw new Error("JSON 백업을 읽을 수 없습니다."); }
  if (backup?.app !== "wallet-sync" || ![1, BACKUP_VERSION].includes(backup.version)) throw new Error("지원하는 WalletSync 백업 버전이 아닙니다.");
  return validateBackupRecords(backup.records);
}
export function planRestore(records, existing) {
  const identities = new Set(existing.map(couponIdentity));
  const additions = []; let skipped = 0;
  for (const record of records) {
    const identity = couponIdentity(record);
    if (identities.has(identity)) { skipped++; continue; }
    identities.add(identity); additions.push(record);
  }
  return { additions, skipped };
}
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
