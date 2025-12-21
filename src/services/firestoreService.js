import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "./firebase.js";

export const fetchCoupons = async () => {
  try {
    const couponsRef = collection(db, "coupons");
    const querySnapshot = await getDocs(couponsRef);

    const coupons = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return coupons;
  } catch (error) {
    console.error("Error fetching coupons:", error);
    throw error;
  }
};

export const addCoupon = async (couponData) => {
  try {
    const couponsRef = collection(db, "coupons");
    const docRef = await addDoc(couponsRef, couponData);
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
