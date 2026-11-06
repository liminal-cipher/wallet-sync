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

## Backend setup

The root `firebase.json` configures the email/password provider used by the app
and the existing Firestore rules. Review the target project before applying
either configuration. For the current project:

```powershell
npx --yes --package=firebase-tools@15.34.0 -- firebase deploy --only auth --project wallet-sync-liminal
```

This enables email/password sign-in through the
[Firebase CLI authentication configuration](https://firebase.google.com/docs/auth/configure-providers-cli).
It does not create an application user. Verify the enabled provider after
deployment; configuration in the repository alone does not enable sign-in.

The configuration targets the `(default)` database in `asia-northeast3` (Seoul),
using Standard edition and Native mode. Before creating it in another project,
review the configured region:
[Firestore database locations cannot be changed after creation](https://firebase.google.com/docs/firestore/locations).
Then apply the rules to that same project:

```powershell
npx --yes --package=firebase-tools@15.34.0 -- firebase deploy --only firestore:rules --project wallet-sync-liminal
```

Photo storage is a separate setup decision. The SDK's `storageBucket` value does
not establish that a bucket exists or accepts uploads. Firebase Storage requires
the [Blaze plan](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024),
an actual bucket and the supplied `storage.rules`. Android Drive storage uses
Google user consent and an app-created folder instead of Firebase Storage.
The root configuration does not deploy Storage resources;
`firebase.emulator.json` continues to configure both emulators for local tests.

## Android Drive connection

Enable the Google Drive API in the same Google Cloud project used for the OAuth
registration. Configure the consent screen and, while testing, include both
Google accounts as test users. Register an **Android** OAuth client with
`com.liminalcipher.walletsync` and the SHA-1 fingerprint of the existing EAS
signing certificate. Keep its public client ID in
`expo.extra.googleDriveAndroidClientId` in `app.json` for configuration checks.
Google's native [AuthorizationClient](https://developer.android.com/identity/authorization)
identifies the installed app through its package and signature; the ID is not a
client secret and is not passed as a web OAuth client ID.

The local `modules/wallet-drive-auth` Expo module requests only `drive.file`.
It needs a rebuilt Android APK and is unavailable in Expo Go, iOS and web.
Service account keys and custom URI schemes are not used.

After installation, sign in to WalletSync and open the intended personal or
shared wallet. Under **보관·복원·알림 → Drive 연결·원본 보관·백업**, connect
your Google account. For a shared wallet, the wallet owner creates the storage
folder and opens it in Drive to grant the other Google account editor access.
The other person connects their own Google account and chooses **공유·보관 폴더
접근 확인**. Use **이 기기의 미보관 원본 업로드** on the phone holding existing
originals. Confirm that the other phone can open a newly uploaded image, then
save a JSON backup with originals and verify its restore preview.

Wallet membership and Google sharing are separate. See
[Shared Wallets](shared-wallets.md) for permission and recovery boundaries.

## Inspect, build and install

```powershell
npm run check:android
npx eas-cli@25.2.0 build:inspect --platform android --profile preview --stage archive --output .git/android-preview/upload-check
npm run build:android:preview
```

Use a new output directory for each archive inspection. Check that it contains
the application source, assets, plugins, local modules, scripts and build configuration, with no
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
