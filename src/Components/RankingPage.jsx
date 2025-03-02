// src/components/RankingPage.jsx

import React, { useState, useEffect } from 'react';

const RankingPage = () => {
  // Datos estáticos de ejemplo para USUARIOS
  // Puedes actualizar este array cada mes manualmente
  const [userRanking, setUserRanking] = useState([
    { id: 1, nombre: 'Juan Pérez', co2eq: 1.2 },  // 1.2 tnCO2eq
    { id: 2, nombre: 'María Gómez', co2eq: 0.9 },
    { id: 3, nombre: 'Carlos Reyes', co2eq: 0.75 },
    { id: 4, nombre: 'Ana Silva', co2eq: 0.5 },
    // ... agrega más usuarios
  ]);

  // Datos estáticos de ejemplo para EMPRESAS
  const [companyRanking, setCompanyRanking] = useState([
    { id: 1, nombre: 'Empresa A', co2eq: 12.5 },
    { id: 2, nombre: 'Empresa B', co2eq: 9.1 },
    { id: 3, nombre: 'Empresa C', co2eq: 7.8 },
    // ... agrega más empresas
  ]);

  // Ordenar automáticamente en cuanto carga el componente, de mayor a menor CO₂eq
  useEffect(() => {
    const sortedUsers = [...userRanking].sort((a, b) => b.co2eq - a.co2eq);
    const sortedCompanies = [...companyRanking].sort((a, b) => b.co2eq - a.co2eq);

    setUserRanking(sortedUsers);
    setCompanyRanking(sortedCompanies);
  }, []);

  return (
    <div style={styles.container}>
      <h2>Ranking de Usuarios</h2>
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

      <h2 style={{ marginTop: '2rem' }}>Ranking de Empresas</h2>
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
    </div>
  );
};

// Estilos básicos en línea (puedes usar tu CSS preferido)
const styles = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '2rem',
    textAlign: 'center',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '1rem',
  },
  th: {
    borderBottom: '2px solid #ccc',
    padding: '0.75rem',
  },
  tr: {
    borderBottom: '1px solid #eee',
  },
  td: {
    padding: '0.75rem',
  },
};

export default RankingPage;