export function safeSourceUrl(value) {
  if (!value) return "";
  try {
    if (typeof value !== "string") throw new Error();
    const text = value.trim().replace(/^https:/i, "https:");
    if (!/^https:\/\/[^/?#\s\\@]+(?:[/?#][^\s\\]*)?$/.test(text)) throw new Error();
    const url = new URL(text);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error();
    // React Native's URL.href adds a trailing slash to paths. Preserve the source.
    return text;
  } catch { throw new Error("공식 안내 페이지의 https 주소를 입력해 주세요."); }
}
