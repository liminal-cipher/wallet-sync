jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({ documentDirectory: "file://documents/", makeDirectoryAsync: jest.fn().mockResolvedValue(), writeAsStringAsync: jest.fn(), readAsStringAsync: jest.fn() }));
const pointers = require("@react-native-async-storage/async-storage");
const files = require("expo-file-system/legacy");
const storage = require("../src/services/recoveryStorage.native").default;
beforeEach(() => {
  jest.clearAllMocks(); const values = new Map(); const contents = new Map();
  pointers.getItem.mockImplementation(async (key) => values.get(key) ?? null);
  pointers.setItem.mockImplementation(async (key, value) => { values.set(key, value); });
  files.writeAsStringAsync.mockImplementation(async (path, value) => { contents.set(path, value); });
  files.readAsStringAsync.mockImplementation(async (path) => contents.get(path));
});
test("large recovery checkpoints use files and switch the pointer only after a successful write", async () => {
  await storage.setItem("checkpoint", "previous");
  const large = "x".repeat(3 * 1024 * 1024);
  files.writeAsStringAsync.mockRejectedValueOnce(new Error("Disk full"));
  await expect(storage.setItem("checkpoint", large)).rejects.toThrow("Disk full");
  expect(await storage.getItem("checkpoint")).toBe("previous");
  expect(pointers.setItem).toHaveBeenCalledTimes(1);
  await storage.setItem("checkpoint", large);
  expect(await storage.getItem("checkpoint")).toBe(large);
  expect(pointers.setItem.mock.calls.every(([_key, value]) => value.length === 1)).toBe(true);
});
test("a failed pointer commit keeps the previous file readable and allows a later retry", async () => {
  await storage.setItem("checkpoint", "previous");
  pointers.setItem.mockRejectedValueOnce(new Error("Pointer full"));
  await expect(storage.setItem("checkpoint", "next")).rejects.toThrow("Pointer full");
  expect(await storage.getItem("checkpoint")).toBe("previous");
  await storage.setItem("checkpoint", "retried");
  expect(await storage.getItem("checkpoint")).toBe("retried");
});

test("a truncated write cannot advance the active pointer", async () => {
  await storage.setItem("checkpoint", "previous");
  files.readAsStringAsync.mockResolvedValueOnce("truncated");
  await expect(storage.setItem("checkpoint", "complete")).rejects.toThrow("이전 사본");
  expect(await storage.getItem("checkpoint")).toBe("previous");
});
test("an unknown pointer cannot overwrite either recovery slot", async () => {
  pointers.getItem.mockResolvedValue("future-version");
  await expect(storage.setItem("checkpoint", "next")).rejects.toThrow("기존 파일");
  expect(files.writeAsStringAsync).not.toHaveBeenCalled();
});
