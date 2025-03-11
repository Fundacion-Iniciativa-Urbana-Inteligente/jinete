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
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { spawn } from 'child_process';
import https from 'https';
import { initializeApp } from 'firebase/app';

let currentAccessToken = null;
let currentRefreshToken = null;

// (1) Detectar si estamos local o en la nube 
// (en Cloud Run, la variable de entorno K_SERVICE está definida)
const isLocal = !process.env.K_SERVICE; 
// Podrías usar: const isLocal = (process.env.NODE_ENV !== 'production'); 
// o bien: const isLocal = process.env.LOCAL === 'true';

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
  options: { timeout: 10000 }, // Opciones generales del cliente
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
      console.log('Detectado entorno en Google Cloud Run. Cargando credenciales desde Secret Manager...');
  
      // Verificar si la variable de entorno existe
      if (!process.env.SERVICE_ACCOUNT_KEY) {
          throw new Error('La variable de entorno SERVICE_ACCOUNT_KEY no está definida.');
      }
  
      // Parsear la variable de entorno (que viene como un string JSON)
      serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);
  
      // Validar que el objeto tiene las claves necesarias
      if (!serviceAccount.private_key || !serviceAccount.client_email) {
          throw new Error('Las credenciales del Service Account están incompletas.');
      }
  
      console.log('Credenciales cargadas exitosamente desde Secret Manager.');
    } catch (error) {
      console.error('Error al cargar el Service Account desde Secret Manager:', error.message);
      process.exit(1); // Detiene la ejecución si hay un error crítico
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

/* -------------------------------------------------------------------------- */
/*                  Funciones auxiliares Mercado Pago (createPreference)     */
/* -------------------------------------------------------------------------- */
async function createPreference(email, title, quantity, unitPrice, externalReference) {
  const idempotencyKey = randomUUID();
  const preference = new Preference(client); 

  try {
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
          success: `${process.env.VITE_BACKEND_URL}/mp/success`,
          failure: `${process.env.VITE_BACKEND_URL}/mp/failure`,
          pending: `${process.env.VITE_BACKEND_URL}/mp/pending`,
        },
        auto_return: 'approved',
        external_reference: JSON.stringify(externalReference), 
      },
      requestOptions: {
        idempotencyKey,
      },
    });

    if (!response || !response.init_point) {
      return { error: true, message: 'La respuesta de Mercado Pago no contiene init_point.' };
    }
    return { error: false, preference: response };

  } catch (error) {
    console.error('❌ Error al crear preferencia:', error.message);
    return { error: true, message: error.message };
  }
}

// --------------------------------------------------------------------------
// Rutas de Mercado Pago
// --------------------------------------------------------------------------
app.post('/api/mercadopago/create_payment', async (req, res) => {
  console.log('Solicitud para /api/mercadopago/create_payment, body:', req.body);

  const { userEmail, title, quantity, unitPrice } = req.body;

  if (!userEmail || !title || !quantity || !unitPrice) {
    console.error('❌ Error: Parámetros inválidos recibidos:', { userEmail, title, quantity, unitPrice });
    return res.status(400).json({ message: 'Parámetros inválidos' });
  }

  try {
    const preferenceObj = await createPreference(userEmail, title, quantity, unitPrice);
    if (preferenceObj.error) {
      return res.status(500).json({ message: 'Error al crear la preferencia de pago.' });
    }
    const preference = preferenceObj.preference;
    // Enviar al cliente el link de pago
    return res.json({ init_point: preference.init_point });
  } catch (error) {
    console.error('Error al crear la preferencia de pago:', error.message);
    return res.status(500).json({ message: 'Error al crear la preferencia de pago.' });
  }
});

app.get("/mp/success", async (req, res) => {
  try {
    const { payment_id, status, external_reference } = req.query;
    const parsedRef = JSON.parse(external_reference || "{}");
    const phone = parsedRef.phone;
    const docId = parsedRef.docId;

    console.log("💵 [SUCCESS] =>", { payment_id, status, phone, docId });

    // 🔹 Actualizar estado del pago en Firestore
    const paymentRef = db.collection("usuarios").doc(phone).collection("pagos").doc(docId);
    await paymentRef.update({ status: "approved", mpOrderId: payment_id, updatedAt: new Date().toISOString() });

    // 🔹 Actualizar saldo del usuario
    const paymentSnap = await paymentRef.get();
    const amount = parseFloat(paymentSnap.data().amount || 0);

    const userRef = db.collection("usuarios").doc(phone);
    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) return;
      const saldoActual = parseFloat(userDoc.data().saldo || "0");
      t.update(userRef, { saldo: (saldoActual + amount).toString() });
    });

    // 🔹 Enviar mensaje de confirmación por WhatsApp
    await sendMessage(
      `✔️ *Pago recibido:*\nTu recarga de *${amount} ARS* ha sido acreditada. ¡Gracias! 🎉`,
      phone
    );

    return res.send("Pago procesado correctamente.");
  } catch (error) {
    console.error("❌ Error en /mp/success:", error.message);
    return res.status(500).send("Error procesando el pago.");
  }
});


app.get("/mp/failure", async (req, res) => {
  const { phone, docId } = JSON.parse(req.query.external_reference || "{}");
  console.log("💵 [FAILURE] Pago fallido =>", { phone, docId });

  const paymentRef = db.collection("usuarios").doc(phone).collection("pagos").doc(docId);
  await paymentRef.update({ status: "failure", updatedAt: new Date().toISOString() });

  await sendMessage(`❌ Tu pago ha sido rechazado. Inténtalo nuevamente.`, phone);

  return res.send("Pago fallido procesado.");
});


app.get("/mp/pending", async (req, res) => {
  const { phone, docId } = JSON.parse(req.query.external_reference || "{}");
  console.log("💵 [PENDING] Pago pendiente =>", { phone, docId });

  const paymentRef = db.collection("usuarios").doc(phone).collection("pagos").doc(docId);
  await paymentRef.update({ status: "pending", updatedAt: new Date().toISOString() });

  await sendMessage(`⏳ Tu pago está pendiente. En cuanto se acredite, te avisaremos.`, phone);

  return res.send("Pago pendiente procesado.");
});


// --------------------------------------------------------------------------
// Funciones auxiliares para JIMI IoT
// --------------------------------------------------------------------------

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

  return params; 
}

/**
 * Obtiene un token inicial y lo guarda en Firestore.
 * Se llama una vez al arrancar (app.listen) si no hay token o si deseas forzar una obtención inicial
 */
