import { collection, doc, getDoc, onSnapshot, runTransaction } from "firebase/firestore";
import * as Crypto from "expo-crypto";
import { db, auth } from "./firebase";
import { getWalletScope, setActiveWallet } from "./walletSession";

const requireUid = () => {
  if (!auth.currentUser?.uid) throw new Error("로그인이 필요합니다.");
  return auth.currentUser.uid;
};
const assertUid = (uid) => { if (requireUid() !== uid) throw new Error("계정이 변경됐습니다."); };
const profileRef = (uid) => doc(db, "users", uid, "settings", "sharedWallet");
const walletRef = (id) => doc(db, "wallets", id);
const codeHash = (code) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, code);
const timestamp = (value) => value?.toDate ? value.toDate().getTime() : new Date(value).getTime();

export function subscribeSharedWallet(uid, next, error) {
  let disposed = false, generation = 0, stopWallet = () => {};
  const stopProfile = onSnapshot(profileRef(uid), (profile) => {
    if (disposed || auth.currentUser?.uid !== uid) return;
    const version = ++generation;
    stopWallet();
    if (!profile.exists()) { next(null); return; }
    const id = profile.data().walletId;
    stopWallet = onSnapshot(walletRef(id), (snapshot) => {
      if (disposed || version !== generation || auth.currentUser?.uid !== uid) return;
      if (!snapshot.exists() || !snapshot.data().memberIds?.includes(uid)) { next(null); return; }
      next({ ...snapshot.data(), id: snapshot.id });
    }, (failure) => {
      if (disposed || version !== generation || auth.currentUser?.uid !== uid) return;
      next(null); error?.(failure);
    });
  }, (failure) => {
    if (!disposed && auth.currentUser?.uid === uid) { generation++; stopWallet(); next(null); error?.(failure); }
  });
  return () => { disposed = true; generation++; stopProfile(); stopWallet(); };
}

export function startWalletSession(uid, ready) {
  let previousId;
  setActiveWallet(uid);
  return subscribeSharedWallet(uid, (wallet) => {
    const scope = getWalletScope(uid);
    if (previousId === undefined || wallet?.id !== previousId || scope.walletId === wallet?.id || !wallet) {
      setActiveWallet(uid, wallet);
    }
    previousId = wallet?.id || null;
    ready();
  }, () => ready());
}

export async function createSharedWallet(name) {
  const uid = requireUid();
  const title = name.trim();
  if (!title || title.length > 60) throw new Error("쿠폰함 이름은 1~60자로 입력해 주세요.");
  const ref = doc(collection(db, "wallets"));
  await runTransaction(db, async (tx) => {
    const profile = await tx.get(profileRef(uid));
    assertUid(uid);
    if (profile.exists()) throw new Error("이미 연결된 공유 쿠폰함이 있습니다. 연결 상태를 먼저 확인해 주세요.");
    tx.set(ref, { name: title, ownerId: uid, memberIds: [uid], inviteHash: null, createdAt: new Date(), updatedAt: new Date() });
    tx.set(profileRef(uid), { walletId: ref.id });
  });
  return ref.id;
}

export async function createWalletInvitation(id) {
  const uid = requireUid();
  const code = Crypto.randomUUID().replace(/-/g, "");
  const hash = await codeHash(code);
  assertUid(uid);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await runTransaction(db, async (tx) => {
    const wallet = await tx.get(walletRef(id));
    assertUid(uid);
    if (!wallet.exists() || wallet.data().ownerId !== uid) throw new Error("쿠폰함을 만든 사람만 초대할 수 있습니다.");
    if (wallet.data().memberIds.length !== 1) throw new Error("이 쿠폰함에는 이미 두 사람이 참여 중입니다.");
    tx.set(doc(db, "walletInvites", hash), { walletId: id, ownerId: uid, walletName: wallet.data().name, expiresAt, acceptedBy: null });
    tx.update(walletRef(id), { inviteHash: hash, updatedAt: new Date() });
  });
  return { code, expiresAt };
}

export async function joinSharedWallet(input) {
  const uid = requireUid();
  const code = input.replace(/[\s-]/g, "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(code)) throw new Error("전달받은 초대 코드를 확인해 주세요.");
  const inviteRef = doc(db, "walletInvites", await codeHash(code));
  assertUid(uid);
  try {
    await runTransaction(db, async (tx) => {
      const profile = await tx.get(profileRef(uid));
      const invitation = await tx.get(inviteRef);
      assertUid(uid);
      if (profile.exists()) throw new Error("이미 연결된 공유 쿠폰함이 있습니다. 기존 쿠폰함에서 먼저 나가 주세요.");
      if (!invitation.exists()) throw new Error("초대 코드를 찾을 수 없습니다.");
      const invite = invitation.data();
      if (invite.ownerId === uid || invite.acceptedBy || timestamp(invite.expiresAt) <= Date.now()) throw new Error("사용할 수 없는 초대 코드입니다. 새 코드를 요청해 주세요.");
      // The invite and membership change commit together; a second join is rejected.
      tx.update(walletRef(invite.walletId), { memberIds: [invite.ownerId, uid], inviteHash: null, updatedAt: new Date() });
      tx.update(inviteRef, { acceptedBy: uid });
      tx.set(profileRef(uid), { walletId: invite.walletId });
    });
  } catch (error) {
    // The rules deny reads of unknown, expired or accepted invitations and joins
    // through replaced codes, so these surface as permission errors rather than
    // reaching the checks above. Raw rule diagnostics are not shown to people.
    if (error.code !== "permission-denied") throw error;
    throw Object.assign(new Error("초대 코드를 사용할 수 없습니다. 코드가 정확한지 확인하고, 만료됐거나 이미 사용된 코드라면 새 코드를 요청해 주세요."), { code: "wallet/invite-unavailable" });
  }
}

export async function removeWalletMember(id) {
  const uid = requireUid();
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(walletRef(id));
    assertUid(uid);
    if (!snapshot.exists()) throw new Error("쿠폰함을 찾을 수 없습니다.");
    const wallet = snapshot.data();
    if (!wallet.memberIds.includes(uid)) throw new Error("참여 중인 쿠폰함이 아닙니다.");
    if (wallet.ownerId !== uid) tx.delete(profileRef(uid));
    tx.update(walletRef(id), { memberIds: [wallet.ownerId], inviteHash: null, updatedAt: new Date() });
  });
}

export async function clearUnavailableWalletLink() {
  const uid = requireUid();
  const profile = await getDoc(profileRef(uid));
  assertUid(uid);
  if (!profile.exists()) return;
  try {
    const wallet = await getDoc(walletRef(profile.data().walletId));
    assertUid(uid);
    if (wallet.exists() && wallet.data().memberIds.includes(uid)) throw new Error("참여 중인 쿠폰함에서는 먼저 참여 해제를 선택해 주세요.");
  } catch (error) { if (error.code !== "permission-denied") throw error; }
  await runTransaction(db, async (tx) => {
    const current = await tx.get(profileRef(uid));
    assertUid(uid);
    if (current.exists() && current.data().walletId === profile.data().walletId) tx.delete(profileRef(uid));
  });
}
