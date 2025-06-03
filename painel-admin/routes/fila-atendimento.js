import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { loggers } from '../utils/logger.js';
import { ExportUtils } from '../utils/export.js';
import { createExportMiddleware } from '../middleware/export.js';

const router = express.Router();

// Listar todas as solicitações de atendimento
router.get('/', 
  checkPermission('fila_atendimento_visualizar'),
  addBreadcrumb('Fila de Atendimento', '/admin/fila-atendimento'),
  cacheMiddleware((req) => `fila_atendimento_list_${JSON.stringify(req.query)}`, 300),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { status, data_inicio, data_fim } = req.query;
      
      loggers.access.info('Fila atendimento list access', {
        userId: req.user?.id,
        filters: { status, data_inicio, data_fim },
        ip: req.ip
      });
      
      let query = `
        SELECT *,
               EXTRACT(EPOCH FROM (data_fim_atendimento - data_inicio_atendimento))/60 as duracao_minutos
        FROM fila_atendimento
        WHERE 1=1
      `;
      const params = [];
      
      if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }
      
      if (data_inicio) {
        params.push(data_inicio);
        query += ` AND DATE(data_solicitacao) >= $${params.length}`;
      }
      
      if (data_fim) {
        params.push(data_fim);
        query += ` AND DATE(data_solicitacao) <= $${params.length}`;
      }
      
      query += ' ORDER BY data_solicitacao DESC';
      
      const dbStart = Date.now();
      const result = await pool.query(query, params);
      const dbDuration = Date.now() - dbStart;
      
      loggers.database.query('Fila atendimento list query', {
        duration: dbDuration,
        rowCount: result.rows.length,
        filters: { status, data_inicio, data_fim },
        userId: req.user?.id
      });
      
      loggers.performance.request(
        'GET',
        '/admin/fila-atendimento',
        Date.now() - startTime,
        200,
        req.user?.id
      );
      
      res.json({ 
        atendimentos: result.rows,
        filtros: { status, data_inicio, data_fim },
        activeMenu: 'fila-atendimento'
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.database.error('Fila atendimento list error', {
        error: error.message,
        stack: error.stack,
        duration,
        userId: req.user?.id,
        ip: req.ip
      });
      
      loggers.performance.request(
        'GET',
        '/admin/fila-atendimento',
        duration,
        500,
        req.user?.id
      );
      
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Formulário para nova solicitação
router.get('/novo', 
  checkPermission('fila_atendimento_criar'),
  addBreadcrumb('Fila de Atendimento', '/admin/fila-atendimento'),
  addBreadcrumb('Nova Solicitação', '/admin/fila-atendimento/novo'),
  (req, res) => {
  res.render('fila-atendimento/novo', { 
    activeMenu: 'fila-atendimento' 
  });
});

// Criar nova solicitação
router.post('/', 
  checkPermission('fila_atendimento_criar'),
  invalidateCache(['fila_atendimento_*']),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { cliente_telefone, cliente_nome, contexto_conversa } = req.body;
      
      loggers.access.info('Fila atendimento creation attempt', {
        userId: req.user?.id,
        data: { cliente_telefone, cliente_nome, contexto_conversa },
        ip: req.ip
      });
      
      const dbStart = Date.now();
      await pool.query(
        'INSERT INTO fila_atendimento (cliente_telefone, cliente_nome, contexto_conversa) VALUES ($1, $2, $3)',
        [cliente_telefone, cliente_nome, contexto_conversa]
      );
      const dbDuration = Date.now() - dbStart;
      
      loggers.database.query('Fila atendimento insert', {
        duration: dbDuration,
        table: 'fila_atendimento',
        operation: 'INSERT',
        userId: req.user?.id
      });
      
      loggers.system.info('Fila atendimento created successfully', {
        userId: req.user?.id,
        cliente_telefone,
        cliente_nome
      });
      
      loggers.performance.request(
        'POST',
        '/admin/fila-atendimento',
        Date.now() - startTime,
        302,
        req.user?.id
      );
      
      res.redirect('/admin/fila-atendimento?success=created');
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.database.error('Fila atendimento creation error', {
        error: error.message,
        stack: error.stack,
        data: req.body,
        duration,
        userId: req.user?.id,
        ip: req.ip
      });
      
      loggers.performance.request(
        'POST',
        '/admin/fila-atendimento',
        duration,
        500,
        req.user?.id
      );
      
      res.status(500).send('Erro ao criar solicitação');
    }
  }
);

