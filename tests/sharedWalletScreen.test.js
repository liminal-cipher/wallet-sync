global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("react-native", () => {
  const React = require("react");
  return { View: "View", Text: "Text", TextInput: "TextInput", TouchableOpacity: "TouchableOpacity", ScrollView: "ScrollView", ActivityIndicator: "ActivityIndicator",
    Modal: ({ visible, children }) => visible ? React.createElement("Modal", null, children) : null,
    StyleSheet: { create: (value) => value } };
});
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
jest.mock("../src/services/firebase", () => ({ auth: { currentUser: { uid: "owner" } } }));
jest.mock("../src/services/sharedWalletService", () => ({ subscribeSharedWallet: jest.fn(), createSharedWallet: jest.fn(),
  createWalletInvitation: jest.fn(), joinSharedWallet: jest.fn(), removeWalletMember: jest.fn(), clearUnavailableWalletLink: jest.fn() }));
const React = require("react");
const { create, act } = require("react-test-renderer");
const Screen = require("../src/screens/home/SharedWalletScreen").default;
const service = require("../src/services/sharedWalletService");
const { setActiveWallet, getWalletScope } = require("../src/services/walletSession");
const wallet = { id: "shared", name: "Together", ownerId: "owner", memberIds: ["owner"] };
let renderer, receive, fail, navigation;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const button = (label) => renderer.root.findAllByType("TouchableOpacity").find((node) => node.findAllByType("Text").some((text) => text.children.join("") === label));
const field = (label) => renderer.root.findAllByType("TextInput").find((node) => node.props.accessibilityLabel === label);
const mount = async () => act(async () => { renderer = create(React.createElement(Screen, { navigation })); await flush(); });
beforeEach(() => {
  jest.resetAllMocks(); setActiveWallet("owner"); navigation = { navigate: jest.fn(), goBack: jest.fn() };
  service.subscribeSharedWallet.mockImplementation((_uid, next, error) => { receive = next; fail = error; next(null); return jest.fn(); });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; setActiveWallet(null); });
test("a new user can create a named shared wallet or submit an invitation", async () => {
  await mount();
  await act(async () => field("새 쿠폰함 이름").props.onChangeText("Our coupons"));
  await act(async () => button("공유 쿠폰함 만들기").props.onPress());
  expect(service.createSharedWallet).toHaveBeenCalledWith("Our coupons");
  await act(async () => field("받은 초대 코드").props.onChangeText("received-code"));
  await act(async () => button("초대 코드로 참여").props.onPress());
  expect(service.joinSharedWallet).toHaveBeenCalledWith("received-code");
});
test("the owner can reveal a single-use invitation and open either wallet", async () => {
  service.createWalletInvitation.mockResolvedValue({ code: "1234567890abcdef1234567890abcdef", expiresAt: new Date("2027-01-01") });
  await mount(); await act(async () => receive(wallet));
  await act(async () => button("새 초대 코드 만들기").props.onPress());
  expect(field("전달할 초대 코드").props.value).toBe("1234567890abcdef1234567890abcdef");
  await act(async () => button("이 공유 쿠폰함 열기").props.onPress());
  expect(getWalletScope("owner").walletId).toBe("shared");
  await act(async () => button("개인 쿠폰함 열기").props.onPress());
  expect(getWalletScope("owner").walletId).toBeNull();
});
test("membership removal requires the visible confirmation and preserves data", async () => {
  await mount(); await act(async () => receive({ ...wallet, memberIds: ["owner", "guest"] }));
  expect(button("새 초대 코드 만들기")).toBeUndefined();
  await act(async () => { button("공유·초대 해제").props.onPress(); await flush(); });
  expect(service.removeWalletMember).not.toHaveBeenCalled();
  await act(async () => { button("확인").props.onPress(); await flush(); });
  expect(service.removeWalletMember).toHaveBeenCalledWith("shared");
});
test("a removed member sees link recovery instead of creating another wallet over a stale link", async () => {
  await mount(); await act(async () => { receive(null); fail({ code: "permission-denied", message: "Access removed" }); });
  expect(button("공유 쿠폰함 만들기")).toBeUndefined();
  await act(async () => button("접근이 해제된 쿠폰함 연결 정리").props.onPress());
  expect(service.clearUnavailableWalletLink).toHaveBeenCalledTimes(1);
});
