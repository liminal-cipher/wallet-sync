export const emptyBrandPreferences = () => ({ version: 1, favourites: [], recent: [] });

export function validateBrandPreferences(value) {
  const valid = (list, max) => Array.isArray(list) && list.length <= max && list.every((id) =>
    typeof id === "string" && id.length <= 80 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id));
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1 ||
      Object.keys(value).some((key) => !["version", "favourites", "recent"].includes(key)) ||
      !valid(value.favourites, 100) || !valid(value.recent, 12)) {
    throw new Error("브랜드 설정을 읽지 못했습니다. 기존 사본은 유지됩니다.");
  }
  return { version: 1, favourites: [...new Set(value.favourites)], recent: [...new Set(value.recent)] };
}

export function mergePreferenceData(current, incoming) {
  current = validateBrandPreferences(current);
  incoming = validateBrandPreferences(incoming);
  const favourites = [...new Set([...current.favourites, ...incoming.favourites])];
  if (favourites.length > 100) throw new Error("합칠 즐겨찾기가 100개를 넘습니다. 기존 설정을 정리한 뒤 다시 시도해 주세요.");
  return { version: 1, favourites, recent: [...new Set([...current.recent, ...incoming.recent])].slice(0, 12) };
}
