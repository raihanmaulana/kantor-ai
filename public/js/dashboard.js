// Dashboard task: statistik, filter, Kanban (drag & drop + tombol), form, feed, profil karyawan.
import { api, LS } from './api.js';

const $ = (s, r = document) => r.querySelector(s);
const PRIO = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi' };
const COLS = [
  { key: 'open', title: 'Open', statuses: ['open'], drop: 'open' },
  { key: 'progress', title: 'On Progress', statuses: ['in_progress', 'review'], drop: 'in_progress' },
  { key: 'done', title: 'Done', statuses: ['done'], drop: 'done' },
];

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const fmtTime = (ms) => new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
function ago(ms) {
  const s = Math.max(0, (api.now() - ms) / 1000);
  if (s < 50) return 'baru saja';
  if (s < 3600) return Math.round(s / 60) + ' mnt lalu';
  if (s < 86400) return Math.round(s / 3600) + ' jam lalu';
  return new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
function dueLabel(d) {
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(d + 'T00:00:00');
  const diff = Math.round((due - today) / 86400000);
  const text = diff === 0 ? 'Hari ini' : diff === 1 ? 'Besok' : diff === -1 ? 'Kemarin' : due.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  return { text, late: diff < 0, soon: diff >= 0 && diff <= 1 };
}

let opts = {};
let filters = { cat: LS.get('kantorAI.f.cat') || 'semua', project: LS.get('kantorAI.f.project') || '', person: LS.get('kantorAI.f.person') || '' };
let showAllDone = false;
let selectedTask = null;

export function initDashboard(options = {}) {
  opts = options;
  // filter kategori
  document.querySelectorAll('#f-cat button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.v === filters.cat);
    b.addEventListener('click', () => { filters.cat = b.dataset.v; LS.set('kantorAI.f.cat', filters.cat); document.querySelectorAll('#f-cat button').forEach((x) => x.setAttribute('aria-pressed', x === b)); render(); });
  });
  $('#f-project').addEventListener('change', (e) => { filters.project = e.target.value; LS.set('kantorAI.f.project', filters.project); render(); });
  $('#f-person').addEventListener('change', (e) => { filters.person = e.target.value; LS.set('kantorAI.f.person', filters.person); render(); });
  $('#btn-task').addEventListener('click', () => openTaskDialog());
  $('#btn-project').addEventListener('click', () => openProjectDialog());
  $('#btn-keys').addEventListener('click', () => openKeyDialog());
  $('#readonly-keys').addEventListener('click', () => openKeyDialog());

  setupTaskDialog();
  setupProjectDialog();
  setupKeyDialog();

  api.on('state', () => render());
  api.on('status', (s) => { const c = $('#conn'); c.textContent = s; c.dataset.s = s; });
  api.on('needKey', (kind) => { if (kind === 'read' || !$('#dlg-keys').open) openKeyDialog(kind); });
  setInterval(() => { if (api.state) renderFeed(); }, 30000);
}

/* ---------- render ---------- */

function visibleTasks(s) {
  const proj = new Map(s.projects.map((p) => [p.id, p]));
  return s.tasks.filter((t) => {
    const p = proj.get(t.projectId);
    if (filters.cat !== 'semua' && (!p || p.category !== filters.cat)) return false;
    if (filters.project && t.projectId !== filters.project) return false;
    if (filters.person && t.assigneeId !== filters.person) return false;
    return true;
  });
}

export function render() {
  const s = api.state;
  if (!s) return;
  $('#readonly').hidden = !!s.canWrite;
  // statistik
  $('#st-open').textContent = s.stats.open;
  $('#st-progress').textContent = s.stats.inProgress;
  $('#st-today').textContent = s.stats.doneToday;
  $('#st-total').textContent = s.stats.totalDone;
  // pilihan filter
  fillSelect($('#f-project'), [['', 'Semua project'], ...s.projects.filter((p) => filters.cat === 'semua' || p.category === filters.cat).map((p) => [p.id, p.name])], filters.project);
  fillSelect($('#f-person'), [['', 'Semua karyawan'], ...s.team.map((e) => [e.id, `${e.name} · ${e.title}`])], filters.person);
  if (filters.project && !s.projects.some((p) => p.id === filters.project)) filters.project = '';
  renderBoard(s);
  renderFeed();
}

