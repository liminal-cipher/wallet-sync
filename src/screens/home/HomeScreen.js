import React, { useState, useCallback } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { logoutUser } from "../../services/authService";

import { fetchCoupons } from "../../services/firestoreService";

export default function HomeScreen() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    React.useCallback(() => {
      loadCoupons();
    }, [])
  );

  const navigation = useNavigation();

  const loadCoupons = async () => {
    try {
      const data = await fetchCoupons();
      setCoupons(data);
    } catch (error) {
      console.error(error);
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

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Coupons</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate("AddCoupon")}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={coupons}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.couponCard}>
            <Text style={styles.brandText}>{item.brand}</Text>
            <Text style={styles.barcodeText}>
              Barcode: {item.barcodeNumber}
            </Text>
            <Text style={styles.expiryText}>
              Expires: {item.expiryDate?.toDate().toLocaleDateString()}
            </Text>
            <Text style={styles.statusText}>
              Status: {item.isUsed ? "Used" : "Active"}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No coupons yet. Add one!</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    marginTop: 10,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#4A90E2",
  },
  logoutButton: {
    backgroundColor: "#D0021B",
    padding: 10,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  couponCard: {
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  brandText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  barcodeText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  expiryText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  statusText: {
    fontSize: 14,
    color: "#4A90E2",
    fontWeight: "600",
  },
  emptyText: {
    textAlign: "center",
    color: "#999",
    fontSize: 16,
    marginTop: 50,
  },
  addButton: {
    backgroundColor: "#4A90E2",
    padding: 10,
    borderRadius: 8,
  },
  addButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "bold",
  },
});
