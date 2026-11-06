// Session changes invalidate in-flight work, including a switch away and back.
let active = { uid: null, wallet: null, generation: 0 };
const observers = new Set();
export function getWalletScope(uid) {
  const wallet = active.uid === uid ? active.wallet : null;
  return { uid, walletId: wallet?.id || null, name: wallet?.name || "개인 쿠폰함",
    generation: active.generation };
}
export function assertWalletScope(scope) {
  const current = getWalletScope(scope.uid);
  if (current.generation !== scope.generation || current.walletId !== scope.walletId) {
    throw new Error("쿠폰함이 변경됐습니다. 다시 열어 시도해 주세요.");
  }
}
export function setActiveWallet(uid, wallet = null) {
  if (wallet && (!/^[A-Za-z0-9_-]{1,128}$/.test(wallet.id) || !wallet.memberIds?.includes(uid))) {
    throw new Error("참여 중인 쿠폰함을 선택해 주세요.");
  }
  const next = wallet ? { id: wallet.id, name: wallet.name, memberIds: [...wallet.memberIds] } : null;
  if (active.uid === uid && JSON.stringify(active.wallet) === JSON.stringify(next)) return;
  active = { uid, wallet: next, generation: active.generation + 1 };
  for (const observer of observers) observer(getWalletScope(uid));
}
export function observeWalletScope(observer) {
  observers.add(observer);
  return () => observers.delete(observer);
}
export function walletLocalSection(uid, section, scope = getWalletScope(uid)) {
  const scoped = section === "snapshots" || section.startsWith("draft:") || section === "restore" || section.startsWith("restore:");
  const { walletId } = scope;
  return scoped && walletId ? `wallet:${walletId}:${section}` : section;
}
