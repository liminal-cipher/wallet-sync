import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

const native = Platform.OS === "android" ? requireOptionalNativeModule("WalletDriveAuth") : null;
export function driveAvailable() { return !!native; }
export async function authorizeDrive(email = null, interactive = false, selectAccount = false) {
  if (!native) throw new Error("Drive 연결이 포함된 Android 설치용 앱으로 업데이트해 주세요.");
  return native.authorize(email, interactive, selectAccount);
}
export async function clearDriveToken(token) { if (native) await native.clearToken(token); }
