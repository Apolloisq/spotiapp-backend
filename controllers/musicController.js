import axios from 'axios';
import { Quality, chooseFormat } from '@distube/ytdl-core';
import {
  ytdl,
  searchYouTubeMusic,
  getDirectAudioStream,
  getTrendingHits,
  getTracksByGenre,
  getMoreTracksFromArtist
} from '../services/youtubeMusicService.js';
import { fetchLyrics } from '../services/lyricsService.js';
import { supabaseAdmin } from '../config/supabase.js';

/**
 * Búsqueda general de canciones en YouTube Music
 */
export async function searchTracks(req, res) {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json({ tracks: [] });
    }

    const tracks = await searchYouTubeMusic(q.trim());
    res.json({ tracks });
  } catch (error) {
    console.error('Error en searchTracks:', error);
    res.status(500).json({ error: 'Error al buscar canciones.' });
  }
}

/**
 * Endpoint de streaming y descarga de audio directo (soporta Range requests y descarga offline)
 */
export async function streamAudio(req, res) {
  try {
    const { videoId } = req.params;
    const { download } = req.query;

    if (!videoId) {
      return res.status(400).json({ error: 'ID de canción requerido.' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await ytdl.getInfo(videoUrl);
    const format = chooseFormat(info.formats, { quality: 'highestaudio' });

    if (!format) {
      return res.status(404).json({ error: 'Formato de audio no disponible.' });
    }

    const rangeHeader = req.headers.range;
    let rangeOption = {};

    res.setHeader('Content-Type', format.mimeType || 'audio/webm');
    res.setHeader('Accept-Ranges', 'bytes');

    if (download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${videoId}.mp3"`);
    }

    if (rangeHeader && format.contentLength) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const total = parseInt(format.contentLength, 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', (end - start) + 1);

      rangeOption = { range: { start, end } };
    } else {
      if (format.contentLength) {
        res.setHeader('Content-Length', format.contentLength);
      }
    }

    const stream = ytdl.download(info, {
      quality: Quality.HighestAudio,
      filter: { hasAudio: true, hasVideo: false },
      ...rangeOption
    });

    stream.on('error', (err) => {
      console.warn('Stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error durante la transmisión de audio.' });
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error('Error en streamAudio:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'No se pudo reproducir el audio de esta canción.' });
    }
  }
}

/**
 * Obtener URL de stream directa en JSON (para que el reproductor móvil la cargue directamente)
 */
export async function getStreamUrl(req, res) {
  try {
    const { videoId } = req.params;
    const streamData = await getDirectAudioStream(videoId);
    res.json({
      videoId,
      directUrl: streamData.url,
      mimeType: streamData.mimeType
    });
  } catch (error) {
    console.error('Error en getStreamUrl:', error);
    res.status(500).json({ error: 'Error al resolver URL de audio.' });
  }
}

/**
 * Hits del momento para la sección Descubrir
 */
export async function getTrending(req, res) {
  try {
    const tracks = await getTrendingHits();
    res.json({ tracks });
  } catch (error) {
    console.error('Error en getTrending:', error);
    res.status(500).json({ error: 'Error al obtener canciones en tendencia.' });
  }
}

/**
 * Canciones por género para Descubrir
 */
export async function getGenre(req, res) {
  try {
    const { genre } = req.params;
    const tracks = await getTracksByGenre(genre);
    res.json({ genre, tracks });
  } catch (error) {
    console.error('Error en getGenre:', error);
    res.status(500).json({ error: 'Error al obtener canciones del género.' });
  }
}

/**
 * RECOMENDACIONES DE INICIO:
 * Recomendar SOLO canciones de artistas que el usuario ya escuchó (historial de reproducción)
 * Ejemplo: si escucha a Marc, mostrar las demás canciones de Marc.
 */
export async function getHomeRecommendations(req, res) {
  try {
    const userId = req.user.id;

    // 1. Obtener historial reciente de reproducciones del usuario
    const { data: recentPlays, error } = await supabaseAdmin
      .from('plays')
      .select('track_id, track_title, artist_id, artist_name, artwork_url, duration, fecha')
      .eq('user_id', userId)
      .order('fecha', { ascending: false })
      .limit(30);

    if (error) {
      console.warn('Advertencia leyendo plays en Supabase:', error.message);
    }

    // 2. Extraer lista única de artistas escuchados por el usuario
    const listenedArtists = [];
    const seenArtists = new Set();
    const recentUniqueTracks = [];
    const seenTracks = new Set();

    (recentPlays || []).forEach(p => {
      if (p.artist_name && !seenArtists.has(p.artist_name.toLowerCase())) {
        seenArtists.add(p.artist_name.toLowerCase());
        listenedArtists.push(p.artist_name);
      }
      if (p.track_id && !seenTracks.has(p.track_id)) {
        seenTracks.add(p.track_id);
        recentUniqueTracks.push({
          id: p.track_id,
          title: p.track_title,
          artist: p.artist_name,
          artwork: p.artwork_url,
          duration: p.duration ? `${Math.floor(p.duration / 60)}:${(p.duration % 60).toString().padStart(2, '0')}` : '',
          streamUrl: `/api/music/stream/${p.track_id}`
        });
      }
    });

    // 3. Si el usuario aún no tiene historial de artistas:
    if (listenedArtists.length === 0) {
      return res.json({
        hasHistory: false,
        message: 'Aún no has reproducido canciones. Explora la sección Descubrir para comenzar a generar tus recomendaciones personalizadas.',
        recentTracks: [],
        moreFromYourArtists: []
      });
    }

    // 4. Buscar SOLO canciones de los artistas que ya escuchó
    // Tomar hasta los 3 artistas más recientes o frecuentes
    const topArtists = listenedArtists.slice(0, 3);
    const moreFromYourArtists = [];

    for (const artist of topArtists) {
      try {
        const artistTracks = await getMoreTracksFromArtist(artist);
        // Excluir canciones que ya escuchó recientemente
        const filteredNewTracks = artistTracks.filter(t => !seenTracks.has(t.id));
        if (filteredNewTracks.length > 0) {
          moreFromYourArtists.push({
            artist,
            tracks: filteredNewTracks.slice(0, 6)
          });
        }
      } catch (e) {
        console.warn(`Error buscando canciones de ${artist}:`, e.message);
      }
    }

    res.json({
      hasHistory: true,
      recentTracks: recentUniqueTracks.slice(0, 10),
      moreFromYourArtists
    });
  } catch (error) {
    console.error('Error en getHomeRecommendations:', error);
    res.status(500).json({ error: 'Error al generar recomendaciones de inicio.' });
  }
}

/**
 * Obtener letras sincronizadas o estándar de la canción
 */
export async function getLyrics(req, res) {
  try {
    const { track, artist } = req.query;
    if (!track) {
      return res.status(400).json({ error: 'El nombre de la canción es requerido.' });
    }

    const lyricsData = await fetchLyrics(track, artist || '');
    if (!lyricsData) {
      return res.json({ found: false, message: 'Letra no disponible para esta canción.' });
    }

    res.json({
      found: true,
      ...lyricsData
    });
  } catch (error) {
    console.error('Error en getLyrics:', error.message);
    res.status(500).json({ error: 'Error al consultar letras.' });
  }
}
