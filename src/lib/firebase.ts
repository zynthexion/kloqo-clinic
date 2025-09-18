
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  "projectId": "studio-3880243108-2ecd3",
  "appId": "1:275898294994:web:07654136f10a2f4eb5430b",
  "storageBucket": "studio-3880243108-2ecd3.firebasestorage.app",
  "apiKey": "AIzaSyB-LOw8IPLoZiw1wji2usGodsvKNltkBHY",
  "authDomain": "studio-3880243108-2ecd3.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "275898294994"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);

export { app, db, storage };
