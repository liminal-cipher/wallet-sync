import React from "react";
import { Text, View } from "react-native";
import { ui } from "./WalletUi";
import { catalogueDetailLines } from "../utils/catalogueDisplay";
export default function CatalogueDetails({ record }) {
  return <View>{catalogueDetailLines(record).map((line, i) => <Text key={i} style={ui.note}>{line}</Text>)}</View>;
}
