// Data keuangan dari Arus (money-manager) di Supabase. HANYA MEMBACA.
//
// Server memakai service_role key (tidak pernah dikirim ke browser) dan menyaring semua
// data dengan owner_id milik FINANCE_OWNER_EMAIL. Semua rumus disalin dari lib/calc.ts
// di Arus (billRowsFor, summarize, pocketBalances, cardRestores) supaya angkanya sama persis.
//
// Alur: ambil tabel mentah → compute(raw, today) → snapshot untuk kantor.
// Mode demo memakai jalur compute() yang sama dengan data contoh di memori.

import { demoRaw, demoTick } from './finance-demo.js';

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

/* ---------- tanggal (WIB) ---------- */
export function today(nowMs = Date.now()) {
  const d = new Date(nowMs + TZ_MIN * 60000);
  const iso = d.toISOString().slice(0, 10);
  return { iso, ym: iso.slice(0, 7), day: Number(iso.slice(8, 10)) };
}
const ymIndex = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const ymFromIndex = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const ymAdd = (ym, n) => ymFromIndex(ymIndex(ym) + n);
const ymDiff = (a, b) => ymIndex(a) - ymIndex(b);
const daysInMonth = (ym) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
const n = (v) => Number(v ?? 0);
const isCreditKind = (k) => k === 'kredit' || k === 'paylater';

