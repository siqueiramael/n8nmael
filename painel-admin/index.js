import express from 'express';
import { Pool } from 'pg';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import adminRoutes from './routes/index.js';
import authRoutes from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import { redisClient } from './db/redis.js';
import { loggers } from './utils/logger.js';
import { requestLogger, errorLogger } from './middleware/logging.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Log de inicialização
loggers.system.info('Starting Painel Admin application', {
  port: PORT,
  nodeEnv: process.env.NODE_ENV || 'development',
  timestamp: new Date().toISOString()
});

// Configuração de middlewares globais
app.use(requestLogger); // Adicionar logging de requisições
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Conexão com PostgreSQL
const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT
});

// Log de conexão com banco
pool.on('connect', (client) => {
  loggers.database.connection('connected', {
    processId: client.processID
  });
});

pool.on('error', (err, client) => {
  loggers.database.error('Database connection error', {
    error: err.message,
    processId: client?.processID
  });
});

pool.on('remove', (client) => {
  loggers.database.connection('disconnected', {
    processId: client.processID
  });
});

// Disponibilizar pool globalmente
app.locals.pool = pool;

// ROTAS PÚBLICAS (sem autenticação)
app.use('/admin', authRoutes);

// Redirecionar a raiz para /admin
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// MIDDLEWARE DE AUTENTICAÇÃO (aplicado após rotas públicas)
app.use('/admin', requireAuth);

// ROTAS PROTEGIDAS (com autenticação)
app.use('/admin', adminRoutes);

// Middleware de logging de erros
app.use(errorLogger);

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  res.status(500).render('error/500', {
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? err : {},
    activeMenu: null
  });
});

// Middleware para rotas não encontradas
app.use((req, res) => {
  loggers.access.info('404 - Page not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });
  
  res.status(404).render('error/404', {
    message: 'Página não encontrada',
    activeMenu: null
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  const message = `🚀 Servidor rodando na porta ${PORT}`;
  loggers.system.info(message, {
    port: PORT,
    adminUrl: `http://localhost:${PORT}/admin`,
    pid: process.pid
  });
  loggers.system.info(`📊 Painel Admin: http://localhost:${PORT}/admin`);
  
  loggers.system.info('Server started successfully', {
    port: PORT,
    adminUrl: `http://localhost:${PORT}/admin`,
    pid: process.pid
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  loggers.system.info(`Received ${signal}, shutting down gracefully`);
  loggers.system.info(`🔄 Encerrando servidor... (${signal})`);
  
  try {
    await pool.end();
    loggers.database.connection('pool_closed');
    
    await redisClient.quit();
    loggers.cache.info('Redis connection closed');
    
    loggers.system.info('Server shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    loggers.system.error('Error during shutdown', {
      error: error.message,
      signal
    });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  loggers.system.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  loggers.system.error('Unhandled Rejection', {
    reason: reason?.message || reason,
    promise: promise.toString()
  });
});
