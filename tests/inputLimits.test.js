const { originalByteLength, utf8ByteLength, MAX_IMAGE_BYTES } = require("../src/utils/inputLimits");
const { parseWalletBackup } = require("../src/utils/backupData");
test("UTF-8 limits count Korean and supplementary characters as bytes", () => {
  const value = "abc가나다🙂";
  expect(utf8ByteLength(value)).toBe(Buffer.byteLength(value, "utf8"));
  expect(utf8ByteLength("가".repeat(100), 50)).toBeGreaterThan(50);
});
test("originals reject invalid padding, incomplete groups and oversized decoded data", () => {
  expect(originalByteLength("data:image/png;base64,YQ==")).toBe(1);
  for (const data of ["Y", "YQ=", "Y===", "====", "YQ==AA==", ""]) {
    expect(() => originalByteLength(`data:image/png;base64,${data}`)).toThrow();
  }
  expect(() => originalByteLength(`data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64")}`)).toThrow("10MB");
});
test("unknown backup formats are rejected before parsing", () => {
  expect(() => parseWalletBackup('{"app":"wallet-sync","version":1,"records":[]}', "pdf")).toThrow("CSV");
});
