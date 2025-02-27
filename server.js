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
await loadServiceAccount();

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
app.use(cors());

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
    //    Tienes que usar tu access token (process.env.MERCADOPAGO_TOKEN).
    //    La doc dice: GET /v1/payments/:id
    const mpResponse = await axios.get(
      `https://api.mercadopago.com/v1/payments/${payment_id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MERCADOPAGO_TOKEN}`,
        },
      }
    );

    const paymentInfo = mpResponse.data; // Este JSON tiene mucha info
    // Por ejemplo: paymentInfo.payer.email, paymentInfo.payer.first_name, ...
    // Ajusta según la estructura que retorne MP

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
      expires_in: 600, // Tiempo de expiración del token en segundos
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

// Función para refrescar el token de JIMI
async function refreshAccessToken(refreshToken) {
  // 🚨 Control de entorno: Solo Cloud Run o si está permitido en local
  const isCloudRun = !!process.env.K_SERVICE;
  const allowLocalRefresh = process.env.ALLOW_TOKEN_REFRESH_LOCAL === "true";

  if (!isCloudRun && !allowLocalRefresh) {
    console.log("⚠️ Servidor local detectado. No se renovará el token (bloqueado por seguridad).");
    return null;
  }

  console.log(`⏳ Intentando renovar el token... (Ejecutando en ${isCloudRun ? "Cloud Run" : "Local"})`);

  try {
    if (!refreshToken) {
      throw new Error("El token de actualización es inválido o está vacío.");
    }

    // Generar los parámetros comunes
    const commonParams = generateCommonParameters("jimi.oauth.token.refresh");

    // Parámetros requeridos por la API de JIMI
    const privateParams = {
      access_token: currentAccessToken || "", // Token de acceso actual
      refresh_token: refreshToken,           // Token de actualización
      expires_in: 3600,                      // Duración en segundos
    };

    // Combinar los parámetros comunes y privados
    const requestData = { ...commonParams, ...privateParams };

    console.log("🔍 Enviando solicitud de refresh con datos:", requestData);

    // Enviar la solicitud POST a JIMI
    const response = await axios.post(process.env.JIMI_URL, requestData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 5000, // Tiempo de espera máximo en milisegundos
    });

    const { data } = response;

    if (data.code === 0 && data.result) {
      console.log("✅ Token actualizado correctamente en JIMI:", data.result);

      const tokenData = {
        appKey: data.result.appKey,
        account: data.result.account,
        accessToken: data.result.accessToken,
        refreshToken: data.result.refreshToken,
        expiresIn: data.result.expiresIn,
        time: data.result.time,
      };

      // Guardar el token actualizado en Firestore
      await db.collection("tokens").doc("jimi-token").set(tokenData);
      console.log("✅ Token almacenado en Firestore.");

      return tokenData;
    } else {
      console.error("❌ Error en la respuesta del servidor al actualizar el token:", data);
      return null;
    }
  } catch (error) {
    if (error.response) {
      console.error(`❌ Error HTTP (${error.response.status}):`, error.response.data);
    } else {
      console.error("❌ Error inesperado al actualizar el token:", error.message);
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
      const devices = data.result;
      console.log(`✅ Ubicaciones obtenidas: ${devices.length} dispositivos`);

      const batch = db.batch();
      devices.forEach((device) => {
        const docRef = db.collection('deviceLocations').doc(device.imei);
        batch.set(docRef, device);
      });

      await batch.commit();
      console.log('✅ Ubicaciones guardadas en Firestore');
    } else {
      console.error('❌ Error al obtener ubicaciones:', data);
    }
  } catch (error) {
    console.error('❌ Error en la obtención de ubicaciones:', error.message);
  }
  console.log('🎯 Finalización de la función fetchDeviceLocations');
}

async function updateFreeBikeStatus() {
  console.log('⏳ Actualizando free_bike_status en Firestore...');

  try {
    const deviceLocationsRef = admin.firestore().collection('deviceLocations');
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
    console.error('❌ Error al actualizar free_bike_status:', error.message);
  }
}


// Evitar duplicados
let integrationInitialized = false;
// Evitar duplicados en los intervalos
let bikeDataIntervalActive = false;
let tokenRefreshIntervalActive = false;

