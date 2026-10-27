const { toDate } = require("./dateUtils");

function reminderSchedule(userId, coupons, settings, now = new Date()) {
  if (!userId || !settings?.enabled) return [];
  const entries = [];
  for (const coupon of coupons) {
    if (!coupon?.id || coupon.userId !== userId || coupon.isUsed || coupon.deletedAt) continue;
    const expiry = toDate(coupon.expiryDay || coupon.expiryDate);
    if (!expiry) continue;
    for (const daysBefore of new Set(settings.days)) {
      const date = new Date(expiry);
      date.setDate(date.getDate() - daysBefore);
      date.setHours(settings.hour, settings.minute, 0, 0);
      if (date.getTime() <= now.getTime()) continue;
      entries.push({ couponId: coupon.id, brand: coupon.brand, daysBefore, date });
    }
  }
  return entries.sort((a, b) => a.date - b.date || a.couponId.localeCompare(b.couponId) || a.daysBefore - b.daysBefore);
}
module.exports = { reminderSchedule };
