import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as Print from "expo-print";
import { auth } from "./firebase";
import { addCoupon, fetchCoupons } from "./firestoreService";
import { imageDataUri, importImage, uploadOriginal } from "./imageService";
import { serialise, captureSnapshot, writeLocal } from "./localRecovery";
import { normaliseCoupon } from "../utils/couponModel";
import { BACKUP_VERSION, toCsv, parseBackup, planRestore, validateBackupRecords, escapeHtml } from "../utils/backupData";
import { barcodeSvg } from "../utils/barcodes";
import { selectBackupRange } from "../utils/backupRange";

const assertAccount = (uid) => { if (!uid || auth.currentUser?.uid !== uid) throw new Error("계정이 변경됐습니다. 다시 시도해 주세요."); };
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
export async function exportWallet(format, includeOriginals = true, sourceRecords = null, range = null) {
  const uid = auth.currentUser?.uid;
  assertAccount(uid);
  const source = sourceRecords ?? await fetchCoupons(uid);
  // Validate before JSON serialisation can turn non-finite amounts into null.
  const records = serialise(source.map((record) => ({ ...record, ...normaliseCoupon(record) })));
  if (sourceRecords === null) await captureSnapshot(uid, records);
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
    const text = JSON.stringify({ app: "wallet-sync", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), source: sourceRecords === null ? "server" : "local-snapshot", records: portable }, null, 2);
    // Validate our own size/format before offering an unusable backup.
    parseBackup(text, "json");
    return shareText(text, "json", "application/json");
  }
  const html = `<html><head><meta charset="utf-8"><style>body{font-family:sans-serif}article{page-break-inside:avoid;border:1px solid #ccc;padding:18px;margin:20px}svg{max-width:100%;height:100px}p{white-space:pre-wrap;word-break:break-all}</style></head><body><h1>WalletSync</h1>${portable.map((record) => {
    let barcode = "";
    try { if (record.kind !== "external") barcode = barcodeSvg(record.barcodeNumber, record.barcodeType); } catch { barcode = "<p>Barcode unavailable; check the original.</p>"; }
    return `<article><h2>${escapeHtml(record.brand)}</h2><p>${escapeHtml(record.expiryDay)} · ${record.deletedAt ? "Trash" : record.isUsed ? "Used" : "Unused"}</p>${barcode}<p>${escapeHtml(record.barcodeNumber)}</p><p>${escapeHtml(record.conditions)}</p><p>${escapeHtml(record.sourceUrl)}</p></article>`;
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
  return parseBackup(text, asset.name.toLowerCase().endsWith(".csv") ? "csv" : "json");
}
export async function previewRestore(records) {
  return planRestore(records, await fetchCoupons(auth.currentUser?.uid));
}
export async function restoreRecords(records, onProgress = () => {}) {
  const uid = auth.currentUser?.uid;
  assertAccount(uid);
  // Validate the entire input again before checkpointing or making server writes.
  records = validateBackupRecords(records, { localImages: true });
  const current = await fetchCoupons(uid);
  await captureSnapshot(uid, current);
  // Persist the input and progress before any network mutation. A retry is additive.
  const session = { startedAt: new Date().toISOString(), records, completed: 0 };
  await writeLocal(uid, "restore", session);
  const plan = planRestore(records, current);
  let added = 0, skipped = plan.skipped, localOnly = 0;
  for (const record of plan.additions) {
    assertAccount(uid);
    try {
      let image = record.image?.ownerId === uid ? record.image : null;
      if (record.original) {
        const uploaded = await uploadOriginal(await importImage(record.original));
        image = uploaded.image;
        if (uploaded.localOnly) localOnly++;
      }
      assertAccount(uid);
      await addCoupon({ ...record, image }, { restore: true });
      added++;
      session.completed = added;
      await writeLocal(uid, "restore", session);
      onProgress(added, plan.additions.length);
    } catch (error) {
      if (error.code === "coupon/duplicate") { skipped++; continue; }
      throw new Error(`${added}개 복원 후 중단됐습니다. 이미 복원한 쿠폰은 유지되며 같은 백업으로 재시도할 수 있습니다. ${error.message}`);
    }
  }
  await writeLocal(uid, "restore", null);
  return { added, skipped, localOnly };
}
