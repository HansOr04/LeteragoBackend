const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      let uploadPath;
      
      // Determinar carpeta según el tipo de archivo
      if (file.fieldname === 'image') {
        uploadPath = 'uploads/images';
      } else if (file.fieldname === 'file' || file.fieldname === 'document') {
        uploadPath = 'uploads/files';
      } else {
        uploadPath = 'uploads';
      }
      
      // Crear directorio si no existe
      await fs.mkdir(uploadPath, { recursive: true });
      
      cb(null, uploadPath);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    try {
      // Limpiar nombre del archivo
      const cleanName = file.originalname
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .toLowerCase();
      
      // Generar nombre único
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(cleanName);
      const baseName = path.basename(cleanName, extension);
      
      const fileName = `${baseName}-${uniqueSuffix}${extension}`;
      
      cb(null, fileName);
    } catch (error) {
      cb(error, null);
    }
  }
});

// Filtros de archivos
const imageFilter = (req, file, cb) => {
  // Tipos MIME permitidos para imágenes
  const allowedImageTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp'
  ];
  
  // Extensiones permitidas para imágenes
  const allowedImageExtensions = /\.(jpeg|jpg|png|gif|webp)$/i;
  
  if (allowedImageTypes.includes(file.mimetype) && 
      allowedImageExtensions.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen (JPEG, PNG, GIF, WebP)'), false);
  }
};

const documentFilter = (req, file, cb) => {
  // Tipos MIME permitidos para documentos
  const allowedDocTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'application/json',
    'text/csv'
  ];
  
  // Extensiones permitidas para documentos
  const allowedDocExtensions = /\.(pdf|doc|docx|txt|md|json|csv)$/i;
  
  if (allowedDocTypes.includes(file.mimetype) && 
      allowedDocExtensions.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de documento no permitido. Formatos permitidos: PDF, DOC, DOCX, TXT, MD, JSON, CSV'), false);
  }
};

const anyFileFilter = (req, file, cb) => {
  // Combinar filtros de imagen y documento
  const allowedTypes = [
    // Imágenes
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    // Documentos
    'application/pdf', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/markdown', 'application/json', 'text/csv'
  ];
  
  const allowedExtensions = /\.(jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|md|json|csv)$/i;
  
  if (allowedTypes.includes(file.mimetype) && 
      allowedExtensions.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido'), false);
  }
};

// Configuraciones de multer
const uploadImage = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB para imágenes
    files: 1
  },
  fileFilter: imageFilter
});

const uploadDocument = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB para documentos
    files: 1
  },
  fileFilter: documentFilter
});

const uploadAny = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo
    files: 5 // Máximo 5 archivos
  },
  fileFilter: anyFileFilter
});

// Middleware para manejar múltiples tipos de archivos
const uploadMultiple = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10
  },
  fileFilter: anyFileFilter
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'document', maxCount: 1 },
  { name: 'files', maxCount: 5 }
]);

// Middleware para manejo de errores de multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          error: 'Archivo muy grande',
          message: 'El archivo excede el tamaño máximo permitido',
          maxSize: '10MB'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          error: 'Demasiados archivos',
          message: 'Se excedió el número máximo de archivos permitidos'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Campo de archivo inesperado',
          message: 'El campo del archivo no está permitido'
        });
      default:
        return res.status(400).json({
          error: 'Error de subida',
          message: error.message
        });
    }
  }
  
  // Error de filtro de archivos
  if (error.message.includes('Solo se permiten') || 
      error.message.includes('Tipo de archivo no permitido')) {
    return res.status(400).json({
      error: 'Tipo de archivo no válido',
      message: error.message
    });
  }
  
  // Otros errores
  next(error);
};

// Middleware para limpiar archivos en caso de error
const cleanupOnError = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(body) {
    // Si hay error y archivos subidos, eliminarlos
    if (res.statusCode >= 400 && req.files) {
      const filesToDelete = [];
      
      if (Array.isArray(req.files)) {
        filesToDelete.push(...req.files.map(file => file.path));
      } else if (typeof req.files === 'object') {
        Object.values(req.files).forEach(fileArray => {
          if (Array.isArray(fileArray)) {
            filesToDelete.push(...fileArray.map(file => file.path));
          }
        });
      }
      
      // Eliminar archivos de forma asíncrona
      filesToDelete.forEach(async (filePath) => {
        try {
          await fs.unlink(filePath);
        } catch (err) {
          console.error('Error al eliminar archivo:', filePath, err.message);
        }
      });
    }
    
    originalSend.call(this, body);
  };
  
  next();
};

// Función utilitaria para eliminar archivo
const deleteFile = async (filePath) => {
  try {
    if (filePath) {
      await fs.unlink(filePath);
      console.log('Archivo eliminado:', filePath);
    }
  } catch (error) {
    console.error('Error al eliminar archivo:', filePath, error.message);
  }
};

// Middleware para procesar información de archivos subidos
const processUploadedFiles = (req, res, next) => {
  if (req.files) {
    // Procesar archivos y agregar información útil
    const processFile = (file) => ({
      fieldname: file.fieldname,
      originalname: file.originalname,
      filename: file.filename,
      path: file.path.replace(/\\/g, '/'), // Normalizar path para URLs
      size: file.size,
      mimetype: file.mimetype,
      url: `${process.env.BASE_URL || 'http://localhost:3000'}/${file.path.replace(/\\/g, '/')}`
    });
    
    if (Array.isArray(req.files)) {
      req.processedFiles = req.files.map(processFile);
    } else if (typeof req.files === 'object') {
      req.processedFiles = {};
      Object.keys(req.files).forEach(fieldname => {
        if (Array.isArray(req.files[fieldname])) {
          req.processedFiles[fieldname] = req.files[fieldname].map(processFile);
        } else {
          req.processedFiles[fieldname] = processFile(req.files[fieldname]);
        }
      });
    }
  }
  
  if (req.file) {
    req.processedFile = {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path.replace(/\\/g, '/'),
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: `${process.env.BASE_URL || 'http://localhost:3000'}/${req.file.path.replace(/\\/g, '/')}`
    };
  }
  
  next();
};

module.exports = {
  uploadImage: uploadImage.single('image'),
  uploadDocument: uploadDocument.single('document'),
  uploadAny: uploadAny.single('file'),
  uploadMultiple,
  handleUploadError,
  cleanupOnError,
  processUploadedFiles,
  deleteFile
};