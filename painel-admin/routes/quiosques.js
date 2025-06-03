import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';

const router = express.Router();

// Listar todos os quiosques
router.get('/', 
  checkPermission('quiosques_visualizar'),
  addBreadcrumb('Quiosques', '/admin/quiosques'),
  cacheMiddleware('quiosques_list', 600),
  async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM quiosques ORDER BY numero');
      res.json({ 
        quiosques: result.rows,
        activeMenu: 'quiosques'
      });
    } catch (error) {
      console.error('Erro ao buscar quiosques:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Formulário para novo quiosque
router.get('/novo', 
  checkPermission('quiosques_criar'),
  addBreadcrumb('Quiosques', '/admin/quiosques'),
  addBreadcrumb('Novo Quiosque', '/admin/quiosques/novo'),
  (req, res) => {
  res.render('quiosques/novo', { activeMenu: 'quiosques' });
});

// Salvar novo quiosque
router.post('/', 
  checkPermission('quiosques_criar'),
  invalidateCache(['quiosques_*']),
  async (req, res) => {
    const { numero, descricao, posicao } = req.body;
    try {
      await pool.query(
        `INSERT INTO quiosques (numero, descricao, posicao)
         VALUES ($1, $2, $3)`,
        [numero, descricao || null, posicao || null]
      );
      res.redirect('/admin/quiosques');
    } catch (error) {
      console.error('Erro ao inserir quiosque:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Formulário para editar quiosque
router.get('/editar/:id', 
  checkPermission('quiosques_editar'),
  addBreadcrumb('Quiosques', '/admin/quiosques'),
  addBreadcrumb('Editar Quiosque', null),
  async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM quiosques WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).send('Quiosque não encontrado');
    }
    
    res.render('quiosques/editar', { 
      quiosque: result.rows[0],
      activeMenu: 'quiosques'
    });
  } catch (error) {
    console.error('Erro ao buscar quiosque:', error);
    res.status(500).send('Erro ao buscar dados');
  }
});

// Atualizar quiosque
router.put('/:id', 
  checkPermission('quiosques_editar'),
  invalidateCache(['quiosques_*']),
  async (req, res) => {
  const { id } = req.params;
  const { numero, descricao, posicao } = req.body;
  
  try {
    await pool.query(
      `UPDATE quiosques 
       SET numero = $1, descricao = $2, posicao = $3, data_atualizacao = NOW()
       WHERE id = $4`,
      [numero, descricao || null, posicao || null, id]
    );
    res.redirect('/admin/quiosques');
  } catch (error) {
    console.error('Erro ao atualizar quiosque:', error);
    res.status(500).send('Erro ao atualizar dados');
  }
});

// Excluir quiosque
router.delete('/:id', 
  checkPermission('quiosques_excluir'),
  invalidateCache(['quiosques_*']),
  async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `DELETE FROM quiosques WHERE id = $1`,
      [id]
    );
    res.redirect('/admin/quiosques');
  } catch (error) {
    console.error('Erro ao excluir quiosque:', error);
    res.status(500).send('Erro ao excluir dados');
  }
});

export default router;