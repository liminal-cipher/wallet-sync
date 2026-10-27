const { openLocalDatabase } = require("../src/services/localDatabase");
const previous = global.indexedDB;
let request, db;
beforeEach(() => {
  db = { close: jest.fn(), createObjectStore: jest.fn(), objectStoreNames: { contains: () => false } };
  request = { result: db };
  global.indexedDB = { open: jest.fn(() => request) };
});
afterEach(() => { if (previous === undefined) delete global.indexedDB; else global.indexedDB = previous; });
test("blocked storage rejects promptly and closes a late successful connection", async () => {
  const pending = openLocalDatabase("test", "records");
  request.onblocked();
  await expect(pending).rejects.toThrow("다른 탭");
  request.onsuccess(); expect(db.close).toHaveBeenCalledTimes(1);
});
test("a normal connection creates the store and releases it when a newer version requests access", async () => {
  const pending = openLocalDatabase("test", "records");
  request.onupgradeneeded(); request.onsuccess();
  await expect(pending).resolves.toBe(db);
  expect(db.createObjectStore).toHaveBeenCalledWith("records");
  db.onversionchange(); expect(db.close).toHaveBeenCalled();
});
test("unsupported and denied storage produce actionable errors", async () => {
  const pending = openLocalDatabase("test", "records"); request.onerror();
  await expect(pending).rejects.toThrow("저장 공간");
  delete global.indexedDB;
  await expect(openLocalDatabase("test", "records")).rejects.toThrow("지원하지 않습니다");
});
