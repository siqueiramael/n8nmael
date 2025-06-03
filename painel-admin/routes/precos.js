import express from 'express';
import pool from '../db/index.js';
import { checkPermission, addBreadcrumb } from '../middleware/permissions.js';

const router = express.Router();

// Listar todos os preços
router.get('/', 
  checkPermission('precos_visualizar'),
  addBreadcrumb('Preços', '/admin/precos'),
  async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM precos_quiosques ORDER BY tipo_local, numero');
      res.render('precos/index', { 
        precos: result.rows,
        activeMenu: 'precos'
      });
    } catch (error) {
      console.error('Erro ao buscar preços:', error);
      res.status(500).send('Erro ao buscar dados');
    }
  });

// Formulário para novo preço
router.get('/novo', 
  checkPermission('precos_criar'),
  addBreadcrumb('Preços', '/admin/precos'),
  addBreadcrumb('Novo Preço', '/admin/precos/novo'),
  (req, res) => {
    res.render('precos/novo', { activeMenu: 'precos' });
  });

// Salvar novo preço
router.post('/', 
  checkPermission('precos_criar'),
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
});

// Formulário para editar preço
router.get('/editar/:id', 
  checkPermission('precos_editar'),
  addBreadcrumb('Preços', '/admin/precos'),
  addBreadcrumb('Editar Preço', null),
  async (req, res) => {
    // Implementar busca e renderização do formulário de edição
  });

// Atualizar preço
router.put('/:id', 
  checkPermission('precos_editar'),
  async (req, res) => {
    // Implementar atualização
  });

// Relatórios
router.get('/relatorios', 
  checkPermission('precos_relatorios'),
  addBreadcrumb('Preços', '/admin/precos'),
  addBreadcrumb('Relatórios', '/admin/precos/relatorios'),
  async (req, res) => {
    // Implementar relatórios
  });

export default router;