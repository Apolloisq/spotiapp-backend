import rateLimit from 'express-rate-limit';

/**
 * Limitador estricto para evitar ataques de fuerza bruta al probar claves de activación
 */
export const activationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Máximo 10 intentos por IP
  message: {
    error: 'DEMASIADOS_INTENTOS',
    message: 'Has intentado demasiadas claves. Por seguridad, espera 15 minutos antes de volver a intentar.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Limitador para el login del panel administrativo
 */
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: {
    error: 'DEMASIADOS_INTENTOS_ADMIN',
    message: 'Demasiados intentos de acceso administrativo. Bloqueado temporalmente.'
  },
  standardHeaders: true,
  legacyHeaders: false
});
