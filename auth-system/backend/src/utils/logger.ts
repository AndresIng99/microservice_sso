// Sistema de logging simple y efectivo
interface LogLevel {
  ERROR: 0;
  WARN: 1;
  INFO: 2;
  DEBUG: 3;
}

const LOG_LEVELS: LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  private currentLevel: number;

  constructor() {
    const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
    switch (level) {
      case 'error':
        this.currentLevel = LOG_LEVELS.ERROR;
        break;
      case 'warn':
        this.currentLevel = LOG_LEVELS.WARN;
        break;
      case 'info':
        this.currentLevel = LOG_LEVELS.INFO;
        break;
      case 'debug':
        this.currentLevel = LOG_LEVELS.DEBUG;
        break;
      default:
        this.currentLevel = LOG_LEVELS.INFO;
    }
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ') : '';
    
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${formattedArgs}`;
  }

  private log(level: number, levelName: string, message: string, ...args: any[]): void {
    if (level <= this.currentLevel) {
      const formattedMessage = this.formatMessage(levelName, message, ...args);
      
      // En desarrollo, usar colores
      if (process.env.NODE_ENV === 'development') {
        switch (levelName) {
          case 'error':
            console.error('\x1b[31m%s\x1b[0m', formattedMessage); // Rojo
            break;
          case 'warn':
            console.warn('\x1b[33m%s\x1b[0m', formattedMessage); // Amarillo
            break;
          case 'info':
            console.info('\x1b[36m%s\x1b[0m', formattedMessage); // Cyan
            break;
          case 'debug':
            console.debug('\x1b[35m%s\x1b[0m', formattedMessage); // Magenta
            break;
          default:
            console.log(formattedMessage);
        }
      } else {
        // En producción, log sin colores
        if (levelName === 'error') {
          console.error(formattedMessage);
        } else {
          console.log(formattedMessage);
        }
      }
    }
  }

  error(message: string, ...args: any[]): void {
    this.log(LOG_LEVELS.ERROR, 'error', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LOG_LEVELS.WARN, 'warn', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LOG_LEVELS.INFO, 'info', message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.log(LOG_LEVELS.DEBUG, 'debug', message, ...args);
  }

  // Método especial para logging de requests HTTP
  request(method: string, url: string, statusCode: number, responseTime: number): void {
    const message = `${method} ${url} ${statusCode} - ${responseTime}ms`;
    if (statusCode >= 400) {
      this.error(message);
    } else {
      this.info(message);
    }
  }

  // Método para logging de errores con stack trace
  errorWithStack(message: string, error: Error): void {
    this.error(message, {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
  }

  // Método para logging de métricas
  metric(name: string, value: number | string, unit?: string): void {
    const metricMessage = `METRIC: ${name}=${value}${unit ? unit : ''}`;
    this.info(metricMessage);
  }

  // Método para logging de eventos de auditoría
  audit(userId: number | string, action: string, resource: string, details?: any): void {
    const auditMessage = `AUDIT: User ${userId} performed ${action} on ${resource}`;
    this.info(auditMessage, details);
  }
}

// Crear instancia única del logger
export const logger = new Logger();

// Función helper para crear loggers con contexto
export function createContextLogger(context: string) {
  return {
    error: (message: string, ...args: any[]) => logger.error(`[${context}] ${message}`, ...args),
    warn: (message: string, ...args: any[]) => logger.warn(`[${context}] ${message}`, ...args),
    info: (message: string, ...args: any[]) => logger.info(`[${context}] ${message}`, ...args),
    debug: (message: string, ...args: any[]) => logger.debug(`[${context}] ${message}`, ...args),
  };
}