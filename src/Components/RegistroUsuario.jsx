import { useState, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import { auth } from "../firebaseConfig";
import { getApp } from "firebase/app";
import { uploadBytes } from "firebase/storage"; // 👈 Importar esto también

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
  
      // ⚙️ Firma como base64
      const firmaImagen = sigCanvas.current.getCanvas().toDataURL("image/png"); 
      const firmaStorageRef = ref(storage, `firmas/${form.dni}.png`);
      await uploadString(firmaStorageRef, firmaImagen, "data_url");
      const firmaURL = await getDownloadURL(firmaStorageRef);
      
  
      // ✅ Subir archivos del DNI como File (uploadBytes)
      const fotoFrenteURL = await uploadImage(form.fotoFrente, `dni/${form.dni}_frente.png`);
      const fotoDorsoURL = await uploadImage(form.fotoDorso, `dni/${form.dni}_dorso.png`);
  
      // 📥 Guardar en Firestore
      await addDoc(collection(db, "usuarios"), {
        usuario: form.usuario,
        dni: form.dni,
        telefono: form.telefono,
        fotoFrente: fotoFrenteURL,
        fotoDorso: fotoDorsoURL,
        firma: firmaURL,
        aceptaTerminos: form.aceptaTerminos,
      });
  
      alert("Usuario registrado exitosamente");
  
    } catch (error) {
      console.error("❌ Error al registrar usuario en Firestore", error);
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
    <div className="max-w-lg mx-auto p-6 bg-white shadow-lg rounded-lg">
      <h2 className="text-xl font-bold mb-4">Registro de Usuario</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Usuario</Label>
          <Input type="text" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} required />
        </div>
        <div>
          <Label>Nro DNI</Label>
          <Input type="number" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} required />
        </div>
        <div>
          <Label>Número de Teléfono</Label>
          <Input type="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} required />
        </div>
        <div>
          <Label>Foto DNI Frente</Label>
          <Input type="file" accept="image/*" onChange={(e) => handleFileChange(e, "fotoFrente")} required />
        </div>
        <div>
          <Label>Foto DNI Dorso</Label>
          <Input type="file" accept="image/*" onChange={(e) => handleFileChange(e, "fotoDorso")} required />
        </div>
        <div className="flex items-center">
          <Checkbox checked={form.aceptaTerminos} onChange={(e) => setForm({ ...form, aceptaTerminos: e.target.checked })} required />
          <span className="ml-2">
            Acepto los <a href="/terminos" className="text-blue-500">términos y condiciones</a>
          </span>
        </div>
        <div>
          <Label>Firma Manual</Label>
          <SignatureCanvas ref={sigCanvas} penColor="black" canvasProps={{ className: "border w-full h-40" }} />
          <Button type="button" onClick={() => sigCanvas.current?.clear()} className="mt-2">
            Limpiar Firma
          </Button>
        </div>
        <Button type="submit" className="w-full">Registrarse</Button>
      </form>
    </div>
  );
}
