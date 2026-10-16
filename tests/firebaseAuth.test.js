describe("Firebase Auth platform persistence", () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock("firebase/auth");
    jest.dontMock("@react-native-async-storage/async-storage");
  });

  test("browser initialisation works without the native persistence export", () => {
    const browserAuth = { platform: "web" };
    const getAuth = jest.fn(() => browserAuth);
    jest.doMock("firebase/auth", () => ({ getAuth }));
    const { createFirebaseAuth } = require("../src/services/firebaseAuth");
    const app = { name: "browser-test" };

    expect(createFirebaseAuth(app)).toBe(browserAuth);
    expect(getAuth).toHaveBeenCalledWith(app);
  });

  test("native initialisation retains AsyncStorage session persistence", () => {
    const storage = { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() };
    const persistence = function NativePersistence() {};
    const nativeAuth = { platform: "native" };
    const initializeAuth = jest.fn(() => nativeAuth);
    const getReactNativePersistence = jest.fn(() => persistence);
    jest.doMock("firebase/auth", () => ({ initializeAuth, getReactNativePersistence }));
    jest.doMock("@react-native-async-storage/async-storage", () => ({
      __esModule: true,
      default: storage,
    }));
    const { createFirebaseAuth } = require("../src/services/firebaseAuth.native");
    const app = { name: "native-test" };

    expect(createFirebaseAuth(app)).toBe(nativeAuth);
    expect(getReactNativePersistence).toHaveBeenCalledWith(storage);
    expect(initializeAuth).toHaveBeenCalledWith(app, { persistence });
  });
});
