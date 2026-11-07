import { Router } from 'express';
import { getProfile, updateProfile, recordPlay } from '../controllers/userController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

router.use(authenticateUser);

// Perfil de usuario
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

// Registrar reproducción de canción
router.post('/play', recordPlay);

export default router;
