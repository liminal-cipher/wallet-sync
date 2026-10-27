import React, { useCallback, useRef, useState } from "react";
import { View, Text, Switch, ActivityIndicator, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Page, Field, Button, Choices, ui } from "../../components/WalletUi";
import { auth } from "../../services/firebase";
import { fetchCoupons, restoreCoupon } from "../../services/firestoreService";
import { readLocal } from "../../services/localRecovery";
import { exportWallet, pickBackup, previewRestore, restoreWalletBackup } from "../../services/backupService";
import { restorePreviousBrandPreferences } from "../../services/brandPreferences";
import { loadReminderSettings, saveReminderSettings, DEFAULT_REMINDERS } from "../../services/reminderSettings";
import { requestNotificationPermissions } from "../../services/notificationService";
import { validateBackupRecords, validateRestoreSession } from "../../utils/backupData";
import ConfirmationDialog, { useConfirmation } from "../../components/ConfirmationDialog";
import { backupRange } from "../../utils/backupRange";
import { reminderSchedule } from "../../utils/reminderSchedule";
import useCalendarClock from "../../hooks/useCalendarClock";

export default function WalletToolsScreen({ navigation }) {
  const uid = useRef(auth.currentUser?.uid).current;
  const [tab, setTab] = useState("backup");
  const [coupons, setCoupons] = useState([]);
  const [copies, setCopies] = useState([]);
  const [resume, setResume] = useState(null);
  const [previousResume, setPreviousResume] = useState(null);
  const [plan, setPlan] = useState(null);
  const [includePreferences, setIncludePreferences] = useState(false);
  const [exportPreferences, setExportPreferences] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState("7,3,0");
  const [savedSettings, setSavedSettings] = useState(null);
  const now = useCalendarClock();
  const forecast = reminderSchedule(uid, coupons, savedSettings, now);
  const [exportFrom, setExportFrom] = useState("1");
  const [exportTo, setExportTo] = useState("");
  const pending = useRef(false);
  const confirmation = useConfirmation();
  const load = useCallback(async () => {
    // Local recovery remains usable even when the server is unavailable.
    const [snapshots, session, previousSession, settings] = await Promise.allSettled([
      readLocal(uid, "snapshots", []), readLocal(uid, "restore"), readLocal(uid, "restore:previous"), loadReminderSettings(uid),
    ]);
    if (auth.currentUser?.uid !== uid) throw new Error("계정이 변경됐습니다.");
    const errors = [snapshots, session, previousSession, settings].filter((result) => result.status === "rejected").map((result) => result.reason.message);
    if (snapshots.status === "fulfilled") {
      setCopies(snapshots.value);
      if (snapshots.value[0]) setCoupons(snapshots.value[0].records);
    }
    if (session.status === "fulfilled") setResume(session.value);
    if (previousSession.status === "fulfilled") setPreviousResume(previousSession.value);
    if (settings.status === "fulfilled") {
      const value = settings.value;
      setSavedSettings(value);
      setEnabled(value.enabled); setTime(`${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`); setDays(value.days.join(","));
    }
    try {
      const records = await fetchCoupons(uid);
      if (auth.currentUser?.uid !== uid) throw new Error("계정이 변경됐습니다.");
      setCoupons(records);
    } catch (error) { errors.push(error.message); }
    if (errors.length) throw new Error(errors.join("\n"));
  }, [uid]);
  useFocusEffect(useCallback(() => { load().catch((e) => setError(e.message)); }, [load]));
  const run = async (operation) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try { await operation(); }
    catch (e) { setError(e.message); }
    finally { pending.current = false; setBusy(false); }
  };
  const prepare = async (input) => {
    if (!input) return;
    setPlan(null);
    const result = await previewRestore(input);
    setIncludePreferences(input.includePreferences === true);
    setPlan(result);
  };
  const restore = () => run(async () => {
    if (auth.currentUser?.uid !== uid || plan.uid !== uid) throw new Error("계정이 변경됐습니다. 백업을 다시 선택해 주세요.");
    if (!(await confirmation.confirm("추가 복원", `${plan.additions.length}개를 현재 로그인한 계정에 추가합니다. 기존 쿠폰은 덮어쓰지 않으며 ${plan.skipped}개 중복은 건너뜁니다. 휴지통 쿠폰은 휴지통에 복원됩니다.${includePreferences && plan.brandPreferences ? " 브랜드 설정은 기존 설정과 합칩니다." : " 브랜드 설정은 변경하지 않습니다."}`))) return;
    const result = await restoreWalletBackup(plan, { expectedUid: uid, includePreferences, onProgress: (done, total) => setMessage(`${done}/${total}개 복원 중...`) });
    setPlan(null); setMessage(`${result.added}개 복원, ${result.skipped}개 중복 건너뜀.${result.preferencesRestored ? " 브랜드 설정을 합쳤습니다." : ""}${result.localOnly ? ` 원본 ${result.localOnly}개는 이 기기에만 보관됐습니다.` : ""}`);
    await load();
  });
  const saveSettings = () => run(async () => {
    if (!/^\d{2}:\d{2}$/.test(time) || !/^\d+(\s*,\s*\d+)*$/.test(days)) throw new Error("시간은 HH:MM, 사전 알림은 7,3,0처럼 입력해 주세요.");
    const [hour, minute] = time.split(":").map(Number);
    const settings = await saveReminderSettings(uid, { enabled, hour, minute, days: days.split(",").map(Number) });
    setSavedSettings(settings);
    const granted = enabled && await requestNotificationPermissions();
    setMessage(Platform.OS === "web" ? "설정은 이 브라우저에 보관됩니다. 웹에서는 만료 알림을 지원하지 않습니다." : enabled && !granted ? "설정은 저장됐습니다. 기기 설정에서 알림 권한을 허용해 주세요." : "알림 설정을 이 기기에 저장했습니다.");
  });
  return <Page title="보관·복원·알림" navigation={navigation}>
    <ConfirmationDialog {...confirmation.dialog} />
    <Choices options={[["backup", "백업·복원"], ["trash", "휴지통"], ["reminders", "알림"]]} value={tab} onChange={setTab} disabled={busy} />
    {busy && <ActivityIndicator color="#6366F1" />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {!!message && <Text accessibilityRole="alert" style={ui.note}>{message}</Text>}
    {tab === "backup" && <>
      <Text style={ui.heading}>파일로 내보내기</Text>
      <Text style={ui.note}>JSON은 휴지통·즐겨찾기·최근 선택과 선택한 원본 이미지를 포함하는 복원용 백업입니다. CSV는 쿠폰 정보만, PDF는 열람·인쇄용입니다. 파일에는 사용 가능한 바코드가 들어 있으므로 개인 저장소에 보관하세요.</Text>
      <Field label="내보내기 시작 번호 (만료일순·휴지통 포함)" value={exportFrom} onChangeText={setExportFrom} keyboardType="numeric" editable={!busy} />
      <Field label="내보내기 끝 번호 (빈칸이면 끝까지)" value={exportTo} onChangeText={setExportTo} keyboardType="numeric" editable={!busy} />
      <Text style={ui.note}>기본값은 전체입니다. 큰 백업은 번호 범위를 나눠 저장하세요. 고정된 기기 사본을 기준으로 나누면 작업 중 목록이 바뀌어도 같은 순서를 유지합니다.</Text>
      <View style={ui.row}><Text style={ui.label}>JSON에 브랜드 설정 포함</Text><Switch accessibilityLabel="JSON에 브랜드 설정 포함" value={exportPreferences} onValueChange={setExportPreferences} disabled={busy} /></View>
      <Text style={ui.note}>브랜드 설정을 읽지 못해도 이 옵션을 끄면 쿠폰만 JSON으로 보관할 수 있습니다. 기기 사본 내보내기에는 현재 기기의 브랜드 설정이 포함됩니다.</Text>
      <View style={ui.row}>
        <Button label="JSON + 원본 이미지" disabled={busy} onPress={() => run(() => exportWallet("json", true, null, backupRange(exportFrom, exportTo), exportPreferences))} />
        <Button label="JSON 정보만" secondary disabled={busy} onPress={() => run(() => exportWallet("json", false, null, backupRange(exportFrom, exportTo), exportPreferences))} />
        <Button label="CSV" secondary disabled={busy} onPress={() => run(() => exportWallet("csv", false, null, backupRange(exportFrom, exportTo)))} />
        <Button label="PDF·인쇄" secondary disabled={busy} onPress={() => run(() => exportWallet("pdf", false, null, backupRange(exportFrom, exportTo)))} />
      </View>
      <Text style={ui.heading}>파일에서 추가 복원</Text>
      <Text style={ui.note}>WalletSync JSON·CSV 전체를 검증한 뒤 미리보기를 표시합니다. 기존 쿠폰과 중복되는 바코드는 건너뜁니다. 기존 쿠폰의 삭제·수정은 하지 않습니다.</Text>
      <Button label="백업 파일 선택" secondary disabled={busy} onPress={() => run(async () => prepare(await pickBackup()))} />
      {resume && <Button label="중단된 복원 다시 시도" secondary disabled={busy} onPress={() => run(() => prepare(validateRestoreSession(resume)))} />}
      {previousResume && <Button label="직전 복원 입력 다시 열기" secondary disabled={busy} onPress={() => run(() => prepare(validateRestoreSession(previousResume)))} />}
      {plan && <View style={ui.card}>
        <Text style={ui.heading}>복원 미리보기</Text>
        <Text style={ui.note}>추가 {plan.additions.length}개 · 중복 {plan.skipped}개 · 휴지통 {plan.additions.filter((r) => r.deletedAt).length}개 · 원본 {plan.additions.filter((r) => r.original).length}개</Text>
        {plan.additions.slice(0, 10).map((record, index) => <Text key={index} style={ui.note}>{record.brand} · {record.expiryDay}</Text>)}
        {plan.brandPreferences && <>
          <View style={ui.row}><Text style={ui.label}>브랜드 설정 함께 복원</Text><Switch accessibilityLabel="브랜드 설정 함께 복원" value={includePreferences} onValueChange={setIncludePreferences} disabled={busy} /></View>
          <Text style={ui.note}>즐겨찾기 {plan.brandPreferences.favourites.length}개 · 최근 선택 {plan.brandPreferences.recent.length}개. 기존 즐겨찾기를 유지하며 합칩니다. 최근 선택은 이 기기의 항목을 먼저 유지하고 최대 12개를 보관합니다.</Text>
        </>}
        <Button label="선택한 내용 추가 복원" onPress={restore} disabled={busy || (!plan.additions.length && !(includePreferences && plan.brandPreferences))} />
        <Button label="미리보기 닫기" secondary disabled={busy} onPress={() => setPlan(null)} />
      </View>}
      <Button label="브랜드 설정 복원 전으로 되돌리기" secondary disabled={busy} onPress={() => run(async () => {
        if (auth.currentUser?.uid !== uid) throw new Error("계정이 변경됐습니다.");
        if (!(await confirmation.confirm("브랜드 설정 되돌리기", "현재 즐겨찾기·최근 선택을 직전 복원 전 사본으로 바꿉니다. 현재 설정도 되돌리기 사본으로 보관합니다."))) return;
        await restorePreviousBrandPreferences(uid); setMessage("브랜드 설정을 이전 사본으로 되돌렸습니다.");
      })} />
      <Text style={ui.heading}>이 기기의 자동 사본</Text>
      <Text style={ui.note}>서버에서 확인한 최근 상태를 계정별로 보관합니다. 기기 분실·앱 삭제·브라우저 저장소 삭제까지 보호하려면 JSON 파일을 별도 저장해야 합니다. 수정 취소는 각 쿠폰의 수정 이력을 이용하세요.</Text>
      {!copies.length && <Text style={ui.note}>아직 자동 사본이 없습니다.</Text>}
      {copies.map((copy, index) => <View key={`${copy.savedAt}:${index}`} style={ui.card}>
        <Text style={ui.note}>{new Date(copy.savedAt).toLocaleString("ko-KR")} · {copy.records.length}개</Text>
        <Button label="이 사본에서 누락된 쿠폰 복원" secondary disabled={busy} onPress={() => run(() => prepare(validateBackupRecords(copy.records, { localImages: true })))} />
        <Button label="이 사본 JSON + 원본 내보내기" secondary disabled={busy} onPress={() => run(() => exportWallet("json", true, copy.records, backupRange(exportFrom, exportTo), exportPreferences))} />
        <Button label="이 사본 JSON 정보만 내보내기" secondary disabled={busy} onPress={() => run(() => exportWallet("json", false, copy.records, backupRange(exportFrom, exportTo), exportPreferences))} />
      </View>)}
    </>}
    {tab === "trash" && <>
      <Text style={ui.note}>휴지통은 자동으로 비우지 않습니다. 복원하면 사용 상태와 원본 이미지가 유지됩니다.</Text>
      {!coupons.some((coupon) => coupon.deletedAt) && <Text style={ui.note}>휴지통이 비어 있습니다.</Text>}
      {coupons.filter((coupon) => coupon.deletedAt).map((coupon) => <View key={coupon.id} style={ui.card}>
        <Text style={ui.heading}>{coupon.brand}</Text>
        <Button label="쿠폰 복원" secondary disabled={busy} onPress={() => run(async () => { await restoreCoupon(coupon.id, coupon.revision || 0); await load(); setMessage("쿠폰을 복원했습니다."); })} />
        <Button label="수정 이력" secondary disabled={busy} onPress={() => navigation.navigate("CouponHistory", { id: coupon.id })} />
      </View>)}
    </>}
    {tab === "reminders" && <>
      <View style={ui.row}><Text style={ui.label}>만료 알림</Text><Switch accessibilityLabel="만료 알림 사용" value={enabled} onValueChange={setEnabled} disabled={busy} /></View>
      <Field label="이 기기의 알림 시간 (HH:MM)" value={time} onChangeText={setTime} placeholder="09:00" maxLength={5} editable={!busy} />
      <Field label="만료 며칠 전 (쉼표 구분, 0은 당일)" value={days} onChangeText={setDays} placeholder="7,3,0" editable={!busy} />
      <Text style={ui.note}>기기 현지 시간을 사용합니다. 각 기기에서 따로 설정할 수 있습니다. 이미 지난 알림은 다시 발송하지 않습니다.</Text>
      <Button label="알림 설정 저장" onPress={saveSettings} disabled={busy} />
      <Button label="기본값 채우기" secondary disabled={busy} onPress={() => { setEnabled(DEFAULT_REMINDERS.enabled); setTime("09:00"); setDays("7,3,0"); }} />
      <Text style={ui.heading}>예정 알림 미리보기</Text>
      <Text style={ui.note}>저장한 설정과 현재 목록으로 계산한 다음 20건입니다. 기기 권한·예약 한도·연결 상태에 따라 실제 예약과 수신은 달라질 수 있습니다. 웹에서는 발송하지 않습니다.</Text>
      {!savedSettings ? <Text style={ui.note}>설정을 읽거나 저장한 뒤 확인해 주세요.</Text> : !forecast.length && <Text style={ui.note}>예정된 알림이 없습니다. 알림 사용 여부·시간·쿠폰 만료일을 확인해 주세요.</Text>}
      {forecast.slice(0, 20).map((entry) => <Text key={`${entry.couponId}:${entry.daysBefore}`} style={ui.note}>
        {entry.date.toLocaleString("ko-KR")} · {entry.brand} · {entry.daysBefore ? `${entry.daysBefore}일 전` : "만료 당일"}
      </Text>)}
    </>}
  </Page>;
}
