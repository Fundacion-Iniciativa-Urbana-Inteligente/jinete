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
  
        if (response.data && response.data.data && Array.isArray(response.data.data.bikes)) {
          setBicycles(response.data.data.bikes);
        } else {
          console.error("Estructura de respuesta inesperada:", response.data);
          setBicycles([]); // Evita que bicycles quede undefined
        }
      } catch (error) {
        console.error("Error al obtener bicicletas:", error);
        setBicycles([]); // Evita errores si hay un fallo en la solicitud
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
      // Llamada al endpoint /api/unlock con el token ingresado por el usuario
      const response = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/unlock`, {
        token: unlockToken,
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
    if (bike.rental_uris?.web) {
      window.open(bike.rental_uris.web, "_blank");
    } else {
      setMessage("No hay enlace de reserva disponible para esta bicicleta.");
    }
  }}
  style={{
    padding: "5px 10px",
    backgroundColor: bike.rental_uris?.web ? "#25D366" : "#ccc",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: bike.rental_uris?.web ? "pointer" : "not-allowed",
    marginTop: "10px",
  }}
  disabled={!bike.rental_uris?.web} // Se deshabilita si no hay URL
>
  {bike.rental_uris?.web ? "Reservar Bicicleta" : "No disponible"}
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