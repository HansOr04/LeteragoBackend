const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Importar configuración de base de datos
const { connectDB, closeDB } = require('./config/database');

// Importar rutas
const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const techniqueRoutes = require('./routes/techniques');

// Crear aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// ====== CONEXIÓN A BASE DE DATOS ======
connectDB();

// ====== MIDDLEWARES GLOBALES ======
// Seguridad básica
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configurado con manejo robusto
const allowedOrigins = [
  'https://leteragocertificacion27001.netlify.app',
  'https://leteragocertificacion27001.netlify.app/', // Con barra al final también
  'http://localhost:3000',
  'http://localhost:3001'
];

// Agregar variable de entorno si existe
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
  // También con barra al final por si acaso
  if (!process.env.FRONTEND_URL.endsWith('/')) {
    allowedOrigins.push(process.env.FRONTEND_URL + '/');
  }
}

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (herramientas de desarrollo, Postman, etc.)
    if (!origin) {
      console.log('Request without origin - allowing');
      return callback(null, true);
    }
    
    console.log(`CORS check for origin: "${origin}"`);
    console.log('Allowed origins:', allowedOrigins);
    
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ Origin "${origin}" allowed`);
      return callback(null, true);
    } else {
      console.log(`❌ Origin "${origin}" blocked by CORS`);
      return callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Accept',
    'Origin',
    'X-Requested-With',
    'Accept-Language',
    'Accept-Encoding'
  ],
  optionsSuccessStatus: 200, // Para navegadores legacy
  maxAge: 86400 // Cache preflight por 24 horas
}));

// Middleware adicional para debug de requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} from ${req.headers.origin || 'no-origin'}`);
  next();
});

// Logging de requests
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Parsers de body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ====== RUTAS DE SALUD Y BIENVENIDA ======

// Ruta de salud del servidor
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Servidor MITRE ATT&CK Clone funcionando correctamente',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    uptime: process.uptime(),
    database: 'Connected',
    corsOrigins: allowedOrigins
  });
});

