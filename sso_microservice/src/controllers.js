/**
 * ============================================================================
 * CONTROLADORES - LÓGICA DE NEGOCIO COMPLETA
 * ============================================================================
 * Todas las funciones de lógica de negocio para las APIs
 */

const axios = require('axios');
const db = require('./database');
const auth = require('./auth');
const { logger } = require('./utils');

// ============================================================================
// CONTROLADORES DE AUTENTICACIÓN
// ============================================================================

/**
 * Login de usuario
 */
async function loginUser(email, password, ipAddress, userAgent, rememberMe = false) {
    try {
        // Obtener usuario por email
        const user = await db.Users.getByEmail(email);
        
        if (!user) {
            // Log del intento fallido
            await db.AuditLogs.create(
                null,
                'login_failed',
                'user',
                null,
                { email, reason: 'user_not_found' },
                ipAddress,
                userAgent
            );
            
            return { success: false, message: 'Credenciales inválidas' };
        }

        // Verificar si el usuario está bloqueado
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            await db.AuditLogs.create(
                user.id,
                'login_blocked',
                'user',
                user.id,
                { email, reason: 'account_locked' },
                ipAddress,
                userAgent
            );
            
            const unlockTime = new Date(user.locked_until).toLocaleString();
            return { 
                success: false, 
                message: `Cuenta bloqueada hasta ${unlockTime}` 
            };
        }

        // Verificar password
        const passwordValid = await auth.verifyPassword(password, user.password_hash);
        
        if (!passwordValid) {
            // Incrementar intentos fallidos
            const failedAttempts = await db.Users.incrementFailedAttempts(user.id);
            
            await db.AuditLogs.create(
                user.id,
                'login_failed',
                'user',
                user.id,
                { 
                    email, 
                    reason: 'invalid_password',
                    failed_attempts: failedAttempts.failed_login_attempts
                },
                ipAddress,
                userAgent
            );
            
            return { success: false, message: 'Credenciales inválidas' };
        }

        // Verificar si el usuario está activo
        if (!user.is_active) {
            await db.AuditLogs.create(
                user.id,
                'login_failed',
                'user',
                user.id,
                { email, reason: 'account_disabled' },
                ipAddress,
                userAgent
            );
            
            return { success: false, message: 'Cuenta desactivada' };
        }

        // Generar tokens
        const tokens = await auth.generateTokenPair(user);
        
        // Crear sesión
        await auth.createUserSession(
            user.id,
            tokens.accessToken,
            tokens.refreshToken,
            ipAddress,
            userAgent
        );

        // Actualizar último login
        await db.Users.updateLastLogin(user.id);

        // Obtener permisos del usuario
        const permissions = await db.Permissions.getUserPermissions(user.id);

        // Log del login exitoso
        await db.AuditLogs.create(
            user.id,
            'login_success',
            'user',
            user.id,
            { email, remember_me: rememberMe },
            ipAddress,
            userAgent
        );

        return {
            success: true,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                isActive: user.is_active,
                isVerified: user.is_verified,
                lastLogin: user.last_login_at
            },
            tokens,
            permissions: permissions.map(p => p.name)
        };

    } catch (error) {
        logger.error('Login error:', error);
        throw error;
    }
}

/**
 * Logout de usuario
 */
async function logoutUser(userId, token) {
    try {
        // Revocar sesión
        await auth.revokeSession(token);

        // Log del logout
        await db.AuditLogs.create(
            userId,
            'logout',
            'user',
            userId,
            {},
            null,
            null
        );

        return { success: true };
    } catch (error) {
        logger.error('Logout error:', error);
        throw error;
    }
}

/**
 * Renovar token
 */
async function refreshToken(refreshToken) {
    try {
        // Verificar refresh token
        const decoded = auth.verifyRefreshToken(refreshToken);
        
        if (!decoded) {
            return { success: false, message: 'Refresh token inválido' };
        }

        // Obtener usuario
        const user = await db.Users.getById(decoded.userId);
        
        if (!user || !user.is_active) {
            return { success: false, message: 'Usuario no encontrado o inactivo' };
        }

        // Generar nuevo access token
        const newAccessToken = auth.generateAccessToken({
            userId: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name
        });

        return {
            success: true,
            accessToken: newAccessToken
        };

    } catch (error) {
        logger.error('Refresh token error:', error);
        return { success: false, message: 'Error renovando token' };
    }
}

// ============================================================================
// CONTROLADORES DE USUARIOS
// ============================================================================

/**
 * Obtener usuarios con filtros y paginación
 */
async function getUsers({ page, limit, search, status, role }) {
    try {
        return await db.Users.getAll({ page, limit, search, status, role });
    } catch (error) {
        logger.error('Get users error:', error);
        throw error;
    }
}

/**
 * Obtener usuario por ID
 */
async function getUserById(id) {
    try {
        const user = await db.Users.getById(id);
        if (user) {
            // Obtener roles del usuario
            const roles = await db.UserRoles.getUserRoles(id);
            user.roles = roles;
        }
        return user;
    } catch (error) {
        logger.error('Get user by ID error:', error);
        throw error;
    }
}

/**
 * Crear usuario
 */
async function createUser(userData, createdBy) {
    try {
        const { email, password, firstName, lastName, roleIds = [] } = userData;

        // Hashear password
        const passwordHash = await auth.hashPassword(password);

        // Crear usuario
        const user = await db.Users.create({
            email,
            passwordHash,
            firstName,
            lastName
        });

        // Asignar roles si se proporcionaron
        if (roleIds.length > 0) {
            await db.UserRoles.assignToUser(user.id, roleIds, createdBy);
        }

        // Log de creación
        await db.AuditLogs.create(
            createdBy,
            'user_created',
            'user',
            user.id,
            { email, firstName, lastName, roleIds },
            null,
            null
        );

        return user;
    } catch (error) {
        logger.error('Create user error:', error);
        throw error;
    }
}

/**
 * Actualizar usuario
 */
async function updateUser(id, updateData, updatedBy) {
    try {
        const { password, ...otherData } = updateData;

        // Si se incluye password, hashearlo
        if (password) {
            otherData.password_hash = await auth.hashPassword(password);
        }

        // Actualizar usuario
        const user = await db.Users.update(id, otherData);

        if (user) {
            // Log de actualización
            await db.AuditLogs.create(
                updatedBy,
                'user_updated',
                'user',
                id,
                { updated_fields: Object.keys(updateData) },
                null,
                null
            );
        }

        return user;
    } catch (error) {
        logger.error('Update user error:', error);
        throw error;
    }
}

/**
 * Eliminar usuario
 */
async function deleteUser(id, deletedBy) {
    try {
        const deleted = await db.Users.delete(id);

        if (deleted) {
            // Revocar todas las sesiones del usuario
            await auth.revokeAllUserSessions(id);

            // Log de eliminación
            await db.AuditLogs.create(
                deletedBy,
                'user_deleted',
                'user',
                id,
                {},
                null,
                null
            );
        }

        return deleted;
    } catch (error) {
        logger.error('Delete user error:', error);
        throw error;
    }
}

/**
 * Asignar roles a usuario
 */
async function assignRolesToUser(userId, roleIds, assignedBy) {
    try {
        const result = await db.UserRoles.assignToUser(userId, roleIds, assignedBy);

        // Log de asignación
        await db.AuditLogs.create(
            assignedBy,
            'roles_assigned',
            'user',
            userId,
            { roleIds },
            null,
            null
        );

        return result;
    } catch (error) {
        logger.error('Assign roles error:', error);
        throw error;
    }
}

/**
 * Obtener actividad de usuario
 */
async function getUserActivity(userId, { page, limit }) {
    try {
        return await db.AuditLogs.getAll({ page, limit, userId });
    } catch (error) {
        logger.error('Get user activity error:', error);
        throw error;
    }
}

/**
 * Obtener permisos de usuario
 */
async function getUserPermissions(userId) {
    try {
        return await db.Permissions.getUserPermissions(userId);
    } catch (error) {
        logger.error('Get user permissions error:', error);
        throw error;
    }
}

// ============================================================================
// CONTROLADORES DE ROLES
// ============================================================================

/**
 * Obtener roles
 */
async function getRoles(includePermissions = false) {
    try {
        return await db.Roles.getAll(includePermissions);
    } catch (error) {
        logger.error('Get roles error:', error);
        throw error;
    }
}

/**
 * Obtener rol por ID
 */
async function getRoleById(id) {
    try {
        return await db.Roles.getById(id);
    } catch (error) {
        logger.error('Get role by ID error:', error);
        throw error;
    }
}

/**
 * Crear rol
 */
async function createRole(roleData, createdBy) {
    try {
        const { name, displayName, description, permissionIds = [] } = roleData;

        // Crear rol
        const role = await db.Roles.create({
            name,
            displayName,
            description
        });

        // Asignar permisos si se proporcionaron
        if (permissionIds.length > 0) {
            await db.RolePermissions.assignToRole(role.id, permissionIds, createdBy);
        }

        // Log de creación
        await db.AuditLogs.create(
            createdBy,
            'role_created',
            'role',
            role.id,
            { name, displayName, permissionIds },
            null,
            null
        );

        return role;
    } catch (error) {
        logger.error('Create role error:', error);
        throw error;
    }
}

