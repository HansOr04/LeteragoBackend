const Category = require('../models/Category');
const Technique = require('../models/Technique');

// Obtener todas las categorías
const getAllCategories = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search, 
      parentCategory,
      includeInactive = false 
    } = req.query;
    
    const filters = {};
    
    // Filtro de activos
    if (!includeInactive) {
      filters.isActive = true;
    }
    
    // Filtro por categoría padre
    if (parentCategory) {
      filters.parentCategory = parentCategory === 'null' ? null : parentCategory;
    }
    
    // Búsqueda por texto
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const categories = await Category.find(filters)
      .populate('createdBy', 'username')
      .populate('parentCategory', 'name')
      .populate('techniquesCount')
      .sort({ order: 1, name: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .exec();
    
    const totalCategories = await Category.countDocuments(filters);
    
    res.json({
      categories,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCategories / limit),
        totalItems: totalCategories,
        itemsPerPage: parseInt(limit),
        hasNextPage: page < Math.ceil(totalCategories / limit),
        hasPrevPage: page > 1
      }
    });
    
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener las categorías'
    });
  }
};

// Obtener jerarquía completa de categorías
const getCategoryHierarchy = async (req, res) => {
  try {
    const hierarchy = await Category.getHierarchy();
    
    res.json({
      message: 'Jerarquía de categorías obtenida exitosamente',
      hierarchy
    });
    
  } catch (error) {
    console.error('Error al obtener jerarquía:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener la jerarquía de categorías'
    });
  }
};

// Obtener una categoría específica
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const category = await Category.findById(id)
      .populate('createdBy', 'username email')
      .populate('parentCategory', 'name')
      .populate('subcategories')
      .populate('techniquesCount');
    
    if (!category) {
      return res.status(404).json({
        error: 'Categoría no encontrada',
        message: 'La categoría solicitada no existe'
      });
    }
    
    // Obtener path completo
    const fullPath = await category.getFullPath();
    
    res.json({
      category: {
        ...category.toObject(),
        fullPath
      }
    });
    
  } catch (error) {
    console.error('Error al obtener categoría:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de categoría proporcionado no es válido'
      });
    }
    
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener la categoría'
    });
  }
};

// Crear nueva categoría
const createCategory = async (req, res) => {
  try {
    const { name, description, color, icon, parentCategory, order, metadata } = req.body;
    
    // Validaciones básicas
    if (!name || !description) {
      return res.status(400).json({
        error: 'Datos incompletos',
        message: 'Nombre y descripción son requeridos'
      });
    }
    
    // Verificar que la categoría padre existe (si se proporciona)
    if (parentCategory) {
      const parentExists = await Category.findById(parentCategory);
      if (!parentExists) {
        return res.status(400).json({
          error: 'Categoría padre no encontrada',
          message: 'La categoría padre especificada no existe'
        });
      }
    }
    
    // Crear nueva categoría
    const categoryData = {
      name: name.trim(),
      description: description.trim(),
      color: color || '#3498db',
      icon: icon || 'folder',
      parentCategory: parentCategory || null,
      order: order || 0,
      metadata: metadata || {},
      createdBy: req.user._id
    };
    
    const category = new Category(categoryData);
    await category.save();
    
    // Poblar datos para la respuesta
    await category.populate('createdBy', 'username');
    if (category.parentCategory) {
      await category.populate('parentCategory', 'name');
    }
    
    res.status(201).json({
      message: 'Categoría creada exitosamente',
      category
    });
    
  } catch (error) {
    console.error('Error al crear categoría:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Error de validación',
        details: errors
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        error: 'Categoría duplicada',
        message: 'Ya existe una categoría con ese nombre'
      });
    }
    
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al crear la categoría'
    });
  }
};

// Actualizar categoría
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, icon, parentCategory, order, metadata, isActive } = req.body;
    
    const category = await Category.findById(id);
    
    if (!category) {
      return res.status(404).json({
        error: 'Categoría no encontrada',
        message: 'La categoría solicitada no existe'
      });
    }
    
    // Verificar permisos (propietario o admin)
    if (req.user.role !== 'admin' && category.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Sin permisos',
        message: 'Solo puedes editar categorías que creaste o ser administrador'
      });
    }
    
    // Actualizar campos si se proporcionan
    if (name !== undefined) category.name = name.trim();
    if (description !== undefined) category.description = description.trim();
    if (color !== undefined) category.color = color;
    if (icon !== undefined) category.icon = icon;
    if (order !== undefined) category.order = order;
    if (metadata !== undefined) category.metadata = { ...category.metadata, ...metadata };
    if (isActive !== undefined && req.user.role === 'admin') {
      category.isActive = isActive;
    }
    
    // Manejar cambio de categoría padre
    if (parentCategory !== undefined) {
      if (parentCategory === null || parentCategory === '') {
        category.parentCategory = null;
      } else {
        // Verificar que la categoría padre existe
        const parentExists = await Category.findById(parentCategory);
        if (!parentExists) {
          return res.status(400).json({
            error: 'Categoría padre no encontrada',
            message: 'La categoría padre especificada no existe'
          });
        }
        category.parentCategory = parentCategory;
      }
    }
    
    await category.save();
    
    // Poblar para respuesta
    await category.populate(['createdBy', 'parentCategory']);
    
    res.json({
      message: 'Categoría actualizada exitosamente',
      category
    });
    
  } catch (error) {
    console.error('Error al actualizar categoría:', error);
    
    if (error.message.includes('referencia circular')) {
      return res.status(400).json({
        error: 'Referencia circular',
        message: error.message
      });
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Error de validación',
        details: errors
      });
    }
    
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al actualizar la categoría'
    });
  }
};

// Eliminar categoría
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const category = await Category.findById(id);
    
    if (!category) {
      return res.status(404).json({
        error: 'Categoría no encontrada',
        message: 'La categoría solicitada no existe'
      });
    }
    
    // Solo admins pueden eliminar categorías
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Sin permisos',
        message: 'Solo los administradores pueden eliminar categorías'
      });
    }
    
    // Verificar dependencias antes de eliminar
    const subcategories = await Category.countDocuments({ parentCategory: id });
    const techniques = await Technique.countDocuments({ category: id });
    
    if (subcategories > 0) {
      return res.status(400).json({
        error: 'Categoría con dependencias',
        message: `No se puede eliminar. Hay ${subcategories} subcategorías asociadas`,
        dependencies: { subcategories }
      });
    }
    
    if (techniques > 0) {
      return res.status(400).json({
        error: 'Categoría con dependencias',
        message: `No se puede eliminar. Hay ${techniques} técnicas asociadas`,
        dependencies: { techniques }
      });
    }
    
    await Category.findByIdAndDelete(id);
    
    res.json({
      message: 'Categoría eliminada exitosamente',
      deletedCategory: {
        id: category._id,
        name: category.name
      }
    });
    
  } catch (error) {
    console.error('Error al eliminar categoría:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al eliminar la categoría'
    });
  }
};

module.exports = {
  getAllCategories,
  getCategoryHierarchy,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
};