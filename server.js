import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { randomUUID } from 'crypto'; // Para generar idempotencyKey
import { MercadoPagoConfig, Preference } from 'mercadopago';
import crypto from 'crypto'; // Para hashear la contraseña a MD5
import axios from 'axios'; // Añadido para las consultas a Jimi IoT
import fs from 'fs';
import twilio from 'twilio';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import admin from 'firebase-admin';
import OpenAI from "openai";



let currentAccessToken = null;
let currentRefreshToken = null;


// Configuración de variables de entorno locales (dotenv solo para entorno local)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Resolver __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de Express
const app = express();
const port = process.env.PORT || 8080;

//Configuracion de twilio
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const from = process.env.TWILIO_PHONE_NUMBER || "whatsapp:+14155238886";

// Verificar token de Mercado Pago
if (!process.env.MERCADOPAGO_TOKEN) {
  console.error('❌ Error: El token de Mercado Pago no está configurado (MERCADOPAGO_TOKEN).');
  process.exit(1);
}

// Configuración de Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_TOKEN,
  options: { timeout: 5000 }, // Opciones generales del cliente
});

// Configuración de JIMI IoT
const JIMI_APP_KEY = process.env.JIMI_APP_KEY;
const JIMI_USER_ID = process.env.JIMI_USER_ID;
const JIMI_USER_PWD = process.env.JIMI_USER_PWD;
const JIMI_URL = process.env.JIMI_URL;

let serviceAccount = null;


// Levanta el ServiceAccontKey.json
async function loadServiceAccount() {
  if (process.env.K_SERVICE) {
    // Está en Google Cloud Run
    try {
      console.log('Detectado entorno en Google Cloud Run. Cargando credenciales desde variable de entorno...');
      serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);
      console.log('Credenciales cargadas exitosamente desde Secret Manager (variables de entorno).');
    } catch (error) {
      console.error('Error al cargar el Service Account desde la variable de entorno:', error.message);
      process.exit(1);
    }
  } else {
    // Está en local
    try {
      console.log('Detectado entorno local. Cargando credenciales desde archivo...');
      serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));
      console.log('Credenciales cargadas desde archivo local.');
    } catch (error) {
      console.error('No se pudo cargar el archivo serviceAccountKey.json:', error.message);
      process.exit(1);
    }
  }
}
// Llamar a la función de carga de credenciales
loadServiceAccount();

  // Inicializar Firebase Admin SDK
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://jinete-ar.firebaseio.com',
  });
  console.log('Firebase Admin SDK inicializado correctamente.');

  // Asignar Firestore a db
  global.db = admin.firestore(); // Usa `global` para compartir `db` en todo el archivo
  console.log('Firestore inicializado correctamente.');
  
// Middleware para procesar datos URL-encoded y JSON
app.use(express.urlencoded({ extended: true })); // Esto procesa datos URL-encoded
app.use(express.json()); // Esto procesa datos JSON

// Middleware global
app.use(cors({
  origin: [
    // Agrega los orígenes que necesitas permitir
    'https://jinete-ar.web.app',
    'http://localhost:5173',
  ],
  methods: 'GET,POST,PUT,PATCH,DELETE',
  credentials: true,
}));

// Para parsear JSON en el body de las requests
app.use(express.json());

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, 'public')));

// Ruta opcional para la raíz (GET /)
// Te permitirá ver algo al acceder a la URL base
app.get('/', (req, res) => {
  res.send('¡Bienvenido al backend de JineteAr! Si ves este mensaje, el servidor está corriendo correctamente.');
});

// Función para crear una preferencia de pago
const createPreference = async (email, title, quantity, unitPrice) => {
  const idempotencyKey = randomUUID(); // Generar un idempotencyKey único
  const preference = new Preference(client);

  try {
    console.log('Creando preferencia con los siguientes datos:', {
      email,
      title,
      quantity,
      unitPrice,
      idempotencyKey,
    });

    const response = await preference.create({
      body: {
        payer: { email },
        items: [
          {
            title,
            quantity,
            unit_price: unitPrice,
          },
        ],
        back_urls: {
          success: 'https://jinete-ar.web.app/success',
          failure: 'https://jinete-ar.web.app/failure',
          pending: 'https://jinete-ar.web.app/pending',
        },
        auto_return: 'approved',
      },
      requestOptions: {
        idempotencyKey, // Usar el idempotencyKey dinámico
      },
    });

    console.log('Respuesta completa de Mercado Pago:', response);

    if (!response || !response.init_point) {
      throw new Error('La respuesta de Mercado Pago no contiene init_point.');
    }

    console.log('Preferencia creada exitosamente:', response);
    return response;
  } catch (error) {
    if (error.response) {
      console.error('❌ Error en la respuesta de Mercado Pago:', error.response.data || error.response);
    } else {
      console.error('❌ Error no relacionado con la respuesta de Mercado Pago:', error.message);
    }
    throw new Error('No se pudo crear la preferencia de pago.');
  }
};