function fillSelect(sel, options, value) {
  const sig = JSON.stringify(options);
  if (sel.dataset.sig !== sig) {
    sel.replaceChildren(...options.map(([v, t]) => el('option', { value: v, text: t })));
    sel.dataset.sig = sig;
  }
  sel.value = options.some(([v]) => v === value) ? value : '';
}

function renderBoard(s) {
  const tasks = visibleTasks(s);
  const proj = new Map(s.projects.map((p) => [p.id, p]));
  const team = new Map(s.team.map((e) => [e.id, e]));
  for (const col of COLS) {
    const list = $(`#col-${col.key} .list`);
    let items = tasks.filter((t) => col.statuses.includes(t.status));
    const prioRank = { high: 0, medium: 1, low: 2 };
    if (col.key === 'done') items.sort((a, b) => (b.doneAt || b.updatedAt) - (a.doneAt || a.updatedAt));
    else if (col.key === 'progress') items.sort((a, b) => (a.status === 'review' ? -1 : 0) - (b.status === 'review' ? -1 : 0) || prioRank[a.priority] - prioRank[b.priority] || a.createdAt - b.createdAt);
    else items.sort((a, b) => prioRank[a.priority] - prioRank[b.priority] || a.createdAt - b.createdAt);
    $(`#col-${col.key} .count`).textContent = items.length;
    const limit = col.key === 'done' && !showAllDone ? 12 : Infinity;
    const shown = items.slice(0, limit);
    list.replaceChildren(
      ...shown.map((t) => card(t, proj.get(t.projectId), team.get(t.assigneeId), s)),
      ...(items.length === 0 ? [el('li', { class: 'empty' }, col.key === 'open' ? 'Belum ada task. Klik “Task baru”.' : col.key === 'progress' ? 'Tarik task ke sini untuk mulai dikerjakan.' : 'Task yang disetujui Manager muncul di sini.')] : []),
      ...(items.length > limit ? [el('li', {}, el('button', { class: 'more', onclick: () => { showAllDone = true; render(); } }, `Tampilkan semua (${items.length})`))] : []),
    );
  }
}

function card(t, p, who, s) {
  const due = t.status !== 'done' ? dueLabel(t.deadline) : null;
  const reviewing = t.status === 'review' && t.reviewUntil;
  const waiting = t.status === 'review' && !t.reviewUntil;
  const moves = [];
  const can = !!s.canWrite;
  if (t.status === 'open') moves.push(['in_progress', 'Kerjakan →', 'Pindahkan ke On Progress']);
  if (t.status === 'in_progress') { moves.push(['open', '← Open', 'Kembalikan ke Open']); moves.push(['done', 'Selesai →', 'Presentasikan ke Manager lalu selesai']); }
  if (waiting) moves.push(['done', 'Setujui →', 'Setujui dan selesaikan']);
  if (t.status === 'done') moves.push(['open', '↺ Buka lagi', 'Kembalikan ke Open']);
  const c = el('li', { class: 'card' + (selectedTask === t.id ? ' sel' : '') + (t.priority === 'high' ? ' hi' : ''), draggable: can && !reviewing ? 'true' : null, 'data-id': t.id, tabindex: '0', 'aria-label': t.title },
    el('div', { class: 'c-top' },
      el('span', { class: 'dot', style: `--pc:${p ? p.color : '#8a90a0'}` }),
      el('span', { class: 'proj', text: p ? p.name : 'Tanpa project' }),
      el('span', { class: 'prio ' + t.priority, text: PRIO[t.priority] }),
    ),
    el('h4', { text: t.title }),
    reviewing ? el('div', { class: 'badge review' }, el('i'), 'Presenting to Manager') : null,
    waiting ? el('div', { class: 'badge waiting' }, 'Menunggu persetujuan Anda') : null,
    el('div', { class: 'c-meta' },
      who ? el('span', { class: 'who' }, el('span', { class: 'av', style: `--c:${who.look.shirt}`, text: initials(who.name) }), who.name)
          : el('span', { class: 'who muted', text: t.status === 'open' ? 'Belum ditugaskan' : 'Menunggu penugasan' }),
      due ? el('span', { class: 'due' + (due.late ? ' late' : due.soon ? ' soon' : ''), text: due.text }) : null,
      (t.labels || []).includes('desain') ? el('span', { class: 'lbl', text: 'desain' }) : null,
    ),
    el('div', { class: 'c-act' },
      ...moves.map(([st, label, title]) => el('button', { type: 'button', title, disabled: !can, onclick: (e) => { e.stopPropagation(); moveTask(t.id, st); } }, label)),
      el('button', { type: 'button', class: 'edit', title: 'Lihat detail dan ubah', onclick: (e) => { e.stopPropagation(); openTaskDialog(t.id); } }, 'Detail'),
    ),
  );
  c.addEventListener('click', () => focusTask(t));
  c.addEventListener('keydown', (e) => { if (e.key === 'Enter') openTaskDialog(t.id); });
  c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); });
  c.addEventListener('dragend', () => c.classList.remove('dragging'));
  return c;
}

