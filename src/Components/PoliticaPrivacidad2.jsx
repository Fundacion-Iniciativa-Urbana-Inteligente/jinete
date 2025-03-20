import React from "react";
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 bg-white text-gray-800">
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => navigate("/registro")}
          className="bg-blue-600 text-white py-2 px-4 rounded-lg shadow hover:bg-blue-700 transition"
        >
          Volver al Registro
        </button>
      </div>
      <h1 className="text-3xl font-bold text-center mb-6">Política de Privacidad</h1>
      <p className="text-center text-sm text-gray-600">Última actualización: 11 de marzo de 2025</p>

      <p className="mt-4">
        Bienvenido a <strong>Jinete.ar</strong>, una aplicación de alquiler de bicicletas inteligentes operada por la
        <strong> Fundación Iniciativa Urbana Inteligente (FIUI)</strong>. Nos comprometemos a proteger la privacidad de nuestros
        usuarios y cumplir con todas las leyes aplicables.
      </p>

      <h2 className="text-2xl font-semibold mt-6">Uso específico de WhatsApp Business</h2>
      <p className="mt-2">
        Jinete.ar utiliza WhatsApp Business API exclusivamente para brindar soporte operativo, información sobre viajes y asistencia técnica relacionada con el uso del servicio. Al proporcionarnos tu número, aceptas explícitamente recibir estos mensajes operativos. No enviamos mensajes publicitarios ni comunicaciones no solicitadas.
      </p>

      <h2 className="text-2xl font-semibold mt-6">Datos recolectados</h2>
      <ul className="list-disc list-inside mt-2">
        <li>Datos personales (nombre, apellido, correo electrónico, teléfono, documento de identidad).</li>
        <li>Ubicación en tiempo real.</li>
        <li>Información de pagos (procesada por MercadoPago).</li>
        <li>Historial de uso.</li>
        <li>Datos del dispositivo.</li>
        <li>Imágenes y documentos para verificación de identidad.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">Finalidad del uso de datos</h2>
      <ul className="list-disc list-inside mt-2">
        <li>Gestionar cuenta y validar identidad.</li>
        <li>Prestar y mejorar el servicio.</li>
        <li>Procesos de identificación (OCR, reconocimiento facial).</li>
        <li>Gestión de pagos y cobros.</li>
        <li>Monitoreo del uso del sistema.</li>
        <li>Cumplimiento de obligaciones legales.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">Compartición de datos</h2>
      <p className="mt-2">Compartimos datos únicamente con:</p>
      <ul className="list-disc list-inside mt-2">
        <li>Proveedores tecnológicos (Twilio, MercadoPago, Jimi IoT, Firebase).</li>
        <li>Autoridades legales cuando lo requieran.</li>
        <li>Compañías aseguradoras.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">Seguridad de los datos</h2>
      <p className="mt-2">Protegemos tus datos con:</p>
      <ul className="list-disc list-inside mt-2">
        <li>Cifrado en tránsito y reposo.</li>
        <li>Acceso restringido.</li>
        <li>Monitoreo constante.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">Tus derechos</h2>
      <ul className="list-disc list-inside mt-2">
        <li>Acceso, rectificación o eliminación de tus datos personales.</li>
        <li>Oposición al tratamiento para ciertos fines.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">Contacto</h2>
      <ul className="list-disc list-inside mt-2">
        <li>Email: info@jinete.ar</li>
        <li>WhatsApp: +54 9 376 487 6249</li>
        <li>Dirección: Av Uruguay 2651 Piso 1, Posadas, Misiones, Argentina</li>
      </ul>

      <p className="mt-4">
        Jinete.ar cumple plenamente con la <a href="https://business.whatsapp.com/policy" className="text-blue-600 underline">Política empresarial de WhatsApp</a>.
      </p>
    </div>
  );
};

export default PrivacyPolicy;