import { useState } from "react";
import './Helpme.css';
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const HelpMe = () => {
  // Estado para manejar los elementos abiertos
  const [openItems, setOpenItems] = useState({});
  const navigate = useNavigate();

  // Función para alternar el estado de cada elemento
  const toggleItem = (index) => {
    setOpenItems((prev) => ({
      ...prev,
      [index]: !prev[index], // Alterna entre abierto y cerrado
    }));
  };

  return (
    
    <div className="help-container">
            <div className="button-container">
           <a href="/">
            <button className="button">Volver al inicio</button>
           </a>
        </div>
      <div className="header-section">
        <div className="lock-animation">
          <div className="circle-ripple"></div>
          <img src="/jinete.svg" alt="Jinete.ar Logo" className="jinete-logo" />
        </div>
      </div>

      <div className="container mt-5">
        <div className="row justify-content-center">
          <div className="col-12 col-lg-10">
            <div className="accordion custom-accordion">
              {accordionItems.map((item, index) => (
                <div 
                  className="accordion-item fade-in-up" 
                  style={{ animationDelay: `${index * 0.1}s` }} 
                  key={index}
                >
                  <h2 className="accordion-header">
                    <button
                      className={`accordion-button ${openItems[index] ? "" : "collapsed"}`}
                      type="button"
                      onClick={() => toggleItem(index)} // Maneja el clic
                    >
                      <i className={`bi ${item.icon} me-2`}></i>
                      {item.title}
                    </button>
                  </h2>
                  {openItems[index] && (
                    <div className="accordion-collapse show">
                      <div className="accordion-body">
                        {item.content.includes('<p') ? (
                          <div dangerouslySetInnerHTML={{ __html: item.content }} />
                        ) : (
                          item.content
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const accordionItems = [
  {
    title: "¿Cómo puedo alquilar un vehículo?",
    content: "Desde Google Maps o nuestra app verás un mapa de la ciudad con herraduras amarillas - estos marcan nuestros lugares de recogida. Selecciona el lugar que prefieras y elija el vehículos que quieres alquilar. Luego dirigete al lugar y presiona el boton de whatsapp y se te entregara un token de desbloqueo a traves de un asistente inteligente.",
    icon: "bi-bicycle"
  },
  {
    title: "¿Cual es el precio?",
    content: "Desde Google Maps o nuestra app verás los precios de cada vehiculo en el mapa de la ciudad presionando las herraduras amarillas. El tiempo se fracciona por minuto y solo cobramos por el tipo que hayas dejado la bicicleta desbloquada.",
    icon: "bi-bicycle"
  },
  {
    title: "¿Cómo recojo el vehículo?",
    content: "Obtendrás direcciones a tu lugar de recogida desde nuestra app o Google Maps. Una vez allí, revisa el nombre del vehiculo que prefieras. Verifica que el nombre que coincida con el nombre que puedes ver en la aplicación. Entonces presiona 'Alquilar por whatsapp'. Un androide automatizado verificara tu identidad, debes proporcionar tu numero de dni. Presiona la opcion 1 y se te entregara un token de desbloqueo. Recuerda que deberas tener saldo positivo en tu billetera jinete.ar. Ingresa el token de desbloqueo en nuestra app y el candado inteligente se abrira! Listo ya pudes disfrutar de tu paseo. No te cobraremos nada mas que los minutos que utilices la bicicleta",
    icon: "bi-shield-lock"
  },
  {
    title: "¿Cómo pago?",
    content: "Aceptamos Visa, MasterCard, American Express o tu saldo en MercadoPago. La recarga de tu billetera Jinete.ar se realizan mediante whatsapp en el menu opción 3. Puedes cargar 1000$ en la opcion 1 o el monto que consideres necesario en la opcion 2. Te enviaremos un link de pago, el saldo se actualiza automaticamente en tu billetera jinete.ar",
    icon: "bi-credit-card"
  },
  {
    title: "¿Puedo hacer pausas en el camino?",
    content: "No. Los viajes son unitarios. Puedes desbloquear o bloquearlo tantas veces como quieras, sólo asegúrate de aparcarlo bien y amarrar la bicicleta con su esliga a cualquier bicicletero de la ciudad.",
    icon: "bi-pause-circle"
  },
  {
    title: "¿Cómo devuelvo el vehículo?",
    content: `Si ya no necesitas el vehículo, busca las zonas de devolucion marcadas en nuestra app. Obtendrás indicaciones para llegar al lugar de entrega más cercano. Una vez allí, bloquea el vehículo con la palanca roja, y atar la bici con el cable de acero al candado.`,
    icon: "bi-box-arrow-in-right"
  },
  {
    title: "¿Hasta donde puedo ir con el vehiculo?",
    content: `En nuestra app se marcan las zonas de funcionamiento del sistema. No utilices los vehiculos fuera de las zonas permitidas, el equipo de jinete.ar monitorea cada posicion de las unidades. Daremos aviso a la policia si sales de los lugares permitidos.`,
    icon: "bi-box-arrow-in-right"
  },
  {
    title: "Tengo un problema. Quiero hablar con un humano",
    content: `
      <p>Nuestro sistema cuenta con un servicio de atencion en el cual nos comprometemos a responderte en un periodo menor a 15 minutos. Solo elige la opcion (4) Informar problemas</p>
      <p class="text-danger mb-0">Ayudanos a mejorar nuestra app. Deja tus opiniones</p>
    `,
    icon: "bi-geo-alt"
  },
  {
    title: "¿Dónde puedo devolver una bici?",
    content: `
      <p>Nuestro sistema de entrega virtual te ofrece la flexibilidad de recoger una bici en un lugar y devolverla en otro distinto.</p>
      <p>Ocasionalmente, las ubicaciones de entrega pueden alcanzar su capacidad máxima y dejar de estar disponibles temporalmente. Además, algunos tipos de vehículos tienen lugares designados para devolverlos.</p>
      <p>Mira este video para saber como amarrar la bicicleta</p>
      <p class="text-danger mb-0">Ayuda a mantener la ciudad ordenada. Se te cobrará una multa de 300$ si no devuelves tu bici a una ubicación de entrega cuando finalice el alquiler.</p>
    `,
    icon: "bi-geo-alt"
  }
];

export default HelpMe;
