# analyze_document.py
import cv2
import pytesseract
import face_recognition
import sys
import json
import numpy as np
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image as keras_image

image_path = sys.argv[1]
model_path = 'document_classifier.h5'  # Modelo entrenado

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

def classify_document(model_path, image_path):
    model = load_model(model_path)
    img = keras_image.load_img(image_path, target_size=(224, 224))
    img_array = keras_image.img_to_array(img) / 255.0
    img_array = np.expand_dims(img_array, axis=0)
    prediction = model.predict(img_array)
    label = 'ID CARD' if prediction[0][0] > 0.5 else 'PASSPORT'
    confidence = float(prediction[0][0]) if label == 'ID CARD' else 1 - float(prediction[0][0])
    return label, confidence

def analyze_document(image_path, model_path):
    image, _ = preprocess_image(image_path)
    text = extract_text(image)
    faces = detect_faces(image_path)
    label, confidence = classify_document(model_path, image_path)
    
    keywords = ['PASSPORT', 'IDENTITY', 'ID', 'DOCUMENT', 'REPUBLIC']
    has_keywords = any(keyword in text.upper() for keyword in keywords)
    
    result = {
        "document_type": label,
        "confidence": round(confidence, 2),
        "has_face": len(faces) > 0,
        "text_found": text,
        "has_keywords": has_keywords
    }
    return result

if __name__ == '__main__':
    analysis = analyze_document(image_path, model_path)
    print(json.dumps(analysis))
