import express from 'express';
import { Pool } from 'pg';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import adminRoutes from './routes/index.js';
import authRoutes from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// Configuração de middlewares globais
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser()); // ADICIONADO: necessário para JWT em cookies
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Conexão com PostgreSQL (movido para cima)
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

// Rota principal do admin (movida para routes/index.js)
// Esta rota será tratada pelo adminRoutes

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).render('error/500', {
    message: 'Erro interno do servidor',
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

// ÚNICA chamada app.listen()
app.listen(PORT, () => {
  console.log(`🚀 Painel Admin rodando em http://localhost:${PORT}`);
  console.log(`📊 Banco de dados: ${process.env.PGDATABASE}@${process.env.PGHOST}:${process.env.PGPORT}`);
});

app.get('/admin', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM precos_quiosques ORDER BY tipo_local, numero');
    res.render('admin', { precos: result.rows });
  } catch (error) {
    console.error('Erro ao buscar preços:', error);
    res.status(500).send('Erro ao buscar dados');
  }
});

app.post('/admin/precos', async (req, res) => {
  const { tipo_local, numero, valor, data_inicio, data_fim, motivo } = req.body;
  try {
    await pool.query(
      `INSERT INTO precos_quiosques (tipo_local, numero, valor, data_inicio, data_fim, motivo)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tipo_local, numero || null, valor, data_inicio, data_fim || null, motivo]
    );
    res.redirect('/admin');
  } catch (error) {
    console.error('Erro ao inserir preço:', error);
    res.status(500).send('Erro ao salvar dados');
  }
});

app.listen(PORT, () => {
  console.log(`Painel Admin rodando em http://localhost:${PORT}`);
});
