import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// Configuración del cliente Prisma
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
  errorFormat: 'colorless'
});

// Middleware para logging de queries en desarrollo
if (process.env.NODE_ENV === 'development') {
  prisma.$use(async (params, next) => {
    const before = Date.now();
    const result = await next(params);
    const after = Date.now();
    
    logger.debug(`Query ${params.model}.${params.action} took ${after - before}ms`);
    return result;
  });
}

// Función para verificar la conexión a la base de datos
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ Conexión a la base de datos verificada');
    return true;
  } catch (error) {
    logger.error('❌ Error al conectar con la base de datos:', error);
    return false;
  }
}

// Función para ejecutar migraciones pendientes
export async function runPendingMigrations(): Promise<void> {
  try {
    // En producción, las migraciones se ejecutan en el Dockerfile
    if (process.env.NODE_ENV !== 'production') {
      logger.info('ℹ️ Migraciones se ejecutan automáticamente en desarrollo');
    }
  } catch (error) {
    logger.error('❌ Error al ejecutar migraciones:', error);
    throw error;
  }
}

// Función para limpiar conexiones al cerrar la aplicación
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('✅ Desconectado de la base de datos');
  } catch (error) {
    logger.error('❌ Error al desconectar de la base de datos:', error);
  }
}

// Función helper para transacciones
export async function executeTransaction<T>(
  callback: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return await prisma.$transaction(callback, {
    maxWait: 5000, // Tiempo máximo de espera: 5 segundos
    timeout: 10000, // Timeout de la transacción: 10 segundos
  });
}

// Función helper para manejo seguro de errores de Prisma
export function handlePrismaError(error: any): {
  statusCode: number;
  message: string;
  code?: string;
} {
  // Error de registro duplicado
  if (error.code === 'P2002') {
    const field = error.meta?.target?.[0] || 'campo';
    return {
      statusCode: 409,
      message: `Ya existe un registro con ese ${field}`,
      code: 'DUPLICATE_ENTRY'
    };
  }
  
  // Error de registro no encontrado
  if (error.code === 'P2025') {
    return {
      statusCode: 404,
      message: 'Registro no encontrado',
      code: 'NOT_FOUND'
    };
  }
  
  // Error de referencia externa
  if (error.code === 'P2003') {
    return {
      statusCode: 400,
      message: 'Error de referencia: el registro está siendo usado por otros datos',
      code: 'FOREIGN_KEY_CONSTRAINT'
    };
  }
  
  // Error de conexión a la base de datos
  if (error.code === 'P1001') {
    return {
      statusCode: 503,
      message: 'No se puede conectar a la base de datos',
      code: 'DATABASE_CONNECTION_ERROR'
    };
  }
  
  // Error genérico
  return {
    statusCode: 500,
    message: error.message || 'Error interno de la base de datos',
    code: 'DATABASE_ERROR'
  };
}

export { prisma };