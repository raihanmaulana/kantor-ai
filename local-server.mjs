// Server lokal: menyajikan public/ dan menjalankan api/*.js seperti di Vercel.
// Jalankan: npm run local   lalu buka http://localhost:3000
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Muat .env sederhana (KEY=VALUE per baris).
const envFile = join(here, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const routes = {
  '/api/event': (await import('./api/event.js')).default,
  '/api/state': (await import('./api/state.js')).default,
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); return res; };

  const handler = routes[u.pathname];
  if (handler) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    req.query = Object.fromEntries(u.searchParams);
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = raw; }
    return handler(req, res);
  }

  const rel = u.pathname === '/' ? 'index.html' : normalize(u.pathname).replace(/^([/\\])+/, '');
  const file = join(here, 'public', rel);
  if (!file.startsWith(join(here, 'public')) || !existsSync(file)) { res.statusCode = 404; return res.end('Tidak ditemukan'); }
  res.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  const backend = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) ? 'Upstash Redis' : 'memori (hilang saat server dimatikan)';
  console.log(`Kantor AI berjalan di http://localhost:${port}`);
  console.log(`Penyimpanan: ${backend}`);
  if (!process.env.OFFICE_WRITE_KEY) console.log('Peringatan: OFFICE_WRITE_KEY belum diatur, hook tidak akan bisa mengirim tugas. Salin .env.example ke .env.');
});
