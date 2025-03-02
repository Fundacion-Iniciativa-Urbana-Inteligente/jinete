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

    // 1) Actualizar en la subcolección a "approved"
    const paymentRef = db
      .collection("usuarios")
      .doc(phone)
      .collection("pagos")
      .doc(docId);

    await paymentRef.update({
      status: "approved",
      mpOrderId: payment_id,
      updatedAt: new Date().toISOString(),
    });

    // 2) Llamar a la API de MP para obtener datos del pago (incluyendo info de pagador)
    const mpResponse = await axios.get(
      `https://api.mercadopago.com/v1/payments/${payment_id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MERCADOPAGO_TOKEN}`,
        },
      }
    );

    const paymentInfo = mpResponse.data; 
    const payerEmail = paymentInfo?.payer?.email || "no-mail@unknown.com";
    const payerName = paymentInfo?.payer?.first_name || "Desconocido";
    const payerLastName = paymentInfo?.payer?.last_name || "";

    // 3) Guardar estos datos en el doc de la subcolección “pagos”
    await paymentRef.update({
      payerName: `${payerName} ${payerLastName}`.trim(),
      payerEmail,
    });

    // 4) Sumar el saldo, etc. (igual que antes)
    const paymentSnap = await paymentRef.get();
    const paymentData = paymentSnap.data();
    const amount = parseFloat(paymentData.amount || 0);

    // 5) Actualizar saldo del usuario
    const userRef = db.collection("usuarios").doc(phone);
    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) return; // el usuario no existe
      const userData = userDoc.data();
      const saldoActual = parseFloat(userData.saldo || "0");
      const nuevoSaldo = saldoActual + amount;
      t.update(userRef, { saldo: nuevoSaldo.toString() });
    });

    // 6) Notificar al usuario por WhatsApp
    await sendMessage(
      `✔️ ¡Gracias, ${payerName}! Se acreditó tu pago (ID ${payment_id}). Tu saldo fue actualizado.`,
      phone
    );

    // 7) Respuesta
    res.send(`
      <html>
        <body>
          <h1>¡Pago aprobado!</h1>
          <p>Se registró a nombre de ${payerName} (${payerEmail}). Puedes cerrar esta ventana.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("❌ Error en /mp/success:", error.message);
    res.status(500).send("Error procesando el pago.");
  }
});

app.get("/mp/failure", async (req, res) => {
  try {
    const { payment_id, status, external_reference } = req.query;
    const parsedRef = JSON.parse(external_reference || "{}");
    
    console.log("💵 [FAILURE] Pago fallido =>", { payment_id, status, parsedRef });
    
    // Actualiza el doc a "failure"
    const phone = parsedRef.phone;
    const docId = parsedRef.docId;
    const paymentRef = db.collection("usuarios").doc(phone).collection("pagos").doc(docId);

    await paymentRef.update({
      status: "failure",
      mpOrderId: payment_id || "",
      updatedAt: new Date().toISOString(),
    });

    // Notificar al usuario
    await sendMessage(`❌ Tu pago (ID ${payment_id}) falló o fue rechazado.`, phone);

    // Respuesta
    res.send(`
      <html>
        <body>
          <h1>Pago fallido</h1>
          <p>Intenta nuevamente más tarde.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("❌ Error en /mp/failure:", error.message);
    res.status(500).send("Error procesando el rechazo del pago.");
  }
});

