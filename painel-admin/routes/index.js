import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cache.js';
import { loggers } from '../utils/logger.js';
import precosRoutes from './precos.js';
import clientesRoutes from './clientes.js';
import quiosquesRoutes from './quiosques.js';
import agendamentosRoutes from './agendamentos.js';
import pagamentosRoutes from './pagamentos.js';
import creditosRoutes from './creditos.js';
import infraestruturaRoutes from './infraestrutura.js';
import midiasRoutes from './midias.js';
import campanhasRoutes from './campanhas.js';
import filaAtendimentoRoutes from './fila-atendimento.js';
import filaEsperaRoutes from './fila-espera.js';
import logsInteracoesRoutes from './logs-interacoes.js';

const router = express.Router();

// Rota principal do painel admin com analytics
router.get('/', 
  checkPermission('view_all'),
  cacheMiddleware('dashboard_data', 300), // 5 minutos para dados mais dinâmicos
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      loggers.access.info('Dashboard access', {
        userId: req.user?.id,
        userEmail: req.user?.email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      // Buscar dados do dashboard com analytics
      const dbStart = Date.now();
      const [
        precos, 
        totalClientes, 
        totalAgendamentos, 
        totalCampanhas, 
        totalQuiosques,
        // Novos dados para analytics
        ocupacaoQuiosques,
        receitaMensal,
        agendamentosHoje,
        filaAtendimento,
        performanceMetrics,
        receitaDiaria,
        ocupacaoPorTipo
      ] = await Promise.all([
        pool.query('SELECT * FROM precos_quiosques ORDER BY tipo_local, numero'),
        pool.query('SELECT COUNT(*) as total FROM clientes WHERE status = \'ativo\''),
        pool.query('SELECT COUNT(*) as total FROM agendamentos WHERE data_agendamento >= CURRENT_DATE'),
        pool.query('SELECT COUNT(*) as total FROM campanhas WHERE status = \'ativo\''),
        pool.query('SELECT COUNT(*) as total FROM quiosques'),
        
        // Analytics queries
        pool.query(`
          SELECT 
            q.tipo_local,
            q.numero,
            COUNT(a.id) as agendamentos_ativo,
            CASE WHEN COUNT(a.id) > 0 THEN 'ocupado' ELSE 'livre' END as status
          FROM quiosques q
          LEFT JOIN agendamentos a ON q.id = a.quiosque_id 
            AND a.data_agendamento = CURRENT_DATE 
            AND a.status IN ('confirmado', 'em_andamento')
          GROUP BY q.id, q.tipo_local, q.numero
          ORDER BY q.tipo_local, q.numero
        `),
        
        pool.query(`
          SELECT 
            DATE_TRUNC('month', p.data_pagamento) as mes,
            SUM(p.valor) as receita
          FROM pagamentos p
          WHERE p.status = 'pago' 
            AND p.data_pagamento >= CURRENT_DATE - INTERVAL '12 months'
          GROUP BY DATE_TRUNC('month', p.data_pagamento)
          ORDER BY mes
        `),
        
        pool.query(`
          SELECT COUNT(*) as total 
          FROM agendamentos 
          WHERE data_agendamento = CURRENT_DATE
        `),
        
        pool.query(`
          SELECT 
            COUNT(*) as total_fila,
            COUNT(CASE WHEN status = 'aguardando' THEN 1 END) as aguardando,
            COUNT(CASE WHEN status = 'em_atendimento' THEN 1 END) as em_atendimento
          FROM fila_atendimento
          WHERE data_entrada >= CURRENT_DATE
        `),
        
        pool.query(`
          SELECT 
            AVG(EXTRACT(EPOCH FROM (data_fim - data_inicio))/60) as tempo_medio_atendimento,
            COUNT(*) as total_atendimentos_hoje,
            COUNT(CASE WHEN status = 'finalizado' THEN 1 END) as finalizados_hoje
          FROM fila_atendimento
          WHERE data_entrada >= CURRENT_DATE
        `),
        
        pool.query(`
          SELECT 
            DATE(p.data_pagamento) as data,
            SUM(p.valor) as receita_diaria
          FROM pagamentos p
          WHERE p.status = 'pago' 
            AND p.data_pagamento >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY DATE(p.data_pagamento)
          ORDER BY data
        `),
        
        pool.query(`
          SELECT 
            q.tipo_local,
            COUNT(*) as total,
            COUNT(CASE WHEN a.status IN ('confirmado', 'em_andamento') THEN 1 END) as ocupados
          FROM quiosques q
          LEFT JOIN agendamentos a ON q.id = a.quiosque_id 
            AND a.data_agendamento = CURRENT_DATE
          GROUP BY q.tipo_local
        `)
      ]);
      
      const dbDuration = Date.now() - dbStart;
      
      loggers.database.query('Dashboard analytics queries', {
        duration: dbDuration,
        queries: 12,
        userId: req.user?.id
      });
      
      const dashboardData = {
        // Dados básicos
        precos: precos.rows,
        totalClientes: totalClientes.rows[0].total,
        totalAgendamentos: totalAgendamentos.rows[0].total,
        totalCampanhas: totalCampanhas.rows[0].total,
        totalQuiosques: totalQuiosques.rows[0].total,
        
        // Analytics data
        ocupacaoQuiosques: ocupacaoQuiosques.rows,
        receitaMensal: receitaMensal.rows,
        agendamentosHoje: agendamentosHoje.rows[0].total,
        filaAtendimento: filaAtendimento.rows[0],
        performanceMetrics: performanceMetrics.rows[0],
        receitaDiaria: receitaDiaria.rows,
        ocupacaoPorTipo: ocupacaoPorTipo.rows,
        
        // Métricas calculadas
        taxaOcupacao: Math.round((ocupacaoQuiosques.rows.filter(q => q.status === 'ocupado').length / ocupacaoQuiosques.rows.length) * 100),
        receitaTotal: receitaMensal.rows.reduce((sum, r) => sum + parseFloat(r.receita || 0), 0)
      };
      
      loggers.performance.request(
        'GET',
        '/admin',
        Date.now() - startTime,
        200,
        req.user?.id
      );
      
      res.render('admin', { 
        ...dashboardData,
        activeMenu: 'dashboard',
        pageTitle: 'Dashboard Analytics'
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.database.error('Dashboard query error', {
        error: error.message,
        stack: error.stack,
        duration,
        userId: req.user?.id,
        ip: req.ip
      });
      
      loggers.performance.request(
        'GET',
        '/admin',
        duration,
        500,
        req.user?.id
      );
      
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Rota para salvar preços com logs e invalidação
router.post('/precos', 
  checkPermission('edit_all'),
  invalidateCache(['dashboard_*', 'precos_*']),
  async (req, res) => {
    const { tipo_local, numero, valor, data_inicio, data_fim, motivo } = req.body;
    const startTime = Date.now();
    
    try {
      loggers.access.info('Price creation attempt', {
        userId: req.user?.id,
        userEmail: req.user?.email,
        data: { tipo_local, numero, valor, data_inicio, data_fim, motivo },
        ip: req.ip
      });
      
      const dbStart = Date.now();
      await pool.query(
        `INSERT INTO precos_quiosques (tipo_local, numero, valor, data_inicio, data_fim, motivo)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tipo_local, numero || null, valor, data_inicio, data_fim || null, motivo]
      );
      const dbDuration = Date.now() - dbStart;
      
      loggers.database.query('Price insert', {
        duration: dbDuration,
        table: 'precos_quiosques',
        operation: 'INSERT',
        userId: req.user?.id
      });
      
      loggers.system.info('Price created successfully', {
        userId: req.user?.id,
        tipo_local,
        numero,
        valor
      });
      
      loggers.performance.request(
        'POST',
        '/admin/precos',
        Date.now() - startTime,
        302,
        req.user?.id
      );
      
      res.redirect('/admin');
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggers.database.error('Price creation error', {
        error: error.message,
        stack: error.stack,
        data: { tipo_local, numero, valor, data_inicio, data_fim, motivo },
        duration,
        userId: req.user?.id,
        ip: req.ip
      });
      
      loggers.performance.request(
        'POST',
        '/admin/precos',
        duration,
        500,
        req.user?.id
      );
      
      res.status(500).send('Erro ao salvar dados');
    }
  }
);

// Rotas de preços
router.use('/', precosRoutes);

// Rotas de clientes
router.use('/clientes', clientesRoutes);

// Rotas de quiosques
router.use('/quiosques', quiosquesRoutes);

// Rotas de agendamentos
router.use('/agendamentos', agendamentosRoutes);

// Rotas de pagamentos
router.use('/pagamentos', pagamentosRoutes);

// Rotas de créditos
router.use('/creditos', creditosRoutes);

// Rotas de infraestrutura
router.use('/infraestrutura', infraestruturaRoutes);

// Rotas de mídias
router.use('/midias', midiasRoutes);

// Rotas de campanhas
router.use('/campanhas', campanhasRoutes);

// Rotas de fila de atendimento
router.use('/fila-atendimento', filaAtendimentoRoutes);

// Rotas de fila de espera
router.use('/fila-espera', filaEsperaRoutes);

// Rotas de logs de interações
router.use('/logs-interacoes', logsInteracoesRoutes);

export default router;