-- SSO Microservice Database Schema
-- Crear extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Eliminar tablas si existen (para desarrollo)
DROP TABLE IF EXISTS service_route_permissions CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS service_routes CASCADE;
DROP TABLE IF EXISTS registered_services CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- TABLA DE USUARIOS
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA DE ROLES
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#6366f1',
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA DE PERMISOS
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    module VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    resource VARCHAR(50),
    is_system BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA RELACIONAL USUARIO-ROLES (muchos a muchos)
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    UNIQUE(user_id, role_id)
);

-- TABLA RELACIONAL ROL-PERMISOS (muchos a muchos)
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_id, permission_id)
);

-- TABLA DE SERVICIOS REGISTRADOS
CREATE TABLE registered_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    base_url VARCHAR(500) NOT NULL,
    health_check_url VARCHAR(500),
    version VARCHAR(20) DEFAULT '1.0.0',
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, error
    last_health_check TIMESTAMP,
    is_healthy BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA DE RUTAS POR SERVICIO
CREATE TABLE service_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES registered_services(id) ON DELETE CASCADE,
    method VARCHAR(10) NOT NULL, -- GET, POST, PUT, DELETE, etc.
    path VARCHAR(500) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    requires_auth BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA DE PERMISOS POR RUTA
CREATE TABLE service_route_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID NOT NULL REFERENCES service_routes(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(route_id, permission_id)
);

-- TABLA DE SESIONES ACTIVAS
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_jti VARCHAR(100) NOT NULL UNIQUE, -- JWT ID
    refresh_token VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    service_name VARCHAR(100),
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA DE AUDITORÍA
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    service_name VARCHAR(100),
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ÍNDICES PARA PERFORMANCE
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_users_last_login ON users(last_login);

CREATE INDEX idx_roles_name ON roles(name);
CREATE INDEX idx_roles_active ON roles(is_active);

CREATE INDEX idx_permissions_module ON permissions(module);
CREATE INDEX idx_permissions_name ON permissions(name);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);

CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);

CREATE INDEX idx_services_name ON registered_services(name);
CREATE INDEX idx_services_status ON registered_services(status);
CREATE INDEX idx_services_health ON registered_services(is_healthy);

CREATE INDEX idx_service_routes_service_id ON service_routes(service_id);
CREATE INDEX idx_service_routes_method_path ON service_routes(method, path);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token_jti ON user_sessions(token_jti);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_revoked ON user_sessions(is_revoked);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- TRIGGERS PARA UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at 
    BEFORE UPDATE ON roles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at 
    BEFORE UPDATE ON registered_services 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- FUNCIONES ÚTILES
