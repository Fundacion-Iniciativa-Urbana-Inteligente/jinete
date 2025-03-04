import React, { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap, Power1 } from "gsap";
import { useNavigate } from "react-router-dom";

const RankingPage = () => {
  const navigate = useNavigate();
  const [userRanking, setUserRanking] = useState([
    { id: 1, nombre: "Juan Pérez", co2eq: 1.2 },
    { id: 2, nombre: "María Gómez", co2eq: 0.9 },
    { id: 3, nombre: "Carlos Reyes", co2eq: 0.75 },
    { id: 4, nombre: "Ana Silva", co2eq: 0.5 },
  ]);

  const [companyRanking, setCompanyRanking] = useState([
    { id: 1, nombre: "Empresa A", co2eq: 12.5 },
    { id: 2, nombre: "Municipio B", co2eq: 9.1 },
    { id: 3, nombre: "Colegio C", co2eq: 7.8 },
  ]);

  const canvasRef = useRef(null);

  useEffect(() => {
    const sortedUsers = [...userRanking].sort((a, b) => b.co2eq - a.co2eq);
    const sortedCompanies = [...companyRanking].sort((a, b) => b.co2eq - a.co2eq);
    setUserRanking(sortedUsers);
    setCompanyRanking(sortedCompanies);
  }, []);

  useEffect(() => {
    let renderer, scene, camera;
    let objects = [];
    let width = window.innerWidth, height = window.innerHeight;

    const init = () => {
      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: true });
      renderer.setSize(width, height);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.z = 75;

      initLights();
      initObjects();
      animate();
    };

    const initLights = () => {
      scene.add(new THREE.AmbientLight(0x808080));
      let light = new THREE.PointLight(0xffffff);
      light.position.z = 100;
      scene.add(light);
    };

    const initObjects = () => {
      let geometry = new THREE.BoxGeometry(12, 12, 3);
      let nx = Math.round(width / 12) + 1;
      let ny = Math.round(height / 12) + 1;

      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          let material = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
          let mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(-width / 2 + i * 12, -height / 2 + j * 12, 0);
          objects.push(mesh);
          scene.add(mesh);
        }
      }
      startAnim();
    };

    const startAnim = () => {
      objects.forEach(mesh => {
        mesh.rotation.set(0, 0, 0);
        mesh.material.opacity = 1;
        mesh.position.z = 0;
        let delay = Math.random() * 2;
        gsap.to(mesh.rotation, { duration: 2, x: Math.random() * Math.PI, y: Math.random() * Math.PI, z: Math.random() * Math.PI, delay });
        gsap.to(mesh.position, { duration: 2, z: 80, delay: delay + 0.5, ease: Power1.easeOut });
        gsap.to(mesh.material, { duration: 2, opacity: 0, delay: delay + 0.5 });
      });
    };

    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };

    init();
    return () => renderer.dispose();
  }, []);

  return (
    <div style={styles.pageContainer}>
      <canvas ref={canvasRef} style={styles.canvas}></canvas>
      <div style={styles.content}>
        <h2>Ranking de Jinetes</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Posición</th>
              <th style={styles.th}>Usuario</th>
              <th style={styles.th}>tnCO₂eq Ahorradas</th>
            </tr>
          </thead>
          <tbody>
            {userRanking.map((user, index) => (
              <tr key={user.id} style={styles.tr}>
                <td style={styles.td}>{index + 1}</td>
                <td style={styles.td}>{user.nombre}</td>
                <td style={styles.td}>{user.co2eq.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Ranking de Fundadores</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Posición</th>
              <th style={styles.th}>Empresa</th>
              <th style={styles.th}>tnCO₂eq Ahorradas</th>
            </tr>
          </thead>
          <tbody>
            {companyRanking.map((company, index) => (
              <tr key={company.id} style={styles.tr}>
                <td style={styles.td}>{index + 1}</td>
                <td style={styles.td}>{company.nombre}</td>
                <td style={styles.td}>{company.co2eq.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button style={styles.button} onClick={() => navigate("/")}>Volver al Mapa</button>
      </div>
    </div>
  );
};

const styles = {
  pageContainer: {
    position: "fixed",
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    zIndex: 0,
    backgroundColor: "#FFD700",
    fontFamily: "'Source Sans Pro', sans-serif", // Aplicar la fuente globalmente
  },
  content: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    padding: "2rem",
    borderRadius: "10px",
    maxWidth: "800px",
    textAlign: "center",
    color: "black",
    fontFamily: "'Source Sans Pro', sans-serif", // Aplicar al contenido
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "1rem",
    fontFamily: "'Source Sans Pro', sans-serif", // Aplicar a la tabla
  },
  th: {
    borderBottom: "2px solid black",
    padding: "0.5rem",
    fontWeight: "bold",
    fontFamily: "'Source Sans Pro', sans-serif",
  },
  td: {
    borderBottom: "1px solid black",
    padding: "0.5rem",
    fontFamily: "'Source Sans Pro', sans-serif",
  },
  button: {
    marginTop: "1rem",
    padding: "10px 20px",
    fontSize: "16px",
    fontWeight: "bold",
    backgroundColor: "black",
    color: "yellow",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontFamily: "'Source Sans Pro', sans-serif",
  },
};

export default RankingPage;