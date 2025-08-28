const Technique = require('../models/Technique');
const Category = require('../models/Category');
const { deleteFile } = require('../middleware/upload');

// Obtener todas las técnicas con filtros
const getAllTechniques = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      platforms,
      tactics,
      tags,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Construir filtros
    const filters = { isActive: true };

    // Búsqueda por texto
    if (search) {
      filters.$text = { $search: search };
    }

    // Filtro por categoría
    if (category) {
      filters.category = category;
    }

    // Filtro por plataformas
    if (platforms) {
      const platformArray = Array.isArray(platforms) ? platforms : [platforms];
      filters.platforms = { $in: platformArray };
    }

    // Filtro por tácticas
    if (tactics) {
      const tacticArray = Array.isArray(tactics) ? tactics : [tactics];
      filters.tactics = { $in: tacticArray };
    }

    // Filtro por tags
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filters.tags = { $in: tagArray };
    }

    const skip = (page - 1) * limit;
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const techniques = await Technique.find(filters)
      .populate('category', 'name color')
      .populate('createdBy', 'username')
      .populate('lastModifiedBy', 'username')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .exec();

    const totalTechniques = await Technique.countDocuments(filters);

    res.json({
      techniques,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalTechniques / limit),
        totalItems: totalTechniques,
        itemsPerPage: parseInt(limit),
        hasNextPage: page < Math.ceil(totalTechniques / limit),
        hasPrevPage: page > 1
      },
      filters: {
        search,
        category,
        platforms,
        tactics,
        tags
      }
    });

  } catch (error) {
    console.error('Error al obtener técnicas:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener las técnicas'
    });
  }
};

// Obtener técnica por ID
const getTechniqueById = async (req, res) => {
  try {
    const { id } = req.params;

    const technique = await Technique.findById(id)
      .populate('category', 'name color description')
      .populate('createdBy', 'username email')
      .populate('lastModifiedBy', 'username')
      .populate({
        path: 'revisionHistory.changedBy',
        select: 'username'
      });

    if (!technique) {
      return res.status(404).json({
        error: 'Técnica no encontrada',
        message: 'La técnica solicitada no existe'
      });
    }

    res.json({
      technique
    });

  } catch (error) {
    console.error('Error al obtener técnica:', error);

    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de técnica proporcionado no es válido'
      });
    }

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener la técnica'
    });
  }
};

// Crear nueva técnica
const createTechnique = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      mitreid,
      tags,
      platforms,
      datasources,
      mitigation,
      detection,
      references,
      tactics,
      killChainPhases
    } = req.body;

    // Validaciones básicas
    if (!name || !description || !category) {
      return res.status(400).json({
        error: 'Datos incompletos',
        message: 'Nombre, descripción y categoría son requeridos'
      });
    }

    // Verificar que la categoría existe
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({
        error: 'Categoría no encontrada',
        message: 'La categoría especificada no existe'
      });
    }

    // Verificar MITRE ID único si se proporciona
    if (mitreid) {
      const existingTechnique = await Technique.findOne({ mitreid });
      if (existingTechnique) {
        return res.status(400).json({
          error: 'MITRE ID duplicado',
          message: 'Ya existe una técnica con ese MITRE ID'
        });
      }
    }

    // Procesar archivos subidos
    let fileLocation = null;
    let image = null;

    if (req.processedFiles) {
      if (req.processedFiles.image) {
        image = req.processedFiles.image.path;
      }
      if (req.processedFiles.document) {
        fileLocation = req.processedFiles.document.path;
      }
    }

    // Crear técnica
    const techniqueData = {
      name: name.trim(),
      description: description.trim(),
      category,
      mitreid,
      fileLocation,
      image,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [],
      platforms: platforms ? (Array.isArray(platforms) ? platforms : [platforms]) : [],
      datasources: datasources || [],
      mitigation: mitigation || {},
      detection: detection || {},
      references: references || [],
      tactics: tactics ? (Array.isArray(tactics) ? tactics : [tactics]) : [],
      killChainPhases: killChainPhases || [],
      createdBy: req.user._id
    };

    const technique = new Technique(techniqueData);
    await technique.save();

    // Poblar para respuesta
    await technique.populate(['category', 'createdBy']);

    res.status(201).json({
      message: 'Técnica creada exitosamente',
      technique
    });

  } catch (error) {
    console.error('Error al crear técnica:', error);

    // Limpiar archivos si hay error
    if (req.processedFiles) {
      Object.values(req.processedFiles).forEach(file => {
        if (Array.isArray(file)) {
          file.forEach(f => deleteFile(f.path));
        } else {
          deleteFile(file.path);
        }
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
      message: 'Error al crear la técnica'
    });
  }
};

