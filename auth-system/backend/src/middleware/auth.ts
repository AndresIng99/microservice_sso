// auth-system/backend/src/middleware/auth.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../utils/jwt';
import { RolesService } from '../services/roles.service';

const rolesService = new RolesService();

// Extender tipos de Fastify
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: number;
      username: string;
      email: string;
      permissions: string[];
    };
  }
}

// Middleware de autenticación
export async function authenticateToken(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      reply.code(401);
      return reply.send({ error: 'Token de acceso requerido' });
    }

    const decoded = verifyToken(token);
    if (decoded.type !== 'access') {
      reply.code(401);
      return reply.send({ error: 'Tipo de token inválido' });
    }

    request.user = decoded.user;
  } catch (error) {
    reply.code(401);
    return reply.send({ error: 'Token inválido o expirado' });
  }
}

// Middleware para verificar permisos específicos
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.code(401);
      return reply.send({ error: 'Usuario no autenticado' });
    }

    const userPermissions = request.user.permissions || [];
    
    // Super admin tiene todos los permisos
    if (userPermissions.includes('*')) {
      return;
    }

    // Verificar permiso específico
    if (!userPermissions.includes(permission)) {
      reply.code(403);
      return reply.send({ 
        error: 'No tiene permisos suficientes',
        required: permission 
      });
    }
  };
}

// Middleware para verificar múltiples permisos (OR)
export function requireAnyPermission(permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.code(401);
      return reply.send({ error: 'Usuario no autenticado' });
    }

    const userPermissions = request.user.permissions || [];
    
    // Super admin tiene todos los permisos
    if (userPermissions.includes('*')) {
      return;
    }

    // Verificar si tiene al menos uno de los permisos
    const hasPermission = permissions.some(permission => 
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      reply.code(403);
      return reply.send({ 
        error: 'No tiene permisos suficientes',
        required: permissions 
      });
    }
  };
}

// Middleware para verificar ownership (el usuario solo puede acceder a sus propios datos)
export function requireOwnership(getUserId: (request: FastifyRequest) => number) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.code(401);
      return reply.send({ error: 'Usuario no autenticado' });
    }

    const targetUserId = getUserId(request);
    const currentUserId = request.user.id;

    // Super admin puede acceder a todo
    if (request.user.permissions?.includes('*')) {
      return;
    }

    // El usuario solo puede acceder a sus propios datos
    if (currentUserId !== targetUserId) {
      reply.code(403);
      return reply.send({ 
        error: 'Solo puede acceder a sus propios datos' 
      });
    }
  };
}