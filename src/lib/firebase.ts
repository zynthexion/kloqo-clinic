
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

// This is the correct configuration for your project.
const firebaseConfig = {
  apiKey: "AIzaSyDFki6NQ82GGRMR53BJ63Kkl0Y96sLbMH0",
  authDomain: "kloqo-clinic-multi-33968-4c50b.firebaseapp.com",
  projectId: "kloqo-clinic-multi-33968-4c50b",
  storageBucket: "kloqo-clinic-multi-33968-4c50b.appspot.com",
  messagingSenderId: "932946841357",
  appId: "1:932946841357:web:80bf70d8a57635275f939e",
  measurementId: "G-8L9Y19E0J3"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };
