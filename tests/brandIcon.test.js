global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("react-native", () => ({ Image: "Image", Text: "Text", View: "View" }));
const React = require("react"), { create, act } = require("react-test-renderer");
const BrandIcon = require("../src/components/BrandIcon").default;
test("an unavailable official asset falls back to text, and another brand retries its own asset", async () => {
  let renderer;
  await act(async () => { renderer = create(React.createElement(BrandIcon, { brand: { name: "폴 바셋", iconId: "paul-bassett" } })); });
  expect(renderer.root.findByType("Image").props.resizeMode).toBe("contain");
  await act(async () => { renderer.root.findByType("Image").props.onError(); });
  expect(renderer.root.findAllByType("Image")).toHaveLength(0);
  expect(renderer.root.findByType("Text").children).toEqual(["폴 "]);
  await act(async () => { renderer.update(React.createElement(BrandIcon, { brand: { name: "메가MGC커피", iconId: "mega" } })); });
  expect(renderer.root.findAllByType("Image")).toHaveLength(1);
  await act(async () => { renderer.unmount(); });
});
test("a white-on-transparent logo keeps its source background, and its text fallback stays legible", async () => {
  let renderer;
  const tile = () => renderer.root.findByType("View").props.style.backgroundColor;
  await act(async () => { renderer = create(React.createElement(BrandIcon, { brand: { name: "뚜레쥬르", iconId: "tous-les-jours" } })); });
  expect(tile()).toBe("#153A25");
  await act(async () => { renderer.root.findByType("Image").props.onError(); });
  expect(tile()).toBe("#FFF");
  await act(async () => { renderer.update(React.createElement(BrandIcon, { brand: { name: "스타벅스", iconId: "starbucks" } })); });
  expect(tile()).toBe("#FFF");
  await act(async () => { renderer.unmount(); });
});
