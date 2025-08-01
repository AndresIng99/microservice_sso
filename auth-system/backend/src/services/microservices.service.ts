import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import axios from 'axios';

export class MicroservicesService {

  // Obtener lista de microservicios con filtros y paginación
  async getMicroservices(params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    isHealthy?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        isActive,
        isHealthy,
        sortBy = 'id',
        sortOrder = 'asc'
      } = params;

      const skip = (page - 1) * limit;

      // Construir filtros WHERE
      const where: any = {};

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      if (isHealthy !== undefined) {
        where.isHealthy = isHealthy;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { url: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Obtener microservicios
      const [microservices, total] = await Promise.all([
        prisma.microservice.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            [sortBy]: sortOrder
          }
        }),
        prisma.microservice.count({ where })
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        microservices,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };

    } catch (error) {
      logger.error('Error al obtener microservicios:', error);
      throw new Error('Error al obtener microservicios');
    }
  }

  // Obtener microservicio por ID
  async getMicroserviceById(id: number) {
    try {
      const microservice = await prisma.microservice.findUnique({
        where: { id }
      });

      return microservice;

    } catch (error) {
      logger.error('Error al obtener microservicio por ID:', error);
      throw new Error('Error al obtener microservicio');
    }
  }

  // Crear nuevo microservicio
  async createMicroservice(serviceData: {
    name: string;
    description?: string;
    url: string;
    version?: string;
    healthCheckUrl?: string;
    expectedResponse?: string;
    requiresAuth?: boolean;
    allowedRoles?: string[];
  }, createdBy: number) {
    try {
      // Verificar que el nombre no exista
      const existingService = await prisma.microservice.findUnique({
        where: { name: serviceData.name }
      });

      if (existingService) {
        throw new Error('Ya existe un microservicio con ese nombre');
      }

      // Verificar que la URL no exista
      const existingUrl = await prisma.microservice.findFirst({
        where: { url: serviceData.url }
      });

      if (existingUrl) {
        throw new Error('Ya existe un microservicio con esa URL');
      }

      // Crear microservicio
      const newMicroservice = await prisma.microservice.create({
        data: {
          name: serviceData.name,
          description: serviceData.description,
          url: serviceData.url,
          version: serviceData.version || '1.0.0',
          healthCheckUrl: serviceData.healthCheckUrl,
          expectedResponse: serviceData.expectedResponse,
          requiresAuth: serviceData.requiresAuth ?? true,
          allowedRoles: serviceData.allowedRoles || []
        }
      });

      logger.info(`Microservicio creado: ${serviceData.name}`, { 
        serviceId: newMicroservice.id, 
        createdBy 
      });

      // Realizar health check inicial si tiene URL de health check
      if (serviceData.healthCheckUrl) {
        setTimeout(() => {
          this.performHealthCheck(newMicroservice.id).catch(error => {
            logger.warn('Error en health check inicial:', error);
          });
        }, 1000);
      }

      return newMicroservice;

    } catch (error: any) {
      logger.error('Error al crear microservicio:', error);
      throw error;
    }
  }

  // Actualizar microservicio
  async updateMicroservice(id: number, serviceData: {
    name?: string;
    description?: string;
    url?: string;
    version?: string;
    healthCheckUrl?: string;
    expectedResponse?: string;
    requiresAuth?: boolean;
    allowedRoles?: string[];
    isActive?: boolean;
  }, updatedBy: number) {
    try {
      // Verificar que el microservicio existe
      const existingService = await prisma.microservice.findUnique({
        where: { id }
      });

      if (!existingService) {
        throw new Error('Microservicio no encontrado');
      }

      // Verificar duplicados si se actualizan nombre o URL
      if (serviceData.name && serviceData.name !== existingService.name) {
        const duplicate = await prisma.microservice.findUnique({
          where: { name: serviceData.name }
        });

        if (duplicate) {
          throw new Error('Ya existe un microservicio con ese nombre');
        }
      }

      if (serviceData.url && serviceData.url !== existingService.url) {
        const duplicate = await prisma.microservice.findFirst({
          where: { url: serviceData.url }
        });

        if (duplicate) {
          throw new Error('Ya existe un microservicio con esa URL');
        }
      }

      // Actualizar microservicio
      const updatedMicroservice = await prisma.microservice.update({
        where: { id },
        data: {
          name: serviceData.name,
          description: serviceData.description,
          url: serviceData.url,
          version: serviceData.version,
          healthCheckUrl: serviceData.healthCheckUrl,
          expectedResponse: serviceData.expectedResponse,
          requiresAuth: serviceData.requiresAuth,
          allowedRoles: serviceData.allowedRoles,
          isActive: serviceData.isActive
        }
      });

      logger.info(`Microservicio actualizado: ${updatedMicroservice.name}`, { 
        serviceId: id, 
        updatedBy 
      });

      return updatedMicroservice;

    } catch (error: any) {
      logger.error('Error al actualizar microservicio:', error);
      throw error;
    }
  }

  // Eliminar microservicio
  async deleteMicroservice(id: number, deletedBy: number) {
    try {
      const microservice = await prisma.microservice.findUnique({
        where: { id }
      });

      if (!microservice) {
        throw new Error('Microservicio no encontrado');
      }

      await prisma.microservice.delete({
        where: { id }
      });

      logger.info(`Microservicio eliminado: ${microservice.name}`, { 
        serviceId: id, 
        deletedBy 
      });

    } catch (error: any) {
      logger.error('Error al eliminar microservicio:', error);
      throw error;
    }
  }

  // Activar microservicio
  async activateMicroservice(id: number, activatedBy: number) {
    try {
      const microservice = await prisma.microservice.findUnique({
        where: { id }
      });

      if (!microservice) {
        throw new Error('Microservicio no encontrado');
      }

      await prisma.microservice.update({
        where: { id },
        data: { isActive: true }
      });

      logger.info(`Microservicio activado: ${microservice.name}`, { 
        serviceId: id, 
        activatedBy 
      });

    } catch (error) {
      logger.error('Error al activar microservicio:', error);
      throw error;
    }
  }

  // Desactivar microservicio
  async deactivateMicroservice(id: number, deactivatedBy: number) {
    try {
      const microservice = await prisma.microservice.findUnique({
        where: { id }
      });

      if (!microservice) {
        throw new Error('Microservicio no encontrado');
      }

      await prisma.microservice.update({
        where: { id },
        data: { isActive: false }
      });

      logger.info(`Microservicio desactivado: ${microservice.name}`, { 
        serviceId: id, 
        deactivatedBy 
      });

    } catch (error: any) {
      logger.error('Error al desactivar microservicio:', error);
      throw error;
    }
  }

  // Realizar health check de un microservicio
  async performHealthCheck(id: number) {
    const startTime = Date.now();
    
    try {
      const microservice = await prisma.microservice.findUnique({
        where: { id }
      });

      if (!microservice) {
        throw new Error('Microservicio no encontrado');
      }

      let isHealthy = false;
      let status = 'unknown';
      let error = null;
      let responseTime = 0;

      try {
        const healthUrl = microservice.healthCheckUrl || `${microservice.url}/health`;
        
        logger.debug(`Realizando health check para ${microservice.name}: ${healthUrl}`);

        const response = await axios.get(healthUrl, {
          timeout: 5000, // 5 segundos timeout
          validateStatus: (status) => status < 500 // Aceptar 200-499 como válidos
        });

        responseTime = Date.now() - startTime;
        
        // Verificar respuesta esperada si está configurada
        if (microservice.expectedResponse) {
          const responseText = typeof response.data === 'string' 
            ? response.data 
            : JSON.stringify(response.data);
          
          if (responseText.includes(microservice.expectedResponse)) {
            isHealthy = true;
            status = 'healthy';
          } else {
            isHealthy = false;
            status = 'unhealthy';
            error = 'Respuesta no coincide con la esperada';
          }
        } else {
          // Sin respuesta esperada, solo verificar status code
          if (response.status >= 200 && response.status < 400) {
            isHealthy = true;
            status = 'healthy';
          } else {
            isHealthy = false;
            status = 'unhealthy';
            error = `HTTP ${response.status}`;
          }
        }

      } catch (axiosError: any) {
        responseTime = Date.now() - startTime;
        isHealthy = false;
        
        if (axiosError.code === 'ECONNREFUSED') {
          status = 'unreachable';
          error = 'Conexión rechazada';
        } else if (axiosError.code === 'ETIMEDOUT') {
          status = 'timeout';
          error = 'Timeout de conexión';
        } else if (axiosError.response) {
          status = 'error';
          error = `HTTP ${axiosError.response.status}`;
        } else {
          status = 'error';
          error = axiosError.message || 'Error desconocido';
        }
      }

      // Actualizar estado en la base de datos
      const updatedMicroservice = await prisma.microservice.update({
        where: { id },
        data: {
          isHealthy,
          lastHealthCheck: new Date()
        }
      });

      logger.info(`Health check completado para ${microservice.name}`, {
        serviceId: id,
        isHealthy,
        status,
        responseTime: `${responseTime}ms`
      });

      return {
        id: updatedMicroservice.id,
        name: updatedMicroservice.name,
        isHealthy,
        lastHealthCheck: updatedMicroservice.lastHealthCheck,
        responseTime,
        status,
        error
      };

    } catch (error: any) {
      logger.error('Error al realizar health check:', error);
      throw error;
    }
  }

  // Realizar health check de todos los microservicios activos
  async performHealthCheckAll() {
    try {
      const microservices = await prisma.microservice.findMany({
        where: { isActive: true }
      });

      logger.info(`Iniciando health check masivo para ${microservices.length} microservicios`);

      // Ejecutar health checks en paralelo con límite de concurrencia
      const results = [];
      const batchSize = 5; // Máximo 5 health checks simultáneos

      for (let i = 0; i < microservices.length; i += batchSize) {
        const batch = microservices.slice(i, i + batchSize);
        const batchPromises = batch.map(service => 
          this.performHealthCheck(service.id).catch(error => ({
            id: service.id,
            name: service.name,
            isHealthy: false,
            lastHealthCheck: new Date(),
            responseTime: 0,
            status: 'error',
            error: error.message
          }))
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      logger.info(`Health check masivo completado`, {
        total: results.length,
        healthy: results.filter(r => r.isHealthy).length,
        unhealthy: results.filter(r => !r.isHealthy).length
      });

      return results;

    } catch (error) {
      logger.error('Error al realizar health check masivo:', error);
      throw new Error('Error al realizar health check masivo');
    }
  }

  // Programar health checks automáticos (debe llamarse al inicializar el servidor)
  async scheduleHealthChecks() {
    try {
      logger.info('Iniciando health checks automáticos');

      // Ejecutar health check inicial
      this.performHealthCheckAll().catch(error => {
        logger.error('Error en health check inicial:', error);
      });

      // Programar health checks cada 5 minutos
      setInterval(async () => {
        try {
          await this.performHealthCheckAll();
        } catch (error) {
          logger.error('Error en health check programado:', error);
        }
      }, 5 * 60 * 1000); // 5 minutos

    } catch (error) {
      logger.error('Error al programar health checks:', error);
    }
  }

  // Obtener estadísticas de health de todos los microservicios
  async getHealthStats() {
    try {
      const stats = await prisma.microservice.groupBy({
        by: ['isHealthy', 'isActive'],
        _count: true
      });

      const totalActive = await prisma.microservice.count({
        where: { isActive: true }
      });

      const totalInactive = await prisma.microservice.count({
        where: { isActive: false }
      });

      const healthy = stats.find(s => s.isActive && s.isHealthy)?._count || 0;
      const unhealthy = stats.find(s => s.isActive && !s.isHealthy)?._count || 0;

      return {
        total: totalActive + totalInactive,
        active: totalActive,
        inactive: totalInactive,
        healthy,
        unhealthy,
        healthPercentage: totalActive > 0 ? Math.round((healthy / totalActive) * 100) : 0
      };

    } catch (error) {
      logger.error('Error al obtener estadísticas de health:', error);
      throw new Error('Error al obtener estadísticas de health');
    }
  }

  // Obtener microservicios que requieren atención
  async getMicroservicesNeedingAttention() {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const needingAttention = await prisma.microservice.findMany({
        where: {
          isActive: true,
          OR: [
            { isHealthy: false },
            { lastHealthCheck: null },
            { lastHealthCheck: { lt: oneDayAgo } }
          ]
        },
        orderBy: {
          lastHealthCheck: 'asc'
        }
      });

      return needingAttention.map(service => ({
        ...service,
        reason: !service.isHealthy 
          ? 'unhealthy' 
          : !service.lastHealthCheck 
            ? 'never_checked' 
            : 'stale_check'
      }));

    } catch (error) {
      logger.error('Error al obtener microservicios que necesitan atención:', error);
      throw new Error('Error al obtener microservicios que necesitan atención');
    }
  }
}