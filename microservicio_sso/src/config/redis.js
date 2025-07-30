const { createClient } = require('redis');
const logger = require('../utils/logger');

class RedisClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            // Configuración del cliente Redis
            this.client = createClient({
                url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
                
                // Configuraciones de conexión
                socket: {
                    connectTimeout: 5000,
                    lazyConnect: true,
                    reconnectStrategy: (retries) => {
                        // Estrategia de reconexión exponencial
                        const delay = Math.min(retries * 50, 3000);
                        logger.warn(`Redis reconectando en ${delay}ms (intento ${retries})`);
                        return delay;
                    }
                },
                
                // Configuraciones adicionales
                database: 0,
                username: process.env.REDIS_USERNAME || undefined,
                password: process.env.REDIS_PASSWORD || undefined,
                
                // Configuraciones de comandos
                commandsQueueMaxLength: 1000,
                disableOfflineQueue: false
            });

            // Event listeners
            this.client.on('connect', () => {
                logger.info('🔗 Conectando a Redis...');
            });

            this.client.on('ready', () => {
                this.isConnected = true;
                logger.info('✅ Redis conectado y listo');
            });

            this.client.on('error', (error) => {
                this.isConnected = false;
                logger.error('❌ Error de Redis:', error);
            });

            this.client.on('end', () => {
                this.isConnected = false;
                logger.info('📴 Conexión a Redis cerrada');
            });

            this.client.on('reconnecting', () => {
                logger.info('🔄 Redis reconectando...');
            });

            // Conectar
            await this.client.connect();
            
            // Probar conexión
            await this.client.ping();
            
            logger.info('✅ Conexión a Redis establecida exitosamente');
            return true;
            
        } catch (error) {
            this.isConnected = false;
            logger.warn('⚠️ Redis no disponible:', error.message);
            // No lanzar error, el sistema puede funcionar sin Redis
            return false;
        }
    }

    async disconnect() {
        try {
            if (this.client && this.isConnected) {
                await this.client.quit();
                this.isConnected = false;
                logger.info('✅ Redis desconectado correctamente');
            }
        } catch (error) {
            logger.error('❌ Error desconectando Redis:', error);
        }
    }

    async ping() {
        if (!this.isConnected) {
            throw new Error('Redis no conectado');
        }
        return await this.client.ping();
    }

    // =================== OPERACIONES BÁSICAS ===================

    async get(key) {
        if (!this.isConnected) return null;
        
        try {
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            logger.error(`❌ Error obteniendo clave ${key}:`, error);
            return null;
        }
    }

    async set(key, value, ttl = null) {
        if (!this.isConnected) return false;
        
        try {
            const serializedValue = JSON.stringify(value);
            
            if (ttl) {
                await this.client.setEx(key, ttl, serializedValue);
            } else {
                await this.client.set(key, serializedValue);
            }
            
            return true;
        } catch (error) {
            logger.error(`❌ Error estableciendo clave ${key}:`, error);
            return false;
        }
    }

    async del(key) {
        if (!this.isConnected) return false;
        
        try {
            const result = await this.client.del(key);
            return result > 0;
        } catch (error) {
            logger.error(`❌ Error eliminando clave ${key}:`, error);
            return false;
        }
    }

    async exists(key) {
        if (!this.isConnected) return false;
        
        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            logger.error(`❌ Error verificando existencia de ${key}:`, error);
            return false;
        }
    }

    async expire(key, ttl) {
        if (!this.isConnected) return false;
        
        try {
            const result = await this.client.expire(key, ttl);
            return result === 1;
        } catch (error) {
            logger.error(`❌ Error estableciendo TTL para ${key}:`, error);
            return false;
        }
    }

    async ttl(key) {
        if (!this.isConnected) return -1;
        
        try {
            return await this.client.ttl(key);
        } catch (error) {
            logger.error(`❌ Error obteniendo TTL de ${key}:`, error);
            return -1;
        }
    }

    // =================== OPERACIONES DE HASH ===================

    async hSet(key, field, value) {
        if (!this.isConnected) return false;
        
        try {
            await this.client.hSet(key, field, JSON.stringify(value));
            return true;
        } catch (error) {
            logger.error(`❌ Error en hSet ${key}.${field}:`, error);
            return false;
        }
    }

    async hGet(key, field) {
        if (!this.isConnected) return null;
        
        try {
            const value = await this.client.hGet(key, field);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            logger.error(`❌ Error en hGet ${key}.${field}:`, error);
            return null;
        }
    }

    async hGetAll(key) {
        if (!this.isConnected) return {};
        
        try {
            const hash = await this.client.hGetAll(key);
            const result = {};
            
            for (const [field, value] of Object.entries(hash)) {
                try {
                    result[field] = JSON.parse(value);
                } catch {
                    result[field] = value;
                }
            }
            
            return result;
        } catch (error) {
            logger.error(`❌ Error en hGetAll ${key}:`, error);
            return {};
        }
    }

    async hDel(key, field) {
        if (!this.isConnected) return false;
        
        try {
            const result = await this.client.hDel(key, field);
            return result > 0;
        } catch (error) {
            logger.error(`❌ Error en hDel ${key}.${field}:`, error);
            return false;
        }
    }

    // =================== OPERACIONES DE SETS ===================

    async sAdd(key, ...members) {
        if (!this.isConnected) return false;
        
        try {
            const serializedMembers = members.map(m => JSON.stringify(m));
            await this.client.sAdd(key, serializedMembers);
            return true;
        } catch (error) {
            logger.error(`❌ Error en sAdd ${key}:`, error);
            return false;
        }
    }

    async sMembers(key) {
        if (!this.isConnected) return [];
        
        try {
            const members = await this.client.sMembers(key);
            return members.map(m => {
                try {
                    return JSON.parse(m);
                } catch {
                    return m;
                }
            });
        } catch (error) {
            logger.error(`❌ Error en sMembers ${key}:`, error);
            return [];
        }
    }

    async sRem(key, member) {
        if (!this.isConnected) return false;
        
        try {
            const result = await this.client.sRem(key, JSON.stringify(member));
            return result > 0;
        } catch (error) {
            logger.error(`❌ Error en sRem ${key}:`, error);
            return false;
        }
    }

    // =================== CACHE ESPECÍFICO PARA SSO ===================

    // Cache de usuarios
    async cacheUser(userId, userData, ttl = 3600) {
        return await this.set(`user:${userId}`, userData, ttl);
    }

    async getCachedUser(userId) {
        return await this.get(`user:${userId}`);
    }

    async invalidateUserCache(userId) {
        return await this.del(`user:${userId}`);
    }

    // Cache de permisos
    async cacheUserPermissions(userId, permissions, ttl = 1800) {
        return await this.set(`permissions:${userId}`, permissions, ttl);
    }

    async getCachedUserPermissions(userId) {
        return await this.get(`permissions:${userId}`);
    }

    async invalidateUserPermissions(userId) {
        return await this.del(`permissions:${userId}`);
    }

    // Blacklist de tokens JWT
    async blacklistToken(jti, ttl) {
        return await this.set(`blacklist:${jti}`, true, ttl);
    }

    async isTokenBlacklisted(jti) {
        return await this.exists(`blacklist:${jti}`);
    }

    // Sesiones activas
    async storeSession(sessionId, sessionData, ttl = 86400) {
        return await this.set(`session:${sessionId}`, sessionData, ttl);
    }

    async getSession(sessionId) {
        return await this.get(`session:${sessionId}`);
    }

    async deleteSession(sessionId) {
        return await this.del(`session:${sessionId}`);
    }

    // Rate limiting
    async incrementRateLimit(key, ttl = 900) {
        if (!this.isConnected) return 1;
        
        try {
            const current = await this.client.incr(key);
            if (current === 1) {
                await this.client.expire(key, ttl);
            }
            return current;
        } catch (error) {
            logger.error(`❌ Error en rate limit ${key}:`, error);
            return 1;
        }
    }

    // Cache de servicios registrados
    async cacheServiceHealth(serviceName, healthData, ttl = 300) {
        return await this.set(`service_health:${serviceName}`, healthData, ttl);
    }

    async getCachedServiceHealth(serviceName) {
        return await this.get(`service_health:${serviceName}`);
    }

    // Estadísticas en tiempo real
    async incrementCounter(key, amount = 1) {
        if (!this.isConnected) return amount;
        
        try {
            return await this.client.incrBy(key, amount);
        } catch (error) {
            logger.error(`❌ Error incrementando contador ${key}:`, error);
            return amount;
        }
    }

    async getCounter(key) {
        if (!this.isConnected) return 0;
        
        try {
            const value = await this.client.get(key);
            return parseInt(value) || 0;
        } catch (error) {
            logger.error(`❌ Error obteniendo contador ${key}:`, error);
            return 0;
        }
    }

    // =================== UTILIDADES ===================

    async flushAll() {
        if (!this.isConnected) return false;
        
        try {
            await this.client.flushAll();
            logger.info('🧹 Cache Redis limpiado completamente');
            return true;
        } catch (error) {
            logger.error('❌ Error limpiando cache Redis:', error);
            return false;
        }
    }

    async getStats() {
        if (!this.isConnected) {
            return {
                connected: false,
                error: 'Redis not connected'
            };
        }
        
        try {
            const info = await this.client.info();
            const dbSize = await this.client.dbSize();
            
            return {
                connected: this.isConnected,
                database_keys: dbSize,
                memory_usage: this.parseRedisInfo(info, 'used_memory_human'),
                connections: this.parseRedisInfo(info, 'connected_clients'),
                uptime: this.parseRedisInfo(info, 'uptime_in_seconds'),
                version: this.parseRedisInfo(info, 'redis_version')
            };
        } catch (error) {
            logger.error('❌ Error obteniendo estadísticas de Redis:', error);
            return {
                connected: false,
                error: error.message
            };
        }
    }

    parseRedisInfo(info, key) {
        const lines = info.split('\r\n');
        const line = lines.find(l => l.startsWith(`${key}:`));
        return line ? line.split(':')[1] : 'N/A';
    }

    async healthCheck() {
        try {
            if (!this.isConnected) {
                return {
                    status: 'disconnected',
                    connected: false,
                    timestamp: new Date().toISOString()
                };
            }

            await this.ping();
            const stats = await this.getStats();
            
            return {
                status: 'healthy',
                connected: true,
                stats,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                connected: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Método para limpiar cache específico
    async clearUserCache(userId) {
        const keys = [
            `user:${userId}`,
            `permissions:${userId}`,
            `session:*${userId}*`
        ];
        
        for (const key of keys) {
            if (key.includes('*')) {
                // Para patrones, necesitamos buscar las claves
                try {
                    const matchingKeys = await this.client.keys(key);
                    for (const matchingKey of matchingKeys) {
                        await this.del(matchingKey);
                    }
                } catch (error) {
                    logger.error(`❌ Error limpiando cache con patrón ${key}:`, error);
                }
            } else {
                await this.del(key);
            }
        }
        
        logger.info(`🧹 Cache limpiado para usuario ${userId}`);
    }
}

// Crear instancia singleton
const redisClient = new RedisClient();

module.exports = redisClient;