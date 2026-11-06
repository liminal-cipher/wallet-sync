const mockLocal = new Map();
let mockFolder = null, mockWallet = { ownerId: "owner" }, mockBeforeWrite = null;
jest.mock("../src/services/firebase", () => ({ auth: { currentUser: { uid: "owner" } }, db: {} }));
jest.mock("../src/services/localRecovery", () => ({
  readLocal: jest.fn(async (uid, key) => mockLocal.get(`${uid}:${key}`) ?? null),
  writeLocal: jest.fn(async (uid, key, value) => { if (mockBeforeWrite) await mockBeforeWrite(); mockLocal.set(`${uid}:${key}`, value); }),
}));
jest.mock("firebase/firestore", () => ({ doc: (_db, ...parts) => parts.join("/"),
  getDocFromServer: jest.fn(async () => ({ exists: () => !!mockFolder, data: () => mockFolder })),
  runTransaction: jest.fn(async (_db, operation) => operation({
    get: async (path) => ({ exists: () => path.endsWith("/drive") ? !!mockFolder : true, data: () => path.endsWith("/drive") ? mockFolder : mockWallet }),
    set: (_path, value) => { mockFolder = value; },
  })),
}));
jest.mock("../src/services/driveAuth", () => ({ authorizeDrive: jest.fn(), clearDriveToken: jest.fn(), driveAvailable: () => true }));
jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "sha256" }, digest: async (_algorithm, bytes) => new Uint8Array(require("crypto").createHash("sha256").update(bytes).digest()).buffer }));
const mockApi = { json: jest.fn(), getFile: jest.fn(), generateId: jest.fn(), upload: jest.fn(), download: jest.fn() };
jest.mock("../src/services/driveHttp", () => ({ createDriveClient: () => mockApi }));
const service = require("../src/services/driveService");
const native = require("../src/services/driveAuth");
const local = require("../src/services/localRecovery");
const { auth } = require("../src/services/firebase");
const { setActiveWallet } = require("../src/services/walletSession");
const connection = { version: 1, email: "fixture@example.test", permissionId: "12345", name: "Fixture" };
const folder = { version: 1, folderId: "folder-fixture-001", ownerPermissionId: "12345", createdBy: "owner" };
const file = { id: folder.folderId, mimeType: "application/vnd.google-apps.folder", appProperties: { app: "wallet-sync", wallet: "owner" }, capabilities: { canAddChildren: true } };
beforeEach(() => {
  jest.clearAllMocks(); mockLocal.clear(); mockFolder = null; mockBeforeWrite = null; mockWallet = { ownerId: "owner" };
  auth.currentUser = { uid: "owner" }; setActiveWallet("owner");
  native.authorizeDrive.mockResolvedValue({ accessToken: "fixture-token" });
  mockApi.json.mockResolvedValue({ user: { emailAddress: connection.email, permissionId: connection.permissionId, displayName: "Fixture" } });
  mockApi.getFile.mockResolvedValue(file); mockApi.generateId.mockResolvedValue("generated-file-001"); mockApi.upload.mockResolvedValue({});
});
afterEach(() => setActiveWallet(null));
test("connect stores account metadata without tokens and disconnect keeps files", async () => {
  await expect(service.connectDrive()).resolves.toEqual(connection);
  expect(JSON.stringify([...mockLocal])).not.toContain("fixture-token");
  await service.disconnectDrive(); expect(await service.loadDriveConnection()).toBeNull();
  expect(mockApi.upload).not.toHaveBeenCalled();
});
test("late consent after wallet/account changes cannot attach to the new session", async () => {
  native.authorizeDrive.mockImplementationOnce(async () => { auth.currentUser = { uid: "other" }; return { accessToken: "fixture-token" }; });
  await expect(service.connectDrive()).rejects.toThrow("변경"); expect(mockLocal.size).toBe(0);
});
test("a reserved folder can be retried without allocating another folder", async () => {
  mockLocal.set("owner:drive-connection", connection); mockFolder = folder;
  mockApi.getFile.mockResolvedValueOnce(null).mockResolvedValueOnce(file);
  await expect(service.createDriveFolder()).resolves.toEqual(folder);
  expect(mockApi.generateId).not.toHaveBeenCalled();
  const create = mockApi.json.mock.calls.find(([path]) => path === "files");
  expect(JSON.parse(create[1].body).id).toBe(folder.folderId);
});
test("read-only or wrong-wallet Drive folders are rejected", async () => {
  mockLocal.set("owner:drive-connection", connection); mockFolder = folder;
  mockApi.getFile.mockResolvedValue({ ...file, capabilities: { canAddChildren: false } });
  await expect(service.checkDriveFolder()).rejects.toThrow("편집 권한");
  mockApi.getFile.mockResolvedValue({ ...file, appProperties: { app: "wallet-sync", wallet: "other" } });
  await expect(service.checkDriveFolder()).rejects.toThrow("접근할 수 없습니다");
});
test("an upload checkpoints the ID before network writes and reuses it after interruption", async () => {
  mockLocal.set("owner:drive-connection", connection); mockFolder = folder;
  const image = { id: "12345678-1234-4234-8234-123456789abc", ownerId: "owner", mime: "image/png" };
  mockApi.upload.mockRejectedValueOnce(new Error("reply lost"));
  await expect(service.uploadDriveOriginal(image, "data:image/png;base64,YWJj")).rejects.toThrow("reply lost");
  expect([...mockLocal.values()].some((value) => value?.fileId === "generated-file-001")).toBe(true);
  await expect(service.uploadDriveOriginal(image, "data:image/png;base64,YWJj")).resolves.toMatchObject({ fileId: "generated-file-001" });
  expect(mockApi.generateId).toHaveBeenCalledTimes(1);
  expect(mockApi.upload.mock.calls[0][0].fileId).toBe(mockApi.upload.mock.calls[1][0].fileId);
});
test("a failed checkpoint or changed original prevents an upload", async () => {
  mockLocal.set("owner:drive-connection", connection); mockFolder = folder;
  const image = { id: "12345678-1234-4234-8234-123456789abc", ownerId: "owner", mime: "image/png" };
  local.writeLocal.mockRejectedValueOnce(new Error("disk full"));
  await expect(service.uploadDriveOriginal(image, "data:image/png;base64,YWJj")).rejects.toThrow("disk full");
  expect(mockApi.upload).not.toHaveBeenCalled();
  await service.uploadDriveOriginal(image, "data:image/png;base64,YWJj");
  await expect(service.uploadDriveOriginal(image, "data:image/png;base64,ZGVm")).rejects.toThrow("내용이 달라졌습니다");
  expect(mockApi.upload).toHaveBeenCalledTimes(1);
});
