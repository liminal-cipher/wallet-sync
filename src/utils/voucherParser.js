/**
 * Voucher & Gifticon Smart Parser
 * Automatically extracts brand name, barcode number, and expiry date from text/OCR output.
 */

// Popular Korean gifticon / coupon brands and retailers
const KNOWN_BRANDS = [
  "스타벅스",
  "투썸플레이스",
  "투썸",
  "이디야커피",
  "이디야",
  "메가커피",
  "빽다방",
  "컴포즈커피",
  "폴바셋",
  "할리스",
  "배스킨라빈스",
  "베스킨라빈스",
  "설빙",
  "던킨",
  "던킨도너츠",
  "크리스피크림",
  "파리바게뜨",
  "파리바게트",
  "뚜레쥬르",
  "올리브영",
  "CU",
  "GS25",
  "세븐일레븐",
  "이마트24",
  "미니스톱",
  "이마트",
  "신세계백화점",
  "롯데백화점",
  "현대백화점",
  "교촌치킨",
  "BHC",
  "bbq",
  "BBQ",
  "굽네치킨",
  "푸라닭",
  "맘스터치",
  "버거킹",
  "맥도날드",
  "롯데리아",
  "KFC",
  "서브웨이",
  "도미노피자",
  "피자헛",
  "미스터피자",
  "아웃백",
  "빕스",
  "CGV",
  "메가박스",
  "롯데시네마",
  "요기요",
  "배달의민족",
  "쿠팡이츠",
  "문화상품권",
  "해피머니",
  "도서문화상품권",
];

/**
 * Extracts a valid expiry Date object from arbitrary text.
 * Handles formats like:
 * - 2026.12.31 / 2026. 12. 31
 * - 2026-12-31
 * - 2026/12/31
 * - 2026년 12월 31일
 * - 26.12.31 / 26-12-31
 * 
 * @param {string} text 
 * @returns {Date|null}
 */
