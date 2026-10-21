// Logika tugas kantor: satu prompt Claude Code = satu tugas, jawaban terakhir Claude = hasilnya.
import { get, set, incr, pushFront, range, getMany, backend } from './store.js';

const KEEP = 30;                       // jumlah tugas terakhir yang disimpan
const TTL = 60 * 60 * 24 * 14;         // tugas dihapus otomatis setelah 14 hari
const STALE_MS = 45 * 60 * 1000;       // tugas "dikerjakan" lebih dari 45 menit dianggap terhenti

const clip = (v, n) => String(v ?? '').slice(0, n);

export async function recordEvent(e = {}) {
  const now = Date.now();
  const session = clip(e.session_id || 'default', 80);
  const project = clip(e.project, 60);

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
      }
    }
    const id = now.toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const task = {
      id,
      prompt: clip(e.prompt || 'Tugas baru', 2000),
      status: 'working',
      result: '',
      project,
      session,
      createdAt: now,
    };
    await set('task:' + id, task, TTL);
    await set('current:' + session, id, TTL);
    await pushFront('tasks', id, KEEP);
    await incr('version');
    return { ok: true, id };
  }

  if (e.type === 'stop') {
    const id = await get('current:' + session);
    if (!id) return { ok: true, ignored: 'tidak ada tugas aktif di sesi ini' };
    const task = await get('task:' + id);
    if (!task) return { ok: true, ignored: 'tugas sudah kedaluwarsa' };
    task.status = 'done';
    task.result = clip(e.result, 6000) || '(selesai)';
    task.updatedAt = now;
    await set('task:' + id, task, TTL);
    await incr('version');
    return { ok: true, id };
  }

  return { ok: true, ignored: 'jenis event tidak dikenal' };
}

export async function readState(since) {
  const version = Number((await get('version')) || 0);
  if (Number.isFinite(since) && since >= 0 && since === version) {
    return { version, changed: false };
  }
  const ids = await range('tasks', 0, 11);
  const tasks = (await getMany(ids.map((id) => 'task:' + id))).filter(Boolean);
  const now = Date.now();
  for (const t of tasks) {
    if (t.status === 'working' && now - t.createdAt > STALE_MS) t.status = 'error';
    delete t.session;
  }
  return { version, changed: true, backend, tasks };
}
