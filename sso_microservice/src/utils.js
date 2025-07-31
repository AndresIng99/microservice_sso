/**
 * ============================================================================
 * MÓDULO DE UTILIDADES - HELPERS Y FUNCIONES AUXILIARES
 * ============================================================================
 * Funciones de logging, validación, formateo y otras utilidades
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const Joi = require('joi');
const crypto = require('crypto');
const path = require('path');

// ============================================================================
// CONFIGURACIÓN DE LOGGING
// ============================================================================

// Crear directorio de logs si no existe
const logDir = '/var/log/sso';

// Configurar transportes de winston
const transports = [
    // Consola para desarrollo
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
                return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
            })
        )
    })
];

// Archivo para producción
if (process.env.NODE_ENV === 'production') {
    transports.push(
        new DailyRotateFile({
            filename: path.join(logDir, 'app-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        })
    );

    transports.push(
        new DailyRotateFile({
            filename: path.join(logDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d',
            level: 'error',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        })
    );
}

// Crear logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'sso-system' },
    transports
});

// ============================================================================
// FORMATEO DE RESPUESTAS
// ============================================================================

/**
 * Formatear respuesta estándar de API
 */
function formatResponse(success, message, data = null, meta = null) {
    const response = {
        success,
        message,
        timestamp: new Date().toISOString()
    };

    if (data !== null) {
        response.data = data;
    }

    if (meta !== null) {
        response.meta = meta;
    }

    return response;
}

/**
 * Formatear respuesta de error
 */
function formatError(message, code = 'INTERNAL_ERROR', details = null) {
    const response = {
        success: false,
        error: {
            code,
            message,
            timestamp: new Date().toISOString()
        }
    };

    if (details) {
        response.error.details = details;
    }

    return response;
}

/**
 * Formatear respuesta paginada
 */
function formatPaginatedResponse(data, pagination, message = 'Datos obtenidos correctamente') {
    return formatResponse(true, message, data, { pagination });
}

// ============================================================================
// ESQUEMAS DE VALIDACIÓN CON JOI
// ============================================================================

// Esquemas para autenticación
const authSchemas = {
    login: Joi.object({
        email: Joi.string().email().required().messages({
            'string.email': 'Formato de email inválido',
            'any.required': 'Email es requerido'
        }),
        password: Joi.string().min(6).required().messages({
            'string.min': 'Password debe tener al menos 6 caracteres',
            'any.required': 'Password es requerido'
        }),
        rememberMe: Joi.boolean().default(false)
    })
};

// Esquemas para usuarios
const userSchemas = {
    user: Joi.object({
        email: Joi.string().email().required().messages({
            'string.email': 'Formato de email inválido',
            'any.required': 'Email es requerido'
        }),
        password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required().messages({
            'string.min': 'Password debe tener al menos 8 caracteres',
            'string.pattern.base': 'Password debe contener al menos una mayúscula, una minúscula y un número',
            'any.required': 'Password es requerido'
        }),
        firstName: Joi.string().min(2).max(50).required().messages({
            'string.min': 'Nombre debe tener al menos 2 caracteres',
            'string.max': 'Nombre no puede exceder 50 caracteres',
            'any.required': 'Nombre es requerido'
        }),
        lastName: Joi.string().min(2).max(50).required().messages({
            'string.min': 'Apellido debe tener al menos 2 caracteres',
            'string.max': 'Apellido no puede exceder 50 caracteres',
            'any.required': 'Apellido es requerido'
        }),
        roleIds: Joi.array().items(Joi.string().uuid()).default([])
    }),
    
    userUpdate: Joi.object({
        email: Joi.string().email().messages({
            'string.email': 'Formato de email inválido'
        }),
        password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).messages({
            'string.min': 'Password debe tener al menos 8 caracteres',
            'string.pattern.base': 'Password debe contener al menos una mayúscula, una minúscula y un número'
        }),
        firstName: Joi.string().min(2).max(50).messages({
            'string.min': 'Nombre debe tener al menos 2 caracteres',
            'string.max': 'Nombre no puede exceder 50 caracteres'
        }),
        lastName: Joi.string().min(2).max(50).messages({
            'string.min': 'Apellido debe tener al menos 2 caracteres',
            'string.max': 'Apellido no puede exceder 50 caracteres'
        }),
        isActive: Joi.boolean(),
        isVerified: Joi.boolean()
    }).min(1)
};

