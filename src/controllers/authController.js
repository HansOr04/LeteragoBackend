const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Función para generar token JWT
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      username: user.username, 
      email: user.email,
      role: user.role 
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Registro de usuarios
const register = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    // Validaciones básicas
    if (!username || !email || !password) {
      return res.status(400).json({
        error: 'Datos incompletos',
        message: 'Username, email y password son requeridos'
      });
    }

    // Validar longitud de contraseña
    if (password.length < 6) {
      return res.status(400).json({
        error: 'Contraseña muy corta',
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        error: 'Usuario ya existe',
        message: 'Ya existe un usuario con ese email o nombre de usuario'
      });
    }

    // Crear nuevo usuario
    const userData = {
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: role || 'viewer'
    };

    // Validar rol si se proporciona
    const validRoles = ['admin', 'editor', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({
        error: 'Rol inválido',
        message: 'El rol debe ser: admin, editor o viewer'
      });
    }

    const user = new User(userData);
    await user.save();

    // Generar token
    const token = generateToken(user);

    // Respuesta exitosa
    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Error de validación',
        message: 'Datos inválidos proporcionados',
        details: errors
      });
    }

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al registrar usuario'
    });
  }
};

// Login de usuarios
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validaciones básicas
    if (!email || !password) {
      return res.status(400).json({
        error: 'Datos incompletos',
        message: 'Email y password son requeridos'
      });
    }

    // Buscar usuario por email o username
    const user = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: email.toLowerCase() } // Permitir login con username también
      ]
    });

    if (!user) {
      return res.status(401).json({
        error: 'Credenciales inválidas',
        message: 'Email/usuario o contraseña incorrectos'
      });
    }

    // Verificar si la cuenta está bloqueada
    if (user.isLocked) {
      return res.status(423).json({
        error: 'Cuenta bloqueada',
        message: 'Tu cuenta está temporalmente bloqueada debido a múltiples intentos fallidos',
        lockUntil: user.lockUntil
      });
    }

    // Verificar si la cuenta está activa
    if (!user.isActive) {
      return res.status(401).json({
        error: 'Cuenta desactivada',
        message: 'Tu cuenta ha sido desactivada. Contacta al administrador'
      });
    }

    // Verificar contraseña
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      // Incrementar intentos fallidos
      await user.incLoginAttempts();
      
      return res.status(401).json({
        error: 'Credenciales inválidas',
        message: 'Email/usuario o contraseña incorrectos'
      });
    }

    // Login exitoso - resetear intentos fallidos
    await user.resetLoginAttempts();

    // Generar token
    const token = generateToken(user);

    // Respuesta exitosa
    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        lastLogin: new Date(),
        avatar: user.avatar
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al procesar el login'
    });
  }
};

// Obtener perfil del usuario autenticado
const getProfile = async (req, res) => {
  try {
    // El usuario ya viene del middleware de autenticación
    const user = await User.findById(req.user._id)
      .populate('createdAt')
      .select('-password');

    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'El perfil solicitado no existe'
      });
    }

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });

  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener el perfil'
    });
  }
};

// Actualizar perfil del usuario
const updateProfile = async (req, res) => {
  try {
    const { username, email, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'El usuario no existe'
      });
    }

    // Si se quiere cambiar la contraseña, verificar la actual
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          error: 'Contraseña actual requerida',
          message: 'Debes proporcionar tu contraseña actual para cambiarla'
        });
      }

      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        return res.status(401).json({
          error: 'Contraseña actual incorrecta',
          message: 'La contraseña actual no es correcta'
        });
      }

      user.password = newPassword;
    }

    // Actualizar otros campos si se proporcionan
    if (username && username !== user.username) {
      // Verificar que el username no esté en uso
      const existingUser = await User.findOne({ 
        username: username.toLowerCase(),
        _id: { $ne: user._id }
      });
      
      if (existingUser) {
        return res.status(400).json({
          error: 'Username no disponible',
          message: 'Ese nombre de usuario ya está en uso'
        });
      }
      
      user.username = username;
    }

    if (email && email !== user.email) {
      // Verificar que el email no esté en uso
      const existingUser = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: user._id }
      });
      
      if (existingUser) {
        return res.status(400).json({
          error: 'Email no disponible',
          message: 'Ese email ya está en uso'
        });
      }
      
      user.email = email.toLowerCase();
    }

    await user.save();

    res.json({
      message: 'Perfil actualizado exitosamente',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        updatedAt: user.updatedAt
      }
    });

  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Error de validación',
        details: errors
      });
    }

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al actualizar el perfil'
    });
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    // El usuario ya viene del middleware de autenticación
    const user = await User.findById(req.user._id);

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Usuario no válido',
        message: 'No se puede renovar el token'
      });
    }

    // Generar nuevo token
    const token = generateToken(user);

    res.json({
      message: 'Token renovado exitosamente',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Error al renovar token:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al renovar el token'
    });
  }
};

// Logout (opcional - para invalidar token del lado del cliente)
const logout = (req, res) => {
  // En este caso simple, el logout se maneja del lado del cliente
  // eliminando el token del localStorage/sessionStorage
  res.json({
    message: 'Logout exitoso',
    note: 'Elimina el token del almacenamiento local del cliente'
  });
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  refreshToken,
  logout
};