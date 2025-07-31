# 🚀 Sistema SSO - Autenticación Centralizada

## 🎯 ¿Qué es este sistema?

**Un centro de control único** que maneja toda la autenticación y autorización de tu ecosistema de microservicios. Como el "cerebro" que decide quién puede hacer qué en cada sistema.

### ✨ Características principales

- 🔐 **Single Sign-On (SSO)** - Una sola cuenta para todos los sistemas
- 🎭 **Gestión visual de roles** - Editor de permisos con interfaz drag & drop
- 🔧 **Auto-registro de microservicios** - Los servicios se conectan automáticamente
- 📊 **Dashboard en tiempo real** - Monitoreo y métricas actualizadas
- 🛡️ **Seguridad empresarial** - JWT, RBAC, auditoría completa
- 🐳 **Deploy en 30 segundos** - Un solo comando Docker

## 🚀 Instalación Ultra-Rápida

### Prerrequisitos
- Docker 20.0+
- Docker Compose 2.0+
- Puerto 3000 disponible

### Instalación en 3 pasos

```bash
# 1. Clonar repositorio
git clone https://github.com/tu-empresa/sso-microservice.git
cd sso-microservice

# 2. Levantar el sistema completo
docker-compose up -d

# 3. ¡Acceder al sistema!
# URL: http://localhost:3000
# Usuario: admin@sso.com
# Contraseña: admin123
```

### ✅ Verificar instalación

```bash
# Verificar que todos los servicios estén funcionando
docker-compose ps

# Ver logs del sistema
docker-compose logs -f sso-app

# Health check
curl http://localhost:3000/api/health
```

## 🎛️ Panel de Administración

### 🏠 Dashboard Principal
- 📊 Métricas en tiempo real (usuarios activos, servicios conectados)
- 🚨 Centro de alertas automáticas
- 📈 Gráficos de actividad
- 🔧 Acciones rápidas

### 👥 Gestión de Usuarios
- ✅ Crear/editar/eliminar usuarios desde la interfaz
- 🎭 Asignación visual de roles (drag & drop)
- 📊 Ver actividad de usuarios en tiempo real
- 🔒 Suspender/activar usuarios con un clic

### 🎭 Gestión de Roles
- ✅ Crear roles personalizados
- 🔑 Editor visual de permisos (matriz de checkboxes)
- 📋 Clonar roles existentes
- 📊 Ver estadísticas de uso de roles

### 🔧 Gestión de Microservicios
- ✅ Auto-registro cuando los servicios arrancan
- ⚙️ Configuración visual de endpoints y permisos
- 🔍 Auto-descubrimiento de rutas
- 💚 Monitoreo de salud en tiempo real

## 🔌 Integrar Microservicios

### Node.js + Express

```javascript
const express = require('express');
const SSOClient = require('@tu-empresa/sso-client');

const app = express();
const sso = new SSOClient({
    ssoUrl: 'http://sso:3000',
    serviceName: 'mi-servicio',
    version: '1.0.0'
});

// Aplicar middleware de autenticación
app.use('/api', sso.middleware());

// Rutas con permisos específicos
app.get('/api/data', sso.requirePermission('data.read'), (req, res) => {
    res.json({ 
        user: req.user, 
        data: 'Datos protegidos' 
    });
});

// Auto-registrar servicio
sso.register();

app.listen(3001);
```

### Python + FastAPI

```python
from fastapi import FastAPI, Depends
from sso_client import SSOClient, require_permission

app = FastAPI()
sso = SSOClient(
    sso_url="http://sso:3000",
    service_name="mi-servicio-python"
)

@app.get("/api/data")
@require_permission("data.read")
async def get_data(user: dict = Depends(sso.get_current_user)):
    return {
        "user": user,
        "data": "Datos protegidos"
    }

# Auto-registrar al iniciar
sso.register()
```

### Frontend React

```javascript
import { SSOProvider, useSSO } from '@tu-empresa/sso-react';

function App() {
    return (
        <SSOProvider ssoUrl="http://localhost:3000">
            <Dashboard />
        </SSOProvider>
    );
}

function Dashboard() {
    const { user, logout, hasPermission } = useSSO();
    
    return (
        <div>
            <h1>Bienvenido, {user?.firstName}</h1>
            
            {hasPermission('admin.read') && (
                <AdminPanel />
            )}
            
            <button onClick={logout}>Cerrar Sesión</button>
        </div>
    );
}
```

