import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const solverIndex = path.join(__dirname, 'node_modules', '@distube', 'ytdl-core', 'dist', 'solver', 'index.js');
  if (fs.existsSync(solverIndex)) {
    let content = fs.readFileSync(solverIndex, 'utf8');
    content = content.replace(/const CALL_DEADLINE_MS = [\d_]+;/, 'const CALL_DEADLINE_MS = 120_000;');
    fs.writeFileSync(solverIndex, content);
    console.log('✅ Patched @distube/ytdl-core CALL_DEADLINE_MS = 120,000ms for cloud hosting environments.');
  }

  const solverWorker = path.join(__dirname, 'node_modules', '@distube', 'ytdl-core', 'dist', 'solver', 'worker.js');
  if (fs.existsSync(solverWorker)) {
    let content = fs.readFileSync(solverWorker, 'utf8');
    content = content.replace(/const TIMEOUT_MS = [\d_]+;/, 'const TIMEOUT_MS = 60_000;');
    fs.writeFileSync(solverWorker, content);
    console.log('✅ Patched @distube/ytdl-core TIMEOUT_MS = 60,000ms.');
  }
} catch (e) {
  console.warn('⚠️ Notice: Could not patch @distube/ytdl-core:', e.message);
}
