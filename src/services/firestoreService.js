import {
  collection, getDocs, getDocsFromServer, getDoc, getDocFromServer, doc, query, where, onSnapshot, runTransaction,
} from "firebase/firestore";
import * as Crypto from "expo-crypto";
import { db, auth } from "./firebase";
import { sortCouponsByExpiry } from "../utils/dateUtils";
import { normaliseCoupon, couponIdentity } from "../utils/couponModel";
import { captureSnapshot } from "./localRecovery";
import { getWalletScope, assertWalletScope } from "./walletSession";

const requireUid = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("로그인이 필요합니다.");
  return uid;
};
const assertUid = (uid) => { if (requireUid() !== uid) throw new Error("계정이 변경됐습니다."); };
const assertScope = (scope) => { assertUid(scope.uid); assertWalletScope(scope); };
const couponsRef = (scope) => scope.walletId ? collection(db, "wallets", scope.walletId, "coupons") : collection(db, "coupons");
const couponRef = (scope, id) => scope.walletId ? doc(db, "wallets", scope.walletId, "coupons", id) : doc(db, "coupons", id);
const couponQuery = (scope) => scope.walletId ? couponsRef(scope) : query(couponsRef(scope), where("userId", "==", scope.uid));
const keyRefFor = (scope, key) => scope.walletId ? doc(db, "wallets", scope.walletId, "couponKeys", key) : doc(db, "users", scope.uid, "couponKeys", key);
const belongsToScope = (data, scope) => scope.walletId ? data.walletId === scope.walletId : data.userId === scope.uid && !data.walletId;
const validImageOwner = (image, scope) => !image || (scope.walletId ? image.walletId === scope.walletId : image.ownerId === scope.uid && !image.walletId);
const recordsFrom = (snapshot) => sortCouponsByExpiry(snapshot.docs.map((item) => ({ ...item.data(), ...normaliseCoupon(item.data()), id: item.id })));
export const subscribeCoupons = (userId, onUpdate, onError) => {
  const uid = userId || auth.currentUser?.uid;
  if (!uid) { onUpdate?.([]); return () => {}; }
  const scope = getWalletScope(uid);
  return onSnapshot(couponQuery(scope), { includeMetadataChanges: true }, (snapshot) => {
    if (auth.currentUser?.uid !== uid) return;
    try { assertWalletScope(scope); } catch { return; }
    let records;
    try { records = recordsFrom(snapshot); }
    catch (error) { onError?.(error); return; }
    onUpdate?.(records, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites });
    // Never turn an unconfirmed cache miss into an automatic recovery snapshot.
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
      captureSnapshot(uid, records).catch((error) => onError?.(error, { localRecovery: true }));
    }
  }, onError);
};
export const fetchCoupons = async (userId) => {
  const uid = userId || auth.currentUser?.uid;
  if (!uid) return [];
  assertUid(uid);
  const scope = getWalletScope(uid);
  const snapshot = await getDocsFromServer(couponQuery(scope));
  assertScope(scope);
  return recordsFrom(snapshot);
};
export const getCoupon = async (id) => {
  const uid = requireUid();
  const scope = getWalletScope(uid);
  const snapshot = await getDoc(couponRef(scope, id));
  assertScope(scope);
  if (!snapshot.exists() || !belongsToScope(snapshot.data(), scope)) throw new Error("쿠폰을 찾을 수 없습니다.");
  return { ...snapshot.data(), ...normaliseCoupon(snapshot.data()), id: snapshot.id };
};
const identityId = async (uid, identity) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify([uid, identity]));
const duplicateError = (record) => {
  const error = new Error(record.deletedAt ? "휴지통에 같은 쿠폰이 있습니다. 보관·복원에서 복원해 주세요." : "이미 같은 바코드·이벤트가 등록돼 있습니다.");
  error.code = "coupon/duplicate";
  return error;
};
const conflictError = () => Object.assign(new Error("다른 기기에서 변경된 쿠폰입니다. 최신 목록에서 다시 열어 확인해 주세요. 입력 초안은 유지됩니다."), { code: "coupon/conflict" });
export const addCoupon = async (input, options = {}) => {
  const uid = requireUid();
  const scope = getWalletScope(uid);
  const data = normaliseCoupon(input);
  if (!validImageOwner(data.image, scope)) throw new Error("다른 계정·쿠폰함의 원본 이미지입니다.");
  const identity = couponIdentity(data);
  const keyRef = keyRefFor(scope, await identityId(scope.walletId || uid, identity));
  assertScope(scope);
  // Observe the reservation before the server query. If an administrator removed
  // a coupon but left its key, safely repair that dangling reservation below.
  const observedKey = await getDoc(keyRef);
  assertScope(scope);
  // Legacy coupons have random IDs; check them before reserving the new identity.
  const existing = await fetchCoupons(uid);
  assertScope(scope);
  const duplicate = existing.find((c) => couponIdentity(c) === identity);
  if (duplicate) throw duplicateError(duplicate);
  const ref = doc(couponsRef(scope));
  await runTransaction(db, async (transaction) => {
    assertScope(scope);
    const keySnapshot = await transaction.get(keyRef);
    assertScope(scope);
    if (keySnapshot.exists() && (!observedKey.exists() ||
        keySnapshot.data().couponId !== observedKey.data().couponId ||
        existing.some((record) => record.id === keySnapshot.data().couponId))) throw duplicateError({});
    transaction.set(keyRef, { couponId: ref.id });
    transaction.set(ref, { ...data, userId: uid, ...(scope.walletId ? { walletId: scope.walletId, updatedBy: uid } : {}), revision: 1, createdAt: new Date(), updatedAt: new Date(), deletedAt: options.restore && input.deletedAt ? new Date(input.deletedAt) : null });
  });
  return ref;
};
export const updateCoupon = async (id, patch, expectedRevision) => {
  const uid = requireUid();
  const scope = getWalletScope(uid);
  if (!id) throw new Error("쿠폰 ID가 필요합니다.");
  // A voucher's payload/type is its identity. Editing must not create duplicates.
  const all = await fetchCoupons(uid);
  assertScope(scope);
  const ref = couponRef(scope, id);
  // Compute keys outside the transaction callback; it may be retried by Firestore.
  const observed = all.find((record) => record.id === id);
  if (!observed) throw new Error("쿠폰을 찾을 수 없습니다.");
  const proposed = normaliseCoupon({ ...observed, ...patch });
  const keyRef = keyRefFor(scope, await identityId(scope.walletId || uid, couponIdentity(proposed)));
  const oldKeyRef = keyRefFor(scope, await identityId(scope.walletId || uid, couponIdentity(observed)));
  assertScope(scope);
  return runTransaction(db, async (transaction) => {
    assertScope(scope);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || !belongsToScope(snapshot.data(), scope)) throw new Error("쿠폰을 찾을 수 없습니다.");
    const current = snapshot.data();
    if ((current.revision || 0) !== (observed.revision || 0)) throw conflictError();
    const revision = current.revision || 0;
    if (expectedRevision !== undefined && expectedRevision !== revision) {
      throw conflictError();
    }
    const data = normaliseCoupon({ ...current, ...patch });
    if (!validImageOwner(data.image, scope)) throw new Error("다른 계정·쿠폰함의 원본 이미지입니다.");
    if (all.some((c) => c.id !== id && couponIdentity(c) === couponIdentity(data))) {
      throw duplicateError({});
    }
    const reserved = await transaction.get(keyRef);
    const oldReserved = keyRef.path === oldKeyRef.path ? reserved : await transaction.get(oldKeyRef);
    assertScope(scope);
    if (reserved.exists() && reserved.data().couponId !== id) throw duplicateError({});
    transaction.set(keyRef, { couponId: id });
    if (keyRef.path !== oldKeyRef.path && oldReserved.exists() && oldReserved.data().couponId === id) transaction.delete(oldKeyRef);
    // Archive the complete original document atomically with every change.
    transaction.set(doc(ref, "history", String(revision)), { record: current, savedAt: new Date(), userId: uid });
    transaction.update(ref, {
      ...data, deletedAt: patch.deletedAt !== undefined ? patch.deletedAt : (current.deletedAt || null),
      updatedAt: new Date(), revision: revision + 1,
      ...(scope.walletId ? { updatedBy: uid } : {}),
    });
  }).catch(async (error) => {
    assertScope(scope);
    // An immutable history entry can cause rules to reject a competing commit
    // before Firestore reports its stale transaction. Diagnose without retrying
    // the write or adopting a newer revision on the user's behalf.
    if (["permission-denied", "failed-precondition", "aborted"].includes(error.code)) {
      let latest;
      try { latest = await getDocFromServer(ref); }
      catch (readError) {
        assertScope(scope);
        if (scope.walletId && readError.code === "permission-denied") throw new Error("공유 쿠폰함에 접근할 수 없습니다. 참여 상태를 확인해 주세요. 입력 초안은 유지됩니다.");
        throw error;
      }
      assertScope(scope);
      if (latest.exists() && (latest.data().revision || 0) !== (observed.revision || 0)) throw conflictError();
    }
    throw error;
  });
};
export const deleteCoupon = (id, revision) => updateCoupon(id, { deletedAt: new Date() }, revision);
export const restoreCoupon = (id, revision) => updateCoupon(id, { deletedAt: null }, revision);
export const fetchCouponHistory = async (id) => {
  const uid = requireUid();
  const scope = getWalletScope(uid);
  const snapshot = await getDocs(collection(couponRef(scope, id), "history"));
  assertScope(scope);
  return snapshot.docs.map((item) => ({ ...item.data(), version: Number(item.id) })).sort((a, b) => b.version - a.version);
};
export const restoreCouponVersion = async (id, version, expectedRevision) => {
  const uid = requireUid();
  const scope = getWalletScope(uid);
  const snapshot = await getDoc(doc(couponRef(scope, id), "history", String(version)));
  assertScope(scope);
  if (!snapshot.exists()) throw new Error("이전 버전을 찾을 수 없습니다.");
  const record = snapshot.data().record;
  if (!belongsToScope(record, scope)) throw new Error("다른 계정·쿠폰함의 이력입니다.");
  // A pre-catalogue version must clear metadata added by a later revision.
  return updateCoupon(id, { ...record, catalogue: record.catalogue ?? null, deletedAt: record.deletedAt || null }, expectedRevision);
};
