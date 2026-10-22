// Grid navigasi + A* supaya karakter berjalan memutari meja, sofa, dan dinding kaca.

class Heap {
  constructor(score) { this.a = []; this.score = score; }
  get size() { return this.a.length; }
  push(v) { const a = this.a; a.push(v); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.score(a[p]) <= this.score(a[i])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && this.score(a[l]) < this.score(a[m])) m = l; if (r < a.length && this.score(a[r]) < this.score(a[m])) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
}

export class NavGrid {
  constructor(minX, maxX, minZ, maxZ, cell = 0.25) {
    Object.assign(this, { minX, maxX, minZ, maxZ, cell });
    this.w = Math.ceil((maxX - minX) / cell);
    this.h = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
  }
  ix(x) { return Math.floor((x - this.minX) / this.cell); }
  iz(z) { return Math.floor((z - this.minZ) / this.cell); }
  cx(i) { return this.minX + (i + 0.5) * this.cell; }
  cz(j) { return this.minZ + (j + 0.5) * this.cell; }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h; }
  free(i, j) { return this.inside(i, j) && !this.blocked[j * this.w + i]; }
  freeAt(x, z) { return this.free(this.ix(x), this.iz(z)); }

  // tandai persegi (sumbu sejajar) sebagai halangan, diperbesar dengan radius badan karakter
  rect(x0, z0, x1, z1, pad = 0.28, value = 1) {
    const a = this.ix(Math.min(x0, x1) - pad), b = this.ix(Math.max(x0, x1) + pad - 1e-6);
    const c = this.iz(Math.min(z0, z1) - pad), d = this.iz(Math.max(z0, z1) + pad - 1e-6);
    for (let j = Math.max(0, c); j <= Math.min(this.h - 1, d); j++)
      for (let i = Math.max(0, a); i <= Math.min(this.w - 1, b); i++) this.blocked[j * this.w + i] = value;
  }
  box(cx, cz, w, d, pad) { this.rect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, pad); }
  clear(cx, cz, w, d) { this.rect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 0, 0); }
  circle(x, z, r, pad = 0.28) {
    const R = r + pad;
    for (let j = this.iz(z - R); j <= this.iz(z + R); j++)
      for (let i = this.ix(x - R); i <= this.ix(x + R); i++)
        if (this.inside(i, j) && Math.hypot(this.cx(i) - x, this.cz(j) - z) <= R) this.blocked[j * this.w + i] = 1;
  }
  // garis tipis (dinding kaca), dengan celah pintu [gapFrom, gapTo] di sepanjang garis
  wall(x0, z0, x1, z1, gaps = []) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / (this.cell * 0.5));
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const along = t * len;
      if (gaps.some(([a, b]) => along >= a && along <= b)) continue;
      this.rect(x, z, x, z, 0.24);
    }
  }

  nearestFree(i, j, maxR = 12) {
    if (this.free(i, j)) return [i, j];
    for (let r = 1; r <= maxR; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++)
          if ((Math.abs(di) === r || Math.abs(dj) === r) && this.free(i + di, j + dj)) return [i + di, j + dj];
    return null;
  }

  lineFree(x0, z0, x1, z1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (this.cell * 0.4));
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      if (!this.freeAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  // Mengembalikan daftar titik dunia {x, z} dari `from` ke `to` (sudah dirapikan), atau null.
  path(from, to) {
    const s = this.nearestFree(this.ix(from.x), this.iz(from.z));
    const g = this.nearestFree(this.ix(to.x), this.iz(to.z));
    if (!s || !g) return null;
    const W = this.w, start = s[1] * W + s[0], goal = g[1] * W + g[0];
    const gScore = new Float32Array(W * this.h).fill(Infinity);
    const came = new Int32Array(W * this.h).fill(-1);
    const closed = new Uint8Array(W * this.h);
    const hx = g[0], hz = g[1];
    const h = (n) => { const dx = Math.abs((n % W) - hx), dz = Math.abs(((n / W) | 0) - hz); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    const open = new Heap((n) => gScore[n] + h(n));
    gScore[start] = 0; open.push(start);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false, guard = 0;
    while (open.size && guard++ < 40000) {
      const cur = open.pop();
      if (closed[cur]) continue;
      if (cur === goal) { found = true; break; }
      closed[cur] = 1;
      const ci = cur % W, cj = (cur / W) | 0;
      for (const [di, dj, cost] of dirs) {
        const ni = ci + di, nj = cj + dj;
        if (!this.free(ni, nj)) continue;
        if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue; // jangan memotong sudut
        const n = nj * W + ni;
        const t = gScore[cur] + cost;
        if (t < gScore[n]) { gScore[n] = t; came[n] = cur; open.push(n); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let n = goal; n !== -1; n = came[n]) cells.push(n);
    cells.reverse();
    const pts = cells.map((n) => ({ x: this.cx(n % W), z: this.cz((n / W) | 0) }));
    pts[0] = { x: from.x, z: from.z };
    pts[pts.length - 1] = { x: to.x, z: to.z };
    // rapikan: lompati titik selama garis lurusnya bebas halangan
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineFree(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }
}
