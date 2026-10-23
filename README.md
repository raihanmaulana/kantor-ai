# Kantor AI

Dashboard task dan kantor 3D yang hidup, di lantai 38 sebuah gedung. Anda mengelola pekerjaan kantor dan project pribadi di papan Kanban. Kelima karyawan bergerak sesuai status task, dan saat tidak sedang bekerja mereka punya aktivitas sendiri.

| Karyawan | Peran | Yang dilakukan di kantor |
|---|---|---|
| Raihan | Manager | Menerima presentasi task yang selesai di ruang meeting dan menyetujuinya |
| Kartika | Project Coordinator | Menulis setiap task baru ke papan task |
| Irham, Fariz | Engineer | Mengerjakan task, dibagi rata berdasarkan beban kerja |
| Nadia | Designer | Otomatis mengambil task berlabel desain |

Nama, peran, warna baju, kebiasaan saat rehat, dan jam kerja diatur di satu file: `lib/team.js`.

## Alur kerja

```
Task baru (Open) ──▶ Kartika berjalan ke papan, menulis, kartu muncul di papan 3D
On Progress      ──▶ penanggung jawab mengambil kartu, kembali ke meja, mengetik (monitor menampilkan judul task)
Done             ──▶ penanggung jawab membawa laptop ke ruang meeting, Raihan ikut masuk,
                     presentasi ±7 detik, lalu confetti dan task resmi selesai
```

- Task yang ditarik ke Done tampil dulu dengan badge **Presenting to Manager**. Server yang memutuskan kapan task selesai, jadi urutannya sama di semua perangkat.
- Kalau banyak perubahan datang bersamaan, setiap karyawan punya antrean aksi sendiri, sehingga animasinya tidak bertabrakan. Dashboard tetap langsung terupdate.
- Saat mengerjakan task, monitor engineer menampilkan editor kode yang diketik huruf demi huruf, lengkap dengan warna sintaks. Setelah satu file selesai, terminal menjalankan tes atau build. Sesekali mereka rehat sebentar, misalnya ambil kopi atau air minum, menelepon sambil mondar-mandir, peregangan, atau diskusi di meja rekan. Yang punya kebiasaan `merokok` (atur di `habits` pada `lib/team.js`) pergi ke ruang merokok. Status task tetap On Progress selama rehat.
- Saat tidak memegang task, karyawan ngopi (antre di mesin kopi), santai di sofa, ngobrol berdua di dekat jendela, melihat pemandangan kota, main ping-pong, peregangan, atau rapat singkat di papan. Raihan sesekali berkeliling.
- Jam kerja 08.00–17.00. Setelahnya, yang tidak memegang task pulang lewat lift, sementara yang masih memegang task lembur. Pagi hari mereka datang dari lift. Task baru di malam hari memanggil orangnya kembali.
- Langit, matahari, dan lampu kota mengikuti jam di perangkat yang membuka halaman.

## Isi folder

| File | Fungsi |
|---|---|
| `lib/team.js` | Susunan tim dan jam kerja |
| `lib/board.js` | Project, task, feed, statistik, penugasan otomatis, review → done, migrasi data lama |
| `lib/store.js` | Penyimpanan: Upstash Redis, atau file `data/kantor-ai.json` saat lokal |
| `lib/http.js` | Kunci baca/tulis dan penanganan error API |
| `api/state.js` | `GET` semua data untuk halaman |
| `api/projects.js` | `POST` membuat, `DELETE ?id=` menghapus project |
| `api/tasks.js` | `POST` membuat, `PATCH ?id=` mengubah, `DELETE ?id=` menghapus task |
| `api/event.js` | Hook Claude Code (opsional) |
| `public/index.html` | Kerangka halaman dan gaya tampilan |
| `public/js/` | Modul tanpa build step: `api.js`, `dashboard.js`, `office.js`, `scene.js`, `characters.js`, `behaviors.js`, `navgrid.js` |
| `local-server.mjs` | Menjalankan semuanya di komputer sendiri |
| `hooks/`, `install-hooks.mjs`, `scripts/send-test.mjs` | Hook Claude Code opsional |

Syarat: Node.js 18 atau lebih baru. Tidak ada build step. Three.js dimuat dari CDN.

## 1. Jalankan di komputer sendiri

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env: isi OFFICE_WRITE_KEY dan OFFICE_READ_KEY dengan teks acak
npm run local
```

Buka `http://localhost:3000`, lalu klik **Kunci** dan isi kedua kunci. Kunci disimpan di browser itu saja. Tanpa kunci tulis, dashboard hanya bisa dilihat.

