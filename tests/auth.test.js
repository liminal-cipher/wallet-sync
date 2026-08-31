const { getAuthErrorMessage } = require("../src/utils/authUtils");

describe("authService - getAuthErrorMessage", () => {
  test("maps invalid-credential error to Korean message", () => {
    const error = { code: "auth/invalid-credential" };
    expect(getAuthErrorMessage(error)).toBe("이메일 또는 비밀번호가 일치하지 않습니다.");
  });

  test("maps email-already-in-use error to Korean message", () => {
    const error = { code: "auth/email-already-in-use" };
    expect(getAuthErrorMessage(error)).toBe("이미 사용 중인 이메일 주소입니다.");
  });

  test("maps network-request-failed error to Korean message", () => {
    const error = { code: "auth/network-request-failed" };
    expect(getAuthErrorMessage(error)).toBe("네트워크 연결이 원활하지 않습니다. 인터넷 연결을 확인해 주세요.");
  });

  test("falls back gracefully when error is null or undefined", () => {
    expect(getAuthErrorMessage(null)).toBe("알 수 없는 오류가 발생했습니다.");
    expect(getAuthErrorMessage(undefined)).toBe("알 수 없는 오류가 발생했습니다.");
  });

  test("falls back to message when error code is unknown", () => {
    const error = { code: "auth/unknown-error", message: "Custom failure" };
    expect(getAuthErrorMessage(error)).toBe("Custom failure");
  });
});
