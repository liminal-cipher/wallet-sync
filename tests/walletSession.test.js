jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: jest.fn(), setItem: jest.fn() }));
const storage = require("@react-native-async-storage/async-storage");
const { setActiveWallet, getWalletScope, assertWalletScope } = require("../src/services/walletSession");
const { readLocal, writeLocal, captureSnapshot } = require("../src/services/localRecovery");
const wallet = { id: "together", name: "Together", memberIds: ["owner", "guest"] };
const coupon = { brand: "Coffee", barcodeNumber: "123", expiryDay: "2027-01-01" };
beforeEach(() => {
  setActiveWallet("owner"); jest.clearAllMocks(); const values = new Map();
  storage.getItem.mockImplementation(async (key) => values.get(key) ?? null);
  storage.setItem.mockImplementation(async (key, value) => values.set(key, value));
});
afterEach(() => setActiveWallet(null));
test("drafts, snapshots and restore checkpoints are partitioned by account and wallet", async () => {
  for (const section of ["draft:new", "restore", "restore:previous"]) {
    await writeLocal("owner", section, "personal");
    setActiveWallet("owner", wallet); expect(await readLocal("owner", section)).toBeNull();
    await writeLocal("owner", section, "shared-owner");
    setActiveWallet("guest", wallet); expect(await readLocal("guest", section)).toBeNull();
    await writeLocal("guest", section, "shared-guest");
    setActiveWallet("owner", wallet); expect(await readLocal("owner", section)).toBe("shared-owner");
    setActiveWallet("owner"); expect(await readLocal("owner", section)).toBe("personal");
  }
  await captureSnapshot("owner", [coupon]); setActiveWallet("owner", wallet);
  expect(await readLocal("owner", "snapshots", [])).toEqual([]);
});
test("queued snapshots remain in the originating wallet after selection changes", async () => {
  setActiveWallet("owner", wallet);
  const pending = captureSnapshot("owner", [coupon]); setActiveWallet("owner"); await pending;
  expect(await readLocal("owner", "snapshots", [])).toEqual([]);
  setActiveWallet("owner", wallet);
  expect((await readLocal("owner", "snapshots"))[0].records).toEqual([coupon]);
});
test("a switch away and back invalidates old work while account preferences remain shared", async () => {
  const scope = getWalletScope("owner");
  await writeLocal("owner", "brand-preferences", { favourites: ["coffee"] });
  setActiveWallet("owner", wallet); setActiveWallet("owner");
  expect(() => assertWalletScope(scope)).toThrow("쿠폰함");
  setActiveWallet("owner", wallet);
  expect(await readLocal("owner", "brand-preferences")).toEqual({ favourites: ["coffee"] });
  expect(() => setActiveWallet("outsider", wallet)).toThrow();
});
