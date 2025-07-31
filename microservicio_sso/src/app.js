const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

console.log('🚀 Iniciando SSO Microservice...');

// Importar configuraciones básicas
let database, redis;
try {
    database = require('./config/database');
    redis = require('./config/redis');
    console.log('✅ Configuraciones de BD y Redis cargadas');
} catch (error) {
    console.warn('⚠️ BD/Redis no disponibles:', error.message);
}

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

console.log('✅ Middlewares configurados');

// =================== SERVIR ARCHIVOS ESTÁTICOS ===================
app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

console.log('✅ Archivos estáticos configurados');

// =================== IMPORTAR RUTAS ===================
try {
    const authRoutes = require('./routes/auth');
    const adminRoutes = require('./routes/admin');
    const userRoutes = require('./routes/users');
    const roleRoutes = require('./routes/roles');
    const serviceRoutes = require('./routes/services');
    const dashboardRoutes = require('./routes/dashboard');
    
    // =================== RUTAS DE LA API ===================
    app.use('/api/auth', authRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/roles', roleRoutes);
    app.use('/api/services', serviceRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    
    console.log('✅ Rutas de API configuradas');
} catch (error) {
    console.warn('⚠️ Algunas rutas no pudieron cargarse:', error.message);
    console.log('✅ Continuando con rutas básicas...');
}

// =================== RUTAS BÁSICAS ===================
// Página principal (login)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Panel de administración
app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// Health check
app.get('/health', async (req, res) => {
    try {
        res.json({
            success: true,
            service: 'sso-microservice',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            status: 'healthy',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({
            success: false,
            service: 'sso-microservice',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// API Info
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
                health: '/health',
                admin: '/admin',
                api: '/api/system/info'
            }
        };

        res.json({
            success: true,
            data: systemInfo
        });
    } catch (error) {
        console.error('System info error:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo información del sistema'
        });
    }
});

console.log('✅ Rutas configuradas');

// =================== MANEJO DE RUTAS NO ENCONTRADAS ===================
app.use('*', (req, res) => {
    // Si es una ruta de API, devolver JSON
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
            available_routes: {
                health: '/health',
                admin: '/admin',
                api: '/api/system/info'
            }
        });
    }
    
    // Para rutas de frontend, servir index.html (SPA)
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// =================== INICIALIZACIÓN DEL SERVIDOR ===================
async function startServer() {
    try {
        console.log('🚀 Iniciando SSO Microservice...');
        
        // Conectar a base de datos
        if (database) {
            try {
                await database.connect();
                console.log('✅ Conexión a PostgreSQL establecida');
            } catch (error) {
                console.warn('⚠️ PostgreSQL no disponible:', error.message);
            }
        }
        
        // Conectar a Redis (opcional)
        if (redis) {
            try {
                await redis.connect();
                console.log('✅ Conexión a Redis establecida');
            } catch (error) {
                console.warn('⚠️ Redis no disponible:', error.message);
            }
        }
        
        // Iniciar servidor HTTP
        app.listen(PORT, '0.0.0.0', () => {
            console.log('========================================');
            console.log(`🌐 SSO Microservice iniciado en puerto ${PORT}`);
            console.log('========================================');
            console.log('');
            console.log('🔗 ENDPOINTS PRINCIPALES:');
            console.log(`   🏠 Home: http://localhost:${PORT}/`);
            console.log(`   🎛️ Admin: http://localhost:${PORT}/admin`);
            console.log(`   🔧 API: http://localhost:${PORT}/api`);
            console.log(`   ❤️ Health: http://localhost:${PORT}/health`);
            console.log('');
            console.log('🔑 CREDENCIALES POR DEFECTO:');
            console.log('   📧 Email: admin@sso.com');
            console.log('   🔐 Password: admin123');
            console.log('');
            console.log('📊 CARACTERÍSTICAS:');
            console.log('   ✅ JWT Authentication');
            console.log('   ✅ Role-Based Access Control');
            console.log('   ✅ Service Registry');
            console.log('   ✅ Admin Dashboard');
            console.log('   ✅ Real-time Monitoring');
            console.log('   ✅ Audit Logging');
            console.log('');
            console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log('✅ SISTEMA LISTO PARA RECIBIR CONEXIONES');
            console.log('========================================');
        });
        
    } catch (error) {
        console.error('❌ Error fatal al inicializar el servidor:', error);
        process.exit(1);
    }
}

// =================== MANEJO DE SEÑALES ===================
process.on('SIGTERM', async () => {
    console.log('📴 Recibida señal SIGTERM, cerrando servidor gracefully...');
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('📴 Recibida señal SIGINT, cerrando servidor gracefully...');
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

// Iniciar el servidor
startServer();

module.exports = app;