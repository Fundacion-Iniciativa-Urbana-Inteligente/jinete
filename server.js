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
  options: { timeout: 15000 }, // Opciones generales del cliente
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
// Reemplaza tu createPreference original por esta versión
// que NO hace throw, sino que devuelve { error: boolean, message?: string, preference?: any }
async function createPreference(email, title, quantity, unitPrice) {
  const idempotencyKey = randomUUID(); // asumes que hiciste import { randomUUID } from 'crypto';
  const preference = new Preference(client); // tu config de MP

  try {
    console.log('Creando preferencia con los siguientes datos:', {
      email, title, quantity, unitPrice, idempotencyKey
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
        idempotencyKey,
      },
    });

    console.log('Respuesta completa de Mercado Pago:', response);

    if (!response || !response.init_point) {
      // No tenemos el link => devolvemos error sin lanzar excepción
      return { error: true, message: 'La respuesta de Mercado Pago no contiene init_point.' };
    }

    // Éxito => devolvemos la preferencia
    return { error: false, preference: response };

  } catch (error) {
    // Aquí detectamos si fue un timeout u otro problema
    console.error('❌ Error en createPreference:', error.message);

    // Si detectas texto "timeout" o "network" en el error
    if (error.message.includes('timeout')) {
      return { error: true, message: 'Timeout de Mercado Pago al crear la preferencia.' };
    }

    // error genérico
    return { error: true, message: error.message };
  }
}

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

