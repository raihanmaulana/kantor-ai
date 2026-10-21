// Logika tugas kantor: satu prompt Claude Code = satu tugas, jawaban terakhir Claude = hasilnya.
// Statistik kantor (tanggal berdiri, total tugas selesai, tugas hari ini) disimpan permanen.
import { get, set, del, incr, pushFront, range, getMany, backend } from './store.js';

const KEEP = 30;                       // jumlah tugas terakhir yang disimpan
const TTL = 60 * 60 * 24 * 14;         // isi tugas dihapus otomatis setelah 14 hari (Redis)
const STALE_MS = 45 * 60 * 1000;       // "dikerjakan" lebih dari 45 menit dianggap terhenti
const TZ_OFFSET_MIN = Number(process.env.OFFICE_TZ_OFFSET_MINUTES ?? 420); // default WIB (UTC+7)

const clip = (v, n) => String(v ?? '').slice(0, n);
const dayKey = (ms) => new Date(ms + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);

async function markDone(now) {
  await incr('stats:totalDone');
  await incr('stats:done:' + dayKey(now), 60 * 60 * 24 * 3);
}

async function ensureFounded(now) {
  const f = await get('stats:foundedAt');
  if (f) return Number(f);
  await set('stats:foundedAt', now);
  return now;
}

export async function recordEvent(e = {}) {
  const now = Date.now();
  const session = clip(e.session_id || 'default', 80);
  const project = clip(e.project, 60);
  await ensureFounded(now);

  if (e.type === 'prompt') {
    // Prompt baru di sesi yang sama berarti tugas sebelumnya sudah lewat.
    const prevId = await get('current:' + session);
    if (prevId) {
      const prev = await get('task:' + prevId);
      if (prev && prev.status === 'working') {
        prev.status = 'done';
        prev.result = prev.result || '(selesai tanpa ringkasan)';
        prev.updatedAt = now;
        await set('task:' + prevId, prev, TTL);
        await markDone(now);
      }
    }
    const id = now.toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const task = { id, prompt: clip(e.prompt || 'Tugas baru', 2000), status: 'working', result: '', project, session, createdAt: now };
    await set('task:' + id, task, TTL);
    await set('current:' + session, id, TTL);
    const dropped = await pushFront('tasks', id, KEEP);
    for (const old of dropped) await del('task:' + old);
    await incr('version');
    return { ok: true, id };
  }

  if (e.type === 'stop') {
    const id = await get('current:' + session);
    if (!id) return { ok: true, ignored: 'tidak ada tugas aktif di sesi ini' };
    const task = await get('task:' + id);
    if (!task) return { ok: true, ignored: 'tugas sudah kedaluwarsa' };
    const wasWorking = task.status === 'working';
    task.status = 'done';
    task.result = clip(e.result, 6000) || '(selesai)';
    task.updatedAt = now;
    await set('task:' + id, task, TTL);
    if (wasWorking) await markDone(now);
    await incr('version');
    return { ok: true, id };
  }

  return { ok: true, ignored: 'jenis event tidak dikenal' };
}

export async function readState(since) {
  const now = Date.now();
  // Satu perintah untuk semua angka yang dibutuhkan setiap kali halaman mengecek.
  const [v, foundedAt, totalDone, doneToday] = await getMany(['version', 'stats:foundedAt', 'stats:totalDone', 'stats:done:' + dayKey(now)]);
  const version = Number(v || 0);
  const office = {
    foundedAt: foundedAt ? Number(foundedAt) : await ensureFounded(now),
    totalDone: Number(totalDone || 0),
    doneToday: Number(doneToday || 0),
  };
  if (Number.isFinite(since) && since >= 0 && since === version) {
    return { version, changed: false, backend, office };
  }
  const ids = await range('tasks', 0, 11);
  const tasks = (await getMany(ids.map((id) => 'task:' + id))).filter(Boolean);
  for (const t of tasks) {
    if (t.status === 'working' && now - t.createdAt > STALE_MS) t.status = 'error';
    delete t.session;
  }
  return { version, changed: true, backend, office, tasks };
}
