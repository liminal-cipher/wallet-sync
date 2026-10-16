const database = () => new Promise((resolve, reject) => {
  const request = indexedDB.open("wallet-sync-recovery", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("records");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error("기기 복구 저장소를 열 수 없습니다."));
});
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
