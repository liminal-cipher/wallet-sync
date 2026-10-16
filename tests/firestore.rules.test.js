const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, setLogLevel } = require("firebase/firestore");

// Run against a local emulator only; ordinary unit tests do not need Java.
const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST;
const rulesTests = emulatorAddress ? describe : describe.skip;

rulesTests("Firestore coupon ownership", () => {
  let environment;
  let owner;
  let other;

  beforeAll(async () => {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(emulatorAddress)) {
      throw new Error("Firestore rules tests require a loopback emulator address.");
    }
    const [host, port] = emulatorAddress.split(":");
    setLogLevel("silent");
    environment = await initializeTestEnvironment({
      projectId: "demo-wallet-sync-rules",
      firestore: {
        host,
        port: Number(port),
        rules: fs.readFileSync(path.join(__dirname, "../firestore.rules"), "utf8"),
      },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    owner = environment.authenticatedContext("owner").firestore();
    other = environment.authenticatedContext("other").firestore();
    await setDoc(doc(owner, "coupons", "coupon-1"), {
      userId: "owner", brand: "Coffee", isUsed: false,
    });
  });

  afterAll(async () => {
    if (environment) await environment.cleanup();
  });

  test("the owner can read, update and delete their coupon", async () => {
    const coupon = doc(owner, "coupons", "coupon-1");
    await assertSucceeds(getDoc(coupon));
    await assertSucceeds(updateDoc(coupon, { isUsed: true }));
    await assertSucceeds(deleteDoc(coupon));
  });

  test("the owner cannot transfer ownership to another account", async () => {
    await assertFails(updateDoc(doc(owner, "coupons", "coupon-1"), { userId: "other" }));
    await assertFails(getDoc(doc(other, "coupons", "coupon-1")));
    expect((await getDoc(doc(owner, "coupons", "coupon-1"))).data().userId).toBe("owner");
  });

  test("the owner cannot remove the ownership field", async () => {
    await assertFails(updateDoc(doc(owner, "coupons", "coupon-1"), { userId: deleteField() }));
  });

  test("another account cannot read, overwrite or delete the coupon", async () => {
    const coupon = doc(other, "coupons", "coupon-1");
    await assertFails(getDoc(coupon));
    await assertFails(setDoc(coupon, { userId: "other", brand: "Forged" }));
    await assertFails(deleteDoc(coupon));
  });

  test("creating a coupon for another account is rejected", async () => {
    await assertFails(setDoc(doc(owner, "coupons", "forged"), { userId: "other" }));
  });

  test("anonymous users cannot read or create coupons", async () => {
    const anonymous = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonymous, "coupons", "coupon-1")));
    await assertFails(setDoc(doc(anonymous, "coupons", "new"), { userId: "owner" }));
  });
});
