// MLB Grand Slam 27 - ballpark builder. World units = feet. Home plate at origin, center field toward -z, first base toward +x.
import * as THREE from '../lib/three.min.js';
import { makeCrowd } from './crowd.js';

export const D2R = Math.PI / 180;
export const BASES = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(63.64, 0, -63.64), new THREE.Vector3(0, 0, -127.28), new THREE.Vector3(-63.64, 0, -63.64)];
export const MOUND = new THREE.Vector3(0, 0, -60.5);
export const dirOf = (phi) => new THREE.Vector3(Math.sin(phi), 0, -Math.cos(phi));   // phi radians, + toward right field
export const phiOf = (x, z) => Math.atan2(x, -z);
const ANG = [-45, -31, -17, 0, 17, 31, 45].map(a => a * D2R);
function interp(arr, phi) {
  const p = Math.max(ANG[0], Math.min(ANG[6], phi));
  let i = 0; while (i < 5 && p > ANG[i + 1]) i++;
  const t = (p - ANG[i]) / (ANG[i + 1] - ANG[i]);
  const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(6, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
// step heights (walls change height abruptly in real parks, e.g. the Monster)
function stepH(arr, phi) {
  const p = Math.max(ANG[0], Math.min(ANG[6], phi));
  let best = 0, bd = 9; for (let i = 0; i < 7; i++) { const d = Math.abs(p - ANG[i]); if (d < bd) { bd = d; best = i; } }
  // blend over a narrow band so a 37 ft wall doesn't fade into 5 ft gradually
  let i = 0; while (i < 5 && p > ANG[i + 1]) i++;
  const t = (p - ANG[i]) / (ANG[i + 1] - ANG[i]);
  const s = Math.max(0, Math.min(1, (t - 0.42) / 0.16));
  return arr[i] + (arr[i + 1] - arr[i]) * s;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(cv, srgb = true) { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function hashS(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

export function physPark(id, pk) { return { id, pk, wallR: phi => interp(pk.dims, phi), wallH: phi => stepH(pk.walls, phi) }; }
export class Park {
  constructor(id, pk, team, opts = {}) {
    this.id = id; this.pk = pk; this.team = team; this.opts = opts;
    this.fast = opts.fast;
    this.group = new THREE.Group();
    this.wallR = phi => interp(this.pk.dims, phi);
    this.wallH = phi => stepH(this.pk.walls, phi);
    const r = this.pk.roof;
    this.closed = r === 'dome' || (r === 'retractable' && ['TEX', 'MIA', 'HOU', 'AZ', 'MIL'].includes(id));
    if (this.closed && opts.time !== 'day') { /* stays closed */ }
    this.build();
  }
  // ---------- queries used by physics ----------
  fenceAt(x, z) { const phi = phiOf(x, z); return { phi, r: this.wallR(phi), h: this.wallH(phi), d: Math.hypot(x, z) }; }
  isFair(x, z) { const phi = phiOf(x, z); return Math.abs(phi) <= 45.2 * D2R && -z > -1; }
  // ---------- build ----------
  build() {
    const g = this.group, pk = this.pk;
    this.buildGround();
    this.buildInfield();
    this.buildWall();
    this.buildStands();
    this.buildExtras();
    this.buildBoard();
    this.buildPoles();
  }
  buildGround() {
    const pk = this.pk, turf = pk.turf === 'turf';
    const S = this.fast ? 1024 : 2048, X0 = -320, X1 = 320, Z0 = -480, Z1 = 120, W = X1 - X0, H = Z1 - Z0;
    const cv = canvas(S, S), x = cv.getContext('2d');
    const px = v => (v - X0) / W * S, pz = v => (v - Z0) / H * S;
    const g1 = turf ? '#3f8a3c' : '#3d8b37', g2 = turf ? '#367c34' : '#347a30';
    x.fillStyle = g1; x.fillRect(0, 0, S, S);
    // mowing pattern: checkerboard in the outfield, rings in foul ground
    x.save(); x.beginPath();
    const fair = [[0, 0]]; for (let a = -45; a <= 45; a++) { const p = dirOf(a * D2R).multiplyScalar(this.wallR(a * D2R) + 2); fair.push([p.x, p.z]); }
    x.moveTo(px(0), pz(0)); for (const [a, b] of fair) x.lineTo(px(a), pz(b)); x.closePath(); x.clip();
    const st = 16;
    x.translate(px(0), pz(0)); x.rotate(Math.PI / 4);
    for (let i = -60; i < 60; i++) for (let j = -60; j < 60; j++) if ((i + j) % 2 === 0) { x.fillStyle = g2; x.fillRect(i * st / W * S, j * st / H * S, st / W * S + 0.5, st / H * S + 0.5); }
    x.restore();
    // subtle noise
    const rnd = rng(7);
    x.globalAlpha = 0.05; for (let i = 0; i < 9000; i++) { x.fillStyle = rnd() < 0.5 ? '#000' : '#fff'; x.fillRect(rnd() * S, rnd() * S, 2, 2); } x.globalAlpha = 1;
    // warning track
    x.strokeStyle = turf ? '#7b5a3e' : '#9c6b45'; x.lineWidth = 14 / W * S; x.beginPath();
    for (let a = -46; a <= 46; a += 0.5) { const p = dirOf(a * D2R).multiplyScalar(this.wallR(a * D2R) - 6.5); a === -46 ? x.moveTo(px(p.x), pz(p.z)) : x.lineTo(px(p.x), pz(p.z)); }
    x.stroke();
    // foul lines to the poles
    x.strokeStyle = '#f4f4f0'; x.lineWidth = Math.max(2, 0.4 / W * S);
    for (const s of [-1, 1]) { const p = dirOf(s * 45 * D2R).multiplyScalar(this.wallR(s * 45 * D2R)); x.beginPath(); x.moveTo(px(0), pz(0)); x.lineTo(px(p.x), pz(p.z)); x.stroke(); }
    // team name painted behind home plate
    x.save(); x.translate(px(0), pz(48)); x.font = `900 italic ${10 / W * S}px "Barlow Condensed", Arial Black`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,255,255,.85)'; x.fillText(this.team.name.toUpperCase(), 0, 0); x.restore();
    const t = tex(cv);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
    const geo = new THREE.PlaneGeometry(W, H); geo.rotateX(-Math.PI / 2); geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; this.group.add(mesh);
    // far ground (beyond the canvas) so there is no void
    const far = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2f5f33', roughness: 1 }));
    far.position.y = -0.3; this.group.add(far);
  }
  buildInfield() {
    const turf = this.pk.turf === 'turf';
    const S = this.fast ? 1024 : 2048, X0 = -105, X1 = 105, Z0 = -165, Z1 = 45, W = X1 - X0, H = Z1 - Z0;
    const cv = canvas(S, S), x = cv.getContext('2d');
    const px = v => (v - X0) / W * S, pz = v => (v - Z0) / H * S, L = v => v / W * S;
    const dirt = turf ? '#9a6a46' : '#a8714a', dirt2 = '#93613f';
    // infield dirt arc (95 ft from the mound) and the diamond grass
    x.fillStyle = dirt;
    x.beginPath(); x.arc(px(0), pz(-60.5), L(95), Math.PI * 0.25 + Math.PI, Math.PI * 1.75); // top arc toward CF
    x.lineTo(px(63.64 + 9), pz(-63.64 + 9)); x.lineTo(px(0), pz(0)); x.lineTo(px(-63.64 - 9), pz(-63.64 + 9)); x.closePath(); x.fill();
    // basepath cut-outs from dirt to grass: infield grass square
    x.fillStyle = turf ? '#3f8a3c' : '#3d8b37';
    x.beginPath();
    const ig = 63.64 - 4.5; // grass inside the base paths
    x.moveTo(px(0), pz(-9)); x.lineTo(px(ig), pz(-63.64)); x.lineTo(px(0), pz(-127.28 + 9)); x.lineTo(px(-ig), pz(-63.64)); x.closePath(); x.fill();
    // stripes on the infield grass
    x.save(); x.clip(); x.translate(px(0), pz(0)); x.rotate(Math.PI / 4); x.fillStyle = '#347a30';
    for (let i = -20; i < 20; i += 2) x.fillRect(L(i * 8), -S, L(8), S * 2); x.restore();
    // dirt circles: home plate area, mound, bases
    x.fillStyle = dirt;
    x.beginPath(); x.arc(px(0), pz(0), L(13), 0, 7); x.fill();
    x.beginPath(); x.arc(px(0), pz(-60.5), L(9), 0, 7); x.fill();
    for (const b of [1, 2, 3]) { const p = [null, [63.64, -63.64], [0, -127.28], [-63.64, -63.64]][b]; x.beginPath(); x.arc(px(p[0]), pz(p[1]), L(7), 0, 7); x.fill(); }
    // dirt texture
    const rnd = rng(3); x.globalAlpha = 0.18;
    for (let i = 0; i < 26000; i++) { x.fillStyle = rnd() < 0.5 ? dirt2 : '#b98258'; const a = rnd() * S, b = rnd() * S; x.fillRect(a, b, 2, 2); }
    x.globalAlpha = 1;
    // chalk: foul lines, batter boxes, catcher box, coach boxes
    x.strokeStyle = '#f6f6f2'; x.lineWidth = Math.max(2, L(0.33));
    x.beginPath(); x.moveTo(px(3.5), pz(-3.5)); x.lineTo(px(110), pz(-110)); x.moveTo(px(-3.5), pz(-3.5)); x.lineTo(px(-110), pz(-110)); x.stroke();
    for (const s of [-1, 1]) x.strokeRect(px(s > 0 ? 0.5 + 0.21 : -0.71 - 4), pz(-3), L(4), L(6));
    x.beginPath(); x.moveTo(px(-1.75), pz(3)); x.lineTo(px(-1.75), pz(10)); x.lineTo(px(1.75), pz(10)); x.lineTo(px(1.75), pz(3)); x.stroke();
    // home plate (pentagon)
    x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(px(-0.71), pz(-0.71)); x.lineTo(px(0.71), pz(-0.71)); x.lineTo(px(0.71), pz(0)); x.lineTo(px(0), pz(0.71)); x.lineTo(px(-0.71), pz(0)); x.closePath(); x.fill();
    // on-deck circles
    x.fillStyle = 'rgba(255,255,255,.25)';
    for (const s of [-1, 1]) { x.beginPath(); x.arc(px(s * 38), pz(14), L(2.6), 0, 7); x.fill(); }
    // edge softening
    const t = tex(cv);
    const geo = new THREE.PlaneGeometry(W, H); geo.rotateX(-Math.PI / 2); geo.translate((X0 + X1) / 2, 0.04, (Z0 + Z1) / 2);
    // make outside-of-infield transparent: use alpha from a second pass (only dirt/lines drawn) -> simpler: draw full grass behind, so opaque is fine
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, transparent: true, alphaMap: this.infieldAlpha(S, X0, Z0, W, H), depthWrite: false });
    const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; mesh.renderOrder = 1; this.group.add(mesh);
    // mound hump
    const mg = new THREE.CylinderGeometry(4.5, 9, 0.85, 40, 1); mg.translate(0, 0.42, -60.5);
    const mound = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ color: dirt, roughness: 1 })); mound.receiveShadow = true; this.group.add(mound);
    const rub = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.6 })); rub.position.set(0, 0.88, -60.5); this.group.add(rub);
    // bases
    const bm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 });
    for (const b of [1, 2, 3]) { const p = BASES[b]; const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), bm); box.position.set(p.x, 0.15, p.z); box.rotation.y = Math.PI / 4; box.castShadow = true; this.group.add(box); }
  }
  infieldAlpha(S, X0, Z0, W, H) {
    const cv = canvas(512, 512), x = cv.getContext('2d'), k = 512 / S;
    const px = v => (v - X0) / W * 512, pz = v => (v - Z0) / H * 512, L = v => v / W * 512;
    x.fillStyle = '#000'; x.fillRect(0, 0, 512, 512);
    x.filter = 'blur(1px)';
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(px(0), pz(-60.5), L(95), Math.PI * 1.25, Math.PI * 1.75);
    x.lineTo(px(72.64), pz(-54.64)); x.lineTo(px(4), pz(4)); x.lineTo(px(-4), pz(4)); x.lineTo(px(-72.64), pz(-54.64)); x.closePath(); x.fill();
    x.beginPath(); x.arc(px(0), pz(0), L(13.2), 0, 7); x.fill();
    x.beginPath(); x.arc(px(-38), pz(14), L(2.8), 0, 7); x.arc(px(38), pz(14), L(2.8), 0, 7); x.fill();
    x.fillRect(px(-1.9), pz(2), L(3.8), L(8.5));
    x.lineWidth = L(0.8); x.strokeStyle = '#fff'; x.beginPath(); x.moveTo(px(0), pz(0)); x.lineTo(px(105), pz(-105)); x.moveTo(px(0), pz(0)); x.lineTo(px(-105), pz(-105)); x.stroke();
    return tex(cv, false);
  }
  buildWall() {
    const pk = this.pk, N = 180, pos = [], uv = [], idx = [], col = [];
    const isMonster = pk.feats.includes('monster'), ivy = pk.feats.includes('ivy');
    // canvas texture for the padding (tiles), 1 u = 30 ft
    const cv = canvas(512, 256), x = cv.getContext('2d');
    if (ivy) {
      x.fillStyle = '#2f5a24'; x.fillRect(0, 0, 512, 256); const r = rng(11);
      for (let i = 0; i < 2600; i++) { x.fillStyle = ['#2d6a22', '#3c7d2a', '#24521c', '#4a8a33', '#1f4718'][r() * 5 | 0]; x.beginPath(); x.ellipse(r() * 512, r() * 256, 5 + r() * 6, 3 + r() * 4, r() * 3, 0, 7); x.fill(); }
    } else {
      x.fillStyle = pk.wall; x.fillRect(0, 0, 512, 256);
      x.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 512; i += 64) x.fillRect(i, 0, 3, 256);
      const gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(0,0,0,.2)'); x.fillStyle = gr; x.fillRect(0, 0, 512, 256);
    }
    x.fillStyle = '#f2c14e'; x.fillRect(0, 0, 512, 7); // yellow home-run line on top
    const t = tex(cv); t.wrapS = THREE.RepeatWrapping;
    let u = 0, prev = null;
    for (let i = 0; i <= N; i++) {
      const phi = (-45 + 90 * i / N) * D2R, r = this.wallR(phi), h = this.wallH(phi), p = dirOf(phi).multiplyScalar(r);
      if (prev) u += p.distanceTo(prev) / 30; prev = p;
      pos.push(p.x, 0, p.z, p.x, h, p.z); uv.push(u, 0, u, 1);
      const green = isMonster && phi < -28 * D2R;
      const c = new THREE.Color(green ? '#2a5a35' : '#ffffff'); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const wall = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    wall.receiveShadow = true; this.group.add(wall);
    // top cap (back side) - darker strip so the wall reads as solid
    const back = wall.clone(); back.material = new THREE.MeshStandardMaterial({ color: '#1d2a22', side: THREE.DoubleSide }); back.scale.setScalar(1.006); this.group.add(back);
    // distance markers
    const marks = [[-45, pk.dims[0]], [-17, pk.dims[2]], [0, pk.dims[3]], [17, pk.dims[4]], [45, pk.dims[6]]];
    for (const [a, d] of marks) {
      const phi = (a + (a === -45 ? 2.5 : a === 45 ? -2.5 : 0)) * D2R, r = this.wallR(phi) - 0.3, h = this.wallH(phi);
      const c2 = canvas(128, 64), y = c2.getContext('2d'); y.font = '900 52px "Barlow Condensed", Arial Black'; y.textAlign = 'center'; y.textBaseline = 'middle'; y.fillStyle = isMonster && a < -28 ? '#fff' : '#f4f4f0'; y.fillText(String(d), 64, 34);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: tex(c2), transparent: true, depthWrite: false }));
      const p = dirOf(phi).multiplyScalar(r); pl.position.set(p.x, Math.min(h - 3, 5.5), p.z); pl.lookAt(0, pl.position.y, 0); this.group.add(pl);
    }
    if (isMonster) { // manual scoreboard on the Monster
      const c3 = canvas(512, 128), y = c3.getContext('2d'); y.fillStyle = '#204a2b'; y.fillRect(0, 0, 512, 128);
      y.fillStyle = '#e8e8e0'; y.font = '800 30px "Barlow Condensed"'; y.textAlign = 'left';
      for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) { y.fillStyle = '#163820'; y.fillRect(150 + i * 38, 22 + r * 50, 32, 38); }
      y.fillStyle = '#e8e8e0'; y.fillText('VISITORS', 12, 50); y.fillText('HOME', 12, 100);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(60, 15), new THREE.MeshBasicMaterial({ map: tex(c3) }));
      const phi = -37 * D2R, p = dirOf(phi).multiplyScalar(this.wallR(phi) - 0.4); pl.position.set(p.x, 20, p.z); pl.lookAt(0, 20, 0); this.group.add(pl);
    }
  }
  // stand front curve around foul territory: LF pole -> behind home -> RF pole. Returns [{p, n}] (p on ground, n outward)
  foulFront() {
    const out = [], f = 42, rb = 60;
    const t0 = Math.sqrt(rb * rb - f * f);
    const L = dirOf(-45 * D2R), R = dirOf(45 * D2R);
    const nL = new THREE.Vector3(-0.7071, 0, 0.7071), nR = new THREE.Vector3(0.7071, 0, 0.7071);
    const rl = this.wallR(-45 * D2R), rr = this.wallR(45 * D2R);
    for (let t = rl + 8; t >= t0; t -= 8) out.push({ p: L.clone().multiplyScalar(t).addScaledVector(nL, f), n: nL.clone() });
    const a0 = Math.atan2(L.clone().multiplyScalar(t0).addScaledVector(nL, f).x, L.clone().multiplyScalar(t0).addScaledVector(nL, f).z);
    const a1 = Math.atan2(R.clone().multiplyScalar(t0).addScaledVector(nR, f).x, R.clone().multiplyScalar(t0).addScaledVector(nR, f).z);
    // arc behind home from a0 (left, negative x) through +z to a1
    const A0 = a0, A1 = a1; // a0 ~ -90deg (3B side) -> 0 (behind home, +z) -> a1 ~ +90deg
    for (let k = 1; k < 14; k++) { const a = A0 + (A1 - A0) * k / 14; const p = new THREE.Vector3(Math.sin(a) * rb, 0, Math.cos(a) * rb); out.push({ p, n: p.clone().normalize() }); }
    for (let t = t0; t <= rr + 8; t += 8) out.push({ p: R.clone().multiplyScalar(t).addScaledVector(nR, f), n: nR.clone() });
    return out;
  }
  // build a stepped seating ribbon along a front curve. prof = [[out, y], ...]. Returns rows for the crowd.
  ribbon(front, prof, color, opts = {}) {
    const pos = [], idx = [], uv = [], cols = [], n = prof.length;
    const base = new THREE.Color(color), dark = base.clone().multiplyScalar(0.55);
    let u = 0;
    for (let i = 0; i < front.length; i++) {
      const { p, n: nn } = front[i];
      if (i) u += p.distanceTo(front[i - 1].p);
      for (let j = 0; j < n; j++) {
        const [o, y] = prof[j]; pos.push(p.x + nn.x * o, y, p.z + nn.z * o); uv.push(u / 20, j);
        const c = (opts.face && j % 2 === 0) ? dark : base; cols.push(c.r, c.g, c.b);
      }
      if (i < front.length - 1) for (let j = 0; j < n - 1; j++) { const a = i * n + j, b = a + n; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, map: opts.map || this.seatTex() }));
    this.group.add(m); return m;
  }
  seatTex() {
    if (this._seat) return this._seat;
    const cv = canvas(128, 64), x = cv.getContext('2d');
    x.fillStyle = '#cfcfcf'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#8a8a8a'; for (let i = 0; i < 128; i += 8) x.fillRect(i, 0, 2, 64);
    x.fillStyle = '#e8e8e8'; x.fillRect(60, 0, 8, 64); // aisle
    this._seat = tex(cv); this._seat.wrapS = this._seat.wrapT = THREE.RepeatWrapping; return this._seat;
  }
  buildStands() {
    const pk = this.pk, small = pk.cap < 20000, seats = [];
    const front = this.foulFront();
    const seat = pk.seats, fac = pk.facade;
    // seat rows helper: from (o0,y0) to (o1,y1) with rows every 2.9 ft
    const addRows = (fr, o0, y0, o1, y1, density, step = 2.1) => {
      const rows = Math.floor((o1 - o0) / 2.9);
      for (let r = 0; r < rows; r++) {
        const o = o0 + (r + 0.5) * (o1 - o0) / rows, y = y0 + (r + 0.5) * (y1 - y0) / rows;
        for (let i = 0; i < fr.length - 1; i++) {
          const a = fr[i], b = fr[i + 1]; const pa = a.p.clone().addScaledVector(a.n, o), pb = b.p.clone().addScaledVector(b.n, o);
          const len = pa.distanceTo(pb), k = Math.max(1, Math.round(len / step));
          for (let s = 0; s < k; s++) { const t = (s + 0.5) / k; const p = pa.clone().lerp(pb, t); seats.push(p.x, y + 0.2, p.z, density); }
        }
      }
    };
    // field wall (padded) in front of the stands
    this.ribbon(front, [[0, 0], [0, 4.5], [1.5, 4.5]], '#20303f', { map: null });
    if (small) {
      this.ribbon(front, [[1.5, 4.5], [40, 18], [44, 18], [44, 26]], seat);
      addRows(front, 2, 5, 39, 17.5, 0.72);
    } else {
      // lower bowl
      this.ribbon(front, [[1.5, 4.5], [70, 30], [74, 30], [74, 36]], seat);
      addRows(front, 2, 5.2, 69, 29.6, 0.9);
      // club level facade
      this.ribbon(front, [[74, 36], [74, 44], [70, 44], [70, 50]], fac, { map: null });
      // upper deck (overhangs a bit)
      this.ribbon(front, [[70, 50], [72, 52], [130, 92], [132, 92], [132, 104]], seat);
      addRows(front, 73, 53, 129, 91, 0.75);
      // roof canopy / facade lip
      this.ribbon(front, [[118, 104], [140, 108], [140, 112]], fac, { map: null });
      this.lightTowers(front);
    }
    // dugouts (dark recesses on each side)
    for (const s of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(60, 5, 9), new THREE.MeshStandardMaterial({ color: '#15191f', roughness: 1 }));
      const along = dirOf(s * 45 * D2R).multiplyScalar(95), nn = new THREE.Vector3(s * 0.7071, 0, 0.7071);
      d.position.copy(along).addScaledVector(nn, 46); d.position.y = 2; d.rotation.y = -s * Math.PI / 4; this.group.add(d);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(62, 0.8, 11), new THREE.MeshStandardMaterial({ color: this.team.c1, roughness: 0.7 }));
      roof.position.copy(d.position); roof.position.y = 4.9; roof.rotation.y = d.rotation.y; this.group.add(roof);
    }
    // outfield bleachers behind the wall
    const ofront = [];
    for (let a = -45; a <= 45; a += 3) {
      const phi = a * D2R, n = dirOf(phi); ofront.push({ p: n.clone().multiplyScalar(this.wallR(phi) + 1), n, phi, h: this.wallH(phi) });
    }
    const segs = []; let cur = [];
    for (const f of ofront) { const eye = Math.abs(f.phi) < 9 * D2R; if (eye) { if (cur.length) segs.push(cur); cur = []; } else cur.push(f); }
    if (cur.length) segs.push(cur);
    const berm = pk.feats.includes('berm');
    for (const sg of segs) {
      if (sg.length < 2) continue;
      const h0 = Math.max(...sg.map(f => f.h));
      if (berm) { this.ribbon(sg, [[0, 0], [0, h0], [50, h0 + 14]], '#3f7a3a', { map: null }); addRows(sg, 4, h0 + 1, 46, h0 + 12, 0.35, 3.5); continue; }
      const deep = this.pk.feats.includes('splash') && sg[0].phi > 0 ? 12 : 60;
      this.ribbon(sg, [[0, h0], [2, h0], [deep, h0 + deep * 0.45], [deep + 2, h0 + deep * 0.45], [deep + 2, h0 + deep * 0.45 + 6]], seat);
      addRows(sg, 3, h0 + 1, deep - 1, h0 + deep * 0.45, 0.8);
    }
    // batter's eye
    const eyeG = new THREE.Mesh(new THREE.BoxGeometry(Math.max(70, this.wallR(0) * 0.3), 34, 6), new THREE.MeshStandardMaterial({ color: '#10261a', roughness: 1 }));
    const pe = dirOf(0).multiplyScalar(this.wallR(0) + 10); eyeG.position.set(pe.x, 17, pe.z); this.group.add(eyeG);
    this.seatData = seats;
    this.crowd = makeCrowd(seats, this.team, { fast: this.fast, fill: this.opts.fill ?? 0.92 });
    this.group.add(this.crowd.mesh);
  }
  lightTowers(front) {
    this.lights = [];
    const lm = new THREE.MeshBasicMaterial({ color: '#fffbe8' });
    const pm = new THREE.MeshStandardMaterial({ color: '#d8d8d8', roughness: 0.6 });
    const picks = [0.08, 0.3, 0.7, 0.92];
    for (const t of picks) {
      const f = front[Math.floor(t * (front.length - 1))];
      const base = f.p.clone().addScaledVector(f.n, 136);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 40, 8), pm); pole.position.copy(base); pole.position.y = 112 + 20; this.group.add(pole);
      const bank = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 1.5), lm); bank.position.copy(base); bank.position.y = 155; bank.lookAt(0, 0, -150); this.group.add(bank);
      this.lights.push(bank);
    }
  }
  buildPoles() {
    const ym = new THREE.MeshStandardMaterial({ color: '#f2d22e', roughness: 0.5, emissive: '#3a3000' });
    for (const s of [-1, 1]) {
      const phi = s * 45 * D2R, p = dirOf(phi).multiplyScalar(this.wallR(phi));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 70, 8), ym); pole.position.set(p.x, 35, p.z); this.group.add(pole);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 50), new THREE.MeshStandardMaterial({ color: '#f2d22e', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      net.position.set(p.x + Math.cos(phi) * 1.8 * -s * -1, 40, p.z); net.lookAt(0, 40, 0); net.rotateY(Math.PI / 2); this.group.add(net);
    }
  }
  buildExtras() {
    const f = this.pk.feats, g = this.group, r = rng(hashS(this.id));
    const water = (x0, z0, w, d, color = '#2b5f86') => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.3 })); m.position.set(x0, 0.2, z0); g.add(m); return m; };
    if (f.includes('splash')) { const p = dirOf(40 * D2R).multiplyScalar(this.wallR(40 * D2R) + 120); water(p.x + 80, p.z, 260, 700); }
    if (f.includes('river')) { const p = dirOf(25 * D2R).multiplyScalar(560); water(p.x, p.z - 120, 1600, 300, '#3a5f72'); }
    if (f.includes('fountains') || f.includes('fountain')) {
      for (const s of [-1, 1]) {
        const phi = s * 28 * D2R, p = dirOf(phi).multiplyScalar(this.wallR(phi) + 22);
        const w = water(p.x, p.z, 110, 24, '#3a83b8'); w.lookAt(0, 0.2, 0); w.rotation.x = 0; w.rotation.z = 0;
        this.fountains = this.fountains || [];
        for (let i = 0; i < 6; i++) { const jet = new THREE.Mesh(new THREE.ConeGeometry(2, 22, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.55 })); jet.position.set(p.x + (i - 2.5) * 14 * Math.cos(phi), 11, p.z + (i - 2.5) * 14 * Math.sin(phi)); g.add(jet); this.fountains.push(jet); }
      }
    }
    const tree = (x, z, kind) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, kind === 'palm' ? 46 : 12, 6), new THREE.MeshStandardMaterial({ color: '#6b4a2e' }));
      trunk.position.set(x, kind === 'palm' ? 23 : 6, z); g.add(trunk);
      const top = kind === 'palm' ? new THREE.Mesh(new THREE.SphereGeometry(8, 8, 5).scale(1, 0.45, 1), new THREE.MeshStandardMaterial({ color: '#3b7a32' })) : new THREE.Mesh(new THREE.ConeGeometry(9, 30, 8), new THREE.MeshStandardMaterial({ color: '#24502a' }));
      top.position.set(x, kind === 'palm' ? 47 : 26, z); g.add(top);
    };
    if (f.includes('palms') || f.includes('pines') || f.includes('hills') || f.includes('rockpile')) {
      for (let i = 0; i < 26; i++) { const phi = (-55 + r() * 110) * D2R, d = this.wallR(Math.max(-45 * D2R, Math.min(45 * D2R, phi))) + 90 + r() * 120; const p = dirOf(phi).multiplyScalar(d); tree(p.x, p.z, f.includes('palms') ? 'palm' : 'pine'); }
    }
    if (f.includes('hills')) { for (let i = 0; i < 5; i++) { const h = new THREE.Mesh(new THREE.SphereGeometry(300, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#56743e', roughness: 1 })); const p = dirOf((-60 + i * 30) * D2R).multiplyScalar(900); h.position.set(p.x, -150, p.z); h.scale.y = 0.5; g.add(h); } }
    // skyline (most parks are downtown)
    const urban = !['berm', 'hills'].some(k => f.includes(k)) && !this.closed;
    if (urban) {
      const bm = [new THREE.MeshStandardMaterial({ color: '#7f8a99', roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: '#5c6675', roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: '#a5aab2', roughness: 0.7 })];
      const win = this.windowTex();
      for (let i = 0; i < 46; i++) {
        const phi = (-70 + r() * 140) * D2R, d = 650 + r() * 500, p = dirOf(phi).multiplyScalar(d);
        const h = 60 + r() * r() * (f.includes('skyline') ? 420 : 220), w = 40 + r() * 60;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.6 + r() * 0.6)), [bm[i % 3], bm[i % 3], bm[i % 3], bm[i % 3], new THREE.MeshStandardMaterial({ map: win, color: bm[i % 3].color, emissive: '#ffd27a', emissiveMap: win, emissiveIntensity: 0 }), bm[i % 3]]);
        b.position.set(p.x, h / 2 - 2, p.z); b.lookAt(0, h / 2, 0); g.add(b);
        (this.buildings = this.buildings || []).push(b);
      }
    }
    if (f.includes('cntower')) { const t = new THREE.Mesh(new THREE.CylinderGeometry(4, 14, 1100, 10), new THREE.MeshStandardMaterial({ color: '#c9c9c9' })); const p = dirOf(-30 * D2R).multiplyScalar(1200); t.position.set(p.x, 550, p.z); g.add(t); const pod = new THREE.Mesh(new THREE.SphereGeometry(40, 12, 8).scale(1, 0.5, 1), new THREE.MeshStandardMaterial({ color: '#b5b5b5' })); pod.position.set(p.x, 780, p.z); g.add(pod); }
    if (f.includes('arch')) { const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30 * Math.PI; pts.push(new THREE.Vector3(Math.cos(t) * 160, Math.sin(t) * 560, 0)); } const arch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 8, 6), new THREE.MeshStandardMaterial({ color: '#d7dbe0', metalness: 0.8, roughness: 0.25 })); const p = dirOf(-8 * D2R).multiplyScalar(1500); arch.position.set(p.x, 0, p.z); g.add(arch); }
    if (f.includes('warehouse')) { const w = new THREE.Mesh(new THREE.BoxGeometry(40, 90, 900), new THREE.MeshStandardMaterial({ color: '#7a3b26', roughness: 0.9 })); const p = dirOf(45 * D2R).multiplyScalar(this.wallR(45 * D2R) + 140); w.position.set(p.x + 60, 45, p.z - 150); w.rotation.y = -0.6; g.add(w); }
    if (f.includes('rooftops')) { for (let i = 0; i < 12; i++) { const s = i < 6 ? -1 : 1, k = i % 6, phi = s * (20 + k * 6) * D2R, p = dirOf(phi).multiplyScalar(this.wallR(phi) + 150); const b = new THREE.Mesh(new THREE.BoxGeometry(45, 40, 40), new THREE.MeshStandardMaterial({ color: ['#8a4b37', '#a8865e', '#6d6f73'][k % 3] })); b.position.set(p.x, 20, p.z); b.lookAt(0, 20, 0); g.add(b); } }
    if (f.includes('monuments') || f.includes('frieze')) { /* frieze on the upper deck */ this.frieze = true; }
    // roof
    if (this.closed) {
      const roof = new THREE.Mesh(new THREE.SphereGeometry(760, 40, 16, 0, Math.PI * 2, 0, Math.PI * 0.2), new THREE.MeshStandardMaterial({ color: this.pk.roof === 'dome' ? '#e6e6e2' : '#c8ccd2', side: THREE.BackSide, roughness: 0.9 }));
      roof.position.set(0, -540, -170); g.add(roof); this.roof = roof;
      for (let i = 0; i < 8; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(120 + i * 70, 1.2, 4, 64), new THREE.MeshStandardMaterial({ color: '#9aa0a8' })); ring.rotation.x = Math.PI / 2; ring.position.set(0, 200 - i * 8, -170); g.add(ring); }
    }
  }
  windowTex() {
    if (this._win) return this._win;
    const cv = canvas(64, 128), x = cv.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 64, 128); const r = rng(5);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 20; j++) if (r() < 0.45) { x.fillStyle = '#fff'; x.fillRect(i * 8 + 2, j * 6 + 2, 4, 3); }
    this._win = tex(cv); this._win.wrapS = this._win.wrapT = THREE.RepeatWrapping; this._win.repeat.set(2, 3); return this._win;
  }
  buildBoard() {
    // big video board over the right-center bleachers (left-center for a few parks)
    const side = ['NYY', 'BOS', 'CHC', 'KC'].includes(this.id) ? (this.id === 'KC' ? 0 : -1) : 1;
    const phi = side * 24 * D2R, d = this.wallR(phi) + 75;
    const cv = canvas(1024, 512); this.boardCanvas = cv;
    const t = tex(cv); this.boardTex = t;
    const w = 130, h = 65;
    const p = dirOf(phi).multiplyScalar(d);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 6, h + 6, 4), new THREE.MeshStandardMaterial({ color: '#111418' }));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    const y = Math.max(...this.pk.walls) + 60 + h / 2;
    frame.position.set(p.x, y, p.z); scr.position.set(p.x, y, p.z);
    frame.lookAt(0, y * 0.7, 0); scr.lookAt(0, y * 0.7, 0); scr.translateZ(2.2);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(6, y - h / 2, 6), new THREE.MeshStandardMaterial({ color: '#2a2f36' })); leg.position.set(p.x, (y - h / 2) / 2, p.z);
    this.group.add(frame, scr, leg);
    this.drawBoard({ title: this.pk.name.toUpperCase(), sub: 'WELCOME TO ' + this.pk.city.toUpperCase() });
  }
  drawBoard(info) {
    const x = this.boardCanvas.getContext('2d'), W = 1024, H = 512, T = this.team;
    x.fillStyle = '#05080d'; x.fillRect(0, 0, W, H);
    const gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, T.c1); gr.addColorStop(1, '#05080d'); x.fillStyle = gr; x.globalAlpha = 0.65; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
    if (info.big) { x.font = '900 italic 210px "Barlow Condensed", Arial Black'; x.fillText(info.big, W / 2, H * 0.44); x.font = '800 italic 64px "Barlow Condensed"'; x.fillStyle = '#f2c14e'; x.fillText(info.sub || '', W / 2, H * 0.82); }
    else if (info.batter) {
      x.textAlign = 'left'; x.font = '800 italic 54px "Barlow Condensed"'; x.fillStyle = '#f2c14e'; x.fillText('NOW BATTING  #' + info.num, 50, 80);
      x.fillStyle = '#fff'; x.font = '900 italic 120px "Barlow Condensed"'; x.fillText(info.batter.toUpperCase(), 50, 200);
      x.font = '800 60px "Barlow Condensed"'; x.fillText(info.line || '', 50, 310);
      x.fillStyle = '#ffffffcc'; x.font = '800 54px "Barlow Condensed"'; x.fillText(info.score || '', 50, 430);
    } else { x.font = '900 italic 100px "Barlow Condensed"'; x.fillText(info.title || '', W / 2, H * 0.42); x.font = '800 italic 52px "Barlow Condensed"'; x.fillStyle = '#f2c14e'; x.fillText(info.sub || '', W / 2, H * 0.7); }
    this.boardTex.needsUpdate = true;
  }
  setTime(time, scene) {
    const night = time === 'night', dusk = time === 'dusk';
    if (this.lights) for (const l of this.lights) l.material.color.set(night || dusk || this.closed ? '#fffbe8' : '#c9c9c0');
    if (this.buildings) for (const b of this.buildings) b.material[4].emissiveIntensity = night ? 0.9 : dusk ? 0.3 : 0;
  }
  update(dt, t, excite) {
    this.crowd.update(dt, t, excite);
    if (this.fountains) for (const [i, j] of this.fountains.entries()) j.scale.y = 0.8 + 0.3 * Math.sin(t * 2 + i) + excite * 0.6;
  }
}
