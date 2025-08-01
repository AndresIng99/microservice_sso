import 'dotenv/config';
import { createApp } from './app';
import { logger } from './utils/logger';
import { prisma } from './utils/database';

const start = async () => {
  try {
    // Verificar conexión a la base de datos
    await prisma.$connect();
    logger.info('✅ Conexión a base de datos establecida');
    
    // Crear aplicación Fastify
    const app = await createApp();
    
    // Puerto del servidor
    const PORT = parseInt(process.env.PORT || '3000');
    const HOST = process.env.HOST || '0.0.0.0';
    
    // Iniciar servidor
    await app.listen({ port: PORT, host: HOST });
    
    logger.info(`🚀 Servidor iniciado en http://${HOST}:${PORT}`);
    logger.info('📚 API disponible en http://localhost/api');
    
  } catch (error) {
    logger.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

// Manejo de señales para cierre graceful
process.on('SIGTERM', async () => {
  logger.info('🔄 Recibida señal SIGTERM, cerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('🔄 Recibida señal SIGINT, cerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});

// Iniciar servidor
start();