// Ruta para crear un pago en Mercado Pago
app.post('/api/mercadopago/create_payment', async (req, res) => {
  console.log('Solicitud para /api/mercadopago/create_payment, body:', req.body);

  const { userEmail, title, quantity, unitPrice } = req.body;

  if (!userEmail || !title || !quantity || !unitPrice) {
    console.error('❌ Error: Parámetros inválidos recibidos:', { userEmail, title, quantity, unitPrice });
    return res.status(400).json({ message: 'Parámetros inválidos' });
  }

  try {
    const preference = await createPreference(userEmail, title, quantity, unitPrice);
    // Enviar al cliente el link de pago
    return res.json({ init_point: preference.init_point });
  } catch (error) {
    console.error('Error al crear la preferencia de pago:', error.message);
    return res.status(500).json({ message: 'Error al crear la preferencia de pago.' });
  }
});

// Función para generar la firma (sign)
function signTopRequest(params, seccode, signMethod) {
  const keys = Object.keys(params).sort(); // Ordenar las claves alfabéticamente

  let query = '';
  if (signMethod === 'md5') {
    query += seccode;
  }

  keys.forEach((key) => {
    const value = params[key];
    if (key && value) {
      query += `${key}${value}`;
    }
  });

  if (signMethod === 'HMAC') {
    query += seccode; // Agregar `seccode` al final
    return crypto.createHmac('md5', seccode).update(query, 'utf8').digest('hex').toUpperCase();
  } else {
    query += seccode; // Agregar `seccode` al final
    return crypto.createHash('md5').update(query, 'utf8').digest('hex').toUpperCase();
  }
}

// Función para generar los parámetros comunes
function generateCommonParameters(method) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const params = {
    method,
    timestamp,
    app_key: JIMI_APP_KEY,
    sign_method: 'md5',
    v: '0.9',
    format: 'json',
  };

  // Crear firma MD5
  const seccode = process.env.JIMI_APP_SECRET; // Se debe agregar esta clave secreta en el .env
  params.sign = signTopRequest(params, seccode, 'md5'); // Generar la firma con MD5

  return params; // Retorna los parámetros con la firma incluida
}

