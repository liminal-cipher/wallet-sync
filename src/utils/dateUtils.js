// Calendar dates deliberately have no UTC offset. Legacy timestamps remain readable.
const { couponMatchesSearch } = require("./couponSearch");
const toDate = (value) => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  try {
    if (typeof value.toDate === "function") {
      const date = value.toDate();
      return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
    }
    if (typeof value.seconds === "number" && typeof value.nanoseconds === "number") {
      return toDate(value.seconds * 1000 + value.nanoseconds / 1e6);
    }
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      const date = new Date(0);
      date.setFullYear(y, m - 1, d); date.setHours(12, 0, 0, 0);
      return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch { return null; }
};
const toDay = (value) => {
  const date = toDate(value);
  return date ? `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : null;
};
const dayNumber = (value) => {
  const d = toDate(value);
  if (!d) return null;
  const utc = new Date(0);
  utc.setUTCFullYear(d.getFullYear(), d.getMonth(), d.getDate());
  return utc.getTime() / 86400000;
};
const daysRemaining = (value, now = new Date()) => {
  const expiry = dayNumber(value);
  const today = dayNumber(now);
  return expiry === null || today === null ? null : expiry - today;
};
const getExpiryInfo = (expiryDate, isUsed, now = new Date()) => {
  const neutral = { color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1" };
  if (isUsed) return { ...neutral, text: "사용 완료" };
  if (!expiryDate) return { text: "만료일 없음", color: "#10B981", bg: "#ECFDF5", border: "#6EE7B7" };
  const days = daysRemaining(expiryDate, now);
  if (days === null) return { ...neutral, text: "만료일 미정" };
  if (days < 0) return { text: "만료됨", color: "#E11D48", bg: "#FFE4E6", border: "#FDA4AF" };
  if (days === 0) return { text: "D-Day (오늘)", color: "#EA580C", bg: "#FFEDD5", border: "#FDBA74" };
  return { text: `D-${days}`, color: "#059669", bg: "#D1FAE5", border: "#6EE7B7" };
};
const sortCouponsByExpiry = (coupons) => !Array.isArray(coupons) ? [] : [...coupons].sort((a, b) =>
  (dayNumber(a.expiryDay || a.expiryDate) ?? 0) - (dayNumber(b.expiryDay || b.expiryDate) ?? 0));
const filterCoupons = (coupons, filter, search = "", now = new Date()) => coupons.filter((c) => {
  if (c.deletedAt || !couponMatchesSearch(c, search)) return false;
  const days = daysRemaining(c.expiryDay || c.expiryDate, now);
  if (filter === "used") return c.isUsed;
  if (filter === "expired") return !c.isUsed && days !== null && days < 0;
  if (filter === "soon") return !c.isUsed && days !== null && days >= 0 && days <= 7;
  if (filter === "active") return !c.isUsed && (days === null || days >= 0);
  return true;
});
module.exports = { toDate, toDay, dayNumber, daysRemaining, getExpiryInfo, sortCouponsByExpiry, filterCoupons };
