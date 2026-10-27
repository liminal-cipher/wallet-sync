const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { configurationErrors, environmentErrors } = require("../scripts/check-android-build.cjs");
const app = require("../app.json");
const eas = require("../eas.json");

// Synthetic format fixtures; these do not identify a Firebase project.
const values = {
  EXPO_PUBLIC_FIREBASE_API_KEY: `AIza${"a".repeat(35)}`,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "format-fixture.firebaseapp.com",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: "format-fixture",
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: "format-fixture.firebasestorage.app",
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  EXPO_PUBLIC_FIREBASE_APP_ID: "1:123456789:web:abcdef0123456789",
};

test("the preview is a standalone installable APK", () => {
  expect(configurationErrors(app, eas)).toEqual([]);
  const development = JSON.parse(JSON.stringify(eas));
  development.build.preview.developmentClient = true;
  expect(configurationErrors(app, development)).not.toEqual([]);
});

test("Firebase format checks accept both supported default bucket suffixes", () => {
  expect(environmentErrors(values)).toEqual([]);
  expect(environmentErrors({ ...values, EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: "format-fixture.appspot.com" })).toEqual([]);
});

test("configuration failures report names without echoing values", () => {
  const errors = environmentErrors({ ...values, EXPO_PUBLIC_FIREBASE_API_KEY: "private-invalid-input" });
  expect(errors.join("\n")).toContain("EXPO_PUBLIC_FIREBASE_API_KEY");
  expect(errors.join("\n")).not.toContain("private-invalid-input");
  expect(environmentErrors({})).toHaveLength(6);
});

test("mismatched Firebase project numbers are rejected", () => {
  expect(environmentErrors({ ...values, EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "987654321" }))
    .toContain("Firebase APP_ID and MESSAGING_SENDER_ID must identify the same project number");
});

test("cloud builds cannot fall back to a local environment file", () => {
  const env = { ...process.env, EAS_BUILD: "true" };
  for (const name of Object.keys(values)) delete env[name];
  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/check-android-build.cjs")], { env, encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("EXPO_PUBLIC_FIREBASE_APP_ID: missing");
});