// Esquemas para roles
const roleSchemas = {
    role: Joi.object({
        name: Joi.string().min(2).max(50).pattern(/^[a-z0-9_]+$/).required().messages({
            'string.min': 'Nombre del rol debe tener al menos 2 caracteres',
            'string.max': 'Nombre del rol no puede exceder 50 caracteres',
            'string.pattern.base': 'Nombre del rol solo puede contener letras minúsculas, números y guiones bajos',
            'any.required': 'Nombre del rol es requerido'
        }),
        displayName: Joi.string().min(2).max(100).required().messages({
            'string.min': 'Nombre para mostrar debe tener al menos 2 caracteres',
            'string.max': 'Nombre para mostrar no puede exceder 100 caracteres',
            'any.required': 'Nombre para mostrar es requerido'
        }),
        description: Joi.string().max(255).allow('').messages({
            'string.max': 'Descripción no puede exceder 255 caracteres'
        }),
        permissionIds: Joi.array().items(Joi.string().uuid()).default([])
    }),
    
    roleUpdate: Joi.object({
        displayName: Joi.string().min(2).max(100).messages({
            'string.min': 'Nombre para mostrar debe tener al menos 2 caracteres',
            'string.max': 'Nombre para mostrar no puede exceder 100 caracteres'
        }),
        description: Joi.string().max(255).allow('').messages({
            'string.max': 'Descripción no puede exceder 255 caracteres'
        })
    }).min(1)
};

// Esquemas para permisos
const permissionSchemas = {
    permission: Joi.object({
        name: Joi.string().min(3).max(200).pattern(/^[a-z0-9._]+$/).required().messages({
            'string.min': 'Nombre del permiso debe tener al menos 3 caracteres',
            'string.max': 'Nombre del permiso no puede exceder 200 caracteres',
            'string.pattern.base': 'Nombre del permiso solo puede contener letras minúsculas, números, puntos y guiones bajos',
            'any.required': 'Nombre del permiso es requerido'
        }),
        displayName: Joi.string().min(3).max(200).required().messages({
            'string.min': 'Nombre para mostrar debe tener al menos 3 caracteres',
            'string.max': 'Nombre para mostrar no puede exceder 200 caracteres',
            'any.required': 'Nombre para mostrar es requerido'
        }),
        description: Joi.string().max(255).allow('').messages({
            'string.max': 'Descripción no puede exceder 255 caracteres'
        }),
        module: Joi.string().min(2).max(100).required().messages({
            'string.min': 'Módulo debe tener al menos 2 caracteres',
            'string.max': 'Módulo no puede exceder 100 caracteres',
            'any.required': 'Módulo es requerido'
        }),
        action: Joi.string().valid('create', 'read', 'update', 'delete', 'manage', 'access').required().messages({
            'any.only': 'Acción debe ser una de: create, read, update, delete, manage, access',
            'any.required': 'Acción es requerida'
        }),
        resource: Joi.string().min(2).max(100).required().messages({
            'string.min': 'Recurso debe tener al menos 2 caracteres',
            'string.max': 'Recurso no puede exceder 100 caracteres',
            'any.required': 'Recurso es requerido'
        })
    })
};

