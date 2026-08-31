import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  StatusBar,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { addCoupon } from "../../services/firestoreService";
import { auth } from "../../services/firebase";
import { scheduleCouponExpiryNotification } from "../../services/notificationService";

export default function AddCouponScreen({ navigation }) {
  const [brand, setBrand] = useState("");
  const [barcodeNumber, setBarcodeNumber] = useState("");

  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    d.setHours(23, 59, 59, 999);
    return d;
  });

  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [pickerYear, setPickerYear] = useState(expiryDate.getFullYear());
  const [pickerMonth, setPickerMonth] = useState(expiryDate.getMonth() + 1);
  const [pickerDay, setPickerDay] = useState(expiryDate.getDate());

  // Camera Barcode Scanner State
  const [isCameraVisible, setIsCameraVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const setPresetDays = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 59, 999);
    setExpiryDate(d);
    setPickerYear(d.getFullYear());
    setPickerMonth(d.getMonth() + 1);
    setPickerDay(d.getDate());
  };

  const openPickerModal = () => {
    setPickerYear(expiryDate.getFullYear());
    setPickerMonth(expiryDate.getMonth() + 1);
    setPickerDay(expiryDate.getDate());
    setIsDatePickerVisible(true);
  };

  const confirmCustomDate = () => {
    const y = parseInt(pickerYear, 10);
    const m = parseInt(pickerMonth, 10);
    const d = parseInt(pickerDay, 10);

    const currentYear = new Date().getFullYear();

    if (isNaN(y) || isNaN(m) || isNaN(d)) {
      Alert.alert("입력 오류", "날짜 숫자를 모두 입력해 주세요.");
      return;
    }

    if (y < currentYear || y > currentYear + 20) {
      Alert.alert("입력 오류", `연도는 ${currentYear}년부터 ${currentYear + 20}년 사이로 입력해 주세요.`);
      return;
    }

    if (m < 1 || m > 12) {
      Alert.alert("입력 오류", "월은 1월부터 12월 사이로 입력해 주세요.");
      return;
    }

    const daysInMonth = new Date(y, m, 0).getDate();
    if (d < 1 || d > daysInMonth) {
      Alert.alert("입력 오류", `${m}월은 1일부터 ${daysInMonth}일까지 입력 가능합니다.`);
      return;
    }

    const customDate = new Date(y, m - 1, d, 23, 59, 59, 999);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (customDate < today) {
      Alert.alert("유효기간 확인", "오늘 이후의 날짜를 선택해 주세요.");
      return;
    }

    setExpiryDate(customDate);
    setIsDatePickerVisible(false);
  };

  const handleOpenScanner = async () => {
    if (Platform.OS === "web") {
      Alert.alert("안내", "웹 브라우저에서는 바코드 카메라 스캔을 지원하지 않습니다. 직접 번호를 입력해 주세요.");
      return;
    }

    if (!cameraPermission?.granted) {
      const permissionResponse = await requestCameraPermission();
      if (!permissionResponse.granted) {
        Alert.alert("권한 필요", "바코드 스캔을 위해 카메라 접근 권한이 필요합니다.");
        return;
      }
    }

    setScanned(false);
    setIsCameraVisible(true);
  };

  const handleBarcodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setIsCameraVisible(false);

    if (data) {
      const cleanData = String(data).replace(/[\s-]/g, "").trim();
      setBarcodeNumber(cleanData);
      Alert.alert("바코드 인식 완료", `바코드 번호: ${cleanData}`);
    }
  };

  const handlePickImage = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("권한 필요", "사진을 선택하기 위해 갤러리 접근 권한이 필요합니다.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        Alert.alert(
          "이미지 선택 완료",
          "쿠폰 이미지를 불러왔습니다. 바코드 번호와 브랜드를 확인해 주세요."
        );
      }
    } catch (err) {
      console.error("Image pick error:", err);
      Alert.alert("오류", "이미지를 불러오는 중 문제가 발생했습니다.");
    }
  };

  const handleSave = async () => {
    const trimmedBrand = brand.trim();
    const cleanBarcode = barcodeNumber.replace(/[\s-]/g, "").trim();

    if (!trimmedBrand) {
      Alert.alert("입력 오류", "브랜드명 또는 상품명을 입력해 주세요.");
      return;
    }
    if (!cleanBarcode) {
      Alert.alert("입력 오류", "바코드 번호를 입력해 주세요.");
      return;
    }

    if (!auth.currentUser) {
      Alert.alert("인증 오류", "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expiryDate < today) {
      Alert.alert("유효기간 오류", "만료일은 오늘 또는 그 이후여야 합니다.");
      return;
    }

    const couponData = {
      brand: trimmedBrand,
      barcodeNumber: cleanBarcode,
      expiryDate,
      isUsed: false,
      userId: auth.currentUser.uid,
    };

    try {
      const docRef = await addCoupon(couponData);
      scheduleCouponExpiryNotification({ id: docRef.id, ...couponData });
      navigation.goBack();
    } catch (error) {
      Alert.alert("등록 실패", error.message || "쿠폰 저장 중 오류가 발생했습니다.");
      console.error("Save error:", error);
    }
  };

  const formattedExpiry = `${expiryDate.getFullYear()}년 ${expiryDate.getMonth() + 1}월 ${expiryDate.getDate()}일`;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expClone = new Date(expiryDate);
  expClone.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expClone.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>새 쿠폰 등록</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Quick Input Actions */}
      <View style={styles.quickActionRow}>
        <TouchableOpacity style={styles.quickScanButton} onPress={handleOpenScanner}>
          <Text style={styles.quickScanText}>📷 바코드 카메라 스캔</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickImageButton} onPress={handlePickImage}>
          <Text style={styles.quickImageText}>🖼️ 갤러리 이미지</Text>
        </TouchableOpacity>
      </View>

      {/* Brand Input */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>브랜드명 / 상품명</Text>
        <TextInput
          style={styles.input}
          placeholder="예: 스타벅스, 배스킨라빈스, 올리브영"
          placeholderTextColor="#94A3B8"
          value={brand}
          onChangeText={setBrand}
        />
      </View>

      {/* Barcode Number Input */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>바코드 번호</Text>
        <TextInput
          style={styles.input}
          placeholder="숫자 바코드 번호 (예: 123456789012)"
          placeholderTextColor="#94A3B8"
          value={barcodeNumber}
          onChangeText={setBarcodeNumber}
          keyboardType="numeric"
          maxLength={30}
        />
      </View>

      {/* Expiry Date Section */}
      <View style={styles.formGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>유효기간</Text>
          <Text style={styles.diffDaysText}>
            {diffDays === 0 ? "D-Day (오늘)" : `D-${diffDays}`}
          </Text>
        </View>

        <TouchableOpacity style={styles.dateDisplayBox} onPress={openPickerModal}>
          <View>
            <Text style={styles.dateDisplayLabel}>선택된 유효기간</Text>
            <Text style={styles.dateDisplayText}>{formattedExpiry}</Text>
          </View>
          <Text style={styles.dateChangeButtonText}>변경</Text>
        </TouchableOpacity>

        {/* Quick Presets */}
        <Text style={styles.presetLabel}>빠른 설정</Text>
        <View style={styles.presetsRow}>
          {[
            { label: "+7일", days: 7 },
            { label: "+30일", days: 30 },
            { label: "+90일", days: 90 },
            { label: "+1년", days: 365 },
          ].map((preset) => (
            <TouchableOpacity
              key={preset.days}
              style={styles.presetChip}
              onPress={() => setPresetDays(preset.days)}
            >
              <Text style={styles.presetChipText}>{preset.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>취소</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>쿠폰 등록하기</Text>
        </TouchableOpacity>
      </View>

      {/* Custom Date Picker Modal */}
      <Modal
        visible={isDatePickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>유효기간 직접 입력</Text>
            <Text style={styles.modalSubtitle}>연도, 월, 일을 입력해 주세요.</Text>

            <View style={styles.dateInputRow}>
              <View style={styles.dateInputGroup}>
                <Text style={styles.dateInputSubLabel}>년 (YYYY)</Text>
                <TextInput
                  style={styles.dateNumericInput}
                  value={String(pickerYear)}
                  onChangeText={(val) => setPickerYear(val.replace(/[^0-9]/g, ""))}
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>
              <View style={styles.dateInputGroup}>
                <Text style={styles.dateInputSubLabel}>월 (MM)</Text>
                <TextInput
                  style={styles.dateNumericInput}
                  value={String(pickerMonth)}
                  onChangeText={(val) => setPickerMonth(val.replace(/[^0-9]/g, ""))}
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
              <View style={styles.dateInputGroup}>
                <Text style={styles.dateInputSubLabel}>일 (DD)</Text>
                <TextInput
                  style={styles.dateNumericInput}
                  value={String(pickerDay)}
                  onChangeText={(val) => setPickerDay(val.replace(/[^0-9]/g, ""))}
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setIsDatePickerVisible(false)}
              >
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmCustomDate}
              >
                <Text style={styles.modalConfirmText}>적용</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Camera Barcode Scanner Modal */}
      <Modal
        visible={isCameraVisible}
        animationType="slide"
        onRequestClose={() => setIsCameraVisible(false)}
      >
        <View style={styles.cameraContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: [
                "code128",
                "code39",
                "ean13",
                "ean8",
                "qr",
                "upc_a",
                "upc_e",
              ],
            }}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          />
          <View style={styles.cameraOverlay}>
            <View style={styles.scannerTargetBox} />
            <Text style={styles.scannerInstruction}>
              네모 상자 안에 바코드를 맞춰 주세요.
            </Text>
            <TouchableOpacity
              style={styles.cameraCloseButton}
              onPress={() => setIsCameraVisible(false)}
            >
              <Text style={styles.cameraCloseText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  contentContainer: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#EEF2FF",
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6366F1",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  headerSpacer: {
    width: 50,
  },
  quickActionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 22,
  },
  quickScanButton: {
    flex: 1,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  quickScanText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4F46E5",
  },
  quickImageButton: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  quickImageText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  formGroup: {
    marginBottom: 22,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  diffDaysText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6366F1",
  },
  input: {
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    color: "#0F172A",
  },
  dateDisplayBox: {
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateDisplayLabel: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 2,
  },
  dateDisplayText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  dateChangeButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6366F1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#EEF2FF",
  },
  presetLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 12,
    marginBottom: 8,
  },
  presetsRow: {
    flexDirection: "row",
    gap: 8,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  saveButton: {
    flex: 2,
    backgroundColor: "#6366F1",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  cancelButtonText: {
    color: "#64748B",
    fontSize: 15,
    fontWeight: "700",
  },
  saveButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: "#FFF",
    width: "100%",
    borderRadius: 16,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 18,
  },
  dateInputRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  dateInputGroup: {
    flex: 1,
  },
  dateInputSubLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 4,
  },
  dateNumericInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#6366F1",
    alignItems: "center",
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  scannerTargetBox: {
    width: 280,
    height: 180,
    borderWidth: 2,
    borderColor: "#6366F1",
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  scannerInstruction: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 20,
    textAlign: "center",
  },
  cameraCloseButton: {
    marginTop: 40,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  cameraCloseText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
