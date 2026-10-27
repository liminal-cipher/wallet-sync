global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("react-native", () => {
  const React = require("react");
  return { View: "View", Text: "Text", TextInput: "TextInput", TouchableOpacity: "TouchableOpacity", ScrollView: "ScrollView", Image: "Image",
    ActivityIndicator: "ActivityIndicator", StatusBar: "StatusBar", RefreshControl: "RefreshControl",
    FlatList: (props) => React.createElement("FlatList", props, props.data.map((item) => React.createElement("View", { key: item.id }, props.renderItem({ item })))),
    Modal: ({ visible, children }) => visible ? React.createElement("Modal", null, children) : null,
    StyleSheet: { create: (value) => value } };
});
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: (effect) => require("react").useEffect(effect, [effect]), useNavigation: () => ({ navigate() {} }) }));
jest.mock("../src/services/firebase", () => ({ auth: { currentUser: { uid: "owner" } } }));
jest.mock("../src/services/firestoreService", () => ({ fetchCoupons: jest.fn(), subscribeCoupons: jest.fn(), updateCoupon: jest.fn(), deleteCoupon: jest.fn() }));
jest.mock("../src/services/localRecovery", () => ({ readLocal: jest.fn() }));
jest.mock("../src/services/authService", () => ({ logoutUser: jest.fn() }));
jest.mock("../src/services/imageService", () => ({ imageDataUri: jest.fn() }));
jest.mock("../src/services/providerLinks", () => ({ openOriginalProvider: jest.fn() }));
jest.mock("../src/components/BarcodeRenderer", () => () => null);
jest.mock("../src/hooks/useCalendarClock", () => () => new Date(2026, 9, 27, 12));
jest.mock("../src/utils/feedback", () => ({ Alert: { alert: jest.fn() } }));
const React = require("react");
const { create, act } = require("react-test-renderer");
const Home = require("../src/screens/home/HomeScreen").default;
const server = require("../src/services/firestoreService");
const local = require("../src/services/localRecovery");
const record = (id, extra = {}) => ({ id, userId: "owner", brand: id, barcodeNumber: id, expiryDay: "2026-11-01", ...extra });
const flush = () => new Promise((resolve) => setImmediate(resolve));
let renderer, receive, fail;
beforeEach(() => {
  jest.clearAllMocks(); local.readLocal.mockResolvedValue([]);
  server.subscribeCoupons.mockImplementation((_uid, next, error) => { receive = next; fail = error; return jest.fn(); });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
const mount = async () => act(async () => { renderer = create(React.createElement(Home)); await flush(); });
test("live data supersedes an older in-flight refresh, and connection recovery clears the error", async () => {
  await mount();
  await act(async () => receive([record("initial")], { fromCache: false }));
  let complete; server.fetchCoupons.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  await act(async () => { renderer.root.findByType("FlatList").props.refreshControl.props.onRefresh(); await flush(); });
  await act(async () => { fail(new Error("offline")); receive([record("latest")], { fromCache: false }); complete([record("old")]); await flush(); });
  expect(renderer.root.findByType("FlatList").props.data.map((r) => r.id)).toEqual(["latest"]);
  expect(renderer.root.findAllByType("Text").some((node) => node.children.join("").includes("목록 갱신 실패"))).toBe(false);
});
test("a late local snapshot cannot overwrite a successful manual refresh", async () => {
  let copy; local.readLocal.mockReturnValue(new Promise((resolve) => { copy = resolve; }));
  await mount();
  await act(async () => receive([], { fromCache: true }));
  server.fetchCoupons.mockResolvedValue([record("server")]);
  await act(async () => { await renderer.root.findByType("FlatList").props.refreshControl.props.onRefresh(); });
  await act(async () => { copy([{ records: [record("stale")] }]); await flush(); });
  expect(renderer.root.findByType("FlatList").props.data[0].id).toBe("server");
});
test("search and sorting are wired into the rendered wallet", async () => {
  await mount();
  await act(async () => receive([record("later", { expiryDay: "2026-12-01" }), record("soon", { conditions: "주말" })], { fromCache: false }));
  expect(renderer.root.findByType("FlatList").props.data.map((r) => r.id)).toEqual(["soon", "later"]);
  await act(async () => renderer.root.findByType("TextInput").props.onChangeText("주말"));
  expect(renderer.root.findByType("FlatList").props.data.map((r) => r.id)).toEqual(["soon"]);
});
