import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';

const router = express.Router();

// Listar todos os logs de interações com filtros
router.get('/', 
  checkPermission('logs_interacoes_visualizar'),
  addBreadcrumb('Logs de Interações', '/admin/logs-interacoes'),
  cacheMiddleware((req) => `logs_interacoes_list_${JSON.stringify(req.query)}`, 600),
  async (req, res) => {
    try {
      // Parâmetros de filtro
      const { cliente, tipo, dataInicio, dataFim } = req.query;
      
      // Construir a consulta com filtros opcionais
      let query = `
        SELECT l.*, c.nome as cliente_nome
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
      
      res.json({
        logs: result.rows,
        filtros: { cliente, tipo, dataInicio, dataFim },
        activeMenu: 'logs-interacoes'
      });
    } catch (error) {
      console.error('Erro ao buscar logs de interações:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Visualizar detalhes de um log específico
router.get('/visualizar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT l.*, c.nome as cliente_nome
      FROM logs_interacoes l
      LEFT JOIN clientes c ON l.cliente_id = c.id
      WHERE l.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).send('Log não encontrado');
    }
    
    res.render('logs-interacoes/visualizar', { 
      log: result.rows[0],
      activeMenu: 'logs-interacoes'
    });
  } catch (error) {
    console.error('Erro ao buscar detalhes do log:', error);
    res.status(500).send('Erro ao buscar dados');
  }
});

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
  } catch (error) {
    console.error('Erro ao exportar logs:', error);
    res.status(500).send('Erro ao exportar dados');
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
    console.error('Erro ao gerar relatório de logs:', error);
    res.status(500).send('Erro ao gerar relatório');
  }
});

export default router;