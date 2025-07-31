# ============================================================================
# DOCKERFILE MULTI-STAGE PARA SISTEMA SSO
# ============================================================================

# Stage 1: Base Node.js
FROM node:18-alpine AS base

# Instalar dependencias del sistema necesarias
RUN apk add --no-cache \
    curl \
    bash \
    postgresql-client \
    nginx \
    supervisor \
    tzdata

# Configurar timezone
ENV TZ=UTC

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S sso && \
    adduser -S sso -u 1001 -G sso

# Stage 2: Dependencies
FROM base AS dependencies

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias (usar npm install en lugar de ci)
RUN npm install --only=production && npm cache clean --force

# Stage 3: Build
FROM base AS build

WORKDIR /app

# Copiar dependencias del stage anterior
COPY --from=dependencies /app/node_modules ./node_modules

# Copiar código fuente
COPY src/ ./src/
COPY public/ ./public/
COPY package*.json ./

# Stage 4: Production
FROM base AS production

WORKDIR /app

# Copiar aplicación
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
COPY --from=build /app/package*.json ./

# Copiar archivos de configuración
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/start.sh ./start.sh

# Hacer ejecutable el script de inicio
RUN chmod +x ./start.sh

# Crear directorio para logs
RUN mkdir -p /var/log/sso /var/log/nginx /var/log/supervisor

# Configurar permisos
RUN chown -R sso:sso /app /var/log/sso /var/log/nginx /var/log/supervisor

# Crear directorio para nginx
RUN mkdir -p /var/cache/nginx /var/run/nginx && \
    chown -R sso:sso /var/cache/nginx /var/run/nginx

# Exponer puerto
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Cambiar a usuario no-root
USER sso

# Comando de inicio
CMD ["./start.sh"]