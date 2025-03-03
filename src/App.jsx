import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { useState } from "react";
import "./App.css";
import Home from "./Pages/Home";
import NotFound from "./Pages/NotFound";
import RankingPage from "./Components/RankingPage";
import Footer from "./Components/Footer";
import Mapa from "./Components/Mapa";
import Loader from "./Components/Loader"; // Importamos el Loader
import "bootstrap/dist/css/bootstrap.min.css";

// Componente para renderizar el Footer condicionalmente
const FooterWrapper = () => {
  const location = useLocation();
  const showFooter = location.pathname !== "/" && location.pathname !== "/map";
  
  return showFooter ? <Footer /> : null;
};

function App() {
  const [loading, setLoading] = useState(true);

  return (
    <>
      {loading && <Loader onLoadingComplete={() => setLoading(false)} />}
      {!loading && (
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/ranking" element={<RankingPage />} />
            <Route path="/map" element={<Mapa />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      )}
    </>
  );
}

export default App;
