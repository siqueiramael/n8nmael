import { createClient } from 'redis';
import { loggers } from '../utils/logger.js';

// Configuração do cliente Redis
const redisClient = createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  database: process.env.REDIS_DB || 0
});

// Conectar ao Redis com logs Winston
redisClient.on('error', (err) => {
  loggers.system.error('Redis connection error', {
    error: err.message,
    stack: err.stack,
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  });
});

redisClient.on('connect', () => {
  loggers.system.info('Redis connected successfully', {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    database: process.env.REDIS_DB || 0
  });
});

redisClient.on('ready', () => {
  loggers.system.info('Redis client ready', {
    status: 'ready'
  });
});

redisClient.on('end', () => {
  loggers.system.warn('Redis connection ended', {
    status: 'disconnected'
  });
});

// Conectar
await redisClient.connect();

// Classe para gerenciar cache com logs Winston
class CacheManager {
  // Cache de consultas com TTL
  static async setCache(key, data, ttl = 300) {
    const startTime = Date.now();
    
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(data));
      const duration = Date.now() - startTime;
      
      loggers.cache.set(key, ttl, null, {
        duration,
        dataSize: JSON.stringify(data).length
      });
      
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.cache.error('Cache set error', {
        key,
        error: error.message,
        stack: error.stack,
        duration,
        ttl
      });
      
      return false;
    }
  }

  // Recuperar cache
  static async getCache(key) {
    const startTime = Date.now();
    
    try {
      const data = await redisClient.get(key);
      const duration = Date.now() - startTime;
      
      if (data) {
        loggers.cache.hit(key, null, {
          duration,
          dataSize: data.length
        });
        return JSON.parse(data);
      } else {
        loggers.cache.miss(key, null, {
          duration
        });
        return null;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.cache.error('Cache get error', {
        key,
        error: error.message,
        stack: error.stack,
        duration
      });
      
      return null;
    }
  }

  // Invalidar cache específico
  static async deleteCache(key) {
    const startTime = Date.now();
    
    try {
      const result = await redisClient.del(key);
      const duration = Date.now() - startTime;
      
      loggers.cache.invalidate(key, null, {
        duration,
        keysDeleted: result
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.cache.error('Cache delete error', {
        key,
        error: error.message,
        stack: error.stack,
        duration
      });
      
      return 0;
    }
  }

  // Invalidar múltiplas chaves por padrão
  static async deleteCachePattern(pattern) {
    const startTime = Date.now();
    
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        const result = await redisClient.del(keys);
        const duration = Date.now() - startTime;
        
        loggers.cache.invalidate(pattern, null, {
          duration,
          keysFound: keys.length,
          keysDeleted: result,
          keys: keys.slice(0, 10) // Log apenas as primeiras 10 chaves
        });
        
        return result;
      }
      
      const duration = Date.now() - startTime;
      loggers.cache.invalidate(pattern, null, {
        duration,
        keysFound: 0,
        keysDeleted: 0
      });
      
      return 0;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.cache.error('Cache pattern delete error', {
        pattern,
        error: error.message,
        stack: error.stack,
        duration
      });
      
      return 0;
    }
  }

  // Limpar todo o cache
  static async clearAll() {
    const startTime = Date.now();
    
    try {
      await redisClient.flushDb();
      const duration = Date.now() - startTime;
      
      loggers.cache.invalidate('*', null, {
        duration,
        operation: 'FLUSH_ALL'
      });
      
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.cache.error('Cache flush error', {
        error: error.message,
        stack: error.stack,
        duration
      });
      
      return false;
    }
  }

  // Estatísticas do cache
  static async getStats() {
    const startTime = Date.now();
    
    try {
      const info = await redisClient.info('memory');
      const keyspace = await redisClient.info('keyspace');
      const duration = Date.now() - startTime;
      
      loggers.system.info('Cache stats retrieved', {
        duration,
        info: info.substring(0, 200) // Limitar tamanho do log
      });
      
      return { info, keyspace };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.cache.error('Cache stats error', {
        error: error.message,
        stack: error.stack,
        duration
      });
      
      return null;
    }
  }
}

export { redisClient, CacheManager };