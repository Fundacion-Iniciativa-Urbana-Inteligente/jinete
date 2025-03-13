import { useState, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { ref, uploadString, getDownloadURL, uploadBytes } from "firebase/storage";
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import imageCompression from 'browser-image-compression';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './registroUsuario.css';
import { storage } from '../firebaseConfig'; // Importa storage
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';

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
  // ✅ Regex para validaciones
  const telefonoRegex = /^\+?\d{7,15}$/; // Acepta con o sin +, 7 a 15 números
  const usuarioRegex = /^[a-zA-Z0-9]+$/; // Solo letras y números
  const dniRegex = /^[a-zA-Z0-9]+$/;     // Solo letras y números

  // ✅ Limpieza del teléfono (quita paréntesis, espacios, guiones, etc.)
  const cleanPhoneNumber = (phone) => phone.replace(/[^\d+]/g, '');

  // ✅ Validaciones
  const validateForm = () => {

    if (!usuarioRegex.test(form.usuario)) {
      toast.error("El usuario solo puede contener letras y números.");
      return false;
    }
    if (!dniRegex.test(form.dni)) {
      toast.error("El DNI/Pasaporte solo debe tener letras y números, sin puntos.");
      return false;
    }
    if (!telefonoRegex.test(form.telefono)) {
      toast.error("Número incorrecto. Ej: +549XXXXXXXXXX o 549XXXXXXXXXX");
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
      let telefonoNormalizado = form.telefono.startsWith('+') ? form.telefono : `+${form.telefono}`;
      const idUsuario = `whatsapp:${telefonoNormalizado}`;
  
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
      const response = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/register-user`, {
        idUsuario,
        usuario: form.usuario,
        dni: form.dni,
        telefono: telefonoNormalizado,
        aceptaTerminos: form.aceptaTerminos,
        fotoFrente: fotoFrenteURL,
        fotoDorso: fotoDorsoURL,
        firma: firmaURL,
        saldo: 500,
        validado: false
      });
  
      toast.success("✅ Usuario registrado exitosamente. ¡Tienes $500 de regalo!");
      setTimeout(() => navigate("/"), 2000); // Redirigir luego de 2 segundos
  
    } catch (error) {
      console.error("❌ Error al registrar usuario:", error);
  
      // Mostrar mensaje específico del backend si está disponible
      if (error.response && error.response.data && error.response.data.error) {
        toast.error(`❌ ${error.response.data.error}`);
      } else {
        toast.error("❌ Error al registrar usuario. Intenta nuevamente.");
      }
  
    } finally {
      setIsLoading(false); // Siempre apagar el loading
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

        <label className="form-label">
          Número de Teléfono
          <span className="tooltip-phone" onClick={() => setShowTooltip(!showTooltip)}>?</span>
        </label>
        <PhoneInput
          country={'ar'}
          value={form.telefono}
          onChange={(phone) => setForm({ ...form, telefono: cleanPhoneNumber(phone) })}
          inputProps={{
            name: 'telefono',
            required: true,
            className: 'form-input'
          }}
        />
        {showTooltip && (
          <div className="tooltip-box">
            <strong>¿Cómo ingresar tu número?</strong>
            <ul>
              <li>✅ Se agregará automáticamente el "+" y el código del país.</li>
              <li>✅ Código país + número completo, sin espacios ni guiones.</li>
              <li>❌ No pongas ceros iniciales.</li>
              <li>🇦🇷 Argentina: <b>+5491123456789</b> (con "9").</li>
              <li>🇺🇸 USA: <b>+14155552671</b></li>
              <li>🇪🇸 España: <b>+34612345678</b></li>
            </ul>
          </div>
        )}
        <label className="form-label">Foto DNI Frente</label>
        <input type="file" className="form-input" accept="image/*" onChange={(e) => handleFileChange(e, "fotoFrente")} required />

        <label className="form-label">Foto DNI Dorso</label>
        <input type="file" className="form-input" accept="image/*" onChange={(e) => handleFileChange(e, "fotoDorso")} required />
        <label className="form-label">Firma Manual</label>
        <SignatureCanvas ref={sigCanvas} penColor="black" canvasProps={{ className: "signature-canvas" }} />
        <button type="button" onClick={() => sigCanvas.current?.clear()} className="form-button">Limpiar Firma</button>
        <label className="form-label">
          <input
            type="checkbox"
            className="form-checkbox"
            checked={form.aceptaTerminos}
            onChange={(e) => setForm({ ...form, aceptaTerminos: e.target.checked })}
            required
          />
          Acepto los <a href="/terminos" className="terms-link">Términos</a> y <a href="/politica-de-privacidad" className="terms-link">Política de privacidad</a>
        </label>

        {/* ✅ Botón enviar */}
        <button type="submit" className="form-button">Registrarse</button>

        {/* ✅ Botón volver al mapa */}
        <div className="button-container">
          <button type="button" onClick={() => navigate("/")} className="button">Volver al mapa</button>
        </div>
      </form>
    </div>
  );
}