// 📌 Función para obtener ubicaciones y actualizar `free_bike_status` en Firestore
async function fetchAndUpdateBikeStatus(accessToken) {
  console.log('⏳ Obteniendo ubicaciones de bicicletas y actualizando GBFS...');

  try {
    // Generar parámetros para la API de JIMI IoT
    const commonParams = generateCommonParameters('jimi.user.device.location.list');
    const privateParams = { access_token: accessToken, target: JIMI_USER_ID };

    const requestData = { ...commonParams, ...privateParams };

    // Hacer la solicitud a JIMI IoT
    const response = await axios.post(process.env.JIMI_URL, requestData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { data } = response;

    // 📌 Verificar si la respuesta es válida
    if (data.code !== 0 || !Array.isArray(data.result)) {
      console.error('❌ Error en la respuesta de JIMI IoT:', data);
      return false; // Retornar `false` si hay un error
    }

    const locations = data.result;

    if (locations.length === 0) {
      console.log('⚠️ No se encontraron bicicletas en JIMI IoT.');
      return false; // Retornar `false` si no hay bicicletas
    }

    console.log(`✅ ${locations.length} bicicletas obtenidas de JIMI IoT`);

    const batch = db.batch();

    // 📌 Convertir las actualizaciones en promesas para mejor rendimiento
    locations.forEach((location) => {
      const docRef = db.collection('free_bike_status').doc(location.imei);

      // 📌 Adaptamos los datos al esquema GBFS
      const bikeData = {
        bike_id: location.deviceName || location.imei, // Si `deviceName` es null, usar IMEI
        lat: location.lat || 0,  // Verificar valores nulos
        lon: location.lng || 0,  // Verificar valores nulos
        is_reserved: false,      // Valor fijo false por ahora
        is_disabled: false,      // Valor inicial false
        current_fuel_percent: location.batteryPowerVal ?? null, // Si no hay batería, dejar null
        currentMileage: location.currentMileage ?? null,        // Si no hay kilometraje, dejar null
        vehicle_type_id: "bicycle",    // Tipo de vehículo
        last_reported: Math.floor(Date.now() / 1000), // Timestamp actualizado
      };

      batch.set(docRef, bikeData);
    });

    // 📌 Guardar en Firestore con batch.commit()
    await batch.commit();
    console.log('✅ Datos de bicicletas actualizados en Firestore (free_bike_status)');

    return true; // Retornar `true` si la actualización fue exitosa
  } catch (error) {
    console.error('❌ Error en la obtención de ubicaciones:', error.message);
    return false; // Retornar `false` si hubo un error
  }
}


// Evitar duplicados
let integrationInitialized = false;

// 📌 Inicializar proceso de actualización automática
async function initializeIntegration() {
  if (integrationInitialized) {
    console.log("🚀 Integración ya inicializada, evitando duplicados.");
    return;
  }

  console.log('⏳ Inicializando integración con JIMI IoT y GBFS...');
  integrationInitialized = true;

  try {
    const tokenDoc = await db.collection('tokens').doc('jimi-token').get();
    if (!tokenDoc.exists) {
      console.error('❌ No se encontraron tokens en Firestore.');
      return;
    }

    const tokenData = tokenDoc.data();
    currentAccessToken = tokenData.accessToken;
    currentRefreshToken = tokenData.refreshToken;

    console.log('✅ Tokens cargados desde Firestore:', {
      currentAccessToken,
      currentRefreshToken,
    });

  } catch (error) {
    console.error('❌ Error al inicializar la integración:', error.message);
    return;
  }

  // 📌 Mover `setInterval()` fuera del `try` y asegurarse de que solo se ejecute una vez
  setInterval(async () => {
    console.log('⏳ Intentando actualizar token y obtener ubicaciones...');
    try {
      const tokenDoc = await db.collection('tokens').doc('jimi-token').get();

      if (!tokenDoc.exists) {
        console.error('❌ Error: No se encontró el token en Firestore.');
        return;
      }

      const tokenData = tokenDoc.data();
      if (!tokenData.accessToken || !tokenData.refreshToken) {
        console.error('❌ Error: Token en Firestore inválido.');
        return;
      }

      console.log('🔄 Usando refreshToken desde Firestore:', tokenData.refreshToken);

      const updatedToken = await refreshAccessToken(tokenData.refreshToken);

      if (updatedToken) {
        console.log('✅ Token actualizado correctamente.');
        await db.collection('tokens').doc('jimi-token').set(updatedToken);
        await fetchAndUpdateBikeStatus(updatedToken.accessToken);
      } else {
        console.error('❌ Error al actualizar el token.');
      }
    } catch (error) {
      console.error('❌ Error en la actualización automática:', error.message);
    }
  }, 30 * 1000); // 📌 Cada 30 segundos
}

// 📌 Ruta para desbloquear bicicleta
app.post('/api/unlock', async (req, res) => {
  const { imei } = req.body;

  if (!imei || typeof imei !== 'string') {
    return res.status(400).json({ message: 'IMEI inválido o no proporcionado.' });
  }

  try {
    // 📌 1️⃣ Obtener el token de JIMI IoT desde Firebase
    const tokenDoc = await db.collection('tokens').doc('jimi-token').get();
    if (!tokenDoc.exists) {
      return res.status(401).json({ message: 'Token de acceso no disponible. Intenta nuevamente.' });
    }

    const accessToken = tokenDoc.data().accessToken;
    if (!accessToken || accessToken.trim() === '') {
      return res.status(401).json({ message: 'Token de acceso inválido o vacío.' });
    }

    // 📌 2️⃣ Enviar la instrucción de desbloqueo a JIMI IoT
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
        // 📌 3️⃣ Marcar la bicicleta como desbloqueada en `free_bike_status`
        const bikeRef = db.collection('free_bike_status').doc(imei);
        await bikeRef.update({
          is_reserved: false,  // ✅ Marcar como disponible
          last_reported: Math.floor(Date.now() / 1000), // ✅ Actualizar timestamp
        });

        return res.status(200).json({ message: '🚲 ¡Bicicleta desbloqueada correctamente!' });
      } else if (result.includes('OPEN command is not executed')) {
        return res.status(200).json({ message: '⚠️ La bicicleta ya está desbloqueada.' });
      } else {
        return res.status(500).json({ message: '❌ Respuesta desconocida del servidor.' });
      }
    } else {
      return res.status(500).json({ message: response.data.message || '❌ Error desconocido al desbloquear.' });
    }
  } catch (error) {
    console.error('❌ Error al desbloquear la bicicleta:', error.message);
    return res.status(500).json({ message: '❌ Error al procesar la solicitud de desbloqueo.' });
  }
});

