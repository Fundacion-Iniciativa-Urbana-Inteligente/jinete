import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import "./App.css";
import Home from "./Pages/Home";
import NotFound from "./Pages/NotFound";
import RankingPage from "./Components/RankingPage";
import Mapa from "./Components/Mapa";
import Loader from "./Components/Loader";
import 'bootstrap-icons/font/bootstrap-icons.css';
import RegistroUsuario from "./Components/RegistroUsuario";
import PoliticaPrivacidad from './Components/PoliticaPrivacidad';
import EliminarCuenta from './Components/EliminarCuenta';
import Terminos from './Components/TerminosCondiciones';

function App() {
  const [loading, setLoading] = useState(() => {
    return sessionStorage.getItem("appLoaded") ? false : true;
  });

  useEffect(() => {
    if (!sessionStorage.getItem("appLoaded")) {
      const timer = setTimeout(() => {
        setLoading(false);
        sessionStorage.setItem("appLoaded", "true");
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return <Loader />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ranking" element={<RankingPage />} />
        <Route path="/map" element={<Mapa />} />
        <Route path="/registro" element={<RegistroUsuario />} />
        <Route path="*" element={<NotFound />} />
        <Route path="/politica-de-privacidad" element={<PoliticaPrivacidad />} />
        <Route path="/eliminar-cuenta" element={<EliminarCuenta />} />
        <Route path="/terminos" element={<Terminos />} />
      </Routes>
    </Router>
  );
}

export default App;
