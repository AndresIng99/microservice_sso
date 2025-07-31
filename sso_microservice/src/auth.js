/**
 * ============================================================================
 * MÓDULO DE AUTENTICACIÓN - JWT + SEGURIDAD
 * ============================================================================
 * Manejo completo de autenticación, tokens y permisos
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const redis = require('redis');
const db = require('./database');
const { logger, formatResponse } = require('./utils');

// Configuración JWT
const JWT_SECRET = process.env.JWT_SECRET || 'sso-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'sso-refresh-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Cliente Redis (opcional)
let redisClient = null;

// Inicializar Redis si está configurado
async function initializeRedis() {
    try {
        if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
            redisClient = redis.createClient({
                host: process.env.REDIS_HOST,
                port: process.env.REDIS_PORT,
                password: process.env.REDIS_PASSWORD,
                retryDelayOnFailover: 100,
                enableOfflineQueue: false
            });

            redisClient.on('error', (err) => {
                logger.error('Redis error:', err);
                redisClient = null;
            });

            redisClient.on('connect', () => {
                logger.info('Redis connected successfully');
            });

            await redisClient.connect();
        }
    } catch (error) {
        logger.warn('Redis not available, using memory storage:', error.message);
        redisClient = null;
    }
}

// Inicializar Redis al cargar el módulo
initializeRedis();

// ============================================================================
// FUNCIONES DE HASHING Y CRIPTOGRAFÍA
// ============================================================================

/**
 * Hashear password
 */
async function hashPassword(password) {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * Verificar password
 */
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

/**
 * Generar hash para token
 */
function generateTokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generar token aleatorio
 */
function generateRandomToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

// ============================================================================
// FUNCIONES DE TOKENS JWT
// ============================================================================

/**
 * Generar token de acceso
 */
function generateAccessToken(payload) {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: 'sso-system',
        audience: 'sso-users'
    });
}

/**
 * Generar token de refresh
 */
function generateRefreshToken(payload) {
    return jwt.sign(payload, JWT_REFRESH_SECRET, {
        expiresIn: JWT_REFRESH_EXPIRES_IN,
        issuer: 'sso-system',
        audience: 'sso-users'
    });
}

/**
 * Verificar token de acceso
 */
function verifyAccessToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET, {
            issuer: 'sso-system',
            audience: 'sso-users'
        });
    } catch (error) {
        logger.debug('Token verification failed:', error.message);
        return null;
    }
}

/**
 * Verificar token de refresh
 */
function verifyRefreshToken(token) {
    try {
        return jwt.verify(token, JWT_REFRESH_SECRET, {
            issuer: 'sso-system',
            audience: 'sso-users'
        });
    } catch (error) {
        logger.debug('Refresh token verification failed:', error.message);
        return null;
    }
}

/**
 * Generar par de tokens para usuario
 */
