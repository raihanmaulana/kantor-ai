// Titik masuk halaman: menyambungkan API, panel keuangan, dan kantor 3D.
import { api, LS } from './api.js';
import { initPanel, showProfile, render as renderPanel } from './panel.js';
import { MONTHS, shortRp } from './fmt.js';

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
setTab(LS.get('kantorAI.tab') === 'uang' ? 'uang' : 'kantor');

function setBoardHidden(hidden) {
  main.classList.toggle('hide-board', hidden);
  $('#toggle-board').setAttribute('aria-pressed', hidden);
  $('#toggle-board').textContent = hidden ? 'Tampilkan panel' : 'Sembunyikan panel';
  LS.set('kantorAI.hideBoard', hidden ? '1' : '0');
}
function setBoardWide(wide) {
  main.classList.toggle('wide', wide);
  $('#wide-board').setAttribute('aria-pressed', wide);
  $('#wide-board').textContent = wide ? 'Panel normal' : 'Perlebar panel';
  LS.set('kantorAI.wideBoard', wide ? '1' : '0');
}
$('#toggle-board').addEventListener('click', () => setBoardHidden(!main.classList.contains('hide-board')));
$('#wide-board').addEventListener('click', () => { setBoardHidden(false); setBoardWide(!main.classList.contains('wide')); });
setBoardHidden(LS.get('kantorAI.hideBoard') === '1');
setBoardWide(LS.get('kantorAI.wideBoard') === '1');

/* ---------- jam & keterangan bulan ---------- */
function tickClock() {
  const d = new Date();
  $('#clock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const f = api.state && api.state.finance;
  if (f && f.enabled) {
    const m = MONTHS[Number(f.today.ym.slice(5, 7)) - 1];
    $('#day').textContent = `${m} · sisa ${f.summary.hariSisa} hari` + (f.status.hasPlan ? ` · aman ${shortRp(f.summary.safeToday)}/hari` : '');
  } else $('#day').textContent = MONTHS[d.getMonth()];
}
setInterval(tickClock, 15000);
api.on('state', tickClock);
tickClock();

/* ---------- panel ---------- */
let office = null;
initPanel({
  onFocusEmployee: (id) => { if (office && id) office.focusEmployee(id); if (window.matchMedia('(max-width: 900px)').matches && id) setTab('kantor'); },
  onCloseProfile: () => office && office.clearSelection(),
});

/* ---------- kantor 3D (dimuat terpisah supaya panel tetap jalan walau WebGL gagal) ---------- */
import('./office.js')
  .then((m) => {
    office = m.initOffice({ stage: $('#stage'), onSelectEmployee: (id, activity) => showProfile(id, activity) });
    $('#office-placeholder').hidden = true;
  })
  .catch((err) => {
    console.error(err);
    $('#office-placeholder').querySelector('div').textContent = 'Kantor 3D belum bisa dimuat (' + (err && err.message ? err.message : err) + '). Panel keuangan tetap bisa dipakai.';
  });

api.refresh();
renderPanel();