// Formulário para editar solicitação
router.get('/editar/:id', 
  checkPermission('fila_atendimento_editar'),
  addBreadcrumb('Fila de Atendimento', '/admin/fila-atendimento'),
  addBreadcrumb('Editar Solicitação', null),
  async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM fila_atendimento WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).send('Solicitação não encontrada');
    }
    
    res.render('fila-atendimento/editar', { 
      atendimento: result.rows[0],
      activeMenu: 'fila-atendimento' 
    });
  } catch (error) {
    loggers.error.error('Erro ao buscar solicitação de atendimento', {
      error: error.message,
      stack: error.stack,
      solicitacaoId: id,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).send('Erro ao buscar dados');
  }
});

// Atualizar solicitação
router.put('/:id', 
  checkPermission('fila_atendimento_editar'),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { cliente_telefone, cliente_nome, status, contexto_conversa } = req.body;
    
    let query = `
      UPDATE fila_atendimento 
      SET cliente_telefone = $1, cliente_nome = $2, status = $3, 
          contexto_conversa = $4, data_atualizacao = CURRENT_TIMESTAMP
    `;
    let params = [cliente_telefone, cliente_nome, status, contexto_conversa];
    
    // Se o status mudou para 'em_atendimento' e não há data de início, definir agora
    if (status === 'em_atendimento') {
      query += ', data_inicio_atendimento = COALESCE(data_inicio_atendimento, CURRENT_TIMESTAMP)';
    }
    
    // Se o status mudou para 'finalizado' e não há data de fim, definir agora
    if (status === 'finalizado') {
      query += ', data_fim_atendimento = COALESCE(data_fim_atendimento, CURRENT_TIMESTAMP)';
    }
    
    query += ' WHERE id = $5';
    params.push(id);
    
    await pool.query(query, params);
    
    res.redirect('/admin/fila-atendimento?success=updated');
  } catch (error) {
    loggers.error.error('Erro ao atualizar solicitação de atendimento', {
      error: error.message,
      stack: error.stack,
      solicitacaoId: id,
      userId: req.user?.id,
      body: req.body,
      ip: req.ip
    });
    res.status(500).send('Erro ao atualizar solicitação');
  }
});

// Iniciar atendimento
router.post('/iniciar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE fila_atendimento SET status = $1, data_inicio_atendimento = CURRENT_TIMESTAMP, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $2',
      ['em_atendimento', id]
    );
    
    res.redirect('/admin/fila-atendimento?success=started');
  } catch (error) {
    loggers.error.error('Erro ao iniciar atendimento', {
      error: error.message,
      stack: error.stack,
      atendimentoId: id,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).send('Erro ao iniciar atendimento');
  }
});

// Finalizar atendimento
router.post('/finalizar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE fila_atendimento SET status = $1, data_fim_atendimento = CURRENT_TIMESTAMP, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $2',
      ['finalizado', id]
    );
    
    res.redirect('/admin/fila-atendimento?success=finished');
  } catch (error) {
    loggers.error.error('Erro ao finalizar atendimento', {
      error: error.message,
      stack: error.stack,
      atendimentoId: id,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).send('Erro ao finalizar atendimento');
  }
});

