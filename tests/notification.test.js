jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(null),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("scheduled"),
}));

const Notifications = require("expo-notifications");
const { Platform } = require("react-native");
const { Timestamp } = require("firebase/firestore");
const service = require("../src/services/notificationService");
const foregroundHandler = Notifications.setNotificationHandler.mock.calls[0][0];
let scheduled;
const coupon = (overrides = {}) => ({
  id: "coupon-1", userId: "owner", brand: "Coffee",
  expiryDate: new Date(2026, 10, 1, 23, 59, 59), isUsed: false,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 17, 12));
  Platform.OS = "android";
  Notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
  scheduled = new Map();
  Notifications.getAllScheduledNotificationsAsync.mockImplementation(async () => [...scheduled.values()]);
  Notifications.scheduleNotificationAsync.mockReset().mockImplementation(async (request) => {
    scheduled.set(request.identifier, request);
    return request.identifier;
  });
  Notifications.cancelScheduledNotificationAsync.mockReset().mockImplementation(async (identifier) => {
    scheduled.delete(identifier);
  });
});

afterEach(() => jest.useRealTimers());

test("expiry reminders use typed date triggers at 09:00 on D-7, D-3 and D-Day", async () => {
  await service.reconcileCouponNotifications("owner", [coupon()]);

  const requests = Notifications.scheduleNotificationAsync.mock.calls.map(([request]) => request);
  expect(requests).toHaveLength(3);
  expect(requests.map(({ trigger }) => trigger.date)).toEqual([
    new Date(2026, 9, 25, 9),
    new Date(2026, 9, 29, 9),
    new Date(2026, 10, 1, 9),
  ]);
  for (const request of requests) {
    expect(request.trigger).toMatchObject({ type: "date", channelId: "coupon-expiry" });
    expect(request.content).not.toHaveProperty("channelId");
  }
});

test("Android creates the notification channel before asking for permission", async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
  await expect(service.requestNotificationPermissions()).resolves.toBe(true);
  expect(Notifications.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(
    Notifications.requestPermissionsAsync.mock.invocationCallOrder[0]
  );
});

