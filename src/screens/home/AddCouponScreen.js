import React, { useEffect, useRef, useState } from "react";
import { View, Text, Modal, StyleSheet, Image, ActivityIndicator, Platform } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Page, Field, Button, Choices, ui } from "../../components/WalletUi";
import BarcodeRenderer from "../../components/BarcodeRenderer";
import { addCoupon, getCoupon, updateCoupon } from "../../services/firestoreService";
import { auth } from "../../services/firebase";
import { readLocal, writeLocal } from "../../services/localRecovery";
import { retainImage, imageDataUri, uploadOriginal } from "../../services/imageService";
import { recogniseImage } from "../../services/ocrService";
import { parseVoucherText } from "../../utils/voucherParser";
import { toDay, daysRemaining } from "../../utils/dateUtils";
import { BARCODE_TYPES, PROVIDERS, normaliseCoupon } from "../../utils/couponModel";
import { barcodeSvg } from "../../utils/barcodes";
import { Alert } from "../../utils/feedback";
import useCalendarClock from "../../hooks/useCalendarClock";

const initialForm = () => {
  const date = new Date(); date.setDate(date.getDate() + 30);
  return { kind: "voucher", brand: "", barcodeNumber: "", barcodeType: "code128", expiryDay: toDay(date),
    provider: "other", conditions: "", sourceUrl: "", isUsed: false, image: null };
};
export default function AddCouponScreen({ navigation, route }) {
  const id = route.params?.id;
  const uid = useRef(auth.currentUser?.uid).current;
  const section = `draft:${id || "new"}`;
  const [form, setForm] = useState(initialForm);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [camera, setCamera] = useState(false);
  const [smart, setSmart] = useState(false);
  const [text, setText] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const saving = useRef(false);
  const scanned = useRef(false);
  const saved = useRef(false);
  const now = useCalendarClock();
  useEffect(() => {
    let active = true;
    (async () => {
      const record = id ? await getCoupon(id) : null;
      const cached = await readLocal(uid, section);
      if (!active) return;
      if (record) {
        setForm({ ...initialForm(), ...record, expiryDay: toDay(record.expiryDay || record.expiryDate) || "" });
        setRevision(record.revision || 0);
      }
      setDraft(cached); setReady(true);
    })().catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id, uid, section]);
  useEffect(() => {
    if (!ready || !dirty || saved.current) return;
    writeLocal(uid, section, { form, revision, savedAt: new Date().toISOString() }).catch(() =>
      setError("입력 초안을 기기에 보관하지 못했습니다. 저장 공간을 확인해 주세요."));
  }, [form, revision, ready, dirty, uid, section]);
  useEffect(() => {
    let active = true;
    if (!form.image) { setPreview(null); return; }
    imageDataUri(form.image).then((uri) => { if (active) setPreview(uri); }).catch(() => { if (active) setPreview(null); });
    return () => { active = false; };
  }, [form.image]);
  const change = (field, value) => { setDirty(true); setForm((current) => ({ ...current, [field]: value })); };
  const changeFields = (fields) => { setDirty(true); setForm((current) => ({ ...current, ...fields })); };
  const applyText = () => {
    const parsed = parseVoucherText(text);
    const fields = {};
    if (parsed.brand) fields.brand = parsed.brand;
    if (parsed.barcodeNumber) { fields.barcodeNumber = parsed.barcodeNumber; fields.barcodeType = "code128"; }
    if (parsed.expiryDate) fields.expiryDay = toDay(parsed.expiryDate);
    changeFields(fields); setSmart(false);
    if (!Object.keys(fields).length) Alert.alert("분석 결과", "자동으로 추출하지 못했습니다. 원본을 확인해 직접 입력해 주세요.");
  };
  const openScanner = async () => {
    if (Platform.OS === "web") return Alert.alert("안내", "웹에서는 바코드를 직접 입력하거나 원본 이미지를 보관해 주세요.");
    if (!permission?.granted && !(await requestPermission()).granted) return Alert.alert("권한 필요", "카메라 접근 권한을 확인해 주세요.");
    scanned.current = false; setCamera(true);
  };
  const scan = ({ data, type }) => {
    if (scanned.current) return;
    scanned.current = true; setCamera(false);
    if (!BARCODE_TYPES.includes(type)) return Alert.alert("바코드 종류", "지원하지 않는 종류입니다. 원본을 보관해 주세요.");
    changeFields({ barcodeNumber: String(data), barcodeType: type });
  };
  const pickImage = async () => {
    if (processing) return;
    setProcessing(true); setError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
      if (result.canceled) return;
      const asset = result.assets[0];
      const image = await retainImage(asset);
      change("image", image);
      try { setText(await recogniseImage(asset.uri)); setSmart(true); }
      catch (e) { setError(e.message); }
    } catch (e) { setError(e.message); }
    finally { setProcessing(false); }
  };
  const save = async () => {
    if (saving.current || !ready || processing) return;
    saving.current = true; setBusy(true); setError("");
    try {
      if (uid !== auth.currentUser?.uid) throw new Error("계정이 변경됐습니다.");
      const data = normaliseCoupon(form);
      if (!data.expiryDay) throw new Error("유효한 만료일을 입력해 주세요 (YYYY-MM-DD).");
      if (data.kind === "voucher") barcodeSvg(data.barcodeNumber, data.barcodeType);
      // Persist a final recovery draft before attempting the network write.
      await writeLocal(uid, section, { form, revision, savedAt: new Date().toISOString() });
      const uploaded = await uploadOriginal(data.image);
      if (uid !== auth.currentUser?.uid) throw new Error("계정이 변경됐습니다.");
      if (id) await updateCoupon(id, { ...data, image: uploaded.image }, revision);
      else await addCoupon({ ...data, image: uploaded.image });
      saved.current = true;
      try { await writeLocal(uid, section, null); }
      catch { Alert.alert("저장 완료", "쿠폰은 저장됐지만 기기 초안을 정리하지 못했습니다. 같은 쿠폰은 중복 등록되지 않습니다."); }
      if (uploaded.localOnly) Alert.alert("원본은 이 기기에 보관됨", "쿠폰은 저장됐습니다. 원본 이미지의 클라우드 보관은 확인하지 못했습니다. 보관·복원에서 이미지 포함 JSON 백업을 별도로 저장해 주세요.");
      navigation.goBack();
    } catch (e) { setError(e.message); }
    finally { saving.current = false; setBusy(false); }
  };
  const remaining = daysRemaining(form.expiryDay, now);
  return <Page title={id ? "쿠폰 수정" : "쿠폰·이벤트 등록"} navigation={navigation}>
    {!ready && !error && <ActivityIndicator color="#6366F1" />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {draft && <View style={ui.card}>
      <Text style={ui.note}>저장하지 못한 입력 초안이 있습니다. ({draft.savedAt?.slice(0, 16)})</Text>
      <Button label="입력 초안 복원" secondary disabled={busy} onPress={() => {
        setForm({ ...initialForm(), ...draft.form }); setRevision(draft.revision || 0); setDirty(true); setDraft(null);
      }} />
    </View>}
    <Choices options={[["voucher", "정적 쿠폰"], ["external", "앱 결제 이벤트"]]} value={form.kind} onChange={(value) => change("kind", value)} disabled={busy || !ready} />
    {form.kind === "external" && <Text style={ui.note}>결제·멤버십 바코드는 원래 앱에서 확인하세요. 여기에는 이벤트 조건과 안내 페이지를 보관하며, 결제나 사용 여부를 자동으로 확인하지 않습니다.</Text>}
    <View style={ui.row}>
      {form.kind === "voucher" && <Button label="바코드 스캔" secondary onPress={openScanner} disabled={busy || !ready} />}
      <Button label="텍스트 분석" secondary onPress={() => setSmart(true)} disabled={busy || !ready} />
      <Button label={processing ? "이미지 인식 중..." : "이미지 보관·인식"} secondary onPress={pickImage} disabled={busy || processing || !ready} />
    </View>
    <Field label="브랜드·상품명 / 이벤트명" value={form.brand} onChangeText={(v) => change("brand", v)} maxLength={200} editable={ready && !busy} />
    {form.kind === "voucher" && <>
      <Text style={ui.label}>바코드 종류</Text>
      <Choices options={BARCODE_TYPES.map((t) => [t, t.toUpperCase()])} value={form.barcodeType} onChange={(v) => change("barcodeType", v)} disabled={busy || !ready} />
      <Field label="바코드 원문 (공백·하이픈도 보존)" value={form.barcodeNumber} onChangeText={(v) => change("barcodeNumber", v)}
        autoCapitalize="none" autoCorrect={false} maxLength={4096} multiline={form.barcodeType === "qr"} editable={ready && !busy} />
      <BarcodeRenderer value={form.barcodeNumber} type={form.barcodeType} height={75} />
    </>}
    {form.kind === "external" && <>
      <Text style={ui.label}>제공사</Text>
      <Choices options={Object.entries(PROVIDERS).map(([key, p]) => [key, p.label])} value={form.provider}
        onChange={(provider) => changeFields({ provider, sourceUrl: PROVIDERS[provider].url })} disabled={busy || !ready} />
    </>}
    <Field label="만료일 (YYYY-MM-DD)" value={form.expiryDay} onChangeText={(v) => change("expiryDay", v)} placeholder="2026-12-31" maxLength={10} editable={ready && !busy} />
    <Text style={remaining !== null && remaining < 0 ? ui.error : ui.note}>{remaining === null ? "유효한 날짜를 입력해 주세요." : remaining < 0 ? "이미 만료된 쿠폰입니다. 보관 목적으로 저장할 수 있습니다." : remaining === 0 ? "오늘 만료" : `D-${remaining}`}</Text>
    <View style={ui.row}>{[7, 30, 90, 365].map((days) => <Button key={days} label={`+${days}일`} secondary disabled={busy || !ready}
      onPress={() => { const d = new Date(); d.setDate(d.getDate() + days); change("expiryDay", toDay(d)); }} />)}</View>
    <Field label="이용 조건·메모" value={form.conditions} onChangeText={(v) => change("conditions", v)} multiline maxLength={5000} editable={ready && !busy} />
    <Field label="공식 안내 페이지 (https)" value={form.sourceUrl} onChangeText={(v) => change("sourceUrl", v)} autoCapitalize="none" autoCorrect={false} editable={ready && !busy} />
    {preview && <View style={ui.card}><Image source={{ uri: preview }} resizeMode="contain" style={{ height: 300, width: "100%" }} /><Text style={ui.note}>선택한 원본은 이 기기에 보관됐습니다. 저장 후 클라우드 업로드 결과를 확인해 주세요.</Text>
      <Button label="첨부 해제 (보관된 원본 유지)" secondary disabled={busy} onPress={() => change("image", null)} /></View>}
    {!!form.image && !preview && <Text style={ui.note}>원본 미리보기를 불러오지 못했습니다. 첨부 참조는 유지됩니다.</Text>}
    <Button label={busy ? "저장 중..." : id ? "변경 저장" : "등록하기"} onPress={save} disabled={busy || processing || !ready} />
    <Text style={ui.note}>미완성 입력은 계정별로 이 기기에 임시 저장됩니다. 기기 분실·앱 삭제에 대비하려면 보관·복원에서 JSON 백업을 외부에 저장해 주세요.</Text>
    <Modal visible={camera} onRequestClose={() => setCamera(false)}>
      <View style={{ flex: 1, backgroundColor: "black" }}>
        {camera && <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }} onBarcodeScanned={scan} />}
        <View style={{ padding: 40 }}><Button label="스캔 닫기" onPress={() => setCamera(false)} /></View>
      </View>
    </Modal>
    <Modal visible={smart} transparent animationType="fade" onRequestClose={() => setSmart(false)}>
      <View style={{ flex: 1, backgroundColor: "#0008", justifyContent: "center", padding: 20 }}>
        <View style={ui.card}><Text style={ui.heading}>쿠폰 텍스트 분석</Text>
          <Text style={ui.note}>인식 결과를 확인하세요. OCR은 틀릴 수 있으므로 바코드·날짜는 원본과 대조해 주세요.</Text>
          <Field label="쿠폰 메시지·인식된 텍스트" value={text} onChangeText={setText} multiline />
          <Button label="분석해 입력란에 적용" onPress={applyText} /><Button label="닫기" secondary onPress={() => setSmart(false)} />
        </View>
      </View>
    </Modal>
  </Page>;
}
