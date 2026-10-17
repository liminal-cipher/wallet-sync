export function catalogueDetailLines(record) {
  const c = record.catalogue;
  if (!c) return [];
  const m = c.money;
  const lines = [[...new Set([c.snapshot?.brandName, c.snapshot?.segmentName, c.snapshot?.productName, c.snapshot?.variantName].filter(Boolean))].join(" · ")];
  if (m) {
    if (m.faceValue != null) lines.push(`액면금액 ${m.faceValue.toLocaleString("ko-KR")}원`);
    if (m.purchasePrice != null) lines.push(`구매 가격 ${m.purchasePrice.toLocaleString("ko-KR")}원`);
    if (m.balanceMode === "manual") lines.push(`수동 기록 잔액 ${m.remainingBalance == null ? "미확인" : `${m.remainingBalance.toLocaleString("ko-KR")}원`}`);
    if (m.discountAmount != null) lines.push(`${m.discountAmount.toLocaleString("ko-KR")}원 할인`);
    if (m.discountPercent != null) lines.push(`${m.discountPercent}% 할인`);
    if (m.referencePrice != null) lines.push(`참고 가격 ${m.referencePrice.toLocaleString("ko-KR")}원 (${m.referenceCheckedOn} 확인)`);
    if (m.referencePrice != null && m.referenceSourceUrl) lines.push(`참고 가격 출처 ${m.referenceSourceUrl}`);
  }
  if (c.issuer) lines.push(`발행처 ${c.issuer}`);
  if (c.purchaseChannel) lines.push(`구매·전달 경로 ${c.purchaseChannel}`);
  return lines.filter((line) => line && line !== record.brand);
}
