const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, setLogLevel, deleteDoc } = require("firebase/firestore");
let mockDb;
let mockUid = "owner";
jest.mock("../src/services/firebase", () => ({ get db() { return mockDb; }, auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "sha256" }, digestStringAsync: async (_algorithm, text) => require("crypto").createHash("sha256").update(text).digest("hex") }));
jest.mock("../src/services/localRecovery", () => ({ captureSnapshot: jest.fn().mockResolvedValue() }));
const service = require("../src/services/firestoreService");
const address = process.env.FIRESTORE_EMULATOR_HOST;
const integration = address ? describe : describe.skip;
const input = (changes = {}) => ({ brand: "Coffee", barcodeType: "code128", barcodeNumber: "12-34 56", expiryDay: "2027-01-01", ...changes });
integration("transactional coupon recovery", () => {
  let environment;
  beforeAll(async () => {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(address)) throw new Error("A loopback emulator is required.");
    const [host, port] = address.split(":");
    setLogLevel("silent");
    environment = await initializeTestEnvironment({ projectId: "demo-wallet-sync-rules", firestore: {
      host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, "../firestore.rules"), "utf8"),
    } });
  });
  beforeEach(async () => {
    await environment.clearFirestore(); mockUid = "owner";
    mockDb = environment.authenticatedContext("owner").firestore();
  });
  afterAll(async () => { await environment?.cleanup(); });
  test("simultaneous submissions create exactly one record and preserve punctuation", async () => {
    const results = await Promise.allSettled([service.addCoupon(input()), service.addCoupon(input())]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const records = await service.fetchCoupons("owner");
    expect(records).toHaveLength(1); expect(records[0].barcodeNumber).toBe("12-34 56");
  });
  test("edits archive the original atomically, stale edits fail, trash and history restore are reversible", async () => {
    const ref = await service.addCoupon(input());
    await service.updateCoupon(ref.id, { brand: "Bakery" }, 1);
    expect((await service.fetchCouponHistory(ref.id))[0].record.brand).toBe("Coffee");
    await expect(service.updateCoupon(ref.id, { brand: "Stale" }, 1)).rejects.toThrow("다른 기기");
    expect((await service.getCoupon(ref.id)).brand).toBe("Bakery");
    await service.deleteCoupon(ref.id, 2);
    expect((await service.getCoupon(ref.id)).deletedAt).toBeTruthy();
    await service.restoreCoupon(ref.id, 3);
    expect((await service.getCoupon(ref.id)).deletedAt).toBeNull();
    await service.restoreCouponVersion(ref.id, 1, 4);
    const restored = await service.getCoupon(ref.id);
    expect(restored).toMatchObject({ brand: "Coffee", revision: 5 });
    expect(await service.fetchCouponHistory(ref.id)).toHaveLength(4);
  });
  test("changing a barcode reserves the new identity and releases the previous one", async () => {
    const first = await service.addCoupon(input());
    const second = await service.addCoupon(input({ barcodeNumber: "other" }));
    await expect(service.updateCoupon(first.id, { barcodeNumber: "other" }, 1)).rejects.toThrow("같은");
    await service.updateCoupon(first.id, { barcodeNumber: "changed" }, 1);
    await service.addCoupon(input());
    expect(await service.fetchCoupons("owner")).toHaveLength(3);
    await expect(service.updateCoupon(second.id, { barcodeNumber: "changed" }, 1)).rejects.toThrow("같은");
  });
  test("legacy documents gain a revision and exact original history without migration", async () => {
    await setDoc(doc(mockDb, "coupons", "legacy"), { userId: "owner", brand: "Legacy", barcodeNumber: "old-code", expiryDate: new Date(2027, 3, 5), isUsed: false });
    await expect(service.addCoupon(input({ barcodeNumber: "old-code" }))).rejects.toThrow("같은");
    await service.updateCoupon("legacy", { isUsed: true }, 0);
    expect((await service.getCoupon("legacy"))).toMatchObject({ revision: 1, isUsed: true, expiryDay: "2027-04-05" });
    const original = (await service.fetchCouponHistory("legacy"))[0].record;
    expect(original).not.toHaveProperty("revision"); expect(original.expiryDate.toDate()).toEqual(new Date(2027, 3, 5));
  });
  test("a missing server document can be recovered even when its old identity reservation remains", async () => {
    const original = await service.addCoupon(input());
    await environment.withSecurityRulesDisabled(async (context) => deleteDoc(doc(context.firestore(), "coupons", original.id)));
    const recovered = await service.addCoupon(input());
    expect(recovered.id).not.toBe(original.id);
    expect(await service.fetchCoupons("owner")).toHaveLength(1);
  });
  test("history, identity reservations and records cannot be accessed by another account", async () => {
    const ref = await service.addCoupon(input());
    await service.updateCoupon(ref.id, { brand: "Changed" }, 1);
    const other = environment.authenticatedContext("other").firestore();
    await expect(getDoc(doc(other, "coupons", ref.id, "history", "1"))).rejects.toThrow();
    await expect(getDoc(doc(other, "users", "owner", "couponKeys", createHash("sha256").update("anything").digest("hex")))).rejects.toThrow();
    mockUid = "other"; mockDb = other;
    await expect(service.updateCoupon(ref.id, { brand: "Forged" }, 2)).rejects.toThrow();
  });
});
