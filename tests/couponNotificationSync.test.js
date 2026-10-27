jest.mock("react-native", () => ({
  Platform: { OS: "android" },
  AppState: { addEventListener: jest.fn() },
}));
jest.mock("firebase/auth", () => ({ onAuthStateChanged: jest.fn() }));
jest.mock("../src/services/firebase", () => ({ auth: {} }));
jest.mock("../src/services/reminderSettings", () => ({
  loadReminderSettings: jest.fn().mockResolvedValue({ enabled: true, hour: 9, minute: 0, days: [7, 3, 0] }),
  observeReminderSettings: jest.fn(() => jest.fn()),
}));
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
const { loadReminderSettings, observeReminderSettings } = require("../src/services/reminderSettings");
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
  loadReminderSettings.mockResolvedValue({ enabled: true, hour: 9, minute: 0, days: [7, 3, 0] });
});

afterEach(() => { if (stop) stop(); stop = null; });

test("an unconfirmed empty cache cannot cancel previously scheduled reminders", async () => {
  stop = startCouponNotificationSync(); authChanged({ uid: "owner" });
  subscriptions[0].callback([], { fromCache: true }); await flush();
  expect(notifications.reconcileCouponNotifications).not.toHaveBeenCalled();
  subscriptions[0].callback([], { fromCache: false }); await flush();
  expect(notifications.reconcileCouponNotifications).toHaveBeenCalledWith("owner", [], expect.anything());
});

test("snapshots reconcile reminders independently of the current screen", async () => {
  stop = startCouponNotificationSync();
  authChanged({ uid: "owner" });
  const coupons = [{ id: "coupon-1", userId: "owner" }];
  subscriptions[0].callback(coupons);
  await flush();
  expect(notifications.clearCouponNotifications).toHaveBeenCalledWith("owner");
  expect(notifications.reconcileCouponNotifications).toHaveBeenLastCalledWith("owner", coupons, expect.objectContaining({ hour: 9 }));
  subscriptions[0].callback([]);
  await flush();
  expect(notifications.reconcileCouponNotifications).toHaveBeenLastCalledWith("owner", [], expect.objectContaining({ hour: 9 }));
});

test("sign-out rejects delayed work while a permission request is in flight", async () => {
  let grantPermission;
  notifications.requestNotificationPermissions.mockReturnValue(new Promise((resolve) => { grantPermission = resolve; }));
  stop = startCouponNotificationSync();
  authChanged({ uid: "owner" });
  subscriptions[0].callback([{ id: "coupon-1" }]);
  await flush();
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
  expect(notifications.reconcileCouponNotifications).toHaveBeenCalledWith("other", [{ id: "new" }], expect.objectContaining({ hour: 9 }));
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
  expect(notifications.reconcileCouponNotifications).toHaveBeenCalledWith("owner", [{ id: "coupon-1" }], expect.objectContaining({ hour: 9 }));
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
test("signed-out and disabled accounts do not request notification permission", async () => {
  stop = startCouponNotificationSync();
  expect(notifications.requestNotificationPermissions).not.toHaveBeenCalled();
  loadReminderSettings.mockResolvedValue({ enabled: false, hour: 9, minute: 0, days: [0] });
  authChanged({ uid: "owner" }); subscriptions[0].callback([]);
  await flush();
  expect(notifications.requestNotificationPermissions).not.toHaveBeenCalled();
  expect(notifications.reconcileCouponNotifications).toHaveBeenCalledWith("owner", [], expect.objectContaining({ enabled: false }));
});
test("disabling reminders supersedes an earlier refresh waiting for permission", async () => {
  let grant;
  notifications.requestNotificationPermissions.mockReturnValue(new Promise((resolve) => { grant = resolve; }));
  stop = startCouponNotificationSync(); authChanged({ uid: "owner" }); subscriptions[0].callback([{ id: "coupon-1" }]);
  await flush();
  loadReminderSettings.mockResolvedValue({ enabled: false, hour: 9, minute: 0, days: [0] });
  observeReminderSettings.mock.calls[0][0]("owner"); await flush();
  grant(true); await flush();
  expect(notifications.reconcileCouponNotifications).toHaveBeenCalledTimes(1);
  expect(notifications.reconcileCouponNotifications).toHaveBeenLastCalledWith("owner", [{ id: "coupon-1" }], expect.objectContaining({ enabled: false }));
});
