import React, { useState } from 'react';
import axios from 'axios';
import OtpInput from 'react-otp-input';

export default function FooterCodeInput() {
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [unlockToken, setUnlockToken] = useState("");

  const handleUnlock = async () => {
    if (!otp) {
      setMessage("Por favor ingresa el token de desbloqueo.");
      return;
    }

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/unlock`,
        { token: otp }
      );
      setMessage(response.data?.message || "Error desconocido.");
    } catch (error) {
      console.error("Error al intentar desbloquear:", error);
      setMessage("Error al intentar desbloquear.");
    }
  };

  return (
    <footer style={{ padding: '20px', background: '#f9f9f9' }}>
      <h4>Ingresar Código de Desbloqueo</h4>

      {/* Componente OTP */}
      <OtpInput
        value={otp}
        onChange={setOtp}
        numInputs={4}
        separator={<span>-</span>}
        inputStyle={{
          width: '3rem',
          height: '3rem',
          margin: '0 4px',
          fontSize: '1.2rem',
          borderRadius: 4,
          border: '1px solid #ccc',
          textAlign: 'center',
        }}
        containerStyle={{
          justifyContent: 'center',
          marginBottom: '10px',
        }}
        focusStyle={{
          border: '2px solid #28a745',
          outline: 'none',
        }}
      />

      <button
        onClick={handleUnlock}
        style={{
          padding: '10px',
          backgroundColor: '#28a745',
          color: '#fff',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
        }}
      >
        Confirmar Código
      </button>

      {message && <p style={{ color: 'red', marginTop: '10px' }}>{message}</p>}
    </footer>
  );
}