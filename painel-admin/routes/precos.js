import express from 'express';
import pool from '../db/index.js';

const router = express.Router();

// Listar todos os preços
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM precos_quiosques ORDER BY tipo_local, numero');
    res.render('admin', { 
      precos: result.rows,
      activeMenu: 'precos'
    });
  } catch (error) {
    console.error('Erro ao buscar preços:', error);
    res.status(500).send('Erro ao buscar dados');
  }
});

// Salvar novo preço
router.post('/', async (req, res) => {
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

export default router;