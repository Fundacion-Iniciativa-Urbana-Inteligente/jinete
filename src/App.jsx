import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import "./App.css";
import Menu from "./Components/Menu";
import Home from "./Pages/Home";
import NotFound from "./Pages/NotFound";
import Helpme from "./Pages/Helpme";
import Footer from "./Components/Footer";
import Mapa from "./Components/Mapa";
import "bootstrap/dist/css/bootstrap.min.css";

// Componente para renderizar el Footer condicionalmente
const FooterWrapper = () => {
  const location = useLocation();
  const showFooter = location.pathname !== "/" && location.pathname !== "/map";
  
  return showFooter ? <Footer /> : null;
};

function App() {
  return (
      <Router>
        <Menu />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/helpme" element={<Helpme />} />
          <Route path="/map" element={<Mapa />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
  );
}

export default App;
