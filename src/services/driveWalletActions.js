import { auth } from "./firebase";
import { getWalletScope, assertWalletScope } from "./walletSession";
import { fetchCoupons, updateCoupon } from "./firestoreService";
import { uploadOriginal } from "./imageService";
import { checkDriveFolder } from "./driveService";

export async function syncDriveOriginals(onProgress = () => {}) {
  const uid = auth.currentUser?.uid, scope = getWalletScope(uid);
  const check = () => { if (!uid || auth.currentUser?.uid !== uid) throw new Error("계정이 변경됐습니다."); assertWalletScope(scope); };
  check(); await checkDriveFolder(); check();
  const records = await fetchCoupons(uid); check();
  const pending = records.filter((record) => record.image && !record.image.drive);
  const result = { uploaded: 0, failed: 0, total: pending.length };
  for (const record of pending) {
    check();
    try {
      const uploaded = await uploadOriginal(record.image); check();
      if (!uploaded.image?.drive || uploaded.localOnly) throw new Error("원본 보관 미완료");
      await updateCoupon(record.id, { image: uploaded.image }, record.revision || 0); check();
      result.uploaded++;
    } catch (error) {
      check();
      if (error.code === "coupon/conflict") throw error;
      result.failed++;
    }
    onProgress(result.uploaded + result.failed, pending.length);
  }
  return result;
}