## 📊 APIs Disponibles

### 🔐 Autenticación
```
POST /api/auth/login      # Iniciar sesión
POST /api/auth/logout     # Cerrar sesión
GET  /api/auth/verify     # Verificar token
POST /api/auth/refresh    # Renovar token
```

### 👥 Usuarios
```
GET    /api/users         # Listar usuarios
POST   /api/users         # Crear usuario
GET    /api/users/:id     # Obtener usuario
PUT    /api/users/:id     # Actualizar usuario
DELETE /api/users/:id     # Eliminar usuario
```

### 🎭 Roles
```
GET    /api/roles         # Listar roles
POST   /api/roles         # Crear rol
PUT    /api/roles/:id     # Actualizar rol
DELETE /api/roles/:id     # Eliminar rol
POST   /api/roles/:id/clone  # Clonar rol
```

### 🔧 Microservicios
```
GET    /api/services              # Listar servicios
POST   /api/services/register     # Registrar servicio
PUT    /api/services/:id          # Actualizar servicio
GET    /api/services/:id/routes   # Ver rutas del servicio
POST   /api/services/:id/discover # Auto-descubrir rutas
```

### 📊 Monitoreo
```
GET /api/dashboard/stats     # Estadísticas generales
GET /api/dashboard/activity  # Actividad reciente
GET /api/monitoring/logs     # Logs del sistema
GET /api/monitoring/metrics  # Métricas detalladas
```

## 🛡️ Seguridad

### Características de Seguridad
- 🔒 **Passwords hasheados** con bcrypt (12 rounds)
- 🎫 **JWT tokens** con expiración configurable
- 🚫 **Rate limiting** para prevenir ataques
- 📝 **Auditoría completa** de todas las acciones
- 🔐 **Sesiones seguras** con revocación automática
- 🛡️ **Headers de seguridad** configurados

### Configuración de Seguridad
```bash
# Variables de entorno importantes
JWT_SECRET=tu-secreto-ultra-seguro
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_TIME=15  # minutos
```

## 🔧 Configuración Avanzada

### Variables de Entorno

```bash
# Copia el archivo de ejemplo
cp .env.example .env

# Edita las variables según tu entorno
vim .env
```

### Configuración de Base de Datos

```yaml
# docker-compose.yml
services:
  sso-db:
    environment:
      POSTGRES_DB: tu_base_datos
      POSTGRES_USER: tu_usuario
      POSTGRES_PASSWORD: tu_password_seguro
```

### Configuración de Redis (Opcional)

```yaml
# Para mejor performance con cache
services:
  sso-redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## 📈 Monitoreo y Métricas

### Health Checks
```bash
# Verificar estado del sistema
curl http://localhost:3000/api/health

# Ver métricas detalladas
curl http://localhost:3000/api/monitoring/metrics
```

### Logs
```bash
# Ver logs en tiempo real
docker-compose logs -f sso-app

# Logs específicos de Nginx
docker-compose logs -f nginx

# Logs de base de datos
docker-compose logs -f sso-db
```

### Alertas Automáticas
- 🚨 Servicios desconectados
- 📈 Picos de actividad inusual
- 🔒 Intentos de login fallidos
- ⚠️ Errores del sistema

## 🚨 Troubleshooting

### Problemas Comunes

**Error: Puerto 3000 en uso**
```bash
# Verificar qué usa el puerto
lsof -i :3000

# Cambiar puerto en docker-compose.yml
ports:
  - "3001:3000"  # Usar puerto 3001
```

**Error: Base de datos no conecta**
```bash
# Verificar que PostgreSQL esté corriendo
docker-compose ps sso-db

# 🚀 Sistema SSO - Autenticación Centralizada

## 🎯 ¿Qué es este sistema?

**Un centro de control único** que maneja toda la autenticación y autorización de tu ecosistema de microservicios. Como el "cerebro" que decide quién puede hacer qué en cada sistema.

### ✨ Características principales

