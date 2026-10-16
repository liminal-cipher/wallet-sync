import { Linking, Platform } from "react-native";
import { PROVIDERS, safeSourceUrl } from "../utils/couponModel";

export async function openOriginalProvider(coupon) {
  // The published KakaoPay scheme opens the app, not a guaranteed payment screen.
  if (coupon.provider === "kakaoPay" && Platform.OS !== "web") {
    try { await Linking.openURL("kakaopay://"); return; } catch { /* Use the official web fallback. */ }
  }
  const url = safeSourceUrl(coupon.sourceUrl || PROVIDERS[coupon.provider]?.url || "");
  if (!url) throw new Error("수정 화면에서 공식 안내 페이지를 추가해 주세요.");
  await Linking.openURL(url);
}
