export function backupRange(from, to) {
  if (!/^\d+$/.test(from) || (to && !/^\d+$/.test(to))) throw new Error("백업 범위는 1부터 시작하는 번호로 입력해 주세요.");
  const start = Number(from), end = to ? Number(to) : null;
  if (!Number.isSafeInteger(start) || start < 1 || (end !== null && (!Number.isSafeInteger(end) || end < start))) throw new Error("백업 범위의 시작·끝 번호를 확인해 주세요.");
  return { start, end };
}
export function selectBackupRange(records, range) {
  if (!range) return records;
  if (range.start > records.length && !(range.start === 1 && !records.length)) throw new Error("시작 번호가 쿠폰 수보다 큽니다.");
  if (range.end !== null && range.end > records.length) throw new Error("끝 번호가 쿠폰 수보다 큽니다.");
  return records.slice(range.start - 1, range.end ?? records.length);
}
