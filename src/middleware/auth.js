const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware para verificar token JWT
const authenticateToken = async (req, res, next) => {
  try {
    // Obtener token del header Authorization
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({
        error: 'Token de acceso requerido',
        message: 'Debes proporcionar un token válido en el header Authorization'
      });
    }
    
    // Verificar y decodificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuario en la base de datos
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        error: 'Usuario no encontrado',
        message: 'El usuario asociado al token no existe'
      });
    }
    
    // Verificar si la cuenta está activa
    if (!user.isActive) {
      return res.status(401).json({
        error: 'Cuenta desactivada',
        message: 'Tu cuenta ha sido desactivada'
      });
    }
    
    // Verificar si la cuenta está bloqueada
    if (user.isLocked) {
      return res.status(401).json({
        error: 'Cuenta bloqueada temporalmente',
        message: 'Tu cuenta está bloqueada debido a múltiples intentos de login fallidos'
      });
    }
    
    // Agregar usuario a la request
    req.user = user;
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token inválido',
        message: 'El token proporcionado no es válido'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado',
        message: 'El token ha expirado, por favor inicia sesión nuevamente'
      });
    }
    
    console.error('Error en autenticación:', error);
    return res.status(500).json({
      error: 'Error interno de autenticación',
      message: 'Error al verificar la autenticación'
    });
  }
};

// Middleware para verificar roles específicos
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'No autenticado',
        message: 'Debes estar autenticado para acceder a este recurso'
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Sin permisos suficientes',
        message: `Se requiere uno de estos roles: ${allowedRoles.join(', ')}. Tu rol actual: ${req.user.role}`
      });
    }
    
    next();
  };
};

// Middleware para verificar permisos jerárquicos
const authorizeMinRole = (minimumRole) => {
  const roleHierarchy = {
    'viewer': 1,
    'editor': 2,
    'admin': 3
  };
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'No autenticado',
        message: 'Debes estar autenticado para acceder a este recurso'
      });
    }
    
    const userLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = roleHierarchy[minimumRole] || 0;
    
    if (userLevel < requiredLevel) {
      return res.status(403).json({
        error: 'Permisos insuficientes',
        message: `Se requiere rol mínimo: ${minimumRole}. Tu rol actual: ${req.user.role}`,
        required: minimumRole,
        current: req.user.role
      });
    }
    
    next();
  };
};

// Middleware para verificar propietario del recurso o admin
const authorizeOwnerOrAdmin = (resourceModel, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'No autenticado',
          message: 'Debes estar autenticado para acceder a este recurso'
        });
      }
      
      // Los admins pueden hacer todo
      if (req.user.role === 'admin') {
        return next();
      }
      
      // Buscar el recurso
      const resourceId = req.params[resourceIdParam];
      const resource = await resourceModel.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({
          error: 'Recurso no encontrado',
          message: 'El recurso solicitado no existe'
        });
      }
      
      // Verificar si el usuario es el propietario
      if (resource.createdBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          error: 'Sin permisos',
          message: 'Solo puedes modificar recursos que creaste o ser administrador'
        });
      }
      
      // Agregar recurso a la request para uso posterior
      req.resource = resource;
      next();
      
    } catch (error) {
      console.error('Error en autorización de propietario:', error);
      return res.status(500).json({
        error: 'Error interno de autorización',
        message: 'Error al verificar permisos del recurso'
      });
    }
  };
};

// Middleware opcional de autenticación (no falla si no hay token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      
      if (user && user.isActive && !user.isLocked) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Ignorar errores de token en auth opcional
    next();
  }
};

// Middleware para rate limiting básico por usuario
const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requestCounts = new Map();
  
  return (req, res, next) => {
    const identifier = req.user ? req.user._id.toString() : req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Limpiar registros antiguos
    if (requestCounts.has(identifier)) {
      const userRequests = requestCounts.get(identifier);
      const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
      requestCounts.set(identifier, validRequests);
    }
    
    // Verificar límite
    const currentRequests = requestCounts.get(identifier) || [];
    
    if (currentRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Demasiadas solicitudes',
        message: `Límite de ${maxRequests} solicitudes por ${windowMs / 1000 / 60} minutos excedido`,
        retryAfter: Math.ceil((currentRequests[0] + windowMs - now) / 1000)
      });
    }
    
    // Registrar nueva solicitud
    currentRequests.push(now);
    requestCounts.set(identifier, currentRequests);
    
    // Agregar headers informativos
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': maxRequests - currentRequests.length,
      'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
    });
    
    next();
  };
};

module.exports = {
  authenticateToken,
  authorize,
  authorizeMinRole,
  authorizeOwnerOrAdmin,
  optionalAuth,
  rateLimit
};