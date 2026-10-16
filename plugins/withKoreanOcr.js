const { withBaseMod } = require("@expo/config-plugins");

// rn-mlkit-ocr's selective-model plugin capitalises names that its podspec
// compares in lower case. Keep the two bundled scripts consistent on iOS.
module.exports = (config) => withBaseMod(config, {
  platform: "ios",
  mod: "podfile",
  async action({ modRequest, ...rest }) {
    // Expo chains ordinary mods in reverse registration order. Run the upstream
    // modifier first so it cannot reintroduce capitalised model names afterwards.
    const result = await modRequest.nextMod({ ...rest, modRequest });
    result.modResults.contents = result.modResults.contents.replace(
      /\$ReactNativeOcrSubspecs\s*=\s*\[[^\]]*\]/g,
      "$ReactNativeOcrSubspecs = ['latin', 'korean']"
    );
    return result;
  },
});
