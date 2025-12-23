import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { addCoupon } from "../../services/firestoreService";

export default function AddCouponScreen({ navigation }) {
  const [brand, setBrand] = useState("");
  const [barcodeNumber, setBarcodeNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState(
    new Date(new Date().setDate(new Date().getDate() + 1))
  );

  const handleSave = async () => {
    if (!brand) {
      Alert.alert("Error", "Brand is required");
      return;
    }
    if (!barcodeNumber) {
      Alert.alert("Error", "Barcode number is required");
      return;
    }
    if (expiryDate < new Date()) {
      Alert.alert("Error", "Expiry date must be today or later");
      return;
    }

    const couponData = {
      brand,
      barcodeNumber,
      expiryDate,
      isUsed: false,
      // userId: auth.currentUser.uid (later)
    };

    try {
      await addCoupon(couponData);
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", "Failed to save coupon");
      console.log(error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add New Coupon</Text>

      <TextInput
        style={styles.input}
        placeholder="Brand (e.g., Starbucks)"
        value={brand}
        onChangeText={setBrand}
      />

      <TextInput
        style={styles.input}
        placeholder="Barcode Number"
        value={barcodeNumber}
        onChangeText={setBarcodeNumber}
        keyboardType="numeric"
        maxLength={20}
      />

      <Text style={styles.dateLabel}>Expiry Date</Text>
      <TouchableOpacity
        style={styles.dateInput}
        onPress={() => {
          Alert.alert("Date Picker to be added later", [{ text: "OK" }]);
        }}
      >
        <Text style={styles.dateText}>
          Tomorrow ({expiryDate.toLocaleDateString("ko-KR")})
        </Text>
      </TouchableOpacity>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Coupon</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#4A90E2",
    textAlign: "center",
    marginBottom: 30,
  },
  input: {
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  dateLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 5,
  },
  dateInput: {
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    marginBottom: 20,
    alignItems: "center",
  },
  dateText: {
    fontSize: 16,
    color: "#333",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#666",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginRight: 10,
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#4A90E2",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginLeft: 10,
  },
  cancelButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  saveButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },
});
