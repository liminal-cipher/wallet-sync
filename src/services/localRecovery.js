import storage from "./recoveryStorage";
import { normaliseCatalogueMetadata } from "../utils/catalogueModel";
import { normaliseCoupon } from "../utils/couponModel";
import { getWalletScope, walletLocalSection } from "./walletSession";

const key = (uid, section, scope) => `wallet-sync:v1:${encodeURIComponent(uid)}:${walletLocalSection(uid, section, scope)}`;
const queues = new Map();
const writes = new Map();
export const serialise = (value) => JSON.parse(JSON.stringify(value, (_key, item) => {
  // Refuse invalid/future metadata before JSON can silently turn NaN into null.
  if (_key === "catalogue" && item !== undefined && item !== null) return normaliseCatalogueMetadata(item);
  if (item && typeof item.toDate === "function") return item.toDate().toISOString();
  if (item && typeof item.seconds === "number" && typeof item.nanoseconds === "number") {
    return new Date(item.seconds * 1000 + item.nanoseconds / 1e6).toISOString();
  }
  return item;
}));
export async function readLocal(uid, section, fallback = null, scope = getWalletScope(uid)) {
  if (!uid) return fallback;
  const storageKey = key(uid, section, scope);
  await writes.get(storageKey)?.catch(() => {});
  const value = await storage.getItem(storageKey);
  if (value === null) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (section === "snapshots") {
      if (!Array.isArray(parsed) || parsed.some((copy) => !copy || typeof copy.savedAt !== "string" ||
          !Number.isFinite(Date.parse(copy.savedAt)) || !Array.isArray(copy.records))) throw new Error();
      for (const copy of parsed) for (const record of copy.records) normaliseCoupon(record);
    }
    return parsed;
  } catch { throw new Error("기기 내 사본을 읽지 못했습니다. 기존 파일은 유지됩니다."); }
}
export function writeLocal(uid, section, value, scope = getWalletScope(uid)) {
  if (!uid) return Promise.reject(new Error("로그인이 필요합니다."));
  const storageKey = key(uid, section, scope);
  let text;
  try { text = JSON.stringify(serialise(value)); }
  catch (error) { return Promise.reject(error); }
  const result = (writes.get(storageKey) || Promise.resolve()).catch(() => {}).then(() => storage.setItem(storageKey, text));
  writes.set(storageKey, result);
  const cleanup = () => { if (writes.get(storageKey) === result) writes.delete(storageKey); };
  result.then(cleanup, cleanup);
  return result;
}
export function captureSnapshot(uid, coupons) {
  const scope = getWalletScope(uid);
  const queueKey = key(uid, "snapshots", scope);
  const previous = queues.get(queueKey) || Promise.resolve();
  const result = previous.catch(() => {}).then(async () => {
    const copies = await readLocal(uid, "snapshots", [], scope);
    const records = serialise(coupons);
    if (JSON.stringify(copies[0]?.records) === JSON.stringify(records)) return;
    // Keep the last non-empty copy even after repeated legitimate empty snapshots.
    const nonEmpty = copies.find((copy) => copy.records.length);
    const next = [{ savedAt: new Date().toISOString(), records }, ...copies].slice(0, 5);
    if (nonEmpty && !next.some((copy) => copy.savedAt === nonEmpty.savedAt)) next.push(nonEmpty);
    await writeLocal(uid, "snapshots", next, scope);
  });
  queues.set(queueKey, result);
  const cleanup = () => { if (queues.get(queueKey) === result) queues.delete(queueKey); };
  result.then(cleanup, cleanup);
  return result;
}
