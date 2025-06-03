import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { loggers } from '../utils/logger.js';
import { crudLogger } from '../middleware/logging.js';

const router = express.Router();

// Listar todas as campanhas
router.get('/', 
  checkPermission('view_campanhas'),
  addBreadcrumb([{ title: 'Clientes & Marketing', icon: 'fas fa-users' }, { title: 'Campanhas', icon: 'fas fa-bullhorn' }]),
  cacheMiddleware('campanhas_list', 300),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      const result = await pool.query('SELECT * FROM campanhas ORDER BY data_criacao DESC');
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'SELECT campanhas list',
        queryDuration,
        req.user.id
      );
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'list',
        'campanhas',
        req.ip,
        { count: result.rows.length, duration: totalDuration }
      );
      
      res.json({ 
        campanhas: result.rows,
        activeMenu: 'campanhas'
      });
      
    } catch (error) {
      loggers.system.error('Error listing campanhas', {
        error: error.message,
        userId: req.user.id,
        ip: req.ip
      });
      
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Formulário para nova campanha
router.get('/novo', 
  checkPermission('edit_campanhas'),
  addBreadcrumb([{ title: 'Clientes & Marketing', icon: 'fas fa-users' }, { title: 'Campanhas', icon: 'fas fa-bullhorn', url: '/admin/campanhas' }, { title: 'Nova', icon: 'fas fa-plus' }]),
  (req, res) => {
    loggers.access.action(
      req.user.id,
      'view_form',
      'campanhas',
      req.ip,
      { action: 'new' }
    );
    
    res.render('campanhas/novo', { activeMenu: 'campanhas' });
  }
);

// Salvar nova campanha
router.post('/', 
  checkPermission('edit_campanhas'),
  crudLogger('create', 'campanha'),
  async (req, res) => {
    const { nome, descricao, tipo, data_inicio, data_fim, publico_alvo, orcamento, status } = req.body;
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      
      const result = await pool.query(
        `INSERT INTO campanhas (nome, descricao, tipo, data_inicio, data_fim, publico_alvo, orcamento, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [nome, descricao || null, tipo, data_inicio, data_fim || null, publico_alvo || null, orcamento || null, status || 'ativo']
      );
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'INSERT campanha',
        queryDuration,
        req.user.id,
        [nome, tipo, data_inicio]
      );
      
      // Invalidar cache
      await invalidateCache(['campanhas_*'], req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'create',
        'campanha',
        req.ip,
        {
          campanhaId: result.rows[0].id,
          nome,
          tipo,
          duration: totalDuration
        }
      );
      
      res.redirect('/admin/campanhas');
      
    } catch (error) {
      loggers.system.error('Error creating campanha', {
        error: error.message,
        userId: req.user.id,
        data: { nome, tipo, data_inicio },
        ip: req.ip
      });
      
      res.status(500).send('Erro ao inserir campanha');
    }
  }
);

// Editar campanha
router.get('/:id/editar', 
  checkPermission('edit_campanhas'),
  addBreadcrumb([{ title: 'Clientes & Marketing', icon: 'fas fa-users' }, { title: 'Campanhas', icon: 'fas fa-bullhorn', url: '/admin/campanhas' }, { title: 'Editar', icon: 'fas fa-edit' }]),
  async (req, res) => {
    const { id } = req.params;
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      const result = await pool.query('SELECT * FROM campanhas WHERE id = $1', [id]);
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'SELECT campanha by id',
        queryDuration,
        req.user.id,
        [id]
      );
      
      if (result.rows.length === 0) {
        loggers.access.action(
          req.user.id,
          'view_edit_form',
          'campanha',
          req.ip,
          { campanhaId: id, found: false }
        );
        
        return res.status(404).send('Campanha não encontrada');
      }
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'view_edit_form',
        'campanha',
        req.ip,
        { campanhaId: id, duration: totalDuration }
      );
      
      res.render('campanhas/editar', {
        campanha: result.rows[0],
        activeMenu: 'campanhas'
      });
      
    } catch (error) {
      loggers.system.error('Error loading campanha for edit', {
        error: error.message,
        userId: req.user.id,
        campanhaId: id,
        ip: req.ip
      });
      
      res.status(500).send('Erro ao carregar campanha');
    }
  }
);

// Atualizar campanha
router.put('/:id',
  checkPermission('edit_campanhas'),
  crudLogger('update', 'campanha'),
  async (req, res) => {
    const { id } = req.params;
    const { nome, descricao, tipo, data_inicio, data_fim, publico_alvo, orcamento, status } = req.body;
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      
      const result = await pool.query(
        `UPDATE campanhas 
         SET nome = $1, descricao = $2, tipo = $3, data_inicio = $4, data_fim = $5, 
             publico_alvo = $6, orcamento = $7, status = $8, data_atualizacao = NOW()
         WHERE id = $9
         RETURNING id`,
        [nome, descricao, tipo, data_inicio, data_fim, publico_alvo, orcamento, status, id]
      );
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'UPDATE campanha',
        queryDuration,
        req.user.id,
        [nome, tipo, id]
      );
      
      if (result.rows.length === 0) {
        loggers.access.action(
          req.user.id,
          'update',
          'campanha',
          req.ip,
          { campanhaId: id, found: false }
        );
        
        return res.status(404).json({ 
          success: false, 
          message: 'Campanha não encontrada'
        });
      }
      
      // Invalidar cache
      await invalidateCache(['campanhas_*'], req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'update',
        'campanha',
        req.ip,
        {
          campanhaId: id,
          changes: { nome, tipo, status },
          duration: totalDuration
        }
      );
      
      res.json({ 
        success: true, 
        message: 'Campanha atualizada com sucesso'
      });
      
    } catch (error) {
      loggers.system.error('Error updating campanha', {
        error: error.message,
        userId: req.user.id,
        campanhaId: id,
        data: { nome, tipo, status },
        ip: req.ip
      });
      
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao atualizar campanha'
      });
    }
  }
);

// Deletar campanha
router.delete('/:id',
  checkPermission('edit_campanhas'),
  crudLogger('delete', 'campanha'),
  async (req, res) => {
    const { id } = req.params;
    const startTime = Date.now();
    
    try {
      const queryStart = Date.now();
      
      const result = await pool.query(
        'DELETE FROM campanhas WHERE id = $1 RETURNING id, nome',
        [id]
      );
      
      const queryDuration = Date.now() - queryStart;
      loggers.database.query(
        'DELETE campanha',
        queryDuration,
        req.user.id,
        [id]
      );
      
      if (result.rows.length === 0) {
        loggers.access.action(
          req.user.id,
          'delete',
          'campanha',
          req.ip,
          { campanhaId: id, found: false }
        );
        
        return res.status(404).json({ 
          success: false, 
          message: 'Campanha não encontrada'
        });
      }
      
      // Invalidar cache
      await invalidateCache(['campanhas_*'], req.user.id);
      
      const totalDuration = Date.now() - startTime;
      
      loggers.access.action(
        req.user.id,
        'delete',
        'campanha',
        req.ip,
        {
          campanhaId: id,
          nome: result.rows[0].nome,
          duration: totalDuration
        }
      );
      
      res.json({ 
        success: true, 
        message: 'Campanha deletada com sucesso'
      });
      
    } catch (error) {
      loggers.system.error('Error deleting campanha', {
        error: error.message,
        userId: req.user.id,
        campanhaId: id,
        ip: req.ip
      });
      
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao deletar campanha'
      });
    }
  }
);

export default router;