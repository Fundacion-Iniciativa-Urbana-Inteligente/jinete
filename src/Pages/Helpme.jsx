import './Helpme.css';

const HelpMe = () => {
  return (
    <div className="help-container">
      <div className="header-section">
        <div className="lock-animation">
          <div className="circle-ripple"></div>
          <i className="bi bi-shield-lock-fill"></i>
        </div>
        <h1 className="display-3 text-center mb-4 fade-in">Así Funciona</h1>
        <p className="text-center text-muted lead slide-up">
          Tecnología de punta para tu movilidad
        </p>
      </div>

      <div className="container mt-5">
        <div className="row justify-content-center">
          <div className="col-12 col-lg-10">
            <div className="accordion custom-accordion" id="helpAccordion">
              {accordionItems.map((item, index) => (
                <div className="accordion-item fade-in-up" style={{animationDelay: `${index * 0.1}s`}} key={index}>
                  <h2 className="accordion-header">
                    <button 
                      className="accordion-button collapsed" 
                      type="button" 
                      data-bs-toggle="collapse" 
                      data-bs-target={`#collapse${index}`}
                    >
                      <i className={`bi ${item.icon} me-2`}></i>
                      {item.title}
                    </button>
                  </h2>
                  <div 
                    id={`collapse${index}`} 
                    className={`accordion-collapse collapse ${index === 0 ? 'show' : ''}`} 
                    data-bs-parent="#helpAccordion"
                  >
                    <div className="accordion-body">
                      {item.content.includes('<p') ? (
                        <div dangerouslySetInnerHTML={{ __html: item.content }} />
                      ) : (
                        item.content
                      )}
                    </div>
                  </div>
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
    content: "Abre la aplicación y verás un mapa de la ciudad con alfileres anaranjados - estos marcan nuestros lugares de recogida. Selecciona el lugar que prefieras y elija el número de vehículos que quieres alquilar de allí. Luego encuentra los vehículos y desbloquéalos a través de la aplicación.",
    icon: "bi-bicycle"
  },
  {
    title: "¿Cómo recojo el vehículo?",
    content: "Obtendrás direcciones a tu lugar de recogida. Una vez allí, revisa el codigo QR de información en el manillar y una pegatina con el nombre para encontrar el vehículo con el nombre que coincida con el nombre que puedes ver en la aplicación. Entonces presiona 'icono qr'",
    icon: "bi-qr-code-scan"
  },
  {
    title: "¿Y el seguro?",
    content: "El seguro antirrobo se puede adquirir para todos los alquileres de 'Viaje Simple' durante el proceso de reserva. Si estás suscrito como miembro, el seguro antirrobo se incluye en todos los alquileres sin coste adicional.",
    icon: "bi-shield-check"
  },
  {
    title: "¿Cómo pago?",
    content: "Aceptamos Visa, MasterCard, American Express. Si has recibido un código de descuento o deseas añadir un seguro antirrobo a tu alquiler, puedes añadirlo antes de confirmar la reserva. Una vez que confirmes tu reserva, los fondos para 1 día de alquiler serán reservados para asegurar el pago, pero no se te cobrará nada antes de que termines tu alquiler.",
    icon: "bi-credit-card"
  },
  {
    title: "¿Puedo hacer pausas en el camino?",
    content: "Durante el periodo de alquiler el vehículo es todo tuyo. Puedes desbloquearlo y bloquearlo tantas veces como quieras, sólo asegúrate de aparcarlo bien y de bloquearlo seguramente cuando hagas una pausa.",
    icon: "bi-pause-circle"
  },
  {
    title: "¿Cómo devuelvo el vehículo?",
    content: `Si ya no necesitas el vehículo, presiona "Devolver". Obtendrás indicaciones para llegar al lugar de entrega más cercano. Una vez allí, bloquea el vehículo, presiona "Finalizar alquiler" y sigue las instrucciones de la aplicación.`,
    icon: "bi-box-arrow-in-right"
  },
  {
    title: "¿Dónde puedo devolver una bici?",
    content: `
      <p>Nuestro sistema de entrega virtual te ofrece la flexibilidad de recoger una bici en un lugar y devolverla en otro distinto.</p>
      <p>Ocasionalmente, las ubicaciones de entrega pueden alcanzar su capacidad máxima y dejar de estar disponibles temporalmente. Además, algunos tipos de vehículos tienen lugares designados para devolverlos.</p>
      <p class="text-danger mb-0">Ayuda a mantener la ciudad ordenada. Se te cobrará una multa si no devuelves tu bici a una ubicación de entrega cuando finalice el alquiler.</p>
    `,
    icon: "bi-geo-alt"
  }
];

export default HelpMe;
