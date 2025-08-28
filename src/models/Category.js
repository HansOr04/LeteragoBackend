const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre de la categoría es requerido'],
    trim: true,
    maxlength: [100, 'El nombre no puede exceder 100 caracteres']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'La descripción es requerida'],
    maxlength: [500, 'La descripción no puede exceder 500 caracteres']
  },
  color: {
    type: String,
    default: '#3498db',
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Debe ser un color hexadecimal válido']
  },
  icon: {
    type: String,
    default: 'folder',
    trim: true
  },
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    tactics: [{ type: String }], // Para tácticas MITRE
    platforms: [{ type: String }], // Plataformas aplicables
    killChainPhases: [{ type: String }]
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
categorySchema.index({ name: 1 });
categorySchema.index({ slug: 1 });
categorySchema.index({ parentCategory: 1 });
categorySchema.index({ createdBy: 1 });
categorySchema.index({ isActive: 1 });

// Virtual para obtener subcategorías
categorySchema.virtual('subcategories', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parentCategory'
});

// Virtual para contar técnicas en esta categoría
categorySchema.virtual('techniquesCount', {
  ref: 'Technique',
  localField: '_id',
  foreignField: 'category',
  count: true
});

// Middleware pre-save para generar slug
categorySchema.pre('save', async function(next) {
  if (this.isModified('name')) {
    // Generar slug desde el nombre
    let baseSlug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    
    // Verificar que el slug sea único
    let slug = baseSlug;
    let counter = 1;
    
    while (await this.constructor.findOne({ 
      slug: slug, 
      _id: { $ne: this._id } 
    })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
  }
  next();
});

// Middleware pre-remove para validar dependencias
categorySchema.pre('remove', async function(next) {
  try {
    // Verificar si hay subcategorías
    const subcategories = await this.constructor.countDocuments({
      parentCategory: this._id
    });
    
    if (subcategories > 0) {
      const error = new Error('No se puede eliminar una categoría que tiene subcategorías');
      error.name = 'ValidationError';
      throw error;
    }
    
    // Verificar si hay técnicas asociadas
    const Technique = mongoose.model('Technique');
    const techniques = await Technique.countDocuments({
      category: this._id
    });
    
    if (techniques > 0) {
      const error = new Error('No se puede eliminar una categoría que tiene técnicas asociadas');
      error.name = 'ValidationError';
      throw error;
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Método estático para obtener estructura jerárquica
categorySchema.statics.getHierarchy = async function() {
  try {
    const categories = await this.find({ isActive: true })
      .populate('createdBy', 'username')
      .populate('subcategories')
      .sort({ order: 1, name: 1 });
    
    // Construir jerarquía
    const categoryMap = new Map();
    const roots = [];
    
    // Primer pase: crear mapa de categorías
    categories.forEach(cat => {
      categoryMap.set(cat._id.toString(), {
        ...cat.toObject(),
        children: []
      });
    });
    
    // Segundo pase: construir jerarquía
    categories.forEach(cat => {
      if (cat.parentCategory) {
        const parent = categoryMap.get(cat.parentCategory.toString());
        if (parent) {
          parent.children.push(categoryMap.get(cat._id.toString()));
        }
      } else {
        roots.push(categoryMap.get(cat._id.toString()));
      }
    });
    
    return roots;
  } catch (error) {
    throw new Error('Error al obtener jerarquía de categorías: ' + error.message);
  }
};

// Método para obtener la ruta completa de la categoría
categorySchema.methods.getFullPath = async function() {
  const path = [this.name];
  let current = this;
  
  while (current.parentCategory) {
    current = await this.constructor.findById(current.parentCategory);
    if (current) {
      path.unshift(current.name);
    } else {
      break;
    }
  }
  
  return path.join(' > ');
};

// Método para validar que no se cree una referencia circular
categorySchema.methods.validateParent = async function() {
  if (!this.parentCategory) return true;
  
  let current = await this.constructor.findById(this.parentCategory);
  const visited = new Set([this._id.toString()]);
  
  while (current) {
    if (visited.has(current._id.toString())) {
      throw new Error('No se puede crear una referencia circular en las categorías');
    }
    
    visited.add(current._id.toString());
    current = current.parentCategory ? 
      await this.constructor.findById(current.parentCategory) : 
      null;
  }
  
  return true;
};

// Middleware pre-save para validar parent
categorySchema.pre('save', async function(next) {
  try {
    if (this.isModified('parentCategory')) {
      await this.validateParent();
    }
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Category', categorySchema);