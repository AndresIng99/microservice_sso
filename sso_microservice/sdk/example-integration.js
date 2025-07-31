/**
 * ============================================================================
 * EJEMPLO DE INTEGRACIÓN - MICROSERVICIO CON SSO
 * ============================================================================
 * Ejemplo completo de cómo integrar un microservicio con el sistema SSO
 */

const express = require('express');
const { SSOClient, setupSSO } = require('./sso-client');

// Crear aplicación Express
const app = express();

// Configurar middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// CONFIGURACIÓN DEL SSO CLIENT
// ============================================================================

// Opción 1: Configuración manual
const ssoClient = new SSOClient({
    ssoUrl: process.env.SSO_URL || 'http://sso:3000',
    serviceName: 'example-service',
    version: '1.0.0',
    description: 'Servicio de ejemplo para demostrar integración SSO',
    baseUrl: process.env.SERVICE_URL || 'http://example-service:3001',
    healthCheckUrl: process.env.SERVICE_URL || 'http://example-service:3001/health'
});

// Opción 2: Setup automático (recomendado)
// const ssoClient = setupSSO(app, {
//     ssoUrl: process.env.SSO_URL || 'http://sso:3000',
//     serviceName: 'example-service',
//     version: '1.0.0'
// });

// ============================================================================
// RUTAS PÚBLICAS (SIN AUTENTICACIÓN)
// ============================================================================

// Health check (debe ser público)
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'example-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        sso: ssoClient.getStats()
    });
});

// Información del servicio
app.get('/info', (req, res) => {
    res.json({
        name: 'Example Service',
        description: 'Servicio de ejemplo para integración SSO',
        version: '1.0.0',
        endpoints: [
            'GET /health - Health check',
            'GET /info - Información del servicio',
            'GET /api/data - Datos protegidos (requiere autenticación)',
            'GET /api/admin - Panel admin (requiere permisos)',
            'POST /api/items - Crear item (requiere permisos)',
            'GET /api/items - Listar items (requiere permisos)',
            'PUT /api/items/:id - Actualizar item (requiere permisos)',
            'DELETE /api/items/:id - Eliminar item (requiere permisos)'
        ]
    });
});

// Endpoint para que el SSO pueda descubrir rutas
app.get('/api/routes', (req, res) => {
    res.json([
        {
            method: 'GET',
            path: '/health',
            description: 'Health check del servicio',
            isPublic: true,
            requiresAuth: false
        },
        {
            method: 'GET',
            path: '/info',
            description: 'Información del servicio',
            isPublic: true,
            requiresAuth: false
        },
        {
            method: 'GET',
            path: '/api/data',
            description: 'Obtener datos del servicio',
            requiredPermission: 'example.read',
            isPublic: false,
            requiresAuth: true
        },
        {
            method: 'GET',
            path: '/api/admin',
            description: 'Panel de administración',
            requiredPermission: 'example.admin',
            isPublic: false,
            requiresAuth: true
        },
        {
            method: 'GET',
            path: '/api/items',
            description: 'Listar items',
            requiredPermission: 'example.items.read',
            isPublic: false,
            requiresAuth: true
        },
        {
            method: 'POST',
            path: '/api/items',
            description: 'Crear item',
            requiredPermission: 'example.items.create',
            isPublic: false,
            requiresAuth: true
        },
        {
            method: 'PUT',
            path: '/api/items/:id',
            description: 'Actualizar item',
            requiredPermission: 'example.items.update',
            isPublic: false,
            requiresAuth: true
        },
        {
            method: 'DELETE',
            path: '/api/items/:id',
            description: 'Eliminar item',
            requiredPermission: 'example.items.delete',
            isPublic: false,
            requiresAuth: true
        }
    ]);
});

// ============================================================================
// RUTAS PROTEGIDAS (CON AUTENTICACIÓN SSO)
// ============================================================================

// Aplicar middleware de autenticación a todas las rutas /api/*
app.use('/api', ssoClient.middleware());

