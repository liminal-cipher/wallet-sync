import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Linking, Switch, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Page, Button, Field, ui } from "../../components/WalletUi";
import ConfirmationDialog, { useConfirmation } from "../../components/ConfirmationDialog";
import { auth } from "../../services/firebase";
import { getWalletScope, assertWalletScope } from "../../services/walletSession";
import { driveAvailable, loadDriveConnection, connectDrive, disconnectDrive, createDriveFolder, checkDriveFolder, saveDriveBackup, retryDriveBackup, listDriveBackups, readDriveBackup } from "../../services/driveService";
import { syncDriveOriginals } from "../../services/driveWalletActions";
import { exportWallet, previewRestore, restoreWalletBackup } from "../../services/backupService";
import { backupRange } from "../../utils/backupRange";

export default function DriveScreen({ navigation }) {
  const uid = useRef(auth.currentUser?.uid).current, scope = useRef(getWalletScope(uid)).current;
  const pending = useRef(false), confirmation = useConfirmation();
  const [connection, setConnection] = useState(null), [folder, setFolder] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [files, setFiles] = useState([]), [plan, setPlan] = useState(null), [originals, setOriginals] = useState(true);
  const [from, setFrom] = useState("1"), [to, setTo] = useState("");
  const check = () => { if (auth.currentUser?.uid !== uid) throw new Error("계정이 변경됐습니다."); assertWalletScope(scope); };
  useFocusEffect(useCallback(() => {
    let alive = true;
    loadDriveConnection().then((value) => { if (alive) { check(); setConnection(value); } }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []));
  const run = async (task) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try { check(); await task(); check(); }
    catch (e) { setError(e.message); }
    finally { pending.current = false; setBusy(false); }
  };
  const ready = driveAvailable();
  return <Page title="Drive 보관·백업" navigation={navigation}>
    <ConfirmationDialog {...confirmation.dialog} />
    <Text style={ui.note}>{scope.name} · 앱 로그인과 별도로 각자의 Google 계정을 연결합니다.</Text>
    {!ready && <Text style={ui.note}>Drive 연결이 포함된 Android 설치용 앱에서 사용할 수 있습니다. 파일 내보내기는 보관·복원 화면에서 계속 사용할 수 있습니다.</Text>}
    {busy && <ActivityIndicator color="#6366F1" />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {!!message && <Text accessibilityRole="alert" style={ui.note}>{message}</Text>}
    <Text style={ui.heading}>Google 계정</Text>
    <Text style={ui.note}>{connection ? connection.email : "아직 연결하지 않았습니다."}</Text>
    <Button label={connection ? "Google 계정 다시 선택" : "Google 계정 연결"} disabled={!ready || busy} onPress={() => run(async () => {
      const value = await connectDrive(); check(); setConnection(value); setFolder(null); setFiles([]); setPlan(null);
      setMessage("Google 계정을 연결했습니다. 보관 폴더 접근도 확인해 주세요.");
    })} />
    {connection && <Button label="이 기기에서 Drive 연결 해제" secondary disabled={busy} onPress={() => run(async () => {
      if (!await confirmation.confirm("Drive 연결 해제", "이 기기의 Drive 연결만 해제합니다. Drive 파일과 기기에 보관한 원본은 유지됩니다.")) return;
      check(); await disconnectDrive(); check(); setConnection(null); setFolder(null); setFiles([]); setPlan(null);
    })} />}
    <Text style={ui.heading}>원본 보관 폴더</Text>
    {scope.walletId && <Text style={ui.note}>쿠폰함을 만든 사람이 폴더를 만든 뒤 Drive에서 상대방의 Google 이메일에 편집 권한을 공유해 주세요. 상대방은 자신의 Google 계정을 연결하고 폴더 접근을 확인하면 됩니다. 쿠폰함 참여 해제와 Drive 공유 해제는 별도로 관리됩니다.</Text>}
    <Button label="보관 폴더 만들기·생성 재시도" disabled={!ready || !connection || busy} onPress={() => run(async () => {
      const value = await createDriveFolder(); check(); setFolder(value); setMessage("보관 폴더 접근을 확인했습니다.");
    })} />
    <Button label="공유·보관 폴더 접근 확인" secondary disabled={!ready || !connection || busy} onPress={() => run(async () => {
      const value = await checkDriveFolder(); check(); setFolder(value); setMessage("연결한 Google 계정의 폴더 편집 권한을 확인했습니다.");
    })} />
    {folder && <Button label="Drive에서 폴더 열기·공유 설정" secondary disabled={busy} onPress={() => run(async () => {
      const current = await checkDriveFolder(); check(); await Linking.openURL(`https://drive.google.com/drive/folders/${current.folderId}`);
    })} />}
    <Button label="이 기기의 미보관 원본 업로드" disabled={!ready || !connection || busy} onPress={() => run(async () => {
      const result = await syncDriveOriginals((done, total) => setMessage(`${done}/${total}개 원본 확인 중…`)); check();
      setMessage(`${result.uploaded}개 Drive 보관 완료 · ${result.failed}개 미완료. 기기의 원본은 유지됩니다.${result.failed ? " 원본을 가진 기기와 Drive 접근 상태를 확인하고 다시 시도해 주세요." : ""}`);
    })} />
    <Text style={ui.heading}>날짜별 JSON 백업</Text>
    <Text style={ui.note}>현재 쿠폰·휴지통 상태를 새 파일로 보관합니다. 수정 이력은 포함되지 않습니다. 원본 포함을 선택하면 누락된 사진이 하나라도 있을 때 백업을 완료로 표시하지 않습니다.</Text>
    <View style={ui.row}><Text style={ui.label}>원본 이미지 포함</Text><Switch accessibilityLabel="Drive 백업 원본 포함" value={originals} onValueChange={setOriginals} disabled={busy} /></View>
    <Field label="백업 시작 번호" value={from} onChangeText={setFrom} keyboardType="numeric" editable={!busy} />
    <Field label="백업 끝 번호 (빈칸이면 끝까지)" value={to} onChangeText={setTo} keyboardType="numeric" editable={!busy} />
    <Button label="Drive에 새 JSON 백업 저장" disabled={!ready || !connection || busy} onPress={() => run(async () => {
      await exportWallet("json", originals, null, backupRange(from, to), false, setMessage, saveDriveBackup); check();
      setMessage("Drive에 JSON 백업을 저장하고 내용을 검증했습니다. 별도 PC에도 사본을 보관해 주세요.");
    })} />
    <Button label="직전 Drive 백업 다시 전송" secondary disabled={!ready || !connection || busy} onPress={() => run(async () => {
      await retryDriveBackup(); check(); setMessage("직전 백업의 Drive 저장과 내용 검증을 완료했습니다.");
    })} />
    <Button label="Drive 백업 목록 새로고침" secondary disabled={!ready || !connection || busy} onPress={() => run(async () => {
      const result = await listDriveBackups(); check(); setFiles(result); setMessage(`최근 백업 ${result.length}개를 불러왔습니다. 최대 100개를 표시합니다.`);
    })} />
    {files.map((file) => <View key={file.id} style={ui.card}><Text style={ui.note}>{file.name}</Text>
      <Button label="이 백업 복원 미리보기" secondary disabled={busy} onPress={() => run(async () => {
        const backup = await readDriveBackup(file); check(); const value = await previewRestore(backup); check(); setPlan(value);
      })} /></View>)}
    {plan && <View style={ui.card}>
      <Text style={ui.note}>추가 {plan.additions.length}개 · 중복 {plan.skipped}개. 기존 쿠폰은 덮어쓰지 않습니다. 브랜드 설정은 변경하지 않습니다.</Text>
      <Button label="선택한 백업에서 누락 쿠폰 복원" disabled={busy || !plan.additions.length} onPress={() => run(async () => {
        if (!await confirmation.confirm("Drive 백업 복원", `${plan.additions.length}개 쿠폰을 현재 쿠폰함에 추가합니다. 기존 쿠폰은 유지됩니다.`)) return;
        check(); const result = await restoreWalletBackup(plan, { expectedUid: uid, includePreferences: false }); check();
        setPlan(null); setMessage(`${result.added}개 복원 · ${result.skipped}개 중복 건너뜀.${result.localOnly ? ` 원본 ${result.localOnly}개는 이 기기에 보관됐습니다.` : ""}`);
      })} />
      <Button label="미리보기 닫기" secondary disabled={busy} onPress={() => setPlan(null)} />
    </View>}
  </Page>;
}
