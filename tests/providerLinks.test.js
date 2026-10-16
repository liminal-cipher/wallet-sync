jest.mock("react-native", () => ({ Linking: { openURL: jest.fn() }, Platform: { OS: "android" } }));
const { Linking, Platform } = require("react-native");
const { openOriginalProvider } = require("../src/services/providerLinks");
const { safeSourceUrl } = require("../src/utils/couponModel");
beforeEach(() => { jest.clearAllMocks(); Platform.OS = "android"; Linking.openURL.mockResolvedValue(); });
test("KakaoPay opens the app root and falls back to its official site when unavailable", async () => {
  await openOriginalProvider({ provider: "kakaoPay" });
  expect(Linking.openURL).toHaveBeenCalledWith("kakaopay://");
  Linking.openURL.mockRejectedValueOnce(new Error("Not installed"));
  await openOriginalProvider({ provider: "kakaoPay" });
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://www.kakaopay.com/");
});
test("web and T Membership use verified HTTPS pages without inventing barcode-screen routes", async () => {
  Platform.OS = "web";
  await openOriginalProvider({ provider: "kakaoPay" });
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://www.kakaopay.com/");
  await openOriginalProvider({ provider: "tMembership" });
  expect(Linking.openURL).toHaveBeenLastCalledWith(expect.stringContaining("https://sktmembership.tworld.co.kr/"));
  await expect(openOriginalProvider({ provider: "other", sourceUrl: "javascript:alert(1)" })).rejects.toThrow("https");
});
test("source paths remain unchanged even when the native URL implementation appends a slash", () => {
  const original = global.URL;
  try {
    global.URL = class { constructor(text) { this.protocol = "https:"; this.hostname = "example.com"; this.username = ""; this.password = ""; this.href = `${text}/`; } };
    expect(safeSourceUrl("https://example.com/events/123")).toBe("https://example.com/events/123");
    expect(() => safeSourceUrl("https:///missing-host")).toThrow("https");
    expect(() => safeSourceUrl("https://user@host.example/path")).toThrow("https");
  } finally { global.URL = original; }
});
