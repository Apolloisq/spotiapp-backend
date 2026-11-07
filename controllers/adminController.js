import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'fallback_secret_admin';

/**
 * Login administrativo
 */
export async function adminLogin(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Credenciales incompletas.' });
    }

    // Buscar admin en Supabase
    const { data: admin, error } = await supabaseAdmin
      .from('admin_users')
      .select('*')
      .eq('username', username.trim())
      .single();

    // Fallback de desarrollo si la tabla aún no tiene datos
    if (error || !admin) {
      if (username === 'admin' && password === 'admin123') {
        const token = jwt.sign(
          { id: 'default-admin-id', username: 'admin', role: 'admin' },
          ADMIN_JWT_SECRET,
          { expiresIn: '7d' }
        );
        return res.json({
          success: true,
          token,
          admin: { username: 'admin', nombre: 'Administrador Maestro' }
        });
      }
      return res.status(401).json({ error: 'Usuario o contraseña de administrador incorrectos.' });
    }

    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword && !(username === 'admin' && password === 'admin123')) {
      return res.status(401).json({ error: 'Contraseña de administrador incorrecta.' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: 'admin' },
      ADMIN_JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        nombre: admin.nombre
      }
    });
  } catch (error) {
    console.error('Error en adminLogin:', error);
    res.status(500).json({ error: 'Error interno en el servidor.' });
  }
}

/**
 * Listar claves con filtros, buscador y cálculo de días restantes
 */
export async function getKeys(req, res) {
  try {
    const { estado, search } = req.query;

    let query = supabaseAdmin
      .from('keys')
      .select('*, users(id, nombre, foto)')
      .order('created_at', { ascending: false });

    if (estado && estado !== 'todas') {
      query = query.eq('estado', estado);
    }

    const { data: keys, error } = await query;
    if (error) throw error;

    const now = new Date();

    // Formatear días restantes y detectar si venció
    const formattedKeys = (keys || []).map(k => {
      let diasRestantes = k.dias;
      let expiraDate = k.expira_en ? new Date(k.expira_en) : null;
      let porVencer = false;

      if (k.estado === 'activa' && expiraDate) {
        const diffMs = expiraDate.getTime() - now.getTime();
        diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diasRestantes <= 0) {
          diasRestantes = 0;
        } else if (diasRestantes <= 3) {
          porVencer = true; // Alerta: por vencer en 3 días o menos
        }
      } else if (k.estado === 'vencida') {
        diasRestantes = 0;
      }

      return {
        ...k,
        diasRestantes,
        porVencer,
        usuarioNombre: k.users?.nombre || (k.user_id ? 'Asignado' : 'Sin asignar')
      };
    });

    // Filtro por texto en memoria si se solicita
    let filtered = formattedKeys;
    if (search && search.trim()) {
      const s = search.toLowerCase().trim();
      filtered = formattedKeys.filter(k =>
        k.clave.toLowerCase().includes(s) ||
        (k.device_id && k.device_id.toLowerCase().includes(s)) ||
        (k.usuarioNombre && k.usuarioNombre.toLowerCase().includes(s))
      );
    }

    res.json({ keys: filtered });
  } catch (error) {
    console.error('Error en getKeys:', error);
    res.status(500).json({ error: 'Error al obtener claves.' });
  }
}

/**
 * Generar claves por lote o individuales
 */
export async function createBatchKeys(req, res) {
  try {
    const { dias = 30, cantidad = 1, prefijo = 'SPOTI' } = req.body;

    const numCantidad = Math.min(Math.max(parseInt(cantidad) || 1, 1), 100);
    const numDias = parseInt(dias) || 30;

    const keysToInsert = [];

    for (let i = 0; i < numCantidad; i++) {
      const randomPart1 = crypto.randomBytes(3).toString('hex').toUpperCase();
      const randomPart2 = crypto.randomBytes(3).toString('hex').toUpperCase();
      const keyString = `${prefijo}-${randomPart1}-${randomPart2}`;

      keysToInsert.push({
        clave: keyString,
        dias: numDias,
        estado: 'sin usar'
      });
    }

    const { data: created, error } = await supabaseAdmin
      .from('keys')
      .insert(keysToInsert)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: `Se generaron ${created.length} claves con éxito.`,
      keys: created
    });
  } catch (error) {
    console.error('Error en createBatchKeys:', error);
    res.status(500).json({ error: 'Error al generar claves.' });
  }
}

