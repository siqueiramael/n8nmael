import express from 'express';
import { Pool } from 'pg';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import adminRoutes from './routes/index.js';
import authRoutes from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import { redisClient } from './db/redis.js'; // Importar Redis

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// Configuração de middlewares globais
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

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro na aplicação:', err);
  res.status(500).render('error/500', {
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? err : {},
    activeMenu: null
  });
});

// Middleware para rotas não encontradas
app.use((req, res) => {
  res.status(404).render('error/404', {
    message: 'Página não encontrada',
    activeMenu: null
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 Painel Admin: http://localhost:${PORT}/admin`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Encerrando servidor...');
  await pool.end();
  await redisClient.quit();
  process.exit(0);
});
