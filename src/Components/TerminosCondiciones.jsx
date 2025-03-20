
import React from "react";
import { useNavigate } from 'react-router-dom';

const TerminosCondiciones = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 bg-white rounded-xl shadow-lg text-gray-800">
      <div className="button-container">
           <a href="/registro">
            <button className="button">Volver al registro</button>
           </a>
        </div>
        <h1 className="text-3xl font-bold text-center mb-6" style={{ color: "black" }} >
          Términos y Condiciones de Uso
        </h1>
      <p className="text-center text-sm text-gray-600">Última actualización: 11 de marzo de 2025</p>

      <p className="mt-4">
        Bienvenido a <strong>Jinete.ar</strong>, un servicio de alquiler de bicicletas inteligentes operado por la <strong>Fundación Iniciativa Urbana Inteligente (FIUI)</strong>. Al utilizar nuestros servicios, aceptas estos Términos y Condiciones.
      </p>

      <h2 className="text-2xl font-semibold mt-6">1. Aceptación de los términos</h2>
      <p>Al crear una cuenta y usar el servicio, aceptas estos Términos y nuestra Política de Privacidad.</p>

      <h2 className="text-2xl font-semibold mt-6">2. Registro y verificación de identidad</h2>
      <ul className="list-disc list-inside mt-2">
        <li>Ser mayor de 18 años.</li>
        <li>Proveer datos reales y verificables.</li>
        <li>Aceptar validación de identidad mediante foto de DNI y reconocimiento facial.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">3. Uso adecuado del servicio</h2>
      <ul className="list-disc list-inside mt-2">
        <li>Uso responsable de las bicicletas y respeto a las zonas permitidas.</li>
        <li>Respeto de normas de tránsito.</li>
        <li>No dañar ni manipular la bicicleta o candado inteligente.</li>
        <li>Devolver la bicicleta en zonas permitidas.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">4. Tarifas, pagos y facturación</h2>
      <p>Pagos automáticos mediante MercadoPago según el tiempo o distancia de uso. Facturación electrónica disponible.</p>

      <h2 className="text-2xl font-semibold mt-6">5. Multas y penalizaciones</h2>
      <ul className="list-disc list-inside mt-2">
        <li>No devolver bicicleta en zona permitida: hasta $XX.XXX.</li>
        <li>Daño intencional: hasta $XX.XXX.</li>
        <li>Pérdida o robo: hasta $XX.XXX.</li>
        <li>Uso indebido: suspensión o cancelación de cuenta.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">6. Responsabilidad por accidentes</h2>
      <p>El uso es bajo responsabilidad del usuario. Jinete.ar no se hace responsable por accidentes. Seguro opcional disponible.</p>

      <h2 className="text-2xl font-semibold mt-6">7. Suspensión o cancelación del servicio</h2>
      <p>Podemos suspender o cancelar el servicio ante incumplimientos o razones técnicas.</p>

      <h2 className="text-2xl font-semibold mt-6">8. Propiedad intelectual</h2>
      <p>Todo el contenido y tecnología de Jinete.ar es propiedad de FIUI.</p>

      <h2 className="text-2xl font-semibold mt-6">9. Protección de datos personales</h2>
      <p>Tratamos los datos conforme a la Política de Privacidad: <a href="https://jinete.ar/politica-de-privacidad" className="text-blue-600 underline">https://jinete.ar/politica-de-privacidad</a></p>

      <h2 className="text-2xl font-semibold mt-6">10. Modificaciones de los términos</h2>
      <p>Podemos actualizar estos términos. Notificaremos los cambios a través de la app o email.</p>

      <h2 className="text-2xl font-semibold mt-6">11. Contacto</h2>
      <ul className="list-disc list-inside mt-2">
        <li><strong>Email:</strong> info@jinete.ar</li>
        <li><strong>WhatsApp:</strong> +54 9 376 487 6249</li>
        <li><strong>Dirección:</strong> Av. Uruguay 2651 Piso 1, Posadas, Misiones, Argentina</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6">12. Legislación aplicable</h2>
      <p>Regido por las leyes de la República Argentina. Jurisdicción: Tribunales de Posadas, Misiones.</p>
    </div>
  );
};

export default TerminosCondiciones;