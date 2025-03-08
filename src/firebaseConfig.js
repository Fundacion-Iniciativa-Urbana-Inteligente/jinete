// firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";


// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB4tzqkpRG1jK56WHkKLL6QQrf_myG7IaY",
  authDomain: "jinete-ar.firebaseapp.com",
  projectId: "jinete-ar",
  storageBucket: "jinete-ar.appspot.com",
  messagingSenderId: "784654587373",
  appId: "1:784654587373:web:7073fbb416818eb5ed83e4",
  measurementId: "G-BDT2HGW1ED",
};

// Inicialización
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
auth.languageCode = "es"; // Opcional: Configuración de idioma
