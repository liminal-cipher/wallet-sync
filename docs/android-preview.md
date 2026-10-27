# Android preview

The `preview` EAS profile produces a standalone APK for direct installation on an
Android phone. It does not need a running development server. The application ID
is `com.liminalcipher.walletsync`, with local version code `1`.

## Account and project

Run these commands from the repository directory in a terminal:

```powershell
npx eas-cli@25.2.0 login
npx eas-cli@25.2.0 whoami
npx eas-cli@25.2.0 init
```

Confirm the intended Expo account and project when linking. If an EAS project
already exists, link that project. The generated `extra.eas.projectId` in
`app.json` must identify the chosen project; do not invent an ID. These commands
follow the [Expo build setup](https://docs.expo.dev/build/setup/).

## Firebase configuration

In the existing Firebase project's settings, open **General → Your apps** and
select the web app's SDK configuration. Register a web app in that same project
if none exists. WalletSync uses the Firebase JavaScript SDK on Android, so use
the web configuration values. See the
[Firebase configuration guidance](https://firebase.google.com/docs/web/learn-more#config-object).

Populate the six variables in the ignored local `.env` file and in the Expo
project's **preview** environment, using the same Firebase app in both places:

| Firebase field | Environment variable |
| --- | --- |
| `apiKey` | `EXPO_PUBLIC_FIREBASE_API_KEY` |
| `authDomain` | `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `EXPO_PUBLIC_FIREBASE_PROJECT_ID` |
| `storageBucket` | `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `EXPO_PUBLIC_FIREBASE_APP_ID` |

Set the EAS variables in the project's dashboard with sensitive visibility to
avoid displaying their values in routine logs. They are client configuration
and are embedded in the APK; this visibility setting does not make them app
secrets. Never use service account credentials or private keys here. Follow
[EAS environment usage](https://docs.expo.dev/eas/environment-variables/usage/).

The local `.env` file is excluded from the upload. The cloud build therefore
requires its own preview variables. Firebase authentication providers, Firestore
and Storage rules must already support the intended account operations; building
an APK does not deploy those settings or verify backend access.

## Inspect, build and install

```powershell
npm run check:android
npx eas-cli@25.2.0 build:inspect --platform android --profile preview --stage archive --output .git/android-preview/upload-check
npm run build:android:preview
```

Use a new output directory for each archive inspection. Check that it contains
the application source, assets, plugins, scripts and build configuration, with no
environment files, signing material, logs or local working files. `.easignore`
uses an allowlist; add any future required root configuration files deliberately.

The preflight rejects missing, placeholder and malformed Firebase values without
printing them. It checks formats, not whether Firebase accepts the configuration.
`node scripts/check-android-build.cjs --config-only` checks the APK profile without
requiring Firebase values. The cloud build repeats the full check after install.

For a first build without an existing signing key, use EAS-managed Android
credentials. Retain the same application ID and signing key for later updates;
do not generate a replacement key for an existing installation.

After a successful build, open the provided installation link on the Android
phone, download the APK and allow installation from that browser when Android
requests it. This is internal distribution, separate from Google Play publishing.
See [Expo's APK installation instructions](https://docs.expo.dev/build-reference/apk/).

Verify sign-in, coupon creation and restoration, camera scanning, Korean OCR,
notifications and sharing on the phone. JavaScript export checks do not establish
that these native features work on a device.