// Esquemas para servicios
const serviceSchemas = {
    service: Joi.object({
        name: Joi.string().min(2).max(100).pattern(/^[a-z0-9-_]+$/).required().messages({
            'string.min': 'Nombre del servicio debe tener al menos 2 caracteres',
            'string.max': 'Nombre del servicio no puede exceder 100 caracteres',
            'string.pattern.base': 'Nombre del servicio solo puede contener letras minúsculas, números, guiones y guiones bajos',
            'any.required': 'Nombre del servicio es requerido'
        }),
        displayName: Joi.string().min(2).max(150).required().messages({
            'string.min': 'Nombre para mostrar debe tener al menos 2 caracteres',
            'string.max': 'Nombre para mostrar no puede exceder 150 caracteres',
            'any.required': 'Nombre para mostrar es requerido'
        }),
        description: Joi.string().max(500).allow('').messages({
            'string.max': 'Descripción no puede exceder 500 caracteres'
        }),
        baseUrl: Joi.string().uri().required().messages({
            'string.uri': 'URL base debe ser una URL válida',
            'any.required': 'URL base es requerida'
        }),
        healthCheckUrl: Joi.string().uri().messages({
            'string.uri': 'URL de health check debe ser una URL válida'
        }),
        version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).default('1.0.0').messages({
            'string.pattern.base': 'Versión debe tener formato semántico (ej: 1.0.0)'
        }),
        metadata: Joi.object().default({})
    })
};

// Mapeo de esquemas
const validationSchemas = {
    ...authSchemas,
    ...userSchemas,
    ...roleSchemas,
    ...permissionSchemas,
    ...serviceSchemas
};

/**
 * Middleware de validación de entrada
 */
function validateInput(schemaName) {
    return (req, res, next) => {
        const schema = validationSchemas[schemaName];
        
        if (!schema) {
            logger.error(`Schema de validación no encontrado: ${schemaName}`);
            return res.status(500).json(formatError('Error de configuración interna'));
        }

        const { error, value } = schema.validate(req.body, { 
            abortEarly: false,
            stripUnknown: true 
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            return res.status(400).json(formatError('Datos de entrada inválidos', 'VALIDATION_ERROR', errors));
        }

        // Reemplazar req.body con el valor validado y limpio
        req.body = value;
        next();
    };
}

// ============================================================================
// FUNCIONES DE CRIPTOGRAFÍA Y SEGURIDAD
// ============================================================================

/**
 * Generar ID único
 */
function generateId() {
    return crypto.randomUUID();
}

/**
 * Generar token aleatorio seguro
 */
function generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash de string con SHA-256
 */
function hashString(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Crear hash HMAC
 */
function createHMAC(data, secret) {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verificar hash HMAC
 */
function verifyHMAC(data, hash, secret) {
    const expectedHash = createHMAC(data, secret);
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
}

/**
 * Encriptar texto
 */
function encrypt(text, password) {
    try {
        const algorithm = 'aes-256-gcm';
        const salt = crypto.randomBytes(16);
        const key = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipher(algorithm, key);
        cipher.setAAD(salt);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            salt: salt.toString('hex'),
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    } catch (error) {
        logger.error('Encryption error:', error);
        throw new Error('Error al encriptar datos');
    }
}

/**
 * Desencriptar texto
 */
function decrypt(encryptedData, password) {
    try {
        const algorithm = 'aes-256-gcm';
        const salt = Buffer.from(encryptedData.salt, 'hex');
        const key = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
        const iv = Buffer.from(encryptedData.iv, 'hex');
        const authTag = Buffer.from(encryptedData.authTag, 'hex');
        
        const decipher = crypto.createDecipher(algorithm, key);
        decipher.setAAD(salt);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        logger.error('Decryption error:', error);
        throw new Error('Error al desencriptar datos');
    }
}

// ============================================================================
// FUNCIONES DE UTILIDAD GENERAL
// ============================================================================

/**
 * Delay asíncrono
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry con backoff exponencial
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            if (attempt === maxRetries) {
                throw lastError;
            }
            
            const delayTime = baseDelay * Math.pow(2, attempt - 1);
            logger.warn(`Attempt ${attempt} failed, retrying in ${delayTime}ms:`, error.message);
            await delay(delayTime);
        }
    }
}

/**
 * Throttle de función
 */
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Debounce de función
 */
function debounce(func, delay) {
    let timeoutId;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(context, args), delay);
    };
}

/**
 * Sanitizar objeto eliminando propiedades sensibles
 */
function sanitizeObject(obj, sensitiveFields = ['password', 'password_hash', 'token', 'secret']) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    const sanitized = { ...obj };
    
    sensitiveFields.forEach(field => {
        if (sanitized[field]) {
            sanitized[field] = '[REDACTED]';
        }
    });

    return sanitized;
}

