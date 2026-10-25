// Dunia 3D: gedung tinggi, kota di bawah, langit sesuai jam, dan lantai kantor (lantai 38).
// Mengembalikan titik-titik penting (POI) dan objek yang dianimasikan oleh office.js.
import * as THREE from 'three';
import { NavGrid } from './navgrid.js';

export const RX = 14, RZ = 8, WALL_H = 3.4;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

export function createWorld(scene) {
  const W = {};
  const matCache = new Map();
  const M = (c, o) => {
    if (!o && matCache.has(c)) return matCache.get(c);
    const m = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.82, metalness: 0 }, o || {}));
    if (!o) matCache.set(c, m);
    return m;
  };
  const mesh = (geo, mat, x, y, z, parent, cast) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = cast !== false; m.receiveShadow = true; (parent || scene).add(m); return m;
  };
  const box = (w, h, d, mat, x, y, z, p) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p);
  const cyl = (rt, rb, h, mat, x, y, z, seg, p) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), mat, x, y, z, p);
  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); if (draw) draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData = { c, g }; return t;
  };
  const rbox = (w, h, d, r, mat, x, y, z, p) => {
    const s = new THREE.Shape(); const hw = w / 2 - r, hd = d / 2 - r;
    s.moveTo(-hw, -d / 2); s.lineTo(hw, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -hd); s.lineTo(w / 2, hd); s.quadraticCurveTo(w / 2, d / 2, hw, d / 2);
    s.lineTo(-hw, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, hd); s.lineTo(-w / 2, -hd); s.quadraticCurveTo(-w / 2, -d / 2, -hw, -d / 2);
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: Math.min(0.02, h / 4), bevelSize: Math.min(0.02, r / 2), bevelSegments: 2, curveSegments: 5 });
    g.rotateX(-Math.PI / 2); g.translate(0, -h / 2, 0);
    return mesh(g, mat, x, y, z, p);
  };
  Object.assign(W, { M, mesh, box, cyl, rbox, canvasTex });

  const nav = new NavGrid(-RX + 0.15, RX - 0.15, -RZ + 0.15, RZ - 0.15, 0.25);
  W.nav = nav;

  /* ================= lampu ================= */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f9e, 0.8); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6ea, 1.1);
  sun.position.set(12, 22, 9);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.25); fill.position.set(-12, 9, 14); scene.add(fill);
  scene.fog = new THREE.Fog(0xcfe6f7, 55, 210);
  Object.assign(W, { hemi, sun, fill });

  /* ================= kota ================= */
  function facadeTextures(kind) {
    const w = 64, h = 128;
    const day = canvasTex(w, h, (g) => {
      const base = kind === 0 ? '#5d7fa3' : kind === 1 ? '#b9b2a4' : '#3b4352';
      const glass = kind === 0 ? '#8fb7dc' : kind === 1 ? '#6e8aa6' : '#5f7fa8';
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { g.fillStyle = glass; g.globalAlpha = 0.75 + ((x * 7 + y * 3) % 5) * 0.05; g.fillRect(x * 16 + 2, y * 16 + 3, 12, 10); }
      g.globalAlpha = 1;
    });
    const lit = canvasTex(w, h, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { const r = rnd(); if (r < 0.42) { g.fillStyle = r < 0.12 ? '#cfe3ff' : r < 0.3 ? '#ffd89a' : '#ffe9c2'; g.fillRect(x * 16 + 2, y * 16 + 3, 12, 10); } }
    });
    [day, lit].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
    return { day, lit };
  }
  const towerMats = [0, 1, 2].map((k) => { const t = facadeTextures(k); return new THREE.MeshStandardMaterial({ map: t.day, emissiveMap: t.lit, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.55, metalness: k === 0 ? 0.3 : 0.05 }); });
  function towerGeo(w, h, d) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const span = (f < 2 ? d : w) / 7.2, vs = h / 28.8;
      for (let i = f * 4; i < f * 4 + 4; i++) {
        if (f === 2 || f === 3) uv.setXY(i, 0.01, 0.99);
        else uv.setXY(i, uv.getX(i) * span, uv.getY(i) * vs);
      }
    }
    return g;
  }
  function mergeGeos(list) {
    let nv = 0, ni = 0; list.forEach((g) => { nv += g.attributes.position.count; ni += g.index.count; });
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
    let ov = 0, oi = 0;
    list.forEach((g) => {
      pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3); uv.set(g.attributes.uv.array, ov * 2);
      const src = g.index.array; for (let i = 0; i < src.length; i++) idx[oi + i] = src[i] + ov;
      ov += g.attributes.position.count; oi += src.length; g.dispose();
    });
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); m.setIndex(new THREE.BufferAttribute(idx, 1));
    return m;
  }
  const buckets = towerMats.map(() => []), roofs = [], beacons = [];
  const roofMat = M(0x6b7280);
  for (let gx = -176; gx <= 176; gx += 22) {
    for (let gz = -176; gz <= 176; gz += 22) {
      const x = gx + (rnd() - 0.5) * 9, z = gz + (rnd() - 0.5) * 9;
      if (Math.abs(x) < 32 && Math.abs(z) < 26) continue;
      const dist = Math.hypot(x, z);
      if (dist > 190 || (dist > 105 && rnd() < 0.35) || (dist > 62 && rnd() < 0.15)) continue;
      let w, top;
      if (dist < 62) { w = 8 + rnd() * 7; top = -30 - rnd() * 40; }
      else if (dist < 105) { w = 10 + rnd() * 9; top = -42 + rnd() * 36; }
      else { w = 12 + rnd() * 12; top = -34 + rnd() * 52; }
      const d = w * (0.7 + rnd() * 0.6), base = -220, h = top - base;
      const g = towerGeo(w, h, d); g.translate(x, base + h / 2, z); buckets[(rnd() * buckets.length) | 0].push(g);
      const r = new THREE.BoxGeometry(w * 0.94, 0.6, d * 0.94); r.translate(x, top + 0.3, z); roofs.push(r);
      if (rnd() < 0.45) { const hv = new THREE.BoxGeometry(w * 0.3, 1.6, d * 0.3); hv.translate(x + (rnd() - 0.5) * w * 0.4, top + 1.1, z + (rnd() - 0.5) * d * 0.4); roofs.push(hv); }
      if (rnd() < 0.3 && top > -8) {
        const an = new THREE.CylinderGeometry(0.1, 0.15, 6, 6); an.translate(x, top + 3.3, z); roofs.push(an);
        const bl = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4b4b, fog: false })); bl.position.set(x, top + 6.4, z); scene.add(bl); beacons.push(bl);
      }
    }
  }
  buckets.forEach((list, i) => { if (list.length) scene.add(new THREE.Mesh(mergeGeos(list), towerMats[i])); });
  scene.add(new THREE.Mesh(mergeGeos(roofs), roofMat));
  const ownT = facadeTextures(0);
  const ownMat = new THREE.MeshStandardMaterial({ map: ownT.day, emissiveMap: ownT.lit, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4, metalness: 0.35 });
  towerMats.push(ownMat);
  const own = new THREE.Mesh(towerGeo(29.4, 220, 17.4), ownMat); own.position.set(0, -0.8 - 110, 0); scene.add(own);
  box(29.8, 0.6, 17.8, M(0xd9dbe0), 0, -0.48, 0);
  box(29.8, 0.12, 0.12, M(0x9aa0ad), 0, -0.16, 8.9);
  box(0.12, 0.12, 17.8, M(0x9aa0ad), 14.9, -0.16, 0);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 1, depthWrite: false });
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(3 + rnd() * 3, 10, 8), cloudMat); s.position.set(k * 3.5 - 5, (rnd() - 0.5) * 1.5, (rnd() - 0.5) * 3); s.scale.y = 0.45; g.add(s); }
    const a = rnd() * TAU, r = 60 + rnd() * 110; g.position.set(Math.cos(a) * r, -14 - rnd() * 40, Math.sin(a) * r); g.scale.setScalar(1.4 + rnd()); g.userData.speed = 0.4 + rnd() * 0.6; scene.add(g); clouds.push(g);
  }

  /* ================= langit sesuai jam ================= */
  const SKY = [
    { h: 0, top: '#060a1a', hor: '#17213f', sun: '#7f8fff', sunI: 0.16, hemiI: 0.26, night: 1 },
    { h: 5, top: '#0b1430', hor: '#29345a', sun: '#8f9fff', sunI: 0.2, hemiI: 0.3, night: 1 },
    { h: 6.2, top: '#33447a', hor: '#f2a77a', sun: '#ffb98a', sunI: 0.55, hemiI: 0.45, night: 0.55 },
    { h: 7.5, top: '#5b9bd8', hor: '#cfe6f7', sun: '#fff1dd', sunI: 1.0, hemiI: 0.75, night: 0.05 },
    { h: 12, top: '#4a94e0', hor: '#d6ebfa', sun: '#ffffff', sunI: 1.15, hemiI: 0.85, night: 0 },
    { h: 16, top: '#5a95d2', hor: '#e5ebf0', sun: '#fff0d8', sunI: 1.05, hemiI: 0.8, night: 0 },
    { h: 17.6, top: '#45589a', hor: '#f6a66a', sun: '#ffa86b', sunI: 0.75, hemiI: 0.6, night: 0.25 },
    { h: 18.5, top: '#252e5a', hor: '#c4695c', sun: '#ff8a66', sunI: 0.42, hemiI: 0.42, night: 0.6 },
    { h: 19.6, top: '#0c1330', hor: '#26315a', sun: '#8f9fff', sunI: 0.22, hemiI: 0.3, night: 0.95 },
    { h: 24, top: '#060a1a', hor: '#17213f', sun: '#7f8fff', sunI: 0.16, hemiI: 0.26, night: 1 },
  ];
  const skyTex = canvasTex(512, 512);
  scene.background = skyTex;
  const cA = new THREE.Color(), cB = new THREE.Color();
  const mix = (a, b, t) => '#' + cA.set(a).lerp(cB.set(b), t).getHexString();
  const stars = Array.from({ length: 120 }, () => [rnd(), rnd() * 0.65, rnd()]);
  W.night = 0;
  W.applySky = (lampsAllowed) => {
    const now = new Date(); const h = now.getHours() + now.getMinutes() / 60;
    let i = 0; while (i < SKY.length - 2 && SKY[i + 1].h <= h) i++;
    const a = SKY[i], b = SKY[i + 1], t = clamp((h - a.h) / (b.h - a.h), 0, 1);
    const s = { top: mix(a.top, b.top, t), hor: mix(a.hor, b.hor, t), sun: mix(a.sun, b.sun, t), sunI: a.sunI + (b.sunI - a.sunI) * t, hemiI: a.hemiI + (b.hemiI - a.hemiI) * t, night: a.night + (b.night - a.night) * t };
    W.night = s.night;
    const g = skyTex.userData.g;
    const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, s.top); gr.addColorStop(0.62, s.hor); gr.addColorStop(1, s.hor);
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    if (s.night > 0.3) { g.fillStyle = '#ffffff'; stars.forEach(([x, y, br]) => { g.globalAlpha = (s.night - 0.3) * br; g.fillRect(x * 512, y * 512, 1.6, 1.6); }); g.globalAlpha = 1; }
    skyTex.needsUpdate = true;
    scene.fog.color.set(s.hor);
    sun.color.set(s.sun); sun.intensity = s.sunI;
    sun.position.set(18 * Math.cos((h - 6) / 12 * Math.PI) + 2, 22, 9);
    hemi.intensity = s.hemiI; hemi.color.set(s.night > 0.5 ? 0xaab4ff : 0xffffff);
    fill.intensity = 0.1 + 0.2 * (1 - s.night);
    towerMats.forEach((m) => (m.emissiveIntensity = s.night * 1.25));
    cloudMat.opacity = 0.75 - 0.45 * s.night; cloudMat.color.set(s.night > 0.5 ? 0x6d7695 : 0xffffff);
    glassMat.opacity = 0.16 + 0.1 * s.night;
    const lampOn = clamp((s.night - 0.2) / 0.6, 0, 1);
    roomLamps.forEach((l, k) => (l.intensity = k < lampsAllowed ? lampOn * 0.7 : 0));
    W.lampOn = lampOn;
    return { label: h < 5 ? 'Malam' : h < 7 ? 'Subuh' : h < 11 ? 'Pagi' : h < 15 ? 'Siang' : h < 18.5 ? 'Sore' : 'Malam', night: s.night };
  };

  /* ================= lantai & dinding ================= */
  const floorTex = canvasTex(512, 512, (g, w, h) => {
    const tones = ['#d6b78f', '#cfae86', '#dbbd96', '#cba67d', '#d3b38b'];
    const ph = 64; let s2 = 7; const r2 = () => { s2 = (s2 * 16807) % 2147483647; return s2 / 2147483647; };
    for (let y = 0; y < h; y += ph) {
      let x = -r2() * 200;
      while (x < w) { const len = 180 + r2() * 200; g.fillStyle = tones[(r2() * tones.length) | 0]; g.fillRect(x, y, len, ph);
        g.fillStyle = 'rgba(90,60,30,.07)'; for (let k = 0; k < 5; k++) g.fillRect(x, y + 6 + r2() * (ph - 12), len, 1.5);
        g.fillStyle = 'rgba(70,45,20,.3)'; g.fillRect(x, y, 2, ph); x += len; }
      g.fillStyle = 'rgba(70,45,20,.25)'; g.fillRect(0, y, w, 2);
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(7, 4);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(RX * 2, 0.2, RZ * 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 }));
  floor.position.set(0, -0.1, 0); floor.receiveShadow = true; scene.add(floor);
  const carpet = (w, d, c, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M(c)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.006, z); m.receiveShadow = true; scene.add(m); return m; };

  const frameMat = M(0x3c4352), wallMat = M(0xe9ebf0), wallAccent = M(0x2b3150);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfdcf0, transparent: true, opacity: 0.18, roughness: 0.08, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const frosted = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.9, depthWrite: false });
  W.glassMat = glassMat;
  function curtainWall(len, axis, fixed, from) {
    const H = WALL_H, n = Math.max(1, Math.round(len / 2.3)), seg = len / n;
    const at = (t, y, w, h, d, mat) => (axis === 'x' ? box(w, h, d, mat, from + t, y, fixed) : box(d, h, w, mat, fixed, y, from + t));
    const g = at(len / 2, H / 2 + 0.05, len, H - 0.3, 0.04, glassMat); g.castShadow = false; g.receiveShadow = false;
    at(len / 2, 0.06, len, 0.12, 0.16, frameMat);
    at(len / 2, H - 0.12, len, 0.28, 0.2, frameMat);
    for (let i = 0; i <= n; i++) at(i * seg, H / 2, 0.09, H, 0.14, frameMat);
  }
  curtainWall(RX * 2, 'x', -RZ - 0.05, -RX);
  curtainWall(RZ * 2, 'z', -RX - 0.05, -RZ);
  box(0.5, WALL_H + 0.1, 0.5, M(0xd7dae2), -RX - 0.05, WALL_H / 2, -RZ - 0.05);

  // partisi kaca untuk ruang Manager dan ruang meeting (dengan celah pintu)
  function glassPartition(x0, z0, x1, z1, doorAt, doorW = 1.6) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const segs = doorAt == null ? [[0, 1]] : (() => {
      const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
      const d0 = (doorAt - doorW / 2) / len, d1 = (doorAt + doorW / 2) / len;
      return [[0, d0], [d1, 1]];
    })();
    for (const [a, b] of segs) {
      const xa = x0 + (x1 - x0) * a, xb = x0 + (x1 - x0) * b, za = z0 + (z1 - z0) * a, zb = z0 + (z1 - z0) * b;
      const len = Math.hypot(xb - xa, zb - za); if (len < 0.05) continue;
      const cx = (xa + xb) / 2, cz = (za + zb) / 2;
      const gl = box(alongX ? len : 0.04, 2.7, alongX ? 0.04 : len, glassMat, cx, 1.42, cz); gl.castShadow = false;
      const fr = box(alongX ? len : 0.05, 0.22, alongX ? 0.05 : len, frosted, cx, 1.25, cz); fr.castShadow = false;
      box(alongX ? len : 0.08, 0.08, alongX ? 0.08 : len, frameMat, cx, 2.8, cz);
      box(alongX ? len : 0.08, 0.06, alongX ? 0.08 : len, frameMat, cx, 0.04, cz);
      [[xa, za], [xb, zb]].forEach(([px, pz]) => box(0.08, 2.8, 0.08, frameMat, px, 1.4, pz));
    }
    if (doorAt != null) {
      const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
      const t = doorAt / len; const dx = x0 + (x1 - x0) * t, dz = z0 + (z1 - z0) * t;
      box(alongX ? doorW + 0.1 : 0.1, 0.1, alongX ? 0.1 : doorW + 0.1, frameMat, dx, 2.8, dz);
    }
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    nav.wall(x0, z0, x1, z1, doorAt == null ? [] : [[doorAt - doorW / 2 + 0.05, doorAt + doorW / 2 - 0.05]]);
    return len;
  }
  const plateTex = (text) => canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#232842'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = '700 28px sans-serif'; c.textBaseline = 'middle'; c.fillText(text, 22, h / 2 + 2); });

  /* ================= ruang Manager (kiri belakang) ================= */
  const MR = { x0: -RX, x1: -8.4, z0: -RZ, z1: -3.4, door: -10.4 };
  carpet(MR.x1 - MR.x0, MR.z1 - MR.z0, 0x6f7f8f, (MR.x0 + MR.x1) / 2, (MR.z0 + MR.z1) / 2);
  glassPartition(MR.x0, MR.z1, MR.x1, MR.z1, MR.door - MR.x0);
  glassPartition(MR.x1, MR.z0, MR.x1, MR.z1, null);
  mesh(new THREE.PlaneGeometry(0.66, 0.16), new THREE.MeshBasicMaterial({ map: plateTex('MANAGER'), toneMapped: false }), MR.door + 1.35, 1.7, MR.z1 + 0.03, null, false);
  box(0.45, 2.0, 1.5, M(0x6f533c), MR.x0 + 0.35, 1.0, -6.6); nav.box(MR.x0 + 0.35, -6.6, 0.45, 1.5);
  for (let s = 0; s < 3; s++) { box(0.47, 0.04, 1.4, M(0x5b4632), MR.x0 + 0.37, 0.5 + s * 0.55, -6.6); let z = -7.25; while (z < -5.95) { const w = 0.08 + rnd() * 0.07, hh = 0.28 + rnd() * 0.14; box(0.3, hh, w, M([0x2d6cdf, 0xe0952f, 0x3c4257, 0xc9c2b2, 0x2f8f6d][(rnd() * 5) | 0]), MR.x0 + 0.37, 0.52 + s * 0.55 + hh / 2, z + w / 2); z += w + 0.015; } }
  [[-12.1, -4.3], [-10.7, -4.3]].forEach(([x, z]) => { rbox(0.55, 0.08, 0.5, 0.1, M(0x2f3446), x, 0.45, z); rbox(0.55, 0.4, 0.07, 0.06, M(0x2f3446), x, 0.68, z - 0.24); cyl(0.03, 0.03, 0.42, M(0x9aa0ad), x, 0.22, z, 8); nav.box(x, z, 0.5, 0.5, 0.15); });

  /* ================= ruang meeting kaca (tengah kanan belakang) ================= */
  const MT = { x0: 3.6, x1: 10, z0: -RZ, z1: -3.4, door: 6.8 };
  carpet(MT.x1 - MT.x0, MT.z1 - MT.z0, 0x7d8aa6, (MT.x0 + MT.x1) / 2, (MT.z0 + MT.z1) / 2);
  glassPartition(MT.x0, MT.z1, MT.x1, MT.z1, MT.door - MT.x0);
  glassPartition(MT.x0, MT.z0, MT.x0, MT.z1, null);
  glassPartition(MT.x1, MT.z0, MT.x1, MT.z1, null);
  mesh(new THREE.PlaneGeometry(0.66, 0.16), new THREE.MeshBasicMaterial({ map: plateTex('MEETING'), toneMapped: false }), MT.door + 1.35, 1.7, MT.z1 + 0.03, null, false);
  const MTC = { x: 6.8, z: -5.75 };
  rbox(3.2, 0.06, 1.3, 0.25, M(0xd9c7a8), MTC.x, 0.74, MTC.z);
  [[-1.1, 0], [1.1, 0]].forEach(([dx]) => { cyl(0.07, 0.07, 0.72, M(0x3e4354), MTC.x + dx, 0.36, MTC.z, 10); });
  nav.box(MTC.x, MTC.z, 3.2, 1.3, 0.25);
  const meetChairs = [[-1.0, -1.0, 0], [0, -1.0, 0], [1.0, -1.0, 0], [-1.0, 1.0, Math.PI], [0, 1.0, Math.PI], [1.0, 1.0, Math.PI]];
  meetChairs.forEach(([dx, dz, r]) => { const g = new THREE.Group(); g.position.set(MTC.x + dx, 0, MTC.z + dz); g.rotation.y = r; scene.add(g);
    rbox(0.48, 0.08, 0.46, 0.08, M(0x4b5470), 0, 0.46, 0, g); rbox(0.48, 0.46, 0.07, 0.06, M(0x4b5470), 0, 0.73, -0.22, g); cyl(0.035, 0.035, 0.42, M(0x2d3242), 0, 0.22, 0, 8, g); });
  // layar presentasi
  const screenTex = canvasTex(512, 288);
  cyl(0.05, 0.05, 1.4, M(0x2d3242), MTC.x, 0.7, -7.55, 8); box(0.6, 0.04, 0.5, M(0x2d3242), MTC.x, 0.02, -7.55);
  rbox(2.3, 1.3, 0.07, 0.03, M(0x1b1e27), MTC.x, 1.75, -7.6);
  mesh(new THREE.PlaneGeometry(2.2, 1.22), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }), MTC.x, 1.75, -7.56, null, false);
  nav.box(MTC.x, -7.55, 0.8, 0.5, 0.2);
  W.meetingScreen = (text, sub, progress) => {
    const g = screenTex.userData.g, w = 512, h = 288;
    g.fillStyle = text ? '#10141f' : '#1a1f2e'; g.fillRect(0, 0, w, h);
    if (!text) { g.fillStyle = '#39415c'; g.font = '800 34px sans-serif'; g.fillText('STUDIO KONTEN AI', 70, 150); }
    else {
      g.fillStyle = '#8e99ff'; g.font = '600 18px sans-serif'; g.fillText('PRESENTASI TASK', 28, 42);
      g.fillStyle = '#ffffff'; g.font = '700 30px sans-serif';
      const words = String(text).split(' '); let line = '', y = 92;
      for (const wd of words) { const tt = line ? line + ' ' + wd : wd; if (g.measureText(tt).width > 450) { g.fillText(line, 28, y); y += 38; line = wd; if (y > 170) break; } else line = tt; }
      if (y <= 170) g.fillText(line, 28, y);
      g.fillStyle = '#9aa1b4'; g.font = '500 18px sans-serif'; g.fillText(sub || '', 28, 230);
      g.fillStyle = '#262d42'; g.fillRect(28, 250, w - 56, 8); g.fillStyle = '#5cc184'; g.fillRect(28, 250, (w - 56) * clamp(progress || 0, 0, 1), 8);
    }
    screenTex.needsUpdate = true;
  };
  W.meetingScreen(null);

  /* ================= lobi lift (kanan belakang) ================= */
  const LB = { x0: 10, z1: -4.4 };
  box(0.2, WALL_H, RZ - 4.4 + 0.1, wallMat, LB.x0 + 0.1, WALL_H / 2, (-RZ - 4.4) / 2);  // dinding pembatas ruang meeting
  nav.rect(LB.x0, -RZ, LB.x0 + 0.2, LB.z1, 0.24);
  box(RX - LB.x0, WALL_H, 0.3, M(0xcfd3db), (RX + LB.x0) / 2, WALL_H / 2, -RZ + 0.1);   // dinding lift
  nav.rect(LB.x0, -RZ, RX, -RZ + 0.25, 0.24);
  carpet(RX - LB.x0 - 0.2, 3.6, 0x9aa0ad, (RX + LB.x0 + 0.2) / 2, -RZ + 1.8);
  const lifts = [11.3, 12.9].map((x, i) => {
    box(1.3, 2.5, 0.12, M(0x9aa0ad, { metalness: 0.5, roughness: 0.4 }), x, 1.25, -RZ + 0.27);
    const L = new THREE.Mesh(new THREE.BoxGeometry(0.52, 2.2, 0.05), M(0xc9ced8, { metalness: 0.7, roughness: 0.25 }));
    const R = L.clone(); L.position.set(x - 0.27, 1.12, -RZ + 0.35); R.position.set(x + 0.27, 1.12, -RZ + 0.35); scene.add(L, R);
    const ind = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshBasicMaterial({ color: 0x5cc184 })); ind.position.set(x, 2.62, -RZ + 0.34); scene.add(ind);
    return { x, L, R, open: 0, target: 0, holdT: 0, ind, door: { x, z: -RZ + 0.95 }, inside: { x, z: -RZ + 0.1 } };
  });
  W.lifts = lifts;
  W.openLift = (i, hold = 2.5) => { lifts[i].target = 1; lifts[i].holdT = hold; };
  mesh(new THREE.PlaneGeometry(0.66, 0.16), new THREE.MeshBasicMaterial({ map: plateTex('LIFT · L38'), toneMapped: false }), 12.1, 2.85, -RZ + 0.27, null, false);

  /* ================= papan task 3D ================= */
  const BOARD = { x: -2.4, z: -6.9, w: 4.8 };
  const boardTex = canvasTex(1024, 420);
  [-BOARD.w / 2 + 0.1, BOARD.w / 2 - 0.1].forEach((dx) => cyl(0.04, 0.04, 2.7, M(0x3c4352), BOARD.x + dx, 1.35, BOARD.z, 8));
  box(BOARD.w + 0.1, 2.06, 0.06, M(0x3c4352), BOARD.x, 1.75, BOARD.z - 0.01);
  mesh(new THREE.PlaneGeometry(BOARD.w, 1.96), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.5 }), BOARD.x, 1.75, BOARD.z + 0.025, null, false);
  box(1.6, 0.05, 0.16, M(0x9aa0b0), BOARD.x, 0.74, BOARD.z + 0.08);
  nav.box(BOARD.x, BOARD.z, BOARD.w + 0.1, 0.3, 0.25);
  W.board = BOARD;
  W.drawBoard = (cols, projects, team) => {
    const g = boardTex.userData.g, w = 1024, h = 420;
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#232842'; g.font = '800 26px sans-serif'; g.fillText('PAPAN TASK', 24, 38);
    const titles = ['OPEN', 'ON PROGRESS', 'DONE HARI INI'];
    const colW = (w - 48) / 3;
    const proj = new Map(projects.map((p) => [p.id, p])), tm = new Map(team.map((e) => [e.id, e]));
    cols.forEach((list, c) => {
      const x0 = 24 + c * colW;
      g.fillStyle = '#5b6276'; g.font = '700 18px sans-serif'; g.fillText(titles[c] + '  ' + list.length, x0, 72);
      g.strokeStyle = '#d8dbe5'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, 82); g.lineTo(x0 + colW - 16, 82); g.stroke();
      list.slice(0, 8).forEach((t, k) => {
        const cx = x0 + (k % 2) * ((colW - 16) / 2), cy = 94 + Math.floor(k / 2) * 78, cw = (colW - 16) / 2 - 8, ch = 68;
        const p = proj.get(t.projectId);
        g.fillStyle = t.status === 'review' ? '#dfe3ff' : c === 2 ? '#e1f2e6' : '#fff4c6';
        g.save(); g.translate(cx + cw / 2, cy + ch / 2); g.rotate(((k * 37) % 7 - 3) * 0.006); g.fillRect(-cw / 2, -ch / 2, cw, ch);
        g.fillStyle = p ? p.color : '#8a90a0'; g.fillRect(-cw / 2, -ch / 2, cw, 6);
        g.fillStyle = '#232842'; g.font = '600 14px sans-serif';
        const words = String(t.title).split(' '); let line = '', y = -ch / 2 + 24, n = 0;
        for (const wd of words) { const tt = line ? line + ' ' + wd : wd; if (g.measureText(tt).width > cw - 14) { g.fillText(line, -cw / 2 + 7, y); y += 17; line = wd; if (++n >= 2) { line += '…'; break; } } else line = tt; }
        if (n < 3) g.fillText(line, -cw / 2 + 7, y);
        const who = tm.get(t.assigneeId);
        if (who) { g.fillStyle = who.look.shirt; g.beginPath(); g.arc(cw / 2 - 13, ch / 2 - 13, 9, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.font = '700 10px sans-serif'; g.fillText(who.name[0], cw / 2 - 16.5, ch / 2 - 9.5); }
        g.restore();
      });
      if (list.length > 8) { g.fillStyle = '#5b6276'; g.font = '500 15px sans-serif'; g.fillText('+' + (list.length - 8) + ' lainnya', x0, 410); }
    });
    boardTex.needsUpdate = true;
  };
  W.drawBoard([[], [], []], [], []);

  /* ================= meja kerja ================= */
  const pendants = [];
  const bulbMats = [];
  const pendant = (x, z, y = 2.95) => {
    cyl(0.008, 0.008, 3.45 - y, M(0x2d3242), x, (3.45 + y) / 2 + 0.1, z, 4).castShadow = false;
    cyl(0.1, 0.3, 0.2, M(0x2d3242), x, y + 0.08, z, 16).castShadow = false;
    const bm = new THREE.MeshBasicMaterial({ color: 0xf4efe4 }); bulbMats.push(bm);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), bm); b.position.set(x, y - 0.05, z); scene.add(b); pendants.push(b);
  };
  W.desks = [];
  // face: 'n' = karyawan menghadap -z (kursi di +z), 's' = menghadap +z (kursi di -z)
  function desk(x, z, face, kind, accent) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = face === 's' ? Math.PI : 0; scene.add(g);
    const isMgr = kind === 'manager', dw = isMgr ? 2.4 : 1.9;
    rbox(dw, 0.05, 0.95, 0.06, M(isMgr ? 0x7a5a3c : 0xdcc6a2), 0, 0.72, 0, g);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => cyl(0.03, 0.03, 0.7, M(0x3e4354), a * (dw / 2 - 0.1), 0.35, b * 0.4, 8, g));
    box(dw - 0.2, 0.32, 0.03, M(isMgr ? 0x5b4632 : 0xc7b08b), 0, 0.5, -0.43, g);
    cyl(0.12, 0.14, 0.02, M(0x2d3242), 0, 0.755, -0.28, 16, g);
    cyl(0.025, 0.025, 0.32, M(0x2d3242), 0, 0.91, -0.31, 8, g);
    rbox(1.0, 0.6, 0.05, 0.04, M(0x23272f), 0, 1.13, -0.3, g);
    const tex = canvasTex(256, 160);
    const scr = mesh(new THREE.PlaneGeometry(0.92, 0.54), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, 1.13, -0.27, g, false);
    rbox(0.52, 0.025, 0.17, 0.03, M(0xeceef2), 0, 0.755, 0.15, g);
    rbox(0.08, 0.025, 0.12, 0.04, M(0xeceef2), 0.38, 0.755, 0.15, g);
    cyl(0.05, 0.045, 0.1, M(accent || 0x8a90a0), -dw / 2 + 0.25, 0.8, -0.05, 12, g);
    if (kind === 'designer') { rbox(0.42, 0.02, 0.3, 0.03, M(0x2d3242), 0.62, 0.76, 0.05, g); cyl(0.006, 0.006, 0.16, M(0xd45a72), 0.75, 0.78, 0.1, 6, g).rotation.z = 1.3; }
    if (kind === 'coordinator') { for (let i = 0; i < 3; i++) box(0.14, 0.004, 0.14, M([0xfff4c6, 0xdfe3ff, 0xe1f2e6][i]), 0.55 + i * 0.16, 0.75, -0.1 + (i % 2) * 0.05, g); }
    if (isMgr) { for (let i = 0; i < 3; i++) { const f = box(0.3, 0.02, 0.22, M([0xffffff, 0xf4e3b5, 0xdfe8f5][i]), 0.9, 0.76 + i * 0.022, 0, g); f.rotation.y = (i - 1) * 0.12; } }
    // lampu meja kecil (menyala saat orangnya ada di malam hari)
    const lampBulbMat = new THREE.MeshBasicMaterial({ color: 0x777777 });
    cyl(0.07, 0.08, 0.02, M(0x2d3242), dw / 2 - 0.2, 0.755, -0.3, 10, g); cyl(0.01, 0.01, 0.34, M(0x2d3242), dw / 2 - 0.2, 0.92, -0.3, 6, g);
    const lb = mesh(new THREE.ConeGeometry(0.09, 0.12, 12, 1, true), lampBulbMat, dw / 2 - 0.2, 1.1, -0.25, g, false); lb.rotation.x = 0.5;
    // kursi
    const chair = new THREE.Group(); scene.add(chair);
    const seatG = new THREE.Group(); chair.add(seatG);
    const cm = M(isMgr ? 0x2b2f3a : 0x3a4157);
    rbox(0.54, 0.08, 0.5, 0.1, cm, 0, 0.45, 0, seatG);
    rbox(0.52, isMgr ? 0.78 : 0.6, 0.07, 0.08, cm, 0, isMgr ? 0.92 : 0.84, 0.28, seatG);
    cyl(0.035, 0.035, 0.4, M(0x2d3242), 0, 0.21, 0, 8, chair);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; const leg = box(0.3, 0.03, 0.05, M(0x2d3242), Math.cos(a) * 0.15, 0.035, Math.sin(a) * 0.15, chair); leg.rotation.y = -a; }
    const dir = face === 's' ? -1 : 1;           // arah kursi relatif meja (sumbu z)
    const seat = { x, z: z + dir * 0.86, rot: face === 's' ? 0 : Math.PI };
    const front = { x, z: z + dir * 1.5 };
    chair.position.set(x, 0, z + dir * 0.95); chair.rotation.y = face === 's' ? Math.PI : 0;
    nav.box(x, z, dw, 0.95, 0.28);
    pendant(x, z + dir * 0.15);
    const d = { x, z, face, kind, tex, scr, chair, seatG, seat, front, home: { x: chair.position.x, z: chair.position.z }, homeRot: chair.rotation.y, lampBulbMat, owner: null };
    W.desks.push(d);
    return d;
  }
  // meja terbuka menghadap papan task (layar monitor menghadap kamera)
  const OPEN_DESK_X = [-6.2, -3.0, 0.2, 3.4, 6.6, -9.6, 9.8];
  W.openDeskSlots = OPEN_DESK_X.map((x) => ({ x, z: -1.2 }));
  W.makeDesk = (slot, kind, accent) => desk(slot.x, slot.z, 'n', kind, accent);
  W.makeManagerDesk = (accent) => desk(-11.4, -5.75, 's', 'manager', accent);
  carpet(17.6, 3.6, 0x8d94a6, -1.4, -1.0);

  /* ================= pantry (kanan depan) ================= */
  rbox(5.4, 0.86, 0.72, 0.04, M(0x3c4257), 10.9, 0.43, 7.45);
  rbox(5.5, 0.05, 0.8, 0.04, M(0xf2f1ec), 10.9, 0.88, 7.45);
  box(5.4, 0.6, 0.35, M(0x3c4257), 10.9, 2.1, 7.72);
  rbox(0.95, 1.95, 0.8, 0.08, new THREE.MeshStandardMaterial({ color: 0xe3e6ec, roughness: 0.35 }), 13.45, 0.98, 6.3); nav.box(13.45, 6.3, 0.95, 0.8);
  rbox(0.48, 0.62, 0.42, 0.05, M(0x22262f), 9.3, 1.2, 7.55);
  const machineLight = box(0.22, 0.06, 0.02, new THREE.MeshBasicMaterial({ color: 0xffb347 }), 9.3, 1.36, 7.33); machineLight.castShadow = false;
  [10.1, 10.35, 10.6].forEach((x, i) => cyl(0.06, 0.05, 0.12, M([0xffffff, 0xe0952f, 0x2f8f9d][i]), x, 0.97, 7.35, 12));
  cyl(0.18, 0.15, 0.08, M(0xe8e4dc), 11.9, 0.94, 7.45, 16);
  [0, 1, 2].forEach((i) => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M([0xe0952f, 0xd45a72, 0x7fb04a][i])); f.position.set(11.85 + i * 0.06, 1.0, 7.45 + (i - 1) * 0.05); scene.add(f); });
  nav.box(10.9, 7.45, 5.5, 0.8);
  cyl(0.2, 0.2, 0.95, M(0xeceef2), 7.8, 0.48, 7.45, 16); cyl(0.17, 0.17, 0.45, new THREE.MeshStandardMaterial({ color: 0x9fd3f2, transparent: true, opacity: 0.7 }), 7.8, 1.18, 7.45, 16); nav.circle(7.8, 7.45, 0.22);
  // meja bar tinggi untuk minum kopi
  const BAR = { x: 11.6, z: 4.6 };
  cyl(0.45, 0.45, 0.05, M(0xd9c7a8), BAR.x, 1.05, BAR.z, 24); cyl(0.05, 0.05, 1.03, M(0x3e4354), BAR.x, 0.52, BAR.z, 8); cyl(0.3, 0.3, 0.03, M(0x3e4354), BAR.x, 0.02, BAR.z, 16);
  nav.circle(BAR.x, BAR.z, 0.45);
  carpet(6.4, 3.8, 0xc9c2b2, 10.6, 5.9);

  /* ================= lounge (kiri depan) ================= */
  carpet(6.4, 3.8, 0xc7b79f, -10.6, 5.6);
  const sofaMat = M(0x5f6b9c);
  const SOFA = { x: -10.6, z: 7.0 };
  rbox(3.0, 0.42, 0.95, 0.12, sofaMat, SOFA.x, 0.25, SOFA.z); rbox(3.0, 0.55, 0.25, 0.1, sofaMat, SOFA.x, 0.62, SOFA.z + 0.42);
  rbox(0.25, 0.55, 0.95, 0.1, sofaMat, SOFA.x - 1.57, 0.45, SOFA.z); rbox(0.25, 0.55, 0.95, 0.1, sofaMat, SOFA.x + 1.57, 0.45, SOFA.z);
  rbox(0.6, 0.12, 0.4, 0.12, M(0xe0952f), SOFA.x - 0.8, 0.53, SOFA.z + 0.15).rotation.z = 0.15;
  nav.box(SOFA.x, SOFA.z + 0.1, 3.2, 1.0, 0.1);
  rbox(1.4, 0.06, 0.7, 0.1, M(0xd9c7a8), SOFA.x, 0.4, 5.5); nav.box(SOFA.x, 5.5, 1.4, 0.7, 0.2);
  [[-0.6, -0.25], [0.6, -0.25], [-0.6, 0.25], [0.6, 0.25]].forEach(([dx, dz]) => cyl(0.025, 0.025, 0.38, M(0x3e4354), SOFA.x + dx, 0.19, 5.5 + dz, 6));
  const beanA = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), M(0xd45a72)); beanA.scale.y = 0.6; beanA.position.set(-13.0, 0.26, 5.0); beanA.castShadow = true; scene.add(beanA);
  const beanB = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), M(0x6a5ad8)); beanB.scale.y = 0.6; beanB.position.set(-8.2, 0.26, 5.3); beanB.castShadow = true; scene.add(beanB);
  cyl(0.02, 0.02, 1.6, M(0x2d3242), -8.5, 0.8, 7.4, 6); cyl(0.12, 0.22, 0.24, M(0xf1e7d2, { emissive: 0xffd9a0, emissiveIntensity: 0.25 }), -8.5, 1.65, 7.4, 14);

  /* ================= ping-pong (tengah depan) ================= */
  const PP = { x: -1.6, z: 5.6 };
  box(2.74, 0.05, 1.52, M(0x2f7f5a), PP.x, 0.76, PP.z);
  box(2.74, 0.006, 0.02, M(0xffffff), PP.x, 0.79, PP.z);
  box(0.02, 0.15, 1.6, M(0xeeeeee, { transparent: true, opacity: 0.7 }), PP.x, 0.86, PP.z);
  [[-1.2, -0.65], [1.2, -0.65], [-1.2, 0.65], [1.2, 0.65]].forEach(([dx, dz]) => cyl(0.03, 0.03, 0.74, M(0x2d3242), PP.x + dx, 0.37, PP.z + dz, 6));
  nav.box(PP.x, PP.z, 2.74, 1.52, 0.25);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); ball.visible = false; scene.add(ball);
  W.pingpongBall = ball;

  /* ================= ruang merokok kaca (depan, kanan ping-pong) ================= */
  const SR = { x0: 2.2, x1: 5.8, z0: 4.6, z1: RZ, door: 1.8 };
  carpet(SR.x1 - SR.x0 - 0.1, SR.z1 - SR.z0 - 0.1, 0x8f9a9e, (SR.x0 + SR.x1) / 2, (SR.z0 + SR.z1) / 2);
  glassPartition(SR.x0, SR.z0, SR.x1, SR.z0, SR.door, 1.2);
  glassPartition(SR.x0, SR.z0, SR.x0, SR.z1, null);
  glassPartition(SR.x1, SR.z0, SR.x1, SR.z1, null);
  // papan nama gantung dua sisi di atas pintu
  const srPlate = plateTex('RUANG MEROKOK');
  [0, Math.PI].forEach((r) => { const m = mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: srPlate, toneMapped: false }), SR.x0 + SR.door, 3.02, SR.z0 + (r ? 0.012 : -0.012), null, false); m.rotation.y = r ? 0 : Math.PI; });
  // asbak berdiri, bangku, kipas penyedot asap
  const ASH = { x: (SR.x0 + SR.x1) / 2, z: 6.75 };
  cyl(0.16, 0.2, 0.04, M(0x2d3242), ASH.x, 0.02, ASH.z, 16); cyl(0.05, 0.05, 0.85, M(0x9aa0ad, { metalness: 0.6, roughness: 0.35 }), ASH.x, 0.45, ASH.z, 10);
  cyl(0.2, 0.15, 0.1, M(0x9aa0ad, { metalness: 0.6, roughness: 0.35 }), ASH.x, 0.92, ASH.z, 18); cyl(0.17, 0.17, 0.01, M(0x5b5f68), ASH.x, 0.97, ASH.z, 18);
  nav.circle(ASH.x, ASH.z, 0.22);
  rbox(1.7, 0.08, 0.42, 0.06, M(0x6f533c), SR.x1 - 0.35, 0.44, 6.6).rotation.y = Math.PI / 2;
  [-0.65, 0.65].forEach((dz) => box(0.36, 0.42, 0.06, M(0x2d3242), SR.x1 - 0.35, 0.21, 6.6 + dz));
  nav.box(SR.x1 - 0.35, 6.6, 0.42, 1.7, 0.1);
  cyl(0.3, 0.3, 0.08, M(0xd7dae2), ASH.x, 3.25, ASH.z, 20).castShadow = false;
  const fan = new THREE.Group(); fan.position.set(ASH.x, 3.19, ASH.z); scene.add(fan);
  for (let i = 0; i < 4; i++) { const b = box(0.24, 0.01, 0.07, M(0x8a90a0), Math.cos(i * TAU / 4) * 0.13, 0, Math.sin(i * TAU / 4) * 0.13, fan); b.rotation.y = -i * TAU / 4; b.castShadow = false; }

  // asap rokok: partikel kecil yang naik, melebar, lalu memudar
  const puffGeo = new THREE.SphereGeometry(0.05, 7, 5);
  const puffs = [];
  W.puff = (x, y, z, big = false) => {
    if (puffs.length > 60) return;
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xdfe3e8, transparent: true, opacity: big ? 0.5 : 0.32, depthWrite: false }));
    m.position.set(x, y, z); m.castShadow = false;
    m.userData = { life: big ? 2.6 : 1.8, max: big ? 2.6 : 1.8, v: new THREE.Vector3((Math.random() - 0.5) * 0.12, big ? 0.32 : 0.22, (Math.random() - 0.5) * 0.12), grow: big ? 2.6 : 1.5, o: m.material.opacity };
    scene.add(m); puffs.push(m);
  };
  W.smokeRoom = { ...SR, ash: ASH };

  /* ================= brankas keuangan (kanan, antara lobi lift dan pantry) ================= */
  const VT = { x: 12.2, z: 0.3 };
  carpet(3.5, 5.8, 0x2f3a4a, VT.x, VT.z);
  // lemari besi
  const SAFE = { x: 13.35, z: -2.55 };
  rbox(0.9, 1.2, 0.75, 0.04, M(0x55606f, { metalness: 0.55, roughness: 0.4 }), SAFE.x, 0.6, SAFE.z);
  const dial = cyl(0.12, 0.12, 0.05, M(0xc9ced8, { metalness: 0.8, roughness: 0.25 }), SAFE.x - 0.46, 0.72, SAFE.z, 18); dial.rotation.z = Math.PI / 2;
  box(0.03, 0.05, 0.3, M(0xc9ced8, { metalness: 0.8, roughness: 0.25 }), SAFE.x - 0.47, 0.45, SAFE.z);
  nav.box(SAFE.x, SAFE.z, 0.9, 0.75);
  W.safeFront = { x: SAFE.x - 0.85, z: SAFE.z, rot: Math.PI / 2 };
  const vPlate = plateTex('BRANKAS');
  [0, Math.PI].forEach((r) => { const m = mesh(new THREE.PlaneGeometry(0.66, 0.16), new THREE.MeshBasicMaterial({ map: vPlate, toneMapped: false }), SAFE.x, 1.42, SAFE.z + (r ? -0.01 : 0.01), null, false); m.rotation.y = r; });
  // alas tumpukan uang: 2 kolom × 4 baris, satu per sumber dana
  const VSLOTS = [];
  [-1.55, -0.25, 1.05, 2.35].forEach((z) => [11.45, 12.85].forEach((x) => VSLOTS.push({ x, z })));
  const pedMat = M(0x3a4458), pedTop = M(0xd9c7a8);
  W.vaultSlots = VSLOTS.map((v) => {
    const g = new THREE.Group(); g.position.set(v.x, 0, v.z); g.visible = false; scene.add(g);
    rbox(0.86, 0.3, 0.64, 0.04, pedMat, 0, 0.15, 0, g); box(0.88, 0.02, 0.66, pedTop, 0, 0.31, 0, g);
    return { ...v, group: g, front: { x: v.x, z: v.z + 0.62, rot: Math.PI }, top: 0.32, navOn: false };
  });
  // ikat uang memakai instancing supaya ratusan ikat tetap ringan
  const BMAX = 8 * 120;
  const bundleMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 0.034, 0.08), new THREE.MeshStandardMaterial({ roughness: 0.7 }), BMAX);
  const strapMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.037, 0.083), new THREE.MeshStandardMaterial({ color: 0xf4efe1, roughness: 0.8 }), BMAX);
  bundleMesh.count = strapMesh.count = 0; bundleMesh.castShadow = true; bundleMesh.frustumCulled = strapMesh.frustumCulled = false; scene.add(bundleMesh, strapMesh);
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), tmpC = new THREE.Color();
  // counts[i] = jumlah ikat di alas i; color = warna uang (sesuai pecahan)
  W.setVault = (counts, color) => {
    let k = 0; tmpC.set(color);
    counts.forEach((c, i) => {
      const v = W.vaultSlots[i]; if (!v) return;
      for (let j = 0; j < c && k < BMAX; j++, k++) {
        const layer = Math.floor(j / 24), r = j % 24, col = r % 4, row = Math.floor(r / 4);
        const jitter = Math.sin(j * 12.9898 + i) * 0.012;
        tmpV.set(v.x - 0.285 + col * 0.19 + jitter, v.top + 0.018 + layer * 0.036, v.z - 0.225 + row * 0.09);
        tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), jitter * 2);
        tmpM.compose(tmpV, tmpQ, one);
        bundleMesh.setMatrixAt(k, tmpM); strapMesh.setMatrixAt(k, tmpM); bundleMesh.setColorAt(k, tmpC);
      }
    });
    bundleMesh.count = strapMesh.count = k;
    bundleMesh.instanceMatrix.needsUpdate = strapMesh.instanceMatrix.needsUpdate = true;
    if (bundleMesh.instanceColor) bundleMesh.instanceColor.needsUpdate = true;
  };
  W.showVaultSlots = (n) => W.vaultSlots.forEach((v, i) => {
    v.group.visible = i < n;
    if (i < n && !v.navOn) { nav.box(v.x, v.z, 0.86, 0.64, 0.08); v.navOn = true; }
  });
  W.vaultTopY = (i, count) => { const v = W.vaultSlots[i]; return v.top + Math.ceil(Math.max(1, count) / 24) * 0.036; };

  /* ================= tanaman ================= */
  const plant = (x, z, s) => {
    cyl(0.22 * s, 0.16 * s, 0.42 * s, M(0xd6c4ab), x, 0.21 * s, z, 14);
    cyl(0.2 * s, 0.2 * s, 0.02, M(0x5a3e2b), x, 0.42 * s, z, 14);
    [[0, 0.78, 0, 0.4], [0.14, 1.05, -0.06, 0.3], [-0.15, 0.98, 0.08, 0.28], [0.02, 1.28, 0.04, 0.22]].forEach(([dx, dy, dz, r], i) => {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x4f9a63 : 0x3f7f52, flatShading: true, roughness: 0.9 }));
      f.position.set(x + dx * s, dy * s, z + dz * s); f.castShadow = true; scene.add(f); });
    nav.circle(x, z, 0.25 * s);
  };
  plant(-13.3, -2.6, 1.2); plant(-13.3, 7.3, 1.2); plant(3.0, -7.4, 1.0); plant(-7.8, -7.4, 1.0); plant(9.4, -7.4, 0.9); plant(13.4, -3.6, 1.1); plant(-6.0, 7.4, 1.0); plant(6.2, 7.3, 0.9); plant(13.4, 3.0, 1.1); plant(-13.4, -7.4, 0.9); plant(2.6, RZ - 0.45, 0.8);

  /* ================= lampu ruangan malam ================= */
  pendant(MTC.x, MTC.z, 2.9); pendant(SOFA.x, 5.6); pendant(10.6, 5.6); pendant(-11.4, -5.6);
  const roomLamps = [[-5, 2.8, -1.2], [2, 2.8, -1.2], [MTC.x, 2.7, MTC.z], [-11, 2.7, -5.6], [-10.6, 2.7, 5.6], [10.6, 2.7, 5.6]].map(([x, y, z]) => { const l = new THREE.PointLight(0xffc98a, 0, 10, 2); l.position.set(x, y, z); scene.add(l); return l; });
  W.bulbMats = bulbMats;

  /* ================= titik penting (POI) ================= */
  const P = (x, z, rot = 0) => ({ x, z, rot });
  W.POI = {
    boardWrite: [P(BOARD.x - 1.1, BOARD.z + 1.0, Math.PI), P(BOARD.x, BOARD.z + 1.0, Math.PI), P(BOARD.x + 1.1, BOARD.z + 1.0, Math.PI)],
    boardHuddle: [P(BOARD.x - 1.4, BOARD.z + 1.9, Math.PI - 0.4), P(BOARD.x, BOARD.z + 2.0, Math.PI), P(BOARD.x + 1.4, BOARD.z + 1.9, Math.PI + 0.4)],
    meetPresenter: P(MTC.x + 1.75, -7.05, -2.2),
    meetSeats: [P(MTC.x, MTC.z + 1.0, Math.PI), P(MTC.x - 1.0, MTC.z + 1.0, Math.PI), P(MTC.x + 1.0, MTC.z + 1.0, Math.PI)],
    meetCenter: P(MTC.x, MTC.z),
    coffeeQueue: [P(9.3, 6.55, 0), P(9.3, 5.7, 0), P(9.3, 4.9, 0)],
    coffeeDrink: [P(BAR.x - 0.75, BAR.z, Math.PI / 2), P(BAR.x + 0.75, BAR.z, -Math.PI / 2), P(BAR.x, BAR.z - 0.75, 0)],
    sofa: [P(SOFA.x - 0.9, SOFA.z - 0.35, Math.PI), P(SOFA.x, SOFA.z - 0.35, Math.PI), P(SOFA.x + 0.9, SOFA.z - 0.35, Math.PI)],
    windowPairs: [[P(-13.1, -1.2, -Math.PI / 2 - 0.6), P(-12.6, -0.2, -Math.PI / 2 - 2.4)], [P(0.9, -7.2, Math.PI - 0.6), P(1.9, -6.8, Math.PI + 1.9)]],
    windowSolo: [P(-13.2, 1.8, -Math.PI / 2), P(-13.2, 3.0, -Math.PI / 2), P(1.8, -7.3, Math.PI), P(-6.4, -7.3, Math.PI)],
    pingpong: [P(PP.x - 1.75, PP.z, Math.PI / 2), P(PP.x + 1.75, PP.z, -Math.PI / 2)],
    stretch: [P(5.6, 3.0, 0.4), P(7.4, 2.6, -0.3), P(-5.2, 3.2, 0.2)],
    smoke: [P(ASH.x - 0.62, ASH.z - 0.3), P(ASH.x + 0.45, ASH.z - 0.55), P(ASH.x - 0.35, ASH.z + 0.65)],
    phone: [[P(-11.0, 2.4, 0.2), P(-9.4, 2.7, -0.2)], [P(9.0, 2.3, 1.2), P(9.5, 3.3, 1.2)], [P(-6.6, 3.1, 0.3), P(-5.0, 3.4, 0.3)], [P(12.4, -5.6, Math.PI), P(11.2, -5.8, Math.PI)]],
    water: P(7.8, 6.85, 0),
    liftCall: P(12.1, -6.4, Math.PI),
  };
  W.MT = MT; W.MR = MR;

  /* ================= confetti ================= */
  const confettiGeo = new THREE.PlaneGeometry(0.06, 0.1);
  const confetti = [];
  W.confetti = (x, y, z) => {
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: [0x2d6cdf, 0xe0952f, 0x5cc184, 0xd45a72, 0x6a5ad8, 0xffd166][i % 6], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x, y, z);
      const a = Math.random() * TAU, sp = 1.2 + Math.random() * 2.2;
      m.userData = { v: new THREE.Vector3(Math.cos(a) * sp * 0.6, 3 + Math.random() * 2.5, Math.sin(a) * sp * 0.6), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 2.4 };
      scene.add(m); confetti.push(m);
    }
  };

  /* ================= animasi dunia per frame ================= */
  let ledT = 0;
  W.tick = (dt) => {
    clouds.forEach((c) => { c.position.x += c.userData.speed * dt * 0.6; if (c.position.x > 190) c.position.x = -190; });
    ledT -= dt; if (ledT <= 0) { ledT = 0.6; beacons.forEach((b) => (b.visible = !b.visible)); }
    for (const L of lifts) {
      if (L.holdT > 0) { L.holdT -= dt; if (L.holdT <= 0) L.target = 0; }
      L.open += (L.target - L.open) * Math.min(1, dt * 4);
      L.L.position.x = L.x - 0.27 - L.open * 0.5; L.R.position.x = L.x + 0.27 + L.open * 0.5;
      L.ind.material.color.set(L.target ? 0xffd166 : 0x5cc184);
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const m = confetti[i], u = m.userData;
      u.v.y -= 6 * dt; u.v.multiplyScalar(1 - dt * 0.8);
      m.position.addScaledVector(u.v, dt);
      if (m.position.y < 0.02) { m.position.y = 0.02; u.v.set(0, 0, 0); }
      m.rotation.x += u.spin.x * dt; m.rotation.y += u.spin.y * dt;
      u.life -= dt; m.material.opacity = Math.min(1, u.life);
      if (u.life <= 0) { scene.remove(m); m.material.dispose(); confetti.splice(i, 1); }
    }
    fan.rotation.y += dt * 9;
    for (let i = puffs.length - 1; i >= 0; i--) {
      const m = puffs[i], u = m.userData;
      u.life -= dt; m.position.addScaledVector(u.v, dt); u.v.x *= 1 - dt * 0.5; u.v.z *= 1 - dt * 0.5;
      const k = 1 - u.life / u.max; m.scale.setScalar(1 + k * u.grow); m.material.opacity = u.o * Math.min(1, u.life / u.max * 1.6);
      if (u.life <= 0) { scene.remove(m); m.material.dispose(); puffs.splice(i, 1); }
    }
    return lifts.some((l) => Math.abs(l.target - l.open) > 0.01) || confetti.length > 0 || puffs.length > 0;
  };

  W.setPendants = (on) => bulbMats.forEach((m) => m.color.setHex(on ? 0xffe2a8 : 0xf4efe4));
  return W;
}