app.get("/mp/pending", async (req, res) => {
  try {
    const { payment_id, status, external_reference } = req.query;
    const parsedRef = JSON.parse(external_reference || "{}");

    console.log("💵 [PENDING] Pago pendiente =>", { payment_id, status, parsedRef });

    // Actualizar doc => status: "pending"
    const phone = parsedRef.phone;
    const docId = parsedRef.docId;
    const paymentRef = db.collection("usuarios").doc(phone).collection("pagos").doc(docId);

    await paymentRef.update({
      status: "pending",
      mpOrderId: payment_id || "",
      updatedAt: new Date().toISOString(),
    });

    // Notificar al usuario (opcional)
    await sendMessage(`⏳ Tu pago (ID ${payment_id}) está pendiente.`, phone);

    res.send(`
      <html>
        <body>
          <h1>Pago pendiente</h1>
          <p>Por favor, espera la confirmación.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("❌ Error en /mp/pending:", error.message);
    res.status(500).send("Error procesando el pago pendiente.");
  }
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

    const bikes = [];

    snapshot.forEach((doc) => {
      const device = doc.data();

      // Intentar obtener datos previos del documento
      const existingData = doc.data() || {};

      bikes.push({
        bike_id: device.deviceName || "Desconocido",
        current_mileage: device.currentMileage || 0,
        lat: device.lat || 0,
        lon: device.lng || 0,
        current_fuel_percent: device.electQuantity || 0,
        last_reported: Date.now(),
        is_reserved: existingData.is_reserved ?? false,
        is_disabled: existingData.is_disabled ?? false,
        vehicle_type_id: "bicycle",
      });
    });

    const freeBikeStatusRef = admin.firestore().collection('free_bike_status').doc('bikes_data');
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

    // 1) Verificar token en Firestore
    const tokenRef = db.collection('unlock_tokens').doc(token);
    const tokenDoc = await tokenRef.get();
    
    if (!tokenDoc.exists) {
      return res.status(400).json({ message: 'Token inválido o expirado.' });
    }

    const { userId, bikeId, expirationTime } = tokenDoc.data();

    // 2) Verificar vigencia del token
    if (Date.now() > expirationTime) {
      return res.status(400).json({ message: 'Token expirado.' });
    }

    // 3) Tomar el accessToken de JIMI
    const jimiTokenDoc = await db.collection('tokens').doc('jimi-token').get();
    if (!jimiTokenDoc.exists) {
      return res.status(401).json({ message: 'Token de acceso a JIMI no disponible.' });
    }
    const accessToken = jimiTokenDoc.data().accessToken;

    // 4) Construir payload e instrucción de apertura
    const commonParams = generateCommonParameters('jimi.open.instruction.send');
    const instParamJson = {
      inst_id: '416',     // depende de cómo configures tu candado
      inst_template: 'OPEN#',
      params: [],
      is_cover: 'true',
    };
    const payload = {
      ...commonParams,
      access_token: accessToken,
      imei: bikeId,
      inst_param_json: JSON.stringify(instParamJson),
    };

    // 5) Enviar solicitud a JIMI IoT para abrir
    const response = await axios.post(process.env.JIMI_URL, payload, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (response.data && response.data.code === 0) {
      const result = response.data.result;
      if (result.includes('OPEN set OK')) {
        console.log("✅ Bicicleta desbloqueada correctamente.");

        // 6) Buscar la posición actual de la bici en `free_bike_status`
        const freeBikeRef = db.collection('free_bike_status').doc('bikes_data');
        const freeBikeSnap = await freeBikeRef.get();

        if (!freeBikeSnap.exists) {
          return res.status(404).json({ message: 'No se encontró la lista de bicicletas en free_bike_status.' });
        }

        const data = freeBikeSnap.data(); // { bikes: [...] }
        const bikesArray = data.bikes || [];

        // Localizar en el array la bici con bike_id === bikeId
        const index = bikesArray.findIndex(b => b.bike_id === bikeId);
        if (index === -1) {
          return res.status(404).json({ message: 'No se encontró la bicicleta en free_bike_status.' });
        }

        // Tomar lat y lon para usarlos como punto de inicio
        const startLat = bikesArray[index].lat;
        const startLon = bikesArray[index].lon;

        // Marcar la bici como is_reserved: true
        bikesArray[index].is_reserved = true;

        // Actualizar el doc con el array modificado
        await freeBikeRef.update({ bikes: bikesArray });

        // 7) Crear documento “viaje” con estado "iniciado"
        const ridesRef = db.collection('rides');
        const newRideRef = ridesRef.doc();

        await newRideRef.set({
          rideId: newRideRef.id,
          userId: userId,
          bikeId: bikeId,
          status: 'iniciado',
          startTime: new Date().toISOString(),
          startLat: startLat || 0,
          startLon: startLon || 0
        });

        return res.status(200).json({ message: 'Bicicleta desbloqueada y viaje iniciado.' });
      } else {
        console.log("⚠️ No se pudo confirmar la apertura del candado.");
        return res.status(500).json({ message: 'No se pudo confirmar la apertura del candado.' });
      }
    } else {
      console.log("❌ Error en la solicitud a JIMI IoT.");
      return res.status(500).json({ message: 'Error en la solicitud a JIMI IoT.' });
    }
  } catch (error) {
    console.error("❌ Error al procesar la solicitud de desbloqueo:", error);
    return res.status(500).json({
      message: 'Error al procesar la solicitud de desbloqueo.',
      error: error.message
    });
  }
});

app.get('/api/token/:imei/:userId', async (req, res) => {
  const { imei, userId } = req.params;

  if (!imei || !userId) {
    return res.status(400).json({ message: 'IMEI y userId son requeridos.' });
  }

  try {
    // Generar un token de 4 dígitos
    const token = Math.floor(1000 + Math.random() * 9000).toString();
    const expirationTime = Date.now() + 180 * 1000; // Expira en 3 minutos

    // Guardar en Firestore la relación token ↔ usuario ↔ bicicleta
    await db.collection('unlock_tokens').doc(token).set({
      userId,
      bikeId: imei,
      expirationTime,
    });

    return res.status(200).json({ token, expirationTime });
  } catch (error) {
    console.error('Error generando el token de desbloqueo:', error.message);
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
      const { rideId, userId, bikeId, startTime } = rideData;

      // 1) Construir payload para STATUS#
      const commonParams = generateCommonParameters('jimi.open.instruction.send');
      const instParamJson = {
        inst_id: '418', // o el ID que aplique
        inst_template: 'STATUS#',
        params: [],
        is_cover: 'false',
      };

      // 2) AccessToken de JIMI
      const jimiTokenDoc = await db.collection('tokens').doc('jimi-token').get();
      if (!jimiTokenDoc.exists) {
        console.log("❌ No hay token de JIMI IoT al verificar candado. Se omite.");
        continue;
      }
      const accessToken = jimiTokenDoc.data().accessToken;

      const payload = {
        ...commonParams,
        access_token: accessToken,
        imei: bikeId,
        inst_param_json: JSON.stringify(instParamJson),
      };

      // 3) Llamar a JIMI IoT
      const response = await axios.post(process.env.JIMI_URL, payload, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (response.data && response.data.code === 0) {
        const result = response.data.result.toLowerCase();

        // 4) Detectar "lock state"
        if (result.includes('lock state')) {
          console.log(`🔒 Se detectó candado cerrado para rideId=${rideId}. Finalizando...`);
          
          // 5) Finalizar el viaje
          await finalizeRide(rideId, userId, bikeId, startTime);
        }
      } else {
        console.log("❌ Error al consultar STATUS# para la bici:", bikeId);
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
    // 1) Obtener la info de precios
    const planRef = db.collection('system_pricing_plans').doc('pricing_plans_1');
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      console.error("❌ No se encontró el doc 'pricing_plans_1' en system_pricing_plans");
      return;
    }
    const planData = planSnap.data();
    const basePrice = parseFloat(planData.price) || 0;      
    const ratePerMin = parseFloat(planData.per_min_pricing.rate) || 0; 

    // 2) Calcular duración y costo
    const endTime = new Date();
    const durationMinutes = Math.floor((endTime - new Date(startTime)) / 60000); 
    const totalCost = basePrice + (ratePerMin * durationMinutes);

    // 3) Leer la ubicación final de la bici en free_bike_status
    const freeBikeRef = db.collection('free_bike_status').doc('bikes_data');
    const freeBikeSnap = await freeBikeRef.get();
    if (!freeBikeSnap.exists) {
      console.error("❌ No se encontró doc 'bikes_data' en free_bike_status para obtener ubicación final.");
      return;
    }

    const data = freeBikeSnap.data(); 
    const bikesArray = data.bikes || [];
    const index = bikesArray.findIndex(b => b.bike_id === bikeId);
    if (index === -1) {
      console.error("❌ No se encontró la bicicleta en free_bike_status para obtener endLat/endLon.");
      return;
    }

    const endLat = bikesArray[index].lat || 0;
    const endLon = bikesArray[index].lon || 0;

    // Liberar la bici
    bikesArray[index].is_reserved = false;
    await freeBikeRef.update({ bikes: bikesArray });

    // 4) Actualizar ride => status: finalizado + posición final + duración + costo
    const rideRef = db.collection('rides').doc(rideId);
    await rideRef.update({
      status: 'finalizado',
      endTime: endTime.toISOString(),
      durationMinutes,
      totalCost,
      endLat,
      endLon
    });

    // 5) Registrar “débito” en la subcolección del usuario
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

    // 6) Actualizar saldo del usuario
    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) return;
      const userData = userDoc.data();
      const saldoActual = parseFloat(userData.saldo || "0");
      const nuevoSaldo = saldoActual - totalCost;
      t.update(userRef, { saldo: nuevoSaldo.toString() });
    });

    // 7) Notificar usuario por Twilio
    const userSnap = await userRef.get();
    const updatedUserData = userSnap.data();
    const saldoActualizado = updatedUserData.saldo || "0";

    await sendMessage(
      `¡Tu viaje ha finalizado!\n` + 
      `Duración: ${durationMinutes} min.\n` +
      `Costo total: $${totalCost}.\n` +
      `Tu saldo actual es: $${saldoActualizado}.\n` +
      `Gracias por usar Jinete.ar 🚲`,
      userId 
    );

    console.log(`✅ Viaje ${rideId} finalizado. Costo: $${totalCost}, Nuevo saldo: $${saldoActualizado}`);
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

async function sendMainMenu(to) {
  const text =
    `*Menú principal*\n` +
    `1) Registro\n` +
    `2) Solicitar token de desbloqueo\n` +
    `3) Soporte\n` +
    `4) Ver saldo\n` +
    `5) Recargar saldo\n` +
    `6) Informar desperfectos \n\n` +
    `Para regresar a este menú en cualquier momento, escribe "Menu".`;

  await sendMessage(text, to);
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
    const bikeName = match[1].trim(); 
    const bikesRef = db.collection("free_bike_status");
    const querySnap = await bikesRef.where("bike_id", "==", bikeName).limit(1).get();
  
    if (querySnap.empty) {
      await sendMessage(
        `No encontré una bicicleta con el nombre "${bikeName}". Por favor, revisa en https://jinete-ar.web.app/.`,
        From
      );
      return res.status(200).send("Bike no encontrada");
    }
  
    const doc = querySnap.docs[0];
    const imei = doc.id; 
    
    const sessionRef = db.collection("users_session").doc(From);
    await sessionRef.set(
      {
        step: "request_dni",
        selectedBikeImei: imei, 
        selectedBikeName: bikeName 
      },
      { merge: true }
    );
  
    await sendMessage(
      `Para continuar con el alquiler de *${bikeName}*, envía tu número de DNI sin puntos, solo números.`,
      From
    );
    return res.status(200).send("Solicitud de DNI enviada");
  }

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
  
    await sessionRef.set({ step: "menu_main" }, { merge: true });
    await sendMessage(
      "¡DNI verificado! Puedes continuar con el alquiler. Escribe *'Menu'* para ver opciones.",
      From
    );
    return res.status(200).send("DNI verificado");
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
        case "1": { // Registro
          await sessionRef.update({ step: "ask_name" });
          await sendMessage("Has elegido *Registro*. ¿Cuál es tu nombre?", From);
          return res.status(200).send("Iniciando registro");
        }

        case "2": {
          // 1) Verificar que el usuario existe en Firestore
          const userSnap = await db.collection("usuarios").doc(From).get();
          if (!userSnap.exists) {
            await sendMessage(
              "No encuentro tu usuario. Elige opción '1' para registrarte o escribe 'menu' para ver opciones.",
              From
            );
            return res.status(200).send("Usuario no registrado");
          }
          // 2) Verificar saldo suficiente
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
              `Selecciona '5' para recargar saldo o escribe 'menu' para el menú principal.`,
              From
            );
            return res.status(200).send("Saldo insuficiente");
          }

          // 3) Verificar que la sesión contenga la bici elegida
          const sessionRef2 = db.collection("users_session").doc(From);
          const sessionDoc2 = await sessionRef2.get();
          if (!sessionDoc2.exists) {
            await sendMessage(
              "No tienes bicicleta seleccionada. Escribe: 'Hola, quiero alquilar <nombre_bici>'.",
              From
            );
            return res.status(200).send("Sesión no encontrada");
          }
          const { selectedBikeImei, selectedBikeName } = sessionDoc2.data();
          if (!selectedBikeImei || !selectedBikeName) {
            await sendMessage(
              "No hay bicicleta seleccionada. Escribe: 'Hola, quiero alquilar <nombre_bici>'.",
              From
            );
            return res.status(200).send("No hay selectedBikeImei / selectedBikeName");
          }

          // 4) Verificar estado de la bicicleta
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

          // 5) Generar token en el backend
          try {
            const tokenURL = `${process.env.VITE_BACKEND_URL}/api/token/${selectedBikeImei}/${From}`;
            const response = await axios.get(tokenURL);
            const { token } = response.data;
        
            // 6) Enviar token al usuario
            await sendMessage(
              `🔓 Tu token de desbloqueo para la bicicleta *${selectedBikeName}* es: *${token}*.\n` +
              `🔴 *Expira en 3 minutos.*\n` +
              `¡Buen viaje! 🚲`,
              From
            );
            return res.status(200).send("Token enviado");
          } catch (error) {
            console.error("❌ Error generando token:", error.message);
            await sendMessage(
              "Hubo un problema generando el token de desbloqueo. Escribe 'Soporte' o 'menu' para volver.",
              From
            );
            return res.status(500).send("Error generando token");
          }
        }

        case "3": {
          await sessionRef.update({ step: "soporte_mode" });
          await sendMessage("Has elegido *Soporte*. ¿En qué podemos ayudarte?", From);
          return res.status(200).send("Soporte");
        }

        case "4": {
          const userSnap = await db.collection("usuarios").doc(From).get();
          if (!userSnap.exists) {
            await sendMessage(
              "No encuentro tu usuario. Opción '1' para registrarte o 'menu' para opciones.",
              From
            );
            return res.status(200).send("Usuario no registrado");
          }
          const { saldo } = userSnap.data();
          await sendMessage(`Tu saldo actual es: *${saldo}* $.`, From);
          return res.status(200).send("Saldo consultado");
        }

        case "5": {
          await sessionRef.update({ step: "ask_recarga" });
          await sendMessage("¿Cuánto deseas recargar en ARS?", From);
          return res.status(200).send("Iniciando recarga de saldo");
        }

        case "6": {
          console.log(`🟢 [DEBUG] Opción 6 - Iniciando reporte para: ${From}`);
          await sessionRef.set({ step: "report_issue" }, { merge: true });
          await sendMessage("🔧 *Reporte de desperfectos*\n\nDescribe el problema encontrado:", From);
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

    case "ask_name": {
      await sessionRef.update({ step: "ask_lastname", name: Body });
      await sendMessage("Ahora ingresa tu *apellido*:", From);
      return res.status(200).send("Registro: Preguntando apellido");
    }

    case "ask_lastname": {
      await sessionRef.update({ step: "ask_dni", lastName: Body });
      await sendMessage("Ahora ingresa tu *DNI* (solo números):", From);
      return res.status(200).send("Registro: Preguntando DNI");
    }

    case "ask_dni": {
      if (!/^\d+$/.test(Body)) {
        await sendMessage("Por favor ingresa solo números para el DNI:", From);
        return res.status(200).send("DNI no válido");
      }
      await sessionRef.update({ step: "ask_email", dni: Body });
      await sendMessage("Ahora ingresa tu *correo electrónico*:", From);
      return res.status(200).send("Registro: Preguntando email");
    }

    case "ask_email": {
      if (!/\S+@\S+\.\S+/.test(Body)) {
        await sendMessage("Correo electrónico inválido. Intenta nuevamente:", From);
        return res.status(200).send("Email no válido");
      }
      await sessionRef.update({ step: "confirm_data", email: Body });
      const regData = sessionDoc.data(); 
      await sendMessage(
        `Por favor, confirma tus datos:\n\n` +
        `Nombre: ${regData.name}\n` +
        `Apellido: ${regData.lastName}\n` +
        `DNI: ${regData.dni}\n` +
        `Email: ${Body}\n\n` +
        `Responde *Sí* para confirmar o *No* para cancelar.`,
        From
      );
      return res.status(200).send("Registro: Pidiendo confirmación");
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
    
    case "confirm_data": {
      if (Body.toLowerCase() === "sí" || Body.toLowerCase() === "si") {
        const finalRegData = sessionDoc.data();
        await db.collection("usuarios").doc(From).set({
          name: finalRegData.name,
          lastName: finalRegData.lastName,
          dni: finalRegData.dni,
          email: finalRegData.email,
          saldo: "0",
          validado: true,
        });
        await sessionRef.update({ step: "menu_main" }); 
        await sendMessage(
          "¡Registro completado! Tu saldo inicial es 0$. Escribe '5' para recargar o 'menu' para opciones.",
          From
        );
        return res.status(200).send("Registro completado");
      } else if (Body.toLowerCase() === "no") {
        await sessionRef.delete();
        await sendMessage("Registro cancelado. Escribe 'menu' para comenzar de nuevo.", From);
        return res.status(200).send("Registro cancelado");
      } else {
        await sendMessage("Por favor, responde *Sí* o *No*.", From);
        return res.status(200).send("Confirmación no válida");
      }
    }

    case "ask_recarga": {
      const monto = parseFloat(Body);
      if (isNaN(monto)) {
        await sendMessage("Por favor, ingresa un monto numérico. Ej: 500", From);
        return res.status(200).send("Monto inválido");
      }
      // 1) Buscar el usuario y su email
      const userSnap = await db.collection("usuarios").doc(From).get();
      if (!userSnap.exists) {
        await sendMessage("No encuentro tu usuario. Regístrate con la opción '1'.", From);
        return res.status(200).send("Usuario no registrado");
      }
      const userData = userSnap.data();
      const userEmail = userData.email || "soporte@jinete.ar"; 
      // 2) Creamos un doc en la subcolección "pagos"
      const pagosRef = db.collection("usuarios").doc(From).collection("pagos");
      const newPaymentDoc = pagosRef.doc();
      const docId = newPaymentDoc.id;
      // 3) Creamos la preferencia => 'external_reference'
      const result = await createPreference(
        userEmail, 
        "Recarga de saldo", 
        1, 
        monto, 
        { phone: From, docId }
      );
      if (result.error) {
        await sendMessage(
          "No pude generar el link de pago. Inténtalo más tarde o escribe 'menu'.",
          From
        );
        return res.status(200).send("Error al crear preferencia MP");
      }
      const preference = result.preference;
      const initPoint = preference.init_point;

      // 4) Guardamos "pending" en Firestore
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

      // 5) Enviamos el link al usuario
      await sendMessage(
        `Link de pago por *${monto} ARS*:\n${initPoint}\n` + 
        `¡Paga y automáticamente se procesará la recarga!`,
        From
      );
      // 6) Cambiamos el step a "await_payment"
      await sessionRef.update({ step: "await_payment", recarga: monto });
      return res.status(200).send("Recarga solicitada");
    }

    case "await_payment": {
      if (Body.toLowerCase().includes("listo")) {
        await sendMessage("Verificaremos el estado de tu pago. Un momento...", From);
        return res.status(200).send("Usuario dice que pagó");
      }
      await sendMessage("Aguardando confirmación de tu pago. Escribe 'Soporte' o 'menu' si lo necesitas.", From);
      return res.status(200).send("Pendiente de pago");
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
      await sendMessage("✅ ¡Reporte registrado! Nuestro equipo lo revisará.", From);
      await sessionRef.delete();
      return res.status(200).send("Reporte guardado");
    }

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
});