import { auth } from "./firebase";
import { readLocal, writeLocal } from "./localRecovery";
import { emptyBrandPreferences, validateBrandPreferences, mergePreferenceData } from "../utils/brandPreferenceData";

const queues = new Map();
const section = "brand-preferences";
const validate = (value) => value == null ? emptyBrandPreferences() : validateBrandPreferences(value);
function account(uid) { if (!uid || auth.currentUser?.uid !== uid) throw new Error("계정이 변경됐습니다."); }
export async function loadBrandPreferences(uid) {
  account(uid); const result = validate(await readLocal(uid, section)); account(uid); return result;
}
function update(uid, change, preserve = false) {
  const operation = (queues.get(uid) || Promise.resolve()).catch(() => {}).then(async () => {
    const previous = await loadBrandPreferences(uid);
    const next = validate(await change(previous));
    account(uid);
    if (JSON.stringify(previous) === JSON.stringify(next)) return next;
    if (preserve) {
      await writeLocal(uid, "brand-preferences:before-restore", { version: 1, savedAt: new Date().toISOString(), preferences: previous });
      account(uid);
    }
    account(uid); await writeLocal(uid, section, next); account(uid); return next;
  });
  queues.set(uid, operation);
  return operation;
}
export const toggleFavouriteBrand = (uid, id) => update(uid, (value) => ({ ...value,
  favourites: value.favourites.includes(id) ? value.favourites.filter((item) => item !== id) : [...value.favourites, id] }));
export const rememberBrand = (uid, id) => update(uid, (value) => ({ ...value, recent: [id, ...value.recent.filter((item) => item !== id)].slice(0, 12) }));
export const mergeBrandPreferences = (uid, incoming) => {
  const validated = validateBrandPreferences(incoming);
  return update(uid, (current) => mergePreferenceData(current, validated), true);
};
export const restorePreviousBrandPreferences = (uid) => update(uid, async () => {
  const copy = await readLocal(uid, "brand-preferences:before-restore");
  account(uid);
  if (copy?.version !== 1) throw new Error("복원 전 브랜드 설정 사본이 없습니다.");
  return validateBrandPreferences(copy.preferences);
}, true);
