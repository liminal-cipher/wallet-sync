const { catalogue } = require("./catalogueFixtures");
const { normaliseCoupon } = require("../src/utils/couponModel");
const { BACKUP_VERSION, CSV_FIELDS, LEGACY_CSV_FIELDS, toCsv, parseBackup, planRestore, validateBackupRecords } = require("../src/utils/backupData");
const coupon = (changes = {}) => ({ brand: "폴바셋 룽고 쿠폰", kind: "voucher", barcodeType: "code128", barcodeNumber: "00-12 34", expiryDay: "2027-01-01", isUsed: false, ...changes });
const json = (records, version = BACKUP_VERSION) => JSON.stringify({ app: "wallet-sync", version, records, ...(version === 3 ? { brandPreferences: null } : {}) });

test("original v1 JSON and fixed-column CSV import without guessing catalogue fields", () => {
  const legacy = coupon({ conditions: 'Line one, "quoted"\nLine two' });
  const csv = [LEGACY_CSV_FIELDS, LEGACY_CSV_FIELDS.map((key) => String(legacy[key] ?? ""))]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
  for (const restored of [parseBackup(json([legacy], 1), "json")[0], parseBackup(csv, "csv")[0]]) {
    expect(restored).toMatchObject(legacy);
    expect(restored.catalogue).toBeNull();
  }
});
test("v2/v3 JSON and CSV recover exact metadata, manual balances and barcode text", () => {
  const product = normaliseCoupon(coupon({ catalogue: catalogue() }));
  const monetary = normaliseCoupon(coupon({ barcodeNumber: "other", catalogue: catalogue({ benefitType: "monetary", money: {
    currency: "KRW", faceValue: 10000, purchasePrice: 9000, remainingBalance: 0, balanceMode: "manual",
  } }) }));
  const unknown = normaliseCoupon({ ...monetary, barcodeNumber: "unknown", catalogue: { ...monetary.catalogue,
    money: { ...monetary.catalogue.money, remainingBalance: null } } });
  const records = [product, monetary, unknown];
  expect(BACKUP_VERSION).toBe(3);
  expect(CSV_FIELDS).toEqual([...LEGACY_CSV_FIELDS, "catalogue"]);
  for (const restored of [parseBackup(json(records, 2), "json"), parseBackup(json(records), "json"), parseBackup(toCsv(records), "csv")]) {
    expect(restored).toEqual(records.map((record) => ({ ...record, deletedAt: null, original: null })));
  }
});
test("v2 metadata escapes formula-like text and multiline content reversibly", () => {
  const record = normaliseCoupon(coupon({ catalogue: catalogue({ issuer: '=HYPERLINK("x")',
    snapshot: { brandName: "'Brand", productName: 'A, "B"\nC', variantName: "=ICE" } }) }));
  expect(parseBackup(toCsv([record]), "csv")[0]).toMatchObject(record);
});
test("future metadata and malformed CSV fail rather than losing information", () => {
  const valid = normaliseCoupon(coupon({ catalogue: catalogue() }));
  expect(() => parseBackup(json([valid], 4), "json")).toThrow("버전");
  expect(() => parseBackup(json([valid, coupon({ catalogue: { ...catalogue(), schemaVersion: 2 } })]), "json")).toThrow("2번째");
  expect(() => parseBackup(toCsv([valid]).replace('""schemaVersion"":1', '""schemaVersion"":2'), "csv")).toThrow("카탈로그");
  expect(() => parseBackup(toCsv([valid]).replace('"catalogue"', '"catalogue","future"'), "csv")).toThrow("열 형식");
  expect(() => toCsv([coupon({ catalogue: catalogue({ money: { currency: "KRW", faceValue: NaN } }) })])).toThrow("faceValue");
});
test("originals, trash and image references survive the supported recovery paths", () => {
  const image = { id: "12345678-1234-1234-1234-123456789abc", ownerId: "owner", mime: "image/png", cloudPath: null };
  const record = coupon({ catalogue: catalogue(), deletedAt: "2026-10-17T00:00:00.000Z", image, original: "data:image/png;base64,YQ==" });
  const portable = parseBackup(json([record]), "json")[0];
  expect(portable).toMatchObject({ catalogue: normaliseCoupon(record).catalogue, original: record.original, image: null });
  expect(portable.deletedAt.toISOString()).toBe(record.deletedAt);
  expect(validateBackupRecords([record], { localImages: true })[0].image).toEqual(image);
  expect(() => validateBackupRecords([{ ...record, image: { ...image, cloudPath: "originals/other/wrong" } }], { localImages: true })).toThrow("원본 이미지");
});
test("catalogue changes do not change duplicate identity or overwrite existing records", () => {
  const existing = normaliseCoupon(coupon({ catalogue: catalogue() }));
  const imported = normaliseCoupon({ ...existing, brand: "Changed title", catalogue: catalogue({ catalogueVersion: "test-v2" }) });
  expect(planRestore([imported], [existing])).toEqual({ additions: [], skipped: 1 });
  expect(existing.catalogue.catalogueVersion).toBe("test-v1");
});
