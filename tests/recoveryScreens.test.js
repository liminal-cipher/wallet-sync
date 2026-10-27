global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("react-native", () => {
  const React = require("react");
  return { View: "View", Text: "Text", TextInput: "TextInput", TouchableOpacity: "TouchableOpacity", ScrollView: "ScrollView", Switch: "Switch", ActivityIndicator: "ActivityIndicator",
    Modal: ({ visible, children, onRequestClose }) => visible ? React.createElement("Modal", { onRequestClose }, children) : null,
    StyleSheet: { create: (value) => value }, Platform: { OS: "web" } };
});
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
jest.mock("../src/hooks/useCalendarClock", () => () => new Date(2026, 9, 27, 12));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: (effect) => require("react").useEffect(effect, [effect]) }));
jest.mock("../src/services/firebase", () => ({ auth: { currentUser: { uid: "owner" } } }));
jest.mock("../src/services/firestoreService", () => ({ fetchCoupons: jest.fn(), restoreCoupon: jest.fn(), fetchCouponHistory: jest.fn(), getCoupon: jest.fn(), restoreCouponVersion: jest.fn() }));
jest.mock("../src/services/backupService", () => ({ exportWallet: jest.fn(), pickBackup: jest.fn(), previewRestore: jest.fn(), restoreWalletBackup: jest.fn() }));
jest.mock("../src/services/localRecovery", () => ({ readLocal: jest.fn() }));
jest.mock("../src/services/brandPreferences", () => ({ restorePreviousBrandPreferences: jest.fn() }));
jest.mock("../src/services/reminderSettings", () => ({ loadReminderSettings: jest.fn(), saveReminderSettings: jest.fn(), DEFAULT_REMINDERS: { enabled: true, hour: 9, minute: 0, days: [7, 3, 0] } }));
jest.mock("../src/services/notificationService", () => ({ requestNotificationPermissions: jest.fn() }));
const React = require("react");
const { create, act } = require("react-test-renderer");
const Tools = require("../src/screens/home/WalletToolsScreen").default;
const History = require("../src/screens/home/CouponHistoryScreen").default;
const backup = require("../src/services/backupService");
const server = require("../src/services/firestoreService");
const local = require("../src/services/localRecovery");
const reminders = require("../src/services/reminderSettings");
const { auth } = require("../src/services/firebase");
const { useConfirmation } = require("../src/components/ConfirmationDialog");
const prefs = { version: 1, favourites: ["mega"], recent: ["daiso"] };
const input = { records: [], brandPreferences: prefs };
const flush = () => new Promise((resolve) => setImmediate(resolve));
let renderer;
const button = (label) => renderer.root.findAllByType("TouchableOpacity").find((node) => node.findAllByType("Text").some((text) => text.children.join("") === label));
const mount = async (screen) => act(async () => { renderer = create(screen); await flush(); });
beforeEach(() => {
  jest.resetAllMocks(); auth.currentUser = { uid: "owner" };
  local.readLocal.mockImplementation(async (_uid, section) => section === "snapshots" ? [] : null);
  reminders.loadReminderSettings.mockResolvedValue(reminders.DEFAULT_REMINDERS);
  server.fetchCoupons.mockResolvedValue([]);
  backup.pickBackup.mockResolvedValue(input);
  backup.previewRestore.mockResolvedValue({ ...input, uid: "owner", additions: [], skipped: 0 });
  backup.restoreWalletBackup.mockResolvedValue({ added: 0, skipped: 0, preferencesRestored: true });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
test("settings-only restore requires opting in and accepting the in-app confirmation", async () => {
  await mount(React.createElement(Tools, { navigation: { goBack() {} } }));
  await act(async () => { await button("백업 파일 선택").props.onPress(); });
  expect(button("선택한 내용 추가 복원").props.disabled).toBe(true);
  const toggle = renderer.root.findAllByType("Switch").find((node) => node.props.accessibilityLabel === "브랜드 설정 함께 복원");
  expect(toggle.props.value).toBe(false);
  await act(async () => toggle.props.onValueChange(true));
  await act(async () => { button("선택한 내용 추가 복원").props.onPress(); await flush(); });
  expect(backup.restoreWalletBackup).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType("Modal")).toHaveLength(1);
  await act(async () => { button("확인").props.onPress(); await flush(); });
  expect(backup.restoreWalletBackup).toHaveBeenCalledWith(expect.objectContaining(input), expect.objectContaining({ expectedUid: "owner", includePreferences: true }));
});
test("cancelling a restore or switching accounts after preview cannot restore data", async () => {
  await mount(React.createElement(Tools, { navigation: { goBack() {} } }));
  await act(async () => { await button("백업 파일 선택").props.onPress(); });
  await act(async () => renderer.root.findAllByType("Switch").find((node) => node.props.accessibilityLabel === "브랜드 설정 함께 복원").props.onValueChange(true));
  await act(async () => { button("선택한 내용 추가 복원").props.onPress(); await flush(); });
  await act(async () => { button("취소").props.onPress(); await flush(); });
  expect(backup.restoreWalletBackup).not.toHaveBeenCalled();
  auth.currentUser = { uid: "other" };
  await act(async () => { await button("선택한 내용 추가 복원").props.onPress(); });
  expect(backup.restoreWalletBackup).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType("Text").some((node) => node.children.join("").includes("계정이 변경"))).toBe(true);
});
test("history restoration confirms inside the application and submits the observed revision", async () => {
  server.getCoupon.mockResolvedValue({ id: "coupon", brand: "Coffee", revision: 4 });
  server.fetchCouponHistory.mockResolvedValue([{ version: 2, record: { brand: "Previous", barcodeNumber: "00-12 34", expiryDay: "2027-01-01" } }]);
  server.restoreCouponVersion.mockResolvedValue();
  await mount(React.createElement(History, { navigation: { goBack() {} }, route: { params: { id: "coupon" } } }));
  await act(async () => { button("이 버전 복원").props.onPress(); await flush(); });
  expect(server.restoreCouponVersion).not.toHaveBeenCalled();
  await act(async () => { button("확인").props.onPress(); await flush(); });
  expect(server.restoreCouponVersion).toHaveBeenCalledTimes(1);
  expect(server.restoreCouponVersion).toHaveBeenCalledWith("coupon", 2, 4);
});
test("confirmation requests cannot overlap and unmounting cancels the pending request", async () => {
  let confirmation;
  function Harness() { confirmation = useConfirmation(); return null; }
  await mount(React.createElement(Harness));
  let pending;
  await act(async () => { pending = confirmation.confirm("Restore", "Confirm"); });
  await expect(confirmation.confirm("Other", "Other")).resolves.toBe(false);
  await act(async () => renderer.unmount()); renderer = null;
  await expect(pending).resolves.toBe(false);
});

test("reminder forecast is visible and uses saved settings rather than unsaved fields", async () => {
  server.fetchCoupons.mockResolvedValue([{ id: "one", userId: "owner", brand: "Forecast coffee", expiryDay: "2026-11-03" }]);
  await mount(React.createElement(Tools, { navigation: { goBack() {} } }));
  await act(async () => button("알림").props.onPress());
  const forecast = () => renderer.root.findAllByType("Text").filter((node) => node.children.join("").includes("Forecast coffee")).map((node) => node.children.join(""));
  expect(forecast()).toHaveLength(2);
  const previous = forecast();
  await act(async () => renderer.root.findAllByType("TextInput").find((node) => node.props.accessibilityLabel === "이 기기의 알림 시간 (HH:MM)").props.onChangeText("23:59"));
  expect(forecast()).toEqual(previous);
});
