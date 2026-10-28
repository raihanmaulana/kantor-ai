// GET /api/state — tim, jam kerja, dan snapshot keuangan dari Arus.
// Data keuangan bersifat pribadi: hanya dikirim bila OFFICE_READ_KEY diatur dan cocok (kecuali mode demo).
import { TEAM, WORK_HOURS } from '../lib/team.js';
import { readFinance, financeMode, FinanceError } from '../lib/finance.js';
import { canRead } from '../lib/http.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Gunakan GET.' });
  if (!canRead(req)) return res.status(401).json({ error: 'Kunci akses salah.' });
  const base = { serverNow: Date.now(), team: TEAM.map(({ id, name, role, title, look, habits }) => ({ id, name, role, title, look, habits: habits || [] })), workHours: WORK_HOURS, arusUrl: process.env.ARUS_URL || null };
  const mode = financeMode();
  if (mode === 'off') return res.status(200).json({ ...base, finance: { enabled: false, reason: 'Variabel SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, dan FINANCE_OWNER_EMAIL belum diisi.' } });
  if (mode !== 'demo' && !process.env.OFFICE_READ_KEY) return res.status(200).json({ ...base, finance: { enabled: false, reason: 'Isi OFFICE_READ_KEY dulu supaya data keuangan tidak bisa dilihat publik.' } });
  try {
    res.status(200).json({ ...base, finance: await readFinance() });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ...base, finance: { enabled: false, error: true, reason: 'Gagal membaca data Arus: ' + (err && err.message ? err.message : err) } });
  }
}
