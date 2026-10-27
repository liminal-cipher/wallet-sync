// Shared IndexedDB lifecycle: a blocked upgrade must fail visibly rather than
// leave the editor or a backup waiting indefinitely.
export function openLocalDatabase(name, storeName) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("이 브라우저는 기기 저장소를 지원하지 않습니다.")); return; }
    let settled = false;
    const request = indexedDB.open(name, 1);
    const fail = (message) => {
      if (settled) return;
      settled = true; reject(new Error(message));
    };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onblocked = () => fail("다른 탭이 기기 저장소를 사용 중입니다. 다른 탭을 닫고 다시 시도해 주세요.");
    request.onerror = () => fail("기기 저장소를 열 수 없습니다. 브라우저 저장 공간·권한을 확인해 주세요.");
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
