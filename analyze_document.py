# analyze_document_v3.py (versión final y robusta)
import os
import cv2
import pytesseract
import face_recognition
import sys
import json
import re
import numpy as np
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image as keras_image

# ⚙️ Silenciar TensorFlow
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

# Ruta de la imagen
image_path = sys.argv[1]

# Cargar modelo de clasificación
model = load_model('document_classifier.h5')


# ✅ Corrección OCR general
def clean_ocr_text(text):
    corrections = {'|': 'I', '¢': 'C'}
    for wrong, right in corrections.items():
        text = text.replace(wrong, right)
    return text


# ✅ Corregir números: O → 0 entre dígitos
def fix_numbers(text):
    return re.sub(r'(?<=\d)O(?=\d)', '0', text)


# ✅ Preprocesamiento de imagen
def preprocess_image(image_path):
    image = cv2.imread(image_path)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh


# ✅ OCR completo
def extract_text(image):
    return pytesseract.image_to_string(image)


# ✅ Contar rostros
def detect_faces(image_path):
    image = face_recognition.load_image_file(image_path)
    return face_recognition.face_locations(image)


# ✅ Clasificar documento
def classify_document(image_path):
    img = keras_image.load_img(image_path, target_size=(224, 224))
    img_array = keras_image.img_to_array(img) / 255.0
    img_array = np.expand_dims(img_array, axis=0)
    prediction = model.predict(img_array)
    label = 'DNI' if prediction[0][0] > 0.5 else 'PASAPORTE'
    confidence = float(prediction[0][0]) if label == 'DNI' else 1 - float(prediction[0][0])
    return label, confidence


# ✅ Corrección de clasificación según OCR
def adjust_label_based_on_text(label, confidence, text):
    if label == "DNI" and any(word in text.upper() for word in ['PASSPORT', 'PASAPORTE', 'PASSEPORT']):
        return "PASAPORTE", 0.99
    if label == "PASAPORTE" and any(word in text.upper() for word in ['DNI', 'DOCUMENTO NACIONAL']):
        return "DNI", 0.99
    return label, confidence


# ✅ Extraer número de DNI
def extract_dni_number(text):
    text = fix_numbers(text)
    match = re.search(r'\b\d{2}\.\d{3}\.\d{3}\b', text)
    if match:
        return match.group(0).replace('.', '').strip()
    match = re.search(r'\b\d{7,9}\b', text)
    if match:
        return match.group(0).strip()
    match = re.search(r'Document[o|a]\s*/\s*Document.*?(\d{7,9})', text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None


# ✅ Extraer campos DNI
def extract_dni_fields(text):
    fields = {}

    dni_number = extract_dni_number(text)
    if dni_number:
        fields['dni_number'] = dni_number

    sexo_match = re.search(r'Sexo\s*/\s*Sex\s*[:\s]*([MFH])', text, re.IGNORECASE)
    if sexo_match:
        fields['sex'] = sexo_match.group(1)

    fullname_match = re.search(r'Apellido\s*/\s*Surname\s*\n*([A-ZÑ\s\.]+)\n*Nombre\s*/\s*Name\s*\n*([A-ZÑ\s\.]+)', text, re.IGNORECASE)
    if fullname_match:
        fields['surname'] = fullname_match.group(1).strip()
        fields['name'] = fullname_match.group(2).strip()

    nacimiento_match = re.search(r'Fecha de nacimiento.*?(\d{2}\s\w+\s\d{4})', text, re.IGNORECASE)
    if nacimiento_match:
        fields['birth_date'] = nacimiento_match.group(1).strip()

    vencimiento_match = re.search(r'Fecha de vencimiento.*?(\d{2}\s\w+\s\d{4})', text, re.IGNORECASE)
    if vencimiento_match:
        fields['expiration_date'] = vencimiento_match.group(1).strip()

    tramite_match = re.search(r'Trámit.*?:\s*([\d]+)', text, re.IGNORECASE)
    if tramite_match:
        fields['process_number'] = tramite_match.group(1).strip()

    return fields


# ✅ Función principal
def analyze_document(image_path):
    image = preprocess_image(image_path)
    text = extract_text(image)
    text = clean_ocr_text(text)
    text = fix_numbers(text)
    faces = detect_faces(image_path)
    label, confidence = classify_document(image_path)

    # Ajustar tipo según palabras clave del OCR
    label, confidence = adjust_label_based_on_text(label, confidence, text)

    # Keywords generales
    keywords = ['PASSPORT', 'IDENTITY', 'ID', 'DOCUMENT', 'REPUBLICA', 'PASAPORTE', 'IDENTIDAD', 'DOCUMENTO', 'NACIONALIDAD', 'APELLIDO', 'NOMBRE', 'DNI']
    has_keywords = any(keyword in text.upper() for keyword in keywords)

    # Extraer campos solo si es DNI
    extracted_fields = extract_dni_fields(text) if label == "DNI" else {}

    # Resultado final
    result = {
        "document_type": label,
        "confidence": round(confidence, 2),
        "has_face": len(faces) > 0,
        "text_found": text,
        "has_keywords": has_keywords,
        "extracted_fields": extracted_fields
    }

    return result


# ✅ Ejecución directa
if __name__ == '__main__':
    analysis = analyze_document(image_path)
    sys.stdout.write(json.dumps(analysis, ensure_ascii=False, indent=4))

