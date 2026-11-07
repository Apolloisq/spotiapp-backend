import { supabaseAdmin } from '../config/supabase.js';

/**
 * Listar playlists del usuario
 */
export async function getPlaylists(req, res) {
  try {
    const userId = req.user.id;

    const { data: playlists, error } = await supabaseAdmin
      .from('playlists')
      .select('*, playlist_tracks(count)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (playlists || []).map(p => ({
      ...p,
      trackCount: p.playlist_tracks?.[0]?.count || 0
    }));

    res.json({ playlists: formatted });
  } catch (error) {
    console.error('Error en getPlaylists:', error);
    res.status(500).json({ error: 'Error al obtener playlists.' });
  }
}

/**
 * Crear nueva playlist
 */
export async function createPlaylist(req, res) {
  try {
    const userId = req.user.id;
    const { nombre } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre de la playlist es obligatorio.' });
    }

    const { data: newPlaylist, error } = await supabaseAdmin
      .from('playlists')
      .insert({
        user_id: userId,
        nombre: nombre.trim()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, playlist: newPlaylist });
  } catch (error) {
    console.error('Error en createPlaylist:', error);
    res.status(500).json({ error: 'Error al crear playlist.' });
  }
}

/**
 * Renombrar playlist
 */
export async function renamePlaylist(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { nombre } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nuevo nombre es obligatorio.' });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('playlists')
      .update({ nombre: nombre.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, playlist: updated });
  } catch (error) {
    console.error('Error en renamePlaylist:', error);
    res.status(500).json({ error: 'Error al renombrar playlist.' });
  }
}

/**
 * Eliminar playlist
 */
export async function deletePlaylist(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('playlists')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ success: true, message: 'Playlist eliminada con éxito.' });
  } catch (error) {
    console.error('Error en deletePlaylist:', error);
    res.status(500).json({ error: 'Error al eliminar playlist.' });
  }
}

/**
 * Obtener detalles y canciones de una playlist en orden de posición
 */
export async function getPlaylistTracks(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verificar propiedad
    const { data: playlist, error: pError } = await supabaseAdmin
      .from('playlists')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (pError || !playlist) {
      return res.status(404).json({ error: 'Playlist no encontrada.' });
    }

    // Obtener canciones ordenadas estrictamente por 'posicion' incremental
    const { data: tracks, error: tError } = await supabaseAdmin
      .from('playlist_tracks')
      .select('*')
      .eq('playlist_id', id)
      .order('posicion', { ascending: true });

    if (tError) throw tError;

    res.json({
      playlist,
      tracks: tracks || []
    });
  } catch (error) {
    console.error('Error en getPlaylistTracks:', error);
    res.status(500).json({ error: 'Error al obtener canciones de la playlist.' });
  }
}

/**
 * AGREGAR CANCIÓN A PLAYLIST:
 * Se inserta al FINAL con campo "posicion" incremental (1ra = 1, 2da = 2, etc.).
 * NUNCA desplazar las existentes.
 */
export async function addTrackToPlaylist(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params; // playlist_id
    const { track_id, track_title, artist_name, artwork_url, duration } = req.body;

    if (!track_id || !track_title) {
      return res.status(400).json({ error: 'Datos de canción incompletos.' });
    }

    // Verificar que la playlist pertenezca al usuario
    const { data: playlist, error: pError } = await supabaseAdmin
      .from('playlists')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (pError || !playlist) {
      return res.status(404).json({ error: 'Playlist no encontrada.' });
    }

    // Obtener la posición máxima actual en la playlist
    const { data: maxRecord, error: maxError } = await supabaseAdmin
      .from('playlist_tracks')
      .select('posicion')
      .eq('playlist_id', id)
      .order('posicion', { ascending: false })
      .limit(1);

    const ultimaPosicion = (maxRecord && maxRecord.length > 0) ? maxRecord[0].posicion : 0;
    const nuevaPosicion = ultimaPosicion + 1; // 1ra = 1, 2da = 2, etc.

    // Insertar al final sin tocar ni desplazar las posiciones existentes
    const { data: newTrack, error: insertError } = await supabaseAdmin
      .from('playlist_tracks')
      .insert({
        playlist_id: id,
        track_id: track_id,
        track_title: track_title,
        artist_name: artist_name || 'Desconocido',
        artwork_url: artwork_url || null,
        duration: duration || 0,
        posicion: nuevaPosicion
      })
      .select()
      .single();

    if (insertError) throw insertError;

    res.json({
      success: true,
      message: `Canción agregada en la posición ${nuevaPosicion} al final de la playlist.`,
      track: newTrack
    });
  } catch (error) {
    console.error('Error en addTrackToPlaylist:', error);
    res.status(500).json({ error: 'Error al agregar canción a la playlist.' });
  }
}

/**
 * Quitar canción de playlist
 */
export async function removeTrackFromPlaylist(req, res) {
  try {
    const userId = req.user.id;
    const { id, trackRecordId } = req.params;

    // Verificar propiedad de la playlist
    const { data: playlist } = await supabaseAdmin
      .from('playlists')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist no encontrada.' });
    }

    const { error } = await supabaseAdmin
      .from('playlist_tracks')
      .delete()
      .eq('id', trackRecordId)
      .eq('playlist_id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Canción eliminada de la playlist.' });
  } catch (error) {
    console.error('Error en removeTrackFromPlaylist:', error);
    res.status(500).json({ error: 'Error al quitar canción.' });
  }
}
