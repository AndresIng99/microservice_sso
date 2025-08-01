import { prisma } from '../utils/database';
import { verifyPassword } from '../utils/password';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class AuthService {
  
  // Login de usuario
  async login(username: string, password: string, sessionInfo?: {
    userAgent?: string;
    ipAddress?: string;
  }) {
    try {
      // Buscar usuario por username o email
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { username },
            { email: username }
          ],
          isActive: true,
          isDeleted: false
        },
        include: {
          userRoles: {
            include: {
              role: true
            }
          }
        }
      });

      if (!user) {
        logger.warn(`Intento de login fallido para usuario: ${username}`, { ip: sessionInfo?.ipAddress });
        throw new Error('Usuario o contraseña incorrectos');
      }

      // Verificar si el usuario está bloqueado
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / (1000 * 60));
        logger.warn(`Intento de login en usuario bloqueado: ${username}`, { minutesLeft });
        throw new Error(`Usuario bloqueado. Intente nuevamente en ${minutesLeft} minutos`);
      }

      // Verificar contraseña
      const isValidPassword = await verifyPassword(password, user.password);
      
      if (!isValidPassword) {
        // Incrementar intentos fallidos
        const newAttempts = user.loginAttempts + 1;
        const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5');
        
        let updateData: any = {
          loginAttempts: newAttempts
        };

        // Bloquear usuario si excede intentos máximos
        if (newAttempts >= maxAttempts) {
          const lockoutMinutes = parseInt(process.env.LOCKOUT_TIME?.replace('m', '') || '15');
          updateData.lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
          updateData.loginAttempts = 0;
          
          logger.warn(`Usuario bloqueado por exceso de intentos: ${username}`, { 
            attempts: newAttempts,
            lockoutMinutes
          });
        }

        await prisma.user.update({
          where: { id: user.id },
          data: updateData
        });

        throw new Error('Usuario o contraseña incorrectos');
      }

      // Login exitoso - resetear intentos y actualizar última conexión
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: 0,
          lockedUntil: null,
          lastLogin: new Date()
        }
      });

      // Obtener permisos del usuario
      const permissions = this.getUserPermissions(user.userRoles);
      
      const userWithPermissions = {
        ...user,
        permissions
      };

      // Generar tokens
      const accessToken = generateAccessToken(userWithPermissions);
      const refreshToken = generateRefreshToken(userWithPermissions);

      // Guardar sesión en la base de datos
      const sessionExpiration = new Date();
      sessionExpiration.setDate(sessionExpiration.getDate() + 7); // 7 días

      await prisma.session.create({
        data: {
          id: uuidv4(),
          userId: user.id,
          refreshToken,
          expiresAt: sessionExpiration,
          userAgent: sessionInfo?.userAgent,
          ipAddress: sessionInfo?.ipAddress,
          deviceInfo: sessionInfo?.userAgent // Simplificado
        }
      });

      logger.info(`Login exitoso para usuario: ${username}`, { 
        userId: user.id,
        ip: sessionInfo?.ipAddress 
      });

      return {
        user: userWithPermissions,
        accessToken,
        refreshToken
      };

    } catch (error) {
      logger.error('Error en login:', error);
      throw error;
    }
  }

  // Renovar access token usando refresh token
  async refreshToken(refreshToken: string) {
    try {
      // Verificar que el refresh token sea válido
      const decoded = verifyToken(refreshToken);
      
      if (decoded.type !== 'refresh') {
        throw new Error('Tipo de token inválido');
      }

      // Buscar la sesión en la base de datos
      const session = await prisma.session.findFirst({
        where: {
          refreshToken,
          isActive: true,
          isRevoked: false,
          expiresAt: {
            gt: new Date()
          }
        },
        include: {
          user: {
            include: {
              userRoles: {
                include: {
                  role: true
                }
              }
            }
          }
        }
      });

      if (!session || !session.user.isActive || session.user.isDeleted) {
        throw new Error('Sesión inválida o usuario inactivo');
      }

      // Actualizar última vez usado
      await prisma.session.update({
        where: { id: session.id },
        data: { lastUsed: new Date() }
      });

      // Obtener permisos actualizados
      const permissions = this.getUserPermissions(session.user.userRoles);
      
      const userWithPermissions = {
        ...session.user,
        permissions
      };

      // Generar nuevo access token
      const newAccessToken = generateAccessToken(userWithPermissions);

      logger.debug(`Token renovado para usuario: ${session.user.username}`);

      return {
        accessToken: newAccessToken
      };

    } catch (error) {
      logger.error('Error al renovar token:', error);
      throw error;
    }
  }

  // Logout - invalidar sesión específica
  async logout(refreshToken: string) {
    try {
      await prisma.session.updateMany({
        where: { refreshToken },
        data: {
          isActive: false,
          isRevoked: true
        }
      });

      logger.info('Logout exitoso');
    } catch (error) {
      logger.error('Error en logout:', error);
      throw error;
    }
  }

  // Logout de todos los dispositivos
  async logoutAllDevices(userId: number) {
    try {
      await prisma.session.updateMany({
        where: { userId },
        data: {
          isActive: false,
          isRevoked: true
        }
      });

      logger.info(`Logout de todos los dispositivos para usuario ID: ${userId}`);
    } catch (error) {
      logger.error('Error en logout de todos los dispositivos:', error);
      throw error;
    }
  }

  // Obtener detalles del usuario
  async getUserDetails(userId: number) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
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
                  description: true,
                  permissions: true
                }
              }
            }
          }
        }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      const permissions = this.getUserPermissions(user.userRoles);

      return {
        ...user,
        permissions,
        roles: user.userRoles.map(ur => ur.role)
      };

    } catch (error) {
      logger.error('Error al obtener detalles del usuario:', error);
      throw error;
    }
  }

  // Obtener sesiones activas del usuario
  async getUserSessions(userId: number) {
    try {
      const sessions = await prisma.session.findMany({
        where: {
          userId,
          isActive: true,
          isRevoked: false,
          expiresAt: {
            gt: new Date()
          }
        },
        select: {
          id: true,
          userAgent: true,
          ipAddress: true,
          deviceInfo: true,
          createdAt: true,
          lastUsed: true,
          expiresAt: true
        },
        orderBy: {
          lastUsed: 'desc'
        }
      });

      return sessions;
    } catch (error) {
      logger.error('Error al obtener sesiones del usuario:', error);
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