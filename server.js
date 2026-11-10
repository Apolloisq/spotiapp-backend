import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import musicRoutes from './routes/musicRoutes.js';
import userRoutes from './routes/userRoutes.js';
import playlistRoutes from './routes/playlistRoutes.js';
import { ytdl } from './services/youtubeMusicService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Configuración de Middlewares
app.use(cors({
  origin: '*', // Permitir conexión desde app móvil y panel admin web
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'Range']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging básico de peticiones
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/user', userRoutes);
app.use('/api/playlists', playlistRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'SpotiApp Music & Licensing Backend',
    timestamp: new Date().toISOString()
  });
});

// Manejo de rutas inexistentes
app.use((req, res) => {
  res.status(404).json({ error: 'RUTA_NO_ENCONTRADA', message: `La ruta ${req.originalUrl} no existe.` });
});

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({
    error: 'ERROR_SERVIDOR',
    message: err.message || 'Error interno en el servidor.'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`🎧 SpotiApp Backend corriendo en: http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log('====================================================');

  // Pre-calentar el solver de YouTube en segundo plano
  setTimeout(() => {
    console.log('🔄 Pre-calentando solver de YouTube en segundo plano...');
    ytdl.getInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      .then(() => console.log('✅ YouTube Player Solver pre-calentado y listo en caché.'))
      .catch(err => console.warn('Aviso pre-calentando solver:', err.message));
  }, 1000);
});
