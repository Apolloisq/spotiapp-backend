import axios from 'axios';
import { Ytdl, chooseFormat, Client, Quality } from '@distube/ytdl-core';

// Clientes optimizados para servidores cloud (WebEmbedded, VisionOS y Tv no sufren bloqueos de PO-token ni cuelgues)
export const ytdl = new Ytdl({
  clients: [Client.WebEmbedded, Client.VisionOS, Client.Tv]
});
const INNERTUBE_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const INNERTUBE_CLIENT_VERSION = '1.20240424.01.00';

const clientHeaders = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://music.youtube.com/'
};

/**
 * Búsqueda de canciones en YouTube Music mediante ingeniería inversa a Innertube API
 */
export async function searchYouTubeMusic(query) {
  try {
    const url = `https://music.youtube.com/youtubei/v1/search?key=${INNERTUBE_API_KEY}`;
    const payload = {
      context: {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: INNERTUBE_CLIENT_VERSION,
          hl: 'es',
          gl: 'US'
        }
      },
      query: query
    };

    const response = await axios.post(url, payload, { headers: clientHeaders });
    const data = response.data;

    const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || [];
    const contents = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

    const tracks = [];

    for (const section of contents) {
      let items = [];
      if (section.itemSectionRenderer) {
        items = section.itemSectionRenderer.contents || [];
      } else if (section.musicShelfRenderer) {
        items = section.musicShelfRenderer.contents || [];
      } else if (section.musicCardShelfRenderer) {
        // Mejor resultado (Top result)
        const card = section.musicCardShelfRenderer;
        const flex = card.title?.runs || [];
        const topTitle = flex[0]?.text || '';
        const subtitleRuns = card.subtitle?.runs || [];
        const videoId = card.onTap?.watchEndpoint?.videoId;
        const thumbs = card.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const thumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';

        let cardArtist = 'Desconocido';
        let cardDuration = '';
        for (const r of subtitleRuns) {
          const t = r.text?.trim();
          if (!t || t === '•') continue;
          if (['canción', 'video', 'vídeo', 'single', 'álbum', 'album'].includes(t.toLowerCase())) continue;
          if (/^\d+:\d+$/.test(t)) {
            cardDuration = t;
          } else if (cardArtist === 'Desconocido' && !t.includes('visualizaciones') && !t.includes('reproducciones')) {
            cardArtist = t;
          }
        }

        if (videoId && topTitle) {
          tracks.push({
            id: videoId,
            title: topTitle,
            artist: cardArtist,
            duration: cardDuration,
            artwork: thumb,
            streamUrl: `/api/music/stream/${videoId}`
          });
        }
      }

      for (const item of items) {
        const r = item.musicResponsiveListItemRenderer;
        if (!r) continue;

        const flex = r.flexColumns || [];
        if (!flex.length) continue;

        const title = flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
        const subRuns = flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
        
        let artist = 'Desconocido';
        let duration = '';

        for (let i = 0; i < subRuns.length; i++) {
          const runText = subRuns[i]?.text?.trim();
          if (!runText || runText === '•') continue;
          if (['canción', 'video', 'vídeo', 'single', 'álbum', 'album', 'episodio', 'lista de reproducción', 'artista'].includes(runText.toLowerCase())) {
            continue;
          }
          if (/^\d+:\d+$/.test(runText)) {
            duration = runText;
          } else if (subRuns[i]?.navigationEndpoint?.browseEndpoint || artist === 'Desconocido') {
            if (!runText.includes('visualizaciones') && !runText.includes('reproducciones')) {
              artist = runText;
            }
          }
        }

        // Video ID
        const overlay = r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer;
        const videoId = (
          overlay?.playNavigationEndpoint?.watchEndpoint?.videoId ||
          r.playlistItemData?.videoId ||
          r.navigationEndpoint?.watchEndpoint?.videoId ||
          ''
        );

        // Thumbnail
        const thumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const thumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';

        if (videoId && title) {
          tracks.push({
            id: videoId,
            title: title,
            artist: artist,
            duration: duration,
            artwork: thumb,
            streamUrl: `/api/music/stream/${videoId}`
          });
        }
      }
    }

    return tracks;
  } catch (error) {
    console.error('Error en searchYouTubeMusic:', error.message);
    return [];
  }
}

/**
 * Obtiene el audio directo de YouTube mediante @distube/ytdl-core
 */
export async function getDirectAudioStream(videoId) {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await ytdl.getInfo(videoUrl);
    const format = chooseFormat(info.formats, { quality: 'highestaudio' });

    if (!format || !format.url) {
      throw new Error('No se encontró formato de audio compatible.');
    }

    return {
      url: format.url,
      mimeType: format.mimeType,
      audioBitrate: format.audioBitrate,
      contentLength: format.contentLength
    };
  } catch (error) {
    console.error(`Error obteniendo audio para ${videoId}:`, error.message);
    throw error;
  }
}

/**
 * Hits del momento para la sección Descubrir
 */
export async function getTrendingHits() {
  const queries = ['Top Hits 2026', 'Latin Hits', 'Éxitos Globales'];
  const randomQuery = queries[Math.floor(Math.random() * queries.length)];
  return await searchYouTubeMusic(randomQuery);
}

/**
 * Listas por género (Pop, Reguetón, Rock, Hip-Hop, Electrónica, etc.)
 */
export async function getTracksByGenre(genre) {
  return await searchYouTubeMusic(`${genre} hits`);
}

/**
 * Más canciones de un artista específico (para recomendaciones de Inicio)
 */
export async function getMoreTracksFromArtist(artistName) {
  const tracks = await searchYouTubeMusic(artistName);
  // Filtrar o priorizar los que coincidan con el artista
  return tracks.filter(t => t.artist.toLowerCase().includes(artistName.toLowerCase()) || artistName.toLowerCase().includes(t.artist.toLowerCase())).slice(0, 10);
}
