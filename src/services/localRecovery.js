import storage from "./recoveryStorage";
import { normaliseCatalogueMetadata } from "../utils/catalogueModel";
import { normaliseCoupon } from "../utils/couponModel";

const key = (uid, section) => `wallet-sync:v1:${encodeURIComponent(uid)}:${section}`;
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
export async function readLocal(uid, section, fallback = null) {
  if (!uid) return fallback;
  await writes.get(key(uid, section))?.catch(() => {});
  const value = await storage.getItem(key(uid, section));
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
export function writeLocal(uid, section, value) {
  if (!uid) return Promise.reject(new Error("로그인이 필요합니다."));
  const storageKey = key(uid, section);
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
  const previous = queues.get(uid) || Promise.resolve();
  const result = previous.catch(() => {}).then(async () => {
    const copies = await readLocal(uid, "snapshots", []);
    const records = serialise(coupons);
    if (JSON.stringify(copies[0]?.records) === JSON.stringify(records)) return;
    // Keep the last non-empty copy even after repeated legitimate empty snapshots.
    const nonEmpty = copies.find((copy) => copy.records.length);
    const next = [{ savedAt: new Date().toISOString(), records }, ...copies].slice(0, 5);
    if (nonEmpty && !next.some((copy) => copy.savedAt === nonEmpty.savedAt)) next.push(nonEmpty);
    await writeLocal(uid, "snapshots", next);
  });
  queues.set(uid, result);
  const cleanup = () => { if (queues.get(uid) === result) queues.delete(uid); };
  result.then(cleanup, cleanup);
  return result;
}
