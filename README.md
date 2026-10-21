# Kantor AI

Kantor 3D di lantai 38 sebuah gedung, berisi **Manager** dan **Raihan (IT Analyst)**. Setiap kali Anda mengirim prompt di **Claude Code**, Manager menerima tugasnya dan mengantarnya ke meja Raihan. Saat Claude selesai menjawab, ringkasan jawabannya muncul di monitor Raihan, lalu Manager datang untuk mereview.

```
Prompt di Claude Code ──(hook UserPromptSubmit)──▶ /api/event ──▶ Redis ◀── /api/state ◀── halaman kantor (cek tiap 4 detik)
Claude selesai menjawab ─(hook Stop)─────────────▶ /api/event
```

Langit di luar mengikuti jam di komputer yang membuka halaman: pagi, siang, sore, dan malam. Saat malam, jendela gedung di sekitar menyala dan lampu kantor hidup.

Hook dipasang di level user (`~/.claude/settings.json`), jadi aktif di **semua proyek dan semua sesi Claude Code** di komputer itu. Chat di claude.ai tidak memicu hook ini.

## Isi folder

| File | Fungsi |
|---|---|
| `public/index.html` | Halaman kantor 3D |
| `api/event.js` | Menerima event dari hook (butuh kunci tulis) |
| `api/state.js` | Dibaca halaman kantor (butuh kunci baca bila diatur) |
| `lib/` | Penyimpanan (Upstash Redis, atau memori saat lokal) dan logika tugas |
| `hooks/kantor-ai.mjs` | Skrip hook Claude Code |
| `install-hooks.mjs` | Memasang atau melepas hook di `~/.claude/settings.json` |
| `scripts/send-test.mjs` | Mengirim satu tugas uji |
| `local-server.mjs` | Menjalankan semuanya di komputer sendiri |

Syarat: Node.js 18 atau lebih baru.

## 1. Coba di komputer sendiri

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env: isi OFFICE_WRITE_KEY dan OFFICE_READ_KEY dengan teks acak
npm run local
```

Buka `http://localhost:3000/?key=ISI_OFFICE_READ_KEY`. Kunci akan diingat browser.

Di terminal lain, pasang hook ke alamat lokal:

```bash
node install-hooks.mjs --url http://localhost:3000 --key ISI_OFFICE_WRITE_KEY
npm run test-event
```

Mulai ulang Claude Code, lalu kirim prompt apa saja. Manager langsung bergerak.

Mode lokal menyimpan data di `data/kantor-ai.json`, jadi riwayat tugas, hitungan hari, dan jumlah tugas selesai tetap ada walau server dimatikan. Hapus file itu untuk memulai kantor dari Hari ke-1 lagi.

## 2. Upload ke Vercel

1. Upload folder ini ke repository GitHub. File `.env` dan `node_modules` sudah diabaikan oleh `.gitignore`.
2. Di vercel.com pilih **Add New → Project**, impor repository tersebut. Framework Preset: **Other**. Klik **Deploy**.
3. Buka project, lalu tab **Storage**. Pilih **Upstash for Redis** dari Marketplace dan sambungkan ke project ini. Vercel otomatis menambahkan variabel `KV_REST_API_URL` dan `KV_REST_API_TOKEN`.
4. Di **Settings → Environment Variables**, tambahkan:
   - `OFFICE_WRITE_KEY`: kunci untuk hook (teks acak panjang)
   - `OFFICE_READ_KEY`: kunci untuk membuka halaman
5. Buka **Deployments → Redeploy** supaya variabel baru terbaca.
6. Buka `https://nama-project.vercel.app/?key=ISI_OFFICE_READ_KEY`.

Lalu arahkan hook di komputer Anda ke alamat online:

```bash
node install-hooks.mjs --url https://nama-project.vercel.app --key ISI_OFFICE_WRITE_KEY
npm run test-event
```

Menjalankan installer lagi akan mengganti pemasangan lama, jadi tidak ada hook dobel. Isi `settings.json` lain tetap utuh, dan cadangannya disimpan sebagai `settings.json.bak-kantor-ai`.

Untuk membuat kunci acak: `node -e "console.log(crypto.randomUUID())"`

## Progres yang tersimpan

- **Hari ke-N** dihitung dari tanggal kantor pertama kali menerima tugas atau dibuka, dan terus bertambah setiap hari.
- **Tugas hari ini** dan **total tugas selesai** disimpan di server, jadi tetap sama di semua perangkat.
- **30 tugas terakhir** beserta hasilnya tersimpan dan langsung tampil saat halaman dibuka.
- Di Vercel semua ini disimpan di Upstash Redis. Di mode lokal disimpan di `data/kantor-ai.json`.
- Batas "hari ini" memakai zona waktu WIB. Untuk zona lain, atur `OFFICE_TZ_OFFSET_MINUTES` (contoh WITA: `480`, WIT: `540`).

## Privasi

- Isi prompt dan ringkasan jawaban Claude disimpan di Redis selama 14 hari, maksimal 30 tugas terakhir.
- Siapa pun yang tahu `OFFICE_READ_KEY` bisa membacanya. Kalau variabel itu dikosongkan, halaman bisa dibaca siapa saja yang tahu alamatnya.
- Mau animasinya saja tanpa mengirim isi prompt? Pasang dengan `--no-text`. Halaman hanya akan menampilkan "Tugas baru di <nama folder>".

## Biaya dan batasan

- Halaman mengecek server tiap 4 detik selama tab terbuka, dan berhenti saat tab disembunyikan. Satu kali cek = satu perintah Redis. Pastikan kuota paket gratis Upstash Anda cukup.
- Paket Hobby Vercel ditujukan untuk pemakaian pribadi non-komersial. Untuk pemakaian kantor, cek ketentuan Vercel atau gunakan paket Pro.
- Tugas yang berstatus "dikerjakan" lebih dari 45 menit tanpa event selesai (misalnya Claude Code ditutup di tengah jalan) akan ditandai "terhenti".

## Melepas hook

```bash
node install-hooks.mjs --uninstall
```
