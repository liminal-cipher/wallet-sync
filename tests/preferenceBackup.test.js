jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("expo-file-system/legacy", () => ({}));
jest.mock("expo-sharing", () => ({}));
jest.mock("expo-document-picker", () => ({}));
jest.mock("expo-print", () => ({}));
jest.mock("../src/services/firebase", () => ({ auth: { currentUser: { uid: "owner" } } }));
jest.mock("../src/services/firestoreService", () => ({ addCoupon: jest.fn(), fetchCoupons: jest.fn() }));
jest.mock("../src/services/imageService", () => ({ imageDataUri: jest.fn(), importImage: jest.fn(), uploadOriginal: jest.fn() }));
jest.mock("../src/services/localRecovery", () => ({ readLocal: jest.fn(), writeLocal: jest.fn(), captureSnapshot: jest.fn(), serialise: (v) => JSON.parse(JSON.stringify(v)) }));
const { parseWalletBackup, parseBackup, toCsv, validateRestoreSession } = require("../src/utils/backupData");
const { restoreWalletBackup, previewRestore, exportWallet } = require("../src/services/backupService");
const { auth } = require("../src/services/firebase");
const local = require("../src/services/localRecovery");
const server = require("../src/services/firestoreService");
const images = require("../src/services/imageService");
const preferences = () => ({ version: 1, favourites: ["retired-brand", "mega"], recent: ["daiso"] });
const record = (code = "00-12 34") => ({ kind: "voucher", brand: "Coffee", barcodeType: "code128", barcodeNumber: code, expiryDay: "2027-01-01", isUsed: false });
const envelope = (records = [record()]) => ({ app: "wallet-sync", version: 3, records, brandPreferences: preferences() });
const clone = (v) => JSON.parse(JSON.stringify(v));
let values;
beforeEach(() => {
  jest.resetAllMocks(); auth.currentUser = { uid: "owner" }; values = new Map();
  local.readLocal.mockImplementation(async (_uid, section) => clone(values.get(section) ?? null));
  local.writeLocal.mockImplementation(async (_uid, section, value) => { values.set(section, clone(value)); });
  local.captureSnapshot.mockResolvedValue(); server.fetchCoupons.mockResolvedValue([]); server.addCoupon.mockResolvedValue({ id: "one" });
});
test("JSON v3 preserves settings-only backups, retired IDs and exact barcode text", () => {
  const result = parseWalletBackup(JSON.stringify(envelope()), "json");
  expect(result.brandPreferences).toEqual(preferences());
  expect(result.records[0].barcodeNumber).toBe("00-12 34");
  expect(parseWalletBackup(JSON.stringify(envelope([])), "json")).toMatchObject({ records: [], brandPreferences: preferences() });
});
test.each([1, 2])("legacy JSON v%s and CSV import without fabricating preferences", (version) => {
  const source = { app: "wallet-sync", version, records: [record()] };
  expect(parseWalletBackup(JSON.stringify(source), "json").brandPreferences).toBeNull();
  expect(parseWalletBackup(toCsv([record()]), "csv").brandPreferences).toBeNull();
});
test("future, corrupt and missing preferences fail before any restore effects", async () => {
  for (const brandPreferences of [{ ...preferences(), version: 2 }, { ...preferences(), favourites: ["../other"] }, { ...preferences(), recent: "mega" }]) {
    expect(() => parseWalletBackup(JSON.stringify({ ...envelope(), brandPreferences }), "json")).toThrow("브랜드 설정");
    await expect(restoreWalletBackup({ records: [record()], brandPreferences })).rejects.toThrow("브랜드 설정");
  }
  const missing = envelope(); delete missing.brandPreferences;
  expect(() => parseWalletBackup(JSON.stringify(missing), "json")).toThrow("v3");
  expect(() => parseWalletBackup('{"app":', "json")).toThrow("JSON");
  expect(server.fetchCoupons).not.toHaveBeenCalled(); expect(local.writeLocal).not.toHaveBeenCalled();
});
test("preferences require explicit restoration and do not replace existing favourites", async () => {
  values.set("brand-preferences", { version: 1, favourites: ["paul-bassett"], recent: ["starbucks"] });
  await restoreWalletBackup(envelope([]));
  expect(values.get("brand-preferences").favourites).toEqual(["paul-bassett"]);
  await restoreWalletBackup(envelope([]), { includePreferences: true });
  expect(values.get("brand-preferences")).toEqual({ version: 1, favourites: ["paul-bassett", "retired-brand", "mega"], recent: ["starbucks", "daiso"] });
  expect(values.get("brand-preferences:before-restore").preferences.favourites).toEqual(["paul-bassett"]);
});
test("settings-only backups restore offline without replacing a server snapshot with an empty copy", async () => {
  server.fetchCoupons.mockRejectedValue(new Error("Offline"));
  expect(await previewRestore(envelope([]))).toMatchObject({ records: [], skipped: 0, brandPreferences: preferences() });
  await expect(restoreWalletBackup(envelope([]), { includePreferences: true })).resolves.toMatchObject({ added: 0, preferencesRestored: true });
  expect(values.get("brand-preferences")).toEqual(preferences());
  expect(server.fetchCoupons).not.toHaveBeenCalled(); expect(local.captureSnapshot).not.toHaveBeenCalled();
});
test("a setting write failure after coupon creation retains an input that resumes without duplicates", async () => {
  const write = local.writeLocal.getMockImplementation(); let fail = true;
  local.writeLocal.mockImplementation(async (uid, section, value) => {
    if (section === "brand-preferences" && fail) { fail = false; throw new Error("Disk full"); }
    return write(uid, section, value);
  });
  await expect(restoreWalletBackup(envelope(), { includePreferences: true })).rejects.toThrow("Disk full");
  const checkpoint = values.get("restore");
  expect(checkpoint).toMatchObject({ completed: 1, includePreferences: true, brandPreferences: preferences() });
  server.fetchCoupons.mockResolvedValue([record()]); server.addCoupon.mockClear();
  await expect(restoreWalletBackup(validateRestoreSession(checkpoint), { includePreferences: true })).resolves.toMatchObject({ added: 0, skipped: 1, preferencesRestored: true });
  expect(server.addCoupon).not.toHaveBeenCalled(); expect(values.get("restore")).toBeNull();
});
test("failure clearing a completed checkpoint is retryable without replacing its safety copy", async () => {
  values.set("brand-preferences", { version: 1, favourites: ["paul-bassett"], recent: [] });
  const write = local.writeLocal.getMockImplementation(); let fail = true;
  local.writeLocal.mockImplementation(async (uid, section, value) => {
    if (section === "restore" && value === null && fail) { fail = false; throw new Error("Checkpoint full"); }
    return write(uid, section, value);
  });
  await expect(restoreWalletBackup(envelope(), { includePreferences: true })).rejects.toThrow("Checkpoint full");
  const before = clone(values.get("brand-preferences:before-restore"));
  server.fetchCoupons.mockResolvedValue([record()]);
  await restoreWalletBackup(values.get("restore"), { includePreferences: true });
  expect(values.get("brand-preferences:before-restore")).toEqual(before);
});
test("account changes after fetching or retaining an image stop further mutations", async () => {
  server.fetchCoupons.mockImplementationOnce(async () => { auth.currentUser = { uid: "other" }; return []; });
  await expect(previewRestore(envelope())).rejects.toThrow("계정");
  expect(local.writeLocal).not.toHaveBeenCalled();
  auth.currentUser = { uid: "owner" };
  images.importImage.mockImplementationOnce(async () => { auth.currentUser = { uid: "other" }; return { ownerId: "owner" }; });
  await expect(restoreWalletBackup({ records: [{ ...record(), original: "data:image/png;base64,YQ==" }] })).rejects.toThrow("계정");
  expect(images.uploadOriginal).not.toHaveBeenCalled(); expect(server.addCoupon).not.toHaveBeenCalled();
  await expect(restoreWalletBackup(envelope(), { expectedUid: "owner" })).rejects.toThrow("계정");
});
test("overlapping restores are refused and a failed operation releases its lock", async () => {
  let reject;
  server.fetchCoupons.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const first = restoreWalletBackup(envelope());
  await expect(restoreWalletBackup(envelope())).rejects.toThrow("이미 복원");
  reject(new Error("Offline")); await expect(first).rejects.toThrow("Offline");
  await expect(restoreWalletBackup(envelope())).resolves.toMatchObject({ added: 1 });
});
test("a future existing checkpoint is retained instead of being replaced", async () => {
  values.set("restore", { version: 99, records: [record()], completed: 0 });
  await expect(restoreWalletBackup(envelope())).rejects.toThrow("중단된 복원");
  expect(values.get("restore").version).toBe(99); expect(server.addCoupon).not.toHaveBeenCalled();
});
test("export can bypass corrupt settings while preserving coupons and old settings", async () => {
  const originalDocument = global.document, originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  let blob;
  jest.useFakeTimers();
  global.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
  URL.createObjectURL = (value) => { blob = value; return "blob:test"; }; URL.revokeObjectURL = jest.fn();
  try {
    values.set("brand-preferences", { version: 99 });
    await expect(exportWallet("json", false, [record()])).rejects.toThrow("브랜드 설정");
    await exportWallet("json", false, [record()], null, false);
    expect(parseWalletBackup(await blob.text(), "json")).toMatchObject({ brandPreferences: null });
    expect(parseBackup(await blob.text(), "json")[0].barcodeNumber).toBe("00-12 34");
    expect(values.get("brand-preferences")).toEqual({ version: 99 });
  } finally {
    jest.runOnlyPendingTimers(); jest.useRealTimers();
    if (originalDocument === undefined) delete global.document; else global.document = originalDocument;
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  }
});
