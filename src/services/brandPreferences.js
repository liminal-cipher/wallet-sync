import { auth } from "./firebase";
import { readLocal, writeLocal } from "./localRecovery";

const queues = new Map();
const section = "brand-preferences";
const empty = () => ({ version: 1, favourites: [], recent: [] });
function validate(value) {
  if (value == null) return empty();
  const valid = (list, max) => Array.isArray(list) && list.length <= max && list.every((id) => typeof id === "string" && id.length <= 80 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id));
  if (value.version !== 1 || Object.keys(value).some((key) => !["version", "favourites", "recent"].includes(key)) ||
      !valid(value.favourites, 100) || !valid(value.recent, 12)) throw new Error("브랜드 설정을 읽지 못했습니다. 기존 사본은 유지됩니다.");
  return { version: 1, favourites: [...new Set(value.favourites)], recent: [...new Set(value.recent)] };
}
function account(uid) { if (!uid || auth.currentUser?.uid !== uid) throw new Error("계정이 변경됐습니다."); }
export async function loadBrandPreferences(uid) {
  account(uid); const result = validate(await readLocal(uid, section)); account(uid); return result;
}
function update(uid, change) {
  const operation = (queues.get(uid) || Promise.resolve()).catch(() => {}).then(async () => {
    const previous = await loadBrandPreferences(uid);
    const next = validate(change(previous));
    account(uid); await writeLocal(uid, section, next); account(uid); return next;
  });
  queues.set(uid, operation);
  return operation;
}
export const toggleFavouriteBrand = (uid, id) => update(uid, (value) => ({ ...value,
  favourites: value.favourites.includes(id) ? value.favourites.filter((item) => item !== id) : [...value.favourites, id] }));
export const rememberBrand = (uid, id) => update(uid, (value) => ({ ...value, recent: [id, ...value.recent.filter((item) => item !== id)].slice(0, 12) }));
