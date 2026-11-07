import { Router } from 'express';
import {
  searchTracks,
  streamAudio,
  getStreamUrl,
  getTrending,
  getGenre,
  getHomeRecommendations,
  getLyrics
} from '../controllers/musicController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Streaming directo (puede llamarse desde el reproductor con token en header o query)
router.get('/stream/:videoId', streamAudio);
router.get('/stream-url/:videoId', authenticateUser, getStreamUrl);

// Todas las demás rutas de catálogo y recomendaciones requieren sesión activa
router.use(authenticateUser);

// Búsqueda en YouTube Music
router.get('/search', searchTracks);

// Descubrir
router.get('/trending', getTrending);
router.get('/genre/:genre', getGenre);

// Letras de canciones
router.get('/lyrics', getLyrics);

// Recomendaciones de Inicio (SOLO de artistas escuchados por el usuario)
router.get('/recommendations', getHomeRecommendations);

export default router;