// Función para obtener el token automáticamente al arrancar
async function fetchAndStoreToken() {
  console.log('⏳ Intentando obtener el token automáticamente...');
  try {
    // Generar los parámetros comunes
    const commonParams = generateCommonParameters('jimi.oauth.token.get');

    // Agregar parámetros privados
    const privateParams = {
      user_id: process.env.JIMI_USER_ID,
      user_pwd_md5: crypto.createHash('md5').update(process.env.JIMI_USER_PWD).digest('hex'),
      expires_in: 7200, // Tiempo de expiración del token en segundos
    };

    // Crear el cuerpo de la solicitud combinando parámetros comunes y privados
    const requestData = { ...commonParams, ...privateParams };

    // Enviar la solicitud POST
    const response = await axios.post(process.env.JIMI_URL, requestData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { data } = response;

    // Verificar la respuesta del servidor
    if (data.code === 0 && data.result) {
      const tokenData = {
        appKey: data.result.appKey,
        account: data.result.account,
        accessToken: data.result.accessToken,
        refreshToken: data.result.refreshToken,
        expiresIn: data.result.expiresIn,
        time: data.result.time,
      };

      // Guardar el token en Firestore
      await db.collection('tokens').doc('jimi-token').set(tokenData);
      console.log('✅ Token obtenido automáticamente y guardado en Firestore:', tokenData);
      return tokenData;
    } else {
      console.error('❌ Error en la respuesta del servidor al obtener el token:', data);
      return null;
    }
  } catch (error) {
    console.error('❌ Error al intentar obtener el token automáticamente:', error.message);
    return null;
  }
}

// Función para refrescar el token
async function refreshAccessToken(refreshToken) {
  console.log('⏳ Intentando actualizar el token con refreshToken:', refreshToken);
  try {
    // Generar los parámetros comunes
    const commonParams = generateCommonParameters('jimi.oauth.token.refresh');

    // Parámetros privados requeridos por la API
    const privateParams = {
      access_token: currentAccessToken, // Token de acceso actual
      refresh_token: refreshToken,     // Token de actualización
      expires_in: 7200,                // Duración del nuevo token en segundos (máximo permitido)
    };

    // Combinar los parámetros comunes y privados
    const requestData = { ...commonParams, ...privateParams };

    console.log('🔍 Parámetros de la solicitud para refresh:', requestData);

    // Enviar la solicitud POST
    const response = await axios.post(process.env.JIMI_URL, requestData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { data } = response;

    if (data.code === 0 && data.result) {
      console.log('✅ Respuesta del servidor al actualizar el token:', data);

      const tokenData = {
        appKey: data.result.appKey,
        account: data.result.account,
        accessToken: data.result.accessToken,
        refreshToken: data.result.refreshToken,
        expiresIn: data.result.expiresIn,
        time: data.result.time,
      };

      // Guardar el token actualizado en Firestore
      await db.collection('tokens').doc('jimi-token').set(tokenData);
      console.log('✅ Token actualizado correctamente:', tokenData);
      return tokenData;
    } else {
      console.error('❌ Error en la respuesta del servidor al actualizar el token:', data);
      return null;
    }
  } catch (error) {
    if (error.response) {
      console.error('❌ Error al intentar actualizar el token:', error.response.status);
      console.error('❌ Detalles de la respuesta:', error.response.data);
    } else {
      console.error('❌ Error al intentar actualizar el token:', error.message);
    }
    return null;
  }
}



// Función para obtener ubicaciones de dispositivos
async function fetchDeviceLocations(accessToken) {
  console.log('⏳ Intentando obtener ubicaciones de dispositivos...');
  try {
    const commonParams = generateCommonParameters('jimi.user.device.location.list');
    const privateParams = {
      access_token: accessToken,
      target: JIMI_USER_ID, // Cuenta objetivo
    };

    const requestData = { ...commonParams, ...privateParams };

    const response = await axios.post(process.env.JIMI_URL, requestData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { data } = response;

    if (data.code === 0) {
      const locations = data.result;
      console.log(`✅ Ubicaciones obtenidas: ${locations.length} dispositivos`);

      const batch = db.batch();
      locations.forEach((location) => {
        const docRef = db.collection('deviceLocations').doc(location.imei);
        batch.set(docRef, location);
      });

      await batch.commit();
      console.log('✅ Ubicaciones guardadas en Firestore');
    } else {
      console.error('❌ Error al obtener ubicaciones:', data);
    }
  } catch (error) {
    console.error('❌ Error en la obtención de ubicaciones:', error.message);
  }
}

// Evitar duplicados
let integrationInitialized = false;

// Inicializar el proceso de actualización y consultas
async function initializeIntegration() {
  console.log('⏳ Inicializando integración...');

  try {
    // Leer el token actual desde Firestore
    const tokenDoc = await db.collection('tokens').doc('jimi-token').get();
    if (tokenDoc.exists) {
      const tokenData = tokenDoc.data();
      currentAccessToken = tokenData.accessToken;
      currentRefreshToken = tokenData.refreshToken;

      console.log('✅ Tokens cargados desde Firestore:', {
        currentAccessToken,
        currentRefreshToken,
      });
    } else {
      console.error('❌ No se encontraron tokens en Firestore.');
      return; // Detener la inicialización si no hay tokens
    }

    // Iniciar el intervalo de 40 segundos
    setInterval(async () => {
      console.log('⏳ Intervalo iniciado: Intentando refrescar el token...');
      try {
        const updatedToken = await refreshAccessToken(currentRefreshToken);

        if (updatedToken) {
          currentAccessToken = updatedToken.accessToken;
          currentRefreshToken = updatedToken.refreshToken;

          console.log('✅ Intervalo: Token actualizado correctamente.');

          // Obtener ubicaciones de dispositivos
          await fetchDeviceLocations(currentAccessToken);
        } else {
          console.error('❌ Intervalo: Error al actualizar el token.');
        }
      } catch (error) {
        console.error('❌ Intervalo: Error en la actualización automática:', error.message);
      }
    }, 40 * 1000); // Cada 40 segundos
  } catch (error) {
    console.error('❌ Error al inicializar la integración:', error.message);
  }
}

// Ruta para desbloquear bicicleta
app.post('/api/unlock', async (req, res) => {
  const { imei } = req.body;

  if (!imei || typeof imei !== 'string') {
    return res.status(400).json({ message: 'IMEI inválido o no proporcionado.' });
  }

  try {
    // Obtener el token desde Firebase
    const tokenDoc = await db.collection('tokens').doc('jimi-token').get();
    if (!tokenDoc.exists) {
      return res.status(401).json({ message: 'Token de acceso no disponible. Intenta nuevamente.' });
    }

    const tokenData = tokenDoc.data();
    const accessToken = tokenData.accessToken;

    if (!accessToken || accessToken.trim() === '') {
      return res.status(401).json({ message: 'Token de acceso inválido o vacío.' });
    }

    const commonParams = generateCommonParameters('jimi.open.instruction.send');

    const instParamJson = {
      inst_id: '416',
      inst_template: 'OPEN#',
      params: [],
      is_cover: 'true',
    };

    const payload = {
      ...commonParams,
      access_token: accessToken,
      imei,
      inst_param_json: JSON.stringify(instParamJson),
    };

    const response = await axios.post(process.env.JIMI_URL, payload, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (response.data && response.data.code === 0) {
      const result = response.data.result;

      if (result.includes('OPEN set OK')) {
        return res.status(200).json({ message: '¡Bicicleta desbloqueada correctamente!' });
      } else if (result.includes('OPEN command is not executed')) {
        return res.status(200).json({ message: 'La bicicleta ya está desbloqueada.' });
      } else {
        return res.status(500).json({ message: 'Respuesta desconocida del servidor.' });
      }
    } else {
      return res.status(500).json({ message: response.data.message || 'Error desconocido al desbloquear.' });
    }
  } catch (error) {
    console.error('Error al desbloquear la bicicleta:', error.message);
    return res.status(500).json({ message: 'Error al procesar la solicitud de desbloqueo.' });
  }
});
// Ruta para obtener localizciones de bicicletas
app.get('/api/bicycles', async (req, res) => {
  try {
    const bicycles = await db.collection('deviceLocations').get();
    const result = bicycles.docs.map((doc) => doc.data());
    res.json(result);
  } catch (error) {
    console.error('Error al obtener bicicletas:', error);
    res.status(500).json({ message: 'Error al obtener bicicletas.' });
  }
});

// Generacion de tokens en el servidor para desbloquear bicicletas
app.get('/api/token/:imei', async (req, res) => {
  const { imei } = req.params;

  if (!imei) {
    return res.status(400).json({ message: 'IMEI no proporcionado.' });
  }

  try {
    // Generar un token numérico de 4 dígitos
    const token = Math.floor(1000 + Math.random() * 9000); // Genera un número entre 1000 y 9999
    const expirationTime = Date.now() + 180 * 1000; // Validez de 180 segundos

    // Guardar el token en Firestore asociado al IMEI
    await db.collection('tokens').doc(imei).set({
      token: token.toString(),
      expirationTime,
    });

    res.json({ token: token.toString(), expirationTime });
  } catch (error) {
    console.error('Error al generar el token:', error.message);
    res.status(500).json({ message: 'Error al generar el token.' });
  }
});

// Configuración de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

app.post("/chatbot", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ message: "El mensaje es requerido." });
    }

    const stream = await openai.chat.completions.create({
      model: "gpt-4o", // Puedes usar "gpt-4o-mini" si prefieres
      messages: [{ role: "user", content: message }],
      stream: true, // ⚡ Streaming activado
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of stream) {
      res.write(chunk.choices[0]?.delta?.content || "");
    }

    res.end();
  } catch (error) {
    console.error("❌ Error en OpenAI:", error.message);
    res.status(500).json({ message: "Error en la comunicación con OpenAI." });
  }
});

