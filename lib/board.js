// Papan kerja kantor: project, task, feed aktivitas, dan statistik.
// Semua disimpan sebagai satu dokumen JSON (Redis atau file lokal), plus nomor versi
// supaya halaman cukup membaca satu angka saat tidak ada perubahan.
import { get, set, incr, getMany, range } from './store.js';
import { TEAM, DESIGN_KEYWORDS, WORK_HOURS } from './team.js';

const DATA_KEY = 'board2:data';
const VER_KEY = 'board2:ver';
const SETTLE_KEY = 'board2:nextSettle';
export const REVIEW_MS = 7000;          // lama presentasi ke Manager sebelum task resmi selesai
const MAX_TASKS = 500;
const MAX_FEED = 150;
const MAX_HISTORY = 40;
const TZ_MIN = Number(process.env.OFFICE_TZ_OFFSET_MINUTES ?? 420);
export const HOOK_ENABLED = /^(1|true|ya|yes)$/i.test(process.env.CLAUDE_HOOK_ENABLED || '');

const STATUSES = ['open', 'in_progress', 'review', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
const CATEGORIES = ['kantor', 'pribadi'];
const PALETTE = ['#2d6cdf', '#2f8f6d', '#e0952f', '#6a5ad8', '#d45a72', '#2f8f9d', '#a8641a', '#5b6276'];

export class BoardError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const dayKey = (ms) => new Date(ms + TZ_MIN * 60000).toISOString().slice(0, 10);
const people = (role) => TEAM.filter((e) => e.role === role);
const person = (id) => TEAM.find((e) => e.id === id);
const nameOf = (id) => (id === 'anda' ? 'Anda' : (person(id) || {}).name || 'Seseorang');
const manager = () => people('manager')[0] || TEAM[0];
const coordinator = () => people('coordinator')[0] || manager();

function feed(b, at, actor, text, taskId = null, type = 'info') {
  b.feed.unshift({ id: uid('f'), at, actor, text, taskId, type });
  if (b.feed.length > MAX_FEED) b.feed.length = MAX_FEED;
}
function history(t, entry) {
  t.history = t.history || [];
  t.history.push(entry);
  if (t.history.length > MAX_HISTORY) t.history.splice(0, t.history.length - MAX_HISTORY);
}

/* ---------- penyimpanan ---------- */

async function createInitial() {
  const now = Date.now();
  const foundedAt = Number(await get('stats:foundedAt')) || now;
  const b = {
    foundedAt,
    projects: [
      { id: 'p_kantor', name: 'Operasional Kantor', category: 'kantor', color: '#2d6cdf', createdAt: now },
      { id: 'p_pribadi', name: 'Project Pribadi', category: 'pribadi', color: '#2f8f6d', createdAt: now },
    ],
    tasks: [],
    feed: [],
    stats: { totalDone: 0, doneByDay: {} },
    lastAssigned: {},
    hookSessions: {},
  };
  // Migrasi: 30 tugas lama dari versi sebelumnya menjadi task Done di project "Arsip".
  const ids = await range('tasks', 0, 29);
  const olds = ids.length ? (await getMany(ids.map((id) => 'task:' + id))).filter(Boolean) : [];
  if (olds.length) {
    b.projects.push({ id: 'p_arsip', name: 'Arsip', category: 'kantor', color: '#8a90a0', createdAt: now });
    const eng = people('engineer')[0] || manager();
    for (const o of olds.reverse()) {
      const at = o.updatedAt || o.createdAt || now;
      const first = String(o.prompt || '').split('\n')[0];
      b.tasks.push({
        id: 't_old_' + o.id, projectId: 'p_arsip', title: clip(first, 120) || 'Tugas lama',
        description: clip(o.prompt, 2000) + (o.result ? '\n\nHasil:\n' + clip(o.result, 4000) : ''),
        priority: 'medium', status: 'done', assigneeId: eng.id, deadline: null, labels: [],
        createdAt: o.createdAt || at, updatedAt: at, doneAt: at,
        history: [{ at, status: 'done', by: 'sistem', note: 'Dipindahkan dari arsip versi lama' }],
      });
    }
  }
  b.stats.totalDone = Number(await get('stats:totalDone')) || b.tasks.length;
  feed(b, now, 'sistem', olds.length
    ? `Kantor siap. ${olds.length} tugas lama dipindahkan ke project Arsip.`
    : 'Kantor siap. Buat task pertama dari dashboard.');
  return b;
}

async function load() {
  let b = await get(DATA_KEY);
  if (!b) {
    b = await createInitial();
    await save(b);
  }
  b.hookSessions ||= {};
  b.lastAssigned ||= {};
  return b;
}

async function save(b) {
  // buang task selesai paling lama bila terlalu banyak
  if (b.tasks.length > MAX_TASKS) {
    const done = b.tasks.filter((t) => t.status === 'done').sort((x, y) => (x.doneAt || 0) - (y.doneAt || 0));
    const drop = new Set(done.slice(0, b.tasks.length - MAX_TASKS).map((t) => t.id));
    b.tasks = b.tasks.filter((t) => !drop.has(t.id));
  }
  const keys = Object.keys(b.stats.doneByDay).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete b.stats.doneByDay[k];
  const pending = b.tasks.filter((t) => t.status === 'review' && t.reviewUntil).map((t) => t.reviewUntil);
  await set(DATA_KEY, b);
  await set(SETTLE_KEY, pending.length ? Math.min(...pending) : 0);
  return await incr(VER_KEY);
}

/* ---------- aturan kerja ---------- */

function isDesign(t) {
  if ((t.labels || []).includes('desain')) return true;
  const text = (t.title + ' ' + (t.description || '')).toLowerCase();
  return DESIGN_KEYWORDS.some((k) => new RegExp('(^|[^a-z])' + k + '([^a-z]|$)').test(text));
}

function leastBusy(b, candidates) {
  const load = (id) => b.tasks.filter((t) => t.assigneeId === id && (t.status === 'in_progress' || t.status === 'review')).length;
  const pick = [...candidates].sort((x, y) => load(x.id) - load(y.id) || (b.lastAssigned[x.id] || 0) - (b.lastAssigned[y.id] || 0))[0];
  b.lastAssigned[pick.id] = Date.now();
  return pick.id;
}

function autoAssign(b, t) {
  const designers = people('designer');
  if (isDesign(t) && designers.length) return leastBusy(b, designers);
  const engineers = people('engineer');
  if (engineers.length) return leastBusy(b, engineers);
  return (designers[0] || coordinator()).id;
}

function settle(b, now) {
  let changed = false;
  for (const t of b.tasks) {
    if (t.status === 'review' && t.reviewUntil && now >= t.reviewUntil) {
      const at = t.reviewUntil;
      t.status = 'done'; t.doneAt = at; t.updatedAt = at; t.reviewUntil = null; t.reviewStartedAt = null; t.awaitingApproval = false;
      history(t, { at, status: 'done', by: manager().id, note: 'Disetujui Manager' });
      b.stats.totalDone++;
      const k = dayKey(at);
      b.stats.doneByDay[k] = (b.stats.doneByDay[k] || 0) + 1;
      feed(b, at, manager().id, `${manager().name} menyetujui “${t.title}”. Task selesai.`, t.id, 'done');
      changed = true;
    }
  }
  return changed;
}

function startPresentation(b, t, now, by) {
  if (!t.assigneeId) t.assigneeId = autoAssign(b, t);
  t.status = 'review'; t.reviewStartedAt = now; t.reviewUntil = now + REVIEW_MS; t.awaitingApproval = false; t.updatedAt = now;
  history(t, { at: now, status: 'review', by });
  feed(b, now, t.assigneeId, `${nameOf(t.assigneeId)} mempresentasikan “${t.title}” ke ${manager().name}.`, t.id, 'review');
}

function cleanTaskInput(b, data, existing) {
  const out = {};
  if ('title' in data) { out.title = clip(data.title, 160); if (!out.title) throw new BoardError(400, 'Judul task wajib diisi.'); }
  if ('description' in data) out.description = clip(data.description, 4000);
  if ('priority' in data) out.priority = PRIORITIES.includes(data.priority) ? data.priority : 'medium';
  if ('projectId' in data) {
    if (!b.projects.some((p) => p.id === data.projectId)) throw new BoardError(400, 'Project tidak ditemukan.');
    out.projectId = data.projectId;
  }
  if ('assigneeId' in data) {
    if (data.assigneeId && !person(data.assigneeId)) throw new BoardError(400, 'Karyawan tidak ditemukan.');
    out.assigneeId = data.assigneeId || null;
  }
  if ('deadline' in data) out.deadline = data.deadline && /^\d{4}-\d{2}-\d{2}/.test(data.deadline) ? String(data.deadline).slice(0, 10) : null;
  if ('labels' in data) out.labels = Array.isArray(data.labels) ? data.labels.map((l) => clip(l, 24).toLowerCase()).filter(Boolean).slice(0, 6) : [];
  return out;
}

/* ---------- operasi publik ---------- */

const publicTeam = () => TEAM.map(({ id, name, role, title, look, habits }) => ({ id, name, role, title, look, habits: habits || [] }));

export async function readState(since) {
  const now = Date.now();
  const [v, nextSettle] = await getMany([VER_KEY, SETTLE_KEY]);
  let version = Number(v || 0);
  const due = Number(nextSettle || 0) && now >= Number(nextSettle);
  if (version > 0 && since === version && !due) {
    return { version, changed: false, serverNow: now };
  }
  const b = await load();
  if (settle(b, now)) version = await save(b);
  else if (!version) version = Number((await get(VER_KEY)) || 0);
  if (since === version) return { version, changed: false, serverNow: now };
  const today = dayKey(now);
  return {
    version, changed: true, serverNow: now,
    foundedAt: b.foundedAt,
    workHours: WORK_HOURS,
    reviewMs: REVIEW_MS,
    hookEnabled: HOOK_ENABLED,
    team: publicTeam(),
    projects: b.projects,
    tasks: b.tasks,
    feed: b.feed.slice(0, 60),
    stats: {
      open: b.tasks.filter((t) => t.status === 'open').length,
      inProgress: b.tasks.filter((t) => t.status === 'in_progress' || t.status === 'review').length,
      doneToday: b.stats.doneByDay[today] || 0,
      totalDone: b.stats.totalDone,
    },
  };
}

export async function createProject(data) {
  const now = Date.now();
  const b = await load();
  const name = clip(data.name, 60);
  if (!name) throw new BoardError(400, 'Nama project wajib diisi.');
  const p = {
    id: uid('p'), name,
    category: CATEGORIES.includes(data.category) ? data.category : 'kantor',
    color: /^#[0-9a-f]{6}$/i.test(data.color || '') ? data.color : PALETTE[b.projects.length % PALETTE.length],
    createdAt: now,
  };
  b.projects.push(p);
  feed(b, now, 'anda', `Project baru “${p.name}” (${p.category}) dibuat.`, null, 'project');
  const version = await save(b);
  return { project: p, version };
}

export async function deleteProject(id) {
  const now = Date.now();
  const b = await load();
  const p = b.projects.find((x) => x.id === id);
  if (!p) throw new BoardError(404, 'Project tidak ditemukan.');
  const n = b.tasks.filter((t) => t.projectId === id).length;
  b.projects = b.projects.filter((x) => x.id !== id);
  b.tasks = b.tasks.filter((t) => t.projectId !== id);
  feed(b, now, 'anda', `Project “${p.name}” dihapus beserta ${n} task.`, null, 'project');
  return { ok: true, version: await save(b) };
}

export async function createTask(data, by = 'anda') {
  const now = Date.now();
  const b = await load();
  settle(b, now);
  const input = cleanTaskInput(b, { title: data.title, ...data }, null);
  const t = {
    id: uid('t'),
    projectId: input.projectId || b.projects[0]?.id || null,
    title: input.title,
    description: input.description || '',
    priority: input.priority || 'medium',
    status: 'open',
    assigneeId: input.assigneeId || null,
    deadline: input.deadline || null,
    labels: input.labels || [],
    createdAt: now, updatedAt: now,
    history: [{ at: now, status: 'open', by: coordinator().id, note: by === 'hook' ? 'Dari Claude Code' : 'Ditulis ke papan' }],
  };
  b.tasks.push(t);
  const proj = b.projects.find((p) => p.id === t.projectId);
  feed(b, now, coordinator().id, `${coordinator().name} menulis task “${t.title}” di papan${proj ? ' (' + proj.name + ')' : ''}.`, t.id, 'open');
  const version = await save(b);
  return { task: t, version };
}

export async function updateTask(id, data, by = 'anda') {
  const now = Date.now();
  const b = await load();
  settle(b, now);
  const t = b.tasks.find((x) => x.id === id);
  if (!t) throw new BoardError(404, 'Task tidak ditemukan.');
  const input = cleanTaskInput(b, data, t);
  const before = t.assigneeId;
  Object.assign(t, input);
  t.updatedAt = now;
  if (input.assigneeId !== undefined && input.assigneeId !== before && input.assigneeId && t.status !== 'open') {
    feed(b, now, input.assigneeId, `${nameOf(input.assigneeId)} sekarang memegang “${t.title}”.`, t.id, 'assign');
  }

  if (data.status && STATUSES.includes(data.status)) {
    // "done" dari dashboard selalu lewat presentasi ke Manager dulu (status review)
    const target = data.status === 'done' || data.status === 'review' ? 'review' : data.status;
    if (target === 'review') {
      if (t.status !== 'done' && !(t.status === 'review' && t.reviewUntil)) {
        if (data.status === 'review' && by === 'hook') {
          if (!t.assigneeId) t.assigneeId = autoAssign(b, t);
          t.status = 'review'; t.awaitingApproval = true; t.reviewUntil = null;
          history(t, { at: now, status: 'review', by: t.assigneeId, note: 'Menunggu persetujuan Anda' });
          feed(b, now, t.assigneeId, `${nameOf(t.assigneeId)} selesai mengerjakan “${t.title}” dan menunggu persetujuan Anda.`, t.id, 'waiting');
        } else {
          startPresentation(b, t, now, by);
        }
      }
    } else if (target !== t.status) {
      const from = t.status;
      t.status = target; t.reviewUntil = null; t.awaitingApproval = false;
      if (target === 'in_progress') {
        if (!t.assigneeId) t.assigneeId = autoAssign(b, t);
        t.startedAt = now;
        history(t, { at: now, status: target, by: t.assigneeId });
        feed(b, now, t.assigneeId, `${nameOf(t.assigneeId)} mengambil “${t.title}” dari papan.`, t.id, 'start');
      } else if (target === 'open') {
        history(t, { at: now, status: target, by });
        feed(b, now, coordinator().id, `“${t.title}” dikembalikan ke Open${from === 'done' ? ' (dibuka lagi)' : ''}.`, t.id, 'reopen');
      }
    }
  }
  const version = await save(b);
  return { task: t, version };
}

export async function deleteTask(id) {
  const now = Date.now();
  const b = await load();
  const t = b.tasks.find((x) => x.id === id);
  if (!t) throw new BoardError(404, 'Task tidak ditemukan.');
  b.tasks = b.tasks.filter((x) => x.id !== id);
  feed(b, now, 'anda', `Task “${t.title}” dihapus.`, null, 'delete');
  return { ok: true, version: await save(b) };
}

/* ---------- hook Claude Code (opsional, CLAUDE_HOOK_ENABLED=1) ---------- */

export async function recordHookEvent(e = {}) {
  if (!HOOK_ENABLED) return { ok: true, ignored: 'Hook Claude Code dimatikan (atur CLAUDE_HOOK_ENABLED=1 untuk menyalakan).' };
  const session = clip(e.session_id || 'default', 80);
  const b = await load();
  let proj = b.projects.find((p) => p.id === 'p_claude');
  if (!proj) {
    proj = { id: 'p_claude', name: 'Claude Code', category: 'pribadi', color: '#6a5ad8', createdAt: Date.now() };
    b.projects.push(proj);
    await save(b);
  }
  const currentId = b.hookSessions[session];
  const current = currentId && b.tasks.find((t) => t.id === currentId && t.status !== 'done');
  if (e.type === 'prompt') {
    const prompt = clip(e.prompt, 2000) || 'Tugas dari Claude Code';
    if (current) {
      return updateTask(current.id, { description: (current.description ? current.description + '\n\n' : '') + '› ' + prompt }, 'hook');
    }
    const res = await createTask({ title: prompt.split('\n')[0].slice(0, 120), description: prompt + (e.project ? `\n\nFolder: ${clip(e.project, 60)}` : ''), projectId: 'p_claude', labels: ['claude-code'] }, 'hook');
    const b2 = await load();
    b2.hookSessions[session] = res.task.id;
    await save(b2);
    return res;
  }
  if (e.type === 'stop' && current) {
    const extra = clip(e.result, 3000);
    return updateTask(current.id, { status: 'review', ...(extra ? { description: (current.description || '') + '\n\nHasil terakhir:\n' + extra } : {}) }, 'hook');
  }
  return { ok: true, ignored: 'Tidak ada task aktif untuk sesi ini.' };
}
