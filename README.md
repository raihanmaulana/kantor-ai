# Kantor Arus

Kantor 3D yang hidup di lantai 38, mendampingi aplikasi pengelola uang **Arus** (repo money-manager). Setiap karyawan memegang satu bagian Arus dan bereaksi pada kegiatan serta kondisi keuangan Anda. Kantor AI **hanya membaca** data Arus.

| Karyawan | Jabatan | Bagian Arus | Objek di kantor |
|---|---|---|---|
| Raihan | Manager | Ringkasan: sisa jatah, batas aman per hari | Ruang Manager, memimpin briefing dan rapat |
| Kartika | Perencana Anggaran | Anggaran per pos | Papan Anggaran |
| Aci | Bendahara | Catatan pengeluaran, sumber dana | Brankas berisi tumpukan uang per sumber dana |
| Irham | Petugas Tagihan | Tagihan, cicilan, hutang, kartu kredit | Kalender tagihan |
| Fariz | Pengelola Tabungan | Target tabungan dan investasi | Rak celengan kaca |
| Cimol | Urusan Belanja | List Kebutuhan, split bill | Troli belanja |

Nama, jabatan, warna, dan kebiasaan diatur di `lib/team.js`.

## Yang terjadi di kantor

**Saat Anda mencatat sesuatu di Arus** (dicek setiap 15 detik):
- Catatan pengeluaran: Aci mencatat, lalu mengambil uang dari brankas. Kartika memperbarui pos anggaran di Papan Anggaran.
- Bayar atau tandai tagihan lunas: Irham mencoret kalender tagihan, dan Aci mengambil uangnya.
- Setor atau tarik tabungan: Fariz mengisi celengan. Celengan bersinar dan muncul confetti saat targetnya tercapai.
- Beli kebutuhan: Cimol mengeluarkan barang dari troli lalu menyerahkan struk ke Aci.
- Pindah dana, samakan saldo, atau ubah sumber dana: Aci memindahkan tumpukan antar-alas atau memeriksa alasnya.
- Ubah anggaran, target, list kebutuhan, atau tagihan: karyawan pemilik bagiannya memperbaruinya.
- Pemasukan bertambah: semua bersorak dan muncul confetti.

**Berdasarkan kondisi keuangan:**
- Status kantor tampil di panel dan di lampu di atas Papan Anggaran:
  - **Aman** (hijau).
  - **Waspada** (kuning): pengeluaran hari ini melewati batas aman per hari, ada pos kebutuhan atau gaya hidup di atas 80%, atau ada saldo minus.
  - **Kritis** (merah berkedip): sisa jatah habis atau ada tagihan terlambat.
- Saat Waspada atau Kritis, karyawan jarang bersantai. Saat Kritis, Raihan memanggil rapat darurat.
- Pos di atas 80%: Kartika melapor ke Raihan. Tagihan terlambat: Irham melapor dan kalender berkedip merah.
- Tagihan jatuh tempo hari ini atau besok: Irham menelepon pengingat.
- Saldo minus: Aci panik di depan alasnya.
- Ada kebutuhan yang waktunya dibeli: Cimol mendorong troli ke dekat lift.

**Ritme:**
- Briefing pagi setelah jam masuk kerja.
- Rapat anggaran pada tanggal 1–3.
- Aci menutup kas menjelang jam pulang.
- Di luar jam kerja (08.00–17.00) karyawan pulang lewat lift, tetapi tetap datang kalau ada kegiatan yang perlu diurus.

Tombol **Sembunyikan nominal** menyamarkan semua angka. Animasinya tetap jalan, jadi aman untuk direkam atau dilihat orang lain.

## Pengaturan

Isi di Vercel (**Settings → Environment Variables**), lalu Redeploy. Untuk mode lokal, salin `.env.example` menjadi `.env`.

| Variabel | Isi |
|---|---|
| `SUPABASE_URL` | Sama dengan `NEXT_PUBLIC_SUPABASE_URL` di project Arus |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role**. Rahasia, hanya dipakai di server |
| `FINANCE_OWNER_EMAIL` | Email akun Arus yang datanya ditampilkan |
| `OFFICE_READ_KEY` | Kunci untuk membuka halaman. Wajib, karena data keuangan bersifat pribadi |
| `ARUS_URL` | Opsional. Alamat web Arus untuk tombol **Buka Arus** |

Setelah halaman terbuka, klik **Kunci** dan isi kunci baca. Kunci disimpan di browser itu saja.

Untuk mencoba tanpa Supabase: `FINANCE_DEMO=1` memakai data contoh yang berubah sendiri, dan `FINANCE_DEMO=kritis` memakai contoh dengan tagihan telat dan saldo minus.

## Menjalankan di komputer sendiri

```bash
cp .env.example .env    # isi variabelnya
npm run local           # http://localhost:3000
```

Syarat: Node.js 18 atau lebih baru. Tidak ada dependensi dan tidak ada build step. Three.js dimuat dari CDN.

## Isi folder

| File | Fungsi |
|---|---|
| `lib/finance.js` | Membaca Supabase Arus dan menghitung ringkasan, tagihan, saldo, anggaran, tabungan, kebutuhan, status, dan aktivitas. Rumusnya disalin dari `lib/calc.ts` Arus |
| `lib/finance-demo.js` | Data contoh untuk mode demo |
| `lib/team.js` | Susunan tim dan jam kerja |
| `api/state.js` | `GET` tim dan snapshot keuangan |
| `public/js/panel.js` | Panel ringkasan keuangan dan profil karyawan |
| `public/js/office.js` | Kantor 3D: kegiatan, reaksi kondisi, ritme, monitor per bagian |
| `public/js/scene.js` | Gedung, brankas, Papan Anggaran, kalender, celengan, troli |
| `public/js/characters.js`, `behaviors.js`, `navgrid.js` | Karakter, antrean aksi, dan jalur jalan |

## Performa

- Animasi dibatasi 30 fps. **Mode hemat** (24 fps, tanpa bayangan) aktif otomatis di HP dan perangkat lemah.
- Animasi dan pengecekan data berhenti saat tab disembunyikan.
- Server menyimpan hasil hitungan selama 8 detik, jadi beberapa tab yang terbuka tidak membebani Supabase.
