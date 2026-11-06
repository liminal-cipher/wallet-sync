jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
jest.mock("expo-file-system/legacy", () => ({ documentDirectory: "file://documents/", EncodingType: { Base64: "base64" }, getInfoAsync: jest.fn(), readAsStringAsync: jest.fn(), makeDirectoryAsync: jest.fn(), writeAsStringAsync: jest.fn() }));
jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "sha256" }, digestStringAsync: async (_type, text) => require("crypto").createHash("sha256").update(text).digest("hex"),
  digest: async (_type, bytes) => new Uint8Array(require("crypto").createHash("sha256").update(bytes).digest()).buffer }));
jest.mock("firebase/storage", () => ({ getStorage: jest.fn(() => ({})), ref: jest.fn((_storage, path) => path), getBytes: jest.fn(), getMetadata: jest.fn(), uploadString: jest.fn() }));
jest.mock("../src/services/firebase", () => ({ auth: { currentUser: { uid: "owner" } } }));
const storage = require("firebase/storage");
const files = require("expo-file-system/legacy");
const { auth } = require("../src/services/firebase");
const { imageDataUri, uploadOriginal } = require("../src/services/imageService");
const { setActiveWallet } = require("../src/services/walletSession");
const image = { id: "12345678-1234-4234-8234-123456789abc", ownerId: "owner", mime: "image/png", cloudPath: null };
beforeEach(() => {
  setActiveWallet("owner");
  auth.currentUser = { uid: "owner" };
  jest.clearAllMocks(); files.getInfoAsync.mockResolvedValue({ exists: true }); files.readAsStringAsync.mockResolvedValue("YWJj");
  storage.getMetadata.mockReset().mockRejectedValue({ code: "storage/object-not-found" }); storage.uploadString.mockResolvedValue();
});
afterEach(() => setActiveWallet(null));
test("shared originals are isolated by wallet and never uploaded to private Firebase Storage", async () => {
  const shared = { ...image, ownerId: "guest", walletId: "shared" };
  await expect(imageDataUri(shared)).rejects.toThrow("쿠폰함");
  setActiveWallet("owner", { id: "shared", name: "Together", memberIds: ["owner", "guest"] });
  expect(await imageDataUri(shared)).toBe("data:image/png;base64,YWJj");
  await expect(uploadOriginal(shared)).resolves.toEqual({ image: shared, localOnly: true });
  expect(storage.uploadString).not.toHaveBeenCalled();
  await expect(imageDataUri(image)).rejects.toThrow("쿠폰함");
  files.readAsStringAsync.mockImplementationOnce(async () => { setActiveWallet("owner"); return "YWJj"; });
  await expect(imageDataUri(shared)).rejects.toThrow("쿠폰함");
});
test("the image adapter only imports functions exported by the installed Firebase SDK", () => {
  const actual = jest.requireActual("firebase/storage");
  for (const name of ["getStorage", "ref", "getBytes", "getMetadata", "uploadString"]) expect(typeof actual[name]).toBe("function");
});
test("native downloads encode authenticated bytes without constructing an unsupported binary Blob", async () => {
  files.getInfoAsync.mockResolvedValue({ exists: false });
  const bytes = Uint8Array.from({ length: 50000 }, (_, i) => i % 256);
  storage.getBytes.mockResolvedValue(bytes.buffer);
  const uri = await imageDataUri({ ...image, cloudPath: `originals/owner/${image.id}` });
  expect(uri).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`);
  expect(storage.getBytes).toHaveBeenCalledWith(`originals/owner/${image.id}`, 10 * 1024 * 1024);
});
test("an upload retry recognises the identical immutable original instead of overwriting it", async () => {
  await expect(uploadOriginal(image)).resolves.toMatchObject({ localOnly: false });
  const metadata = storage.uploadString.mock.calls[0][3];
  expect(storage.uploadString).toHaveBeenCalledWith(`originals/owner/${image.id}`, "data:image/png;base64,YWJj", "data_url", expect.objectContaining({ customMetadata: { sha256: expect.any(String) } }));
  storage.getMetadata.mockResolvedValue({ customMetadata: metadata.customMetadata });
  await expect(uploadOriginal(image)).resolves.toMatchObject({ localOnly: false });
  expect(storage.uploadString).toHaveBeenCalledTimes(1);
});
test("upload failures and mismatched existing originals retain a local recovery reference", async () => {
  storage.getMetadata.mockResolvedValue({ customMetadata: { sha256: "different" } });
  await expect(uploadOriginal(image)).resolves.toEqual({ image, localOnly: true });
  expect(storage.uploadString).not.toHaveBeenCalled();
  await expect(imageDataUri({ ...image, ownerId: "other" })).rejects.toThrow("계정");
});

test("already-cloud-backed images still enforce the signed-in owner", async () => {
  const foreign = { ...image, ownerId: "other", cloudPath: `originals/other/${image.id}` };
  await expect(uploadOriginal(foreign)).rejects.toThrow("계정");
  expect(storage.uploadString).not.toHaveBeenCalled();
});

test("a late original read cannot return the previous account's image", async () => {
  files.readAsStringAsync.mockImplementationOnce(async () => { auth.currentUser = { uid: "other" }; return "YWJj"; });
  await expect(imageDataUri(image)).rejects.toThrow("계정");
});

test("a damaged cached Drive image is replaced only by verified remote content", async () => {
  const drive = require("../src/services/driveService");
  const backed = { ...image, drive: { fileId: "file-fixture-001", folderId: "folder-fixture-001", size: 3, sha256: require("crypto").createHash("sha256").update("abc").digest("hex") } };
  const read = jest.spyOn(drive, "readDriveOriginal").mockResolvedValue("data:image/png;base64,YWJj");
  files.readAsStringAsync.mockResolvedValueOnce("ZGVm");
  await expect(imageDataUri(backed)).resolves.toBe("data:image/png;base64,YWJj");
  expect(read).toHaveBeenCalledWith(backed);
  expect(files.writeAsStringAsync).toHaveBeenCalledWith(expect.any(String), "YWJj", expect.any(Object));
  read.mockRestore();
});
test("an intact Drive cache remains usable without a Google network request", async () => {
  const drive = require("../src/services/driveService");
  const backed = { ...image, drive: { fileId: "file-fixture-001", folderId: "folder-fixture-001", size: 3, sha256: require("crypto").createHash("sha256").update("abc").digest("hex") } };
  const read = jest.spyOn(drive, "readDriveOriginal");
  await expect(imageDataUri(backed)).resolves.toBe("data:image/png;base64,YWJj");
  expect(read).not.toHaveBeenCalled(); read.mockRestore();
});
