import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css"; // Tus estilos globales

// Importar la configuración de Firebase
import "./firebaseConfig";

// Renderizar la aplicación principal
createRoot(document.getElementById("root")).render(<App />);
