# analyze_document.py
import os
import cv2
import pytesseract
import face_recognition
import sys
import json
import numpy as np
from google.cloud import storage
from PIL import Image

from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image as keras_image
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'  # ✅ Silenciar TensorFlow
# Ruta de la imagen
image_path = sys.argv[1]

# ⚙️ Cargar modelo una vez al inicio
model = load_model('document_classifier.h5')

def preprocess_image(image_path):
    image = cv2.imread(image_path)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    return image, blur

def extract_text(image):
    return pytesseract.image_to_string(image)

def detect_faces(image_path):
    image = face_recognition.load_image_file(image_path)
    return face_recognition.face_locations(image)

def classify_document(image_path):
    img = keras_image.load_img(image_path, target_size=(224, 224))
    img_array = keras_image.img_to_array(img) / 255.0
    img_array = np.expand_dims(img_array, axis=0)
    prediction = model.predict(img_array)
    label = 'DNI' if prediction[0][0] > 0.5 else 'PASAPORTE'
    confidence = float(prediction[0][0]) if label == 'DNI' else 1 - float(prediction[0][0])
    return label, confidence

# ⚙️ Configuración cliente Storage
def get_storage_client():
    return storage.Client.from_service_account_json('firebase-adminsdk.json')  # ⚠️ Ruta al archivo service account

# ⚙️ Detecta rostro, recorta y sube al Storage
def detect_and_upload_face(image_path, dni):
    image = face_recognition.load_image_file(image_path)
    face_locations = face_recognition.face_locations(image)

    if not face_locations:
        print('❌ No se detectó rostro.', file=sys.stderr)
        return None  # No subir nada si no hay rostro

    # Tomar primer rostro detectado
    top, right, bottom, left = face_locations[0]
    face_image = image[top:bottom, left:right]
    face_pil = Image.fromarray(face_image)

    # Guardar imagen recortada temporal
    cropped_face_path = f"./temp_face_{dni}.jpg"
    face_pil.save(cropped_face_path)

    # Subir a Firebase Storage
    bucket_name = 'jinete-ar.appspot.com'  # ⚠️ Bucket corregido según tu config (ver abajo nota)
    destination_blob_name = f"rostros/{dni}_face.jpg"

    client = get_storage_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(destination_blob_name)
    blob.upload_from_filename(cropped_face_path)
    blob.make_public()  # Opcional: hacerlo público

    print(f"✅ Rostro subido correctamente: {blob.public_url}", file=sys.stderr)

    # Borrar imagen temporal
    os.remove(cropped_face_path)

    return blob.public_url

def analyze_document(image_path, dni):
    image, _ = preprocess_image(image_path)
    text = extract_text(image)
    faces = detect_faces(image_path)
    label, confidence = classify_document(image_path)
    
    keywords = ['PASSPORT', 'IDENTITY', 'ID', 'DOCUMENT', 'REPUBLICA', 'PASAPORTE', 'IDENTIDAD', 'DOCUMENTO', 'NACIONALIDAD', 'APELLIDO', 'NOMBRE', 'DNI']
    has_keywords = any(keyword in text.upper() for keyword in keywords)
    
    # ✅ Si detecta rostro, subirlo al Storage
    face_url = None
    if len(faces) > 0:
        face_url = detect_and_upload_face(image_path, dni)

    result = {
        "document_type": label,
        "confidence": round(confidence, 2),
        "has_face": len(faces) > 0,
        "text_found": text,
        "has_keywords": has_keywords,
        "face_url": face_url  # ✅ URL del rostro recortado o None
    }
    return result

if __name__ == '__main__':
    image_path = sys.argv[1]
    dni = sys.argv[2]
    analysis = analyze_document(image_path, dni)  # ✅ Corregido
    sys.stdout.write(json.dumps(analysis))  # ✅ Salida limpia