import { supabaseAdmin } from '../config/supabase.js';

/**
 * Obtener perfil del usuario y días restantes
 */
export async function getProfile(req, res) {
  try {
    const userId = req.user.id;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json({
      user: {
        id: user.id,
        nombre: user.nombre,
        foto: user.foto,
        daysLeft: req.user.daysLeft,
        clave: req.user.clave,
        deviceId: req.user.deviceId
      },
      support: {
        whatsapp: 'wa.me/51902859644',
        discord: 'Apolloisq',
        bannerText: 'Activa ya tu plan permanente. Nunca tengas interrupciones y obtén navegación 70% más rápida, solo a tu cuenta y código.'
      }
    });
  } catch (error) {
    console.error('Error en getProfile:', error);
    res.status(500).json({ error: 'Error al obtener perfil.' });
  }
}

/**
 * Actualizar foto y nombre de usuario
 */
export async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { nombre, foto } = req.body;

    const updates = {};
    if (nombre && nombre.trim()) updates.nombre = nombre.trim();
    if (foto !== undefined) updates.foto = foto;
    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Perfil actualizado con éxito.',
      user: updated
    });
  } catch (error) {
    console.error('Error en updateProfile:', error);
    res.status(500).json({ error: 'Error al actualizar perfil.' });
  }
}

/**
 * Registrar reproducción en tabla plays (usuario, artista, canción, fecha)
 */
export async function recordPlay(req, res) {
  try {
    const userId = req.user.id;
    const { track_id, track_title, artist_id, artist_name, artwork_url, duration } = req.body;

    if (!track_id || !artist_name) {
      return res.status(400).json({ error: 'track_id y artist_name son obligatorios.' });
    }

    const { data: playRecord, error } = await supabaseAdmin
      .from('plays')
      .insert({
        user_id: userId,
        track_id: track_id,
        track_title: track_title || 'Canción',
        artist_id: artist_id || artist_name,
        artist_name: artist_name,
        artwork_url: artwork_url || null,
        duration: duration || 0,
        fecha: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.warn('Advertencia al registrar play:', error.message);
    }

    res.json({ success: true, play: playRecord });
  } catch (error) {
    console.error('Error en recordPlay:', error);
    res.status(500).json({ error: 'Error al registrar reproducción.' });
  }
}
