import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
} from "firebase/firestore";
import { db, auth } from "./firebase";

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

    // Sort in memory by expiryDate ascending
    coupons.sort((a, b) => {
      const getMillis = (val) => {
        if (!val) return 0;
        if (typeof val.toDate === "function") return val.toDate().getTime();
        const t = new Date(val).getTime();
        return isNaN(t) ? 0 : t;
      };
      return getMillis(a.expiryDate) - getMillis(b.expiryDate);
    });

    return coupons;
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