- 🔐 **Single Sign-On (SSO)** - Una sola cuenta para todos los sistemas
- 🎭 **Gestión visual de roles** - Editor de permisos con interfaz drag & drop
- 🔧 **Auto-registro de microservicios** - Los servicios se conectan automáticamente
- 📊 **Dashboard en tiempo real** - Monitoreo y métricas actualizadas
- 🛡️ **Seguridad empresarial** - JWT, RBAC, auditoría completa
- 🐳 **Deploy en 30 segundos** - Un solo comando Docker

## 🚀 Instalación Ultra-Rápida

### Prerrequisitos
- Docker 20.0+
- Docker Compose 2.0+
- Puerto 3000 disponible

### Instalación en 3 pasos

```bash
# 1. Clonar repositorio
git clone https://github.com/tu-empresa/sso-microservice.git
cd sso-microservice

# 2. Levantar el sistema completo
docker-compose up -d

# 3. ¡Acceder al sistema!
# URL: http://localhost:3000
# Usuario: admin@sso.com
# Contraseña: admin123
```

### ✅ Verificar instalación

```bash
# Verificar que todos los servicios estén funcionando
docker-compose ps

# Ver logs del sistema
docker-compose logs -f sso-app

# Health check
curl http://localhost:3000/api/health
```

## 🎛️ Panel de Administración

### 🏠 Dashboard Principal
- 📊 Métricas en tiempo real (usuarios activos, servicios conectados)
- 🚨 Centro de alertas automáticas
- 📈 Gráficos de actividad
- 🔧 Acciones rápidas

### 👥 Gestión de Usuarios
- ✅ Crear/editar/eliminar usuarios desde la interfaz
- 🎭 Asignación visual de roles (drag & drop)
- 📊 Ver actividad de usuarios en tiempo real
- 🔒 Suspender/activar usuarios con un clic

### 🎭 Gestión de Roles
- ✅ Crear roles personalizados
- 🔑 Editor visual de permisos (matriz de checkboxes)
- 📋 Clonar roles existentes
- 📊 Ver estadísticas de uso de roles

### 🔧 Gestión de Microservicios
- ✅ Auto-registro cuando los servicios arrancan
- ⚙️ Configuración visual de endpoints y permisos
- 🔍 Auto-descubrimiento de rutas
- 💚 Monitoreo de salud en tiempo real

## 🔌 Integrar Microservicios

### Node.js + Express

```javascript
const express = require('express');
const SSOClient = require('@tu-empresa/sso-client');

const app = express();
const sso = new SSOClient({
    ssoUrl: 'http://sso:3000',
    serviceName: 'mi-servicio',
    version: '1.0.0'
});

// Aplicar middleware de autenticación
app.use('/api', sso.middleware());

// Rutas con permisos específicos
app.get('/api/data', sso.requirePermission('data.read'), (req, res) => {
    res.json({ 
        user: req.user, 
        data: 'Datos protegidos' 
    });
});

// Auto-registrar servicio
sso.register();

app.listen(3001);
```

### Python + FastAPI

```python
from fastapi import FastAPI, Depends
from sso_client import SSOClient, require_permission

app = FastAPI()
sso = SSOClient(
    sso_url="http://sso:3000",
    service_name="mi-servicio-python"
)

@app.get("/api/data")
@require_permission("data.read")
async def get_data(user: dict = Depends(sso.get_current_user)):
    return {
        "user": user,
        "data": "Datos protegidos"
    }

# Auto-registrar al iniciar
sso.register()
```

### Frontend React

```javascript
import { SSOProvider, useSSO } from '@tu-empresa/sso-react';

function App() {
    return (
        <SSOProvider ssoUrl="http://localhost:3000">
            <Dashboard />
        </SSOProvider>
    );
}

function Dashboard() {
    const { user, logout, hasPermission } = useSSO();
    
    return (
        <div>
            <h1>Bienvenido, {user?.firstName}</h1>
            
            {hasPermission('admin.read') && (
                <AdminPanel />
            )}
            
            <button onClick={logout}>Cerrar Sesión</button>
        </div>
    );
}
```

## 📊 APIs Disponibles

### 🔐 Autenticación
```
POST /api/auth/login      # Iniciar sesión
POST /api/auth/logout     # Cerrar sesión
GET  /api/auth/verify     # Verificar token
POST /api/auth/refresh    # Renovar token
```

### 👥 Usuarios
```
GET    /api/users         # Listar usuarios
POST   /api/users         # Crear usuario
GET    /api/users/:id     # Obtener usuario
PUT    /api/users/:id     # Actualizar usuario
DELETE /api/users/:id     # Eliminar usuario
```

