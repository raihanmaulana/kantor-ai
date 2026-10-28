// Panel kanan: ringkasan keuangan dari Arus (hanya baca), profil karyawan, dan dialog kunci.
import { api, LS } from './api.js';
import { rupiah, signed, short, monthName, BILL_STATUS, LEVEL, ROLE_INFO } from './fmt.js';

const $ = (s, r = document) => r.querySelector(s);
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
}
const initials = (n) => String(n || '?').trim().slice(0, 1).toUpperCase();
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const ago = (iso) => {
  if (!iso) return '';
  const s = Math.max(0, (api.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' mnt'; if (s < 86400) return Math.floor(s / 3600) + ' jam';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};
let opts = {};

export function initPanel(o) {
  opts = o || {};
  api.on('state', render);
  api.on('status', (st) => { $('#conn').textContent = st; $('#conn').dataset.s = st; });
  api.on('needKey', () => openKeys('Halaman ini dikunci. Isi kunci baca (OFFICE_READ_KEY).'));
  $('#btn-keys').addEventListener('click', () => openKeys(''));
  $('#key-form').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'save') api.setKey($('#k-read').value.trim());
  });
  const hide = LS.get('kantorAI.hideNum') === '1';
  setHidden(hide);
  $('#hide-num').addEventListener('click', () => setHidden(!document.body.classList.contains('blur')));
}
function setHidden(on) {
  document.body.classList.toggle('blur', on);
  $('#hide-num').setAttribute('aria-pressed', on);
  LS.set('kantorAI.hideNum', on ? '1' : '0');
}
function openKeys(msg) { $('#k-read').value = api.readKey; $('#k-msg').textContent = msg; const d = $('#dlg-keys'); if (!d.open) d.showModal(); }

const teamOf = (role) => ((api.state && api.state.team) || []).find((e) => e.role === role);
function secHead(title, role) {
  const e = teamOf(role);
  return el('h3', {}, e ? el('span', { class: 'av', style: `--c:${e.look.shirt}`, title: e.name, text: initials(e.name) }) : null, title,
    e ? el('button', { class: 'link', style: 'margin-left:auto;font-size:11.5px;text-transform:none;letter-spacing:0', onclick: () => opts.onFocusEmployee && opts.onFocusEmployee(e.id), text: 'Lihat ' + e.name }) : null);
}

export function render() {
  const s = api.state, box = $('#panel');
  if (!s) return;
  const team = s.team || [];
  $('#team-line').textContent = 'Lantai 38 · ' + team.map((e) => e.name).join(', ').replace(/, ([^,]*)$/, ', dan $1');
  const arus = $('#open-arus'); arus.hidden = !s.arusUrl; if (s.arusUrl) arus.href = s.arusUrl;
  const f = s.finance || {};
  if (!f.enabled) {
    $('#b-month').textContent = 'Keuangan';
    box.replaceChildren(el('div', { class: 'setup' },
      el('strong', { text: 'Kantor belum tersambung ke Arus.' }), el('br'), f.reason || '',
      el('p', {}, 'Isi di Vercel → Settings → Environment Variables: ', el('code', { text: 'SUPABASE_URL' }), ', ', el('code', { text: 'SUPABASE_SERVICE_ROLE_KEY' }), ', ', el('code', { text: 'FINANCE_OWNER_EMAIL' }), ', dan ', el('code', { text: 'OFFICE_READ_KEY' }), ', lalu Redeploy. Untuk mencoba dulu, isi ', el('code', { text: 'FINANCE_DEMO=1' }), '.')));
    return;
  }
  $('#b-month').textContent = 'Keuangan · ' + monthName(f.today.ym);
  const S = f.summary, st = f.status;
  const kids = [];
  kids.push(el('div', { class: 'status', 'data-l': st.level },
    el('b', {}, el('i'), 'Status kantor: ' + LEVEL[st.level]),
    st.reasons.length ? el('ul', {}, st.reasons.slice(0, 5).map((r) => el('li', { text: r }))) : el('span', { class: 'empty', text: st.hasPlan ? 'Pengeluaran masih dalam batas aman.' : 'Pemasukan bulan ini belum diisi di Arus.' })));
  const total = f.pockets.filter((p) => !p.credit).reduce((t, p) => t + p.saldo, 0);
  kids.push(el('div', { class: 'stats' },
    el('div', { class: S.sisaJatah < 0 ? 'neg' : '' }, el('b', { text: rupiah(S.sisaJatah) }), el('span', { text: `Sisa jatah · ${S.hariSisa} hari lagi` })),
    el('div', { class: S.spentToday > S.safeToday ? 'neg' : '' }, el('b', { text: rupiah(S.safeToday) }), el('span', { text: `Aman hari ini · terpakai ${rupiah(S.spentToday)}` })),
    el('div', {}, el('b', { text: rupiah(S.tagihanBelumBayar) }), el('span', { text: 'Tagihan belum dibayar' })),
    el('div', {}, el('b', { text: rupiah(total) }), el('span', { text: 'Total saldo' }))));

  const spend = f.budget.filter((b) => b.grp === 'kebutuhan' || b.grp === 'gaya_hidup');
  kids.push(el('section', { class: 'sec' }, secHead('Anggaran', 'planner'),
    spend.length ? el('ul', { class: 'rows' }, spend.map((b) => {
      const p = pct(b.spent, b.amount);
      return el('li', {}, el('div', { class: 'ln' }, el('span', { text: b.label }), el('span', { class: 'num', text: `${rupiah(b.spent)} / ${rupiah(b.amount)}` })),
        el('div', { class: 'bar' }, el('i', { class: p >= 100 ? 'x' : p >= 80 ? 'w' : '', style: `width:${Math.min(100, p)}%` })));
    })) : el('p', { class: 'empty', text: 'Anggaran bulan ini belum diisi.' })));

  kids.push(el('section', { class: 'sec' }, secHead('Tagihan', 'billing'),
    f.bills.length ? el('ul', { class: 'rows' }, f.bills.map((b) => el('li', {}, el('div', { class: 'ln' },
      el('span', { text: `${b.dueDay} · ${b.name}` }), el('span', {}, el('span', { class: 'num', text: rupiah(b.amount) + ' ' }), el('span', { class: 'chip ' + b.status, text: BILL_STATUS[b.status] })))))) : el('p', { class: 'empty', text: 'Tidak ada tagihan bulan ini.' })));

  kids.push(el('section', { class: 'sec' }, secHead('Tabungan', 'savings'),
    f.goals.length ? el('ul', { class: 'rows' }, f.goals.map((g) => {
      const p = pct(g.saldo, g.target);
      return el('li', {}, el('div', { class: 'ln' }, el('span', { text: g.name }), el('span', { class: 'num', text: g.target ? `${rupiah(g.saldo)} · ${p}%` : rupiah(g.saldo) })),
        el('div', { class: 'bar' }, el('i', { style: `width:${Math.min(100, p)}%` })));
    })) : el('p', { class: 'empty', text: 'Belum ada target tabungan.' })));

  const needs = f.needs.filter((x) => !x.bought).sort((a, b) => (b.due - a.due) || ((a.remindDay ?? 99) - (b.remindDay ?? 99)));
  kids.push(el('section', { class: 'sec' }, secHead('Kebutuhan belum dibeli', 'shopper'),
    needs.length ? el('ul', { class: 'rows' }, needs.slice(0, 8).map((x) => el('li', {}, el('div', { class: 'ln' },
      el('span', { text: x.name }), el('span', {}, el('span', { class: 'num', text: rupiah(x.est) + ' ' }), x.due ? el('span', { class: 'chip hari_ini', text: 'Waktunya beli' }) : x.remindDay ? el('span', { class: 'chip nanti', text: 'tgl ' + x.remindDay }) : null))))) : el('p', { class: 'empty', text: 'Semua kebutuhan bulan ini sudah dibeli.' })));

  const byRole = new Map(team.map((e) => [e.role, e]));
  kids.push(el('section', { class: 'sec' }, el('h3', { text: 'Aktivitas terbaru' }),
    f.events.length ? el('ul', { id: 'feed' }, f.events.slice(0, 10).map((e) => { const who = byRole.get(e.who); return el('li', {},
      el('span', { class: 'av', style: `--c:${who ? who.look.shirt : '#8a90a0'}`, title: who ? who.name : '', text: initials(who ? who.name : '?') }),
      el('span', {}, short(e.label, 34), e.amount ? el('span', { class: 'num ' + (e.amount < 0 ? 'negv' : 'pos'), text: ' ' + signed(e.amount) }) : null),
      el('time', { text: ago(e.at) })); })) : el('p', { class: 'empty', text: 'Belum ada aktivitas.' })));
  box.replaceChildren(...kids);
}