// 📌 Ruta para obtener la localización de las bicicletas en formato GBFS
app.get('/api/bicycles', async (req, res) => {
  try {
    const bicycles = await db.collection('free_bike_status').get();
    
    // Convertimos los documentos de Firestore en un array JSON
    const result = bicycles.docs.map((doc) => doc.data());

    // 📌 Formato GBFS
    res.json({
      last_updated: Math.floor(Date.now() / 1000),
      ttl: 60, // Tiempo de vida del cache (en segundos)
      data: { bikes: result }
    });

  } catch (error) {
    console.error('❌ Error al obtener bicicletas:', error);
    res.status(500).json({ message: 'Error al obtener bicicletas.' });
  }
});


// 📌 1️⃣ Endpoint GBFS principal (Index)
app.get("/gbfs.json", (req, res) => {
  res.json({
    last_updated: Math.floor(Date.now() / 1000),
    ttl: 60,
    data: {
      en: {
        feeds: [
          { name: "system_information", url: `${process.env.BASE_URL}/gbfs/system_information.json` },
          { name: "free_bike_status", url: `${process.env.BASE_URL}/gbfs/free_bike_status.json` },
          { name: "geofencing_zones", url: `${process.env.BASE_URL}/gbfs/geofencing_zones.json` },
          { name: "vehicle_types", url: `${process.env.BASE_URL}/gbfs/vehicle_types.json` },
          { name: "system_pricing_plans", url: `${process.env.BASE_URL}/gbfs/system_pricing_plans.json` }
        ]
      }
    }
  });
});

// 📌 2️⃣ Endpoint System Information
app.get("/gbfs/system_information.json", async (req, res) => {
  const doc = await db.collection("system_information").doc("main").get();
  if (!doc.exists) return res.status(404).json({ error: "No encontrado" });
  res.json({
    last_updated: Math.floor(Date.now() / 1000),
    ttl: 60,
    data: doc.data(),
  });
});

// 📌 3️⃣ Endpoint Free Bike Status (para Free-Floating)
app.get("/gbfs/free_bike_status.json", async (req, res) => {
  const bikes = await db.collection("free_bike_status").get();
  const data = bikes.docs.map((doc) => doc.data());

  res.json({
    last_updated: Math.floor(Date.now() / 1000),
    ttl: 60,
    data: { bikes: data },
  });
});

// 📌 4️⃣ Endpoint Geofencing Zones
app.get("/gbfs/geofencing_zones.json", async (req, res) => {
  const zones = await db.collection("geofencing_zones").get();
  const data = zones.docs.map((doc) => doc.data());

  res.json({
    last_updated: Math.floor(Date.now() / 1000),
    ttl: 60,
    data: { geofencing_zones: data },
  });
});

// 📌 5️⃣ Endpoint Vehicle Types
app.get("/gbfs/vehicle_types.json", async (req, res) => {
  const types = await db.collection("vehicle_types").get();
  const data = types.docs.map((doc) => doc.data());

  res.json({
    last_updated: Math.floor(Date.now() / 1000),
    ttl: 60,
    data: { vehicle_types: data },
  });
});

// 📌 6️⃣ Endpoint System Pricing Plans
app.get("/gbfs/system_pricing_plans.json", async (req, res) => {
  const plans = await db.collection("system_pricing_plans").get();
  const data = plans.docs.map((doc) => doc.data());

  res.json({
    last_updated: Math.floor(Date.now() / 1000),
    ttl: 60,
    data: { plans: data },
  });
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

async function interpretUserMessageWithGPT(userMessage) {
  try {
    // Prompts: system + user
    const systemPrompt = `
      Eres un asistente especializado en el alquiler de bicicletas de Jinete.ar.
      Tu tarea es extraer la intención del usuario y devolver la información en JSON.
      Posibles intenciones:
        - registro: El usuario quiere registrarse o no está en tu base de datos
        - alquilar: El usuario quiere iniciar el alquiler de una bicicleta
        - soporte: El usuario pide ayuda o soporte
        - ver_saldo: El usuario quiere consultar su saldo
        - recargar_saldo: El usuario quiere recargar saldo
        - fallback: No estás seguro de la intención

      Campos a retornar en JSON:
      {
        "intent": "una_de_las_intenciones_de_arriba",
        "bikeName": "si_intent=alquilar",
        "message": "opcional, si deseas mandar un texto final"
      }

      NO EXPLIQUES NADA, SOLO DEVUELVE ESTRICTAMENTE EL JSON.
    `;

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo", 
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.2
    });

    // GPT retornará un texto JSON; intentamos parsearlo
    const rawText = response.data.choices[0].message.content.trim();

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      console.warn("GPT no devolvió JSON válido. Mensaje crudo:", rawText);
      parsed = { intent: "fallback", message: rawText };
    }

    return parsed;
  } catch (error) {
    console.error("❌ Error interpretando mensaje con GPT:", error.message);
    return { intent: "fallback", message: "Hubo un error interpretando tu mensaje." };
  }
}


