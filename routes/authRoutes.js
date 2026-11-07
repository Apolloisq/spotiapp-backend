import { Router } from 'express';
import { activateKey, validateSession } from '../controllers/authController.js';
import { authenticateUser } from '../middleware/auth.js';
import { activationLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Activar clave (con limitador contra fuerza bruta)
router.post('/activate', activationLimiter, activateKey);

// Revalidar sesión al abrir la app móvil
router.get('/validate', authenticateUser, validateSession);

export default router;