// Configuracion twilio
async function sendMessage(body, to) {
  try {
    const response = await twilioClient.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    console.log(`✅ Mensaje enviado a ${to}: ${response.sid}`);
    return response;
  } catch (error) {
    console.error("❌ Error al enviar mensaje con Twilio:", error);
    throw new Error(`No se pudo enviar el mensaje. Detalles: ${error.message}`);
  }
}

// Ruta para chatbot con WhatsApp
// Ruta para chatbot con WhatsApp (WebHook de Twilio)
app.post("/webhook", async (req, res) => {
  const { Body, From } = req.body;

  if (!Body || !From) {
    console.error("❌ No se recibieron los datos esperados:", req.body);
    return res.status(400).json({ message: "Datos incompletos recibidos." });
  }

  console.log(`📩 Mensaje recibido de ${From}: ${Body}`);

  try {
    let responseMessage;

    // Comprobamos si el mensaje trata sobre un pago
    if (Body.toLowerCase().includes("pagar") || Body.toLowerCase().includes("alquilar bicicleta")) {
      console.log("🔍 Se detectó un mensaje relacionado con pagos.");

      // Datos de pago predefinidos (esto se puede personalizar con información del usuario)
      const userEmail = "usuario@ejemplo.com"; // Se puede obtener del usuario registrado
      const title = "Alquiler de bicicleta";
      const quantity = 1;
      const unitPrice = 500; // Precio de ejemplo

      // Generar la preferencia de pago en MercadoPago
      const preference = await createPreference(userEmail, title, quantity, unitPrice);

      responseMessage = `🚲 Para alquilar tu bicicleta, por favor realiza el pago aquí: ${preference.init_point}`;
    } else {
      // Si el mensaje no es sobre pagos, responde normalmente con OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: "Eres un asistente útil para Jinete.ar." },
          { role: "user", content: Body },
        ],
      });

      responseMessage = completion.choices[0].message.content.trim();
    }

    // Enviar respuesta al usuario por WhatsApp
    await sendMessage(responseMessage, From);

    res.status(200).send("Mensaje procesado correctamente.");
  } catch (error) {
    console.error("❌ Error al manejar el mensaje:", error.message);
    res.status(500).json({ message: "Error al procesar el mensaje." });
  }
});


