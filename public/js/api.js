// Klien API: polling /api/state, menyimpan kunci, dan mengirim perubahan.
// Modul lain berlangganan lewat api.on('state', (next, prev) => ...).

const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

const listeners = { state: new Set(), status: new Set(), needKey: new Set() };
const POLL_MS = 4000;

export const api = {
  state: null,
  version: -1,
  serverOffset: 0,       // serverNow - Date.now()
  connection: 'menghubungkan',
  readKey: LS.get('kantorAI.readKey') || '',
  writeKey: LS.get('kantorAI.writeKey') || '',
  canWrite: false,

  on(evt, fn) { listeners[evt].add(fn); return () => listeners[evt].delete(fn); },
  now() { return Date.now() + this.serverOffset; },

  setKeys({ readKey, writeKey }) {
    if (readKey !== undefined) { this.readKey = readKey; LS.set('kantorAI.readKey', readKey || null); }
    if (writeKey !== undefined) { this.writeKey = writeKey; LS.set('kantorAI.writeKey', writeKey || null); }
    this.version = -1;
    return this.refresh();
  },

  headers(extra = {}) {
    const h = { ...extra };
    if (this.readKey) h['x-office-key'] = this.readKey;
    if (this.writeKey) h['x-office-write'] = this.writeKey;
    return h;
  },

  async refresh() {
    clearTimeout(timer);
    try {
      const r = await fetch('/api/state?since=' + this.version, { headers: this.headers(), cache: 'no-store' });
      if (r.status === 401) { setStatus('butuh kunci'); emit('needKey', 'read'); return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      this.serverOffset = data.serverNow - Date.now();
      this.canWrite = !!data.canWrite;
      setStatus(data.backend === 'memory' ? 'tanpa penyimpanan' : data.backend === 'redis' ? 'terhubung' : 'lokal');
      fails = 0;
      if (data.changed !== false) {
        const prev = this.state;
        this.state = data;
        this.version = data.version;
        emit('state', data, prev);
      } else if (this.state && this.state.canWrite !== data.canWrite) {
        this.state.canWrite = data.canWrite; emit('state', this.state, this.state);
      }
    } catch (e) {
      fails++; setStatus('terputus');
    } finally {
      schedule();
    }
  },

  // Perubahan lokal langsung tampil (optimistis); server tetap jadi sumber kebenaran.
  patchLocal(fn) {
    if (!this.state) return;
    const prev = this.state;
    const next = structuredClone(prev);
    fn(next);
    this.state = next;
    emit('state', next, prev);
  },

  async write(method, path, payload) {
    if (!this.writeKey) { emit('needKey', 'write'); throw new Error('Isi kunci tulis dulu untuk menyimpan perubahan.'); }
    const r = await fetch(path, {
      method,
      headers: this.headers({ 'content-type': 'application/json' }),
      body: payload ? JSON.stringify(payload) : undefined,
    });
    let data = {};
    try { data = await r.json(); } catch {}
    if (r.status === 401) { this.canWrite = false; emit('needKey', 'write'); }
    if (!r.ok) { this.refresh(); throw new Error(data.error || 'Gagal menyimpan (HTTP ' + r.status + ').'); }
    this.refresh();
    return data;
  },

  createTask(t) { return this.write('POST', '/api/tasks', t); },
  updateTask(id, patch) { return this.write('PATCH', '/api/tasks?id=' + encodeURIComponent(id), patch); },
  deleteTask(id) { return this.write('DELETE', '/api/tasks?id=' + encodeURIComponent(id)); },
  createProject(p) { return this.write('POST', '/api/projects', p); },
  deleteProject(id) { return this.write('DELETE', '/api/projects?id=' + encodeURIComponent(id)); },
};

let timer = null, fails = 0;
function emit(evt, ...args) { for (const fn of listeners[evt]) { try { fn(...args); } catch (e) { console.error(e); } } }
function setStatus(s) { if (api.connection !== s) { api.connection = s; emit('status', s); } }
function schedule() {
  clearTimeout(timer);
  if (document.visibilityState === 'hidden') return;           // berhenti saat tab disembunyikan
  timer = setTimeout(() => api.refresh(), fails ? Math.min(30000, POLL_MS * fails) : POLL_MS);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') api.refresh(); });

// ?key=... di alamat: simpan sebagai kunci baca lalu bersihkan alamatnya
const params = new URLSearchParams(location.search);
if (params.get('key')) { api.readKey = params.get('key'); LS.set('kantorAI.readKey', api.readKey); history.replaceState(null, '', location.pathname); }

export { LS };
