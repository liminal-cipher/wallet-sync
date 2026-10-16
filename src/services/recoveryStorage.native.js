import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

const directory = () => `${FileSystem.documentDirectory}recovery/`;
const path = (key, slot) => `${directory()}${encodeURIComponent(key)}.${slot}.json`;
const pointerKey = (key) => `${key}:file-slot`;
export default {
  async getItem(key) {
    const slot = await AsyncStorage.getItem(pointerKey(key));
    if (slot === null) return AsyncStorage.getItem(key); // Read earlier small-value copies.
    if (slot !== "0" && slot !== "1") throw new Error("복구 사본의 위치를 읽지 못했습니다.");
    return FileSystem.readAsStringAsync(path(key, slot));
  },
  async setItem(key, value) {
    await FileSystem.makeDirectoryAsync(directory(), { intermediates: true });
    const current = await AsyncStorage.getItem(pointerKey(key));
    const next = current === "0" ? "1" : "0";
    // Write the inactive file first. A failed write keeps the previous pointer.
    await FileSystem.writeAsStringAsync(path(key, next), value);
    await AsyncStorage.setItem(pointerKey(key), next);
  },
};
