import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { encodeCode128B } from "../utils/barcodeEncoder";

export { encodeCode128B };

export default function BarcodeRenderer({
  value = "",
  height = 54,
  moduleWidth = 1.4,
  maxContainerWidth,
  barColor = "#0F172A",
  spaceColor = "#FFFFFF",
  containerStyle,
}) {
  if (!value) {
    return null;
  }

  const { barElements, totalModules } = encodeCode128B(String(value));
  if (barElements.length === 0 || totalModules === 0) {
    return null;
  }

  // Calculate dynamic module width if maxContainerWidth is provided
  let effectiveModuleWidth = moduleWidth;
  if (maxContainerWidth && maxContainerWidth > 0) {
    const availableWidth = maxContainerWidth - 16;
    const fitWidth = availableWidth / totalModules;
    effectiveModuleWidth = Math.min(moduleWidth, Math.max(0.8, fitWidth));
  }

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.barcodeRow, { height }]}>
          {barElements.map((elem, idx) => (
            <View
              key={idx}
              style={{
                width: elem.width * effectiveModuleWidth,
                height: "100%",
                backgroundColor: elem.isBar ? barColor : spaceColor,
              }}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    maxWidth: "100%",
  },
  scrollContent: {
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  barcodeRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
  },
});
