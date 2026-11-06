export function driveAvailable() { return false; }
export async function authorizeDrive() { throw new Error("Drive 연결은 Android 설치용 앱에서 사용할 수 있습니다."); }
export async function clearDriveToken() {}
