// GET /api/finance — saldo per sumber dana dan aktivitas keuangan terbaru dari Arus (Supabase).
// Data keuangan bersifat pribadi, jadi endpoint ini hanya aktif bila OFFICE_READ_KEY diatur.
import { readFinance, financeMode, FinanceError } from '../lib/finance.js';
import { canRead } from '../lib/http.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Gunakan GET.' });
  if (financeMode() === 'off') return res.status(200).json({ enabled: false });
  if (!process.env.OFFICE_READ_KEY && financeMode() !== 'demo') return res.status(200).json({ enabled: false, error: 'Atur OFFICE_READ_KEY dulu supaya data keuangan tidak bisa dilihat publik.' });
  if (!canRead(req)) return res.status(401).json({ error: 'Kunci akses salah.' });
  try {
    res.status(200).json(await readFinance());
  } catch (err) {
    console.error(err);
    res.status(err instanceof FinanceError ? err.status : 500).json({ enabled: true, error: 'Gagal membaca data keuangan: ' + (err && err.message ? err.message : err) });
  }
}
