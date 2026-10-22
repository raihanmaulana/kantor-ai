#!/usr/bin/env node
// Mengirim satu tugas uji coba ke kantor, memakai konfigurasi hook yang sudah dipasang.
//   npm run test-event
//   node scripts/send-test.mjs --url http://localhost:3000 --key KUNCI_TULIS
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
let cfg = {};
try { cfg = JSON.parse(readFileSync(join(homedir(), '.claude', 'hooks', 'kantor-ai.config.json'), 'utf8')); } catch {}
const url = (arg('url') || cfg.url || '').replace(/\/+$/, '');
const key = arg('key') || cfg.key;
if (!url || !key) { console.error('Belum ada konfigurasi. Jalankan install-hooks.mjs dulu, atau beri --url dan --key.'); process.exit(1); }

const send = async (body) => {
  const r = await fetch(url + '/api/event', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text}`);
  return text;
};

const session = 'uji-' + Date.now();
try {
  const first = JSON.parse(await send({ type: 'prompt', session_id: session, project: 'uji-coba', prompt: 'Tugas uji: cek koneksi hook Claude Code' }));
  if (first.ignored) { console.log('Server menerima kunci, tapi hook dimatikan: ' + first.ignored); process.exit(0); }
  console.log('Task uji dibuat. Kartika sedang menulisnya ke papan…');
  await new Promise((r) => setTimeout(r, 8000));
  await send({ type: 'stop', session_id: session, project: 'uji-coba', result: 'Koneksi berhasil. Hook Claude Code → Kantor AI berjalan.' });
  console.log('Task uji pindah ke Review dan menunggu persetujuan Anda di dashboard.');
} catch (e) {
  console.error('Gagal:', e.message);
  process.exit(1);
}
