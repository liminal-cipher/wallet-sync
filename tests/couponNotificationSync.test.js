jest.mock("react-native", () => ({
  Platform: { OS: "android" },
  AppState: { addEventListener: jest.fn() },
}));
jest.mock("firebase/auth", () => ({ onAuthStateChanged: jest.fn() }));
jest.mock("../src/services/firebase", () => ({ auth: {} }));
jest.mock("../src/services/firestoreService", () => ({ subscribeCoupons: jest.fn() }));
jest.mock("../src/services/notificationService", () => ({
  requestNotificationPermissions: jest.fn(),
  clearCouponNotifications: jest.fn(),
  reconcileCouponNotifications: jest.fn(),
}));

const { AppState, Platform } = require("react-native");
const { onAuthStateChanged } = require("firebase/auth");
const { subscribeCoupons } = require("../src/services/firestoreService");
const notifications = require("../src/services/notificationService");
const { startCouponNotificationSync } = require("../src/services/couponNotificationSync");
const flush = () => new Promise((resolve) => setImmediate(resolve));
let authChanged;
let foregroundChanged;
let subscriptions;
let stopAuth;
let removeForeground;
let stop;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "android";
  subscriptions = [];
  stopAuth = jest.fn();
  removeForeground = jest.fn();
  onAuthStateChanged.mockImplementation((auth, callback) => {
    authChanged = callback;
    return stopAuth;
  });
  AppState.addEventListener.mockImplementation((event, callback) => {
    foregroundChanged = callback;
    return { remove: removeForeground };
  });
  subscribeCoupons.mockImplementation((userId, callback) => {
    const unsubscribe = jest.fn();
    subscriptions.push({ userId, callback, unsubscribe });
    return unsubscribe;
  });
  notifications.requestNotificationPermissions.mockResolvedValue(true);
  notifications.clearCouponNotifications.mockResolvedValue();
  notifications.reconcileCouponNotifications.mockResolvedValue();
});

afterEach(() => { if (stop) stop(); stop = null; });

test("snapshots reconcile reminders independently of the current screen", async () => {
  stop = startCouponNotificationSync();
  authChanged({ uid: "owner" });
  const coupons = [{ id: "coupon-1", userId: "owner" }];
  subscriptions[0].callback(coupons);
  await flush();
  expect(notifications.clearCouponNotifications).toHaveBeenCalledWith("owner");
  expect(notifications.reconcileCouponNotifications).toHaveBeenLastCalledWith("owner", coupons);
  subscriptions[0].callback([]);
  await flush();
  expect(notifications.reconcileCouponNotifications).toHaveBeenLastCalledWith("owner", []);
});

test("sign-out rejects delayed work while a permission request is in flight", async () => {
  let grantPermission;
  notifications.requestNotificationPermissions.mockReturnValue(new Promise((resolve) => { grantPermission = resolve; }));
  stop = startCouponNotificationSync();
  authChanged({ uid: "owner" });
  subscriptions[0].callback([{ id: "coupon-1" }]);
  authChanged(null);
  grantPermission(true);
  await flush();
  expect(subscriptions[0].unsubscribe).toHaveBeenCalled();
  expect(notifications.clearCouponNotifications).toHaveBeenLastCalledWith(null);
  expect(notifications.reconcileCouponNotifications).not.toHaveBeenCalled();
});

test("account switching ignores callbacks left over from the previous account", async () => {
  stop = startCouponNotificationSync();
  authChanged({ uid: "owner" });
  authChanged({ uid: "other" });
  subscriptions[0].callback([{ id: "stale" }]);
  subscriptions[1].callback([{ id: "new" }]);
  await flush();
  expect(subscriptions[0].unsubscribe).toHaveBeenCalled();
  expect(notifications.reconcileCouponNotifications).toHaveBeenCalledTimes(1);
  expect(notifications.reconcileCouponNotifications).toHaveBeenCalledWith("other", [{ id: "new" }]);
});

test("returning to the foreground reconciles the cached snapshot and refreshed permissions", async () => {
  stop = startCouponNotificationSync();
  authChanged({ uid: "owner" });
  subscriptions[0].callback([{ id: "coupon-1" }]);
  await flush();
  notifications.reconcileCouponNotifications.mockClear();
  foregroundChanged("background");
  await flush();
  expect(notifications.reconcileCouponNotifications).not.toHaveBeenCalled();
  foregroundChanged("active");
  await flush();
  expect(notifications.reconcileCouponNotifications).toHaveBeenCalledWith("owner", [{ id: "coupon-1" }]);
});

test("cleanup removes listeners and prevents late callbacks from scheduling", async () => {
  stop = startCouponNotificationSync();
  authChanged({ uid: "owner" });
  stop();
  stop = null;
  subscriptions[0].callback([{ id: "late" }]);
  authChanged({ uid: "late-account" });
  await flush();
  expect(stopAuth).toHaveBeenCalled();
  expect(subscriptions[0].unsubscribe).toHaveBeenCalled();
  expect(removeForeground).toHaveBeenCalled();
  expect(notifications.reconcileCouponNotifications).not.toHaveBeenCalled();
  expect(subscribeCoupons).toHaveBeenCalledTimes(1);
});

test("web installs no native reminder listeners", () => {
  Platform.OS = "web";
  stop = startCouponNotificationSync();
  expect(onAuthStateChanged).not.toHaveBeenCalled();
  expect(AppState.addEventListener).not.toHaveBeenCalled();
  expect(notifications.requestNotificationPermissions).not.toHaveBeenCalled();
});
