// Kantor 3D: merender dunia, menggerakkan karyawan, dan menerjemahkan perubahan data task
// (selisih state lama → baru) menjadi animasi di antrean masing-masing karyawan.
import * as THREE from 'three';
import { api, LS } from './api.js';
import { createWorld, RX, RZ } from './scene.js';
import { Character, angDiff } from './characters.js';
import { Agent, S, chooseIdle, coffeeScript } from './behaviors.js';

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
const short = (s, n = 38) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

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
  let follow = false, selected = null;
  let W = 1, H = 1;
  function resize() { const r = stage.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); renderer.setSize(W, H, false); }
  new ResizeObserver(resize).observe(stage);
  function updateCamera(dt) {
    az = smooth(az, azT, 6, dt); zoom = smooth(zoom, zoomT, 7, dt);
    const want = follow && selected ? selected.ch.pos : { x: 0, z: 0 };
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
  const reservations = new Map();
  let simT = 0;
  const visual = { pendingWrite: new Set(), pendingPick: new Set(), pendingDone: new Set() };
  const sessions = new Map();   // presentasi yang sedang berjalan per task

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

  function tasksNow() { return (api.state && api.state.tasks) || []; }
  function taskById(id) { return tasksNow().find((t) => t.id === id); }
  function workTaskOf(a) {
    return tasksNow().filter((t) => t.assigneeId === a.id && t.status === 'in_progress' && !visual.pendingPick.has(t.id)).sort((x, y) => (x.startedAt || 0) - (y.startedAt || 0))[0] || null;
  }
  function waitingTaskOf(a) { return tasksNow().find((t) => t.assigneeId === a.id && t.status === 'review' && !t.reviewUntil) || null; }
  const workHours = () => (api.state && api.state.workHours) || { start: 8, end: 17 };
  const inWorkHours = () => { const n = new Date(); const h = n.getHours() + n.getMinutes() / 60; const w = workHours(); return h >= w.start && h < w.end; };
  function hasDuty(a) {
    if (workTaskOf(a) || waitingTaskOf(a)) return true;
    if (a.queue.some((s) => s.kind === 'task')) return true;
    if (a.script && a.script.kind === 'task') return true;
    if (a.role === 'manager' && tasksNow().some((t) => t.status === 'review' && t.reviewUntil)) return true;
    return a.stayUntil > simT;
  }
  function shouldBeHere(a) { return inWorkHours() || hasDuty(a); }

  function buildTeam(team) {
    let slot = 0;
    const order = [...team].sort((x, y) => ['coordinator', 'engineer', 'designer', 'manager'].indexOf(x.role) - ['coordinator', 'engineer', 'designer', 'manager'].indexOf(y.role));
    for (const emp of order) {
      const ch = new Character(scene, emp, world.nav);
      const a = new Agent(ch, emp, O);
      a.workTask = () => workTaskOf(a);
      a.stayUntil = 0;
      if (emp.role === 'manager') a.desk = world.makeManagerDesk(emp.look.shirt);
      else a.desk = world.makeDesk(world.openDeskSlots[slot++ % world.openDeskSlots.length], emp.role, emp.look.shirt);
      a.desk.owner = a;
      agents.push(a); byId.set(emp.id, a);
      makeLabel(a);
    }
    // sisa meja kosong untuk tambahan anggota tim
    for (let i = slot; i < Math.min(world.openDeskSlots.length, slot + 1); i++) { const d = world.makeDesk(world.openDeskSlots[i], 'empty', 0x8a90a0); paintEmpty(d); }
    // posisi awal: semua di meja, kecuali di luar jam kerja (yang tidak punya tugas sudah pulang)
    for (const a of agents) {
      const s = a.desk.seat;
      a.ch.place(s.x, s.z, s.rot); a.ch.sitting = true; a.ch.seat = O.seatOf(a); a.ch.act = 'sit';
      Object.assign(a.ch.pose, { hipL: { x: -1.52, v: 0 }, hipR: { x: -1.52, v: 0 }, kneeL: { x: 1.45, v: 0 }, kneeR: { x: 1.45, v: 0 }, rootY: { x: -0.075, v: 0 } });
      a.desk.chair.position.z = s.z + (a.desk.face === 's' ? -0.06 : 0.06);
      if (!shouldBeHere(a)) { a.away = true; a.ch.setVisible(false); a.ch.sitting = false; a.ch.seat = null; }
      a.setStatus(a.away ? 'Sudah pulang' : '');
      // jeda awal acak supaya tidak semua orang langsung ngopi bersamaan
      Object.assign(a.cooldown, { workBreak: rand(40, 160), coffee: rand(60, 260), sofa: rand(40, 200), window: rand(30, 160), stretch: rand(30, 120), chat: rand(60, 200), pingpong: rand(90, 300), huddle: rand(120, 400), tidyBoard: rand(60, 200), patrol: rand(90, 240) });
    }
    renderer.shadowMap.needsUpdate = true;
  }

  /* ---------- skrip kerja ---------- */
  function decide(a) {
    if (a.away) {
      if (shouldBeHere(a)) {
        if (!a.arriveAt) a.arriveAt = simT + (hasDuty(a) ? 0 : rand(0, 25));
        if (simT >= a.arriveAt) { a.arriveAt = 0; return arriveScript(a); }
      }
      return null;
    }
    if (!shouldBeHere(a)) return goHomeScript(a);
    const wt = workTaskOf(a);
    if (wt) {
      if (!(a.cooldown.workBreak > simT) && Math.random() < 0.3) {
        const b = workBreak(a);
        if (b) { a.cooldown.workBreak = simT + rand(150, 300); return b; }
      }
      return { kind: 'work', name: 'work', status: 'Mengerjakan: ' + short(wt.title), steps: [S.sit(O.seatOf(a)), S.act(a.role === 'designer' && Math.random() < 0.5 ? 'think' : 'type', { dur: rand(20, 45), status: 'Mengerjakan: ' + short(wt.title) })] };
    }
    const wait = waitingTaskOf(a);
    if (wait) return { kind: 'work', name: 'waiting', status: 'Menunggu persetujuan Anda', steps: [S.sit(O.seatOf(a)), S.act('sit', { dur: 20, status: 'Menunggu persetujuan Anda: ' + short(wait.title, 28) })] };
    return chooseIdle(a, O, simT) || { kind: 'idle', name: 'desk', status: 'Di meja', steps: [S.sit(O.seatOf(a)), S.act('sit', { dur: rand(10, 20) })] };
  }

  /* ---------- rehat sejenak saat task masih On Progress ---------- */
  // Status task tidak berubah; ini hanya jeda singkat sebelum kembali mengetik.
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

  function boardSpot(a) {
    const spots = world.POI.boardWrite;
    for (let i = 0; i < spots.length; i++) if (a.reserve('board' + i)) return spots[i];
    return spots[1];
  }

  function writeScript(a, taskId) {
    let spot;
    return { kind: 'task', name: 'write', status: 'Menulis task baru ke papan', steps: [
      S.call((ag) => (spot = boardSpot(ag))),
      { start(ag) { this.done = false; ag.ch.walkTo(spot, () => (this.done = true)); }, tick() { return this.done; } },
      { start(ag) { ag.ch.face(spot.rot); this.t = 0; }, tick(ag, dt) { return (this.t += dt) > 0.3; } },
      S.act('write', { dur: 2.8, props: { marker: true }, status: 'Menulis task baru ke papan' }),
      S.call(() => { visual.pendingWrite.delete(taskId); redrawBoard(); }),
      S.status('Kembali ke meja'),
    ] };
  }
  function pickScript(a, taskId) {
    let spot;
    return { kind: 'task', name: 'pick', status: 'Menuju papan task', steps: [
      S.wait(() => !visual.pendingWrite.has(taskId), 40),
      S.call((ag) => { spot = boardSpot(ag); ag.setStatus('Mengambil task dari papan'); }),
      { start(ag) { this.done = false; ag.ch.walkTo(spot, () => (this.done = true)); }, tick() { return this.done; } },
      { start(ag) { ag.ch.face(spot.rot); this.t = 0; }, tick(ag, dt) { return (this.t += dt) > 0.3; } },
      S.act('take', { dur: 1.2 }),
      S.call((ag) => { visual.pendingPick.delete(taskId); redrawBoard(); const t = taskById(taskId); if (t && t.status === 'in_progress') ag.ch.props({ paper: true }); }),
      S.call((ag) => { const t = taskById(taskId); ag.setStatus(t ? 'Mulai mengerjakan: ' + short(t.title) : 'Kembali ke meja'); }),
      S.sit(O.seatOf(a)),
      S.call((ag) => ag.ch.props({})),
    ] };
  }
  function presentScripts(taskId, lateMode) {
    if (sessions.has(taskId)) return;
    const t = taskById(taskId); if (!t) return;
    const presenter = byId.get(t.assigneeId), mgr = agents.find((x) => x.role === 'manager');
    if (!presenter) { visual.pendingDone.delete(taskId); return; }
    const sess = { taskId, title: t.title, presenterReady: false, managerReady: !mgr, presentT: 0, finished: false };
    sessions.set(taskId, sess);
    const P = world.POI;
    const done = () => { const x = taskById(taskId); return !x || x.status === 'done'; };
    const remaining = () => { const x = taskById(taskId); return x && x.reviewUntil ? Math.max(0, (x.reviewUntil - api.now()) / 1000) : 0; };
    presenter.enqueue({ kind: 'task', name: 'present', status: 'Menuju ruang meeting untuk presentasi', keepProps: false, steps: [
      S.call((ag) => ag.ch.props({ laptop: true })),
      S.walk(P.meetPresenter),
      S.faceTo(P.meetCenter),
      S.call((ag) => { sess.presenterReady = true; ag.ch.props({}); }),
      S.act('present', { status: 'Presentasi ke Manager: ' + short(t.title, 28), lookAt: mgr ? mgr.ch.pos : null, max: 60,
        onTick: (ag, dt) => { if (sess.managerReady) sess.presentT += dt; const total = Math.max(4, sess.presentT + remaining()); world.meetingScreen(sess.title, `${presenter.emp.name} → ${mgr ? mgr.emp.name : 'Manager'}`, sess.presentT / total); },
        until: () => sess.managerReady && sess.presentT >= (lateMode ? 3 : 4) && done() }),
      S.call((ag) => {
        sess.finished = true; visual.pendingDone.delete(taskId); redrawBoard();
        world.confetti(P.meetCenter.x, 1.2, P.meetCenter.z); ag.ch.cheer(); ag.setStatus('Task disetujui!');
        world.meetingScreen(null);
      }),
      S.act('stand', { dur: 1.8 }),
    ], onEnd: () => { sessions.delete(taskId); if (!sess.finished) { visual.pendingDone.delete(taskId); redrawBoard(); world.meetingScreen(null); } } });
    if (mgr) {
      const seat = P.meetSeats[0];
      mgr.enqueue({ kind: 'task', name: 'review', status: 'Menuju ruang meeting', steps: [
        S.sit({ seat, front: { x: seat.x, z: seat.z + 0.75 } }),
        S.call(() => (sess.managerReady = true)),
        S.act('listen', { status: 'Mendengarkan presentasi ' + presenter.emp.name, lookAt: presenter.ch.pos, until: () => sess.finished || !sessions.has(taskId), max: 70 }),
        S.call((ag) => { ag.setStatus('Menyetujui task'); }),
        S.act('sit', { dur: 1.2 }),
      ] });
    }
  }

  /* ---------- selisih data → animasi ---------- */
  let teamBuilt = false;
  api.on('state', (next, prev) => stateHandler(next, prev));
  function stateHandler(next, prev) {
    if (!next || !next.team) return;
    if (!teamBuilt) { buildTeam(next.team); teamBuilt = true; prev = null; }
    const prevMap = new Map(((prev && prev.tasks) || []).map((t) => [t.id, t]));
    const coord = agents.find((a) => a.role === 'coordinator') || agents[0];
    if (!prev) {
      for (const t of next.tasks) if (t.status === 'review' && t.reviewUntil && t.reviewUntil > api.now()) { visual.pendingDone.add(t.id); presentScripts(t.id, false); }
    } else {
      for (const t of next.tasks) {
        const old = prevMap.get(t.id);
        if (!old) {
          visual.pendingWrite.add(t.id);
          ensureHere(coord); coord.enqueue(writeScript(coord, t.id));
          if (t.status === 'in_progress' || t.status === 'review') queuePick(t);
          continue;
        }
        if (old.status !== t.status || old.assigneeId !== t.assigneeId) {
          if (t.status === 'in_progress' && (old.status === 'open' || old.assigneeId !== t.assigneeId)) queuePick(t);
          if (t.status === 'review' && t.reviewUntil && !(old.status === 'review' && old.reviewUntil)) { visual.pendingDone.add(t.id); const a = byId.get(t.assigneeId); if (a) ensureHere(a); ensureHere(agents.find((x) => x.role === 'manager')); presentScripts(t.id, false); }
          if (t.status === 'done' && old.status === 'in_progress') { const a = byId.get(t.assigneeId); if (a && !a.away) { visual.pendingDone.add(t.id); presentScripts(t.id, true); } }
          if (t.status === 'open') { visual.pendingPick.delete(t.id); }
        }
      }
      for (const id of prevMap.keys()) if (!next.tasks.some((t) => t.id === id)) { visual.pendingWrite.delete(id); visual.pendingPick.delete(id); visual.pendingDone.delete(id); }
    }
    redrawBoard();
  }
  function queuePick(t) {
    const a = byId.get(t.assigneeId); if (!a) return;
    visual.pendingPick.add(t.id);
    ensureHere(a); a.enqueue(pickScript(a, t.id));
  }
  function ensureHere(a) {
    if (!a) return;
    a.stayUntil = simT + 90;
    if (a.away && !a.queue.some((s) => s.name === 'arrive') && !(a.script && a.script.name === 'arrive')) { a.arriveAt = 0; a.queue.unshift(arriveScript(a)); }
    if (a.script && a.script.name === 'home') { a.abort(); a.away = false; a.ch.setVisible(true); }
  }

  function redrawBoard() {
    const s = api.state; if (!s) return;
    const today = new Date().toDateString();
    const open = [], prog = [], done = [];
    for (const t of s.tasks) {
      if (visual.pendingWrite.has(t.id)) continue;
      if (visual.pendingDone.has(t.id)) { prog.push(t); continue; }
      if (t.status === 'open' || visual.pendingPick.has(t.id)) open.push(t);
      else if (t.status === 'in_progress' || t.status === 'review') prog.push(t);
      else if (t.status === 'done' && t.doneAt && new Date(t.doneAt).toDateString() === today) done.push(t);
    }
    const prioRank = { high: 0, medium: 1, low: 2 };
    open.sort((x, y) => prioRank[x.priority] - prioRank[y.priority] || x.createdAt - y.createdAt);
    done.sort((x, y) => y.doneAt - x.doneAt);
    world.drawBoard([open, prog, done], s.projects, s.team);
  }

  /* ---------- monitor ---------- */
  function paintEmpty(d) {
    const g = d.tex.userData.g; g.fillStyle = '#0b0e17'; g.fillRect(0, 0, 256, 160); g.fillStyle = '#39415c'; g.font = '700 18px sans-serif'; g.fillText('Meja kosong', 72, 86); d.tex.needsUpdate = true;
  }
  function paintMonitor(a) {
    const d = a.desk, g = d.tex.userData.g, w = 256, h = 160, ac = a.emp.look.shirt;
    const atDesk = a.ch.sitting && a.ch.seat && a.ch.seat.desk === d && !a.away;
    g.fillStyle = '#0b0e17'; g.fillRect(0, 0, w, h);
    if (a.away) { d.tex.needsUpdate = true; return; }
    if (!atDesk && a.role !== 'manager' && a.role !== 'designer' && workTaskOf(a)) {
      // sedang rehat: editor tetap terbuka, kursor berhenti
      g.fillStyle = '#1d2335'; g.fillRect(0, 0, w, 16);
      drawCode(g, a, workTaskOf(a), false);
      g.fillStyle = 'rgba(11,14,23,.55)'; g.fillRect(0, 16, w, h - 16);
      g.fillStyle = '#e6e8ef'; g.font = '700 13px sans-serif'; g.fillText('Rehat sebentar…', 78, 88);
      d.tex.needsUpdate = true; return;
    }
    if (!atDesk) {
      const px = w / 2 + Math.sin(a.ch.t * 0.7) * 70, py = h / 2 + Math.cos(a.ch.t * 0.9) * 40;
      g.fillStyle = ac; g.globalAlpha = 0.5; g.beginPath(); g.arc(px, py, 10, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.fillStyle = '#5b6276'; g.font = '600 12px sans-serif'; g.fillText(a.emp.name.toUpperCase(), 12, h - 12);
      d.tex.needsUpdate = true; return;
    }
    g.fillStyle = '#1d2335'; g.fillRect(0, 0, w, 16);
    ['#ff6b6b', '#ffd166', '#5cc184'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(10 + i * 11, 8, 3, 0, Math.PI * 2); g.fill(); });
    const wt = workTaskOf(a);
    if (a.role === 'manager') {
      const s = api.state || { stats: {} };
      g.fillStyle = '#8a92a8'; g.font = '600 10px sans-serif'; g.fillText('ringkasan tim', 46, 11);
      const items = [['Open', s.stats.open], ['Dikerjakan', s.stats.inProgress], ['Selesai hari ini', s.stats.doneToday]];
      items.forEach(([k, v], i) => { g.fillStyle = '#cfd4e2'; g.font = '500 12px sans-serif'; g.fillText(k, 16, 44 + i * 30); g.fillStyle = ac; g.font = '700 18px sans-serif'; g.fillText(String(v ?? 0), 200, 46 + i * 30); });
    } else if (wt) {
      g.fillStyle = '#8a92a8'; g.font = '600 10px sans-serif'; g.fillText(short(wt.title, 34), 46, 11);
      if (a.role === 'designer') {
        g.fillStyle = '#1d2335'; g.fillRect(20, 26, 216, 120);
        const p = (a.ch.t * 0.08) % 1;
        g.fillStyle = ac; g.globalAlpha = 0.85; g.fillRect(30, 36, 196 * Math.min(1, p * 1.4), 40); g.globalAlpha = 1;
        g.fillStyle = '#ffd166'; g.beginPath(); g.arc(70, 110, 16, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e6e8ef'; g.fillRect(100, 98, 110 * Math.min(1, p * 2), 8); g.fillRect(100, 114, 80 * Math.min(1, p * 2.3), 6);
      } else drawCode(g, a, wt, true);
    } else {
      g.fillStyle = ac; g.globalAlpha = 0.16; g.fillRect(18, 30, w - 36, h - 46); g.globalAlpha = 1;
      g.fillStyle = '#e6e8ef'; g.font = '700 15px sans-serif'; g.fillText(waitingTaskOf(a) ? 'Menunggu persetujuan' : 'Siap menerima tugas', 32, 78);
      g.fillStyle = '#8a92a8'; g.font = '500 11px sans-serif'; g.fillText(a.emp.title, 32, 98);
    }
    d.tex.needsUpdate = true;
  }

  /* ---------- layar kode engineer ---------- */
  const CODE = [
    { file: 'api/handler.js', lang: 'js', test: ['$ npm test', '✓ 18 tes lulus (1.2 dtk)'], lines: [
      "import { db } from '../lib/db.js';", "import { kirimNotif } from '../lib/notif.js';", '',
      'export default async function handler(req, res) {', '  const { id } = req.query;',
      "  if (!id) return res.status(400).json({ error: 'id wajib' });", '', '  const data = await db.get(`order:${id}`);',
      '  const aktif = data.items.filter((x) => x.aktif);', '  let total = 0;', '  for (const item of aktif) {',
      '    total += item.qty * item.harga;', '  }', '  data.total = Math.round(total * 1.11);', "  data.status = 'diproses';",
      '  await db.set(`order:${id}`, data);', '  await kirimNotif(data.email, total);', '  return res.json({ ok: true, total });', '}'] },
    { file: 'laporan.py', lang: 'py', test: ['$ pytest -q', '✓ 9 passed in 0.84s'], lines: [
      'import pandas as pd', 'from datetime import date', '', '# rekap penjualan per minggu', 'def rekap(path):',
      '    df = pd.read_csv(path, parse_dates=["tanggal"])', '    df = df[df["status"] == "lunas"]',
      '    df["minggu"] = df["tanggal"].dt.isocalendar().week', '    hasil = df.groupby("minggu")["total"].sum()',
      '    return hasil.reset_index()', '', 'def simpan(hasil):', '    nama = f"rekap-{date.today()}.xlsx"',
      '    hasil.to_excel(nama, index=False)', '    print("tersimpan:", nama)', '', 'if __name__ == "__main__":',
      '    simpan(rekap("data/penjualan.csv"))'] },
    { file: 'src/Dashboard.jsx', lang: 'js', test: ['$ npm run build', '✓ build selesai dalam 3.4 dtk'], lines: [
      "import { useEffect, useState } from 'react';", "import { ambilData } from './api';", '',
      'export function Dashboard({ userId }) {', '  const [rows, setRows] = useState([]);', '  const [loading, setLoading] = useState(true);', '',
      '  useEffect(() => {', '    ambilData(userId)', '      .then(setRows)', '      .finally(() => setLoading(false));', '  }, [userId]);', '',
      '  if (loading) return <Spinner />;', '  return (', '    <Tabel data={rows} kolom={["Nama", "Status", "Total"]} />', '  );', '}'] },
    { file: 'migrasi.sql', lang: 'sql', test: ['$ npm run migrate', '✓ 3 migrasi diterapkan'], lines: [
      '-- tabel pelanggan baru', 'CREATE TABLE pelanggan (', '  id SERIAL PRIMARY KEY,', '  nama TEXT NOT NULL,',
      '  email TEXT UNIQUE,', '  dibuat TIMESTAMP DEFAULT now()', ');', '', 'CREATE INDEX idx_email ON pelanggan (email);', '',
      'SELECT p.nama, COUNT(o.id) AS jumlah', 'FROM pelanggan p', 'JOIN orders o ON o.pelanggan_id = p.id',
      "WHERE o.status = 'lunas'", 'GROUP BY p.nama', 'ORDER BY jumlah DESC', 'LIMIT 10;'] },
  ];
  const KW = new Set(['import', 'from', 'export', 'default', 'async', 'function', 'const', 'let', 'return', 'if', 'for', 'of', 'await', 'def', 'in', 'print', 'SELECT', 'FROM', 'WHERE', 'JOIN', 'ON', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'CREATE', 'TABLE', 'INDEX', 'AS', 'DESC', 'NOT', 'NULL', 'PRIMARY', 'KEY', 'UNIQUE', 'DEFAULT', 'TEXT', 'SERIAL', 'TIMESTAMP', 'COUNT']);
  const TOK = /(\/\/.*|--.*|#.*)|('[^']*'?|"[^"]*"?|`[^`]*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|(.)/g;
  const hashStr = (t) => { let h = 7; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  function codeState(a, wt) {
    let c = a.code;
    if (!c || c.taskId !== wt.id) {
      const k = (hashStr(wt.id) + (a.role === 'engineer' ? hashStr(a.id) : 0)) % CODE.length;
      c = a.code = { taskId: wt.id, k, li: 0, chars: 0, done: [], last: simT, term: 0 };
    }
    return c;
  }
  function stepCode(c, typing, dt) {
    const src = CODE[c.k];
    if (c.term > 0) { c.term -= dt; if (c.term <= 0) { c.k = (c.k + 1) % CODE.length; c.li = 0; c.chars = 0; c.done = []; } return; }
    if (!typing) return;
    c.chars += dt * (11 + Math.random() * 8);
    while (c.li < src.lines.length && c.chars >= src.lines[c.li].length) {
      c.chars -= Math.max(src.lines[c.li].length, 0); c.done.push(src.lines[c.li]); c.li++;
      if (!src.lines[c.li - 1]) c.chars = 0;
    }
    if (c.li >= src.lines.length) c.term = 5;
  }
  function drawLine(g, text, x, y, maxX, lang) {
    TOK.lastIndex = 0; let m;
    while ((m = TOK.exec(text)) && x < maxX) {
      const t = m[0];
      if (m[1] && (lang !== 'py' || t.startsWith('#')) && (lang === 'sql' ? t.startsWith('--') : !t.startsWith('--'))) g.fillStyle = '#7d8799';
      else if (m[2]) g.fillStyle = '#a5d6ff';
      else if (m[3]) g.fillStyle = '#79c0ff';
      else if (m[4]) g.fillStyle = KW.has(t) ? '#ff7b72' : text[TOK.lastIndex] === '(' ? '#d2a8ff' : '#e6edf3';
      else g.fillStyle = '#c9d1d9';
      if (!m[5]) g.fillText(t, x, y);
      x += g.measureText(t).width;
    }
    return x;
  }
  function drawCode(g, a, wt, live) {
    const w = 256, h = 160, c = codeState(a, wt), src = CODE[c.k];
    const dt = Math.min(1, simT - c.last); c.last = simT;
    if (live) stepCode(c, a.ch.act === 'type' && a.ch.burst > 0, dt);
    g.fillStyle = '#141a26'; g.fillRect(0, 16, w, h - 16);
    g.fillStyle = '#161b26'; g.fillRect(44, 0, 96, 16);
    g.fillStyle = '#c9d1d9'; g.font = '600 9px sans-serif'; g.fillText(src.file, 50, 11);
    g.fillStyle = '#5b6276'; g.fillText(short(wt.title, 18), 148, 11);
    g.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
    const LH = 14, termH = c.term > 0 ? 38 : 0, rows = Math.floor((h - 20 - termH) / LH);
    const cur = c.li < src.lines.length && c.term <= 0 ? src.lines[c.li].slice(0, Math.floor(c.chars)) : null;
    const all = cur === null ? c.done : [...c.done, cur];
    const start = Math.max(0, all.length - rows);
    let endX = 26;
    for (let i = start; i < all.length; i++) {
      const y = 30 + (i - start) * LH;
      g.fillStyle = '#4a5268'; g.fillText(String(i + 1).padStart(2, ' '), 3, y);
      endX = drawLine(g, all[i], 26, y, w - 4, src.lang);
    }
    if (cur !== null && (a.ch.burst > 0 || Math.floor(simT * 2.2) % 2 === 0)) { g.fillStyle = '#e6edf3'; g.fillRect(endX + 1, 30 + (all.length - 1 - start) * LH - 10, 7, 12); }
    if (termH) {
      g.fillStyle = '#0a0d14'; g.fillRect(0, h - termH, w, termH); g.fillStyle = '#262d3d'; g.fillRect(0, h - termH, w, 1);
      g.fillStyle = '#9aa3b8'; g.fillText(src.test[0], 8, h - termH + 15);
      if (c.term < 3.8) { g.fillStyle = '#5cc184'; g.fillText(src.test[1], 8, h - termH + 31); }
    }
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
      const working = !!workTaskOf(a) && a.script && a.script.kind === 'work';
      L.el.classList.toggle('far', far && selected !== a && !working);
      if (L.last !== a.status) { L.st.textContent = a.status; L.last = a.status; }
      L.pg.hidden = !working;
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
    placeLabels();
    requestAnimationFrame(frame);
  }

  resize();
  setEco(ecoOn, false);
  skyNow();
  wake();
  if (api.state) stateHandler(api.state, null);

  // dipakai untuk uji otomatis: majukan simulasi tanpa menunggu frame
  window.__kantor = {
    step(sec) { for (let t = 0; t < sec; t += 0.05) { simT += 0.05; for (const a of agents) { a.update(0.05); a.ch.update(0.05, { lookAt: a.lookAt }); } world.tick(0.05); } for (const a of agents) paintMonitor(a); },
    focus: (id, angle) => { const a = byId.get(id); if (a) { select(a); setFollow(true); zoomT = 3; if (angle != null) azT = angle; } },
    agents: () => agents.map((a) => ({ id: a.id, status: a.status, script: a.script && a.script.name, q: a.queue.map((s) => s.name).join(','), away: a.away, x: +a.ch.pos.x.toFixed(2), z: +a.ch.pos.z.toFixed(2) })),
  };

  return {
    focusEmployee(id) { const a = byId.get(id); if (!a) return; select(a); if (!a.away) setFollow(true); },
    clearSelection() { select(null); },
    agents,
  };
}