test("web does not request native notification permissions or schedule reminders", async () => {
  Platform.OS = "web";
  await expect(service.requestNotificationPermissions()).resolves.toBe(false);
  await service.reconcileCouponNotifications("owner", [coupon()]);
  expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test("foreground notifications opt into the banner and notification list", async () => {
  await expect(foregroundHandler.handleNotification()).resolves.toMatchObject({
    shouldShowBanner: true, shouldShowList: true,
  });
});

test("unchanged snapshots keep existing reminders without duplicates", async () => {
  await service.reconcileCouponNotifications("owner", [coupon()]);
  await service.reconcileCouponNotifications("owner", [coupon()]);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test("Firestore timestamps schedule the same reminder dates as local Date values", async () => {
  await service.reconcileCouponNotifications("owner", [coupon({
    expiryDate: Timestamp.fromDate(new Date(2026, 10, 1, 23, 59, 59)),
  })]);
  expect([...scheduled.values()].map((request) => request.trigger.date)).toEqual([
    new Date(2026, 9, 25, 9), new Date(2026, 9, 29, 9), new Date(2026, 10, 1, 9),
  ]);
});

test.each(["used", "deleted"])("a coupon %s on another device loses its local reminders", async (change) => {
  const second = coupon({ id: "coupon-2" });
  await service.reconcileCouponNotifications("owner", [coupon(), second]);
  await service.reconcileCouponNotifications("owner", change === "used"
    ? [coupon({ isUsed: true }), second] : [second]);
  expect([...scheduled.values()]).toHaveLength(3);
  expect([...scheduled.values()].every((request) => request.content.data.couponId === "coupon-2")).toBe(true);
  await service.reconcileCouponNotifications("owner", [coupon(), second]);
  expect(scheduled.size).toBe(6);
});

test("remote edits replace the previous date and message", async () => {
  await service.reconcileCouponNotifications("owner", [coupon()]);
  await service.reconcileCouponNotifications("owner", [coupon({
    brand: "Bakery", expiryDate: new Date(2026, 10, 10, 23, 59, 59),
  })]);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
  expect([...scheduled.values()].every((request) => request.content.body.includes("Bakery"))).toBe(true);
  expect([...scheduled.values()][2].trigger.date).toEqual(new Date(2026, 10, 10, 9));
});

test("startup keeps the current account's offline reminders and removes other accounts and legacy reminders", async () => {
  await service.reconcileCouponNotifications("owner", [coupon()]);
  scheduled.set("foreign", { identifier: "foreign", content: { data: { couponId: "old", userId: "other" } } });
  scheduled.set("legacy", { identifier: "legacy", content: { data: { couponId: "old" } } });
  scheduled.set("unrelated", { identifier: "unrelated", content: { data: { type: "other" } } });
  await service.clearCouponNotifications("owner");
  expect([...scheduled.keys()]).toHaveLength(4);
  expect(scheduled.has("foreign")).toBe(false);
  expect(scheduled.has("legacy")).toBe(false);
  expect(scheduled.has("unrelated")).toBe(true);

  await service.clearCouponNotifications();
  expect([...scheduled.keys()]).toEqual(["unrelated"]);
});

test("sign-out cleanup runs after in-flight scheduling and leaves no coupon reminders", async () => {
  let release;
  let started;
  const firstRequest = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const schedule = Notifications.scheduleNotificationAsync.getMockImplementation();
  Notifications.scheduleNotificationAsync.mockImplementationOnce(async (request) => {
    started();
    await gate;
    return schedule(request);
  });
  const reconciliation = service.reconcileCouponNotifications("owner", [coupon()]);
  await firstRequest;
  const cleanup = service.clearCouponNotifications();
  release();
  await Promise.all([reconciliation, cleanup]);
  expect(scheduled.size).toBe(0);
});

test("permission revocation removes reminders; granting permission again restores them", async () => {
  await service.reconcileCouponNotifications("owner", [coupon()]);
  Notifications.getPermissionsAsync.mockResolvedValue({ status: "denied" });
  await service.reconcileCouponNotifications("owner", [coupon()]);
  expect(scheduled.size).toBe(0);
  Notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
  await service.reconcileCouponNotifications("owner", [coupon()]);
  expect(scheduled.size).toBe(3);
});

test("invalid dates, past reminders and another account's coupons are not scheduled", async () => {
  await service.reconcileCouponNotifications("owner", [
    coupon({ expiryDate: "invalid" }),
    coupon({ expiryDate: new Date(2026, 9, 17, 23, 59, 59) }),
    coupon({ userId: "other" }),
  ]);
  expect(scheduled.size).toBe(0);
});

test("a failed native operation does not block the next reconciliation", async () => {
  Notifications.scheduleNotificationAsync.mockRejectedValueOnce(new Error("Native scheduling failed"));
  await expect(service.reconcileCouponNotifications("owner", [coupon()])).rejects.toThrow("Native scheduling failed");
  await service.reconcileCouponNotifications("owner", [coupon()]);
  expect(scheduled.size).toBe(3);
});
test("custom preferences use calendar dates, exclude trash and cancel reminders when disabled", async () => {
  await service.reconcileCouponNotifications("owner", [coupon({ expiryDay: "2026-11-02" }), coupon({ id: "trash", deletedAt: new Date() })], { enabled: true, hour: 18, minute: 45, days: [1, 0] });
  expect([...scheduled.values()].map((request) => request.trigger.date)).toEqual([new Date(2026, 10, 1, 18, 45), new Date(2026, 10, 2, 18, 45)]);
  await service.reconcileCouponNotifications("owner", [coupon()], { enabled: false, hour: 9, minute: 0, days: [0] });
  expect(scheduled.size).toBe(0);
});
test("iOS keeps the nearest 60 reminders within the app's scheduling budget", async () => {
  Platform.OS = "ios";
  const coupons = Array.from({ length: 25 }, (_, index) => coupon({ id: `coupon-${index}`, expiryDay: `2026-11-${String(index + 1).padStart(2, "0")}` }));
  await service.reconcileCouponNotifications("owner", coupons);
  expect(scheduled.size).toBe(60);
  const dates = [...scheduled.values()].map((request) => request.trigger.date.getTime());
  expect(dates).toEqual([...dates].sort((a, b) => a - b));
});