/* ---------- rumus Arus ---------- */
const billActive = (b, ym) => b.start_ym <= ym && (!b.end_ym || ym <= b.end_ym);
function billRowsFor(bills, bms, ym) {
  const rows = [];
  for (const bill of bills) {
    if (!billActive(bill, ym)) continue;
    const bm = bms.find((x) => x.bill_id === bill.id && x.ym === ym);
    const overridden = bm?.amount_override != null;
    const isCard = bill.kind === 'kartu';
    let carry = bill.amount;
    if (isCard) for (let m = bill.start_ym; m < ym; m = ymAdd(m, 1)) {
      const x = bms.find((b) => b.bill_id === bill.id && b.ym === m);
      carry = Math.max(0, (x?.amount_override ?? carry) - Math.max(0, x?.paid_amount ?? 0));
    }
    const amount = bm?.amount_override ?? (isCard ? carry : bill.amount);
    const rawPaid = Math.max(0, bm?.paid_amount ?? 0);
    const paidAmount = isCard ? rawPaid : bm?.paid ? Math.max(amount, rawPaid) : rawPaid;
    const paid = isCard ? paidAmount >= amount : !!bm?.paid || (amount > 0 && paidAmount >= amount);
    rows.push({ bill, amount, skipped: !!bm?.skipped, paid, isCard, paidAmount, dueDay: Math.min(bill.due_day, daysInMonth(ym)), monthsAfter: bill.end_ym ? ymDiff(bill.end_ym, ym) : null });
  }
  return rows.sort((a, b) => a.dueDay - b.dueDay || a.bill.name.localeCompare(b.bill.name));
}
function summarize(income, budget, expenses, rows, t, ym) {
  const masuk = income.filter((i) => i.kind === 'masuk').reduce((s, i) => s + i.amount, 0);
  const potong = income.filter((i) => i.kind === 'potong').reduce((s, i) => s + i.amount, 0);
  const bersih = masuk - potong;
  const live = rows.filter((r) => !r.skipped);
  const tagihan = live.reduce((s, r) => s + r.amount, 0);
  const tagihanBelumBayar = live.filter((r) => !r.paid).reduce((s, r) => s + Math.max(0, r.amount - r.paidAmount), 0);
  const grp = { kebutuhan: 0, gaya_hidup: 0, tabungan: 0, investasi: 0 };
  for (const b of budget) grp[b.grp] = (grp[b.grp] || 0) + b.amount;
  const uangBelanja = bersih - tagihan - grp.tabungan - grp.investasi;
  const own = expenses.filter((e) => !e.credit);
  const spent = own.reduce((s, e) => s + e.amount, 0);
  const spentByItem = {};
  for (const e of own) if (e.budget_item_id) spentByItem[e.budget_item_id] = (spentByItem[e.budget_item_id] ?? 0) + e.amount;
  const sisaJatah = uangBelanja - spent;
  const dim = daysInMonth(ym);
  const hariSisa = ym > t.ym ? dim : ym === t.ym ? dim - t.day + 1 : 0;
  return { masuk, potong, bersih, tagihan, tagihanBelumBayar, grp, uangBelanja, spent, sisaJatah, hariSisa,
    jatahPerHari: hariSisa > 0 ? Math.max(0, Math.floor(sisaJatah / hariSisa)) : 0, spentByItem };
}
function cardRestores(payments, bills) {
  const by = new Map(bills.filter((b) => b.card_pocket_id).map((b) => [b.id, b]));
  const used = new Map(), out = [];
  for (const p of [...payments].sort((a, b) => String(a.paid_on).localeCompare(String(b.paid_on)))) {
    const b = by.get(p.bill_id); if (!b) continue;
    const cap = b.kind !== 'kartu' && (b.principal ?? 0) > 0 ? b.principal : Infinity;
    const key = `${p.bill_id}|${p.ym}`, so = used.get(key) ?? 0;
    const give = Math.max(0, Math.min(p.amount, cap - so));
    used.set(key, so + give);
    if (give > 0) out.push({ paid_on: p.paid_on, amount: give, card_pocket_id: b.card_pocket_id });
  }
  return out;
}
function pocketBalances(pockets, income, expenses, deposits, transfers, t, payments, adjustments, cardPays, debtPays) {
  const bal = new Map(pockets.map((p) => [p.id, isCreditKind(p.kind) ? -p.opening_balance : p.opening_balance]));
  const add = (id, v) => { if (id && bal.has(id)) bal.set(id, bal.get(id) + v); };
  for (const i of income) if (i.ym <= t.ym) add(i.pocket_id, i.kind === 'masuk' ? i.amount : -i.amount);
  const since = new Map(pockets.filter((p) => isCreditKind(p.kind) && p.credit_since).map((p) => [p.id, p.credit_since]));
  const counts = (id, on) => !id || !since.has(id) || on >= since.get(id);
  for (const e of expenses) if (e.spent_on <= t.iso && counts(e.pocket_id, e.spent_on)) add(e.pocket_id, -e.amount);
  for (const d of deposits) if (d.ym <= t.ym) add(d.pocket_id, -d.amount);
  for (const p of payments) if (p.paid_on <= t.iso) add(p.pocket_id, -p.amount);
  for (const a of adjustments) if (a.adjusted_on <= t.iso) add(a.pocket_id, a.amount);
  for (const c of cardPays) if (c.paid_on <= t.iso && counts(c.card_pocket_id, c.paid_on)) add(c.card_pocket_id, c.amount);
  for (const d of debtPays) if (d.paid_on <= t.iso) add(d.pocket_id, d.direction === 'them_to_me' ? d.amount : -d.amount);
  for (const x of transfers) if (x.moved_on <= t.iso) { add(x.from_pocket, -(x.amount + (x.fee ?? 0))); add(x.to_pocket, x.amount); }
  return bal;
}

