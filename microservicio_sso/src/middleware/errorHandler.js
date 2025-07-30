const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    // Log del error
    logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        body: req.method !== 'GET' ? req.body : undefined
    });

    // Error de validación de Joi
    if (err.isJoi) {
        return res.status(400).json({
            success: false,
            message: 'Datos de entrada inválidos',
            errors: err.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            })),
            code: 'VALIDATION_ERROR'
        });
    }

    // Error de JWT
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Token inválido',
            code: 'INVALID_TOKEN'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expirado',
            code: 'TOKEN_EXPIRED'
        });
    }

    // Errores de base de datos PostgreSQL
    if (err.code) {
        switch (err.code) {
            case '23505': // Violación de restricción única
                return res.status(409).json({
                    success: false,
                    message: 'El recurso ya existe',
                    code: 'DUPLICATE_RESOURCE'
                });
            
            case '23503': // Violación de clave foránea
                return res.status(400).json({
                    success: false,
                    message: 'Referencia inválida a recurso relacionado',
                    code: 'INVALID_REFERENCE'
                });
            
            case '23502': // Violación de NOT NULL
                return res.status(400).json({
                    success: false,
                    message: 'Campo requerido faltante',
                    code: 'MISSING_REQUIRED_FIELD'
                });
            
            case '22001': // Datos demasiado largos
                return res.status(400).json({
                    success: false,
                    message: 'Datos exceden el tamaño máximo permitido',
                    code: 'DATA_TOO_LONG'
                });
            
            case '08006': // Error de conexión
                return res.status(503).json({
                    success: false,
                    message: 'Servicio temporalmente no disponible',
                    code: 'SERVICE_UNAVAILABLE'
                });
        }
    }

    // Error de sintaxis en JSON
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            success: false,
            message: 'JSON malformado en el cuerpo de la solicitud',
            code: 'INVALID_JSON'
        });
    }

    // Error de límite de tamaño de payload
    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            success: false,
            message: 'Payload demasiado grande',
            code: 'PAYLOAD_TOO_LARGE'
        });
    }

    // Errores de rate limiting
    if (err.status === 429) {
        return res.status(429).json({
            success: false,
            message: 'Demasiadas solicitudes, intenta de nuevo más tarde',
            code: 'RATE_LIMIT_EXCEEDED'
        });
    }

    // Error de timeout
    if (err.code === 'ETIMEDOUT') {
        return res.status(504).json({
            success: false,
            message: 'Timeout de la solicitud',
            code: 'REQUEST_TIMEOUT'
        });
    }

    // Errores de validación de express-validator
    if (err.errors && Array.isArray(err.errors)) {
        return res.status(400).json({
            success: false,
            message: 'Errores de validación',
            errors: err.errors,
            code: 'VALIDATION_ERROR'
        });
    }

    // Error por defecto (500)
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(err.status || 500).json({
        success: false,
        message: isDevelopment ? err.message : 'Error interno del servidor',
        code: 'INTERNAL_SERVER_ERROR',
        ...(isDevelopment && {
            stack: err.stack,
            details: err
        })
    });
};

module.exports = errorHandler;