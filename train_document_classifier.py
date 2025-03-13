import os
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras import layers, models
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from PIL import Image, ImageFilter, ImageEnhance

# ✅ CONFIGURACIÓN
DATASET_PATH = 'dataset/'  # Debe contener 'valido/' y 'invalido/'
MODEL_OUTPUT = 'document_classifier_inicial.h5'

# ✅ Generador de Data Augmentation
datagen = ImageDataGenerator(
    rescale=1./255,
    rotation_range=15,
    width_shift_range=0.1,
    height_shift_range=0.1,
    zoom_range=0.2,
    shear_range=0.15,
    brightness_range=[0.7, 1.3],
    horizontal_flip=False,
    fill_mode='nearest',
    validation_split=0.2
)

# ✅ Generadores de datos
train_gen = datagen.flow_from_directory(
    DATASET_PATH,
    target_size=(224, 224),
    batch_size=8,
    class_mode='binary',
    subset='training'
)

val_gen = datagen.flow_from_directory(
    DATASET_PATH,
    target_size=(224, 224),
    batch_size=8,
    class_mode='binary',
    subset='validation'
)

# ✅ MobileNetV2 como base
base_model = MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights='imagenet')
base_model.trainable = False

# ✅ Modelo final
model = models.Sequential([
    base_model,
    layers.GlobalAveragePooling2D(),
    layers.Dense(64, activation='relu'),
    layers.Dropout(0.3),
    layers.Dense(1, activation='sigmoid')
])

# ✅ Compilación
model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])

# ✅ GENERADOR DE IMÁGENES INVÁLIDAS (opcional para clase 'invalido')
def generate_invalid_images(source_folder, output_folder, count=5):
    os.makedirs(output_folder, exist_ok=True)
    for idx, filename in enumerate(os.listdir(source_folder)):
        if filename.endswith(('.jpg', '.png')):
            image_path = os.path.join(source_folder, filename)
            img = Image.open(image_path)
            for i in range(count):
                img_variant = img.copy()
                # Aplicar efectos
                img_variant = img_variant.filter(ImageFilter.GaussianBlur(radius=3))  # Desenfoque
                enhancer = ImageEnhance.Brightness(img_variant)
                img_variant = enhancer.enhance(0.5)  # Oscurecer
                enhancer_contrast = ImageEnhance.Contrast(img_variant)
                img_variant = enhancer_contrast.enhance(0.7)  # Menos contraste
                img_variant = img_variant.convert('RGB')  # ✅ Convertir a RGB para JPEG
                # Guardar
                output_name = f"invalid_{idx}_{i}.jpg"
                img_variant.save(os.path.join(output_folder, output_name))
                print(f"Generada imagen inválida: {output_name}")


# ✅ EJECUCIÓN AUTOMÁTICA (corregido)
if __name__ == '__main__':
    # Paso 1: Generar imágenes inválidas
    generate_invalid_images('dataset/valido/', 'dataset/invalido/', count=5)
    print("Generación de imágenes inválidas completada.")

    # Paso 2: Entrenar modelo
    print("Iniciando entrenamiento del modelo...")
    history = model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=10
    )
    model.save(MODEL_OUTPUT)
    print(f"✅ Modelo guardado como {MODEL_OUTPUT}")
