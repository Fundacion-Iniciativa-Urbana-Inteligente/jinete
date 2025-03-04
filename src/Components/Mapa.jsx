import React, { useState, useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import axios from "axios";
import OtpInput from "react-otp-input";
import "./Mapa.css";
import { motion, AnimatePresence } from "framer-motion";
import L from "leaflet";
import jineteIcon from "./jinete.svg";
import { toast } from 'react-toastify';
import { useNavigate } from "react-router-dom";  // Importar navegación

const defaultPosition = [-27.3653656, -55.8887637];

const bikeIcon = L.icon({
  iconUrl: jineteIcon, // Cambia esto por la ruta de tu icono
  iconSize: [40, 40], // Tamaño del icono (ajústalo según necesidad)
  iconAnchor: [20, 40], // Punto de anclaje (mitad inferior del icono)
  popupAnchor: [0, -40] // Ajusta la posición del popup
});


export default function Mapa() {
  const [bicycles, setBicycles] = useState([]);
  const [unlockToken, setUnlockToken] = useState("");
  const [message, setMessage] = useState("");
  const [animateOtp, setAnimateOtp] = useState(false);
  const [popupVisible, setPopupVisible] = useState(null);
  const navigate = useNavigate();  // Definir función de navegación

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

  // ...
  const handleUnlock = async () => {
    if (!unlockToken) {
      toast.warn('Por favor ingresa el token de desbloqueo.', {
        position: 'top-center',
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: 'colored',
      });
      return;
    }
    
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/unlock`,
        { token: unlockToken }
      );
    
      toast.success(response.data?.message || '¡Desbloqueo exitoso!', {
        position: 'top-center',
        autoClose: 3000,
        theme: 'colored',
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error desconocido', {
        position: 'top-center',
        autoClose: 5000,
        theme: 'colored',
      });
    }
  };
    

  return (
    <div id="mapa" style={{ position: "relative" }}>
      <MapContainer center={defaultPosition} zoom={15} style={{ height: "80vh" }}>
        <TileLayer
          url="https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://stamen.com/">Stamen Design</a> | Map tiles by <a href="https://stadiamaps.com/">Stadia Maps</a> | Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
              {/* BOTÓN RANKINGS - TOP LEFT */}
      <motion.button
        onClick={() => navigate("./ranking")} // Redirigir a la página de rankings
        whileHover={{ scale: 1.2 }}
        whileTap={{ scale: 0.9 }}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          padding: "15px",
          backgroundColor: "yellow",
          color: "black",
          border: "2px solid black",
          borderRadius: "0px",
          cursor: "pointer",
          fontSize: "22px",
          fontWeight: "bold",
          zIndex: 1000, // Asegura que esté sobre el mapa
        }}
      >
        RANKING
      </motion.button>
          {bicycles
            .filter((bike) => !bike.is_disabled && !bike.is_reserved && bike.lat !== undefined && bike.lon !== undefined)
            .map((bike) => {
              const co2Evitado = parseFloat(bike.current_fuel_percent) * 0.21;

              return (
                <Marker key={bike.bike_id} position={[bike.lat, bike.lon]} icon={bikeIcon}>
                  <Popup>
                    <h2>{bike.bike_id}</h2>
                    <br />
                    TnCO2eq evitado: {co2Evitado.toFixed(2)}
                    <br />
                    Batería: {bike.current_fuel_percent} %
                    <br />
                    <button className="reservar-btn"

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
          position: "absolute",
          bottom: "50px",
          left: "50%",
          transform: "translateX(-50%)",
          padding: "18px",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          textAlign: "center",
          borderRadius: "0px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "80%",
          maxWidth: "290px",
          zIndex: 1000,
        }}
      >
             <h3 style={{ margin: "0 0 10px 0", fontSize: "19px", fontWeight: "bold", color: "white" }}>
              Ingrese código de desbloqueo
            </h3>
        <motion.button
          onClick={handleUnlock}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.90 }}
          style={{
            padding: "15px 15px",
            backgroundColor: "yellow",
            color: "black",
            border: "2px solid black",
            borderRadius: "0px",
            cursor: "pointer",
            fontSize: "20px",
            fontWeight: "bold",
            marginBottom: "10px",
          }}
        >
          Jinete.ar
        </motion.button>
        
        <motion.div
          key={animateOtp ? "animado" : "inicial"} // Solo cambia cuando se activa
          animate={animateOtp ? { x: [0, 100, 0] } : {}} // Solo se anima cuando se activa
          transition={animateOtp ? { type: "tween", duration: 0.5, ease: "easeInOut" } : {}}
          style={{ display: "flex", gap: "5px" }}
        >
          <OtpInput
            value={unlockToken}
            onChange={setUnlockToken}
            numInputs={4}
            renderSeparator={<span> - </span>}
            renderInput={(props, index) => <input {...props} className="otp-input-box" key={index} />}
            shouldAutoFocus
            containerStyle={{ display: "flex", justifyContent: "center", gap: "5px" }}
            inputStyle={{
              width: "50px",
              height: "50px",
              fontSize: "24px",
              textAlign: "center",
              borderRadius: "0px",
              border: "2px solid black",
              backgroundColor: "yellow",
              color: "black",
              fontWeight: "bold",
            }}
          />
        </motion.div>
      </footer>
    </div>
  );
}
