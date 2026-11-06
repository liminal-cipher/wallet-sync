import { AppState, Platform } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { subscribeCoupons } from "./firestoreService";
import { getWalletScope, observeWalletScope } from "./walletSession";
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
  let selectedWalletId = null;
  const reportError = (error) => console.error("Coupon notification sync error:", error);

  const refresh = async () => {
    const sequence = ++refreshSequence;
    const currentGeneration = generation;
    const settings = userId ? await loadReminderSettings(userId) : null;
    if (disposed || currentGeneration !== generation || sequence !== refreshSequence || !userId || !settings) return;
    // Explicitly disabling reminders does not require a confirmed wallet snapshot.
    if (settings.enabled && latestCoupons === null) return;
    if (settings.enabled) {
      permissionsReady ||= requestNotificationPermissions();
      await permissionsReady;
    }
    if (!disposed && currentGeneration === generation && sequence === refreshSequence && userId) {
      await reconcileCouponNotifications(userId, latestCoupons ?? [], settings);
    }
  };

  const restart = (user, walletChanged = false) => {
    if (disposed) return;
    const currentGeneration = ++generation;
    stopCoupons();
    stopCoupons = () => {};
    userId = user?.uid || null;
    selectedWalletId = userId ? getWalletScope(userId).walletId : null;
    latestCoupons = null;
    clearCouponNotifications(walletChanged ? null : userId).catch(reportError);
    if (userId) {
      stopCoupons = subscribeCoupons(userId, (coupons, metadata) => {
        if (disposed || currentGeneration !== generation) return;
        // A cold-start cache miss is not evidence that the wallet was emptied.
        if (metadata?.hasPendingWrites || (metadata?.fromCache && !coupons.length)) return;
        latestCoupons = coupons;
        refresh().catch(reportError);
      }, reportError);
      refresh().catch(reportError);
    }
  };
  const stopAuth = onAuthStateChanged(auth, (user) => restart(user));
  const stopWallet = observeWalletScope((scope) => {
    if (userId && scope.uid === userId) restart({ uid: userId }, scope.walletId !== selectedWalletId);
  });

  const foreground = AppState.addEventListener("change", (state) => {
    if (state === "active") refresh().catch(reportError);
  });
  const stopSettings = observeReminderSettings((uid) => { if (uid === userId) refresh().catch(reportError); });

  return () => {
    disposed = true;
    generation++;
    stopAuth();
    stopWallet();
    stopCoupons();
    stopSettings();
    foreground.remove();
  };
};
