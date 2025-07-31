-- ============================================================================
-- SISTEMA SSO - INICIALIZACIÓN COMPLETA DE BASE DE DATOS
-- ============================================================================

-- Configuración inicial
SET timezone = 'UTC';
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. CREACIÓN DE TABLAS
-- ============================================================================

-- Tabla de usuarios
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP NULL,
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de roles
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de permisos
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    module VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    is_system BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de servicios registrados
CREATE TABLE registered_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    base_url VARCHAR(500) NOT NULL,
    health_check_url VARCHAR(500),
    version VARCHAR(50) DEFAULT '1.0.0',
    status VARCHAR(20) DEFAULT 'online',
    last_heartbeat TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de rutas de servicios
CREATE TABLE service_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID REFERENCES registered_services(id) ON DELETE CASCADE,
    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,
    description TEXT,
    required_permission VARCHAR(200),
    is_public BOOLEAN DEFAULT false,
    requires_auth BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(service_id, method, path)
);

-- Tabla de relaciones usuario-rol
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id),
    expires_at TIMESTAMP NULL,
    UNIQUE(user_id, role_id)
);

-- Tabla de relaciones rol-permiso
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(id),
    UNIQUE(role_id, permission_id)
);

-- Tabla de sesiones de usuario
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    refresh_token_hash VARCHAR(255) UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP NULL
);

-- Tabla de logs de auditoría
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. ÍNDICES PARA OPTIMIZACIÓN
-- ============================================================================

-- Índices para usuarios
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_users_last_login ON users(last_login_at);

-- Índices para roles
CREATE INDEX idx_roles_name ON roles(name);
CREATE INDEX idx_roles_active ON roles(is_active);

-- Índices para permisos
CREATE INDEX idx_permissions_name ON permissions(name);
CREATE INDEX idx_permissions_module ON permissions(module);

-- Índices para servicios
CREATE INDEX idx_services_name ON registered_services(name);
CREATE INDEX idx_services_status ON registered_services(status);
CREATE INDEX idx_services_heartbeat ON registered_services(last_heartbeat);

-- Índices para rutas
CREATE INDEX idx_routes_service ON service_routes(service_id);
CREATE INDEX idx_routes_method_path ON service_routes(method, path);

-- Índices para relaciones
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- Índices para sesiones
CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_sessions_active ON user_sessions(is_active);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

-- Índices para auditoría
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- ============================================================================
-- 3. TRIGGERS PARA AUDITORÍA Y TIMESTAMPS
-- ============================================================================

-- Función para actualizar timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para timestamps
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    
CREATE TRIGGER roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    
CREATE TRIGGER services_updated_at BEFORE UPDATE ON registered_services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 4. INSERTAR ROLES DEL SISTEMA
-- ============================================================================

INSERT INTO roles (id, name, display_name, description, is_system_role) VALUES
('11111111-1111-1111-1111-111111111111', 'super_admin', 'Super Administrador', 'Acceso completo al sistema SSO', true),
('22222222-2222-2222-2222-222222222222', 'admin', 'Administrador', 'Gestión completa excepto configuración de sistema', true),
('33333333-3333-3333-3333-333333333333', 'service_manager', 'Gestor de Servicios', 'Gestión de microservicios y configuración de rutas', true),
('44444444-4444-4444-4444-444444444444', 'user_manager', 'Gestor de Usuarios', 'Gestión de usuarios y asignación de roles', true),
('55555555-5555-5555-5555-555555555555', 'developer', 'Desarrollador', 'Acceso a servicios y monitoreo básico', true),
('66666666-6666-6666-6666-666666666666', 'user', 'Usuario', 'Permisos básicos de usuario final', true);

-- ============================================================================
-- 5. INSERTAR PERMISOS DEL SISTEMA
-- ============================================================================

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
('sso.tokens.revoke', 'Revocar Tokens', 'Revocar tokens de acceso', 'sso', 'revoke', 'tokens', true),

-- DASHBOARD Y REPORTES
('sso.dashboard.read', 'Ver Dashboard', 'Acceder al dashboard principal', 'sso', 'read', 'dashboard', true),
('sso.reports.read', 'Ver Reportes', 'Acceder a reportes del sistema', 'sso', 'read', 'reports', true);

-- ============================================================================
-- 6. ASIGNAR PERMISOS A ROLES
-- ============================================================================

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
    'sso.system.monitor', 'sso.system.logs', 'sso.dashboard.read'
);