async function generateTokenPair(user) {
    const payload = {
        userId: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken({ userId: user.id });

    return {
        accessToken,
        refreshToken,
        expiresIn: JWT_EXPIRES_IN
    };
}

// ============================================================================
// GESTIÓN DE SESIONES
// ============================================================================

/**
 * Crear sesión de usuario
 */
async function createUserSession(userId, accessToken, refreshToken, ipAddress, userAgent) {
    try {
        const tokenHash = generateTokenHash(accessToken);
        const refreshTokenHash = generateTokenHash(refreshToken);
        
        // Calcular fecha de expiración
        const decoded = jwt.decode(accessToken);
        const expiresAt = new Date(decoded.exp * 1000);

        // Crear sesión en BD
        const session = await db.UserSessions.create(
            userId, 
            tokenHash, 
            refreshTokenHash, 
            ipAddress, 
            userAgent, 
            expiresAt
        );

        // Guardar en Redis si está disponible
        if (redisClient) {
            try {
                const sessionData = {
                    userId,
                    sessionId: session.id,
                    ipAddress,
                    userAgent,
                    createdAt: session.created_at
                };

                const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
                await redisClient.setEx(`session:${tokenHash}`, ttl, JSON.stringify(sessionData));
            } catch (redisError) {
                logger.warn('Error saving session to Redis:', redisError.message);
            }
        }

        return session;
    } catch (error) {
        logger.error('Error creating user session:', error);
        throw error;
    }
}

/**
 * Validar sesión
 */
async function validateSession(token) {
    try {
        const tokenHash = generateTokenHash(token);

        // Verificar en Redis primero si está disponible
        if (redisClient) {
            try {
                const sessionData = await redisClient.get(`session:${tokenHash}`);
                if (sessionData) {
                    const session = JSON.parse(sessionData);
                    return { userId: session.userId, valid: true };
                }
            } catch (redisError) {
                logger.warn('Error checking Redis session:', redisError.message);
            }
        }

        // Verificar en base de datos
        const session = await db.UserSessions.validate(tokenHash);
        
        if (session && session.user_id) {
            return { userId: session.user_id, valid: true };
        }

        return { valid: false };
    } catch (error) {
        logger.error('Error validating session:', error);
        return { valid: false };
    }
}

/**
 * Revocar sesión
 */
async function revokeSession(token) {
    try {
        const tokenHash = generateTokenHash(token);

        // Revocar en base de datos
        await db.UserSessions.revoke(tokenHash);

        // Eliminar de Redis si está disponible
        if (redisClient) {
            try {
                await redisClient.del(`session:${tokenHash}`);
            } catch (redisError) {
                logger.warn('Error removing session from Redis:', redisError.message);
            }
        }

        return true;
    } catch (error) {
        logger.error('Error revoking session:', error);
        return false;
    }
}

/**
 * Revocar todas las sesiones de un usuario
 */
async function revokeAllUserSessions(userId) {
    try {
        const revokedCount = await db.UserSessions.revokeAllForUser(userId);

        // TODO: Implementar limpieza de Redis por patrón si es necesario
        
        return revokedCount;
    } catch (error) {
        logger.error('Error revoking all user sessions:', error);
        return 0;
    }
}

// ============================================================================
// MIDDLEWARES DE AUTENTICACIÓN
// ============================================================================

/**
 * Extraer token del request
 */
function extractToken(req) {
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
 * Middleware de autenticación requerida
 */
const requireAuth = async (req, res, next) => {
    try {
        const token = extractToken(req);

        if (!token) {
            return res.status(401).json(formatResponse(false, 'Token de acceso requerido'));
        }

        // Verificar JWT
        const decoded = verifyAccessToken(token);
        if (!decoded) {
            return res.status(401).json(formatResponse(false, 'Token inválido o expirado'));
        }

        // Validar sesión
        const sessionValidation = await validateSession(token);
        if (!sessionValidation.valid) {
            return res.status(401).json(formatResponse(false, 'Sesión inválida o expirada'));
        }

        // Obtener usuario actualizado
        const user = await db.Users.getById(decoded.userId);
        if (!user || !user.is_active) {
            return res.status(401).json(formatResponse(false, 'Usuario no encontrado o inactivo'));
        }

        // Verificar si el usuario está bloqueado
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(423).json(formatResponse(false, 'Usuario temporalmente bloqueado'));
        }

        // Agregar información del usuario al request
        req.user = {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            isActive: user.is_active,
            isVerified: user.is_verified
        };

        req.token = token;

        next();
    } catch (error) {
        logger.error('Authentication error:', error);
        res.status(500).json(formatResponse(false, 'Error de autenticación'));
    }
};

/**
 * Middleware de verificación de permisos
 */
const requirePermission = (permission) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json(formatResponse(false, 'Autenticación requerida'));
            }

            // Verificar si el usuario tiene el permiso
            const hasPermission = await db.Permissions.userHasPermission(req.user.id, permission);

            if (!hasPermission) {
                // Log del intento de acceso no autorizado
                await db.AuditLogs.create(
                    req.user.id,
                    'access_denied',
                    'permission',
                    permission,
                    { 
                        required_permission: permission,
                        endpoint: req.originalUrl,
                        method: req.method
                    },
                    req.ip,
                    req.get('User-Agent')
                );

                return res.status(403).json(formatResponse(false, 'Permisos insuficientes', {
                    required_permission: permission
                }));
            }

            next();
        } catch (error) {
            logger.error('Permission check error:', error);
            res.status(500).json(formatResponse(false, 'Error verificando permisos'));
        }
    };
};

/**
 * Middleware de autenticación opcional
 */
const optionalAuth = async (req, res, next) => {
    try {
        const token = extractToken(req);

        if (token) {
            const decoded = verifyAccessToken(token);
            if (decoded) {
                const user = await db.Users.getById(decoded.userId);
                if (user && user.is_active) {
                    req.user = {
                        id: user.id,
                        email: user.email,
                        firstName: user.first_name,
                        lastName: user.last_name,
                        isActive: user.is_active,
                        isVerified: user.is_verified
                    };
                    req.token = token;
                }
            }
        }

        next();
    } catch (error) {
        logger.debug('Optional auth error:', error);
        // No bloquear el request en caso de error
        next();
    }
};

// ============================================================================
// VALIDACIÓN DE RUTAS PARA MICROSERVICIOS
// ============================================================================

/**
 * Verificar si el usuario puede acceder a una ruta específica
 */
