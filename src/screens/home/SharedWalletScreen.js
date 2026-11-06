import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Page, Field, Button, ui } from "../../components/WalletUi";
import ConfirmationDialog, { useConfirmation } from "../../components/ConfirmationDialog";
import { auth } from "../../services/firebase";
import { getWalletScope, setActiveWallet } from "../../services/walletSession";
import { subscribeSharedWallet, createSharedWallet, createWalletInvitation, joinSharedWallet,
  removeWalletMember, clearUnavailableWalletLink } from "../../services/sharedWalletService";

export default function SharedWalletScreen({ navigation }) {
  const uid = useRef(auth.currentUser?.uid).current;
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("우리 쿠폰함");
  const [code, setCode] = useState("");
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const pending = useRef(false);
  const confirmation = useConfirmation();
  useEffect(() => subscribeSharedWallet(uid, (value) => {
    setWallet(value); setLoading(false); setUnavailable(false);
    if (value?.memberIds.length === 2) setInvitation(null);
  }, (failure) => {
    setLoading(false); setError(failure.message); setUnavailable(failure.code === "permission-denied");
  }), [uid]);
  const run = async (operation) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await operation(); }
    catch (failure) { setError(failure.message); }
    finally { pending.current = false; setBusy(false); }
  };
  const select = (value) => {
    setActiveWallet(uid, value);
    navigation.navigate("Home");
  };
  const owner = wallet?.ownerId === uid;
  const disconnect = () => run(async () => {
    const message = owner
      ? "상대방의 접근과 기존 초대 코드를 해제합니다. 공유 쿠폰과 이력은 이 쿠폰함에 남습니다."
      : "이 공유 쿠폰함의 접근을 해제합니다. 등록한 쿠폰과 이력은 상대방이 계속 관리합니다.";
    if (!(await confirmation.confirm(owner ? "공유 해제" : "쿠폰함 나가기", message))) return;
    await removeWalletMember(wallet.id); setInvitation(null);
  });
  return <Page title="함께 쓰는 쿠폰함" navigation={navigation}>
    <ConfirmationDialog {...confirmation.dialog} />
    <Text style={ui.note}>각자 자기 계정으로 로그인하고, 한 사람이 만든 쿠폰함에 다른 사람이 초대 코드로 참여합니다. 두 사람 모두 등록·수정·사용 처리·복원을 할 수 있습니다.</Text>
    <Text style={ui.label}>현재 선택: {getWalletScope(uid).name}</Text>
    {(loading || busy) && <ActivityIndicator color="#6366F1" />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {wallet && <View style={ui.card}>
      <Text style={ui.heading}>{wallet.name}</Text>
      <Text style={ui.note}>{wallet.memberIds.length}/2명 참여 · {owner ? "내가 만든 쿠폰함" : "초대받은 쿠폰함"}</Text>
      <Button label="이 공유 쿠폰함 열기" disabled={busy} onPress={() => select(wallet)} />
      {owner && wallet.memberIds.length === 1 && <Button label="새 초대 코드 만들기" secondary disabled={busy}
        onPress={() => run(async () => setInvitation(await createWalletInvitation(wallet.id)))} />}
      {invitation && <>
        <Text style={ui.note}>상대방에게만 전달하세요. 한 번 사용할 수 있으며 새 코드를 만들면 이전 코드는 만료됩니다.</Text>
        <Field label="전달할 초대 코드" value={invitation.code} editable={false} selectTextOnFocus />
        <Text style={ui.note}>{invitation.expiresAt.toLocaleString()}까지 사용 가능</Text>
      </>}
      <Button label={owner ? "공유·초대 해제" : "이 쿠폰함 나가기"} danger disabled={busy} onPress={disconnect} />
    </View>}
    {!loading && !wallet && !unavailable && <>
      <View style={ui.card}>
        <Field label="새 쿠폰함 이름" value={name} onChangeText={setName} maxLength={60} editable={!busy} />
        <Button label="공유 쿠폰함 만들기" disabled={busy} onPress={() => run(() => createSharedWallet(name))} />
      </View>
      <View style={ui.card}>
        <Field label="받은 초대 코드" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} editable={!busy} />
        <Button label="초대 코드로 참여" disabled={busy} onPress={() => run(() => joinSharedWallet(code))} />
      </View>
    </>}
    {unavailable && <Button label="접근이 해제된 쿠폰함 연결 정리" secondary disabled={busy}
      onPress={() => run(clearUnavailableWalletLink)} />}
    <Button label="개인 쿠폰함 열기" secondary disabled={busy} onPress={() => select(null)} />
    <Text style={ui.note}>기존 개인 쿠폰은 자동으로 공유되지 않습니다. 백업 파일로 원하는 쿠폰을 공유 쿠폰함에 추가 복원할 수 있습니다.</Text>
    <Text style={ui.note}>사진 원본을 함께 보려면 각자 Drive 계정을 연결하고 같은 보관 폴더에 접근할 수 있어야 합니다. 원본 업로드가 끝나기 전에는 등록한 기기에만 보관됩니다. 쿠폰함 참여 해제와 Drive 폴더 공유 해제는 별도로 관리해 주세요.</Text>
    <Button label="Drive 연결·원본 보관" secondary onPress={() => navigation.navigate("Drive")} />
  </Page>;
}
