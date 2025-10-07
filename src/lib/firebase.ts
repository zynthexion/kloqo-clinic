
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCVCi_yT4w_tLg-WQSMRiB3oMbbd4x78G8",
    authDomain: "kloqo-clinic-multi-33968-4c50b.firebaseapp.com",
    projectId: "kloqo-clinic-multi-33968-4c50b",
    storageBucket: "kloqo-clinic-multi-33968-4c50b.appspot.com",
    messagingSenderId: "111094760580749718922",
    appId: "1:111094760580749718922:web:a6230f81fa864f165e378c"
};


const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };
