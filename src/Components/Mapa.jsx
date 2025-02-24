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

  useEffect(() => {
    const fetchBicycles = async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_BACKEND_URL}/gbfs/free_bike_status.json`
        );

        if (response.data?.data?.bikes) {
          console.log("📊 Datos recibidos para el mapa:", response.data.data.bikes);
          setBicycles(response.data.data.bikes);
        } else {
          console.error("Estructura de respuesta inesperada:", response.data);
          setBicycles([]);
        }
      } catch (error) {
        console.error("Error al obtener bicicletas:", error);
        setBicycles([]);
      }
    };

    fetchBicycles();
  }, []);

  const handleUnlock = async () => {
    if (!unlockToken) {
      setMessage("Por favor ingresa el token de desbloqueo.");
      return;
    }

    try {
      const response = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/unlock`, {
        token: unlockToken,
      });

      setMessage(response.data?.message || "Error desconocido.");
    } catch (error) {
      console.error("Error al intentar desbloquear:", error);
      setMessage("Error al intentar desbloquear.");
    }
  };

  return (
    <div id="mapa">
      <MapContainer center={defaultPosition} zoom={15} style={{ height: "80vh" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {bicycles
            .filter((bike) => !bike.is_disabled && !bike.is_reserved && bike.lat !== undefined && bike.lon !== undefined)
            .map((bike) => {
              const co2Evitado = parseFloat(bike.current_fuel_percent) * 0.21;

              return (
                <Marker key={bike.bike_id} position={[bike.lat, bike.lon]}>
                  <Popup>
                    <strong>{bike.bike_id}</strong>
                    <br />
                    TnCO2eq evitado: {co2Evitado.toFixed(2)}
                    <br />
                    Batería: {bike.current_fuel_percent} %
                    <br />
                    <button
                      onClick={() => {
                        const whatsappNumber = import.meta.env.VITE_TWILIO_PHONE_NUMBER;

                        if (!whatsappNumber) {
                          console.error("❌ Error: TWILIO_PHONE_NUMBER no está definido en .env");
                          alert("Error: No se ha configurado un número de WhatsApp.");
                          return;
                        }

                        // Eliminar prefijo 'whatsapp:' y '+'
                        const cleanNumber = whatsappNumber.replace("whatsapp:", "").replace("+", "");
                        const message = encodeURIComponent(`Hola, quiero alquilar ${bike.bike_id}`);
                        const whatsappUrl = `https://wa.me/${cleanNumber}?text=${message}`;

                        console.log("🔗 URL generada:", whatsappUrl);
                        window.open(whatsappUrl, "_blank");
                      }}
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
                      Reservar en WhatsApp
                    </button>
                  </Popup>
                </Marker>
              );
            })}
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
          placeholder="Ingresa el código recibido en WhatsApp"
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
