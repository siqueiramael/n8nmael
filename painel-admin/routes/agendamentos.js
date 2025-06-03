import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { CacheManager } from '../db/redis.js';

const router = express.Router();

// Listar todos os agendamentos com cache
router.get('/', 
  checkPermission('view_agendamentos'),
  addBreadcrumb([{ title: 'Operacional', icon: 'fas fa-cogs' }, { title: 'Agendamentos', icon: 'fas fa-calendar' }]),
  async (req, res) => {
    try {
      // Chave de cache baseada nos filtros
      const cacheKey = `agendamentos_list_${JSON.stringify(req.query)}`;
      
      // Tentar recuperar do cache
      let agendamentos = await CacheManager.getCache(cacheKey);
      
      if (!agendamentos) {
        // Se não estiver em cache, buscar no banco
        const result = await pool.query(`
          SELECT a.*, c.nome as cliente_nome, q.numero as quiosque_numero 
          FROM agendamentos a
          LEFT JOIN clientes c ON a.cliente_id = c.id
          LEFT JOIN quiosques q ON a.quiosque_id = q.id
          ORDER BY a.data_agendamento DESC
        `);
        
        agendamentos = result.rows;
        
        // Salvar no cache por 5 minutos
        await CacheManager.setCache(cacheKey, agendamentos, 300);
        console.log(`💾 Agendamentos salvos no cache: ${cacheKey}`);
      } else {
        console.log(`⚡ Agendamentos recuperados do cache: ${cacheKey}`);
      }
      
      res.render('agendamentos/index', { 
        agendamentos,
        activeMenu: 'agendamentos'
      });
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Criar agendamento com invalidação de cache
router.post('/', 
  checkPermission('edit_agendamentos'),
  invalidateCache(['agendamentos_*', 'dashboard_*']),
  async (req, res) => {
    const { cliente_id, quiosque_id, tipo_local, numero, data_agendamento, valor, status } = req.body;
    try {
      await pool.query(
        `INSERT INTO agendamentos (cliente_id, quiosque_id, tipo_local, numero, data_agendamento, valor, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cliente_id, quiosque_id || null, tipo_local, numero || null, data_agendamento, valor, status || 'pendente']
      );
      
      res.redirect('/admin/agendamentos');
    } catch (error) {
      console.error('Erro ao inserir agendamento:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Formulário para novo agendamento
router.get('/novo', 
  checkPermission('edit_agendamentos'),
  addBreadcrumb([{ title: 'Operacional', icon: 'fas fa-cogs' }, { title: 'Agendamentos', icon: 'fas fa-calendar', url: '/admin/agendamentos' }, { title: 'Novo', icon: 'fas fa-plus' }]),
  async (req, res) => {
    try {
      const clientesResult = await pool.query('SELECT id, nome FROM clientes WHERE status = \'ativo\' ORDER BY nome');
      const quiosquesResult = await pool.query('SELECT id, numero FROM quiosques WHERE status = \'ativo\' ORDER BY numero');
      
      res.render('agendamentos/novo', { 
        clientes: clientesResult.rows,
        quiosques: quiosquesResult.rows,
        activeMenu: 'agendamentos'
      });
    } catch (error) {
      console.error('Erro ao buscar dados para formulário:', error);
      res.status(500).send('Erro ao carregar formulário');
    }
  }
);

// Salvar novo agendamento
router.post('/', 
  checkPermission('edit_agendamentos'),
  async (req, res) => {
    const { cliente_id, tipo_local, quiosque_id, numero, data_agendamento, valor, observacoes } = req.body;
    try {
      await pool.query(
        `INSERT INTO agendamentos (cliente_id, tipo_local, quiosque_id, numero, data_agendamento, valor, observacoes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendente')`,
        [cliente_id, tipo_local, quiosque_id || null, numero || null, data_agendamento, valor, observacoes || null]
      );
      res.redirect('/admin/agendamentos');
    } catch (error) {
      console.error('Erro ao inserir agendamento:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Formulário para editar agendamento
router.get('/editar/:id', 
  checkPermission('edit_agendamentos'),
  addBreadcrumb([{ title: 'Operacional', icon: 'fas fa-cogs' }, { title: 'Agendamentos', icon: 'fas fa-calendar', url: '/admin/agendamentos' }, { title: 'Editar', icon: 'fas fa-edit' }]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const agendamentoResult = await pool.query('SELECT * FROM agendamentos WHERE id = $1', [id]);
      
      if (agendamentoResult.rows.length === 0) {
        return res.status(404).send('Agendamento não encontrado');
      }
      
      const clientesResult = await pool.query('SELECT id, nome FROM clientes WHERE status = \'ativo\' ORDER BY nome');
      const quiosquesResult = await pool.query('SELECT id, numero FROM quiosques WHERE status = \'ativo\' ORDER BY numero');
      
      res.render('agendamentos/editar', {
        agendamento: agendamentoResult.rows[0],
        clientes: clientesResult.rows,
        quiosques: quiosquesResult.rows,
        activeMenu: 'agendamentos'
      });
    } catch (error) {
      console.error('Erro ao buscar agendamento:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Atualizar agendamento
router.post('/editar/:id', 
  checkPermission('edit_agendamentos'),
  async (req, res) => {
    const { id } = req.params;
    const { cliente_id, tipo_local, quiosque_id, numero, data_agendamento, valor, status, observacoes } = req.body;
    try {
      await pool.query(
        `UPDATE agendamentos SET cliente_id = $1, tipo_local = $2, quiosque_id = $3, numero = $4, 
         data_agendamento = $5, valor = $6, status = $7, observacoes = $8, data_atualizacao = CURRENT_TIMESTAMP
         WHERE id = $9`,
        [cliente_id, tipo_local, quiosque_id || null, numero || null, data_agendamento, valor, status, observacoes || null, id]
      );
      res.redirect('/admin/agendamentos');
    } catch (error) {
      console.error('Erro ao atualizar agendamento:', error);
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

export default router;