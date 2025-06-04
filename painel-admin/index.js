import express from 'express';
import { Pool } from 'pg';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectRedis, closeRedis } from './db/redis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Variáveis globais
let server = null;
let pool = null;
let isShuttingDown = false;

// Configuração básica do Express
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Health check simples
app.get('/health', (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'shutting_down' });
  }
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Rota básica
app.get('/', (req, res) => {
  res.json({ message: 'Painel Admin is running', timestamp: new Date().toISOString() });
});

// Middleware de erro global
app.use((err, req, res, next) => {
  console.error('Express Error:', err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Função para inicializar PostgreSQL
async function initializeDatabase() {
  try {
    console.log('🔄 Connecting to PostgreSQL...');
    
    pool = new Pool({
      host: process.env.PGHOST || 'appdb',
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      port: process.env.PGPORT || 5432,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    
    // Testar conexão
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    console.log('✅ PostgreSQL connected');
    return pool;
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    throw error;
  }
}

// Função principal de inicialização
async function startServer() {
  try {
    console.log('🚀 Starting Painel Admin...');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    
    // 1. Conectar ao Redis
    await connectRedis();
    console.log('✅ Redis initialized');
    
    // 2. Conectar ao PostgreSQL
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    // 3. Iniciar servidor HTTP
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🌐 Admin panel: http://localhost:${PORT}/`);
    });
    
    // Configurar timeout do servidor
    server.timeout = 30000;
    
    // Event listeners do servidor
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error.message);
      }
      process.exit(1);
    });
    
    console.log('🎉 Painel Admin started successfully!');
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    console.error('Stack:', error.stack);
    await gracefulShutdown('startup_error');
    process.exit(1);
  }
}

// Função de shutdown graceful
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('⏳ Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  console.log(`🔄 Graceful shutdown initiated (${signal})`);
  
  try {
    // 1. Parar de aceitar novas conexões
    if (server) {
      server.close(() => {
        console.log('✅ HTTP server closed');
      });
    }
    
    // 2. Fechar pool do PostgreSQL
    if (pool) {
      await pool.end();
      console.log('✅ Database pool closed');
    }
    
    // 3. Fechar Redis
    await closeRedis();
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during shutdown:', error.message);
    process.exit(1);
  }
}

// Signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.error('Stack:', error.stack);
  gracefulShutdown('uncaught_exception');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  gracefulShutdown('unhandled_rejection');
});

// Iniciar aplicação
startServer();