import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { loggers } from '../utils/logger.js';

const router = express.Router();

// Listar todos os logs de interações com filtros
router.get('/', 
  checkPermission('logs_interacoes_visualizar'),
  addBreadcrumb('Logs de Interações', '/admin/logs-interacoes'),
  cacheMiddleware((req) => `logs_interacoes_list_${JSON.stringify(req.query)}`, 600),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { cliente, tipo, dataInicio, dataFim } = req.query;
      
      loggers.access.info('Logs interacoes list access', {
        userId: req.user?.id,
        filters: { cliente, tipo, dataInicio, dataFim },
        ip: req.ip
      });
      
      let query = `
        SELECT l.*, c.nome as cliente_nome
        FROM logs_interacoes l
        LEFT JOIN clientes c ON l.cliente_id = c.id
        WHERE 1=1
      `;
      const queryParams = [];
      
      if (cliente) {
        queryParams.push(`%${cliente}%`);
        query += ` AND c.nome ILIKE $${queryParams.length}`;
      }
      
      if (tipo) {
        queryParams.push(tipo);
        query += ` AND l.tipo = $${queryParams.length}`;
      }
      
      if (dataInicio) {
        queryParams.push(dataInicio);
        query += ` AND l.data_registro >= $${queryParams.length}`;
      }
      
      if (dataFim) {
        queryParams.push(dataFim);
        query += ` AND l.data_registro <= $${queryParams.length}`;
      }
      
      query += ` ORDER BY l.data_registro DESC`;
      
      const dbStart = Date.now();
      const result = await pool.query(query, queryParams);
      const dbDuration = Date.now() - dbStart;
      
      loggers.database.query('Logs interacoes list query', {
        duration: dbDuration,
        rowCount: result.rows.length,
        filters: { cliente, tipo, dataInicio, dataFim },
        userId: req.user?.id
      });
      
      loggers.performance.request(
        'GET',
        '/admin/logs-interacoes',
        Date.now() - startTime,
        200,
        req.user?.id
      );
      
      res.json({
        logs: result.rows,
        filtros: { cliente, tipo, dataInicio, dataFim },
        activeMenu: 'logs-interacoes'
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.database.error('Logs interacoes list error', {
        error: error.message,
        stack: error.stack,
        duration,
        userId: req.user?.id,
        ip: req.ip
      });
      
      loggers.performance.request(
        'GET',
        '/admin/logs-interacoes',
        duration,
        500,
        req.user?.id
      );
      
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Visualizar detalhes de um log específico
router.get('/visualizar/:id', 
  checkPermission('logs_interacoes_visualizar'),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      
      loggers.access.info('Log interacao detail access', {
        userId: req.user?.id,
        logId: id,
        ip: req.ip
      });
      
      const dbStart = Date.now();
      const result = await pool.query(`
        SELECT l.*, c.nome as cliente_nome
        FROM logs_interacoes l
        LEFT JOIN clientes c ON l.cliente_id = c.id
        WHERE l.id = $1
      `, [id]);
      const dbDuration = Date.now() - dbStart;
      
      if (result.rows.length === 0) {
        loggers.access.warn('Log interacao not found', {
          userId: req.user?.id,
          logId: id,
          ip: req.ip
        });
        
        return res.status(404).send('Log não encontrado');
      }
      
      loggers.database.query('Log interacao detail query', {
        duration: dbDuration,
        logId: id,
        userId: req.user?.id
      });
      
      loggers.performance.request(
        'GET',
        `/admin/logs-interacoes/visualizar/${id}`,
        Date.now() - startTime,
        200,
        req.user?.id
      );
      
      res.json({
        log: result.rows[0],
        activeMenu: 'logs-interacoes'
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.database.error('Log interacao detail error', {
        error: error.message,
        stack: error.stack,
        logId: req.params.id,
        duration,
        userId: req.user?.id,
        ip: req.ip
      });
      
      loggers.performance.request(
        'GET',
        `/admin/logs-interacoes/visualizar/${req.params.id}`,
        duration,
        500,
        req.user?.id
      );
      
      res.status(500).send('Erro ao buscar detalhes');
    }
  }
);

// Exportar logs (CSV)
router.get('/exportar', async (req, res) => {
  try {
    // Parâmetros de filtro
    const { cliente, tipo, dataInicio, dataFim } = req.query;
    
    // Construir a consulta com filtros opcionais
    let query = `
      SELECT l.id, c.nome as cliente_nome, l.tipo, l.conteudo, 
             l.origem, l.destino, l.data_registro
      FROM logs_interacoes l
      LEFT JOIN clientes c ON l.cliente_id = c.id
      WHERE 1=1
    `;
    const queryParams = [];
    
    // Adicionar filtros se fornecidos
    if (cliente) {
      queryParams.push(`%${cliente}%`);
      query += ` AND c.nome ILIKE $${queryParams.length}`;
    }
    
    if (tipo) {
      queryParams.push(tipo);
      query += ` AND l.tipo = $${queryParams.length}`;
    }
    
    if (dataInicio) {
      queryParams.push(dataInicio);
      query += ` AND l.data_registro >= $${queryParams.length}`;
    }
    
    if (dataFim) {
      queryParams.push(dataFim);
      query += ` AND l.data_registro <= $${queryParams.length}`;
    }
    
    // Ordenação
    query += ` ORDER BY l.data_registro DESC`;
    
    const result = await pool.query(query, queryParams);
    
    // Configurar cabeçalhos para download de CSV
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=logs_interacoes.csv');
    
    // Escrever cabeçalho do CSV
    res.write('ID,Cliente,Tipo,Conteúdo,Origem,Destino,Data Registro\n');
    
    // Escrever linhas de dados
    result.rows.forEach(log => {
      const row = [
        log.id,
        log.cliente_nome || '',
        log.tipo || '',
        `"${(log.conteudo || '').replace(/"/g, '""')}"`,
        log.origem || '',
        log.destino || '',
        new Date(log.data_registro).toLocaleString('pt-BR')
      ];
      res.write(row.join(',') + '\n');
    });
    
    res.end();
  } // Linha 246 - Erro ao exportar logs
  catch (error) {
    loggers.error.error('Erro ao exportar logs de interações', {
      error: error.message,
      stack: error.stack,
      filters: req.query,
      userId: req.user?.id,
      duration: Date.now() - startTime
    });
    res.status(500).send('Erro ao exportar dados');
  }
  
  // Linha 297 - Erro ao gerar relatório de logs
  catch (error) {
    loggers.error.error('Erro ao gerar relatório de logs de interações', {
      error: error.message,
      stack: error.stack,
      filters: req.query,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).send('Erro ao gerar relatório');
  }
});

// Relatório de logs
router.get('/relatorio', async (req, res) => {
  try {
    // Estatísticas por tipo
    const tiposResult = await pool.query(`
      SELECT tipo, COUNT(*) as total
      FROM logs_interacoes
      GROUP BY tipo
      ORDER BY total DESC
    `);
    
    // Estatísticas por dia (últimos 30 dias)
    const porDiaResult = await pool.query(`
      SELECT DATE(data_registro) as data, COUNT(*) as total
      FROM logs_interacoes
      WHERE data_registro >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(data_registro)
      ORDER BY data
    `);
    
    // Estatísticas por origem
    const origensResult = await pool.query(`
      SELECT origem, COUNT(*) as total
      FROM logs_interacoes
      GROUP BY origem
      ORDER BY total DESC
      LIMIT 10
    `);
    
    // Estatísticas por destino
    const destinosResult = await pool.query(`
      SELECT destino, COUNT(*) as total
      FROM logs_interacoes
      GROUP BY destino
      ORDER BY total DESC
      LIMIT 10
    `);
    
    res.render('logs-interacoes/relatorio', { 
      estatisticasTipos: tiposResult.rows,
      estatisticasPorDia: porDiaResult.rows,
      estatisticasOrigens: origensResult.rows,
      estatisticasDestinos: destinosResult.rows,
      activeMenu: 'logs-interacoes'
    });
  } catch (error) {
    loggers.error.error('Erro ao gerar relatório de logs', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      route: '/relatorio'
    });
    res.status(500).send('Erro ao gerar relatório');
  }
});

export default router;