async function validateServiceAccess(userId, serviceName, method, path) {
    try {
        // Obtener el servicio
        const services = await db.Services.getAll({ includeRoutes: true });
        const service = services.find(s => s.name === serviceName);

        if (!service) {
            return { allowed: false, reason: 'Servicio no encontrado' };
        }

        // Buscar la ruta específica
        const route = service.routes.find(r => 
            r.method.toLowerCase() === method.toLowerCase() && 
            matchPath(r.path, path)
        );

        if (!route) {
            return { allowed: false, reason: 'Ruta no encontrada' };
        }

        // Si la ruta es pública, permitir acceso
        if (route.is_public || !route.requires_auth) {
            return { allowed: true, reason: 'Ruta pública' };
        }

        // Verificar permiso requerido
        if (route.required_permission) {
            const hasPermission = await db.Permissions.userHasPermission(userId, route.required_permission);
            
            if (!hasPermission) {
                return { 
                    allowed: false, 
                    reason: 'Permiso insuficiente',
                    required_permission: route.required_permission
                };
            }
        }

        return { allowed: true, reason: 'Acceso autorizado' };
    } catch (error) {
        logger.error('Error validating service access:', error);
        return { allowed: false, reason: 'Error interno' };
    }
}

/**
 * Comparar path con pattern (soporte básico para parámetros)
 */
function matchPath(pattern, path) {
    // Convertir pattern a regex
    const regexPattern = pattern
        .replace(/:\w+/g, '[^/]+')  // :id -> [^/]+
        .replace(/\*/g, '.*');      // * -> .*
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
}

// ============================================================================
// FUNCIONES DE LIMPIEZA Y MANTENIMIENTO
// ============================================================================

/**
 * Limpiar sesiones expiradas
 */
async function cleanupExpiredSessions() {
    try {
        const cleanedCount = await db.UserSessions.cleanExpired();
        logger.info(`Cleaned up ${cleanedCount} expired sessions`);
        return cleanedCount;
    } catch (error) {
        logger.error('Error cleaning expired sessions:', error);
        return 0;
    }
}

/**
 * Programar limpieza automática cada hora
 */
setInterval(cleanupExpiredSessions, 60 * 60 * 1000); // 1 hora

// ============================================================================
// FUNCIONES DE UTILIDAD
// ============================================================================

/**
 * Obtener cliente Redis (para uso externo)
 */
function getRedisClient() {
    return redisClient;
}

/**
 * Verificar si un token está en la lista negra
 */
async function isTokenBlacklisted(token) {
    if (!redisClient) return false;

    try {
        const tokenHash = generateTokenHash(token);
        const isBlacklisted = await redisClient.exists(`blacklist:${tokenHash}`);
        return isBlacklisted === 1;
    } catch (error) {
        logger.warn('Error checking token blacklist:', error);
        return false;
    }
}

/**
 * Agregar token a lista negra
 */
async function blacklistToken(token, expiresIn = 3600) {
    if (!redisClient) return false;

    try {
        const tokenHash = generateTokenHash(token);
        await redisClient.setEx(`blacklist:${tokenHash}`, expiresIn, 'blacklisted');
        return true;
    } catch (error) {
        logger.warn('Error blacklisting token:', error);
        return false;
    }
}

/**
 * Generar token de API para servicios
 */
function generateServiceToken(serviceName, serviceId) {
    const payload = {
        type: 'service',
        serviceName,
        serviceId,
        iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: '1y', // Los tokens de servicio duran más
        issuer: 'sso-system',
        audience: 'sso-services'
    });
}

/**
 * Verificar token de servicio
 */
function verifyServiceToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET, {
            issuer: 'sso-system',
            audience: 'sso-services'
        });
    } catch (error) {
        logger.debug('Service token verification failed:', error.message);
        return null;
    }
}

// ============================================================================
// EXPORTAR FUNCIONES
// ============================================================================

module.exports = {
    // Funciones de password
    hashPassword,
    verifyPassword,
    
    // Funciones de tokens
    generateTokenPair,
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    generateTokenHash,
    generateRandomToken,
    
    // Funciones de sesiones
    createUserSession,
    validateSession,
    revokeSession,
    revokeAllUserSessions,
    
    // Middlewares
    requireAuth,
    requirePermission,
    optionalAuth,
    extractToken,
    
    // Validación de servicios
    validateServiceAccess,
    
    // Funciones de servicio
    generateServiceToken,
    verifyServiceToken,
    
    // Funciones de utilidad
    getRedisClient,
    isTokenBlacklisted,
    blacklistToken,
    cleanupExpiredSessions,
    
    // Funciones de criptografía
    generateRandomToken
};