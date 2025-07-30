const jwt = require('jsonwebtoken');
const database = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

// Middleware de autenticación básica
const authMiddleware = async (req, res, next) => {
    try {
        // Extraer token del header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Token de acceso requerido',
                code: 'MISSING_TOKEN'
            });
        }

        const token = authHeader.split(' ')[1];

        // Verificar token JWT
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            let message = 'Token inválido';
            let code = 'INVALID_TOKEN';
            
            if (error.name === 'TokenExpiredError') {
                message = 'Token expirado';
                code = 'TOKEN_EXPIRED';
            } else if (error.name === 'JsonWebTokenError') {
                message = 'Token malformado';
                code = 'MALFORMED_TOKEN';
            }
            
            logger.security('Invalid token attempt', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                error: error.message
            });
            
            return res.status(401).json({
                success: false,
                message,
                code
            });
        }

        // Verificar si el token está en blacklist
        const jti = decoded.jti || `${decoded.id}_${decoded.iat}`;
        const isBlacklisted = await redis.isTokenBlacklisted(jti);
        
        if (isBlacklisted) {
            logger.security('Blacklisted token used', {
                userId: decoded.id,
                jti,
                ip: req.ip
            });
            
            return res.status(401).json({
                success: false,
                message: 'Token revocado',
                code: 'TOKEN_REVOKED'
            });
        }

        // Obtener usuario de cache primero
        let user = await redis.getCachedUser(decoded.id);
        
        if (!user) {
            // Si no está en cache, obtener de base de datos
            const userQuery = `
                SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url,
                       u.is_active, u.is_verified, u.last_login,
                       array_agg(DISTINCT r.name) as roles,
                       array_agg(DISTINCT r.display_name) as role_names
                FROM users u
                LEFT JOIN user_roles ur ON u.id = ur.user_id AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
                LEFT JOIN roles r ON ur.role_id = r.id AND r.is_active = true
                WHERE u.id = $1 AND u.is_active = true
                GROUP BY u.id
            `;
            
            const result = await database.query(userQuery, [decoded.id]);
            
            if (result.rows.length === 0) {
                logger.security('Token for non-existent or inactive user', {
                    userId: decoded.id,
                    ip: req.ip
                });
                
                return res.status(401).json({
                    success: false,
                    message: 'Usuario no encontrado o inactivo',
                    code: 'USER_NOT_FOUND'
                });
            }

            user = result.rows[0];
            
            // Cachear usuario por 1 hora
            await redis.cacheUser(user.id, {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                roles: user.roles || [],
                isActive: user.is_active,
                isVerified: user.is_verified
            }, 3600);
        }

        // Agregar datos del usuario y token a la request
        req.user = {
            id: user.id,
            email: user.email,
            firstName: user.firstName || user.first_name,
            lastName: user.lastName || user.last_name,
            roles: user.roles || [],
            isActive: user.isActive !== false,
            isVerified: user.isVerified !== false
        };
        
        req.token = token;
        req.tokenData = decoded;

        next();

    } catch (error) {
        logger.error('Authentication middleware error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            code: 'INTERNAL_ERROR'
        });
    }
};

// Middleware para verificar permisos específicos
const requirePermission = (permission) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuario no autenticado',
                    code: 'NOT_AUTHENTICATED'
                });
            }

            const userId = req.user.id;

            // Verificar permiso usando función de PostgreSQL
            const result = await database.callFunction('user_has_permission', [userId, permission]);
            const hasPermission = result[0]?.user_has_permission || false;

            if (!hasPermission) {
                logger.security('Permission denied', {
                    userId,
                    email: req.user.email,
                    permission,
                    ip: req.ip,
                    path: req.path,
                    method: req.method
                });
                
                return res.status(403).json({
                    success: false,
                    message: `No tienes permiso para realizar esta acción`,
                    requiredPermission: permission,
                    code: 'INSUFFICIENT_PERMISSIONS'
                });
            }

            // Log de acceso autorizado para acciones críticas
            if (permission.includes('delete') || permission.includes('admin') || permission.includes('system')) {
                logger.audit('critical_action_authorized', userId, {
                    permission,
                    path: req.path,
                    method: req.method,
                    ip: req.ip
                });
            }

            next();

        } catch (error) {
            logger.error('Permission check error:', error);
            
            res.status(500).json({
                success: false,
                message: 'Error verificando permisos',
                code: 'PERMISSION_CHECK_ERROR'
            });
        }
    };
};

