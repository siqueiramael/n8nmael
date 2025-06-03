import express from 'express';
import { checkPermission } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { loggers } from '../utils/logger.js';
import { crudLogger } from '../middleware/logging.js';
import { ExportUtils } from '../utils/export.js';

const router = express.Router();

// Listar clientes (com cache)
router.get('/', 
  checkPermission('clientes', 'read'),
  cacheMiddleware(300), // 5 minutos
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const pool = req.app.locals.pool;
      const queryStart = Date.now();
      
      const result = await pool.query(`
        SELECT id, nome, email, telefone, created_at, updated_at 
        FROM clientes 
        ORDER BY nome
      `);
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'SELECT clientes list',
        queryDuration,
        req.user.id
      );
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'list',
        'clientes',
        req.ip,
        { count: result.rows.length, duration: totalDuration }
      );
      
      res.render('clientes/index', {
        clientes: result.rows,
        activeMenu: 'clientes'
      });
      
    } catch (error) {
      loggers.system.error('Error listing clientes', {
        error: error.message,
        userId: req.user.id,
        ip: req.ip
      });
      
      res.status(500).render('error/500', {
        message: 'Erro ao carregar clientes',
        error: process.env.NODE_ENV === 'development' ? error : {},
        activeMenu: 'clientes'
      });
    }
  }
);

// Criar cliente
router.post('/',
  checkPermission('clientes', 'create'),
  crudLogger('create', 'cliente'),
  async (req, res) => {
    const { nome, email, telefone } = req.body;
    const startTime = Date.now();
    
    try {
      const pool = req.app.locals.pool;
      const queryStart = Date.now();
      
      const result = await pool.query(`
        INSERT INTO clientes (nome, email, telefone) 
        VALUES ($1, $2, $3) 
        RETURNING id
      `, [nome, email, telefone]);
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'INSERT cliente',
        queryDuration,
        req.user.id,
        [nome, email, telefone]
      );
      
      // Invalidar cache
      await invalidateCache('clientes', req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'create',
        'cliente',
        req.ip,
        {
          clienteId: result.rows[0].id,
          nome,
          email,
          duration: totalDuration
        }
      );
      
      res.json({ 
        success: true, 
        id: result.rows[0].id,
        message: 'Cliente criado com sucesso'
      });
      
    } catch (error) {
      loggers.system.error('Error creating cliente', {
        error: error.message,
        userId: req.user.id,
        data: { nome, email, telefone },
        ip: req.ip
      });
      
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao criar cliente'
      });
    }
  }
);

// Atualizar cliente
router.put('/:id',
  checkPermission('clientes', 'update'),
  crudLogger('update', 'cliente'),
  async (req, res) => {
    const { id } = req.params;
    const { nome, email, telefone } = req.body;
    const startTime = Date.now();
    
    try {
      const pool = req.app.locals.pool;
      const queryStart = Date.now();
      
      const result = await pool.query(`
        UPDATE clientes 
        SET nome = $1, email = $2, telefone = $3, updated_at = NOW()
        WHERE id = $4
        RETURNING id
      `, [nome, email, telefone, id]);
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'UPDATE cliente',
        queryDuration,
        req.user.id,
        [nome, email, telefone, id]
      );
      
      if (result.rows.length === 0) {
        loggers.access.action(
          req.user.id,
          'update',
          'cliente',
          req.ip,
          { clienteId: id, found: false }
        );
        
        return res.status(404).json({ 
          success: false, 
          message: 'Cliente não encontrado'
        });
      }
      
      // Invalidar cache
      await invalidateCache('clientes', req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'update',
        'cliente',
        req.ip,
        {
          clienteId: id,
          changes: { nome, email, telefone },
          duration: totalDuration
        }
      );
      
      res.json({ 
        success: true, 
        message: 'Cliente atualizado com sucesso'
      });
      
    } catch (error) {
      loggers.system.error('Error updating cliente', {
        error: error.message,
        userId: req.user.id,
        clienteId: id,
        data: { nome, email, telefone },
        ip: req.ip
      });
      
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao atualizar cliente'
      });
    }
  }
);