// sidik jari singkat untuk mendeteksi perubahan yang tidak punya waktu dibuat (edit, hapus)
const sig = (rows) => { let h = 2166136261; const s = JSON.stringify(rows); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const newest = (rows, key = 'created_at') => rows.filter((r) => r[key]).sort((a, b) => (b[key] > a[key] ? 1 : -1));

/* ---------- snapshot untuk kantor ---------- */
export function compute(raw, t) {
  const ym = t.ym;
  const credit = new Set(raw.pockets.filter((p) => isCreditKind(p.kind)).map((p) => p.id));
  const expAll = raw.expenses.map((e) => ({ ...e, credit: !!e.pocket_id && credit.has(e.pocket_id) }));
  const expYm = expAll.filter((e) => e.ym === ym);
  const incYm = raw.income.filter((i) => i.ym === ym);
  const budget = raw.budget.filter((b) => b.ym === ym);
  const rows = billRowsFor(raw.bills, raw.billMonths, ym);
  const sum = summarize(incYm, budget, expYm, rows, t, ym);
  const spentToday = expYm.filter((e) => !e.credit && e.spent_on === t.iso).reduce((s, e) => s + e.amount, 0);
  const safeToday = sum.hariSisa > 0 ? Math.max(0, Math.floor((sum.sisaJatah + spentToday) / sum.hariSisa)) : 0;

  const cardPays = cardRestores(raw.payments, raw.bills);
  const bal = pocketBalances(raw.pockets, raw.income, raw.expenses, raw.deposits, raw.transfers, t, raw.payments, raw.adjustments, cardPays, raw.debtPays);
  const pockets = raw.pockets.map((p) => ({ id: p.id, name: p.name, kind: p.kind, credit: isCreditKind(p.kind), limit: n(p.credit_limit), saldo: bal.get(p.id) || 0 }));

  const bills = rows.map((r) => ({
    id: r.bill.id, name: r.bill.name, kind: r.bill.kind, amount: r.amount, paidAmount: r.paidAmount, dueDay: r.dueDay,
    status: r.skipped ? 'dilewati' : r.paid ? 'lunas' : r.amount <= 0 ? 'nanti' : r.dueDay < t.day ? 'terlambat' : r.dueDay === t.day ? 'hari_ini' : r.dueDay === t.day + 1 ? 'besok' : 'nanti',
  }));
  const budgetItems = budget.map((b) => ({ id: b.id, label: b.label, grp: b.grp, amount: b.amount, spent: sum.spentByItem[b.id] || 0 }));
  const goals = raw.goals.map((g) => ({ id: g.id, name: g.name, target: n(g.target), emergency: !!g.is_emergency, saldo: raw.deposits.filter((d) => d.goal_id === g.id).reduce((s, d) => s + d.amount, 0) }));
  const bought = new Set(raw.needPurchases.filter((p) => p.ym === ym || String(p.bought_on || '') >= ym + '-01').map((p) => p.item_id));
  const needs = raw.needItems.map((i) => ({ id: i.id, name: i.name, category: i.category, est: Math.round(n(i.est_price) * n(i.qty)), remindDay: i.remind_day ?? null, bought: bought.has(i.id), due: i.remind_day != null && i.remind_day <= t.day && !bought.has(i.id) }));

  // status kantor
  const hasPlan = sum.masuk > 0;
  const kritis = [], waspada = [];
  if (hasPlan && sum.sisaJatah <= 0) kritis.push('Sisa jatah bulan ini habis');
  for (const b of bills.filter((x) => x.status === 'terlambat')) kritis.push('Tagihan terlambat: ' + b.name);
  if (hasPlan && spentToday > safeToday) waspada.push('Pengeluaran hari ini melewati batas aman');
  for (const b of budgetItems.filter((x) => (x.grp === 'kebutuhan' || x.grp === 'gaya_hidup') && x.amount > 0 && x.spent / x.amount >= 0.8)) waspada.push(`Pos ${b.label} sudah ${Math.round((b.spent / b.amount) * 100)}%`);
  for (const p of pockets.filter((x) => !x.credit && x.saldo < 0)) waspada.push('Saldo ' + p.name + ' minus');
  const status = { level: kritis.length ? 'kritis' : waspada.length ? 'waspada' : 'aman', reasons: [...kritis, ...waspada], hasPlan };

  // aktivitas terbaru (dengan karyawan yang bereaksi)
  const pname = new Map(raw.pockets.map((p) => [p.id, p.name]));
  const bname = new Map(raw.bills.map((b) => [b.id, b.name]));
  const blabel = new Map(raw.budget.map((b) => [b.id, b.label]));
  const gname = new Map(raw.goals.map((g) => [g.id, g.name]));
  const iname = new Map(raw.needItems.map((i) => [i.id, i.name]));
  const ev = [];
  for (const e of newest(raw.expenses).slice(0, 10)) ev.push({ id: 'e' + e.id, type: 'expense', who: 'treasurer', label: e.note || blabel.get(e.budget_item_id) || 'Pengeluaran', amount: -e.amount, pocketId: e.pocket_id, budgetItemId: e.budget_item_id || null, at: e.created_at });
  for (const p of newest(raw.payments).slice(0, 5)) ev.push({ id: 'b' + p.id, type: 'bill-pay', who: 'billing', label: 'Bayar ' + (bname.get(p.bill_id) || 'tagihan'), amount: -p.amount, pocketId: p.pocket_id, billId: p.bill_id, at: p.created_at });
  for (const m of newest(raw.billMonths.filter((x) => x.paid), 'paid_at').slice(0, 4)) ev.push({ id: 'bm' + m.bill_id + m.ym + m.paid_at, type: 'bill-paid', who: 'billing', label: 'Lunas: ' + (bname.get(m.bill_id) || 'tagihan'), amount: 0, billId: m.bill_id, at: m.paid_at });
  for (const b of newest(raw.bills).slice(0, 3)) ev.push({ id: 'bn' + b.id, type: 'bill-new', who: 'billing', label: 'Tagihan baru: ' + b.name, amount: 0, billId: b.id, at: b.created_at });
  for (const d of newest(raw.deposits).slice(0, 5)) ev.push({ id: 'g' + d.id, type: 'saving', who: 'savings', label: (d.amount < 0 ? 'Tarik ' : 'Nabung ') + (gname.get(d.goal_id) || ''), amount: -d.amount, pocketId: d.pocket_id, goalId: d.goal_id, at: d.created_at });
  for (const p of newest(raw.needPurchases).slice(0, 5)) ev.push({ id: 'n' + p.id, type: 'need', who: 'shopper', label: 'Beli ' + (iname.get(p.item_id) || 'kebutuhan'), amount: -n(p.total), needId: p.item_id, at: p.created_at });
  for (const s of newest(raw.splits).slice(0, 3)) ev.push({ id: 's' + s.id, type: 'split', who: 'shopper', label: 'Patungan: ' + s.name, amount: n(s.amount), at: s.created_at });
  for (const x of newest(raw.transfers).slice(0, 5)) ev.push({ id: 't' + x.id, type: 'transfer', who: 'treasurer', label: x.note || `Pindah ${pname.get(x.from_pocket) || 'dana'} → ${pname.get(x.to_pocket) || ''}`, amount: x.amount, pocketId: x.from_pocket, toPocketId: x.to_pocket, at: x.created_at });
  for (const a of newest(raw.adjustments).slice(0, 3)) ev.push({ id: 'a' + a.id, type: 'adjust', who: 'treasurer', label: a.note || 'Samakan saldo ' + (pname.get(a.pocket_id) || ''), amount: a.amount, pocketId: a.pocket_id, at: a.created_at });
  for (const p of newest(raw.pockets).slice(0, 3)) ev.push({ id: 'pn' + p.id, type: 'pocket-new', who: 'treasurer', label: 'Sumber dana baru: ' + p.name, amount: 0, pocketId: p.id, at: p.created_at });
  ev.sort((a, b) => (b.at > a.at ? 1 : -1));

  return {
    today: t, daysInMonth: daysInMonth(ym),
    summary: { masuk: sum.masuk, bersih: sum.bersih, tagihan: sum.tagihan, tagihanBelumBayar: sum.tagihanBelumBayar, uangBelanja: sum.uangBelanja, spent: sum.spent, sisaJatah: sum.sisaJatah, hariSisa: sum.hariSisa, jatahPerHari: sum.jatahPerHari, spentToday, safeToday, grp: sum.grp },
    status, pockets, bills, budget: budgetItems, goals, needs,
    events: ev.slice(0, 20),
    sigs: {
      bills: sig([raw.bills.map((b) => [b.id, b.name, b.kind, b.amount, b.due_day, b.start_ym, b.end_ym]), raw.billMonths.map((m) => [m.bill_id, m.ym, m.paid, m.skipped, m.amount_override, m.paid_amount])]),
      pockets: sig(raw.pockets.map((p) => [p.id, p.name, p.kind, p.opening_balance, p.sort])),
      budget: sig(budget.map((b) => [b.id, b.label, b.grp, b.amount])),
      income: sig(incYm.map((i) => [i.label, i.kind, i.amount])),
      goals: sig(raw.goals.map((g) => [g.id, g.name, g.target])),
      needs: sig(raw.needItems.map((i) => [i.id, i.name, i.est_price, i.qty, i.remind_day])),
    },
  };
}

/* ---------- Supabase (REST, tanpa library) ---------- */
async function sb(path, { range } = {}) {
  const headers = { apikey: KEY(), Authorization: `Bearer ${KEY()}` };
  if (range) headers.Range = range;
  const r = await fetch(URL_() + path, { headers });
  if (r.status === 404) return null;
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    if (/does not exist|Could not find|PGRST20/.test(txt)) return null;   // tabel/kolom fitur yang belum dipasang
    throw new FinanceError(`Supabase menolak permintaan (${r.status}): ${txt.slice(0, 160)}`, 502);
  }
  return r.json();
}
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
const nums = (rows, ...keys) => rows.map((r) => { const o = { ...r }; for (const k of keys) o[k] = n(r[k]); return o; });

