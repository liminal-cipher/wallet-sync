import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Configure foreground notification presentation
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const requestNotificationPermissions = async () => {
  if (Platform.OS === "web") {
    return false;
  }

  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("coupon-expiry", {
        name: "쿠폰 만료 알림",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#6366F1",
      });
    }

    return finalStatus === "granted";
  } catch (error) {
    console.error("Error requesting notification permissions:", error);
    return false;
  }
};

export const cancelCouponNotifications = async (couponId) => {
  if (Platform.OS === "web" || !couponId) {
    return;
  }

  try {
    const scheduledNotifications =
      await Notifications.getAllScheduledNotificationsAsync();

    for (const notif of scheduledNotifications) {
      if (notif.content?.data?.couponId === couponId) {
        await Notifications.cancelScheduledNotificationAsync(
          notif.identifier
        );
      }
    }
  } catch (error) {
    console.error("Error cancelling coupon notifications:", error);
  }
};

export const scheduleCouponExpiryNotification = async (coupon) => {
  if (Platform.OS === "web" || !coupon || !coupon.expiryDate || coupon.isUsed) {
    return;
  }

  const rawExpiry = coupon.expiryDate;
  const expDate =
    typeof rawExpiry.toDate === "function"
      ? rawExpiry.toDate()
      : new Date(rawExpiry);

  if (isNaN(expDate.getTime())) {
    return;
  }

  // Cancel any existing notifications for this coupon first
  if (coupon.id) {
    await cancelCouponNotifications(coupon.id);
  }

  const now = new Date();

  // Define notification trigger targets (at 09:00 AM)
  const targets = [
    { daysBefore: 7, title: "쿠폰 만료 7일 전", body: `'${coupon.brand}' 쿠폰 유효기간이 7일 남았습니다.` },
    { daysBefore: 3, title: "쿠폰 만료 3일 전", body: `'${coupon.brand}' 쿠폰 유효기간이 3일 남았습니다. 잊지 말고 사용하세요.` },
    { daysBefore: 0, title: "쿠폰 만료 D-Day", body: `'${coupon.brand}' 쿠폰이 오늘 자정에 만료됩니다.` },
  ];

  for (const target of targets) {
    const triggerDate = new Date(expDate);
    triggerDate.setDate(triggerDate.getDate() - target.daysBefore);
    triggerDate.setHours(9, 0, 0, 0);

    // Only schedule if trigger date is in the future
    if (triggerDate.getTime() > now.getTime()) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: target.title,
            body: target.body,
            data: { couponId: coupon.id || coupon.barcodeNumber },
            channelId: "coupon-expiry",
          },
          trigger: triggerDate,
        });
      } catch (err) {
        console.error("Error scheduling notification for target:", target, err);
      }
    }
  }
};
