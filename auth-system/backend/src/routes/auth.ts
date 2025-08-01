// auth-system/backend/src/routes/auth.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';

const authService = new AuthService();

// Esquemas de validación
const loginSchema = z.object({
  username: z.string().min(3, 'Username debe tener al menos 3 caracteres'),
  password: z.string().min(6, 'Password debe tener al menos 6 caracteres')
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token es requerido')
});

export default async function authRoutes(fastify: FastifyInstance) {
  
  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);
      
      const result = await authService.login(
        body.username, 
        body.password,
        {
          userAgent: request.headers['user-agent'],
          ipAddress: request.ip
        }
      );
      
      reply.code(200);
      return {
        message: 'Login exitoso',
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          permissions: result.user.permissions
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '15m'
      };
      
    } catch (error: any) {
      if (error.name === 'ZodError') {
        reply.code(400);
        return {
          error: 'Datos de entrada inválidos',
          details: error.errors
        };
      }
      
      reply.code(401);
      return {
        error: error.message || 'Error en el login'
      };
    }
  });

  // POST /api/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    try {
      const body = refreshSchema.parse(request.body);
      
      const result = await authService.refreshToken(body.refreshToken);
      
      reply.code(200);
      return {
        message: 'Token renovado exitosamente',
        accessToken: result.accessToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '15m'
      };
      
    } catch (error: any) {
      if (error.name === 'ZodError') {
        reply.code(400);
        return {
          error: 'Datos de entrada inválidos',
          details: error.errors
        };
      }
      
      reply.code(401);
      return {
        error: error.message || 'Error al renovar token'
      };
    }
  });

  // POST /api/auth/logout
  fastify.post('/logout', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const refreshToken = (request.body as any)?.refreshToken;
      
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
      
      reply.code(200);
      return {
        message: 'Logout exitoso'
      };
      
    } catch (error: any) {
      reply.code(500);
      return {
        error: error.message || 'Error en el logout'
      };
    }
  });

  // POST /api/auth/logout-all
  fastify.post('/logout-all', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      if (!request.user) {
        reply.code(401);
        return { error: 'Usuario no autenticado' };
      }
      
      await authService.logoutAllDevices(request.user.id);
      
      reply.code(200);
      return {
        message: 'Sesiones cerradas en todos los dispositivos'
      };
      
    } catch (error: any) {
      reply.code(500);
      return {
        error: error.message || 'Error al cerrar sesiones'
      };
    }
  });

  // GET /api/auth/me
  fastify.get('/me', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      if (!request.user) {
        reply.code(401);
        return { error: 'Usuario no autenticado' };
      }

      const userDetails = await authService.getUserDetails(request.user.id);
      
      reply.code(200);
      return {
        user: userDetails
      };
      
    } catch (error: any) {
      reply.code(500);
      return {
        error: error.message || 'Error al obtener información del usuario'
      };
    }
  });

  // GET /api/auth/sessions
  fastify.get('/sessions', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      if (!request.user) {
        reply.code(401);
        return { error: 'Usuario no autenticado' };
      }

      const sessions = await authService.getUserSessions(request.user.id);
      
      reply.code(200);
      return {
        sessions
      };
      
    } catch (error: any) {
      reply.code(500);
      return {
        error: error.message || 'Error al obtener sesiones'
      };
    }
  });
}