/**
 * Capitalizar primera letra
 */
function capitalize(str) {
    if (!str || typeof str !== 'string') return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Formatear nombre completo
 */
function formatFullName(firstName, lastName) {
    const first = capitalize(firstName?.trim() || '');
    const last = capitalize(lastName?.trim() || '');
    return `${first} ${last}`.trim();
}

/**
 * Validar email
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Generar slug de texto
 */
function generateSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Eliminar caracteres especiales
        .replace(/[\s_-]+/g, '-') // Reemplazar espacios y guiones con un solo guión
        .replace(/^-+|-+$/g, ''); // Eliminar guiones al inicio y final
}

/**
 * Formatear bytes a tamaño legible
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Formatear duración en segundos
 */
function formatDuration(seconds) {
    const units = [
        { name: 'd', value: 86400 },
        { name: 'h', value: 3600 },
        { name: 'm', value: 60 },
        { name: 's', value: 1 }
    ];

    const result = [];

    for (const unit of units) {
        const count = Math.floor(seconds / unit.value);
        if (count > 0) {
            result.push(`${count}${unit.name}`);
            seconds %= unit.value;
        }
    }

    return result.length > 0 ? result.join(' ') : '0s';
}

/**
 * Escapar HTML
 */
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Parsear User-Agent básico
 */
function parseUserAgent(userAgent) {
    if (!userAgent) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };

    const ua = userAgent.toLowerCase();
    
    // Detectar navegador
    let browser = 'Unknown';
    if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari')) browser = 'Safari';
    else if (ua.includes('edge')) browser = 'Edge';
    else if (ua.includes('opera')) browser = 'Opera';

    // Detectar SO
    let os = 'Unknown';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('ios')) os = 'iOS';

    // Detectar dispositivo
    let device = 'Desktop';
    if (ua.includes('mobile')) device = 'Mobile';
    else if (ua.includes('tablet')) device = 'Tablet';

    return { browser, os, device };
}

// ============================================================================
// CONSTANTES DEL SISTEMA
// ============================================================================

const CONSTANTS = {
    // Roles del sistema
    SYSTEM_ROLES: {
        SUPER_ADMIN: 'super_admin',
        ADMIN: 'admin',
        SERVICE_MANAGER: 'service_manager',
        USER_MANAGER: 'user_manager',
        DEVELOPER: 'developer',
        USER: 'user'
    },

    // Acciones de auditoría
    AUDIT_ACTIONS: {
        LOGIN_SUCCESS: 'login_success',
        LOGIN_FAILED: 'login_failed',
        LOGIN_BLOCKED: 'login_blocked',
        LOGOUT: 'logout',
        USER_CREATED: 'user_created',
        USER_UPDATED: 'user_updated',
        USER_DELETED: 'user_deleted',
        ROLE_CREATED: 'role_created',
        ROLE_UPDATED: 'role_updated',
        ROLE_DELETED: 'role_deleted',
        ROLE_CLONED: 'role_cloned',
        PERMISSIONS_ASSIGNED: 'permissions_assigned',
        ROLES_ASSIGNED: 'roles_assigned',
        SERVICE_REGISTERED: 'service_registered',
        SERVICE_UPDATED: 'service_updated',
        SERVICE_ROUTES_CONFIGURED: 'service_routes_configured',
        ACCESS_DENIED: 'access_denied'
    },

    // Estados de servicios
    SERVICE_STATUS: {
        ONLINE: 'online',
        OFFLINE: 'offline',
        WARNING: 'warning',
        MAINTENANCE: 'maintenance'
    },

    // Códigos de error
    ERROR_CODES: {
        VALIDATION_ERROR: 'VALIDATION_ERROR',
        AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
        AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
        NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
        CONFLICT_ERROR: 'CONFLICT_ERROR',
        INTERNAL_ERROR: 'INTERNAL_ERROR',
        SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
    },

    // Configuración por defecto
    DEFAULT_CONFIG: {
        PAGINATION_LIMIT: 10,
        MAX_PAGINATION_LIMIT: 100,
        TOKEN_EXPIRY: '1h',
        REFRESH_TOKEN_EXPIRY: '7d',
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutos
        SESSION_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hora
        LOG_RETENTION_DAYS: 30
    }
};

