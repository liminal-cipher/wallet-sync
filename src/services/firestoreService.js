import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { sortCouponsByExpiry } from "../utils/dateUtils";

/**
 * Real-time snapshot listener for the authenticated user's coupons.
 * Automatically synchronizes changes across multiple clients/devices.
 * 
 * @param {string|null} userId 
 * @param {function} onUpdate Callback receiving sorted coupon array
 * @param {function} onError Callback receiving errors
 * @returns {function} Unsubscribe cleanup function
 */
export const subscribeCoupons = (userId, onUpdate, onError) => {
  const currentUid = userId || auth.currentUser?.uid;
  if (!currentUid) {
    if (typeof onUpdate === "function") onUpdate([]);
    return () => {};
  }

  try {
    const couponsRef = collection(db, "coupons");
    const q = query(couponsRef, where("userId", "==", currentUid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const coupons = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        const sorted = sortCouponsByExpiry(coupons);
        if (typeof onUpdate === "function") {
          onUpdate(sorted);
        }
      },
      (error) => {
        console.error("Firestore onSnapshot error:", error);
        if (typeof onError === "function") {
          onError(error);
        }
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("Error setting up coupon subscription:", error);
    if (typeof onError === "function") onError(error);
    return () => {};
  }
};

export const fetchCoupons = async (userId) => {
  const currentUid = userId || auth.currentUser?.uid;
  if (!currentUid) {
    return [];
  }

  try {
    const couponsRef = collection(db, "coupons");
    const q = query(couponsRef, where("userId", "==", currentUid));
    const querySnapshot = await getDocs(q);

    const coupons = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return sortCouponsByExpiry(coupons);
  } catch (error) {
    console.error("Error fetching coupons:", error);
    throw error;
  }
};

export const addCoupon = async (couponData) => {
  const currentUid = couponData.userId || auth.currentUser?.uid;
  if (!currentUid || currentUid === "anonymous") {
    throw new Error("로그인된 사용자 정보가 없습니다.");
  }

  try {
    const couponsRef = collection(db, "coupons");
    const docRef = await addDoc(couponsRef, {
      ...couponData,
      userId: currentUid,
      createdAt: new Date(),
    });
    return docRef;
  } catch (error) {
    console.error("Error adding coupon:", error);
    throw error;
  }
};

export const updateCoupon = async (couponId, updatedData) => {
  if (!couponId) {
    throw new Error("쿠폰 ID가 유효하지 않습니다.");
  }
  try {
    const docRef = doc(db, "coupons", couponId);
    await updateDoc(docRef, updatedData);
  } catch (error) {
    console.error("Error updating coupon:", error);
    throw error;
  }
};

export const deleteCoupon = async (couponId) => {
  if (!couponId) {
    throw new Error("쿠폰 ID가 유효하지 않습니다.");
  }
  try {
    const docRef = doc(db, "coupons", couponId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting coupon:", error);
    throw error;
  }
};
