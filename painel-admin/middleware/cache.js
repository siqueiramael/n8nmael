import { redisClient } from '../db/redis.js';
import { loggers } from '../utils/logger.js';

// Middleware de cache
export const cacheMiddleware = (ttl = 300) => {
  return async (req, res, next) => {
    try {
      // Gerar chave de cache baseada na URL e query parameters
      const cacheKey = `cache:${req.originalUrl}:${JSON.stringify(req.query)}`;
      
      // Tentar buscar no cache
      const cachedData = await redisClient.get(cacheKey);
      
      if (cachedData) {
        loggers.cache.hit(cacheKey, req.user?.id);
        return res.json(JSON.parse(cachedData));
      }
      
      loggers.cache.miss(cacheKey, req.user?.id);
      
      // Interceptar a resposta para armazenar no cache
      const originalJson = res.json;
      res.json = function(data) {
        // Armazenar no cache apenas se a resposta for bem-sucedida
        if (res.statusCode === 200) {
          redisClient.setex(cacheKey, ttl, JSON.stringify(data))
            .then(() => {
              loggers.cache.set(cacheKey, ttl, req.user?.id);
            })
            .catch(err => {
              loggers.cache.error('Failed to cache data', {
                key: cacheKey,
                error: err.message,
                userId: req.user?.id
              });
            });
        }
        
        originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      loggers.cache.error('Cache middleware error', {
        error: error.message,
        url: req.originalUrl,
        userId: req.user?.id
      });
      next();
    }
  };
};

// Função para invalidar cache
export const invalidateCache = async (pattern, userId = null) => {
  try {
    const keys = await redisClient.keys(`cache:*${pattern}*`);
    
    if (keys.length > 0) {
      await redisClient.del(keys);
      loggers.cache.invalidate(pattern, userId);
    }
  } catch (error) {
    loggers.cache.error('Failed to invalidate cache', {
      pattern,
      error: error.message,
      userId
    });
  }
};