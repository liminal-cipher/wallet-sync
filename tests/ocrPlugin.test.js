const upstream = require("rn-mlkit-ocr/app.plugin.js");
const correctModels = require("../plugins/withKoreanOcr");
test("the real upstream/local Podfile mod chain finishes with the lowercase Korean model enabled", async () => {
  let config = { name: "fixture", slug: "fixture" };
  config = upstream(config, { ocrModels: ["latin", "korean"], ocrUseBundled: true });
  config = correctModels(config);
  const result = await config.mods.ios.podfile({ ...config, modResults: { contents: "platform :ios, '15.5'\n" }, modRequest: { platform: "ios", projectRoot: process.cwd() } });
  expect(result.modResults.contents).toContain("$ReactNativeOcrSubspecs = ['latin', 'korean']");
  expect(result.modResults.contents).not.toContain("'Korean'");
});
