
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

// This is the correct configuration for your project.
const firebaseConfig = {
  apiKey: "AIzaSyB-bY4wL9pZ6E1c9X_Jv8kY3zR7oWq5rI",
  authDomain: "kloqo-clinic-multi-33968-4c50b.firebaseapp.com",
  projectId: "kloqo-clinic-multi-33968-4c50b",
  storageBucket: "kloqo-clinic-multi-33968-4c50b.appspot.com",
  messagingSenderId: "111094760580",
  appId: "1:111094760580:web:8d29b0142f026a715f939e",
  measurementId: "G-8L9Y19E0J3"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };
