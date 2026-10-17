import React, { useCallback, useRef, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Page, Button, ui } from "../../components/WalletUi";
import { fetchCouponHistory, getCoupon, restoreCouponVersion } from "../../services/firestoreService";
import { toDay, toDate } from "../../utils/dateUtils";
import { confirmAction } from "../../utils/feedback";
import CatalogueDetails from "../../components/CatalogueDetails";

export default function CouponHistoryScreen({ navigation, route }) {
  const [versions, setVersions] = useState([]);
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const load = useCallback(async () => {
    const [record, history] = await Promise.all([getCoupon(route.params.id), fetchCouponHistory(route.params.id)]);
    setCurrent(record); setVersions(history);
  }, [route.params.id]);
  useFocusEffect(useCallback(() => { load().catch((e) => setError(e.message)); }, [load]));
  const restore = async (version) => {
    if (pending.current || !current) return;
    if (!(await confirmAction("이 버전으로 복원", "현재 상태도 새 이력으로 남깁니다. 브랜드·바코드·만료일·사용 상태·첨부·휴지통 상태가 선택한 버전으로 돌아갑니다."))) return;
    pending.current = true; setBusy(true); setError("");
    try { await restoreCouponVersion(current.id, version, current.revision || 0); await load(); }
    catch (e) { setError(e.message); }
    finally { pending.current = false; setBusy(false); }
  };
  return <Page title="쿠폰 수정 이력" navigation={navigation}>
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {!current && !error && <ActivityIndicator />}
    {current && <Text style={ui.heading}>{current.brand} · 현재 버전 {current.revision || 0}</Text>}
    <Text style={ui.note}>이 기능을 적용한 이후의 변경부터 보관됩니다. 복원도 하나의 새 변경으로 기록됩니다.</Text>
    {current && !versions.length && <Text style={ui.note}>아직 이전 버전이 없습니다.</Text>}
    {versions.map(({ record, version, savedAt }) => <View key={version} style={ui.card}>
      <Text style={ui.heading}>버전 {version} · {record.brand}</Text>
      <Text style={ui.note}>{toDate(savedAt)?.toLocaleString("ko-KR")} 이전 상태</Text>
      <Text selectable style={ui.note}>{record.barcodeType || "code128"}: {record.barcodeNumber}</Text>
      <Text style={ui.note}>{toDay(record.expiryDay || record.expiryDate)} · {record.deletedAt ? "휴지통" : record.isUsed ? "사용 완료" : "미사용"}</Text>
      <Text style={ui.note}>{record.conditions}</Text>
      {record.catalogue && <CatalogueDetails record={record} />}
      <Button label="이 버전 복원" secondary disabled={busy} onPress={() => restore(version)} />
    </View>)}
    <Button label="이력 새로고침" secondary disabled={busy} onPress={() => load().catch((e) => setError(e.message))} />
  </Page>;
}
