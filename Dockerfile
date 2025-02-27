# Etapa 1: Construir el frontend con Vite
FROM node:20-alpine AS build

# Crear un directorio de trabajo para el frontend
WORKDIR /app

# Copiar solo los archivos necesarios para instalar dependencias
COPY package.json package-lock.json ./

# Instalar las dependencias
RUN npm install

# Copiar todo el código fuente
COPY . .

# Construir el frontend en modo producción
RUN npm run build

# Etapa 2: Configurar el servidor de Node.js para producción
FROM node:20-alpine

# Crear un directorio de trabajo para el backend
WORKDIR /app

# Copiar los archivos necesarios del backend
COPY package.json package-lock.json server.js ./
COPY ./src ./src

# Instalar solo las dependencias de producción
RUN npm install --production

# Copiar el build del frontend desde la etapa anterior
COPY --from=build /app/dist ./dist

# Exponer el puerto 8080 para Cloud Run
EXPOSE 8080

# Comando para iniciar el servidor de Node.js
CMD ["node", "server.js"]
