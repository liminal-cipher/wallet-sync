import { openLocalDatabase } from "./localDatabase";
const database = () => openLocalDatabase("wallet-sync-recovery", "records");
async function access(key, value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("records", value === undefined ? "readonly" : "readwrite");
      const store = tx.objectStore("records");
      const request = value === undefined ? store.get(key) : store.put(value, key);
      tx.oncomplete = () => resolve(request.result ?? null);
      tx.onerror = tx.onabort = () => reject(new Error("기기 복구 저장소에 접근하지 못했습니다."));
    });
  } finally { db.close(); }
}
export default { getItem: (key) => access(key), setItem: (key, value) => access(key, value) };
