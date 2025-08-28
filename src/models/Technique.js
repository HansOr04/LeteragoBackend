const mongoose = require('mongoose');

const techniqueSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre de la técnica es requerido'],
    trim: true,
    maxlength: [200, 'El nombre no puede exceder 200 caracteres']
  },
  mitreid: {
    type: String,
    unique: true,
    sparse: true, // Permite valores null únicos
    match: [/^T\d{4}(\.\d{3})?$/, 'El ID debe seguir el formato MITRE (ej: T1001 o T1001.001)']
  },
  description: {
    type: String,
    required: [true, 'La descripción es requerida'],
    maxlength: [2000, 'La descripción no puede exceder 2000 caracteres']
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'La categoría es requerida']
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
    enum: ['Windows', 'Linux', 'macOS', 'Android', 'iOS', 'Cloud', 'Network', 'Container'],
    trim: true
  }],
  datasources: [{
    name: { type: String, required: true },
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
    name: { 
      type: String, 
      required: [true, 'El nombre de la referencia es requerido'] 
    },
    url: { 
      type: String, 
      required: [true, 'La URL de la referencia es requerida'],
      match: [/^https?:\/\/.+/, 'Debe ser una URL válida']
    },
    description: { type: String, default: '' }
  }],
  tactics: [{
    type: String,
    enum: [
      'Reconnaissance', 'Resource Development', 'Initial Access', 
      'Execution', 'Persistence', 'Privilege Escalation',
      'Defense Evasion', 'Credential Access', 'Discovery',
      'Lateral Movement', 'Collection', 'Command and Control',
      'Exfiltration', 'Impact'
    ]
  }],
  killChainPhases: [{
    killChainName: { type: String, default: 'mitre-attack' },
    phaseName: { type: String, required: true }
  }],
  revisionHistory: [{
    version: { type: String, required: true },
    changes: { type: String, required: true },
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
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices para optimización
techniqueSchema.index({ name: 1 });
techniqueSchema.index({ mitreid: 1 });
techniqueSchema.index({ category: 1 });
techniqueSchema.index({ platforms: 1 });
techniqueSchema.index({ tactics: 1 });
techniqueSchema.index({ tags: 1 });
techniqueSchema.index({ isActive: 1 });
techniqueSchema.index({ createdAt: -1 });

// Índice de texto para búsqueda
techniqueSchema.index({
  name: 'text',
  description: 'text',
  'mitigation.description': 'text',
  'detection.description': 'text'
});

// Middleware pre-save para generar MITRE ID automático si no se proporciona
techniqueSchema.pre('save', async function(next) {
  try {
    // Si no hay MITRE ID, generar uno
    if (!this.mitreid && this.isNew) {
      const lastTechnique = await this.constructor
        .findOne({ mitreid: { $regex: /^T\d{4}$/ } })
        .sort({ mitreid: -1 });
      
      let nextNumber = 1001;
      if (lastTechnique && lastTechnique.mitreid) {
        const currentNumber = parseInt(lastTechnique.mitreid.substring(1));
        nextNumber = currentNumber + 1;
      }
      
      this.mitreid = `T${nextNumber}`;
    }
    
    // Actualizar lastModifiedBy si no es una creación nueva
    if (!this.isNew) {
      this.lastModifiedBy = this.modifiedBy || this.createdBy;
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

// Método para añadir una nueva revisión al historial
techniqueSchema.methods.addRevision = function(changes, userId) {
  const currentVersion = this.version || '1.0';
  const versionParts = currentVersion.split('.').map(Number);
  versionParts[1]++; // Incrementar versión menor
  const newVersion = versionParts.join('.');
  
  this.revisionHistory.push({
    version: newVersion,
    changes: changes,
    changedBy: userId,
    changedAt: new Date()
  });
  
  this.version = newVersion;
  this.lastModifiedBy = userId;
};

// Método estático para búsqueda avanzada
techniqueSchema.statics.advancedSearch = function(searchParams) {
  const {
    query,
    category,
    platforms,
    tactics,
    tags,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = searchParams;
  
  const filters = { isActive: true };
  
  // Búsqueda de texto
  if (query) {
    filters.$text = { $search: query };
  }
  
  // Filtro por categoría
  if (category) {
    filters.category = category;
  }
  
  // Filtro por plataformas
  if (platforms && platforms.length > 0) {
    filters.platforms = { $in: platforms };
  }
  
  // Filtro por tácticas
  if (tactics && tactics.length > 0) {
    filters.tactics = { $in: tactics };
  }
  
  // Filtro por tags
  if (tags && tags.length > 0) {
    filters.tags = { $in: tags };
  }
  
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

// Método para duplicar una técnica
techniqueSchema.methods.duplicate = async function(userId) {
  const duplicated = new this.constructor({
    name: `${this.name} (Copia)`,
    description: this.description,
    category: this.category,
    tags: [...this.tags],
    platforms: [...this.platforms],
    datasources: [...this.datasources],
    mitigation: this.mitigation,
    detection: this.detection,
    references: [...this.references],
    tactics: [...this.tactics],
    killChainPhases: [...this.killChainPhases],
    createdBy: userId
  });
  
  return await duplicated.save();
};

module.exports = mongoose.model('Technique', techniqueSchema);