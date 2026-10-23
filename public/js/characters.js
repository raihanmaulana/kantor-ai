// Karakter low-poly dengan sendi berpegas: jalan, duduk, mengetik, menulis, presentasi, minum, dll.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const angDiff = (a, b) => ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const smooth = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const noise = (t, sd) => Math.sin(t * 1.3 + sd) * 0.5 + Math.sin(t * 0.71 + sd * 2.3) * 0.3 + Math.sin(t * 2.9 + sd * 0.7) * 0.2;

const JOINTS = ['hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'shL', 'shR', 'shLz', 'shRz', 'elL', 'elR', 'lean', 'sway', 'twist', 'bob', 'chestX', 'headX', 'headY', 'headZ', 'rootY', 'hairX'];
const STIFF = { walk: 380, norm: 95, slow: 55, root: 70, head: 60, hair: 28 };
function spring(s, target, k, dt) {
  const c = 2 * 0.82 * Math.sqrt(k), n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
  for (let i = 0; i < n; i++) { const a = k * (target - s.x) - c * s.v; s.v += a * h; s.x += s.v * h; }
}

let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c); return blobTex;
}
const matCache = new Map();
const M = (c) => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })); return matCache.get(c); };

function limb(r1, r2, len, mat) {
  const g = new THREE.CylinderGeometry(r1, r2, len, 10); g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat); m.castShadow = true;
  m.add(new THREE.Mesh(new THREE.SphereGeometry(r1, 10, 6), mat));
  return m;
}

