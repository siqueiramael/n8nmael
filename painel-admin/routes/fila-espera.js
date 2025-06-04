import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { loggers } from '../utils/logger.js';
import { ExportUtils } from '../utils/export.js';
import { createExportMiddleware } from '../middleware/export.js';

const router = express.Router();

// Listar todos os itens da fila de espera
router.get('/', 
  checkPermission('fila_espera_visualizar'),
  addBreadcrumb('Fila de Espera', '/admin/fila-espera'),
  cacheMiddleware((req) => `fila_espera_list_${JSON.stringify(req.query)}`, 300),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { status, data_interesse, tipo_local } = req.query;
      
      loggers.access.info('Fila espera list access', {
        userId: req.user?.id,
        filters: { status, data_interesse, tipo_local },
        ip: req.ip
      });
      
      let query = `
        SELECT fe.*, c.nome as cliente_nome, c.telefone as cliente_telefone
        FROM fila_espera fe
        JOIN clientes c ON fe.cliente_id = c.id
        WHERE 1=1
      `;
      const params = [];
      let paramCount = 0;
      
      if (status) {
        paramCount++;
        query += ` AND fe.status = $${paramCount}`;
        params.push(status);
      }
      
      if (data_interesse) {
        paramCount++;
        query += ` AND fe.data_interesse = $${paramCount}`;
        params.push(data_interesse);
      }
      
      if (tipo_local) {
        paramCount++;
        query += ` AND fe.tipo_local = $${paramCount}`;
        params.push(tipo_local);
      }
      
      query += ` ORDER BY fe.data_criacao ASC`;
      
      const dbStart = Date.now();
      const result = await pool.query(query, params);
      const dbDuration = Date.now() - dbStart;
      
      loggers.database.query('Fila espera list query', {
        duration: dbDuration,
        rowCount: result.rows.length,
        filters: { status, data_interesse, tipo_local },
        userId: req.user?.id
      });
      
      loggers.performance.request(
        'GET',
        '/admin/fila-espera',
        Date.now() - startTime,
        200,
        req.user?.id
      );
      
      res.json({ 
        filaEspera: result.rows,
        filtros: { status, data_interesse, tipo_local },
        activeMenu: 'fila-espera'
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.database.error('Fila espera list error', {
        error: error.message,
        stack: error.stack,
        duration,
        userId: req.user?.id,
        ip: req.ip
      });
      
      loggers.performance.request(
        'GET',
        '/admin/fila-espera',
        duration,
        500,
        req.user?.id
      );
      
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Formulário para novo item na fila
router.get('/novo', 
  checkPermission('fila_espera_criar'),
  addBreadcrumb('Fila de Espera', '/admin/fila-espera'),
  addBreadcrumb('Novo Item', '/admin/fila-espera/novo'),
  cacheMiddleware('fila_espera_form_data', 600),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const dbStart = Date.now();
      const clientesResult = await pool.query('SELECT id, nome, telefone FROM clientes WHERE status = \'ativo\' ORDER BY nome');
      const dbDuration = Date.now() - dbStart;
      
      loggers.database.query('Fila espera form data', {
        duration: dbDuration,
        rowCount: clientesResult.rows.length,
        userId: req.user?.id
      });
      
      loggers.performance.request(
        'GET',
        '/admin/fila-espera/novo',
        Date.now() - startTime,
        200,
        req.user?.id
      );
      
      res.json({ 
        clientes: clientesResult.rows,
        activeMenu: 'fila-espera' 
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.database.error('Fila espera form data error', {
        error: error.message,
        stack: error.stack,
        duration,
        userId: req.user?.id,
        ip: req.ip
      });
      
      loggers.performance.request(
        'GET',
        '/admin/fila-espera/novo',
        duration,
        500,
        req.user?.id
      );
      
      res.status(500).send('Erro ao carregar formulário');
    }
  }
);

// Salvar novo item na fila
router.post('/', 
  checkPermission('fila_espera_criar'),
  invalidateCache(['fila_espera_*']),
  async (req, res) => {
  const { 
    cliente_id, 
    data_interesse, 
    tipo_local, 
    numero,
    status
  } = req.body;
  
  try {
    await pool.query(
      `INSERT INTO fila_espera (
        cliente_id, data_interesse, tipo_local, numero, status
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        cliente_id, 
        data_interesse, 
        tipo_local || null, 
        numero || null,
        status || 'aguardando'
      ]
    );
    res.redirect('/admin/fila-espera');
  } catch (error) {
    loggers.error.error('Erro ao inserir item na fila', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      body: req.body,
      ip: req.ip
    });
    res.status(500).send('Erro ao salvar dados');
  }
});

// Formulário para editar item da fila
router.get('/editar/:id', 
  checkPermission('fila_espera_editar'),
  addBreadcrumb('Fila de Espera', '/admin/fila-espera'),
  addBreadcrumb('Editar Item', null),
  async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT fe.*, c.nome as cliente_nome
      FROM fila_espera fe
      JOIN clientes c ON fe.cliente_id = c.id
      WHERE fe.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).send('Item da fila não encontrado');
    }
    
    // Buscar clientes para o formulário
    const clientesResult = await pool.query('SELECT id, nome, telefone FROM clientes WHERE status = \'ativo\' ORDER BY nome');
    
    res.render('fila-espera/editar', { 
      item: result.rows[0],
      clientes: clientesResult.rows,
      activeMenu: 'fila-espera' 
    });
  } catch (error) {
    loggers.error.error('Erro ao buscar item da fila', {
      error: error.message,
      stack: error.stack,
      itemId: id,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).send('Erro ao carregar dados');
  }
});

// Atualizar item da fila
router.put('/:id', 
  checkPermission('fila_espera_editar'),
  invalidateCache(['fila_espera_*']),
  async (req, res) => {
  const { id } = req.params;
  const { 
    cliente_id, 
    data_interesse, 
    tipo_local, 
    numero,
    status
  } = req.body;
  
  try {
    await pool.query(
      `UPDATE fila_espera SET 
        cliente_id = $1, data_interesse = $2, tipo_local = $3, 
        numero = $4, status = $5
      WHERE id = $6`,
      [cliente_id, data_interesse, tipo_local, numero, status, id]
    );
    res.redirect('/admin/fila-espera');
  } catch (error) {
    loggers.error.error('Erro ao atualizar item da fila', {
      error: error.message,
      stack: error.stack,
      itemId: id,
      userId: req.user?.id,
      body: req.body,
      ip: req.ip
    });
    res.status(500).send('Erro ao atualizar dados');
  }
});

// Excluir item da fila
router.delete('/:id', 
  checkPermission('fila_espera_excluir'),
  invalidateCache(['fila_espera_*']),
  async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM fila_espera WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    loggers.error.error('Erro ao excluir item da fila', {
      error: error.message,
      stack: error.stack,
      itemId: id,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erro ao excluir item' });
  }
});

// Processar fila (reagendamento automático)
router.post('/processar', async (req, res) => {
  try {
    // Buscar itens da fila aguardando
    const filaResult = await pool.query(`
      SELECT fe.*, c.nome as cliente_nome, c.telefone
      FROM fila_espera fe
      JOIN clientes c ON fe.cliente_id = c.id
      WHERE fe.status = 'aguardando'
      ORDER BY fe.data_criacao ASC
    `);
    
    let processados = 0;
    
    for (const item of filaResult.rows) {
      // Verificar se há vagas disponíveis para a data de interesse
      const vagasResult = await pool.query(`
        SELECT COUNT(*) as ocupados
        FROM agendamentos 
        WHERE data_agendamento = $1 
        AND tipo_local = $2 
        AND ($3 IS NULL OR numero = $3)
        AND status NOT IN ('cancelado')
      `, [item.data_interesse, item.tipo_local, item.numero]);
      
      // Lógica simplificada: assumindo limite de 1 agendamento por local/data
      if (parseInt(vagasResult.rows[0].ocupados) === 0) {
        // Criar agendamento automático
        const precoResult = await pool.query(`
          SELECT valor FROM precos_quiosques 
          WHERE tipo_local = $1 
          AND ($2 IS NULL OR numero = $2)
          AND data_inicio <= $3 
          AND (data_fim IS NULL OR data_fim >= $3)
          ORDER BY data_inicio DESC LIMIT 1
        `, [item.tipo_local, item.numero, item.data_interesse]);
        
        const valor = precoResult.rows[0]?.valor || 0;
        
        await pool.query(`
          INSERT INTO agendamentos (
            cliente_id, tipo_local, numero, data_agendamento, 
            valor, status
          ) VALUES ($1, $2, $3, $4, $5, 'pendente')
        `, [item.cliente_id, item.tipo_local, item.numero, item.data_interesse, valor]);
        
        // Atualizar status na fila
        await pool.query(
          'UPDATE fila_espera SET status = \'processado\' WHERE id = $1',
          [item.id]
        );
        
        processados++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `${processados} itens processados com sucesso` 
    });
  } catch (error) {
    loggers.error.error('Erro ao processar fila', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ success: false, message: 'Erro ao processar fila' });
  }
});

// Relatório da fila de espera
router.get('/relatorio', async (req, res) => {
  try {
    // Estatísticas gerais
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'aguardando' THEN 1 END) as aguardando,
        COUNT(CASE WHEN status = 'processado' THEN 1 END) as processado,
        COUNT(CASE WHEN status = 'cancelado' THEN 1 END) as cancelado
      FROM fila_espera
    `);
    
    // Distribuição por tipo de local
    const tipoLocalResult = await pool.query(`
      SELECT 
        tipo_local,
        COUNT(*) as quantidade
      FROM fila_espera
      WHERE status = 'aguardando'
      GROUP BY tipo_local
      ORDER BY quantidade DESC
    `);
    
    // Itens mais antigos aguardando
    const antigosResult = await pool.query(`
      SELECT fe.*, c.nome as cliente_nome, c.telefone
      FROM fila_espera fe
      JOIN clientes c ON fe.cliente_id = c.id
      WHERE fe.status = 'aguardando'
      ORDER BY fe.data_criacao ASC
      LIMIT 10
    `);
    
    res.render('fila-espera/relatorio', {
      stats: statsResult.rows[0],
      distribuicaoTipoLocal: tipoLocalResult.rows,
      itensAntigos: antigosResult.rows,
      activeMenu: 'fila-espera'
    });
  } catch (error) {
    loggers.error.error('Erro ao gerar relatório de fila de espera', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).send('Erro ao gerar relatório');
  }
});

// Função para construir query de fila de espera
function buildFilaEsperaQuery(filters) {
  let query = `
    SELECT 
      fe.id,
      fe.cliente_id,
      c.nome as cliente_nome,
      c.telefone as cliente_telefone,
      fe.tipo_local,
      fe.data_interesse,
      fe.observacoes,
      fe.status,
      fe.data_criacao,
      fe.data_atualizacao
    FROM fila_espera fe
    JOIN clientes c ON fe.cliente_id = c.id
  `;
  
  const params = [];
  const conditions = [];
  
  if (filters.status) {
    conditions.push(`fe.status = $${params.length + 1}`);
    params.push(filters.status);
  }
  
  if (filters.tipo_local) {
    conditions.push(`fe.tipo_local = $${params.length + 1}`);
    params.push(filters.tipo_local);
  }
  
  if (filters.data_interesse) {
    conditions.push(`fe.data_interesse = $${params.length + 1}`);
    params.push(filters.data_interesse);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY fe.data_criacao DESC';
  
  return { query, params };
}

// Criar middleware de exportação
const exportMiddleware = createExportMiddleware('fila_espera', buildFilaEsperaQuery, 'fila_espera_visualizar');

// Rotas de exportação
router.get('/export/csv', checkPermission('fila_espera_visualizar'), exportMiddleware.csv);
router.get('/export/excel', checkPermission('fila_espera_visualizar'), exportMiddleware.excel);

export default router;