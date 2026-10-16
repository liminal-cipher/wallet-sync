jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("expo-file-system/legacy", () => ({}));
jest.mock("expo-sharing", () => ({}));
jest.mock("expo-document-picker", () => ({}));
jest.mock("expo-print", () => ({}));
jest.mock("../src/services/firebase", () => ({ auth: { currentUser: { uid: "owner" } } }));
jest.mock("../src/services/firestoreService", () => ({ addCoupon: jest.fn(), fetchCoupons: jest.fn() }));
jest.mock("../src/services/imageService", () => ({ imageDataUri: jest.fn(), importImage: jest.fn(), uploadOriginal: jest.fn() }));
jest.mock("../src/services/localRecovery", () => ({ captureSnapshot: jest.fn(), writeLocal: jest.fn() }));
const { restoreRecords } = require("../src/services/backupService");
const firestore = require("../src/services/firestoreService");
const local = require("../src/services/localRecovery");
const images = require("../src/services/imageService");
const record = (barcodeNumber) => ({ brand: "Coffee", kind: "voucher", barcodeType: "code128", barcodeNumber, expiryDay: "2027-01-01", isUsed: false });
beforeEach(() => {
  jest.clearAllMocks(); firestore.fetchCoupons.mockResolvedValue([]); firestore.addCoupon.mockReset().mockResolvedValue({ id: "new" });
  local.captureSnapshot.mockResolvedValue(); local.writeLocal.mockResolvedValue();
});
test("storage failure before checkpoint prevents any restore writes", async () => {
  local.writeLocal.mockRejectedValueOnce(new Error("Storage full"));
  await expect(restoreRecords([record("one")])).rejects.toThrow("Storage full");
  expect(firestore.addCoupon).not.toHaveBeenCalled();
});
test("a network interruption retains the input checkpoint and can resume without overwriting restored records", async () => {
  firestore.addCoupon.mockResolvedValueOnce({ id: "one" }).mockRejectedValueOnce(new Error("Offline"));
  await expect(restoreRecords([record("one"), record("two")])).rejects.toThrow("1개 복원 후 중단");
  expect(local.writeLocal).toHaveBeenLastCalledWith("owner", "restore", expect.objectContaining({ completed: 1, records: [record("one"), record("two")] }));
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
  expect(firestore.addCoupon).toHaveBeenCalledWith(expect.objectContaining({ image: { id: "image", ownerId: "owner" }, deletedAt: "2026-10-17" }), { restore: true });
});
