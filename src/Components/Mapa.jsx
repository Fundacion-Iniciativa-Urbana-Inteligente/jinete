import React, { useState, useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import axios from "axios";
import "./Mapa.css";

const defaultPosition = [-27.3653656, -55.8887637];

export default function Mapa() {
  const [bicycles, setBicycles] = useState([]);
  const [selectedBike, setSelectedBike] = useState(null);
  const [unlockToken, setUnlockToken] = useState("");
  const [message, setMessage] = useState("");
  const [userName, setUserName] = useState(""); // Nombre del usuario autenticado
  const twilioPhoneNumber = "YOUR_TWILIO_PHONE_NUMBER"; // Reemplaza con tu número de Twilio

  // Recuperar usuario desde localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setUserName(user.name);
    }
  }, []);

  useEffect(() => {
    const fetchBicycles = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/bicycles`);
        setBicycles(response.data);
      } catch (error) {
        console.error("Error al obtener bicicletas:", error);
      }
    };

    fetchBicycles();
  }, []);

  const handleUnlock = async () => {
    if (!selectedBike || !unlockToken) {
      setMessage("Por favor selecciona una bicicleta e ingresa el token.");
      return;
    }

    try {
      const response = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/unlock`, {
        imei: selectedBike.imei,
        enteredToken: unlockToken,
      });

      if (response.status === 200) {
        setMessage(response.data.message);
      } else {
        setMessage(response.data.message || "Error desconocido.");
      }
    } catch (error) {
      console.error("Error al intentar desbloquear:", error);
      setMessage("Error al intentar desbloquear.");
    }
  };

  return (
    <div id="mapa">
      <MapContainer center={defaultPosition} zoom={15}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {bicycles.map((bike) => (
          <Marker
            key={bike.imei}
            position={[bike.lat, bike.lng]}
            eventHandlers={{
              click: () => setSelectedBike(bike),
            }}
          >
            <Popup>
              <strong>{bike.deviceName || "Sin nombre"}</strong>
              <br />
              Batería: {bike.batteryPowerVal}%
              <br />
              <button
                onClick={() =>
                  (window.location.href = `https://wa.me/+14155238886?text=Hola, Soy ${userName}, quiero reservar la bicicleta ${bike.deviceName}`)
                }
                style={{
                  padding: "5px 10px",
                  backgroundColor: "#25D366",
                  color: "#fff",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                  marginTop: "10px",
                }}
              >
                <i className="bi bi-whatsapp"></i> Reservar Bicicleta
              </button>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <footer
        style={{
          marginTop: "20px",
          padding: "10px",
          backgroundColor: "#f8f9fa",
          textAlign: "center",
          borderTop: "1px solid #ddd",
        }}
      >
        <h4>Ingresar Código de Desbloqueo</h4>
        <input
          type="text"
          value={unlockToken}
          onChange={(e) => setUnlockToken(e.target.value)}
          placeholder="Ingresa manualmente el código recibido"
          style={{
            padding: "10px",
            width: "60%",
            marginBottom: "10px",
          }}
        />
        <button
          onClick={handleUnlock}
          style={{
            padding: "10px",
            backgroundColor: "#28a745",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Confirmar Código
        </button>
        <p style={{ color: "red" }}>{message}</p>
      </footer>
    </div>
  );
}
