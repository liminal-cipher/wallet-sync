jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(), setItem: jest.fn(),
}));
const storage = require("@react-native-async-storage/async-storage");
const { captureSnapshot, readLocal, writeLocal } = require("../src/services/localRecovery");
const { normaliseCoupon } = require("../src/utils/couponModel");
const { toCsv, parseBackup, planRestore, validateBackupRecords } = require("../src/utils/backupData");
const { validateReminders } = require("../src/services/reminderSettings");
const { backupRange, selectBackupRange } = require("../src/utils/backupRange");
const { catalogue } = require("./catalogueFixtures");
let values;
const coupon = (overrides = {}) => ({ kind: "voucher", brand: "Coffee", barcodeType: "code128", barcodeNumber: "12-34 56", expiryDay: "2027-01-01", isUsed: false, ...overrides });
beforeEach(() => {
  jest.clearAllMocks();
  values = new Map();
  storage.getItem.mockImplementation(async (key) => values.get(key) ?? null);
  storage.setItem.mockImplementation(async (key, value) => { values.set(key, value); });
});
test("CSV round-trips quotes, newlines, formula prefixes and the original barcode payload", () => {
  const records = [normaliseCoupon(coupon({ brand: '=HYPERLINK("https://example.com")', conditions: "line 1\nline 2, 'quoted'" })), normaliseCoupon(coupon({ barcodeNumber: "'1234", brand: "'Brand" }))];
  const csv = toCsv(records);
  expect(csv).toContain("'=HYPERLINK");
  const restored = parseBackup(csv, "csv");
  expect(restored[0]).toMatchObject(records[0]);
  expect(restored[1]).toMatchObject(records[1]);
});
test("invalid backups reject the whole file, including future versions and impossible dates", () => {
  expect(() => parseBackup('{"app":"wallet-sync","version":99,"records":[]}', "json")).toThrow("버전");
  expect(() => validateBackupRecords([coupon(), coupon({ expiryDay: "2027-02-29" })])).toThrow("2번째");
  expect(() => validateBackupRecords([coupon({ isUsed: "false" })])).toThrow("사용 상태");
  expect(() => validateBackupRecords([coupon({ sourceUrl: "javascript:alert(1)" })])).toThrow("https");
  expect(() => validateBackupRecords([coupon({ original: "data:text/html;base64,YQ==" })])).toThrow("이미지");
  expect(() => validateBackupRecords([coupon({ provider: "constructor" })])).toThrow("제공사");
  expect(() => parseBackup(toCsv([normaliseCoupon(coupon())]).replace('"Coffee"', '"Coffee"junk'), "csv")).toThrow("따옴표");
});
test("restore planning skips existing and in-file duplicates without mutating either input", () => {
  const old = coupon({ deletedAt: "2026-10-10T00:00:00.000Z" });
  const records = [coupon(), coupon({ barcodeNumber: "new" }), coupon({ barcodeNumber: "new" })];
  expect(planRestore(records, [old])).toMatchObject({ skipped: 2, additions: [records[1]] });
  expect(old.deletedAt).toBeTruthy();
  expect(records).toHaveLength(3);
});
test("automatic snapshots remain account-scoped and keep the last non-empty copy", async () => {
  await Promise.all([captureSnapshot("one", [coupon()]), captureSnapshot("two", [coupon({ brand: "Other" })])]);
  await captureSnapshot("one", []);
  for (let i = 0; i < 8; i++) await captureSnapshot("one", [coupon({ brand: String(i), deletedAt: true })]);
  expect((await readLocal("one", "snapshots"))[0].records[0].brand).toBe("7");
  expect((await readLocal("two", "snapshots"))[0].records[0].brand).toBe("Other");
  await captureSnapshot("empty", [coupon()]);
  await captureSnapshot("empty", []);
  await captureSnapshot("empty", []);
  expect((await readLocal("empty", "snapshots"))).toHaveLength(2);
  expect((await readLocal("empty", "snapshots"))[1].records).toHaveLength(1);
});
test("corrupt local storage is not silently replaced", async () => {
  storage.getItem.mockResolvedValueOnce("invalid-json");
  await expect(captureSnapshot("corrupt", [coupon()])).rejects.toThrow("기존 파일");
  expect(storage.setItem).not.toHaveBeenCalled();
});

test.each(["null", "{}", '[{"savedAt":"2026-10-27","records":null}]'])("valid JSON with an invalid snapshot shape is preserved: %s", async (text) => {
  storage.getItem.mockResolvedValueOnce(text);
  await expect(captureSnapshot("broken-shape", [coupon()])).rejects.toThrow("기존 파일");
  expect(storage.setItem).not.toHaveBeenCalled();
});
test("drafts preserve Unicode and barcode punctuation per account", async () => {
  await writeLocal("one", "draft:new", { barcodeNumber: "안녕-12 34" });
  expect(await readLocal("one", "draft:new")).toEqual({ barcodeNumber: "안녕-12 34" });
  expect(await readLocal("two", "draft:new")).toBeNull();
});
test("drafts and automatic snapshots retain full catalogue snapshots and monetary unknowns", async () => {
  const record = normaliseCoupon(coupon({ catalogue: catalogue({ benefitType: "monetary", money: {
    currency: "KRW", faceValue: 10000, remainingBalance: null, balanceMode: "manual",
  } }) }));
  await writeLocal("catalogue-owner", "draft:new", { form: record, revision: 0 });
  await captureSnapshot("catalogue-owner", [record]);
  const draft = await readLocal("catalogue-owner", "draft:new");
  const records = (await readLocal("catalogue-owner", "snapshots"))[0].records;
  expect(draft.form).toEqual(record);
  expect(validateBackupRecords(records, { localImages: true })[0]).toMatchObject(record);
  expect(records[0].catalogue.money.remainingBalance).toBeNull();
});
test("invalid metadata cannot replace a valid recovery snapshot or draft", async () => {
  const record = normaliseCoupon(coupon({ catalogue: catalogue() }));
  await captureSnapshot("valid-metadata", [record]);
  const original = await readLocal("valid-metadata", "snapshots");
  const invalid = { ...record, catalogue: catalogue({ money: { currency: "KRW", faceValue: NaN } }) };
  await expect(captureSnapshot("valid-metadata", [invalid])).rejects.toThrow("faceValue");
  expect(await readLocal("valid-metadata", "snapshots")).toEqual(original);
  await writeLocal("valid-metadata", "draft:new", { form: record });
  await expect(writeLocal("valid-metadata", "draft:new", { form: invalid })).rejects.toThrow("faceValue");
  expect((await readLocal("valid-metadata", "draft:new")).form).toEqual(record);
});
test("reminder preferences validate time boundaries and deduplicate target days", () => {
  expect(validateReminders({ enabled: true, hour: 23, minute: 59, days: [3, 0, 3] }).days).toEqual([3, 0]);
  expect(() => validateReminders({ enabled: true, hour: 24, minute: 0, days: [0] })).toThrow("00:00");
});
test("large wallets can be exported in explicit ranges without dropping boundary records", () => {
  const records = [1, 2, 3, 4, 5];
  expect([...selectBackupRange(records, backupRange("1", "2")), ...selectBackupRange(records, backupRange("3", ""))]).toEqual(records);
  expect(() => backupRange("0", "2")).toThrow();
  expect(() => selectBackupRange(records, backupRange("1", "6"))).toThrow();
  expect(selectBackupRange([], backupRange("1", ""))).toEqual([]);
});
