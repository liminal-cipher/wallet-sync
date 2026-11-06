const http = require("node:http");
const { createHash } = require("node:crypto");
jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "sha256" }, digest: async (_algorithm, bytes) => new Uint8Array(require("crypto").createHash("sha256").update(bytes).digest()).buffer }));
const { createDriveClient } = require("../src/services/driveHttp");
const { validateDriveReference } = require("../src/utils/driveData");

describe("Drive transport against a local HTTP fault server", () => {
  let server, origin, requests, stored, loseReply, rejectPut, wrongHash, switchAfterPut, changed, client, missingChecksum, corruptBytes, tokenCalls, unauthorized;
  const bytes = new TextEncoder().encode("original-photo-bytes");
  const expected = { fileId: "file-id-fixture-001", folderId: "folder-id-fixture-001", size: bytes.length, mime: "image/png", sha256: createHash("sha256").update(bytes).digest("hex") };
  const metadata = () => ({ id: expected.fileId, name: "original.png", parents: [expected.folderId], mimeType: expected.mime, size: String(expected.size), trashed: false,
    ...(missingChecksum ? {} : { sha256Checksum: wrongHash ? "a".repeat(64) : expected.sha256 }) });
  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      const chunks = []; for await (const part of req) chunks.push(part);
      const body = Buffer.concat(chunks); requests.push({ method: req.method, path: req.url, body });
      if (unauthorized) { unauthorized = false; res.writeHead(401).end(); return; }
      if (req.method === "POST") { res.writeHead(200, { Location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=fixture" }).end(); return; }
      if (req.method === "PUT") {
        if (rejectPut) { res.writeHead(503).end(); return; }
        stored = true;
        if (switchAfterPut) changed = true;
        if (loseReply) { loseReply = false; req.socket.destroy(); return; }
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(metadata())); return;
      }
      if (!stored) { res.writeHead(404).end(); return; }
      if (req.url.includes("alt=media")) { res.writeHead(200).end(corruptBytes ? Buffer.alloc(bytes.length, 0) : Buffer.from(bytes)); return; }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(metadata()));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  beforeEach(() => {
    requests = []; stored = loseReply = rejectPut = wrongHash = switchAfterPut = changed = missingChecksum = corruptBytes = unauthorized = false; tokenCalls = 0;
    client = createDriveClient({ getToken: async () => { tokenCalls++; return "test-fixture-token"; }, clearToken: jest.fn(),
      check: () => { if (changed) throw new Error("scope changed"); },
      fetchImpl: (url, options) => { const parsed = new URL(url); return fetch(`${origin}${parsed.pathname}${parsed.search}`, options); },
    });
  });
  test("uploads exact bytes once and retries the same ID without overwriting", async () => {
    await client.upload(expected, bytes, "original.png", "original");
    await client.upload(expected, bytes, "original.png", "original");
    expect(requests.filter((item) => item.method === "PUT")).toHaveLength(1);
    expect(requests.find((item) => item.method === "PUT").body).toEqual(Buffer.from(bytes));
    expect(JSON.parse(requests.find((item) => item.method === "POST").body.toString()).id).toBe(expected.fileId);
  });
  test("a lost successful commit reply is recovered by checksum readback", async () => {
    loseReply = true;
    await expect(client.upload(expected, bytes, "original.png", "original")).resolves.toMatchObject({ id: expected.fileId });
    expect(requests.filter((item) => item.method === "PUT")).toHaveLength(1);
  });
  test("a failed upload remains retryable without choosing a new ID", async () => {
    rejectPut = true;
    await expect(client.upload(expected, bytes, "original.png", "original")).rejects.toThrow("Drive 요청");
    rejectPut = false; await client.upload(expected, bytes, "original.png", "original");
    expect(requests.filter((item) => item.method === "POST").map((item) => JSON.parse(item.body.toString()).id)).toEqual([expected.fileId, expected.fileId]);
  });
  test("conflicting content and corrupt downloads are never accepted", async () => {
    stored = true; wrongHash = true;
    await expect(client.upload(expected, bytes, "original.png", "original")).rejects.toThrow("내용·위치");
    wrongHash = false; corruptBytes = true;
    await expect(client.download(expected)).rejects.toThrow("내용 검증");
    expect(requests.some((item) => item.method === "PUT")).toBe(false);
  });
  test("missing checksum metadata triggers full content verification", async () => {
    stored = true; missingChecksum = true;
    await expect(client.upload(expected, bytes, "original.png", "original")).resolves.toMatchObject({ id: expected.fileId });
    expect(requests.some((item) => item.path.includes("alt=media"))).toBe(true);
  });
  test("scope changes after upload retain the file but invalidate the result", async () => {
    switchAfterPut = true;
    await expect(client.upload(expected, bytes, "original.png", "original")).rejects.toThrow("scope changed");
    expect(stored).toBe(true);
    expect(requests.some((item) => item.method === "DELETE")).toBe(false);
  });
  test("authentication is refreshed once and tokens cannot go to an untrusted host", async () => {
    stored = true; unauthorized = true;
    await client.getFile(expected.fileId); expect(tokenCalls).toBe(2);
    await expect(client.request("https://example.com/upload/drive/v3/files")).rejects.toThrow("허용되지 않은");
    expect(requests).toHaveLength(2);
  });
  test("malformed references are rejected before any network request", () => {
    expect(() => validateDriveReference({ ...expected, fileId: "../bad" })).toThrow("식별자");
    expect(() => validateDriveReference({ ...expected, size: 100 * 1024 * 1024 })).toThrow("원본 정보");
  });
});