// Ruta que requiere solo autenticación
app.get('/api/data', (req, res) => {
    res.json({
        message: 'Datos protegidos del servicio',
        user: {
            id: req.user.id,
            email: req.user.email,
            name: `${req.user.firstName} ${req.user.lastName}`
        },
        timestamp: new Date().toISOString(),
        permissions: req.permissions
    });
});

// Ruta que requiere permisos específicos de administrador
app.get('/api/admin', ssoClient.requirePermission('example.admin'), (req, res) => {
    res.json({
        message: 'Panel de administración',
        user: req.user,
        systemInfo: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version
        },
        ssoStats: ssoClient.getStats()
    });
});

// ============================================================================
// CRUD DE ITEMS CON DIFERENTES PERMISOS
// ============================================================================

// Simulación de base de datos en memoria
let items = [
    { id: 1, name: 'Item 1', description: 'Primer item de ejemplo', createdBy: 'system' },
    { id: 2, name: 'Item 2', description: 'Segundo item de ejemplo', createdBy: 'system' },
    { id: 3, name: 'Item 3', description: 'Tercer item de ejemplo', createdBy: 'system' }
];
let nextId = 4;

// Listar items (requiere permiso de lectura)
app.get('/api/items', ssoClient.requirePermission('example.items.read'), (req, res) => {
    const { page = 1, limit = 10, search } = req.query;
    
    let filteredItems = items;
    
    if (search) {
        filteredItems = items.filter(item => 
            item.name.toLowerCase().includes(search.toLowerCase()) ||
            item.description.toLowerCase().includes(search.toLowerCase())
        );
    }
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedItems = filteredItems.slice(startIndex, endIndex);
    
    res.json({
        success: true,
        data: paginatedItems,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: filteredItems.length,
            totalPages: Math.ceil(filteredItems.length / limit)
        },
        user: req.user.email
    });
});

// Obtener item específico (requiere permiso de lectura)
app.get('/api/items/:id', ssoClient.requirePermission('example.items.read'), (req, res) => {
    const id = parseInt(req.params.id);
    const item = items.find(i => i.id === id);
    
    if (!item) {
        return res.status(404).json({
            success: false,
            message: 'Item no encontrado'
        });
    }
    
    res.json({
        success: true,
        data: item,
        user: req.user.email
    });
});

// Crear item (requiere permiso de creación)
app.post('/api/items', ssoClient.requirePermission('example.items.create'), (req, res) => {
    const { name, description } = req.body;
    
    if (!name || !description) {
        return res.status(400).json({
            success: false,
            message: 'Nombre y descripción son requeridos'
        });
    }
    
    const newItem = {
        id: nextId++,
        name,
        description,
        createdBy: req.user.email,
        createdAt: new Date().toISOString()
    };
    
    items.push(newItem);
    
    res.status(201).json({
        success: true,
        message: 'Item creado exitosamente',
        data: newItem
    });
});

// Actualizar item (requiere permiso de actualización)
app.put('/api/items/:id', ssoClient.requirePermission('example.items.update'), (req, res) => {
    const id = parseInt(req.params.id);
    const { name, description } = req.body;
    
    const itemIndex = items.findIndex(i => i.id === id);
    
    if (itemIndex === -1) {
        return res.status(404).json({
            success: false,
            message: 'Item no encontrado'
        });
    }
    
    if (name) items[itemIndex].name = name;
    if (description) items[itemIndex].description = description;
    items[itemIndex].updatedBy = req.user.email;
    items[itemIndex].updatedAt = new Date().toISOString();
    
    res.json({
        success: true,
        message: 'Item actualizado exitosamente',
        data: items[itemIndex]
    });
});