### 🎭 Roles
```
GET    /api/roles         # Listar roles
POST   /api/roles         # Crear rol
PUT    /api/roles/:id     # Actualizar rol
DELETE /api/roles/:id     # Eliminar rol
POST   /api/roles/:id/clone  # Clonar rol
```

### 🔧 Microservicios
```
GET    /api/services              # Listar servicios
POST   /api/services/register     # Registrar servicio
PUT    /api/services/:id          # Actualizar servicio
GET    /api/services/:id/routes   # Ver rutas del servicio
POST   /api/services/:id/discover # Auto-descubrir rutas
```

### 📊 Monitoreo
```
GET /api/dashboard/stats     # Estadísticas generales
GET /api/dashboard/activity  # Actividad reciente
GET /api/monitoring/logs     # Logs del sistema
GET /api/monitoring/metrics  # Métricas detalladas
```

## 🛡️ Seguridad

### Características de Seguridad
- 🔒 **Passwords hasheados** con bcrypt (12 rounds)
- 🎫 **JWT tokens** con expiración configurable
- 🚫 **Rate limiting** para prevenir ataques
- 📝 **Auditoría completa** de todas las acciones
- 🔐 **Sesiones seguras** con revocación automática
- 🛡️ **Headers de seguridad** configurados

### Configuración de Seguridad
```bash
# Variables de entorno importantes
JWT_SECRET=tu-secreto-ultra-seguro
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_TIME=15  # minutos
```

## 🔧 Configuración Avanzada

### Variables de Entorno

```bash
# Copia el archivo de ejemplo
cp .env.example .env

# Edita las variables según tu entorno
vim .env
```

### Configuración de Base de Datos

```yaml
# docker-compose.yml
services:
  sso-db:
    environment:
      POSTGRES_DB: tu_base_datos
      POSTGRES_USER: tu_usuario
      POSTGRES_PASSWORD: tu_password_seguro
```

### Configuración de Redis (Opcional)

```yaml
# Para mejor performance con cache
services:
  sso-redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## 📈 Monitoreo y Métricas

### Health Checks
```bash
# Verificar estado del sistema
curl http://localhost:3000/api/health

# Ver métricas detalladas
curl http://localhost:3000/api/monitoring/metrics
```

### Logs
```bash
# Ver logs en tiempo real
docker-compose logs -f sso-app

# Logs específicos de Nginx
docker-compose logs -f nginx

# Logs de base de datos
docker-compose logs -f sso-db
```

### Alertas Automáticas
- 🚨 Servicios desconectados
- 📈 Picos de actividad inusual
- 🔒 Intentos de login fallidos
- ⚠️ Errores del sistema

## 🚨 Troubleshooting

### Problemas Comunes

**Error: Puerto 3000 en uso**
```bash
# Verificar qué usa el puerto
lsof -i :3000

# Cambiar puerto en docker-compose.yml
ports:
  - "3001:3000"  # Usar puerto 3001
```

**Error: Base de datos no conecta**
```bash
# Verificar que PostgreSQL esté corriendo
docker-compose ps sso-db

# Ver logs de la base de datos
docker-compose logs sso-db

# Reiniciar solo la base de datos
docker-compose restart sso-db
```

**Error: Servicio no se registra**
```bash
# Verificar conectividad de red
docker network ls
docker network inspect sso-network

# Verificar que el microservicio esté en la misma red
# En docker-compose.yml del microservicio:
networks:
  - sso-network

networks:
  sso-network:
    external: true
```

**Usuario admin no puede acceder**
```bash
# Resetear password del admin
docker-compose exec sso-app node -e "
const auth = require('./src/auth');
auth.hashPassword('nuevaPassword123').then(hash => {
  console.log('Nuevo hash:', hash);
});
"

# Actualizar en la base de datos
docker-compose exec sso-db psql -U sso_admin -d sso_system -c "
UPDATE users SET password_hash = 'NUEVO_HASH' WHERE email = 'admin@sso.com';
"
```

### Comandos Útiles

```bash
# Reiniciar todo el sistema
docker-compose down && docker-compose up -d

# Ver estadísticas de contenedores
docker stats

# Limpiar datos y empezar de cero
docker-compose down -v
docker-compose up -d