// 📌 Webhook de WhatsApp 
// Ejemplo de la parte "/webhook" que combina Regex + GPT + tu FSM
app.post("/webhook", async (req, res) => {
  const { Body, From } = req.body;
  if (!Body || !From) return res.status(400).json({ message: "Datos incompletos recibidos." });

  try {
    // 1) Verificar si el usuario escribió exactamente "Soporte"
    if (Body.toLowerCase().trim() === "soporte") {
      await sendMessage("📞 *Soporte de Jinete.ar* ...", From);
      return res.status(200).send("Mensaje de soporte enviado.");
    }

    // 2) Consultar si hay sesión activa
    const sessionRef = db.collection("users_session").doc(From);
    const sessionDoc = await sessionRef.get();

    if (sessionDoc.exists) {
      // => Ya estamos en un paso de la FSM => handleUserResponse
      return handleUserResponse(Body, From, res);
    }

    // 3) Verificar si el usuario existe en 'usuarios'
    const userRef = db.collection("usuarios").doc(From);
    const userDoc = await userRef.get();

    if (userDoc.exists && userDoc.data().validado) {
      // Usuario validado => Intentar regex
      const regex = /(?:alquilar la bicicleta|quiero alquilar) (.*)/i;
      const match = Body.match(regex);
      const selectedBike = match ? match[1].trim() : null;

      if (selectedBike) {
        // Iniciar el flujo de tokens
        await sessionRef.set({ step: "ask_tokens", selectedBike });
        await sendMessage(
          `Has elegido la bicicleta *${selectedBike}*. ¿Cuántos tokens deseas?`,
          From
        );
        return res.status(200).send("Flujo de alquiler iniciado.");
      }

      // Si la regex no matchea, intentamos GPT
      const gptResult = await interpretUserMessageWithGPT(Body);
      // Dependiendo de gptResult.intent => actúas
      // Ej. "alquilar", "ver_saldo", etc.
      // [Código de ejemplo GPT con switch de intenciones...]

      return res.status(200).send("GPT interpretó intención.");
    }

    // 4) Usuario NO existe => iniciar registro o GPT
    await sessionRef.set({ step: "ask_name" });
    await sendMessage(
      "No encontré tus datos. Vamos a registrarte. ¿Cuál es tu nombre?",
      From
    );
    return res.status(200).send("Inicia registro.");

  } catch (error) {
    console.error("Error en /webhook:", error);
    return res.status(500).json({ message: "Error interno." });
  }
});

