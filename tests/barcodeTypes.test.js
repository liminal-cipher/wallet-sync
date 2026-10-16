const { barcodeSvg } = require("../src/utils/barcodes");
test.each([
  ["code128", "AB-12 34"], ["code39", "AB-12 34"], ["qr", "안녕-12 34\nhttps://example.com"],
  ["ean13", "5901234123457"], ["ean8", "96385074"], ["upc_a", "036000291452"], ["upc_e", "01234565"],
])("renders %s without normalising the supplied payload", (type, payload) => {
  expect(barcodeSvg(payload, type)).toMatch(/^<svg/);
  if (type === "qr" || type === "code128") expect(barcodeSvg(payload, type)).not.toBe(barcodeSvg(payload.replace(/[- ]/g, ""), type));
});
test.each([["code128", "안녕123"], ["code39", "lowercase"], ["ean13", "590123412345"], ["ean13", "5901234123458"], ["upc_e", "01234564"]])("rejects invalid %s content rather than altering it", (type, value) => {
  expect(() => barcodeSvg(value, type)).toThrow();
});
