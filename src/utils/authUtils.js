const getAuthErrorMessage = (error) => {
  if (!error) return "알 수 없는 오류가 발생했습니다.";
  const code = error.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "올바른 이메일 형식이 아닙니다.";
    case "auth/user-disabled":
      return "비활성화된 계정입니다. 관리자에게 문의하세요.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "이메일 또는 비밀번호가 일치하지 않습니다.";
    case "auth/email-already-in-use":
      return "이미 사용 중인 이메일 주소입니다.";
    case "auth/weak-password":
      return "비밀번호 보안 수준이 낮습니다. 6자 이상 입력해 주세요.";
    case "auth/network-request-failed":
      return "네트워크 연결이 원활하지 않습니다. 인터넷 연결을 확인해 주세요.";
    case "auth/too-many-requests":
      return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return error.message || "인증 처리 중 오류가 발생했습니다.";
  }
};

module.exports = {
  getAuthErrorMessage,
};
