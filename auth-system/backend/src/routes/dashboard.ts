import { FastifyInstance } from 'fastify';
import { DashboardService } from '../services/dashboard.service';
import { requirePermission } from '../middleware/auth';

const dashboardService = new DashboardService();

export default async function dashboardRoutes(fastify: FastifyInstance) {

  // GET /api/dashboard - Obtener métricas importantes del dashboard
  fastify.get('/', {
    preHandler: [fastify.authenticate, requirePermission('dashboard.view')]
  }, async (request, reply) => {
    try {
      const dashboardData = await dashboardService.getDashboardData();
      
      reply.code(200);
      return dashboardData;
      
    } catch (error: any) {
      reply.code(500);
      return {
        error: error.message || 'Error al obtener datos del dashboard'
      };
    }
  });
}