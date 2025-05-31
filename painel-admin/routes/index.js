import express from 'express';
import precosRoutes from './precos.js';
import clientesRoutes from './clientes.js';

const router = express.Router();

// Redirecionar a raiz para /admin
router.get('/', (req, res) => {
  res.redirect('/admin');
});

// Rotas de preços
router.use('/', precosRoutes);

// Rotas de clientes
router.use('/clientes', clientesRoutes);

export default router;