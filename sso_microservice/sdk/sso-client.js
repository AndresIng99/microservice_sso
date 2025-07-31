/**
 * ============================================================================
 * SSO CLIENT SDK - INTEGRACIÓN COMPLETA PARA MICROSERVICIOS
 * ============================================================================
 * Cliente Node.js para integrar microservicios con el sistema SSO
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');

class SSOClient {
    constructor(options = {}) {
        // Validar opciones requeridas
        if (!options.ssoUrl) {
            throw new Error('ssoUrl es requerido');
        }
        
        if (!options.serviceName) {
            throw new Error('serviceName es requerido');
        }

        this.ssoUrl = options.ssoUrl.replace(/\/$/, ''); // Remover trailing slash
        this.serviceName = options.serviceName;
        this.version = options.version || '1.0.0';
        this.description = options.description || `Microservicio ${options.serviceName}`;
        this.baseUrl = options.baseUrl || `http://${options.serviceName}:3001`;
        this.healthCheckUrl = options.healthCheckUrl || `${this.baseUrl}/health`;
        
        // Configuración de autenticación
        this.apiKey = options.apiKey;
        this.serviceToken = null;
        
        // Configuración de timeouts
        this.timeout = options.timeout || 5000;
        this.retryAttempts = options.retryAttempts || 3;
        
        // Configuración de heartbeat
        this.heartbeatInterval = options.heartbeatInterval || 60000; // 1 minuto
        this.heartbeatTimer = null;
        
        // Cache de validaciones
        this.validationCache = new Map();
        this.cacheTimeout = options.cacheTimeout || 300000; // 5 minutos
        
        // Estado del cliente
        this.isRegistered = false;
        this.lastHeartbeat = null;
        
        // Crear cliente HTTP
        this.httpClient = axios.create({
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': `SSO-Client/${this.serviceName}/${this.version}`
            }
        });

        // Configurar interceptores para manejo de errores
        this.setupInterceptors();
    }

    /**
     * Configurar interceptores de axios
     */
    setupInterceptors() {
        // Interceptor para requests
        this.httpClient.interceptors.request.use(
            (config) => {
                // Agregar token de servicio si existe
                if (this.serviceToken) {
                    config.headers.Authorization = `Bearer ${this.serviceToken}`;
                } else if (this.apiKey) {
                    config.headers['X-API-Key'] = this.apiKey;
                }
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );

        // Interceptor para responses
        this.httpClient.interceptors.response.use(
            (response) => response,
            async (error) => {
                // Si es error 401, intentar re-registrar el servicio
                if (error.response?.status === 401 && this.isRegistered) {
                    console.warn('[SSO Client] Token expirado, re-registrando servicio...');
                    await this.register();
                    
                    // Reintentar la petición original
                    const originalRequest = error.config;
                    if (!originalRequest._retry) {
                        originalRequest._retry = true;
                        originalRequest.headers.Authorization = `Bearer ${this.serviceToken}`;
                        return this.httpClient(originalRequest);
                    }
                }
                
                return Promise.reject(error);
            }
        );
    }

    /**
     * Registrar el microservicio en el SSO
     */
    async register() {
        try {
            console.log(`[SSO Client] Registrando servicio: ${this.serviceName}`);
            
            // Intentar auto-descubrir rutas
            const routes = await this.discoverRoutes();
            
            const registrationData = {
                name: this.serviceName,
                displayName: this.description,
                description: this.description,
                baseUrl: this.baseUrl,
                healthCheckUrl: this.healthCheckUrl,
                version: this.version,
                metadata: {
                    registeredAt: new Date().toISOString(),
                    routes: routes,
                    capabilities: ['auto-discovery', 'health-check', 'heartbeat']
                }
            };

            const response = await this.httpClient.post(
                `${this.ssoUrl}/api/services/register`,
                registrationData
            );

            if (response.data.success) {
                this.isRegistered = true;
                this.serviceId = response.data.data.id;
                
                console.log(`[SSO Client] Servicio registrado exitosamente: ${this.serviceId}`);
                
                // Iniciar heartbeat
                this.startHeartbeat();
                
                return response.data.data;
            } else {
                throw new Error(response.data.message || 'Error al registrar servicio');
            }
        } catch (error) {
            console.error(`[SSO Client] Error registrando servicio:`, error.message);
            
            // Reintentar después de un delay
            setTimeout(() => {
                this.register();
            }, 10000); // 10 segundos
            
            throw error;
        }
    }

    /**
     * Auto-descubrir rutas del microservicio
     */
    async discoverRoutes() {
        try {
            // Si el microservicio tiene un endpoint de rutas, usarlo
            try {
                const response = await axios.get(`${this.baseUrl}/api/routes`, { timeout: 3000 });
                if (response.data && Array.isArray(response.data)) {
                    return response.data;
                }
            } catch (err) {
                // Continuar con descubrimiento manual
            }

            // Descubrimiento básico basado en convenciones
            const resourceName = this.serviceName.replace(/-service$/, '').replace(/-api$/, '');
            
            return [
                {
                    method: 'GET',
                    path: '/health',
                    description: 'Health check del servicio',
                    isPublic: true,
                    requiresAuth: false
                },
                {
                    method: 'GET',
                    path: `/api/${resourceName}`,
                    description: `Listar ${resourceName}`,
                    requiredPermission: `${resourceName}.read`,
                    isPublic: false,
                    requiresAuth: true
                },
                {
                    method: 'POST',
                    path: `/api/${resourceName}`,
                    description: `Crear ${resourceName}`,
                    requiredPermission: `${resourceName}.create`,
                    isPublic: false,
                    requiresAuth: true
                },
                {
                    method: 'GET',
                    path: `/api/${resourceName}/:id`,
                    description: `Obtener ${resourceName} específico`,
                    requiredPermission: `${resourceName}.read`,
                    isPublic: false,
                    requiresAuth: true
                },
                {
                    method: 'PUT',
                    path: `/api/${resourceName}/:id`,
                    description: `Actualizar ${resourceName}`,
                    requiredPermission: `${resourceName}.update`,
                    isPublic: false,
                    requiresAuth: true
                },
                {
                    method: 'DELETE',
                    path: `/api/${resourceName}/:id`,
                    description: `Eliminar ${resourceName}`,
                    requiredPermission: `${resourceName}.delete`,
                    isPublic: false,
                    requiresAuth: true
                }
            ];
        } catch (error) {
            console.warn('[SSO Client] Error en auto-descubrimiento de rutas:', error.message);
            return [];
        }
    }

    /**
     * Middleware de autenticación para Express
     */
    middleware() {
        return async (req, res, next) => {
            try {
                // Extraer token del request
                const token = this.extractToken(req);
                
                if (!token) {
                    return res.status(401).json({
                        success: false,
                        message: 'Token de acceso requerido',
                        code: 'TOKEN_REQUIRED'
                    });
                }

                // Verificar token
                const validation = await this.verifyToken(token);
                
                if (!validation.valid) {
                    return res.status(401).json({
                        success: false,
                        message: validation.message || 'Token inválido',
                        code: 'TOKEN_INVALID'
                    });
                }

                // Agregar información del usuario al request
                req.user = validation.user;
                req.permissions = validation.permissions || [];
                req.token = token;

                next();
            } catch (error) {
                console.error('[SSO Client] Error en middleware de autenticación:', error);
                res.status(500).json({
                    success: false,
                    message: 'Error interno de autenticación',
                    code: 'AUTH_ERROR'
                });
            }
        };
    }

    /**
     * Middleware para verificar permisos específicos
     */
    requirePermission(permission) {
        return async (req, res, next) => {
            try {
                if (!req.user) {
                    return res.status(401).json({
                        success: false,
                        message: 'Autenticación requerida',
                        code: 'AUTH_REQUIRED'
                    });
                }

                // Verificar si el usuario tiene el permiso
                const hasPermission = await this.checkUserPermission(req.user.id, permission);

                if (!hasPermission) {
                    return res.status(403).json({
                        success: false,
                        message: 'Permisos insuficientes',
                        code: 'INSUFFICIENT_PERMISSIONS',
                        requiredPermission: permission
                    });
                }

                next();
            } catch (error) {
                console.error('[SSO Client] Error verificando permisos:', error);
                res.status(500).json({
                    success: false,
                    message: 'Error verificando permisos',
                    code: 'PERMISSION_CHECK_ERROR'
                });
            }
        };
    }

    /**
     * Extraer token del request
     */
    extractToken(req) {
        // Verificar en headers Authorization
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Verificar en cookies
        if (req.cookies && req.cookies.access_token) {
            return req.cookies.access_token;
        }

        // Verificar en query string (solo para casos específicos)
        if (req.query && req.query.token) {
            return req.query.token;
        }

        return null;
    }

    /**
     * Verificar token con el SSO
     */
    async verifyToken(token) {
        try {
            // Verificar en cache primero
            const cacheKey = `token:${token}`;
            const cached = this.validationCache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
                return cached.validation;
            }

            // Verificar con el SSO
            const response = await this.httpClient.get(`${this.ssoUrl}/api/auth/verify`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.data.success) {
                const validation = {
                    valid: true,
                    user: response.data.data.user,
                    permissions: response.data.data.permissions || []
                };

                // Guardar en cache
                this.validationCache.set(cacheKey, {
                    validation,
                    timestamp: Date.now()
                });

                return validation;
            } else {
                return {
                    valid: false,
                    message: response.data.message
                };
            }
        } catch (error) {
            console.error('[SSO Client] Error verificando token:', error.message);
            
            if (error.response?.status === 401) {
                return {
                    valid: false,
                    message: 'Token inválido o expirado'
                };
            }
            
            // En caso de error de comunicación, permitir acceso temporalmente
            // pero logear el error para investigación
            console.warn('[SSO Client] Error de comunicación con SSO, permitiendo acceso temporal');
            
            try {
                // Intentar decodificar JWT localmente como fallback
                const decoded = jwt.decode(token);
                if (decoded && decoded.userId) {
                    return {
                        valid: true,
                        user: {
                            id: decoded.userId,
                            email: decoded.email,
                            firstName: decoded.firstName,
                            lastName: decoded.lastName
                        },
                        permissions: [], // Sin permisos en modo fallback
                        fallback: true
                    };
                }
            } catch (jwtError) {
                // Ignorar errores de decodificación
            }
            
            return {
                valid: false,
                message: 'Error verificando token'
            };
        }
    }

    /**
     * Verificar si usuario tiene permiso específico
     */
    async checkUserPermission(userId, permission) {
        try {
            const cacheKey = `permission:${userId}:${permission}`;
            const cached = this.validationCache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
                return cached.hasPermission;
            }

            // Verificar con el SSO
            const response = await this.httpClient.get(
                `${this.ssoUrl}/api/users/${userId}/permissions`,
                { timeout: 3000 }
            );

            if (response.data.success) {
                const permissions = response.data.data.map(p => p.name);
                const hasPermission = permissions.includes(permission);

                // Guardar en cache
                this.validationCache.set(cacheKey, {
                    hasPermission,
                    timestamp: Date.now()
                });

                return hasPermission;
            }

            return false;
        } catch (error) {
            console.error('[SSO Client] Error verificando permiso:', error.message);
            // En caso de error, denegar por seguridad
            return false;
        }
    }

    /**
     * Iniciar heartbeat periódico
     */
    startHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        this.heartbeatTimer = setInterval(async () => {
            try {
                await this.sendHeartbeat();
            } catch (error) {
                console.error('[SSO Client] Error en heartbeat:', error.message);
            }
        }, this.heartbeatInterval);

        console.log(`[SSO Client] Heartbeat iniciado cada ${this.heartbeatInterval}ms`);
    }

    /**
     * Enviar heartbeat al SSO
     */
    async sendHeartbeat() {
        try {
            if (!this.isRegistered || !this.serviceId) {
                console.warn('[SSO Client] Servicio no registrado, saltando heartbeat');
                return;
            }

            const heartbeatData = {
                status: 'online',
                metadata: {
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    version: this.version
                }
            };

            await this.httpClient.post(
                `${this.ssoUrl}/api/services/${this.serviceId}/heartbeat`,
                heartbeatData,
                { timeout: 3000 }
            );

            this.lastHeartbeat = new Date();
            console.log(`[SSO Client] Heartbeat enviado: ${this.lastHeartbeat.toISOString()}`);
        } catch (error) {
            console.error('[SSO Client] Error enviando heartbeat:', error.message);
            
            // Si el servicio no existe, intentar re-registrar
            if (error.response?.status === 404) {
                console.warn('[SSO Client] Servicio no encontrado, re-registrando...');
                this.isRegistered = false;
                await this.register();
            }
        }
    }

    /**
     * Detener heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
            console.log('[SSO Client] Heartbeat detenido');
        }
    }

    /**
     * Limpiar cache de validaciones
     */
    clearCache() {
        this.validationCache.clear();
        console.log('[SSO Client] Cache limpiado');
    }

    /**
     * Obtener estadísticas del cliente
     */
    getStats() {
        return {
            serviceName: this.serviceName,
            version: this.version,
            isRegistered: this.isRegistered,
            serviceId: this.serviceId,
            lastHeartbeat: this.lastHeartbeat,
            cacheSize: this.validationCache.size,
            ssoUrl: this.ssoUrl
        };
    }

    /**
     * Desconectar del SSO
     */
    async disconnect() {
        try {
            this.stopHeartbeat();
            this.clearCache();
            
            if (this.isRegistered && this.serviceId) {
                // Enviar último heartbeat con estado offline
                await this.httpClient.post(
                    `${this.ssoUrl}/api/services/${this.serviceId}/heartbeat`,
                    {
                        status: 'offline',
                        metadata: {
                            timestamp: new Date().toISOString(),
                            reason: 'graceful_shutdown'
                        }
                    },
                    { timeout: 3000 }
                );
            }
            
            console.log('[SSO Client] Desconectado del SSO');
        } catch (error) {
            console.error('[SSO Client] Error desconectando:', error.message);
        }
    }

    /**
     * Método para usar en shutdown graceful
     */
    gracefulShutdown() {
        return this.disconnect();
    }
}