export const handleUserResponse = async (Body, From, res) => {
  const sessionRef = db.collection("users_session").doc(From);
  const sessionDoc = await sessionRef.get();

  if (!sessionDoc.exists) {
    await sendMessage("No encontré tu sesión activa. Escribe 'Hola' para empezar.", From);
    return res.status(400).json({ message: "Sesión no encontrada o inválida." });
  }

  const { step, selectedBike } = sessionDoc.data();

  switch (step) {
    // ------------------ REGISTRO ------------------
    case "ask_name":
      await sessionRef.update({ name: Body, step: "ask_lastname" });
      await sendMessage("📝 Ahora dime tu *apellido*:", From);
      break;

    case "ask_lastname":
      await sessionRef.update({ lastName: Body, step: "ask_dni" });
      await sendMessage("🔢 Ahora ingresa tu *DNI*:", From);
      break;

    case "ask_dni":
      if (!/^\d+$/.test(Body)) {
        await sendMessage("Por favor ingresa solo números para el DNI:", From);
        return res.status(200).send("Pidiendo DNI numérico.");
      }
      await sessionRef.update({ dni: Body, step: "ask_email" });
      await sendMessage("✉️ Ahora ingresa tu *correo electrónico*:", From);
      break;

    case "ask_email":
      if (!/\S+@\S+\.\S+/.test(Body)) {
        await sendMessage("Formato de correo inválido. Intenta nuevamente:", From);
        return res.status(200).send("Formato email inválido.");
      }
      await sessionRef.update({ email: Body, step: "confirm_data" });
      const regData = sessionDoc.data();
      await sendMessage(
        `📝 Por favor, confirma tus datos:\n\n` +
        `👤 Nombre: ${regData.name}\n` +
        `📛 Apellido: ${regData.lastName}\n` +
        `🆔 DNI: ${regData.dni}\n` +
        `✉️ Email: ${Body}\n\n` +
        `Responde "Sí" para confirmar o "No" para corregir.`,
        From
      );
      break;

    case "confirm_data":
      if (Body.toLowerCase() === "sí" || Body.toLowerCase() === "si") {
        const finalRegData = sessionDoc.data();
        await db.collection("usuarios").doc(From).set({
          name: finalRegData.name,
          lastName: finalRegData.lastName,
          dni: finalRegData.dni,
          email: finalRegData.email,
          saldo: "0",
          validado: true // o false, como prefieras
        });
        await sessionRef.update({ step: "ask_bike" });
        await sendMessage("✅ Registro completado. ¿Qué bicicleta deseas alquilar? (Ej: 'bici Pegasus')", From);
      } else if (Body.toLowerCase() === "no") {
        // Reinicia
        await sessionRef.delete();
        await sendMessage("🚨 Registro cancelado. Escribe 'Hola' para comenzar de nuevo.", From);
      } else {
        await sendMessage("Por favor, responde 'Sí' o 'No'.", From);
      }
      break;

    case "ask_bike":
      // El usuario escribirá el nombre de la bici
      // "Pegasus", "Andes", etc.
      // Si no ingresa algo, fallback
      const bikeName = Body.trim();
      if (!bikeName) {
        await sendMessage("No te entendí. Dime el nombre de la bicicleta, por favor.", From);
        return res.status(200).send("Pidiendo nombre de bicicleta.");
      }
      // Iniciamos tokens
      await sessionRef.update({ step: "ask_tokens", selectedBike: bikeName });
      await sendMessage(
        `Has elegido la bicicleta *${bikeName}*. ¿Cuántos tokens deseas?`,
        From
      );
      break;

    // ------------------ ALQUILER ------------------
    case "ask_tokens":
      // El usuario responde la cantidad, p.ej. "2"
      const tokens = parseInt(Body, 10);
      if (isNaN(tokens)) {
        await sendMessage("Por favor ingresa un número válido de tokens.", From);
        return res.status(200).send("Pidiendo tokens.");
      }
      // p.ej. 250 ARS cada 15 min
      const tokenPrice = 250;
      const totalPrice = tokenPrice * tokens;

      await sessionRef.update({
        step: "confirm_payment",
        tokens,
        tokenPrice,
        totalPrice
      });
      await sendMessage(
        `El total a pagar por ${tokens} token(s) es *${totalPrice} ARS*.\n¿Confirmas la compra? (Sí/No)`,
        From
      );
      break;

      case "confirm_payment":
        if (Body.toLowerCase() === "sí" || Body.toLowerCase() === "si") {
          const data = sessionDoc.data();
          const userSnap = await db.collection("usuarios").doc(From).get();
          const userEmail = userSnap.exists ? userSnap.data().email : "soporte@jinete.ar";
          const paymentTitle = `Alquiler de ${data.selectedBike} - ${data.totalPrice} ARS`;
      
          // Llamamos a createPreference (ya modificada)
          // Fijate que ahora devuelves un objeto con { error, message, preference }
          const result = await createPreference(
            userEmail,
            paymentTitle,
            data.tokens,     // Cantidad
            data.tokenPrice  // Precio unitario
          );
      
          if (result.error) {
            // ❌ Hubo error => Notificar al usuario y permitir reintento
            console.log("Error al crear preferencia:", result.message);
      
            await sendMessage(
              "Lo siento, la plataforma de pago está teniendo demoras o falló la conexión. " +
              "Puedes volver a intentarlo más tarde o escribir 'Soporte' si necesitas ayuda.\n\n" +
              `Detalle del error: ${result.message}`,
              From
            );
      
            // Permaneces en el mismo paso "confirm_payment" para que el usuario pueda
            // responder "Sí" de nuevo en el futuro, o "No" para cancelar.
            // No hacemos sessionRef.delete().
            return res.status(200).send("Error al crear preferencia, reintento permitido.");
          }
      
          // Si NO hubo error => tenemos la preferencia
          const preference = result.preference;
      
          await sendMessage(
            `🚲 *Orden de pago generada.*\n\nRealiza el pago aquí: ${preference.init_point}`,
            From
          );
      
          // Avanzamos al siguiente step
          await sessionRef.update({ step: "awaiting_payment" });
          return res.status(200).send("Esperando pago MP.");
      
        } else if (Body.toLowerCase() === "no") {
          // Cancelación
          await sessionRef.delete();
          await sendMessage("🚨 Operación cancelada. Escribe 'Hola' para iniciar de nuevo.", From);
          return res.status(200).send("Proceso cancelado");
        } else {
          await sendMessage("Por favor, responde 'Sí' o 'No'.", From);
          return res.status(200).send("Esperando confirmación Sí/No");
        }
      
    case "awaiting_payment":
      // El usuario puede escribir algo => en principio fallback
      await sendMessage(
        "Estamos esperando la confirmación de tu pago. Si necesitas ayuda, responde 'Soporte'.",
        From
      );
      break;

    // ------------------ Fallback final ------------------
    default:
      await sendMessage(
        "Lo siento, no entendí tu respuesta. Si necesitas ayuda, responde con 'Soporte'.",
        From
      );
      break;
  }

  return res.status(200).send("OK");
};

