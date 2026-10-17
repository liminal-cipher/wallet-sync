import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as Print from "expo-print";
import { auth } from "./firebase";
import { addCoupon, fetchCoupons } from "./firestoreService";
import { imageDataUri, importImage, uploadOriginal } from "./imageService";
import { serialise, captureSnapshot, readLocal, writeLocal } from "./localRecovery";
import { loadBrandPreferences, mergeBrandPreferences } from "./brandPreferences";
import { mergePreferenceData } from "../utils/brandPreferenceData";
import { normaliseCoupon } from "../utils/couponModel";
import { BACKUP_VERSION, toCsv, parseBackup, parseWalletBackup, planRestore, validateRestoreInput, validateRestoreSession, escapeHtml } from "../utils/backupData";
import { barcodeSvg } from "../utils/barcodes";
import { selectBackupRange } from "../utils/backupRange";
import { catalogueDetailLines } from "../utils/catalogueDisplay";

const assertAccount = (uid) => { if (!uid || auth.currentUser?.uid !== uid) throw new Error("계정이 변경됐습니다. 다시 시도해 주세요."); };
const restoring = new Set();
async function shareText(text, extension, mimeType) {
  const name = `wallet-sync-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const link = document.createElement("a"); link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  // Keep the export in documents even when the share sheet is cancelled.
  const uri = `${FileSystem.documentDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, text);
  if (!(await Sharing.isAvailableAsync())) throw new Error(`파일은 앱 문서에 보관됐지만 공유를 지원하지 않습니다: ${name}`);
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: "쿠폰 백업 저장" });
}
export async function exportWallet(format, includeOriginals = true, sourceRecords = null, range = null, includePreferences = true) {
  const uid = auth.currentUser?.uid;
  assertAccount(uid);
  const source = sourceRecords ?? await fetchCoupons(uid);
  assertAccount(uid);
  // Validate before JSON serialisation can turn non-finite amounts into null.
  const records = serialise(source.map((record) => ({ ...record, ...normaliseCoupon(record) })));
  if (sourceRecords === null) await captureSnapshot(uid, records);
  assertAccount(uid);
  const selected = selectBackupRange(records, range);
  if (selected.length > 2000) throw new Error("한 백업은 최대 2000개입니다. 시작·끝 번호를 조정해 나눠 내보내 주세요.");
  const portable = []; let originalBytes = 0;
  for (const record of selected) {
    assertAccount(uid);
    let original = null;
    if (format === "json" && includeOriginals && record.image) {
      original = await imageDataUri(record.image);
      originalBytes += original.split(",")[1].length * 0.75;
      if (originalBytes > 35 * 1024 * 1024) throw new Error("원본 합계가 35MB를 넘습니다. 시작·끝 번호를 조정해 나눠 내보내 주세요.");
    }
    portable.push({ ...normaliseCoupon({ ...record, image: null }), deletedAt: record.deletedAt || null,
      ...(original ? { original } : {}), image: null });
  }
  assertAccount(uid);
  if (format === "csv") { const text = toCsv(portable); parseBackup(text, "csv"); return shareText(text, "csv", "text/csv"); }
  if (format === "json") {
    const brandPreferences = includePreferences ? await loadBrandPreferences(uid) : null;
    assertAccount(uid);
    const text = JSON.stringify({ app: "wallet-sync", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), source: sourceRecords === null ? "server" : "local-snapshot", records: portable, brandPreferences }, null, 2);
    // Validate our own size/format before offering an unusable backup.
    parseBackup(text, "json");
    return shareText(text, "json", "application/json");
  }
  const html = `<html><head><meta charset="utf-8"><style>body{font-family:sans-serif}article{page-break-inside:avoid;border:1px solid #ccc;padding:18px;margin:20px}svg{max-width:100%;height:100px}p{white-space:pre-wrap;word-break:break-all}</style></head><body><h1>WalletSync</h1>${portable.map((record) => {
    let barcode = "";
    try { if (record.kind !== "external") barcode = barcodeSvg(record.barcodeNumber, record.barcodeType); } catch { barcode = "<p>Barcode unavailable; check the original.</p>"; }
    return `<article><h2>${escapeHtml(record.brand)}</h2><p>${escapeHtml(record.expiryDay)} · ${record.deletedAt ? "Trash" : record.isUsed ? "Used" : "Unused"}</p>${barcode}<p>${escapeHtml(record.barcodeNumber)}</p>${catalogueDetailLines(record).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<p>${escapeHtml(record.conditions)}</p><p>${escapeHtml(record.sourceUrl)}</p></article>`;
  }).join("")}</body></html>`;
  if (Platform.OS === "web") {
    // expo-print's web implementation prints the current page and ignores HTML.
    // Use a dedicated printable frame so the wallet controls are never exported.
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;width:1px;height:1px;bottom:0;border:0";
    return new Promise((resolve, reject) => {
      let cleanup;
      frame.onload = () => {
        try {
          frame.contentWindow.addEventListener("afterprint", () => { clearTimeout(cleanup); frame.remove(); resolve(); }, { once: true });
          frame.contentWindow.focus(); frame.contentWindow.print();
          cleanup = setTimeout(() => { frame.remove(); resolve(); }, 60000);
        } catch (error) { frame.remove(); reject(error); }
      };
      frame.srcdoc = html; document.body.appendChild(frame);
    });
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) throw new Error("이 기기는 PDF 공유를 지원하지 않습니다.");
  return Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: ".pdf" });
}
export async function pickBackup() {
  const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/csv", "text/comma-separated-values", "text/plain"], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (asset.size > 50 * 1024 * 1024) throw new Error("50MB 이하 백업을 선택해 주세요.");
  const text = Platform.OS === "web" ? await (await fetch(asset.uri)).text() : await FileSystem.readAsStringAsync(asset.uri);
  return parseWalletBackup(text, asset.name.toLowerCase().endsWith(".csv") ? "csv" : "json");
}
export async function previewRestore(input) {
  const uid = auth.currentUser?.uid;
  assertAccount(uid);
  const backup = validateRestoreInput(input, { localImages: true });
  const current = await fetchCoupons(uid);
  assertAccount(uid);
  return { ...planRestore(backup.records, current), ...backup, uid };
}
export const restoreRecords = (records, onProgress = () => {}) => restoreWalletBackup(records, { onProgress });
export async function restoreWalletBackup(input, { onProgress = () => {}, includePreferences = false, expectedUid = auth.currentUser?.uid } = {}) {
  const uid = expectedUid;
  assertAccount(uid);
  const backup = validateRestoreInput(input, { localImages: true });
  if (restoring.has(uid)) throw new Error("이미 복원 중입니다. 현재 작업이 끝난 뒤 다시 시도해 주세요.");
  restoring.add(uid);
  try {
    if (includePreferences && backup.brandPreferences) {
      mergePreferenceData(await loadBrandPreferences(uid), backup.brandPreferences);
      assertAccount(uid);
    }
    const current = await fetchCoupons(uid);
    assertAccount(uid);
    await captureSnapshot(uid, current);
    assertAccount(uid);
    const previous = await readLocal(uid, "restore");
    assertAccount(uid);
    if (previous) {
      validateRestoreSession(previous);
      await writeLocal(uid, "restore:previous", previous);
      assertAccount(uid);
    }
    // Persist the input and progress before any network mutation. A retry is additive.
    const session = { version: 2, startedAt: new Date().toISOString(), ...backup, includePreferences, completed: 0 };
    await writeLocal(uid, "restore", session);
    assertAccount(uid);
    const plan = planRestore(backup.records, current);
    let added = 0, skipped = plan.skipped, localOnly = 0;
    for (const record of plan.additions) {
      assertAccount(uid);
      try {
        let image = record.image?.ownerId === uid ? record.image : null;
        if (record.original) {
          const retained = await importImage(record.original);
          assertAccount(uid);
          const uploaded = await uploadOriginal(retained);
          assertAccount(uid);
          image = uploaded.image;
          if (uploaded.localOnly) localOnly++;
        }
        assertAccount(uid);
        await addCoupon({ ...record, image }, { restore: true });
        added++;
        assertAccount(uid);
        session.completed = added;
        await writeLocal(uid, "restore", session);
        assertAccount(uid);
        onProgress(added, plan.additions.length);
      } catch (error) {
        if (error.code === "coupon/duplicate") { skipped++; continue; }
        throw new Error(`${added}개 복원 후 중단됐습니다. 이미 복원한 쿠폰은 유지되며 같은 백업으로 재시도할 수 있습니다. ${error.message}`);
      }
    }
    let preferencesRestored = false;
    if (includePreferences && backup.brandPreferences) {
      await mergeBrandPreferences(uid, backup.brandPreferences);
      assertAccount(uid);
      preferencesRestored = true;
    }
    await writeLocal(uid, "restore", null);
    assertAccount(uid);
    return { added, skipped, localOnly, preferencesRestored };
  } finally { restoring.delete(uid); }
}
