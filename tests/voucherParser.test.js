const {
  extractExpiryDate,
  extractBarcodeNumber,
  extractBrand,
  parseVoucherText,
} = require("../src/utils/voucherParser");

describe("voucherParser", () => {
  describe("extractExpiryDate", () => {
    test("extracts Korean formatted date (YYYY년 MM월 DD일)", () => {
      const text = "유효기간: 2026년 10월 25일까지 사용 가능";
      const date = extractExpiryDate(text);
      expect(date).not.toBeNull();
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(9); // 0-indexed (10월)
      expect(date.getDate()).toBe(25);
    });

    test("extracts dot-separated date (YYYY.MM.DD)", () => {
      const text = "유효기간 : 2027.05.30 교환처: 스타벅스";
      const date = extractExpiryDate(text);
      expect(date).not.toBeNull();
      expect(date.getFullYear()).toBe(2027);
      expect(date.getMonth()).toBe(4); // 5월
      expect(date.getDate()).toBe(30);
    });

    test("extracts hyphen-separated date (YYYY-MM-DD)", () => {
      const text = "만료일 2026-12-31";
      const date = extractExpiryDate(text);
      expect(date).not.toBeNull();
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(11); // 12월
      expect(date.getDate()).toBe(31);
    });

    test("extracts short year date (YY.MM.DD)", () => {
      const text = "유효일자: 27.08.15";
      const date = extractExpiryDate(text);
      expect(date).not.toBeNull();
      expect(date.getFullYear()).toBe(2027);
      expect(date.getMonth()).toBe(7); // 8월
      expect(date.getDate()).toBe(15);
    });

    test("returns null for invalid or missing dates", () => {
      expect(extractExpiryDate("")).toBeNull();
      expect(extractExpiryDate("날짜 정보 없음")).toBeNull();
      expect(extractExpiryDate(null)).toBeNull();
    });
  });

  describe("extractBarcodeNumber", () => {
    test("extracts labeled barcode numbers with dashes or spaces", () => {
      const text = "[카카오톡 선물하기]\n쿠폰번호: 9912-3456-7890\n교환처: 스타벅스";
      expect(extractBarcodeNumber(text)).toBe("991234567890");
    });

    test("extracts formatted numeric sequence", () => {
      const text = "바코드: 1234 5678 9012 3456";
      expect(extractBarcodeNumber(text)).toBe("1234567890123456");
    });

    test("extracts raw 12-digit barcode without label", () => {
      const text = "스타벅스 아이스 아메리카노 880123456789 2026.12.31";
      expect(extractBarcodeNumber(text)).toBe("880123456789");
    });

    test("returns null when no barcode digits found", () => {
      expect(extractBarcodeNumber("스타벅스 쿠폰입니다")).toBeNull();
    });
  });

  describe("extractBrand", () => {
    test("identifies known brand from dictionary", () => {
      const text = "배스킨라빈스 싱글레귤러 교환권 2026.12.31";
      expect(extractBrand(text)).toBe("배스킨라빈스");
    });

    test("extracts brand from labeled field (교환처: ...)", () => {
      const text = "[기프티쇼]\n상품명: 카페라떼\n교환처: 투썸플레이스\n유효기간: 2026.11.20";
      expect(extractBrand(text)).toBe("투썸플레이스");
    });

    test("extracts brand from header brackets", () => {
      const text = "[올리브영] 모바일 상품권 10,000원권";
      expect(extractBrand(text)).toBe("올리브영");
    });

    test("returns null when no brand is found", () => {
      expect(extractBrand("알 수 없는 상품")).toBeNull();
    });
  });

  describe("parseVoucherText", () => {
    test("comprehensively parses a full KakaoTalk gifticon text", () => {
      const gifticonMsg = `
[카카오톡 선물하기]
교환처: 스타벅스
상품명: 카페 아메리카노 T
쿠폰번호: 9912-3456-7890
유효기간: 2026년 12월 25일까지
      `;

      const result = parseVoucherText(gifticonMsg);
      expect(result.brand).toBe("스타벅스");
      expect(result.barcodeNumber).toBe("991234567890");
      expect(result.expiryDate).not.toBeNull();
      expect(result.expiryDate.getFullYear()).toBe(2026);
      expect(result.expiryDate.getMonth()).toBe(11);
      expect(result.expiryDate.getDate()).toBe(25);
    });

    test("handles null/empty input gracefully", () => {
      expect(parseVoucherText(null)).toEqual({
        brand: null,
        barcodeNumber: null,
        expiryDate: null,
      });
    });
  });
});
