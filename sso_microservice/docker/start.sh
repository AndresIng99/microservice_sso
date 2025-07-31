#!/bin/bash

# ============================================================================
# SCRIPT DE INICIO DEL CONTENEDOR SSO
# ============================================================================

set -e

echo "🚀 Iniciando Sistema SSO..."

# Colores para logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para logs con color
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar variables de entorno requeridas
log_info "Verificando variables de entorno..."

required_vars=(
    "DB_HOST"
    "DB_PORT" 
    "DB_NAME"
    "DB_USER"
    "DB_PASSWORD"
    "JWT_SECRET"
    "JWT_REFRESH_SECRET"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        log_error "Variable de entorno requerida no encontrada: $var"
        exit 1
    fi
done

log_success "Variables de entorno verificadas"

# Esperar a que PostgreSQL esté disponible
log_info "Esperando conexión a PostgreSQL..."
timeout=60
counter=0

while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
    counter=$((counter + 1))
    if [ $counter -gt $timeout ]; then
        log_error "Timeout esperando PostgreSQL después de ${timeout} segundos"
        exit 1
    fi
    log_warning "PostgreSQL no disponible, reintentando en 1 segundo... ($counter/$timeout)"
    sleep 1
done

log_success "PostgreSQL conectado exitosamente"

# Verificar si Redis está disponible (opcional)
if [ -n "$REDIS_HOST" ] && [ -n "$REDIS_PORT" ]; then
    log_info "Verificando conexión a Redis..."
    if timeout 5 bash -c "</dev/tcp/$REDIS_HOST/$REDIS_PORT" >/dev/null 2>&1; then
        log_success "Redis conectado exitosamente"
    else
        log_warning "Redis no disponible, continuando sin cache"
    fi
fi

# Crear directorios necesarios
log_info "Creando directorios de logs..."
mkdir -p /var/log/sso /var/log/nginx /var/run/nginx
touch /var/log/sso/app.log /var/log/sso/error.log

# Configurar permisos
chown -R sso:sso /var/log/sso /var/log/nginx /var/run/nginx

# Ejecutar migraciones o verificar esquema de BD
log_info "Verificando esquema de base de datos..."

# Verificar si las tablas principales existen
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1 FROM users LIMIT 1;" >/dev/null 2>&1; then
    log_success "Base de datos ya inicializada"
else
    log_warning "Base de datos no inicializada completamente"
    # En este caso, el init.sql debería haber corrido automáticamente
fi

# Verificar usuario administrador
log_info "Verificando usuario administrador..."
admin_exists=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM users WHERE email='admin@sso.com';" 2>/dev/null | tr -d ' \n' || echo "0")

if [ "$admin_exists" = "0" ]; then
    log_warning "Creando usuario administrador..."
    # Crear admin si no existe (fallback)
    admin_password_hash='$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewaAcLcv3hvh2.S2'
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, is_verified) 
        VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@sso.com', '$admin_password_hash', 'Administrador', 'Sistema', true, true)
        ON CONFLICT (email) DO NOTHING;
        
        INSERT INTO user_roles (user_id, role_id)
        VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111')
        ON CONFLICT (user_id, role_id) DO NOTHING;
    " >/dev/null 2>&1
    log_success "Usuario administrador creado"
else
    log_success "Usuario administrador ya existe"
fi

# Iniciar Nginx
log_info "Iniciando Nginx..."
nginx -t
if [ $? -eq 0 ]; then
    nginx -g "daemon off;" &
    NGINX_PID=$!
    log_success "Nginx iniciado (PID: $NGINX_PID)"
else
    log_error "Error en configuración de Nginx"
    exit 1
fi

# Función para manejar señales de terminación
cleanup() {
    log_info "Recibida señal de terminación, deteniendo servicios..."
    
    if [ -n "$NODE_PID" ]; then
        log_info "Deteniendo aplicación Node.js..."
        kill -TERM $NODE_PID 2>/dev/null || true
        wait $NODE_PID 2>/dev/null || true
    fi
    
    if [ -n "$NGINX_PID" ]; then
        log_info "Deteniendo Nginx..."
        kill -TERM $NGINX_PID 2>/dev/null || true
        wait $NGINX_PID 2>/dev/null || true
    fi
    
    log_success "Sistema SSO detenido correctamente"
    exit 0
}

# Configurar manejo de señales
trap cleanup SIGTERM SIGINT

# Esperar un momento para que Nginx se estabilice
sleep 2

# Verificar que Nginx esté funcionando
if ! curl -f http://localhost:3000/health >/dev/null 2>&1; then
    log_warning "Nginx no responde inmediatamente, pero continuando..."
fi

# Iniciar aplicación Node.js
log_info "Iniciando aplicación Node.js..."
cd /app

# Configurar variables de entorno para Node.js
export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-3001}

# Iniciar Node.js
node src/app.js &
NODE_PID=$!

log_success "Aplicación Node.js iniciada (PID: $NODE_PID)"

# Esperar que la aplicación esté lista
log_info "Esperando que la aplicación esté lista..."
timeout=30
counter=0

while ! curl -f http://localhost:3001/api/health >/dev/null 2>&1; do
    counter=$((counter + 1))
    if [ $counter -gt $timeout ]; then
        log_error "Timeout esperando que la aplicación esté lista"
        cleanup
        exit 1
    fi
    sleep 1
done

log_success "Aplicación Node.js lista y respondiendo"

# Mostrar información del sistema
echo ""
echo "========================================"
echo "🚀 SISTEMA SSO INICIADO EXITOSAMENTE"
echo "========================================"
echo "🌐 URL Principal: http://localhost:3000"
echo "🔑 Usuario Admin: admin@sso.com"
echo "🔒 Contraseña: admin123"
echo "🏥 Health Check: http://localhost:3000/api/health"
echo "📊 API Base: http://localhost:3000/api"
echo ""
echo "📋 Servicios Activos:"
echo "  ✅ Nginx (Puerto 3000)"
echo "  ✅ Node.js (Puerto 3001)"
echo "  ✅ PostgreSQL ($DB_HOST:$DB_PORT)"
if [ -n "$REDIS_HOST" ]; then
    echo "  ✅ Redis ($REDIS_HOST:$REDIS_PORT)"
fi
echo ""
echo "📁 Logs disponibles en:"
echo "  - Aplicación: /var/log/sso/"
echo "  - Nginx: /var/log/nginx/"
echo ""
echo "🎯 Sistema listo para registrar microservicios"
echo "========================================"

# Mantener el script corriendo
while true; do
    # Verificar que los procesos sigan vivos
    if ! kill -0 $NGINX_PID 2>/dev/null; then
        log_error "Nginx se detuvo inesperadamente"
        cleanup
        exit 1
    fi
    
    if ! kill -0 $NODE_PID 2>/dev/null; then
        log_error "Node.js se detuvo inesperadamente"
        cleanup
        exit 1
    fi
    
    sleep 10
done