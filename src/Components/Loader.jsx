import { useState, useEffect } from "react";
import { motion, LayoutGroup } from "framer-motion";
import "./Loader.css"; // Importa los estilos exclusivos

const Loader = ({ onLoadingComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onLoadingComplete, 5000);
    return () => clearTimeout(timer);
  }, [onLoadingComplete]);

  return (
    <div className="loader-container">
      <LayoutGroup>
        <div className="loader-content">
          {/* Imagen 4.png */}
          <motion.img
            src="/4.png"
            alt="Logo Final"
            className="loader-image"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5, delay: 0 }}
          />

          {/* Imagen jinete3.svg */}
          <motion.img
            src="/jinete3.svg"
            alt="Logo Jinete"
            className="loader-image"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5, delay: 1.5 }}
          />
        </div>
      </LayoutGroup>
    </div>
  );
};

export default Loader;
