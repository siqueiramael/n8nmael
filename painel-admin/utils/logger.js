import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Criar diretório de logs se não existir
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configuração dos formatos de log
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Formato para console (mais legível)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (stack) {
      log += `\n${stack}`;
    }
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return log;
  })
);

// Configuração do logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'painel-admin' },
  transports: [
    // Logs de erro (com rotação)
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Logs combinados (com rotação)
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      tailable: true
    }),
    
    // Logs de acesso/auditoria (com rotação)
    new winston.transports.File({
      filename: path.join(logsDir, 'access.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 7,
      tailable: true
    }),
    
    // Logs de performance (com rotação)
    new winston.transports.File({
      filename: path.join(logsDir, 'performance.log'),
      level: 'warn',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    })
  ],
  
  // Tratamento de exceções não capturadas
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 3
    })
  ],
  
  // Tratamento de rejeições de Promise não capturadas
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 3
    })
  ]
});

// Adicionar console apenas em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Funções auxiliares para diferentes tipos de log
export const loggers = {
  // Log de sistema geral
  system: {
    info: (message, meta = {}) => logger.info(message, { type: 'system', ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { type: 'system', ...meta }),
    error: (message, meta = {}) => logger.error(message, { type: 'system', ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { type: 'system', ...meta })
  },
  
  // Log de acesso/auditoria
  access: {
    info: (message, meta = {}) => logger.info(message, { type: 'access', ...meta }),
    login: (userId, ip, userAgent, success = true) => {
      logger.info(`User login ${success ? 'successful' : 'failed'}`, {
        type: 'access',
        action: 'login',
        userId,
        ip,
        userAgent,
        success
      });
    },
    logout: (userId, ip) => {
      logger.info('User logout', {
        type: 'access',
        action: 'logout',
        userId,
        ip
      });
    },
    action: (userId, action, resource, ip, details = {}) => {
      logger.info(`User action: ${action} on ${resource}`, {
        type: 'access',
        action,
        resource,
        userId,
        ip,
        ...details
      });
    }
  },
  
  // Log de banco de dados
  database: {
    info: (message, meta = {}) => logger.info(message, { type: 'database', ...meta }),
    error: (message, meta = {}) => logger.error(message, { type: 'database', ...meta }),
    query: (query, duration, userId = null, params = null) => {
      const logLevel = duration > 1000 ? 'warn' : 'info';
      logger[logLevel]('Database query executed', {
        type: 'database',
        query: query.substring(0, 200), // Limitar tamanho
        duration,
        userId,
        params: params ? JSON.stringify(params).substring(0, 100) : null,
        slow: duration > 1000
      });
    },
    connection: (action, meta = {}) => {
      logger.info(`Database ${action}`, {
        type: 'database',
        action,
        ...meta
      });
    }
  },
  
  // Log de cache
  cache: {
    info: (message, meta = {}) => logger.info(message, { type: 'cache', ...meta }),
    error: (message, meta = {}) => logger.error(message, { type: 'cache', ...meta }),
    hit: (key, userId = null) => {
      logger.info('Cache hit', {
        type: 'cache',
        action: 'hit',
        key,
        userId
      });
    },
    miss: (key, userId = null) => {
      logger.info('Cache miss', {
        type: 'cache',
        action: 'miss',
        key,
        userId
      });
    },
    invalidate: (pattern, userId = null) => {
      logger.info('Cache invalidated', {
        type: 'cache',
        action: 'invalidate',
        pattern,
        userId
      });
    },
    set: (key, ttl, userId = null) => {
      logger.info('Cache set', {
        type: 'cache',
        action: 'set',
        key,
        ttl,
        userId
      });
    }
  },
  
  // Log de performance
  performance: {
    info: (message, meta = {}) => logger.info(message, { type: 'performance', ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { type: 'performance', ...meta }),
    slow: (operation, duration, threshold, meta = {}) => {
      logger.warn(`Slow operation detected: ${operation}`, {
        type: 'performance',
        operation,
        duration,
        threshold,
        ...meta
      });
    },
    request: (method, url, duration, statusCode, userId = null) => {
      const logLevel = duration > 1000 || statusCode >= 400 ? 'warn' : 'info';
      logger[logLevel](`${method} ${url} - ${statusCode} (${duration}ms)`, {
        type: 'performance',
        method,
        url,
        duration,
        statusCode,
        userId,
        slow: duration > 1000
      });
    }
  },
  
  // Log de segurança
  security: {
    info: (message, meta = {}) => logger.info(message, { type: 'security', ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { type: 'security', ...meta }),
    error: (message, meta = {}) => logger.error(message, { type: 'security', ...meta }),
    unauthorized: (ip, userAgent, resource, userId = null) => {
      logger.warn('Unauthorized access attempt', {
        type: 'security',
        action: 'unauthorized',
        ip,
        userAgent,
        resource,
        userId
      });
    },
    forbidden: (ip, userAgent, resource, userId) => {
      logger.warn('Forbidden access attempt', {
        type: 'security',
        action: 'forbidden',
        ip,
        userAgent,
        resource,
        userId
      });
    }
  }
};

export default logger;