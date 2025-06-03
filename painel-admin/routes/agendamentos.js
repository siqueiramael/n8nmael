import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { loggers } from '../utils/logger.js';
import { ExportUtils } from '../utils/export.js';
import { createExportMiddleware } from '../middleware/export.js';

const router = express.Router();

// Listar todos os agendamentos com cache padronizado
router.get('/', 
  checkPermission('view_agendamentos'),
  addBreadcrumb([{ title: 'Operacional', icon: 'fas fa-cogs' }, { title: 'Agendamentos', icon: 'fas fa-calendar' }]),
  cacheMiddleware((req) => `agendamentos_list_${JSON.stringify(req.query)}`, 300), // Cache dinâmico
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      loggers.access.info('Agendamentos list access', {
        userId: req.user?.id,
        filters: req.query,
        ip: req.ip
      });
      
      const dbStart = Date.now();
      const result = await pool.query(`
        SELECT a.*, c.nome as cliente_nome, q.numero as quiosque_numero 
        FROM agendamentos a
        LEFT JOIN clientes c ON a.cliente_id = c.id
        LEFT JOIN quiosques q ON a.quiosque_id = q.id
        ORDER BY a.data_agendamento DESC
      `);
      const dbDuration = Date.now() - dbStart;
      
      loggers.database.query('Agendamentos list query', {
        duration: dbDuration,
        rowCount: result.rows.length,
        userId: req.user?.id
      });
      
      loggers.performance.request(
        'GET',
        '/admin/agendamentos',
        Date.now() - startTime,
        200,
        req.user?.id
      );
      
      res.json({ 
        agendamentos: result.rows,
        activeMenu: 'agendamentos'
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.database.error('Agendamentos list error', {
        error: error.message,
        stack: error.stack,
        duration,
        userId: req.user?.id,
        ip: req.ip
      });
      
      loggers.performance.request(
        'GET',
        '/admin/agendamentos',
        duration,
        500,
        req.user?.id
      );
      
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Criar agendamento com logs completos
router.post('/', 
  checkPermission('edit_agendamentos'),
  invalidateCache(['agendamentos_*', 'dashboard_*']),
  async (req, res) => {
    const { cliente_id, quiosque_id, tipo_local, numero, data_agendamento, valor, status } = req.body;
    const startTime = Date.now();
    
    try {
      loggers.access.info('Agendamento creation attempt', {
        userId: req.user?.id,
        data: { cliente_id, quiosque_id, tipo_local, numero, data_agendamento, valor, status },
        ip: req.ip
      });
      
      const dbStart = Date.now();
      await pool.query(
        `INSERT INTO agendamentos (cliente_id, quiosque_id, tipo_local, numero, data_agendamento, valor, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cliente_id, quiosque_id || null, tipo_local, numero || null, data_agendamento, valor, status || 'pendente']
      );
      const dbDuration = Date.now() - dbStart;
      
      loggers.database.query('Agendamento insert', {
        duration: dbDuration,
        table: 'agendamentos',
        operation: 'INSERT',
        userId: req.user?.id
      });
      
      loggers.system.info('Agendamento created successfully', {
        userId: req.user?.id,
        cliente_id,
        data_agendamento,
        valor
      });
      
      loggers.performance.request(
        'POST',
        '/admin/agendamentos',
        Date.now() - startTime,
        302,
        req.user?.id
      );
      
      res.redirect('/admin/agendamentos');
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.database.error('Agendamento creation error', {
        error: error.message,
        stack: error.stack,
        data: { cliente_id, quiosque_id, tipo_local, numero, data_agendamento, valor, status },
        duration,
        userId: req.user?.id,
        ip: req.ip
      });
      
      loggers.performance.request(
        'POST',
        '/admin/agendamentos',
        duration,
        500,
        req.user?.id
      );
      
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Formulário para novo agendamento
router.get('/novo', 
  checkPermission('edit_agendamentos'),
  addBreadcrumb([{ title: 'Operacional', icon: 'fas fa-cogs' }, { title: 'Agendamentos', icon: 'fas fa-calendar', url: '/admin/agendamentos' }, { title: 'Novo', icon: 'fas fa-plus' }]),
  cacheMiddleware('agendamentos_form_data', 600), // Cache para dados do formulário
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const dbStart = Date.now();
      const clientesResult = await pool.query('SELECT id, nome FROM clientes WHERE status = \'ativo\' ORDER BY nome');
      const quiosquesResult = await pool.query('SELECT id, numero FROM quiosques WHERE status = \'ativo\' ORDER BY numero');
      const dbDuration = Date.now() - dbStart;
      
      loggers.database.query('Agendamentos form data', {
        duration: dbDuration,
        queries: 2,
        userId: req.user?.id
      });
      
      loggers.performance.request(
        'GET',
        '/admin/agendamentos/novo',
        Date.now() - startTime,
        200,
        req.user?.id
      );
      
      res.json({
        clientes: clientesResult.rows,
        quiosques: quiosquesResult.rows,
        activeMenu: 'agendamentos'
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.database.error('Agendamentos form data error', {
        error: error.message,
        stack: error.stack,
        duration,
        userId: req.user?.id,
        ip: req.ip
      });
      
      loggers.performance.request(
        'GET',
        '/admin/agendamentos/novo',
        duration,
        500,
        req.user?.id
      );
      
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Salvar novo agendamento
router.post('/', 
  checkPermission('edit_agendamentos'),
  invalidateCache(['agendamentos_*', 'clientes_*']),
  async (req, res) => {
    const startTime = Date.now();
    const { cliente_id, tipo_local, quiosque_id, numero, data_agendamento, valor, observacoes } = req.body;
    
    try {
      loggers.performance.start('agendamento_insert', { cliente_id, tipo_local });
      
      await pool.query(
        `INSERT INTO agendamentos (cliente_id, tipo_local, quiosque_id, numero, data_agendamento, valor, observacoes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendente')`,
        [cliente_id, tipo_local, quiosque_id || null, numero || null, data_agendamento, valor, observacoes || null]
      );
      
      loggers.audit.create('agendamento', {
        userId: req.user?.id,
        action: 'create',
        data: { cliente_id, tipo_local, valor },
        ip: req.ip
      });
      
      loggers.performance.end('agendamento_insert', Date.now() - startTime);
      res.redirect('/admin/agendamentos');
    } catch (error) {
      loggers.error.error('Erro ao inserir agendamento', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        data: { cliente_id, tipo_local, valor },
        duration: Date.now() - startTime
      });
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Formulário para editar agendamento
router.get('/editar/:id', 
  checkPermission('edit_agendamentos'),
  addBreadcrumb([{ title: 'Operacional', icon: 'fas fa-cogs' }, { title: 'Agendamentos', icon: 'fas fa-calendar', url: '/admin/agendamentos' }, { title: 'Editar', icon: 'fas fa-edit' }]),
  async (req, res) => {
    const startTime = Date.now();
    try {
      const { id } = req.params;
      loggers.database.query('SELECT agendamento by id', { id, duration: 0 });
      
      const agendamentoResult = await pool.query('SELECT * FROM agendamentos WHERE id = $1', [id]);
      
      if (agendamentoResult.rows.length === 0) {
        loggers.access.warn('Agendamento não encontrado', { id, userId: req.user?.id });
        return res.status(404).send('Agendamento não encontrado');
      }
      
      const clientesResult = await pool.query('SELECT id, nome FROM clientes WHERE status = \'ativo\' ORDER BY nome');
      const quiosquesResult = await pool.query('SELECT id, numero FROM quiosques WHERE status = \'ativo\' ORDER BY numero');
      
      loggers.database.query('agendamento_edit_form_loaded', { 
        id, 
        duration: Date.now() - startTime 
      });
      
      res.render('agendamentos/editar', {
        agendamento: agendamentoResult.rows[0],
        clientes: clientesResult.rows,
        quiosques: quiosquesResult.rows,
        activeMenu: 'agendamentos'
      });
    } catch (error) {
      loggers.error.error('Erro ao buscar agendamento', {
        error: error.message,
        stack: error.stack,
        agendamentoId: req.params.id,
        userId: req.user?.id,
        duration: Date.now() - startTime
      });
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Atualizar agendamento
router.post('/editar/:id', 
  checkPermission('edit_agendamentos'),
  invalidateCache(['agendamentos_*', 'clientes_*']),
  async (req, res) => {
    const startTime = Date.now();
    const { id } = req.params;
    const { cliente_id, tipo_local, quiosque_id, numero, data_agendamento, valor, status, observacoes } = req.body;
    
    try {
      loggers.performance.start('agendamento_update', { id, cliente_id });
      
      await pool.query(
        `UPDATE agendamentos SET cliente_id = $1, tipo_local = $2, quiosque_id = $3, numero = $4, 
         data_agendamento = $5, valor = $6, status = $7, observacoes = $8, data_atualizacao = CURRENT_TIMESTAMP
         WHERE id = $9`,
        [cliente_id, tipo_local, quiosque_id || null, numero || null, data_agendamento, valor, status, observacoes || null, id]
      );
      
      loggers.audit.update('agendamento', {
        userId: req.user?.id,
        action: 'update',
        resourceId: id,
        data: { cliente_id, status, valor },
        ip: req.ip
      });
      
      loggers.performance.end('agendamento_update', Date.now() - startTime);
      res.redirect('/admin/agendamentos');
    } catch (error) {
      loggers.error.error('Erro ao atualizar agendamento', {
        error: error.message,
        stack: error.stack,
        agendamentoId: id,
        userId: req.user?.id,
        data: { cliente_id, status, valor },
        duration: Date.now() - startTime
      });
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Query builder para agendamentos
function buildAgendamentosQuery(filters) {
  let query = `
    SELECT a.*, c.nome as cliente_nome, q.tipo_local, q.numero
    FROM agendamentos a
    LEFT JOIN clientes c ON a.cliente_id = c.id
    LEFT JOIN quiosques q ON a.quiosque_id = q.id
    WHERE 1=1
  `;
  const params = [];
  
  if (filters.cliente) {
    params.push(`%${filters.cliente}%`);
    query += ` AND c.nome ILIKE $${params.length}`;
  }
  
  if (filters.status) {
    params.push(filters.status);
    query += ` AND a.status = $${params.length}`;
  }
  
  if (filters.dataInicio) {
    params.push(filters.dataInicio);
    query += ` AND a.data_agendamento >= $${params.length}`;
  }
  
  if (filters.dataFim) {
    params.push(filters.dataFim);
    query += ` AND a.data_agendamento <= $${params.length}`;
  }
  
  query += ` ORDER BY a.data_agendamento DESC`;
  
  return { query, params };
}

// Criar middleware de export
const exportMiddleware = createExportMiddleware('agendamentos', buildAgendamentosQuery, 'view_agendamentos');

// Rotas de export
router.get('/export/csv', checkPermission('view_agendamentos'), exportMiddleware.csv);
router.get('/export/excel', checkPermission('view_agendamentos'), exportMiddleware.excel);

// Export personalizado
router.get('/export/custom/:format', 
  checkPermission('view_agendamentos'),
  async (req, res) => {
    try {
      const { format } = req.params;
      const { fields, ...filters } = req.query;
      
      // Query personalizada baseada nos campos selecionados
      const selectedFields = fields ? fields.split(',') : null;
      const { query, params } = buildAgendamentosQuery(filters);
      
      const result = await pool.query(query, params);
      
      let { headers, data } = ExportUtils.formatDataForExport('agendamentos', result.rows);
      
      // Filtrar campos se especificado
      if (selectedFields) {
        const fieldMap = {
          'id': 'ID',
          'cliente': 'Cliente',
          'quiosque': 'Quiosque',
          'data_agendamento': 'Data Agendamento',
          'status': 'Status',
          'valor': 'Valor'
        };
        
        headers = selectedFields.map(field => fieldMap[field]).filter(Boolean);
        data = data.map(row => {
          const filteredRow = {};
          selectedFields.forEach(field => {
            if (fieldMap[field]) {
              filteredRow[fieldMap[field].toLowerCase().replace(/\s+/g, '_')] = row[field];
            }
          });
          return filteredRow;
        });
      }
      
      const filename = `agendamentos_personalizado_${new Date().toISOString().split('T')[0]}`;
      
      if (format === 'csv') {
        ExportUtils.exportToCSV(data, headers, filename, res);
      } else if (format === 'excel') {
        ExportUtils.exportToExcel(data, headers, filename, res, {
          sheetName: 'Agendamentos',
          includeStats: req.query.includeStats === 'on'
        });
      } else {
        res.status(400).send('Formato não suportado');
      }
      
    } catch (error) {
      loggers.error.error('Custom export error', {
        error: error.message,
        module: 'agendamentos',
        format: req.params.format
      });
      res.status(500).send('Erro ao exportar dados');
    }
  }
);

export default router;