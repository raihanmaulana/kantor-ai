// Perilaku karyawan: antrean aksi per orang (skrip langkah demi langkah) dan pilihan
// aktivitas idle berbobot dengan cooldown, plus jadwal datang/pulang lewat lift.

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/* ---------- langkah-langkah skrip ---------- */
// Setiap langkah: { start(agent), tick(agent, dt) -> true bila selesai, stop?(agent) }
export const S = {
  walk: (target) => ({ start(a) { this.done = false; a.ch.walkTo(target, () => (this.done = true)); }, tick() { return this.done; }, stop(a) { a.ch.curve = null; } }),
  sit: (seatInfo) => ({ start(a) { this.done = false; a.ch.sitAt(seatInfo, () => (this.done = true)); }, tick() { return this.done; } }),
  stand: () => ({ start(a) { this.done = false; a.ch.standUp(() => (this.done = true)); }, tick() { return this.done; } }),
  face: (rot) => ({ start(a) { a.ch.face(rot); this.t = 0; }, tick(a, dt) { return (this.t += dt) > 0.35; } }),
  faceTo: (pt) => ({ start(a) { a.ch.faceTo(pt.x, pt.z); this.t = 0; }, tick(a, dt) { return (this.t += dt) > 0.35; } }),
  // aktivitas di tempat; opts: { dur, until(a), props, status, lookAt, onTick(a, dt, t) }
  act: (name, opts = {}) => ({
    start(a) { this.t = 0; this.dur = typeof opts.dur === 'function' ? opts.dur() : (opts.dur ?? 3); a.ch.setAct(name); if (opts.props) a.ch.props(opts.props); if (opts.status) a.setStatus(opts.status); a.lookAt = opts.lookAt || null; },
    tick(a, dt) { this.t += dt; if (opts.onTick) opts.onTick(a, dt, this.t); if (opts.until) return opts.until(a, this.t) || (opts.max && this.t > opts.max); return this.t >= this.dur; },
    stop(a) { a.lookAt = null; },
  }),
  call: (fn) => ({ start(a) { fn(a); }, tick() { return true; } }),
  wait: (until, max = 30) => ({ start() { this.t = 0; }, tick(a, dt) { this.t += dt; return until(a) || this.t > max; } }),
  status: (text) => ({ start(a) { a.setStatus(text); }, tick() { return true; } }),
};

/* ---------- agen ---------- */
export class Agent {
  constructor(ch, emp, office) {
    this.ch = ch; this.emp = emp; this.id = emp.id; this.office = office;
    this.queue = []; this.script = null; this.stepIdx = 0; this.step = null;
    this.status = ''; this.lookAt = null;
    this.away = false; this.arriveAt = 0;
    this.cooldown = {}; this.reservations = new Set();
    this.desk = null;
  }
  get role() { return this.emp.role; }
  setStatus(s) { this.status = s; }
  isFree() { return !this.away && (!this.script || this.script.kind === 'idle') && this.queue.length === 0; }

  // tambahkan skrip; skrip task/duty menyela aktivitas idle, kerja rutin, atau rehat sejenak
  enqueue(script, { front = false } = {}) {
    if (script.kind !== 'idle' && this.script && (this.script.kind === 'idle' || this.script.kind === 'work' || this.script.kind === 'break')) this.abort();
    if (front) this.queue.unshift(script); else this.queue.push(script);
  }
  abort() {
    if (!this.script) return;
    if (this.step && this.step.stop) this.step.stop(this);
    this.finishScript(true);
  }
  finishScript(aborted) {
    const s = this.script; this.script = null; this.step = null;
    for (const key of this.reservations) this.office.release(key, this.id);
    this.reservations.clear();
    this.lookAt = null;
    if (s && s.onEnd) s.onEnd(this, aborted);
    if (s && !s.keepProps) this.ch.props({});
  }
  reserve(key) { if (this.office.reserve(key, this.id)) { this.reservations.add(key); return true; } return false; }

  update(dt) {
    if (!this.script) {
      const next = this.queue.shift() || this.office.decide(this);
      if (!next) return;
      this.script = next; this.stepIdx = -1; this.step = null;
      if (next.onStart) next.onStart(this);
      if (next.status) this.setStatus(next.status);
      this.advance();
    }
    if (this.step && this.step.tick(this, dt)) this.advance();
  }
  advance() {
    this.stepIdx++;
    const steps = this.script.steps;
    if (this.stepIdx >= steps.length) { this.finishScript(false); return; }
    this.step = steps[this.stepIdx];
    this.step.start(this);
  }
}

