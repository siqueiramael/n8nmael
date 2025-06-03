import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { loggers } from '../utils/logger.js';
import { crudLogger } from '../middleware/logging.js';
import { ExportUtils } from '../utils/export.js';
import { createExportMiddleware } from '../middleware/export.js';

const router = express.Router();

// Listar toda a infraestrutura
router.get('/', 
  checkPermission('view_infraestrutura'),
  addBreadcrumb([{ title: 'Sistema', icon: 'fas fa-cogs' }, { title: 'Infraestrutura', icon: 'fas fa-server' }]),
  cacheMiddleware('infraestrutura_list', 600),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      const result = await pool.query('SELECT * FROM infraestrutura ORDER BY tipo, nome');
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'SELECT infraestrutura list',
        queryDuration,
        req.user.id
      );
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'list',
        'infraestrutura',
        req.ip,
        { count: result.rows.length, duration: totalDuration }
      );
      
      res.json({ 
        infraestrutura: result.rows,
        activeMenu: 'infraestrutura'
      });
      
    } catch (error) {
      loggers.system.error('Error listing infraestrutura', {
        error: error.message,
        userId: req.user.id,
        ip: req.ip
      });
      
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Formulário para nova infraestrutura
router.get('/novo', 
  checkPermission('edit_infraestrutura'),
  addBreadcrumb([{ title: 'Sistema', icon: 'fas fa-cogs' }, { title: 'Infraestrutura', icon: 'fas fa-server', url: '/admin/infraestrutura' }, { title: 'Novo', icon: 'fas fa-plus' }]),
  (req, res) => {
    loggers.access.action(
      req.user.id,
      'view_form',
      'infraestrutura',
      req.ip,
      { action: 'new' }
    );
    
    res.render('infraestrutura/novo', { activeMenu: 'infraestrutura' });
  }
);

// Salvar nova infraestrutura
router.post('/', 
  checkPermission('edit_infraestrutura'),
  crudLogger('create', 'infraestrutura'),
  async (req, res) => {
    const { tipo, nome, descricao, localizacao, status, especificacoes } = req.body;
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      
      const result = await pool.query(
        `INSERT INTO infraestrutura (tipo, nome, descricao, localizacao, status, especificacoes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [tipo, nome, descricao || null, localizacao || null, status || 'ativo', especificacoes || null]
      );
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'INSERT infraestrutura',
        queryDuration,
        req.user.id,
        [tipo, nome, status]
      );
      
      // Invalidar cache
      await invalidateCache(['infraestrutura_*'], req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'create',
        'infraestrutura',
        req.ip,
        {
          infraestruturaId: result.rows[0].id,
          tipo,
          nome,
          duration: totalDuration
        }
      );
      
      res.redirect('/admin/infraestrutura');
      
    } catch (error) {
      loggers.system.error('Error creating infraestrutura', {
        error: error.message,
        userId: req.user.id,
        data: { tipo, nome, status },
        ip: req.ip
      });
      
      res.status(500).send('Erro ao inserir infraestrutura');
    }
  }
);

// Atualizar infraestrutura
router.put('/:id',
  checkPermission('edit_infraestrutura'),
  crudLogger('update', 'infraestrutura'),
  async (req, res) => {
    const { id } = req.params;
    const { tipo, nome, descricao, localizacao, status, especificacoes } = req.body;
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      
      const result = await pool.query(
        `UPDATE infraestrutura 
         SET tipo = $1, nome = $2, descricao = $3, localizacao = $4, status = $5, especificacoes = $6, data_atualizacao = NOW()
         WHERE id = $7
         RETURNING id`,
        [tipo, nome, descricao, localizacao, status, especificacoes, id]
      );
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'UPDATE infraestrutura',
        queryDuration,
        req.user.id,
        [tipo, nome, status, id]
      );
      
      if (result.rows.length === 0) {
        loggers.access.action(
          req.user.id,
          'update',
          'infraestrutura',
          req.ip,
          { infraestruturaId: id, found: false }
        );
        
        return res.status(404).json({ 
          success: false, 
          message: 'Infraestrutura não encontrada'
        });
      }
      
      // Invalidar cache
      await invalidateCache(['infraestrutura_*'], req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'update',
        'infraestrutura',
        req.ip,
        {
          infraestruturaId: id,
          changes: { tipo, nome, status },
          duration: totalDuration
        }
      );
      
      res.json({ 
        success: true, 
        message: 'Infraestrutura atualizada com sucesso'
      });
      
    } catch (error) {
      loggers.system.error('Error updating infraestrutura', {
        error: error.message,
        userId: req.user.id,
        infraestruturaId: id,
        data: { tipo, nome, status },
        ip: req.ip
      });
      
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao atualizar infraestrutura'
      });
    }
  }
);

// Função para construir query de infraestrutura
function buildInfraestruturaQuery(filters) {
  let query = `
    SELECT 
      id,
      nome,
      tipo,
      descricao,
      status,
      localizacao,
      especificacoes,
      data_instalacao,
      data_manutencao,
      responsavel,
      observacoes
    FROM infraestrutura
  `;
  
  const params = [];
  const conditions = [];
  
  if (filters.tipo) {
    conditions.push(`tipo = $${params.length + 1}`);
    params.push(filters.tipo);
  }
  
  if (filters.status) {
    conditions.push(`status = $${params.length + 1}`);
    params.push(filters.status);
  }
  
  if (filters.responsavel) {
    conditions.push(`responsavel ILIKE $${params.length + 1}`);
    params.push(`%${filters.responsavel}%`);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY tipo, nome';
  
  return { query, params };
}

// Criar middleware de exportação
const exportMiddleware = createExportMiddleware('infraestrutura', buildInfraestruturaQuery, 'view_infraestrutura');

// Rotas de exportação
router.get('/export/csv', checkPermission('view_infraestrutura'), exportMiddleware.csv);
router.get('/export/excel', checkPermission('view_infraestrutura'), exportMiddleware.excel);

export default router;