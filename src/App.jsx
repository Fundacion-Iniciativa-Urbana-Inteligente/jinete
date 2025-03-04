import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import "./App.css";
import Home from "./Pages/Home";
import NotFound from "./Pages/NotFound";
import RankingPage from "./Components/RankingPage";
import Mapa from "./Components/Mapa";
import Loader from "./Components/Loader";
import "bootstrap/dist/css/bootstrap.min.css";


function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulamos la carga de la app (puedes ajustarlo según sea necesario)
    const timer = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return <Loader onLoadingComplete={() => setLoading(false)} />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ranking" element={<RankingPage />} />
        <Route path="/map" element={<Mapa />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
