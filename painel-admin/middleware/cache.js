import { CacheManager } from '../db/redis.js';

// Middleware para cache de consultas
export const cacheMiddleware = (cacheKey, ttl = 300) => {
  return async (req, res, next) => {
    try {
      // Gerar chave única baseada na rota e parâmetros
      const key = typeof cacheKey === 'function' 
        ? cacheKey(req) 
        : `${cacheKey}_${JSON.stringify(req.query)}`;
      
      // Tentar recuperar do cache
      const cachedData = await CacheManager.getCache(key);
      
      if (cachedData) {
        console.log(`✅ Cache hit para: ${key}`);
        return res.json(cachedData);
      }
      
      // Se não estiver em cache, continuar para a rota
      console.log(`❌ Cache miss para: ${key}`);
      
      // Interceptar a resposta para salvar no cache
      const originalJson = res.json;
      res.json = function(data) {
        // Salvar no cache
        CacheManager.setCache(key, data, ttl);
        // Chamar o método original
        originalJson.call(this, data);
      };
      
      req.cacheKey = key;
      next();
    } catch (error) {
      console.error('Erro no middleware de cache:', error);
      next();
    }
  };
};

// Middleware para invalidar cache após modificações
export const invalidateCache = (patterns) => {
  return async (req, res, next) => {
    try {
      // Executar a operação primeiro
      const originalSend = res.send;
      res.send = async function(data) {
        // Se a operação foi bem-sucedida, invalidar cache
        if (res.statusCode >= 200 && res.statusCode < 300) {
          for (const pattern of patterns) {
            await CacheManager.deleteCachePattern(pattern);
            console.log(`🗑️ Cache invalidado: ${pattern}`);
          }
        }
        originalSend.call(this, data);
      };
      
      next();
    } catch (error) {
      console.error('Erro ao invalidar cache:', error);
      next();
    }
  };
};