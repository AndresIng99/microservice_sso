import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UsersService } from '../services/users.service';
import { requirePermission, requireOwnership } from '../middleware/auth';

const usersService = new UsersService();

// Esquemas de validación
const createUserSchema = z.object({
  username: z.string().min(3, 'Username debe tener al menos 3 caracteres').max(50),
  email: z.string().email('Email inválido').max(100),
  password: z.string().min(8, 'Password debe tener al menos 8 caracteres'),
  firstName: z.string().min(1, 'Nombre es requerido').max(100),
  lastName: z.string().min(1, 'Apellido es requerido').max(100),
  cedula: z.string().optional(),
  telefono: z.string().optional(),
  roleIds: z.array(z.number()).optional().default([])
});

const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().max(100).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  cedula: z.string().optional(),
  telefono: z.string().optional(),
  isActive: z.boolean().optional(),
  roleIds: z.array(z.number()).optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual es requerida'),
  newPassword: z.string().min(8, 'Nueva contraseña debe tener al menos 8 caracteres')
});

const querySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  roleId: z.coerce.number().optional(),
  sortBy: z.enum(['id', 'username', 'email', 'firstName', 'lastName', 'createdAt']).optional().default('id'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc')
});

export default async function userRoutes(fastify: FastifyInstance) {

  // GET /api/users - Listar usuarios
  fastify.get('/', {
    preHandler: [fastify.authenticate, requirePermission('users.read')]
  }, async (request, reply) => {
    try {
      const query = querySchema.parse(request.query);
      
      const result = await usersService.getUsers(query);
      
      reply.code(200);
      return result;
      
    } catch (error: any) {
      if (error.name === 'ZodError') {
        reply.code(400);
        return {
          error: 'Parámetros de consulta inválidos',
          details: error.errors
        };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al obtener usuarios'
      };
    }
  });

  // GET /api/users/:id - Obtener usuario por ID
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, requirePermission('users.read')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      
      if (isNaN(userId)) {
        reply.code(400);
        return { error: 'ID de usuario inválido' };
      }
      
      const user = await usersService.getUserById(userId);
      
      if (!user) {
        reply.code(404);
        return { error: 'Usuario no encontrado' };
      }
      
      reply.code(200);
      return { user };
      
    } catch (error: any) {
      reply.code(500);
      return {
        error: error.message || 'Error al obtener usuario'
      };
    }
  });

  // POST /api/users - Crear usuario
  fastify.post('/', {
    preHandler: [fastify.authenticate, requirePermission('users.create')]
  }, async (request, reply) => {
    try {
      const body = createUserSchema.parse(request.body);
      
      const newUser = await usersService.createUser(body, request.user!.id);
      
      reply.code(201);
      return {
        message: 'Usuario creado exitosamente',
        user: newUser
      };
      
    } catch (error: any) {
      if (error.name === 'ZodError') {
        reply.code(400);
        return {
          error: 'Datos de entrada inválidos',
          details: error.errors
        };
      }
      
      if (error.message.includes('ya existe')) {
        reply.code(409);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al crear usuario'
      };
    }
  });

  // PUT /api/users/:id - Actualizar usuario
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, requirePermission('users.update')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      
      if (isNaN(userId)) {
        reply.code(400);
        return { error: 'ID de usuario inválido' };
      }
      
      const body = updateUserSchema.parse(request.body);
      
      const updatedUser = await usersService.updateUser(userId, body, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Usuario actualizado exitosamente',
        user: updatedUser
      };
      
    } catch (error: any) {
      if (error.name === 'ZodError') {
        reply.code(400);
        return {
          error: 'Datos de entrada inválidos',
          details: error.errors
        };
      }
      
      if (error.message.includes('no encontrado')) {
        reply.code(404);
        return { error: error.message };
      }
      
      if (error.message.includes('ya existe')) {
        reply.code(409);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al actualizar usuario'
      };
    }
  });

  // DELETE /api/users/:id - Eliminar usuario (soft delete)
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, requirePermission('users.delete')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      
      if (isNaN(userId)) {
        reply.code(400);
        return { error: 'ID de usuario inválido' };
      }
      
      // No permitir que el usuario se elimine a sí mismo
      if (userId === request.user!.id) {
        reply.code(400);
        return { error: 'No puede eliminarse a sí mismo' };
      }
      
      await usersService.deleteUser(userId, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Usuario eliminado exitosamente'
      };
      
    } catch (error: any) {
      if (error.message.includes('no encontrado')) {
        reply.code(404);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al eliminar usuario'
      };
    }
  });

  // PUT /api/users/:id/activate - Activar usuario
  fastify.put('/:id/activate', {
    preHandler: [fastify.authenticate, requirePermission('users.update')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      
      if (isNaN(userId)) {
        reply.code(400);
        return { error: 'ID de usuario inválido' };
      }
      
      await usersService.activateUser(userId, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Usuario activado exitosamente'
      };
      
    } catch (error: any) {
      if (error.message.includes('no encontrado')) {
        reply.code(404);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al activar usuario'
      };
    }
  });

  // PUT /api/users/:id/deactivate - Desactivar usuario
  fastify.put('/:id/deactivate', {
    preHandler: [fastify.authenticate, requirePermission('users.update')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      
      if (isNaN(userId)) {
        reply.code(400);
        return { error: 'ID de usuario inválido' };
      }
      
      // No permitir desactivar al propio usuario
      if (userId === request.user!.id) {
        reply.code(400);
        return { error: 'No puede desactivarse a sí mismo' };
      }
      
      await usersService.deactivateUser(userId, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Usuario desactivado exitosamente'
      };
      
    } catch (error: any) {
      if (error.message.includes('no encontrado')) {
        reply.code(404);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al desactivar usuario'
      };
    }
  });

  // PUT /api/users/:id/password - Cambiar contraseña
  fastify.put('/:id/password', {
    preHandler: [
      fastify.authenticate,
      requireOwnership((request) => parseInt((request.params as any).id))
    ]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      
      if (isNaN(userId)) {
        reply.code(400);
        return { error: 'ID de usuario inválido' };
      }
      
      const body = changePasswordSchema.parse(request.body);
      
      await usersService.changePassword(userId, body.currentPassword, body.newPassword);
      
      reply.code(200);
      return {
        message: 'Contraseña cambiada exitosamente'
      };
      
    } catch (error: any) {
      if (error.name === 'ZodError') {
        reply.code(400);
        return {
          error: 'Datos de entrada inválidos',
          details: error.errors
        };
      }
      
      if (error.message.includes('contraseña actual incorrecta')) {
        reply.code(400);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al cambiar contraseña'
      };
    }
  });

  // GET /api/users/:id/roles - Obtener roles del usuario
  fastify.get('/:id/roles', {
    preHandler: [fastify.authenticate, requirePermission('users.read')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      
      if (isNaN(userId)) {
        reply.code(400);
        return { error: 'ID de usuario inválido' };
      }
      
      const roles = await usersService.getUserRoles(userId);
      
      reply.code(200);
      return { roles };
      
    } catch (error: any) {
      reply.code(500);
      return {
        error: error.message || 'Error al obtener roles del usuario'
      };
    }
  });

  // PUT /api/users/:id/roles - Asignar roles al usuario
  fastify.put('/:id/roles', {
    preHandler: [fastify.authenticate, requirePermission('users.update')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      
      if (isNaN(userId)) {
        reply.code(400);
        return { error: 'ID de usuario inválido' };
      }
      
      const { roleIds } = z.object({
        roleIds: z.array(z.number())
      }).parse(request.body);
      
      await usersService.assignRoles(userId, roleIds, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Roles asignados exitosamente'
      };
      
    } catch (error: any) {
      if (error.name === 'ZodError') {
        reply.code(400);
        return {
          error: 'Datos de entrada inválidos',
          details: error.errors
        };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al asignar roles'
      };
    }
  });
}