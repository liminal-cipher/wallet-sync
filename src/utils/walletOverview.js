const { daysRemaining, toDate, dayNumber } = require("./dateUtils");

const compareText = (a, b) => String(a || "").localeCompare(String(b || ""), "ko");
const compareOptional = (a, b, direction = 1) => a === null ? (b === null ? 0 : 1) : b === null ? -1 : direction * (a - b);
function sortWalletCoupons(records, order = "expiry") {
  return [...records].sort((a, b) => {
    let result;
    if (order === "newest") result = compareOptional(toDate(a.createdAt)?.getTime() ?? null, toDate(b.createdAt)?.getTime() ?? null, -1);
    else if (order === "title") result = compareText(a.brand, b.brand);
    else result = compareOptional(dayNumber(a.expiryDay || a.expiryDate), dayNumber(b.expiryDay || b.expiryDate));
    return result || compareText(a.brand, b.brand) || compareText(a.id, b.id);
  });
}
function walletOverview(records, now = new Date()) {
  const result = { active: 0, soon: 0, today: 0, used: 0, expired: 0, balance: 0, knownBalances: 0, unknownBalances: 0 };
  for (const record of records) {
    if (!record || record.deletedAt) continue;
    if (record.isUsed) { result.used++; continue; }
    const days = daysRemaining(record.expiryDay || record.expiryDate, now);
    if (days !== null && days < 0) { result.expired++; continue; }
    result.active++;
    if (days !== null && days <= 7) result.soon++;
    if (days === 0) result.today++;
    if (record.catalogue?.benefitType !== "monetary") continue;
    const money = record.catalogue.money;
    if (money?.currency === "KRW" && money.balanceMode === "manual" && Number.isSafeInteger(money.remainingBalance) && money.remainingBalance >= 0) {
      result.knownBalances++;
      // Never display an imprecise total for otherwise valid large amounts.
      if (result.balance !== null) {
        const total = result.balance + money.remainingBalance;
        result.balance = Number.isSafeInteger(total) ? total : null;
      }
    } else result.unknownBalances++;
  }
  return result;
}
module.exports = { sortWalletCoupons, walletOverview };
