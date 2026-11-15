import { initializeApp, getApps } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";

// Local development and testing only: `npm run dev:emulator` sets this flag so
// the app talks to the Firebase emulators on this machine instead of the live
// project. It is never set in production.
const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

// Firebase web config is public by design (it is shipped to every browser);
// access is protected by Firestore/Storage security rules, not by this key.
// NEXT_PUBLIC_FIREBASE_* environment variables override these defaults.
const liveConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBPtnXgv2ZGSf80IgDibWYGL3ZLHpqvlbQ",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "dfrfms.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "dfrfms",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "dfrfms.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "27470174420",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:27470174420:web:1730ae676a61f6a6f8c341",
};

const firebaseConfig = useEmulators
  ? { ...liveConfig, projectId: "demo-dfrmms", storageBucket: "demo-dfrmms.appspot.com" }
  : liveConfig;

const alreadyInitialised = getApps().length > 0;
const app = alreadyInitialised ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

if (useEmulators && !alreadyInitialised) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}

// A second Firebase app instance used only by admins to create sign-in
// accounts. Creating a user on the main `auth` would sign the admin out and
// sign in as the new user; doing it on this separate instance avoids that.
export function getAccountCreationAuth() {
  const name = "account-creation";
  const existing = getApps().find((a) => a.name === name);
  if (existing) return getAuth(existing);
  const secondaryAuth = getAuth(initializeApp(firebaseConfig, name));
  if (useEmulators) connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  return secondaryAuth;
}

export default app;
