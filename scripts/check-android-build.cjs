const fs = require("node:fs");
const path = require("node:path");

const patterns = {
  API_KEY: /^AIza[A-Za-z0-9_-]{35}$/,
  AUTH_DOMAIN: /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i,
  PROJECT_ID: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
  STORAGE_BUCKET: /^[a-z0-9][a-z0-9._-]+$/i,
  MESSAGING_SENDER_ID: /^\d+$/,
  APP_ID: /^1:\d+:web:[a-f0-9]+$/i,
};

function environmentErrors(values) {
  const errors = [];
  for (const [key, pattern] of Object.entries(patterns)) {
    const name = `EXPO_PUBLIC_FIREBASE_${key}`;
    const value = values[name]?.trim();
    if (!value || /^(?:your[_-]|replace[_-]|<|\.{3}$)/i.test(value) || !pattern.test(value)) {
      // Report names only; values must never appear in build logs.
      errors.push(`${name}: missing, placeholder or malformed`);
    }
  }
  const appNumber = values.EXPO_PUBLIC_FIREBASE_APP_ID?.split(":")[1];
  if (appNumber && appNumber !== values.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim()) {
    errors.push("Firebase APP_ID and MESSAGING_SENDER_ID must identify the same project number");
  }
  return errors;
}

function configurationErrors(app, eas) {
  const errors = [];
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(app.expo?.android?.package || "")) errors.push("Configure android.package in app.json");
  if (!Number.isSafeInteger(app.expo?.android?.versionCode) || app.expo.android.versionCode < 1) errors.push("Configure a positive android.versionCode");
  const preview = eas.build?.preview;
  if (preview?.android?.buildType !== "apk" || preview.distribution !== "internal" || preview.developmentClient !== false || preview.environment !== "preview") {
    errors.push("Configure a standalone internal APK in the preview build environment");
  }
  return errors;
}

if (require.main === module) {
  try {
    const root = path.resolve(__dirname, "..");
    const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
    const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
    const errors = configurationErrors(app, eas);
    const configOnly = process.argv.includes("--config-only");
    if (!configOnly) {
      if (!process.env.EAS_BUILD) {
        for (const filename of [".env.local", ".env"]) {
          const file = path.join(root, filename);
          if (fs.existsSync(file)) process.loadEnvFile(file);
        }
      }
      errors.push(...environmentErrors(process.env));
    }
    if (errors.length) {
      console.error(`Android preview preflight failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
      process.exitCode = 1;
    } else {
      console.log(`Android preview configuration verified: ${app.expo.android.package} (standalone APK).`);
      if (configOnly) console.log("Firebase values, Expo login and signing credentials were not checked.");
      else console.log("Required Firebase variable formats verified. Backend access and rules still require runtime verification.");
    }
  } catch {
    console.error("Unable to read Android preview configuration or local environment files. Values were not logged.");
    process.exitCode = 1;
  }
}

module.exports = { configurationErrors, environmentErrors };
