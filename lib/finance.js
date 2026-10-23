// Data keuangan dari aplikasi Arus (money-manager) di Supabase. HANYA MEMBACA.
//
// Memakai service_role key di sisi server (tidak pernah dikirim ke browser), lalu
// menyaring semua data dengan owner_id milik FINANCE_OWNER_EMAIL. Saldo per sumber
// dana dihitung dengan rumus yang sama seperti pocketBalances() di Arus.

const URL_ = () => (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const EMAIL = () => (process.env.FINANCE_OWNER_EMAIL || '').trim().toLowerCase();
const TZ_MIN = Number(process.env.OFFICE_TZ_OFFSET_MINUTES ?? 420);

export class FinanceError extends Error { constructor(msg, status = 500) { super(msg); this.status = status; } }

export function financeMode() {
  if (process.env.FINANCE_DEMO === '1') return 'demo';
  if (URL_() && KEY() && EMAIL()) return 'supabase';
  return 'off';
}

function today() {
  const d = new Date(Date.now() + TZ_MIN * 60000);
  const iso = d.toISOString().slice(0, 10);
  return { iso, ym: iso.slice(0, 7) };
}

async function sb(path, { range } = {}) {
  const headers = { apikey: KEY(), Authorization: `Bearer ${KEY()}` };
  if (range) headers.Range = range;
  const r = await fetch(URL_() + path, { headers });
  if (r.status === 404) return null;                       // tabel belum dibuat (fitur Arus belum dipasang)
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if (/does not exist|Could not find the table|PGRST205/.test(t)) return null;
    throw new FinanceError(`Supabase menolak permintaan (${r.status}): ${t.slice(0, 160)}`, 502);
  }
  return r.json();
}
// PostgREST membatasi 1000 baris per permintaan, jadi ambil bertahap.
async function all(table, query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await sb(`/rest/v1/${table}?${query}`, { range: `${from}-${from + 999}` });
    if (!rows) return out;
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

let ownerCache = null;
async function ownerId() {
  if (ownerCache && ownerCache.email === EMAIL()) return ownerCache.id;
  for (let page = 1; page <= 20; page++) {
    const r = await sb(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = (r && r.users) || [];
    const u = users.find((x) => String(x.email || '').toLowerCase() === EMAIL());
    if (u) { ownerCache = { email: EMAIL(), id: u.id }; return u.id; }
    if (users.length < 200) break;
  }
  throw new FinanceError(`Akun ${EMAIL()} tidak ditemukan di Supabase Auth.`, 404);
}

const n = (v) => Number(v ?? 0);

async function fromSupabase() {
  const owner = await ownerId(), t = today(), o = `owner_id=eq.${owner}`;
  const [pockets, transfers, income, expenses, deposits, payments, adjustments, recentExp, recentPay, recentDep] = await Promise.all([
    all('pockets', `${o}&select=id,name,kind,opening_balance,sort,created_at&order=sort,created_at`),
    all('pocket_transfers', `${o}&select=id,from_pocket,to_pocket,amount,fee,moved_on,note,created_at`),
    all('income_items', `${o}&select=ym,kind,amount,pocket_id,label`),
    all('expenses', `${o}&select=ym,spent_on,amount,pocket_id`),
    all('goal_deposits', `${o}&select=ym,amount,pocket_id`),
    all('bill_payments', `${o}&select=paid_on,amount,pocket_id`),
    all('pocket_adjustments', `${o}&select=id,pocket_id,amount,note,adjusted_on,created_at`),
    sb(`/rest/v1/expenses?${o}&select=id,note,amount,pocket_id,spent_on,created_at,budget_items(label)&order=created_at.desc&limit=12`),
    sb(`/rest/v1/bill_payments?${o}&select=id,amount,pocket_id,paid_on,created_at,bills(name)&order=created_at.desc&limit=6`),
    sb(`/rest/v1/goal_deposits?${o}&select=id,amount,pocket_id,created_at,goals(name)&order=created_at.desc&limit=6`),
  ]);

  // rumus saldo = pocketBalances() di Arus
  const bal = new Map(pockets.map((p) => [p.id, n(p.opening_balance)]));
  const add = (id, v) => { if (id && bal.has(id)) bal.set(id, bal.get(id) + v); };
  for (const i of income) if (i.ym <= t.ym) add(i.pocket_id, i.kind === 'masuk' ? n(i.amount) : -n(i.amount));
  for (const e of expenses) if (e.spent_on <= t.iso) add(e.pocket_id, -n(e.amount));
  for (const d of deposits) if (d.ym <= t.ym) add(d.pocket_id, -n(d.amount));
  for (const p of payments) if (p.paid_on <= t.iso) add(p.pocket_id, -n(p.amount));
  for (const a of adjustments) if (a.adjusted_on <= t.iso) add(a.pocket_id, n(a.amount));
  for (const x of transfers) if (x.moved_on <= t.iso) { add(x.from_pocket, -(n(x.amount) + n(x.fee))); add(x.to_pocket, n(x.amount)); }

  const events = [];
  for (const e of recentExp || []) events.push({ id: 'e' + e.id, type: 'expense', label: e.note || (e.budget_items && e.budget_items.label) || 'Pengeluaran', amount: -n(e.amount), pocketId: e.pocket_id, at: e.created_at });
  for (const p of recentPay || []) events.push({ id: 'b' + p.id, type: 'bill', label: 'Bayar ' + ((p.bills && p.bills.name) || 'tagihan'), amount: -n(p.amount), pocketId: p.pocket_id, at: p.created_at });
  for (const d of recentDep || []) events.push({ id: 'g' + d.id, type: 'saving', label: 'Nabung ' + ((d.goals && d.goals.name) || ''), amount: -n(d.amount), pocketId: d.pocket_id, at: d.created_at });
  for (const x of [...transfers].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).slice(0, 6)) events.push({ id: 't' + x.id, type: 'transfer', label: x.note || 'Pindah dana', amount: n(x.amount), pocketId: x.from_pocket, toPocketId: x.to_pocket, at: x.created_at });
  for (const a of [...adjustments].sort((p, q) => (q.created_at > p.created_at ? 1 : -1)).slice(0, 4)) events.push({ id: 'a' + a.id, type: 'adjust', label: a.note || 'Samakan saldo', amount: n(a.amount), pocketId: a.pocket_id, at: a.created_at });
  events.sort((a, b) => (b.at > a.at ? 1 : -1));

  const monthIncome = income.filter((i) => i.ym === t.ym).reduce((s, i) => s + (i.kind === 'masuk' ? n(i.amount) : -n(i.amount)), 0);
  const monthSpent = expenses.filter((e) => e.ym === t.ym).reduce((s, e) => s + n(e.amount), 0);
  return {
    pockets: pockets.map((p) => ({ id: p.id, name: p.name, kind: p.kind, saldo: bal.get(p.id) || 0 })),
    events: events.slice(0, 15), month: t.ym, monthSpent, monthIncome,
  };
}

/* ---------- mode demo: data contoh yang berubah sendiri, untuk mencoba tanpa Supabase ---------- */
const demo = globalThis.__kantorFinDemo ||= {
  pockets: [
    { id: 'bri', name: 'BRI', kind: 'bank', saldo: 8_750_000 },
    { id: 'bca', name: 'BCA', kind: 'bank', saldo: 3_200_000 },
    { id: 'gopay', name: 'GoPay', kind: 'ewallet', saldo: 415_000 },
    { id: 'tunai', name: 'Dompet', kind: 'tunai', saldo: 260_000 },
  ],
  events: [], next: Date.now() + 25000, monthSpent: 1_840_000,
};
function fromDemo() {
  if (Date.now() >= demo.next) {
    demo.next = Date.now() + 30000 + Math.random() * 30000;
    const p = demo.pockets[(Math.random() * demo.pockets.length) | 0];
    const items = [['Makan siang', 28000], ['Kopi', 22000], ['Bensin', 50000], ['Belanja bulanan', 312000], ['Pulsa', 55000], ['Parkir', 5000]];
    const [label, amt] = Math.random() < 0.2 ? ['Gaji masuk', -2_500_000] : items[(Math.random() * items.length) | 0];
    p.saldo -= amt; if (amt > 0) demo.monthSpent += amt;
    demo.events.unshift({ id: 'd' + Date.now(), type: amt > 0 ? 'expense' : 'income', label, amount: -amt, pocketId: p.id, at: new Date().toISOString() });
    demo.events.length = Math.min(demo.events.length, 15);
  }
  return { pockets: demo.pockets.map((p) => ({ ...p })), events: demo.events, month: today().ym, monthSpent: demo.monthSpent, monthIncome: 9_000_000, demo: true };
}

let cache = { at: 0, data: null };
export async function readFinance() {
  const mode = financeMode();
  if (mode === 'off') return { enabled: false };
  if (mode === 'demo') return { enabled: true, ...fromDemo() };
  if (cache.data && Date.now() - cache.at < 8000) return cache.data;
  const data = { enabled: true, ...(await fromSupabase()) };
  cache = { at: Date.now(), data };
  return data;
}
