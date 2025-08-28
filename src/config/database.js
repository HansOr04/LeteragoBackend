const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mitre_attack';
    
    console.log('🔗 Conectando a MongoDB...');
    
    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout después de 5s
      socketTimeoutMS: 45000, // Cerrar sockets después de 45s de inactividad
      maxPoolSize: 10, // Mantener hasta 10 conexiones de socket
      maxIdleTimeMS: 30000, // Cerrar conexiones después de 30s de inactividad
      bufferCommands: false, // Deshabilitar mongoose buffering
      bufferMaxEntries: 0 // Deshabilitar mongoose buffering
    });

    console.log(`✅ MongoDB conectado exitosamente!`);
    console.log(`📍 Host: ${conn.connection.host}:${conn.connection.port}`);
    console.log(`📂 Base de datos: ${conn.connection.name}`);
    
    // Eventos de conexión
    mongoose.connection.on('connected', () => {
      console.log('🔗 MongoDB conectado');
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB desconectado');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconectado');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ Error de MongoDB:', err.message);
    });

  } catch (error) {
    console.error('❌ Error al conectar con MongoDB:', error.message);
    
    // En desarrollo, mostrar más detalles del error
    if (process.env.NODE_ENV === 'development') {
      console.error('Detalles del error:', error);
      console.error('🔍 Verifica que MongoDB esté ejecutándose y la URI sea correcta');
    }
    
    // Salir del proceso con fallo
    process.exit(1);
  }
};

// Función para cerrar la conexión gracefully
const closeDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('🔒 Conexión a MongoDB cerrada exitosamente');
  } catch (error) {
    console.error('❌ Error al cerrar la conexión:', error);
    throw error;
  }
};

module.exports = { connectDB, closeDB };