import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RolesService } from '../services/roles.service';
import { requirePermission } from '../middleware/auth';

const rolesService = new RolesService();

// Esquemas de validación
const createRoleSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(50),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([])
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional()
});

const querySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  sortBy: z.enum(['id', 'name', 'createdAt']).optional().default('id'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc')
});

export default async function roleRoutes(fastify: FastifyInstance) {

  // GET /api/roles - Listar roles
  fastify.get('/', {
    preHandler: [fastify.authenticate, requirePermission('roles.read')]
  }, async (request, reply) => {
    try {
      const query = querySchema.parse(request.query);
      
      const result = await rolesService.getRoles(query);
      
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
        error: error.message || 'Error al obtener roles'
      };
    }
  });

  // GET /api/roles/permissions - Listar todos los permisos disponibles
  fastify.get('/permissions', {
    preHandler: [fastify.authenticate, requirePermission('roles.read')]
  }, async (request, reply) => {
    try {
      const permissions = await rolesService.getAvailablePermissions();
      
      reply.code(200);
      return { permissions };
      
    } catch (error: any) {
      reply.code(500);
      return {
        error: error.message || 'Error al obtener permisos'
      };
    }
  });

  // GET /api/roles/:id - Obtener rol por ID
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, requirePermission('roles.read')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const roleId = parseInt(id);
      
      if (isNaN(roleId)) {
        reply.code(400);
        return { error: 'ID de rol inválido' };
      }
      
      const role = await rolesService.getRoleById(roleId);
      
      if (!role) {
        reply.code(404);
        return { error: 'Rol no encontrado' };
      }
      
      reply.code(200);
      return { role };
      
    } catch (error: any) {
      reply.code(500);
      return {
        error: error.message || 'Error al obtener rol'
      };
    }
  });

  // POST /api/roles - Crear rol
  fastify.post('/', {
    preHandler: [fastify.authenticate, requirePermission('roles.create')]
  }, async (request, reply) => {
    try {
      const body = createRoleSchema.parse(request.body);
      
      const newRole = await rolesService.createRole(body, request.user!.id);
      
      reply.code(201);
      return {
        message: 'Rol creado exitosamente',
        role: newRole
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
        error: error.message || 'Error al crear rol'
      };
    }
  });

  // PUT /api/roles/:id - Actualizar rol
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, requirePermission('roles.update')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const roleId = parseInt(id);
      
      if (isNaN(roleId)) {
        reply.code(400);
        return { error: 'ID de rol inválido' };
      }
      
      const body = updateRoleSchema.parse(request.body);
      
      const updatedRole = await rolesService.updateRole(roleId, body, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Rol actualizado exitosamente',
        role: updatedRole
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
        error: error.message || 'Error al actualizar rol'
      };
    }
  });

  // DELETE /api/roles/:id - Eliminar rol
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, requirePermission('roles.delete')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const roleId = parseInt(id);
      
      if (isNaN(roleId)) {
        reply.code(400);
        return { error: 'ID de rol inválido' };
      }
      
      await rolesService.deleteRole(roleId, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Rol eliminado exitosamente'
      };
      
    } catch (error: any) {
      if (error.message.includes('no encontrado')) {
        reply.code(404);
        return { error: error.message };
      }
      
      if (error.message.includes('no se puede eliminar')) {
        reply.code(400);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al eliminar rol'
      };
    }
  });

  // GET /api/roles/:id/users - Obtener usuarios con este rol
  fastify.get('/:id/users', {
    preHandler: [fastify.authenticate, requirePermission('roles.read')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const roleId = parseInt(id);
      
      if (isNaN(roleId)) {
        reply.code(400);
        return { error: 'ID de rol inválido' };
      }
      
      const users = await rolesService.getRoleUsers(roleId);
      
      reply.code(200);
      return { users };
      
    } catch (error: any) {
      reply.code(500);
      return {
        error: error.message || 'Error al obtener usuarios del rol'
      };
    }
  });

  // PUT /api/roles/:id/activate - Activar rol
  fastify.put('/:id/activate', {
    preHandler: [fastify.authenticate, requirePermission('roles.update')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const roleId = parseInt(id);
      
      if (isNaN(roleId)) {
        reply.code(400);
        return { error: 'ID de rol inválido' };
      }
      
      await rolesService.activateRole(roleId, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Rol activado exitosamente'
      };
      
    } catch (error: any) {
      if (error.message.includes('no encontrado')) {
        reply.code(404);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al activar rol'
      };
    }
  });

  // PUT /api/roles/:id/deactivate - Desactivar rol
  fastify.put('/:id/deactivate', {
    preHandler: [fastify.authenticate, requirePermission('roles.update')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const roleId = parseInt(id);
      
      if (isNaN(roleId)) {
        reply.code(400);
        return { error: 'ID de rol inválido' };
      }
      
      await rolesService.deactivateRole(roleId, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Rol desactivado exitosamente'
      };
      
    } catch (error: any) {
      if (error.message.includes('no encontrado')) {
        reply.code(404);
        return { error: error.message };
      }
      
      if (error.message.includes('no se puede desactivar')) {
        reply.code(400);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al desactivar rol'
      };
    }
  });
}