function buildBody(look) {
  const R = {};
  const shirt = M(look.shirt), skin = M(look.skin), hair = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.6 }), pants = M('#2f3446'), shoe = M('#f1f1ee'), dark = M('#15171f');
  const g = new THREE.Group(); R.g = g;
  const pelvis = new THREE.Group(); pelvis.position.y = 0.6; g.add(pelvis); R.pelvis = pelvis;
  ['L', 'R'].forEach((s, k) => {
    const hip = new THREE.Group(); hip.position.set(k ? 0.1 : -0.1, 0, 0); pelvis.add(hip);
    hip.add(limb(0.078, 0.07, 0.28, pants));
    const knee = new THREE.Group(); knee.position.y = -0.28; hip.add(knee);
    knee.add(limb(0.07, 0.062, 0.27, pants));
    const ankle = new THREE.Group(); ankle.position.y = -0.27; knee.add(ankle);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.22), shoe); sh.position.set(0, -0.02, 0.04); sh.castShadow = true; ankle.add(sh);
    R['hip' + s] = hip; R['knee' + s] = knee; R['ankle' + s] = ankle;
  });
  const up = new THREE.Group(); pelvis.add(up); R.up = up;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.2, 0.1, 16), pants); belt.position.y = 0.03; belt.castShadow = true; up.add(belt);
  const chest = new THREE.Group(); up.add(chest); R.chest = chest;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.36, 16), shirt); torso.position.y = 0.25; torso.castShadow = true; chest.add(torso); R.torso = torso;
  const shm = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10, 0, TAU, 0, Math.PI / 2), shirt); shm.scale.y = 0.5; shm.position.y = 0.43; shm.castShadow = true; chest.add(shm);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 14), M('#f3f3f0')); collar.rotation.x = Math.PI / 2; collar.position.y = 0.48; chest.add(collar);
  if (look.tie) { const tie = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.02), M('#8b2d3a')); tie.position.set(0, 0.34, 0.19); chest.add(tie); }
  const neck = new THREE.Group(); neck.position.y = 0.5; chest.add(neck); R.neck = neck;
  const head = new THREE.Group(); neck.add(head); R.head = head;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 18), skin); skull.position.y = 0.25; skull.scale.set(1, 0.95, 0.95); skull.castShadow = true; head.add(skull);
  [-1, 1].forEach((s) => { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin); ear.position.set(s * 0.255, 0.24, 0); ear.scale.z = 0.6; head.add(ear); });
  R.eyes = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), dark); e.position.set(s * 0.09, 0.26, 0.225); e.scale.set(1, 1.35, 0.5); head.add(e);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); hl.position.set(0.01, 0.018, 0.4); e.add(hl);
    const ch = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.35 })); ch.position.set(s * 0.15, 0.19, 0.235); ch.rotation.y = s * 0.45; head.add(ch);
    return e;
  });
  R.brows = [-1, 1].map((s) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.01), new THREE.MeshBasicMaterial({ color: look.hair })); b.position.set(s * 0.09, 0.33, 0.235); head.add(b); return b; });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 4, 10, Math.PI), dark); mouth.position.set(0, 0.17, 0.24); mouth.rotation.z = Math.PI; head.add(mouth); R.mouth = mouth;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.272, 24, 12, 0, TAU, 0, Math.PI * 0.5), hair); cap.position.y = 0.27; cap.rotation.x = -0.22; cap.castShadow = true; head.add(cap);
  const st = look.style;
  if (st === 'long') { const hb = hair.clone(); hb.side = THREE.DoubleSide; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.44, 16, 1, true, Math.PI * 0.6, Math.PI * 0.8), hb); b.position.set(0, 0.11, -0.02); head.add(b); R.hairBack = b;
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.1), hair); fr.position.set(0.04, 0.42, 0.19); fr.rotation.z = 0.12; head.add(fr); }
  if (st === 'bun') { const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), hair); bun.position.set(0, 0.55, -0.1); head.add(bun); R.bun = bun; }
  if (st === 'curly') { for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; const c = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hair); c.position.set(Math.cos(a) * 0.2, 0.42 + Math.sin(i) * 0.03, Math.sin(a) * 0.2 - 0.03); head.add(c); } }
  if (st === 'short' || st === 'glasses') { const fr = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.1), hair); fr.position.set(-0.03, 0.43, 0.2); fr.rotation.z = -0.15; head.add(fr); }
  if (st === 'glasses') { const gm = M('#1b1e27'); [-1, 1].forEach((s) => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.01, 6, 18), gm); r.position.set(s * 0.09, 0.26, 0.245); head.add(r); });
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.012), gm); br.position.set(0, 0.27, 0.25); head.add(br); }
  if (st === 'cap') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 10, 0, TAU, 0, Math.PI * 0.45), M('#2f3446')); c.position.y = 0.28; c.rotation.x = -0.2; head.add(c);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16, 1, false, -Math.PI / 2, Math.PI), M('#2f3446')); brim.position.set(0, 0.4, 0.2); brim.rotation.x = 0.12; head.add(brim); }
  ['L', 'R'].forEach((s, k) => {
    const shp = new THREE.Group(); shp.position.set(k ? 0.255 : -0.255, 0.41, 0); chest.add(shp);
    shp.add(limb(0.062, 0.055, 0.22, shirt));
    const el = new THREE.Group(); el.position.y = -0.22; shp.add(el);
    el.add(limb(0.05, 0.045, 0.18, skin));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), skin); hand.position.y = -0.21; hand.castShadow = true; el.add(hand);
    R['sh' + s] = shp; R['el' + s] = el; R['hand' + s] = hand;
  });
  // properti yang bisa dibawa
  R.mug = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.11, 12), M(look.shirt)); R.mug.position.set(0, -0.02, 0.05); R.mug.rotation.x = Math.PI / 2; R.mug.visible = false; R.handR.add(R.mug);
  R.paper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.3), M('#fff4c6')); R.paper.position.set(0, 0.12, 0.3); R.paper.visible = false; chest.add(R.paper);
  R.laptop = new THREE.Group(); R.laptop.position.set(0, 0.1, 0.3); R.laptop.visible = false; chest.add(R.laptop);
  const lb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.25), M('#3a3f4f')); R.laptop.add(lb);
  const ls = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.015), M('#3a3f4f')); ls.position.set(0, 0.12, -0.12); ls.rotation.x = -0.25; R.laptop.add(ls);
  R.marker = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 6), M('#2d6cdf')); R.marker.position.set(0, -0.04, 0.05); R.marker.rotation.x = 1.2; R.marker.visible = false; R.handR.add(R.marker);
  R.paddle = new THREE.Group(); R.paddle.visible = false; R.handR.add(R.paddle);
  const pdl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 14), M('#c0392b')); pdl.rotation.x = Math.PI / 2; pdl.position.set(0, -0.1, 0.03); R.paddle.add(pdl);
  R.cig = new THREE.Group(); R.cig.visible = false; R.handR.add(R.cig);
  const cg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.085, 6), M('#f4f1ea')); cg.rotation.z = Math.PI / 2; cg.position.set(0.05, -0.03, 0.03); R.cig.add(cg);
  R.cigTip = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff7a2f })); R.cigTip.position.set(0.095, -0.03, 0.03); R.cig.add(R.cigTip);
  R.phone = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.014), M('#15171f')); R.phone.position.set(-0.02, -0.06, 0.03); R.phone.visible = false; R.handR.add(R.phone);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return R;
}

