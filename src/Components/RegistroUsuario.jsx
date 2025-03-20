import { useState, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { ref, uploadString, getDownloadURL, uploadBytes } from "firebase/storage";
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import imageCompression from 'browser-image-compression';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './RegistroUsuario.css';
import { storage } from '../firebaseConfig';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { motion } from "framer-motion";

export default function RegistroUsuario() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const sigCanvas = useRef(null);

  const [form, setForm] = useState({
    usuario: "",
    dni: "",
    telefono: "",
    fotoFrente: null,
    fotoDorso: null,
    aceptaTerminos: false,
  });

  // ✅ Validaciones
  const validateForm = () => {
    if (!form.usuario.trim()) {
      toast.error("El usuario solo puede contener letras y números.");
      return false;
    }
    if (!form.dni.trim()) {
      toast.error("El DNI/Pasaporte solo debe tener letras y números, sin puntos.");
      return false;
    }
    if (!form.telefono) {
      toast.error("Número de teléfono inválido o incompleto.");
      return false;
    }
    if (!form.fotoFrente || !form.fotoDorso) {
      toast.error("Debes subir las imágenes del DNI (frente y dorso).");
      return false;
    }
    return true;
  };

  // ✅ Subida y compresión de imágenes
  const handleFileChange = async (e, tipo) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("La imagen no debe superar los 5MB.");
        return;
      }
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);
      setForm({ ...form, [tipo]: compressedFile });
    }
  };

  const uploadImage = async (file, path) => {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  // ✅ Enviar formulario
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const idUsuario = `whatsapp:${form.telefono}`; // Número completo y limpio

      // Verificar duplicado
      const { data: usuarioExistente } = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/check-user`, {
        params: { idUsuario }
      });

      if (usuarioExistente.exists) {
        toast.error("⚠️ Este número de teléfono ya está registrado.");
        setIsLoading(false);
        return;
      }

      // Subir firma y fotos en paralelo
      const firmaImagen = sigCanvas.current.getCanvas().toDataURL("image/png");
      const uploads = [
        uploadString(ref(storage, `firmas/${form.dni}.png`), firmaImagen, "data_url").then(() =>
          getDownloadURL(ref(storage, `firmas/${form.dni}.png`))
        ),
        uploadImage(form.fotoFrente, `dni/${form.dni}_frente.png`),
        uploadImage(form.fotoDorso, `dni/${form.dni}_dorso.png`)
      ];

      const [firmaURL, fotoFrenteURL, fotoDorsoURL] = await Promise.all(uploads);

      // Registrar usuario
      await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/register-user`, {
        idUsuario,
        usuario: form.usuario,
        dni: form.dni,
        telefono: form.telefono,
        aceptaTerminos: form.aceptaTerminos,
        fotoFrente: fotoFrenteURL,
        fotoDorso: fotoDorsoURL,
        firma: firmaURL,
        saldo: 500,
        validado: false
      });

      toast.success("✅ Usuario registrado exitosamente. ¡Tienes $500 de regalo!");
      setTimeout(() => navigate("/"), 2000);

    } catch (error) {
      console.error("❌ Error al registrar usuario:", error);
      toast.error("❌ Error al registrar usuario. Intenta nuevamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const IsLoading = () => <div className="loading">Cargando, por favor espera...</div>;

  return (
    <div className="form-container">
      <ToastContainer />
      {isLoading && <IsLoading />}

      <h2 className="form-title">Registro de Usuario</h2>
      <form onSubmit={handleSubmit}>
        <label className="form-label">Usuario</label>
        <input type="text" className="form-input" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} required />

        <label className="form-label">DNI / Pasaporte</label>
        <input type="text" className="form-input" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} required />

        <label className="form-label">Número de Teléfono</label>
        <PhoneInput
          placeholder="Ingresa tu número de teléfono"
          value={form.telefono}
          onChange={(value) => setForm({ ...form, telefono: value })}
          defaultCountry="AR"
          international
          countryCallingCodeEditable={false}
        />

        <label className="form-label">Foto DNI Frente</label>
        <input type="file" className="form-input" accept="image/*" onChange={(e) => handleFileChange(e, "fotoFrente")} required />

        <label className="form-label">Foto DNI Dorso</label>
        <input type="file" className="form-input" accept="image/*" onChange={(e) => handleFileChange(e, "fotoDorso")} required />

        <label className="form-label">Firma Manual</label>
        <SignatureCanvas ref={sigCanvas} penColor="black" canvasProps={{ className: "signature-canvas" }} />
        <button type="button" onClick={() => sigCanvas.current?.clear()} className="form-button">Limpiar Firma</button>

        <label className="form-label">
          <input type="checkbox" className="form-checkbox" checked={form.aceptaTerminos} onChange={(e) => setForm({ ...form, aceptaTerminos: e.target.checked })} required />
          Acepto los <a href="/terminos" className="terms-link">Términos</a> y <a href="/politica-de-privacidad" className="terms-link">Política de privacidad</a>
        </label>

        <button type="submit" className="form-button">Registrarse</button>
        <motion.button
                  onClick={() => navigate("/")}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  style={{
                    position: "fixed",   // Fijado en la pantalla
                    top: "10px",         // Ajusta la posición vertical
                    left: "10px",        // Ajusta la posición horizontal
                    padding: "4px 50px",
                    backgroundColor: "black",
                    color: "white",
                    border: "2px solid white",
                    borderRadius: "0px",
                    cursor: "pointer",
                    fontSize: "18px",
                    fontWeight: "bold",
                    marginBottom: "10px",
                    zIndex: 1000,       // Asegura que esté por encima de otros elementos
                  }}
                >
                  ← Volver al inicio
                </motion.button>

        <button type="button" onClick={() => navigate("/eliminar-cuenta")} className="button-normal">
          Eliminar cuenta
        </button>

      </form>
    </div>
  );
}