// Actualizar técnica
const updateTechnique = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const technique = await Technique.findById(id);

    if (!technique) {
      return res.status(404).json({
        error: 'Técnica no encontrada',
        message: 'La técnica solicitada no existe'
      });
    }

    // Verificar permisos
    if (req.user.role !== 'admin' && technique.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Sin permisos',
        message: 'Solo puedes editar técnicas que creaste o ser administrador'
      });
    }

    // Verificar categoría si se actualiza
    if (updateData.category && updateData.category !== technique.category.toString()) {
      const categoryExists = await Category.findById(updateData.category);
      if (!categoryExists) {
        return res.status(400).json({
          error: 'Categoría no encontrada',
          message: 'La nueva categoría especificada no existe'
        });
      }
    }

    // Verificar MITRE ID único si se cambia
    if (updateData.mitreid && updateData.mitreid !== technique.mitreid) {
      const existingTechnique = await Technique.findOne({ 
        mitreid: updateData.mitreid,
        _id: { $ne: id }
      });
      if (existingTechnique) {
        return res.status(400).json({
          error: 'MITRE ID duplicado',
          message: 'Ya existe otra técnica con ese MITRE ID'
        });
      }
    }

    // Procesar archivos nuevos
    const oldImage = technique.image;
    const oldFile = technique.fileLocation;

    if (req.processedFiles) {
      if (req.processedFiles.image) {
        updateData.image = req.processedFiles.image.path;
      }
      if (req.processedFiles.document) {
        updateData.fileLocation = req.processedFiles.document.path;
      }
    }

    // Preparar historial de cambios
    const changes = [];
    Object.keys(updateData).forEach(field => {
      if (technique[field] !== updateData[field]) {
        changes.push(`${field}: ${technique[field]} → ${updateData[field]}`);
      }
    });

    // Actualizar técnica
    Object.assign(technique, updateData);
    technique.lastModifiedBy = req.user._id;

    // Añadir al historial de revisiones
    if (changes.length > 0) {
      technique.addRevision(changes.join('; '), req.user._id);
    }

    await technique.save();

    // Eliminar archivos antiguos si se reemplazaron
    if (req.processedFiles) {
      if (req.processedFiles.image && oldImage) {
        await deleteFile(oldImage);
      }
      if (req.processedFiles.document && oldFile) {
        await deleteFile(oldFile);
      }
    }

    // Poblar para respuesta
    await technique.populate(['category', 'createdBy', 'lastModifiedBy']);

    res.json({
      message: 'Técnica actualizada exitosamente',
      technique,
      changesCount: changes.length
    });

  } catch (error) {
    console.error('Error al actualizar técnica:', error);

    // Limpiar archivos nuevos si hay error
    if (req.processedFiles) {
      Object.values(req.processedFiles).forEach(file => {
        if (Array.isArray(file)) {
          file.forEach(f => deleteFile(f.path));
        } else {
          deleteFile(file.path);
        }
      });
    }

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al actualizar la técnica'
    });
  }
};

// Eliminar técnica
const deleteTechnique = async (req, res) => {
  try {
    const { id } = req.params;

    const technique = await Technique.findById(id);

    if (!technique) {
      return res.status(404).json({
        error: 'Técnica no encontrada',
        message: 'La técnica solicitada no existe'
      });
    }

    // Verificar permisos
    if (req.user.role !== 'admin' && technique.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Sin permisos',
        message: 'Solo puedes eliminar técnicas que creaste o ser administrador'
      });
    }

    // Eliminar archivos asociados
    if (technique.image) {
      await deleteFile(technique.image);
    }
    if (technique.fileLocation) {
      await deleteFile(technique.fileLocation);
    }

    await Technique.findByIdAndDelete(id);

    res.json({
      message: 'Técnica eliminada exitosamente',
      deletedTechnique: {
        id: technique._id,
        name: technique.name,
        mitreid: technique.mitreid
      }
    });

  } catch (error) {
    console.error('Error al eliminar técnica:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al eliminar la técnica'
    });
  }
};

