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

// Rota principal do painel admin com cache padronizado
router.get('/', 
  checkPermission('view_all'),
  cacheMiddleware('dashboard_data', 600), // 10 minutos - dados estáveis
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      loggers.access.info('Dashboard access', {
        userId: req.user?.id,
        userEmail: req.user?.email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      // Buscar dados do dashboard
      const dbStart = Date.now();
      const [precos, totalClientes, totalAgendamentos, totalCampanhas, totalQuiosques] = await Promise.all([
        pool.query('SELECT * FROM precos_quiosques ORDER BY tipo_local, numero'),
        pool.query('SELECT COUNT(*) as total FROM clientes WHERE status = \'ativo\''),
        pool.query('SELECT COUNT(*) as total FROM agendamentos WHERE data_agendamento >= CURRENT_DATE'),
        pool.query('SELECT COUNT(*) as total FROM campanhas WHERE status = \'ativo\''),
        pool.query('SELECT COUNT(*) as total FROM quiosques')
      ]);
      const dbDuration = Date.now() - dbStart;
      
      loggers.database.query('Dashboard data queries', {
        duration: dbDuration,
        queries: 5,
        userId: req.user?.id
      });
      
      const dashboardData = {
        precos: precos.rows,
        totalClientes: totalClientes.rows[0].total,
        totalAgendamentos: totalAgendamentos.rows[0].total,
        totalCampanhas: totalCampanhas.rows[0].total,
        totalQuiosques: totalQuiosques.rows[0].total
      };
      
      loggers.performance.request(
        'GET',
        '/admin',
        Date.now() - startTime,
        200,
        req.user?.id
      );
      
      res.json({ 
        ...dashboardData,
        activeMenu: 'dashboard'
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