// Eliminar item (requiere permiso de eliminación)
app.delete('/api/items/:id', ssoClient.requirePermission('example.items.delete'), (req, res) => {
    const id = parseInt(req.params.id);
    const itemIndex = items.findIndex(i => i.id === id);
    
    if (itemIndex === -1) {
        return res.status(404).json({
            success: false,
            message: 'Item no encontrado'
        });
    }
    
    const deletedItem = items.splice(itemIndex, 1)[0];
    
    res.json({
        success: true,
        message: 'Item eliminado exitosamente',
        data: deletedItem,
        deletedBy: req.user.email
    });
});

// ============================================================================
// RUTAS DE UTILIDAD Y DEBUGGING
// ============================================================================

// Información del usuario actual
app.get('/api/me', (req, res) => {
    res.json({
        user: req.user,
        permissions: req.permissions,
        timestamp: new Date().toISOString()
    });
});

// Verificar permisos específicos
app.get('/api/check-permission/:permission', (req, res) => {
    const permission = req.params.permission;
    const hasPermission = req.permissions.includes(permission);
    
    res.json({
        permission,
        hasPermission,
        userPermissions: req.permissions,
        user: req.user.email
    });
});

// Stats del SSO Client
app.get('/api/sso-stats', (req, res) => {
    res.json({
        ssoClient: ssoClient.getStats(),
        service: {
            name: 'example-service',
            version: '1.0.0',
            uptime: process.uptime(),
            memory: process.memoryUsage()
        }
    });
});

// ============================================================================
// MANEJO DE ERRORES
// ============================================================================

// Middleware de manejo de errores
app.use((error, req, res, next) => {
    console.error('Error no manejado:', error);
    
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        timestamp: new Date().toISOString()
    });
});

// Ruta no encontrada
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint no encontrado',
        path: req.originalUrl,
        method: req.method,
        availableEndpoints: [
            'GET /health',
            'GET /info',
            'GET /api/routes',
            'GET /api/data',
            'GET /api/admin',
            'GET /api/items',
            'POST /api/items',
            'GET /api/items/:id',
            'PUT /api/items/:id',
            'DELETE /api/items/:id'
        ]
    });
});

// ============================================================================
// INICIO DEL SERVIDOR
// ============================================================================

const PORT = process.env.PORT || 3001;

async function startServer() {
    try {
        console.log('🚀 Iniciando Example Service...');
        
        // Iniciar servidor
        const server = app.listen(PORT, '0.0.0.0', async () => {
            console.log(`✅ Example Service funcionando en puerto ${PORT}`);
            console.log(`🌐 URLs disponibles:`);
            console.log(`   - Health check: http://localhost:${PORT}/health`);
            console.log(`   - Información: http://localhost:${PORT}/info`);
            console.log(`   - API protegida: http://localhost:${PORT}/api/data`);
            
            // Registrar en SSO después de que el servidor esté listo
            try {
                console.log('📡 Registrando servicio en SSO...');
                await ssoClient.register();
                console.log('✅ Servicio registrado exitosamente en SSO');
            } catch (error) {
                console.error('❌ Error registrando en SSO:', error.message);
                console.log('⚠️  El servicio funcionará pero sin integración SSO');
            }
        });
        
        // Configurar shutdown graceful
        const gracefulShutdown = async (signal) => {
            console.log(`\n${signal} recibido, cerrando servidor...`);
            
            try {
                // Desconectar del SSO
                await ssoClient.gracefulShutdown();
                console.log('✅ Desconectado del SSO');
            } catch (error) {
                console.error('❌ Error desconectando del SSO:', error.message);
            }
            
            // Cerrar servidor
            server.close(() => {
                console.log('✅ Servidor cerrado exitosamente');
                process.exit(0);
            });
            
            // Forzar cierre después de 10 segundos
            setTimeout(() => {
                console.error('❌ Forzando cierre del servidor');
                process.exit(1);
            }, 10000);
        };
        
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        
    } catch (error) {
        console.error('❌ Error iniciando servidor:', error);
        process.exit(1);
    }
}

// Iniciar servidor si este archivo es ejecutado directamente
if (require.main === module) {
    startServer();
}

module.exports = app;