import { AppState, Platform } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { subscribeCoupons } from "./firestoreService";
import {
  requestNotificationPermissions,
  clearCouponNotifications,
  reconcileCouponNotifications,
} from "./notificationService";

// Own reminder synchronisation for the whole app, including the add-coupon screen.
export const startCouponNotificationSync = () => {
  if (Platform.OS === "web") return () => {};
  let disposed = false;
  let generation = 0;
  let userId = null;
  let latestCoupons = null;
  let stopCoupons = () => {};
  const permissionsReady = requestNotificationPermissions();
  const reportError = (error) => console.error("Coupon notification sync error:", error);

  const refresh = async () => {
    const currentGeneration = generation;
    await permissionsReady;
    if (!disposed && currentGeneration === generation && userId && latestCoupons !== null) {
      await reconcileCouponNotifications(userId, latestCoupons);
    }
  };

  const stopAuth = onAuthStateChanged(auth, (user) => {
    if (disposed) return;
    const currentGeneration = ++generation;
    stopCoupons();
    stopCoupons = () => {};
    userId = user?.uid || null;
    latestCoupons = null;
    clearCouponNotifications(userId).catch(reportError);
    if (userId) {
      stopCoupons = subscribeCoupons(userId, (coupons) => {
        if (disposed || currentGeneration !== generation) return;
        latestCoupons = coupons;
        refresh().catch(reportError);
      }, reportError);
    }
  });

  const foreground = AppState.addEventListener("change", (state) => {
    if (state === "active") refresh().catch(reportError);
  });

  return () => {
    disposed = true;
    generation++;
    stopAuth();
    stopCoupons();
    foreground.remove();
  };
};
