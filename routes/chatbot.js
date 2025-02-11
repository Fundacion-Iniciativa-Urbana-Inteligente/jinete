const express = require("express");
const { handleChatbot } = require("../services/chatbotService");
const { sendMessage } = require("../services/twilioService");
const router = express.Router();
const db = require("../firebase"); // Asegúrate de que `db` esté exportado en un módulo.

router.post("/webhook", async (req, res) => {
  const { Body, From } = req.body; // Mensaje y número del usuario
  console.log(`📩 Mensaje recibido de ${From}: ${Body}`);

  try {
    // Verificar si el usuario ya tiene un token activo
    const existingTokenRef = db.collection("whatsappTokens").doc(From);
    const existingTokenDoc = await existingTokenRef.get();

    if (existingTokenDoc.exists) {
      const existingTokenData = existingTokenDoc.data();
      const timeLeft = existingTokenData.expirationTime - Date.now();

      if (timeLeft > 0) {
        const minutesLeft = Math.ceil(timeLeft / (1000 * 60));
        await sendMessage(
          `¡Ya tienes un token activo! Código: ${existingTokenData.token}. Expira en ${minutesLeft} minutos.`,
          From
        );
        return res.status(200).send("Token ya existente enviado.");
      }
    }

    // Analizar si el usuario quiere reservar una bicicleta
    if (Body.toLowerCase().includes("reservar la bicicleta")) {
      // Extraer el nombre de la bicicleta si está en el mensaje
      const bikeMatch = Body.match(/bicicleta (\w+)/i);
      const bikeName = bikeMatch ? bikeMatch[1] : "desconocida";

      const token = Math.floor(1000 + Math.random() * 9000); // Generar un token
      const expirationTime = Date.now() + 15 * 60 * 1000; // 15 minutos de validez

      // Guardar el token en Firestore
      await existingTokenRef.set({
        token: token.toString(),
        expirationTime,
        bikeName,
      });

      // Enviar mensaje con el token
      await sendMessage(
        `🚲 ¡Tu bicicleta ${bikeName} ha sido reservada! Código de desbloqueo: ${token}. Validez: 15 minutos.`,
        From
      );
    } else {
      // Generar respuesta de OpenAI
      const chatbotResponse = await handleChatbot(Body);
      await sendMessage(chatbotResponse, From);
    }

    res.status(200).send("Mensaje procesado correctamente.");
  } catch (error) {
    console.error("❌ Error al manejar el mensaje de WhatsApp:", error.message);
    res.status(500).json({ message: "Error al procesar el mensaje." });
  }
});

module.exports = router;
