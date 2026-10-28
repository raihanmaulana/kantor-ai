// Format angka & tanggal yang dipakai panel dan kantor 3D.
export const rupiah = (v) => (v < 0 ? '−Rp ' : 'Rp ') + Math.abs(Math.round(v || 0)).toLocaleString('id-ID');
export const signed = (v) => (v > 0 ? '+' : '') + rupiah(v);
export const shortRp = (v) => { const a = Math.abs(v || 0), s = v < 0 ? '−' : ''; return s + (a >= 1e9 ? (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M' : a >= 1e6 ? (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : a >= 1e3 ? Math.round(a / 1e3) + ' rb' : String(a)); };
export const short = (s, n = 38) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const monthName = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
export const BILL_STATUS = { lunas: 'Lunas', terlambat: 'Terlambat', hari_ini: 'Hari ini', besok: 'Besok', nanti: 'Nanti', dilewati: 'Dilewati' };
export const LEVEL = { aman: 'Aman', waspada: 'Waspada', kritis: 'Kritis' };
export const ROLE_INFO = {
  manager: 'Memantau sisa jatah dan batas aman per hari. Memimpin briefing dan rapat.',
  planner: 'Mengurus anggaran per pos dan Papan Anggaran.',
  treasurer: 'Mencatat pengeluaran dan mengurus sumber dana di brankas.',
  billing: 'Mengurus tagihan, cicilan, hutang, dan kartu kredit.',
  savings: 'Mengurus target tabungan dan investasi.',
  shopper: 'Mengurus List Kebutuhan dan split bill.',
};
