
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  "projectId": "kloqo-clinic-multi-33968-4c50b",
  "private_key_id": "d77fc5470a3b7b0928d14616843d53ccaeb94456",
  "client_email": "firebase-adminsdk-fbsvc@kloqo-clinic-multi-33968-4c50b.iam.gserviceaccount.com",
  "client_id": "111094760580749718922",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40kloqo-clinic-multi-33968-4c50b.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com",
  "appId": "1:111094760580749718922:web:a6230f81fa864f165e378c",
  "storageBucket": "kloqo-clinic-multi-33968-4c50b.appspot.com",
  "apiKey": "AIzaSyCVCi_yT4w_tLg-WQSMRiB3oMbbd4x78G8",
  "authDomain": "kloqo-clinic-multi-33968-4c50b.firebaseapp.com",
  "messagingSenderId": "111094760580749718922"
};


const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };

