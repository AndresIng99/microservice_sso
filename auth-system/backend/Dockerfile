# Backend Dockerfile
FROM node:18-alpine

# Instalar dependencias del sistema
RUN apk add --no-cache openssl

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias
RUN npm ci

# Generar cliente de Prisma
RUN npx prisma generate

# Copiar código fuente
COPY . .

# Compilar TypeScript
RUN npm run build

# Exponer puerto
EXPOSE 3000

# Crear script de inicio que maneja migraciones
RUN echo '#!/bin/sh\n\
echo "🚀 Iniciando backend..."\n\
echo "⏳ Esperando base de datos..."\n\
sleep 10\n\
echo "📦 Ejecutando migraciones..."\n\
npx prisma migrate deploy\n\
echo "🌱 Ejecutando seed..."\n\
npx prisma db seed\n\
echo "✅ Backend listo!"\n\
exec "$@"' > /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]

# Comando por defecto
CMD ["npm", "start"]