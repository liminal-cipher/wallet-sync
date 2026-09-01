const { getExpiryInfo, sortCouponsByExpiry } = require("../src/utils/dateUtils");

describe("dateUtils - getExpiryInfo", () => {
  test("returns '사용 완료' when coupon is marked used", () => {
    const info = getExpiryInfo(new Date(), true);
    expect(info.text).toBe("사용 완료");
  });

  test("returns '만료일 없음' when expiryDate is null or undefined", () => {
    expect(getExpiryInfo(null, false).text).toBe("만료일 없음");
    expect(getExpiryInfo(undefined, false).text).toBe("만료일 없음");
  });

  test("returns '만료일 미정' when date string is invalid", () => {
    expect(getExpiryInfo("invalid-date-string", false).text).toBe("만료일 미정");
  });

  test("returns 'D-Day (오늘)' when expiry date is today", () => {
    const today = new Date();
    expect(getExpiryInfo(today, false).text).toBe("D-Day (오늘)");
  });

  test("returns '만료됨' when expiry date is in the past", () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    expect(getExpiryInfo(past, false).text).toBe("만료됨");
  });

  test("returns correct D-number for future dates", () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    expect(getExpiryInfo(future, false).text).toBe("D-10");
  });
});

describe("dateUtils - sortCouponsByExpiry", () => {
  test("sorts coupons by expiryDate in ascending order", () => {
    const coupons = [
      { id: "1", brand: "C", expiryDate: new Date("2026-12-31") },
      { id: "2", brand: "A", expiryDate: new Date("2026-05-01") },
      { id: "3", brand: "B", expiryDate: new Date("2026-08-15") },
    ];

    const sorted = sortCouponsByExpiry(coupons);
    expect(sorted.map((c) => c.brand)).toEqual(["A", "B", "C"]);
  });

  test("handles Firestore Timestamp objects with toDate()", () => {
    const coupons = [
      {
        id: "1",
        brand: "Later",
        expiryDate: { toDate: () => new Date("2027-01-01") },
      },
      {
        id: "2",
        brand: "Earlier",
        expiryDate: { toDate: () => new Date("2026-06-01") },
      },
    ];

    const sorted = sortCouponsByExpiry(coupons);
    expect(sorted[0].brand).toBe("Earlier");
    expect(sorted[1].brand).toBe("Later");
  });

  test("handles null or missing expiry dates safely", () => {
    const coupons = [
      { id: "1", brand: "Valid", expiryDate: new Date("2026-12-31") },
      { id: "2", brand: "NullDate", expiryDate: null },
    ];

    const sorted = sortCouponsByExpiry(coupons);
    expect(sorted[0].brand).toBe("NullDate");
    expect(sorted[1].brand).toBe("Valid");
  });

  test("handles non-array inputs safely", () => {
    expect(sortCouponsByExpiry(null)).toEqual([]);
    expect(sortCouponsByExpiry(undefined)).toEqual([]);
  });
});
