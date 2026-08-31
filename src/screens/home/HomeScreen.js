import React, { useState, useCallback } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StatusBar,
  Modal,
} from "react-native";
import { logoutUser } from "../../services/authService";
import {
  fetchCoupons,
  updateCoupon,
  deleteCoupon,
} from "../../services/firestoreService";
import { auth } from "../../services/firebase";
import BarcodeRenderer from "../../components/BarcodeRenderer";
import {
  scheduleCouponExpiryNotification,
  cancelCouponNotifications,
} from "../../services/notificationService";
import { getExpiryInfo } from "../../utils/dateUtils";

export default function HomeScreen() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [filter, setFilter] = useState("active"); // "all", "active", "used"
  const [selectedBarcodeCoupon, setSelectedBarcodeCoupon] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadCoupons();
    }, [])
  );

  const navigation = useNavigation();

  const loadCoupons = async () => {
    try {
      setLoading(true);
      setFetchError(false);
      const data = await fetchCoupons(auth.currentUser?.uid);
      setCoupons(data);
    } catch (error) {
      console.error(error);
      setFetchError(true);
    } finally {
      setLoading(false);
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
    try {
      const nextStatus = !coupon.isUsed;
      await updateCoupon(coupon.id, { isUsed: nextStatus });
      if (nextStatus) {
        // Marked used -> cancel scheduled alerts
        await cancelCouponNotifications(coupon.id);
      } else {
        // Reactivated -> reschedule alerts
        await scheduleCouponExpiryNotification({ ...coupon, isUsed: false });
      }
      loadCoupons();
    } catch (error) {
      Alert.alert("오류", "상태 변경 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = (coupon) => {
    Alert.alert(
      "쿠폰 삭제",
      `'${coupon.brand}' 쿠폰을 정말로 삭제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCoupon(coupon.id);
              await cancelCouponNotifications(coupon.id);
              loadCoupons();
            } catch (error) {
              Alert.alert("오류", "쿠폰 삭제 중 오류가 발생했습니다.");
            }
          },
        },
      ]
    );
  };

  const getFormattedDate = (expiryDate) => {
    if (!expiryDate) return "만료일 없음";
    const d = typeof expiryDate.toDate === "function" ? expiryDate.toDate() : new Date(expiryDate);
    if (isNaN(d.getTime())) return "만료일 없음";
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const filteredCoupons = coupons.filter((item) => {
    if (filter === "active") return !item.isUsed;
    if (filter === "used") return item.isUsed;
    return true;
  });

  const renderCouponCard = ({ item }) => {
    const expiryInfo = getExpiryInfo(item.expiryDate, item.isUsed);
    const formattedDate = getFormattedDate(item.expiryDate);

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
        <TouchableOpacity
          style={styles.barcodeBox}
          activeOpacity={0.8}
          onPress={() => setSelectedBarcodeCoupon(item)}
        >
          <BarcodeRenderer
            value={item.barcodeNumber}
            height={44}
            maxContainerWidth={280}
          />
          <Text style={styles.barcodeNumber}>{item.barcodeNumber}</Text>
          <Text style={styles.barcodeTapHint}>터치하여 바코드 크게 보기</Text>
        </TouchableOpacity>

        <Text style={styles.expiryText}>만료일: {formattedDate}</Text>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              item.isUsed ? styles.reactivateButton : styles.useButton,
            ]}
            onPress={() => handleToggleUsed(item)}
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
      <View style={styles.tabContainer}>
        {[
          { key: "active", label: "사용 가능" },
          { key: "used", label: "사용 완료" },
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
      </View>

      {/* Coupon List / Loading / Error State */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : fetchError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>목록을 불러올 수 없습니다</Text>
          <Text style={styles.errorSubtitle}>
            네트워크 연결을 확인하거나 잠시 후 다시 시도해 주세요.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadCoupons}>
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
        onRequestClose={() => setSelectedBarcodeCoupon(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalBrand}>
              {selectedBarcodeCoupon?.brand}
            </Text>
            <Text style={styles.modalHint}>
              결제 시 아래 바코드를 리더기에 스캔해 주세요.
            </Text>

            <View style={styles.modalBarcodeContainer}>
              <BarcodeRenderer
                value={selectedBarcodeCoupon?.barcodeNumber || ""}
                height={88}
                maxContainerWidth={320}
              />
              <Text style={styles.modalBarcodeNumber}>
                {selectedBarcodeCoupon?.barcodeNumber}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setSelectedBarcodeCoupon(null)}
            >
              <Text style={styles.modalCloseButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
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
