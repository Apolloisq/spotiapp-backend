import axios from 'axios';

/**
 * Parsea cadenas con formato LRC ([mm:ss.xx] texto) a un array ordenado de objetos con timeMs y text
 */
function parseLrc(lrcText) {
  if (!lrcText || typeof lrcText !== 'string') return [];
  const lines = lrcText.split('\n');
  const items = [];

  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      let msStr = match[3];
      if (msStr.length === 2) msStr += '0';
      const ms = parseInt(msStr.substring(0, 3), 10);
      const timeMs = min * 60000 + sec * 1000 + ms;
      const text = match[4].trim();

      if (text) {
        items.push({ timeMs, text });
      }
    }
  }

  return items.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Obtiene la letra sincronizada o plana desde la API de LRCLIB
 */
export async function fetchLyrics(trackName, artistName) {
  try {
    if (!trackName) return null;

    // Limpiar trackName (eliminar "(Oficial)", "[Audio]", etc.)
    const cleanTrack = trackName
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/feat\..*/i, '')
      .replace(/ft\..*/i, '')
      .trim();

    const cleanArtist = (artistName || '')
      .replace(/•.*/, '')
      .replace(/,.*$/, '')
      .trim();

    // 1. Intento directo con /api/get
    try {
      const response = await axios.get('https://lrclib.net/api/get', {
        params: {
          track_name: cleanTrack,
          artist_name: cleanArtist
        },
        headers: {
          'User-Agent': 'SpotiApp/1.0 (https://spotiapp.app)'
        },
        timeout: 5000
      });

      if (response.data) {
        const { syncedLyrics, plainLyrics } = response.data;
        if (syncedLyrics) {
          return {
            synced: true,
            lines: parseLrc(syncedLyrics)
          };
        }
        if (plainLyrics) {
          return {
            synced: false,
            plainLyrics
          };
        }
      }
    } catch (directErr) {
      // Continuar al fallback de búsqueda
    }

    // 2. Fallback de búsqueda con /api/search
    const searchRes = await axios.get('https://lrclib.net/api/search', {
      params: {
        q: `${cleanTrack} ${cleanArtist}`.trim()
      },
      headers: {
        'User-Agent': 'SpotiApp/1.0 (https://spotiapp.app)'
      },
      timeout: 5000
    });

    const results = searchRes.data || [];
    if (results.length > 0) {
      // Priorizar el primer resultado con syncedLyrics
      const best = results.find(r => r.syncedLyrics) || results[0];
      if (best.syncedLyrics) {
        return {
          synced: true,
          lines: parseLrc(best.syncedLyrics)
        };
      }
      if (best.plainLyrics) {
        return {
          synced: false,
          plainLyrics: best.plainLyrics
        };
      }
    }

    return null;
  } catch (error) {
    console.warn('Error obteniendo letras en fetchLyrics:', error.message);
    return null;
  }
}