async function fetchAndStoreToken() {
  console.log('⏳ Intentando obtener el token automáticamente...');
  try {
    const commonParams = generateCommonParameters('jimi.oauth.token.get');
    const privateParams = {
      user_id: process.env.JIMI_USER_ID,
      user_pwd_md5: crypto.createHash('md5').update(process.env.JIMI_USER_PWD).digest('hex'),
      expires_in: 7200, // Tiempo de expiración del token en segundos
    };
    const requestData = { ...commonParams, ...privateParams };

    const response = await axios.post(process.env.JIMI_URL, requestData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { data } = response;
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

// Función para refrescar el token con la API externa JIMI
async function refreshAccessToken(refreshToken) {
  console.log('⏳ Intentando actualizar el token con refreshToken:', refreshToken);
  try {
    const commonParams = generateCommonParameters('jimi.oauth.token.refresh');
    const privateParams = {
      access_token: currentAccessToken, // Token de acceso actual
      refresh_token: refreshToken,     
      expires_in: 7200,                
    };
    const requestData = { ...commonParams, ...privateParams };

    console.log('🔍 Parámetros de la solicitud para refresh:', requestData);

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

/** 
 * Obtiene el token actual desde Firestore 
 * (usado cuando estamos en local, en lugar de llamar a la API)
 */
async function getTokenFromFirestore() {
  console.log("⏳ [LOCAL] Leyendo token directo desde Firestore...");
  const tokenDoc = await db.collection('tokens').doc('jimi-token').get();
  if (tokenDoc.exists) {
    return tokenDoc.data(); 
  }
  return null;
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
        batch.set(docRef, location, { merge: true });
      });

      await batch.commit();
      console.log('✅ Ubicaciones guardadas en Firestore');

      // Llamar a updateFreeBikeStatus después de actualizar Firestore
      await updateFreeBikeStatus();
    } else {
      console.error('❌ Error al obtener ubicaciones:', data);
    }
  } catch (error) {
    console.error('❌ Error en la obtención de ubicaciones:', error.message);
  }
}

async function updateFreeBikeStatus() {
  console.log('⏳ Actualizando free_bike_status en Firestore...');

  try {
    const deviceLocationsRef = db.collection('deviceLocations');
    const snapshot = await deviceLocationsRef.get();

    if (snapshot.empty) {
      console.warn('⚠️ No hay datos en deviceLocations.');
      return;
    }

    // 1️⃣ **Obtener el estado actual de `free_bike_status`**
    const freeBikeStatusRef = db.collection('free_bike_status').doc('bikes_data');
    const freeBikeSnap = await freeBikeStatusRef.get();
    let currentBikes = {};

    if (freeBikeSnap.exists) {
      const data = freeBikeSnap.data();
      (data.bikes || []).forEach(bike => {
        currentBikes[bike.bike_id.toLowerCase().trim()] = {
          is_reserved: bike.is_reserved,
          is_disabled: bike.is_disabled
        };
      });
    }

    const bikes = [];

    snapshot.forEach((doc) => {
      const device = doc.data();
      const bikeId = device.deviceName || "desconocido";

      // 2️⃣ **Mantener el estado actual de `is_reserved` si ya estaba en `free_bike_status`**
      const previousState = currentBikes[bikeId] || {};
      
      bikes.push({
        bike_id: bikeId,
        current_mileage: device.currentMileage || 0,
        lat: device.lat || 0,
        lon: device.lng || 0,
        current_fuel_percent: device.electQuantity || 0,
        last_reported: Date.now(),
        is_reserved: previousState.is_reserved ?? false, // 🔥 Mantener el estado actual
        is_disabled: previousState.is_disabled ?? false, // 🔥 Mantener `is_disabled`
        vehicle_type_id: "bicycle",
      });
    });

    // 3️⃣ **Actualizar Firestore sin sobrescribir `is_reserved` incorrectamente**
    await freeBikeStatusRef.set({ bikes });

    console.log(`✅ ${bikes.length} bicicletas actualizadas en free_bike_status`);
  } catch (error) {
    console.error('❌ Error al actualizar free_bike_status:', error);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// Evitar doble inicialización
let integrationInitialized = false;

/**
 * Inicializa la lógica de integración:
 *   - Carga el token de Firestore (o lanza error si no existe).
 *   - Crea un intervalo cada 40s para refrescar token y actualizar ubicaciones.
 *   - Crea un intervalo cada 2min para checkLockStateAndFinishRides().
 */
async function initializeIntegration() {
  console.log('⏳ Inicializando integración...');

  try {
    // Leer token actual en Firestore
    const tokenDoc = await db.collection('tokens').doc('jimi-token').get();
    if (tokenDoc.exists) {
      const tokenData = tokenDoc.data();
      currentAccessToken = tokenData.accessToken;
      currentRefreshToken = tokenData.refreshToken;
      console.log('✅ Tokens cargados:', tokenData);
    } else {
      console.error('❌ No se encontraron tokens en Firestore.');
      return;
    }

    // (2) Intervalo (cada 40 seg) para refrescar/leer el token y actualizar ubicaciones
    setInterval(async () => {
      console.log('⏳ [Intervalo 40s] -> Actualizar token y ubicaciones...');
      try {
        let updatedToken;

        if (isLocal) {
          // ——— En LOCAL: leer directamente de Firestore
          updatedToken = await getTokenFromFirestore();
        } else {
          // ——— En la NUBE: refrescar con la API (openAPI/JIMI)
          updatedToken = await refreshAccessToken(currentRefreshToken);
        }

        if (updatedToken) {
          currentAccessToken = updatedToken.accessToken;
          currentRefreshToken = updatedToken.refreshToken;
          console.log('✅ Token actualizado correctamente.');

          // Actualizar ubicaciones
          await fetchDeviceLocations(currentAccessToken);
        } else {
          console.error('❌ Error al actualizar/leer el token en el intervalo de 40s.');
        }
      } catch (error) {
        console.error('❌ Error en el intervalo de 40s:', error.message);
      }
    }, 40 * 1000);

    // (3) Intervalo (cada 2 minutos) para chequear estado del candado
    setInterval(async () => {
      console.log('⏳ [Intervalo 2min] -> Verificar candados (lock state) y finalizar rides...');
      try {
        await checkLockStateAndFinishRides();
      } catch (error) {
        console.error('❌ Error en el intervalo de 2min:', error.message);
      }
    }, 2 * 60 * 1000);

  } catch (error) {
    console.error('❌ Error al inicializar la integración:', error.message);
  }
}

//📌 1️⃣ Endpoint GBFS principal (Index)
app.get("/gbfs.json", (req, res) => {
  res.json({
    last_updated: Math.floor(Date.now() / 1000),
    ttl: 60,
    data: {
      en: {
        feeds: [
          { name: "system_information", url: `${process.env.VITE_BACKEND_URL}/gbfs/system_information.json` },
          { name: "free_bike_status", url: `${process.env.VITE_BACKEND_URL}/gbfs/free_bike_status.json` },
          { name: "geofencing_zones", url: `${process.env.VITE_BACKEND_URL}/gbfs/geofencing_zones.json` },
          { name: "vehicle_types", url: `${process.env.VITE_BACKEND_URL}/gbfs/vehicle_types.json` },
          { name: "system_pricing_plans", url: `${process.env.VITE_BACKEND_URL}/gbfs/system_pricing_plans.json` }
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
  try {
    const docRef = db.collection("free_bike_status").doc("bikes_data");
    const docSnapshot = await docRef.get();

    if (!docSnapshot.exists) {
      return res.status(404).json({ error: "No data found" });
    }

    const data = docSnapshot.data();
    const bikes = data.bikes || []; // Asegurarse de que siempre sea un array

    res.json({
      last_updated: Math.floor(Date.now() / 1000),
      ttl: 60,
      version: "2.3",
      data: { bikes },
    });
  } catch (error) {
    console.error("❌ Error al obtener el feed de Free Bike Status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
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

/* -------------------------------------------------------------------------- */
/*                     Rutas de desbloqueo / rides  (JIMI)                    */
/* -------------------------------------------------------------------------- */
app.post('/api/unlock', async (req, res) => {
  try {
    console.log("🔹 Solicitud recibida:", req.body);
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Token de desbloqueo no proporcionado.' });
    }

    // 1️⃣ **Verificar el token en Firestore**
    const tokenRef = db.collection('unlock_tokens').doc(token);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      return res.status(400).json({ message: 'Token inválido o expirado.' });
    }

    const { userId, bikeId, expirationTime } = tokenDoc.data(); // 🚲 `bikeId` ya es el nombre de la bicicleta

    // 2️⃣ **Verificar si el token sigue siendo válido**
    if (!expirationTime || Date.now() > expirationTime) {
      await tokenRef.delete(); // 🔥 Eliminar token si está expirado
      return res.status(400).json({ message: 'Token expirado.' });
    }

    // 3️⃣ **Buscar la bicicleta en `free_bike_status` con `bike_id`**
    console.log(`🔍 Buscando bicicleta '${bikeId}' en 'free_bike_status'`);
    const freeBikeRef = db.collection('free_bike_status').doc('bikes_data');
    const freeBikeSnap = await freeBikeRef.get();

    if (!freeBikeSnap.exists) {
      return res.status(404).json({ message: 'No se encontró la lista de bicicletas en free_bike_status.' });
    }

    const data = freeBikeSnap.data();
    const bikesArray = data.bikes || [];

    // 🔹 Normalizar `bike_id` y buscar la bicicleta en `free_bike_status`
    const normalizedBikeId = bikeId.toLowerCase().trim();
    const index = bikesArray.findIndex(b => b.bike_id.toLowerCase().trim() === normalizedBikeId);

    if (index === -1) {
      console.log(`❌ No se encontró la bicicleta '${normalizedBikeId}' en free_bike_status.`);
      return res.status(404).json({ message: 'No se encontró la bicicleta en free_bike_status.' });
    }

    // 4️⃣ **Obtener el IMEI desde `deviceLocations` para desbloquear**
    console.log(`🔍 Buscando IMEI en 'deviceLocations' para bicicleta: ${bikeId}`);

    const deviceQuery = db.collection("deviceLocations").where("deviceName", "==", bikeId).limit(1);
    const deviceSnap = await deviceQuery.get();

    if (deviceSnap.empty) {
      console.log(`⚠️ No se encontró el IMEI para la bicicleta ${bikeId}.`);
      return res.status(404).json({ message: "No se encontró el IMEI de la bicicleta en deviceLocations." });
    }

    const imei = deviceSnap.docs[0].data().imei;
    console.log(`✅ IMEI obtenido: ${imei}`);

    // 5️⃣ **Obtener el `accessToken` de JIMI IoT**
    const jimiTokenDoc = await db.collection('tokens').doc('jimi-token').get();
    if (!jimiTokenDoc.exists) {
      return res.status(401).json({ message: 'Token de acceso a JIMI no disponible.' });
    }
    const accessToken = jimiTokenDoc.data().accessToken;

    // 6️⃣ **Construir payload e instrucción de apertura para JIMI IoT**
    const commonParams = generateCommonParameters('jimi.open.instruction.send');
    const instParamJson = {
      inst_id: '416',     // Depende de cómo configures tu candado
      inst_template: 'OPEN#',
      params: [],
      is_cover: 'true',
    };
    const payload = {
      ...commonParams,
      access_token: accessToken,
      imei: imei,  // ✅ Solo usamos IMEI aquí
      inst_param_json: JSON.stringify(instParamJson),
    };

    // 7️⃣ **Enviar solicitud a JIMI IoT para abrir**
    console.log(`🚀 Enviando solicitud de apertura a JIMI IoT para IMEI ${imei}`);
    const response = await axios.post(process.env.JIMI_URL, payload, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!response.data || response.data.code !== 0) {
      console.log("❌ Error en la solicitud a JIMI IoT.");
      return res.status(500).json({ message: 'Error en la solicitud a JIMI IoT.' });
    }

    const result = response.data.result;
    if (!result.includes('OPEN set OK')) {
      console.log("⚠️ No se pudo confirmar la apertura del candado.");
      return res.status(500).json({ message: 'No se pudo confirmar la apertura del candado.' });
    }

    console.log("✅ Bicicleta desbloqueada correctamente.");

    // 8️⃣ **Actualizar `free_bike_status`**
    const startLat = bikesArray[index].lat || 0;
    const startLon = bikesArray[index].lon || 0;
    bikesArray[index].is_reserved = true;

    await freeBikeRef.update({ bikes: bikesArray });

    console.log(`✅ Bicicleta '${normalizedBikeId}' reservada en free_bike_status.`);

    // 9️⃣ **Crear documento “viaje” con estado "iniciado"**
    const ridesRef = db.collection('rides');
    const newRideRef = ridesRef.doc();

    await newRideRef.set({
      rideId: newRideRef.id,
      userId: userId,
      bikeId: normalizedBikeId,
      imei: imei,  // ✅ Ahora guardamos el `IMEI` en `rides`
      status: 'iniciado',
      startTime: new Date().toISOString(),
      startLat: startLat,
      startLon: startLon
    });

    console.log(`✅ Viaje iniciado para bicicleta '${normalizedBikeId}'.`);

    // 🔟 **Eliminar el token después de su uso**
    await tokenRef.delete();
    console.log("🗑️ Token eliminado después del uso.");

    return res.status(200).json({ message: 'Bicicleta desbloqueada y viaje iniciado.' });

  } catch (error) {
    console.error("❌ Error en /api/unlock:", error);
    return res.status(500).json({
      message: 'Error en el proceso de desbloqueo.',
      error: error.message
    });
  }
});


/* -------------------------------------------------------------------------- */
/*                     Rutas de desbloqueo / Gerenacion de token              */
/* -------------------------------------------------------------------------- */
app.get('/api/token/:bikeId/:userId', async (req, res) => {
  const { bikeId, userId } = req.params;

  if (!bikeId || !userId) {
    return res.status(400).json({ message: 'bikeId y userId son requeridos.' });
  }

  try {
    // 1️⃣ **Buscar el IMEI en `deviceLocations` usando el `bike_id`**
    console.log(`🔍 Buscando IMEI para bicicleta: ${bikeId}`);
    const deviceQuery = db.collection("deviceLocations").where("deviceName", "==", bikeId).limit(1);
    const deviceSnap = await deviceQuery.get();

    if (deviceSnap.empty) {
      console.log(`⚠️ No se encontró el IMEI para la bicicleta: ${bikeId}`);
      return res.status(404).json({ message: "No se encontró un IMEI asociado a la bicicleta." });
    }

    const imei = deviceSnap.docs[0].data().imei;
    console.log(`✅ La bicicleta ${bikeId} tiene IMEI: ${imei}`);

    // 2️⃣ **Generar un token de 4 dígitos**
    const token = Math.floor(1000 + Math.random() * 9000).toString();
    const expirationTime = Date.now() + 180 * 1000; // Expira en 3 minutos

    // 3️⃣ **Guardar en Firestore la relación token ↔ usuario ↔ bicicleta**
    const tokenData = {
      userId: userId,
      bikeId: bikeId, // ✅ Guardamos el `bike_id`, NO el IMEI
      expirationTime: expirationTime, // ⏳ Tiempo de expiración en Firestore
    };

    await db.collection('unlock_tokens').doc(token).set(tokenData);
    console.log(`🔐 Token generado: ${token} para bicicleta: ${bikeId}`);

    // 4️⃣ **Retornar el token al cliente**
    return res.status(200).json({ token, expirationTime });

  } catch (error) {
    console.error('❌ Error generando el token de desbloqueo:', error.message);
    return res.status(500).json({ message: 'Error al generar el token de desbloqueo.' });
  }
});


// --------------------------------------------------------------------------
// checkLockStateAndFinishRides => finaliza rides si se detecta candado cerrado
// --------------------------------------------------------------------------
async function checkLockStateAndFinishRides() {
  try {
    const ridesSnap = await db
      .collection('rides')
      .where('status', '==', 'iniciado')
      .get();
    
    if (ridesSnap.empty) return; // No hay viajes en curso

    for (const rideDoc of ridesSnap.docs) {
      const rideData = rideDoc.data();
      const { rideId, userId, bikeId, imei, startTime } = rideData; // ✅ Ahora `imei` ya está en `rides`

      if (!imei) {
        console.error(`⚠️ No se encontró IMEI para la bicicleta: ${bikeId}`);
        continue;
      }

      console.log(`🔍 Verificando estado del candado para IMEI: ${imei}`);

      // 1️⃣ **Construir payload para STATUS#**
      const commonParams = generateCommonParameters('jimi.open.instruction.send');
      const instParamJson = {
        inst_id: '418',
        inst_template: 'STATUS#',
        params: [],
        is_cover: 'false',
      };

      // 2️⃣ **Obtener el `accessToken` de JIMI IoT**
      let jimiTokenDoc = await db.collection('tokens').doc('jimi-token').get();
      if (!jimiTokenDoc.exists) {
        console.log("❌ No hay token de JIMI IoT al verificar candado. Se intentará refrescar.");
        const refreshedToken = await refreshAccessToken(currentRefreshToken);
        if (!refreshedToken) continue;
        currentAccessToken = refreshedToken.accessToken;
      } else {
        currentAccessToken = jimiTokenDoc.data().accessToken;
      }

      const payload = {
        ...commonParams,
        access_token: currentAccessToken,
        imei: imei,  // ✅ Ahora usamos IMEI directamente desde `rides`
        inst_param_json: JSON.stringify(instParamJson),
      };

      // 3️⃣ **Llamar a JIMI IoT**
      try {
        const response = await axios.post(process.env.JIMI_URL, payload, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (!response.data || response.data.code !== 0) {
          console.log(`❌ Error en STATUS# para IMEI ${imei}:`, response.data);
          continue;
        }

        const result = response.data.result.toLowerCase();


        // 4️⃣ **Detectar estado del candado con expresiones regulares**
        const isLocked = /\block state;/.test(result);
        const isUnlocked = /\bunlock state;/.test(result);

        if (isLocked && !isUnlocked) { 
          console.log(`🔒 Se detectó candado cerrado para rideId=${rideId}. Finalizando...`);
          
          // 5️⃣ **Finalizar el viaje** (Ahora `finalizeRide` recibe `startTime`)
          await finalizeRide(rideId, userId, bikeId, startTime);

        } else if (isUnlocked) { 
          console.log(`🔓 Candado sigue abierto para rideId=${rideId}. No finaliza el viaje.`);

        } else {
          console.log(`⚠️ Estado desconocido en respuesta de JIMI IoT: ${result}`);
        }

      } catch (error) {
        console.error(`❌ Error en STATUS# para IMEI ${imei}:`, error.response?.data || error.message);
      }
    }
  } catch (error) {
    console.error("❌ Error en checkLockStateAndFinishRides:", error.message);
  }
}



/**
 * Finaliza el viaje => 
 *   - Consulta tarifas en system_pricing_plans/pricing_plans_1
 *   - Lee ubicación final de la bici en free_bike_status
 *   - Actualiza rides => status final, endLat, endLon, duración, costo total
 *   - Inserta un doc de "débito" en la subcolección del usuario
 *   - Actualiza saldo del usuario
 *   - Envía mensaje Twilio con el costo y nuevo saldo
 *   - Deja la bici en is_reserved = false
 */
async function finalizeRide(rideId, userId, bikeId, startTime) {
  try {
    console.log(`🔍 Finalizando viaje: rideId=${rideId}, bikeId=${bikeId}, startTime=${startTime}`);

    // 1️⃣ **Obtener la info de precios**
    const planRef = db.collection('system_pricing_plans').doc('pricing_plans_1');
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      console.error("❌ No se encontró el doc 'pricing_plans_1' en system_pricing_plans");
      return;
    }
    const planData = planSnap.data();
    const basePrice = parseFloat(planData.price) || 0;      
    const ratePerMin = parseFloat(planData.per_min_pricing.rate) || 0; 

    // 2️⃣ **Calcular duración y costo**
    const endTime = new Date();
    const startDateTime = new Date(startTime);
    
    if (isNaN(startDateTime.getTime())) {
      console.error("❌ Error: 'startTime' no es una fecha válida.", startTime);
      return;
    }

    const durationMinutes = Math.max(1, Math.ceil((endTime - startDateTime) / 60000)); // 🔥 Asegurar al menos 1 minuto
    const totalCost = basePrice + (ratePerMin * durationMinutes);
    
    console.log(`⏳ Duración del viaje: ${durationMinutes} min | Costo total: $${totalCost}`);

    // 3️⃣ **Leer la ubicación final de la bici en `free_bike_status`**
    const freeBikeRef = db.collection('free_bike_status').doc('bikes_data');
    const freeBikeSnap = await freeBikeRef.get();
    if (!freeBikeSnap.exists) {
      console.error("❌ No se encontró doc 'bikes_data' en free_bike_status para obtener ubicación final.");
      return;
    }

    const data = freeBikeSnap.data();
    const bikesArray = data.bikes || [];
    const index = bikesArray.findIndex(b => b.bike_id.toLowerCase().trim() === bikeId.toLowerCase().trim());
    if (index === -1) {
      console.error("❌ No se encontró la bicicleta en free_bike_status para obtener endLat/endLon.");
      return;
    }

    const endLat = bikesArray[index].lat || 0;
    const endLon = bikesArray[index].lon || 0;

    // Liberar la bici
    bikesArray[index].is_reserved = false;
    await freeBikeRef.update({ bikes: bikesArray });

    // 4️⃣ **Actualizar ride => status: finalizado + posición final + duración + costo**
    const rideRef = db.collection('rides').doc(rideId);
    await rideRef.update({
      status: 'finalizado',
      endTime: endTime.toISOString(),
      durationMinutes,
      totalCost,
      endLat,
      endLon
    });

    console.log(`✅ Viaje ${rideId} finalizado. Costo: $${totalCost}`);

    // 5️⃣ **Registrar “débito” en la subcolección del usuario**
    const userRef = db.collection('usuarios').doc(userId);
    const debitosRef = userRef.collection('debitos');
    const newDebitoRef = debitosRef.doc(); 
    await newDebitoRef.set({
      id: newDebitoRef.id,
      rideId,
      amount: totalCost,
      date: endTime.toISOString(),
      concepto: "Alquiler de bicicleta"
    });

    // 6️⃣ **Actualizar saldo del usuario**
    let saldoActualizado = 0;
    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) return;
      const userData = userDoc.data();
      const saldoActual = parseFloat(userData.saldo || "0");
      saldoActualizado = saldoActual - totalCost;
      t.update(userRef, { saldo: saldoActualizado.toString() });
    });

    console.log(`💰 Saldo actualizado: $${saldoActualizado}`);

    // 🔹 **Resetea la sesión del usuario a menu_main**
    const sessionRef = db.collection("users_session").doc(userId);
    await sessionRef.set({ step: "menu_main" }, { merge: true });

    // 7️⃣ **Notificar usuario por Twilio**
    await sendMessage(
      `🚲 ¡Tu viaje ha finalizado!\nDuración: ${durationMinutes} min.\nCosto total: $${totalCost}.\n` +
      `Tu saldo actual es: $${saldoActualizado}.\nEscribe *'Menu'* para ver opciones.`,
      userId
    );

    console.log(`✅ Notificación enviada: Viaje ${rideId} finalizado. Costo: $${totalCost}, Nuevo saldo: $${saldoActualizado}`);

  } catch (error) {
    console.error("❌ Error finalizando viaje:", error.message);
  }
}

// --------------------------------------------------------------------------
// OpenAI Chatbot
// --------------------------------------------------------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
async function handleChatbot(userMessage) {
  const systemPrompt = `
  Eres un asistente para Jinete.ar, la plataforma de alquiler de bicicletas.
  - Responde en español.
  - Entiende y responde preguntas sobre: registro, alquiler de bicicletas, soporte técnico, saldo y tarifas.
  - Si el usuario menciona "tarifas", proporciona la siguiente información:

    📌 *Tarifas de Jinete.ar*
    🔹 *Costo del Token:* 500 pesos argentinos para generar un token único que permite abrir el candado.
    🔹 *Tarifa por minuto:* 10 pesos por minuto de uso.
    🔹 *Elige tu bicicleta en:* (https://jinete-ar.web.app/)
    
    ⚠️ *Importante:* El token tiene una validez de 3 minutos antes de que expire.
  
  - Si no estás seguro, sugiere escribir 'menu' para ver las opciones disponibles.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.5,
      max_tokens: 200,
    });

    if (response.choices && response.choices.length > 0) {
      return response.choices[0].message.content;
    } else {
      // Manejar caso de ausencia de choices
      return "Lo siento, no pude obtener una respuesta de OpenAI.";
    }

  } catch (error) {
    console.error("❌ Error en OpenAI:", error.message);
    // Respuesta de fallback
    return "Lo siento, hubo un problema con el soporte. Intenta más tarde o contacta a un agente humano al +549-376-487-6249.";
  }
}

// --------------------------------------------------------------------------
// Twilio
// --------------------------------------------------------------------------
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

async function processRecarga(From, res) {
  try {
    const sessionRef = db.collection("users_session").doc(From);
    const sessionSnap = await sessionRef.get();
    const sessionData = sessionSnap.data();

    if (!sessionData || !sessionData.recarga) {
      await sendMessage("Ocurrió un error con el monto ingresado. Escribe 'menu' para volver a las opciones.", From);
      return res.status(400).send("Error en monto de recarga");
    }

    const monto = parseFloat(sessionData.recarga);
    if (isNaN(monto) || monto <= 0) {
      await sendMessage("❌ El monto ingresado no es válido. Escribe 'menu' para volver al menú principal.", From);
      return res.status(400).send("Monto inválido");
    }

    const userSnap = await db.collection("usuarios").doc(From).get();
    if (!userSnap.exists) {
      await sendMessage("No encontramos tu usuario en nuestra base de datos. Regístrate con la opción '1'.", From);
      return res.status(200).send("Usuario no registrado");
    }

    const userData = userSnap.data();
    const userEmail = userData.email || "soporte@jinete.ar";

    const pagosRef = db.collection("usuarios").doc(From).collection("pagos");
    const newPaymentDoc = pagosRef.doc();
    const docId = newPaymentDoc.id;

    const result = await createPreference(
      userEmail,
      "Recarga de saldo",
      1,
      monto,
      { phone: From, docId }
    );

    if (result.error) {
      await sendMessage("Hubo un problema al generar el link de pago. Inténtalo más tarde o escribe *menu* para regresar.", From);
      return res.status(200).send("Error al crear preferencia MP");
    }

    const preference = result.preference;
    const initPoint = preference.init_point;

    await newPaymentDoc.set({
      amount: monto,
      concepto: "Recarga de saldo",
      currency: "ARS",
      metodo: "MercadoPago",
      mpOrderId: preference.id || "",
      status: "pending",
      timestamp: new Date().toISOString(),
      initPoint,
    });

    await sendMessage(
      `✅ *Recarga generada*\n💰 Monto: *${monto} ARS*\n🔗 Link de pago: ${initPoint}\n\n` +
      `📌 *IMPORTANTE:* Una vez que completes el pago, tu saldo se actualizará automáticamente.`,
      From
    );

    await sessionRef.update({ step: "await_payment", recarga: monto });

    return res.status(200).send("Recarga solicitada y esperando pago.");
  } catch (error) {
    console.error("❌ Error en processRecarga:", error);
    await sendMessage("Ocurrió un problema con la recarga. Inténtalo nuevamente.", From);
    return res.status(500).send("Error en processRecarga");
  }
}

async function sendMainMenu(to) {
  const text = `*Menú principal*\nSelecciona una opción respondiendo con el número correspondiente:\n\n` +
                     `1️⃣ Desbloquear bicicleta\n` +
                     `2️⃣ Consultas y soporte\n` +
                     `3️⃣ Ver billetera y saldo\n` +
                     `4️⃣ Informar problemas\n\n` +
                     `Escribe el número de la opción que deseas elegir.`;

                     await sendMessage(text, to); // Envía el mensaje al usuario
                    }
/* -------------------------------------------------------------------------- */
/*             Lógica para Chatbot y Menú Principal (webhook)                 */
/* -------------------------------------------------------------------------- */
app.post("/webhook", async (req, res) => {
  const { Body, From } = req.body;
  if (!Body || !From) return res.status(400).json({ message: "Datos incompletos recibidos." });

  const greetingRegex = /^\s*(?:hola|holi|buenas|buen\s?dia|buenos días|buenas tardes|buenas noches|hey|hi)\b[\s!.,]*$/i; 
  
  if (greetingRegex.test(Body)) {
    await sendMessage(
      "¡Hola! Bienvenido/a a Jinete.ar. Escribe *'Menu'* para ver las opciones o dime directamente qué necesitas.",
      From
    );
    return res.status(200).send("Mensaje de bienvenida enviado");
  }

  const regexAlquilar = /hola,\s*quiero\s*alquilar\s+(.+)/i;
  const match = Body.match(regexAlquilar);
  
  if (match) {
    let bikeName = match[1].trim().toLowerCase(); // 🔹 Convertimos el nombre a minúsculas para evitar errores de coincidencia
  
    // 🔹 Traemos todas las bicicletas desde `free_bike_status`
    const freeBikeRef = db.collection("free_bike_status").doc("bikes_data");
    const freeBikeSnap = await freeBikeRef.get();
  
    if (!freeBikeSnap.exists) {
      await sendMessage(
        "❌ No se encontró la lista de bicicletas en el sistema. Intenta más tarde.",
        From
      );
      return res.status(200).send("Error: No se encontró 'bikes_data'");
    }
  
    const data = freeBikeSnap.data();
    const bikesArray = data.bikes || [];
  
    // 🔹 Buscamos la bicicleta dentro del array
    let bikeObj = bikesArray.find(b => b.bike_id.toLowerCase().trim() === bikeName);
  
    if (!bikeObj) {
      await sendMessage(
        `No encontré una bicicleta con el nombre "${bikeName}". Por favor, revisa en https://jinete-ar.web.app/.`,
        From
      );
      return res.status(200).send("Bicicleta no encontrada");
    }
  
    // 🔹 Validamos si la bicicleta está en uso (is_reserved = true)
    if (bikeObj.is_reserved) {
      await sendMessage(
        `🚲 La bicicleta "${bikeName}" ya está en uso por otro jinete. Prueba con otra bicicleta disponible en https://jinete-ar.web.app/.`,
        From
      );
      return res.status(200).send("Bicicleta en uso");
    }

    // 🔹 Guardamos SOLO el `bike_id` en la sesión del usuario
    const sessionRef = db.collection("users_session").doc(From);
    await sessionRef.set(
      {
        step: "request_dni",
        selectedBikeName: bikeObj.bike_id, // ✅ Guardamos solo el `bike_id`
      },
      { merge: true }
    );

    await sendMessage(
      `Para continuar con el alquiler de *${bikeObj.bike_id}*, envía tu número de DNI sin puntos, solo números.`,
      From
    );
    return res.status(200).send("Solicitud de DNI enviada");
  }
 
  // 🔹 Recuperamos la sesión del usuario
  const sessionRef = db.collection("users_session").doc(From);
  const sessionDoc = await sessionRef.get();
  
  if (sessionDoc.exists && sessionDoc.data().step === "request_dni") {
    const dni = Body.trim();
    const usersRef = db.collection("usuarios");
    const userQuery = await usersRef.where("dni", "==", dni).limit(1).get();
  
    if (userQuery.empty) {
      await sendMessage(
        "No encontramos tu DNI en la base de datos. Por favor, regístrate en https://jinete-ar.web.app/",
        From
      );
      return res.status(200).send("DNI no encontrado");
    }
  
    // 🔹 Resetea la sesión a menu_main
    await sessionRef.set({ step: "menu_main" }, { merge: true });
    await sendMessage("✅ ¡DNI verificado! Puedes continuar con el alquiler.", From);

    // 🔹 Enviar el menú automáticamente sin que el usuario tenga que escribir "Menu"
    await sendMainMenu(From);
    return res.status(200).send("DNI verificado y menú enviado");
  }

  if (Body.trim().toLowerCase() === "menu") {
    await sessionRef.set({ step: "menu_main" }, { merge: true });
    await sendMainMenu(From);
    return res.status(200).send("Menú forzado.");
  }

  if (!sessionDoc.exists) {
    await sessionRef.set({ step: "menu_main" });
    await sendMainMenu(From);
    return res.status(200).send("Nueva sesión, menú principal enviado.");
  }

  return handleUserResponse(Body, From, res);
});


export const handleUserResponse = async (Body, From, res) => {
  const sessionRef = db.collection("users_session").doc(From);
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    await sendMessage("No encontré tu sesión. Escribe 'Menu' para ver opciones.", From);
    return res.status(400).json({ message: "Sesión no encontrada." });
  }
  const { step, selectedBike } = sessionDoc.data();

  switch (step) {
    case "menu_main": {
      const option = Body.trim();
      switch (option) {
        case "1": {
          // 1️⃣ **Verificar que el usuario existe en Firestore**
          const userSnap = await db.collection("usuarios").doc(From).get();
          if (!userSnap.exists) {
            await sendMessage(
              "No encontramos tu DNI en la base de datos. Por favor, regístrate en https://jinete-ar.web.app/",
              From
            );
            return res.status(200).send("Usuario no registrado");
          }
        
          // 2️⃣ **Verificar saldo suficiente**
          const userData = userSnap.data();
          const saldoActual = parseFloat(userData.saldo || "0");
        
          // Obtener tarifa de desbloqueo
          const planDocRef = db.collection("system_pricing_plans").doc("pricing_plans_1");
          const planDoc = await planDocRef.get();
          if (!planDoc.exists) {
            console.error("❌ No se encontró el plan de precios 'pricing_plans_1'");
            await sendMessage("Problema consultando la tarifa. Intenta más tarde o contacta Soporte.", From);
            return res.status(200).send("Plan no encontrado");
          }
          const planData = planDoc.data();
          const bajadaDeBandera = parseFloat(planData.price || "500");
        
          if (saldoActual < bajadaDeBandera) {
            await sendMessage(
              `No tienes saldo suficiente. La bajada de bandera es de ${bajadaDeBandera} ${planData.currency || "ARS"}. ` +
              `Selecciona '3' para recargar saldo o escribe 'menu' para el menú principal.`,
              From
            );
            return res.status(200).send("Saldo insuficiente");
          }
        
          // 3️⃣ **Verificar que la sesión contenga la bicicleta elegida**
          const sessionRef2 = db.collection("users_session").doc(From);
          const sessionDoc2 = await sessionRef2.get();
          if (!sessionDoc2.exists) {
            await sendMessage(
              "No tienes bicicleta seleccionada. Escribe: 'Hola, quiero alquilar <nombre_bici>'.",
              From
            );
            return res.status(200).send("Sesión no encontrada");
          }
          const { selectedBikeName } = sessionDoc2.data(); // 🚲 Ahora solo trabajamos con `bike_id`
        
          if (!selectedBikeName) {
            await sendMessage(
              "No hay bicicleta seleccionada. Escribe: 'Hola, quiero alquilar <nombre_bici>'.",
              From
            );
            return res.status(200).send("No hay selectedBikeName");
          }
        
          // 4️⃣ **Verificar estado de la bicicleta en `free_bike_status`**
          const bikeSnap = await db.collection("free_bike_status").doc("bikes_data").get();
          if (!bikeSnap.exists) {
            await sendMessage(
              "No se encontró la lista de bicicletas. Escribe 'menu' para el menú principal.",
              From
            );
            return res.status(200).send("No bikes_data doc");
          }
        
          const bikeDataFull = bikeSnap.data();
          const bikesArray = bikeDataFull.bikes || [];
          const index = bikesArray.findIndex(b => b.bike_id === selectedBikeName);
          if (index === -1) {
            await sendMessage(
              `No encontré la bici *${selectedBikeName}* en la lista. Verifica el nombre o escribe 'menu' para volver.`,
              From
            );
            return res.status(200).send("Bici no encontrada en bikes_data");
          }
        
          const bikeObj = bikesArray[index];
          if (bikeObj.is_reserved === true || bikeObj.is_disabled === true) {
            await sendMessage(
              `Lo siento, la bicicleta *${selectedBikeName}* no está disponible.`,
              From
            );
            return res.status(200).send("Bicicleta reservada/deshabilitada");
          }
        
          // 5️⃣ **Generar token en el backend con `bike_id`**
          try {
            const tokenURL = `${process.env.VITE_BACKEND_URL}/api/token/${selectedBikeName}/${From}`;
            const response = await axios.get(tokenURL);
            const { token, expirationTime } = response.data;
        
            // 🔹 Convertir `expirationTime` a hora legible
            const expirationDate = new Date(expirationTime);
            const expirationHour = expirationDate.getHours().toString().padStart(2, '0');
            const expirationMinutes = expirationDate.getMinutes().toString().padStart(2, '0');
            const formattedExpiration = `${expirationHour}:${expirationMinutes}`;
        
            // 6️⃣ **Enviar token al usuario con la hora exacta de expiración**
            await sendMessage(
              `🔓 Tu token de desbloqueo para la bicicleta *${selectedBikeName}* es: *${token}*.\n` +
              `🔴 *Expira a las ${formattedExpiration}*.\n` +
              `¡Buen viaje! 🚲`,
              From
            );
        
            return res.status(200).send("Token enviado");
          } catch (error) {
            console.error("❌ Error generando token:", error.message);
            await sendMessage(
              "Hubo un problema generando el token de desbloqueo. Escribe 'menu' para volver.",
              From
            );
            return res.status(500).send("Error generando token");
          }
        }

        case "2": {
          await sessionRef.update({ step: "soporte_mode" });
          await sendMessage("Hola, soy Jinete.ar estoy para ayudarte. ¿En que puedo asistirte?", From);
          return res.status(200).send("Soporte");
        }

        case "3": {
          const userSnap = await db.collection("usuarios").doc(From).get();
        
          if (!userSnap.exists) {
            await sendMessage(
              "No encontramos tu DNI en la base de datos. Por favor, regístrate en https://jinete-ar.web.app/",
              From
            );
            return res.status(200).send("Usuario no registrado");
          }
        
          const { saldo } = userSnap.data();
        
          // 🔹 Enviar mensaje de saldo y opciones sin botones
          const saldoMessage = `💰 *Saldo disponible: ${saldo} ARS*\n\n` +
                               `Selecciona una opción respondiendo con el número correspondiente:\n` +
                               `1️⃣ Recargar 1000 ARS\n` +
                               `2️⃣ Recargar otro monto\n` +
                               `3️⃣ No, gracias\n\n` +
                               `Escribe el número de la opción que deseas elegir.`;
        
          await sendMessage(saldoMessage, From);
        
          // Guardamos el estado del usuario para la siguiente respuesta
          await sessionRef.update({ step: "ask_recarga_confirm" });
        
          return res.status(200).send("Saldo consultado y esperando confirmación de recarga");
        }
        
        case "4": {
          console.log(`🟢 [DEBUG] Opción 6 - Iniciando reporte para: ${From}`);
          await sessionRef.set({ step: "report_issue" }, { merge: true });
          await sendMessage("🔧 *Reporte de desperfectos*\n\n Un humano analizará el problema y te responderemos a la brevedad.\n Describe el problema encontrado:", From);
          return res.status(200).send("Modo reporte activado");
        }

        default: {
          console.log(`⚠️ No se reconoció el mensaje: ${Body}`);
          const chatbotResponse = await handleChatbot(Body);      
          if (chatbotResponse) {
            await sendMessage(chatbotResponse, From);
            return res.status(200).send("Respuesta generada por Chatbot.");
          } else {
            await sendMessage(
              "No entendí tu mensaje. Escribe 'menu' para ver opciones.",
              From
            );
            return res.status(200).send("Fallback sin respuesta válida.");
          }
        }
      }
    }

    case "soporte_mode": {
      try {
        const openaiResponse = await handleChatbot(Body);
        await sendMessage(openaiResponse, From);
        return res.status(200).send("Soporte responded");
      } catch (error) {
        console.error("Error en modo soporte:", error);
        await sendMessage("Ocurrió un error con el soporte. Escribe 'menu' para reiniciar.", From);
        return res.status(500).send("Soporte error");
      }
    }
   
    case "ask_recarga_confirm": {
      const userResponse = Body.trim();
    
      if (userResponse === "1") {
        await sessionRef.update({ step: "ask_recarga", recarga: 1000 });
        return await processRecarga(From, res);
      }
    
      if (userResponse === "2") {
        await sessionRef.update({ step: "ask_recarga_custom" });
        await sendMessage("¿Cuánto deseas recargar? Ingresa el monto en ARS. Ejemplo: 500", From);
        return res.status(200).send("Esperando monto de recarga");
      }
    
      if (userResponse === "3") {
        await sendMessage("Entendido, no realizaremos ninguna recarga. Si necesitas algo más, escribe *menu*.", From);
        await sessionRef.update({ step: null, recarga: null });
        return res.status(200).send("Recarga cancelada");
      }
    
      await sendMessage("Por favor, responde con *1* para recargar 1000 ARS, *2* para otro monto o *3* para cancelar.", From);
      return res.status(200).send("Opción inválida en ask_recarga_confirm");
    }
    case "ask_recarga_custom": {
      const monto = parseFloat(Body);
    
      if (isNaN(monto) || monto <= 0) {
        await sendMessage("Por favor, ingresa un monto válido en ARS. Ejemplo: 500", From);
        return res.status(200).send("Monto inválido");
      }
    
      await sessionRef.update({ step: "ask_recarga", recarga: monto });
      return await processRecarga(From, res);
    }
    case "ask_recarga": {
      return await processRecarga(From, res);
    }
            
    case "await_payment": {
      const userResponse = Body.trim().toLowerCase();
    
      if (userResponse.includes("listo") || userResponse === "verificar pago") {
        await sendMessage("🔍 Verificaremos el estado de tu pago. Un momento...", From);
        return res.status(200).send("Usuario solicita verificar pago");
      }
    
      if (userResponse.includes("cancelar")) {
        // 🔹 Buscar y cancelar el pago pendiente en Firestore
        const sessionSnap = await sessionRef.get();
        const sessionData = sessionSnap.data();
        const monto = sessionData?.recarga;
    
        const pagosRef = db.collection("usuarios").doc(From).collection("pagos");
        const pendingPaymentSnap = await pagosRef.where("status", "==", "pending").limit(1).get();
    
        if (!pendingPaymentSnap.empty) {
          const pendingDoc = pendingPaymentSnap.docs[0];
          await pendingDoc.ref.update({ status: "canceled" });
        }
    
        await sessionRef.update({ step: "menu_main", recarga: null });
        await sendMessage("❌ La recarga ha sido cancelada. Si necesitas algo más, escribe *menu* para volver al menú principal.", From);
        return res.status(200).send("Pago cancelado");
      }
    
      if (userResponse.includes("menu")) {
        await sessionRef.update({ step: "menu_main" });
        await sendMainMenu(From);
        return res.status(200).send("Usuario volvió al menú");
      }
    
      // 🔹 Si el usuario no escribe algo esperado, darle instrucciones claras
      await sendMessage(
        "⏳ *Tu pago sigue pendiente.*\n" +
        "Cuando hayas completado el pago, escribe *'listo'* para verificar.\n" +
        "Si deseas cancelar, responde con *'cancelar'*.\n" +
        "Para volver al menú, escribe *'menu'.*",
        From
      );
    
      return res.status(200).send("Esperando pago, instrucciones enviadas.");
    }

    case "report_issue": {
      console.log(`🟡 [DEBUG] Usuario en report_issue - Mensaje: ${Body}`);
      const reportDoc = db.collection("reportes_desperfectos").doc();
      const reportId = reportDoc.id;
      const reportData = {
        reportId,
        userId: From,
        issue: Body,
        status: "pendiente",
        createdAt: new Date().toISOString(),
      };
      await reportDoc.set(reportData);
      
      // 🔹 Resetea la sesión a menu_main
      await sessionRef.set({ step: "menu_main" }, { merge: true });
    
      await sendMessage("✅ ¡Reporte registrado! Nuestro equipo lo revisará y en menos de 30 minutos te responderemos. Escribe 'Menu' si necesitas algo más.", From);
    
      return res.status(200).send("Reporte guardado");
    } // ⬅️ Cierre correcto del case
    // 🔹 Cierre de switch

    // 🔥 ERROR: Aquí falta cerrar bien el switch antes del default
    default:
      await sendMessage(
        "No entendí tu opción. Escribe 'menu' para ver las opciones.",
        From
      );
      return res.status(200).send("Menú fallback");
    }
  };

// --------------------------------------------------------------------------
// Ruta de estatus Twilio (opcional)
app.post('/api/twilio/status', (req, res) => {
  console.log("📦 Estado del mensaje recibido:", req.body);
  res.sendStatus(200);
});

// Ruta para enviar mensaje manualmente
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

// ID CARD recognition
// ✅ Nuevo flujo: Registro rápido y análisis en background
app.post('/api/register-user', async (req, res) => {
  const { usuario, dni, telefono, aceptaTerminos, fotoFrente, fotoDorso, firma } = req.body;

  try {
    // ✅ Registrar usuario en Firestore con estado "pendiente"
    const userRef = db.collection("usuarios").doc(dni);  // Usar DNI como ID
    await userRef.set({
      usuario,
      dni,
      telefono,
      aceptaTerminos,
      fotoFrente,
      fotoDorso,
      firma,
      analisisDocumento: "pendiente"
    });

    // ✅ Responder inmediatamente
    res.status(200).json({ message: '✅ Usuario registrado exitosamente. El análisis se hará en background.' });

    // ✅ Lanzar análisis en segundo plano
    analizarDocumentoEnBackground(fotoFrente, dni);

  } catch (error) {
    console.error('❌ Error al registrar usuario:', error);
    res.status(500).json({ error: 'Error al registrar usuario.' });
  }
});


// ✅ Función para análisis en background
function analizarDocumentoEnBackground(imageUrl, dni) {
  const imagePath = `./temp_${dni}.jpg`;

  const file = fs.createWriteStream(imagePath);
  https.get(imageUrl, (response) => {
    if (response.statusCode !== 200) {
      console.error(`❌ Error al descargar imagen. Status: ${response.statusCode}`);
      return;
    }

    response.pipe(file);
    file.on('finish', () => {
      file.close();

      const python = spawn('.venv\\Scripts\\python.exe', ['analyze_document.py', imagePath, dni]);

      let data = '';
      let errorData = '';

      python.stdout.on('data', (chunk) => data += chunk.toString());
      python.stderr.on('data', (chunk) => errorData += chunk.toString());

      python.on('close', async (code) => {
        console.log('✅ STDERR (Python):', errorData);
        console.log('✅ STDOUT (Resultado JSON):', data);

        fs.unlink(imagePath, (err) => {
          if (err) console.error('❌ Error al borrar imagen temporal:', err);
          else console.log('🧹 Imagen temporal borrada.');
        });

        // ✅ Procesar JSON y actualizar Firestore
        const jsonMatch = data.match(/{[\s\S]*}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0];
          try {
            const result = JSON.parse(jsonStr);
            const userRef = db.collection("usuarios").doc(dni);
            await userRef.update({ analisisDocumento: result });
            console.log(`✅ Análisis completado para DNI: ${dni}`);
          } catch (e) {
            console.error('❌ JSON mal formado:', jsonStr);
          }
        } else {
          console.error('❌ No se encontró JSON válido en:', data);
        }
      });
    });
  }).on('error', (err) => {
    console.error('❌ Error al descargar imagen:', err.message);
  });
}


// 🗑️ Job programado para eliminar sesiones inactivas cada 24h
const clearOldSessions = async () => {
  console.log("🔍 Buscando sesiones inactivas...");
  const sessionsRef = db.collection("users_session");
  const snapshot = await sessionsRef.get();
  const now = Date.now();

  snapshot.forEach(async (doc) => {
    const data = doc.data();
    if (data.timestamp && now - data.timestamp > 24 * 60 * 60 * 1000) { // Más de 24 horas
      await doc.ref.delete();
      console.log(`🗑️ Sesión eliminada para ${doc.id} por inactividad.`);
    }
  });
};

// 🔄 Ejecutar cada 30 minutos
setInterval(clearOldSessions, 30 * 60 * 1000);

// --------------------------------------------------------------------------
// Iniciar el servidor y realizar acciones iniciales
// --------------------------------------------------------------------------
app.listen(port, async () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);

  console.log('⏳ Obteniendo token automáticamente al arrancar...');
  const tokenData = await fetchAndStoreToken();

  if (tokenData) {
    currentAccessToken = tokenData.accessToken;
    currentRefreshToken = tokenData.refreshToken;
    console.log('✅ Token inicial obtenido y configurado.');

    // Obtener ubicaciones al arrancar
    await fetchDeviceLocations(currentAccessToken);

    // Iniciar integración (intervalos)
    await initializeIntegration();
  } else {
    console.error('❌ Error al obtener el token automáticamente al arrancar.');
  }

  // 🧹 Primera ejecución inmediata para limpiar sesiones al iniciar
  await clearOldSessions();
});