function focusTask(t) {
  selectedTask = t.id;
  document.querySelectorAll('.card.sel').forEach((n) => n.classList.remove('sel'));
  const n = document.querySelector(`.card[data-id="${t.id}"]`); if (n) n.classList.add('sel');
  if (opts.onFocusEmployee) opts.onFocusEmployee(t.assigneeId || (t.status === 'open' ? (api.state.team.find((e) => e.role === 'coordinator') || {}).id : null));
}

// drag & drop antar kolom
export function setupDropZones() {
  for (const col of COLS) {
    const zone = $(`#col-${col.key}`);
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('over'); });
    zone.addEventListener('drop', (e) => {
      e.preventDefault(); zone.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      const t = api.state && api.state.tasks.find((x) => x.id === id);
      if (!t || col.statuses.includes(t.status)) return;
      moveTask(id, col.drop);
    });
  }
}

export async function moveTask(id, status) {
  const s = api.state;
  const t = s && s.tasks.find((x) => x.id === id);
  if (!t) return;
  api.patchLocal((n) => {
    const x = n.tasks.find((y) => y.id === id);
    if (status === 'done') { x.status = 'review'; x.reviewStartedAt = api.now(); x.reviewUntil = api.now() + (n.reviewMs || 7000); x.awaitingApproval = false; }
    else x.status = status;
  });
  try { await api.updateTask(id, { status }); }
  catch (e) { toast(e.message, true); }
}

function renderFeed() {
  const s = api.state; if (!s) return;
  const team = new Map(s.team.map((e) => [e.id, e]));
  $('#feed').replaceChildren(...(s.feed.length ? s.feed.slice(0, 40).map((f) => {
    const who = team.get(f.actor);
    return el('li', { class: 'f-' + f.type },
      el('span', { class: 'f-dot', style: `--c:${who ? who.look.shirt : 'var(--muted)'}` }),
      el('span', { class: 'f-text', text: f.text }),
      el('time', { datetime: new Date(f.at).toISOString(), title: new Date(f.at).toLocaleString('id-ID'), text: ago(f.at) }),
    );
  }) : [el('li', { class: 'empty', text: 'Belum ada aktivitas.' })]));
}

/* ---------- dialog task ---------- */

function setupTaskDialog() {
  const d = $('#dlg-task'), f = $('#task-form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.submitter && e.submitter.value === 'cancel') { d.close(); return; }
    const data = {
      title: $('#t-title').value.trim(),
      projectId: $('#t-project').value,
      description: $('#t-desc').value.trim(),
      priority: $('#t-prio').value,
      assigneeId: $('#t-assignee').value || null,
      deadline: $('#t-deadline').value || null,
      labels: $('#t-design').checked ? ['desain'] : [],
    };
    if (!data.title) { $('#t-err').textContent = 'Judul task wajib diisi.'; $('#t-title').focus(); return; }
    const id = f.dataset.id;
    const btn = $('#t-save'); btn.disabled = true;
    try {
      if (id) {
        const old = api.state.tasks.find((t) => t.id === id);
        if (old && (old.labels || []).filter((l) => l !== 'desain').length) data.labels = [...old.labels.filter((l) => l !== 'desain'), ...data.labels];
        await api.updateTask(id, data); toast('Perubahan disimpan.');
      } else { await api.createTask(data); toast('Task dibuat. Kartika menulisnya ke papan.'); }
      d.close();
    } catch (err) { $('#t-err').textContent = err.message; }
    finally { btn.disabled = false; }
  });
  $('#t-delete').addEventListener('click', () => { $('#t-confirm').hidden = false; $('#t-delete').hidden = true; });
  $('#t-confirm-no').addEventListener('click', () => { $('#t-confirm').hidden = true; $('#t-delete').hidden = false; });
  $('#t-confirm-yes').addEventListener('click', async () => {
    try { await api.deleteTask(f.dataset.id); toast('Task dihapus.'); d.close(); }
    catch (err) { $('#t-err').textContent = err.message; }
  });
}

