const INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const normaliseSearch = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase()
  .replace(/[\u1100-\u1112]/g, (letter) => INITIALS[letter.charCodeAt(0) - 0x1100]).replace(/[^\p{L}\p{N}]/gu, "");
const initials = (value) => [...normaliseSearch(value)].map((letter) => {
  const code = letter.charCodeAt(0) - 0xAC00;
  return code >= 0 && code < 11172 ? INITIALS[Math.floor(code / 588)] : letter;
}).join("");
const matchesSearch = (text, query) => {
  const terms = String(query || "").trim().split(/\s+/).map(normaliseSearch).filter(Boolean);
  const haystack = normaliseSearch(text), initialText = initials(text);
  return terms.every((term) => haystack.includes(term) || initialText.includes(term));
};
module.exports = { normaliseSearch, initials, matchesSearch };
