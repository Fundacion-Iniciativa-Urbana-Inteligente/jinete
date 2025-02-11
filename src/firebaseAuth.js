// firebaseAuth.js
import { auth } from "./firebaseConfig";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPopup,
  signInWithPhoneNumber,
  signOut, // Importar signOut aquí
} from "firebase/auth";


// Proveedor de Google
const googleProvider = new GoogleAuthProvider();

// Configurar reCAPTCHA de manera segura
const setupRecaptcha = () => {
  if (!window.recaptchaVerifier) { // Evitar múltiples instancias
    window.recaptchaVerifier = new RecaptchaVerifier(
      "recaptcha-container", // ID del contenedor reCAPTCHA
      {
        size: "invisible",
        callback: () => console.log("reCAPTCHA verificado."),
      },
      auth
    );
  }
};

// Función para iniciar sesión con Google
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log("Autenticado con Google:", result.user);
    return result.user; // Retornar usuario autenticado
  } catch (error) {
    console.error("Error en Google Auth:", error.message);
    throw new Error("Error al iniciar sesión con Google.");
  }
};

// Función para autenticarse con SMS
export const signInWithSMS = async (phoneNumber) => {
  try {
    setupRecaptcha();
    const appVerifier = window.recaptchaVerifier;

    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
    window.confirmationResult = confirmationResult; // Guarda el resultado para verificar el código
    alert("Código enviado a tu teléfono.");
    return true; // Indicar que el envío fue exitoso
  } catch (error) {
    console.error("Error en SMS Auth:", error.message);
    throw new Error("Error al enviar el código SMS.");
  }
};

// Verificar código SMS
export const verifySMSCode = async (code) => {
  try {
    const result = await window.confirmationResult.confirm(code);
    console.log("Autenticado con SMS:", result.user);
    window.recaptchaVerifier = null; // Limpia el reCAPTCHA
    return result.user; // Retornar usuario autenticado
  } catch (error) {
    console.error("Error al verificar código:", error.message);
    throw new Error("Código incorrecto o expirado.");
  }
};

// Exportar la función signOut
export const logout = async () => {
  try {
    await signOut(auth);
    console.log("Sesión cerrada correctamente.");
  } catch (error) {
    console.error("Error al cerrar sesión:", error.message);
    throw new Error("Error al cerrar sesión.");
  }
};