// Middleware para verificar múltiples permisos (ANY - cualquiera)
const requireAnyPermission = (permissions) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuario no autenticado',
                    code: 'NOT_AUTHENTICATED'
                });
            }

            const userId = req.user.id;
            let hasAnyPermission = false;

            // Verificar cada permiso hasta encontrar uno válido
            for (const permission of permissions) {
                const result = await database.callFunction('user_has_permission', [userId, permission]);
                if (result[0]?.user_has_permission) {
                    hasAnyPermission = true;
                    break;
                }
            }

            if (!hasAnyPermission) {
                logger.security('Multiple permissions denied', {
                    userId,
                    email: req.user.email,
                    permissions,
                    ip: req.ip,
                    path: req.path,
                    method: req.method
                });
                
                return res.status(403).json({
                    success: false,
                    message: 'No tienes permisos para realizar esta acción',
                    requiredPermissions: permissions,
                    code: 'INSUFFICIENT_PERMISSIONS'
                });
            }

            next();

        } catch (error) {
            logger.error('Multiple permission check error:', error);
            
            res.status(500).json({
                success: false,
                message: 'Error verificando permisos',
                code: 'PERMISSION_CHECK_ERROR'
            });
        }
    };
};

// Middleware para verificar roles específicos
const requireRole = (roles) => {
    const roleArray = Array.isArray(roles) ? roles : [roles];
    
    return (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuario no autenticado',
                    code: 'NOT_AUTHENTICATED'
                });
            }

            const userRoles = req.user.roles || [];
            const hasRole = roleArray.some(role => userRoles.includes(role));

            if (!hasRole) {
                logger.security('Role access denied', {
                    userId: req.user.id,
                    email: req.user.email,
                    userRoles,
                    requiredRoles: roleArray,
                    ip: req.ip,
                    path: req.path,
                    method: req.method
                });
                
                return res.status(403).json({
                    success: false,
                    message: 'No tienes el rol necesario para realizar esta acción',
                    requiredRoles: roleArray,
                    code: 'INSUFFICIENT_ROLE'
                });
            }

            next();

        } catch (error) {
            logger.error('Role check error:', error);
            
            res.status(500).json({
                success: false,
                message: 'Error verificando rol',
                code: 'ROLE_CHECK_ERROR'
            });
        }
    };
};

// Middleware opcional de autenticación (no falla si no hay token)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No hay token, continuar sin usuario
            req.user = null;
            return next();
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Verificar blacklist
            const jti = decoded.jti || `${decoded.id}_${decoded.iat}`;
            const isBlacklisted = await redis.isTokenBlacklisted(jti);
            
            if (isBlacklisted) {
                req.user = null;
                return next();
            }

            // Obtener usuario básico
            const user = await redis.getCachedUser(decoded.id);
            
            if (user && user.isActive) {
                req.user = {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    roles: user.roles || []
                };
                req.token = token;
                req.tokenData = decoded;
            } else {
                req.user = null;
            }

        } catch (error) {
            // Token inválido, continuar sin usuario
            req.user = null;
        }

        next();

    } catch (error) {
        logger.error('Optional auth middleware error:', error);
        req.user = null;
        next();
    }
};

// Middleware para validar que el usuario esté verificado
const requireVerified = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Usuario no autenticado',
            code: 'NOT_AUTHENTICATED'
        });
    }

    if (!req.user.isVerified) {
        return res.status(403).json({
            success: false,
            message: 'Cuenta no verificada. Verifica tu email.',
            code: 'ACCOUNT_NOT_VERIFIED'
        });
    }

    next();
};

