import React, { useState, useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import axios from "axios";
import OtpInput from "react-otp-input";
import "./Mapa.css";
import { motion, AnimatePresence } from "framer-motion";
import L from "leaflet";
import jineteIcon from "./jinete.png";
import { store } from 'react-notifications-component';


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
      // Notificas error por falta de token
      store.addNotification({
        title: 'Advertencia',
        message: 'Por favor ingresa el token de desbloqueo.',
        type: 'warning',
        container: 'top-center',       // <<-- 'top-center' según tu CSS
        insert: 'top',
        animationIn: ['animate__animated', 'animate__flipInX'],
        animationOut: ['animate__animated', 'animate__flipOutX'],
        dismiss: {
          duration: 3000,
          onScreen: true,
        },
      });
  
      return;
    }
  
    setAnimateOtp(true);
  
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/unlock`,
        { token: unlockToken }
      );
  
      store.addNotification({
        title: '¡Desbloqueo exitoso!',
        message: response.data?.message || 'Operación completada',
        type: 'success',
        container: 'top-center',
        insert: 'top',
        animationIn: ['animate__animated', 'animate__flipInX'],
        animationOut: ['animate__animated', 'animate__flipOutX'],
        dismiss: {
          duration: 3000,
          onScreen: true,
        },
      });
    } catch (error) {
      // Error
      store.addNotification({
        title: 'Error al intentar desbloquear',
        message: error.response?.data?.message || 'Error desconocido',
        type: 'warning',  // O 'danger', si prefieres
        container: 'top-center',
        insert: 'top',
        animationIn: ['animate__animated', 'animate__flipInX'],
        animationOut: ['animate__animated', 'animate__flipOutX'],
        dismiss: {
          duration: 5000,
          onScreen: true,
        },
      });
    }
  };

  return (
    <div id="mapa" style={{ position: "relative" }}>
      <MapContainer center={defaultPosition} zoom={15} style={{ height: "80vh" }}>
        <TileLayer url="https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png" />
          {bicycles
            .filter((bike) => !bike.is_disabled && !bike.is_reserved && bike.lat !== undefined && bike.lon !== undefined)
            .map((bike) => {
              const co2Evitado = parseFloat(bike.current_fuel_percent) * 0.21;

              return (
                <Marker key={bike.bike_id} position={[bike.lat, bike.lon]} icon={bikeIcon}>
                  <Popup>
                    <strong>{bike.bike_id}</strong>
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
          bottom: "40px",
          left: "50%",
          transform: "translateX(-50%)",
          padding: "15px",
          backgroundColor: "rgba(0, 0, 0, 0)",
          textAlign: "center",
          borderRadius: "0px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "80%",
          maxWidth: "400px",
          zIndex: 1000,
        }}
      >
        <motion.button
          onClick={handleUnlock}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          whileDrag={{ scale: 0.9, rotate: 10 }}
          drag
          style={{
            padding: "15px 15px",
            backgroundColor: "yellow",
            color: "black",
            border: "0px solid black",
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
          animate={animateOtp ? { x: 100 } : { x: 0 }}
          transition={{ type: "spring" }}
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
              border: "0px solid black",
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
