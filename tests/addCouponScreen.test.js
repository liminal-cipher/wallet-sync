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
const { auth } = require("../src/services/firebase");
const { setActiveWallet } = require("../src/services/walletSession");
const { Alert } = require("../src/utils/feedback");
const { catalogue } = require("./catalogueFixtures");
const { normaliseCatalogueMetadata } = require("../src/utils/catalogueModel");
let renderer, navigation, localValues;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const field = (label) => renderer.root.findAllByType("TextInput").find((node) => node.props.accessibilityLabel === label);
const button = (label) => renderer.root.findAllByType("TouchableOpacity").find((node) => node.findAllByType("Text").some((text) => text.children.join("") === label));
const accessibleButton = (label) => renderer.root.findAllByType("TouchableOpacity").find((node) => node.props.accessibilityLabel === label);
beforeEach(() => {
  setActiveWallet("owner");
  jest.clearAllMocks(); navigation = { goBack: jest.fn() };
  auth.currentUser = { uid: "owner" }; localValues = new Map();
  local.readLocal.mockImplementation(async (_uid, section) => localValues.get(section) || null);
  local.writeLocal.mockImplementation(async (_uid, section, value) => localValues.set(section, value));
  images.uploadOriginal.mockResolvedValue({ image: null, localOnly: false });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; setActiveWallet(null); });

test("a malformed draft is preserved and cannot be applied to crash the editor", async () => {
  localValues.set("draft:new", { form: null, revision: 0 });
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  expect(button("입력 초안 복원")).toBeUndefined();
  expect(button("등록하기").props.disabled).toBe(true);
  expect(localValues.get("draft:new")).toEqual({ form: null, revision: 0 });
  expect(local.writeLocal).not.toHaveBeenCalled();
});

test.each([
  ["numeric timestamp", { savedAt: 123 }],
  ["invalid timestamp", { savedAt: "not-a-date" }],
  ["non-text brand", { form: { brand: {} } }],
  ["non-text OCR input", { form: { catalogueSuggestionText: {} } }],
  ["invalid catalogue", { form: { catalogue: { schemaVersion: 999 } } }],
  ["non-text amount buffer", { form: { catalogueMoneyInput: { faceValue: 123 } } }],
  ["invalid image reference", { form: { image: { id: "broken" } } }],
])("a draft with %s is rejected without a render failure or overwrite", async (_label, patch) => {
  const draft = { form: { brand: "" }, revision: 0, savedAt: "2026-11-03T00:00:00.000Z", ...patch };
  localValues.set("draft:new", draft);
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  expect(button("입력 초안 복원")).toBeUndefined();
  expect(button("등록하기").props.disabled).toBe(true);
  expect(renderer.root.findAllByType("Text").some((node) => node.children.join("").includes("초안을 읽지 못했습니다"))).toBe(true);
  expect(localValues.get("draft:new")).toEqual(draft);
  expect(local.writeLocal).not.toHaveBeenCalled();
});

