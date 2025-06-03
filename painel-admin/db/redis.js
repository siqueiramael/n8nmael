import { createClient } from 'redis';

// Configuração do cliente Redis
const redisClient = createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  database: process.env.REDIS_DB || 0
});

// Conectar ao Redis
redisClient.on('error', (err) => {
  console.error('Erro de conexão Redis:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Conectado ao Redis');
});

// Conectar
await redisClient.connect();

// Classe para gerenciar cache
class CacheManager {
  // Cache de consultas com TTL
  static async setCache(key, data, ttl = 300) { // 5 minutos padrão
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Erro ao definir cache:', error);
      return false;
    }
  }

  // Recuperar cache
  static async getCache(key) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Erro ao recuperar cache:', error);
      return null;
    }
  }

  // Invalidar cache específico
  static async deleteCache(key) {
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Erro ao deletar cache:', error);
      return false;
    }
  }

  // Invalidar cache por padrão
  static async deleteCachePattern(pattern) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      return true;
    } catch (error) {
      console.error('Erro ao deletar cache por padrão:', error);
      return false;
    }
  }

  // Cache de sessões
  static async setSession(sessionId, userData, ttl = 86400) { // 24 horas
    try {
      await redisClient.setEx(`session:${sessionId}`, ttl, JSON.stringify(userData));
      return true;
    } catch (error) {
      console.error('Erro ao definir sessão:', error);
      return false;
    }
  }

  // Recuperar sessão
  static async getSession(sessionId) {
    try {
      const data = await redisClient.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Erro ao recuperar sessão:', error);
      return null;
    }
  }

  // Deletar sessão
  static async deleteSession(sessionId) {
    try {
      await redisClient.del(`session:${sessionId}`);
      return true;
    } catch (error) {
      console.error('Erro ao deletar sessão:', error);
      return false;
    }
  }

  // Renovar TTL da sessão
  static async renewSession(sessionId, ttl = 86400) {
    try {
      await redisClient.expire(`session:${sessionId}`, ttl);
      return true;
    } catch (error) {
      console.error('Erro ao renovar sessão:', error);
      return false;
    }
  }
}

export { redisClient, CacheManager };