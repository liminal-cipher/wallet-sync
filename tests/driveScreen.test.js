global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("react-native", () => {
  const React = require("react");
  return { View: "View", Text: "Text", TextInput: "TextInput", TouchableOpacity: "TouchableOpacity", ScrollView: "ScrollView", Switch: "Switch", ActivityIndicator: "ActivityIndicator",
    Modal: ({ visible, children }) => visible ? React.createElement("Modal", null, children) : null,
    StyleSheet: { create: (value) => value }, Linking: { openURL: jest.fn() } };
});
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: (effect) => require("react").useEffect(effect, [effect]) }));
jest.mock("../src/services/firebase", () => ({ auth: { currentUser: { uid: "owner" } } }));
jest.mock("../src/services/driveService", () => Object.fromEntries(["driveAvailable", "loadDriveConnection", "connectDrive", "disconnectDrive", "createDriveFolder", "checkDriveFolder", "saveDriveBackup", "retryDriveBackup", "listDriveBackups", "readDriveBackup"].map((key) => [key, jest.fn()])));
jest.mock("../src/services/driveWalletActions", () => ({ syncDriveOriginals: jest.fn() }));
jest.mock("../src/services/backupService", () => ({ exportWallet: jest.fn(), previewRestore: jest.fn(), restoreWalletBackup: jest.fn() }));
const React = require("react");
const { create, act } = require("react-test-renderer");
const Screen = require("../src/screens/home/DriveScreen").default;
const drive = require("../src/services/driveService");
const backup = require("../src/services/backupService");
const { auth } = require("../src/services/firebase");
const { setActiveWallet } = require("../src/services/walletSession");
let renderer;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const button = (label) => renderer.root.findAllByType("TouchableOpacity").find((node) => node.findAllByType("Text").some((text) => text.children.join("") === label));
const text = () => renderer.root.findAllByType("Text").map((node) => node.children.join("")).join(" ");
const mount = async () => act(async () => { renderer = create(React.createElement(Screen, { navigation: { goBack: jest.fn() } })); await flush(); });
beforeEach(() => {
  jest.resetAllMocks(); auth.currentUser = { uid: "owner" }; setActiveWallet("owner");
  drive.driveAvailable.mockReturnValue(true); drive.loadDriveConnection.mockResolvedValue({ email: "fixture@example.test" });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); setActiveWallet(null); });
test("Google account selection and folder checks are separate explicit actions", async () => {
  await mount(); expect(drive.checkDriveFolder).not.toHaveBeenCalled();
  drive.connectDrive.mockResolvedValue({ email: "second@example.test" });
  await act(async () => button("Google 계정 다시 선택").props.onPress());
  expect(text()).toContain("second@example.test");
  drive.checkDriveFolder.mockRejectedValue(new Error("folder permission denied"));
  await act(async () => button("공유·보관 폴더 접근 확인").props.onPress());
  expect(text()).toContain("folder permission denied");
  expect(button("Drive에서 폴더 열기·공유 설정")).toBeUndefined();
});
test("a failed complete-original backup is not labelled saved", async () => {
  await mount(); backup.exportWallet.mockRejectedValue(new Error("원본을 찾을 수 없습니다"));
  await act(async () => button("Drive에 새 JSON 백업 저장").props.onPress());
  expect(text()).toContain("원본을 찾을 수 없습니다");
  expect(text()).not.toContain("JSON 백업을 저장하고 내용을 검증했습니다");
  expect(backup.exportWallet.mock.calls[0][1]).toBe(true);
  expect(backup.exportWallet.mock.calls[0][6]).toBe(drive.saveDriveBackup);
});
test("restoration requires confirmation and a late wallet switch invalidates it", async () => {
  drive.listDriveBackups.mockResolvedValue([{ id: "fixture", name: "backup.json" }]);
  drive.readDriveBackup.mockResolvedValue({ records: [] });
  backup.previewRestore.mockResolvedValue({ additions: [{ brand: "Coffee" }], skipped: 0 });
  await mount();
  await act(async () => button("Drive 백업 목록 새로고침").props.onPress());
  await act(async () => button("이 백업 복원 미리보기").props.onPress());
  let action;
  await act(async () => { action = button("선택한 백업에서 누락 쿠폰 복원").props.onPress(); await flush(); });
  expect(backup.restoreWalletBackup).not.toHaveBeenCalled();
  setActiveWallet("owner", { id: "different", name: "Different", memberIds: ["owner"] });
  await act(async () => { button("확인").props.onPress(); await action; });
  expect(backup.restoreWalletBackup).not.toHaveBeenCalled(); expect(text()).toContain("쿠폰함이 변경");
});
