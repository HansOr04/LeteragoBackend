const express = require('express');
const router = express.Router();

// Importar controladores y middleware
const {
  getAllCategories,
  getCategoryHierarchy,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');

const { 
  authenticateToken, 
  authorizeMinRole, 
  authorize,
  optionalAuth 
} = require('../middleware/auth');

/**
 * @route   GET /api/categories
 * @desc    Obtener todas las categorías con filtros y paginación
 * @access  Public
 * @query   { page?, limit?, search?, parentCategory?, includeInactive? }
 */
router.get('/', optionalAuth, getAllCategories);

/**
 * @route   GET /api/categories/hierarchy
 * @desc    Obtener jerarquía completa de categorías
 * @access  Public
 */
router.get('/hierarchy', optionalAuth, getCategoryHierarchy);

/**
 * @route   GET /api/categories/:id
 * @desc    Obtener categoría específica por ID
 * @access  Public
 * @params  { id }
 */
router.get('/:id', optionalAuth, getCategoryById);

/**
 * @route   POST /api/categories
 * @desc    Crear nueva categoría
 * @access  Private (Editor+)
 * @body    { name, description, color?, icon?, parentCategory?, order?, metadata? }
 */
router.post('/', 
  authenticateToken, 
  authorizeMinRole('editor'), 
  createCategory
);

/**
 * @route   PUT /api/categories/:id
 * @desc    Actualizar categoría existente
 * @access  Private (Editor+ o creador)
 * @params  { id }
 * @body    { name?, description?, color?, icon?, parentCategory?, order?, metadata?, isActive? }
 */
router.put('/:id', 
  authenticateToken, 
  authorizeMinRole('editor'), 
  updateCategory
);

/**
 * @route   DELETE /api/categories/:id
 * @desc    Eliminar categoría
 * @access  Private (Admin solamente)
 * @params  { id }
 */
router.delete('/:id', 
  authenticateToken, 
  authorize('admin'), 
  deleteCategory
);

module.exports = router;