jest.mock("firebase/firestore", () => ({ collection: jest.fn(), query: jest.fn(), where: jest.fn(),
  getDocsFromServer: jest.fn(), getDoc: jest.fn(), doc: jest.fn(), onSnapshot: jest.fn() }));
jest.mock("expo-crypto", () => ({}));
jest.mock("../src/services/firebase", () => ({ db: {}, auth: { currentUser: { uid: "owner" } } }));
jest.mock("../src/services/localRecovery", () => ({ captureSnapshot: jest.fn().mockResolvedValue() }));
const sdk = require("firebase/firestore");
const { auth } = require("../src/services/firebase");
const service = require("../src/services/firestoreService");
const local = require("../src/services/localRecovery");
beforeEach(() => { jest.clearAllMocks(); auth.currentUser = { uid: "owner" }; });
test("account changes during a server fetch cannot return another account's delayed records", async () => {
  let complete; sdk.getDocsFromServer.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  const pending = service.fetchCoupons("owner"); auth.currentUser = { uid: "other" }; complete({ docs: [] });
  await expect(pending).rejects.toThrow("계정");
});
test("invalid server records report an error without replacing the wallet or its recovery snapshot", () => {
  const next = jest.fn(), error = jest.fn(); service.subscribeCoupons("owner", next, error);
  const receive = sdk.onSnapshot.mock.calls[0][2];
  receive({ docs: [{ id: "broken", data: () => ({ brand: null }) }], metadata: { fromCache: false, hasPendingWrites: false } });
  expect(error).toHaveBeenCalled(); expect(next).not.toHaveBeenCalled(); expect(local.captureSnapshot).not.toHaveBeenCalled();
});
test("late subscription callbacks are ignored after account changes", () => {
  const next = jest.fn(); service.subscribeCoupons("owner", next, jest.fn());
  auth.currentUser = { uid: "other" };
  sdk.onSnapshot.mock.calls[0][2]({ docs: [], metadata: { fromCache: false } });
  expect(next).not.toHaveBeenCalled(); expect(local.captureSnapshot).not.toHaveBeenCalled();
});