async function initializeIntegration() {
  if (integrationInitialized) {
    console.log("⚠️ Integración ya inicializada. Evitando duplicados...");
    return;
  }

  console.log("⏳ Inicializando integración...");
  integrationInitialized = true; // Marcar como inicializado

  try {
    // Leer el token actual desde Firestore antes de empezar
    const tokenDoc = await db.collection("tokens").doc("jimi-token").get();
    if (tokenDoc.exists) {
      const tokenData = tokenDoc.data();
      currentAccessToken = tokenData.accessToken;
      currentRefreshToken = tokenData.refreshToken;
    } else {
      console.error("❌ No se encontraron tokens en Firestore.");
      return;
    }

    // 🔄 Ejecutar actualización inicial de bicicletas y tokens
    await bikeDataInterval();
    await tokenRefreshInterval();

    // 🔄 Iniciar los intervalos **solo si no están activos**
    if (!bikeDataIntervalActive) {
      bikeDataIntervalActive = true;
      setInterval(bikeDataInterval, 40 * 1000);
    }

    if (!tokenRefreshIntervalActive) {
      tokenRefreshIntervalActive = true;
      setInterval(tokenRefreshInterval, 40 * 1000);
    }

  } catch (error) {
    console.error("❌ Error al leer tokens de Firestore:", error.message);
    return;
  }
}

// 🔄 Función para actualizar datos de bicicletas
async function bikeDataInterval() {
  console.log("⏳ Actualizando datos de bicicletas...");

  try {
    // 🟢 Recargar token desde Firestore antes de actualizar ubicaciones
    const tokenDoc = await db.collection("tokens").doc("jimi-token").get();
    if (tokenDoc.exists) {
      const tokenData = tokenDoc.data();
      currentAccessToken = tokenData.accessToken;
      currentRefreshToken = tokenData.refreshToken;
    }

    // 🛰️ Actualizar ubicaciones y estado de bicicletas
    await fetchDeviceLocations(currentAccessToken);
    await updateFreeBikeStatus();

    console.log("✅ Datos de bicicletas actualizados.");
  } catch (error) {
    console.error("❌ Error al actualizar datos de bicicletas:", error.message);
  }
}

// 🔄 Función para actualizar el token automáticamente
async function tokenRefreshInterval() {
  try {
    const isCloudRun = !!process.env.K_SERVICE;
    const allowLocalRefresh = process.env.ALLOW_TOKEN_REFRESH_LOCAL === "true";

    if (isCloudRun || allowLocalRefresh) {
      console.log(`🔄 Intentando refrescar el token... (Ejecutando en ${isCloudRun ? "Cloud Run" : "Local"})`);

      if (!currentRefreshToken) {
        console.error("⚠️ No hay refresh token disponible. No se puede actualizar el acceso.");
        return;
      }

      const updatedToken = await refreshAccessToken(currentRefreshToken);

      if (updatedToken) {
        currentAccessToken = updatedToken.accessToken;
        currentRefreshToken = updatedToken.refreshToken;
        console.log("✅ Token actualizado correctamente.");
      } else {
        console.error("❌ Error al actualizar el token.");
      }
    } else {
      console.log("⚠️ Servidor local sin permisos: Usando token de Firestore, no se actualizará automáticamente.");
    }
  } catch (error) {
    console.error("❌ Error inesperado en la actualización automática:", error.message);
  }
}

