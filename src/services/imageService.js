import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { getStorage, ref, uploadString, getMetadata, getBytes } from "firebase/storage";
import { auth } from "./firebase";
import { validateImage } from "../utils/couponModel";
import { MAX_IMAGE_BYTES, originalByteLength } from "../utils/inputLimits";
import { openLocalDatabase } from "./localDatabase";

export { MAX_IMAGE_BYTES } from "../utils/inputLimits";
const imageDb = () => openLocalDatabase("wallet-sync-images", "images");
async function webStore(key, blob) {
  const db = await imageDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("images", blob ? "readwrite" : "readonly");
      const request = blob ? transaction.objectStore("images").put(blob, key) : transaction.objectStore("images").get(key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(new Error("원본 이미지를 보관하지 못했습니다. 저장 공간을 확인해 주세요."));
    });
  } finally { db.close(); }
}
export async function retainImage(asset) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("로그인이 필요합니다.");
  const mime = asset.mimeType || "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error("JPEG·PNG·WebP 이미지를 선택해 주세요.");
  const id = Crypto.randomUUID();
  const key = `${uid}/${id}`;
  if (Platform.OS === "web") {
    const blob = await (await fetch(asset.uri)).blob();
    if (blob.size > MAX_IMAGE_BYTES) throw new Error("원본 이미지는 10MB 이하여야 합니다.");
    await webStore(key, blob);
  } else {
    const info = await FileSystem.getInfoAsync(asset.uri);
    if (info.size > MAX_IMAGE_BYTES) throw new Error("원본 이미지는 10MB 이하여야 합니다.");
    const directory = `${FileSystem.documentDirectory}originals/${encodeURIComponent(uid)}/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.copyAsync({ from: asset.uri, to: `${directory}${id}` });
  }
  return { id, ownerId: uid, mime, cloudPath: null };
}
function localUri(image) {
  validateImage(image);
  return `${FileSystem.documentDirectory}originals/${encodeURIComponent(image.ownerId)}/${image.id}`;
}
function requireImage(image) {
  validateImage(image);
  if (!image || image.ownerId !== auth.currentUser?.uid) throw new Error("원본 이미지 계정을 확인해 주세요.");
}
async function remoteBytes(image) {
  requireImage(image);
  if (!image.cloudPath) throw new Error("이 기기에 원본이 없습니다. 이미지가 포함된 JSON 백업을 복원해 주세요.");
  const storage = getStorage();
  storage.maxOperationRetryTime = 15000;
  // Authenticated reads: do not publish permanent download-token URLs.
  return new Uint8Array(await getBytes(ref(storage, image.cloudPath), MAX_IMAGE_BYTES));
}
export async function imageDataUri(image) {
  requireImage(image);
  if (Platform.OS !== "web") {
    if ((await FileSystem.getInfoAsync(localUri(image))).exists) {
      const content = await FileSystem.readAsStringAsync(localUri(image), { encoding: FileSystem.EncodingType.Base64 });
      requireImage(image);
      return `data:${image.mime};base64,${content}`;
    }
    // React Native cannot construct Blob(ArrayBuffer); encode authenticated bytes
    // directly instead of losing cross-device originals at that boundary.
    const bytes = await remoteBytes(image);
    requireImage(image);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    return `data:${image.mime};base64,${btoa(binary)}`;
  }
  let local;
  try { local = await webStore(`${image.ownerId}/${image.id}`); }
  catch (error) { if (!image.cloudPath) throw error; }
  const blob = local || new Blob([await remoteBytes(image)], { type: image.mime });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { requireImage(image); resolve(reader.result); } catch (error) { reject(error); }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
export async function uploadOriginal(image) {
  if (!image) return { image: null, localOnly: false };
  requireImage(image);
  if (image.cloudPath) return { image, localOnly: false };
  try {
    requireImage(image);
    const cloudPath = `originals/${auth.currentUser.uid}/${image.id}`;
    const dataUri = await imageDataUri(image);
    requireImage(image);
    originalByteLength(dataUri);
    const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, dataUri);
    const storage = getStorage();
    storage.maxUploadRetryTime = 15000;
    storage.maxOperationRetryTime = 15000;
    const target = ref(storage, cloudPath);
    let existing;
    try { existing = await getMetadata(target); }
    catch (error) { if (error.code !== "storage/object-not-found") throw error; }
    if (existing) {
      if (existing.customMetadata?.sha256 !== sha256) throw new Error("원본 이미지 내용이 다릅니다.");
    } else {
      requireImage(image);
      await uploadString(target, dataUri, "data_url", { contentType: image.mime, customMetadata: { sha256 } });
    }
    return { image: { ...image, cloudPath }, localOnly: false };
  } catch { return { image, localOnly: true }; }
}
export async function importImage(dataUri) {
  originalByteLength(dataUri);
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("로그인이 필요합니다.");
  if (Platform.OS === "web") return retainImage({ uri: dataUri, mimeType: dataUri.slice(5, dataUri.indexOf(";")) });
  const mimeType = dataUri.slice(5, dataUri.indexOf(";"));
  const temporary = `${FileSystem.cacheDirectory}${Crypto.randomUUID()}`;
  try {
    await FileSystem.writeAsStringAsync(temporary, dataUri.split(",")[1], { encoding: FileSystem.EncodingType.Base64 });
    if (auth.currentUser?.uid !== uid) throw new Error("계정이 변경됐습니다.");
    return await retainImage({ uri: temporary, mimeType });
  } finally {
    // Only the temporary file created by this operation is removed.
    await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
  }
}
