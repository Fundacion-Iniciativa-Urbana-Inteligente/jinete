import React, { useState } from "react";

function Payment() {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    if (!email || !amount || isNaN(amount) || amount <= 0) {
      alert("Por favor, ingresa un email y un monto válido.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/mercadopago/create_payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userEmail: email, amount: parseFloat(amount) }),
      });

      const data = await response.json();

      if (data.init_point) {
        window.location.href = data.init_point; // Redirigir al Checkout de Mercado Pago
      } else {
        alert("Error al generar el pago. Por favor, intenta nuevamente.");
      }
    } catch (error) {
      console.error("Error al procesar el pago:", error);
      alert("Hubo un problema al procesar tu pago.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>Generar Pago</h2>
      <input
        type="email"
        placeholder="Correo Electrónico"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ margin: "10px" }}
      />
      <br />
      <input
        type="number"
        placeholder="Monto (ARS)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ margin: "10px" }}
      />
      <br />
      <button onClick={handlePayment} disabled={loading}>
        {loading ? "Procesando..." : "Pagar Ahora"}
      </button>
    </div>
  );
}

export default Payment;
