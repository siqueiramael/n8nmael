// Middleware de verificação de permissões
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    // Simular usuário logado (normalmente vem de sessão/JWT)
    const user = {
      id: 1,
      name: 'Admin',
      role: 'admin',
      permissions: [
        'view_all', 'edit_all', 'delete_all',
        'view_clientes', 'edit_clientes', 'delete_clientes',
        'view_agendamentos', 'edit_agendamentos', 'delete_agendamentos',
        'view_pagamentos', 'edit_pagamentos',
        'view_creditos', 'edit_creditos',
        'view_infraestrutura', 'edit_infraestrutura',
        'view_midias', 'edit_midias',
        'view_campanhas', 'edit_campanhas',
        'view_fila_atendimento', 'edit_fila_atendimento',
        'view_fila_espera', 'edit_fila_espera',
        'view_logs', 'view_reports'
      ]
    };
    
    // Verificar se o usuário tem a permissão necessária
    const hasPermission = user.permissions.includes(requiredPermission) || 
                         user.permissions.includes('view_all');
    
    if (!hasPermission) {
      return res.status(403).render('error/403', {
        message: 'Acesso negado',
        requiredPermission,
        activeMenu: null
      });
    }
    
    // Adicionar informações do usuário ao request
    req.user = user;
    req.userPermissions = {
      hasPermission: (permission) => {
        return user.permissions.includes(permission) || user.permissions.includes('view_all');
      }
    };
    
    next();
  };
};

// Middleware para adicionar dados de breadcrumb
const addBreadcrumb = (breadcrumbData) => {
  return (req, res, next) => {
    res.locals.breadcrumbs = breadcrumbData;
    next();
  };
};

export { checkPermission, addBreadcrumb };