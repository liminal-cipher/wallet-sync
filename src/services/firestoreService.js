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
import { db } from "./firebase";

export const fetchCoupons = async (userId) => {
  try {
    const couponsRef = collection(db, "coupons");
    let q = couponsRef;
    if (userId) {
      q = query(couponsRef, where("userId", "==", userId));
    }
    const querySnapshot = await getDocs(q);

    const coupons = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Sort in memory by expiryDate ascending to avoid requiring a custom Firestore composite index
    coupons.sort((a, b) => {
      const dateA = a.expiryDate?.toDate ? a.expiryDate.toDate() : new Date(a.expiryDate || 0);
      const dateB = b.expiryDate?.toDate ? b.expiryDate.toDate() : new Date(b.expiryDate || 0);
      return dateA - dateB;
    });

    return coupons;
  } catch (error) {
    console.error("Error fetching coupons:", error);
    throw error;
  }
};

export const addCoupon = async (couponData) => {
  try {
    const couponsRef = collection(db, "coupons");
    const docRef = await addDoc(couponsRef, {
      ...couponData,
      createdAt: new Date(),
    });
    return docRef;
  } catch (error) {
    console.error("Error adding coupon:", error);
    throw error;
  }
};

export const updateCoupon = async (couponId, updatedData) => {
  try {
    const docRef = doc(db, "coupons", couponId);
    await updateDoc(docRef, updatedData);
  } catch (error) {
    console.error("Error updating coupon:", error);
    throw error;
  }
};

export const deleteCoupon = async (couponId) => {
  try {
    const docRef = doc(db, "coupons", couponId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting coupon:", error);
    throw error;
  }
};
