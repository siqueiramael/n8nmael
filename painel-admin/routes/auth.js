// Rotas de autenticação
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import { redirectIfAuthenticated } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'seu_jwt_secret_aqui';

// Página de login
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('auth/login', {
    error: req.query.error,
    activeMenu: null
  });
});

// Processar login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findByEmail(email);
    if (!user) {
      return res.redirect('/admin/login?error=Credenciais inválidas');
    }
    
    const isValidPassword = await User.validatePassword(user, password);
    if (!isValidPassword) {
      return res.redirect('/admin/login?error=Credenciais inválidas');
    }
    
    if (!user.ativo) {
      return res.redirect('/admin/login?error=Usuário inativo');
    }
    
    // Gerar JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Definir cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 horas
    });
    
    res.redirect('/admin');
  } catch (error) {
    console.error('Erro no login:', error);
    res.redirect('/admin/login?error=Erro interno do servidor');
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('authToken');
  res.redirect('/admin/login');
});

export default router;