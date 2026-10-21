// POST /api/event — dipanggil oleh hook Claude Code. Butuh OFFICE_WRITE_KEY.
import { recordEvent } from '../lib/office.js';
import { keyFrom, matches } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST.' });
  const writeKey = process.env.OFFICE_WRITE_KEY;
  if (!writeKey) return res.status(500).json({ error: 'OFFICE_WRITE_KEY belum diatur di environment variables.' });
  if (!matches(keyFrom(req), writeKey)) return res.status(401).json({ error: 'Kunci tulis salah.' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  try {
    res.status(200).json(await recordEvent(body || {}));
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyimpan: ' + (err && err.message ? err.message : err) });
  }
}
