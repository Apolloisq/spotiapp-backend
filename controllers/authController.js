import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_user';

/**
 * Sistema de Usuario y Código de Activación:
 * Valida o activa la cuenta vinculando Usuario, Clave de Activación y Dispositivo
 */
export async function activateKey(req, res) {
  try {
    const { clave, deviceId, nombre, usuario } = req.body;
    const cleanUser = (usuario || nombre || '').trim();
    const cleanKey = (clave || '').trim().toUpperCase();

    if (!cleanUser) {
      return res.status(400).json({
        error: 'USUARIO_REQUERIDO',
        message: 'Por favor, ingresa tu nombre de usuario para acceder.'
      });
    }

    if (!cleanKey) {
      return res.status(400).json({
        error: 'CLAVE_REQUERIDA',
        message: 'Por favor, ingresa tu código de activación.'
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        error: 'DEVICE_ID_REQUERIDO',
        message: 'El identificador de hardware del dispositivo es requerido.'
      });
    }

    // 1. Buscar la clave en Supabase
    const { data: keyRecord, error: searchError } = await supabaseAdmin
      .from('keys')
      .select('*, users(*)')
      .eq('clave', cleanKey)
      .single();

    if (searchError || !keyRecord) {
      return res.status(404).json({
        error: 'CLAVE_INVALIDA',
        message: 'El código de activación no existe o es incorrecto. Pídelo por WhatsApp o Discord.'
      });
    }

    // 2. Verificar estado
    if (keyRecord.estado === 'desactivada') {
      return res.status(403).json({
        error: 'CLAVE_DESACTIVADA',
        message: 'Este código de activación se encuentra desactivado por el administrador.'
      });
    }

    const now = new Date();

    // 3. Si la clave ya está 'activa' (Inicio de sesión de usuario existente)
    if (keyRecord.estado === 'activa') {
      // Validar si está vinculada a otro dispositivo
      if (keyRecord.device_id && keyRecord.device_id !== deviceId) {
        return res.status(403).json({
          error: 'DISPOSITIVO_VINCULADO',
          message: 'Este código ya está activo en otro teléfono. Pide desvincularlo al administrador en soporte.'
        });
      }

      // Si fue desvinculada por el administrador, re-vincular al nuevo dispositivo
      if (!keyRecord.device_id) {
        await supabaseAdmin
          .from('keys')
          .update({ device_id: deviceId })
          .eq('id', keyRecord.id);
      }

      // Actualizar nombre de usuario si se proporcionó uno nuevo o no tenía
      if (cleanUser && keyRecord.user_id) {
        await supabaseAdmin
          .from('users')
          .update({ nombre: cleanUser })
          .eq('id', keyRecord.user_id);
      }

      // Verificar si ya expiró
      const expiraEn = new Date(keyRecord.expira_en);
      const diffMs = expiraEn.getTime() - now.getTime();
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (daysLeft <= 0 || expiraEn <= now) {
        await supabaseAdmin
          .from('keys')
          .update({ estado: 'vencida' })
          .eq('id', keyRecord.id);

        return res.status(403).json({
          error: 'CLAVE_EXPIRADA',
          message: 'Tu código de activación ha llegado a 0 días y se encuentra vencido.'
        });
      }

      // Re-emitir token JWT de sesión
      const token = jwt.sign(
        { userId: keyRecord.user_id, keyId: keyRecord.id },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.json({
        success: true,
        message: '¡Bienvenido de nuevo! Sesión iniciada con éxito.',
        token,
        daysLeft,
        user: {
          id: keyRecord.user_id,
          nombre: cleanUser || keyRecord.users?.nombre || 'Usuario',
          foto: keyRecord.users?.foto || null,
          clave: keyRecord.clave
        }
      });
    }

    // 4. Si la clave está 'sin usar' (Activación inicial con Usuario y Código)
    if (keyRecord.estado === 'sin usar') {
      // Crear perfil de usuario registrado
      const { data: newUser, error: userError } = await supabaseAdmin
        .from('users')
        .insert({
          nombre: cleanUser
        })
        .select()
        .single();

      if (userError || !newUser) {
        throw new Error('Error al registrar usuario: ' + userError?.message);
      }

      // Calcular vigencia en días
      const diasDuracion = keyRecord.dias || 30;
      const expiraEn = new Date(now.getTime() + diasDuracion * 24 * 60 * 60 * 1000);

      // Vincular clave al nuevo usuario y al hardware del dispositivo
      const { error: updateError } = await supabaseAdmin
        .from('keys')
        .update({
          estado: 'activa',
          device_id: deviceId,
          user_id: newUser.id,
          activada_en: now.toISOString(),
          expira_en: expiraEn.toISOString()
        })
        .eq('id', keyRecord.id);

      if (updateError) {
        throw new Error('Error al activar el código: ' + updateError.message);
      }

      // Emitir token JWT
      const token = jwt.sign(
        { userId: newUser.id, keyId: keyRecord.id },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.json({
        success: true,
        message: `¡Bienvenido ${cleanUser}! Tu código ha sido activado con éxito.`,
        token,
        daysLeft: diasDuracion,
        user: {
          id: newUser.id,
          nombre: newUser.nombre,
          foto: newUser.foto || null,
          clave: keyRecord.clave
        }
      });
    }

    return res.status(400).json({
      error: 'ESTADO_INVALIDO',
      message: `El código se encuentra en estado: ${keyRecord.estado}`
    });
  } catch (error) {
    console.error('Error en activateKey:', error);
    res.status(500).json({ error: 'ERROR_SERVIDOR', message: error.message });
  }
}

/**
 * Revalida la sesión actual del dispositivo al abrir la aplicación
 */
export async function validateSession(req, res) {
  return res.json({
    valid: true,
    daysLeft: req.user.daysLeft,
    user: {
      id: req.user.id,
      nombre: req.user.nombre,
      foto: req.user.foto,
      clave: req.user.clave,
      deviceId: req.user.deviceId
    }
  });
}
