import React, { useState } from 'react';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { useNavigate } from 'react-router-dom';

const EliminarCuenta = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');

  const handleWhatsAppSend = () => {
    if (!phone) {
      alert('Por favor, ingresa un número de teléfono válido.');
      return;
    }

    const message = encodeURIComponent(
      `Hola, quiero solicitar la eliminación de mi cuenta en Jinete.ar. Motivo: ${reason || "No especificado"}`
    );

    const supportPhone = "whatsapp:+5493765530375"; // Número fijo de soporte
    const whatsappUrl = `https://wa.me/${supportPhone}?text=${message}`;

    console.log("🔗 URL generada:", whatsappUrl);
    window.open(whatsappUrl, "_blank");
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 bg-white rounded-xl shadow-lg text-gray-800 relative">
      {/* Botón flotante volver al registro */}
      <button
        type="button"
        onClick={() => navigate("/registro")}
        className="absolute right-5 top-5 bg-blue-600 text-white py-2 px-4 rounded-lg shadow hover:bg-blue-700 transition"
      >
        Volver al Registro
      </button>

      <h1 className="text-4xl font-bold mb-6 text-center">🗑️ Eliminar cuenta</h1>
      <p className="mb-6 text-gray-600 text-center">
        Completá el siguiente formulario para solicitar la eliminación de tu cuenta de Jinete.ar.
      </p>

      <div className="mb-4">
        <label className="block mb-2 font-semibold">Tu número de WhatsApp:</label>
        <PhoneInput
          placeholder="Ingrese su número de WhatsApp"
          defaultCountry="AR"
          value={phone}
          onChange={setPhone}
          className="w-full p-3 border rounded-lg"
        />
      </div>

      <div className="mb-6">
        <label className="block mb-2 font-semibold">Motivo (opcional):</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Contanos por qué querés eliminar la cuenta..."
          className="w-full p-3 border rounded-lg"
        />
      </div>

      <button
        onClick={handleWhatsAppSend}
        className="bg-red-600 text-white py-3 px-6 rounded-lg w-full hover:bg-red-700 transition"
      >
        Solicitar eliminación por WhatsApp
      </button>

      <p className="mt-6 text-gray-500 text-sm text-center">
        ⚠️ Al hacer clic, se abrirá WhatsApp con un mensaje prearmado para enviar al número de atención.
      </p>
    </div>
  );
};

export default EliminarCuenta;