// Middleware para verificar que el usuario puede acceder a un recurso específico
const requireResourceAccess = (resourceType) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuario no autenticado',
                    code: 'NOT_AUTHENTICATED'
                });
            }

            const userId = req.user.id;
            const resourceId = req.params.id;

            // Para recursos propios, permitir acceso
            if (resourceType === 'user' && resourceId === userId) {
                return next();
            }

            // Verificar permiso específico para el tipo de recurso
            const permission = `sso.${resourceType}.read`;
            const result = await database.callFunction('user_has_permission', [userId, permission]);
            const hasPermission = result[0]?.user_has_permission || false;

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes acceso a este recurso',
                    code: 'RESOURCE_ACCESS_DENIED'
                });
            }

            next();

        } catch (error) {
            logger.error('Resource access check error:', error);
            
            res.status(500).json({
                success: false,
                message: 'Error verificando acceso al recurso',
                code: 'RESOURCE_ACCESS_ERROR'
            });
        }
    };
};

// Middleware para rate limiting por usuario
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return next(); // Sin usuario, usar rate limiting por IP (manejado por express-rate-limit)
            }

            const userId = req.user.id;
            const key = `rate_limit:user:${userId}`;
            const current = await redis.incrementRateLimit(key, Math.floor(windowMs / 1000));

            if (current > maxRequests) {
                logger.security('User rate limit exceeded', {
                    userId,
                    email: req.user.email,
                    requests: current,
                    limit: maxRequests,
                    ip: req.ip
                });

                return res.status(429).json({
                    success: false,
                    message: 'Demasiadas solicitudes. Intenta de nuevo más tarde.',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: Math.ceil(windowMs / 1000)
                });
            }

            // Agregar headers informativos
            res.set({
                'X-RateLimit-Limit': maxRequests,
                'X-RateLimit-Remaining': Math.max(0, maxRequests - current),
                'X-RateLimit-Reset': new Date(Date.now() + windowMs).toISOString()
            });

            next();

        } catch (error) {
            logger.error('User rate limit error:', error);
            next(); // En caso de error, permitir la request
        }
    };
};

// Middleware para logging de acciones críticas
const auditMiddleware = (action) => {
    return (req, res, next) => {
        // Interceptar la respuesta para loggear solo en caso de éxito
        const originalSend = res.send;
        
        res.send = function(data) {
            try {
                const responseData = typeof data === 'string' ? JSON.parse(data) : data;
                
                if (responseData && responseData.success && req.user) {
                    logger.audit(action, req.user.id, {
                        method: req.method,
                        path: req.path,
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        resourceId: req.params.id,
                        body: req.method !== 'GET' ? req.body : undefined
                    });
                }
            } catch (error) {
                // Error parseando respuesta, continuar normalmente
            }
            
            originalSend.call(this, data);
        };
        
        next();
    };
};

// Middleware para verificar que el servicio está registrado (para endpoints de servicios)
const requireRegisteredService = async (req, res, next) => {
    try {
        const serviceName = req.headers['x-service-name'];
        
        if (!serviceName) {
            return res.status(400).json({
                success: false,
                message: 'Nombre del servicio requerido',
                code: 'SERVICE_NAME_REQUIRED'
            });
        }

        // Verificar que el servicio esté registrado
        const service = await database.findOne('registered_services', { 
            name: serviceName, 
            status: 'active' 
        });

        if (!service) {
            logger.security('Unregistered service attempted access', {
                serviceName,
                ip: req.ip,
                path: req.path
            });
            
            return res.status(403).json({
                success: false,
                message: 'Servicio no registrado',
                code: 'SERVICE_NOT_REGISTERED'
            });
        }

        req.service = service;
        next();

    } catch (error) {
        logger.error('Service registration check error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Error verificando registro del servicio',
            code: 'SERVICE_CHECK_ERROR'
        });
    }
};