CREATE OR REPLACE FUNCTION user_has_permission(
    p_user_id UUID,
    p_permission_name VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
    has_perm BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        JOIN role_permissions rp ON r.id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE u.id = p_user_id 
        AND p.name = p_permission_name
        AND u.is_active = true
        AND r.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
    ) INTO has_perm;
    
    RETURN has_perm;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE(
    permission_name VARCHAR,
    permission_display_name VARCHAR,
    module VARCHAR,
    action VARCHAR,
    resource VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        p.name,
        p.display_name,
        p.module,
        p.action,
        p.resource
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    JOIN role_permissions rp ON r.id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE u.id = p_user_id
    AND u.is_active = true
    AND r.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
    ORDER BY p.module, p.action;
END;
$$ LANGUAGE plpgsql;

-- INSERTAR DATOS INICIALES

-- 1. ROLES DEL SISTEMA
INSERT INTO roles (id, name, display_name, description, color, is_system) VALUES
('11111111-1111-1111-1111-111111111111', 'super_admin', 'Super Administrador', 'Acceso completo al sistema SSO', '#ef4444', true),
('22222222-2222-2222-2222-222222222222', 'admin', 'Administrador', 'Administrador del sistema con gestión completa', '#8b5cf6', true),
('33333333-3333-3333-3333-333333333333', 'service_manager', 'Gestor de Servicios', 'Gestiona microservicios y configuraciones', '#06b6d4', true),
('44444444-4444-4444-4444-444444444444', 'user_manager', 'Gestor de Usuarios', 'Gestiona usuarios y roles', '#10b981', true),
('55555555-5555-5555-5555-555555555555', 'developer', 'Desarrollador', 'Acceso de desarrollo a servicios', '#f59e0b', true),
('66666666-6666-6666-6666-666666666666', 'user', 'Usuario', 'Usuario estándar del sistema', '#6b7280', true);

-- 2. PERMISOS DEL SISTEMA SSO
INSERT INTO permissions (name, display_name, description, module, action, resource, is_system) VALUES
-- GESTIÓN DE USUARIOS
('sso.users.create', 'Crear Usuarios', 'Crear nuevos usuarios en el sistema', 'sso', 'create', 'users', true),
('sso.users.read', 'Ver Usuarios', 'Ver información de usuarios', 'sso', 'read', 'users', true),
('sso.users.update', 'Editar Usuarios', 'Modificar información de usuarios', 'sso', 'update', 'users', true),
('sso.users.delete', 'Eliminar Usuarios', 'Eliminar usuarios del sistema', 'sso', 'delete', 'users', true),
('sso.users.manage', 'Gestionar Usuarios', 'Gestión completa de usuarios', 'sso', 'manage', 'users', true),

-- GESTIÓN DE ROLES
('sso.roles.create', 'Crear Roles', 'Crear nuevos roles', 'sso', 'create', 'roles', true),
('sso.roles.read', 'Ver Roles', 'Ver roles del sistema', 'sso', 'read', 'roles', true),
('sso.roles.update', 'Editar Roles', 'Modificar roles existentes', 'sso', 'update', 'roles', true),
('sso.roles.delete', 'Eliminar Roles', 'Eliminar roles del sistema', 'sso', 'delete', 'roles', true),
('sso.roles.assign', 'Asignar Roles', 'Asignar roles a usuarios', 'sso', 'assign', 'roles', true),

-- GESTIÓN DE PERMISOS
('sso.permissions.create', 'Crear Permisos', 'Crear nuevos permisos', 'sso', 'create', 'permissions', true),
('sso.permissions.read', 'Ver Permisos', 'Ver permisos del sistema', 'sso', 'read', 'permissions', true),
('sso.permissions.update', 'Editar Permisos', 'Modificar permisos existentes', 'sso', 'update', 'permissions', true),
('sso.permissions.delete', 'Eliminar Permisos', 'Eliminar permisos del sistema', 'sso', 'delete', 'permissions', true),

-- GESTIÓN DE SERVICIOS
('sso.services.create', 'Registrar Servicios', 'Registrar nuevos microservicios', 'sso', 'create', 'services', true),
('sso.services.read', 'Ver Servicios', 'Ver microservicios registrados', 'sso', 'read', 'services', true),
('sso.services.update', 'Editar Servicios', 'Modificar configuración de servicios', 'sso', 'update', 'services', true),
('sso.services.delete', 'Eliminar Servicios', 'Eliminar servicios del registro', 'sso', 'delete', 'services', true),
('sso.services.health', 'Monitorear Servicios', 'Ver estado de salud de servicios', 'sso', 'monitor', 'services', true),

-- CONFIGURACIÓN DE RUTAS
('sso.routes.create', 'Crear Rutas', 'Definir rutas de servicios', 'sso', 'create', 'routes', true),
('sso.routes.read', 'Ver Rutas', 'Ver rutas configuradas', 'sso', 'read', 'routes', true),
('sso.routes.update', 'Editar Rutas', 'Modificar rutas existentes', 'sso', 'update', 'routes', true),
('sso.routes.delete', 'Eliminar Rutas', 'Eliminar rutas configuradas', 'sso', 'delete', 'routes', true),

-- ADMINISTRACIÓN DEL SISTEMA
('sso.system.settings', 'Configuración del Sistema', 'Acceder a configuración del sistema', 'sso', 'settings', 'system', true),
('sso.system.logs', 'Ver Logs del Sistema', 'Ver logs y auditoría del sistema', 'sso', 'logs', 'system', true),
('sso.system.monitor', 'Monitorear Sistema', 'Ver métricas y estado del sistema', 'sso', 'monitor', 'system', true),
('sso.system.backup', 'Respaldos del Sistema', 'Crear y restaurar respaldos', 'sso', 'backup', 'system', true),

-- SESIONES Y TOKENS
('sso.sessions.read', 'Ver Sesiones', 'Ver sesiones activas de usuarios', 'sso', 'read', 'sessions', true),
('sso.sessions.revoke', 'Revocar Sesiones', 'Revocar sesiones de usuarios', 'sso', 'revoke', 'sessions', true),
('sso.tokens.create', 'Crear Tokens', 'Generar tokens de acceso', 'sso', 'create', 'tokens', true),
('sso.tokens.revoke', 'Revocar Tokens', 'Revocar tokens de acceso', 'sso', 'revoke', 'tokens', true);

-- 3. ASIGNAR PERMISOS A ROLES

-- SUPER ADMIN: TODOS LOS PERMISOS
INSERT INTO role_permissions (role_id, permission_id)
SELECT '11111111-1111-1111-1111-111111111111', p.id 
FROM permissions p WHERE p.is_system = true;

-- ADMIN: GESTIÓN COMPLETA EXCEPTO BACKUP
INSERT INTO role_permissions (role_id, permission_id)
SELECT '22222222-2222-2222-2222-222222222222', p.id 
FROM permissions p 
WHERE p.is_system = true 
AND p.name NOT IN ('sso.system.backup');

-- SERVICE MANAGER: GESTIÓN DE SERVICIOS Y RUTAS
INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333333', p.id 
FROM permissions p 
WHERE p.name IN (
    'sso.services.create', 'sso.services.read', 'sso.services.update', 'sso.services.delete', 'sso.services.health',
    'sso.routes.create', 'sso.routes.read', 'sso.routes.update', 'sso.routes.delete',
    'sso.system.monitor', 'sso.system.logs'
);

-- USER MANAGER: GESTIÓN DE USUARIOS Y ROLES
INSERT INTO role_permissions (role_id, permission_id)
SELECT '44444444-4444-4444-4444-444444444444', p.id 
FROM permissions p 
WHERE p.name IN (
    'sso.users.create', 'sso.users.read', 'sso.users.update', 'sso.users.delete', 'sso.users.manage',
    'sso.roles.read', 'sso.roles.assign',
    'sso.permissions.read',
    'sso.sessions.read', 'sso.sessions.revoke'
);

-- DEVELOPER: ACCESO BÁSICO A SERVICIOS
INSERT INTO role_permissions (role_id, permission_id)
SELECT '55555555-5555-5555-5555-555555555555', p.id 
FROM permissions p 
WHERE p.name IN (
    'sso.services.read', 'sso.routes.read',
    'sso.system.monitor'
);

-- USER: PERMISOS BÁSICOS
INSERT INTO role_permissions (role_id, permission_id)
SELECT '66666666-6666-6666-6666-666666666666', p.id 
FROM permissions p 
WHERE p.name IN (
    'sso.services.read'
);

-- 4. CREAR USUARIO ADMINISTRADOR POR DEFECTO
-- Password: admin123 (hasheado con bcrypt)
INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, is_verified) 
VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'admin@sso.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewaAcLcvvhh2m.S2', -- admin123
    'Sistema',
    'Administrador',
    true,
    true
);