test("unfinished text and amount buffers remain recoverable, including older drafts without a timestamp", async () => {
  const draft = { revision: 0, form: { brand: "", barcodeNumber: "", expiryDay: "2026-", sourceUrl: "https://", catalogueMoneyInput: { faceValue: "10x" } } };
  localValues.set("draft:new", draft);
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  await act(async () => button("입력 초안 복원").props.onPress());
  expect(field("만료일 (YYYY-MM-DD)").props.value).toBe("2026-");
  expect(field("브랜드·상품명 / 이벤트명").props.value).toBe("");
  expect(localValues.get("draft:new").form.catalogueMoneyInput.faceValue).toBe("10x");
});
test("a new coupon starts without an expiry date and cannot be saved until one is entered", async () => {
  firestore.addCoupon.mockResolvedValue({ id: "new" });
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  expect(field("만료일 (YYYY-MM-DD)").props.value).toBe("");
  await act(async () => {
    field("브랜드·상품명 / 이벤트명").props.onChangeText("Coffee");
    field("바코드 원문 (공백·하이픈도 보존)").props.onChangeText("AB-12 34");
  });
  await act(async () => { await button("등록하기").props.onPress(); });
  expect(firestore.addCoupon).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType("Text").some((node) => node.props.accessibilityRole === "alert" && node.children.join("").includes("만료일"))).toBe(true);
  await act(async () => { button("+7일").props.onPress(); });
  expect(field("만료일 (YYYY-MM-DD)").props.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await act(async () => { await button("등록하기").props.onPress(); });
  expect(firestore.addCoupon).toHaveBeenCalledTimes(1);
});
test("rapid save taps submit once, and a network failure leaves the draft and input intact", async () => {
  let rejectSave;
  firestore.addCoupon.mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject; }));
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  await act(async () => {
    field("브랜드·상품명 / 이벤트명").props.onChangeText("Coffee");
    field("바코드 원문 (공백·하이픈도 보존)").props.onChangeText("AB-12 34");
    field("만료일 (YYYY-MM-DD)").props.onChangeText("2027-01-01");
  });
  const save = button("등록하기").props.onPress;
  await act(async () => { save(); save(); await flush(); });
  expect(firestore.addCoupon).toHaveBeenCalledTimes(1);
  expect(firestore.addCoupon).toHaveBeenCalledWith(expect.objectContaining({ barcodeNumber: "AB-12 34" }));
  await act(async () => { rejectSave(new Error("Network unavailable")); await flush(); });
  expect(field("바코드 원문 (공백·하이픈도 보존)").props.value).toBe("AB-12 34");
  expect(local.writeLocal).toHaveBeenLastCalledWith("owner", "draft:new", expect.objectContaining({ form: expect.objectContaining({ barcodeNumber: "AB-12 34" }) }), expect.objectContaining({ walletId: null }));
  expect(navigation.goBack).not.toHaveBeenCalled(); expect(button("등록하기").props.disabled).toBe(false);
});
test("switching wallets while saving cannot submit a private form into the shared wallet", async () => {
  let complete;
  images.uploadOriginal.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  await act(async () => {
    field("브랜드·상품명 / 이벤트명").props.onChangeText("Private coffee");
    field("바코드 원문 (공백·하이픈도 보존)").props.onChangeText("private-123");
    field("만료일 (YYYY-MM-DD)").props.onChangeText("2027-01-01");
  });
  await act(async () => { button("등록하기").props.onPress(); await flush(); });
  setActiveWallet("owner", { id: "shared", name: "Together", memberIds: ["owner"] });
  await act(async () => { complete({ image: null, localOnly: false }); await flush(); });
  expect(firestore.addCoupon).not.toHaveBeenCalled();
  expect(localValues.get("draft:new").form.brand).toBe("Private coffee");
  expect(navigation.goBack).not.toHaveBeenCalled();
});
test("editing submits the observed revision and clears its own draft only after success", async () => {
  firestore.getCoupon.mockResolvedValue({ id: "coupon-1", brand: "Coffee", barcodeNumber: "AB-12 34", expiryDay: "2027-01-01", revision: 3 });
  firestore.updateCoupon.mockResolvedValue();
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: { params: { id: "coupon-1" } } })); await flush(); });
  await act(async () => { field("브랜드·상품명 / 이벤트명").props.onChangeText("Bakery"); });
  await act(async () => { await button("변경 저장").props.onPress(); });
  expect(firestore.updateCoupon).toHaveBeenCalledWith("coupon-1", expect.objectContaining({ brand: "Bakery", barcodeNumber: "AB-12 34" }), 3);
  expect(local.writeLocal).toHaveBeenLastCalledWith("owner", "draft:coupon-1", null, expect.objectContaining({ walletId: null }));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});