# Backup de la base de datos
docker-compose exec sso-db pg_dump -U sso_admin sso_system > backup.sql

# Restaurar backup
docker-compose exec -T sso-db psql -U sso_admin sso_system < backup.sql

# Acceder a la base de datos directamente
docker-compose exec sso-db psql -U sso_admin sso_system

# Ver logs de un servicio específico
docker-compose logs -f sso-app --tail=100
```

## 🔄 Actualización del Sistema

### Actualizar a nueva versión

```bash
# 1. Hacer backup
docker-compose exec sso-db pg_dump -U sso_admin sso_system > backup_$(date +%Y%m%d).sql

# 2. Descargar nueva versión
git pull origin main

# 3. Reconstruir imágenes
docker-compose build --no-cache

# 4. Reiniciar servicios
docker-compose down
docker-compose up -d

# 5. Verificar que todo funcione
curl http://localhost:3000/api/health
```

### Migración de datos

```bash
# Ejecutar migraciones si es necesario
docker-compose exec sso-app node src/utils.js migrate

# Verificar integridad de datos
docker-compose exec sso-app node src/utils.js validate
```

## 🏗️ Desarrollo

### Desarrollo local

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.development

# Ejecutar en modo desarrollo
npm run dev

# Ejecutar tests
npm test

# Linting
npm run lint
```

### Estructura del proyecto

```
microservicio-sso/
├── src/                    # Backend Node.js
│   ├── app.js             # Aplicación principal
│   ├── database.js        # Conexión y modelos de BD
│   ├── auth.js            # Autenticación y JWT
│   ├── controllers.js     # Lógica de negocio
│   └── utils.js           # Utilidades
├── public/                # Frontend estático
│   ├── index.html         # Interfaz completa
│   ├── style.css          # Estilos
│   └── app.js             # JavaScript frontend
├── database/              # Scripts de BD
│   └── init.sql           # Inicialización completa
├── docker/                # Configuración Docker
└── sdk/                   # SDK para microservicios
```

## 📚 Documentación Adicional

### Para Desarrolladores
- [Guía de Integración de Microservicios](docs/INTEGRATION.md)
- [Referencia de APIs](docs/API.md)
- [Configuración Avanzada](docs/CONFIGURATION.md)

### Para Administradores
- [Guía de Despliegue](docs/DEPLOYMENT.md)
- [Monitoreo y Alertas](docs/MONITORING.md)
- [Backup y Recuperación](docs/BACKUP.md)

### Para Usuarios Finales
- [Manual de Usuario](docs/USER_GUIDE.md)
- [Preguntas Frecuentes](docs/FAQ.md)

## 🤝 Contribuir

### Reportar problemas

1. Busca en [issues existentes](https://github.com/tu-empresa/sso-microservice/issues)
2. Si no existe, [crea un nuevo issue](https://github.com/tu-empresa/sso-microservice/issues/new)
3. Incluye toda la información relevante:
   - Versión del sistema
   - Pasos para reproducir
   - Logs de error
   - Configuración utilizada

### Contribuir código

1. Fork del repositorio
2. Crear branch para tu feature: `git checkout -b feature/mi-feature`
3. Hacer commits con mensajes descriptivos
4. Agregar tests para nueva funcionalidad
5. Asegurar que todos los tests pasen: `npm test`
6. Crear Pull Request

## 📄 Licencia

Este proyecto está licenciado bajo la [Licencia MIT](LICENSE).

## 🙏 Créditos

Desarrollado con ❤️ para simplificar la autenticación en arquitecturas de microservicios.

### Tecnologías utilizadas
- **Backend:** Node.js, Express, PostgreSQL, Redis
- **Seguridad:** JWT, bcrypt, helmet
- **Frontend:** HTML5, CSS3, JavaScript vanilla
- **Containerización:** Docker, Docker Compose
- **Proxy:** Nginx

---

## 📞 Soporte

¿Necesitas ayuda? 

- 📖 Revisa la [documentación completa](docs/)
- 🐛 [Reporta un bug](https://github.com/tu-empresa/sso-microservice/issues)
- 💬 [Discusiones y preguntas](https://github.com/tu-empresa/sso-microservice/discussions)
- 📧 Email: soporte@tu-empresa.com

---

**¡Gracias por usar nuestro Sistema SSO! 🚀**