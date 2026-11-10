import { Router } from 'express';
import { getProfile, updateProfile, recordPlay, getRecentPlays } from '../controllers/userController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

router.use(authenticateUser);

// Perfil de usuario
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

// Historial reciente de reproducciones
router.get('/recent-plays', getRecentPlays);

// Registrar reproducción de canción
router.post('/play', recordPlay);

export default router;