/**
 * Actualizar rol
 */
async function updateRole(id, updateData, updatedBy) {
    try {
        const role = await db.Roles.update(id, updateData);

        if (role) {
            // Log de actualización
            await db.AuditLogs.create(
                updatedBy,
                'role_updated',
                'role',
                id,
                { updated_fields: Object.keys(updateData) },
                null,
                null
            );
        }

        return role;
    } catch (error) {
        logger.error('Update role error:', error);
        throw error;
    }
}

/**
 * Eliminar rol
 */
async function deleteRole(id, deletedBy) {
    try {
        const deleted = await db.Roles.delete(id);

        if (deleted) {
            // Log de eliminación
            await db.AuditLogs.create(
                deletedBy,
                'role_deleted',
                'role',
                id,
                {},
                null,
                null
            );
        }

        return deleted;
    } catch (error) {
        logger.error('Delete role error:', error);
        throw error;
    }
}

/**
 * Asignar permisos a rol
 */
async function assignPermissionsToRole(roleId, permissionIds, grantedBy) {
    try {
        const result = await db.RolePermissions.assignToRole(roleId, permissionIds, grantedBy);

        // Log de asignación
        await db.AuditLogs.create(
            grantedBy,
            'permissions_assigned',
            'role',
            roleId,
            { permissionIds },
            null,
            null
        );

        return result;
    } catch (error) {
        logger.error('Assign permissions error:', error);
        throw error;
    }
}

/**
 * Clonar rol
 */
async function cloneRole(sourceId, name, displayName, clonedBy) {
    try {
        const clonedRole = await db.Roles.clone(sourceId, name, displayName);

        // Log de clonación
        await db.AuditLogs.create(
            clonedBy,
            'role_cloned',
            'role',
            clonedRole.id,
            { source_role_id: sourceId, name, displayName },
            null,
            null
        );

        return clonedRole;
    } catch (error) {
        logger.error('Clone role error:', error);
        throw error;
    }
}

// ============================================================================
// CONTROLADORES DE PERMISOS
// ============================================================================

/**
 * Obtener permisos
 */
async function getPermissions({ module, grouped = false }) {
    try {
        return await db.Permissions.getAll({ module, grouped });
    } catch (error) {
        logger.error('Get permissions error:', error);
        throw error;
    }
}

/**
 * Crear permiso
 */
async function createPermission(permissionData, createdBy) {
    try {
        const permission = await db.Permissions.create(permissionData);

        // Log de creación
        await db.AuditLogs.create(
            createdBy,
            'permission_created',
            'permission',
            permission.id,
            permissionData,
            null,
            null
        );

        return permission;
    } catch (error) {
        logger.error('Create permission error:', error);
        throw error;
    }
}

// ============================================================================
// CONTROLADORES DE SERVICIOS
// ============================================================================

/**
 * Obtener servicios
 */
async function getServices({ includeRoutes = false, status }) {
    try {
        return await db.Services.getAll({ includeRoutes, status });
    } catch (error) {
        logger.error('Get services error:', error);
        throw error;
    }
}

/**
 * Registrar servicio
 */
async function registerService(serviceData) {
    try {
        const service = await db.Services.register(serviceData);

        // Log de registro
        await db.AuditLogs.create(
            null, // Sistema automático
            'service_registered',
            'service',
            service.id,
            serviceData,
            null,
            null
        );

        return service;
    } catch (error) {
        logger.error('Register service error:', error);
        throw error;
    }
}

/**
 * Actualizar servicio
 */
async function updateService(id, updateData, updatedBy) {
    try {
        const service = await db.Services.update(id, updateData);

        if (service) {
            // Log de actualización
            await db.AuditLogs.create(
                updatedBy,
                'service_updated',
                'service',
                id,
                { updated_fields: Object.keys(updateData) },
                null,
                null
            );
        }

        return service;
    } catch (error) {
        logger.error('Update service error:', error);
        throw error;
    }
}

/**
 * Actualizar heartbeat de servicio
 */
async function updateServiceHeartbeat(serviceId, status, metadata) {
    try {
        await db.Services.updateHeartbeat(serviceId, status, metadata);
        return { success: true };
    } catch (error) {
        logger.error('Update service heartbeat error:', error);
        throw error;
    }
}

