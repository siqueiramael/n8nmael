import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { loggers } from '../utils/logger.js';
import { crudLogger } from '../middleware/logging.js';

const router = express.Router();

// Listar todos os créditos
router.get('/', 
  checkPermission('view_creditos'),
  addBreadcrumb([{ title: 'Financeiro', icon: 'fas fa-dollar-sign' }, { title: 'Créditos de Cliente', icon: 'fas fa-coins' }]),
  cacheMiddleware('creditos_list', 300),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      
      const result = await pool.query(`
        SELECT cc.*, c.nome as cliente_nome, a.data_agendamento
        FROM creditos_cliente cc
        JOIN clientes c ON cc.cliente_id = c.id
        LEFT JOIN agendamentos a ON cc.agendamento_origem_id = a.id
        ORDER BY cc.data_criacao DESC
      `);
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'SELECT creditos list with joins',
        queryDuration,
        req.user.id
      );
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'list',
        'creditos',
        req.ip,
        { count: result.rows.length, duration: totalDuration }
      );
      
      res.json({ 
        creditos: result.rows,
        activeMenu: 'creditos'
      });
      
    } catch (error) {
      loggers.system.error('Error listing creditos', {
        error: error.message,
        userId: req.user.id,
        ip: req.ip
      });
      
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
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      
      const clientesResult = await pool.query('SELECT id, nome FROM clientes WHERE status = \'ativo\' ORDER BY nome');
      const agendamentosResult = await pool.query(`
        SELECT a.id, c.nome as cliente_nome, a.data_agendamento, a.valor
        FROM agendamentos a
        JOIN clientes c ON a.cliente_id = c.id
        WHERE a.status IN ('cancelado', 'confirmado')
        ORDER BY a.data_agendamento DESC
      `);
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'SELECT form data for creditos',
        queryDuration,
        req.user.id
      );
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'view_form',
        'creditos',
        req.ip,
        { 
          action: 'new',
          clientesCount: clientesResult.rows.length,
          agendamentosCount: agendamentosResult.rows.length,
          duration: totalDuration
        }
      );
      
      res.json({ 
        clientes: clientesResult.rows,
        agendamentos: agendamentosResult.rows,
        activeMenu: 'creditos'
      });
      
    } catch (error) {
      loggers.system.error('Error loading creditos form data', {
        error: error.message,
        userId: req.user.id,
        ip: req.ip
      });
      
      res.status(500).send('Erro ao carregar dados do formulário');
    }
  }
);

// Salvar novo crédito
router.post('/', 
  checkPermission('edit_creditos'),
  crudLogger('create', 'credito'),
  async (req, res) => {
    const { cliente_id, valor, tipo, descricao, agendamento_origem_id, data_expiracao } = req.body;
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      
      const result = await pool.query(
        `INSERT INTO creditos_cliente (cliente_id, valor, tipo, descricao, agendamento_origem_id, data_expiracao, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ativo') RETURNING id`,
        [cliente_id, valor, tipo, descricao || null, agendamento_origem_id || null, data_expiracao || null]
      );
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'INSERT credito',
        queryDuration,
        req.user.id,
        [cliente_id, valor, tipo]
      );
      
      // Invalidar cache
      await invalidateCache(['creditos_*'], req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'create',
        'credito',
        req.ip,
        {
          creditoId: result.rows[0].id,
          clienteId: cliente_id,
          valor,
          tipo,
          duration: totalDuration
        }
      );
      
      res.redirect('/admin/creditos');
      
    } catch (error) {
      loggers.system.error('Error creating credito', {
        error: error.message,
        userId: req.user.id,
        data: { cliente_id, valor, tipo },
        ip: req.ip
      });
      
      res.status(500).send('Erro ao inserir crédito');
    }
  }
);

// Atualizar crédito
router.put('/:id',
  checkPermission('edit_creditos'),
  crudLogger('update', 'credito'),
  async (req, res) => {
    const { id } = req.params;
    const { valor, tipo, descricao, data_expiracao, status } = req.body;
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      
      const result = await pool.query(
        `UPDATE creditos_cliente 
         SET valor = $1, tipo = $2, descricao = $3, data_expiracao = $4, status = $5, data_atualizacao = NOW()
         WHERE id = $6
         RETURNING id, cliente_id`,
        [valor, tipo, descricao, data_expiracao, status, id]
      );
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'UPDATE credito',
        queryDuration,
        req.user.id,
        [valor, tipo, status, id]
      );
      
      if (result.rows.length === 0) {
        loggers.access.action(
          req.user.id,
          'update',
          'credito',
          req.ip,
          { creditoId: id, found: false }
        );
        
        return res.status(404).json({ 
          success: false, 
          message: 'Crédito não encontrado'
        });
      }
      
      // Invalidar cache
      await invalidateCache(['creditos_*'], req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'update',
        'credito',
        req.ip,
        {
          creditoId: id,
          clienteId: result.rows[0].cliente_id,
          changes: { valor, tipo, status },
          duration: totalDuration
        }
      );
      
      res.json({ 
        success: true, 
        message: 'Crédito atualizado com sucesso'
      });
      
    } catch (error) {
      loggers.system.error('Error updating credito', {
        error: error.message,
        userId: req.user.id,
        creditoId: id,
        data: { valor, tipo, status },
        ip: req.ip
      });
      
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao atualizar crédito'
      });
    }
  }
);

export default router;