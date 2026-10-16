jest.mock("firebase/auth", () => ({ sendPasswordResetEmail: jest.fn() }));
jest.mock("../src/services/firebase", () => ({ auth: {} }));
const { sendPasswordResetEmail } = require("firebase/auth");
const { resetPassword } = require("../src/services/authService");
beforeEach(() => { jest.clearAllMocks(); });
test("password recovery validates and trims an address without exposing account existence", async () => {
  await expect(resetPassword("invalid")).rejects.toThrow("이메일");
  expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  sendPasswordResetEmail.mockResolvedValueOnce();
  await expect(resetPassword(" person@example.com ")).resolves.toBeUndefined();
  expect(sendPasswordResetEmail).toHaveBeenLastCalledWith(expect.anything(), "person@example.com");
  sendPasswordResetEmail.mockRejectedValueOnce({ code: "auth/user-not-found" });
  await expect(resetPassword("missing@example.com")).resolves.toBeUndefined();
  sendPasswordResetEmail.mockRejectedValueOnce({ code: "auth/network-request-failed" });
  await expect(resetPassword("person@example.com")).rejects.toMatchObject({ code: "auth/network-request-failed" });
});
