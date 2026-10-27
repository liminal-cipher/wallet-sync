const { walletOverview, sortWalletCoupons } = require("../src/utils/walletOverview");
const { filterCoupons } = require("../src/utils/dateUtils");
const now = new Date(2026, 9, 27, 12);
const monetary = (remainingBalance, extra = {}) => ({ brand: "금액권", expiryDay: "2026-10-27", catalogue: {
  benefitType: "monetary", money: { currency: "KRW", balanceMode: "manual", remainingBalance, faceValue: 50000 },
}, ...extra });

test("overview separates unknown and zero balances and excludes used, expired and trashed value", () => {
  const records = [monetary(1000), monetary(0), monetary(null), monetary(5000, { isUsed: true }),
    monetary(5000, { expiryDay: "2026-10-26" }), monetary(5000, { deletedAt: "2026-10-26" }),
    { brand: "Coffee", expiryDay: "2026-11-03" }];
  expect(walletOverview(records, now)).toEqual({ active: 4, today: 3, soon: 4, used: 1, expired: 1, balance: 1000, knownBalances: 2, unknownBalances: 1 });
  expect(walletOverview([monetary(Number.MAX_SAFE_INTEGER), monetary(1)], now).balance).toBeNull();
});
test("sort modes handle missing dates, stable ties and serialised timestamps without mutating input", () => {
  const records = [{ id: "c", brand: "다" }, { id: "b", brand: "나", expiryDay: "2026-12-01", createdAt: { seconds: 2, nanoseconds: 0 } },
    { id: "a", brand: "가", expiryDay: "2026-11-01", createdAt: "1970-01-01T00:00:01Z" }];
  expect(sortWalletCoupons(records).map((r) => r.id)).toEqual(["a", "b", "c"]);
  expect(sortWalletCoupons(records, "newest").map((r) => r.id)).toEqual(["b", "a", "c"]);
  expect(sortWalletCoupons(records, "title").map((r) => r.id)).toEqual(["a", "b", "c"]);
  expect(records.map((r) => r.id)).toEqual(["c", "b", "a"]);
});
test("wallet searches raw barcode and conditions without changing the stored payload", () => {
  const record = { brand: "Coffee", barcodeNumber: "0012-3456", conditions: "주말 사용 불가" };
  expect(filterCoupons([record], "active", "00123456", now)).toEqual([record]);
  expect(filterCoupons([record], "active", "주말", now)).toEqual([record]);
  expect(record.barcodeNumber).toBe("0012-3456");
});