-- USER MANAGER: GESTIÓN DE USUARIOS Y ROLES
INSERT INTO role_permissions (role_id, permission_id)
SELECT '44444444-4444-4444-4444-444444444444', p.id 
FROM permissions p 
WHERE p.name IN (
    'sso.users.create', 'sso.users.read', 'sso.users.update', 'sso.users.delete', 'sso.users.manage',
    'sso.roles.read', 'sso.roles.assign',
    'sso.permissions.read',
    'sso.sessions.read', 'sso.sessions.revoke', 'sso.dashboard.read'
);

-- DEVELOPER: ACCESO BÁSICO A SERVICIOS
INSERT INTO role_permissions (role_id, permission_id)
SELECT '55555555-5555-5555-5555-555555555555', p.id 
FROM permissions p 
WHERE p.name IN (
    'sso.services.read', 'sso.routes.read',
    'sso.system.monitor', 'sso.dashboard.read'
);

-- USER: PERMISOS BÁSICOS
INSERT INTO role_permissions (role_id, permission_id)
SELECT '66666666-6666-6666-6666-666666666666', p.id 
FROM permissions p 
WHERE p.name IN (
    'sso.dashboard.read'
);

-- ============================================================================
-- 7. CREAR USUARIO ADMINISTRADOR POR DEFECTO
-- ============================================================================

-- Password: admin123 (será hasheado por la aplicación)
INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, is_verified) 
VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'admin@sso.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewaAcLcv3hvh2.S2', -- admin123
    'Administrador',
    'Sistema',
    true,
    true
);

-- Asignar rol Super Admin al administrador
INSERT INTO user_roles (user_id, role_id)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111');

-- ============================================================================
-- 8. INSERTAR SERVICIOS DE EJEMPLO
-- ============================================================================

INSERT INTO registered_services (id, name, display_name, description, base_url, health_check_url, version) VALUES
('11111111-1111-1111-1111-111111111111', 'sso-admin', 'Panel de Administración SSO', 'Interfaz de administración del sistema SSO', 'http://localhost:3000', 'http://localhost:3000/api/health', '1.0.0');

-- ============================================================================
-- 9. INSERTAR RUTAS DE EJEMPLO PARA EL SSO ADMIN
-- ============================================================================

INSERT INTO service_routes (service_id, method, path, description, is_public, requires_auth) VALUES
((SELECT id FROM registered_services WHERE name = 'sso-admin'), 'GET', '/', 'Página principal', true, false),
((SELECT id FROM registered_services WHERE name = 'sso-admin'), 'POST', '/api/auth/login', 'Iniciar sesión', true, false),
((SELECT id FROM registered_services WHERE name = 'sso-admin'), 'GET', '/api/dashboard', 'Dashboard administrativo', false, true),
((SELECT id FROM registered_services WHERE name = 'sso-admin'), 'GET', '/api/users', 'Gestión de usuarios', false, true),
((SELECT id FROM registered_services WHERE name = 'sso-admin'), 'GET', '/api/roles', 'Gestión de roles', false, true),
((SELECT id FROM registered_services WHERE name = 'sso-admin'), 'GET', '/api/services', 'Gestión de servicios', false, true);

-- ============================================================================
-- 10. FUNCIONES AUXILIARES PARA VALIDACIÓN RÁPIDA
-- ============================================================================

-- Función para verificar permisos de usuario
CREATE OR REPLACE FUNCTION user_has_permission(user_uuid UUID, permission_name VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    has_perm BOOLEAN DEFAULT FALSE;
BEGIN
    SELECT EXISTS(
        SELECT 1 
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = user_uuid 
        AND p.name = permission_name
        AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
    ) INTO has_perm;
    
    RETURN has_perm;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener permisos de usuario
CREATE OR REPLACE FUNCTION get_user_permissions(user_uuid UUID)
RETURNS TABLE(permission_name VARCHAR, permission_display VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT p.name, p.display_name
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = user_uuid 
    AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MENSAJE FINAL DE INICIALIZACIÓN
-- ============================================================================

DO $$
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
    RAISE NOTICE '   Database Admin: http://localhost:8080';
    RAISE NOTICE '';
    RAISE NOTICE '✅ READY FOR MICROSERVICES INTEGRATION';
    RAISE NOTICE '========================================';
END $$;