// ============================================================================
// FUNCIONES DE CONFIGURACIÓN
// ============================================================================

/**
 * Obtener configuración del sistema
 */
function getSystemConfig() {
    return {
        environment: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 3001,
        logLevel: process.env.LOG_LEVEL || 'info',
        jwtSecret: process.env.JWT_SECRET || 'default-secret',
        jwtExpiresIn: process.env.JWT_EXPIRES_IN || CONSTANTS.DEFAULT_CONFIG.TOKEN_EXPIRY,
        jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || CONSTANTS.DEFAULT_CONFIG.REFRESH_TOKEN_EXPIRY,
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
        maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || CONSTANTS.DEFAULT_CONFIG.MAX_LOGIN_ATTEMPTS,
        lockoutTime: parseInt(process.env.LOCKOUT_TIME) || CONSTANTS.DEFAULT_CONFIG.LOCKOUT_DURATION,
        database: {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            name: process.env.DB_NAME || 'sso_system',
            user: process.env.DB_USER || 'sso_admin',
            ssl: process.env.DB_SSL === 'true'
        },
        redis: {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD
        }
    };
}

/**
 * Validar configuración del sistema
 */
function validateSystemConfig() {
    const config = getSystemConfig();
    const errors = [];

    // Validar secretos
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'default-secret') {
        errors.push('JWT_SECRET debe ser configurado en producción');
    }

    if (!process.env.JWT_REFRESH_SECRET) {
        errors.push('JWT_REFRESH_SECRET debe ser configurado');
    }

    // Validar base de datos
    if (!config.database.host) {
        errors.push('DB_HOST es requerido');
    }

    if (!process.env.DB_PASSWORD) {
        errors.push('DB_PASSWORD es requerido');
    }

    // Validar configuración de producción
    if (config.environment === 'production') {
        if (config.logLevel === 'debug') {
            errors.push('LOG_LEVEL no debe ser debug en producción');
        }

        if (config.bcryptRounds < 12) {
            errors.push('BCRYPT_ROUNDS debe ser al menos 12 en producción');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        config
    };
}

// ============================================================================
// EXPORTAR UTILIDADES
// ============================================================================

module.exports = {
    // Logger
    logger,

    // Formateo de respuestas
    formatResponse,
    formatError,
    formatPaginatedResponse,

    // Validación
    validateInput,
    validationSchemas,

    // Criptografía
    generateId,
    generateSecureToken,
    hashString,
    createHMAC,
    verifyHMAC,
    encrypt,
    decrypt,

    // Utilidades generales
    delay,
    retryWithBackoff,
    throttle,
    debounce,
    sanitizeObject,
    capitalize,
    formatFullName,
    isValidEmail,
    generateSlug,
    formatBytes,
    formatDuration,
    escapeHtml,
    parseUserAgent,

    // Constantes
    CONSTANTS,

    // Configuración
    getSystemConfig,
    validateSystemConfig
};