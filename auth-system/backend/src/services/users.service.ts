// REEMPLAZA COMPLETAMENTE: auth-system/backend/src/services/users.service.ts
// VERSIÓN FUNCIONAL COMPLETA

import { prisma } from '../utils/database';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../utils/password';
import { logger } from '../utils/logger';

export class UsersService {

  // Obtener lista de usuarios con filtros y paginación
  async getUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    roleId?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        isActive,
        roleId,
        sortBy = 'id',
        sortOrder = 'asc'
      } = params;

      const skip = (page - 1) * limit;

      // Construir filtros WHERE
      const where: any = {
        isDeleted: false
      };

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { cedula: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (roleId) {
        where.userRoles = {
          some: {
            roleId: roleId
          }
        };
      }

      // Obtener usuarios
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            [sortBy]: sortOrder
          },
          select: {
            id: true,
            username: true,
            email: true,
            firstName: true,
            lastName: true,
            cedula: true,
            telefono: true,
            isActive: true,
            createdAt: true,
            lastLogin: true,
            userRoles: {
              include: {
                role: {
                  select: {
                    id: true,
                    name: true,
                    description: true
                  }
                }
              }
            }
          }
        }),
        prisma.user.count({ where })
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        users: users.map(user => ({
          ...user,
          roles: user.userRoles.map(ur => ur.role)
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
      logger.error('Error al obtener usuarios:', error);
      throw new Error('Error al obtener usuarios');
    }
  }

  // Obtener usuario por ID
  async getUserById(id: number) {
    try {
      const user = await prisma.user.findFirst({
        where: {
          id,
          isDeleted: false
        },
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          cedula: true,
          telefono: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastLogin: true,
          userRoles: {
            include: {
              role: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  permissions: true
                }
              }
            }
          }
        }
      });

      if (!user) {
        return null;
      }

      // Obtener permisos combinados
      const permissions = this.getUserPermissions(user.userRoles);

      return {
        ...user,
        permissions,
        roles: user.userRoles.map(ur => ur.role)
      };

    } catch (error) {
      logger.error('Error al obtener usuario por ID:', error);
      throw new Error('Error al obtener usuario');
    }
  }

  // Crear nuevo usuario - VERSIÓN CON DEBUGGING
  async createUser(userData: {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    cedula?: string;
    telefono?: string;
    roleIds?: number[];
  }, createdBy: number) {
    
    console.log('=== INICIO CREACIÓN USUARIO ===');
    console.log('Datos:', {
      username: userData.username,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      hasRoleIds: !!userData.roleIds,
      roleIdsCount: userData.roleIds?.length || 0,
      roleIds: userData.roleIds
    });
    
    try {
      // Validar política de contraseñas
      console.log('Validando política de contraseñas...');
      const passwordValidation = validatePasswordPolicy(userData.password);
      if (!passwordValidation.isValid) {
        const errorMsg = `Contraseña no cumple los requisitos: ${passwordValidation.errors.join(', ')}`;
        console.log('Error de contraseña:', errorMsg);
        throw new Error(errorMsg);
      }

      // Verificar que username y email no existan
      console.log('Verificando duplicados...');
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username: userData.username },
            { email: userData.email }
          ],
          isDeleted: false
        }
      });

      if (existingUser) {
        console.log('Usuario duplicado encontrado:', existingUser.username);
        if (existingUser.username === userData.username) {
          throw new Error('Ya existe un usuario con ese username');
        }
        if (existingUser.email === userData.email) {
          throw new Error('Ya existe un usuario con ese email');
        }
      }

      // Verificar cédula si se proporciona
      if (userData.cedula) {
        console.log('Verificando cédula...');
        const existingCedula = await prisma.user.findFirst({
          where: {
            cedula: userData.cedula,
            isDeleted: false
          }
        });

        if (existingCedula) {
          console.log('Cédula duplicada encontrada');
          throw new Error('Ya existe un usuario con esa cédula');
        }
      }

      // Hash de la contraseña
      console.log('Hasheando contraseña...');
      const hashedPassword = await hashPassword(userData.password);

      // Validar roles si se proporcionan
      let validRoleIds: number[] = [];
      if (userData.roleIds && userData.roleIds.length > 0) {
        console.log('Validando roles:', userData.roleIds);
        
        const existingRoles = await prisma.role.findMany({
          where: {
            id: { in: userData.roleIds },
            isActive: true
          }
        });

        console.log('Roles encontrados:', existingRoles.map(r => ({ id: r.id, name: r.name })));

        if (existingRoles.length !== userData.roleIds.length) {
          const foundIds = existingRoles.map(r => r.id);
          const missingIds = userData.roleIds.filter(id => !foundIds.includes(id));
          console.log('Roles faltantes:', missingIds);
          throw new Error(`Los siguientes roles no existen o están inactivos: ${missingIds.join(', ')}`);
        }
        
        validRoleIds = userData.roleIds;
      }

      // Crear usuario en transacción
      console.log('Iniciando transacción...');
      const result = await prisma.$transaction(async (tx) => {
        // Crear usuario
        console.log('Creando usuario...');
        const newUser = await tx.user.create({
          data: {
            username: userData.username,
            email: userData.email,
            password: hashedPassword,
            firstName: userData.firstName,
            lastName: userData.lastName,
            cedula: userData.cedula || null,
            telefono: userData.telefono || null
          }
        });

        console.log('Usuario creado con ID:', newUser.id);

        // Asignar roles si se especifican
        if (validRoleIds.length > 0) {
          console.log('Asignando roles...');
          
          const userRolesToCreate = validRoleIds.map(roleId => ({
            userId: newUser.id,
            roleId,
            assignedBy: createdBy
          }));

          console.log('UserRoles a crear:', userRolesToCreate);

          await tx.userRole.createMany({
            data: userRolesToCreate
          });

          console.log('Roles asignados exitosamente');
        }

        return newUser;
      });

      console.log('Transacción completada. Obteniendo usuario completo...');

      // Obtener usuario completo con roles
      const userWithRoles = await this.getUserById(result.id);
      
      console.log('=== USUARIO CREADO EXITOSAMENTE ===');
      console.log('Usuario final:', {
        id: userWithRoles?.id,
        username: userWithRoles?.username,
        rolesCount: userWithRoles?.roles?.length || 0
      });

      return userWithRoles;

    } catch (error: any) {
      console.log('=== ERROR EN CREACIÓN ===');
      console.log('Error type:', typeof error);
      console.log('Error name:', error.name);
      console.log('Error message:', error.message);
      console.log('Error stack:', error.stack);
      
      logger.error('Error detallado al crear usuario:', {
        message: error.message,
        stack: error.stack,
        userData: {
          username: userData.username,
          email: userData.email,
          roleIds: userData.roleIds
        }
      });
      
      throw error;
    }
  }

  // Actualizar usuario
  async updateUser(id: number, userData: {
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    cedula?: string;
    telefono?: string;
    isActive?: boolean;
    roleIds?: number[];
  }, updatedBy: number) {
    try {
      // Verificar que el usuario existe
      const existingUser = await prisma.user.findFirst({
        where: { id, isDeleted: false }
      });

      if (!existingUser) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar duplicados si se actualizan username o email
      if (userData.username || userData.email || userData.cedula) {
        const duplicateConditions = [];
        
        if (userData.username) {
          duplicateConditions.push({ username: userData.username });
        }
        if (userData.email) {
          duplicateConditions.push({ email: userData.email });
        }
        if (userData.cedula) {
          duplicateConditions.push({ cedula: userData.cedula });
        }

        const duplicate = await prisma.user.findFirst({
          where: {
            OR: duplicateConditions,
            isDeleted: false,
            NOT: { id }
          }
        });

        if (duplicate) {
          if (duplicate.username === userData.username) {
            throw new Error('Ya existe un usuario con ese username');
          }
          if (duplicate.email === userData.email) {
            throw new Error('Ya existe un usuario con ese email');
          }
          if (duplicate.cedula === userData.cedula) {
            throw new Error('Ya existe un usuario con esa cédula');
          }
        }
      }

      // Actualizar en transacción
      const result = await prisma.$transaction(async (tx) => {
        // Actualizar datos del usuario
        const updatedUser = await tx.user.update({
          where: { id },
          data: {
            username: userData.username,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            cedula: userData.cedula,
            telefono: userData.telefono,
            isActive: userData.isActive
          }
        });

        // Actualizar roles si se especifican
        if (userData.roleIds !== undefined) {
          // Eliminar roles actuales
          await tx.userRole.deleteMany({
            where: { userId: id }
          });

          // Asignar nuevos roles
          if (userData.roleIds.length > 0) {
            await tx.userRole.createMany({
              data: userData.roleIds.map(roleId => ({
                userId: id,
                roleId,
                assignedBy: updatedBy
              }))
            });
          }
        }

        return updatedUser;
      });

      logger.info(`Usuario actualizado: ${result.username}`, { 
        userId: id, 
        updatedBy 
      });

      // Obtener usuario completo con roles
      return await this.getUserById(id);

    } catch (error: any) {
      logger.error('Error al actualizar usuario:', error);
      throw error;
    }
  }

  // Eliminar usuario (soft delete)
  async deleteUser(id: number, deletedBy: number) {
    try {
      const user = await prisma.user.findFirst({
        where: { id, isDeleted: false }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      await prisma.user.update({
        where: { id },
        data: {
          isDeleted: true,
          isActive: false
        }
      });

      logger.info(`Usuario eliminado: ${user.username}`, { 
        userId: id, 
        deletedBy 
      });

    } catch (error) {
      logger.error('Error al eliminar usuario:', error);
      throw error;
    }
  }

  // Activar usuario
  async activateUser(id: number, activatedBy: number) {
    try {
      const user = await prisma.user.findFirst({
        where: { id, isDeleted: false }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      await prisma.user.update({
        where: { id },
        data: { isActive: true }
      });

      logger.info(`Usuario activado: ${user.username}`, { 
        userId: id, 
        activatedBy 
      });

    } catch (error) {
      logger.error('Error al activar usuario:', error);
      throw error;
    }
  }

  // Desactivar usuario
  async deactivateUser(id: number, deactivatedBy: number) {
    try {
      const user = await prisma.user.findFirst({
        where: { id, isDeleted: false }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      await prisma.user.update({
        where: { id },
        data: { isActive: false }
      });

      // Revocar todas las sesiones activas
      await prisma.session.updateMany({
        where: { userId: id },
        data: { 
          isActive: false,
          isRevoked: true 
        }
      });

      logger.info(`Usuario desactivado: ${user.username}`, { 
        userId: id, 
        deactivatedBy 
      });

    } catch (error) {
      logger.error('Error al desactivar usuario:', error);
      throw error;
    }
  }

  // Cambiar contraseña
  async changePassword(id: number, currentPassword: string, newPassword: string) {
    try {
      const user = await prisma.user.findFirst({
        where: { id, isDeleted: false }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar contraseña actual
      const isValidPassword = await verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
        throw new Error('La contraseña actual es incorrecta');
      }

      // Validar nueva contraseña
      const passwordValidation = validatePasswordPolicy(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(`Nueva contraseña no cumple los requisitos: ${passwordValidation.errors.join(', ')}`);
      }

      // Hash nueva contraseña
      const hashedPassword = await hashPassword(newPassword);

      await prisma.user.update({
        where: { id },
        data: { password: hashedPassword }
      });

      logger.info(`Contraseña cambiada para usuario: ${user.username}`, { userId: id });

    } catch (error: any) {
      logger.error('Error al cambiar contraseña:', error);
      throw error;
    }
  }

  // Obtener roles del usuario
  async getUserRoles(id: number) {
    try {
      const userRoles = await prisma.userRole.findMany({
        where: { userId: id },
        include: {
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              permissions: true,
              isActive: true
            }
          }
        }
      });

      return userRoles.map(ur => ur.role);

    } catch (error) {
      logger.error('Error al obtener roles del usuario:', error);
      throw new Error('Error al obtener roles del usuario');
    }
  }

  // Asignar roles al usuario
  async assignRoles(userId: number, roleIds: number[], assignedBy: number) {
    try {
      // Verificar que el usuario existe
      const user = await prisma.user.findFirst({
        where: { id: userId, isDeleted: false }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar que todos los roles existen
      const roles = await prisma.role.findMany({
        where: {
          id: { in: roleIds },
          isActive: true
        }
      });

      if (roles.length !== roleIds.length) {
        throw new Error('Algunos roles no existen o están inactivos');
      }

      await prisma.$transaction(async (tx) => {
        // Eliminar roles actuales
        await tx.userRole.deleteMany({
          where: { userId }
        });

        // Asignar nuevos roles
        if (roleIds.length > 0) {
          await tx.userRole.createMany({
            data: roleIds.map(roleId => ({
              userId,
              roleId,
              assignedBy
            }))
          });
        }
      });

      logger.info(`Roles asignados al usuario: ${user.username}`, { 
        userId, 
        roleIds, 
        assignedBy 
      });

    } catch (error: any) {
      logger.error('Error al asignar roles:', error);
      throw error;
    }
  }

  // Helper: obtener permisos combinados de todos los roles del usuario
  private getUserPermissions(userRoles: any[]): string[] {
    const allPermissions = new Set<string>();
    
    for (const userRole of userRoles) {
      const rolePermissions = userRole.role.permissions as string[];
      rolePermissions.forEach(permission => allPermissions.add(permission));
    }
    
    return Array.from(allPermissions);
  }
}