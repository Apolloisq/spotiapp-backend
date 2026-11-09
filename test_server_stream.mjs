import express from 'express';
import { streamAudio } from './controllers/musicController.js';

const app = express();
app.get('/stream/:videoId', streamAudio);

const server = app.listen(4005, async () => {
  console.log('Test server running on port 4005...');
  try {
    const start = Date.now();
    const res = await fetch('http://localhost:4005/stream/saadHe8Kw0I');
    console.log(`Stream response status in ${Date.now() - start}ms:`, res.status);
    console.log('Headers:', {
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length'),
      acceptRanges: res.headers.get('accept-ranges')
    });
    
    // Leer los primeros 64KB de audio
    const reader = res.body.getReader();
    let received = 0;
    while (received < 65536) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
    }
    console.log(`✅ Successfully received ${received} bytes of audio from stream in ${Date.now() - start}ms!`);
  } catch (err) {
    console.error('Test stream error:', err);
  } finally {
    server.close();
  }
});
