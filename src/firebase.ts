import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore"; // For the Database
import { getAuth, GoogleAuthProvider } from "firebase/auth";           // For User Login

const firebaseConfig = {
  apiKey: "AIzaSyCq2P9SvBe9k2CH2Jc1vqSkQx3e2rXAQT4",
  authDomain: "pdf-easy-dfec4.firebaseapp.com",
  projectId: "pdf-easy-dfec4",
  storageBucket: "pdf-easy-dfec4.firebasestorage.app",
  messagingSenderId: "1067413833318",
  appId: "1:1067413833318:web:9571ef0154b6b373ac0fa7",
  measurementId: "G-WCQ7QJS1WB"
};

// 1. Initialize the connection to the Cloud
const app = initializeApp(firebaseConfig);

// 2. Initialize the specific tools you want to use
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
