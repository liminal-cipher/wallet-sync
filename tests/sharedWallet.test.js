const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch, setLogLevel } = require("firebase/firestore");
let mockDb, mockUid, mockBeforeCommit, mockLoseCommitReply;
jest.mock("firebase/firestore", () => {
  const actual = jest.requireActual("firebase/firestore");
  return { ...actual, runTransaction: async (database, operation, options) => {
    const result = await actual.runTransaction(database, async (transaction) => {
      const value = await operation(transaction);
      if (mockBeforeCommit) await mockBeforeCommit();
      return value;
    }, options);
    if (mockLoseCommitReply) { mockLoseCommitReply = false; throw new Error("Commit reply lost"); }
    return result;
  } };
});
jest.mock("../src/services/firebase", () => ({ get db() { return mockDb; }, auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
jest.mock("expo-crypto", () => ({ randomUUID: () => require("crypto").randomUUID(), CryptoDigestAlgorithm: { SHA256: "sha256" },
  digestStringAsync: async (_algorithm, text) => require("crypto").createHash("sha256").update(text).digest("hex") }));
jest.mock("../src/services/localRecovery", () => ({ captureSnapshot: jest.fn().mockResolvedValue() }));
const wallets = require("../src/services/sharedWalletService");
const coupons = require("../src/services/firestoreService");
const { setActiveWallet, getWalletScope, observeWalletScope } = require("../src/services/walletSession");
const address = process.env.FIRESTORE_EMULATOR_HOST;
const integration = address ? describe : describe.skip;
const input = (barcodeNumber = "shared-123") => ({ brand: "Coffee", barcodeType: "code128", barcodeNumber, expiryDay: "2027-01-01" });
const hash = (code) => createHash("sha256").update(code).digest("hex");

integration("two-person shared wallets", () => {
  let environment;
  const signIn = async (uid, id = null) => {
    mockUid = uid; mockDb = environment.authenticatedContext(uid).firestore();
    const wallet = id ? (await getDoc(doc(mockDb, "wallets", id))).data() : null;
    setActiveWallet(uid, wallet ? { ...wallet, id } : null);
  };
  const create = async () => {
    const id = await wallets.createSharedWallet("Together");
    await signIn("owner", id);
    return id;
  };
  const inviteGuest = async (id) => {
    const { code } = await wallets.createWalletInvitation(id);
    await signIn("guest"); await wallets.joinSharedWallet(code); await signIn("guest", id);
    return code;
  };
  beforeAll(async () => {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(address)) throw new Error("A loopback emulator is required.");
    const [host, port] = address.split(":"); setLogLevel("silent");
    environment = await initializeTestEnvironment({ projectId: "demo-wallet-sync-rules", firestore: {
      host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, "../firestore.rules"), "utf8"),
    } });
  });
  beforeEach(async () => { mockBeforeCommit = null; mockLoseCommitReply = false; await environment.clearFirestore(); await signIn("owner"); });
  afterAll(async () => { setActiveWallet(null); await environment?.cleanup(); });
  test("own accounts share use state, history and trash without exposing personal coupons", async () => {
    await coupons.addCoupon(input("private"));
    const id = await create();
    const ref = await coupons.addCoupon(input());
    await inviteGuest(id);
    expect(await coupons.fetchCoupons("guest")).toHaveLength(1);
    await coupons.updateCoupon(ref.id, { isUsed: true }, 1);
    expect(await coupons.getCoupon(ref.id)).toMatchObject({ userId: "owner", updatedBy: "guest", isUsed: true, revision: 2 });
    await signIn("owner", id);
    await expect(coupons.updateCoupon(ref.id, { brand: "Stale" }, 1)).rejects.toThrow("다른 기기");
    await coupons.deleteCoupon(ref.id, 2);
    await signIn("guest", id);
    await coupons.restoreCoupon(ref.id, 3);
    await coupons.restoreCouponVersion(ref.id, 1, 4);
    expect(await coupons.getCoupon(ref.id)).toMatchObject({ isUsed: false, revision: 5 });
    expect(await coupons.fetchCouponHistory(ref.id)).toHaveLength(4);
    await signIn("guest"); expect(await coupons.fetchCoupons("guest")).toEqual([]);
    await signIn("owner"); expect((await coupons.fetchCoupons("owner")).map((c) => c.barcodeNumber)).toEqual(["private"]);
  });
  test("shared duplicate reservations apply to both members and concurrent submissions", async () => {
    const id = await create(); await coupons.addCoupon(input());
    await inviteGuest(id);
    await expect(coupons.addCoupon(input())).rejects.toThrow("같은");
    const results = await Promise.allSettled([coupons.addCoupon(input("raced")), coupons.addCoupon(input("raced"))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await coupons.fetchCoupons("guest")).toHaveLength(2);
  });
  test("outsiders cannot read, edit, list invites or forge their own membership", async () => {
    const id = await create(); const ref = await coupons.addCoupon(input());
    const outsider = environment.authenticatedContext("outsider").firestore();
    const anonymous = environment.unauthenticatedContext().firestore();
    for (const database of [outsider, anonymous]) {
      await expect(getDoc(doc(database, "wallets", id))).rejects.toThrow();
      await expect(getDocs(collection(database, "wallets", id, "coupons"))).rejects.toThrow();
      await expect(getDoc(doc(database, "wallets", id, "coupons", ref.id))).rejects.toThrow();
      await expect(updateDoc(doc(database, "wallets", id), { memberIds: ["owner", "outsider"] })).rejects.toThrow();
      await expect(getDocs(collection(database, "walletInvites"))).rejects.toThrow();
    }
    await expect(setDoc(doc(outsider, "users", "outsider", "settings", "sharedWallet"), { walletId: id })).rejects.toThrow();
  });
  test("replacement invitations invalidate the old code and accepted codes cannot add a third member", async () => {
    const id = await create();
    const first = await wallets.createWalletInvitation(id);
    const second = await wallets.createWalletInvitation(id);
    await signIn("guest");
    await expect(wallets.joinSharedWallet(first.code)).rejects.toThrow();
    await wallets.joinSharedWallet(second.code);
    await signIn("outsider"); await expect(wallets.joinSharedWallet(second.code)).rejects.toThrow();
    await signIn("owner", id);
    await expect(wallets.createWalletInvitation(id)).rejects.toThrow("두 사람");
    expect((await getDoc(doc(mockDb, "wallets", id))).data().memberIds).toEqual(["owner", "guest"]);
  });
  test("expired and revoked invitations cannot be accepted", async () => {
    const id = await create(); const expired = await wallets.createWalletInvitation(id);
    await environment.withSecurityRulesDisabled((context) => updateDoc(doc(context.firestore(), "walletInvites", hash(expired.code)), { expiresAt: new Date(0) }));
    await signIn("guest"); await expect(wallets.joinSharedWallet(expired.code)).rejects.toThrow();
    await signIn("owner", id); const revoked = await wallets.createWalletInvitation(id); await wallets.removeWalletMember(id);
    await signIn("guest"); await expect(wallets.joinSharedWallet(revoked.code)).rejects.toThrow();
  });
  test("removal immediately blocks the former member while retaining their records and history", async () => {
    const id = await create(); await inviteGuest(id);
    const ref = await coupons.addCoupon(input()); await coupons.updateCoupon(ref.id, { isUsed: true }, 1);
    await expect(wallets.createWalletInvitation(id)).rejects.toThrow();
    await signIn("owner", id); await wallets.removeWalletMember(id);
    await signIn("guest");
    await expect(getDoc(doc(mockDb, "wallets", id, "coupons", ref.id))).rejects.toThrow();
    await expect(getDocs(collection(mockDb, "wallets", id, "coupons", ref.id, "history"))).rejects.toThrow();
    await wallets.clearUnavailableWalletLink();
    await wallets.createSharedWallet("My new wallet");
    await signIn("owner", id);
    expect(await coupons.getCoupon(ref.id)).toMatchObject({ userId: "guest", isUsed: true });
    expect(await coupons.fetchCouponHistory(ref.id)).toHaveLength(1);
  });
  test("a guest can leave, but cannot remove the owner, add members or destroy shared data", async () => {
    const id = await create(); await inviteGuest(id); const ref = await coupons.addCoupon(input());
    await expect(updateDoc(doc(mockDb, "wallets", id), { memberIds: ["guest"] })).rejects.toThrow();
    await expect(updateDoc(doc(mockDb, "wallets", id), { ownerId: "guest", memberIds: ["guest", "owner"] })).rejects.toThrow();
    await expect(updateDoc(ref, { isUsed: true, revision: 2, updatedBy: "guest" })).rejects.toThrow();
    await expect(deleteDoc(ref)).rejects.toThrow();
    await wallets.removeWalletMember(id);
    expect((await getDoc(doc(mockDb, "users", "guest", "settings", "sharedWallet"))).exists()).toBe(false);
    await expect(getDoc(ref)).rejects.toThrow();
    await signIn("owner", id); expect(await coupons.fetchCoupons("owner")).toHaveLength(1);
  });
  test("two simultaneous invite acceptances commit exactly one membership", async () => {
    const id = await create(); const invitation = await wallets.createWalletInvitation(id);
    const accept = async (uid) => {
      const database = environment.authenticatedContext(uid).firestore(); const batch = writeBatch(database);
      batch.update(doc(database, "wallets", id), { memberIds: ["owner", uid], inviteHash: null, updatedAt: new Date() });
      batch.update(doc(database, "walletInvites", hash(invitation.code)), { acceptedBy: uid });
      batch.set(doc(database, "users", uid, "settings", "sharedWallet"), { walletId: id });
      return batch.commit();
    };
    const results = await Promise.allSettled([accept("guest"), accept("racer")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getDoc(doc(mockDb, "wallets", id))).data().memberIds).toHaveLength(2);
  });
  test("live membership switches to the joined wallet, respects personal selection and handles removal", async () => {
    const id = await create(); const invitation = await wallets.createWalletInvitation(id);
    await signIn("guest");
    let nextReady;
    const ready = new Promise((resolve) => { nextReady = resolve; });
    const stop = wallets.startWalletSession("guest", () => nextReady?.());
    const waitForWallet = (walletId) => new Promise((resolve, reject) => {
      let unsubscribe;
      const timeout = setTimeout(() => { unsubscribe?.(); reject(new Error("Wallet session did not update")); }, 8000);
      const check = () => {
        if (getWalletScope("guest").walletId === walletId) { clearTimeout(timeout); unsubscribe?.(); resolve(); }
      };
      unsubscribe = observeWalletScope(check); check();
    });
    try {
      await ready;
      await wallets.joinSharedWallet(invitation.code); await waitForWallet(id);
      setActiveWallet("guest");
      const updated = new Promise((resolve) => { nextReady = resolve; });
      const ownerDb = environment.authenticatedContext("owner").firestore();
      await updateDoc(doc(ownerDb, "wallets", id), { name: "Renamed", updatedAt: new Date() }); await updated;
      expect(getWalletScope("guest").walletId).toBeNull();
      await signIn("guest", id);
      await updateDoc(doc(ownerDb, "wallets", id), { memberIds: ["owner"], inviteHash: null, updatedAt: new Date() });
      await waitForWallet(null);
    } finally { stop(); }
  });
  test("an edit already in flight cannot overwrite the other member's committed edit", async () => {
    const id = await create(); const ref = await coupons.addCoupon(input()); await inviteGuest(id); await signIn("owner", id);
    let release, reached;
    const blocked = new Promise((resolve) => { reached = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    mockBeforeCommit = async () => { reached(); await gate; };
    const pending = coupons.updateCoupon(ref.id, { brand: "Owner edit" }, 1);
    const rejected = expect(pending).rejects.toThrow("다른 기기");
    try {
      await blocked;
      const guestDb = environment.authenticatedContext("guest").firestore();
      const guestRef = doc(guestDb, "wallets", id, "coupons", ref.id);
      const original = (await getDoc(guestRef)).data(); const batch = writeBatch(guestDb);
      batch.set(doc(guestRef, "history", "1"), { record: original, userId: "guest", savedAt: new Date() });
      batch.update(guestRef, { isUsed: true, updatedBy: "guest", revision: 2, updatedAt: new Date() });
      await batch.commit();
    } finally { mockBeforeCommit = null; release(); }
    await rejected;
    expect(await coupons.getCoupon(ref.id)).toMatchObject({ brand: "Coffee", isUsed: true, revision: 2, updatedBy: "guest" });
    const history = await coupons.fetchCouponHistory(ref.id);
    expect(history).toHaveLength(1); expect(history[0].record).toMatchObject({ isUsed: false, revision: 1 });
  });
  test("revoking membership while a write is in flight leaves the coupon and history unchanged", async () => {
    const id = await create(); const ref = await coupons.addCoupon(input()); await inviteGuest(id);
    let release, reached;
    const blocked = new Promise((resolve) => { reached = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    mockBeforeCommit = async () => { reached(); await gate; };
    const pending = coupons.deleteCoupon(ref.id, 1);
    const rejected = expect(pending).rejects.toThrow();
    try {
      await blocked;
      const ownerDb = environment.authenticatedContext("owner").firestore();
      await updateDoc(doc(ownerDb, "wallets", id), { memberIds: ["owner"], inviteHash: null, updatedAt: new Date() });
    } finally { mockBeforeCommit = null; release(); }
    await rejected; await signIn("owner", id);
    expect(await coupons.getCoupon(ref.id)).toMatchObject({ revision: 1, deletedAt: null });
    expect(await coupons.fetchCouponHistory(ref.id)).toEqual([]);
  });
  test("losing a successful save reply cannot duplicate the record on retry", async () => {
    const id = await create(); mockLoseCommitReply = true;
    await expect(coupons.addCoupon(input())).rejects.toThrow("Commit reply lost");
    await expect(coupons.addCoupon(input())).rejects.toThrow("같은");
    await inviteGuest(id);
    const records = await coupons.fetchCoupons("guest"); expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ brand: "Coffee", revision: 1, deletedAt: null });
  });
});