test("a save conflict is announced beside the save button and keeps the edit", async () => {
  firestore.getCoupon.mockResolvedValue({ id: "coupon-1", brand: "Coffee", barcodeNumber: "AB-12 34", expiryDay: "2027-01-01", revision: 3 });
  const message = "다른 기기에서 변경된 쿠폰입니다. 최신 목록에서 다시 열어 확인해 주세요. 입력 초안은 유지됩니다.";
  firestore.updateCoupon.mockRejectedValue(Object.assign(new Error(message), { code: "coupon/conflict" }));
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: { params: { id: "coupon-1" } } })); await flush(); });
  await act(async () => { field("이용 조건·메모").props.onChangeText("Stale note"); });
  await act(async () => { await button("변경 저장").props.onPress(); });
  const nodes = renderer.root.findAll((node) => node.type === "Text" || node.type === "TouchableOpacity" || node.type === "TextInput");
  const alerts = nodes.filter((node) => node.type === "Text" && node.props.accessibilityRole === "alert");
  expect(alerts.map((node) => node.children.join(""))).toEqual([message]);
  const position = (node) => nodes.indexOf(node);
  expect(position(alerts[0])).toBeGreaterThan(position(field("공식 안내 페이지 (https)")));
  expect(position(alerts[0])).toBeLessThan(position(button("변경 저장")));
  expect(field("이용 조건·메모").props.value).toBe("Stale note");
  expect(navigation.goBack).not.toHaveBeenCalled();
});
test("editing the other member's coupon preserves its image without claiming a local copy exists", async () => {
  const image = { id: "12345678-1234-4234-8234-123456789abc", ownerId: "guest", walletId: "shared", mime: "image/png", cloudPath: null };
  setActiveWallet("owner", { id: "shared", name: "Together", memberIds: ["owner", "guest"] });
  firestore.getCoupon.mockResolvedValue({ id: "shared-coupon", brand: "Coffee", barcodeNumber: "AB-12 34", expiryDay: "2027-01-01", revision: 1, image });
  firestore.updateCoupon.mockResolvedValue(); images.imageDataUri.mockRejectedValueOnce(new Error("No local image"));
  images.uploadOriginal.mockResolvedValueOnce({ image, localOnly: true });
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: { params: { id: "shared-coupon" } } })); await flush(); });
  await act(async () => button("변경 저장").props.onPress());
  expect(firestore.updateCoupon).toHaveBeenCalledWith("shared-coupon", expect.objectContaining({ image }), 1);
  expect(Alert.alert).toHaveBeenCalledWith("사진 원본은 별도 보관", expect.stringContaining("등록한 기기"));
});
test("the unchanged editor and its recovery draft preserve catalogue metadata on ordinary edits", async () => {
  const metadata = normaliseCatalogueMetadata(catalogue());
  firestore.getCoupon.mockResolvedValue({ id: "catalogue-coupon", brand: "Custom title", barcodeNumber: "AB-12 34", expiryDay: "2027-01-01", revision: 3, catalogue: metadata });
  firestore.updateCoupon.mockRejectedValue(new Error("Offline"));
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: { params: { id: "catalogue-coupon" } } })); await flush(); });
  await act(async () => { field("브랜드·상품명 / 이벤트명").props.onChangeText("My own title"); });
  await act(async () => { await button("변경 저장").props.onPress(); });
  expect(firestore.updateCoupon).toHaveBeenCalledWith("catalogue-coupon", expect.objectContaining({ brand: "My own title", catalogue: metadata }), 3);
  expect(local.writeLocal).toHaveBeenLastCalledWith("owner", "draft:catalogue-coupon", expect.objectContaining({ form: expect.objectContaining({ catalogue: metadata }) }), expect.objectContaining({ walletId: null }));
  const draft = local.writeLocal.mock.calls.at(-1)[2];
  await act(async () => { renderer.unmount(); });
  local.readLocal.mockImplementation(async (_uid, section) => section === "draft:catalogue-coupon" ? draft : null);
  firestore.updateCoupon.mockResolvedValue();
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: { params: { id: "catalogue-coupon" } } })); await flush(); });
  await act(async () => { button("입력 초안 복원").props.onPress(); });
  await act(async () => { await button("변경 저장").props.onPress(); });
  expect(firestore.updateCoupon).toHaveBeenLastCalledWith("catalogue-coupon", expect.objectContaining({ catalogue: metadata }), 3);
});
test("brand and product search registers a generated title without typing one", async () => {
  firestore.addCoupon.mockResolvedValue({ id: "new" });
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  await act(async () => { field("브랜드·메뉴 검색").props.onChangeText("폴바셋룽고"); });
  await act(async () => { accessibleButton("폴 바셋 룽고 선택").props.onPress(); });
  expect(field("브랜드·상품명 / 이벤트명").props.value).toBe("폴 바셋 · 룽고");
  await act(async () => { field("바코드 원문 (공백·하이픈도 보존)").props.onChangeText("00-12 34"); field("만료일 (YYYY-MM-DD)").props.onChangeText("2027-01-01"); });
  await act(async () => { await button("등록하기").props.onPress(); });
  expect(firestore.addCoupon).toHaveBeenCalledWith(expect.objectContaining({ brand: "폴 바셋 · 룽고", barcodeNumber: "00-12 34",
    catalogue: expect.objectContaining({ brandId: "paul-bassett", productId: "lungo", variantId: null }) }));
  expect(localValues.get("brand-preferences").recent).toEqual(["paul-bassett"]);
  expect(localValues.get("draft:new")).toBeNull();
});
test("favourite selection survives reopening the picker and is available before registration", async () => {
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  await act(async () => { await accessibleButton("폴 바셋 즐겨찾기 추가").props.onPress(); });
  await act(async () => { button("즐겨찾기").props.onPress(); });
  expect(accessibleButton("폴 바셋 선택")).toBeTruthy();
  expect(accessibleButton("메가MGC커피 선택")).toBeUndefined();
  await act(async () => { renderer.unmount(); });
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  await act(async () => { button("즐겨찾기").props.onPress(); });
  expect(accessibleButton("폴 바셋 즐겨찾기 제거").props.accessibilityState.selected).toBe(true);
});
test("a retail amount voucher needs no menu and preserves zero separately from unknown", async () => {
  firestore.addCoupon.mockResolvedValue({ id: "value" });
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  await act(async () => { accessibleButton("다이소 선택").props.onPress(); });
  expect(field("메뉴 검색")).toBeUndefined();
  await act(async () => { button("10,000원 입력").props.onPress(); });
  await act(async () => { field("남은 금액 (원, 수동 기록)").props.onChangeText("0"); });
  await act(async () => { field("바코드 원문 (공백·하이픈도 보존)").props.onChangeText("V-00 123"); field("만료일 (YYYY-MM-DD)").props.onChangeText("2027-01-01"); });
  await act(async () => { await button("등록하기").props.onPress(); });
  expect(firestore.addCoupon.mock.calls.at(-1)[0]).toMatchObject({ brand: "다이소 · 10,000원 금액권", catalogue: { productId: null, money: { faceValue: 10000, remainingBalance: 0, balanceMode: "manual", purchasePrice: null } } });
});
test("invalid amount buffers block saving and remain in the recovery draft", async () => {
  firestore.addCoupon.mockReset();
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  await act(async () => { accessibleButton("다이소 선택").props.onPress(); });
  await act(async () => { field("액면금액 (원)").props.onChangeText("10x"); });
  await act(async () => { field("바코드 원문 (공백·하이픈도 보존)").props.onChangeText("AB-1234"); field("만료일 (YYYY-MM-DD)").props.onChangeText("2027-01-01"); });
  await act(async () => { await button("등록하기").props.onPress(); });
  expect(firestore.addCoupon).not.toHaveBeenCalled();
  expect(localValues.get("draft:new").form.catalogueMoneyInput.faceValue).toBe("10x");
  expect(navigation.goBack).not.toHaveBeenCalled();
});
test("changing brands clears incompatible product and size selections without changing the barcode", async () => {
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  await act(async () => { accessibleButton("폴 바셋 선택").props.onPress(); });
  await act(async () => { button("아이스 카페라떼").props.onPress(); });
  await act(async () => { button("Grand").props.onPress(); });
  await act(async () => { field("바코드 원문 (공백·하이픈도 보존)").props.onChangeText("00-12 34"); button("브랜드 변경").props.onPress(); });
  await act(async () => { accessibleButton("다이소 선택").props.onPress(); });
  expect(localValues.get("draft:new").form.catalogue).toMatchObject({ brandId: "daiso", productId: null, variantId: null });
  expect(field("바코드 원문 (공백·하이픈도 보존)").props.value).toBe("00-12 34");
});
test("OCR proposes a new brand without silently replacing an existing selection", async () => {
  const { chooseCatalogue } = require("../src/utils/catalogueForm");
  firestore.getCoupon.mockResolvedValue({ ...chooseCatalogue({ brand: "", barcodeNumber: "AB-1234", expiryDay: "2027-01-01" }, "paul-bassett", "lungo"), id: "old", revision: 1 });
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: { params: { id: "old" } } })); await flush(); });
  await act(async () => { button("텍스트 분석").props.onPress(); });
  await act(async () => { field("쿠폰 메시지·인식된 텍스트").props.onChangeText("메가커피 아메리카노"); });
  await act(async () => { button("분석해 입력란에 적용").props.onPress(); });
  expect(field("브랜드·상품명 / 이벤트명").props.value).toBe("폴 바셋 · 룽고");
  expect(button("후보: 메가MGC커피 · 아메리카노")).toBeTruthy();
});
test("failure to remember a saved brand does not resubmit or report the coupon as unsaved", async () => {
  firestore.addCoupon.mockResolvedValue({ id: "saved" });
  local.writeLocal.mockImplementation(async (_uid, section, value) => {
    if (section === "brand-preferences") throw new Error("Storage full"); localValues.set(section, value);
  });
  await act(async () => { renderer = create(React.createElement(Screen, { navigation, route: {} })); await flush(); });
  await act(async () => { accessibleButton("폴 바셋 선택").props.onPress(); });
  await act(async () => { button("룽고").props.onPress(); field("바코드 원문 (공백·하이픈도 보존)").props.onChangeText("AB-1234"); field("만료일 (YYYY-MM-DD)").props.onChangeText("2027-01-01"); });
  await act(async () => { await button("등록하기").props.onPress(); });
  expect(firestore.addCoupon).toHaveBeenCalledTimes(1);
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  expect(Alert.alert).toHaveBeenCalledWith("저장 완료", expect.stringContaining("최근 선택"));
});