async function rawFromSupabase(t) {
  const o = `owner_id=eq.${await ownerId()}`;
  const [pockets, transfers, income, expenses, deposits, payments, adjustments, bills, billMonths, debtPays, budget, goals, needItems, needPurchases, splits] = await Promise.all([
    all('pockets', `${o}&select=*&order=sort,created_at`),
    all('pocket_transfers', `${o}&select=id,from_pocket,to_pocket,amount,fee,moved_on,note,created_at`),
    all('income_items', `${o}&select=ym,kind,amount,pocket_id,label`),
    all('expenses', `${o}&select=id,ym,spent_on,amount,pocket_id,budget_item_id,note,created_at`),
    all('goal_deposits', `${o}&select=id,goal_id,ym,amount,pocket_id,created_at`),
    all('bill_payments', `${o}&select=id,bill_id,ym,paid_on,amount,pocket_id,created_at`),
    all('pocket_adjustments', `${o}&select=id,pocket_id,amount,note,adjusted_on,created_at`),
    all('bills', `${o}&select=*&order=created_at`),
    all('bill_months', `${o}&select=bill_id,ym,amount_override,skipped,paid,paid_at,paid_amount`),
    all('debt_payments', `${o}&select=paid_on,amount,direction,pocket_id`),
    all('budget_items', `${o}&ym=eq.${t.ym}&select=id,ym,grp,label,amount,sort&order=sort,label`),
    all('goals', `${o}&select=id,name,target,is_emergency,created_at&order=created_at`),
    all('need_items', `${o}&select=id,category,name,est_price,qty,remind_day,created_at&order=category,created_at`),
    all('need_purchases', `${o}&or=(ym.eq.${t.ym},bought_on.gte.${t.ym}-01)&select=id,item_id,ym,total,bought_on,created_at`),
    all('split_bills', `${o}&ym=eq.${t.ym}&select=id,name,amount,created_at`),
  ]);
  return {
    pockets: nums(pockets, 'opening_balance', 'credit_limit').map((p) => ({ ...p, credit_since: p.credit_since ?? (typeof p.created_at === 'string' ? p.created_at.slice(0, 10) : null) })),
    transfers: nums(transfers, 'amount', 'fee'), income: nums(income, 'amount'), expenses: nums(expenses, 'amount'),
    deposits: nums(deposits, 'amount'), payments: nums(payments, 'amount'), adjustments: nums(adjustments, 'amount'),
    bills: nums(bills, 'amount', 'min_payment', 'principal'),
    billMonths: billMonths.map((m) => ({ ...m, amount_override: m.amount_override == null ? null : n(m.amount_override), paid_amount: n(m.paid_amount) })),
    debtPays: nums(debtPays, 'amount'), budget: nums(budget, 'amount'), goals, needItems, needPurchases, splits,
  };
}

let cache = { at: 0, data: null };
export async function readFinance() {
  const mode = financeMode();
  if (mode === 'off') return { enabled: false };
  const t = today();
  if (mode === 'demo') { demoTick(t); return { enabled: true, demo: true, ...compute(demoRaw(t), t) }; }
  if (cache.data && Date.now() - cache.at < 8000) return cache.data;
  const data = { enabled: true, ...compute(await rawFromSupabase(t), t) };
  cache = { at: Date.now(), data };
  return data;
}
