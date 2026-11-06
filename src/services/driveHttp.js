import { driveId, validateDriveFile } from "../utils/driveData";
import { bytesHash } from "../utils/driveHash";

const API = "https://www.googleapis.com/drive/v3/";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FILE_FIELDS = "id,name,mimeType,size,sha256Checksum,parents,trashed,appProperties,capabilities(canAddChildren)";
const failure = (status) => Object.assign(new Error(status === 401 ? "Google 연결이 만료됐습니다. Drive를 다시 연결해 주세요."
  : status === 403 ? "Drive 접근 권한이나 저장 공간을 확인해 주세요. 공유 폴더는 두 Google 계정에 편집 권한이 필요합니다."
  : status === 404 ? "Drive 파일을 찾거나 읽을 수 없습니다. 폴더 공유와 계정 연결을 확인해 주세요."
  : "Drive 요청에 실패했습니다. 원본은 유지됩니다. 연결을 확인하고 다시 시도해 주세요."), { status, code: `drive/http-${status}` });

// All writes use pre-generated IDs. Never overwrite or delete a Drive file.
export function createDriveClient({ getToken, clearToken, check, fetchImpl = (...args) => fetch(...args) }) {
  async function request(path, options = {}, accepted = [], retried = false) {
    check();
    const url = path.startsWith("https://") ? new URL(path) : new URL(path, API);
    if (url.origin !== "https://www.googleapis.com" || !/^\/(upload\/)?drive\/v3\//.test(url.pathname)) throw new Error("허용되지 않은 Drive 주소입니다.");
    const token = await getToken(); check();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 45000);
    let response;
    try {
      response = await fetchImpl(url.href, { ...options, redirect: "error", signal: abort.signal,
        headers: { ...options.headers, Authorization: `Bearer ${token}` } });
    } catch { check(); throw failure(0); }
    finally { clearTimeout(timer); }
    check();
    if (response.status === 401 && !retried) {
      await clearToken(token); check();
      return request(path, options, accepted, true);
    }
    if (!response.ok && !accepted.includes(response.status)) throw failure(response.status);
    return response;
  }
  async function json(path, options, accepted) {
    const response = await request(path, options, accepted);
    if (!response.ok) return { status: response.status };
    const value = await response.json(); check(); return value;
  }
  const getFile = async (id) => {
    const file = await json(`files/${driveId(id)}?fields=${encodeURIComponent(FILE_FIELDS)}`, {}, [404]);
    return file.status === 404 ? null : file;
  };
  const generateId = async () => driveId((await json("files/generateIds?count=1&space=drive&type=files")).ids?.[0]);
  async function download(expected) {
    const metadata = await getFile(expected.fileId);
    validateDriveFile(metadata, expected);
    const response = await request(`files/${driveId(expected.fileId)}?alt=media`);
    if (response.headers.get("Content-Length") && Number(response.headers.get("Content-Length")) !== expected.size) throw new Error("Drive 원본 크기가 다릅니다.");
    const bytes = new Uint8Array(await response.arrayBuffer()); check();
    if (bytes.length !== expected.size || await bytesHash(bytes) !== expected.sha256) throw new Error("Drive 원본 내용 검증에 실패했습니다. 다른 사본을 확인해 주세요.");
    check(); return bytes;
  }
  async function verify(expected) {
    const file = validateDriveFile(await getFile(expected.fileId), expected);
    // Some file types/accounts omit SHA-256 metadata: verify actual bytes then.
    if (!file.sha256Checksum) await download(expected);
    check(); return file;
  }
  async function upload(expected, bytes, name, kind) {
    check();
    if (bytes.length !== expected.size || await bytesHash(bytes) !== expected.sha256) throw new Error("업로드할 파일 내용이 저장한 사본과 다릅니다.");
    check();
    const existing = await getFile(expected.fileId);
    if (existing) return verify(expected);
    try {
      const start = await request(`${UPLOAD}?uploadType=resumable`, {
        method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": expected.mime, "X-Upload-Content-Length": String(bytes.length) },
        body: JSON.stringify({ id: expected.fileId, name, mimeType: expected.mime, parents: [expected.folderId], appProperties: { app: "wallet-sync", kind } }),
      }, [409]);
      if (start.status !== 409) {
        const location = start.headers.get("Location");
        if (!location) throw new Error("Drive 업로드 주소를 받지 못했습니다.");
        await request(location, { method: "PUT", headers: { "Content-Type": expected.mime, "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}` }, body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
      }
    } catch (error) {
      check();
      // A completed upload may have lost its reply. Confirm the same ID only.
      try { return await verify(expected); } catch { check(); throw error; }
    }
    return verify(expected);
  }
  return { request, json, getFile, generateId, upload, download };
}
