import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { reminderSchedule } from "../utils/reminderSchedule";
import { DEFAULT_REMINDERS } from "./reminderSettings";

// Configure foreground notification presentation
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const requestNotificationPermissions = async () => {
  if (Platform.OS === "web") {
    return false;
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("coupon-expiry", {
        name: "쿠폰 만료 알림",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#6366F1",
      });
    }

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === "granted";
  } catch (error) {
    console.error("Error requesting notification permissions:", error);
    return false;
  }
};

const NOTIFICATION_TYPE = "coupon-expiry";
let pendingOperations = Promise.resolve();

// Serialise snapshots and account changes so stale work cannot finish after cleanup.
const enqueue = (operation) => {
  const result = pendingOperations.then(operation);
  pendingOperations = result.catch(() => {});
  return result;
};

const isCouponNotification = (notification) => {
  const data = notification.content?.data;
  return data?.type === NOTIFICATION_TYPE || typeof data?.couponId === "string";
};

const createExpiryRequests = (userId, coupons, now, settings) =>
  reminderSchedule(userId, coupons, settings, now).map(({ couponId, brand, daysBefore, date }) => ({
    identifier: `${NOTIFICATION_TYPE}:${userId}:${couponId}:${daysBefore}`,
    content: {
      title: daysBefore ? `쿠폰 만료 ${daysBefore}일 전` : "쿠폰 만료 D-Day",
      body: `'${brand}' ${daysBefore ? `만료까지 ${daysBefore}일 남았습니다.` : "오늘 만료됩니다."}`,
      data: { type: NOTIFICATION_TYPE, userId, couponId, scheduleKey: JSON.stringify([brand, date.getTime()]) },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: NOTIFICATION_TYPE },
  }));

// Keep this account's reminders during startup, even before an offline snapshot arrives.
// With no account to keep, remove every coupon reminder on sign-out.
export const clearCouponNotifications = (userIdToKeep = null) => {
  if (Platform.OS === "web") return Promise.resolve();
  return enqueue(async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduled) {
      if (isCouponNotification(notification) &&
          (!userIdToKeep || notification.content.data.userId !== userIdToKeep)) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  });
};

export const reconcileCouponNotifications = (userId, coupons, settings = DEFAULT_REMINDERS) => {
  if (Platform.OS === "web" || !userId) return Promise.resolve();
  return enqueue(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    const now = new Date();
    let requests = status === "granted"
      ? createExpiryRequests(userId, coupons, now, settings)
      : [];
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    // Reserve space for other notification categories and schedule the nearest
    // reminders first. Foreground/snapshot reconciliation replenishes the queue.
    if (Platform.OS === "ios") {
      const otherCount = scheduled.filter((item) => !isCouponNotification(item)).length;
      requests = requests.sort((a, b) => a.trigger.date - b.trigger.date).slice(0, Math.max(0, 60 - otherCount));
    }
    const desired = new Map(requests.map((request) => [request.identifier, request]));

    for (const notification of scheduled) {
      if (!isCouponNotification(notification)) continue;
      const request = desired.get(notification.identifier);
      const data = notification.content.data;
      if (request && data.userId === userId &&
          data.scheduleKey === request.content.data.scheduleKey) {
        desired.delete(notification.identifier);
      } else {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
    for (const request of desired.values()) {
      await Notifications.scheduleNotificationAsync(request);
    }
  });
};
