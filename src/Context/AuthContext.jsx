import React, { createContext, useState, useEffect } from "react";
import { signInWithGoogle as firebaseSignInWithGoogle, logout as firebaseLogout } from "../firebaseAuth";

// Crear el contexto
export const AuthContext = createContext(); // Exportar AuthContext

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  const signInWithGoogle = async () => {
    try {
      const firebaseUser = await firebaseSignInWithGoogle();
      const userInfo = {
        name: firebaseUser.displayName,
        email: firebaseUser.email,
      };

      setUser(userInfo);
      localStorage.setItem("user", JSON.stringify(userInfo));
      return userInfo;
    } catch (error) {
      console.error("Error en Google Auth:", error.message);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await firebaseLogout();
      setUser(null);
      localStorage.removeItem("user");
    } catch (error) {
      console.error("Error al cerrar sesión:", error.message);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
