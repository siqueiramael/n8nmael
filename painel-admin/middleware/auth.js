// Middleware de autenticação
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'seu_jwt_secret_aqui';

// Middleware de autenticação
export const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies.authToken || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.redirect('/admin/login');
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.ativo) {
      return res.redirect('/admin/login');
    }
    
    // Buscar permissões do usuário
    const permissions = await User.getUserPermissions(user.id);
    
    req.user = {
      ...user,
      permissions
    };
    
    req.userPermissions = {
      hasPermission: (permission) => {
        return permissions.includes(permission) || permissions.includes('view_all');
      },
      hasAnyPermission: (permissionList) => {
        return permissionList.some(p => permissions.includes(p)) || permissions.includes('view_all');
      }
    };
    
    // Disponibilizar dados do usuário para as views
    res.locals.currentUser = req.user;
    res.locals.userPermissions = req.userPermissions;
    
    next();
  } catch (error) {
    console.error('Erro de autenticação:', error);
    res.redirect('/admin/login');
  }
};

// Middleware para páginas que não requerem autenticação
export const redirectIfAuthenticated = (req, res, next) => {
  const token = req.cookies.authToken;
  
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return res.redirect('/admin');
    } catch (error) {
      // Token inválido, continuar
    }
  }
  
  next();
};