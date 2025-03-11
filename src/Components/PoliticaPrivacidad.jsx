import React from "react";

const PoliticaPrivacidad = () => {
  return (
    <div className="p-6 max-w-4xl mx-auto text-gray-800">
      <h1 className="text-3xl font-bold mb-6 text-center">
        Política de Privacidad de Jinete.ar
      </h1>
      <p className="mb-4"><strong>Última actualización:</strong> 11/03/2025</p>

      <p className="mb-4">
        Bienvenido a <strong>Jinete.ar</strong>, una aplicación de alquiler de
        bicicletas inteligentes operada por la <strong>Fundación Iniciativa Urbana Inteligente (FIUI)</strong>.
        Nos comprometemos a proteger la privacidad de nuestros usuarios y cumplir con todas las leyes de protección de datos aplicables.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">1. Información que recolectamos</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Datos personales: nombre, apellido, correo electrónico, número de teléfono, documento de identidad.</li>
        <li>Geolocalización en tiempo real para operar los servicios de bicicletas.</li>
        <li>Información de pago a través de MercadoPago (no almacenamos datos completos de tarjetas).</li>
        <li>Datos de uso: historial de viajes, kilómetros recorridos.</li>
        <li>Datos del dispositivo: tipo, sistema operativo, identificadores únicos, IP.</li>
        <li>Imágenes y documentos para verificación (reconocimiento facial, OCR).</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-8 mb-4">2. Finalidad del uso de datos</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Gestionar tu cuenta y validar tu identidad.</li>
        <li>Prestar y mejorar el servicio de bicicletas.</li>
        <li>Verificación de identidad mediante OCR y reconocimiento facial.</li>
        <li>Monitorear la ubicación de bicicletas y zonas de aparcamiento.</li>
        <li>Gestión de pagos y cobros.</li>
        <li>Comunicaciones de soporte y notificaciones importantes.</li>
        <li>Cumplir obligaciones legales y de seguridad.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-8 mb-4">3. Compartición de datos</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Proveedores tecnológicos: Twilio, MercadoPago, Jimi IoT, Firebase.</li>
        <li>Autoridades públicas cuando sea requerido por ley.</li>
        <li>Compañías de seguro si contratas un seguro desde la app.</li>
      </ul>
      <p className="mb-4"><strong>Nunca venderemos tu información a terceros.</strong></p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">4. Seguridad de los datos</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Cifrado de datos en tránsito y reposo.</li>
        <li>Autenticación segura y acceso restringido.</li>
        <li>Monitoreo de accesos no autorizados.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-8 mb-4">5. Tus derechos</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Acceso a tus datos personales.</li>
        <li>Corrección de datos incorrectos.</li>
        <li>Eliminación de tus datos, salvo obligaciones legales.</li>
        <li>Oposición al tratamiento de datos para ciertos fines.</li>
      </ul>
      <p className="mb-4">
        Para ejercer estos derechos, contáctanos según los datos más abajo.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">6. Conservación de los datos</h2>
      <p className="mb-4">
        Conservaremos tus datos mientras tengas una cuenta activa y por el tiempo necesario para cumplir con obligaciones legales o defensa de derechos.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">7. Eliminación de datos</h2>
      <p className="mb-4">
        Puedes solicitar la eliminación de tu cuenta y datos enviando un correo a: <strong>info@jinete.ar</strong>.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">8. Privacidad infantil</h2>
      <p className="mb-4">
        Esta app <strong>no está dirigida a menores de 13 años</strong>. Si descubrimos que se recopilaron datos de un menor, los eliminaremos. Si crees que tu hijo/a nos proporcionó datos, contáctanos.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">9. Cambios a esta política</h2>
      <p className="mb-4">
        Podemos actualizar esta política. Te notificaremos de los cambios importantes mediante la app o por correo electrónico.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">10. Contacto</h2>
      <ul className="list-none pl-2 space-y-2">
        <li><strong>Correo electrónico:</strong> info@jinete.ar</li>
        <li><strong>Teléfono/WhatsApp:</strong> +54 9 376 487-6249</li>
        <li><strong>Dirección postal:</strong> Av Uruguay 2651 Piso 1, Posadas, Misiones, Argentina</li>
      </ul>
    </div>
  );
};

export default PoliticaPrivacidad;
