import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';

const router = express.Router();

// Listar todos os clientes
router.get('/', 
  cacheMiddleware('clientes_list', 300),
  async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM clientes ORDER BY nome');
      res.json({ 
        clientes: result.rows,
        activeMenu: 'clientes'
      });
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Formulário para novo cliente
router.get('/novo', (req, res) => {
  res.render('clientes/novo', { activeMenu: 'clientes' });
});

// Salvar novo cliente
router.post('/', 
  invalidateCache(['clientes_*']),
  async (req, res) => {
    const { nome, telefone, telefone_whatsapp, status } = req.body;
    try {
      await pool.query(
        `INSERT INTO clientes (nome, telefone, telefone_whatsapp, status)
         VALUES ($1, $2, $3, $4)`,
        [nome, telefone, telefone_whatsapp || null, status || 'ativo']
      );
      res.redirect('/admin/clientes');
    } catch (error) {
      console.error('Erro ao inserir cliente:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Formulário para editar cliente
router.get('/editar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM clientes WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).send('Cliente não encontrado');
    }
    
    res.render('clientes/editar', { 
      cliente: result.rows[0],
      activeMenu: 'clientes'
    });
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    res.status(500).send('Erro ao buscar dados');
  }
});

// Atualizar cliente
router.put('/editar/:id', 
  invalidateCache(['clientes_*']),
  async (req, res) => {
    const { id } = req.params;
    const { nome, telefone, telefone_whatsapp, status } = req.body;
    
    try {
      await pool.query(
        `UPDATE clientes 
         SET nome = $1, telefone = $2, telefone_whatsapp = $3, status = $4, data_atualizacao = NOW()
         WHERE id = $5`,
        [nome, telefone, telefone_whatsapp || null, status, id]
      );
      res.redirect('/admin/clientes');
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      res.status(500).send('Erro ao atualizar dados');
    }
  }
);

// Excluir cliente
router.delete('/:id', 
  invalidateCache(['clientes_*']),
  async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
      res.redirect('/admin/clientes');
    } catch (error) {
      console.error('Erro ao deletar cliente:', error);
      res.status(500).send('Erro ao deletar dados');
    }
  }
);

export default router;