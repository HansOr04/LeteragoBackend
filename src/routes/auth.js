const express = require('express');
const router = express.Router();

// Importar controladores y middleware
const {
  register,
  login,
  getProfile,
  updateProfile,
  refreshToken,
  logout
} = require('../controllers/authController');

const { authenticateToken, rateLimit } = require('../middleware/auth');

// Aplicar rate limiting a todas las rutas de auth
router.use(rateLimit(20, 15 * 60 * 1000)); // 20 requests por 15 minutos

/**
 * @route   POST /api/auth/register
 * @desc    Registrar nuevo usuario
 * @access  Public
 * @body    { username, email, password, role? }
 */
router.post('/register', register);

/**
 * @route   POST /api/auth/login
 * @desc    Iniciar sesión
 * @access  Public
 * @body    { email, password }
 */
router.post('/login', login);

/**
 * @route   GET /api/auth/me
 * @desc    Obtener perfil del usuario autenticado
 * @access  Private
 */
router.get('/me', authenticateToken, getProfile);

/**
 * @route   PUT /api/auth/profile
 * @desc    Actualizar perfil del usuario
 * @access  Private
 * @body    { username?, email?, currentPassword?, newPassword? }
 */
router.put('/profile', authenticateToken, updateProfile);

/**
 * @route   POST /api/auth/refresh
 * @desc    Renovar token de autenticación
 * @access  Private
 */
router.post('/refresh', authenticateToken, refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Cerrar sesión
 * @access  Private
 */
router.post('/logout', authenticateToken, logout);

/**
 * @route   GET /api/auth/verify
 * @desc    Verificar si un token es válido
 * @access  Private
 */
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    }
  });
});

module.exports = router;