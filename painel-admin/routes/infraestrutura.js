import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';

const router = express.Router();

// Listar toda a infraestrutura
router.get('/', 
  checkPermission('view_infraestrutura'),
  addBreadcrumb([{ title: 'Sistema', icon: 'fas fa-cogs' }, { title: 'Infraestrutura', icon: 'fas fa-server' }]),
  async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM infraestrutura ORDER BY tipo, nome');
      res.render('infraestrutura/index', { 
        infraestrutura: result.rows,
        activeMenu: 'infraestrutura'
      });
    } catch (error) {
      console.error('Erro ao buscar infraestrutura:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Formulário para nova infraestrutura
router.get('/novo', 
  checkPermission('edit_infraestrutura'),
  addBreadcrumb([{ title: 'Sistema', icon: 'fas fa-cogs' }, { title: 'Infraestrutura', icon: 'fas fa-server', url: '/admin/infraestrutura' }, { title: 'Novo', icon: 'fas fa-plus' }]),
  (req, res) => {
    res.render('infraestrutura/novo', { activeMenu: 'infraestrutura' });
  }
);

// Salvar nova infraestrutura
router.post('/', 
  checkPermission('edit_infraestrutura'),
  async (req, res) => {
    const { tipo, nome, descricao, localizacao, status, especificacoes } = req.body;
    try {
      await pool.query(
        `INSERT INTO infraestrutura (tipo, nome, descricao, localizacao, status, especificacoes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tipo, nome, descricao || null, localizacao || null, status || 'ativo', especificacoes || null]
      );
      res.redirect('/admin/infraestrutura');
    } catch (error) {
      console.error('Erro ao inserir infraestrutura:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Formulário para editar infraestrutura
router.get('/editar/:id', 
  checkPermission('edit_infraestrutura'),
  addBreadcrumb([{ title: 'Sistema', icon: 'fas fa-cogs' }, { title: 'Infraestrutura', icon: 'fas fa-server', url: '/admin/infraestrutura' }, { title: 'Editar', icon: 'fas fa-edit' }]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('SELECT * FROM infraestrutura WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).send('Item de infraestrutura não encontrado');
      }
      
      res.render('infraestrutura/editar', {
        item: result.rows[0],
        activeMenu: 'infraestrutura'
      });
    } catch (error) {
      console.error('Erro ao buscar infraestrutura:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Atualizar infraestrutura
router.post('/editar/:id', 
  checkPermission('edit_infraestrutura'),
  async (req, res) => {
    const { id } = req.params;
    const { tipo, nome, descricao, localizacao, status, especificacoes } = req.body;
    try {
      await pool.query(
        `UPDATE infraestrutura SET tipo = $1, nome = $2, descricao = $3, localizacao = $4, 
         status = $5, especificacoes = $6, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $7`,
        [tipo, nome, descricao || null, localizacao || null, status, especificacoes || null, id]
      );
      res.redirect('/admin/infraestrutura');
    } catch (error) {
      console.error('Erro ao atualizar infraestrutura:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

export default router;