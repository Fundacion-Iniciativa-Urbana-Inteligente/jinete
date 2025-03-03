import { useState, useEffect } from "react";

const Loader = ({ onLoadingComplete }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((oldProgress) => {
        const newProgress = oldProgress + 20; // Incrementa cada segundo (100% en 5s)
        if (newProgress >= 100) {
          clearInterval(interval);
          setTimeout(onLoadingComplete, 500); // Pequeña pausa antes de mostrar la app
        }
        return newProgress;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onLoadingComplete]);

  return (
    <div className="fixed top-0 left-0 w-full h-full bg-black flex flex-col items-center justify-center z-50">
      <video autoPlay muted loop className="w-full h-full object-cover absolute top-0 left-0" >
        <source src="/Loader.mp4" type="video/mp4" />
        Tu navegador no soporta videos.
      </video>

      {/* Barra de Progreso */}
      <div className="absolute bottom-10 w-3/4 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all duration-200"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
};

export default Loader;