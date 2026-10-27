jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("expo-file-system/legacy", () => ({ documentDirectory: "file://documents/", writeAsStringAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({}));
jest.mock("expo-print", () => ({ printToFileAsync: jest.fn() }));
jest.mock("../src/services/firebase", () => ({ auth: { currentUser: { uid: "owner" } } }));
jest.mock("../src/services/firestoreService", () => ({ addCoupon: jest.fn(), fetchCoupons: jest.fn() }));
jest.mock("../src/services/imageService", () => ({ imageDataUri: jest.fn(), importImage: jest.fn(), uploadOriginal: jest.fn() }));
jest.mock("../src/services/localRecovery", () => ({ captureSnapshot: jest.fn(), readLocal: jest.fn(), writeLocal: jest.fn(), serialise: (value) => JSON.parse(JSON.stringify(value)) }));
const { restoreRecords, exportWallet } = require("../src/services/backupService");
const { catalogue } = require("./catalogueFixtures");
const { validateBackupRecords, parseBackup } = require("../src/utils/backupData");
const { toDate } = require("../src/utils/dateUtils");
const firestore = require("../src/services/firestoreService");
const local = require("../src/services/localRecovery");
const images = require("../src/services/imageService");
const record = (barcodeNumber) => ({ brand: "Coffee", kind: "voucher", barcodeType: "code128", barcodeNumber, expiryDay: "2027-01-01", isUsed: false });
beforeEach(() => {
  jest.clearAllMocks(); firestore.fetchCoupons.mockResolvedValue([]); firestore.addCoupon.mockReset().mockResolvedValue({ id: "new" });
  local.captureSnapshot.mockResolvedValue(); local.writeLocal.mockResolvedValue();
  local.readLocal.mockResolvedValue(null);
});
test("storage failure before checkpoint prevents any restore writes", async () => {
  local.writeLocal.mockRejectedValueOnce(new Error("Storage full"));
  await expect(restoreRecords([record("one")])).rejects.toThrow("Storage full");
  expect(firestore.addCoupon).not.toHaveBeenCalled();
});

test("native exports cannot open a share sheet after the account changes during file writing", async () => {
  const { Platform } = require("react-native");
  const files = require("expo-file-system/legacy");
  const sharing = require("expo-sharing");
  const { auth } = require("../src/services/firebase");
  Platform.OS = "ios";
  files.writeAsStringAsync.mockImplementationOnce(async () => { auth.currentUser = { uid: "other" }; });
  sharing.isAvailableAsync.mockResolvedValue(true);
  try {
    await expect(exportWallet("json", false, [record("one")], null, false)).rejects.toThrow("계정");
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  } finally { Platform.OS = "web"; auth.currentUser = { uid: "owner" }; }
});
test("a network interruption retains the input checkpoint and can resume without overwriting restored records", async () => {
  firestore.addCoupon.mockResolvedValueOnce({ id: "one" }).mockRejectedValueOnce(new Error("Offline"));
  await expect(restoreRecords([record("one"), record("two")])).rejects.toThrow("1개 복원 후 중단");
  expect(local.writeLocal).toHaveBeenLastCalledWith("owner", "restore", expect.objectContaining({ completed: 1, records: validateBackupRecords([record("one"), record("two")]) }));
  firestore.fetchCoupons.mockResolvedValue([record("one")]);
  firestore.addCoupon.mockClear().mockResolvedValue({ id: "two" });
  await expect(restoreRecords([record("one"), record("two")])).resolves.toMatchObject({ added: 1, skipped: 1 });
  expect(firestore.addCoupon).toHaveBeenCalledTimes(1);
  expect(firestore.addCoupon).toHaveBeenCalledWith(expect.objectContaining({ barcodeNumber: "two" }), { restore: true });
  expect(local.writeLocal).toHaveBeenLastCalledWith("owner", "restore", null);
});
test("portable originals are retained before creation and a cloud failure is reported as local-only", async () => {
  images.importImage.mockResolvedValue({ id: "image", ownerId: "owner" });
  images.uploadOriginal.mockResolvedValue({ image: { id: "image", ownerId: "owner" }, localOnly: true });
  await expect(restoreRecords([{ ...record("one"), original: "data:image/png;base64,YQ==", deletedAt: "2026-10-17" }])).resolves.toMatchObject({ added: 1, localOnly: 1 });
  expect(firestore.addCoupon).toHaveBeenCalledWith(expect.objectContaining({ image: { id: "image", ownerId: "owner" }, deletedAt: toDate("2026-10-17") }), { restore: true });
});
test("all metadata is validated before any restore checkpoint or network call", async () => {
  await expect(restoreRecords([record("one"), { ...record("two"), catalogue: { ...catalogue(), schemaVersion: 2 } }])).rejects.toThrow("2번째");
  expect(firestore.fetchCoupons).not.toHaveBeenCalled();
  expect(firestore.addCoupon).not.toHaveBeenCalled();
  expect(local.writeLocal).not.toHaveBeenCalled();
});
test("an interrupted metadata restore retains full values and resumes additively", async () => {
  const records = ["one", "two"].map((code) => ({ ...record(code), catalogue: catalogue() }));
  firestore.addCoupon.mockResolvedValueOnce({ id: "one" }).mockRejectedValueOnce(new Error("Offline"));
  await expect(restoreRecords(records)).rejects.toThrow("1개 복원 후 중단");
  const checkpoint = local.writeLocal.mock.calls.at(-1)[2];
  expect(checkpoint.records[1].catalogue.snapshot.productName).toBe("룽고");
  firestore.fetchCoupons.mockResolvedValue([records[0]]);
  firestore.addCoupon.mockClear().mockResolvedValue({ id: "two" });
  await expect(restoreRecords(checkpoint.records)).resolves.toMatchObject({ added: 1, skipped: 1 });
  expect(firestore.addCoupon.mock.calls[0][0].catalogue).toEqual(checkpoint.records[1].catalogue);
});
describe("portable export contract", () => {
  let blob, originalDocument, originalCreate, originalRevoke;
  beforeEach(() => {
    jest.useFakeTimers();
    originalDocument = global.document;
    originalCreate = URL.createObjectURL; originalRevoke = URL.revokeObjectURL;
    global.document = { createElement: () => ({ click: jest.fn(), remove: jest.fn() }), body: { appendChild: jest.fn() } };
    URL.createObjectURL = jest.fn((value) => { blob = value; return "blob:wallet-test"; });
    URL.revokeObjectURL = jest.fn();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers(); jest.useRealTimers();
    if (originalDocument === undefined) delete global.document; else global.document = originalDocument;
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  });
  test.each(["json", "csv"])("%s exports retain catalogue metadata and can be imported", async (format) => {
    const input = { ...record("00-12 34"), catalogue: catalogue(), image: { id: "12345678-1234-1234-1234-123456789abc", ownerId: "owner", mime: "image/png" } };
    firestore.fetchCoupons.mockResolvedValue([input]);
    images.imageDataUri.mockResolvedValue("data:image/png;base64,YQ==");
    await exportWallet(format, true);
    const output = await blob.text();
    if (format === "json") expect(JSON.parse(output).version).toBe(3);
    const restored = parseBackup(output, format)[0];
    expect(restored).toMatchObject({ barcodeNumber: "00-12 34", catalogue: validateBackupRecords([input])[0].catalogue, image: null,
      original: format === "json" ? "data:image/png;base64,YQ==" : null });
  });
  test("local snapshot export works without the server and preserves metadata", async () => {
    firestore.fetchCoupons.mockRejectedValue(new Error("Offline"));
    const records = [{ ...record("one"), catalogue: catalogue() }];
    await exportWallet("json", false, records);
    expect(firestore.fetchCoupons).not.toHaveBeenCalled();
    expect(parseBackup(await blob.text(), "json")[0].catalogue).toEqual(validateBackupRecords(records)[0].catalogue);
  });
  test("invalid numbers cannot be silently converted into unknown amounts by export", async () => {
    const records = [{ ...record("one"), catalogue: catalogue({ money: { currency: "KRW", faceValue: NaN } }) }];
    await expect(exportWallet("json", false, records)).rejects.toThrow("faceValue");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  test("printable output includes saved catalogue details and escapes untrusted names", async () => {
    const { Platform } = require("react-native"), print = require("expo-print"), sharing = require("expo-sharing");
    Platform.OS = "android";
    print.printToFileAsync.mockResolvedValue({ uri: "test-wallet.pdf" });
    sharing.isAvailableAsync.mockResolvedValue(true);
    try {
      await exportWallet("pdf", false, [{ ...record("one"), catalogue: catalogue({ issuer: "<script>untrusted</script>" }) }]);
      const html = print.printToFileAsync.mock.calls[0][0].html;
      expect(html).toContain("룽고"); expect(html).toContain("5,000");
      expect(html).toContain("https://example.com/menu");
      expect(html).toContain("&lt;script&gt;untrusted&lt;/script&gt;"); expect(html).not.toContain("<script>");
    } finally { Platform.OS = "web"; }
  });
});
