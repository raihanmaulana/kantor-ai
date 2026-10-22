// GET /api/state?since=<versi> — seluruh project, task, karyawan, feed, dan statistik.
// Butuh OFFICE_READ_KEY (header x-office-key) bila diatur. Mengembalikan canWrite
// supaya dashboard tahu apakah kunci tulis yang tersimpan masih benar.
import { readState } from '../lib/board.js';
import { backend } from '../lib/store.js';
import { canRead, canWrite, queryOf } from '../lib/http.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Gunakan GET.' });
  if (!canRead(req)) return res.status(401).json({ error: 'Kunci akses salah.' });
  const since = Number(queryOf(req, 'since') ?? -1);
  try {
    const state = await readState(Number.isFinite(since) ? since : -1);
    res.status(200).json({ ...state, backend, canWrite: canWrite(req) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membaca data: ' + (err && err.message ? err.message : err) });
  }
}
