import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';

const router = express.Router();

// Listar todas as campanhas
router.get('/', 
  checkPermission('view_campanhas'),
  addBreadcrumb([{ title: 'Clientes & Marketing', icon: 'fas fa-users' }, { title: 'Campanhas', icon: 'fas fa-bullhorn' }]),
  async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM campanhas ORDER BY data_criacao DESC');
      res.render('campanhas/index', { 
        campanhas: result.rows,
        activeMenu: 'campanhas'
      });
    } catch (error) {
      console.error('Erro ao buscar campanhas:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Formulário para nova campanha
router.get('/novo', 
  checkPermission('edit_campanhas'),
  addBreadcrumb([{ title: 'Clientes & Marketing', icon: 'fas fa-users' }, { title: 'Campanhas', icon: 'fas fa-bullhorn', url: '/admin/campanhas' }, { title: 'Nova', icon: 'fas fa-plus' }]),
  (req, res) => {
    res.render('campanhas/novo', { activeMenu: 'campanhas' });
  }
);

// Salvar nova campanha
router.post('/', 
  checkPermission('edit_campanhas'),
  async (req, res) => {
    const { nome, descricao, tipo, data_inicio, data_fim, publico_alvo, orcamento, status } = req.body;
    try {
      await pool.query(
        `INSERT INTO campanhas (nome, descricao, tipo, data_inicio, data_fim, publico_alvo, orcamento, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [nome, descricao || null, tipo, data_inicio, data_fim || null, publico_alvo || null, orcamento || null, status || 'ativo']
      );
      res.redirect('/admin/campanhas');
    } catch (error) {
      console.error('Erro ao inserir campanha:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Formulário para editar campanha
router.get('/editar/:id', 
  checkPermission('edit_campanhas'),
  addBreadcrumb([{ title: 'Clientes & Marketing', icon: 'fas fa-users' }, { title: 'Campanhas', icon: 'fas fa-bullhorn', url: '/admin/campanhas' }, { title: 'Editar', icon: 'fas fa-edit' }]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('SELECT * FROM campanhas WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).send('Campanha não encontrada');
      }
      
      res.render('campanhas/editar', {
        campanha: result.rows[0],
        activeMenu: 'campanhas'
      });
    } catch (error) {
      console.error('Erro ao buscar campanha:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Atualizar campanha
router.post('/editar/:id', 
  checkPermission('edit_campanhas'),
  async (req, res) => {
    const { id } = req.params;
    const { nome, descricao, tipo, data_inicio, data_fim, publico_alvo, orcamento, status } = req.body;
    try {
      await pool.query(
        `UPDATE campanhas SET nome = $1, descricao = $2, tipo = $3, data_inicio = $4, 
         data_fim = $5, publico_alvo = $6, orcamento = $7, status = $8, data_atualizacao = CURRENT_TIMESTAMP 
         WHERE id = $9`,
        [nome, descricao || null, tipo, data_inicio, data_fim || null, publico_alvo || null, orcamento || null, status, id]
      );
      res.redirect('/admin/campanhas');
    } catch (error) {
      console.error('Erro ao atualizar campanha:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Relatório de campanhas
router.get('/relatorio', 
  checkPermission('view_reports'),
  addBreadcrumb([{ title: 'Clientes & Marketing', icon: 'fas fa-users' }, { title: 'Campanhas', icon: 'fas fa-bullhorn', url: '/admin/campanhas' }, { title: 'Relatório', icon: 'fas fa-chart-bar' }]),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          tipo,
          COUNT(*) as total_campanhas,
          SUM(CASE WHEN status = 'ativo' THEN 1 ELSE 0 END) as campanhas_ativas,
          AVG(orcamento) as orcamento_medio
        FROM campanhas
        GROUP BY tipo
        ORDER BY total_campanhas DESC
      `);
      
      res.render('campanhas/relatorio', {
        dados: result.rows,
        activeMenu: 'campanhas'
      });
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      res.status(500).send('Erro ao gerar relatório');
    }
  }
);

export default router;