// Data contoh untuk FINANCE_DEMO=1: bentuknya sama dengan tabel Arus, dan setiap 25–50 detik
// muncul satu kegiatan acak (catatan, bayar tagihan, nabung, beli kebutuhan, pindah dana, gajian).

let seq = 1;
const id = (p) => p + '-' + (seq++);
const now = () => new Date().toISOString();

const D = globalThis.__kantorDemo ||= { raw: null, next: 0, ym: null };

function build(t) {
  const ym = t.ym, d = (day) => `${ym}-${String(Math.min(day, t.day)).padStart(2, '0')}`;
  const old = '2026-01-01T00:00:00Z';
  const pockets = [
    { id: 'bri', name: 'BRI', kind: 'bank', opening_balance: 2_400_000, sort: 0, created_at: old },
    { id: 'bca', name: 'BCA', kind: 'bank', opening_balance: 3_600_000, sort: 1, created_at: old },
    { id: 'gopay', name: 'GoPay', kind: 'ewallet', opening_balance: 180_000, sort: 2, created_at: old },
    { id: 'tunai', name: 'Dompet', kind: 'tunai', opening_balance: 150_000, sort: 3, created_at: old },
  ];
  const budget = [
    { id: 'k1', ym, grp: 'kebutuhan', label: 'Makan', amount: 1_800_000 },
    { id: 'k2', ym, grp: 'kebutuhan', label: 'Transport', amount: 500_000 },
    { id: 'k3', ym, grp: 'kebutuhan', label: 'Belanja rumah', amount: 600_000 },
    { id: 'g1', ym, grp: 'gaya_hidup', label: 'Nongkrong', amount: 400_000 },
    { id: 'g2', ym, grp: 'gaya_hidup', label: 'Hiburan', amount: 250_000 },
    { id: 't1', ym, grp: 'tabungan', label: 'Dana darurat', amount: 1_000_000 },
    { id: 't2', ym, grp: 'tabungan', label: 'Liburan', amount: 500_000 },
  ];
  const bills = [
    { id: 'b1', name: 'Kos', kind: 'tagihan', amount: 1_500_000, due_day: 1, start_ym: '2026-01', end_ym: null, created_at: old },
    { id: 'b2', name: 'Listrik', kind: 'tagihan', amount: 250_000, due_day: t.day, start_ym: '2026-01', end_ym: null, created_at: old },
    { id: 'b3', name: 'Internet', kind: 'tagihan', amount: 330_000, due_day: Math.min(31, t.day + 1), start_ym: '2026-01', end_ym: null, created_at: old },
    { id: 'b4', name: 'Cicilan HP', kind: 'cicilan', amount: 420_000, due_day: 3, start_ym: '2026-03', end_ym: '2027-02', created_at: old },
  ];
  const expenses = [
    ['Makan siang', 32_000, 'k1', 'gopay', 1], ['Bensin', 50_000, 'k2', 'tunai', 2], ['Belanja mingguan', 285_000, 'k3', 'bri', 3],
    ['Kopi sore', 28_000, 'g1', 'gopay', 4], ['Makan malam', 45_000, 'k1', 'bri', 5], ['Bioskop', 60_000, 'g2', 'bca', 6],
    ['Sarapan', 18_000, 'k1', 'tunai', t.day],
  ].map(([note, amount, b, p, day], i) => ({ id: 'x' + i, ym, spent_on: d(day), amount, budget_item_id: b, pocket_id: p, note, created_at: old }));
  return {
    pockets, budget, bills, expenses,
    income: [{ ym, kind: 'masuk', amount: 7_500_000, pocket_id: 'bri', label: 'Gaji' }],
    transfers: [{ id: 'tr0', from_pocket: 'bri', to_pocket: 'gopay', amount: 300_000, fee: 0, moved_on: d(2), note: '', created_at: old }],
    payments: [{ id: 'bp0', bill_id: 'b1', ym, paid_on: d(1), amount: 1_500_000, pocket_id: 'bri', created_at: old }],
    billMonths: [{ bill_id: 'b1', ym, paid: true, paid_at: old, skipped: false, amount_override: null, paid_amount: 1_500_000 }, { bill_id: 'b4', ym, paid: true, paid_at: old, skipped: false, amount_override: null, paid_amount: 420_000 }],
    deposits: [{ id: 'gd0', goal_id: 'goal1', ym, amount: 1_000_000, pocket_id: 'bca', created_at: old }, { id: 'gd1', goal_id: 'goal2', ym: '2026-09', amount: 1_200_000, pocket_id: 'bca', created_at: old }],
    goals: [{ id: 'goal1', name: 'Dana darurat', target: 15_000_000, is_emergency: true, created_at: old }, { id: 'goal2', name: 'Liburan Bali', target: 6_000_000, is_emergency: false, created_at: old }, { id: 'goal3', name: 'Laptop baru', target: 12_000_000, is_emergency: false, created_at: old }],
    needItems: [
      { id: 'n1', category: 'Kucing', name: 'Pasir kucing', est_price: 65_000, qty: 1, remind_day: Math.max(1, t.day - 1) },
      { id: 'n2', category: 'Kucing', name: 'Makanan kucing', est_price: 120_000, qty: 1, remind_day: 5 },
      { id: 'n3', category: 'Rumah', name: 'Galon', est_price: 22_000, qty: 2, remind_day: t.day },
      { id: 'n4', category: 'Rumah', name: 'Sabun cuci', est_price: 30_000, qty: 1, remind_day: 20 },
    ],
    needPurchases: [{ id: 'np0', item_id: 'n2', ym, total: 118_000, bought_on: d(5), created_at: old }],
    adjustments: [], debtPays: [], splits: [],
  };
}