function extractExpiryDate(text) {
  if (!text || typeof text !== "string") return null;

  // 1. YYYY년 MM월 DD일
  const koreanDateRegex = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/;
  const koreanMatch = text.match(koreanDateRegex);
  if (koreanMatch) {
    const year = parseInt(koreanMatch[1], 10);
    const month = parseInt(koreanMatch[2], 10) - 1;
    const day = parseInt(koreanMatch[3], 10);
    const d = new Date(year, month, day, 23, 59, 59, 999);
    if (!isNaN(d.getTime())) return d;
  }

  // 2. YYYY.MM.DD, YYYY-MM-DD, YYYY/MM/DD
  const fullDateRegex = /(\d{4})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})/;
  const fullMatch = text.match(fullDateRegex);
  if (fullMatch) {
    const year = parseInt(fullMatch[1], 10);
    const month = parseInt(fullMatch[2], 10) - 1;
    const day = parseInt(fullMatch[3], 10);
    const d = new Date(year, month, day, 23, 59, 59, 999);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. YY.MM.DD, YY-MM-DD, YY/MM/DD (assuming 2000s)
  const shortDateRegex = /(?:^|[^\d])(\d{2})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})/;
  const shortMatch = text.match(shortDateRegex);
  if (shortMatch) {
    const year = 2000 + parseInt(shortMatch[1], 10);
    const month = parseInt(shortMatch[2], 10) - 1;
    const day = parseInt(shortMatch[3], 10);
    const d = new Date(year, month, day, 23, 59, 59, 999);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Extracts a barcode or coupon pin number from text.
 * Prioritizes labeled barcode numbers (쿠폰번호, 바코드, 바코드번호, etc.)
 * or finds 8-24 digit numeric sequences (including hyphens/spaces).
 * 
 * @param {string} text 
 * @returns {string|null}
 */
function extractBarcodeNumber(text) {
  if (!text || typeof text !== "string") return null;

  // 1. Explicit keyword match
  const labeledRegex = /(?:바코드(?:\s*번호)?|쿠폰\s*번호|인증\s*번호|PIN|pin|PIN\s*번호)[\s:：]+([0-9\s\-]{8,30})/i;
  const labeledMatch = text.match(labeledRegex);
  if (labeledMatch) {
    const cleaned = labeledMatch[1].replace(/[\s\-]/g, "");
    if (/^\d{8,24}$/.test(cleaned)) {
      return cleaned;
    }
  }

  // 2. Standalone formatted numeric chunks like 1234-5678-9012 or 9912 3456 7890
  const formattedPattern = /\b\d{3,6}[\s\-]\d{3,6}[\s\-]\d{3,6}(?:[\s\-]\d{3,6})?\b/g;
  const formattedMatches = text.match(formattedPattern);
  if (formattedMatches && formattedMatches.length > 0) {
    for (const m of formattedMatches) {
      const cleaned = m.replace(/[\s\-]/g, "");
      if (cleaned.length >= 8 && cleaned.length <= 24) {
        return cleaned;
      }
    }
  }

  // 3. Raw consecutive digit sequence (8 to 24 digits), excluding dates like 20261231
  const rawDigitsRegex = /\b\d{8,24}\b/g;
  const rawMatches = text.match(rawDigitsRegex);
  if (rawMatches) {
    for (const match of rawMatches) {
      // Ignore 8-digit strings that are obviously dates (e.g. 20250101 ~ 20351231)
      if (match.length === 8 && /^(20[2-3]\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(match)) {
        continue;
      }
      return match;
    }
  }

  return null;
}

/**
 * Extracts a brand or exchange place name from text.
 * 
 * @param {string} text 
 * @returns {string|null}
 */
function extractBrand(text) {
  if (!text || typeof text !== "string") return null;

  // 1. Check for labeled brand keywords (교환처, 사용처, 가맹점, 브랜드)
  const labeledBrandRegex = /(?:교환처|사용처|가맹점|브랜드|매장)[\s:：]+([^\n\r,]+)/;
  const labeledMatch = text.match(labeledBrandRegex);
  if (labeledMatch) {
    const rawBrand = labeledMatch[1].trim();
    // Match against known brands
    for (const known of KNOWN_BRANDS) {
      if (rawBrand.toLowerCase().includes(known.toLowerCase())) {
        return known;
      }
    }
    if (rawBrand.length > 0 && rawBrand.length <= 30) {
      return rawBrand;
    }
  }

  // 2. Scan text for known brand dictionary
  for (const known of KNOWN_BRANDS) {
    const regex = new RegExp(`(^|[^가-힣a-zA-Z0-9])${known}([^가-힣a-zA-Z0-9]|$)`, "i");
    if (regex.test(text) || text.includes(known)) {
      return known;
    }
  }

  // 3. Check for bracketed header like [스타벅스], [올리브영]
  const bracketMatch = text.match(/\[([^\]]{2,20})\]/);
  if (bracketMatch) {
    const candidate = bracketMatch[1].trim();
    if (!["카카오톡 선물하기", "기프티쇼", "기프티콘", "아이엠도넛", "스마트콘", "쿠폰", "모바일상품권"].includes(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Parses full gifticon/coupon text into structured metadata.
 * 
 * @param {string} text 
 * @returns {{ brand: string|null, barcodeNumber: string|null, expiryDate: Date|null }}
 */
function parseVoucherText(text) {
  if (!text || typeof text !== "string") {
    return { brand: null, barcodeNumber: null, expiryDate: null };
  }

  return {
    brand: extractBrand(text),
    barcodeNumber: extractBarcodeNumber(text),
    expiryDate: extractExpiryDate(text),
  };
}

module.exports = {
  KNOWN_BRANDS,
  extractExpiryDate,
  extractBarcodeNumber,
  extractBrand,
  parseVoucherText,
};
