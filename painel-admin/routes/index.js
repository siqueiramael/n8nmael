import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';
import { CacheManager } from '../db/redis.js';
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

// Rota principal do painel admin com cache
router.get('/', 
  checkPermission('view_all'),
  async (req, res) => {
    try {
      const cacheKey = 'dashboard_data';
      
      // Tentar recuperar do cache
      let dashboardData = await CacheManager.getCache(cacheKey);
      
      if (!dashboardData) {
        // Buscar dados do dashboard
        const [precos, totalClientes, totalAgendamentos, totalCampanhas, totalQuiosques] = await Promise.all([
          pool.query('SELECT * FROM precos_quiosques ORDER BY tipo_local, numero'),
          pool.query('SELECT COUNT(*) as total FROM clientes WHERE status = \'ativo\''),
          pool.query('SELECT COUNT(*) as total FROM agendamentos WHERE data_agendamento >= CURRENT_DATE'),
          pool.query('SELECT COUNT(*) as total FROM campanhas WHERE status = \'ativo\''),
          pool.query('SELECT COUNT(*) as total FROM quiosques')
        ]);
        
        dashboardData = {
          precos: precos.rows,
          totalClientes: totalClientes.rows[0].total,
          totalAgendamentos: totalAgendamentos.rows[0].total,
          totalCampanhas: totalCampanhas.rows[0].total,
          totalQuiosques: totalQuiosques.rows[0].total
        };
        
        // Salvar no cache por 10 minutos
        await CacheManager.setCache(cacheKey, dashboardData, 600);
        console.log('💾 Dashboard salvo no cache');
      } else {
        console.log('⚡ Dashboard recuperado do cache');
      }
      
      res.render('admin', { 
        ...dashboardData,
        activeMenu: 'dashboard'
      });
    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  }
);

// Rota para salvar preços
router.post('/precos', 
  checkPermission('edit_all'),
  async (req, res) => {
    const { tipo_local, numero, valor, data_inicio, data_fim, motivo } = req.body;
    try {
      await pool.query(
        `INSERT INTO precos_quiosques (tipo_local, numero, valor, data_inicio, data_fim, motivo)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tipo_local, numero || null, valor, data_inicio, data_fim || null, motivo]
      );
      res.redirect('/admin');
    } catch (error) {
      console.error('Erro ao inserir preço:', error);
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