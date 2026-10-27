export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export function utf8ByteLength(text, stopAfter = Infinity) {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0);
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes > stopAfter) return bytes;
  }
  return bytes;
}

export function originalByteLength(value) {
  if (typeof value !== "string" || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32) throw new Error("원본 이미지는 10MB 이하여야 합니다.");
  const prefix = /^data:image\/(jpeg|png|webp);base64,/.exec(value);
  if (!prefix) throw new Error("이미지 형식이 올바르지 않습니다.");
  const data = value.slice(prefix[0].length);
  // Validate length and padding separately; avoid a repeated-group regexp on
  // multi-megabyte originals, which can exhaust an engine's regexp stack.
  if (!data.length || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error("이미지 Base64 형식이 올바르지 않습니다.");
  const bytes = data.length / 4 * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) throw new Error("원본 이미지는 10MB 이하여야 합니다.");
  return bytes;
}