//Stautus de twilio Callback
app.post('/api/twilio/status', (req, res) => {
  console.log("📦 Estado del mensaje recibido:", req.body);
  res.sendStatus(200);
});


// Usar la función en una ruta
app.post('/api/send-message', async (req, res) => {
  const { body, to } = req.body;

  if (!body || !to) {
    return res.status(400).json({ message: 'Faltan parámetros requeridos: body o to.' });
  }

  try {
    await sendMessage(body, to);
    res.status(200).json({ message: 'Mensaje enviado correctamente.' });
  } catch (error) {
    console.error('Error al enviar el mensaje:', error.message);
    res.status(500).json({ message: 'Error al enviar el mensaje.' });
  }
});


// Configuracion de Appcheck
/* app.use(async (req, res, next) => {
  const appCheckToken = req.header("X-Firebase-AppCheck");

  if (!appCheckToken) {
    return res.status(401).send("App Check token missing");
  }

  try {
    // Verifica el token de App Check
    const appCheckClaims = await admin.appCheck().verifyToken(appCheckToken);
    console.log("App Check token verified:", appCheckClaims);
    next(); // Continúa con la solicitud
  } catch (error) {
    console.error("App Check token invalid:", error);
    res.status(403).send("Unauthorized");
  }
});

// Define tus rutas
app.get("/protected-resource", (req, res) => {
  res.send("Acceso autorizado a App Check");
});*/



// Middleware global para manejar errores
app.use((err, req, res, next) => {
  console.error('❌ Error en middleware global:', err.stack);
  res.status(500).json({ message: 'Ocurrió un error inesperado.' });
});

//// Iniciar el servidor y realizar acciones iniciales
app.listen(port, async () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);

  console.log('⏳ Obteniendo token automáticamente al arrancar...');
  const tokenData = await fetchAndStoreToken(); // Llamar a la función para obtener el token automáticamente

  if (tokenData) {
    // Actualizar variables globales para el intervalo
    currentAccessToken = tokenData.accessToken;
    currentRefreshToken = tokenData.refreshToken;

    console.log('✅ Token inicial obtenido y configurado.');

    // Llamar a una función adicional (opcional)
    await fetchDeviceLocations(currentAccessToken); // Obtener ubicaciones al arrancar

    // Llamar a initializeIntegration para configurar el intervalo
    await initializeIntegration();
  } else {
    console.error('❌ Error al obtener el token automáticamente al arrancar.');
  }
});