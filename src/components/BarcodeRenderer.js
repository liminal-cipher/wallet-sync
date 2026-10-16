import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SvgXml } from "react-native-svg";
import { barcodeSvg } from "../utils/barcodes";
export { encodeCode128B } from "../utils/barcodeEncoder";

export default function BarcodeRenderer({ value = "", type = "code128", height = 70, maxContainerWidth = 300, containerStyle }) {
  const result = useMemo(() => {
    if (!value) return {};
    try {
      const xml = barcodeSvg(value, type);
      const bounds = xml.match(/viewBox="0 0 (\d+) (\d+)"/);
      const ratio = bounds ? Number(bounds[1]) / Number(bounds[2]) : 3;
      const displayHeight = type === "qr" ? Math.max(160, height) : height;
      return { xml, height: displayHeight, width: Math.max(displayHeight * ratio, type === "qr" ? 160 : 180) };
    } catch (error) { return { error: error.message }; }
  }, [value, type, height]);
  if (!value) return null;
  return <View style={[styles.wrapper, containerStyle]}>
    {result.error ? <Text accessibilityRole="alert" style={styles.error}>{result.error}</Text> :
      <ScrollView horizontal contentContainerStyle={styles.scroll} style={{ maxWidth: maxContainerWidth }}>
        <SvgXml xml={result.xml} width={result.width} height={result.height} />
      </ScrollView>}
  </View>;
}
const styles = StyleSheet.create({
  wrapper: { backgroundColor: "white", padding: 8, alignItems: "center", borderRadius: 8 },
  scroll: { alignItems: "center", justifyContent: "center", flexGrow: 1 },
  error: { color: "#BE123C", padding: 8 },
});
