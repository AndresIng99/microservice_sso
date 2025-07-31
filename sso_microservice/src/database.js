/**
 * ============================================================================
 * MÓDULO DE BASE DE DATOS - PostgreSQL + MODELOS COMPLETOS
 * ============================================================================
 * Conexión y funciones para todos los modelos del sistema
 */

const { Pool } = require('pg');
const { logger } = require('./utils');

// Configuración de la conexión
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'sso_system',
    user: process.env.DB_USER || 'sso_admin',
    password: process.env.DB_PASSWORD || 'password',
    max: 20, // máximo número de conexiones
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Manejo de eventos del pool
pool.on('connect', (client) => {
    logger.debug('Nueva conexión establecida');
});

pool.on('error', (err, client) => {
    logger.error('Error inesperado en cliente idle', err);
    process.exit(-1);
});

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Verificar conexión a la base de datos
 */
async function checkConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        return true;
    } catch (error) {
        logger.error('Error verificando conexión:', error);
        return false;
    }
}

/**
 * Ejecutar query con manejo de errores
 */
async function query(text, params = []) {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        logger.debug('Query ejecutado', { text, duration, rows: result.rowCount });
        return result;
    } catch (error) {
        logger.error('Error ejecutando query:', { text, params, error: error.message });
        throw error;
    }
}

/**
 * Ejecutar transacción
 */
async function transaction(callback) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// MODELOS DE USUARIOS
// ============================================================================