/* ---------- pilihan aktivitas idle ---------- */
// Mengembalikan daftar kandidat {name, w, cd, make()} untuk satu agen.
export function idleOptions(a, O) {
  const P = O.world.POI;
  const opts = [];
  const desk = a.desk;
  const sitDesk = (status, dur) => ({ kind: 'idle', name: 'desk', status, steps: [S.sit(O.seatOf(a)), S.act('sit', { dur: dur || rand(15, 40), status })] });

  if (a.role === 'manager') {
    opts.push({ name: 'desk', w: 5, cd: 0, make: () => sitDesk(pick(['Membaca laporan', 'Memantau tim', 'Membalas email']), rand(25, 60)) });
    opts.push({ name: 'patrol', w: 0.8, cd: 240, make: () => {
      const target = pick(O.agents.filter((x) => x !== a && !x.away)) || null;
      if (!target) return null;
      const spot = { x: target.ch.pos.x + 0.9, z: target.ch.pos.z + 0.9 };
      return { kind: 'idle', name: 'patrol', status: 'Keliling melihat tim', steps: [S.walk(spot), S.faceTo(target.ch.pos), S.act('listenStand', { dur: rand(4, 7), lookAt: target.ch.pos }), S.status('Kembali ke ruangannya')] };
    } });
  } else {
    opts.push({ name: 'desk', w: 3, cd: 0, make: () => sitDesk(pick(['Merapikan catatan', 'Membaca dokumentasi', 'Cek pesan tim', 'Mencari referensi']), rand(15, 40)) });
  }
  if (a.role === 'coordinator') {
    opts.push({ name: 'tidyBoard', w: 1, cd: 200, make: () => {
      const spot = P.boardWrite.find((s, i) => a.reserve('board' + i)); if (!spot) return null;
      return { kind: 'idle', name: 'tidyBoard', status: 'Merapikan papan task', steps: [S.walk(spot), S.face(spot.rot), S.act('write', { dur: rand(3, 5), props: { marker: true } })] };
    } });
  }
  opts.push({ name: 'coffee', w: 2, cd: a.role === 'manager' ? 420 : 300, make: () => coffeeScript(a, O) });
  opts.push({ name: 'sofa', w: a.role === 'manager' ? 0.3 : 1.1, cd: 240, make: () => {
    const i = P.sofa.findIndex((s, k) => a.reserve('sofa' + k)); if (i < 0) return null;
    const s = P.sofa[i];
    return { kind: 'idle', name: 'sofa', status: 'Santai di sofa', steps: [S.sit({ seat: s, front: { x: s.x, z: s.z - 0.75 } }), S.act('sofa', { dur: rand(14, 28) })] };
  } });
  opts.push({ name: 'window', w: 1, cd: 180, make: () => {
    const i = P.windowSolo.findIndex((s, k) => a.reserve('win' + k)); if (i < 0) return null;
    const s = P.windowSolo[i];
    return { kind: 'idle', name: 'window', status: 'Melihat pemandangan kota', steps: [S.walk(s), S.face(s.rot), S.act('look', { dur: rand(8, 16) })] };
  } });
  opts.push({ name: 'stretch', w: 0.8, cd: 150, make: () => {
    const i = P.stretch.findIndex((s, k) => a.reserve('str' + k)); if (i < 0) return null;
    const s = P.stretch[i];
    return { kind: 'idle', name: 'stretch', status: 'Peregangan', steps: [S.walk(s), S.face(s.rot), S.act('stretch', { dur: rand(6, 9) })] };
  } });
  // aktivitas berdua / bertiga (butuh rekan yang juga sedang santai)
  const partners = O.agents.filter((x) => x !== a && x.isFree() && !x.workTask() && x.role !== 'manager' && O.atWork(x));
  if (partners.length && a.role !== 'manager') {
    opts.push({ name: 'chat', w: 1.1, cd: 240, make: () => pairScript(a, pick(partners), O, 'chat') });
    opts.push({ name: 'pingpong', w: 0.8, cd: 360, make: () => pairScript(a, pick(partners), O, 'pingpong') });
    if (partners.length >= 1) opts.push({ name: 'huddle', w: 0.45, cd: 480, make: () => huddleScript(a, partners.slice(0, 2), O) });
  }
  return opts;
}