// 📌 Ruta para desbloquear bicicleta
app.post('/api/unlock', async (req, res) => {
  try {
    console.log("🔹 Solicitud recibida:", req.body);
    
    const { token } = req.body;
    if (!token) {
      console.log("⚠️ Token no proporcionado.");
      return res.status(400).json({ message: 'Token de desbloqueo no proporcionado.' });
    }

    // Verificar si el token existe en Firestore
    console.log("🔍 Buscando token en Firestore:", token);
    const tokenRef = db.collection('unlock_tokens').doc(token);
    const tokenDoc = await tokenRef.get();
    
    if (!tokenDoc.exists) {
      console.log("❌ Token inválido o expirado:", token);
      return res.status(400).json({ message: 'Token inválido o expirado.' });
    }

    console.log("✅ Token encontrado:", tokenDoc.data());

    // Verificar si el token de JIMI IoT está disponible
    console.log("🔍 Buscando token de JIMI IoT...");
    const jimiTokenDoc = await db.collection('tokens').doc('jimi-token').get();
    
    if (!jimiTokenDoc.exists) {
      console.log("❌ Token de JIMI no disponible.");
      return res.status(401).json({ message: 'Token de acceso a JIMI no disponible. Intenta nuevamente.' });
    }

    const accessToken = jimiTokenDoc.data().accessToken;
    console.log("✅ Token de JIMI IoT obtenido.");

    // Construcción del payload para JIMI IoT
    console.log("📤 Enviando solicitud a JIMI IoT...");
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
      imei: tokenDoc.data().bikeId,
      inst_param_json: JSON.stringify(instParamJson),
    };

    // Enviar solicitud a JIMI IoT
    const response = await axios.post(process.env.JIMI_URL, payload, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    console.log("🔍 Respuesta de JIMI IoT:", response.data);

    // Verificar respuesta de JIMI IoT
    if (response.data && response.data.code === 0) {
      const result = response.data.result;
      if (result.includes('OPEN set OK')) {
        console.log("✅ Bicicleta desbloqueada correctamente.");
        return res.status(200).json({ message: '🚲 ¡Bicicleta desbloqueada exitosamente!' });
      } else {
        console.log("⚠️ No se pudo confirmar la apertura del candado.");
        return res.status(500).json({ message: '⚠️ No se pudo confirmar la apertura del candado.' });
      }
    } else {
      console.log("❌ Error en la solicitud a JIMI IoT.");
      return res.status(500).json({ message: '❌ Error en la solicitud a JIMI IoT.' });
    }

  } catch (error) {
    console.error("❌ Error al procesar la solicitud de desbloqueo:", error);
    return res.status(500).json({ message: '❌ Error al procesar la solicitud de desbloqueo.', error: error.message });
  }
});


async function sendAlarmToOpenAPI(imei, alarmMessage) {
  try {
      const apiUrl = JIMI_URL;
      
      // Verificar si tenemos un access token válido
      const tokenDoc = await db.collection('tokens').doc('jimi-token').get();
      if (!tokenDoc.exists) {
          console.error('❌ Error: Token de acceso de JIMI no encontrado.');
          return { error: true, message: "Token de acceso no disponible." };
      }

      const accessToken = tokenDoc.data().accessToken;

      // 📌 Construcción del payload para TracksolidPro API
      const payload = {
          method: "jimi.push.device.alarm",
          access_token: accessToken,
          imei: imei,
          alarm_type: "bike_malfunction",
          alarm_message: alarmMessage,
          timestamp: new Date().toISOString().replace("T", " ").split(".")[0]
      };

      const response = await axios.post(apiUrl, payload, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      console.log("✅ Alarma enviada correctamente a OpenAPI:", response.data);
      return response.data;
  } catch (error) {
      console.error("❌ Error enviando la alarma a OpenAPI:", error.response?.data || error.message);
      return { error: true, message: "Error al enviar la alarma." };
  }
}


// 📌 1️⃣ Endpoint GBFS principal (Index)
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

// Generacion de tokens en el servidor para desbloquear bicicletas
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

async function uploadImageToFirebase(imageUrl, fileName) {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, "binary");

    const storage = getStorage();
    const storageRef = ref(storage, `reportes/${fileName}`);

    await uploadBytes(storageRef, buffer);
    const downloadUrl = await getDownloadURL(storageRef);

    console.log(`✅ Imagen subida a Firebase Storage: ${downloadUrl}`);
    return downloadUrl;
  } catch (error) {
    console.error("❌ Error al subir la imagen:", error);
    return null;
  }
}

