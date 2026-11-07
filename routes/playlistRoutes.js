import { Router } from 'express';
import {
  getPlaylists,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  getPlaylistTracks,
  addTrackToPlaylist,
  removeTrackFromPlaylist
} from '../controllers/playlistController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

router.use(authenticateUser);

// CRUD de playlists
router.get('/', getPlaylists);
router.post('/', createPlaylist);
router.patch('/:id', renamePlaylist);
router.delete('/:id', deletePlaylist);

// Canciones de playlist (con posicionamiento secuencial incremental)
router.get('/:id/tracks', getPlaylistTracks);
router.post('/:id/tracks', addTrackToPlaylist);
router.delete('/:id/tracks/:trackRecordId', removeTrackFromPlaylist);

export default router;
