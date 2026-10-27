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
    if (current !== null && current !== "0" && current !== "1") throw new Error("복구 사본의 위치를 읽지 못했습니다. 기존 파일은 유지됩니다.");
    const next = current === "0" ? "1" : "0";
    // Write the inactive file first. A failed write keeps the previous pointer.
    await FileSystem.writeAsStringAsync(path(key, next), value);
    if (await FileSystem.readAsStringAsync(path(key, next)) !== value) throw new Error("복구 사본 저장을 확인하지 못했습니다. 이전 사본은 유지됩니다.");
    await AsyncStorage.setItem(pointerKey(key), next);
  },
};
