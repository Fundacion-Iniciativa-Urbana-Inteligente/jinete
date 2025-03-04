import { useState, useEffect } from "react";
import { motion, LayoutGroup } from "framer-motion";

const Loader = ({ onLoadingComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onLoadingComplete, 5000); // Asegura que la animación dure suficiente tiempo
    return () => clearTimeout(timer);
  }, [onLoadingComplete]);

  return (
    <div className="fixed top-0 left-0 w-screen h-screen bg-red-500 flex items-center justify-center z-[9999]">
      {/* Contenedor de las capas superpuestas */}
      <LayoutGroup>
        <div className="relative w-full h-full flex items-center justify-center">
          <motion.img
            src="/4.png"
            alt="Logo Final"
            className="absolute w-[30vw] max-w-[150px] h-auto bg-black m-0 p-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5, delay: 0 }}
          />
          <motion.img
            src="/jinete3.svg"
            alt="Logo Jinete"
            className="absolute w-[40vw] max-w-[200px] h-auto bg-transparent m-0 p-0"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: 1, scale: 0.75 }} // Reduce el tamaño un poco
            transition={{ duration: 1.5, delay: 1.5 }}
          />
        </div>
      </LayoutGroup>
    </div>
  );
};

export default Loader;
