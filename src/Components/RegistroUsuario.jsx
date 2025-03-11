import { useState, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import { auth } from "../firebaseConfig";
import { getApp } from "firebase/app";
import { uploadBytes } from "firebase/storage"; // 👈 Importar esto también
import './registroUsuario.css';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';


const app = getApp();
const db = getFirestore(app);
const storage = getStorage(app);


// Definimos los componentes directamente en este archivo
function Button({ children, ...props }) {
  return <button {...props} className="p-2 bg-blue-500 text-white rounded">{children}</button>;
}

function Checkbox(props) {
  return <input type="checkbox" {...props} className="w-4 h-4" />;
}

function Input(props) {
  return <input {...props} className="border p-2 w-full rounded" />;
}

function Label({ children, ...props }) {
  return <label {...props} className="block text-gray-700">{children}</label>;
}

export default function RegistroUsuario() {
  const navigate = useNavigate(); // ✅ CORRECTO: dentro del componente
  const [form, setForm] = useState({
    usuario: "",
    dni: "",
    telefono: "",
    fotoFrente: null,
    fotoDorso: null,
    aceptaTerminos: false,
  });
  const sigCanvas = useRef(null);

  const handleFileChange = (e, tipo) => {
    const file = e.target.files[0];
    if (file) {
      setForm({ ...form, [tipo]: file });
    }
  };

  const uploadImage = async (file, path) => {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file); // ✅ Para archivos tipo File
    return await getDownloadURL(storageRef);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!sigCanvas.current) {
        throw new Error("El canvas de firma no está listo.");
      }
  
      // ⚙️ Subir firma como imagen
      const firmaImagen = sigCanvas.current.getCanvas().toDataURL("image/png"); 
      const firmaStorageRef = ref(storage, `firmas/${form.dni}.png`);
      await uploadString(firmaStorageRef, firmaImagen, "data_url");
      const firmaURL = await getDownloadURL(firmaStorageRef);
  
      // ✅ Subir imágenes del DNI (frente y dorso)
      const fotoFrenteURL = await uploadImage(form.fotoFrente, `dni/${form.dni}_frente.png`);
      const fotoDorsoURL = await uploadImage(form.fotoDorso, `dni/${form.dni}_dorso.png`);
  
      // ✅ Llamar al backend para registrar usuario (NO análisis)
      await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/register-user`, {
        usuario: form.usuario,
        dni: form.dni,
        telefono: form.telefono,
        aceptaTerminos: form.aceptaTerminos,
        fotoFrente: fotoFrenteURL,
        fotoDorso: fotoDorsoURL,
        firma: firmaURL
      });
  
      alert("✅ Usuario registrado exitosamente. El análisis se realizará en segundo plano.");
      navigate("/"); // Redirigir al home o donde desees
  
    } catch (error) {
      console.error("❌ Error al registrar usuario:", error);
      alert("Hubo un error al registrar el usuario. Intenta nuevamente.");
    }
  };
  

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  return (
    <div className="form-container">
      <h2 className="form-title">Registro de Usuario</h2>
      <form onSubmit={handleSubmit}>
        <label className="form-label">Usuario</label>
        <input
          className="form-input"
          type="text"
          value={form.usuario}
          onChange={(e) => setForm({ ...form, usuario: e.target.value })}
          required
        />

        <label className="form-label">Nro DNI</label>
        <input
          className="form-input"
          type="number"
          value={form.dni}
          onChange={(e) => setForm({ ...form, dni: e.target.value })}
          required
        />

        <label className="form-label">Número de Teléfono</label>
        <input
          className="form-input"
          type="tel"
          value={form.telefono}
          onChange={(e) => setForm({ ...form, telefono: e.target.value })}
          required
        />

        <label className="form-label">Foto DNI Frente</label>
        <input
          className="form-input"
          type="file"
          accept="image/*"
          onChange={(e) => handleFileChange(e, "fotoFrente")}
          required
        />

        <label className="form-label">Foto DNI Dorso</label>
        <input
          className="form-input"
          type="file"
          accept="image/*"
          onChange={(e) => handleFileChange(e, "fotoDorso")}
          required
        />

        <label className="form-label">
          <input
            className="form-checkbox"
            type="checkbox"
            checked={form.aceptaTerminos}
            onChange={(e) => setForm({ ...form, aceptaTerminos: e.target.checked })}
            required
          />
          Acepto los <a href="/politica-de-privacidad" className="terms-link">términos y condiciones</a>
        </label>

        <label className="form-label">Firma Manual</label>
        <SignatureCanvas
          ref={sigCanvas}
          penColor="black"
          canvasProps={{ className: "signature-canvas" }}
        />
        <button type="button" onClick={() => sigCanvas.current?.clear()} className="form-button">
          Limpiar Firma
        </button>

        <button type="submit" className="form-button">Registrarse</button>

        <div className="button-container">
          <button className="button" onClick={() => navigate("/")}>Volver al inicio</button>
        </div>
      </form>
    </div>
  );
}
