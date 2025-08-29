const mongoose = require('mongoose');

const techniqueSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre de la técnica es requerido'],
    trim: true,
    maxlength: [500, 'El nombre no puede exceder 500 caracteres'] // Más flexible
  },
  mitreid: {
    type: String,
    unique: true,
    sparse: true, // Permite valores null únicos
    trim: true
    // Sin validación de formato - puede ser cualquier string
  },
  description: {
    type: String,
    required: [true, 'La descripción es requerida'],
    maxlength: [5000, 'La descripción no puede exceder 5000 caracteres'] // Más flexible
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
    // No requerido para mayor flexibilidad
  },
  fileLocation: {
    type: String,
    default: null,
    trim: true
  },
  image: {
    type: String,
    default: null,
    trim: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  platforms: [{
    type: String,
    // Sin enum - puede ser cualquier plataforma
    trim: true
  }],
  datasources: [{
    name: { type: String },
    description: { type: String, default: '' }
  }],
  mitigation: {
    description: { type: String, default: '' },
    techniques: [{ type: String }]
  },
  detection: {
    description: { type: String, default: '' },
    queries: [{ 
      platform: String, 
      query: String, 
      description: String 
    }]
  },
  references: [{
    name: { type: String },
    url: { type: String },
    description: { type: String, default: '' }
  }],
  tactics: [{
    type: String
    // Sin enum - puede ser cualquier táctica
  }],
  killChainPhases: [{
    killChainName: { type: String, default: 'custom' },
    phaseName: { type: String }
  }],
  revisionHistory: [{
    version: { type: String },
    changes: { type: String },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  version: {
    type: String,
    default: '1.0'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
    // No requerido para mayor flexibilidad
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Nuevos campos opcionales para ISO27001
  iso27001Reference: {
    type: String,
    trim: true
  },
  riskLevel: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Draft', 'Review', 'Approved', 'Deprecated'],
    default: 'Draft'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices para optimización (mantenidos)
techniqueSchema.index({ name: 1 });
techniqueSchema.index({ mitreid: 1 });
techniqueSchema.index({ category: 1 });
techniqueSchema.index({ platforms: 1 });
techniqueSchema.index({ tactics: 1 });
techniqueSchema.index({ tags: 1 });
techniqueSchema.index({ isActive: 1 });
techniqueSchema.index({ status: 1 });
techniqueSchema.index({ riskLevel: 1 });
techniqueSchema.index({ createdAt: -1 });

// Índice de texto para búsqueda (expandido)
techniqueSchema.index({
  name: 'text',
  description: 'text',
  'mitigation.description': 'text',
  'detection.description': 'text',
  mitreid: 'text',
  iso27001Reference: 'text'
});

// Middleware pre-save simplificado
techniqueSchema.pre('save', async function(next) {
  try {
    // Generar ID automático solo si se solicita
    if (!this.mitreid && this.isNew && this.generateId) {
      const count = await this.constructor.countDocuments();
      this.mitreid = `TECH-${(count + 1).toString().padStart(4, '0')}`;
    }
    
    // Actualizar lastModifiedBy si no es una creación nueva
    if (!this.isNew && this.modifiedBy) {
      this.lastModifiedBy = this.modifiedBy;
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Virtual para obtener URL completa de la imagen
techniqueSchema.virtual('imageUrl').get(function() {
  if (this.image) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/${this.image}`;
  }
  return null;
});

// Virtual para obtener URL completa del archivo
techniqueSchema.virtual('fileUrl').get(function() {
  if (this.fileLocation) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/${this.fileLocation}`;
  }
  return null;
});

// Método para añadir una nueva revisión al historial (simplificado)
techniqueSchema.methods.addRevision = function(changes, userId) {
  if (!this.version) this.version = '1.0';
  
  const versionParts = this.version.split('.').map(Number);
  if (versionParts.length < 2) versionParts.push(0);
  versionParts[1]++; // Incrementar versión menor
  const newVersion = versionParts.join('.');
  
  this.revisionHistory.push({
    version: newVersion,
    changes: changes || 'Cambios no especificados',
    changedBy: userId,
    changedAt: new Date()
  });
  
  this.version = newVersion;
  if (userId) this.lastModifiedBy = userId;
};

// Método estático para búsqueda avanzada (mejorado y más flexible)
techniqueSchema.statics.advancedSearch = function(searchParams) {
  const {
    query,
    category,
    platforms,
    tactics,
    tags,
    status,
    riskLevel,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = searchParams;
  
  const filters = { isActive: true };
  
  // Búsqueda de texto
  if (query) {
    filters.$or = [
      { name: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } },
      { mitreid: { $regex: query, $options: 'i' } },
      { iso27001Reference: { $regex: query, $options: 'i' } }
    ];
  }
  
  // Filtros opcionales
  if (category) filters.category = category;
  if (platforms && platforms.length > 0) filters.platforms = { $in: platforms };
  if (tactics && tactics.length > 0) filters.tactics = { $in: tactics };
  if (tags && tags.length > 0) filters.tags = { $in: tags };
  if (status) filters.status = status;
  if (riskLevel) filters.riskLevel = riskLevel;
  
  const skip = (page - 1) * limit;
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  return this.find(filters)
    .populate('category', 'name color')
    .populate('createdBy', 'username')
    .populate('lastModifiedBy', 'username')
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .exec();
};

// Método para duplicar una técnica (simplificado)
techniqueSchema.methods.duplicate = async function(userId) {
  const duplicated = new this.constructor({
    name: `${this.name} (Copia)`,
    description: this.description,
    category: this.category,
    tags: [...(this.tags || [])],
    platforms: [...(this.platforms || [])],
    datasources: [...(this.datasources || [])],
    mitigation: this.mitigation || {},
    detection: this.detection || {},
    references: [...(this.references || [])],
    tactics: [...(this.tactics || [])],
    killChainPhases: [...(this.killChainPhases || [])],
    iso27001Reference: this.iso27001Reference,
    riskLevel: this.riskLevel,
    status: 'Draft', // Las copias empiezan como borrador
    createdBy: userId
  });
  
  return await duplicated.save();
};

// Método estático para estadísticas
techniqueSchema.statics.getStats = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        byStatus: { $push: '$status' },
        byRiskLevel: { $push: '$riskLevel' }
      }
    }
  ]);
};

module.exports = mongoose.model('Technique', techniqueSchema);
