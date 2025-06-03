import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';

const router = express.Router();

// Listar todos os pagamentos
router.get('/', 
  checkPermission('view_pagamentos'),
  addBreadcrumb([{ title: 'Financeiro', icon: 'fas fa-dollar-sign' }, { title: 'Pagamentos', icon: 'fas fa-credit-card' }]),
  cacheMiddleware('pagamentos_list', 300),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT p.*, a.data_agendamento, c.nome as cliente_nome,
               CONCAT(a.tipo_local, ' ', COALESCE(q.numero::text, a.numero::text)) as local_info
        FROM pagamentos p
        JOIN agendamentos a ON p.agendamento_id = a.id
        JOIN clientes c ON a.cliente_id = c.id
        LEFT JOIN quiosques q ON a.quiosque_id = q.id
        ORDER BY p.data_criacao DESC
      `);
      res.json({ 
        pagamentos: result.rows,
        activeMenu: 'pagamentos'
      });
    } catch (error) {
      console.error('Erro ao buscar pagamentos:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Formulário para novo pagamento
router.get('/novo', 
  checkPermission('edit_pagamentos'),
  addBreadcrumb([{ title: 'Financeiro', icon: 'fas fa-dollar-sign' }, { title: 'Pagamentos', icon: 'fas fa-credit-card', url: '/admin/pagamentos' }, { title: 'Novo', icon: 'fas fa-plus' }]),
  cacheMiddleware('pagamentos_form_data', 600),
  async (req, res) => {
    try {
      const agendamentosResult = await pool.query(`
        SELECT a.id, c.nome as cliente_nome, a.data_agendamento, a.valor,
               CONCAT(a.tipo_local, ' ', COALESCE(q.numero::text, a.numero::text)) as local_info
        FROM agendamentos a
        JOIN clientes c ON a.cliente_id = c.id
        LEFT JOIN quiosques q ON a.quiosque_id = q.id
        WHERE a.status = 'confirmado' AND a.id NOT IN (SELECT agendamento_id FROM pagamentos)
        ORDER BY a.data_agendamento DESC
      `);
      
      res.json({ 
        agendamentos: agendamentosResult.rows,
        activeMenu: 'pagamentos'
      });
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Salvar novo pagamento
router.post('/', 
  checkPermission('edit_pagamentos'),
  invalidateCache(['pagamentos_*', 'agendamentos_*']),
  async (req, res) => {
    const { agendamento_id, valor_pago, metodo_pagamento, observacoes } = req.body;
    try {
      await pool.query(
        `INSERT INTO pagamentos (agendamento_id, valor_pago, metodo_pagamento, observacoes, status)
         VALUES ($1, $2, $3, $4, 'confirmado')`,
        [agendamento_id, valor_pago, metodo_pagamento, observacoes || null]
      );
      res.redirect('/admin/pagamentos');
    } catch (error) {
      console.error('Erro ao inserir pagamento:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Formulário para editar pagamento
router.get('/editar/:id', 
  checkPermission('edit_pagamentos'),
  addBreadcrumb([{ title: 'Financeiro', icon: 'fas fa-dollar-sign' }, { title: 'Pagamentos', icon: 'fas fa-credit-card', url: '/admin/pagamentos' }, { title: 'Editar', icon: 'fas fa-edit' }]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const pagamentoResult = await pool.query(`
        SELECT p.*, a.data_agendamento, c.nome as cliente_nome,
               CONCAT(a.tipo_local, ' ', COALESCE(q.numero::text, a.numero::text)) as local_info
        FROM pagamentos p
        JOIN agendamentos a ON p.agendamento_id = a.id
        JOIN clientes c ON a.cliente_id = c.id
        LEFT JOIN quiosques q ON a.quiosque_id = q.id
        WHERE p.id = $1
      `, [id]);
      
      if (pagamentoResult.rows.length === 0) {
        return res.status(404).send('Pagamento não encontrado');
      }
      
      res.render('pagamentos/editar', {
        pagamento: pagamentoResult.rows[0],
        activeMenu: 'pagamentos'
      });
    } catch (error) {
      console.error('Erro ao buscar pagamento:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Atualizar pagamento
router.put('/:id', 
  checkPermission('edit_pagamentos'),
  invalidateCache(['pagamentos_*']),
  async (req, res) => {
    const { id } = req.params;
    const { valor_pago, metodo_pagamento, status, observacoes } = req.body;
    try {
      await pool.query(
        `UPDATE pagamentos SET valor_pago = $1, metodo_pagamento = $2, status = $3, 
         observacoes = $4, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $5`,
        [valor_pago, metodo_pagamento, status, observacoes || null, id]
      );
      res.redirect('/admin/pagamentos');
    } catch (error) {
      console.error('Erro ao atualizar pagamento:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Excluir pagamento
router.delete('/:id', 
  checkPermission('edit_pagamentos'),
  invalidateCache(['pagamentos_*', 'agendamentos_*']),
  async (req, res) => {
    const { id } = req.params;
    const { valor_pago, metodo_pagamento, status, observacoes } = req.body;
    try {
      await pool.query(
        `UPDATE pagamentos SET valor_pago = $1, metodo_pagamento = $2, status = $3, 
         observacoes = $4, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $5`,
        [valor_pago, metodo_pagamento, status, observacoes || null, id]
      );
      res.redirect('/admin/pagamentos');
    } catch (error) {
      console.error('Erro ao atualizar pagamento:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Relatório de pagamentos
router.get('/relatorio', 
  checkPermission('view_reports'),
  addBreadcrumb([{ title: 'Financeiro', icon: 'fas fa-dollar-sign' }, { title: 'Pagamentos', icon: 'fas fa-credit-card', url: '/admin/pagamentos' }, { title: 'Relatório', icon: 'fas fa-chart-bar' }]),
  async (req, res) => {
    try {
      const { data_inicio, data_fim } = req.query;
      
      let query = `
        SELECT 
          DATE(p.data_criacao) as data,
          COUNT(*) as total_pagamentos,
          SUM(p.valor_pago) as total_valor,
          p.metodo_pagamento
        FROM pagamentos p
        WHERE 1=1
      `;
      const params = [];
      
      if (data_inicio) {
        query += ` AND p.data_criacao >= $${params.length + 1}`;
        params.push(data_inicio);
      }
      
      if (data_fim) {
        query += ` AND p.data_criacao <= $${params.length + 1}`;
        params.push(data_fim + ' 23:59:59');
      }
      
      query += ` GROUP BY DATE(p.data_criacao), p.metodo_pagamento ORDER BY data DESC`;
      
      const result = await pool.query(query, params);
      
      res.render('pagamentos/relatorio', {
        dados: result.rows,
        filtros: { data_inicio, data_fim },
        activeMenu: 'pagamentos'
      });
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      res.status(500).send('Erro ao gerar relatório');
    }
  }
);

export default router;