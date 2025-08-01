import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MicroservicesService } from '../services/microservices.service';
import { requirePermission } from '../middleware/auth';

const microservicesService = new MicroservicesService();

// Esquemas de validación
const createMicroserviceSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(100),
  description: z.string().optional(),
  url: z.string().url('URL inválida').max(255),
  version: z.string().optional().default('1.0.0'),
  healthCheckUrl: z.string().url('URL de health check inválida').optional(),
  expectedResponse: z.string().optional(),
  requiresAuth: z.boolean().optional().default(true),
  allowedRoles: z.array(z.string()).optional().default([])
});

const updateMicroserviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  url: z.string().url().max(255).optional(),
  version: z.string().optional(),
  healthCheckUrl: z.string().url().optional(),
  expectedResponse: z.string().optional(),
  requiresAuth: z.boolean().optional(),
  allowedRoles: z.array(z.string()).optional(),
  isActive: z.boolean().optional()
});

const querySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  isHealthy: z.coerce.boolean().optional(),
  sortBy: z.enum(['id', 'name', 'url', 'version', 'createdAt', 'lastHealthCheck']).optional().default('id'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc')
});

export default async function microserviceRoutes(fastify: FastifyInstance) {

  // GET /api/microservices - Listar microservicios
  fastify.get('/', {
    preHandler: [fastify.authenticate, requirePermission('microservices.read')]
  }, async (request, reply) => {
    try {
      const query = querySchema.parse(request.query);
      
      const result = await microservicesService.getMicroservices(query);
      
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
        error: error.message || 'Error al obtener microservicios'
      };
    }
  });

  // GET /api/microservices/:id - Obtener microservicio por ID
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, requirePermission('microservices.read')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const serviceId = parseInt(id);
      
      if (isNaN(serviceId)) {
        reply.code(400);
        return { error: 'ID de microservicio inválido' };
      }
      
      const microservice = await microservicesService.getMicroserviceById(serviceId);
      
      if (!microservice) {
        reply.code(404);
        return { error: 'Microservicio no encontrado' };
      }
      
      reply.code(200);
      return { microservice };
      
    } catch (error: any) {
      reply.code(500);
      return {
        error: error.message || 'Error al obtener microservicio'
      };
    }
  });

  // POST /api/microservices - Crear microservicio
  fastify.post('/', {
    preHandler: [fastify.authenticate, requirePermission('microservices.create')]
  }, async (request, reply) => {
    try {
      const body = createMicroserviceSchema.parse(request.body);
      
      const newMicroservice = await microservicesService.createMicroservice(body, request.user!.id);
      
      reply.code(201);
      return {
        message: 'Microservicio creado exitosamente',
        microservice: newMicroservice
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
        error: error.message || 'Error al crear microservicio'
      };
    }
  });

  // PUT /api/microservices/:id - Actualizar microservicio
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, requirePermission('microservices.update')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const serviceId = parseInt(id);
      
      if (isNaN(serviceId)) {
        reply.code(400);
        return { error: 'ID de microservicio inválido' };
      }
      
      const body = updateMicroserviceSchema.parse(request.body);
      
      const updatedMicroservice = await microservicesService.updateMicroservice(serviceId, body, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Microservicio actualizado exitosamente',
        microservice: updatedMicroservice
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
        error: error.message || 'Error al actualizar microservicio'
      };
    }
  });

  // DELETE /api/microservices/:id - Eliminar microservicio
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, requirePermission('microservices.delete')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const serviceId = parseInt(id);
      
      if (isNaN(serviceId)) {
        reply.code(400);
        return { error: 'ID de microservicio inválido' };
      }
      
      await microservicesService.deleteMicroservice(serviceId, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Microservicio eliminado exitosamente'
      };
      
    } catch (error: any) {
      if (error.message.includes('no encontrado')) {
        reply.code(404);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al eliminar microservicio'
      };
    }
  });

  // GET /api/microservices/:id/health - Hacer health check manual
  fastify.get('/:id/health', {
    preHandler: [fastify.authenticate, requirePermission('microservices.read')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const serviceId = parseInt(id);
      
      if (isNaN(serviceId)) {
        reply.code(400);
        return { error: 'ID de microservicio inválido' };
      }
      
      const healthResult = await microservicesService.performHealthCheck(serviceId);
      
      reply.code(200);
      return {
        microservice: healthResult.name,
        isHealthy: healthResult.isHealthy,
        lastCheck: healthResult.lastHealthCheck,
        responseTime: healthResult.responseTime,
        status: healthResult.status,
        error: healthResult.error
      };
      
    } catch (error: any) {
      if (error.message.includes('no encontrado')) {
        reply.code(404);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al realizar health check'
      };
    }
  });

  // POST /api/microservices/:id/health-check - Ejecutar health check
  fastify.post('/:id/health-check', {
    preHandler: [fastify.authenticate, requirePermission('microservices.update')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const serviceId = parseInt(id);
      
      if (isNaN(serviceId)) {
        reply.code(400);
        return { error: 'ID de microservicio inválido' };
      }
      
      const healthResult = await microservicesService.performHealthCheck(serviceId);
      
      reply.code(200);
      return {
        message: 'Health check ejecutado',
        result: {
          microservice: healthResult.name,
          isHealthy: healthResult.isHealthy,
          lastCheck: healthResult.lastHealthCheck,
          responseTime: healthResult.responseTime,
          status: healthResult.status,
          error: healthResult.error
        }
      };
      
    } catch (error: any) {
      if (error.message.includes('no encontrado')) {
        reply.code(404);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al ejecutar health check'
      };
    }
  });

  // POST /api/microservices/health-check-all - Health check de todos los microservicios
  fastify.post('/health-check-all', {
    preHandler: [fastify.authenticate, requirePermission('microservices.update')]
  }, async (request, reply) => {
    try {
      const results = await microservicesService.performHealthCheckAll();
      
      reply.code(200);
      return {
        message: 'Health check ejecutado en todos los microservicios',
        results: results.map(result => ({
          id: result.id,
          name: result.name,
          isHealthy: result.isHealthy,
          lastCheck: result.lastHealthCheck,
          responseTime: result.responseTime,
          status: result.status,
          error: result.error
        })),
        summary: {
          total: results.length,
          healthy: results.filter(r => r.isHealthy).length,
          unhealthy: results.filter(r => !r.isHealthy).length
        }
      };
      
    } catch (error: any) {
      reply.code(500);
      return {
        error: error.message || 'Error al ejecutar health check masivo'
      };
    }
  });

  // PUT /api/microservices/:id/activate - Activar microservicio
  fastify.put('/:id/activate', {
    preHandler: [fastify.authenticate, requirePermission('microservices.update')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const serviceId = parseInt(id);
      
      if (isNaN(serviceId)) {
        reply.code(400);
        return { error: 'ID de microservicio inválido' };
      }
      
      await microservicesService.activateMicroservice(serviceId, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Microservicio activado exitosamente'
      };
      
    } catch (error: any) {
      if (error.message.includes('no encontrado')) {
        reply.code(404);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al activar microservicio'
      };
    }
  });

  // PUT /api/microservices/:id/deactivate - Desactivar microservicio
  fastify.put('/:id/deactivate', {
    preHandler: [fastify.authenticate, requirePermission('microservices.update')]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const serviceId = parseInt(id);
      
      if (isNaN(serviceId)) {
        reply.code(400);
        return { error: 'ID de microservicio inválido' };
      }
      
      await microservicesService.deactivateMicroservice(serviceId, request.user!.id);
      
      reply.code(200);
      return {
        message: 'Microservicio desactivado exitosamente'
      };
      
    } catch (error: any) {
      if (error.message.includes('no encontrado')) {
        reply.code(404);
        return { error: error.message };
      }
      
      reply.code(500);
      return {
        error: error.message || 'Error al desactivar microservicio'
      };
    }
  });
}