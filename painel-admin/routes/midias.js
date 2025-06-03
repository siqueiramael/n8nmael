import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';

const router = express.Router();

// Listar todas as mídias
router.get('/', 
  checkPermission('view_midias'),
  addBreadcrumb([{ title: 'Sistema', icon: 'fas fa-cogs' }, { title: 'Mídias', icon: 'fas fa-photo-video' }]),
  cacheMiddleware('midias_list', 300),
  async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM midias ORDER BY data_criacao DESC');
      res.json({ 
        midias: result.rows,
        activeMenu: 'midias'
      });
    } catch (error) {
      console.error('Erro ao buscar mídias:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Formulário para nova mídia
router.get('/novo', 
  checkPermission('edit_midias'),
  addBreadcrumb([{ title: 'Sistema', icon: 'fas fa-cogs' }, { title: 'Mídias', icon: 'fas fa-photo-video', url: '/admin/midias' }, { title: 'Nova', icon: 'fas fa-plus' }]),
  (req, res) => {
    res.render('midias/novo', { activeMenu: 'midias' });
  }
);

// Salvar nova mídia
router.post('/', 
  checkPermission('edit_midias'),
  invalidateCache(['midias_*']),
  async (req, res) => {
    const { nome, tipo, url, descricao, tags, status } = req.body;
    try {
      await pool.query(
        `INSERT INTO midias (nome, tipo, url, descricao, tags, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [nome, tipo, url, descricao || null, tags || null, status || 'ativo']
      );
      res.redirect('/admin/midias');
    } catch (error) {
      console.error('Erro ao inserir mídia:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Formulário para editar mídia
router.get('/editar/:id', 
  checkPermission('edit_midias'),
  addBreadcrumb([{ title: 'Sistema', icon: 'fas fa-cogs' }, { title: 'Mídias', icon: 'fas fa-photo-video', url: '/admin/midias' }, { title: 'Editar', icon: 'fas fa-edit' }]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('SELECT * FROM midias WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).send('Mídia não encontrada');
      }
      
      res.render('midias/editar', {
        midia: result.rows[0],
        activeMenu: 'midias'
      });
    } catch (error) {
      console.error('Erro ao buscar mídia:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Atualizar mídia
router.post('/editar/:id', 
  checkPermission('edit_midias'),
  async (req, res) => {
    const { id } = req.params;
    const { nome, tipo, url, descricao, tags, status } = req.body;
    try {
      await pool.query(
        `UPDATE midias SET nome = $1, tipo = $2, url = $3, descricao = $4, 
         tags = $5, status = $6, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $7`,
        [nome, tipo, url, descricao || null, tags || null, status, id]
      );
      res.redirect('/admin/midias');
    } catch (error) {
      console.error('Erro ao atualizar mídia:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

export default router;