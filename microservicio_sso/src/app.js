const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Importar configuraciones
const logger = require('./utils/logger');
const database = require('./config/database');
const redis = require('./config/redis');

// Importar middlewares
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');

// Importar rutas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/users');
const roleRoutes = require('./routes/roles');
const serviceRoutes = require('./routes/services');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// =================== CONFIGURACIÓN DE SEGURIDAD ===================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"]
        }
    }
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// =================== RATE LIMITING ===================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // límite por IP
    message: {
        success: false,
        message: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.'
    }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 50, // límite más estricto para auth
    message: {
        success: false,
        message: 'Demasiados intentos de autenticación, intenta de nuevo más tarde.'
    },
    skipSuccessfulRequests: true
});

app.use(limiter);
app.use('/api/auth', authLimiter);

// =================== MIDDLEWARES GENERALES ===================
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// =================== SERVIR ARCHIVOS ESTÁTICOS ===================
app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// =================== RUTAS DE LA API ===================
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/dashboard', dashboardRoutes);

// =================== RUTAS DEL FRONTEND ===================
// Página principal (login)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Panel de administración
app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// =================== RUTAS DE SALUD Y ESTADO ===================
app.get('/health', async (req, res) => {
    try {
        // Verificar conexión a base de datos
        const dbStatus = await database.query('SELECT NOW()');
        
        // Verificar conexión a Redis
        let redisStatus = 'disconnected';
        try {
            await redis.ping();
            redisStatus = 'connected';
        } catch (error) {
            logger.warn('Redis health check failed:', error.message);
        }

        res.json({
            success: true,
            service: 'sso-microservice',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            status: 'healthy',
            dependencies: {
                database: 'connected',
                redis: redisStatus
            },
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
            success: false,
            service: 'sso-microservice',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Información detallada del sistema
app.get('/api/system/info', async (req, res) => {
    try {
        const systemInfo = {
            service: 'SSO Microservice',
            version: '1.0.0',
            description: 'Sistema de autenticación centralizada para microservicios',
            features: [
                'Single Sign-On (SSO)',
                'Role-Based Access Control (RBAC)',
                'Service Registry',
                'JWT Authentication',
                'Admin Dashboard',
                'Real-time Monitoring',
                'Audit Logging'
            ],
            endpoints: {
                authentication: [
                    'POST /api/auth/login',
                    'POST /api/auth/logout',
                    'GET /api/auth/verify',
                    'POST /api/auth/refresh'
                ],
                users: [
                    'GET /api/users',
                    'POST /api/users',
                    'PUT /api/users/:id',
                    'DELETE /api/users/:id'
                ],
                roles: [
                    'GET /api/roles',
                    'POST /api/roles',
                    'PUT /api/roles/:id',
                    'DELETE /api/roles/:id'
                ],
                services: [
                    'GET /api/services',
                    'POST /api/services/register',
                    'PUT /api/services/:id',
                    'DELETE /api/services/:id'
                ],
                admin: [
                    'GET /api/admin/dashboard',
                    'GET /api/admin/stats',
                    'GET /api/admin/logs'
                ]
            },
            documentation: {
                readme: '/README.md',
                api: '/api-docs',
                swagger: '/swagger.json'
            }
        };

        res.json({
            success: true,
            data: systemInfo
        });
    } catch (error) {
        logger.error('System info error:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo información del sistema'
        });
    }
});

// =================== MIDDLEWARE DE MANEJO DE ERRORES ===================
app.use(errorHandler);

// =================== MANEJO DE RUTAS NO ENCONTRADAS ===================
app.use('*', (req, res) => {
    // Si es una ruta de API, devolver JSON
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
            available_routes: {
                api: '/api/system/info',
                health: '/health',
                admin: '/admin',
                docs: '/api-docs'
            }
        });
    }
    
    // Para rutas de frontend, servir index.html (SPA)
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// =================== INICIALIZACIÓN DEL SERVIDOR ===================
async function startServer() {
    try {
        logger.info('🚀 Iniciando SSO Microservice...');
        
        // Conectar a base de datos
        await database.connect();
        logger.info('✅ Conexión a PostgreSQL establecida');
        
        // Conectar a Redis (opcional)
        try {
            await redis.connect();
            logger.info('✅ Conexión a Redis establecida');
        } catch (error) {
            logger.warn('⚠️ Redis no disponible, continuando sin cache:', error.message);
        }
        
        // Iniciar servidor HTTP
        app.listen(PORT, () => {
            logger.info('========================================');
            logger.info(`🌐 SSO Microservice iniciado en puerto ${PORT}`);
            logger.info('========================================');
            logger.info('');
            logger.info('🔗 ENDPOINTS PRINCIPALES:');
            logger.info(`   🏠 Home: http://localhost:${PORT}/`);
            logger.info(`   🎛️ Admin: http://localhost:${PORT}/admin`);
            logger.info(`   🔧 API: http://localhost:${PORT}/api`);
            logger.info(`   ❤️ Health: http://localhost:${PORT}/health`);
            logger.info('');
            logger.info('🔑 CREDENCIALES POR DEFECTO:');
            logger.info('   📧 Email: admin@sso.com');
            logger.info('   🔐 Password: admin123');
            logger.info('');
            logger.info('📊 CARACTERÍSTICAS:');
            logger.info('   ✅ JWT Authentication');
            logger.info('   ✅ Role-Based Access Control');
            logger.info('   ✅ Service Registry');
            logger.info('   ✅ Admin Dashboard');
            logger.info('   ✅ Real-time Monitoring');
            logger.info('   ✅ Audit Logging');
            logger.info('');
            logger.info(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            logger.info('✅ SISTEMA LISTO PARA RECIBIR CONEXIONES');
            logger.info('========================================');
        });
        
    } catch (error) {
        logger.error('❌ Error fatal al inicializar el servidor:', error);
        process.exit(1);
    }
}

// =================== MANEJO DE SEÑALES ===================
process.on('SIGTERM', async () => {
    logger.info('📴 Recibida señal SIGTERM, cerrando servidor gracefully...');
    
    try {
        await database.disconnect();
        await redis.disconnect();
        logger.info('✅ Conexiones cerradas correctamente');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Error cerrando conexiones:', error);
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    logger.info('📴 Recibida señal SIGINT, cerrando servidor gracefully...');
    
    try {
        await database.disconnect();
        await redis.disconnect();
        logger.info('✅ Conexiones cerradas correctamente');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Error cerrando conexiones:', error);
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

// Iniciar el servidor
startServer();

module.exports = app;