/**
 * Helper para configurar el cliente SSO con Express
 */
function setupSSO(app, options) {
    const ssoClient = new SSOClient(options);
    
    // Auto-registrar cuando la aplicación esté lista
    const originalListen = app.listen;
    app.listen = function(...args) {
        const server = originalListen.apply(this, args);
        
        // Registrar después de que el servidor esté escuchando
        setTimeout(async () => {
            try {
                await ssoClient.register();
            } catch (error) {
                console.error('Error auto-registrando servicio:', error.message);
            }
        }, 1000);
        
        // Configurar shutdown graceful
        process.on('SIGTERM', () => {
            console.log('SIGTERM recibido, desconectando del SSO...');
            ssoClient.gracefulShutdown().then(() => {
                server.close(() => {
                    process.exit(0);
                });
            });
        });
        
        process.on('SIGINT', () => {
            console.log('SIGINT recibido, desconectando del SSO...');
            ssoClient.gracefulShutdown().then(() => {
                server.close(() => {
                    process.exit(0);
                });
            });
        });
        
        return server;
    };
    
    // Middleware de stats del SSO
    app.get('/sso/stats', (req, res) => {
        res.json(ssoClient.getStats());
    });
    
    return ssoClient;
}

/**
 * Crear middleware de autenticación rápido
 */