-- 5. ASIGNAR ROL SUPER ADMIN AL ADMINISTRADOR
INSERT INTO user_roles (user_id, role_id)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111');

-- 6. INSERTAR ALGUNOS SERVICIOS DE EJEMPLO
INSERT INTO registered_services (id, name, display_name, description, base_url, health_check_url, version) VALUES
('service1-1111-1111-1111-111111111111', 'sso-admin', 'Panel de Administración SSO', 'Interfaz de administración del sistema SSO', 'http://localhost:3000', 'http://localhost:3000/health', '1.0.0'),
('service2-2222-2222-2222-222222222222', 'example-api', 'API de Ejemplo', 'API de ejemplo para demostrar integración', 'http://example-service:3001', 'http://example-service:3001/health', '1.0.0');

-- 7. INSERTAR RUTAS DE EJEMPLO PARA EL SSO ADMIN
INSERT INTO service_routes (service_id, method, path, description, is_public, requires_auth) VALUES
((SELECT id FROM registered_services WHERE name = 'sso-admin'), 'GET', '/', 'Página principal', true, false),
((SELECT id FROM registered_services WHERE name = 'sso-admin'), 'POST', '/auth/login', 'Iniciar sesión', true, false),
((SELECT id FROM registered_services WHERE name = 'sso-admin'), 'GET', '/admin/dashboard', 'Dashboard administrativo', false, true),
((SELECT id FROM registered_services WHERE name = 'sso-admin'), 'GET', '/admin/users', 'Gestión de usuarios', false, true),
((SELECT id FROM registered_services WHERE name = 'sso-admin'), 'GET', '/admin/roles', 'Gestión de roles', false, true),
((SELECT id FROM registered_services WHERE name = 'sso-admin'), 'GET', '/admin/services', 'Gestión de servicios', false, true);

-- MENSAJE FINAL
DO $
DECLARE
    user_count INTEGER;
    role_count INTEGER;
    permission_count INTEGER;
    service_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO role_count FROM roles;
    SELECT COUNT(*) INTO permission_count FROM permissions;
    SELECT COUNT(*) INTO service_count FROM registered_services;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '🚀 SSO DATABASE INITIALIZED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Users created: %', user_count;
    RAISE NOTICE 'Roles created: %', role_count;
    RAISE NOTICE 'Permissions created: %', permission_count;
    RAISE NOTICE 'Services registered: %', service_count;
    RAISE NOTICE '';
    RAISE NOTICE '🔑 DEFAULT ADMIN CREDENTIALS:';
    RAISE NOTICE '   Email: admin@sso.com';
    RAISE NOTICE '   Password: admin123';
    RAISE NOTICE '';
    RAISE NOTICE '🌐 ACCESS POINTS:';
    RAISE NOTICE '   SSO System: http://localhost:3000';
    RAISE NOTICE '   Admin Panel: http://localhost:3000/admin';
    RAISE NOTICE '   API Docs: http://localhost:3000/api-docs';
    RAISE NOTICE '   Database Admin: http://localhost:5050';
    RAISE NOTICE '';
    RAISE NOTICE '✅ READY FOR MICROSERVICES INTEGRATION';
    RAISE NOTICE '========================================';
END $;