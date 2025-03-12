import React from "react";

const PrivacyPolicy = () => {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 text-gray-800">
      <h1 className="text-3xl font-bold text-center mb-6">Política de Privacidad</h1>
      <p className="text-center text-sm text-gray-600">Última actualización: 11 de marzo de 2025</p>

      <p className="mt-4">
        Bienvenido a <strong>Jinete.ar</strong>, una aplicación de alquiler de bicicletas inteligentes operada por la
        <strong> Fundación Iniciativa Urbana Inteligente (FIUI)</strong>. Nos comprometemos a proteger la privacidad de nuestros
        usuarios y cumplir con todas las leyes de protección de datos aplicables.
      </p>

      <h2 className="text-2xl font-semibold mt-6">1. Información que recolectamos</h2>
      <ul className="list-disc list-inside mt-2">
        <li>Datos personales: nombre, apellido, correo electrónico, teléfono, documento de identidad.</li>
        <li>Ubicación en tiempo real para operación de bicicletas.</li>
        <li>Información de pago (procesada por MercadoPago, no almacenamos datos de tarjetas).</li>
        <li>Historial de uso: viajes, kilómetros recorridos.</li>
        <li>Datos del dispositivo: sistema operativo, identificadores únicos, IP.</li>
        <li>Imágenes y documentos para verificación de identidad.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">2. Finalidad del uso de datos</h2>
      <p className="mt-2">Utilizamos tus datos para:</p>
      <ul className="list-disc list-inside mt-2">
        <li>Gestionar tu cuenta y validar tu identidad.</li>
        <li>Prestar y mejorar el servicio de bicicletas.</li>
        <li>Verificación de identidad mediante reconocimiento facial y OCR.</li>
        <li>Monitorear la ubicación de bicicletas y zonas de aparcamiento.</li>
        <li>Gestión de pagos y cobros.</li>
        <li>Notificaciones importantes y soporte.</li>
        <li>Cumplir obligaciones legales y de seguridad.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">3. Compartición de datos</h2>
      <p className="mt-2">Podemos compartir tus datos con:</p>
      <ul className="list-disc list-inside mt-2">
        <li>Proveedores tecnológicos: Twilio, MercadoPago, Jimi IoT, Firebase.</li>
        <li>Autoridades públicas cuando sea requerido por ley.</li>
        <li>Compañías de seguro si contratas un seguro desde la app.</li>
      </ul>
      <p><strong>Nunca venderemos tu información a terceros.</strong></p>

      <h2 className="text-2xl font-semibold mt-6">4. Seguridad de los datos</h2>
      <ul className="list-disc list-inside mt-2">
        <li>Cifrado de datos en tránsito y reposo.</li>
        <li>Autenticación segura y acceso restringido.</li>
        <li>Monitoreo de accesos no autorizados.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">5. Tus derechos</h2>
      <p className="mt-2">Puedes ejercer los siguientes derechos:</p>
      <ul className="list-disc list-inside mt-2">
        <li>Acceder a tus datos personales.</li>
        <li>Corrección de datos incorrectos.</li>
        <li>Eliminación de tus datos, salvo obligaciones legales.</li>
        <li>Oposición al tratamiento de datos para ciertos fines.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">6. Eliminación de datos</h2>
      <p className="mt-2">
        Puedes solicitar la eliminación de tu cuenta y datos enviando un correo a:
        <strong> info@jinete.ar</strong>.
      </p>

      <h2 className="text-2xl font-semibold mt-6">7. Privacidad infantil</h2>
      <p className="mt-2">
        Nuestra aplicación <strong>no está dirigida a menores de 13 años</strong>. Si descubrimos que se recopilaron datos de un menor,
        los eliminaremos de inmediato. Si crees que tu hijo/a nos proporcionó datos, contáctanos.
      </p>

      <h2 className="text-2xl font-semibold mt-6">8. Cambios a esta política</h2>
      <p className="mt-2">
        Nos reservamos el derecho de actualizar esta Política de Privacidad. Notificaremos cualquier cambio importante a través de la app o por email.
      </p>
      <h2 className="text-2xl font-semibold mt-6">9. Tratamiento de imágenes de documentos de identidad (DNI)</h2>
<p className="mt-2">
  Para garantizar la seguridad del servicio y validar la identidad de nuestros usuarios, podemos solicitar y procesar imágenes de documentos de identidad oficiales (por ejemplo, DNI, pasaporte o licencia de conducir). Estas imágenes se utilizan exclusivamente para los siguientes fines:
</p>
<ul className="list-disc list-inside mt-2">
  <li>Verificar la identidad del usuario mediante procesos automáticos y/o manuales, incluyendo el uso de inteligencia artificial (OCR y reconocimiento facial) para prevenir fraudes.</li>
  <li>Asociar la identidad verificada a la cuenta del usuario para permitir el uso del sistema de bicicletas.</li>
  <li>Cumplir con requisitos legales y de seguridad, incluyendo la cooperación con autoridades en caso de incidentes.</li>
</ul>
<p className="mt-2">
  Las imágenes recolectadas son procesadas a través de sistemas seguros, incluyendo servidores protegidos y canales cifrados (TLS/HTTPS). Solo el personal autorizado o los sistemas automáticos de validación acceden a esta información.
</p>
<p className="mt-2">
  No compartimos estas imágenes con terceros no autorizados. Las mismas se conservan únicamente durante el tiempo necesario para los fines indicados y pueden ser eliminadas a solicitud del usuario, siempre que no exista una obligación legal de conservación.
</p>
<p className="mt-2">
  En cualquier momento, el usuario puede solicitar información adicional o la eliminación de su documento enviando un correo a: <strong>info@jinete.ar</strong>.
</p>


      <h2 className="text-2xl font-semibold mt-6">10. Contacto</h2>
      <p className="mt-2">Para consultas sobre privacidad y protección de datos:</p>
      <ul className="list-disc list-inside mt-2">
        <li><strong>Correo electrónico:</strong> info@jinete.ar</li>
        <li><strong>Teléfono/WhatsApp:</strong> +54 9 376 487 6249</li>
        <li><strong>Dirección postal:</strong> Av Uruguay 2651 Piso 1, Posadas, Misiones, Argentina</li>
      </ul>
    </div>
  );
};

export default PrivacyPolicy;
