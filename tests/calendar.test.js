const { execFileSync } = require("child_process");
const { toDay, daysRemaining, filterCoupons } = require("../src/utils/dateUtils");
test("Sydney autumn and spring DST boundaries each advance exactly one calendar day", () => {
  const source = `const {daysRemaining}=require('./src/utils/dateUtils'); console.log(JSON.stringify([
    daysRemaining('2026-04-06',new Date(2026,3,5,12)),
    daysRemaining('2026-10-05',new Date(2026,9,4,12))]));`;
  const output = execFileSync(process.execPath, ["-e", source], { cwd: process.cwd(), env: { ...process.env, TZ: "Australia/Sydney" }, encoding: "utf8" });
  expect(JSON.parse(output)).toEqual([1, 1]);
});
test("canonical dates remain unchanged across a date-line time-zone change", () => {
  for (const zone of ["Australia/Sydney", "Pacific/Honolulu", "Asia/Seoul"]) {
    const output = execFileSync(process.execPath, ["-e", "console.log(require('./src/utils/dateUtils').toDay('2027-01-01'))"], { env: { ...process.env, TZ: zone }, encoding: "utf8" });
    expect(output.trim()).toBe("2027-01-01");
  }
  expect(toDay("2026-02-30")).toBeNull();
});
test("active and expiring-soon filters exclude expired, used and trashed coupons and search by brand", () => {
  const now = new Date(2026, 9, 17, 23, 59);
  const records = [
    { brand: "Coffee", expiryDay: "2026-10-18" }, { brand: "Tea", expiryDay: "2026-10-16" },
    { brand: "Used", isUsed: true }, { brand: "Trash", deletedAt: "2026-10-17" },
  ];
  expect(filterCoupons(records, "active", "", now).map((r) => r.brand)).toEqual(["Coffee"]);
  expect(filterCoupons(records, "soon", "COFF", now)).toEqual([records[0]]);
  expect(filterCoupons(records, "expired", "", now)).toEqual([records[1]]);
  expect(daysRemaining("2026-10-18", now)).toBe(1);
  expect(daysRemaining("2026-10-18", new Date(2026, 9, 18, 0, 0))).toBe(0);
});
