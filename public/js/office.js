// Kantor 3D: merender dunia, menggerakkan karyawan, dan menerjemahkan kegiatan & kondisi keuangan
// dari Arus menjadi animasi di antrean masing-masing karyawan.
import * as THREE from 'three';
import { api, LS } from './api.js';
import { createWorld, RX, RZ } from './scene.js';
import { Character, angDiff } from './characters.js';
import { Agent, S, chooseIdle, coffeeScript } from './behaviors.js';
import { rupiah, signed, shortRp, short, monthName } from './fmt.js';

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));

export function initOffice({ stage, onSelectEmployee }) {
  /* ---------- renderer ---------- */
  const canvas = $('#c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.useLegacyLights = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  const FOV = 30;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 800);
  const world = createWorld(scene);

  /* ---------- kualitas & daya ---------- */
  const QUALITY = {
    normal: { fps: 30, pr: Math.min(window.devicePixelRatio || 1, 1.5), shadow: true, shadowMap: 2048, screenHz: 5, lamps: 6, label: '30 fps' },
    eco: { fps: 24, pr: 1, shadow: false, shadowMap: 512, screenHz: 2, lamps: 2, label: 'Hemat · 24 fps' },
  };
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || matchMedia('(pointer: coarse)').matches;
  const ecoStored = LS.get('kantorAI.eco');
  let ecoOn = ecoStored === null ? weak : ecoStored === '1';
  const Q = () => (ecoOn ? QUALITY.eco : QUALITY.normal);
  function setEco(on, remember) {
    ecoOn = on; $('#eco').setAttribute('aria-pressed', on);
    if (remember) LS.set('kantorAI.eco', on ? '1' : '0');
    const q = Q();
    renderer.setPixelRatio(q.pr);
    renderer.shadowMap.enabled = q.shadow; world.sun.castShadow = q.shadow;
    if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
    world.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    scene.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) o.material.needsUpdate = true; });
    resize(); skyNow(); renderer.shadowMap.needsUpdate = true;
    $('#fps').textContent = paused ? 'Dijeda' : q.label;
  }
  $('#eco').addEventListener('click', () => setEco(!ecoOn, true));
  let paused = false, speed = Number(LS.get('kantorAI.speed')) || 1;
  $('#pause').addEventListener('click', (e) => { paused = !paused; e.currentTarget.setAttribute('aria-pressed', paused); e.currentTarget.textContent = paused ? 'Lanjut' : 'Jeda'; $('#fps').textContent = paused ? 'Dijeda' : Q().label; wake(); });
  document.querySelectorAll('.seg.mono button').forEach((b) => {
    b.setAttribute('aria-pressed', Number(b.dataset.s) === speed);
    b.addEventListener('click', () => { speed = Number(b.dataset.s); LS.set('kantorAI.speed', String(speed)); document.querySelectorAll('.seg.mono button').forEach((x) => x.setAttribute('aria-pressed', x === b)); });
  });
  function skyNow() {
    const s = world.applySky(Q().lamps);
    $('#sky').textContent = s.label;
    world.setPendants(world.lampOn > 0.1);
    renderer.toneMappingExposure = 1.05 + 0.15 * s.night;
    renderer.shadowMap.needsUpdate = true;
  }

  /* ---------- kamera ---------- */
  let az = Math.PI / 4 + 0.3, azT = Math.PI / 4, zoom = 0.8, zoomT = 0.95;
  const camTarget = new THREE.Vector3(0, 0, 0);
  let follow = false, selected = null, manualTarget = null;
  let W = 1, H = 1;
  function resize() { const r = stage.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); renderer.setSize(W, H, false); }
  new ResizeObserver(resize).observe(stage);
  function updateCamera(dt) {
    az = smooth(az, azT, 6, dt); zoom = smooth(zoom, zoomT, 7, dt);
    const want = follow && selected ? selected.ch.pos : manualTarget || { x: 0, z: 0 };
    camTarget.x = smooth(camTarget.x, want.x, 3.5, dt); camTarget.z = smooth(camTarget.z, want.z, 3.5, dt);
    const aspect = W / H, h = Math.max(21, 34 / aspect) / (follow && selected ? Math.max(zoom, 1.6) : zoom);
    camera.aspect = aspect; camera.updateProjectionMatrix();
    const el = 0.62, dist = (h / 2) / Math.tan(FOV / 2 * Math.PI / 180);
    camera.position.set(camTarget.x + dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), camTarget.z + dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(camTarget);
  }
  const clampZ = (z) => Math.min(3, Math.max(0.55, z));
  const ptrs = new Map(); let moved = 0, pinch0 = 0, zoom0 = 1;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoomT; } canvas.classList.add('dragging'); });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return; const prev = ptrs.get(e.pointerId); const dx = e.clientX - prev.x;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved += Math.abs(dx) + Math.abs(e.clientY - prev.y);
    if (ptrs.size === 1) azT -= dx * 0.008; else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; zoomT = clampZ(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0); }
  });
  const endPtr = (e) => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); if (!ptrs.size) canvas.classList.remove('dragging'); if (moved < 6 && e.type === 'pointerup') pick(e); };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomT = clampZ(zoomT * (1 - e.deltaY * 0.0012)); }, { passive: false });
  $('#rl').addEventListener('click', () => (azT += Math.PI / 4));
  $('#rr').addEventListener('click', () => (azT -= Math.PI / 4));
  $('#zi').addEventListener('click', () => (zoomT = clampZ(zoomT * 1.25)));
  $('#zo').addEventListener('click', () => (zoomT = clampZ(zoomT / 1.25)));
  function setFollow(on) { follow = on && !!selected; $('#cam-follow').setAttribute('aria-pressed', follow); $('#cam-overview').setAttribute('aria-pressed', !follow); }
  $('#cam-overview').addEventListener('click', () => setFollow(false));
  $('#cam-follow').addEventListener('click', () => { if (!selected) { const a = agents.find((x) => !x.away); if (a) select(a); } setFollow(true); });


  /* ---------- karyawan ---------- */
  const agents = [];
  const byId = new Map();
  const byRole = (role) => agents.find((x) => x.role === role);
  const reservations = new Map();
  let simT = 0;

  const O = {
    world, agents,
    reserve(key, id) { const cur = reservations.get(key); if (cur && cur !== id) return false; reservations.set(key, id); return true; },
    release(key, id) { if (reservations.get(key) === id) reservations.delete(key); },
    isReserved(key) { return reservations.has(key); },
    seatOf(a) { return { seat: a.desk.seat, front: a.desk.front, desk: a.desk }; },
    atWork: (a) => shouldBeHere(a),
    coffeeMachineOn() {},
    pingpongBall(t, sa, sb) {
      const ball = world.pingpongBall;
      if (t < 0) { ball.visible = false; return; }
      const period = 1.5, ph = (t % period) / period, dir = Math.floor(t / period) % 2;
      const u = dir ? 1 - ph : ph;
      ball.visible = true;
      ball.position.set(sa.x + 0.45 + (sb.x - sa.x - 0.9) * u, 0.85 + Math.abs(Math.sin(u * Math.PI * 2)) * 0.35, sa.z + Math.sin(u * 5) * 0.2);
    },
    decide: (a) => decide(a),
  };

  const finNow = () => { const f = api.state && api.state.finance; return f && f.enabled ? f : null; };
  const workHours = () => (api.state && api.state.workHours) || { start: 8, end: 17 };
  const inWorkHours = () => { const n = new Date(); const h = n.getHours() + n.getMinutes() / 60; const w = workHours(); return h >= w.start && h < w.end; };
  function hasDuty(a) {
    if (a.queue.some((s) => s.kind === 'task')) return true;
    if (a.script && a.script.kind === 'task') return true;
    return a.stayUntil > simT;
  }
  function shouldBeHere(a) { return inWorkHours() || hasDuty(a); }

  // urutan meja terbuka dari kiri ke kanan; Bendahara paling dekat dengan brankas
  const DESK_ORDER = ['planner', 'billing', 'savings', 'shopper', 'treasurer'];
  const DESK_LOOK = { planner: 'coordinator', shopper: 'designer' };
  function buildTeam(team) {
    let slot = 0;
    const order = [...team].sort((x, y) => (DESK_ORDER.indexOf(x.role) + 1 || 99) - (DESK_ORDER.indexOf(y.role) + 1 || 99));
    for (const emp of order) {
      const ch = new Character(scene, emp, world.nav);
      const a = new Agent(ch, emp, O);
      a.workTask = () => null;
      a.stayUntil = 0;
      if (emp.role === 'manager') a.desk = world.makeManagerDesk(emp.look.shirt);
      else a.desk = world.makeDesk(world.openDeskSlots[slot++ % world.openDeskSlots.length], DESK_LOOK[emp.role] || emp.role, emp.look.shirt);
      a.desk.owner = a;
      agents.push(a); byId.set(emp.id, a);
      makeLabel(a);
    }
    for (let i = slot; i < Math.min(world.openDeskSlots.length, slot + 1); i++) { const d = world.makeDesk(world.openDeskSlots[i], 'empty', 0x8a90a0); paintEmpty(d); }
    for (const a of agents) {
      const s = a.desk.seat;
      a.ch.place(s.x, s.z, s.rot); a.ch.sitting = true; a.ch.seat = O.seatOf(a); a.ch.act = 'sit';
      Object.assign(a.ch.pose, { hipL: { x: -1.52, v: 0 }, hipR: { x: -1.52, v: 0 }, kneeL: { x: 1.45, v: 0 }, kneeR: { x: 1.45, v: 0 }, rootY: { x: -0.075, v: 0 } });
      a.desk.chair.position.z = s.z + (a.desk.face === 's' ? -0.06 : 0.06);
      if (!shouldBeHere(a)) { a.away = true; a.ch.setVisible(false); a.ch.sitting = false; a.ch.seat = null; }
      a.setStatus(a.away ? 'Sudah pulang' : '');
      Object.assign(a.cooldown, { desk: rand(5, 40), workBreak: rand(60, 200), coffee: rand(60, 260), sofa: rand(40, 200), window: rand(30, 160), stretch: rand(30, 120), chat: rand(60, 200), pingpong: rand(90, 300), huddle: rand(120, 400), tidyBoard: rand(60, 200), patrol: rand(90, 240), vault: rand(60, 200) });
    }
    renderer.shadowMap.needsUpdate = true;
  }

  /* ---------- kerja rutin per bagian ---------- */
  const ROUTINE = {
    manager: ['Membaca ringkasan bulan', 'Memantau sisa jatah', 'Meninjau laporan keuangan'],
    planner: ['Memeriksa pemakaian anggaran', 'Menghitung sisa tiap pos', 'Merapikan rencana anggaran'],
    treasurer: ['Mencocokkan buku kas', 'Memeriksa saldo sumber dana', 'Merapikan catatan pengeluaran'],
    billing: ['Mengecek jadwal tagihan', 'Memeriksa cicilan berjalan', 'Mencocokkan tagihan kartu'],
    savings: ['Menghitung progres tabungan', 'Membandingkan instrumen investasi', 'Memperbarui target tabungan'],
    shopper: ['Menyusun daftar belanja', 'Membandingkan harga kebutuhan', 'Memeriksa split bill'],
  };
  function decide(a) {
    if (a.away) {
      if (shouldBeHere(a)) {
        if (!a.arriveAt) a.arriveAt = simT + (hasDuty(a) ? 0 : rand(0, 25));
        if (simT >= a.arriveAt) { a.arriveAt = 0; return arriveScript(a); }
      }
      return null;
    }
    if (!shouldBeHere(a)) return goHomeScript(a);
    if (a.script === null && a.lastKind === 'work' && !(a.cooldown.workBreak > simT) && Math.random() < 0.35) {
      const b = workBreak(a); if (b) { a.cooldown.workBreak = simT + rand(150, 320); a.lastKind = 'break'; return b; }
    }
    if (a.role === 'treasurer' && fin.enabled && !(a.cooldown.vault > simT) && Math.random() < 0.2) { const v = vaultCheckScript(a); if (v) { a.cooldown.vault = simT + rand(240, 420); return v; } }
    if (!(a.cooldown.desk > simT) && Math.random() < 0.55) {
      a.cooldown.desk = simT + rand(40, 110); a.lastKind = 'work';
      const st = (ROUTINE[a.role] || ['Bekerja'])[(Math.random() * 3) | 0];
      return { kind: 'work', name: 'routine', status: st, steps: [S.sit(O.seatOf(a)), S.act(Math.random() < 0.3 ? 'think' : 'type', { dur: rand(14, 30), status: st })] };
    }
    a.lastKind = 'idle';
    return chooseIdle(a, O, simT) || { kind: 'idle', name: 'desk', status: 'Di meja', steps: [S.sit(O.seatOf(a)), S.act('sit', { dur: rand(10, 20) })] };
  }

  /* ---------- rehat sejenak di sela kerja ---------- */
  function workBreak(a) {
    const P = world.POI, habits = a.emp.habits || [], opts = [];
    const add = (name, w, cd, make) => { if (!(a.cooldown['wb_' + name] > simT)) opts.push({ name, w, cd, make }); };
    if (habits.includes('merokok')) add('smoke', 3, 260, () => smokeScript(a));
    add('coffee', 2, 360, () => { const c = coffeeScript(a, O); if (c) { c.kind = 'break'; c.status = 'Rehat sebentar: ambil kopi'; } return c; });
    add('phone', 1.2, 300, () => phoneScript(a));
    add('water', 1, 240, () => ({ kind: 'break', name: 'water', status: 'Ambil air minum', steps: [
      S.walk(P.water), S.face(P.water.rot), S.act('brew', { dur: 2.2, status: 'Ambil air minum' }), S.call((ag) => ag.ch.props({ mug: true })),
      S.act('drink', { dur: rand(3, 5), props: { mug: true }, status: 'Minum air' }) ] }));
    add('stretch', 1, 200, () => ({ kind: 'break', name: 'stretch', status: 'Peregangan sebentar', steps: [
      S.stand(), S.face(a.desk.seat.rot), S.act('stretch', { dur: rand(5, 8), status: 'Peregangan sebentar' }) ] }));
    const mates = agents.filter((x) => x !== a && !x.away && x.role !== 'manager' && x.ch.sitting && x.ch.seat && x.ch.seat.desk === x.desk);
    if (mates.length) add('discuss', 1, 300, () => {
      const m = mates[(Math.random() * mates.length) | 0], sp = { x: m.desk.seat.x + 0.95, z: m.desk.seat.z + (m.desk.face === 's' ? -0.25 : 0.25) };
      return { kind: 'break', name: 'discuss', status: 'Diskusi dengan ' + m.emp.name, steps: [
        S.walk(sp), S.faceTo(m.ch.pos), S.act('talk', { dur: rand(8, 13), lookAt: m.ch.pos, status: 'Diskusi dengan ' + m.emp.name }) ] };
    });
    let total = opts.reduce((t, o) => t + o.w, 0);
    while (opts.length) {
      let r = Math.random() * total, c = opts[0];
      for (const o of opts) if ((r -= o.w) <= 0) { c = o; break; }
      const sc = c.make();
      if (sc) { a.cooldown['wb_' + c.name] = simT + c.cd; return sc; }
      total -= c.w; opts.splice(opts.indexOf(c), 1);
    }
    return null;
  }
  const v3 = new THREE.Vector3();
  function smokeScript(a) {
    const P = world.POI, ash = world.smokeRoom.ash;
    const k = P.smoke.findIndex((_, i) => a.reserve('smk' + i)); if (k < 0) return null;
    const spot = P.smoke[k];
    let wisp = 0, puffing = 0;
    return { kind: 'break', name: 'smoke', status: 'Rehat merokok sebentar', steps: [
      S.walk(spot), S.faceTo(ash), S.call((ag) => ag.ch.props({ cig: true })),
      S.act('smoke', { dur: rand(22, 34), props: { cig: true }, status: 'Merokok di ruang merokok',
        onTick: (ag, dt) => {
          if ((wisp -= dt) <= 0) { wisp = 0.45; ag.ch.R.cigTip.getWorldPosition(v3); world.puff(v3.x, v3.y + 0.02, v3.z); }
          if (ag.ch.exhaleT > 0.9 && (puffing -= dt) <= 0) { puffing = 0.12; ag.ch.R.mouth.getWorldPosition(v3); world.puff(v3.x + Math.sin(ag.ch.rot) * 0.08, v3.y, v3.z + Math.cos(ag.ch.rot) * 0.08, true); }
        } }),
      S.faceTo(ash), S.act('take', { dur: 1.0 }), S.call((ag) => ag.ch.props({})),
    ] };
  }
  function phoneScript(a) {
    const pairs = world.POI.phone;
    const k = pairs.findIndex((_, i) => a.reserve('ph' + i)); if (k < 0) return null;
    const [A, B] = pairs[k], who = ['klien', 'vendor', 'tim lain', 'keluarga'][(Math.random() * 4) | 0];
    const st = 'Menelepon ' + who;
    return { kind: 'break', name: 'phone', status: st, steps: [
      S.call((ag) => ag.ch.props({ phone: true })),
      S.walk(A), S.face(A.rot), S.act('phone', { dur: rand(5, 8), props: { phone: true }, status: st }),
      S.walk(B), S.face(B.rot), S.act('phone', { dur: rand(4, 7), props: { phone: true } }),
      S.walk(A), S.face(A.rot), S.act('phone', { dur: rand(3, 5), props: { phone: true } }),
      S.call((ag) => ag.ch.props({})),
    ] };
  }

  function arriveScript(a) {
    const li = Math.random() < 0.5 ? 0 : 1, L = world.lifts[li];
    return { kind: 'duty', name: 'arrive', status: 'Baru datang', steps: [
      S.call((ag) => { ag.ch.place(L.inside.x, L.inside.z, 0); ag.ch.sitting = false; ag.ch.seat = null; world.openLift(li, 2.5); }),
      S.wait(() => world.lifts[li].open > 0.7, 3),
      S.call((ag) => { ag.away = false; ag.ch.setVisible(true); }),
      S.walk(world.POI.liftCall), S.call((ag) => { ag.ch.wave(); ag.setStatus('Selamat pagi!'); }), S.act('stand', { dur: 1.2 }),
    ] };
  }
  function goHomeScript(a) {
    const li = Math.random() < 0.5 ? 0 : 1, L = world.lifts[li];
    return { kind: 'duty', name: 'home', status: 'Pulang', steps: [
      S.walk(world.POI.liftCall), S.call(() => world.openLift(li, 3.5)), S.walk(L.door), S.walk(L.inside),
      S.call((ag) => { ag.away = true; ag.ch.setVisible(false); ag.setStatus('Sudah pulang'); if (selected === ag) { setFollow(false); } }),
    ] };
  }

  /* ---------- keuangan (Arus) → brankas dan kegiatan per karyawan ---------- */
  const fin = { enabled: false, data: null, shown: new Map(), target: new Map(), seen: new Set(), first: true, unit: 100000, color: '#d8534f', labels: [], legend: null, counts: [], want: [], animT: 0, sigs: null, prevPockets: [], prevMasuk: null };
  const NOTE = [[1e4, '#9b6fb5'], [2e4, '#5fa36b'], [5e4, '#3f7fc4'], [1e5, '#d8534f']];
  const vaultPockets = () => (fin.data ? fin.data.pockets.filter((p) => !p.credit).slice(0, 8) : []);

  function chooseUnit(pockets) {
    const max = Math.max(0, ...pockets.map((p) => p.saldo));
    const steps = [1e4, 2e4, 5e4]; for (let e = 5; e < 13; e++) steps.push(10 ** e, 2 * 10 ** e, 5 * 10 ** e);
    const unit = steps.find((u) => max / u <= 96) || steps[steps.length - 1];
    fin.unit = unit; fin.color = (NOTE.find(([u]) => unit <= u) || NOTE[3])[1];
  }
  const bundlesFor = (v) => (v > 0 ? Math.min(120, Math.max(1, Math.round(v / fin.unit))) : 0);
  function showVault(on) {
    world.showVaultSlots(on ? vaultPockets().length : 0);
    if (!on) { world.setVault([], fin.color); fin.counts = []; fin.want = []; }
    for (const L of fin.labels) L.el.classList.toggle('hide', !on || L.hidden);
    if (fin.legend) fin.legend.el.classList.toggle('hide', !on);
  }
  function syncLabels() {
    const ps = vaultPockets();
    while (fin.labels.length < ps.length) {
      const el = document.createElement('div'); el.className = 'mtag'; el.innerHTML = '<b></b><span class="amt"></span>'; labels.appendChild(el);
      fin.labels.push({ el, nm: el.querySelector('b'), amt: el.querySelector('.amt'), idx: fin.labels.length, slot: world.vaultSlots[fin.labels.length], count: 0, hidden: false, last: null });
    }
    fin.labels.forEach((L, i) => {
      const p = ps[i]; L.hidden = !p; L.el.classList.toggle('hide', !p); if (!p) return;
      L.nm.textContent = p.name;
      const v = fin.shown.get(p.id) ?? p.saldo;
      if (L.last !== v) { if (L.last !== null) { L.el.classList.add('flash'); setTimeout(() => L.el.classList.remove('flash'), 1400); } L.last = v; L.amt.textContent = rupiah(v); L.el.classList.toggle('neg', v < 0); }
    });
    if (!fin.legend) { const el = document.createElement('div'); el.className = 'mtag legend'; labels.appendChild(el); fin.legend = { el, hidden: false, legendOnly: true, slot: { x: 13.35, z: -2.55 } }; }
    fin.legend.el.innerHTML = '1 ikat ≈ <span class="amt">Rp ' + shortRp(fin.unit) + '</span>';
  }
  function refreshVault() {
    const ps = vaultPockets();
    fin.want = ps.map((p) => bundlesFor(fin.shown.get(p.id) ?? p.saldo));
    fin.labels.forEach((L, i) => { L.count = fin.want[i] || 0; });
    syncLabels();
  }
  function animateVault(dt) {
    if (!fin.want.length && !fin.counts.length) return;
    fin.animT -= dt; if (fin.animT > 0) return; fin.animT = 0.045;
    let changed = false;
    const n = Math.max(fin.want.length, fin.counts.length);
    for (let i = 0; i < n; i++) {
      const c = fin.counts[i] || 0, w = fin.want[i] || 0;
      if (c !== w) { fin.counts[i] = c + Math.sign(w - c) * Math.max(1, Math.round(Math.abs(w - c) / 12)); changed = true; }
    }
    fin.counts.length = fin.want.length;
    if (changed) world.setVault(fin.counts, fin.color);
  }
  function applyPocket(id) {
    const p = fin.data && fin.data.pockets.find((x) => x.id === id); if (!p) return;
    fin.shown.set(id, p.saldo); fin.target.delete(id); refreshVault();
  }

  // Perubahan tanpa waktu dibuat (edit/hapus) dideteksi lewat sidik jari data dari server.
  function syntheticEvents(f, fresh, prevSigs) {
    const out = [], has = (pred) => fresh.some(pred);
    if (!prevSigs || !f.sigs) return out;
    const ch = (k) => prevSigs[k] !== f.sigs[k];
    if (ch('bills') && !has((e) => e.who === 'billing')) out.push({ id: 'sb' + f.sigs.bills, type: 'bill-edit', who: 'billing', label: 'Data tagihan diperbarui', amount: 0 });
    if (ch('pockets') && !has((e) => ['transfer', 'adjust', 'pocket-new'].includes(e.type))) {
      const renamed = f.pockets.find((p) => { const o = fin.prevPockets.find((x) => x.id === p.id); return !o || o.name !== p.name; });
      out.push({ id: 'sp' + f.sigs.pockets, type: 'pocket-edit', who: 'treasurer', label: renamed ? 'Sumber dana: ' + renamed.name : 'Sumber dana diperbarui', amount: 0, pocketId: renamed ? renamed.id : null });
    }
    if (ch('budget')) out.push({ id: 'sbg' + f.sigs.budget, type: 'budget-edit', who: 'planner', label: 'Anggaran diperbarui', amount: 0 });
    if (ch('goals') && !has((e) => e.who === 'savings')) out.push({ id: 'sg' + f.sigs.goals, type: 'goal-edit', who: 'savings', label: 'Target tabungan diperbarui', amount: 0 });
    if (ch('needs') && !has((e) => e.who === 'shopper')) out.push({ id: 'sn' + f.sigs.needs, type: 'need-edit', who: 'shopper', label: 'List kebutuhan diperbarui', amount: 0 });
    if (ch('income')) {
      const d = fin.prevMasuk == null ? 0 : f.summary.masuk - fin.prevMasuk;
      out.push({ id: 'si' + f.sigs.income, type: d > 0 ? 'income' : 'income-edit', who: 'manager', label: d > 0 ? 'Pemasukan masuk' : 'Pemasukan diperbarui', amount: d > 0 ? d : 0 });
    }
    return out;
  }

  let busyRoles = new Set();
  function handleFinance(f) {
    if (!f || !f.enabled) { fin.enabled = false; fin.data = null; showVault(false); return; }
    const firstTime = fin.first;
    fin.enabled = true; fin.data = f;
    const ps = vaultPockets();
    const oldUnit = fin.unit; chooseUnit(ps);
    if (oldUnit !== fin.unit) fin.counts = [];
    for (const p of ps) if (!fin.shown.has(p.id)) fin.shown.set(p.id, p.saldo);
    showVault(true);
    const fresh = f.events.filter((e) => !fin.seen.has(e.id));
    f.events.forEach((e) => fin.seen.add(e.id));
    const prevSigs = fin.sigs;
    if (!firstTime) fresh.push(...syntheticEvents(f, fresh, prevSigs));
    fin.sigs = f.sigs; fin.prevPockets = f.pockets.map((p) => ({ id: p.id, name: p.name })); fin.prevMasuk = f.summary.masuk;
    if (firstTime) { fin.first = false; refreshVault(); onFinanceState(f, true); return; }
    const changed = ps.filter((p) => fin.shown.get(p.id) !== p.saldo && fin.target.get(p.id) !== p.saldo);
    changed.forEach((p) => fin.target.set(p.id, p.saldo));
    refreshVault();
    busyRoles = new Set();
    routeEvents(fresh.reverse(), changed);
    onFinanceState(f, false);
  }

  // Setiap kegiatan diurus karyawan yang memegang bagiannya; pengeluaran juga dicatat Perencana Anggaran ke posnya.
  function routeEvents(events, changed) {
    const groups = new Map();
    const push = (role, e) => { if (!groups.has(role)) groups.set(role, []); groups.get(role).push(e); };
    for (const e of events) {
      push(e.who, e);
      if (e.type === 'expense' && e.budgetItemId) push('planner', { ...e, id: e.id + ':p', type: 'budget-use' });
    }
    if (changed.length && !groups.has('treasurer')) groups.set('treasurer', []);
    busyRoles = new Set();
    for (const [role, evs] of groups) {
      const a = byRole(role);
      if (!a) { if (role === 'treasurer') changed.forEach((p) => applyPocket(p.id)); continue; }
      ensureHere(a); busyRoles.add(role);
      a.enqueue(roleScript(a, evs.slice(-5), role === 'treasurer' ? changed : []));
    }
  }

  const VERB = {
    expense: (e) => 'Mencatat: ' + short(e.label, 24) + ' ' + signed(e.amount),
    'budget-use': (e) => 'Pos anggaran: ' + short(e.label, 22) + ' ' + signed(e.amount),
    'budget-edit': () => 'Menyusun ulang anggaran',
    'bill-pay': (e) => short(e.label, 26) + ' ' + signed(e.amount),
    'bill-paid': (e) => short(e.label, 30),
    'bill-new': (e) => short(e.label, 30),
    'bill-edit': () => 'Memperbarui data tagihan',
    saving: (e) => short(e.label, 24) + ' ' + rupiah(Math.abs(e.amount)),
    'goal-edit': () => 'Memperbarui target tabungan',
    need: (e) => short(e.label, 24) + ' ' + rupiah(Math.abs(e.amount)),
    'need-edit': () => 'Memperbarui list kebutuhan',
    split: (e) => short(e.label, 26),
    transfer: (e) => short(e.label, 28),
    adjust: (e) => short(e.label, 28),
    'pocket-new': (e) => short(e.label, 30),
    'pocket-edit': (e) => short(e.label, 30),
    income: (e) => 'Pemasukan masuk ' + signed(e.amount),
    'income-edit': () => 'Memeriksa pemasukan bulan ini',
  };
  function roleScript(a, events, changed) {
    const steps = [S.sit(O.seatOf(a))];
    for (const e of events) steps.push(S.call((ag) => (ag.curEv = e.id)), S.act('type', { dur: rand(2.4, 3.4), status: (VERB[e.type] || ((x) => short(x.label, 30)))(e) }));
    if (!events.length) steps.push(S.act('type', { dur: 2, status: 'Mencocokkan saldo dengan Arus' }));
    steps.push(S.call((ag) => (ag.curEv = null)));
    steps.push(...followUp(a, events, changed));
    return { kind: 'task', name: 'finance', status: 'Ada kegiatan baru di Arus', steps,
      onEnd: (ag) => { ag.curEv = null; for (const p of changed) if (fin.target.has(p.id)) applyPocket(p.id); } };
  }

  // Langkah lanjutan per peran (objek kantor). Tahap berikutnya menambah objek untuk peran lain.
  function followUp(a, events, changed) {
    const steps = [], ps = vaultPockets();
    if (a.role === 'treasurer') {
      for (const e of events.filter((x) => (x.type === 'pocket-new' || x.type === 'pocket-edit') && x.pocketId && !changed.some((p) => p.id === x.pocketId))) {
        const i = ps.findIndex((p) => p.id === e.pocketId), slot = world.vaultSlots[i]; if (!slot || i < 0) continue;
        steps.push(S.walk(slot.front), S.face(slot.front.rot), S.act('listenStand', { dur: 2.2, status: 'Memeriksa sumber dana ' + ps[i].name }));
      }
      for (const p of changed) {
        const i = ps.indexOf(p), slot = world.vaultSlots[i]; if (!slot || i < 0) continue;
        const delta = p.saldo - (fin.shown.get(p.id) ?? p.saldo), add = delta > 0;
        steps.push(
          S.call((ag) => { ag.ch.props({ paper: add }); ag.setStatus((add ? 'Menyimpan ' : 'Mengambil ') + rupiah(Math.abs(delta)) + (add ? ' ke ' : ' dari ') + p.name); }),
          S.walk(slot.front), S.face(slot.front.rot), S.act('take', { dur: 1.4 }),
          S.call((ag) => { applyPocket(p.id); ag.ch.props({ paper: !add }); ag.setStatus('Saldo ' + p.name + ': ' + rupiah(p.saldo)); }),
          S.act('stand', { dur: 0.8 }),
        );
      }
    }
    const marker = (spot, status, dur, after) => [S.call((ag) => ag.setStatus(status)), S.walk(spot), S.face(spot.rot), S.act('write', { dur, props: { marker: true } }), S.call(after), S.call((ag) => ag.ch.props({}))];
    if (a.role === 'planner' && events.length) {
      const spots = world.POI.boardWrite, sp = spots[(Math.random() * spots.length) | 0], e = events[events.length - 1];
      steps.push(...marker(sp, e.type === 'budget-use' ? 'Memperbarui pos anggaran di papan' : 'Menulis ulang Papan Anggaran', 2.6, () => drawObj('board')));
    }
    if (a.role === 'billing' && events.length) {
      const e = events[events.length - 1];
      const st = e.type === 'bill-paid' || e.type === 'bill-pay' ? 'Mencoret tagihan lunas di kalender' : e.type === 'bill-new' ? 'Menandai tagihan baru di kalender' : 'Memperbarui kalender tagihan';
      steps.push(...marker(world.POI.calendarWrite, st, 2.2, () => drawObj('calendar')));
    }
    if (a.role === 'savings' && events.length) {
      const f = finNow(), e = events.find((x) => x.goalId) || events[events.length - 1];
      const gi = f ? Math.max(0, f.goals.findIndex((g) => g.id === e.goalId)) : 0, jar = world.jarSlots[Math.min(gi, 4)];
      steps.push(S.call((ag) => { ag.ch.props({ paper: true }); ag.setStatus(e.type === 'saving' ? (e.amount > 0 ? 'Mengambil dari celengan' : 'Mengisi celengan') : 'Memperbarui rak celengan'); }),
        S.walk(jar.front), S.face(jar.front.rot), S.act('take', { dur: 1.4 }),
        S.call((ag) => { ag.ch.props({}); const reached = drawObj('jars'); if (reached.length) { const j = world.jarSlots[reached[0]]; world.confetti(j.x, 1.6, j.z); ag.ch.cheer(); ag.setStatus('Target tabungan tercapai!'); } }),
        S.act('stand', { dur: 1 }));
    }
    if (a.role === 'shopper' && events.length) {
      const bought = events.some((e) => e.type === 'need');
      steps.push(S.call((ag) => ag.setStatus(bought ? 'Mengeluarkan barang dari troli' : 'Merapikan troli belanja')),
        S.walk(trolleyFront()), S.face(trolleyFront().rot), S.act('take', { dur: 1.3 }), S.call(() => drawObj('trolley')));
      const aci = byRole('treasurer');
      if (bought && aci) {
        steps.push(S.call((ag) => { ag.ch.props({ paper: true }); ag.setStatus('Menyerahkan struk ke ' + aci.emp.name); }),
          { start(ag) { this.done = false; const d = aci.desk; ag.ch.walkTo({ x: d.seat.x - 0.95, z: d.seat.z + (d.face === 's' ? -0.25 : 0.25) }, () => (this.done = true)); }, tick() { return this.done; } },
          { start(ag) { ag.ch.faceTo(aci.ch.pos.x, aci.ch.pos.z); this.t = 0; }, tick(ag, dt) { return (this.t += dt) > 0.4; } },
          S.act('take', { dur: 1.1 }), S.call((ag) => { ag.ch.props({}); ag.setStatus('Struk sudah diserahkan'); }));
      }
    }
    if (a.role === 'manager' && events.some((e) => e.type === 'income')) {
      steps.push(S.call((ag) => { ag.ch.cheer(); ag.setStatus('Pemasukan masuk!'); }), S.act('sit', { dur: 1.5 }));
    }
    return steps;
  }
  function vaultCheckScript(a) {
    const ps = vaultPockets(); if (!ps.length) return null;
    const i = (Math.random() * ps.length) | 0, slot = world.vaultSlots[i], p = ps[i];
    return { kind: 'idle', name: 'vault', status: 'Menghitung uang di brankas', steps: [S.walk(slot.front), S.face(slot.front.rot), S.act('listenStand', { dur: rand(4, 6), status: 'Menghitung uang ' + p.name })] };
  }
  /* ---------- objek kantor: digambar ulang saat karyawannya selesai mengurus, atau langsung bila tidak ada yang perlu diurus ---------- */
  const OBJ_ROLE = { board: 'planner', calendar: 'billing', jars: 'savings', trolley: 'shopper' };
  const jarTags = [];
  let jarDone = [];
  const trolleyFront = () => (world.trolley.position.x === world.trolleyHome.x ? world.POI.trolleyHomeFront : world.POI.trolleyReadyFront);
  function drawObj(kind) {
    const f = finNow(); if (!f) return [];
    if (kind === 'board') {
      world.drawBudgetBoard({ month: monthName(f.today.ym), items: f.budget.filter((b) => b.grp === 'kebutuhan' || b.grp === 'gaya_hidup'), sisaJatah: f.summary.sisaJatah, safeToday: f.summary.safeToday, hariSisa: f.summary.hariSisa, level: f.status.level, hasPlan: f.status.hasPlan, hide: hidden() });
    }
    if (kind === 'calendar') {
      world.drawCalendar({ ym: f.today.ym, monthName: monthName(f.today.ym), todayDay: f.today.day, bills: f.bills.filter((b) => b.status !== 'dilewati') });
      world.calendarAlarm = f.bills.some((b) => b.status === 'terlambat');
    }
    if (kind === 'jars') {
      const goals = f.goals.slice(0, 5), reached = [];
      world.setJars(goals.map((g, i) => { const done = g.target > 0 && g.saldo >= g.target; if (done && jarDone[i] === false) reached.push(i); return { p: g.target > 0 ? g.saldo / g.target : 0, done }; }));
      jarDone = goals.map((g) => g.target > 0 && g.saldo >= g.target);
      goals.forEach((g, i) => {
        if (!jarTags[i]) { const el = document.createElement('div'); el.className = 'mtag'; el.innerHTML = '<b></b><span class="amt"></span>'; labels.appendChild(el); jarTags[i] = { el, nm: el.querySelector('b'), amt: el.querySelector('.amt'), slot: world.jarSlots[i], hidden: false, jar: true }; }
        const T = jarTags[i]; T.hidden = false; T.el.classList.remove('hide'); T.nm.textContent = short(g.name, 12);
        T.amt.textContent = g.target > 0 ? Math.round((g.saldo / g.target) * 100) + '%' : rupiah(g.saldo);
      });
      for (let i = goals.length; i < jarTags.length; i++) { jarTags[i].hidden = true; jarTags[i].el.classList.add('hide'); }
      return reached;
    }
    if (kind === 'trolley') world.setTrolleyItems(f.needs.filter((x) => !x.bought).length);
    return [];
  }
  function onFinanceState(f, first) {
    for (const [kind, role] of Object.entries(OBJ_ROLE)) if (first || !busyRoles.has(role) || !byRole(role)) drawObj(kind);
    if (!first && busyRoles.has('planner') === false) drawObj('board');
  }
  new MutationObserver(() => { drawObj('board'); for (const a of agents) paintMonitor(a); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });


  /* ---------- data → kantor ---------- */
  let teamBuilt = false;
  api.on('state', (next) => stateHandler(next));
  function stateHandler(next) {
    if (!next || !next.team) return;
    if (!teamBuilt) { buildTeam(next.team); teamBuilt = true; }
    handleFinance(next.finance);
  }
  function ensureHere(a) {
    if (!a) return;
    a.stayUntil = simT + 90;
    if (a.away && !a.queue.some((s) => s.name === 'arrive') && !(a.script && a.script.name === 'arrive')) { a.arriveAt = 0; a.queue.unshift(arriveScript(a)); }
    if (a.script && a.script.name === 'home') { a.abort(); a.away = false; a.ch.setVisible(true); }
  }

  /* ---------- monitor: setiap karyawan membuka bagian Arus miliknya ---------- */
  const hidden = () => document.body.classList.contains('blur');
  const money = (v) => (hidden() ? 'Rp •••' : rupiah(v));
  const pctOf = (a, b) => (b > 0 ? a / b : 0);
  function paintEmpty(d) {
    const g = d.tex.userData.g; g.fillStyle = '#0b0e17'; g.fillRect(0, 0, 256, 160); g.fillStyle = '#39415c'; g.font = '700 18px sans-serif'; g.fillText('Meja kosong', 72, 86); d.tex.needsUpdate = true;
  }
  function row(g, y, left, right, color, hot) {
    if (hot) { g.fillStyle = 'rgba(255,209,102,.18)'; g.fillRect(6, y - 11, 244, 14); }
    g.font = '600 11px sans-serif'; g.fillStyle = hot ? '#ffffff' : '#c9cfdd'; g.fillText(short(left, 22), 12, y);
    g.fillStyle = color || '#c9cfdd'; g.fillText(right, 244 - g.measureText(right).width, y);
  }
  function bar(g, x, y, w, p, color) {
    g.fillStyle = '#262d3d'; g.fillRect(x, y, w, 5);
    g.fillStyle = color; g.fillRect(x, y, w * Math.max(0, Math.min(1, p)), 5);
  }
  const SCREEN_TITLE = { manager: 'ringkasan · Arus', planner: 'anggaran · Arus', treasurer: 'buku kas · Arus', billing: 'tagihan · Arus', savings: 'tabungan · Arus', shopper: 'kebutuhan · Arus' };
  function drawScreen(g, a, f) {
    const w = 256, hot = (e) => a.curEv && (a.curEv === e.id || a.curEv.startsWith(e.id));
    g.fillStyle = '#8a92a8'; g.font = '600 10px sans-serif'; g.fillText(SCREEN_TITLE[a.role] || 'Arus', 46, 11);
    if (!f) { g.fillStyle = '#e6e8ef'; g.font = '700 14px sans-serif'; g.fillText('Belum terhubung ke Arus', 34, 84); return; }
    const S = f.summary;
    if (a.role === 'manager') {
      const lv = f.status.level, col = lv === 'kritis' ? '#ff8a80' : lv === 'waspada' ? '#ffb27a' : '#5cc184';
      g.fillStyle = col; g.font = '800 15px sans-serif'; g.fillText('STATUS: ' + lv.toUpperCase(), 12, 36);
      g.fillStyle = '#8a92a8'; g.font = '600 10px sans-serif'; g.fillText('SISA JATAH', 12, 60); g.fillText('AMAN HARI INI', 136, 60);
      g.fillStyle = '#ffd166'; g.font = '700 15px sans-serif'; g.fillText(money(S.sisaJatah), 12, 78); g.fillText(money(S.safeToday), 136, 78);
      g.fillStyle = '#c9cfdd'; g.font = '500 10px sans-serif'; g.fillText(`${S.hariSisa} hari lagi`, 12, 92); g.fillText('terpakai ' + money(S.spentToday), 136, 92);
      f.status.reasons.slice(0, 3).forEach((r, i) => { g.fillStyle = '#ffb27a'; g.font = '500 10px sans-serif'; g.fillText('• ' + short(r, 40), 12, 112 + i * 14); });
      return;
    }
    if (a.role === 'treasurer') {
      const total = f.pockets.filter((p) => !p.credit).reduce((t, p) => t + p.saldo, 0);
      g.fillStyle = '#8a92a8'; g.font = '600 10px sans-serif'; g.fillText('TOTAL SALDO', 12, 32);
      g.fillStyle = '#ffd166'; g.font = '700 17px sans-serif'; g.fillText(money(total), 12, 51);
      g.fillStyle = '#8a92a8'; g.font = '500 10px sans-serif'; g.fillText('keluar bln ini ' + money(S.spent), 140, 32);
      f.events.filter((e) => e.who === 'treasurer').slice(0, 6).forEach((e, i) => row(g, 72 + i * 15, e.label, e.amount ? (hidden() ? '•••' : signed(e.amount)) : '', e.amount < 0 ? '#ff8a8a' : '#5cc184', hot(e)));
      return;
    }
    if (a.role === 'planner') {
      const items = f.budget.filter((b) => b.grp === 'kebutuhan' || b.grp === 'gaya_hidup').slice(0, 6);
      if (!items.length) { g.fillStyle = '#e6e8ef'; g.font = '600 12px sans-serif'; g.fillText('Anggaran bulan ini belum diisi', 30, 84); return; }
      items.forEach((b, i) => {
        const y = 32 + i * 21, p = pctOf(b.spent, b.amount), hotRow = a.curEv && f.events.some((e) => e.budgetItemId === b.id && a.curEv.startsWith(e.id));
        if (hotRow) { g.fillStyle = 'rgba(255,209,102,.18)'; g.fillRect(6, y - 11, 244, 21); }
        g.fillStyle = '#c9cfdd'; g.font = '600 10.5px sans-serif'; g.fillText(short(b.label, 20), 12, y);
        const t = Math.round(p * 100) + '%'; g.fillStyle = p >= 1 ? '#ff8a80' : p >= 0.8 ? '#ffb27a' : '#9aa3b8'; g.fillText(t, 244 - g.measureText(t).width, y);
        bar(g, 12, y + 4, 232, p, p >= 1 ? '#e05a4f' : p >= 0.8 ? '#e3a14a' : '#5cc184');
      });
      return;
    }
    if (a.role === 'billing') {
      const C = { lunas: '#5cc184', terlambat: '#ff8a80', hari_ini: '#ffb27a', besok: '#ffd166', nanti: '#9aa3b8', dilewati: '#5b6276' };
      const L = { lunas: 'lunas', terlambat: 'telat', hari_ini: 'hari ini', besok: 'besok', nanti: '', dilewati: 'lewati' };
      f.bills.slice(0, 8).forEach((b, i) => row(g, 32 + i * 15, `${b.dueDay} · ${b.name}`, L[b.status] || (hidden() ? '•••' : shortRp(b.amount)), C[b.status], a.curEv && f.events.some((e) => e.billId === b.id && a.curEv === e.id)));
      if (!f.bills.length) { g.fillStyle = '#e6e8ef'; g.font = '600 12px sans-serif'; g.fillText('Tidak ada tagihan bulan ini', 40, 84); }
      return;
    }
    if (a.role === 'savings') {
      f.goals.slice(0, 5).forEach((x, i) => {
        const y = 32 + i * 24, p = pctOf(x.saldo, x.target), hotRow = a.curEv && f.events.some((e) => e.goalId === x.id && a.curEv === e.id);
        if (hotRow) { g.fillStyle = 'rgba(255,209,102,.18)'; g.fillRect(6, y - 11, 244, 23); }
        g.fillStyle = '#c9cfdd'; g.font = '600 10.5px sans-serif'; g.fillText(short(x.name, 20), 12, y);
        const t = x.target ? Math.round(p * 100) + '%' : money(x.saldo); g.fillStyle = '#9aa3b8'; g.fillText(t, 244 - g.measureText(t).width, y);
        bar(g, 12, y + 5, 232, p, p >= 1 ? '#ffd166' : '#7c8cff');
      });
      if (!f.goals.length) { g.fillStyle = '#e6e8ef'; g.font = '600 12px sans-serif'; g.fillText('Belum ada target tabungan', 44, 84); }
      return;
    }
    if (a.role === 'shopper') {
      const list = [...f.needs].sort((x, y) => (x.bought - y.bought) || (y.due - x.due)).slice(0, 8);
      list.forEach((x, i) => {
        const y = 32 + i * 15;
        g.strokeStyle = x.bought ? '#5cc184' : x.due ? '#ffb27a' : '#5b6276'; g.lineWidth = 1.5; g.strokeRect(12, y - 9, 9, 9);
        if (x.bought) { g.fillStyle = '#5cc184'; g.fillRect(14, y - 7, 5, 5); }
        g.fillStyle = x.bought ? '#6b7387' : '#c9cfdd'; g.font = '600 11px sans-serif'; g.fillText(short(x.name, 20), 28, y);
        const t = x.bought ? 'dibeli' : x.due ? 'beli!' : (hidden() ? '•••' : shortRp(x.est)); g.fillStyle = x.due && !x.bought ? '#ffb27a' : '#9aa3b8'; g.fillText(t, 244 - g.measureText(t).width, y);
      });
      if (!list.length) { g.fillStyle = '#e6e8ef'; g.font = '600 12px sans-serif'; g.fillText('List kebutuhan kosong', 56, 84); }
    }
  }
  function paintMonitor(a) {
    const d = a.desk, g = d.tex.userData.g, w = 256, h = 160, ac = a.emp.look.shirt;
    const atDesk = a.ch.sitting && a.ch.seat && a.ch.seat.desk === d && !a.away;
    g.fillStyle = '#0b0e17'; g.fillRect(0, 0, w, h);
    if (a.away) { d.tex.needsUpdate = true; return; }
    if (!atDesk) {
      const px = w / 2 + Math.sin(a.ch.t * 0.7) * 70, py = h / 2 + Math.cos(a.ch.t * 0.9) * 40;
      g.fillStyle = ac; g.globalAlpha = 0.5; g.beginPath(); g.arc(px, py, 10, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.fillStyle = '#5b6276'; g.font = '600 12px sans-serif'; g.fillText(a.emp.name.toUpperCase(), 12, h - 12);
      d.tex.needsUpdate = true; return;
    }
    g.fillStyle = '#141a26'; g.fillRect(0, 16, w, h - 16);
    g.fillStyle = '#1d2335'; g.fillRect(0, 0, w, 16);
    ['#ff6b6b', '#ffd166', '#5cc184'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(10 + i * 11, 8, 3, 0, Math.PI * 2); g.fill(); });
    drawScreen(g, a, finNow());
    // kursor berkedip saat sedang mengetik
    if (a.ch.act === 'type' && (a.ch.burst > 0 || Math.floor(simT * 2.2) % 2 === 0)) { g.fillStyle = ac; g.fillRect(12, h - 12, 60 + ((simT * 40) % 120), 3); }
    d.tex.needsUpdate = true;
  }

  /* ---------- label nama ---------- */
  const labels = $('#labels');
  function makeLabel(a) {
    const el = document.createElement('div'); el.className = 'tag'; el.style.setProperty('--c', a.emp.look.shirt);
    el.innerHTML = '<span class="st"></span><span class="pg" hidden><i></i></span><span class="nm"></span>';
    el.querySelector('.nm').textContent = a.emp.name;
    labels.appendChild(el);
    a.label = { el, st: el.querySelector('.st'), pg: el.querySelector('.pg'), last: '' };
  }
  const tmp = new THREE.Vector3();
  function placeLabels() {
    const far = zoom < 0.9 && !follow;
    for (const a of agents) {
      const L = a.label;
      L.el.classList.toggle('away', a.away);
      if (a.away) continue;
      tmp.copy(a.ch.pos); tmp.y = a.ch.sitting ? 1.62 : 1.82; tmp.project(camera);
      L.el.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%, -100%)`;
      L.el.style.zIndex = String(1000 + Math.round(-tmp.z * 500));
      const working = !!a.script && (a.script.kind === 'work' || a.script.kind === 'task');
      L.el.classList.toggle('far', far && selected !== a && !working);
      if (L.last !== a.status) { L.st.textContent = a.status; L.last = a.status; }
      L.pg.hidden = !working;
    }
  }

  function placeMoneyLabels() {
    for (const L of [...fin.labels, ...(fin.legend ? [fin.legend] : []), ...jarTags]) {
      if (!L || L.hidden || !fin.enabled) continue;
      if (L.jar) { const far = zoom < 1.25 && !follow; L.el.style.display = far ? 'none' : ''; if (far) continue; }
      tmp.set(L.slot.x, L.jar ? L.slot.y : L.legendOnly ? 1.62 : world.vaultTopY(L.idx, L.count) + 0.12, L.slot.z); tmp.project(camera);
      const off = tmp.z > 1 || Math.abs(tmp.x) > 1.2 || Math.abs(tmp.y) > 1.2;
      L.el.style.visibility = off ? 'hidden' : '';
      L.el.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  /* ---------- pilih karyawan ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const vis = agents.filter((a) => !a.away);
    const hits = ray.intersectObjects(vis.map((a) => a.ch.group), true);
    if (hits.length) { const a = vis.find((ag) => { let o = hits[0].object; while (o) { if (o === ag.ch.group) return true; o = o.parent; } return false; }); select(a); }
    else select(null);
  }
  function select(a) {
    selected = a || null;
    ring.visible = !!a;
    if (a) ring.material.color.set(a.emp.look.shirt);
    else setFollow(false);
    onSelectEmployee && onSelectEmployee(a ? a.id : null, a ? a.status : '');
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.56, 40), new THREE.MeshBasicMaterial({ color: 0x3546c4, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);

  /* ---------- loop ---------- */
  let running = false, last = 0, screenT = 0, profileT = 0, skyT = 0, slowFrames = 0, shadowFlip = 0;
  let visible = document.visibilityState !== 'hidden', onScreen = true;
  function wake() { if (!running && visible && onScreen) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', () => { visible = document.visibilityState !== 'hidden'; if (visible) { skyNow(); wake(); } });
  new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; if (onScreen) wake(); }).observe(stage);

  function frame(now) {
    if (!visible || !onScreen) { running = false; return; }
    const q = Q();
    if (now - last < 1000 / q.fps - 1.5) { requestAnimationFrame(frame); return; }
    const real = Math.min(0.1, (now - last) / 1000); last = now;
    // turunkan kualitas otomatis bila perangkat kewalahan
    if (!ecoOn && real > 0.055) { if (++slowFrames > 90) { setEco(true, false); slowFrames = 0; } } else slowFrames = Math.max(0, slowFrames - 1);
    const dt = paused ? 0 : real * speed;
    if (dt > 0) {
      simT += dt;
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      for (let s = 0; s < steps; s++) for (const a of agents) { a.update(dt / steps); a.ch.update(dt / steps, { lookAt: a.lookAt, side: 0 }); }
      // kursi kembali ke tempatnya bila pemiliknya pergi
      for (const d of world.desks) {
        const sitter = d.owner && d.owner.ch.seat && d.owner.ch.seat.desk === d;
        if (!sitter) { d.chair.position.z = smooth(d.chair.position.z, d.home.z, 1.2, dt); d.chair.rotation.y += angDiff(d.chair.rotation.y, d.homeRot) * (1 - Math.exp(-1.2 * dt)); }
        const lampOn = sitter && world.night > 0.35;
        d.lampBulbMat.color.setHex(lampOn ? 0xffe2a8 : 0x777777);
      }
      world.tick(dt);
      screenT -= real;
      if (screenT <= 0) { screenT = 1 / q.screenHz; for (const a of agents) paintMonitor(a); }
    }
    skyT -= real; if (skyT <= 0) { skyT = 30; skyNow(); }
    profileT -= real; if (profileT <= 0 && selected) { profileT = 1; onSelectEmployee && onSelectEmployee(selected.id, selected.away ? 'Sudah pulang' : selected.status); }
    if (selected) ring.position.set(selected.ch.pos.x, 0.02, selected.ch.pos.z);
    updateCamera(real);
    if (q.shadow && dt > 0) { shadowFlip ^= 1; if (shadowFlip) renderer.shadowMap.needsUpdate = true; }
    renderer.render(scene, camera);
    placeLabels(); placeMoneyLabels();
    if (dt > 0) animateVault(real);
    requestAnimationFrame(frame);
  }

  resize();
  setEco(ecoOn, false);
  skyNow();
  wake();
  if (api.state) stateHandler(api.state);

  // dipakai untuk uji otomatis: majukan simulasi tanpa menunggu frame
  window.__kantor = {
    step(sec) { for (let t = 0; t < sec; t += 0.05) { simT += 0.05; for (const a of agents) { a.update(0.05); a.ch.update(0.05, { lookAt: a.lookAt }); } world.tick(0.05); } for (const a of agents) paintMonitor(a); },
    look: (x, z, zm, angle) => { manualTarget = { x, z }; zoomT = zm; if (angle != null) azT = angle; },
    focus: (id, angle) => { const a = byId.get(id); if (a) { select(a); setFollow(true); zoomT = 3; if (angle != null) azT = angle; } },
    agents: () => agents.map((a) => ({ id: a.id, status: a.status, script: a.script && a.script.name, q: a.queue.map((s) => s.name).join(','), away: a.away, x: +a.ch.pos.x.toFixed(2), z: +a.ch.pos.z.toFixed(2) })),
  };

  return {
    focusEmployee(id) { const a = byId.get(id); if (!a) return; select(a); if (!a.away) setFollow(true); },
    clearSelection() { select(null); },
    agents,
  };
}