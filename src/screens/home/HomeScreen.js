import React, { useState, useCallback, useRef } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Modal,
  RefreshControl,
  TextInput,
  Image,
  ScrollView,
} from "react-native";
import { logoutUser } from "../../services/authService";
import {
  fetchCoupons,
  subscribeCoupons,
  updateCoupon,
  deleteCoupon,
} from "../../services/firestoreService";
import { auth } from "../../services/firebase";
import BarcodeRenderer from "../../components/BarcodeRenderer";
import { getExpiryInfo, filterCoupons, toDate } from "../../utils/dateUtils";
import useCalendarClock from "../../hooks/useCalendarClock";
import { readLocal } from "../../services/localRecovery";
import { imageDataUri } from "../../services/imageService";
import { openOriginalProvider } from "../../services/providerLinks";
import { Alert } from "../../utils/feedback";
import { Button, ui } from "../../components/WalletUi";

export default function HomeScreen() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [filter, setFilter] = useState("active"); // "all", "active", "used"
  const [selectedBarcodeId, setSelectedBarcodeId] = useState(null);
  const selectedBarcodeCoupon = coupons.find((coupon) => coupon.id === selectedBarcodeId && !coupon.deletedAt) || null;
  const [search, setSearch] = useState("");
  const [cacheNotice, setCacheNotice] = useState("");
  const [original, setOriginal] = useState(null);
  const [pending, setPending] = useState([]);
  const locks = useRef(new Set());
  const now = useCalendarClock();

  const navigation = useNavigation();

  // Setup real-time listener whenever screen is focused
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setFetchError(false);

      const userId = auth.currentUser?.uid;
      let active = true, received = false;
      readLocal(userId, "snapshots", []).then((copies) => {
        if (active && !received && copies[0]) {
          setCoupons(copies[0].records); setLoading(false);
          setCacheNotice("기기 내 사본을 표시 중입니다. 서버 연결 후 최신 상태로 갱신됩니다.");
        }
      }).catch(() => { if (active) setCacheNotice("기기 내 사본을 읽지 못했습니다."); });
      const unsubscribe = subscribeCoupons(
        userId,
        (data, metadata) => {
          if (!active) return;
          if (metadata?.fromCache && !data.length && !received) {
            setLoading(false); setCacheNotice("서버 연결을 기다리는 중입니다. 보관된 기기 사본을 확인합니다."); return;
          }
          received = true;
          setCoupons(data);
          setCacheNotice(metadata?.fromCache ? "오프라인 사본입니다. 변경하려면 서버 연결이 필요합니다." : "");
          setLoading(false);
          setRefreshing(false);
        },
        (error, details) => {
          if (!active) return;
          if (details?.localRecovery) { setCacheNotice("기기 자동 사본을 저장하지 못했습니다. 파일 백업을 권장합니다."); return; }
          console.error("Subscription error:", error);
          setFetchError(true);
          setLoading(false);
          setRefreshing(false);
        }
      );

      return () => {
        active = false;
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      };
    }, [])
  );

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setFetchError(false);
      const data = await fetchCoupons(auth.currentUser?.uid);
      setCoupons(data);
      setCacheNotice("");
    } catch (error) {
      console.error("Refresh error:", error);
      setFetchError(true);
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.log("Logout error:", error);
    }
  };

  const handleToggleUsed = async (coupon) => {
    if (locks.current.has(coupon.id)) return;
    locks.current.add(coupon.id); setPending([...locks.current]);
    try {
      const nextStatus = !coupon.isUsed;
      await updateCoupon(coupon.id, { isUsed: nextStatus }, coupon.revision || 0);
    } catch (error) {
      Alert.alert("변경 실패", error.message);
    } finally {
      locks.current.delete(coupon.id); setPending([...locks.current]);
    }
  };

  const handleDelete = (coupon) => {
    Alert.alert(
      "휴지통으로 이동",
      `'${coupon.brand}' 쿠폰은 보관·복원 화면에서 다시 복원할 수 있습니다.`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            if (locks.current.has(coupon.id)) return;
            locks.current.add(coupon.id); setPending([...locks.current]);
            try {
              await deleteCoupon(coupon.id, coupon.revision || 0);
            } catch (error) {
              Alert.alert("이동 실패", error.message);
            } finally {
              locks.current.delete(coupon.id); setPending([...locks.current]);
            }
          },
        },
      ]
    );
  };

  const getFormattedDate = (expiryDate) => {
    if (!expiryDate) return "만료일 없음";
    const d = toDate(expiryDate);
    if (!d) return "만료일 없음";
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const filteredCoupons = filterCoupons(coupons, filter, search, now);
  const showOriginal = async (coupon) => {
    try { setOriginal(await imageDataUri(coupon.image)); }
    catch (error) { Alert.alert("원본 불러오기 실패", error.message); }
  };

  const renderCouponCard = ({ item }) => {
    const expiryInfo = getExpiryInfo(item.expiryDay || item.expiryDate, item.isUsed, now);
    const formattedDate = getFormattedDate(item.expiryDay || item.expiryDate);

    return (
      <View
        style={[
          styles.couponCard,
          { borderLeftColor: item.isUsed ? "#94A3B8" : "#6366F1" },
          item.isUsed && styles.usedCard,
        ]}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.brandText, item.isUsed && styles.usedText]}>
            {item.brand}
          </Text>
          <View
            style={[
              styles.badge,
              { backgroundColor: expiryInfo.bg, borderColor: expiryInfo.border },
            ]}
          >
            <Text style={[styles.badgeText, { color: expiryInfo.color }]}>
              {expiryInfo.text}
            </Text>
          </View>
        </View>

        {/* Scannable Barcode Box */}
        {item.kind === "external" ? <View style={ui.card}>
          <Text style={ui.note}>결제·멤버십 바코드는 원래 앱에서 확인하세요.</Text>
          <Text style={ui.note}>{item.conditions}</Text>
          <Button label={item.provider === "kakaoPay" ? "카카오페이 열기" : "공식 안내 열기"} onPress={() => openOriginalProvider(item).catch((e) => Alert.alert("열기 실패", e.message))} />
          <Text style={ui.note}>앱·페이지 열기는 결제 완료 처리가 아닙니다.</Text>
        </View> : <TouchableOpacity
          style={styles.barcodeBox}
          activeOpacity={0.8}
          onPress={() => setSelectedBarcodeId(item.id)}
        >
          <BarcodeRenderer
            value={item.barcodeNumber}
            type={item.barcodeType || "code128"}
            height={44}
            maxContainerWidth={280}
          />
          <Text style={styles.barcodeNumber}>{item.barcodeNumber}</Text>
          <Text style={styles.barcodeTapHint}>터치하여 바코드 크게 보기</Text>
        </TouchableOpacity>}

        <Text style={styles.expiryText}>만료일: {formattedDate}</Text>
        {item.image && !item.image.cloudPath && <Text style={ui.note}>원본은 등록한 기기에 보관돼 있습니다. 수정 후 저장하면 클라우드 보관을 다시 시도합니다.</Text>}
        {item.kind !== "external" && !!item.conditions && <Text style={ui.note}>{item.conditions}</Text>}
        <View style={ui.row}>
          <Button label="수정" secondary disabled={pending.includes(item.id)} onPress={() => navigation.navigate("AddCoupon", { id: item.id })} />
          <Button label="수정 이력" secondary onPress={() => navigation.navigate("CouponHistory", { id: item.id })} />
          {item.image && <Button label="원본 보기" secondary onPress={() => showOriginal(item)} />}
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              item.isUsed ? styles.reactivateButton : styles.useButton,
            ]}
            onPress={() => handleToggleUsed(item)}
            disabled={pending.includes(item.id)}
          >
            <Text
              style={[
                styles.actionButtonText,
                item.isUsed ? styles.reactivateText : styles.useButtonText,
              ]}
            >
              {item.isUsed ? "다시 활성화" : "사용 완료 처리"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item)}
            disabled={pending.includes(item.id)}
          >
            <Text style={styles.deleteButtonText}>삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>WalletSync</Text>
          <Text style={styles.title}>내 쿠폰 지갑</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate("AddCoupon")}
          >
            <Text style={styles.addButtonText}>+ 쿠폰 등록</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={ui.row}>
        <Button label="보관·복원·알림" secondary onPress={() => navigation.navigate("WalletTools")} />
        {!!cacheNotice && <Text style={ui.note}>{cacheNotice}</Text>}
        {fetchError && <Text style={ui.error}>연결이 끊겼습니다. 표시된 사본을 유지합니다.</Text>}
      </View>
      <TextInput accessibilityLabel="브랜드·상품명 검색" placeholder="브랜드·상품명 검색" value={search} onChangeText={setSearch} style={[ui.input, { marginTop: 12 }]} />
      <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={styles.tabContainer}>
        {[
          { key: "active", label: "사용 가능" },
          { key: "used", label: "사용 완료" },
          { key: "soon", label: "7일 내 만료" },
          { key: "expired", label: "만료됨" },
          { key: "all", label: "전체" },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabButton, filter === tab.key && styles.activeTab]}
            onPress={() => setFilter(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                filter === tab.key && styles.activeTabText,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Coupon List / Loading / Error State */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : fetchError && !coupons.length ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>목록을 불러올 수 없습니다</Text>
          <Text style={styles.errorSubtitle}>
            네트워크 연결을 확인하거나 잠시 후 다시 시도해 주세요.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryButtonText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredCoupons}
          keyExtractor={(item) => item.id}
          renderItem={renderCouponCard}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={["#6366F1"]}
              tintColor="#6366F1"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>쿠폰이 없습니다</Text>
              <Text style={styles.emptySubtitle}>
                {filter === "active"
                  ? "사용 가능한 쿠폰이 없습니다.\n상단의 '+ 쿠폰 등록' 버튼을 눌러보세요."
                  : "해당 상태의 쿠폰 내역이 없습니다."}
              </Text>
            </View>
          }
        />
      )}

      {/* Large Barcode Modal */}
      <Modal
        visible={!!selectedBarcodeCoupon}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedBarcodeId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalBrand}>
              {selectedBarcodeCoupon?.brand}
            </Text>
            <Text style={ui.note}>{selectedBarcodeCoupon && getExpiryInfo(selectedBarcodeCoupon.expiryDay || selectedBarcodeCoupon.expiryDate, selectedBarcodeCoupon.isUsed, now).text}</Text>
            <Text style={styles.modalHint}>
              결제 시 아래 바코드를 리더기에 스캔해 주세요.
            </Text>

            <View style={styles.modalBarcodeContainer}>
              <BarcodeRenderer
                value={selectedBarcodeCoupon?.barcodeNumber || ""}
                type={selectedBarcodeCoupon?.barcodeType || "code128"}
                height={88}
                maxContainerWidth={320}
              />
              <Text style={styles.modalBarcodeNumber}>
                {selectedBarcodeCoupon?.barcodeNumber}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setSelectedBarcodeId(null)}
            >
              <Text style={styles.modalCloseButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={!!original} onRequestClose={() => setOriginal(null)}>
        <View style={{ flex: 1, backgroundColor: "white", padding: 25, paddingTop: 50 }}>
          <Button label="원본 닫기" onPress={() => setOriginal(null)} />
          {original && <Image source={{ uri: original }} style={{ flex: 1 }} resizeMode="contain" />}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6366F1",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
  },
  addButton: {
    backgroundColor: "#6366F1",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  logoutButton: {
    backgroundColor: "#F1F5F9",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  logoutButtonText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    padding: 4,
    borderRadius: 14,
    marginBottom: 18,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  activeTabText: {
    color: "#0F172A",
    fontWeight: "700",
  },
  listContainer: {
    paddingBottom: 40,
  },
  couponCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderLeftWidth: 6,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  usedCard: {
    backgroundColor: "#F8FAFC",
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  brandText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    flex: 1,
    marginRight: 10,
  },
  usedText: {
    color: "#64748B",
    textDecorationLine: "line-through",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  barcodeBox: {
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginVertical: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  barcodeNumber: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: 1.5,
    marginTop: 6,
  },
  barcodeTapHint: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  expiryText: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 16,
    fontWeight: "500",
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 14,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  useButton: {
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  useButtonText: {
    color: "#4F46E5",
    fontWeight: "700",
    fontSize: 14,
  },
  reactivateButton: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  reactivateText: {
    color: "#475569",
    fontWeight: "600",
    fontSize: 14,
  },
  deleteButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "#FECDD3",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    color: "#E11D48",
    fontWeight: "700",
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
    paddingHorizontal: 20,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#6366F1",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  retryButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: "#FFF",
    width: "100%",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  modalBrand: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
    textAlign: "center",
  },
  modalHint: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 20,
    textAlign: "center",
  },
  modalBarcodeContainer: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    width: "100%",
    marginBottom: 24,
  },
  modalBarcodeNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 2,
    marginTop: 12,
  },
  modalCloseButton: {
    backgroundColor: "#6366F1",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  modalCloseButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
