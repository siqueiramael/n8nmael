import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { loggers } from '../utils/logger.js';
import { crudLogger } from '../middleware/logging.js';

const router = express.Router();

// Página de login
router.get('/login', (req, res) => {
  loggers.access.info('Login page accessed', {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.render('auth/login', {
    error: null,
    activeMenu: null
  });
});

// Processar login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const startTime = Date.now();
  
  try {
    loggers.access.info('Login attempt', {
      email,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    const pool = req.app.locals.pool;
    const queryStart = Date.now();
    
    const result = await pool.query(
      'SELECT id, nome, email, senha, permissoes FROM usuarios WHERE email = $1 AND ativo = true',
      [email]
    );
    
    const queryDuration = Date.now() - queryStart;
    loggers.database.query(
      'SELECT user by email',
      queryDuration,
      null,
      [email]
    );
    
    if (result.rows.length === 0) {
      loggers.access.login(null, req.ip, req.get('User-Agent'), false);
      loggers.security.unauthorized(req.ip, req.get('User-Agent'), '/admin/login');
      
      return res.render('auth/login', {
        error: 'Email ou senha inválidos',
        activeMenu: null
      });
    }
    
    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.senha);
    
    if (!passwordMatch) {
      loggers.access.login(user.id, req.ip, req.get('User-Agent'), false);
      loggers.security.unauthorized(req.ip, req.get('User-Agent'), '/admin/login', user.id);
      
      return res.render('auth/login', {
        error: 'Email ou senha inválidos',
        activeMenu: null
      });
    }
    
    // Gerar token JWT
    const token = jwt.sign(
      {
        id: user.id,
        nome: user.nome,
        email: user.email,
        permissoes: user.permissoes
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    
    // Definir cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000 // 8 horas
    });
    
    const totalDuration = Date.now() - startTime;
    
    loggers.access.login(user.id, req.ip, req.get('User-Agent'), true);
    loggers.performance.info('Login completed', {
      userId: user.id,
      duration: totalDuration
    });
    
    res.redirect('/admin/dashboard');
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    
    loggers.system.error('Login error', {
      error: error.message,
      email,
      ip: req.ip,
      duration: totalDuration
    });
    
    res.render('auth/login', {
      error: 'Erro interno do servidor',
      activeMenu: null
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  loggers.access.logout(req.user?.id, req.ip);
  
  res.clearCookie('token');
  res.redirect('/admin/login');
});

export default router;