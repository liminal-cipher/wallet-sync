import { MAX_BACKUP_BYTES, MAX_IMAGE_BYTES, originalByteLength } from "./inputLimits";

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export function driveId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{10,200}$/.test(value)) throw new Error("Drive 파일 식별자가 올바르지 않습니다.");
  return value;
}
export function validateDriveReference(value) {
  if (!value || typeof value !== "object" || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.size) || value.size <= 0 || value.size > MAX_IMAGE_BYTES) {
    throw new Error("Drive 원본 정보가 올바르지 않습니다.");
  }
  return { fileId: driveId(value.fileId), folderId: driveId(value.folderId), sha256: value.sha256, size: value.size };
}
export function imageBytes(uri) {
  originalByteLength(uri);
  const binary = atob(uri.slice(uri.indexOf(",") + 1));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
export function bytesDataUri(bytes, mime) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 2048) binary += String.fromCharCode(...bytes.subarray(offset, offset + 2048));
  return `data:${mime};base64,${btoa(binary)}`;
}
export function validateDriveFile(file, expected) {
  if (!file || file.id !== expected.fileId || file.trashed || file.mimeType !== expected.mime || Number(file.size) !== expected.size ||
      expected.size <= 0 || expected.size > MAX_BACKUP_BYTES || !file.parents?.includes(expected.folderId) ||
      (file.sha256Checksum && file.sha256Checksum !== expected.sha256)) {
    throw new Error("Drive 파일의 내용·위치가 달라졌습니다. 기존 파일과 기기 원본은 유지됩니다.");
  }
  return file;
}
