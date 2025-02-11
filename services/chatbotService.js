const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function handleChatbot(userMessage) {
  const response = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [
      { role: "system", content: "Eres un asistente útil para Jinete.ar." },
      { role: "user", content: userMessage },
    ],
  });
  return response.data.choices[0].message.content;
}

module.exports = { handleChatbot };