// Atualizar status de atendimento
router.put('/:id/status', 
  checkPermission('fila_atendimento_editar'),
  invalidateCache(['fila_atendimento_*']),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { cliente_telefone, cliente_nome, status, contexto_conversa } = req.body;
    
    let query = `
      UPDATE fila_atendimento 
      SET cliente_telefone = $1, cliente_nome = $2, status = $3, 
          contexto_conversa = $4, data_atualizacao = CURRENT_TIMESTAMP
    `;
    let params = [cliente_telefone, cliente_nome, status, contexto_conversa];
    
    // Se o status mudou para 'em_atendimento' e não há data de início, definir agora
    if (status === 'em_atendimento') {
      query += ', data_inicio_atendimento = COALESCE(data_inicio_atendimento, CURRENT_TIMESTAMP)';
    }
    
    // Se o status mudou para 'finalizado' e não há data de fim, definir agora
    if (status === 'finalizado') {
      query += ', data_fim_atendimento = COALESCE(data_fim_atendimento, CURRENT_TIMESTAMP)';
    }
    
    query += ' WHERE id = $5';
    params.push(id);
    
    await pool.query(query, params);
    
    res.redirect('/admin/fila-atendimento?success=updated');
  } catch (error) {
    loggers.error.error('Erro ao atualizar solicitação', {
      error: error.message,
      stack: error.stack,
      solicitacaoId: id,
      userId: req.user?.id,
      data: req.body,
      duration: Date.now() - startTime
    });
    res.status(500).send('Erro ao atualizar solicitação');
  }
});

// Excluir solicitação
router.delete('/:id', 
  checkPermission('fila_atendimento_excluir'),
  invalidateCache(['fila_atendimento_*']),
  async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM fila_atendimento WHERE id = $1', [id]);
    res.redirect('/admin/fila-atendimento?success=deleted');
  } catch (error) {
    loggers.error.error('Erro ao excluir solicitação de atendimento', {
      error: error.message,
      stack: error.stack,
      solicitacaoId: id,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).send('Erro ao excluir solicitação');
  }
});