// Configuración de OpenAI
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
    🔹 *Enlace para el Token:* [🔗 Generar Token](https://jinete-ar.web.app/)
    
    ⚠️ *Importante:* El token tiene una validez de 3 minutos antes de que expire.
  
  - Si no estás seguro, sugiere escribir 'menu' para ver las opciones disponibles.
`;

  try {
    // Versión 4.x => se usa openai.chat.completions.create(...)
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.5,
      max_tokens: 200,
    });

    // Ahora, en v4.x la respuesta se encuentra en 'response.choices'
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

/* app.post("/chatbot", async (req, res) => {
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
*/

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

// -------------------------------------------
// Envía el Menú Principal
// -------------------------------------------
async function sendMainMenu(to) {
  const text =
    `*Menú principal*\n` + // Formato de mensaje con negritas
    `1) Registro\n` +
    `2) Solicitar token de desbloqueo\n` +
    `3) Soporte\n` +
    `4) Ver saldo\n` +
    `5) Recargar saldo\n` +
    `6) Informar desperfectos \n\n` + // Opción adicional para reportar problemas
    `Para regresar a este menú en cualquier momento, escribe "Menu".`;

  await sendMessage(text, to); // Envía el mensaje al usuario
}

// Ejemplo de la parte "/webhook" que combina Regex + GPT + tu FSM
app.post("/webhook", async (req, res) => {
  const { Body, From } = req.body;
  if (!Body || !From) return res.status(400).json({ message: "Datos incompletos recibidos." });
// 0) Revisar si el usuario solo escribe "hola", "hola!" o alguna variante
const greetingRegex = /^\s*(?:hola|holi|buenas|buen\s?dia|buenos días|buenas tardes|buenas noches|hey|hi)\b[\s!.,]*$/i; 

if (greetingRegex.test(Body)) {
  await sendMessage(
    "¡Hola! Bienvenido/a a Jinete.ar. La plataforma N°1 en LATAM para alquiler de bicicletas. " +
    "Escribe *'Menu'* para ver las opciones o dime directamente qué necesitas.",
    From
  );
  return res.status(200).send("Mensaje de bienvenida enviado");
}
  // 1) Revisamos si el usuario ha escrito "Hola, quiero alquilar BICINAME"
  //    Ejemplo: "Hola, quiero alquilar Pegasus"
  const regexAlquilar = /hola,\s*quiero\s*alquilar\s+(.+)/i;
  const match = Body.match(regexAlquilar);
  if (match) {
    const bikeName = match[1].trim(); // "Pegasus"
  
    // Buscar en Firestore el doc cuyo "bike_id" sea "Pegasus"
    const bikesRef = db.collection("free_bike_status");
    const querySnap = await bikesRef.where("bike_id", "==", bikeName).limit(1).get();
  
    if (querySnap.empty) {
      await sendMessage(
        `No encontré una bicicleta con el nombre "${bikeName}". Por favor, verifica el nombre.`,
        From
      );
      return res.status(200).send("Bike no encontrada");
    }
  
    // Tomamos el primer documento encontrado
    const doc = querySnap.docs[0];
    const imei = doc.id;         // "860187050182074" (SECRETO)
    // const data = doc.data();  // Tendrá bike_id, lat, etc.
  
    // Guardamos en la sesión el IMEI y el bike_id, pero **sin** mostrar el IMEI al usuario
    const sessionRef = db.collection("users_session").doc(From);
    await sessionRef.set(
      {
        step: "menu_main",
        selectedBikeImei: imei,    // Uso interno
        selectedBikeName: bikeName // Mostrar al usuario en mensajes
      },
      { merge: true }
    );
  
    await sendMessage(
      `¡Entendido! Solo podras alquilar *${bikeName}* si tienes saldo en tu cuenta $Jinete. \n\n` +
      `Escribe *"Menu"* para ver las opciones disponibles.`,
      From
    );
    return res.status(200).send("Bicicleta preferida guardada");
  }
  // 2) Si no hace match con "hola, quiero alquilar...", sigues tu flujo normal:
  // Verificar sesión
  const sessionRef = db.collection("users_session").doc(From);
  const sessionDoc = await sessionRef.get();

  // (Opcional) si escribe "menu" en cualquier momento:
  if (Body.trim().toLowerCase() === "menu") {
    await sessionRef.set({ step: "menu_main" }, { merge: true });
    await sendMainMenu(From);
    return res.status(200).send("Menú forzado.");
  }

  if (!sessionDoc.exists) {
    // Si no hay sesión, creas una con step=menu_main o un "intro"
    await sessionRef.set({ step: "menu_main" });
    await sendMainMenu(From);
    return res.status(200).send("Nueva sesión, menú principal enviado.");
  }

  // 3) Si ya hay sesión => manejar en handleUserResponse
  return handleUserResponse(Body, From, res);
});


// -------------------------------------------
// Manejo de la sesión
// -------------------------------------------
export const handleUserResponse = async (Body, From, res) => {
  const sessionRef = db.collection("users_session").doc(From);
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    // Si por algún motivo no existe la sesión
    await sendMessage("No encontré tu sesión. Escribe 'Menu' para ver opciones.", From);
    return res.status(400).json({ message: "Sesión no encontrada." });
  }

  const { step, selectedBike } = sessionDoc.data();

  switch (step) {
    /* -------------------------------------------------
       MENÚ PRINCIPAL
    ------------------------------------------------- */
    case "menu_main": {
      const option = Body.trim();
      switch (option) {
        case "1": // Registro
      {
          await sessionRef.update({ step: "ask_name" });
          await sendMessage("Has elegido *Registro*. ¿Cuál es tu nombre?", From);
          return res.status(200).send("Iniciando registro");
      }
          case "2": {
            // 1️⃣ Verificar que el usuario existe en Firestore
            const userSnap = await db.collection("usuarios").doc(From).get();
            if (!userSnap.exists) {
              await sendMessage(
                "No encuentro tu usuario. Elige la opción '1' para registrarte o escribe 'menu' para ver opciones.",
                From
              );
              return res.status(200).send("Usuario no registrado");
            }
          
            // 2️⃣ Verificar saldo suficiente
            const userData = userSnap.data();
            const saldoActual = parseFloat(userData.saldo || "0");
          
            // Obtener tarifa de desbloqueo
            const planDocRef = db.collection("system_pricing_plans").doc("pricing_plans_1");
            const planDoc = await planDocRef.get();
          
            if (!planDoc.exists) {
              console.error("❌ No se encontró el plan de precios 'pricing_plans_1' en Firestore");
              await sendMessage("Hubo un problema consultando la tarifa. Intenta más tarde o contacta Soporte.", From);
              return res.status(200).send("Plan no encontrado");
            }
          
            const planData = planDoc.data();
            const bajadaDeBandera = parseFloat(planData.price || "500");
          
            if (saldoActual < bajadaDeBandera) {
              await sendMessage(
                `No tienes saldo suficiente para iniciar el viaje. ` +
                `La bajada de bandera es de ${bajadaDeBandera} ${planData.currency || "ARS"}. ` +
                `Selecciona '5' para recargar saldo o escribe 'menu' para volver al menú principal.`,
                From
              );
              return res.status(200).send("Saldo insuficiente");
            }
          
            // 3️⃣ Verificar que en la sesión existan la IMEI y el nombre de la bici
            const sessionRef = db.collection("users_session").doc(From);
            const sessionDoc = await sessionRef.get();
          
            if (!sessionDoc.exists) {
              await sendMessage(
                "No tienes ninguna bicicleta seleccionada. Escribe: 'Hola, quiero alquilar <nombre_bici>'.",
                From
              );
              return res.status(200).send("Sesión no encontrada");
            }
          
            const { selectedBikeImei, selectedBikeName } = sessionDoc.data();
            if (!selectedBikeImei || !selectedBikeName) {
              await sendMessage(
                "No tienes ninguna bicicleta seleccionada. Escribe: 'Hola, quiero alquilar <nombre_bici>'.",
                From
              );
              return res.status(200).send("No hay selectedBikeImei o selectedBikeName");
            }
          
            // 4️⃣ Verificar estado de la bicicleta en Firestore
            const bikeSnap = await db.collection("free_bike_status").doc(selectedBikeImei).get();
            if (!bikeSnap.exists) {
              await sendMessage(
                "La bicicleta elegida no está disponible. Verifica el nombre o escribe 'menu' para volver al menú.",
                From
              );
              return res.status(200).send("Bicicleta no encontrada");
            }
          
            const bikeData = bikeSnap.data();
            if (bikeData.bike_id !== selectedBikeName) {
              await sendMessage(
                `Parece que la bici *${selectedBikeName}* cambió o no coincide. ` +
                `Por favor, escribe: 'Hola, quiero alquilar <nombre_bici>'.`,
                From
              );
              return res.status(200).send("Mismatch en bike_id");
            }
          
            if (bikeData.is_reserved === true || bikeData.is_disabled === true) {
              await sendMessage(
                `Lo siento, la bicicleta *${selectedBikeName}* no está disponible en este momento.`,
                From
              );
              return res.status(200).send("Bicicleta reservada o deshabilitada");
            }
          
            // 5️⃣ Generar token en el backend
            try {
              const tokenURL = `${process.env.VITE_BACKEND_URL}/api/token/${selectedBikeImei}/${From}`;
              const response = await axios.get(tokenURL);
              const { token } = response.data;
          
              // 6️⃣ Enviar token al usuario
              await sendMessage(
                `🔓 Tu token de desbloqueo para la bicicleta *${selectedBikeName}* es: *${token}*.\n` +
                `🔴 *Expira en 3 minutos.*\n` +
                `📍 Ingresa este código en la app para desbloquear la bicicleta.\n\n¡Buen viaje! 🚲`,
                From
              );
          
              return res.status(200).send("Token enviado");
            } catch (error) {
              console.error("❌ Error generando token:", error.message);
              await sendMessage(
                "Ocurrió un problema generando tu token de desbloqueo. Escribe 'Soporte' o 'menu' para asistencia.",
                From
              );
              return res.status(500).send("Error generando token");
            }
          }
         
        case "3": // Soporte
        {
          await sessionRef.update({ step: "soporte_mode" });  // guardamos que el usuario entró a Soporte
          await sendMessage("Has elegido *Soporte*. ¿En qué podemos ayudarte?", From);
          return res.status(200).send("Soporte");
        }

        case "4": // Ver saldo
          {
            const userSnap = await db.collection("usuarios").doc(From).get();
            if (!userSnap.exists) {
              await sendMessage(
                "No encuentro tu usuario. Selecciona '1' para registrarte o escribe 'menu' para ver opciones.",
                From
              );
              return res.status(200).send("Usuario no registrado");
            }
            const { saldo } = userSnap.data();
            await sendMessage(`Tu saldo actual es: *${saldo}* $.`, From);
            return res.status(200).send("Saldo consultado");
          }

        case "5": // Recargar saldo
        {
          await sessionRef.update({ step: "ask_recarga" });
          await sendMessage("¿Cuánto deseas recargar en ARS?", From);
          return res.status(200).send("Iniciando recarga de saldo");
        }
        case "6":{
        console.log(`🟢 [DEBUG] Usuario seleccionó 6 - Iniciando reporte para: ${From}`);
        await sessionRef.set({ step: "report_issue" }, { merge: true });
        await sendMessage("🔧 *Reporte de desperfectos*\n\nPor favor, describe el problema que encontraste:", From);
        return res.status(200).send("Modo reporte activado");
        }
          default:{
          console.log(`⚠️ No se reconoció el mensaje: ${Body}`);
  // Intentar interpretar el mensaje con OpenAI
  const chatbotResponse = await handleChatbot(Body);      
  if (chatbotResponse) {
    await sendMessage(chatbotResponse, From);
    return res.status(200).send("Respuesta generada por Chatbot.");
  } else {
    await sendMessage(
      "No entendí tu mensaje. Escribe 'menu' para ver las opciones disponibles.",
      From
    );
    return res.status(200).send("Fallback sin respuesta válida.");
  }
}  
    }
  }
    /* -------------------------------------------------
       REGISTRO: ask_name -> ask_lastname -> ask_dni -> ask_email -> confirm_data
    ------------------------------------------------- */

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
        return res.status(200).send("DNI no válido, pidiendo nuevamente");
      }
      await sessionRef.update({ step: "ask_email", dni: Body });
      await sendMessage("Ahora ingresa tu *correo electrónico*:", From);
      return res.status(200).send("Registro: Preguntando email");
    }

    case "ask_email": {
      if (!/\S+@\S+\.\S+/.test(Body)) {
        await sendMessage("Correo electrónico inválido. Intenta nuevamente:", From);
        return res.status(200).send("Email no válido, pidiendo nuevamente");
      }

      // Guardamos y pedimos confirmación
      await sessionRef.update({ step: "confirm_data", email: Body });
      const regData = sessionDoc.data(); // Ojo: sessionDoc no se ha refrescado automáticamente, tal vez conviene recargarlo
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
        await sendMessage("Ocurrió un error con el soporte. Escribe 'menu' para volver al inicio.", From);
        return res.status(500).send("Soporte error");
      }
    }
    
    case "confirm_data": {
      if (Body.toLowerCase() === "sí" || Body.toLowerCase() === "si") {
        const finalRegData = sessionDoc.data();

        // Guardar en col "usuarios"
        await db.collection("usuarios").doc(From).set({
          name: finalRegData.name,
          lastName: finalRegData.lastName,
          dni: finalRegData.dni,
          email: finalRegData.email,
          saldo: "0",     // Por defecto
          validado: true, // Cambiar si quieres
        });

        // ⚠️ No volver a ask_bike => ahora solo confirmamos
        await sessionRef.update({ step: "menu_main" }); 
        await sendMessage(
          "¡Registro completado exitosamente! Tu saldo inicial es 0$. " +
          "Elige '5' para recargar saldo o escribe 'menu' para ver las opciones.",
          From
        );
        return res.status(200).send("Registro completado");
      } else if (Body.toLowerCase() === "no") {
        // Cancelar
        await sessionRef.delete();
        await sendMessage("Registro cancelado. Escribe 'menu' para comenzar de nuevo.", From);
        return res.status(200).send("Registro cancelado");
      } else {
        await sendMessage("Por favor, responde *Sí* o *No*.", From);
        return res.status(200).send("Confirmación no válida");
      }
    }

    /* -------------------------------------------------
       RECARGAR SALDO (opción 5)
    ------------------------------------------------- */
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
    
      // 3) Creamos la preferencia => 'external_reference': { phone, docId }
      const result = await createPreference(
        userEmail, 
        "Recarga de saldo", 
        1, 
        monto, 
        { phone: From, docId }  // <-- external_reference
      );
    
      if (result.error) {
        await sendMessage(
          "No pude generar el link de pago. Inténtalo más tarde o escribe 'menu' para volver.",
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
        `Aquí tienes tu link de pago por *${monto} ARS*:\n${initPoint}\n` + 
        `¡Paga y volverás automáticamente a confirmación!`,
        From
      );
    
      // 6) Cambiamos el step a "await_payment"
      await sessionRef.update({ step: "await_payment", recarga: monto });
      return res.status(200).send("Recarga solicitada, link de pago enviado");
    }
    
    case "await_payment": {
      if (Body.toLowerCase().includes("listo")) {
        // El usuario dijo "Listo, pagué"
        // OPCIONAL: 1) Verificar con la API de Mercado Pago el estado real
        // 2) Si 'approved', actualizas en Firestore y sumas saldo
    
        await sendMessage("Vamos a verificar el estado de tu pago. Un momento...", From);
        
        // (O esperas a que un webhook actualice la DB)
        return res.status(200).send("El usuario dice que pagó, a confirmar...");
      }
    
      await sendMessage("Estamos esperando la confirmación de tu pago. Si necesitas ayuda, escribe 'Soporte'.", From);
      return res.status(200).send("Pendiente de pago");
    }
    case "report_issue":{
        console.log(`🟡 [DEBUG] Usuario está en report_issue - Mensaje: ${Body}`);
      
        // Guardar reporte en Firestore
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
      
        // Confirmar al usuario
        await sendMessage("✅ ¡Tu reporte ha sido registrado! Nuestro equipo lo revisará pronto.", From);
      
        // Limpiar la sesión del usuario
        await sessionRef.delete();
        return res.status(200).send("Reporte registrado y confirmado");
        }
    
    /* -------------------------------------------------
       DEFAULT => Fallback
    ------------------------------------------------- */
    default:
      // Fallback => Pide de nuevo o GPT si quieres
      await sendMessage(
        "No entendí tu opción. Por favor, elige un número del menú o escribe 'menu' para volver a mostrarlo.",
        From
      );
      return res.status(200).send("Menú fallback");
  }
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

// Middleware global para manejar errores
app.use((err, req, res, next) => {
  console.error('❌ Error en middleware global:', err.stack);
  res.status(500).json({ message: 'Ocurrió un error inesperado.' });
});

// 🚀 Iniciar el servidor y realizar acciones iniciales
app.listen(port, async () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);

  console.log("⏳ Obteniendo un nuevo token al arrancar...");
  const newToken = await fetchAndStoreToken(); // 🔄 Siempre obtiene un nuevo token al iniciar

  if (newToken) {
    currentAccessToken = newToken.accessToken;
    currentRefreshToken = newToken.refreshToken;
    console.log("✅ Nuevo token obtenido y almacenado en Firestore.");
  } else {
    console.error("❌ Error al obtener el token al iniciar.");
    process.exit(1); // 🚨 Si no hay token, el servidor no puede funcionar correctamente
  }

  console.log("⏳ Obteniendo token desde Firestore para manejar autenticación...");
  const tokenDoc = await db.collection("tokens").doc("jimi-token").get();

  if (tokenDoc.exists) {
    const tokenData = tokenDoc.data();
    currentAccessToken = tokenData.accessToken;
    currentRefreshToken = tokenData.refreshToken;
    console.log("✅ Token inicial cargado desde Firestore para los siguientes ciclos.");
  } else {
    console.warn("⚠️ No se encontró un token en Firestore después del primer ciclo.");
  }

  // 🔄 Llamar a initializeIntegration solo si no está en ejecución
  if (!integrationInitialized) {
    integrationInitialized = true;
    await initializeIntegration();
  }
});
