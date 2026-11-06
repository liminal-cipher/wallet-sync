import { doc, getDocFromServer, runTransaction } from "firebase/firestore";
import { auth, db } from "./firebase";
import { readLocal, writeLocal } from "./localRecovery";
import { getWalletScope, assertWalletScope } from "./walletSession";
import { authorizeDrive, clearDriveToken, driveAvailable } from "./driveAuth";
import { createDriveClient } from "./driveHttp";
import { driveId, DRIVE_FOLDER_MIME, imageBytes, bytesDataUri, validateDriveReference } from "../utils/driveData";
import { bytesHash } from "../utils/driveHash";
import { MAX_BACKUP_BYTES } from "../utils/inputLimits";
import { parseWalletBackup } from "../utils/backupData";

let connectionGeneration = 0, connecting = false;
const jobs = new Map();
const folderRef = (scope) => scope.walletId ? doc(db, "wallets", scope.walletId, "settings", "drive") : doc(db, "users", scope.uid, "settings", "drive");
const localKey = (scope, suffix) => `drive:${scope.walletId || "personal"}:${suffix}`;
function capture() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("로그인이 필요합니다.");
  const scope = getWalletScope(uid), generation = connectionGeneration;
  return { uid, scope, check() {
    if (auth.currentUser?.uid !== uid || connectionGeneration !== generation) throw new Error("계정 또는 Drive 연결이 변경됐습니다. 다시 시도해 주세요.");
    assertWalletScope(scope);
  } };
}
function connectionData(value) {
  if (value == null) return null;
  if (value.version !== 1 || typeof value.email !== "string" || !value.email.includes("@") || typeof value.permissionId !== "string" || !/^[0-9]{1,100}$/.test(value.permissionId)) {
    throw new Error("저장된 Drive 연결 정보를 읽지 못했습니다. 다시 연결해 주세요.");
  }
  return value;
}
async function identify(token, check) {
  const api = createDriveClient({ getToken: async () => token, clearToken: async () => { throw new Error("Drive 연결을 다시 허용해 주세요."); }, check });
  const { user } = await api.json("about?fields=user(displayName,emailAddress,permissionId)");
  return connectionData({ version: 1, email: user?.emailAddress, permissionId: user?.permissionId, name: user?.displayName || user?.emailAddress });
}
export async function loadDriveConnection() {
  const context = capture();
  const result = connectionData(await readLocal(context.uid, "drive-connection"));
  context.check(); return result;
}
export async function connectDrive() {
  if (connecting) throw new Error("Google 연결이 진행 중입니다.");
  connecting = true; connectionGeneration++;
  try {
    const context = capture();
    const { accessToken } = await authorizeDrive(null, true, true); context.check();
    const connection = await identify(accessToken, context.check); context.check();
    await writeLocal(context.uid, "drive-connection", connection); context.check();
    return connection;
  } finally { connecting = false; }
}
export async function disconnectDrive() {
  if (connecting) throw new Error("Google 연결이 끝난 뒤 다시 시도해 주세요.");
  connectionGeneration++;
  const context = capture();
  await writeLocal(context.uid, "drive-connection", null); context.check();
}
export async function driveContext() {
  const context = capture();
  context.connection = await loadDriveConnection(); context.check();
  if (!context.connection) throw new Error("먼저 Drive 계정을 연결해 주세요.");
  let token = null;
  context.api = createDriveClient({ check: context.check,
    getToken: async () => {
      if (!token) {
        const result = await authorizeDrive(context.connection.email, false, false); context.check();
        const identified = await identify(result.accessToken, context.check); context.check();
        if (identified.permissionId !== context.connection.permissionId) throw new Error("선택한 Google 계정이 달라졌습니다. Drive를 다시 연결해 주세요.");
        token = result.accessToken;
      }
      return token;
    },
    clearToken: async (old) => { token = null; await clearDriveToken(old); context.check(); },
  });
  return context;
}
function exclusive(key, task) {
  if (jobs.has(key)) return jobs.get(key);
  const promise = task(); jobs.set(key, promise);
  const clear = () => { if (jobs.get(key) === promise) jobs.delete(key); };
  promise.then(clear, clear); return promise;
}
async function folderRecord(context) {
  // Server read also checks membership after a remote removal, before Drive I/O.
  const snapshot = await getDocFromServer(folderRef(context.scope)); context.check();
  if (!snapshot.exists()) return null;
  const record = snapshot.data(); driveId(record.folderId);
  if (record.version !== 1 || typeof record.ownerPermissionId !== "string") throw new Error("Drive 폴더 설정 버전을 확인해 주세요.");
  return record;
}
async function checkFolder(context, record) {
  if (!record) throw new Error("먼저 Drive 보관 폴더를 만들어 주세요.");
  const file = await context.api.getFile(record.folderId); context.check();
  if (!file || file.trashed || file.mimeType !== DRIVE_FOLDER_MIME || file.appProperties?.app !== "wallet-sync" ||
      file.appProperties?.wallet !== (context.scope.walletId || context.uid) || !file.capabilities?.canAddChildren) {
    throw new Error("Drive 보관 폴더에 접근할 수 없습니다. 폴더 소유자가 연결한 Google 이메일에 편집 권한을 공유했는지 확인해 주세요.");
  }
  return record;
}
export async function checkDriveFolder() {
  const context = await driveContext();
  return checkFolder(context, await folderRecord(context));
}
export async function createDriveFolder() {
  const context = await driveContext();
  return exclusive(`${context.uid}:${context.scope.walletId}:folder`, async () => {
    let record = await folderRecord(context);
    if (!record) {
      const folderId = await context.api.generateId(); context.check();
      record = await runTransaction(db, async (tx) => {
        const ref = folderRef(context.scope), current = await tx.get(ref); context.check();
        if (current.exists()) return current.data();
        if (context.scope.walletId) {
          const wallet = await tx.get(doc(db, "wallets", context.scope.walletId)); context.check();
          if (wallet.data()?.ownerId !== context.uid) throw new Error("공유 쿠폰함을 만든 사람이 먼저 Drive 폴더를 만들어 주세요.");
        }
        const value = { version: 1, folderId, ownerPermissionId: context.connection.permissionId, createdBy: context.uid, createdAt: new Date() };
        tx.set(ref, value); return value;
      }); context.check();
    }
    if (!await context.api.getFile(record.folderId)) {
      if (record.ownerPermissionId !== context.connection.permissionId || record.createdBy !== context.uid) throw new Error("폴더를 만든 Google 계정에서 생성 완료 또는 공유 설정을 확인해 주세요.");
      await context.api.json("files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: record.folderId, name: `WalletSync - ${context.scope.name}`, mimeType: DRIVE_FOLDER_MIME,
        appProperties: { app: "wallet-sync", wallet: context.scope.walletId || context.uid } }) }, [409]);
    }
    return checkFolder(context, record);
  });
}
async function uploadFile(context, bytes, { name, mime, kind, key }) {
  const folder = await checkFolder(context, await folderRecord(context)); context.check();
  const sha256 = await bytesHash(bytes); context.check();
  const section = localKey(context.scope, `upload:${context.connection.permissionId}:${key}`);
  return exclusive(`${context.uid}:${section}`, async () => {
    let saved = await readLocal(context.uid, section); context.check();
    if (saved && (saved.version !== 1 || saved.sha256 !== sha256 || saved.size !== bytes.length || saved.mime !== mime || saved.folderId !== folder.folderId)) {
      throw new Error("업로드 대기 사본의 내용이 달라졌습니다. 기존 원본과 대기 사본을 유지합니다.");
    }
    if (!saved) {
      saved = { version: 1, fileId: await context.api.generateId(), folderId: folder.folderId, sha256, size: bytes.length, mime };
      context.check(); await writeLocal(context.uid, section, saved); context.check();
    }
    await context.api.upload(saved, bytes, name, kind); context.check();
    return { fileId: saved.fileId, folderId: saved.folderId, sha256, size: bytes.length };
  });
}
export async function uploadDriveOriginal(image, dataUri) {
  const context = await driveContext();
  assertImageScope(image, context);
  if (!dataUri.startsWith(`data:${image.mime};base64,`)) throw new Error("원본 이미지 형식이 다릅니다.");
  const bytes = imageBytes(dataUri);
  const result = await uploadFile(context, bytes, { mime: image.mime, name: `${image.id}.${image.mime.split("/")[1]}`, kind: "original", key: `image:${image.ownerId}:${image.id}` });
  context.check(); return validateDriveReference(result);
}
export async function readDriveOriginal(image) {
  const context = await driveContext();
  assertImageScope(image, context);
  await folderRecord(context); context.check();
  const reference = validateDriveReference(image.drive);
  const bytes = await context.api.download({ ...reference, mime: image.mime }); context.check();
  return bytesDataUri(bytes, image.mime);
}
function assertImageScope(image, context) {
  if (!image || !/^[a-f0-9-]{36}$/i.test(image.id) || !/^[A-Za-z0-9_-]{1,128}$/.test(image.ownerId) || !["image/png", "image/jpeg", "image/webp"].includes(image.mime) ||
      (context.scope.walletId ? image.walletId !== context.scope.walletId : image.walletId || image.ownerId !== context.uid)) {
    throw new Error("다른 계정·쿠폰함의 원본입니다.");
  }
}
export async function saveDriveBackup(text) {
  parseWalletBackup(text, "json");
  const context = await driveContext();
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error("백업 파일은 50MB 이하여야 합니다.");
  const hash = await bytesHash(bytes); context.check();
  // Retain the complete independent backup before attempting network writes.
  await writeLocal(context.uid, localKey(context.scope, "pending-backup"), { version: 1, text }); context.check();
  const result = await uploadFile(context, bytes, { mime: "application/json", name: `wallet-sync-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, kind: "backup", key: `backup:${hash}` });
  context.check(); return result;
}
export async function retryDriveBackup() {
  const context = capture();
  const saved = await readLocal(context.uid, localKey(context.scope, "pending-backup")); context.check();
  if (saved?.version !== 1 || typeof saved.text !== "string") throw new Error("이 쿠폰함에 저장된 Drive 백업 사본이 없습니다.");
  return saveDriveBackup(saved.text);
}
export async function listDriveBackups() {
  const context = await driveContext(), folder = await checkFolder(context, await folderRecord(context));
  const query = `'${driveId(folder.folderId)}' in parents and trashed = false and appProperties has { key='kind' and value='backup' }`;
  const result = await context.api.json(`files?q=${encodeURIComponent(query)}&pageSize=100&orderBy=createdTime%20desc&fields=${encodeURIComponent("files(id,name,mimeType,size,sha256Checksum,parents,trashed,createdTime)")}`);
  context.check(); return result.files || [];
}
export async function readDriveBackup(file) {
  const context = await driveContext(), folder = await checkFolder(context, await folderRecord(context));
  if (!file || file.mimeType !== "application/json" || !/^[a-f0-9]{64}$/.test(file.sha256Checksum) || !Number.isSafeInteger(Number(file.size)) || Number(file.size) > MAX_BACKUP_BYTES) throw new Error("검증 가능한 JSON 백업을 선택해 주세요.");
  const bytes = await context.api.download({ fileId: file.id, folderId: folder.folderId, size: Number(file.size), sha256: file.sha256Checksum, mime: "application/json" });
  context.check(); return parseWalletBackup(new TextDecoder("utf-8", { fatal: true }).decode(bytes), "json");
}
export { driveAvailable };