/* 📌 Confirmar pago y enviar token de desbloqueo
app.post('/api/payment-confirmation', async (req, res) => {
  const { email, phone } = req.body;
  const userRef = db.collection('usuarios').doc(phone);
  const userDoc = await userRef.get();

  if (!userDoc.exists) return res.status(400).json({ message: "Usuario no encontrado." });

  await userRef.update({ validado: true });

  const token = Math.floor(1000 + Math.random() * 9000);
  await db.collection('tokens').doc(phone).set({ token: token.toString(), expiresAt: Date.now() + 180000 });

  await twilioClient.messages.create({ body: `🔓 Tu código de desbloqueo es: ${token}. Expira en 3 minutos.`, from: process.env.TWILIO_PHONE_NUMBER, to: phone });

  res.json({ message: "Pago confirmado y token enviado." });
});*/

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

async function fetchAndStoreTokenIfNeeded() {
  const tokenDoc = await db.collection('tokens').doc('jimi-token').get();
  if (tokenDoc.exists) {
    const tokenData = tokenDoc.data();
    const expirationTime = new Date(tokenData.time).getTime() + (tokenData.expiresIn * 1000);

    if (Date.now() < expirationTime - 60 * 1000) { // Margen de 1 minuto
      console.log('✅ Token en Firestore aún es válido. No se necesita renovar.');
      currentAccessToken = tokenData.accessToken;
      currentRefreshToken = tokenData.refreshToken;
      return tokenData;
    }
  }

  console.log("🔄 Token vencido o no encontrado, obteniendo uno nuevo...");
  return await fetchAndStoreToken();
}

// Middleware global para manejar errores
app.use((err, req, res, next) => {
  console.error('❌ Error en middleware global:', err.stack);
  res.status(500).json({ message: 'Ocurrió un error inesperado.' });
});

//// Iniciar el servidor y realizar acciones iniciales
app.listen(port, async () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);

  console.log('⏳ Obteniendo token automáticamente al arrancar...');
  const tokenData = await fetchAndStoreTokenIfNeeded();
  
  if (tokenData) {
    // Actualizar variables globales para el intervalo
    currentAccessToken = tokenData.accessToken;
    currentRefreshToken = tokenData.refreshToken;

    console.log('✅ Token inicial obtenido y configurado.');

    // Llamar a una función adicional (opcional)
    // await fetchDeviceLocations(currentAccessToken); // Obtener ubicaciones al arrancar

    // Llamar a initializeIntegration para configurar el intervalo
    if (!integrationInitialized) {
      integrationInitialized = true;
      await initializeIntegration();
    }
  } else {
    console.error('❌ Error al obtener el token automáticamente al arrancar.');
  }
});