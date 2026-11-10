import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_user';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'fallback_secret_admin';

/**
 * Middleware para validar usuario móvil y licencia de dispositivo activa
 */
export async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const deviceId = req.headers['x-device-id'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'NO_AUTORIZADO',
        message: 'Token de sesión no proporcionado.'
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        error: 'DEVICE_ID_REQUERIDO',
        message: 'Identificador único de dispositivo ausente en cabecera x-device-id.'
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        error: 'TOKEN_INVALIDO',
        message: 'Sesión expirada o inválida. Por favor, revalida tu clave.'
      });
    }

    const { userId, keyId } = decoded;

    // Consultar estado de la clave en Supabase en tiempo real
    const { data: keyRecord, error: keyError } = await supabaseAdmin
      .from('keys')
      .select('*, users(*)')
      .eq('id', keyId)
      .single();

    if (keyError || !keyRecord) {
      return res.status(401).json({
        error: 'CLAVE_INEXISTENTE',
        message: 'La clave vinculada a esta sesión ya no existe.'
      });
    }

    // 1. Validar vinculación estricta de dispositivo (soporta claves multi-dispositivo)
    const linkedDevices = (keyRecord.device_id || '')
      .split(',')
      .map(d => d.trim())
      .filter(Boolean);

    if (linkedDevices.length > 0 && !linkedDevices.includes(deviceId)) {
      return res.status(403).json({
        error: 'DISPOSITIVO_NO_COINCIDE',
        message: 'Esta clave está vinculada a otro dispositivo móvil.'
      });
    }

    // 2. Validar estado de la clave
    if (keyRecord.estado === 'desactivada') {
      return res.status(403).json({
        error: 'LICENCIA_DESACTIVADA',
        message: 'Tu clave ha sido desactivada por el administrador.'
      });
    }

    // 3. Validar expiración y días restantes
    const now = new Date();
    const expiraEn = keyRecord.expira_en ? new Date(keyRecord.expira_en) : null;
    let daysLeft = 0;

    if (expiraEn) {
      const diffTime = expiraEn.getTime() - now.getTime();
      daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    if (keyRecord.estado === 'vencida' || daysLeft <= 0 || (expiraEn && expiraEn <= now)) {
      // Actualizar a vencida si aún figuraba como activa
      if (keyRecord.estado !== 'vencida') {
        await supabaseAdmin
          .from('keys')
          .update({ estado: 'vencida' })
          .eq('id', keyRecord.id);
      }

      return res.status(403).json({
        error: 'LICENCIA_VENCIDA',
        message: 'Tu clave de activación ha llegado a 0 días o ha vencido.',
        daysLeft: 0
      });
    }

    // Usuario válido y con licencia vigente
    req.user = {
      id: keyRecord.user_id || userId,
      nombre: keyRecord.users?.nombre || 'Usuario',
      foto: keyRecord.users?.foto || null,
      keyId: keyRecord.id,
      clave: keyRecord.clave,
      daysLeft: daysLeft,
      deviceId: keyRecord.device_id
    };

    next();
  } catch (error) {
    console.error('Error en middleware authenticateUser:', error);
    res.status(500).json({ error: 'ERROR_INTERNO', message: 'Error validando sesión.' });
  }
}

/**
 * Middleware para validar acceso de administrador al panel web
 */
export function authenticateAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'NO_AUTORIZADO',
        message: 'Token de administrador requerido.'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'TOKEN_ADMIN_INVALIDO',
      message: 'Sesión de administrador inválida o expirada.'
    });
  }
}
