const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Colores personalizados para los niveles
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'cyan',
    debug: 'green'
};

winston.addColors(colors);

// Formato personalizado para logs
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.prettyPrint()
);

// Formato para consola (más legible)
const consoleFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        
        // Agregar metadata si existe
        if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
        }
        
        return msg;
    })
);

// Configuración del logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: {
        service: 'sso-microservice',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    },
    transports: [
        // Log de errores (rotativo diario)
        new DailyRotateFile({
            filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxSize: '20m',
            maxFiles: '14d',
            zippedArchive: true,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            )
        }),

        // Log combinado (todo) - rotativo diario
        new DailyRotateFile({
            filename: path.join(__dirname, '../../logs/combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '30d',
            zippedArchive: true,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        }),

        // Log de auditoría para acciones críticas
        new DailyRotateFile({
            filename: path.join(__dirname, '../../logs/audit-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'info',
            maxSize: '20m',
            maxFiles: '90d', // Mantener logs de auditoría por más tiempo
            zippedArchive: true,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
                winston.format.printf(({ timestamp, level, message, ...metadata }) => {
                    // Solo loggear en audit si tiene metadata de auditoría
                    if (metadata.audit || metadata.action || metadata.userId) {
                        return JSON.stringify({
                            timestamp,
                            level,
                            message,
                            ...metadata
                        });
                    }
                    return false; // No loggear en audit
                })
            )
        })
    ],

    // Manejo de excepciones no capturadas
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/exceptions.log')
        })
    ],

    // Manejo de rechazos de promesas no capturados
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/rejections.log')
        })
    ]
});

// En desarrollo, también loggear en consola
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
        level: 'debug'
    }));
}

// Métodos de utilidad específicos para SSO
logger.auth = (message, metadata = {}) => {
    logger.info(message, {
        ...metadata,
        category: 'authentication',
        audit: true
    });
};

logger.security = (message, metadata = {}) => {
    logger.warn(message, {
        ...metadata,
        category: 'security',
        audit: true
    });
};

logger.audit = (action, userId, details = {}) => {
    logger.info(`Audit: ${action}`, {
        action,
        userId,
        ...details,
        audit: true,
        timestamp: new Date().toISOString()
    });
};

logger.performance = (operation, duration, metadata = {}) => {
    const level = duration > 1000 ? 'warn' : 'info';
    logger[level](`Performance: ${operation} took ${duration}ms`, {
        operation,
        duration,
        ...metadata,
        category: 'performance'
    });
};

logger.api = (method, url, statusCode, duration, metadata = {}) => {
    const level = statusCode >= 400 ? 'warn' : 'info';
    logger[level](`API: ${method} ${url} - ${statusCode} (${duration}ms)`, {
        method,
        url,
        statusCode,
        duration,
        ...metadata,
        category: 'api'
    });
};

logger.database = (query, duration, metadata = {}) => {
    const level = duration > 100 ? 'warn' : 'debug';
    logger[level](`DB Query took ${duration}ms`, {
        query: query.substring(0, 100),
        duration,
        ...metadata,
        category: 'database'
    });
};

logger.service = (serviceName, action, metadata = {}) => {
    logger.info(`Service: ${serviceName} - ${action}`, {
        serviceName,
        action,
        ...metadata,
        category: 'service'
    });
};

// Método para crear un logger hijo con contexto específico
logger.child = (context) => {
    return logger.child(context);
};

// Método para cambiar el nivel de log dinámicamente
logger.setLevel = (level) => {
    logger.level = level;
    logger.info(`Log level changed to: ${level}`);
};

// Método para obtener estadísticas de logs
logger.getStats = () => {
    const transports = logger.transports;
    return {
        level: logger.level,
        transports: transports.length,
        environment: process.env.NODE_ENV || 'development'
    };
};

// Stream para Morgan (HTTP request logging)
logger.stream = {
    write: (message) => {
        // Parsear el mensaje de Morgan y extraer información
        const logData = message.trim();
        
        // Determinar nivel basado en el código de estado
        let level = 'info';
        if (logData.includes(' 4')) level = 'warn';
        else if (logData.includes(' 5')) level = 'error';
        
        logger[level](logData, { category: 'http' });
    }
};

// Limpiar logs antiguos al iniciar (opcional)
logger.cleanup = async () => {
    try {
        const fs = require('fs').promises;
        const logsDir = path.join(__dirname, '../../logs');
        
        // Crear directorio de logs si no existe
        try {
            await fs.access(logsDir);
        } catch {
            await fs.mkdir(logsDir, { recursive: true });
            logger.info('📁 Directorio de logs creado');
        }
        
        logger.info('🧹 Logger inicializado correctamente');
    } catch (error) {
        console.error('Error inicializando logger:', error);
    }
};

// Método para flush logs (útil antes de cerrar la aplicación)
logger.flush = () => {
    return new Promise((resolve) => {
        // Winston no tiene un método flush directo, pero podemos usar end
        const transports = logger.transports;
        let pending = transports.length;
        
        if (pending === 0) {
            resolve();
            return;
        }
        
        transports.forEach(transport => {
            if (transport.close) {
                transport.close(() => {
                    pending--;
                    if (pending === 0) resolve();
                });
            } else {
                pending--;
                if (pending === 0) resolve();
            }
        });
        
        // Timeout de seguridad
        setTimeout(resolve, 1000);
    });
};

// Middleware para capturar logs de request específicos
logger.middleware = () => {
    return (req, res, next) => {
        const start = Date.now();
        
        // Capturar el end original
        const originalEnd = res.end;
        
        res.end = function(...args) {
            const duration = Date.now() - start;
            
            // Log de la request
            logger.api(
                req.method,
                req.originalUrl,
                res.statusCode,
                duration,
                {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    userId: req.user?.id,
                    contentLength: res.get('Content-Length')
                }
            );
            
            // Llamar al end original
            originalEnd.apply(this, args);
        };
        
        next();
    };
};

// Inicializar logger
logger.cleanup();

module.exports = logger;