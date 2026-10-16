import {
  collection, getDocs, getDocsFromServer, getDoc, doc, query, where, onSnapshot, runTransaction,
} from "firebase/firestore";
import * as Crypto from "expo-crypto";
import { db, auth } from "./firebase";
import { sortCouponsByExpiry } from "../utils/dateUtils";
import { normaliseCoupon, couponIdentity } from "../utils/couponModel";
import { captureSnapshot } from "./localRecovery";

const requireUid = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("로그인이 필요합니다.");
  return uid;
};
const recordsFrom = (snapshot) => sortCouponsByExpiry(snapshot.docs.map((item) => ({ ...item.data(), id: item.id })));
export const subscribeCoupons = (userId, onUpdate, onError) => {
  const uid = userId || auth.currentUser?.uid;
  if (!uid) { onUpdate?.([]); return () => {}; }
  return onSnapshot(query(collection(db, "coupons"), where("userId", "==", uid)), { includeMetadataChanges: true }, (snapshot) => {
    const records = recordsFrom(snapshot);
    onUpdate?.(records, { fromCache: snapshot.metadata.fromCache });
    // Never turn an unconfirmed cache miss into an automatic recovery snapshot.
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
      captureSnapshot(uid, records).catch((error) => onError?.(error, { localRecovery: true }));
    }
  }, onError);
};
export const fetchCoupons = async (userId) => {
  const uid = userId || auth.currentUser?.uid;
  if (!uid) return [];
  return recordsFrom(await getDocsFromServer(query(collection(db, "coupons"), where("userId", "==", uid))));
};
export const getCoupon = async (id) => {
  const snapshot = await getDoc(doc(db, "coupons", id));
  if (!snapshot.exists() || snapshot.data().userId !== requireUid()) throw new Error("쿠폰을 찾을 수 없습니다.");
  return { ...snapshot.data(), id: snapshot.id };
};
const identityId = async (uid, identity) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify([uid, identity]));
const duplicateError = (record) => {
  const error = new Error(record.deletedAt ? "휴지통에 같은 쿠폰이 있습니다. 보관·복원에서 복원해 주세요." : "이미 같은 바코드·이벤트가 등록돼 있습니다.");
  error.code = "coupon/duplicate";
  return error;
};
export const addCoupon = async (input, options = {}) => {
  const uid = requireUid();
  const data = normaliseCoupon(input);
  if (data.image && data.image.ownerId !== uid) throw new Error("다른 계정의 원본 이미지입니다.");
  const identity = couponIdentity(data);
  const keyRef = doc(db, "users", uid, "couponKeys", await identityId(uid, identity));
  // Observe the reservation before the server query. If an administrator removed
  // a coupon but left its key, safely repair that dangling reservation below.
  const observedKey = await getDoc(keyRef);
  // Legacy coupons have random IDs; check them before reserving the new identity.
  const existing = await fetchCoupons(uid);
  const duplicate = existing.find((c) => couponIdentity(c) === identity);
  if (duplicate) throw duplicateError(duplicate);
  const ref = doc(collection(db, "coupons"));
  await runTransaction(db, async (transaction) => {
    if (requireUid() !== uid) throw new Error("계정이 변경됐습니다.");
    const keySnapshot = await transaction.get(keyRef);
    if (keySnapshot.exists() && (!observedKey.exists() ||
        keySnapshot.data().couponId !== observedKey.data().couponId ||
        existing.some((record) => record.id === keySnapshot.data().couponId))) throw duplicateError({});
    transaction.set(keyRef, { couponId: ref.id });
    transaction.set(ref, { ...data, userId: uid, revision: 1, createdAt: new Date(), updatedAt: new Date(), deletedAt: options.restore && input.deletedAt ? new Date(input.deletedAt) : null });
  });
  return ref;
};
export const updateCoupon = async (id, patch, expectedRevision) => {
  const uid = requireUid();
  if (!id) throw new Error("쿠폰 ID가 필요합니다.");
  // A voucher's payload/type is its identity. Editing must not create duplicates.
  const all = await fetchCoupons(uid);
  const ref = doc(db, "coupons", id);
  // Compute keys outside the transaction callback; it may be retried by Firestore.
  const observed = all.find((record) => record.id === id);
  if (!observed) throw new Error("쿠폰을 찾을 수 없습니다.");
  const proposed = normaliseCoupon({ ...observed, ...patch });
  const keyRef = doc(db, "users", uid, "couponKeys", await identityId(uid, couponIdentity(proposed)));
  const oldKeyRef = doc(db, "users", uid, "couponKeys", await identityId(uid, couponIdentity(observed)));
  return runTransaction(db, async (transaction) => {
    if (requireUid() !== uid) throw new Error("계정이 변경됐습니다.");
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().userId !== uid) throw new Error("쿠폰을 찾을 수 없습니다.");
    const current = snapshot.data();
    if ((current.revision || 0) !== (observed.revision || 0)) throw new Error("다른 기기에서 변경됐습니다. 최신 목록에서 다시 시도해 주세요.");
    const revision = current.revision || 0;
    if (expectedRevision !== undefined && expectedRevision !== revision) {
      throw new Error("다른 기기에서 변경된 쿠폰입니다. 뒤로 갔다가 다시 열어 확인해 주세요. 입력 초안은 유지됩니다.");
    }
    const data = normaliseCoupon({ ...current, ...patch });
    if (data.image && data.image.ownerId !== uid) throw new Error("다른 계정의 원본 이미지입니다.");
    if (all.some((c) => c.id !== id && couponIdentity(c) === couponIdentity(data))) {
      throw duplicateError({});
    }
    const reserved = await transaction.get(keyRef);
    const oldReserved = keyRef.path === oldKeyRef.path ? reserved : await transaction.get(oldKeyRef);
    if (reserved.exists() && reserved.data().couponId !== id) throw duplicateError({});
    transaction.set(keyRef, { couponId: id });
    if (keyRef.path !== oldKeyRef.path && oldReserved.exists() && oldReserved.data().couponId === id) transaction.delete(oldKeyRef);
    // Archive the complete original document atomically with every change.
    transaction.set(doc(ref, "history", String(revision)), { record: current, savedAt: new Date(), userId: uid });
    transaction.update(ref, {
      ...data, deletedAt: patch.deletedAt !== undefined ? patch.deletedAt : (current.deletedAt || null),
      updatedAt: new Date(), revision: revision + 1,
    });
  });
};
export const deleteCoupon = (id, revision) => updateCoupon(id, { deletedAt: new Date() }, revision);
export const restoreCoupon = (id, revision) => updateCoupon(id, { deletedAt: null }, revision);
export const fetchCouponHistory = async (id) => {
  requireUid();
  const snapshot = await getDocs(collection(db, "coupons", id, "history"));
  return snapshot.docs.map((item) => ({ ...item.data(), version: Number(item.id) })).sort((a, b) => b.version - a.version);
};
export const restoreCouponVersion = async (id, version, expectedRevision) => {
  const snapshot = await getDoc(doc(db, "coupons", id, "history", String(version)));
  if (!snapshot.exists()) throw new Error("이전 버전을 찾을 수 없습니다.");
  const record = snapshot.data().record;
  if (record.userId !== requireUid()) throw new Error("다른 계정의 이력입니다.");
  return updateCoupon(id, { ...record, deletedAt: record.deletedAt || null }, expectedRevision);
};