function createAuthMiddleware(ssoUrl, serviceName) {
    const client = new SSOClient({ ssoUrl, serviceName });
    
    // Auto-registrar
    client.register().catch(err => {
        console.error('Error registrando servicio:', err.message);
    });
    
    return client.middleware();
}

/**
 * Decorator para proteger rutas con permisos (para uso con frameworks que soporten decorators)
 */
function RequirePermission(permission) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function(req, res, ...args) {
            if (!req.ssoClient) {
                return res.status(500).json({
                    success: false,
                    message: 'SSO Client no configurado'
                });
            }
            
            const hasPermission = await req.ssoClient.checkUserPermission(req.user?.id, permission);
            
            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: 'Permisos insuficientes',
                    requiredPermission: permission
                });
            }
            
            return originalMethod.apply(this, [req, res, ...args]);
        };
        
        return descriptor;
    };
}

/**
 * Utilidad para validar tokens de forma directa
 */
async function validateToken(token, ssoUrl) {
    try {
        const response = await axios.get(`${ssoUrl}/api/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            timeout: 5000
        });
        
        return response.data.success ? response.data.data : null;
    } catch (error) {
        console.error('Error validando token:', error.message);
        return null;
    }
}

/**
 * Utilidad para obtener información de un usuario
 */
async function getUserInfo(userId, ssoUrl, authToken) {
    try {
        const response = await axios.get(`${ssoUrl}/api/users/${userId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            timeout: 5000
        });
        
        return response.data.success ? response.data.data : null;
    } catch (error) {
        console.error('Error obteniendo información de usuario:', error.message);
        return null;
    }
}

// Exportar clase principal y utilidades
module.exports = {
    SSOClient,
    setupSSO,
    createAuthMiddleware,
    RequirePermission,
    validateToken,
    getUserInfo
};

// Para compatibilidad con CommonJS
module.exports.default = SSOClient;