Data lokal tersimpan di `data/kantor-ai.json`. Hapus file itu untuk memulai lagi dari Hari ke-1.

## 2. Upload ke Vercel

1. Hubungkan repository GitHub ini di vercel.com (**Add New → Project**), Framework Preset: **Other**.
2. Tab **Storage**: pilih **Upstash for Redis** dan sambungkan ke project. Variabel `KV_REST_API_URL` dan `KV_REST_API_TOKEN` (atau versi berawalan) otomatis ditambahkan.
3. **Settings → Environment Variables**: tambahkan `OFFICE_WRITE_KEY` dan `OFFICE_READ_KEY`.
4. **Deployments → Redeploy**.
5. Buka alamat Vercel Anda, klik **Kunci**, dan isi kedua kunci. Label di panel Task harus **TERHUBUNG**. Kalau tertulis **TANPA PENYIMPANAN**, Redis belum tersambung.

Untuk membuat kunci acak: `node -e "console.log(crypto.randomUUID())"`

## Pindah dari versi lama

Saat pertama dijalankan, 30 tugas terakhir dari versi sebelumnya (kantor yang bereaksi pada prompt Claude Code) otomatis dipindahkan menjadi task Done di project **Arsip**. Hitungan hari dan total tugas selesai tetap dilanjutkan.

## Hook Claude Code (opsional, nonaktif secara default)

Hook bisa membuat task otomatis dari Claude Code. Satu sesi Claude Code menjadi satu task Open di project "Claude Code", dan prompt berikutnya di sesi yang sama ditambahkan sebagai catatan. Saat Claude selesai menjawab, task pindah ke **Review** dengan badge "Menunggu persetujuan Anda", lalu Anda yang memindahkannya ke Done.

1. Tambahkan `CLAUDE_HOOK_ENABLED=1` di `.env` atau di environment variables Vercel, lalu deploy ulang.
2. Pasang hook di komputer Anda:
   ```bash
   node install-hooks.mjs --url https://alamat-anda.vercel.app --key ISI_OFFICE_WRITE_KEY
   npm run test-event
   ```
3. Mulai ulang Claude Code. Hook berlaku untuk semua proyek, baik di terminal, ekstensi IDE, maupun tab Code di aplikasi Claude (sesi Local). Sesi Cloud dan chat di claude.ai tidak memicunya.

Tambahkan `--no-text` supaya isi prompt tidak dikirim. Untuk melepas hook: `node install-hooks.mjs --uninstall`.

## API singkat

Semua penulisan butuh header `x-office-write: <OFFICE_WRITE_KEY>`. Pembacaan butuh `x-office-key: <OFFICE_READ_KEY>` bila kunci baca diatur.

```bash
# buat task
curl -X POST https://alamat-anda/api/tasks -H "x-office-write: KUNCI" -H "content-type: application/json" \
  -d '{"title":"Landing page promo","projectId":"p_kantor","priority":"high"}'
# mulai kerjakan / selesaikan
curl -X PATCH "https://alamat-anda/api/tasks?id=ID_TASK" -H "x-office-write: KUNCI" -H "content-type: application/json" -d '{"status":"in_progress"}'
curl -X PATCH "https://alamat-anda/api/tasks?id=ID_TASK" -H "x-office-write: KUNCI" -H "content-type: application/json" -d '{"status":"done"}'
```

## Performa dan batasan

- Animasi dibatasi 30 fps. **Mode hemat** menurunkannya ke 24 fps, mematikan bayangan, dan memakai resolusi standar. Mode ini aktif otomatis di HP atau perangkat lemah, dan juga saat frame rate terus turun.
- Semua animasi berhenti saat tab disembunyikan. Pengecekan data (tiap 4 detik, satu perintah Redis) juga berhenti.
- Posisi dan aktivitas santai karyawan disimulasikan di masing-masing browser, jadi dua perangkat bisa menampilkan aktivitas santai yang berbeda. Status task, siapa memegang task apa, dan urutan kejadian selalu sama.
- Paket Hobby Vercel ditujukan untuk pemakaian pribadi non-komersial. Untuk pemakaian kantor, cek ketentuan Vercel.
- Batas "hari ini" memakai WIB. Atur `OFFICE_TZ_OFFSET_MINUTES` untuk zona lain (WITA `480`, WIT `540`).
