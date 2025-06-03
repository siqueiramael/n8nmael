import { loggers } from '../utils/logger.js';

// Middleware para log de requisições
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;
  const originalJson = res.json;
  
  // Capturar informações da requisição
  const requestInfo = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || null,
    sessionId: req.sessionID || null
  };
  
  // Override do método send para capturar a resposta
  res.send = function(data) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    // Log da requisição
    loggers.performance.request(
      req.method,
      req.originalUrl,
      duration,
      statusCode,
      req.user?.id
    );
    
    // Log de acesso detalhado
    loggers.access.info(`${req.method} ${req.originalUrl}`, {
      ...requestInfo,
      statusCode,
      duration,
      responseSize: Buffer.byteLength(data || '', 'utf8')
    });
    
    originalSend.call(this, data);
  };
  
  // Override do método json para capturar a resposta JSON
  res.json = function(data) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    // Log da requisição
    loggers.performance.request(
      req.method,
      req.originalUrl,
      duration,
      statusCode,
      req.user?.id
    );
    
    // Log de acesso detalhado
    loggers.access.info(`${req.method} ${req.originalUrl}`, {
      ...requestInfo,
      statusCode,
      duration,
      responseSize: JSON.stringify(data).length
    });
    
    originalJson.call(this, data);
  };
  
  next();
};

// Middleware para log de erros
export const errorLogger = (err, req, res, next) => {
  const errorInfo = {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || null,
    body: req.method === 'POST' || req.method === 'PUT' ? req.body : undefined,
    params: req.params,
    query: req.query
  };
  
  loggers.system.error('HTTP Error', errorInfo);
  
  // Log de segurança para erros 401/403
  if (err.status === 401) {
    loggers.security.unauthorized(
      req.ip,
      req.get('User-Agent'),
      req.originalUrl,
      req.user?.id
    );
  } else if (err.status === 403) {
    loggers.security.forbidden(
      req.ip,
      req.get('User-Agent'),
      req.originalUrl,
      req.user?.id
    );
  }
  
  next(err);
};

// Middleware para log de operações CRUD
export const crudLogger = (action, resource) => {
  return (req, res, next) => {
    const originalSend = res.send;
    const originalJson = res.json;
    
    const logOperation = (success, data = null) => {
      loggers.access.action(
        req.user?.id,
        action,
        resource,
        req.ip,
        {
          success,
          resourceId: data?.id || req.params.id,
          data: action === 'create' || action === 'update' ? req.body : null
        }
      );
    };
    
    res.send = function(data) {
      logOperation(res.statusCode < 400, data);
      originalSend.call(this, data);
    };
    
    res.json = function(data) {
      logOperation(res.statusCode < 400, data);
      originalJson.call(this, data);
    };
    
    next();
  };
};