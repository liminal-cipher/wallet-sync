import React, { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
const icons = {
  starbucks: require("../../assets/brands/starbucks.png"), compose: require("../../assets/brands/compose.png"),
  mega: require("../../assets/brands/mega.png"), daiso: require("../../assets/brands/daiso.png"),
  "paul-bassett": require("../../assets/brands/paul-bassett.png"), hollys: require("../../assets/brands/hollys.gif"),
  mammoth: require("../../assets/brands/mammoth.png"), ediya: require("../../assets/brands/ediya.gif"),
  paik: require("../../assets/brands/paik.png"), gongcha: require("../../assets/brands/gongcha.png"),
  "baskin-robbins": require("../../assets/brands/baskin-robbins.png"), "paris-baguette": require("../../assets/brands/paris-baguette.png"),
  "tous-les-jours": require("../../assets/brands/tous-les-jours.png"), dunkin: require("../../assets/brands/dunkin.png"),
};
export default function BrandIcon({ brand, size = 42 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [brand?.iconId]);
  const source = icons[brand?.iconId];
  return <View style={{ width: size, height: size, padding: 4, backgroundColor: "#FFF", borderRadius: 8, alignItems: "center", justifyContent: "center" }}>
    {source && !failed ? <Image accessible={false} source={source} resizeMode="contain" style={{ width: "100%", height: "100%" }} onError={() => setFailed(true)} /> :
      <Text accessible={false} style={{ color: "#475569", fontWeight: "800", fontSize: 15 }}>{brand?.name?.slice(0, 2) || "쿠폰"}</Text>}
  </View>;
}
