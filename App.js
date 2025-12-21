import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { auth, db } from "./src/services/firebase";

export default function App() {
  // Test if Firebase is initialized
  console.log("Firebase Auth:", auth);
  console.log("Firebase Firestore:", db);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>WalletSync</Text>
      <Text>Firebase Connected.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
});
