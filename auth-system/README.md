# 🚀 Sistema de Autenticación Centralizado

Sistema completo de autenticación centralizada para microservicios con panel de administración web.

## 🎯 Características

- **Single Sign-On (SSO)** para todos los microservicios
- **Panel de administración** web completo
- **Gestión de usuarios, roles y permisos**
- **Monitoreo de microservicios** con health checks
- **API REST completa** con documentación
- **Integración súper simple** con cualquier microservicio

## 🏗️ Arquitectura

```
Usuario → Nginx (Gateway) → Backend (API) → PostgreSQL
                    ↓
            Frontend (React)
                    ↓
         Otros Microservicios
```

## 🚀 Inicio Rápido

### Prerrequisitos

- Docker y Docker Compose instalados
- Puertos 80, 3000, 3001 y 5432 disponibles

### 1. Clonar y configurar

```bash
# Crear directorio del proyecto
mkdir auth-system && cd auth-system

# Copiar todos los archivos del proyecto según la estructura
```

### 2. Configurar variables de entorno (opcional)

Edita el archivo `.env` para personalizar la configuración:

```env
# Credenciales de base de datos
POSTGRES_USER=admin
POSTGRES_PASSWORD=password123

# JWT Secret (CAMBIAR EN PRODUCCIÓN)
JWT_SECRET=tu-clave-super-secreta-aqui

# Usuario administrador por defecto
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin123
```

### 3. Levantar el sistema

```bash
# Construir e iniciar todos los servicios
docker-compose up -d

# Ver logs en tiempo real
docker-compose logs -f
```

### 4. Acceder al sistema

- **Panel de administración:** http://localhost
- **API Backend:** http://localhost/api
- **Credenciales por defecto:** admin / admin123

## 📁 Estructura del Proyecto

```
auth-system/
├── docker-compose.yml          # Configuración completa del sistema
├── .env                        # Variables de entorno
├── README.md                   # Este archivo
│
├── backend/                    # API + Base de datos
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma       # Esquema de BD
│   │   └── seed.ts             # Datos iniciales
│   └── src/
│       ├── index.ts            # Punto de entrada
│       ├── app.ts              # Configuración Fastify
│       ├── routes/             # Rutas de API
│       ├── services/           # Lógica de negocio
│       └── utils/              # Utilidades
│
├── frontend/                   # Panel de administración
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── pages/              # Páginas principales
│       ├── components/         # Componentes reutilizables
│       └── services/           # APIs
│
└── nginx/                      # Proxy y gateway
    ├── Dockerfile
    └── nginx.conf
```

## 🔧 Comandos Útiles

```bash
# Ver estado de los servicios
docker-compose ps

# Ver logs de un servicio específico
docker-compose logs backend
docker-compose logs frontend

# Reiniciar un servicio
docker-compose restart backend

# Acceder a la base de datos
docker-compose exec postgres psql -U admin -d auth_system

# Ejecutar migraciones manualmente
docker-compose exec backend npx prisma migrate deploy

# Parar todos los servicios
docker-compose down

# Parar y eliminar volúmenes (CUIDADO: borra la BD)
docker-compose down -v
```

## 🔗 Integración con Microservicios

### Opción 1: Middleware Simple (Node.js)

```javascript
const axios = require('axios');

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization;
  
  if (!token) {
    return res.redirect('http://localhost/login');
  }

  try {
    const response = await axios.get('http://localhost/api/auth/validate', {
      headers: { Authorization: token }
    });
    
    req.user = response.data.user;
    req.permissions = response.data.permissions;
    next();
  } catch (error) {
    return res.redirect('http://localhost/login');
  }
};

// Usar en rutas protegidas
app.use('/protected', authMiddleware);
```

### Opción 2: Nginx Automático

Agregar en `nginx.conf`:

```nginx
location /mi-microservicio/ {
    # Validar automáticamente
    auth_request /auth/validate;
    
    # Headers automáticos
    auth_request_set $user_id $upstream_http_x_user_id;
    proxy_set_header X-User-ID $user_id;
    
    # Redirect si no autenticado
    error_page 401 = @redirect_login;
    
    proxy_pass http://mi-microservicio:3000/;
}

location @redirect_login {
    return 302 http://localhost/login?redirect=$request_uri;
}
```

## 📊 API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/refresh` - Renovar token
- `POST /api/auth/logout` - Cerrar sesión
- `GET /api/auth/validate` - Validar token

### Usuarios
- `GET /api/users` - Listar usuarios
- `POST /api/users` - Crear usuario
- `PUT /api/users/:id` - Actualizar usuario
- `DELETE /api/users/:id` - Eliminar usuario

### Roles
- `GET /api/roles` - Listar roles
- `POST /api/roles` - Crear rol
- `GET /api/roles/permissions` - Permisos disponibles

### Microservicios
- `GET /api/microservices` - Listar servicios
- `POST /api/microservices` - Registrar servicio
- `POST /api/microservices/:id/health-check` - Health check

## 🔒 Seguridad

### Tokens JWT
- **Access Token:** 15 minutos (configurable)
- **Refresh Token:** 7 días (configurable)
- **Renovación automática** desde el frontend

### Características de Seguridad
- Contraseñas hasheadas con bcrypt
- Rate limiting en todas las rutas
- Validación de datos con Zod
- CORS configurado correctamente
- Sesiones múltiples por usuario
- Logout de todos los dispositivos

## 🔄 Desarrollo

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Base de datos
```bash
cd backend
npx prisma studio  # Explorador visual de BD
npx prisma migrate dev  # Nueva migración
```

## 🚨 Troubleshooting

### Error: Puerto ocupado
```bash
# Verificar puertos
netstat -an | grep :80
netstat -an | grep :3000

# Cambiar puertos en docker-compose.yml si es necesario
```

### Error: Base de datos no conecta
```bash
# Verificar logs de PostgreSQL
docker-compose logs postgres

# Reiniciar base de datos
docker-compose restart postgres
```

### Error: Frontend no carga
```bash
# Verificar configuración de API
echo $VITE_API_URL

# Verificar logs del frontend
docker-compose logs frontend
```

## 📈 Próximos pasos

1. **Configurar HTTPS** para producción
2. **Agregar más microservicios** al ecosistema
3. **Implementar métricas** avanzadas
4. **Configurar backups** automáticos de BD
5. **Agregar tests** unitarios e integración

## 🆘 Soporte

- Verificar logs: `docker-compose logs`
- Revisar configuración en `.env`
- Comprobar que todos los puertos estén disponibles
- Asegurarse de tener Docker actualizado

---

**¡El sistema está listo para usar! 🎉**

Accede a http://localhost con admin/admin123 y comienza a gestionar tu ecosistema de microservicios.