// Ruta de información de la API
app.get('/api', (req, res) => {
  res.json({
    name: 'MITRE ATT&CK Clone API',
    version: '1.0.0',
    description: 'Sistema de gestión de técnicas y tácticas de ciberseguridad',
    documentation: {
      health: '/health',
      endpoints: {
        auth: {
          base: '/api/auth',
          routes: {
            'POST /register': 'Registrar usuario',
            'POST /login': 'Iniciar sesión',
            'GET /me': 'Obtener perfil (requiere auth)',
            'PUT /profile': 'Actualizar perfil (requiere auth)',
            'POST /refresh': 'Renovar token (requiere auth)',
            'POST /logout': 'Cerrar sesión (requiere auth)',
            'GET /verify': 'Verificar token (requiere auth)'
          }
        },
        categories: {
          base: '/api/categories',
          routes: {
            'GET /': 'Listar categorías',
            'GET /hierarchy': 'Obtener jerarquía completa',
            'GET /:id': 'Obtener categoría específica',
            'POST /': 'Crear categoría (requiere auth editor+)',
            'PUT /:id': 'Actualizar categoría (requiere auth editor+)',
            'DELETE /:id': 'Eliminar categoría (requiere auth admin)'
          }
        },
        techniques: {
          base: '/api/techniques',
          routes: {
            'GET /': 'Listar técnicas',
            'GET /search': 'Búsqueda avanzada',
            'GET /stats': 'Estadísticas',
            'GET /export': 'Exportar técnicas (requiere auth)',
            'GET /category/:categoryId': 'Técnicas por categoría',
            'GET /:id': 'Obtener técnica específica',
            'POST /': 'Crear técnica (requiere auth editor+)',
            'PUT /:id': 'Actualizar técnica (requiere auth editor+)',
            'POST /:id/duplicate': 'Duplicar técnica (requiere auth editor+)',
            'DELETE /:id': 'Eliminar técnica (requiere auth editor+)'
          }
        }
      }
    },
    server: {
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(process.uptime())} segundos`
    }
  });
});

// Ruta de bienvenida
app.get('/', (req, res) => {
  res.json({
    message: 'Bienvenido a MITRE ATT&CK Clone API',
    version: '1.0.0',
    status: 'Operacional',
    links: {
      health: '/health',
      apiInfo: '/api',
      documentation: '/api'
    }
  });
});

// ====== RUTAS DE LA API ======
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/techniques', techniqueRoutes);

// ====== MIDDLEWARE DE ERROR Y 404 ======

// Middleware para rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    message: `La ruta ${req.method} ${req.originalUrl} no existe en este servidor`,
    suggestion: 'Verifica la URL y el método HTTP',
    availableEndpoints: {
      health: 'GET /health',
      apiInfo: 'GET /api',
      auth: 'POST /api/auth/login',
      categories: 'GET /api/categories',
      techniques: 'GET /api/techniques'
    }
  });
});

// Middleware global de manejo de errores
app.use((error, req, res, next) => {
  console.error('Error no capturado:', error);

  // Error de validación de Mongoose
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({
      error: 'Error de validación',
      message: 'Los datos proporcionados no son válidos',
      details: errors
    });
  }

  // Error de cast de Mongoose (ObjectId inválido)
  if (error.name === 'CastError') {
    return res.status(400).json({
      error: 'ID inválido',
      message: 'El ID proporcionado no tiene un formato válido'
    });
  }

  // Error de duplicado en MongoDB
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    const value = error.keyValue[field];
    return res.status(400).json({
      error: 'Recurso duplicado',
      message: `Ya existe un recurso con ${field}: "${value}"`,
      field: field,
      value: value
    });
  }

  // Error de JWT
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Token inválido',
      message: 'El token de autenticación proporcionado no es válido'
    });
  }

  // Error de token expirado
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expirado',
      message: 'El token de autenticación ha expirado, por favor inicia sesión nuevamente'
    });
  }

  // Error de multer (subida de archivos)
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'Archivo muy grande',
      message: 'El archivo excede el tamaño máximo permitido (10MB)',
      maxSize: '10MB'
    });
  }

  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      error: 'Demasiados archivos',
      message: 'Se excedió el número máximo de archivos permitidos'
    });
  }

  // Error de conexión a MongoDB
  if (error.name === 'MongoNetworkError') {
    return res.status(503).json({
      error: 'Error de base de datos',
      message: 'No se puede conectar a la base de datos'
    });
  }

  // Error genérico del servidor
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Algo salió mal en el servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// ====== INICIO DEL SERVIDOR ======
const server = app.listen(PORT, () => {
  console.log(`
========================================
   MITRE ATT&CK Clone API Iniciado
========================================

Puerto: ${PORT}
Entorno: ${process.env.NODE_ENV || 'development'}
URL Local: http://localhost:${PORT}
Health Check: http://localhost:${PORT}/health
API Info: http://localhost:${PORT}/api

CORS Origins permitidos:
${allowedOrigins.map(origin => `  - ${origin}`).join('\n')}

Endpoints disponibles:
   Autenticación:
      POST /api/auth/register
      POST /api/auth/login
      GET  /api/auth/me
   
   Categorías:
      GET  /api/categories
      GET  /api/categories/hierarchy
      POST /api/categories
   
   Técnicas:
      GET  /api/techniques
      GET  /api/techniques/search
      GET  /api/techniques/stats
      POST /api/techniques

Para desarrollo: npm run dev
Para producción: npm start
Uploads: http://localhost:${PORT}/uploads/

========================================
  `);
});

// ====== MANEJO GRACEFUL DE CIERRE ======
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} recibido, iniciando cierre graceful...`);
  
  server.close(async () => {
    console.log('Servidor HTTP cerrado');
    
    try {
      await closeDB();
      console.log('Cierre graceful completado');
      process.exit(0);
    } catch (error) {
      console.error('Error durante el cierre:', error);
      process.exit(1);
    }
  });
  
  // Forzar cierre después de 10 segundos
  setTimeout(() => {
    console.error('Forzando cierre del servidor...');
    process.exit(1);
  }, 10000);
};

// Escuchar señales de cierre
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Manejar errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

module.exports = app;
