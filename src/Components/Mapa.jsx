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
        // Ajusta la URL para que apunte a tu endpoint real.
        const response = await axios.get(
          `${import.meta.env.VITE_BACKEND_URL}/gbfs/free_bike_status.json`
        );
        // La estructura que retorna tu backend es:
        // {
        //   last_updated: ...,
        //   ttl: ...,
        //   data: { bikes: [...] }
        // }
        // De ahí extraemos data.bikes:
        const { data } = response.data;
        setBicycles(data.bikes);
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
      const response = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/gbfs/free_bike_status.json`, {
        imei: selectedBike.bike,
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
      <MapContainer center={defaultPosition} zoom={15} style={{ height: "80vh" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/** Filtramos las bicis que NO estén deshabilitadas ni reservadas */}
        {bicycles
          .filter((bike) => !bike.is_disabled && !bike.is_reserved)
          .map((bike) => {
            // Calculamos TnCO2eq evitado a partir de currentMileage:
            const co2Evitado = parseFloat(bike.currentMileage) * 0.21;

            return (
              <Marker
                key={bike.bike_id}
                position={[bike.lat, bike.lon]}
                // icon={bikeIcon} // si quieres usar un ícono personalizado
              >
                <Popup>
                  <strong>{bike.bike_id}</strong>
                  <br />
                  TnCO2eq evitado: {co2Evitado.toFixed(2)}
                  <br />
                  Batería: {bike.current_fuel_percent} %
                  <br />
                  <button
                    onClick={() => {
                      // Abre el link de reserva en la misma pestaña o en otra:
                      window.open(bike.rental_uris.web, "_blank");
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
                    Reservar Bicicleta
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