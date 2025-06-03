import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { CacheManager } from '../db/redis.js';

const JWT_SECRET = process.env.JWT_SECRET || 'seu_jwt_secret_aqui';

// Middleware de autenticação com cache Redis
export const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies.authToken || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.redirect('/admin/login');
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const sessionKey = `user_${decoded.userId}`;
    
    // Tentar recuperar do cache primeiro
    let userData = await CacheManager.getSession(sessionKey);
    
    if (!userData) {
      // Se não estiver em cache, buscar no banco
      const user = await User.findById(decoded.userId);
      
      if (!user || !user.ativo) {
        return res.redirect('/admin/login');
      }
      
      // Buscar permissões
      const permissions = await User.getUserPermissions(user.id);
      
      userData = {
        ...user,
        permissions
      };
      
      // Salvar no cache por 1 hora
      await CacheManager.setSession(sessionKey, userData, 3600);
    } else {
      // Renovar TTL da sessão se encontrada no cache
      await CacheManager.renewSession(sessionKey, 3600);
    }

    req.user = userData;
    
    req.userPermissions = {
      hasPermission: (permission) => {
        return userData.permissions.includes(permission) || userData.permissions.includes('view_all');
      },
      hasAnyPermission: (permissionList) => {
        return permissionList.some(p => userData.permissions.includes(p)) || userData.permissions.includes('view_all');
      }
    };

    // Disponibilizar dados do usuário para as views
    res.locals.currentUser = req.user;
    res.locals.userPermissions = req.userPermissions;

    next();
  } catch (error) {
    loggers.error.error('Erro de autenticação', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl
    });
    res.redirect('/admin/login');
  }
};

// Middleware para logout com limpeza de cache
export const logout = async (req, res) => {
  try {
    const token = req.cookies.authToken;
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const sessionKey = `user_${decoded.userId}`;
      
      // Remover do cache
      await CacheManager.deleteSession(sessionKey);
      
      loggers.audit.logout('user_logout', {
        userId: decoded.userId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    }
    
    res.clearCookie('authToken');
    res.redirect('/admin/login');
  } catch (error) {
    loggers.error.error('Erro no logout', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.clearCookie('authToken');
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