function openTaskDialog(id) {
  const s = api.state; if (!s) return;
  const d = $('#dlg-task'), f = $('#task-form');
  const t = id ? s.tasks.find((x) => x.id === id) : null;
  f.dataset.id = t ? t.id : '';
  $('#t-heading').textContent = t ? 'Detail task' : 'Task baru';
  $('#t-err').textContent = '';
  fillSelect($('#t-project'), s.projects.map((p) => [p.id, `${p.name} (${p.category})`]), t ? t.projectId : (filters.project || s.projects.find((p) => filters.cat === 'semua' || p.category === filters.cat)?.id || s.projects[0]?.id));
  fillSelect($('#t-assignee'), [['', 'Otomatis (dibagi rata)'], ...s.team.filter((e) => e.role === 'engineer' || e.role === 'designer').map((e) => [e.id, `${e.name} · ${e.title}`])], t ? t.assigneeId || '' : '');
  $('#t-title').value = t ? t.title : '';
  $('#t-desc').value = t ? t.description || '' : '';
  $('#t-prio').value = t ? t.priority : 'medium';
  $('#t-deadline').value = t && t.deadline ? t.deadline : '';
  $('#t-design').checked = t ? (t.labels || []).includes('desain') : false;
  $('#t-save').textContent = t ? 'Simpan perubahan' : 'Buat task';
  $('#t-delete').hidden = !t; $('#t-confirm').hidden = true;
  const canW = !!s.canWrite;
  f.querySelectorAll('input,textarea,select').forEach((n) => (n.disabled = !canW));
  $('#t-save').disabled = !canW; $('#t-delete').disabled = !canW;
  $('#t-ro').hidden = canW;
  const hist = $('#t-history');
  hist.hidden = !t;
  if (t) {
    const team = new Map(s.team.map((e) => [e.id, e]));
    const label = { open: 'Open', in_progress: 'On Progress', review: 'Presentasi ke Manager', done: 'Done' };
    $('#t-history ol').replaceChildren(...[...(t.history || [])].reverse().map((h) => el('li', {},
      el('b', { text: label[h.status] || h.status }), ' · ',
      (team.get(h.by) || {}).name || (h.by === 'anda' ? 'Anda' : h.by), h.note ? ' · ' + h.note : '',
      el('time', { text: new Date(h.at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }),
    )));
  }
  d.showModal();
  if (!t) setTimeout(() => $('#t-title').focus(), 30);
}

/* ---------- dialog project ---------- */

const SWATCHES = ['#2d6cdf', '#2f8f6d', '#e0952f', '#6a5ad8', '#d45a72', '#2f8f9d', '#a8641a', '#5b6276'];
function setupProjectDialog() {
  const d = $('#dlg-project'), f = $('#project-form');
  $('#p-colors').replaceChildren(...SWATCHES.map((c, i) => el('label', { class: 'sw', style: `--c:${c}`, title: c },
    el('input', { type: 'radio', name: 'p-color', value: c, checked: i === 0 }), el('span'))));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.submitter && e.submitter.value === 'cancel') { d.close(); return; }
    const name = $('#p-name').value.trim();
    if (!name) { $('#p-err').textContent = 'Nama project wajib diisi.'; return; }
    try {
      await api.createProject({ name, category: f.querySelector('input[name=p-cat]:checked').value, color: f.querySelector('input[name=p-color]:checked').value });
      toast(`Project “${name}” dibuat.`); $('#p-name').value = ''; d.close();
    } catch (err) { $('#p-err').textContent = err.message; }
  });
}
function openProjectDialog() {
  const s = api.state; if (!s) return;
  $('#p-err').textContent = '';
  const canW = !!s.canWrite;
  $('#project-form').querySelectorAll('input,button[type=submit]:not([value=cancel])').forEach((n) => (n.disabled = !canW));
  const counts = {}; s.tasks.forEach((t) => { counts[t.projectId] = (counts[t.projectId] || 0) + 1; });
  $('#p-list').replaceChildren(...s.projects.map((p) => {
    const li = el('li', {},
      el('span', { class: 'dot', style: `--pc:${p.color}` }),
      el('span', { class: 'pn', text: p.name }),
      el('span', { class: 'pc', text: `${p.category} · ${counts[p.id] || 0} task` }));
    const del = el('button', { type: 'button', class: 'link', disabled: !canW, text: 'Hapus' });
    del.addEventListener('click', () => {
      del.replaceWith(el('span', { class: 'confirm' }, `Hapus beserta ${counts[p.id] || 0} task? `,
        el('button', { type: 'button', class: 'danger', onclick: async () => { try { await api.deleteProject(p.id); toast(`Project “${p.name}” dihapus.`); openProjectDialog(); } catch (err) { $('#p-err').textContent = err.message; } } }, 'Ya, hapus'),
        el('button', { type: 'button', onclick: () => openProjectDialog() }, 'Batal')));
    });
    li.append(del);
    return li;
  }));
  if (!$('#dlg-project').open) $('#dlg-project').showModal();
}

