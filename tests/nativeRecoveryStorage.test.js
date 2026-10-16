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
