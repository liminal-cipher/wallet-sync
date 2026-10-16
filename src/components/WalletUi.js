import React from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Page({ title, navigation, children }) {
  return <SafeAreaView style={ui.page}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
    <View style={ui.row}><Button label="뒤로" onPress={() => navigation.goBack()} secondary /><Text accessibilityRole="header" style={ui.title}>{title}</Text></View>
    {children}
  </ScrollView></SafeAreaView>;
}
export function Button({ label, onPress, disabled, secondary, danger }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={[ui.button, secondary && ui.secondary, danger && ui.danger, disabled && { opacity: 0.45 }]}>
    <Text style={[ui.buttonText, secondary && { color: "#4338CA" }]}>{label}</Text>
  </TouchableOpacity>;
}
export function Field({ label, ...props }) {
  return <View style={ui.group}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label}
    placeholderTextColor="#94A3B8" style={[ui.input, props.multiline && { minHeight: 95, textAlignVertical: "top" }]} {...props} /></View>;
}
export function Choices({ options, value, onChange, disabled }) {
  return <View style={ui.row}>{options.map(([key, label]) => <Button key={key} label={label} secondary={value !== key}
    disabled={disabled} onPress={() => onChange(key)} />)}</View>;
}
export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" }, content: { padding: 20, gap: 14, paddingBottom: 45, maxWidth: 760, width: "100%", alignSelf: "center" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, title: { color: "#0F172A", fontSize: 23, fontWeight: "800", flexShrink: 1 },
  card: { padding: 16, borderRadius: 14, backgroundColor: "white", borderColor: "#E2E8F0", borderWidth: 1, gap: 10 },
  group: { gap: 6 }, label: { color: "#334155", fontWeight: "700", fontSize: 15 },
  input: { backgroundColor: "white", borderRadius: 9, borderWidth: 1, borderColor: "#CBD5E1", padding: 13, color: "#0F172A", fontSize: 16 },
  button: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: "#6366F1", borderRadius: 9, alignItems: "center" },
  secondary: { backgroundColor: "#EEF2FF" }, danger: { backgroundColor: "#BE123C" }, buttonText: { color: "white", fontWeight: "700" },
  note: { color: "#64748B", lineHeight: 21 }, error: { color: "#BE123C", lineHeight: 21 }, heading: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
});
