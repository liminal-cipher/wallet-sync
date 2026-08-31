const getExpiryInfo = (expiryDate, isUsed) => {
  if (isUsed) {
    return { text: "사용 완료", color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1" };
  }
  if (!expiryDate) {
    return { text: "만료일 없음", color: "#10B981", bg: "#ECFDF5", border: "#6EE7B7" };
  }

  const exp = typeof expiryDate.toDate === "function" ? expiryDate.toDate() : new Date(expiryDate);
  if (isNaN(exp.getTime())) {
    return { text: "만료일 미정", color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1" };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expZero = new Date(exp);
  expZero.setHours(0, 0, 0, 0);

  const diffTime = expZero.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: "만료됨", color: "#E11D48", bg: "#FFE4E6", border: "#FDA4AF" };
  }
  if (diffDays === 0) {
    return { text: "D-Day (오늘)", color: "#EA580C", bg: "#FFEDD5", border: "#FDBA74" };
  }
  return {
    text: `D-${diffDays}`,
    color: "#059669",
    bg: "#D1FAE5",
    border: "#6EE7B7",
  };
};

module.exports = {
  getExpiryInfo,
};