export function coffeeScript(a, O) {
  const P = O.world.POI;
  const steps = [];
  // antre di mesin kopi: ambil posisi antrean paling depan yang kosong
  let qi = P.coffeeQueue.findIndex((s, k) => a.reserve('cq' + k));
  if (qi < 0) return null;
  const q = P.coffeeQueue[qi];
  steps.push(S.walk(q), S.face(q.rot));
  steps.push(S.act('stand', { status: 'Antre mesin kopi', until: (ag) => {
    // maju bila posisi di depan kosong
    for (let k = 0; k < qi; k++) if (!O.isReserved('cq' + k)) { O.release('cq' + qi, ag.id); ag.reservations.delete('cq' + qi); qi = k; ag.reserve('cq' + k); ag.ch.walkTo(P.coffeeQueue[k], () => ag.ch.face(0)); return false; }
    return qi === 0 && !ag.ch.curve;
  }, max: 40 }));
  steps.push(S.act('brew', { dur: rand(3, 4.5), status: 'Membuat kopi', onTick: () => O.coffeeMachineOn() }));
  steps.push(S.call((ag) => { O.release('cq0', ag.id); ag.reservations.delete('cq0'); ag.ch.props({ mug: true }); }));
  const di = P.coffeeDrink.findIndex((s, k) => a.reserve('cd' + k));
  if (di >= 0) { const d = P.coffeeDrink[di]; steps.push(S.walk(d), S.face(d.rot), S.act('drink', { dur: rand(7, 12), status: 'Minum kopi', props: { mug: true } })); }
  else steps.push(S.act('drink', { dur: 5, status: 'Minum kopi', props: { mug: true } }));
  return { kind: 'idle', name: 'coffee', status: 'Ambil kopi', steps };
}

function pairScript(a, b, O, kind) {
  const P = O.world.POI;
  if (kind === 'chat') {
    const idx = P.windowPairs.findIndex((_, k) => !O.isReserved('pair' + k));
    if (idx < 0) return null;
    const [sa, sb] = P.windowPairs[idx];
    a.reserve('pair' + idx);
    const together = (who, spot, other) => ({ kind: 'idle', name: 'chat', status: `Ngobrol dengan ${other.emp.name}`, steps: [
      S.walk(spot), S.faceTo(other === a ? sa : sb),
      S.wait(() => !other.ch.curve && Math.hypot(other.ch.pos.x - (other === a ? sa : sb).x, other.ch.pos.z - (other === a ? sa : sb).z) < 0.4, 20),
      S.act('talk', { dur: 16, lookAt: other.ch.pos }),
    ] });
    b.enqueue(together(b, sb, a));
    b.abort();
    return together(a, sa, b);
  }
  if (kind === 'pingpong') {
    if (O.isReserved('pp')) return null;
    a.reserve('pp');
    const [sa, sb] = P.pingpong;
    const play = (who, spot, other, side) => ({ kind: 'idle', name: 'pingpong', status: `Main ping-pong dengan ${other.emp.name}`, steps: [
      S.walk(spot), S.face(spot.rot), S.call((ag) => ag.ch.props({ paddle: true })),
      S.wait(() => !other.ch.curve && Math.hypot(other.ch.pos.x - (other === a ? sa : sb).x, other.ch.pos.z - (other === a ? sa : sb).z) < 0.5, 20),
      S.act('pingpong', { dur: 18, onTick: (ag, dt, t) => { if (side === 0) O.pingpongBall(t, sa, sb); } }),
      S.call((ag) => { if (side === 0) O.pingpongBall(-1); }),
    ], onEnd: (ag) => { if (side === 0) O.pingpongBall(-1); } });
    b.enqueue(play(b, sb, a, 1)); b.abort();
    return play(a, sa, b, 0);
  }
  return null;
}

function huddleScript(a, others, O) {
  const P = O.world.POI;
  if (O.isReserved('huddle')) return null;
  a.reserve('huddle');
  const members = [a, ...others].slice(0, 3);
  const make = (who, k) => ({ kind: 'idle', name: 'huddle', status: 'Rapat singkat di papan', steps: [
    S.walk(P.boardHuddle[k]), S.face(P.boardHuddle[k].rot),
    S.act('huddle', { dur: 14, lookAt: { x: O.world.board.x, z: O.world.board.z } }),
  ] });
  members.slice(1).forEach((m, i) => { m.enqueue(make(m, i + 1)); m.abort(); });
  return make(a, 0);
}

export function chooseIdle(a, O, now) {
  const opts = idleOptions(a, O).filter((o) => !(a.cooldown[o.name] > now));
  let total = opts.reduce((s, o) => s + o.w, 0);
  for (let tries = 0; tries < 4 && opts.length; tries++) {
    let r = Math.random() * total, chosen = opts[0];
    for (const o of opts) { if ((r -= o.w) <= 0) { chosen = o; break; } }
    const script = chosen.make();
    if (script) { a.cooldown[chosen.name] = now + chosen.cd; return script; }
    total -= chosen.w; opts.splice(opts.indexOf(chosen), 1);
  }
  return null;
}
