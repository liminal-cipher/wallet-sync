import { Alert as NativeAlert, Platform } from "react-native";

export const Alert = {
  alert(title, message = "", buttons) {
    if (Platform.OS !== "web") return NativeAlert.alert(title, message, buttons);
    if (!buttons || buttons.length < 2) { window.alert(`${title}\n\n${message}`); buttons?.[0]?.onPress?.(); return; }
    const action = buttons.find((button) => button.style !== "cancel");
    if (window.confirm(`${title}\n\n${message}`)) action?.onPress?.();
    else buttons.find((button) => button.style === "cancel")?.onPress?.();
  },
};
export const confirmAction = (title, message) => new Promise((resolve) => Alert.alert(title, message, [
  { text: "취소", style: "cancel", onPress: () => resolve(false) },
  { text: "확인", onPress: () => resolve(true) },
]));