/**
 * Obtener rutas de servicio
 */
async function getServiceRoutes(serviceId) {
    try {
        return await db.ServiceRoutes.getByServiceId(serviceId);
    } catch (error) {
        logger.error('Get service routes error:', error);
        throw error;
    }
}

/**
 * Auto-descubrir rutas de servicio
 */
async function discoverServiceRoutes(serviceId) {
    try {
        const service = await db.Services.getById(serviceId);
        
        if (!service) {
            throw new Error('Servicio no encontrado');
        }

        // Intentar obtener rutas del servicio mediante su API
        let discoveredRoutes = [];

        try {
            // Intentar endpoints comunes de documentación
            const possibleEndpoints = [
                `${service.base_url}/api/routes`,
                `${service.base_url}/routes`,
                `${service.base_url}/api-docs`,
                `${service.base_url}/swagger.json`,
                `${service.base_url}/openapi.json`
            ];

            for (const endpoint of possibleEndpoints) {
                try {
                    const response = await axios.get(endpoint, { timeout: 5000 });
                    
                    if (response.data && Array.isArray(response.data)) {
                        discoveredRoutes = response.data;
                        break;
                    } else if (response.data && response.data.paths) {
                        // Formato OpenAPI/Swagger
                        discoveredRoutes = parseOpenAPIRoutes(response.data.paths);
                        break;
                    }
                } catch (err) {
                    // Continuar con el siguiente endpoint
                    continue;
                }
            }

            // Si no se encontraron rutas, devolver rutas básicas sugeridas
            if (discoveredRoutes.length === 0) {
                discoveredRoutes = generateDefaultRoutes(service.name);
            }

        } catch (error) {
            logger.warn(`Error discovering routes for service ${service.name}:`, error.message);
            discoveredRoutes = generateDefaultRoutes(service.name);
        }

        return discoveredRoutes;
    } catch (error) {
        logger.error('Discover service routes error:', error);
        throw error;
    }
}

/**
 * Configurar rutas de servicio
 */
async function configureServiceRoutes(serviceId, routes, configuredBy) {
    try {
        const result = await db.ServiceRoutes.createMultiple(serviceId, routes);

        // Log de configuración
        await db.AuditLogs.create(
            configuredBy,
            'service_routes_configured',
            'service',
            serviceId,
            { routes_count: routes.length },
            null,
            null
        );

        return result;
    } catch (error) {
        logger.error('Configure service routes error:', error);
        throw error;
    }
}

// ============================================================================
// CONTROLADORES DE DASHBOARD
// ============================================================================

/**
 * Obtener estadísticas del dashboard
 */
async function getDashboardStats() {
    try {
        return await db.Stats.getDashboardStats();
    } catch (error) {
        logger.error('Get dashboard stats error:', error);
        throw error;
    }
}

/**
 * Obtener actividad reciente
 */
async function getRecentActivity(limit = 10) {
    try {
        return await db.Stats.getRecentActivity(limit);
    } catch (error) {
        logger.error('Get recent activity error:', error);
        throw error;
    }
}

/**
 * Obtener alertas del sistema
 */
async function getSystemAlerts() {
    try {
        return await db.Stats.getSystemAlerts();
    } catch (error) {
        logger.error('Get system alerts error:', error);
        throw error;
    }
}

/**
 * Obtener estadísticas del sistema
 */
async function getSystemStats() {
    try {
        const dbStats = await db.Stats.getDashboardStats();
        
        return {
            ...dbStats,
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                node_version: process.version,
                platform: process.platform,
                environment: process.env.NODE_ENV || 'development'
            },
            database: {
                connected: await db.checkConnection()
            },
            redis: {
                connected: !!auth.getRedisClient()
            }
        };
    } catch (error) {
        logger.error('Get system stats error:', error);
        throw error;
    }
}

// ============================================================================
// CONTROLADORES DE MONITOREO
// ============================================================================

/**
 * Obtener logs de auditoría
 */
async function getAuditLogs({ page, limit, level, action, userId }) {
    try {
        return await db.AuditLogs.getAll({ page, limit, level, action, userId });
    } catch (error) {
        logger.error('Get audit logs error:', error);
        throw error;
    }
}

/**
 * Obtener métricas del sistema
 */
