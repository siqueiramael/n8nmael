import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';

const router = express.Router();

// Listar todas as solicitações de atendimento
router.get('/', 
  checkPermission('fila_atendimento_visualizar'),
  addBreadcrumb('Fila de Atendimento', '/admin/fila-atendimento'),
  cacheMiddleware((req) => `fila_atendimento_list_${JSON.stringify(req.query)}`, 300),
  async (req, res) => {
    try {
      const { status, data_inicio, data_fim } = req.query;
      
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
      
      const result = await pool.query(query, params);
      
      res.json({ 
        atendimentos: result.rows,
        filtros: { status, data_inicio, data_fim },
        activeMenu: 'fila-atendimento'
      });
    } catch (error) {
      console.error('Erro ao buscar fila de atendimento:', error);
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
  try {
    const { cliente_telefone, cliente_nome, contexto_conversa } = req.body;
    
    await pool.query(
      'INSERT INTO fila_atendimento (cliente_telefone, cliente_nome, contexto_conversa) VALUES ($1, $2, $3)',
      [cliente_telefone, cliente_nome, contexto_conversa]
    );
    
    res.redirect('/admin/fila-atendimento?success=created');
  } catch (error) {
    console.error('Erro ao criar solicitação:', error);
    res.status(500).send('Erro ao criar solicitação');
  }
});

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
    console.error('Erro ao buscar solicitação:', error);
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
    console.error('Erro ao atualizar solicitação:', error);
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
    console.error('Erro ao iniciar atendimento:', error);
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
    console.error('Erro ao finalizar atendimento:', error);
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
    console.error('Erro ao atualizar solicitação:', error);
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
    console.error('Erro ao excluir solicitação:', error);
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
    console.error('Erro ao gerar relatório:', error);
    res.status(500).send('Erro ao gerar relatório');
  }
});

export default router;