// Susunan tim kantor. Setiap karyawan memegang satu bagian aplikasi Arus.
// Ubah nama, warna, atau kebiasaan di sini lalu deploy ulang (atau mulai ulang `npm run local`).
//
// role (menentukan bagian Arus yang dipegang dan tugasnya di kantor):
//   manager    — ringkasan bulan: sisa jatah, batas aman per hari; memimpin rapat dan briefing
//   planner    — Perencana Anggaran: pos anggaran, mengurus Papan Anggaran
//   treasurer  — Bendahara: catatan pengeluaran dan sumber dana, mengurus brankas
//   billing    — Petugas Tagihan: tagihan, cicilan, hutang, kartu kredit, kalender tagihan
//   savings    — Pengelola Tabungan: target tabungan dan investasi, rak celengan
//   shopper    — Urusan Belanja: List Kebutuhan dan split bill, troli belanja
//
// look: tampilan karakter 3D. style: 'short' | 'long' | 'bun' | 'curly' | 'glasses' | 'cap'
// habits (opsional): kebiasaan saat rehat. 'merokok' — sesekali ke ruang merokok.

export const TEAM = [
  { id: 'raihan',  name: 'Raihan',  role: 'manager',   title: 'Manager',            look: { shirt: '#2f8f6d', skin: '#b98258', hair: '#2a1c12', style: 'short', tie: true } },
  { id: 'kartika', name: 'Kartika', role: 'planner',   title: 'Perencana Anggaran', look: { shirt: '#e0952f', skin: '#e7b487', hair: '#24150f', style: 'long' } },
  { id: 'aci',     name: 'Aci',     role: 'treasurer', title: 'Bendahara',          look: { shirt: '#c9a227', skin: '#d9a77c', hair: '#1c120c', style: 'long' } },
  { id: 'irham',   name: 'Irham',   role: 'billing',   title: 'Petugas Tagihan',    look: { shirt: '#2d6cdf', skin: '#c99a72', hair: '#18110c', style: 'glasses' }, habits: ['merokok'] },
  { id: 'fariz',   name: 'Fariz',   role: 'savings',   title: 'Pengelola Tabungan', look: { shirt: '#6a5ad8', skin: '#b07a52', hair: '#3a2414', style: 'curly' } },
  { id: 'cimol',   name: 'Cimol',   role: 'shopper',   title: 'Urusan Belanja',     look: { shirt: '#d45a72', skin: '#c48f66', hair: '#1a120d', style: 'cap' } },
];

// Jam kerja kantor (jam lokal di browser). Di luar jam ini karyawan pulang lewat lift,
// kecuali ada kegiatan keuangan yang perlu diurus.
export const WORK_HOURS = { start: 8, end: 17 };
