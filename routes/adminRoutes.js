import { Router } from 'express';
import {
  adminLogin,
  getKeys,
  createBatchKeys,
  adjustKeyDays,
  unbindDevice,
  toggleKeyState,
  deleteKey,
  getStats
} from '../controllers/adminController.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { adminLoginLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Login de administrador con rate limiter
router.post('/login', adminLoginLimiter, adminLogin);

// Rutas protegidas para administración
router.use(authenticateAdmin);

// Métricas de dashboard
router.get('/stats', getStats);

// Gestión de claves
router.get('/keys', getKeys);
router.post('/keys/batch', createBatchKeys);
router.patch('/keys/:id/days', adjustKeyDays);
router.patch('/keys/:id/unbind', unbindDevice);
router.patch('/keys/:id/state', toggleKeyState);
router.delete('/keys/:id', deleteKey);

export default router;