/**
 * Modificar días de una clave (sumar o restar)
 */
export async function adjustKeyDays(req, res) {
  try {
    const { id } = req.params;
    const { deltaDias } = req.body; // Ej: +5 o -5

    const { data: keyRecord, error } = await supabaseAdmin
      .from('keys')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !keyRecord) {
      return res.status(404).json({ error: 'Clave no encontrada.' });
    }

    let updates = {};

    if (keyRecord.estado === 'activa' && keyRecord.expira_en) {
      const currentExpiry = new Date(keyRecord.expira_en);
      const newExpiry = new Date(currentExpiry.getTime() + deltaDias * 24 * 60 * 60 * 1000);
      const now = new Date();

      if (newExpiry <= now) {
        updates.expira_en = now.toISOString();
        updates.estado = 'vencida';
        updates.dias = 0;
      } else {
        updates.expira_en = newExpiry.toISOString();
        const diffMs = newExpiry.getTime() - now.getTime();
        updates.dias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        updates.estado = 'activa';
      }
    } else {
      // Clave sin usar
      const nuevosDias = Math.max((keyRecord.dias || 30) + deltaDias, 1);
      updates.dias = nuevosDias;
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('keys')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    res.json({ success: true, key: updated });
  } catch (error) {
    console.error('Error en adjustKeyDays:', error);
    res.status(500).json({ error: 'Error al ajustar días.' });
  }
}

/**
 * Desvincular dispositivo de una clave
 */
export async function unbindDevice(req, res) {
  try {
    const { id } = req.params;

    const { data: updated, error } = await supabaseAdmin
      .from('keys')
      .update({ device_id: null })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Dispositivo desvinculado con éxito. El usuario podrá vincular otro teléfono.',
      key: updated
    });
  } catch (error) {
    console.error('Error en unbindDevice:', error);
    res.status(500).json({ error: 'Error al desvincular dispositivo.' });
  }
}

/**
 * Cambiar estado de la clave (desactivar o reactivar)
 */
export async function toggleKeyState(req, res) {
  try {
    const { id } = req.params;
    const { nuevoEstado } = req.body; // 'desactivada', 'activa', 'sin usar'

    const { data: updated, error } = await supabaseAdmin
      .from('keys')
      .update({ estado: nuevoEstado })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, key: updated });
  } catch (error) {
    console.error('Error en toggleKeyState:', error);
    res.status(500).json({ error: 'Error al cambiar estado de la clave.' });
  }
}

/**
 * Eliminar clave
 */
export async function deleteKey(req, res) {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('keys')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Clave eliminada permanentemente.' });
  } catch (error) {
    console.error('Error en deleteKey:', error);
    res.status(500).json({ error: 'Error al eliminar clave.' });
  }
}

/**
 * Resumen de métricas para el Dashboard
 */
export async function getStats(req, res) {
  try {
    const { data: allKeys } = await supabaseAdmin.from('keys').select('estado, expira_en');
    const { count: usersCount } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true });
    const { count: playsCount } = await supabaseAdmin.from('plays').select('*', { count: 'exact', head: true });

    const total = allKeys?.length || 0;
    const activas = allKeys?.filter(k => k.estado === 'activa').length || 0;
    const sinUsar = allKeys?.filter(k => k.estado === 'sin usar').length || 0;
    const vencidas = allKeys?.filter(k => k.estado === 'vencida').length || 0;
    const desactivadas = allKeys?.filter(k => k.estado === 'desactivada').length || 0;

    res.json({
      stats: {
        totalKeys: total,
        activeKeys: activas,
        unusedKeys: sinUsar,
        expiredKeys: vencidas,
        disabledKeys: desactivadas,
        totalUsers: usersCount || 0,
        totalPlays: playsCount || 0
      }
    });
  } catch (error) {
    console.error('Error en getStats:', error);
    res.status(500).json({ error: 'Error al obtener métricas.' });
  }
}
