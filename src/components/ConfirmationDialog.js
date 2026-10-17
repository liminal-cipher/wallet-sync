import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, View, Text, StyleSheet } from "react-native";
import { Button, ui } from "./WalletUi";

export function useConfirmation() {
  const [request, setRequest] = useState(null);
  const pending = useRef(null);
  const finish = useCallback((accepted) => {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.(accepted);
  }, []);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  const confirm = useCallback((title, message) => {
    if (pending.current) return Promise.resolve(false);
    return new Promise((resolve) => { pending.current = resolve; setRequest({ title, message }); });
  }, []);
  return { confirm, dialog: { request, onConfirm: () => finish(true), onCancel: () => finish(false) } };
}

export default function ConfirmationDialog({ request, onConfirm, onCancel }) {
  return <Modal visible={!!request} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.overlay}>
      <View accessibilityViewIsModal accessibilityRole="alert" style={[ui.card, styles.dialog]}>
        <Text accessibilityRole="header" style={ui.heading}>{request?.title}</Text>
        <Text style={ui.note}>{request?.message}</Text>
        <View style={ui.row}>
          <Button label="취소" secondary onPress={onCancel} />
          <Button label="확인" onPress={onConfirm} />
        </View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(15,23,42,0.55)" },
  dialog: { width: "100%", maxWidth: 480, backgroundColor: "#fff" },
});
