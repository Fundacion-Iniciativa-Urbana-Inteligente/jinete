import React, { useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion"; // Importar animaciones
import "./Menu.css";

const menuVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

const Menu = () => {
  const navbarToggler = useRef(null);
  const navbarCollapse = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <motion.nav 
      className="navbar navbar-expand-lg fixed-top bg-body-tertiary"
      initial="hidden"
      animate="visible"
      variants={menuVariants}
    >
      <div className="container-fluid">
        <NavLink className="navbar-brand" to="/">
          Jinete.ar
        </NavLink>
        <button
          ref={navbarToggler}
          className="navbar-toggler"
          type="button"
          onClick={toggleMenu}
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <motion.div 
          ref={navbarCollapse} 
          className={`collapse navbar-collapse ${menuOpen ? "show" : ""}`} 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: menuOpen ? 1 : 0, height: menuOpen ? "auto" : 0 }}
          transition={{ duration: 0.3 }}
        >
          <ul className="navbar-nav ms-auto">
            <motion.li className="nav-item" whileHover={{ scale: 1.1 }}>
              <NavLink className="nav-link" to="/">
                Home
              </NavLink>
            </motion.li>
            <motion.li className="nav-item" whileHover={{ scale: 1.1 }}>
              <NavLink className="nav-link" to="/ranking">
                Ranking
              </NavLink>
            </motion.li>
            <motion.li className="nav-item" whileHover={{ scale: 1.1 }}>
              <NavLink className="nav-link" to="/helpme">
                Así Funciona
              </NavLink>
            </motion.li>
          </ul>
        </motion.div>
      </div>
    </motion.nav>
  );
};

export default Menu;