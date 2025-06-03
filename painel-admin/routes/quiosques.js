import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { loggers } from '../utils/logger.js';
import { crudLogger } from '../middleware/logging.js';

const router = express.Router();

// Listar todos os quiosques
router.get('/', 
  checkPermission('quiosques_visualizar'),
  addBreadcrumb('Quiosques', '/admin/quiosques'),
  cacheMiddleware('quiosques_list', 600),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      const result = await pool.query('SELECT * FROM quiosques ORDER BY numero');
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'SELECT quiosques list',
        queryDuration,
        req.user.id
      );
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'list',
        'quiosques',
        req.ip,
        { count: result.rows.length, duration: totalDuration }
      );
      
      res.json({ 
        quiosques: result.rows,
        activeMenu: 'quiosques'
      });
      
    } catch (error) {
      loggers.system.error('Error listing quiosques', {
        error: error.message,
        userId: req.user.id,
        ip: req.ip
      });
      
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Salvar novo quiosque
router.post('/', 
  checkPermission('quiosques_criar'),
  crudLogger('create', 'quiosque'),
  async (req, res) => {
    const { numero, descricao, posicao } = req.body;
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      
      const result = await pool.query(
        `INSERT INTO quiosques (numero, descricao, posicao)
         VALUES ($1, $2, $3) RETURNING id`,
        [numero, descricao || null, posicao || null]
      );
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'INSERT quiosque',
        queryDuration,
        req.user.id,
        [numero, descricao]
      );
      
      // Invalidar cache
      await invalidateCache(['quiosques_*'], req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'create',
        'quiosque',
        req.ip,
        {
          quiosqueId: result.rows[0].id,
          numero,
          descricao,
          duration: totalDuration
        }
      );
      
      res.redirect('/admin/quiosques');
      
    } catch (error) {
      loggers.system.error('Error creating quiosque', {
        error: error.message,
        userId: req.user.id,
        data: { numero, descricao },
        ip: req.ip
      });
      
      res.status(500).send('Erro ao inserir quiosque');
    }
  }
);

export default router;