// Duplicar técnica
const duplicateTechnique = async (req, res) => {
  try {
    const { id } = req.params;

    const originalTechnique = await Technique.findById(id);

    if (!originalTechnique) {
      return res.status(404).json({
        error: 'Técnica no encontrada',
        message: 'La técnica a duplicar no existe'
      });
    }

    const duplicatedTechnique = await originalTechnique.duplicate(req.user._id);
    await duplicatedTechnique.populate(['category', 'createdBy']);

    res.status(201).json({
      message: 'Técnica duplicada exitosamente',
      technique: duplicatedTechnique,
      originalId: id
    });

  } catch (error) {
    console.error('Error al duplicar técnica:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al duplicar la técnica'
    });
  }
};

// Búsqueda avanzada de técnicas
const searchTechniques = async (req, res) => {
  try {
    const searchParams = req.query;
    
    const techniques = await Technique.advancedSearch(searchParams);
    const totalResults = await Technique.countDocuments({
      isActive: true,
      ...(searchParams.search && { $text: { $search: searchParams.search } })
    });

    res.json({
      message: 'Búsqueda completada',
      techniques,
      totalResults,
      searchParams
    });

  } catch (error) {
    console.error('Error en búsqueda avanzada:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al realizar la búsqueda'
    });
  }
};

// Obtener estadísticas de técnicas
const getTechniqueStats = async (req, res) => {
  try {
    const totalTechniques = await Technique.countDocuments({ isActive: true });
    
    // Estadísticas por plataforma
    const platformStats = await Technique.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$platforms' },
      { $group: { _id: '$platforms', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Estadísticas por táctica
    const tacticStats = await Technique.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$tactics' },
      { $group: { _id: '$tactics', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Estadísticas por categoría
    const categoryStats = await Technique.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $group: {
          _id: '$category',
          categoryName: { $first: '$categoryInfo.name' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Tags más populares
    const topTags = await Technique.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    // Actividad reciente
    const recentActivity = await Technique.find({ isActive: true })
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate('category', 'name')
      .populate('lastModifiedBy', 'username')
      .select('name mitreid updatedAt lastModifiedBy category');

    res.json({
      stats: {
        totalTechniques,
        platformDistribution: platformStats,
        tacticDistribution: tacticStats,
        categoryDistribution: categoryStats,
        popularTags: topTags,
        recentActivity
      }
    });

  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener estadísticas'
    });
  }
};

// Obtener técnicas por categoría
const getTechniquesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Verificar que la categoría existe
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        error: 'Categoría no encontrada',
        message: 'La categoría especificada no existe'
      });
    }

    const skip = (page - 1) * limit;

    const techniques = await Technique.find({ 
      category: categoryId, 
      isActive: true 
    })
      .populate('createdBy', 'username')
      .populate('lastModifiedBy', 'username')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalTechniques = await Technique.countDocuments({ 
      category: categoryId, 
      isActive: true 
    });

    res.json({
      category: {
        id: category._id,
        name: category.name,
        description: category.description
      },
      techniques,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalTechniques / limit),
        totalItems: totalTechniques,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error al obtener técnicas por categoría:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener técnicas de la categoría'
    });
  }
};

// Exportar técnicas en formato JSON
const exportTechniques = async (req, res) => {
  try {
    const { format = 'json', categoryId } = req.query;
    
    const filters = { isActive: true };
    if (categoryId) {
      filters.category = categoryId;
    }

    const techniques = await Technique.find(filters)
      .populate('category', 'name')
      .populate('createdBy', 'username')
      .sort({ mitreid: 1 });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=techniques-export.json');
      
      return res.json({
        exportDate: new Date().toISOString(),
        totalCount: techniques.length,
        techniques: techniques.map(t => ({
          id: t._id,
          name: t.name,
          mitreid: t.mitreid,
          description: t.description,
          category: t.category?.name,
          platforms: t.platforms,
          tactics: t.tactics,
          tags: t.tags,
          references: t.references,
          createdAt: t.createdAt
        }))
      });
    }

    res.status(400).json({
      error: 'Formato no soportado',
      message: 'Solo se soporta el formato JSON actualmente'
    });

  } catch (error) {
    console.error('Error al exportar técnicas:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al exportar las técnicas'
    });
  }
};

module.exports = {
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
};