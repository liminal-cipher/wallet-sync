import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { logoutUser } from "../../services/authService";

export default function HomeScreen() {
  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.log("Logout error:", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to WalletSync!</Text>
      <Text style={styles.subtitle}>Your coupons will appear here</Text>

      <TouchableOpacity style={styles.button} onPress={handleLogout}>
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#4A90E2",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 30,
  },
  button: {
    backgroundColor: "#D0021B",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    minWidth: 150,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },
});
