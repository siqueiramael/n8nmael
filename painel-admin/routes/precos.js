import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { loggers } from '../utils/logger.js';
import { crudLogger } from '../middleware/logging.js';

const router = express.Router();

// Listar todos os preços
router.get('/', 
  checkPermission('precos_visualizar'),
  addBreadcrumb('Preços', '/admin/precos'),
  cacheMiddleware('precos_list', 600),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      const result = await pool.query('SELECT * FROM precos_quiosques ORDER BY tipo_local, numero');
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'SELECT precos list',
        queryDuration,
        req.user.id
      );
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'list',
        'precos',
        req.ip,
        { count: result.rows.length, duration: totalDuration }
      );
      
      res.json({ 
        precos: result.rows,
        activeMenu: 'precos'
      });
      
    } catch (error) {
      loggers.system.error('Error listing precos', {
        error: error.message,
        userId: req.user.id,
        ip: req.ip
      });
      
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Salvar novo preço
router.post('/', 
  checkPermission('precos_criar'),
  crudLogger('create', 'preco'),
  async (req, res) => {
    const { tipo_local, numero, valor, data_inicio, data_fim, motivo } = req.body;
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      
      const result = await pool.query(
        `INSERT INTO precos_quiosques (tipo_local, numero, valor, data_inicio, data_fim, motivo)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [tipo_local, numero || null, valor, data_inicio, data_fim || null, motivo]
      );
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'INSERT preco',
        queryDuration,
        req.user.id,
        [tipo_local, numero, valor]
      );
      
      // Invalidar cache
      await invalidateCache(['precos_*'], req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'create',
        'preco',
        req.ip,
        {
          precoId: result.rows[0].id,
          tipo_local,
          numero,
          valor,
          duration: totalDuration
        }
      );
      
      res.redirect('/admin');
      
    } catch (error) {
      loggers.system.error('Error creating preco', {
        error: error.message,
        userId: req.user.id,
        data: { tipo_local, numero, valor },
        ip: req.ip
      });
      
      res.status(500).send('Erro ao inserir preço');
    }
  }
);

export default router;