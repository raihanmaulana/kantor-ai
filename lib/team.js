// Susunan tim kantor. Ubah file ini untuk mengganti nama, peran, atau warna karyawan,
// lalu deploy ulang (atau mulai ulang `npm run local`).
//
// role:
//   manager      — menerima presentasi task yang selesai dan menyetujuinya
//   coordinator  — menulis setiap task baru ke papan task
//   engineer     — mengerjakan task (dibagi rata berdasarkan beban kerja)
//   designer     — otomatis mengambil task berlabel "desain"
//
// look: tampilan karakter 3D (warna dalam hex)
//   style: 'short' | 'long' | 'bun' | 'curly' | 'glasses' | 'cap'
//
// habits (opsional): kebiasaan tambahan saat rehat sejenak di tengah mengerjakan task.
//   'merokok' — sesekali ke ruang merokok
//   Rehat lain (ambil kopi, air minum, telepon, peregangan, diskusi dengan rekan) berlaku untuk semua.

export const TEAM = [
  { id: 'raihan',  name: 'Raihan',  role: 'manager',     title: 'Manager',             look: { shirt: '#2f8f6d', skin: '#b98258', hair: '#2a1c12', style: 'short',   tie: true } },
  { id: 'kartika', name: 'Kartika', role: 'coordinator', title: 'Project Coordinator', look: { shirt: '#e0952f', skin: '#e7b487', hair: '#24150f', style: 'long' } },
  { id: 'irham',   name: 'Irham',   role: 'engineer',    title: 'Engineer',            look: { shirt: '#2d6cdf', skin: '#c99a72', hair: '#18110c', style: 'glasses' }, habits: ['merokok'] },
  { id: 'fariz',   name: 'Fariz',   role: 'engineer',    title: 'Engineer',            look: { shirt: '#6a5ad8', skin: '#b07a52', hair: '#3a2414', style: 'curly' } },
  { id: 'nadia',   name: 'Nadia',   role: 'designer',    title: 'Designer',            look: { shirt: '#d45a72', skin: '#dca57f', hair: '#120d0b', style: 'bun' } },
];

// Task dianggap "desain" bila diberi label desain, atau judulnya mengandung salah satu kata ini.
export const DESIGN_KEYWORDS = ['desain', 'design', 'ui', 'ux', 'logo', 'banner', 'mockup', 'figma', 'ilustrasi', 'poster', 'thumbnail', 'branding'];

// Jam kerja kantor (jam lokal di browser). Di luar jam ini karyawan tanpa task pulang lewat lift.
export const WORK_HOURS = { start: 8, end: 17 };
