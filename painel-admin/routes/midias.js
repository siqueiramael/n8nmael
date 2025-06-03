import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { loggers } from '../utils/logger.js';
import { crudLogger } from '../middleware/logging.js';
import { ExportUtils } from '../utils/export.js';
import { createExportMiddleware } from '../middleware/export.js';

const router = express.Router();

// Listar todas as mídias
router.get('/', 
  checkPermission('view_midias'),
  addBreadcrumb([{ title: 'Sistema', icon: 'fas fa-cogs' }, { title: 'Mídias', icon: 'fas fa-photo-video' }]),
  cacheMiddleware('midias_list', 300),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      const result = await pool.query('SELECT * FROM midias ORDER BY data_criacao DESC');
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'SELECT midias list',
        queryDuration,
        req.user.id
      );
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'list',
        'midias',
        req.ip,
        { count: result.rows.length, duration: totalDuration }
      );
      
      res.json({ 
        midias: result.rows,
        activeMenu: 'midias'
      });
      
    } catch (error) {
      loggers.system.error('Error listing midias', {
        error: error.message,
        userId: req.user.id,
        ip: req.ip
      });
      
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Salvar nova mídia
router.post('/', 
  checkPermission('edit_midias'),
  crudLogger('create', 'midia'),
  async (req, res) => {
    const { nome, tipo, url, descricao, tags, status } = req.body;
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      
      const result = await pool.query(
        `INSERT INTO midias (nome, tipo, url, descricao, tags, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [nome, tipo, url, descricao || null, tags || null, status || 'ativo']
      );
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'INSERT midia',
        queryDuration,
        req.user.id,
        [nome, tipo, url]
      );
      
      // Invalidar cache
      await invalidateCache(['midias_*'], req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'create',
        'midia',
        req.ip,
        {
          midiaId: result.rows[0].id,
          nome,
          tipo,
          url,
          duration: totalDuration
        }
      );
      
      res.redirect('/admin/midias');
      
    } catch (error) {
      loggers.system.error('Error creating midia', {
        error: error.message,
        userId: req.user.id,
        data: { nome, tipo, url },
        ip: req.ip
      });
      
      res.status(500).send('Erro ao inserir mídia');
    }
  }
);

// Função para construir query de mídias
function buildMidiasQuery(filters) {
  let query = `
    SELECT 
      id,
      nome,
      tipo,
      formato,
      tamanho,
      url,
      descricao,
      tags,
      status,
      data_criacao,
      data_atualizacao,
      criado_por
    FROM midias
  `;
  
  const params = [];
  const conditions = [];
  
  if (filters.tipo) {
    conditions.push(`tipo = $${params.length + 1}`);
    params.push(filters.tipo);
  }
  
  if (filters.formato) {
    conditions.push(`formato = $${params.length + 1}`);
    params.push(filters.formato);
  }
  
  if (filters.status) {
    conditions.push(`status = $${params.length + 1}`);
    params.push(filters.status);
  }
  
  if (filters.tags) {
    conditions.push(`tags ILIKE $${params.length + 1}`);
    params.push(`%${filters.tags}%`);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY data_criacao DESC';
  
  return { query, params };
}

// Criar middleware de exportação
const exportMiddleware = createExportMiddleware('midias', buildMidiasQuery, 'view_midias');

// Rotas de exportação
router.get('/export/csv', checkPermission('view_midias'), exportMiddleware.csv);
router.get('/export/excel', checkPermission('view_midias'), exportMiddleware.excel);

export default router;