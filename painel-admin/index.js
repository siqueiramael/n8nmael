import express from 'express';
import { Pool } from 'pg';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import adminRoutes from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Rotas do painel administrativo
app.use('/admin', adminRoutes);

// Redirecionar a raiz para /admin
app.get('/', (req, res) => {
  res.redirect('/admin');
});

app.listen(PORT, () => {
  console.log(`Painel Admin rodando em http://localhost:${PORT}`);
});

// Conexão com PostgreSQL
const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT
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
