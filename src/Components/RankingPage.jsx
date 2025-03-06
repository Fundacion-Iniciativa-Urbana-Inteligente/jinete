import { motion } from "framer-motion";
import { useRef } from "react";
import { useInView } from "framer-motion";
import "./RankingPage.css";

export default function RankingTable() {
  const rankingData = [
    { position: 1, name: "Juan Pérez", points: 1500 },
    { position: 2, name: "María López", points: 1450 },
    { position: 3, name: "Carlos Gómez", points: 1400 },
    { position: 4, name: "Ana Torres", points: 1350 },
    { position: 5, name: "Luis Fernández", points: 1300 },
    { position: 6, name: "Sofía Ramírez", points: 1250 },
    { position: 7, name: "Pedro Castillo", points: 1200 },
    { position: 8, name: "Fernanda Díaz", points: 1150 },
    { position: 9, name: "Jorge Méndez", points: 1100 },
    { position: 10, name: "Elena Suárez", points: 1050 }
  ];

  const ref = useRef(null);
  const isInView = useInView(ref, { once: false, margin: "-100px" });
  return (
    <div className="page-container">
      <h1>🏆 Ranking de Jinetes</h1>

      <div className="podium-container">
        <div className="podium second-place">
          <span className="emoji">🥈</span>
          <h3>{rankingData[1].name}</h3>
          <p>{rankingData[1].points} Kg CO2eq</p>
        </div>
        <div className="podium first-place">
          <span className="emoji">🥇</span>
          <h3>{rankingData[0].name}</h3>
          <p>{rankingData[0].points} Kg CO2eq</p>
        </div>
        <div className="podium third-place">
          <span className="emoji">🥉</span>
          <h3>{rankingData[2].name}</h3>
          <p>{rankingData[2].points} Kg CO2eq</p>
        </div>
      </div>

      <div className="table-container" ref={ref}>
        <table>
          <thead>
            <tr>
              <th>Posición</th>
              <th>Jinete</th>
              <th>Kg CO2eq evitados</th>
            </tr>
          </thead>
          <tbody>
            {rankingData.slice(3).map((rider, index) => (
              <motion.tr
                key={index}
                initial={{ opacity: 0, y: 50 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <td>{rider.position}</td>
                <td>{rider.name}</td>
                <td>{rider.points}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        <br />
      </div>
      <div className="button-container">
           <a href="/">
            <button className="button">Volver al inicio</button>
           </a>
        </div>
    </div>
  );
}