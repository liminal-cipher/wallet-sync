global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("react-native", () => {
  const React = require("react");
  return { View: "View", Text: "Text", TextInput: "TextInput", TouchableOpacity: "TouchableOpacity", ScrollView: "ScrollView", Image: "Image", ActivityIndicator: "ActivityIndicator",
    Modal: ({ visible, children }) => visible ? React.createElement("Modal", null, children) : null,
    StyleSheet: { create: (value) => value, absoluteFill: {} }, Platform: { OS: "web" } };
});
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
jest.mock("expo-camera", () => ({ CameraView: "CameraView", useCameraPermissions: () => [{ granted: true }, jest.fn()] }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock("../src/services/firebase", () => ({ auth: { currentUser: { uid: "owner" } } }));
jest.mock("../src/services/firestoreService", () => ({ addCoupon: jest.fn(), updateCoupon: jest.fn(), getCoupon: jest.fn() }));
jest.mock("../src/services/localRecovery", () => ({ readLocal: jest.fn(), writeLocal: jest.fn() }));
jest.mock("../src/services/imageService", () => ({ retainImage: jest.fn(), imageDataUri: jest.fn(), uploadOriginal: jest.fn() }));
jest.mock("../src/services/ocrService", () => ({ recogniseImage: jest.fn() }));
jest.mock("../src/hooks/useCalendarClock", () => ({ __esModule: true, default: () => new Date(2026, 9, 17) }));
jest.mock("../src/components/BarcodeRenderer", () => ({ __esModule: true, default: () => null }));
jest.mock("../src/utils/feedback", () => ({ Alert: { alert: jest.fn() } }));
const React = require("react");
const { create, act } = require("react-test-renderer");
const Screen = require("../src/screens/home/AddCouponScreen").default;
const firestore = require("../src/services/firestoreService");
const local = require("../src/services/localRecovery");
const images = require("../src/services/imageService");
const { catalogue } = require("./catalogueFixtures");
const { normaliseCatalogueMetadata } = require("../src/utils/catalogueModel");
let renderer, navigation;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const field = (label) => renderer.root.findAllByType("TextInput").find((node) => node.props.accessibilityLabel === label);
const button = (label) => renderer.root.findAllByType("TouchableOpacity").find((node) => node.findAllByType("Text").some((text) => text.children.join("") === label));
beforeEach(() => {
  jest.clearAllMocks(); navigation = { goBack: jest.fn() };
  local.readLocal.mockResolvedValue(null); local.writeLocal.mockResolvedValue();
  images.uploadOriginal.mockResolvedValue({ image: null, localOnly: false });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
test("rapid save taps submit once, and a network failure leaves the draft and input intact", async () => {
  let rejectSave;
  firestore.addCoupon.mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject; }));
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  await act(async () => {
    field("브랜드·상품명 / 이벤트명").props.onChangeText("Coffee");
    field("바코드 원문 (공백·하이픈도 보존)").props.onChangeText("AB-12 34");
  });
  const save = button("등록하기").props.onPress;
  await act(async () => { save(); save(); await flush(); });
  expect(firestore.addCoupon).toHaveBeenCalledTimes(1);
  expect(firestore.addCoupon).toHaveBeenCalledWith(expect.objectContaining({ barcodeNumber: "AB-12 34" }));
  await act(async () => { rejectSave(new Error("Network unavailable")); await flush(); });
  expect(field("바코드 원문 (공백·하이픈도 보존)").props.value).toBe("AB-12 34");
  expect(local.writeLocal).toHaveBeenLastCalledWith("owner", "draft:new", expect.objectContaining({ form: expect.objectContaining({ barcodeNumber: "AB-12 34" }) }));
  expect(navigation.goBack).not.toHaveBeenCalled(); expect(button("등록하기").props.disabled).toBe(false);
});
test("editing submits the observed revision and clears its own draft only after success", async () => {
  firestore.getCoupon.mockResolvedValue({ id: "coupon-1", brand: "Coffee", barcodeNumber: "AB-12 34", expiryDay: "2027-01-01", revision: 3 });
  firestore.updateCoupon.mockResolvedValue();
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: { params: { id: "coupon-1" } } })); await flush(); });
  await act(async () => { field("브랜드·상품명 / 이벤트명").props.onChangeText("Bakery"); });
  await act(async () => { await button("변경 저장").props.onPress(); });
  expect(firestore.updateCoupon).toHaveBeenCalledWith("coupon-1", expect.objectContaining({ brand: "Bakery", barcodeNumber: "AB-12 34" }), 3);
  expect(local.writeLocal).toHaveBeenLastCalledWith("owner", "draft:coupon-1", null);
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});
test("the unchanged editor and its recovery draft preserve catalogue metadata on ordinary edits", async () => {
  const metadata = normaliseCatalogueMetadata(catalogue());
  firestore.getCoupon.mockResolvedValue({ id: "catalogue-coupon", brand: "Custom title", barcodeNumber: "AB-12 34", expiryDay: "2027-01-01", revision: 3, catalogue: metadata });
  firestore.updateCoupon.mockRejectedValue(new Error("Offline"));
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: { params: { id: "catalogue-coupon" } } })); await flush(); });
  await act(async () => { field("브랜드·상품명 / 이벤트명").props.onChangeText("My own title"); });
  await act(async () => { await button("변경 저장").props.onPress(); });
  expect(firestore.updateCoupon).toHaveBeenCalledWith("catalogue-coupon", expect.objectContaining({ brand: "My own title", catalogue: metadata }), 3);
  expect(local.writeLocal).toHaveBeenLastCalledWith("owner", "draft:catalogue-coupon", expect.objectContaining({ form: expect.objectContaining({ catalogue: metadata }) }));
  const draft = local.writeLocal.mock.calls.at(-1)[2];
  await act(async () => { renderer.unmount(); });
  local.readLocal.mockResolvedValue(draft);
  firestore.updateCoupon.mockResolvedValue();
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: { params: { id: "catalogue-coupon" } } })); await flush(); });
  await act(async () => { button("입력 초안 복원").props.onPress(); });
  await act(async () => { await button("변경 저장").props.onPress(); });
  expect(firestore.updateCoupon).toHaveBeenLastCalledWith("catalogue-coupon", expect.objectContaining({ catalogue: metadata }), 3);
});