/* ---------- dialog kunci ---------- */

function setupKeyDialog() {
  const d = $('#dlg-keys'), f = $('#key-form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.submitter && e.submitter.value === 'cancel') { d.close(); return; }
    $('#k-msg').textContent = 'Memeriksa…'; $('#k-msg').className = 'note';
    await api.setKeys({ readKey: $('#k-read').value.trim(), writeKey: $('#k-write').value.trim() });
    if (api.connection === 'butuh kunci') { $('#k-msg').textContent = 'Kunci baca salah. Periksa OFFICE_READ_KEY.'; $('#k-msg').className = 'note err'; return; }
    if ($('#k-write').value.trim() && !api.canWrite) { $('#k-msg').textContent = 'Kunci tulis salah. Dashboard tetap bisa dilihat, tapi belum bisa mengubah task.'; $('#k-msg').className = 'note err'; return; }
    toast(api.canWrite ? 'Kunci tersimpan. Anda bisa mengelola task.' : 'Kunci baca tersimpan (mode lihat saja).');
    d.close();
  });
}
function openKeyDialog(kind) {
  $('#k-read').value = api.readKey; $('#k-write').value = api.writeKey;
  $('#k-msg').className = 'note' + (kind ? ' err' : '');
  $('#k-msg').textContent = kind === 'read' ? 'Halaman ini dikunci. Masukkan kunci baca (OFFICE_READ_KEY).' : kind === 'write' ? 'Untuk mengubah task, masukkan kunci tulis (OFFICE_WRITE_KEY).' : 'Kunci disimpan di browser ini saja.';
  if (!$('#dlg-keys').open) $('#dlg-keys').showModal();
}

/* ---------- profil karyawan (dipanggil dari kantor 3D) ---------- */

export function showProfile(id, activityText) {
  const s = api.state; const box = $('#profile');
  if (!s || !id) { box.hidden = true; return; }
  const e = s.team.find((x) => x.id === id); if (!e) { box.hidden = true; return; }
  const mine = s.tasks.filter((t) => t.assigneeId === id && (t.status === 'in_progress' || t.status === 'review'));
  const doneToday = s.tasks.filter((t) => t.assigneeId === id && t.status === 'done' && t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString()).length;
  box.replaceChildren(
    el('div', { class: 'pf-head' },
      el('span', { class: 'av big', style: `--c:${e.look.shirt}`, text: initials(e.name) }),
      el('div', {}, el('strong', { text: e.name }), el('small', { text: e.title })),
      el('button', { class: 'x', 'aria-label': 'Tutup profil', onclick: () => { box.hidden = true; if (opts.onCloseProfile) opts.onCloseProfile(); } }, '×')),
    el('p', { class: 'pf-act', text: activityText || '' }),
    el('div', { class: 'pf-sub', text: e.role === 'manager' ? 'Menyetujui presentasi task yang selesai.' : e.role === 'coordinator' ? 'Menulis setiap task baru ke papan.' : mine.length ? `Memegang ${mine.length} task` : 'Sedang tidak memegang task.' }),
    mine.length ? el('ul', { class: 'pf-tasks' }, ...mine.map((t) => el('li', {}, el('button', { class: 'link', onclick: () => openTaskDialog(t.id), text: t.title }), t.status === 'review' ? el('span', { class: 'badge review mini' }, 'Presentasi') : null))) : null,
    el('div', { class: 'pf-foot', text: `Selesai hari ini: ${doneToday}` }),
  );
  box.hidden = false;
}

/* ---------- toast ---------- */
let toastTimer;
export function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = 'toast'), 3200);
}
