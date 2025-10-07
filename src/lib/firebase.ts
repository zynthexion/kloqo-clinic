
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyChS5xJikU5j_Grtf9p8p2T-r3f3zQY87c",
  authDomain: "kloqo-a01a4.firebaseapp.com",
  projectId: "kloqo-a01a4",
  storageBucket: "kloqo-a01a4.appspot.com",
  messagingSenderId: "542385449793",
  appId: "1:542385449793:web:355d40906a5910b271d492",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };
