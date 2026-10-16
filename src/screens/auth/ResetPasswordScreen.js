import React, { useRef, useState } from "react";
import { Text } from "react-native";
import { Page, Field, Button, ui } from "../../components/WalletUi";
import { resetPassword, getAuthErrorMessage } from "../../services/authService";

export default function ResetPasswordScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const submit = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await resetPassword(email);
      setMessage("등록된 이메일이면 재설정 안내가 발송됩니다. 받은 편지함과 스팸함을 확인해 주세요.");
    } catch (e) { setError(e.code ? getAuthErrorMessage(e) : e.message); }
    finally { pending.current = false; setBusy(false); }
  };
  return <Page title="비밀번호 재설정" navigation={navigation}>
    <Text style={ui.note}>가입한 이메일로 비밀번호 재설정 링크를 요청합니다. 기존 쿠폰은 유지됩니다.</Text>
    <Field label="이메일" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={!busy} />
    <Button label={busy ? "요청 중..." : "재설정 이메일 요청"} onPress={submit} disabled={busy} />
    {!!message && <Text accessibilityRole="alert" style={ui.note}>{message}</Text>}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
  </Page>;
}
