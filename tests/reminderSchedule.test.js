const { reminderSchedule } = require("../src/utils/reminderSchedule");
const { toDate, daysRemaining } = require("../src/utils/dateUtils");
const settings = { enabled: true, hour: 9, minute: 0, days: [7, 3, 0, 0] };
const record = { id: "one", userId: "owner", brand: "Coffee", expiryDay: "2026-11-03" };
test("shared forecasts include both creators but only the selected wallet", () => {
  const shared = { ...record, userId: "guest", walletId: "shared" };
  const mixed = [record, shared, { ...shared, id: "elsewhere", walletId: "other-wallet" }];
  expect(reminderSchedule("owner", mixed, settings, new Date(2026, 9, 27, 9), "shared").map((r) => r.couponId)).toEqual(["one", "one"]);
  expect(reminderSchedule("owner", [shared], settings, new Date(2026, 9, 27, 9))).toEqual([]);
});
test("forecast excludes past times, duplicates, other accounts, used and trashed records", () => {
  const entries = reminderSchedule("owner", [record, { ...record, id: "other", userId: "other" },
    { ...record, id: "used", isUsed: true }, { ...record, id: "trash", deletedAt: true }], settings, new Date(2026, 9, 27, 9));
  expect(entries.map((r) => [r.daysBefore, r.date])).toEqual([[3, new Date(2026, 9, 31, 9)], [0, new Date(2026, 10, 3, 9)]]);
  expect(reminderSchedule("owner", [record], { ...settings, enabled: false })).toEqual([]);
  expect(reminderSchedule("owner", [record], null)).toEqual([]);
});
test("invalid timestamp adapters fail closed instead of crashing a wallet render", () => {
  expect(toDate({ toDate: () => new Date(NaN) })).toBeNull();
  expect(toDate({ toDate: () => { throw new Error("broken"); } })).toBeNull();
  expect(daysRemaining("2026-11-03", new Date(NaN))).toBeNull();
  expect(toDate({ seconds: 1, nanoseconds: 0 }).getTime()).toBe(1000);
});