// Relatório de atendimentos
router.get('/relatorio', async (req, res) => {
  try {
    // Estatísticas gerais
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pendente' THEN 1 END) as pendentes,
        COUNT(CASE WHEN status = 'em_atendimento' THEN 1 END) as em_atendimento,
        COUNT(CASE WHEN status = 'finalizado' THEN 1 END) as finalizados,
        AVG(EXTRACT(EPOCH FROM (data_fim_atendimento - data_inicio_atendimento))/60) as tempo_medio_minutos
      FROM fila_atendimento
      WHERE data_solicitacao >= CURRENT_DATE - INTERVAL '30 days'
    `);
    
    // Atendimentos por dia (últimos 7 dias)
    const dailyResult = await pool.query(`
      SELECT 
        DATE(data_solicitacao) as data,
        COUNT(*) as total_solicitacoes,
        COUNT(CASE WHEN status = 'finalizado' THEN 1 END) as finalizados
      FROM fila_atendimento
      WHERE data_solicitacao >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(data_solicitacao)
      ORDER BY data DESC
    `);
    
    // Tempo médio de atendimento por dia
    const tempoResult = await pool.query(`
      SELECT 
        DATE(data_inicio_atendimento) as data,
        AVG(EXTRACT(EPOCH FROM (data_fim_atendimento - data_inicio_atendimento))/60) as tempo_medio_minutos,
        COUNT(*) as total_atendimentos
      FROM fila_atendimento
      WHERE data_inicio_atendimento >= CURRENT_DATE - INTERVAL '7 days'
        AND status = 'finalizado'
      GROUP BY DATE(data_inicio_atendimento)
      ORDER BY data DESC
    `);
    
    res.render('fila-atendimento/relatorio', {
      stats: statsResult.rows[0],
      dailyStats: dailyResult.rows,
      tempoStats: tempoResult.rows,
      activeMenu: 'fila-atendimento'
    });
  } catch (error) {
    // Substituir todas as 7 ocorrências de console.error por:
    
    // Linha 199 - Erro ao buscar solicitação
    catch (error) {
    loggers.error.error('Erro ao buscar solicitação', {
    error: error.message,
    stack: error.stack,
    solicitacaoId: req.params.id,
    userId: req.user?.id,
    duration: Date.now() - startTime
    });
    res.status(500).send('Erro ao buscar dados');
    }
    
    // Linha 236 - Erro ao atualizar solicitação
    catch (error) {
    loggers.error.error('Erro ao atualizar solicitação', {
    error: error.message,
    stack: error.stack,
    solicitacaoId: id,
    userId: req.user?.id,
    data: req.body,
    duration: Date.now() - startTime
    });
    res.status(500).send('Erro ao salvar dados');
    }
    
    // Linha 253 - Erro ao iniciar atendimento
    catch (error) {
    loggers.error.error('Erro ao iniciar atendimento', {
    error: error.message,
    stack: error.stack,
    solicitacaoId: id,
    userId: req.user?.id,
    duration: Date.now() - startTime
    });
    res.status(500).send('Erro ao iniciar atendimento');
    }
    
    // Linha 270 - Erro ao finalizar atendimento
    catch (error) {
    loggers.error.error('Erro ao finalizar atendimento', {
    error: error.message,
    stack: error.stack,
    solicitacaoId: id,
    userId: req.user?.id,
    duration: Date.now() - startTime
    });
    res.status(500).send('Erro ao finalizar atendimento');
    }
    
    // Linha 308 - Erro ao atualizar solicitação
    catch (error) {
    loggers.error.error('Erro ao atualizar status da solicitação', {
    error: error.message,
    stack: error.stack,
    solicitacaoId: id,
    newStatus: status,
    userId: req.user?.id,
    duration: Date.now() - startTime
    });
    res.status(500).send('Erro ao atualizar dados');
    }
    
    // Linha 323 - Erro ao excluir solicitação
    catch (error) {
    loggers.error.error('Erro ao excluir solicitação', {
    error: error.message,
    stack: error.stack,
    solicitacaoId: id,
    userId: req.user?.id,
    duration: Date.now() - startTime
    });
    res.status(500).send('Erro ao excluir dados');
    }
    
    // Linha 375 - Erro ao gerar relatório
    catch (error) {
    loggers.error.error('Erro ao gerar relatório de atendimento', {
    error: error.message,
    stack: error.stack,
    filters: req.query,
    userId: req.user?.id,
    duration: Date.now() - startTime
    });
    res.status(500).send('Erro ao gerar relatório');
    }
  }
});

// Função para construir query de fila de atendimento
function buildFilaAtendimentoQuery(filters) {
  let query = `
    SELECT 
      id,
      cliente_id,
      tipo_solicitacao,
      descricao,
      prioridade,
      status,
      data_solicitacao,
      data_inicio_atendimento,
      data_fim_atendimento,
      responsavel_atendimento,
      observacoes,
      EXTRACT(EPOCH FROM (data_fim_atendimento - data_inicio_atendimento))/60 as duracao_minutos
    FROM fila_atendimento
  `;
  
  const params = [];
  const conditions = [];
  
  if (filters.status) {
    conditions.push(`status = $${params.length + 1}`);
    params.push(filters.status);
  }
  
  if (filters.prioridade) {
    conditions.push(`prioridade = $${params.length + 1}`);
    params.push(filters.prioridade);
  }
  
  if (filters.data_inicio) {
    conditions.push(`DATE(data_solicitacao) >= $${params.length + 1}`);
    params.push(filters.data_inicio);
  }
  
  if (filters.data_fim) {
    conditions.push(`DATE(data_solicitacao) <= $${params.length + 1}`);
    params.push(filters.data_fim);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY data_solicitacao DESC';
  
  return { query, params };
}

// Criar middleware de exportação
const exportMiddleware = createExportMiddleware('fila_atendimento', buildFilaAtendimentoQuery, 'fila_atendimento_visualizar');

// Rotas de exportação
router.get('/export/csv', checkPermission('fila_atendimento_visualizar'), exportMiddleware.csv);
router.get('/export/excel', checkPermission('fila_atendimento_visualizar'), exportMiddleware.excel);

export default router;