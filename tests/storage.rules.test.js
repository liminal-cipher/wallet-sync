const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { ref, uploadBytes, getBytes, deleteObject } = require("firebase/storage");
const address = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const integration = address ? describe : describe.skip;
integration("immutable original-image storage", () => {
  let environment, owner, other;
  beforeAll(async () => {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(address)) throw new Error("A loopback storage emulator is required.");
    const [host, port] = address.split(":");
    environment = await initializeTestEnvironment({ projectId: "demo-wallet-sync-rules", storage: {
      host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, "../storage.rules"), "utf8"),
    } });
    owner = environment.authenticatedContext("owner").storage();
    other = environment.authenticatedContext("other").storage();
  });
  beforeEach(async () => { await environment.clearStorage(); });
  afterAll(async () => { await environment?.cleanup(); });
  test("an owner can upload and read an original but cannot overwrite or erase it", async () => {
    const image = ref(owner, "originals/owner/image-1");
    await assertSucceeds(uploadBytes(image, new Uint8Array([1, 2, 3]), { contentType: "image/png" }));
    await assertSucceeds(getBytes(image));
    await assertFails(uploadBytes(image, new Uint8Array([4]), { contentType: "image/png" }));
    await assertFails(deleteObject(image));
  });
  test("other accounts, anonymous users, non-images and oversized originals are rejected", async () => {
    await assertSucceeds(uploadBytes(ref(owner, "originals/owner/image-2"), new Uint8Array([1]), { contentType: "image/jpeg" }));
    await assertFails(getBytes(ref(other, "originals/owner/image-2")));
    await assertFails(getBytes(ref(environment.unauthenticatedContext().storage(), "originals/owner/image-2")));
    await assertFails(uploadBytes(ref(owner, "originals/other/forged"), new Uint8Array([1]), { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(owner, "originals/owner/html"), new Uint8Array([1]), { contentType: "text/html" }));
    await assertFails(uploadBytes(ref(owner, "originals/owner/large"), new Uint8Array(10 * 1024 * 1024 + 1), { contentType: "image/png" }));
  });
});
