// Server lokal: menyajikan public/ dan menjalankan api/*.js seperti di Vercel.
// Jalankan: npm run local   lalu buka http://localhost:3000
import http from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Muat .env sederhana (KEY=VALUE per baris).
const envFile = join(here, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Setiap file api/<nama>.js menjadi rute /api/<nama>, sama seperti Vercel.
const routes = {};
for (const f of readdirSync(join(here, 'api'))) {
  if (f.endsWith('.js')) routes['/api/' + basename(f, '.js')] = (await import(pathToFileURL(join(here, 'api', f)).href)).default;
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const publicDir = join(here, 'public');

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
    try { return await handler(req, res); }
    catch (err) { console.error(err); if (!res.headersSent) res.status(500).json({ error: String(err.message || err) }); return; }
  }

  const rel = u.pathname === '/' ? 'index.html' : normalize(decodeURIComponent(u.pathname)).replace(/^([/\\])+/, '');
  const file = join(publicDir, rel);
  if (!file.startsWith(publicDir) || !existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; return res.end('Tidak ditemukan'); }
  res.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
  res.setHeader('cache-control', 'no-store');
  res.end(readFileSync(file));
});

const port = Number(process.env.PORT || 3000);
server.listen(port, async () => {
  const { backend } = await import('./lib/store.js');
  console.log(`Kantor AI berjalan di http://localhost:${port}`);
  console.log('Penyimpanan: ' + (backend === 'redis' ? 'Upstash Redis' : backend === 'file' ? 'file data/kantor-ai.json (tetap ada walau server dimatikan)' : 'memori'));
  if (!process.env.OFFICE_WRITE_KEY) console.log('Peringatan: OFFICE_WRITE_KEY belum diatur, dashboard tidak bisa menyimpan perubahan. Salin .env.example ke .env.');
});