async function getSystemMetrics(period = '24h') {
    try {
        // Calcular intervalo basado en el período
        let intervalHours = 24;
        switch (period) {
            case '1h':
                intervalHours = 1;
                break;
            case '6h':
                intervalHours = 6;
                break;
            case '24h':
                intervalHours = 24;
                break;
            case '7d':
                intervalHours = 24 * 7;
                break;
            case '30d':
                intervalHours = 24 * 30;
                break;
        }

        // Obtener métricas de la base de datos
        const result = await db.query(`
            SELECT 
                DATE_TRUNC('hour', created_at) as hour,
                action,
                COUNT(*) as count
            FROM audit_logs 
            WHERE created_at >= NOW() - INTERVAL '${intervalHours} hours'
            GROUP BY DATE_TRUNC('hour', created_at), action
            ORDER BY hour
        `);

        // Procesar métricas para el frontend
        const metrics = {
            period,
            data: result.rows,
            summary: {
                total_actions: result.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
                unique_hours: [...new Set(result.rows.map(row => row.hour))].length
            }
        };

        return metrics;
    } catch (error) {
        logger.error('Get system metrics error:', error);
        throw error;
    }
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Parsear rutas de formato OpenAPI
 */
function parseOpenAPIRoutes(paths) {
    const routes = [];
    
    Object.keys(paths).forEach(path => {
        const pathObj = paths[path];
        
        Object.keys(pathObj).forEach(method => {
            if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
                const operation = pathObj[method];
                
                routes.push({
                    method: method.toUpperCase(),
                    path: path,
                    description: operation.summary || operation.description || `${method.toUpperCase()} ${path}`,
                    required_permission: generatePermissionName(path, method),
                    is_public: operation.security === undefined || operation.security.length === 0,
                    requires_auth: !(operation.security === undefined || operation.security.length === 0)
                });
            }
        });
    });
    
    return routes;
}

/**
 * Generar rutas por defecto para un servicio
 */
function generateDefaultRoutes(serviceName) {
    const baseResource = serviceName.replace(/-service$/, '').replace(/-api$/, '');
    
    return [
        {
            method: 'GET',
            path: '/health',
            description: 'Health check del servicio',
            required_permission: null,
            is_public: true,
            requires_auth: false
        },
        {
            method: 'GET',
            path: `/api/${baseResource}`,
            description: `Listar ${baseResource}`,
            required_permission: `${baseResource}.read`,
            is_public: false,
            requires_auth: true
        },
        {
            method: 'POST',
            path: `/api/${baseResource}`,
            description: `Crear ${baseResource}`,
            required_permission: `${baseResource}.create`,
            is_public: false,
            requires_auth: true
        },
        {
            method: 'GET',
            path: `/api/${baseResource}/:id`,
            description: `Obtener ${baseResource} específico`,
            required_permission: `${baseResource}.read`,
            is_public: false,
            requires_auth: true
        },
        {
            method: 'PUT',
            path: `/api/${baseResource}/:id`,
            description: `Actualizar ${baseResource}`,
            required_permission: `${baseResource}.update`,
            is_public: false,
            requires_auth: true
        },
        {
            method: 'DELETE',
            path: `/api/${baseResource}/:id`,
            description: `Eliminar ${baseResource}`,
            required_permission: `${baseResource}.delete`,
            is_public: false,
            requires_auth: true
        }
    ];
}

/**
 * Generar nombre de permiso basado en ruta y método
 */
function generatePermissionName(path, method) {
    // Extraer recurso de la ruta
    const pathParts = path.split('/').filter(part => part && !part.startsWith(':') && part !== 'api');
    const resource = pathParts[0] || 'resource';
    
    // Mapear método a acción
    const actionMap = {
        'GET': 'read',
        'POST': 'create',
        'PUT': 'update',
        'PATCH': 'update',
        'DELETE': 'delete'
    };
    
    const action = actionMap[method.toUpperCase()] || 'access';
    
    return `${resource}.${action}`;
}

// ============================================================================
// EXPORTAR CONTROLADORES
// ============================================================================

module.exports = {
    // Autenticación
    loginUser,
    logoutUser,
    refreshToken,
    
    // Usuarios
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    assignRolesToUser,
    getUserActivity,
    getUserPermissions,
    
    // Roles
    getRoles,
    getRoleById,
    createRole,
    updateRole,
    deleteRole,
    assignPermissionsToRole,
    cloneRole,
    
    // Permisos
    getPermissions,
    createPermission,
    
    // Servicios
    getServices,
    registerService,
    updateService,
    updateServiceHeartbeat,
    getServiceRoutes,
    discoverServiceRoutes,
    configureServiceRoutes,
    
    // Dashboard
    getDashboardStats,
    getRecentActivity,
    getSystemAlerts,
    getSystemStats,
    
    // Monitoreo
    getAuditLogs,
    getSystemMetrics
};