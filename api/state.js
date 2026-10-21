// GET /api/state?since=<versi> — dibaca halaman kantor. Butuh OFFICE_READ_KEY bila diatur.
import { readState } from '../lib/office.js';
import { keyFrom, matches } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Gunakan GET.' });
  const readKey = process.env.OFFICE_READ_KEY;
  if (readKey && !matches(keyFrom(req), readKey)) return res.status(401).json({ error: 'Kunci akses salah.' });

  res.setHeader('Cache-Control', 'no-store');
  const since = Number((req.query && req.query.since) ?? -1);
  try {
    res.status(200).json(await readState(since));
  } catch (err) {
    res.status(500).json({ error: 'Gagal membaca data: ' + (err && err.message ? err.message : err) });
  }
}
