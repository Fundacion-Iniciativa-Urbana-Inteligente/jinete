import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function sendMessage(body, to) {
  if (!body || typeof body !== "string") {
    throw new Error("El cuerpo del mensaje (body) es inválido.");
  }

  if (!to || typeof to !== "string" || !to.startsWith("whatsapp:")) {
    throw new Error("El destinatario (to) es inválido.");
  }

  try {
    console.log(`📩 Enviando mensaje a ${to}: "${body}"`);

    const response = await client.messages.create({
      body,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to,
    });

    console.log(`✅ Mensaje enviado a ${to}. SID: ${response.sid}`);
    return response;
  } catch (error) {
    console.error("❌ Error al enviar mensaje con Twilio:", error);
    throw new Error(`No se pudo enviar el mensaje. Detalles: ${error.message}`);
  }
}