export class Character {
  constructor(scene, emp, nav) {
    this.emp = emp; this.id = emp.id; this.nav = nav; this.scene = scene;
    this.R = buildBody(emp.look);
    this.group = this.R.g; scene.add(this.group);
    this.pos = this.group.position;
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.3 }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.015; scene.add(this.blob);
    this.rot = 0; this.rotTarget = 0; this.rotV = 0;
    this.t = Math.random() * 10; this.seed = Math.random() * 10;
    this.speed = 0; this.walkSpeed = 1.7 + Math.random() * 0.35; this.phase = 0; this.stepPhase = 0;
    this.curve = null; this.s = 0; this.onArrive = null;
    this.tween = null; this.sitting = false; this.seat = null;
    this.act = 'stand'; this.actT = 0;
    this.burst = 1; this.burstT = 0; this.mouseT = 0; this.cheerT = 0; this.waveT = 0; this.blinkT = 1 + Math.random() * 3; this.sipT = 1;
    this.pose = {}; JOINTS.forEach((j) => (this.pose[j] = { x: 0, v: 0 }));
    this.visible = true;
  }

  get busyMoving() { return !!this.curve || !!this.tween; }

  setVisible(v) { this.visible = v; this.group.visible = v; this.blob.visible = v; }
  place(x, z, rot = 0) { this.pos.set(x, 0, z); this.rot = this.rotTarget = rot; this.curve = null; this.tween = null; }
  setAct(name) { if (this.act !== name) { this.act = name; this.actT = 0; } }
  props({ mug = false, paper = false, laptop = false, marker = false, paddle = false, cig = false, phone = false } = {}) {
    this.R.mug.visible = mug; this.R.paper.visible = paper; this.R.laptop.visible = laptop; this.R.marker.visible = marker; this.R.paddle.visible = paddle;
    this.R.cig.visible = cig; this.R.phone.visible = phone;
  }
  cheer() { this.cheerT = 1.8; }
  wave() { this.waveT = 2.0; }

  // Jalan ke titik (x, z) memakai A*. Kalau sedang duduk, berdiri dulu.
  walkTo(target, onArrive) {
    const go = () => {
      const path = this.nav.path({ x: this.pos.x, z: this.pos.z }, target) || [{ x: this.pos.x, z: this.pos.z }, target];
      if (path.length < 2 || Math.hypot(target.x - this.pos.x, target.z - this.pos.z) < 0.05) { this.curve = null; onArrive && onArrive(); return; }
      const pts = path.map((p) => new THREE.Vector3(p.x, 0, p.z));
      this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.2);
      this.curveLen = Math.max(0.01, this.curve.getLength()); this.s = 0; this.onArrive = onArrive; this.act = 'walk';
    };
    if (this.sitting) this.standUp(go); else go();
  }

  // Duduk di kursi/sofa: seatInfo = { seat:{x,z,rot}, front:{x,z}, desk? }
  sitAt(seatInfo, onDone) {
    const doSit = () => {
      this.rotTarget = seatInfo.seat.rot;
      this.sitting = true; this.seat = seatInfo; this.act = 'sitdown';
      this.tween = { from: this.pos.clone(), to: new THREE.Vector3(seatInfo.seat.x, 0, seatInfo.seat.z), t: 0, dur: 0.8, delay: 0.25, done: () => { this.act = 'sit'; onDone && onDone(); } };
    };
    if (this.sitting && this.seat === seatInfo) { onDone && onDone(); return; }
    this.walkTo(seatInfo.front, doSit);
  }
  standUp(onDone) {
    if (!this.sitting) { onDone && onDone(); return; }
    const front = this.seat.front;
    this.sitting = false; this.act = 'standup';
    this.tween = { from: this.pos.clone(), to: new THREE.Vector3(front.x, 0, front.z), t: 0, dur: 0.75, delay: 0.1, done: () => { this.seat = null; this.act = 'stand'; onDone && onDone(); } };
  }
  face(rot) { this.rotTarget = rot; }
  faceTo(x, z) { this.rotTarget = Math.atan2(x - this.pos.x, z - this.pos.z); }

  update(dt, ctx = {}) {
    const R = this.R, p = this.pos, P = {};
    this.t += dt; this.actT += dt;
    JOINTS.forEach((j) => (P[j] = 0));
    let turnK = 60;

    if (this.tween) {
      const tw = this.tween;
      if (tw.delay > 0) tw.delay -= dt;
      else { tw.t = Math.min(1, tw.t + dt / tw.dur); p.lerpVectors(tw.from, tw.to, easeIO(tw.t)); if (tw.t >= 1) { this.tween = null; tw.done && tw.done(); } }
    }
    if (this.curve) {
      const u = Math.min(1, this.s / this.curveLen);
      const tan = this.curve.getTangentAt(u); const head = Math.atan2(tan.x, tan.z);
      const needTurn = this.s === 0 && Math.abs(angDiff(this.rot, head)) > 0.6;
      this.rotTarget = head;
      if (needTurn) { turnK = 40; this.stepPhase += dt * 9; }
      else {
        const target = this.walkSpeed * Math.min(1, 0.25 + this.s / 0.7) * Math.min(1, 0.25 + (this.curveLen - this.s) / 0.8);
        this.speed = smooth(this.speed, target, 6, dt);
        this.s = Math.min(this.curveLen, this.s + this.speed * dt);
        const q = this.curve.getPointAt(this.s / this.curveLen); p.x = q.x; p.z = q.z;
        this.phase += dt * (2.6 + this.speed * 3.3);
        if (this.s >= this.curveLen - 1e-4) { this.curve = null; this.speed = 0; this.act = 'stand'; const cb = this.onArrive; this.onArrive = null; cb && cb(); }
      }
    }

    const walking = !!this.curve && this.speed > 0.05;
    const sitting = this.sitting;
    const breath = Math.sin(this.t * 1.9 + this.seed);
    let kMode = STIFF.norm;
    P.bob = breath * 0.01; P.chestX = breath * 0.015;
    P.headX = noise(this.t * 0.4, this.seed) * 0.05; P.headY = noise(this.t * 0.3, this.seed + 5) * 0.12; P.headZ = noise(this.t * 0.25, this.seed + 9) * 0.05;
    const a = this.act, at = this.actT;

    if (walking) {
      kMode = STIFF.walk;
      const k = clamp(this.speed / this.walkSpeed, 0, 1) * 0.9 + 0.1, s = Math.sin(this.phase), c = Math.cos(this.phase);
      P.hipL = s * 0.6 * k; P.hipR = -s * 0.6 * k;
      P.kneeL = (0.1 + Math.max(0, -c) * 0.95 + Math.max(0, s) * 0.15) * k; P.kneeR = (0.1 + Math.max(0, c) * 0.95 + Math.max(0, -s) * 0.15) * k;
      P.ankleL = -Math.max(0, -s) * 0.35 * k; P.ankleR = -Math.max(0, s) * 0.35 * k;
      P.shL = -s * 0.55 * k; P.shR = s * 0.55 * k; P.elL = -0.25 - Math.max(0, s) * 0.5 * k; P.elR = -0.25 - Math.max(0, -s) * 0.5 * k;
      P.shLz = 0.08; P.shRz = -0.08;
      P.lean = 0.06 + 0.05 * k; P.bob = (Math.abs(c) - 0.5) * 0.05 * k; P.sway = s * 0.05 * k; P.twist = -s * 0.09 * k; P.headY = s * 0.04 * k; P.headZ = -s * 0.03 * k;
      P.hairX = -0.25 * k;
      if (this.curve) { const ahead = this.curve.getTangentAt(Math.min(1, (this.s + 0.6) / this.curveLen)); P.headY += clamp(angDiff(this.rot, Math.atan2(ahead.x, ahead.z)), -0.7, 0.7) * 0.8; }
      if (R.paper.visible || R.laptop.visible) { P.shL = P.shR = -0.6; P.elL = P.elR = -1.2; P.shLz = 0.05; P.shRz = -0.05; }
      if (R.mug.visible) { P.shR = -0.5; P.elR = -1.4; }
      if (R.phone.visible) { P.shR = -0.95; P.shRz = -0.5; P.elR = -2.35; P.headZ = 0.12; }
      if (R.cig.visible) { P.shR = -0.25; P.elR = -0.9; }
    } else if (sitting) {
      P.hipL = P.hipR = -1.52; P.kneeL = P.kneeR = 1.45; P.ankleL = P.ankleR = 0.1; P.rootY = -0.075;
      if (a === 'sitdown') { kMode = STIFF.slow; P.lean = 0.3; P.shL = P.shR = -0.3; P.elL = P.elR = -0.6; }
      else if (a === 'type' || a === 'think') {
        this.burstT -= dt; if (this.burstT <= 0) { this.burst = Math.random() < 0.25 ? 0 : 1; this.burstT = this.burst ? 1.2 + Math.random() * 2.5 : 0.6 + Math.random() * 1.2; if (!this.burst && Math.random() < 0.5) this.mouseT = this.burstT; }
        this.mouseT = Math.max(0, this.mouseT - dt);
        const thinking = a === 'think';
        const ty = this.t * 20, amp = (thinking ? 0 : this.burst) * 0.1;
        P.shL = -0.8; P.elL = -0.92 + Math.sin(ty) * amp; P.shLz = 0.18;
        if (this.mouseT > 0) { P.shR = -0.72; P.elR = -0.95 + Math.sin(this.t * 3) * 0.04; P.shRz = -0.42; }
        else { P.shR = -0.8; P.elR = -0.92 + Math.sin(ty + 2.1) * amp; P.shRz = -0.18; }
        P.lean = 0.16 + noise(this.t * 0.2, this.seed) * 0.03; P.headX = 0.2 + (this.burst ? 0 : -0.08); P.chestX += 0.04;
        P.headY = this.burst ? noise(this.t * 0.5, this.seed) * 0.08 : (this.mouseT > 0 ? 0.12 : 0) + noise(this.t * 0.6, this.seed) * 0.15;
        if (thinking && !this.burst) { P.headZ = 0.14; P.headX = 0.05; P.shL = -1.9; P.elL = -2.15; P.shLz = 0.3; P.lean = 0.1; }
      } else if (a === 'sofa') {
        P.lean = -0.3; P.shL = P.shR = -0.25; P.elL = P.elR = -0.5; P.shLz = 0.35; P.shRz = -0.35; P.hipL = P.hipR = -1.35; P.kneeL = P.kneeR = 1.25; P.headX = -0.05; P.headY += Math.sin(this.t * 0.3 + this.seed) * 0.4;
        if (R.mug.visible) { this.sipT -= dt; if (this.sipT < -1.6) this.sipT = 3 + Math.random() * 3; const sip = this.sipT < 0 ? Math.sin(clamp(-this.sipT / 1.6, 0, 1) * Math.PI) : 0; P.shR = -0.6 - 0.6 * sip; P.elR = -1.4 - 0.7 * sip; P.shRz = -0.1; P.headX = -0.2 * sip; }
      } else if (a === 'listen') {
        P.shL = P.shR = -0.55; P.elL = P.elR = -1.1; P.shLz = 0.2; P.shRz = -0.2; P.lean = 0.08;
        const nod = Math.max(0, Math.sin(this.t * 2.1 + this.seed)); P.headX = nod * nod * 0.2 - 0.05;
        if (ctx.lookAt) { const d = Math.atan2(ctx.lookAt.x - p.x, ctx.lookAt.z - p.z); P.headY = clamp(angDiff(this.rot, d), -1, 1); }
      } else {
        // duduk santai di meja: sesekali menoleh, peregangan kecil
        const f = Math.floor(this.t / 6 + this.seed) % 4;
        P.shL = P.shR = -0.38; P.elL = P.elR = -0.75; P.shLz = 0.15; P.shRz = -0.15; P.lean = -0.04;
        if (f === 1) { P.headY += Math.sin(this.t * 0.7) * 0.7; P.twist = Math.sin(this.t * 0.7) * 0.15; }
        else if (f === 2) { const e = Math.max(0, Math.sin((this.t % 6) / 6 * Math.PI)); P.shL = P.shR = -0.4 - 2.3 * e; P.elL = P.elR = -0.8 - 1.5 * e; P.shLz = 0.15 + 0.5 * e; P.shRz = -0.15 - 0.5 * e; P.lean = -0.25 * e; }
        else P.headY += Math.sin(this.t * 0.4 + this.seed) * 0.35;
      }
    } else {
      // berdiri
      P.shL = 0.03; P.shR = 0.03; P.elL = P.elR = -0.14; P.shLz = 0.07; P.shRz = -0.07;
      P.hipL = Math.sin(this.t * 0.55 + this.seed) * 0.035; P.hipR = -P.hipL; P.sway = Math.sin(this.t * 0.55 + this.seed) * 0.025;
      if (a === 'standup') { kMode = STIFF.slow; P.lean = 0.28; P.kneeL = P.kneeR = 0.25; P.hipL = P.hipR = -0.25; P.shL = P.shR = -0.25; P.elL = P.elR = -0.5; }
      else if (a === 'write') {
        const s = Math.sin(this.t * 7), c = Math.cos(this.t * 5.3);
        P.shR = -2.0 + c * 0.12; P.elR = -0.7 + s * 0.12; P.shRz = -0.25 + s * 0.08; P.headX = -0.12; P.headY = c * 0.1; P.lean = 0.04; P.shL = 0.05;
      } else if (a === 'take') {
        const e = Math.sin(clamp(at / 1.2, 0, 1) * Math.PI); P.shR = -1.8 * e; P.elR = -0.3 * e; P.headX = -0.1 * e; P.lean = 0.08 * e;
      } else if (a === 'present') {
        P.shL = -0.55 + Math.sin(this.t * 2.9) * 0.35; P.shR = -1.1 + Math.sin(this.t * 2.3 + 1) * 0.5; P.elL = -0.95 + Math.sin(this.t * 3.7) * 0.2; P.elR = -0.6; P.shLz = 0.2; P.shRz = -0.45;
        P.twist = Math.sin(this.t * 1.2) * 0.18; P.headX = Math.sin(this.t * 4.1) * 0.05; P.bob += Math.abs(Math.sin(this.t * 2.5)) * 0.01;
        if (ctx.lookAt && Math.sin(this.t * 0.8) > 0.3) { const d = Math.atan2(ctx.lookAt.x - p.x, ctx.lookAt.z - p.z); P.headY = clamp(angDiff(this.rot, d), -1, 1); }
      } else if (a === 'talk' || a === 'huddle') {
        const speaking = Math.sin(this.t * 0.9 + this.seed * 3) > 0;
        if (speaking) { P.shL = -0.45 + Math.sin(this.t * 3.1) * 0.3; P.shR = -0.4 + Math.sin(this.t * 2.6 + 1) * 0.35; P.elL = -0.9; P.elR = -1.0; P.twist = Math.sin(this.t * 1.3) * 0.12; }
        else { const nod = Math.max(0, Math.sin(this.t * 2.2 + this.seed)); P.headX = nod * nod * 0.16; P.shL = P.shR = -0.15; P.elL = P.elR = -0.95; P.shLz = 0.12; P.shRz = -0.12; }
        if (ctx.lookAt) { const d = Math.atan2(ctx.lookAt.x - p.x, ctx.lookAt.z - p.z); P.headY = clamp(angDiff(this.rot, d), -0.9, 0.9); }
      } else if (a === 'drink') {
        this.sipT -= dt; if (this.sipT < -1.6) this.sipT = 2 + Math.random() * 2;
        const sip = this.sipT < 0 ? Math.sin(clamp(-this.sipT / 1.6, 0, 1) * Math.PI) : 0;
        P.shR = -0.5 - 0.7 * sip; P.elR = -1.4 - 0.7 * sip; P.shRz = -0.1; P.headX = -0.2 * sip + 0.03; P.shL = 0.05;
        P.headY += Math.sin(this.t * 0.45 + this.seed) * 0.4 * (1 - sip);
      } else if (a === 'brew') {
        P.shR = -0.9 + Math.sin(this.t * 2) * 0.05; P.elR = -0.9; P.headX = 0.2; P.lean = 0.08;
      } else if (a === 'look') {
        P.shL = P.shR = 0.35; P.elL = P.elR = -1.3; P.shLz = -0.15; P.shRz = 0.15; P.headX = -0.05 + Math.sin(this.t * 0.2) * 0.05; P.headY = Math.sin(this.t * 0.25 + this.seed) * 0.5;
      } else if (a === 'stretch') {
        const e = Math.sin(clamp((at % 4) / 4, 0, 1) * Math.PI);
        P.shL = P.shR = -2.9 * e; P.elL = P.elR = -0.2 * e; P.lean = -0.2 * e; P.headX = -0.3 * e; P.twist = Math.sin(this.t * 0.8) * 0.3 * (1 - e);
      } else if (a === 'pingpong') {
        const sw = Math.sin(this.t * 4.2 + (ctx.side || 0) * Math.PI);
        P.shR = -0.7 + sw * 0.6; P.shRz = -0.5 + sw * 0.3; P.elR = -1.0; P.lean = 0.2; P.kneeL = P.kneeR = 0.35; P.hipL = P.hipR = -0.35; P.twist = sw * 0.25;
        p.x += Math.sin(this.t * 1.7 + this.seed) * 0.15 * dt * Math.cos(this.rot);
      } else if (a === 'smoke') {
        // isap (tangan ke mulut) → turunkan → hembuskan asap sambil menengadah sedikit
        this.sipT -= dt; if (this.sipT < -1.3) { this.sipT = 3.5 + Math.random() * 3; this.exhaleT = 1.6; }
        const sip = this.sipT < 0 ? Math.sin(clamp(-this.sipT / 1.3, 0, 1) * Math.PI) : 0;
        this.exhaleT = Math.max(0, (this.exhaleT || 0) - dt);
        P.shR = -0.3 - 1.05 * sip; P.shRz = -0.12 - 0.1 * sip; P.elR = -1.0 - 1.25 * sip;
        P.shL = -0.35; P.elL = -1.25; P.shLz = 0.35;                       // tangan kiri terlipat di depan perut
        P.headX = -0.06 * sip - (this.exhaleT > 0 ? 0.22 * Math.sin(this.exhaleT / 1.6 * Math.PI) : 0);
        P.headY += Math.sin(this.t * 0.35 + this.seed) * 0.45 * (1 - sip); P.lean = -0.03;
        P.hipL = 0.08; P.kneeL = 0.12; P.sway = 0.03;                       // bertumpu pada satu kaki
      } else if (a === 'phone') {
        const talking = Math.sin(this.t * 0.8 + this.seed * 2) > -0.2;
        P.shR = -0.95; P.shRz = -0.5; P.elR = -2.35; P.headZ = 0.14;
        if (talking) { P.shL = -0.35 + Math.sin(this.t * 2.7) * 0.25; P.elL = -0.9 + Math.sin(this.t * 3.3) * 0.3; P.shLz = 0.2; P.headX = Math.sin(this.t * 3.1) * 0.05; }
        else { P.shL = -0.1; P.elL = -0.5; P.headX = 0.12; const nod = Math.max(0, Math.sin(this.t * 2.3)); P.headX += nod * nod * 0.12; }
        P.headY += Math.sin(this.t * 0.4 + this.seed) * 0.35; P.sway = Math.sin(this.t * 0.6) * 0.03;
      } else if (a === 'listenStand') {
        P.shL = P.shR = -0.75; P.elL = P.elR = -1.85; P.shLz = -0.25; P.shRz = 0.25; P.lean = 0.08; P.headX = 0.12 + Math.max(0, Math.sin(this.t * 2.4)) * 0.14;
      }
      const turnErr = angDiff(this.rot, this.rotTarget);
      if (Math.abs(turnErr) > 0.25 && !this.tween) this.stepPhase += dt * 10;
      if (Math.abs(turnErr) > 0.25 || (this.curve && !walking)) { const s = Math.sin(this.stepPhase); P.kneeL = Math.max(0, s) * 0.5; P.kneeR = Math.max(0, -s) * 0.5; P.hipL = -Math.max(0, s) * 0.3; P.hipR = -Math.max(0, -s) * 0.3; P.headY += clamp(turnErr, -0.6, 0.6) * 0.7; }
    }
    if (ctx.lookAt && !walking && (a === 'stand' || a === 'sit')) { const d = Math.atan2(ctx.lookAt.x - p.x, ctx.lookAt.z - p.z); P.headY = clamp(angDiff(this.rot, d), -1.0, 1.0); P.twist = P.headY * 0.3; }
    if (this.waveT > 0) { this.waveT -= dt; const e = Math.sin(clamp((2 - this.waveT) / 2, 0, 1) * Math.PI); P.shR = -2.6 * e + P.shR * (1 - e); P.elR = -0.5 * e + P.elR * (1 - e); P.shRz = (-0.3 + Math.sin(this.t * 10) * 0.3) * e + P.shRz * (1 - e); }
    if (this.cheerT > 0) { this.cheerT -= dt; const e = Math.sin(clamp((1.8 - this.cheerT) / 1.8, 0, 1) * Math.PI); P.shR = -2.8 * e + P.shR * (1 - e); P.elR = -0.25 * e + P.elR * (1 - e); P.shRz = -0.35 * e + P.shRz * (1 - e); P.headX = -0.18 * e + P.headX * (1 - e); P.elR += Math.sin(this.t * 14) * 0.15 * e; }

    const pose = this.pose;
    for (const j of JOINTS) {
      let k = kMode; if (j === 'rootY') k = STIFF.root; else if (j.startsWith('head')) k = Math.min(kMode, STIFF.head * (walking ? 2.2 : 1)); else if (j === 'hairX') k = STIFF.hair;
      spring(pose[j], P[j], k, dt);
    }
    const err = angDiff(this.rot, this.rotTarget), ck = 2 * 0.9 * Math.sqrt(turnK);
    this.rotV += (turnK * err - ck * this.rotV) * dt; this.rot += this.rotV * dt;
    R.g.rotation.y = this.rot;
    R.hipL.rotation.x = pose.hipL.x; R.hipR.rotation.x = pose.hipR.x;
    R.kneeL.rotation.x = pose.kneeL.x; R.kneeR.rotation.x = pose.kneeR.x;
    R.ankleL.rotation.x = pose.ankleL.x; R.ankleR.rotation.x = pose.ankleR.x;
    R.shL.rotation.x = pose.shL.x; R.shR.rotation.x = pose.shR.x;
    R.shL.rotation.z = pose.shLz.x; R.shR.rotation.z = pose.shRz.x;
    R.elL.rotation.x = pose.elL.x; R.elR.rotation.x = pose.elR.x;
    R.pelvis.position.y = 0.6 + pose.bob.x; R.pelvis.rotation.z = pose.sway.x;
    R.up.rotation.x = pose.lean.x; R.up.rotation.y = pose.twist.x; R.up.rotation.z = -pose.sway.x * 0.6;
    R.chest.rotation.x = pose.chestX.x;
    R.torso.scale.set(1 + breath * 0.012, 1 + breath * 0.02, 1 + breath * 0.012);
    R.head.rotation.set(pose.headX.x, pose.headY.x, pose.headZ.x);
    R.neck.rotation.y = -pose.twist.x * 0.5;
    if (R.hairBack) R.hairBack.rotation.x = pose.hairX.x * 0.5 - pose.headX.x * 0.4;
    if (R.bun) R.bun.position.z = -0.1 + pose.hairX.x * 0.03;
    this.group.position.y = pose.rootY.x;
    this.blinkT -= dt; let ey = 1.35;
    if (this.blinkT < 0) { ey = 0.15; if (this.blinkT < -0.11) this.blinkT = Math.random() < 0.2 ? 0.18 : 2 + Math.random() * 3.5; }
    R.eyes[0].scale.y = R.eyes[1].scale.y = ey;
    const browUp = this.cheerT > 0 ? 0.025 : 0;
    R.brows.forEach((b) => (b.position.y = smooth(b.position.y, 0.33 + browUp, 10, dt)));
    this.blob.position.set(p.x, 0.015, p.z);

    // kursi kerja ikut bergeser & berputar bersama yang duduk
    const desk = this.seat && this.seat.desk;
    if (desk) {
      desk.chair.position.z = smooth(desk.chair.position.z, p.z + (desk.face === 's' ? -0.06 : 0.06), 14, dt);
      desk.chair.rotation.y += angDiff(desk.chair.rotation.y, this.rot - Math.PI) * (1 - Math.exp(-14 * dt));
      desk.seatG.position.y = smooth(desk.seatG.position.y, this.sitting ? -0.025 : 0, 6, dt);
    }
  }
}
