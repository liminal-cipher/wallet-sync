const { getExpiryInfo } = require("../src/utils/dateUtils");

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
