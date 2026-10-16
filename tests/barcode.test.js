const { encodeCode128B } = require("../src/utils/barcodeEncoder");

describe("BarcodeRenderer - Code 128 Encoding", () => {
  test("encodes standard numeric barcode correctly", () => {
    const { barElements, totalModules } = encodeCode128B("12345678");
    expect(barElements.length).toBeGreaterThan(0);
    // Number of modules = (8 characters + start(1) + checksum(1) + stop(1)) -> (8+2)*11 + 13 = 123 modules
    expect(totalModules).toBe(123);
  });

  test("handles empty string gracefully", () => {
    const { barElements, totalModules } = encodeCode128B("");
    expect(totalModules).toBe(35); // Start(11) + Checksum(11) + Stop(13)
  });

  test("rejects unsupported characters without silently changing the payload", () => {
    expect(() => encodeCode128B("스타벅스1234")).toThrow("printable ASCII");
    expect(encodeCode128B("12-34")).not.toEqual(encodeCode128B("1234"));
  });

  test("alternates between bars and spaces", () => {
    const { barElements } = encodeCode128B("987654321");
    for (let i = 0; i < barElements.length; i++) {
      const expectedIsBar = i % 2 === 0;
      expect(barElements[i].isBar).toBe(expectedIsBar);
    }
  });
});
