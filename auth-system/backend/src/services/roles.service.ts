import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

export class RolesService {

  // Permisos disponibles en el sistema
  private readonly AVAILABLE_PERMISSIONS = [
    // Usuarios
    'users.create',
    'users.read',
    'users.update',
    'users.delete',
    
    // Roles
    'roles.create',
    'roles.read',
    'roles.update',
    'roles.delete',
    
    // Microservicios
    'microservices.create',
    'microservices.read',
    'microservices.update',
    'microservices.delete',
    
    // Sistema
    'system.config',
    'system.logs',
    'system.health',
    
    // Dashboard
    'dashboard.view',
    'dashboard.analytics',
    
    // Perfil
    'profile.read',
    'profile.update',
    
    // Super admin (todos los permisos)
    '*'
  ];

  // Obtener lista de roles con filtros y paginación
  async getRoles(params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        isActive,
        sortBy = 'id',
        sortOrder = 'asc'
      } = params;

      const skip = (page - 1) * limit;

      // Construir filtros WHERE
      const where: any = {};

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Obtener roles
      const [roles, total] = await Promise.all([
        prisma.role.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            [sortBy]: sortOrder
          },
          include: {
            _count: {
              select: {
                userRoles: true
              }
            }
          }
        }),
        prisma.role.count({ where })
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        roles: roles.map(role => ({
          ...role,
          userCount: role._count.userRoles
        })),
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
      logger.error('Error al obtener roles:', error);
      throw new Error('Error al obtener roles');
    }
  }

  // Obtener rol por ID
  async getRoleById(id: number) {
    try {
      const role = await prisma.role.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              userRoles: true
            }
          },
          userRoles: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  isActive: true
                }
              }
            }
          }
        }
      });

      if (!role) {
        return null;
      }

      return {
        ...role,
        userCount: role._count.userRoles,
        users: role.userRoles.map(ur => ur.user)
      };

    } catch (error) {
      logger.error('Error al obtener rol por ID:', error);
      throw new Error('Error al obtener rol');
    }
  }

  // Crear nuevo rol
  async createRole(roleData: {
    name: string;
    description?: string;
    permissions: string[];
  }, createdBy: number) {
    try {
      // Verificar que el nombre no exista
      const existingRole = await prisma.role.findUnique({
        where: { name: roleData.name }
      });

      if (existingRole) {
        throw new Error('Ya existe un rol con ese nombre');
      }

      // Validar permisos
      const invalidPermissions = roleData.permissions.filter(
        permission => !this.AVAILABLE_PERMISSIONS.includes(permission)
      );

      if (invalidPermissions.length > 0) {
        throw new Error(`Permisos inválidos: ${invalidPermissions.join(', ')}`);
      }

      // Crear rol
      const newRole = await prisma.role.create({
        data: {
          name: roleData.name,
          description: roleData.description,
          permissions: roleData.permissions
        }
      });

      logger.info(`Rol creado: ${roleData.name}`, { 
        roleId: newRole.id, 
        createdBy 
      });

      return newRole;

    } catch (error: any) {
      logger.error('Error al crear rol:', error);
      throw error;
    }
  }

  // Actualizar rol
  async updateRole(id: number, roleData: {
    name?: string;
    description?: string;
    permissions?: string[];
    isActive?: boolean;
  }, updatedBy: number) {
    try {
      // Verificar que el rol existe
      const existingRole = await prisma.role.findUnique({
        where: { id }
      });

      if (!existingRole) {
        throw new Error('Rol no encontrado');
      }

      // Verificar que no sea un rol del sistema que no se puede modificar
      if (['super_admin', 'admin', 'user'].includes(existingRole.name) && roleData.name && roleData.name !== existingRole.name) {
        throw new Error('No se puede cambiar el nombre de los roles del sistema');
      }

      // Verificar duplicado de nombre si se actualiza
      if (roleData.name && roleData.name !== existingRole.name) {
        const duplicate = await prisma.role.findUnique({
          where: { name: roleData.name }
        });

        if (duplicate) {
          throw new Error('Ya existe un rol con ese nombre');
        }
      }

      // Validar permisos si se actualizan
      if (roleData.permissions) {
        const invalidPermissions = roleData.permissions.filter(
          permission => !this.AVAILABLE_PERMISSIONS.includes(permission)
        );

      }

      // Actualizar rol
      const updatedRole = await prisma.role.update({
        where: { id },
        data: {
          name: roleData.name,
          description: roleData.description,
          permissions: roleData.permissions,
          isActive: roleData.isActive
        }
      });

      logger.info(`Rol actualizado: ${updatedRole.name}`, { 
        roleId: id, 
        updatedBy 
      });

      return updatedRole;

    } catch (error: any) {
      logger.error('Error al actualizar rol:', error);
      throw error;
    }
  }

  // Eliminar rol
  async deleteRole(id: number, deletedBy: number) {
    try {
      const role = await prisma.role.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              userRoles: true
            }
          }
        }
      });

      if (!role) {
        throw new Error('Rol no encontrado');
      }

      // No permitir eliminar roles del sistema
      if (['super_admin', 'admin', 'user'].includes(role.name)) {
        throw new Error('No se puede eliminar un rol del sistema');
      }

      // No permiti eliminar si tiene usuarios asignados
      if (role._count.userRoles > 0) {
        throw new Error('No se puede eliminar el rol porque tiene usuarios asignados');
      }

      await prisma.role.delete({
        where: { id }
      });

      logger.info(`Rol eliminado: ${role.name}`, { 
        roleId: id, 
        deletedBy 
      });

    } catch (error: any) {
      logger.error('Error al eliminar rol:', error);
      throw error;
    }
  }

  // Activar rol
  async activateRole(id: number, activatedBy: number) {
    try {
      const role = await prisma.role.findUnique({
        where: { id }
      });

      if (!role) {
        throw new Error('Rol no encontrado');
      }

      await prisma.role.update({
        where: { id },
        data: { isActive: true }
      });

      logger.info(`Rol activado: ${role.name}`, { 
        roleId: id, 
        activatedBy 
      });

    } catch (error) {
      logger.error('Error al activar rol:', error);
      throw error;
    }
  }

  // Desactivar rol
  async deactivateRole(id: number, deactivatedBy: number) {
    try {
      const role = await prisma.role.findUnique({
        where: { id }
      });

      if (!role) {
        throw new Error('Rol no encontrado');
      }

      // No permitir desactivar roles críticos del sistema
      if (['super_admin'].includes(role.name)) {
        throw new Error('No se puede desactivar el rol de super administrador');
      }

      await prisma.role.update({
        where: { id },
        data: { isActive: false }
      });

      logger.info(`Rol desactivado: ${role.name}`, { 
        roleId: id, 
        deactivatedBy 
      });

    } catch (error: any) {
      logger.error('Error al desactivar rol:', error);
      throw error;
    }
  }

  // Obtener usuarios con un rol específico
  async getRoleUsers(roleId: number) {
    try {
      const userRoles = await prisma.userRole.findMany({
        where: { roleId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              firstName: true,
              lastName: true,
              isActive: true,
              createdAt: true,
              lastLogin: true
            }
          }
        }
      });

      return userRoles.map(ur => ur.user);

    } catch (error) {
      logger.error('Error al obtener usuarios del rol:', error);
      throw new Error('Error al obtener usuarios del rol');
    }
  }

  // Obtener todos los permisos disponibles
  async getAvailablePermissions() {
    try {
      return {
        all: this.AVAILABLE_PERMISSIONS,
        grouped: {
          users: this.AVAILABLE_PERMISSIONS.filter(p => p.startsWith('users.')),
          roles: this.AVAILABLE_PERMISSIONS.filter(p => p.startsWith('roles.')),
          microservices: this.AVAILABLE_PERMISSIONS.filter(p => p.startsWith('microservices.')),
          system: this.AVAILABLE_PERMISSIONS.filter(p => p.startsWith('system.')),
          dashboard: this.AVAILABLE_PERMISSIONS.filter(p => p.startsWith('dashboard.')),
          profile: this.AVAILABLE_PERMISSIONS.filter(p => p.startsWith('profile.')),
          special: this.AVAILABLE_PERMISSIONS.filter(p => p === '*')
        }
      };

    } catch (error) {
      logger.error('Error al obtener permisos disponibles:', error);
      throw new Error('Error al obtener permisos disponibles');
    }
  }

  // Verificar si un usuario tiene un permiso específico
  async userHasPermission(userId: number, permission: string): Promise<boolean> {
    try {
      const userRoles = await prisma.userRole.findMany({
        where: { userId },
        include: {
          role: {
            select: {
              permissions: true,
              isActive: true
            }
          }
        }
      });

      for (const userRole of userRoles) {
        if (!userRole.role.isActive) continue;
        
        const rolePermissions = userRole.role.permissions as string[];
        
        // Super admin tiene todos los permisos
        if (rolePermissions.includes('*')) {
          return true;
        }
        
        // Verificar permiso específico
        if (rolePermissions.includes(permission)) {
          return true;
        }
      }

      return false;

    } catch (error) {
      logger.error('Error al verificar permisos del usuario:', error);
      return false;
    }
  }

  // Obtener todos los permisos de un usuario
  async getUserPermissions(userId: number): Promise<string[]> {
    try {
      const userRoles = await prisma.userRole.findMany({
        where: { userId },
        include: {
          role: {
            select: {
              permissions: true,
              isActive: true
            }
          }
        }
      });

      const allPermissions = new Set<string>();

      for (const userRole of userRoles) {
        if (!userRole.role.isActive) continue;
        
        const rolePermissions = userRole.role.permissions as string[];
        rolePermissions.forEach(permission => allPermissions.add(permission));
      }

      return Array.from(allPermissions);

    } catch (error) {
      logger.error('Error al obtener permisos del usuario:', error);
      return [];
    }
  }
}