// Deletar cliente
router.delete('/:id',
  checkPermission('clientes', 'delete'),
  crudLogger('delete', 'cliente'),
  async (req, res) => {
    const { id } = req.params;
    const startTime = Date.now();
    
    try {
      const pool = req.app.locals.pool;
      const queryStart = Date.now();
      
      const result = await pool.query(
        'DELETE FROM clientes WHERE id = $1 RETURNING id, nome',
        [id]
      );
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'DELETE cliente',
        queryDuration,
        req.user.id,
        [id]
      );
      
      if (result.rows.length === 0) {
        loggers.access.action(
          req.user.id,
          'delete',
          'cliente',
          req.ip,
          { clienteId: id, found: false }
        );
        
        return res.status(404).json({ 
          success: false, 
          message: 'Cliente não encontrado'
        });
      }
      
      // Invalidar cache
      await invalidateCache('clientes', req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'delete',
        'cliente',
        req.ip,
        {
          clienteId: id,
          nome: result.rows[0].nome,
          duration: totalDuration
        }
      );
      
      res.json({ 
        success: true, 
        message: 'Cliente deletado com sucesso'
      });
      
    } catch (error) {
      loggers.system.error('Error deleting cliente', {
        error: error.message,
        userId: req.user.id,
        clienteId: id,
        ip: req.ip
      });
      
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao deletar cliente'
      });
    }
  }
);

// Adicionar antes do export default router;

// Exportar clientes para CSV
router.get('/export/csv', 
  checkPermission('view_clientes'),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { status, dataInicio, dataFim } = req.query;
      
      let query = `
        SELECT id, nome, email, telefone, status, data_cadastro
        FROM clientes
        WHERE 1=1
      `;
      const queryParams = [];
      
      if (status) {
        queryParams.push(status);
        query += ` AND status = $${queryParams.length}`;
      }
      
      if (dataInicio) {
        queryParams.push(dataInicio);
        query += ` AND data_cadastro >= $${queryParams.length}`;
      }
      
      if (dataFim) {
        queryParams.push(dataFim);
        query += ` AND data_cadastro <= $${queryParams.length}`;
      }
      
      query += ` ORDER BY data_cadastro DESC`;
      
      const result = await pool.query(query, queryParams);
      
      const { headers, data } = ExportUtils.formatDataForExport('clientes', result.rows);
      
      const filename = `clientes_${new Date().toISOString().split('T')[0]}`;
      
      ExportUtils.exportToCSV(data, headers, filename, res);
      
      loggers.system.info('Clientes CSV export', {
        userId: req.user?.id,
        recordCount: result.rows.length,
        filters: { status, dataInicio, dataFim },
        duration: Date.now() - startTime
      });
      
    } catch (error) {
      loggers.error.error('Clientes CSV export error', {
        error: error.message,
        userId: req.user?.id,
        filters: req.query
      });
      res.status(500).send('Erro ao exportar dados');
    }
  }
);

// Exportar clientes para Excel
router.get('/export/excel', 
  checkPermission('view_clientes'),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { status, dataInicio, dataFim } = req.query;
      
      let query = `
        SELECT id, nome, email, telefone, status, data_cadastro
        FROM clientes
        WHERE 1=1
      `;
      const queryParams = [];
      
      if (status) {
        queryParams.push(status);
        query += ` AND status = $${queryParams.length}`;
      }
      
      if (dataInicio) {
        queryParams.push(dataInicio);
        query += ` AND data_cadastro >= $${queryParams.length}`;
      }
      
      if (dataFim) {
        queryParams.push(dataFim);
        query += ` AND data_cadastro <= $${queryParams.length}`;
      }
      
      query += ` ORDER BY data_cadastro DESC`;
      
      const result = await pool.query(query, queryParams);
      
      const { headers, data } = ExportUtils.formatDataForExport('clientes', result.rows);
      
      const filename = `clientes_${new Date().toISOString().split('T')[0]}`;
      
      ExportUtils.exportToExcel(data, headers, filename, res, {
        sheetName: 'Clientes',
        includeStats: true
      });
      
      loggers.system.info('Clientes Excel export', {
        userId: req.user?.id,
        recordCount: result.rows.length,
        filters: { status, dataInicio, dataFim },
        duration: Date.now() - startTime
      });
      
    } catch (error) {
      loggers.error.error('Clientes Excel export error', {
        error: error.message,
        userId: req.user?.id,
        filters: req.query
      });
      res.status(500).send('Erro ao exportar dados');
    }
  }
);

export default router;