export function demoRaw(t) {
  if (!D.raw || D.ym !== t.ym) { D.raw = build(t); D.ym = t.ym; D.next = Date.now() + 20000; }
  return D.raw;
}

const pick = (a) => a[(Math.random() * a.length) | 0];
export function demoTick(t) {
  const R = demoRaw(t);
  if (Date.now() < D.next) return;
  D.next = Date.now() + 25000 + Math.random() * 25000;
  const r = Math.random(), at = now(), today = t.iso;
  if (r < 0.45) {
    const [note, amount, b] = pick([['Makan siang', 35_000, 'k1'], ['Kopi', 24_000, 'g1'], ['Ojek', 18_000, 'k2'], ['Snack', 15_000, 'k1'], ['Belanja sayur', 62_000, 'k3'], ['Game', 45_000, 'g2']]);
    R.expenses.push({ id: id('x'), ym: t.ym, spent_on: today, amount, budget_item_id: b, pocket_id: pick(['gopay', 'tunai', 'bri']), note, created_at: at });
  } else if (r < 0.6) {
    const unpaid = R.bills.filter((b) => !R.billMonths.some((m) => m.bill_id === b.id && m.ym === t.ym && m.paid) && b.start_ym <= t.ym && (!b.end_ym || b.end_ym >= t.ym));
    const b = unpaid[0]; if (!b) return;
    R.payments.push({ id: id('bp'), bill_id: b.id, ym: t.ym, paid_on: today, amount: b.amount, pocket_id: 'bri', created_at: at });
    R.billMonths.push({ bill_id: b.id, ym: t.ym, paid: true, paid_at: at, skipped: false, amount_override: null, paid_amount: b.amount });
  } else if (r < 0.72) {
    R.deposits.push({ id: id('gd'), goal_id: pick(['goal1', 'goal2', 'goal3']), ym: t.ym, amount: pick([100_000, 250_000, 500_000]), pocket_id: 'bca', created_at: at });
  } else if (r < 0.84) {
    const item = R.needItems.find((i) => !R.needPurchases.some((p) => p.item_id === i.id)) || pick(R.needItems);
    const total = Math.round(item.est_price * item.qty * (0.9 + Math.random() * 0.2));
    R.needPurchases.push({ id: id('np'), item_id: item.id, ym: t.ym, total, bought_on: today, created_at: at });
    R.expenses.push({ id: id('x'), ym: t.ym, spent_on: today, amount: total, budget_item_id: 'k3', pocket_id: 'tunai', note: item.name, created_at: at });
  } else if (r < 0.94) {
    R.transfers.push({ id: id('tr'), from_pocket: 'bri', to_pocket: pick(['gopay', 'tunai']), amount: pick([100_000, 200_000]), fee: 0, moved_on: today, note: '', created_at: at });
  } else {
    R.income.push({ ym: t.ym, kind: 'masuk', amount: pick([500_000, 1_250_000]), pocket_id: 'bri', label: 'Bonus' });
  }
}
