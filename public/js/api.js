// Klien API: polling /api/state (tim + snapshot keuangan Arus) dan menyimpan kunci baca.
// Modul lain berlangganan lewat api.on('state', (next, prev) => ...).

const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

const listeners = { state: new Set(), status: new Set(), needKey: new Set() };
const POLL_MS = 15000;

export const api = {
  state: null,
  serverOffset: 0,
  connection: 'menghubungkan',
  readKey: LS.get('kantorAI.readKey') || '',

  on(evt, fn) { listeners[evt].add(fn); return () => listeners[evt].delete(fn); },
  now() { return Date.now() + this.serverOffset; },
  setKey(readKey) { this.readKey = readKey || ''; LS.set('kantorAI.readKey', readKey || null); return this.refresh(); },
  headers() { return this.readKey ? { 'x-office-key': this.readKey } : {}; },

  async refresh() {
    clearTimeout(timer);
    try {
      const r = await fetch('/api/state', { headers: this.headers(), cache: 'no-store' });
      if (r.status === 401) { setStatus('butuh kunci'); emit('needKey'); return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      this.serverOffset = data.serverNow - Date.now();
      const f = data.finance || {};
      setStatus(f.enabled ? (f.demo ? 'demo' : 'terhubung') : f.error ? 'gagal' : 'belum diatur');
      fails = 0;
      const prev = this.state;
      this.state = data;
      emit('state', data, prev);
    } catch (e) {
      fails++; setStatus('terputus');
    } finally {
      schedule();
    }
  },
};

let timer = null, fails = 0;
function emit(evt, ...args) { for (const fn of listeners[evt]) { try { fn(...args); } catch (e) { console.error(e); } } }
function setStatus(s) { if (api.connection !== s) { api.connection = s; emit('status', s); } }
function schedule() {
  clearTimeout(timer);
  if (document.visibilityState === 'hidden') return;           // berhenti saat tab disembunyikan
  timer = setTimeout(() => api.refresh(), fails ? Math.min(60000, POLL_MS * fails) : POLL_MS);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') api.refresh(); });

// ?key=... di alamat: simpan sebagai kunci baca lalu bersihkan alamatnya
const params = new URLSearchParams(location.search);
if (params.get('key')) { api.readKey = params.get('key'); LS.set('kantorAI.readKey', api.readKey); history.replaceState(null, '', location.pathname); }

export { LS };
