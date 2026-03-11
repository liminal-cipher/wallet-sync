# 💳 WalletSync

A mobile coupon wallet app built with **React Native (Expo)** and **Firebase**. Store, manage, and track your coupons in one place — with authentication and real-time cloud sync.

---

## ✨ Features

- 🔐 **User Authentication** — Sign up and log in with email & password via Firebase Auth
- 🎟️ **Coupon Management** — Add, view, and track coupons with brand, barcode, and expiry date
- 🔄 **Real-time Sync** — Coupons are stored and fetched from Firebase Firestore
- 📱 **Cross-Platform** — Runs on iOS, Android, and Web via Expo
- 🔒 **Persistent Sessions** — Login state is preserved using AsyncStorage

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo ~54) |
| Navigation | React Navigation v7 |
| Backend | Firebase (Auth + Firestore) |
| State Persistence | AsyncStorage |
| Language | JavaScript (React 19) |

---

## 📁 Project Structure

```
wallet-sync/
├── App.js                        # Root component, auth-based navigation
├── src/
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.js    # Email/password login
│   │   │   └── RegisterScreen.js # New account registration
│   │   └── home/
│   │       ├── HomeScreen.js     # Coupon list view
│   │       └── AddCouponScreen.js# Add new coupon form
│   └── services/
│       ├── firebase.js           # Firebase app initialization
│       ├── authService.js        # Auth helpers (login, signup, logout)
│       └── firestoreService.js   # Firestore CRUD operations
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- A [Firebase](https://firebase.google.com/) project with **Authentication** and **Firestore** enabled

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/wallet-sync.git
cd wallet-sync

# Install dependencies
npm install
```

### Firebase Configuration

Create a `.env` file in the project root and add your Firebase credentials:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

> ⚠️ Never commit your `.env` file. Add it to `.gitignore`.

### Run the App

```bash
# Start Expo development server
npm start

# Run on specific platform
npm run android
npm run ios
npm run web
```

---

## 📱 Screens

### Auth Flow
| Screen | Description |
|---|---|
| Login | Sign in with email and password |
| Register | Create a new account |

### App Flow
| Screen | Description |
|---|---|
| Home | View all coupons with brand, barcode, expiry, and status |
| Add Coupon | Add a new coupon to your wallet |

---

## 🔧 Firebase Setup

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Email/Password** authentication under *Authentication > Sign-in method*
4. Create a **Firestore Database** and add a `coupons` collection
5. Copy your Firebase config into the `.env` file as shown above

---

## 📄 License

This project is private. All rights reserved.
