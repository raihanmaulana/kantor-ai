// Pembantu kecil untuk handler API: kunci akses, body JSON, dan pesan error yang seragam.
import { timingSafeEqual } from 'node:crypto';
import { BoardError } from './board.js';

function matches(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function header(req, name) {
  const v = (req.headers || {})[name];
  return Array.isArray(v) ? v[0] : v || '';
}

// Kunci tulis: header "x-office-write" atau "Authorization: Bearer <kunci>".
export function writeKeyOf(req) {
  const auth = String(header(req, 'authorization'));
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(header(req, 'x-office-write')).trim();
}

export function canRead(req) {
  const readKey = process.env.OFFICE_READ_KEY;
  if (!readKey) return true;
  return matches(header(req, 'x-office-key'), readKey) || canWrite(req);
}

export function canWrite(req) {
  const writeKey = process.env.OFFICE_WRITE_KEY;
  return !!writeKey && matches(writeKeyOf(req), writeKey);
}

export function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

export function queryOf(req, name) {
  if (req.query && req.query[name] != null) return String(req.query[name]);
  try { return new URL(req.url, 'http://x').searchParams.get(name); } catch { return null; }
}

// Bungkus handler: periksa metode dan kunci tulis, tangani error dengan pesan Bahasa Indonesia.
export function writeHandler(methods) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const fn = methods[req.method];
    if (!fn) return res.status(405).json({ error: `Metode ${req.method} tidak didukung.` });
    if (!process.env.OFFICE_WRITE_KEY) return res.status(500).json({ error: 'OFFICE_WRITE_KEY belum diatur di environment variables.' });
    if (!canWrite(req)) return res.status(401).json({ error: 'Kunci tulis salah atau belum diisi.' });
    try {
      res.status(200).json(await fn(req));
    } catch (err) {
      if (err instanceof BoardError) return res.status(err.status).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: 'Gagal memproses: ' + (err && err.message ? err.message : err) });
    }
  };
}