// Middleware para validar firma de servicio (opcional, para mayor seguridad)
const validateServiceSignature = (req, res, next) => {
    try {
        const signature = req.headers['x-service-signature'];
        const timestamp = req.headers['x-timestamp'];
        const serviceName = req.headers['x-service-name'];

        if (!signature || !timestamp || !serviceName) {
            return res.status(400).json({
                success: false,
                message: 'Headers de autenticación de servicio faltantes',
                code: 'MISSING_SERVICE_AUTH'
            });
        }

        // Verificar que el timestamp no sea muy antiguo (5 minutos)
        const requestTime = parseInt(timestamp);
        const currentTime = Math.floor(Date.now() / 1000);
        
        if (Math.abs(currentTime - requestTime) > 300) {
            return res.status(401).json({
                success: false,
                message: 'Request expirada',
                code: 'REQUEST_EXPIRED'
            });
        }

        // Aquí podrías verificar la firma con una clave secreta compartida
        // const expectedSignature = generateSignature(serviceName, timestamp, req.body);
        // if (signature !== expectedSignature) { ... }

        next();

    } catch (error) {
        logger.error('Service signature validation error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Error validando firma del servicio',
            code: 'SIGNATURE_VALIDATION_ERROR'
        });
    }
};

// Middleware combinado para casos comunes
const requireAdminOrOwner = (resourceIdParam = 'id') => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuario no autenticado',
                    code: 'NOT_AUTHENTICATED'
                });
            }

            const userId = req.user.id;
            const resourceId = req.params[resourceIdParam];

            // Si es el propietario del recurso, permitir acceso
            if (resourceId === userId) {
                return next();
            }

            // Si no es el propietario, verificar permisos de admin
            const result = await database.callFunction('user_has_permission', [userId, 'sso.users.manage']);
            const hasAdminPermission = result[0]?.user_has_permission || false;

            if (!hasAdminPermission) {
                return res.status(403).json({
                    success: false,
                    message: 'Solo puedes acceder a tus propios recursos o necesitas permisos de administrador',
                    code: 'INSUFFICIENT_PERMISSIONS'
                });
            }

            next();

        } catch (error) {
            logger.error('Admin or owner check error:', error);
            
            res.status(500).json({
                success: false,
                message: 'Error verificando permisos',
                code: 'PERMISSION_CHECK_ERROR'
            });
        }
    };
};

// Helper para crear middleware de permisos dinámicos
const createPermissionMiddleware = (getPermission) => {
    return async (req, res, next) => {
        try {
            const permission = typeof getPermission === 'function' ? 
                getPermission(req) : getPermission;

            return requirePermission(permission)(req, res, next);

        } catch (error) {
            logger.error('Dynamic permission middleware error:', error);
            
            res.status(500).json({
                success: false,
                message: 'Error verificando permisos',
                code: 'PERMISSION_CHECK_ERROR'
            });
        }
    };
};

// Middleware para verificar que el usuario tiene acceso a un servicio específico
const requireServiceAccess = (serviceName) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuario no autenticado',
                    code: 'NOT_AUTHENTICATED'
                });
            }

            // Verificar si el usuario tiene permisos para acceder al servicio
            const permission = `${serviceName}.access`;
            const result = await database.callFunction('user_has_permission', [req.user.id, permission]);
            const hasAccess = result[0]?.user_has_permission || false;

            if (!hasAccess) {
                logger.security('Service access denied', {
                    userId: req.user.id,
                    serviceName,
                    ip: req.ip
                });

                return res.status(403).json({
                    success: false,
                    message: `No tienes acceso al servicio ${serviceName}`,
                    code: 'SERVICE_ACCESS_DENIED'
                });
            }

            req.allowedService = serviceName;
            next();

        } catch (error) {
            logger.error('Service access check error:', error);
            
            res.status(500).json({
                success: false,
                message: 'Error verificando acceso al servicio',
                code: 'SERVICE_ACCESS_ERROR'
            });
        }
    };
};

module.exports = {
    authMiddleware,
    requirePermission,
    requireAnyPermission,
    requireRole,
    optionalAuth,
    requireVerified,
    requireResourceAccess,
    userRateLimit,
    auditMiddleware,
    requireRegisteredService,
    validateServiceSignature,
    requireAdminOrOwner,
    createPermissionMiddleware,
    requireServiceAccess
};