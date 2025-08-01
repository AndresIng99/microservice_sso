import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

export class DashboardService {

  // Obtener datos principales del dashboard (métricas importantes como dice la doc)
  async getDashboardData() {
    try {
      const [
        userStats,
        roleStats,
        microserviceStats,
        systemHealth
      ] = await Promise.all([
        this.getUserStats(),
        this.getRoleStats(),
        this.getMicroserviceStats(),
        this.getSystemHealth()
      ]);

      return {
        userStats,
        roleStats,
        microserviceStats,
        systemHealth,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Error al obtener datos del dashboard:', error);
      throw new Error('Error al obtener datos del dashboard');
    }
  }

  // Estadísticas básicas de usuarios
  async getUserStats() {
    try {
      const [totalUsers, activeUsers, inactiveUsers] = await Promise.all([
        prisma.user.count({ where: { isDeleted: false } }),
        prisma.user.count({ where: { isActive: true, isDeleted: false } }),
        prisma.user.count({ where: { isActive: false, isDeleted: false } })
      ]);

      return {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers
      };
    } catch (error) {
      logger.error('Error al obtener estadísticas de usuarios:', error);
      throw error;
    }
  }

  // Estadísticas básicas de roles
  async getRoleStats() {
    try {
      const [totalRoles, activeRoles] = await Promise.all([
        prisma.role.count(),
        prisma.role.count({ where: { isActive: true } })
      ]);

      return {
        total: totalRoles,
        active: activeRoles,
        inactive: totalRoles - activeRoles
      };
    } catch (error) {
      logger.error('Error al obtener estadísticas de roles:', error);
      throw error;
    }
  }

  // Estadísticas básicas de microservicios
  async getMicroserviceStats() {
    try {
      const [totalServices, activeServices, healthyServices] = await Promise.all([
        prisma.microservice.count(),
        prisma.microservice.count({ where: { isActive: true } }),
        prisma.microservice.count({ where: { isActive: true, isHealthy: true } })
      ]);

      const unhealthyServices = activeServices - healthyServices;

      return {
        total: totalServices,
        active: activeServices,
        inactive: totalServices - activeServices,
        healthy: healthyServices,
        unhealthy: unhealthyServices
      };
    } catch (error) {
      logger.error('Error al obtener estadísticas de microservicios:', error);
      throw error;
    }
  }

  // Estado básico del sistema
  async getSystemHealth() {
    try {
      const uptime = process.uptime();
      
      // Verificar conexión a la base de datos
      let dbStatus = 'healthy';
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        dbStatus = 'unhealthy';
      }

      return {
        status: dbStatus === 'healthy' ? 'healthy' : 'unhealthy',
        uptime: Math.floor(uptime),
        database: dbStatus
      };
    } catch (error) {
      logger.error('Error al obtener estado del sistema:', error);
      throw error;
    }
  }
}