import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const PoliticaPrivacidad = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 bg-white rounded-xl shadow-lg text-gray-800">
      <h1 className="text-3xl font-bold text-center mb-6" style={{ color: "black" }} >📜 Política de Privacidad</h1>
      <p className="text-center text-sm text-gray-600">Última actualización: 19 de marzo de 2025</p>
      <p className="mb-4 text-gray-600">
        En <strong>Jinete.ar</strong>, valoramos tu privacidad y nos comprometemos a proteger tu información personal. 
        Esta Política de Privacidad describe cómo recopilamos, usamos y protegemos tus datos, conforme a la Ley 25.326 
        de Protección de Datos Personales en Argentina y otras normativas aplicables.
      </p>

      {/* 1️⃣ Disposiciones Generales */}
      <h2 className="text-2xl font-semibold mt-6">📌 1. Disposiciones Generales</h2>
      <p className="mt-2">
        Esta Política de Privacidad regula el tratamiento de los datos personales de los usuarios de Jinete.ar, 
        incluyendo su recopilación, uso, almacenamiento y protección.  
        Al utilizar nuestros servicios, aceptas los términos aquí expuestos.
      </p>

      {/* 2️⃣ Marco Normativo */}
      <h2 className="text-2xl font-semibold mt-6">📌 2. Marco Normativo</h2>
      <p className="mt-2">
        Esta política se ajusta a la normativa vigente en Argentina, incluyendo:
      </p>
      <ul className="list-disc pl-6 mt-2">
        <li><strong>Ley 25.326 de Protección de Datos Personales:</strong> Regula el tratamiento de datos personales en Argentina.</li>
        <li><strong>Decreto 1558/2001:</strong> Crea la Dirección Nacional de Protección de Datos Personales (DNPDP).</li>
        <li><strong>Reglamento General de Protección de Datos (GDPR):</strong> Aplicable en caso de usuarios europeos.</li>
      </ul>

      {/* 3️⃣ Datos que recopilamos */}
      <h2 className="text-2xl font-semibold mt-6">📌 3. Datos que Recopilamos</h2>
      <ul className="list-disc pl-6 mt-2">
        <li><strong>Datos de cuenta:</strong> Nombre, DNI, número de teléfono.</li>
        <li><strong>Información de pago:</strong> Transacciones procesadas con Mercado Pago.</li>
        <li><strong>Datos de ubicación:</strong> Ubicación de bicicletas y datos necesarios para el alquiler.</li>
        <li><strong>Registros de interacción:</strong> Chats y solicitudes de soporte en WhatsApp.</li>
      </ul>

      {/* 4️⃣ Uso de los datos */}
      <h2 className="text-2xl font-semibold mt-6">📌 4. ¿Cómo Usamos Tu Información?</h2>
      <ul className="list-disc pl-6 mt-2">
        <li>Autenticación de usuarios y gestión de cuentas.</li>
        <li>Procesamiento de pagos y gestión de saldo.</li>
        <li>Desbloqueo y administración de bicicletas.</li>
        <li>Envío de notificaciones y asistencia por WhatsApp.</li>
      </ul>

      {/* 5️⃣ Compartición de datos */}
      <h2 className="text-2xl font-semibold mt-6">📌 5. Con Quién Compartimos Tu Información</h2>
      <ul className="list-disc pl-6 mt-2">
        <li><strong>Mercado Pago:</strong> Procesamiento de pagos y recargas.</li>
        <li><strong>Twilio:</strong> Envío de mensajes de WhatsApp.</li>
        <li><strong>Firebase:</strong> Almacenamiento y autenticación de usuarios.</li>
        <li><strong>JIMI IoT:</strong> Gestión del desbloqueo de bicicletas.</li>
      </ul>

      {/* 6️⃣ Seguridad */}
      <h2 className="text-2xl font-semibold mt-6">📌 6. Seguridad y Almacenamiento de Datos</h2>
      <p className="mt-2">
        Implementamos medidas de seguridad como cifrado de datos y almacenamiento seguro en Firebase para proteger tu información.
      </p>

      {/* 7️⃣ Retención y eliminación de datos */}
      <h2 className="text-2xl font-semibold mt-6">📌 7. Retención y Eliminación de Datos</h2>
      <p className="mt-2">
        Almacenamos tus datos mientras tengas una cuenta activa en Jinete.ar. Puedes solicitar la eliminación de tu cuenta en cualquier momento.
      </p>
      <button 
        onClick={() => navigate("/eliminar-cuenta")} 
        className="mt-4 bg-red-600 text-white py-2 px-4 rounded-lg shadow hover:bg-red-700 transition"
      >
        Eliminar mi cuenta
      </button>

      {/* 8️⃣ Derechos del usuario */}
      <h2 className="text-2xl font-semibold mt-6">📌 8. Derechos de los Usuarios</h2>
      <ul className="list-disc pl-6 mt-2">
        <li>Acceder a tus datos personales.</li>
        <li>Solicitar la corrección o eliminación de tus datos.</li>
        <li>Oponerte al uso de tu información para ciertos fines.</li>
      </ul>
      <p className="mt-2">
        Para ejercer estos derechos, contáctanos en <a href="mailto:info@jinete.ar" className="text-blue-600">info@jinete.ar</a>.
      </p>

      {/* 9️⃣ Contacto y reclamos */}
      <h2 className="text-2xl font-semibold mt-6">📌 9. Contacto y Reclamos</h2>
      <p className="mt-2">
        Si tienes consultas sobre esta política, puedes comunicarte con nosotros:
      </p>
      <ul className="list-disc pl-6 mt-2">
        <li><strong>Correo electrónico:</strong> <a href="mailto:info@jinete.ar" className="text-blue-600">info@jinete.ar</a></li>
        <li><strong>Teléfono:</strong> 3764-876249</li>
        <li><strong>Autoridad de Protección de Datos:</strong> <a href="https://www.argentina.gob.ar/aaip/datospersonales" className="text-blue-600">DNPDP</a></li>
      </ul>

      {/* 10️⃣ Cambios en la política */}
      <h2 className="text-2xl font-semibold mt-6">📌 10. Modificaciones a Esta Política</h2>
      <p className="mt-2">
        Podemos actualizar esta política ocasionalmente. Te notificaremos sobre cambios importantes mediante nuestras plataformas.
      </p>

      {/* Botón de regreso */}
      <div className="button-container">
           <a href="/registro">
            <button className="button">Volver al registro</button>
           </a>
        </div>
    </div>
  );
};

export default PoliticaPrivacidad;