/* ---------- profil karyawan (kotak di pojok kantor) ---------- */
export function showProfile(id, activityText) {
  const s = api.state; const box = $('#profile');
  if (!s || !id) { box.hidden = true; return; }
  const e = s.team.find((x) => x.id === id); if (!e) { box.hidden = true; return; }
  const f = s.finance && s.finance.enabled ? s.finance : null;
  let detail = null;
  if (f) {
    const li = (a, b, cls) => el('li', {}, el('span', { text: a }), el('span', { class: 'num ' + (cls || ''), text: b }));
    if (e.role === 'manager') detail = [li('Sisa jatah', rupiah(f.summary.sisaJatah)), li('Aman hari ini', rupiah(f.summary.safeToday)), li('Status', LEVEL[f.status.level])];
    if (e.role === 'planner') detail = f.budget.filter((b) => b.grp === 'kebutuhan' || b.grp === 'gaya_hidup').slice(0, 6).map((b) => li(b.label, pct(b.spent, b.amount) + '%', pct(b.spent, b.amount) >= 80 ? 'negv' : ''));
    if (e.role === 'treasurer') detail = f.pockets.slice(0, 6).map((p) => li(p.name, rupiah(p.saldo), p.saldo < 0 ? 'negv' : ''));
    if (e.role === 'billing') detail = f.bills.slice(0, 6).map((b) => li(`${b.dueDay} · ${b.name}`, BILL_STATUS[b.status], b.status === 'terlambat' ? 'negv' : b.status === 'lunas' ? 'pos' : ''));
    if (e.role === 'savings') detail = f.goals.slice(0, 6).map((g) => li(g.name, g.target ? pct(g.saldo, g.target) + '%' : rupiah(g.saldo)));
    if (e.role === 'shopper') detail = f.needs.filter((x) => !x.bought).slice(0, 6).map((x) => li(x.name, x.due ? 'waktunya beli' : rupiah(x.est), x.due ? 'negv' : ''));
  }
  box.replaceChildren(...[
    el('div', { class: 'pf-head' },
      el('span', { class: 'av big', style: `--c:${e.look.shirt}`, text: initials(e.name) }),
      el('div', {}, el('strong', { text: e.name }), el('small', { text: e.title })),
      el('button', { class: 'x', 'aria-label': 'Tutup profil', onclick: () => { box.hidden = true; if (opts.onCloseProfile) opts.onCloseProfile(); } }, '×')),
    el('p', { class: 'pf-act', text: activityText || '' }),
    el('div', { class: 'pf-sub', text: ROLE_INFO[e.role] || '' }),
    detail && detail.length ? el('ul', { class: 'pf-list' }, detail) : null,
  ].filter(Boolean));
  box.hidden = false;
}
