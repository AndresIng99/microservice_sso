import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

// Routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import roleRoutes from './routes/roles';
import microserviceRoutes from './routes/microservices';
import dashboardRoutes from './routes/dashboard';

// Middleware
import { authenticateToken } from './middleware/auth';

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    }
  });

  // Registrar CORS
  await app.register(cors, {
    origin: [
      'http://localhost',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:80',
      process.env.FRONTEND_URL || 'http://localhost'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  });

  // Registrar JWT
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'change-this-super-secret-key-in-production'
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: function (request, context) {
      return {
        code: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
        date: new Date().toISOString()
      };
    }
  });

  // Health check básico
  app.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0'
    };
  });

  // Registrar middleware de autenticación
  app.decorate('authenticate', authenticateToken);

  // Registrar rutas
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(roleRoutes, { prefix: '/api/roles' });
  await app.register(microserviceRoutes, { prefix: '/api/microservices' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });

  // Ruta de información de la API
  app.get('/api', async (request, reply) => {
    return {
      name: 'Sistema de Autenticación Centralizado',
      version: '1.0.0',
      description: 'API para autenticación centralizada de microservicios',
      endpoints: {
        auth: '/api/auth',
        users: '/api/users',
        roles: '/api/roles',
        microservices: '/api/microservices',
        dashboard: '/api/dashboard',
        health: '/health'
      }
    };
  });

  // Endpoint especial para validación de tokens (usado por nginx)
  app.get('/api/auth/validate', async (request, reply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        reply.code(401);
        return { error: 'Token no proporcionado' };
      }

      const decoded = app.jwt.verify(token) as any;
      const user = decoded.user;
      
      // Headers para nginx
      reply.header('X-User-ID', user.id.toString());
      reply.header('X-User-Username', user.username);
      reply.header('X-User-Email', user.email);
      reply.header('X-User-Permissions', JSON.stringify(user.permissions || []));
      
      return {
        valid: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          permissions: user.permissions || []
        }
      };
    } catch (error) {
      reply.code(401);
      return { error: 'Token inválido o expirado' };
    }
  });

  // Manejo de errores global
  app.setErrorHandler(async (error, request, reply) => {
    console.error('Error en la aplicación:', error);
    
    // Error de validación de JWT
    if (error.code === 'FST_JWT_BAD_REQUEST') {
      reply.code(401);
      return { error: 'Token inválido' };
    }
    
    // Error de rate limiting
    if (error.statusCode === 429) {
      reply.code(429);
      return {
        error: 'Demasiadas peticiones',
        message: 'Rate limit excedido, intenta nuevamente en unos minutos'
      };
    }
    
    // Errores de validación
    if (error.validation) {
      reply.code(400);
      return {
        error: 'Datos de entrada inválidos',
        details: error.validation
      };
    }
    
    // Error genérico del servidor
    reply.code(error.statusCode || 500);
    return {
      error: error.message || 'Error interno del servidor',
      timestamp: new Date().toISOString()
    };
  });

  // Handler para rutas no encontradas
  app.setNotFoundHandler(async (request, reply) => {
    reply.code(404);
    return {
      error: 'Ruta no encontrada',
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString()
    };
  });

  console.log('✅ Aplicación Fastify configurada correctamente');
  
  return app;
}