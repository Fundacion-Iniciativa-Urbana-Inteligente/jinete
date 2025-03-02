// main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css"; // Tus estilos globales
import "./firebaseConfig";

// IMPORTS PARA REACT-NOTIFICATIONS-COMPONENT
import { ReactNotifications } from 'react-notifications-component';
import 'react-notifications-component/dist/theme.css';
import 'animate.css/animate.min.css';

// Renderiza la aplicación con el contenedor de notificaciones
createRoot(document.getElementById("root")).render(
  <>
    <ReactNotifications />
    <App />
  </>
);
