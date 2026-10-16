import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const createFirebaseAuth = (app) =>
  initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
