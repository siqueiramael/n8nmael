import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';

const router = express.Router();

// Listar todos os créditos
router.get('/', 
  checkPermission('view_creditos'),
  addBreadcrumb([{ title: 'Financeiro', icon: 'fas fa-dollar-sign' }, { title: 'Créditos de Cliente', icon: 'fas fa-coins' }]),
  cacheMiddleware('creditos_list', 300),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT cc.*, c.nome as cliente_nome, a.data_agendamento
        FROM creditos_cliente cc
        JOIN clientes c ON cc.cliente_id = c.id
        LEFT JOIN agendamentos a ON cc.agendamento_origem_id = a.id
        ORDER BY cc.data_criacao DESC
      `);
      res.json({ 
        creditos: result.rows,
        activeMenu: 'creditos'
      });
    } catch (error) {
      console.error('Erro ao buscar créditos:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Formulário para novo crédito
router.get('/novo', 
  checkPermission('edit_creditos'),
  addBreadcrumb([{ title: 'Financeiro', icon: 'fas fa-dollar-sign' }, { title: 'Créditos de Cliente', icon: 'fas fa-coins', url: '/admin/creditos' }, { title: 'Novo', icon: 'fas fa-plus' }]),
  cacheMiddleware('creditos_form_data', 600),
  async (req, res) => {
    try {
      const clientesResult = await pool.query('SELECT id, nome FROM clientes WHERE status = \'ativo\' ORDER BY nome');
      const agendamentosResult = await pool.query(`
        SELECT a.id, c.nome as cliente_nome, a.data_agendamento, a.valor
        FROM agendamentos a
        JOIN clientes c ON a.cliente_id = c.id
        WHERE a.status IN ('cancelado', 'confirmado')
        ORDER BY a.data_agendamento DESC
      `);
      
      res.json({ 
        clientes: clientesResult.rows,
        agendamentos: agendamentosResult.rows,
        activeMenu: 'creditos'
      });
    } catch (error) {
      console.error('Erro ao buscar dados do formulário:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Salvar novo crédito
router.post('/', 
  checkPermission('edit_creditos'),
  invalidateCache(['creditos_*']),
  async (req, res) => {
    const { cliente_id, valor, tipo, agendamento_origem_id, observacoes } = req.body;
    try {
      await pool.query(
        `INSERT INTO creditos_cliente (cliente_id, valor, tipo, agendamento_origem_id, observacoes, status)
         VALUES ($1, $2, $3, $4, $5, 'ativo')`,
        [cliente_id, valor, tipo, agendamento_origem_id || null, observacoes || null]
      );
      res.redirect('/admin/creditos');
    } catch (error) {
      console.error('Erro ao inserir crédito:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Formulário para editar crédito
router.get('/editar/:id', 
  checkPermission('edit_creditos'),
  addBreadcrumb([{ title: 'Financeiro', icon: 'fas fa-dollar-sign' }, { title: 'Créditos de Cliente', icon: 'fas fa-coins', url: '/admin/creditos' }, { title: 'Editar', icon: 'fas fa-edit' }]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const creditoResult = await pool.query(`
        SELECT cc.*, c.nome as cliente_nome
        FROM creditos_cliente cc
        JOIN clientes c ON cc.cliente_id = c.id
        WHERE cc.id = $1
      `, [id]);
      
      if (creditoResult.rows.length === 0) {
        return res.status(404).send('Crédito não encontrado');
      }
      
      const clientesResult = await pool.query('SELECT id, nome FROM clientes WHERE status = \'ativo\' ORDER BY nome');
      
      res.render('creditos/editar', {
        credito: creditoResult.rows[0],
        clientes: clientesResult.rows,
        activeMenu: 'creditos'
      });
    } catch (error) {
      console.error('Erro ao buscar crédito:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Atualizar crédito
router.post('/editar/:id', 
  checkPermission('edit_creditos'),
  async (req, res) => {
    const { id } = req.params;
    const { valor, tipo, status, observacoes } = req.body;
    try {
      await pool.query(
        `UPDATE creditos_cliente SET valor = $1, tipo = $2, status = $3, 
         observacoes = $4, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $5`,
        [valor, tipo, status, observacoes || null, id]
      );
      res.redirect('/admin/creditos');
    } catch (error) {
      console.error('Erro ao atualizar crédito:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Relatório de créditos
router.get('/relatorio', 
  checkPermission('view_reports'),
  addBreadcrumb([{ title: 'Financeiro', icon: 'fas fa-dollar-sign' }, { title: 'Créditos de Cliente', icon: 'fas fa-coins', url: '/admin/creditos' }, { title: 'Relatório', icon: 'fas fa-chart-bar' }]),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          c.nome as cliente_nome,
          SUM(CASE WHEN cc.status = 'ativo' THEN cc.valor ELSE 0 END) as credito_ativo,
          SUM(CASE WHEN cc.status = 'usado' THEN cc.valor ELSE 0 END) as credito_usado,
          COUNT(*) as total_creditos
        FROM creditos_cliente cc
        JOIN clientes c ON cc.cliente_id = c.id
        GROUP BY c.id, c.nome
        HAVING SUM(CASE WHEN cc.status = 'ativo' THEN cc.valor ELSE 0 END) > 0
        ORDER BY credito_ativo DESC
      `);
      
      res.render('creditos/relatorio', {
        dados: result.rows,
        activeMenu: 'creditos'
      });
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      res.status(500).send('Erro ao gerar relatório');
    }
  }
);

export default router;