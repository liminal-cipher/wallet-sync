jest.mock("../src/services/firebase", () => ({ auth: { currentUser: { uid: "one" } } }));
jest.mock("../src/services/localRecovery", () => ({ readLocal: jest.fn(), writeLocal: jest.fn() }));
const { auth } = require("../src/services/firebase");
const local = require("../src/services/localRecovery");
const { loadBrandPreferences, toggleFavouriteBrand, rememberBrand, mergeBrandPreferences, restorePreviousBrandPreferences } = require("../src/services/brandPreferences");
let values;
beforeEach(() => {
  jest.clearAllMocks(); auth.currentUser = { uid: "one" }; values = new Map();
  local.readLocal.mockImplementation(async (uid, section) => values.get(`${uid}:${section}`) || null);
  local.writeLocal.mockImplementation(async (uid, section, value) => values.set(`${uid}:${section}`, value));
});
test("concurrent favourite and recent updates are serialised without losing either change", async () => {
  await Promise.all([toggleFavouriteBrand("one", "paul-bassett"), toggleFavouriteBrand("one", "mega"), rememberBrand("one", "daiso")]);
  expect(await loadBrandPreferences("one")).toMatchObject({ favourites: ["paul-bassett", "mega"], recent: ["daiso"] });
  await toggleFavouriteBrand("one", "mega");
  expect((await loadBrandPreferences("one")).favourites).toEqual(["paul-bassett"]);
});
test("recent history is unique, bounded and records the latest successful choice first", async () => {
  for (let i = 0; i < 15; i++) await rememberBrand("one", `brand-${i}`);
  await rememberBrand("one", "brand-10");
  const result = await loadBrandPreferences("one");
  expect(result.recent).toHaveLength(12); expect(result.recent[0]).toBe("brand-10");
  expect(new Set(result.recent).size).toBe(12);
});
test("account changes cannot expose preferences or write another account's pending changes", async () => {
  await toggleFavouriteBrand("one", "mega");
  auth.currentUser = { uid: "two" };
  expect((await loadBrandPreferences("two")).favourites).toEqual([]);
  await expect(loadBrandPreferences("one")).rejects.toThrow("계정");
  local.readLocal.mockImplementationOnce(async () => { auth.currentUser = { uid: "three" }; return null; });
  local.writeLocal.mockClear();
  await expect(toggleFavouriteBrand("two", "mega")).rejects.toThrow("계정");
  expect(local.writeLocal).not.toHaveBeenCalled();
});
test("corrupt or future preferences and storage failures never replace the old copy", async () => {
  local.readLocal.mockResolvedValueOnce({ version: 2, favourites: ["mega"], recent: [] });
  await expect(toggleFavouriteBrand("one", "daiso")).rejects.toThrow("기존 사본");
  expect(local.writeLocal).not.toHaveBeenCalled();
  local.writeLocal.mockRejectedValueOnce(new Error("Storage full"));
  await expect(toggleFavouriteBrand("one", "mega")).rejects.toThrow("Storage full");
  expect((await loadBrandPreferences("one")).favourites).toEqual([]);
  await toggleFavouriteBrand("one", "daiso");
  expect((await loadBrandPreferences("one")).favourites).toEqual(["daiso"]);
});
test("restored preferences merge behind current choices, retain retired IDs and can be undone", async () => {
  await toggleFavouriteBrand("one", "mega"); await rememberBrand("one", "daiso");
  const previous = await loadBrandPreferences("one");
  await mergeBrandPreferences("one", { version: 1, favourites: ["mega", "retired-brand"], recent: ["paul-bassett", "daiso"] });
  expect(await loadBrandPreferences("one")).toEqual({ version: 1, favourites: ["mega", "retired-brand"], recent: ["daiso", "paul-bassett"] });
  const saved = values.get("one:brand-preferences:before-restore");
  await mergeBrandPreferences("one", { version: 1, favourites: ["retired-brand"], recent: ["paul-bassett"] });
  expect(values.get("one:brand-preferences:before-restore")).toEqual(saved);
  await restorePreviousBrandPreferences("one"); expect(await loadBrandPreferences("one")).toEqual(previous);
});
test("a failed safety-copy write and an overflowing merge leave preferences untouched", async () => {
  await toggleFavouriteBrand("one", "mega");
  local.writeLocal.mockRejectedValueOnce(new Error("Disk full"));
  await expect(mergeBrandPreferences("one", { version: 1, favourites: ["daiso"], recent: [] })).rejects.toThrow("Disk full");
  expect((await loadBrandPreferences("one")).favourites).toEqual(["mega"]);
  await expect(mergeBrandPreferences("one", { version: 1, favourites: Array.from({ length: 100 }, (_, i) => `brand-${i}`), recent: [] })).rejects.toThrow("100개");
  expect((await loadBrandPreferences("one")).favourites).toEqual(["mega"]);
});
test("an account switch during the safety copy cannot apply imported settings", async () => {
  local.writeLocal.mockImplementationOnce(async () => { auth.currentUser = { uid: "two" }; });
  await expect(mergeBrandPreferences("one", { version: 1, favourites: ["daiso"], recent: [] })).rejects.toThrow("계정");
  expect(values.get("one:brand-preferences")).toBeUndefined();
  expect(values.get("two:brand-preferences")).toBeUndefined();
});
