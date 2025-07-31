/**
 * ============================================================================
 * SISTEMA SSO - APLICACIÓN EXPRESS COMPLETA
 * ============================================================================
 * Todas las rutas y configuración de la API en un solo archivo
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

// Importar módulos locales
const db = require('./database');
const auth = require('./auth');
const controllers = require('./controllers');
const { logger, formatResponse, validateInput } = require('./utils');

// Crear aplicación Express
const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================================
// MIDDLEWARES GLOBALES
// ============================================================================

// Seguridad básica
app.use(helmet({
    contentSecurityPolicy: false, // Será manejado por Nginx
    crossOriginEmbedderPolicy: false
}));

// CORS configurado
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compresión
app.use(compression());

// Parseo de datos
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Sanitización
app.use(mongoSanitize());
app.use(hpp());

// Logging
app.use(morgan('combined', {
    stream: { write: message => logger.info(message.trim()) }
}));

// Rate limiting global
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // máximo 1000 requests por IP
    message: formatResponse(false, 'Demasiadas peticiones, intente más tarde'),
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api', globalLimiter);

// Rate limiting para login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 intentos de login por IP
    message: formatResponse(false, 'Demasiados intentos de login, intente más tarde'),
    skipSuccessfulRequests: true
});

// Slow down para APIs pesadas
const apiSlowDown = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutos
    delayAfter: 100, // permitir 100 requests a velocidad normal
    delayMs: 500 // agregar 500ms de delay después del límite
});
app.use('/api', apiSlowDown);

// ============================================================================
// RUTAS DE HEALTH CHECK Y SISTEMA
// ============================================================================

// Health check principal
app.get('/api/health', async (req, res) => {
    try {
        // Verificar conexión a BD
        const dbStatus = await db.checkConnection();
        
        // Verificar conexión a Redis (si está configurado)
        let redisStatus = 'not-configured';
        try {
            const redisClient = require('./auth').getRedisClient();
            if (redisClient) {
                await redisClient.ping();
                redisStatus = 'connected';
            }
        } catch (error) {
            redisStatus = 'error';
        }
        
        res.json(formatResponse(true, 'Sistema SSO funcionando correctamente', {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            database: dbStatus ? 'connected' : 'disconnected',
            redis: redisStatus,
            environment: process.env.NODE_ENV || 'development'
        }));
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json(formatResponse(false, 'Servicio no disponible', {
            status: 'unhealthy',
            error: error.message
        }));
    }
});

// Información del sistema
app.get('/api/system/info', auth.requireAuth, auth.requirePermission('sso.system.monitor'), async (req, res) => {
    try {
        const stats = await controllers.getSystemStats();
        res.json(formatResponse(true, 'Información del sistema obtenida', stats));
    } catch (error) {
        logger.error('Error getting system info:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo información del sistema'));
    }
});

// ============================================================================
// RUTAS DE AUTENTICACIÓN
// ============================================================================

// Login
app.post('/api/auth/login', loginLimiter, validateInput('login'), async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');
        
        const result = await controllers.loginUser(email, password, clientIP, userAgent, rememberMe);
        
        if (result.success) {
            // Configurar cookies seguras
            const cookieOptions = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000 // 7 días o 1 día
            };
            
            res.cookie('access_token', result.tokens.accessToken, cookieOptions);
            res.cookie('refresh_token', result.tokens.refreshToken, {
                ...cookieOptions,
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días para refresh
            });
            
            res.json(formatResponse(true, 'Login exitoso', {
                user: result.user,
                tokens: result.tokens,
                permissions: result.permissions
            }));
        } else {
            res.status(401).json(formatResponse(false, result.message));
        }
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json(formatResponse(false, 'Error interno del servidor'));
    }
});

// Logout
app.post('/api/auth/logout', auth.requireAuth, async (req, res) => {
    try {
        const token = auth.extractToken(req);
        await controllers.logoutUser(req.user.id, token);
        
        // Limpiar cookies
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
        
        res.json(formatResponse(true, 'Logout exitoso'));
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json(formatResponse(false, 'Error cerrando sesión'));
    }
});

// Verificar token
app.get('/api/auth/verify', auth.requireAuth, async (req, res) => {
    try {
        const user = await controllers.getUserById(req.user.id);
        const permissions = await controllers.getUserPermissions(req.user.id);
        
        res.json(formatResponse(true, 'Token válido', {
            user,
            permissions
        }));
    } catch (error) {
        logger.error('Token verification error:', error);
        res.status(401).json(formatResponse(false, 'Token inválido'));
    }
});

// Renovar token
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies.refresh_token || req.body.refreshToken;
        
        if (!refreshToken) {
            return res.status(401).json(formatResponse(false, 'Refresh token requerido'));
        }
        
        const result = await controllers.refreshToken(refreshToken);
        
        if (result.success) {
            const cookieOptions = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000 // 1 día
            };
            
            res.cookie('access_token', result.accessToken, cookieOptions);
            res.json(formatResponse(true, 'Token renovado', {
                accessToken: result.accessToken
            }));
        } else {
            res.status(401).json(formatResponse(false, result.message));
        }
    } catch (error) {
        logger.error('Token refresh error:', error);
        res.status(500).json(formatResponse(false, 'Error renovando token'));
    }
});

// ============================================================================
// RUTAS DE USUARIOS
// ============================================================================

// Obtener usuarios
app.get('/api/users', auth.requireAuth, auth.requirePermission('sso.users.read'), async (req, res) => {
    try {
        const { page = 1, limit = 10, search, status, role } = req.query;
        const users = await controllers.getUsers({ page, limit, search, status, role });
        
        res.json(formatResponse(true, 'Usuarios obtenidos', users));
    } catch (error) {
        logger.error('Get users error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo usuarios'));
    }
});

// Crear usuario
app.post('/api/users', auth.requireAuth, auth.requirePermission('sso.users.create'), validateInput('user'), async (req, res) => {
    try {
        const userData = req.body;
        const user = await controllers.createUser(userData, req.user.id);
        
        res.status(201).json(formatResponse(true, 'Usuario creado exitosamente', user));
    } catch (error) {
        logger.error('Create user error:', error);
        if (error.code === '23505') { // Duplicate key
            res.status(409).json(formatResponse(false, 'El email ya está registrado'));
        } else {
            res.status(500).json(formatResponse(false, 'Error creando usuario'));
        }
    }
});

// Obtener usuario específico
app.get('/api/users/:id', auth.requireAuth, auth.requirePermission('sso.users.read'), async (req, res) => {
    try {
        const user = await controllers.getUserById(req.params.id);
        
        if (!user) {
            return res.status(404).json(formatResponse(false, 'Usuario no encontrado'));
        }
        
        res.json(formatResponse(true, 'Usuario obtenido', user));
    } catch (error) {
        logger.error('Get user error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo usuario'));
    }
});

// Actualizar usuario
app.put('/api/users/:id', auth.requireAuth, auth.requirePermission('sso.users.update'), validateInput('userUpdate'), async (req, res) => {
    try {
        const user = await controllers.updateUser(req.params.id, req.body, req.user.id);
        
        if (!user) {
            return res.status(404).json(formatResponse(false, 'Usuario no encontrado'));
        }
        
        res.json(formatResponse(true, 'Usuario actualizado exitosamente', user));
    } catch (error) {
        logger.error('Update user error:', error);
        res.status(500).json(formatResponse(false, 'Error actualizando usuario'));
    }
});

// Eliminar usuario
app.delete('/api/users/:id', auth.requireAuth, auth.requirePermission('sso.users.delete'), async (req, res) => {
    try {
        // No permitir eliminar el propio usuario
        if (req.params.id === req.user.id) {
            return res.status(400).json(formatResponse(false, 'No puedes eliminar tu propio usuario'));
        }
        
        const deleted = await controllers.deleteUser(req.params.id, req.user.id);
        
        if (!deleted) {
            return res.status(404).json(formatResponse(false, 'Usuario no encontrado'));
        }
        
        res.json(formatResponse(true, 'Usuario eliminado exitosamente'));
    } catch (error) {
        logger.error('Delete user error:', error);
        res.status(500).json(formatResponse(false, 'Error eliminando usuario'));
    }
});

// Asignar roles a usuario
app.post('/api/users/:id/roles', auth.requireAuth, auth.requirePermission('sso.roles.assign'), async (req, res) => {
    try {
        const { roleIds } = req.body;
        const result = await controllers.assignRolesToUser(req.params.id, roleIds, req.user.id);
        
        res.json(formatResponse(true, 'Roles asignados exitosamente', result));
    } catch (error) {
        logger.error('Assign roles error:', error);
        res.status(500).json(formatResponse(false, 'Error asignando roles'));
    }
});

// Obtener actividad de usuario
app.get('/api/users/:id/activity', auth.requireAuth, auth.requirePermission('sso.users.read'), async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const activity = await controllers.getUserActivity(req.params.id, { page, limit });
        
        res.json(formatResponse(true, 'Actividad obtenida', activity));
    } catch (error) {
        logger.error('Get user activity error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo actividad'));
    }
});

// ============================================================================
// RUTAS DE ROLES
// ============================================================================

// Obtener roles
app.get('/api/roles', auth.requireAuth, auth.requirePermission('sso.roles.read'), async (req, res) => {
    try {
        const { includePermissions = false } = req.query;
        const roles = await controllers.getRoles(includePermissions);
        
        res.json(formatResponse(true, 'Roles obtenidos', roles));
    } catch (error) {
        logger.error('Get roles error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo roles'));
    }
});

// Crear rol
app.post('/api/roles', auth.requireAuth, auth.requirePermission('sso.roles.create'), validateInput('role'), async (req, res) => {
    try {
        const role = await controllers.createRole(req.body, req.user.id);
        
        res.status(201).json(formatResponse(true, 'Rol creado exitosamente', role));
    } catch (error) {
        logger.error('Create role error:', error);
        if (error.code === '23505') {
            res.status(409).json(formatResponse(false, 'El nombre del rol ya existe'));
        } else {
            res.status(500).json(formatResponse(false, 'Error creando rol'));
        }
    }
});

// Obtener rol específico
app.get('/api/roles/:id', auth.requireAuth, auth.requirePermission('sso.roles.read'), async (req, res) => {
    try {
        const role = await controllers.getRoleById(req.params.id);
        
        if (!role) {
            return res.status(404).json(formatResponse(false, 'Rol no encontrado'));
        }
        
        res.json(formatResponse(true, 'Rol obtenido', role));
    } catch (error) {
        logger.error('Get role error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo rol'));
    }
});

// Actualizar rol
app.put('/api/roles/:id', auth.requireAuth, auth.requirePermission('sso.roles.update'), validateInput('roleUpdate'), async (req, res) => {
    try {
        const role = await controllers.updateRole(req.params.id, req.body, req.user.id);
        
        if (!role) {
            return res.status(404).json(formatResponse(false, 'Rol no encontrado'));
        }
        
        res.json(formatResponse(true, 'Rol actualizado exitosamente', role));
    } catch (error) {
        logger.error('Update role error:', error);
        res.status(500).json(formatResponse(false, 'Error actualizando rol'));
    }
});

// Eliminar rol
app.delete('/api/roles/:id', auth.requireAuth, auth.requirePermission('sso.roles.delete'), async (req, res) => {
    try {
        const deleted = await controllers.deleteRole(req.params.id, req.user.id);
        
        if (!deleted) {
            return res.status(404).json(formatResponse(false, 'Rol no encontrado'));
        }
        
        res.json(formatResponse(true, 'Rol eliminado exitosamente'));
    } catch (error) {
        logger.error('Delete role error:', error);
        res.status(500).json(formatResponse(false, 'Error eliminando rol'));
    }
});

// Asignar permisos a rol
app.post('/api/roles/:id/permissions', auth.requireAuth, auth.requirePermission('sso.roles.update'), async (req, res) => {
    try {
        const { permissionIds } = req.body;
        const result = await controllers.assignPermissionsToRole(req.params.id, permissionIds, req.user.id);
        
        res.json(formatResponse(true, 'Permisos asignados exitosamente', result));
    } catch (error) {
        logger.error('Assign permissions error:', error);
        res.status(500).json(formatResponse(false, 'Error asignando permisos'));
    }
});

// Clonar rol
app.post('/api/roles/:id/clone', auth.requireAuth, auth.requirePermission('sso.roles.create'), async (req, res) => {
    try {
        const { name, displayName } = req.body;
        const clonedRole = await controllers.cloneRole(req.params.id, name, displayName, req.user.id);
        
        res.status(201).json(formatResponse(true, 'Rol clonado exitosamente', clonedRole));
    } catch (error) {
        logger.error('Clone role error:', error);
        res.status(500).json(formatResponse(false, 'Error clonando rol'));
    }
});

// ============================================================================
// RUTAS DE PERMISOS
// ============================================================================

// Obtener permisos
app.get('/api/permissions', auth.requireAuth, auth.requirePermission('sso.permissions.read'), async (req, res) => {
    try {
        const { module, grouped = false } = req.query;
        const permissions = await controllers.getPermissions({ module, grouped });
        
        res.json(formatResponse(true, 'Permisos obtenidos', permissions));
    } catch (error) {
        logger.error('Get permissions error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo permisos'));
    }
});

// Crear permiso
app.post('/api/permissions', auth.requireAuth, auth.requirePermission('sso.permissions.create'), validateInput('permission'), async (req, res) => {
    try {
        const permission = await controllers.createPermission(req.body, req.user.id);
        
        res.status(201).json(formatResponse(true, 'Permiso creado exitosamente', permission));
    } catch (error) {
        logger.error('Create permission error:', error);
        if (error.code === '23505') {
            res.status(409).json(formatResponse(false, 'El nombre del permiso ya existe'));
        } else {
            res.status(500).json(formatResponse(false, 'Error creando permiso'));
        }
    }
});

// ============================================================================
// RUTAS DE SERVICIOS
// ============================================================================

// Obtener servicios
app.get('/api/services', auth.requireAuth, auth.requirePermission('sso.services.read'), async (req, res) => {
    try {
        const { includeRoutes = false, status } = req.query;
        const services = await controllers.getServices({ includeRoutes, status });
        
        res.json(formatResponse(true, 'Servicios obtenidos', services));
    } catch (error) {
        logger.error('Get services error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo servicios'));
    }
});

// Registrar servicio
app.post('/api/services/register', async (req, res) => {
    try {
        // Esta ruta permite auto-registro sin autenticación para facilitar la integración
        const service = await controllers.registerService(req.body);
        
        res.status(201).json(formatResponse(true, 'Servicio registrado exitosamente', service));
    } catch (error) {
        logger.error('Register service error:', error);
        res.status(500).json(formatResponse(false, 'Error registrando servicio'));
    }
});

// Actualizar servicio
app.put('/api/services/:id', auth.requireAuth, auth.requirePermission('sso.services.update'), async (req, res) => {
    try {
        const service = await controllers.updateService(req.params.id, req.body, req.user.id);
        
        if (!service) {
            return res.status(404).json(formatResponse(false, 'Servicio no encontrado'));
        }
        
        res.json(formatResponse(true, 'Servicio actualizado exitosamente', service));
    } catch (error) {
        logger.error('Update service error:', error);
        res.status(500).json(formatResponse(false, 'Error actualizando servicio'));
    }
});

// Heartbeat de servicio
app.post('/api/services/:id/heartbeat', async (req, res) => {
    try {
        const { status, metadata } = req.body;
        await controllers.updateServiceHeartbeat(req.params.id, status, metadata);
        
        res.json(formatResponse(true, 'Heartbeat recibido'));
    } catch (error) {
        logger.error('Service heartbeat error:', error);
        res.status(500).json(formatResponse(false, 'Error procesando heartbeat'));
    }
});

// Obtener rutas de servicio
app.get('/api/services/:id/routes', auth.requireAuth, auth.requirePermission('sso.routes.read'), async (req, res) => {
    try {
        const routes = await controllers.getServiceRoutes(req.params.id);
        
        res.json(formatResponse(true, 'Rutas obtenidas', routes));
    } catch (error) {
        logger.error('Get service routes error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo rutas'));
    }
});

// Auto-descubrir rutas
app.post('/api/services/:id/discover-routes', auth.requireAuth, auth.requirePermission('sso.routes.create'), async (req, res) => {
    try {
        const routes = await controllers.discoverServiceRoutes(req.params.id);
        
        res.json(formatResponse(true, 'Rutas descubiertas', routes));
    } catch (error) {
        logger.error('Discover routes error:', error);
        res.status(500).json(formatResponse(false, 'Error descubriendo rutas'));
    }
});

// Configurar rutas de servicio
app.post('/api/services/:id/routes', auth.requireAuth, auth.requirePermission('sso.routes.create'), async (req, res) => {
    try {
        const { routes } = req.body;
        const result = await controllers.configureServiceRoutes(req.params.id, routes, req.user.id);
        
        res.json(formatResponse(true, 'Rutas configuradas exitosamente', result));
    } catch (error) {
        logger.error('Configure routes error:', error);
        res.status(500).json(formatResponse(false, 'Error configurando rutas'));
    }
});

// ============================================================================
// RUTAS DE DASHBOARD
// ============================================================================

// Estadísticas del dashboard
app.get('/api/dashboard/stats', auth.requireAuth, auth.requirePermission('sso.dashboard.read'), async (req, res) => {
    try {
        const stats = await controllers.getDashboardStats();
        
        res.json(formatResponse(true, 'Estadísticas obtenidas', stats));
    } catch (error) {
        logger.error('Get dashboard stats error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo estadísticas'));
    }
});

// Actividad reciente
app.get('/api/dashboard/activity', auth.requireAuth, auth.requirePermission('sso.dashboard.read'), async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const activity = await controllers.getRecentActivity(limit);
        
        res.json(formatResponse(true, 'Actividad obtenida', activity));
    } catch (error) {
        logger.error('Get recent activity error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo actividad'));
    }
});

// Alertas del sistema
app.get('/api/dashboard/alerts', auth.requireAuth, auth.requirePermission('sso.dashboard.read'), async (req, res) => {
    try {
        const alerts = await controllers.getSystemAlerts();
        
        res.json(formatResponse(true, 'Alertas obtenidas', alerts));
    } catch (error) {
        logger.error('Get alerts error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo alertas'));
    }
});

// ============================================================================
// RUTAS DE MONITOREO Y AUDITORÍA
// ============================================================================

// Logs del sistema
app.get('/api/monitoring/logs', auth.requireAuth, auth.requirePermission('sso.system.logs'), async (req, res) => {
    try {
        const { page = 1, limit = 50, level, action, userId } = req.query;
        const logs = await controllers.getAuditLogs({ page, limit, level, action, userId });
        
        res.json(formatResponse(true, 'Logs obtenidos', logs));
    } catch (error) {
        logger.error('Get logs error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo logs'));
    }
});

// Métricas del sistema
app.get('/api/monitoring/metrics', auth.requireAuth, auth.requirePermission('sso.system.monitor'), async (req, res) => {
    try {
        const { period = '24h' } = req.query;
        const metrics = await controllers.getSystemMetrics(period);
        
        res.json(formatResponse(true, 'Métricas obtenidas', metrics));
    } catch (error) {
        logger.error('Get metrics error:', error);
        res.status(500).json(formatResponse(false, 'Error obteniendo métricas'));
    }
});

// ============================================================================
// MIDDLEWARE DE MANEJO DE ERRORES
// ============================================================================

// Ruta no encontrada
app.use('*', (req, res) => {
    res.status(404).json(formatResponse(false, 'Ruta no encontrada', {
        method: req.method,
        url: req.originalUrl
    }));
});

// Manejo global de errores
app.use((error, req, res, next) => {
    logger.error('Unhandled error:', error);
    
    // No enviar stack trace en producción
    const errorDetails = process.env.NODE_ENV === 'development' ? error.stack : undefined;
    
    res.status(error.status || 500).json(formatResponse(false, 'Error interno del servidor', {
        error: errorDetails
    }));
});

// ============================================================================
// INICIO DEL SERVIDOR
// ============================================================================

// Función para iniciar el servidor
async function startServer() {
    try {
        // Verificar conexión a base de datos
        logger.info('Verificando conexión a base de datos...');
        const dbConnected = await db.checkConnection();
        
        if (!dbConnected) {
            throw new Error('No se pudo conectar a la base de datos');
        }
        
        logger.info('Base de datos conectada exitosamente');
        
        // Iniciar servidor
        const server = app.listen(PORT, '0.0.0.0', () => {
            logger.info(`🚀 Servidor SSO iniciado en puerto ${PORT}`);
            logger.info(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`📊 Health check: http://localhost:${PORT}/api/health`);
        });
        
        // Manejo de cierre graceful
        process.on('SIGTERM', () => {
            logger.info('SIGTERM recibido, cerrando servidor...');
            server.close(() => {
                logger.info('Servidor cerrado exitosamente');
                process.exit(0);
            });
        });
        
        process.on('SIGINT', () => {
            logger.info('SIGINT recibido, cerrando servidor...');
            server.close(() => {
                logger.info('Servidor cerrado exitosamente');
                process.exit(0);
            });
        });
        
    } catch (error) {
        logger.error('Error iniciando servidor:', error);
        process.exit(1);
    }
}

// Iniciar servidor si este archivo es ejecutado directamente
if (require.main === module) {
    startServer();
}

module.exports = app;