const morgan = require('morgan');
const logger = require('../utils/logger');

// Crear formato personalizado de Morgan
morgan.token('user-id', (req) => {
    return req.user ? req.user.id : 'anonymous';
});

morgan.token('user-email', (req) => {
    return req.user ? req.user.email : 'N/A';
});

morgan.token('real-ip', (req) => {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.ip;
});

morgan.token('response-time-ms', (req, res) => {
    if (!req._startTime) return '-';
    const diff = process.hrtime(req._startTime);
    return Math.round(diff[0] * 1000 + diff[1] * 1e-6);
});

// Formato para logs de desarrollo
const devFormat = ':method :url :status :response-time ms - :res[content-length] - User: :user-email (:user-id)';

// Formato para logs de producción (más detallado)
const prodFormat = JSON.stringify({
    method: ':method',
    url: ':url',
    status: ':status',
    contentLength: ':res[content-length]',
    responseTime: ':response-time-ms ms',
    userAgent: ':user-agent',
    ip: ':real-ip',
    userId: ':user-id',
    userEmail: ':user-email',
    referrer: ':referrer',
    timestamp: ':date[iso]'
});

// Función para determinar el nivel de log basado en el código de estado
const getLogLevel = (status) => {
    if (status >= 500) return 'error';
    if (status >= 400) return 'warn';
    if (status >= 300) return 'info';
    return 'info';
};

// Stream personalizado que usa nuestro logger
const loggerStream = {
    write: (message) => {
        const logData = message.trim();
        
        try {
            // En producción, el mensaje es JSON
            if (process.env.NODE_ENV === 'production') {
                const parsed = JSON.parse(logData);
                const level = getLogLevel(parseInt(parsed.status));
                
                logger[level]('HTTP Request', {
                    method: parsed.method,
                    url: parsed.url,
                    status: parseInt(parsed.status),
                    responseTime: parsed.responseTime,
                    contentLength: parsed.contentLength,
                    ip: parsed.ip,
                    userId: parsed.userId !== 'anonymous' ? parsed.userId : undefined,
                    userEmail: parsed.userEmail !== 'N/A' ? parsed.userEmail : undefined,
                    userAgent: parsed.userAgent,
                    referrer: parsed.referrer,
                    category: 'http'
                });
            } else {
                // En desarrollo, usar el mensaje tal como está
                logger.info(logData, { category: 'http' });
            }
        } catch (error) {
            // Si hay error parseando, usar como texto plano
            logger.info(logData, { category: 'http' });
        }
    }
};

// Configurar Morgan
const requestLogger = morgan(
    process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
    {
        stream: loggerStream,
        // No loggear assets estáticos en desarrollo
        skip: (req, res) => {
            if (process.env.NODE_ENV === 'development') {
                return req.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/);
            }
            return false;
        }
    }
);

// Middleware adicional para capturar tiempo de inicio
const addStartTime = (req, res, next) => {
    req._startTime = process.hrtime();
    next();
};

// Middleware para loggear requests específicos con más detalle
const detailedLogger = (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
        // Solo loggear APIs críticas
        const criticalPaths = ['/api/auth/', '/api/admin/', '/api/users/', '/api/roles/'];
        const isCritical = criticalPaths.some(path => req.path.startsWith(path));
        
        if (isCritical) {
            const responseTime = req._startTime ? 
                Math.round((process.hrtime(req._startTime)[0] * 1000) + (process.hrtime(req._startTime)[1] * 1e-6)) : 
                0;
            
            const logData = {
                method: req.method,
                path: req.path,
                query: Object.keys(req.query).length > 0 ? req.query : undefined,
                status: res.statusCode,
                responseTime: `${responseTime}ms`,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                userId: req.user?.id,
                email: req.user?.email,
                contentLength: res.get('Content-Length'),
                category: 'api_detailed'
            };
            
            // Log body para métodos de modificación (excepto passwords)
            if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
                const sanitizedBody = { ...req.body };
                // Remover campos sensibles
                delete sanitizedBody.password;
                delete sanitizedBody.currentPassword;
                delete sanitizedBody.newPassword;
                delete sanitizedBody.confirmPassword;
                
                if (Object.keys(sanitizedBody).length > 0) {
                    logData.requestBody = sanitizedBody;
                }
            }
            
            const level = res.statusCode >= 400 ? 'warn' : 'info';
            logger[level]('Detailed API Request', logData);
        }
        
        originalSend.call(this, data);
    };
    
    next();
};

// Middleware para loggear errores de request
const errorLogger = (err, req, res, next) => {
    if (err) {
        logger.error('Request Error', {
            error: err.message,
            method: req.method,
            url: req.url,
            ip: req.ip,
            userId: req.user?.id,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
            category: 'request_error'
        });
    }
    next(err);
};

// Middleware para loggear requests de archivos estáticos (opcional)
const staticLogger = (req, res, next) => {
    const isStatic = req.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/);
    
    if (isStatic && res.statusCode === 404) {
        logger.warn('Static file not found', {
            url: req.url,
            method: req.method,
            ip: req.ip,
            referrer: req.get('Referrer'),
            category: 'static'
        });
    }
    
    next();
};

// Middleware de seguridad para loggear intentos sospechosos
const securityLogger = (req, res, next) => {
    const suspiciousPatterns = [
        /\.\./,  // Path traversal
        /\/admin\//i,  // Admin access attempts
        /\/api\/.*\/\d+\/delete/i,  // Delete attempts
        /script.*>/i,  // XSS attempts
        /union.*select/i,  // SQL injection
        /\<script/i,  // Script tags
        /javascript:/i  // Javascript URLs
    ];
    
    const isSuspicious = suspiciousPatterns.some(pattern => 
        pattern.test(req.url) || 
        pattern.test(JSON.stringify(req.body || {})) ||
        pattern.test(JSON.stringify(req.query || {}))
    );
    
    if (isSuspicious) {
        logger.security('Suspicious request detected', {
            method: req.method,
            url: req.url,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            body: req.body,
            query: req.query,
            userId: req.user?.id,
            category: 'security_alert'
        });
    }
    
    next();
};

module.exports = {
    requestLogger,
    addStartTime,
    detailedLogger,
    errorLogger,
    staticLogger,
    securityLogger
};