export async function recogniseImage(uri) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("kor+eng");
  try { return (await worker.recognize(uri)).data.text; }
  finally { await worker.terminate(); }
}
