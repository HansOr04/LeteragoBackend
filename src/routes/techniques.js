const express = require('express');
const router = express.Router();

// Importar controladores y middleware
const {
  getAllTechniques,
  getTechniqueById,
  createTechnique,
  updateTechnique,
  deleteTechnique,
  duplicateTechnique,
  searchTechniques,
  getTechniqueStats,
  getTechniquesByCategory,
  exportTechniques
} = require('../controllers/techniqueController');

const { 
  authenticateToken, 
  authorizeMinRole, 
  authorize,
  optionalAuth 
} = require('../middleware/auth');

const {
  uploadMultiple,
  handleUploadError,
  cleanupOnError,
  processUploadedFiles
} = require('../middleware/upload');

// IMPORTANTE: Rutas más específicas deben ir ANTES que las rutas con parámetros

/**
 * @route   GET /api/techniques/search
 * @desc    Búsqueda avanzada de técnicas
 * @access  Public
 */
router.get('/search', optionalAuth, searchTechniques);

/**
 * @route   GET /api/techniques/stats
 * @desc    Obtener estadísticas de técnicas
 * @access  Public
 */
router.get('/stats', optionalAuth, getTechniqueStats);

/**
 * @route   GET /api/techniques/export
 * @desc    Exportar técnicas en formato JSON
 * @access  Private (Viewer+)
 */
router.get('/export', 
  authenticateToken, 
  authorizeMinRole('viewer'), 
  exportTechniques
);

/**
 * @route   GET /api/techniques/category/:categoryId
 * @desc    Obtener técnicas por categoría específica
 * @access  Public
 */
router.get('/category/:categoryId', optionalAuth, getTechniquesByCategory);

/**
 * @route   GET /api/techniques
 * @desc    Obtener todas las técnicas con filtros y paginación
 * @access  Public
 */
router.get('/', optionalAuth, getAllTechniques);

/**
 * @route   POST /api/techniques
 * @desc    Crear nueva técnica
 * @access  Private (Editor+)
 */
router.post('/', 
  authenticateToken, 
  authorizeMinRole('editor'),
  cleanupOnError,
  uploadMultiple,
  handleUploadError,
  processUploadedFiles,
  createTechnique
);

/**
 * @route   GET /api/techniques/:id
 * @desc    Obtener técnica específica por ID
 * @access  Public
 */
router.get('/:id', optionalAuth, getTechniqueById);

/**
 * @route   PUT /api/techniques/:id
 * @desc    Actualizar técnica existente
 * @access  Private (Editor+ o creador)
 */
router.put('/:id', 
  authenticateToken, 
  authorizeMinRole('editor'),
  cleanupOnError,
  uploadMultiple,
  handleUploadError,
  processUploadedFiles,
  updateTechnique
);

/**
 * @route   POST /api/techniques/:id/duplicate
 * @desc    Duplicar técnica existente
 * @access  Private (Editor+)
 */
router.post('/:id/duplicate', 
  authenticateToken, 
  authorizeMinRole('editor'), 
  duplicateTechnique
);

/**
 * @route   DELETE /api/techniques/:id
 * @desc    Eliminar técnica
 * @access  Private (Admin o creador)
 */
router.delete('/:id', 
  authenticateToken, 
  authorizeMinRole('editor'), 
  deleteTechnique
);

module.exports = router;