const Users = {
    /**
     * Crear usuario
     */
    async create(userData) {
        const { email, passwordHash, firstName, lastName } = userData;
        
        const result = await query(`
            INSERT INTO users (email, password_hash, first_name, last_name)
            VALUES ($1, $2, $3, $4)
            RETURNING id, email, first_name, last_name, is_active, created_at
        `, [email, passwordHash, firstName, lastName]);
        
        return result.rows[0];
    },

    /**
     * Obtener usuario por ID
     */
    async getById(id) {
        const result = await query(`
            SELECT id, email, first_name, last_name, is_active, is_verified,
                   last_login_at, created_at, updated_at
            FROM users
            WHERE id = $1
        `, [id]);
        
        return result.rows[0];
    },

    /**
     * Obtener usuario por email
     */
    async getByEmail(email) {
        const result = await query(`
            SELECT id, email, password_hash, first_name, last_name, is_active, 
                   is_verified, failed_login_attempts, locked_until, last_login_at
            FROM users
            WHERE email = $1
        `, [email]);
        
        return result.rows[0];
    },

    /**
     * Obtener usuarios con paginación y filtros
     */
    async getAll({ page = 1, limit = 10, search, status, role }) {
        let whereConditions = [];
        let params = [];
        let paramIndex = 1;

        // Filtro de búsqueda
        if (search) {
            whereConditions.push(`(u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Filtro de estado
        if (status) {
            whereConditions.push(`u.is_active = $${paramIndex}`);
            params.push(status === 'active');
            paramIndex++;
        }

        // Filtro de rol
        if (role) {
            whereConditions.push(`ur.role_id = $${paramIndex}`);
            params.push(role);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        // Calcular offset
        const offset = (page - 1) * limit;
        params.push(limit, offset);

        const query_text = `
            SELECT DISTINCT u.id, u.email, u.first_name, u.last_name, u.is_active,
                   u.last_login_at, u.created_at,
                   COALESCE(
                       JSON_AGG(
                           JSON_BUILD_OBJECT(
                               'id', r.id,
                               'name', r.name,
                               'display_name', r.display_name
                           )
                       ) FILTER (WHERE r.id IS NOT NULL), 
                       '[]'
                   ) as roles
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            ${whereClause}
            GROUP BY u.id, u.email, u.first_name, u.last_name, u.is_active, u.last_login_at, u.created_at
            ORDER BY u.created_at DESC
            LIMIT $${paramIndex - 1} OFFSET $${paramIndex}
        `;

        const result = await query(query_text, params);

        // Contar total
        const countQuery = `
            SELECT COUNT(DISTINCT u.id) as total
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            ${whereClause}
        `;

        const countResult = await query(countQuery, params.slice(0, -2));
        const total = parseInt(countResult.rows[0].total);

        return {
            users: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    /**
     * Actualizar usuario
     */
    async update(id, updateData) {
        const fields = [];
        const params = [];
        let paramIndex = 1;

        // Construir campos dinámicamente
        Object.keys(updateData).forEach(key => {
            if (key === 'password_hash') {
                fields.push(`password_hash = $${paramIndex}`);
            } else if (key === 'first_name') {
                fields.push(`first_name = $${paramIndex}`);
            } else if (key === 'last_name') {
                fields.push(`last_name = $${paramIndex}`);
            } else if (key === 'is_active') {
                fields.push(`is_active = $${paramIndex}`);
            } else if (key === 'is_verified') {
                fields.push(`is_verified = $${paramIndex}`);
            }
            
            params.push(updateData[key]);
            paramIndex++;
        });

        if (fields.length === 0) {
            throw new Error('No hay campos para actualizar');
        }

        params.push(id);

        const result = await query(`
            UPDATE users 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING id, email, first_name, last_name, is_active, updated_at
        `, params);

        return result.rows[0];
    },

    /**
     * Eliminar usuario
     */
    async delete(id) {
        const result = await query(`
            DELETE FROM users
            WHERE id = $1 AND id != 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
            RETURNING id
        `, [id]);

        return result.rowCount > 0;
    },

    /**
     * Actualizar último login
     */
    async updateLastLogin(id) {
        await query(`
            UPDATE users 
            SET last_login_at = CURRENT_TIMESTAMP, 
                failed_login_attempts = 0,
                locked_until = NULL
            WHERE id = $1
        `, [id]);
    },

    /**
     * Incrementar intentos fallidos de login
     */
    async incrementFailedAttempts(id) {
        const result = await query(`
            UPDATE users 
            SET failed_login_attempts = failed_login_attempts + 1,
                locked_until = CASE 
                    WHEN failed_login_attempts + 1 >= 5 
                    THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'
                    ELSE locked_until
                END
            WHERE id = $1
            RETURNING failed_login_attempts, locked_until
        `, [id]);

        return result.rows[0];
    }
};

// ============================================================================
// MODELOS DE ROLES
// ============================================================================

const Roles = {
    /**
     * Crear rol
     */
    async create(roleData) {
        const { name, displayName, description } = roleData;
        
        const result = await query(`
            INSERT INTO roles (name, display_name, description)
            VALUES ($1, $2, $3)
            RETURNING id, name, display_name, description, created_at
        `, [name, displayName, description]);
        
        return result.rows[0];
    },

    /**
     * Obtener todos los roles
     */
    async getAll(includePermissions = false) {
        let query_text = `
            SELECT r.id, r.name, r.display_name, r.description, r.is_system_role, r.is_active,
                   r.created_at, r.updated_at,
                   COUNT(ur.user_id) as user_count
            FROM roles r
            LEFT JOIN user_roles ur ON r.id = ur.role_id
            WHERE r.is_active = true
            GROUP BY r.id, r.name, r.display_name, r.description, r.is_system_role, r.is_active, r.created_at, r.updated_at
            ORDER BY r.is_system_role DESC, r.created_at ASC
        `;

        if (includePermissions) {
            query_text = `
                SELECT r.id, r.name, r.display_name, r.description, r.is_system_role, r.is_active,
                       r.created_at, r.updated_at,
                       COUNT(DISTINCT ur.user_id) as user_count,
                       COALESCE(
                           JSON_AGG(
                               JSON_BUILD_OBJECT(
                                   'id', p.id,
                                   'name', p.name,
                                   'display_name', p.display_name,
                                   'module', p.module,
                                   'action', p.action,
                                   'resource', p.resource
                               )
                           ) FILTER (WHERE p.id IS NOT NULL), 
                           '[]'
                       ) as permissions
                FROM roles r
                LEFT JOIN user_roles ur ON r.id = ur.role_id
                LEFT JOIN role_permissions rp ON r.id = rp.role_id
                LEFT JOIN permissions p ON rp.permission_id = p.id
                WHERE r.is_active = true
                GROUP BY r.id, r.name, r.display_name, r.description, r.is_system_role, r.is_active, r.created_at, r.updated_at
                ORDER BY r.is_system_role DESC, r.created_at ASC
            `;
        }

        const result = await query(query_text);
        return result.rows;
    },

    /**
     * Obtener rol por ID
     */
    async getById(id) {
        const result = await query(`
            SELECT r.id, r.name, r.display_name, r.description, r.is_system_role, r.is_active,
                   r.created_at, r.updated_at,
                   COUNT(DISTINCT ur.user_id) as user_count,
                   COALESCE(
                       JSON_AGG(
                           JSON_BUILD_OBJECT(
                               'id', p.id,
                               'name', p.name,
                               'display_name', p.display_name,
                               'module', p.module,
                               'action', p.action,
                               'resource', p.resource
                           )
                       ) FILTER (WHERE p.id IS NOT NULL), 
                       '[]'
                   ) as permissions
            FROM roles r
            LEFT JOIN user_roles ur ON r.id = ur.role_id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            WHERE r.id = $1
            GROUP BY r.id, r.name, r.display_name, r.description, r.is_system_role, r.is_active, r.created_at, r.updated_at
        `, [id]);

        return result.rows[0];
    },

    /**
     * Actualizar rol
     */
    async update(id, updateData) {
        const { displayName, description } = updateData;
        
        const result = await query(`
            UPDATE roles 
            SET display_name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3 AND is_system_role = false
            RETURNING id, name, display_name, description, updated_at
        `, [displayName, description, id]);

        return result.rows[0];
    },

    /**
     * Eliminar rol
     */
    async delete(id) {
        const result = await query(`
            DELETE FROM roles
            WHERE id = $1 AND is_system_role = false
            RETURNING id
        `, [id]);

        return result.rowCount > 0;
    },

    /**
     * Clonar rol
     */
    async clone(sourceId, newName, newDisplayName) {
        return await transaction(async (client) => {
            // Crear nuevo rol
            const roleResult = await client.query(`
                INSERT INTO roles (name, display_name, description)
                SELECT $1, $2, description
                FROM roles
                WHERE id = $3
                RETURNING id, name, display_name, description, created_at
            `, [newName, newDisplayName, sourceId]);

            const newRole = roleResult.rows[0];

            // Copiar permisos
            await client.query(`
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT $1, permission_id
                FROM role_permissions
                WHERE role_id = $2
            `, [newRole.id, sourceId]);

            return newRole;
        });
    }
};

// ============================================================================
// MODELOS DE PERMISOS
// ============================================================================

const Permissions = {
    /**
     * Obtener todos los permisos
     */
    async getAll({ module, grouped = false }) {
        let whereClause = '';
        let params = [];

        if (module) {
            whereClause = 'WHERE module = $1';
            params.push(module);
        }

        const query_text = `
            SELECT id, name, display_name, description, module, action, resource, is_system, created_at
            FROM permissions
            ${whereClause}
            ORDER BY module, resource, action
        `;

        const result = await query(query_text, params);

        if (grouped) {
            // Agrupar por módulo
            const grouped_permissions = {};
            result.rows.forEach(permission => {
                if (!grouped_permissions[permission.module]) {
                    grouped_permissions[permission.module] = {};
                }
                if (!grouped_permissions[permission.module][permission.resource]) {
                    grouped_permissions[permission.module][permission.resource] = [];
                }
                grouped_permissions[permission.module][permission.resource].push(permission);
            });
            return grouped_permissions;
        }

        return result.rows;
    },

    /**
     * Crear permiso
     */
    async create(permissionData) {
        const { name, displayName, description, module, action, resource } = permissionData;
        
        const result = await query(`
            INSERT INTO permissions (name, display_name, description, module, action, resource, is_system)
            VALUES ($1, $2, $3, $4, $5, $6, false)
            RETURNING id, name, display_name, description, module, action, resource, created_at
        `, [name, displayName, description, module, action, resource]);
        
        return result.rows[0];
    },

    /**
     * Obtener permisos de usuario
     */
    async getUserPermissions(userId) {
        const result = await query(`
            SELECT DISTINCT p.name, p.display_name, p.module, p.action, p.resource
            FROM user_roles ur
            JOIN role_permissions rp ON ur.role_id = rp.role_id
            JOIN permissions p ON rp.permission_id = p.id
            WHERE ur.user_id = $1 
            AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
            ORDER BY p.module, p.resource, p.action
        `, [userId]);

        return result.rows;
    },

    /**
     * Verificar si usuario tiene permiso específico
     */
    async userHasPermission(userId, permissionName) {
        const result = await query(`
            SELECT user_has_permission($1, $2) as has_permission
        `, [userId, permissionName]);

        return result.rows[0].has_permission;
    }
};

// ============================================================================
// MODELOS DE SERVICIOS
// ============================================================================

const Services = {
    /**
     * Registrar servicio
     */
    async register(serviceData) {
        const { name, displayName, description, baseUrl, healthCheckUrl, version, metadata = {} } = serviceData;
        
        const result = await query(`
            INSERT INTO registered_services (name, display_name, description, base_url, health_check_url, version, metadata, last_heartbeat)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
            ON CONFLICT (name) 
            DO UPDATE SET 
                display_name = EXCLUDED.display_name,
                description = EXCLUDED.description,
                base_url = EXCLUDED.base_url,
                health_check_url = EXCLUDED.health_check_url,
                version = EXCLUDED.version,
                metadata = EXCLUDED.metadata,
                last_heartbeat = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, name, display_name, description, base_url, version, created_at
        `, [name, displayName, description, baseUrl, healthCheckUrl, version, JSON.stringify(metadata)]);
        
        return result.rows[0];
    },

    /**
     * Obtener todos los servicios
     */
    async getAll({ includeRoutes = false, status }) {
        let whereClause = '';
        let params = [];

        if (status) {
            whereClause = 'WHERE status = $1';
            params.push(status);
        }

        let query_text = `
            SELECT id, name, display_name, description, base_url, health_check_url, version, 
                   status, last_heartbeat, metadata, created_at, updated_at,
                   CASE 
                       WHEN last_heartbeat > CURRENT_TIMESTAMP - INTERVAL '2 minutes' THEN 'online'
                       WHEN last_heartbeat > CURRENT_TIMESTAMP - INTERVAL '10 minutes' THEN 'warning'
                       ELSE 'offline'
                   END as health_status
            FROM registered_services
            ${whereClause}
            ORDER BY created_at DESC
        `;

        if (includeRoutes) {
            query_text = `
                SELECT s.id, s.name, s.display_name, s.description, s.base_url, s.health_check_url, 
                       s.version, s.status, s.last_heartbeat, s.metadata, s.created_at, s.updated_at,
                       CASE 
                           WHEN s.last_heartbeat > CURRENT_TIMESTAMP - INTERVAL '2 minutes' THEN 'online'
                           WHEN s.last_heartbeat > CURRENT_TIMESTAMP - INTERVAL '10 minutes' THEN 'warning'
                           ELSE 'offline'
                       END as health_status,
                       COALESCE(
                           JSON_AGG(
                               JSON_BUILD_OBJECT(
                                   'id', sr.id,
                                   'method', sr.method,
                                   'path', sr.path,
                                   'description', sr.description,
                                   'required_permission', sr.required_permission,
                                   'is_public', sr.is_public,
                                   'requires_auth', sr.requires_auth
                               )
                           ) FILTER (WHERE sr.id IS NOT NULL), 
                           '[]'
                       ) as routes
                FROM registered_services s
                LEFT JOIN service_routes sr ON s.id = sr.service_id
                ${whereClause}
                GROUP BY s.id, s.name, s.display_name, s.description, s.base_url, s.health_check_url, 
                         s.version, s.status, s.last_heartbeat, s.metadata, s.created_at, s.updated_at
                ORDER BY s.created_at DESC
            `;
        }

        const result = await query(query_text, params);
        return result.rows;
    },

    /**
     * Obtener servicio por ID
     */
    async getById(id) {
        const result = await query(`
            SELECT id, name, display_name, description, base_url, health_check_url, version, 
                   status, last_heartbeat, metadata, created_at, updated_at
            FROM registered_services
            WHERE id = $1
        `, [id]);

        return result.rows[0];
    },

    /**
     * Actualizar servicio
     */
    async update(id, updateData) {
        const fields = [];
        const params = [];
        let paramIndex = 1;

        Object.keys(updateData).forEach(key => {
            if (['display_name', 'description', 'base_url', 'health_check_url', 'version', 'status'].includes(key)) {
                fields.push(`${key} = $${paramIndex}`);
                params.push(updateData[key]);
                paramIndex++;
            } else if (key === 'metadata') {
                fields.push(`metadata = $${paramIndex}`);
                params.push(JSON.stringify(updateData[key]));
                paramIndex++;
            }
        });

        if (fields.length === 0) {
            return null;
        }

        params.push(id);

        const result = await query(`
            UPDATE registered_services 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING id, name, display_name, description, base_url, version, updated_at
        `, params);

        return result.rows[0];
    },

    /**
     * Actualizar heartbeat
     */
    async updateHeartbeat(serviceId, status = 'online', metadata = {}) {
        await query(`
            UPDATE registered_services 
            SET last_heartbeat = CURRENT_TIMESTAMP, status = $1, metadata = $2
            WHERE id = $3
        `, [status, JSON.stringify(metadata), serviceId]);
    },

    /**
     * Eliminar servicio
     */
    async delete(id) {
        const result = await query(`
            DELETE FROM registered_services
            WHERE id = $1
            RETURNING id
        `, [id]);

        return result.rowCount > 0;
    }
};

// ============================================================================
// MODELOS DE RUTAS DE SERVICIOS
// ============================================================================

const ServiceRoutes = {
    /**
     * Obtener rutas de servicio
     */
    async getByServiceId(serviceId) {
        const result = await query(`
            SELECT id, method, path, description, required_permission, is_public, requires_auth, created_at
            FROM service_routes
            WHERE service_id = $1
            ORDER BY method, path
        `, [serviceId]);

        return result.rows;
    },

    /**
     * Crear múltiples rutas
     */
    async createMultiple(serviceId, routes) {
        return await transaction(async (client) => {
            // Eliminar rutas existentes
            await client.query('DELETE FROM service_routes WHERE service_id = $1', [serviceId]);

            // Insertar nuevas rutas
            const insertPromises = routes.map(route => {
                return client.query(`
                    INSERT INTO service_routes (service_id, method, path, description, required_permission, is_public, requires_auth)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING id, method, path, description, required_permission, is_public, requires_auth
                `, [serviceId, route.method, route.path, route.description, route.required_permission, route.is_public, route.requires_auth]);
            });

            const results = await Promise.all(insertPromises);
            return results.map(result => result.rows[0]);
        });
    }
};

// ============================================================================
// MODELOS DE RELACIONES
// ============================================================================

const UserRoles = {
    /**
     * Asignar roles a usuario
     */
    async assignToUser(userId, roleIds, assignedBy) {
        return await transaction(async (client) => {
            // Eliminar roles existentes
            await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);

            // Asignar nuevos roles
            const insertPromises = roleIds.map(roleId => {
                return client.query(`
                    INSERT INTO user_roles (user_id, role_id, assigned_by)
                    VALUES ($1, $2, $3)
                    RETURNING id, user_id, role_id, assigned_at
                `, [userId, roleId, assignedBy]);
            });

            const results = await Promise.all(insertPromises);
            return results.map(result => result.rows[0]);
        });
    },

    /**
     * Obtener roles de usuario
     */
    async getUserRoles(userId) {
        const result = await query(`
            SELECT r.id, r.name, r.display_name, r.description, ur.assigned_at
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = $1
            ORDER BY r.name
        `, [userId]);

        return result.rows;
    }
};

const RolePermissions = {
    /**
     * Asignar permisos a rol
     */
    async assignToRole(roleId, permissionIds, grantedBy) {
        return await transaction(async (client) => {
            // Eliminar permisos existentes
            await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

            // Asignar nuevos permisos
            const insertPromises = permissionIds.map(permissionId => {
                return client.query(`
                    INSERT INTO role_permissions (role_id, permission_id, granted_by)
                    VALUES ($1, $2, $3)
                    RETURNING id, role_id, permission_id, granted_at
                `, [roleId, permissionId, grantedBy]);
            });

            const results = await Promise.all(insertPromises);
            return results.map(result => result.rows[0]);
        });
    }
};

// ============================================================================
// MODELOS DE SESIONES
// ============================================================================

const UserSessions = {
    /**
     * Crear sesión
     */
    async create(userId, tokenHash, refreshTokenHash, ipAddress, userAgent, expiresAt) {
        const result = await query(`
            INSERT INTO user_sessions (user_id, token_hash, refresh_token_hash, ip_address, user_agent, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, created_at
        `, [userId, tokenHash, refreshTokenHash, ipAddress, userAgent, expiresAt]);

        return result.rows[0];
    },

    /**
     * Validar sesión
     */
    async validate(tokenHash) {
        const result = await query(`
            SELECT us.id, us.user_id, us.expires_at, u.is_active
            FROM user_sessions us
            JOIN users u ON us.user_id = u.id
            WHERE us.token_hash = $1 AND us.is_active = true AND us.expires_at > CURRENT_TIMESTAMP
        `, [tokenHash]);

        return result.rows[0];
    },

    /**
     * Revocar sesión
     */
    async revoke(tokenHash) {
        const result = await query(`
            UPDATE user_sessions 
            SET is_active = false, revoked_at = CURRENT_TIMESTAMP
            WHERE token_hash = $1
            RETURNING id
        `, [tokenHash]);

        return result.rowCount > 0;
    },

    /**
     * Revocar todas las sesiones de usuario
     */
    async revokeAllForUser(userId) {
        const result = await query(`
            UPDATE user_sessions 
            SET is_active = false, revoked_at = CURRENT_TIMESTAMP
            WHERE user_id = $1 AND is_active = true
            RETURNING id
        `, [userId]);

        return result.rowCount;
    },

    /**
     * Limpiar sesiones expiradas
     */
    async cleanExpired() {
        const result = await query(`
            UPDATE user_sessions 
            SET is_active = false, revoked_at = CURRENT_TIMESTAMP
            WHERE expires_at < CURRENT_TIMESTAMP AND is_active = true
            RETURNING id
        `);

        return result.rowCount;
    }
};

// ============================================================================
// MODELOS DE AUDITORÍA
// ============================================================================

const AuditLogs = {
    /**
     * Crear log de auditoría
     */
    async create(userId, action, resourceType, resourceId, details, ipAddress, userAgent) {
        const result = await query(`
            INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, created_at
        `, [userId, action, resourceType, resourceId, JSON.stringify(details), ipAddress, userAgent]);

        return result.rows[0];
    },

    /**
     * Obtener logs con paginación y filtros
     */
    async getAll({ page = 1, limit = 50, level, action, userId }) {
        let whereConditions = [];
        let params = [];
        let paramIndex = 1;

        if (action) {
            whereConditions.push(`action = $${paramIndex}`);
            params.push(action);
            paramIndex++;
        }

        if (userId) {
            whereConditions.push(`user_id = $${paramIndex}`);
            params.push(userId);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        const offset = (page - 1) * limit;
        params.push(limit, offset);

        const result = await query(`
            SELECT al.id, al.action, al.resource_type, al.resource_id, al.details, 
                   al.ip_address, al.user_agent, al.created_at,
                   u.first_name, u.last_name, u.email
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ${whereClause}
            ORDER BY al.created_at DESC
            LIMIT $${paramIndex - 1} OFFSET $${paramIndex}
        `, params);

        // Contar total
        const countResult = await query(`
            SELECT COUNT(*) as total
            FROM audit_logs al
            ${whereClause}
        `, params.slice(0, -2));

        const total = parseInt(countResult.rows[0].total);

        return {
            logs: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }
};

// ============================================================================
// FUNCIONES DE ESTADÍSTICAS
// ============================================================================

const Stats = {
    /**
     * Obtener estadísticas del dashboard
     */
    async getDashboardStats() {
        const result = await query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
                (SELECT COUNT(*) FROM roles WHERE is_active = true) as total_roles,
                (SELECT COUNT(*) FROM registered_services) as total_services,
                (SELECT COUNT(*) FROM registered_services WHERE last_heartbeat > CURRENT_TIMESTAMP - INTERVAL '2 minutes') as online_services,
                (SELECT COUNT(*) FROM user_sessions WHERE is_active = true AND expires_at > CURRENT_TIMESTAMP) as active_sessions,
                (SELECT COUNT(*) FROM audit_logs WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as actions_24h
        `);

        return result.rows[0];
    },

    /**
     * Obtener actividad reciente
     */
    async getRecentActivity(limit = 10) {
        const result = await query(`
            SELECT al.action, al.resource_type, al.created_at,
                   u.first_name, u.last_name, u.email
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT $1
        `, [limit]);

        return result.rows;
    },

    /**
     * Obtener alertas del sistema
     */
    async getSystemAlerts() {
        const result = await query(`
            SELECT 
                'offline_services' as type,
                'Servicios desconectados' as title,
                'Hay ' || COUNT(*) || ' servicios que no han enviado heartbeat en los últimos 5 minutos' as message,
                'warning' as severity,
                CURRENT_TIMESTAMP as created_at
            FROM registered_services 
            WHERE last_heartbeat < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
            HAVING COUNT(*) > 0
            
            UNION ALL
            
            SELECT 
                'failed_logins' as type,
                'Intentos de login fallidos' as title,
                'Se detectaron ' || COUNT(*) || ' intentos de login fallidos en la última hora' as message,
                'info' as severity,
                CURRENT_TIMESTAMP as created_at
            FROM audit_logs 
            WHERE action = 'login_failed' AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
            HAVING COUNT(*) > 10
            
            UNION ALL
            
            SELECT 
                'high_activity' as type,
                'Alta actividad detectada' as title,
                'Se registraron ' || COUNT(*) || ' acciones en la última hora' as message,
                'info' as severity,
                CURRENT_TIMESTAMP as created_at
            FROM audit_logs 
            WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
            HAVING COUNT(*) > 100
            
            ORDER BY created_at DESC
        `);

        return result.rows;
    },

    /**
     * Obtener métricas de uso por período
     */
    async getUsageMetrics(period = '24h') {
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

        const result = await query(`
            WITH time_series AS (
                SELECT 
                    generate_series(
                        NOW() - INTERVAL '${intervalHours} hours',
                        NOW(),
                        INTERVAL '1 hour'
                    ) AS hour
            ),
            hourly_stats AS (
                SELECT 
                    DATE_TRUNC('hour', al.created_at) as hour,
                    COUNT(*) as total_actions,
                    COUNT(DISTINCT al.user_id) as unique_users,
                    COUNT(CASE WHEN al.action = 'login_success' THEN 1 END) as successful_logins,
                    COUNT(CASE WHEN al.action = 'login_failed' THEN 1 END) as failed_logins
                FROM audit_logs al
                WHERE al.created_at >= NOW() - INTERVAL '${intervalHours} hours'
                GROUP BY DATE_TRUNC('hour', al.created_at)
            )
            SELECT 
                ts.hour,
                COALESCE(hs.total_actions, 0) as total_actions,
                COALESCE(hs.unique_users, 0) as unique_users,
                COALESCE(hs.successful_logins, 0) as successful_logins,
                COALESCE(hs.failed_logins, 0) as failed_logins
            FROM time_series ts
            LEFT JOIN hourly_stats hs ON ts.hour = hs.hour
            ORDER BY ts.hour
        `);

        return result.rows;
    },

    /**
     * Obtener servicios más utilizados
     */
    async getTopServices(limit = 10) {
        const result = await query(`
            SELECT 
                rs.name,
                rs.display_name,
                COUNT(al.id) as access_count,
                COUNT(DISTINCT al.user_id) as unique_users,
                MAX(al.created_at) as last_access
            FROM registered_services rs
            LEFT JOIN audit_logs al ON al.details->>'service_name' = rs.name
            WHERE al.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
            GROUP BY rs.id, rs.name, rs.display_name
            ORDER BY access_count DESC
            LIMIT $1
        `, [limit]);

        return result.rows;
    },

    /**
     * Obtener usuarios más activos
     */
    async getTopUsers(limit = 10) {
        const result = await query(`
            SELECT 
                u.id,
                u.first_name,
                u.last_name,
                u.email,
                COUNT(al.id) as action_count,
                MAX(al.created_at) as last_activity
            FROM users u
            JOIN audit_logs al ON u.id = al.user_id
            WHERE al.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
            GROUP BY u.id, u.first_name, u.last_name, u.email
            ORDER BY action_count DESC
            LIMIT $1
        `, [limit]);

        return result.rows;
    }
};

// ============================================================================
// FUNCIONES DE MANTENIMIENTO Y UTILIDADES
// ============================================================================

const Maintenance = {
    /**
     * Limpiar datos antiguos
     */
    async cleanupOldData(retentionDays = 30) {
        const results = {};

        // Limpiar logs de auditoría antiguos
        const auditResult = await query(`
            DELETE FROM audit_logs 
            WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${retentionDays} days'
            RETURNING id
        `);
        results.deletedAuditLogs = auditResult.rowCount;

        // Limpiar sesiones expiradas
        const sessionsResult = await UserSessions.cleanExpired();
        results.deletedSessions = sessionsResult;

        return results;
    },

    /**
     * Obtener estadísticas de la base de datos
     */
    async getDatabaseStats() {
        const result = await query(`
            SELECT 
                schemaname,
                tablename,
                n_tup_ins as inserts,
                n_tup_upd as updates,
                n_tup_del as deletes,
                n_live_tup as live_tuples,
                n_dead_tup as dead_tuples
            FROM pg_stat_user_tables 
            WHERE schemaname = 'public'
            ORDER BY n_live_tup DESC
        `);

        return result.rows;
    },

    /**
     * Verificar integridad referencial
     */
    async checkIntegrity() {
        const checks = [];

        // Verificar usuarios sin roles
        const usersWithoutRoles = await query(`
            SELECT COUNT(*) as count
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            WHERE ur.user_id IS NULL AND u.is_active = true
        `);
        checks.push({
            check: 'users_without_roles',
            count: parseInt(usersWithoutRoles.rows[0].count),
            status: usersWithoutRoles.rows[0].count == 0 ? 'OK' : 'WARNING'
        });

        // Verificar roles sin permisos
        const rolesWithoutPermissions = await query(`
            SELECT COUNT(*) as count
            FROM roles r
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            WHERE rp.role_id IS NULL AND r.is_active = true AND r.is_system_role = false
        `);
        checks.push({
            check: 'roles_without_permissions',
            count: parseInt(rolesWithoutPermissions.rows[0].count),
            status: rolesWithoutPermissions.rows[0].count == 0 ? 'OK' : 'WARNING'
        });

        // Verificar servicios sin rutas
        const servicesWithoutRoutes = await query(`
            SELECT COUNT(*) as count
            FROM registered_services rs
            LEFT JOIN service_routes sr ON rs.id = sr.service_id
            WHERE sr.service_id IS NULL
        `);
        checks.push({
            check: 'services_without_routes',
            count: parseInt(servicesWithoutRoutes.rows[0].count),
            status: servicesWithoutRoutes.rows[0].count == 0 ? 'OK' : 'INFO'
        });

        return checks;
    },

    /**
     * Optimizar base de datos
     */
    async optimizeDatabase() {
        const results = [];

        try {
            // Actualizar estadísticas
            await query('ANALYZE');
            results.push({ operation: 'analyze', status: 'completed' });

            // Vacuum de tablas principales
            const tables = ['users', 'roles', 'permissions', 'user_roles', 'role_permissions', 'audit_logs', 'user_sessions'];
            
            for (const table of tables) {
                await query(`VACUUM ${table}`);
                results.push({ operation: `vacuum_${table}`, status: 'completed' });
            }

        } catch (error) {
            logger.error('Error during database optimization:', error);
            results.push({ operation: 'optimization', status: 'error', error: error.message });
        }

        return results;
    }
};

// ============================================================================
// FUNCIONES DE RESPALDO Y RESTAURACIÓN
// ============================================================================

const Backup = {
    /**
     * Crear respaldo de configuración
     */
    async createConfigBackup() {
        const backup = {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            data: {}
        };

        // Respaldar roles del sistema
        backup.data.roles = await query(`
            SELECT name, display_name, description, is_system_role
            FROM roles 
            WHERE is_system_role = true
        `);

        // Respaldar permisos del sistema
        backup.data.permissions = await query(`
            SELECT name, display_name, description, module, action, resource
            FROM permissions 
            WHERE is_system = true
        `);

        // Respaldar asignaciones de permisos a roles del sistema
        backup.data.role_permissions = await query(`
            SELECT r.name as role_name, p.name as permission_name
            FROM role_permissions rp
            JOIN roles r ON rp.role_id = r.id
            JOIN permissions p ON rp.permission_id = p.id
            WHERE r.is_system_role = true
        `);

        return backup;
    },

    /**
     * Restaurar configuración desde respaldo
     */
    async restoreConfigBackup(backupData) {
        return await transaction(async (client) => {
            const results = [];

            // Restaurar roles
            for (const role of backupData.data.roles.rows) {
                await client.query(`
                    INSERT INTO roles (name, display_name, description, is_system_role)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (name) DO UPDATE SET
                        display_name = EXCLUDED.display_name,
                        description = EXCLUDED.description
                `, [role.name, role.display_name, role.description, role.is_system_role]);
            }
            results.push({ operation: 'restore_roles', count: backupData.data.roles.rowCount });

            // Restaurar permisos
            for (const permission of backupData.data.permissions.rows) {
                await client.query(`
                    INSERT INTO permissions (name, display_name, description, module, action, resource, is_system)
                    VALUES ($1, $2, $3, $4, $5, $6, true)
                    ON CONFLICT (name) DO UPDATE SET
                        display_name = EXCLUDED.display_name,
                        description = EXCLUDED.description,
                        module = EXCLUDED.module,
                        action = EXCLUDED.action,
                        resource = EXCLUDED.resource
                `, [permission.name, permission.display_name, permission.description, permission.module, permission.action, permission.resource]);
            }
            results.push({ operation: 'restore_permissions', count: backupData.data.permissions.rowCount });

            // Restaurar asignaciones de permisos
            for (const assignment of backupData.data.role_permissions.rows) {
                await client.query(`
                    INSERT INTO role_permissions (role_id, permission_id)
                    SELECT r.id, p.id
                    FROM roles r, permissions p
                    WHERE r.name = $1 AND p.name = $2
                    ON CONFLICT (role_id, permission_id) DO NOTHING
                `, [assignment.role_name, assignment.permission_name]);
            }
            results.push({ operation: 'restore_role_permissions', count: backupData.data.role_permissions.rowCount });

            return results;
        });
    }
};

// ============================================================================
// EXPORTAR MÓDULOS
// ============================================================================

module.exports = {
    // Funciones de conexión
    checkConnection,
    query,
    transaction,
    
    // Modelos principales
    Users,
    Roles,
    Permissions,
    Services,
    ServiceRoutes,
    UserRoles,
    RolePermissions,
    UserSessions,
    AuditLogs,
    Stats,
    
    // Utilidades
    Maintenance,
    Backup,
    
    // Pool para uso directo si es necesario
    pool,

    // Función para cerrar conexiones
    async closePool() {
        await pool.end();
        logger.info('Pool de conexiones de base de datos cerrado');
    }
};