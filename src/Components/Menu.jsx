import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { signInWithGoogle, logout } from "../firebaseAuth"; // Importar función de autenticación
import "./Menu.css";

const Menu = () => {
  const navbarToggler = useRef(null);
  const navbarCollapse = useRef(null);
  const [user, setUser] = useState(null);
  const [loadingPayment, setLoadingPayment] = useState(false); // Estado para el botón de pago
  const navigate = useNavigate();

  // Cerrar el menú en dispositivos pequeños
  const closeMenu = () => {
    if (window.innerWidth < 992 && navbarCollapse.current?.classList.contains("show")) {
      navbarToggler.current?.click();
    }
  };

  // Manejo de Login con Google
  const handleLogin = async () => {
    try {
      const loggedUser = await signInWithGoogle();
      console.log("Usuario autenticado:", loggedUser); // Verifica el usuario en consola
      if (loggedUser && loggedUser.displayName) {
        setUser({ name: loggedUser.displayName });
        localStorage.setItem("user", JSON.stringify({ name: loggedUser.displayName }));
        navigate("/");
      } else {
        console.error("El nombre del usuario no está disponible.");
        alert("No se pudo obtener el nombre del usuario. Intenta nuevamente.");
      }
    } catch (error) {
      console.error("Error al iniciar sesión:", error.message);
      alert("Error al iniciar sesión. Inténtalo nuevamente.");
    }
  };
  
  // Logout
  const handleLogout = async () => {
    try {
      await logout(); // Llamar a la función logout de firebaseAuth.js
      localStorage.removeItem("user"); // Borra el usuario del localStorage
      setUser(null); // Actualiza el estado del usuario
      console.log("Sesión cerrada exitosamente");
      navigate("/"); // Redirige a la página principal
    } catch (error) {
      console.error("Error al cerrar sesión:", error.message);
      alert("Hubo un error al cerrar la sesión. Intenta nuevamente.");
    }
  };  

  // Recuperar usuario almacenado en localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  // Manejo del proceso de pago
  const handlePayment = async () => {
    if (!user) {
      alert("Por favor, inicia sesión antes de realizar un pago.");
      return;
    }
  
    setLoadingPayment(true);
  
    // Acceso correcto a la variable de entorno con Vite
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";
  
    try {
      const response = await fetch(`${backendUrl}/api/mercadopago/create_payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userEmail: `${user.name}@example.com`,
          title: "Alquiler x 1hora - Jinete.ar",
          quantity: 1,
          unitPrice: 10,
        }),
      });
  
      console.log("Respuesta del servidor:", response);
      const data = await response.json();
      console.log("Datos recibidos:", data);
  
      if (data.init_point) {
        window.location.href = data.init_point; // Redirige al checkout de Mercado Pago
      } else {
        console.error("No se pudo obtener el init_point:", data);
        alert("Error al generar el pago. Intenta nuevamente.");
      }
    } catch (error) {
      console.error("Error al procesar el pago:", error);
      alert("Hubo un problema al procesar el pago.");
    } finally {
      setLoadingPayment(false);
    }
  };

  return (
    <nav className="navbar navbar-expand-lg fixed-top bg-body-tertiary">
      <div className="container-fluid">
        <NavLink className="navbar-brand" to="/" onClick={closeMenu}>
          Jinete.ar
        </NavLink>
        <button
          ref={navbarToggler}
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNavDropdown"
          aria-controls="navbarNavDropdown"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div ref={navbarCollapse} className="collapse navbar-collapse" id="navbarNavDropdown">
          <ul className="navbar-nav ms-auto">
            <li className="nav-item">
              <NavLink className="nav-link" to="/" onClick={closeMenu}>
                Home
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink className="nav-link" to="/helpme" onClick={closeMenu}>
                Así Funciona
              </NavLink>
            </li>

            {user ? (
              <>
                <li className="nav-item">
                  <span className="nav-link">Bienvenido, {user.name}</span>
                </li>
                <li className="nav-item">
                  <button
                    className="btn btn-primary"
                    onClick={handlePayment}
                    disabled={loadingPayment}
                  >
                    {loadingPayment ? "Procesando Pago..." : "Cargar Saldo"}
                  </button>
                </li>
                <li className="nav-item">
                  <button className="btn btn-link nav-link" onClick={handleLogout}>
                    Logout
                  </button>
                </li>
              </>
            ) : (
              <li className="nav-item">
                <button className="btn btn-primary" onClick={handleLogin}>
                  Ingresar con Google
                </button>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Menu;