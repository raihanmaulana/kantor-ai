// Titik masuk halaman: menyambungkan API, dashboard, dan kantor 3D.
import { api, LS } from './api.js';
import { initDashboard, setupDropZones, showProfile, render as renderBoard } from './dashboard.js';

const $ = (s) => document.querySelector(s);
const main = $('#main');

/* ---------- tata letak ---------- */
function setTab(tab) {
  main.dataset.tab = tab;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tab === tab));
  LS.set('kantorAI.tab', tab);
  window.dispatchEvent(new Event('resize'));
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
setTab(LS.get('kantorAI.tab') || 'kantor');

function setBoardHidden(hidden) {
  main.classList.toggle('hide-board', hidden);
  $('#toggle-board').setAttribute('aria-pressed', hidden);
  $('#toggle-board').textContent = hidden ? 'Tampilkan dashboard' : 'Sembunyikan dashboard';
  LS.set('kantorAI.hideBoard', hidden ? '1' : '0');
}
function setBoardWide(wide) {
  main.classList.toggle('wide', wide);
  $('#wide-board').setAttribute('aria-pressed', wide);
  $('#wide-board').textContent = wide ? 'Dashboard normal' : 'Perlebar dashboard';
  LS.set('kantorAI.wideBoard', wide ? '1' : '0');
}
$('#toggle-board').addEventListener('click', () => setBoardHidden(!main.classList.contains('hide-board')));
$('#wide-board').addEventListener('click', () => { setBoardHidden(false); setBoardWide(!main.classList.contains('wide')); });
setBoardHidden(LS.get('kantorAI.hideBoard') === '1');
setBoardWide(LS.get('kantorAI.wideBoard') === '1');

/* ---------- jam & hari ke-N ---------- */
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
let lastDay = null;
function tickClock() {
  const now = Date.now();
  const founded = (api.state && api.state.foundedAt) || Number(LS.get('kantorAI.foundedAt')) || now;
  if (api.state && api.state.foundedAt) LS.set('kantorAI.foundedAt', String(api.state.foundedAt));
  const day = Math.round((startOfDay(now) - startOfDay(founded)) / 86400000) + 1;
  const d = new Date(now);
  $('#clock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  $('#day').textContent = 'Hari ke-' + day;
  $('#day').title = 'Kantor berdiri ' + new Date(founded).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  if (lastDay !== null && day !== lastDay) window.dispatchEvent(new CustomEvent('kantor:newday', { detail: day }));
  lastDay = day;
}
setInterval(tickClock, 15000);
api.on('state', tickClock);
tickClock();

/* ---------- dashboard ---------- */
let office = null;
initDashboard({
  onFocusEmployee: (id) => { if (office && id) office.focusEmployee(id); if (window.matchMedia('(max-width: 900px)').matches && id) setTab('kantor'); },
  onCloseProfile: () => office && office.clearSelection(),
});
setupDropZones();

/* ---------- kantor 3D (dimuat terpisah supaya dashboard tetap jalan walau WebGL gagal) ---------- */
import('./office.js')
  .then((m) => {
    office = m.initOffice({
      stage: $('#stage'),
      onSelectEmployee: (id, activity) => showProfile(id, activity),
    });
    $('#office-placeholder').hidden = true;
  })
  .catch((err) => {
    console.error(err);
    $('#office-placeholder').querySelector('div').textContent = 'Kantor 3D belum bisa dimuat (' + (err && err.message ? err.message : err) + '). Dashboard tetap bisa dipakai.';
  });

api.refresh();
renderBoard();
