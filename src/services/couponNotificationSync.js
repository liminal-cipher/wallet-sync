import { AppState, Platform } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { subscribeCoupons } from "./firestoreService";
import { loadReminderSettings, observeReminderSettings } from "./reminderSettings";
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
  let refreshSequence = 0;
  let userId = null;
  let latestCoupons = null;
  let stopCoupons = () => {};
  let permissionsReady = null;
  const reportError = (error) => console.error("Coupon notification sync error:", error);

  const refresh = async () => {
    const sequence = ++refreshSequence;
    const currentGeneration = generation;
    const settings = userId ? await loadReminderSettings(userId) : null;
    if (disposed || currentGeneration !== generation || sequence !== refreshSequence || !userId || !settings) return;
    if (settings.enabled) {
      permissionsReady ||= requestNotificationPermissions();
      await permissionsReady;
    }
    if (!disposed && currentGeneration === generation && sequence === refreshSequence && userId && latestCoupons !== null) {
      await reconcileCouponNotifications(userId, latestCoupons, settings);
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
      stopCoupons = subscribeCoupons(userId, (coupons, metadata) => {
        if (disposed || currentGeneration !== generation) return;
        // A cold-start cache miss is not evidence that the wallet was emptied.
        if (metadata?.hasPendingWrites || (metadata?.fromCache && !coupons.length)) return;
        latestCoupons = coupons;
        refresh().catch(reportError);
      }, reportError);
    }
  });

  const foreground = AppState.addEventListener("change", (state) => {
    if (state === "active") refresh().catch(reportError);
  });
  const stopSettings = observeReminderSettings((uid) => { if (uid === userId) refresh().catch(reportError); });

  return () => {
    disposed = true;
    generation++;
    stopAuth();
    stopCoupons();
    stopSettings();
    foreground.remove();
  };
};
