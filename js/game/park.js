// MLB Grand Slam 27 - ballpark builder. World units = feet. Home plate at origin, center field toward -z, first base toward +x.
// Builds a full MLB-style park: mowed grass, real infield skin, padded outfield wall with ads + distance markers,
// multi-deck seating bowl (lower deck, suites, upper deck, roof canopy), dugouts, backstop netting, bleachers,
// batter's eye, bullpen, video boards with the home club logo, light banks that glow at night, landmarks.
// Geometry is batched by material (few draw calls), so phones stay smooth.
import * as THREE from '../lib/three.min.js';
import { makeCrowd } from './crowd.js';
import { logoImg, loadLogo, drawFit } from '../logos.js';
import { badgeSource } from '../ui.js';

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
  let i = 0; while (i < 5 && p > ANG[i + 1]) i++;
  const t = (p - ANG[i]) / (ANG[i + 1] - ANG[i]);
  const s = Math.max(0, Math.min(1, (t - 0.42) / 0.16));
  return arr[i] + (arr[i + 1] - arr[i]) * s;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(cv, srgb = true, rep = false) { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function hashS(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
const col = (hex) => new THREE.Color(hex);
const hexOf = (c) => '#' + c.getHexString();
const shade = (hex, f) => hexOf(col(hex).multiplyScalar(f));
const mixHex = (a, b, t) => hexOf(col(a).lerp(col(b), t));
const lumOf = (hex) => { const c = col(hex); return c.r * 0.3 + c.g * 0.59 + c.b * 0.11; };
const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

// ---------- tiling detail textures (grass blades / dirt grain), multiplied over the big painted canvases ----------
const DET = {};
function detailTex(kind) {
  if (DET[kind]) return DET[kind];
  const S = 256, cv = canvas(S, S), x = cv.getContext('2d'), r = rng(kind === 'grass' ? 17 : 29);
  x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
  const wrap = (f) => { for (const dx of [0, -S]) for (const dy of [0, -S]) { x.save(); x.translate(dx, dy); f(); x.restore(); } };
  if (kind === 'grass') {
    for (let i = 0; i < 7000; i++) {
      const v = 95 + r() * 80 | 0, px = r() * S, py = r() * S, dx = (r() - 0.5) * 2.5, dy = 3 + r() * 5;
      wrap(() => { x.strokeStyle = `rgba(${v},${v},${v},.55)`; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + dx, py + dy); x.stroke(); });
    }
  } else {
    for (let i = 0; i < 5200; i++) {
      const v = 80 + r() * 100 | 0, px = r() * S, py = r() * S, s = 0.8 + r() * 2.2;
      wrap(() => { x.fillStyle = `rgba(${v},${v},${v},.55)`; x.fillRect(px, py, s, s); });
    }
    for (let i = 0; i < 60; i++) {
      const px = r() * S, py = r() * S, rr = 6 + r() * 20, d = r() < 0.5;
      wrap(() => { const g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, d ? 'rgba(60,60,60,.18)' : 'rgba(200,200,200,.18)'); g.addColorStop(1, 'rgba(128,128,128,0)'); x.fillStyle = g; x.fillRect(px - rr, py - rr, rr * 2, rr * 2); });
    }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; DET[kind] = t; return t;
}
// world-space detail map on a MeshStandardMaterial (uses the world xz, so it lines up across meshes)
function withDetail(mat, kind, scale, amt) {
  const det = detailTex(kind);
  mat.onBeforeCompile = sh => {
    sh.uniforms.detMap = { value: det };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vDetUv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvDetUv = (modelMatrix * vec4(transformed, 1.0)).xz / ${scale.toFixed(2)};`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vDetUv; uniform sampler2D detMap;')
      .replace('#include <map_fragment>', `#include <map_fragment>\ndiffuseColor.rgb *= mix(1.0, texture2D(detMap, vDetUv).r * 2.0, ${amt.toFixed(2)});`);
  };
  mat.customProgramCacheKey = () => 'det' + kind + scale + amt;
  return mat;
}

// geometry helpers
function prep(g) {
  if (g.attributes.color) g.deleteAttribute('color');
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) { const n = g.attributes.position.count, a = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) a[i] = i; g.setIndex(new THREE.BufferAttribute(a, 1)); }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.clearGroups(); return g;
}
const _o = new THREE.Object3D();
function placed(g, x, y, z, ry = 0, rx = 0, rz = 0, s = null) {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz, 'YXZ'); if (s) _o.scale.set(...s); else _o.scale.set(1, 1, 1); _o.updateMatrix();
  return g.applyMatrix4(_o.matrix);
}
// facing the field: rotation.y so local +z points toward (tx,tz)
const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
// sampler that walks a front polyline by arc length
function sampler(front) {
  const al = [0]; for (let i = 1; i < front.length; i++) al.push(al[i - 1] + front[i].p.distanceTo(front[i - 1].p));
  return {
    len: al[al.length - 1], al,
    at(s, o) {
      let i = 0; while (i < al.length - 2 && al[i + 1] < s) i++;
      const t = Math.max(0, Math.min(1, (s - al[i]) / ((al[i + 1] - al[i]) || 1)));
      const a = front[i], b = front[Math.min(front.length - 1, i + 1)];
      const n = a.n.clone().lerp(b.n, t).normalize(), p = a.p.clone().lerp(b.p, t);
      return { p: p.addScaledVector(n, o), n };
    },
  };
}

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
    this.feats = pk.feats || [];
    this.R = rng(hashS(id));
    this.redraws = [];
    this.build();
    // real club logo (the on-dark version: every surface we paint it on is dark / team colored)
    const redraw = img => { if (img && !this.dead) for (const f of this.redraws) try { f(); } catch (e) { console.warn(e); } };
    if (!logoImg(team, 'primaryDark')) loadLogo(team, 'primaryDark').then(img => { if (img) redraw(img); else if (!logoImg(team, 'primary')) loadLogo(team, 'primary').then(redraw); });
  }
  // ---------- queries used by physics ----------
  fenceAt(x, z) { const phi = phiOf(x, z); return { phi, r: this.wallR(phi), h: this.wallH(phi), d: Math.hypot(x, z) }; }
  isFair(x, z) { const phi = phiOf(x, z); return Math.abs(phi) <= 45.2 * D2R && -z > -1; }
  logoSrc() { return logoImg(this.team, 'primaryDark') || logoImg(this.team, 'primary') || badgeSource(this.team, 512); }
  // ---------- batching ----------
  add(mat, geo) { if (!this.B.has(mat)) this.B.set(mat, []); this.B.get(mat).push(prep(geo)); }
  flush() {
    this.structMeshes = this.structMeshes || [];
    for (const [mat, list] of this.B) {
      let g = list.length === 1 ? list[0] : THREE.mergeGeometries(list, false);
      const meshes = [];
      if (g) meshes.push(new THREE.Mesh(g, mat)); else { console.warn('merge failed', mat.name); for (const l of list) meshes.push(new THREE.Mesh(l, mat)); }
      for (const m of meshes) {
        m.castShadow = !!mat.userData.cast; m.receiveShadow = mat.userData.recv !== false; m.matrixAutoUpdate = false; m.updateMatrix();
        if (mat.userData.cast) this.structMeshes.push(m);
        if (mat.userData.order) m.renderOrder = mat.userData.order;
        this.group.add(m);
      }
    }
    this.B.clear();
  }
  mat(key, make) { this.M = this.M || {}; if (!this.M[key]) { this.M[key] = make(); this.M[key].name = key; } return this.M[key]; }
  std(key, o = {}, ud = {}) { return this.mat(key, () => { const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide, ...o }); Object.assign(m.userData, { cast: true }, ud); return m; }); }
  // ribbon along a front polyline. prof = [[out, y], ...]; uS = feet per u, vS = feet per v (0 -> 0..1 per segment)
  ribbonGeo(front, prof, uS = 20, vS = 0) {
    const pos = [], uv = [], idx = []; let base = 0;
    const al = [0]; for (let i = 1; i < front.length; i++) al.push(al[i - 1] + front[i].p.distanceTo(front[i - 1].p));
    let vAcc = 0;
    for (let j = 0; j < prof.length - 1; j++) {
      const [o0, y0] = prof[j], [o1, y1] = prof[j + 1], len = Math.hypot(o1 - o0, y1 - y0);
      for (let i = 0; i < front.length; i++) {
        const { p, n } = front[i];
        pos.push(p.x + n.x * o0, y0, p.z + n.z * o0, p.x + n.x * o1, y1, p.z + n.z * o1);
        const u = al[i] / uS; uv.push(u, vS ? vAcc / vS : 0, u, vS ? (vAcc + len) / vS : 1);
      }
      for (let i = 0; i < front.length - 1; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      base += front.length * 2; vAcc += len;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  rib(front, prof, mat, uS, vS) { if (front.length > 1) this.add(mat, this.ribbonGeo(front, prof, uS, vS)); }
  // closes the side of a stand: contour [[o,y],...] drawn at a front end point
  cap(pt, contour, mat) {
    const v2 = contour.map(([o, y]) => new THREE.Vector2(o, y));
    if (THREE.ShapeUtils.isClockWise(v2)) v2.reverse();
    const tris = THREE.ShapeUtils.triangulateShape(v2, []);
    const pos = [], uv = [];
    for (const v of v2) { pos.push(pt.p.x + pt.n.x * v.x, v.y, pt.p.z + pt.n.z * v.x); uv.push(v.x / 20, v.y / 20); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(tris.flat()); g.computeVertexNormals(); this.add(mat, g);
  }
  // ---------- build ----------
  build() {
    this.B = new Map();
    const pk = this.pk;
    this.big = pk.cap >= 20000;
    this.front = this.foulFront();
    this.seats = [];
    this.lightPts = [];
    const penSide = hashS(this.id + 'pen') & 1 ? 1 : -1;
    this.pen = [penSide > 0 ? 19 : -29, penSide > 0 ? 29 : -19];
    this.pools = this.feats.includes('fountains') ? [[-37, -19], [19, 37]] : this.feats.includes('fountain') ? [[-37, -19]] : [];
    if (this.pools.length) this.pen = this.pools.length > 1 ? null : [19, 29];
    this.buildGround();
    this.buildInfield();
    this.buildWall();
    this.buildStands();
    this.buildOutfield();
    this.buildLights();
    this.buildExtras();
    this.buildBoard();
    this.buildPoles();
    this.flush();
    this.crowd = makeCrowd(this.seats, this.team, { fast: this.fast, fill: this.opts.fill ?? 0.93 });
    this.group.add(this.crowd.mesh);
  }
  // ---------- grass ----------
  grassCols() {
    const turf = this.pk.turf === 'turf';
    return turf ? { a: '#2f7a36', b: '#378540', track: '#6d4c3a' } : { a: '#3c7a2b', b: '#468833', track: '#8f6243' };
  }
  mowStyle() {
    const o = { NYY: 'check', BOS: 'check', CHC: 'stripes', LAD: 'diamond', SF: 'wide', STL: 'arcs', KC: 'diamond', DET: 'check', SEA: 'wide', COL: 'stripes', PIT: 'arcs', MIN: 'check' };
    return o[this.id] || ['check', 'stripes', 'diamond', 'wide', 'arcs', 'check'][hashS(this.id + 'mow') % 6];
  }
  // paints the lighter mowing pass (caller has clipped to the fair area)
  paintMow(x, px, pz, L, S, inf = false) {
    const st = this.mowStyle(), C = this.grassCols();
    x.save(); x.fillStyle = C.b; x.strokeStyle = C.b;
    const sz = inf ? 10 : 15;
    x.translate(px(0), pz(0));
    if (st === 'check' || st === 'diamond') {
      if (st === 'check') x.rotate(Math.PI / 4);
      const k = L(sz); for (let i = -70; i < 70; i++) for (let j = -70; j < 70; j++) if (((i + j) & 1) === 0) x.fillRect(i * k, j * k, k + 0.6, k + 0.6);
    } else if (st === 'stripes') {
      const k = L(inf ? 9 : 16); for (let i = -70; i < 10; i += 2) x.fillRect(-S * 2, i * k, S * 4, k);
    } else if (st === 'wide') {
      x.rotate(Math.PI / 4); const k = L(inf ? 10 : 22);
      for (let i = -50; i < 50; i += 2) x.fillRect(i * k, -S * 2, k, S * 4);
      x.globalAlpha = 0.45; for (let i = -50; i < 50; i += 2) x.fillRect(-S * 2, i * k, S * 4, k);
    } else { // arcs around home
      const k = L(inf ? 8 : 13); x.lineWidth = k;
      for (let r = 1; r < 50; r += 2) { x.beginPath(); x.arc(0, 0, r * k + k / 2, 0, Math.PI * 2); x.stroke(); }
    }
    x.restore();
  }
  // foul stands front: LF pole -> behind home -> RF pole. [{p, n}] (p on ground, n outward / away from the field)
  foulFront() {
    // straight runs parallel to each foul line, joined behind home by an arc tangent to both (no kinks -> no folded decks)
    const out = [], f = this.feats.includes('pesky') ? 34 : 48, R = 34, zc = (f - R) / 0.7071;
    const L = dirOf(-45 * D2R), Rd = dirOf(45 * D2R);
    const nL = new THREE.Vector3(-0.7071, 0, 0.7071), nR = new THREE.Vector3(0.7071, 0, 0.7071);
    const rl = this.wallR(-45 * D2R), rr = this.wallR(45 * D2R);
    this.foulOff = f; this.rl = rl; this.rr = rr;
    const c = new THREE.Vector3(0, 0, zc);
    const tTan = c.clone().addScaledVector(nL, R).dot(L); // line parameter of the tangent point
    const step = this.fast ? 12 : 7;
    for (let t = rl; t > tTan + 0.5; t -= step) out.push({ p: L.clone().multiplyScalar(t).addScaledVector(nL, f), n: nL.clone(), t, side: -1 });
    const K = this.fast ? 8 : 14;
    for (let k = 0; k <= K; k++) { const a = (-45 + 90 * k / K) * D2R, n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); out.push({ p: c.clone().addScaledVector(n, R), n, t: 0, side: 0 }); }
    const ts = []; for (let t = tTan + step; t < rr; t += step) ts.push(t); ts.push(rr);
    for (const t of ts) out.push({ p: Rd.clone().multiplyScalar(t).addScaledVector(nR, f), n: nR.clone(), t, side: 1 });
    return out;
  }
  buildGround() {
    const turf = this.pk.turf === 'turf';
    const S = this.fast ? 1024 : 2048, X0 = -380, X1 = 380, Z0 = -580, Z1 = 180, W = X1 - X0, H = Z1 - Z0;
    const cv = canvas(S, S);
    const px = v => (v - X0) / W * S, pz = v => (v - Z0) / H * S, L = v => v / W * S;
    const C = this.grassCols();
    const fair = []; for (let a = -45; a <= 45; a += 0.5) fair.push(dirOf(a * D2R).multiplyScalar(this.wallR(a * D2R)));
    const draw = () => {
      const x = cv.getContext('2d');
      x.fillStyle = '#5e5b56'; x.fillRect(0, 0, S, S); // concourse / outside
      // whole field (fair + foul ground) = grass
      x.beginPath(); x.moveTo(px(this.front[0].p.x), pz(this.front[0].p.z));
      for (const f of this.front) x.lineTo(px(f.p.x), pz(f.p.z));
      for (let i = fair.length - 1; i >= 0; i--) x.lineTo(px(fair[i].x), pz(fair[i].z));
      x.closePath(); x.fillStyle = C.a; x.fill();
      // bullpen grass behind the wall
      if (this.pen) { x.save(); x.fillStyle = C.a; x.beginPath(); for (let a = this.pen[0]; a <= this.pen[1]; a += 1) { const p = dirOf(a * D2R).multiplyScalar(this.wallR(a * D2R) + 1); a === this.pen[0] ? x.moveTo(px(p.x), pz(p.z)) : x.lineTo(px(p.x), pz(p.z)); } for (let a = this.pen[1]; a >= this.pen[0]; a -= 1) { const p = dirOf(a * D2R).multiplyScalar(this.wallR(a * D2R) + 42); x.lineTo(px(p.x), pz(p.z)); } x.fill(); x.restore(); }
      // water features painted on the ground (the 3D water sits just below ground level, outside the canvas)
      const ring = (a0, a1, r0, r1, color) => { x.fillStyle = color; x.beginPath(); for (let a = a0; a <= a1; a += 1) { const p = dirOf(a * D2R).multiplyScalar(this.wallR(Math.max(-45, Math.min(45, a)) * D2R) + r0); a === a0 ? x.moveTo(px(p.x), pz(p.z)) : x.lineTo(px(p.x), pz(p.z)); } for (let a = a1; a >= a0; a -= 1) { const p = dirOf(a * D2R).multiplyScalar(this.wallR(Math.max(-45, Math.min(45, a)) * D2R) + r1); x.lineTo(px(p.x), pz(p.z)); } x.closePath(); x.fill(); };
      for (const [a0, a1] of this.pools) { ring(a0, a1, 2, 54, '#c9c6bd'); ring(a0 + 1.5, a1 - 1.5, 10, 46, '#3a83b8'); }
      if (this.feats.includes('splash')) ring(16, 75, 9, 900, '#2d5f80');
      // fair-territory mowing
      x.save(); x.beginPath(); x.moveTo(px(0), pz(0)); for (const p of fair) x.lineTo(px(p.x), pz(p.z)); x.closePath(); x.clip();
      this.paintMow(x, px, pz, L, S); x.restore();
      // foul ground: stripes parallel to the lines
      x.save(); x.beginPath(); x.moveTo(px(this.front[0].p.x), pz(this.front[0].p.z)); for (const f of this.front) x.lineTo(px(f.p.x), pz(f.p.z)); x.lineTo(px(fair[fair.length - 1].x), pz(fair[fair.length - 1].z)); x.lineTo(px(0), pz(0)); x.lineTo(px(fair[0].x), pz(fair[0].z)); x.closePath(); x.clip();
      x.translate(px(0), pz(0)); x.rotate(Math.PI / 4); x.fillStyle = C.b; x.globalAlpha = 0.6; const k = L(12);
      for (let i = -60; i < 60; i += 2) { x.fillRect(i * k, -S * 2, k, S * 4); }
      x.restore();
      // grain
      const r = rng(7); x.globalAlpha = 0.05; for (let i = 0; i < (this.fast ? 6000 : 16000); i++) { x.fillStyle = r() < 0.5 ? '#000' : '#fff'; x.fillRect(r() * S, r() * S, 2, 2); } x.globalAlpha = 1;
      // warning track along the wall and in front of the stands
      x.lineJoin = 'round'; x.lineCap = 'butt';
      x.strokeStyle = C.track; x.lineWidth = L(30); x.beginPath(); fair.forEach((p, i) => i ? x.lineTo(px(p.x), pz(p.z)) : x.moveTo(px(p.x), pz(p.z))); x.stroke();
      x.lineWidth = L(16); x.beginPath(); this.front.forEach((f, i) => i ? x.lineTo(px(f.p.x), pz(f.p.z)) : x.moveTo(px(f.p.x), pz(f.p.z))); x.stroke();
      // track grain
      const r2 = rng(9); x.globalAlpha = 0.18;
      for (let i = 0; i < (this.fast ? 4000 : 12000); i++) { const a = (-46 + r2() * 92) * D2R, d = this.wallR(Math.max(-45 * D2R, Math.min(45 * D2R, a))) - r2() * 15, p = dirOf(a).multiplyScalar(d); x.fillStyle = r2() < 0.5 ? '#5a3c28' : '#b88a62'; x.fillRect(px(p.x), pz(p.z), 2, 2); }
      x.globalAlpha = 1;
      // grass edge of the track: thin darker line
      x.strokeStyle = 'rgba(30,50,20,.35)'; x.lineWidth = L(0.8); x.beginPath(); fair.forEach((p, i) => { const q = p.clone().multiplyScalar(1 - 15 / p.length()); i ? x.lineTo(px(q.x), pz(q.z)) : x.moveTo(px(q.x), pz(q.z)); }); x.stroke();
      // foul lines to the poles
      x.strokeStyle = '#f5f5f0'; x.lineWidth = Math.max(1.6, L(0.36)); x.lineCap = 'butt';
      for (const s of [-1, 1]) { const p = dirOf(s * 45 * D2R).multiplyScalar(this.wallR(s * 45 * D2R)); x.beginPath(); x.moveTo(px(0), pz(0)); x.lineTo(px(p.x), pz(p.z)); x.stroke(); }
      // club logo behind home plate (reads from the center field camera)
      x.save(); x.translate(px(0), pz(36)); x.rotate(Math.PI); x.globalAlpha = 0.92; drawFit(x, this.logoSrc(), 0, 0, L(19), L(15)); x.restore();
      // team name painted in foul ground down each line? -> club name behind home, below the logo
      tx.needsUpdate = true;
    };
    const tx = tex(cv); draw(); this.redraws.push(draw);
    const m = withDetail(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.95 }), 'grass', 6, turf ? 0.25 : 0.55); m.userData.recv = true;
    const geo = new THREE.PlaneGeometry(W, H); geo.rotateX(-Math.PI / 2); geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; this.group.add(mesh);
    // far ground beyond the canvas so there is no void
    const urban = !['berm', 'hills'].some(k => this.feats.includes(k));
    const far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: urban ? '#4d5052' : '#3d5a32', roughness: 1 }));
    far.position.y = -0.4; this.group.add(far);
  }
  // ---------- infield skin, chalk, plate, mound, bases ----------
  buildInfield() {
    const turf = this.pk.turf === 'turf', T = this.team;
    const S = this.fast ? 1024 : 2048, X0 = -112, X1 = 112, Z0 = -172, Z1 = 52, W = X1 - X0, H = Z1 - Z0;
    const cv = canvas(S, S);
    const px = v => (v - X0) / W * S, pz = v => (v - Z0) / H * S, L = v => v / W * S;
    const C = this.grassCols();
    const dirt = turf ? '#a66d47' : '#b5774a', dirtD = turf ? '#8d5a3a' : '#9a6038', dirtL = '#c98c5e';
    const B1 = [63.64, -63.64], B2 = [0, -127.28], B3 = [-63.64, -63.64];
    // shapes (in feet), reused for the alpha mask
    const skinPath = (x) => { // 95 ft arc around the mound, clipped to fair + 3 ft
      x.save(); x.beginPath();
      x.moveTo(px(0), pz(4.24)); x.lineTo(px(-157.7), pz(-153.4)); x.lineTo(px(157.7), pz(-153.4)); x.closePath(); x.clip();
      x.beginPath(); x.arc(px(0), pz(-60.5), L(95), 0, Math.PI * 2); x.fill(); x.restore();
    };
    const extras = (x) => {
      // base cutouts, baseline paths, home circle, mound circle
      for (const b of [B1, B3]) { x.beginPath(); x.arc(px(b[0]), pz(b[1]), L(13), 0, 7); x.fill(); }
      x.save(); x.lineCap = 'butt'; x.lineWidth = L(6); x.strokeStyle = x.fillStyle;
      x.beginPath(); x.moveTo(px(0), pz(0)); x.lineTo(px(B1[0]), pz(B1[1])); x.moveTo(px(0), pz(0)); x.lineTo(px(B3[0]), pz(B3[1])); x.stroke(); x.restore();
      x.beginPath(); x.arc(px(0), pz(0), L(13), 0, 7); x.fill();
    };
    const grassSq = (x) => { const i = 4.24; x.beginPath(); x.moveTo(px(0), pz(-i)); x.lineTo(px(63.64 - i), pz(-63.64)); x.lineTo(px(0), pz(-127.28 + i)); x.lineTo(px(-63.64 + i), pz(-63.64)); x.closePath(); };
    const decks = [-37, 37];
    const draw = () => {
      const x = cv.getContext('2d'); x.clearRect(0, 0, S, S);
      x.fillStyle = C.a; x.fillRect(0, 0, S, S);
      // skin
      x.fillStyle = dirt; skinPath(x); extras(x);
      // dirt texture: blotches + speckle + drag rings
      x.save(); x.globalCompositeOperation = 'source-atop';
      const r = rng(3);
      for (let i = 0; i < 260; i++) { const a = r() * S, b = r() * S, rr = L(2 + r() * 7), g = x.createRadialGradient(a, b, 0, a, b, rr); const d = r() < 0.55; g.addColorStop(0, d ? 'rgba(110,62,32,.07)' : 'rgba(230,170,120,.06)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(a - rr, b - rr, rr * 2, rr * 2); }
      x.restore();
      // infield grass with its own mowing
      x.fillStyle = C.a; grassSq(x); x.fill();
      x.save(); grassSq(x); x.clip(); this.paintMow(x, px, pz, L, S, true); x.restore();
      // the lip: darker band where grass meets dirt (outfield arc)
      x.save(); x.beginPath(); x.arc(px(0), pz(-60.5), L(95), 0, 7); x.clip();
      x.strokeStyle = 'rgba(80,45,20,.35)'; x.lineWidth = L(2.2); x.beginPath(); x.arc(px(0), pz(-60.5), L(94.6), Math.PI * 1.2, Math.PI * 1.8); x.stroke(); x.restore();
      // home circle + mound on top of the grass
      x.fillStyle = dirt; x.beginPath(); x.arc(px(0), pz(0), L(13), 0, 7); x.fill(); x.beginPath(); x.arc(px(0), pz(-60.5), L(9.3), 0, 7); x.fill();
      // worn areas (darker, damp): batter boxes, around the bases, the mound slope
      const worn = (cx, cz, rr, a) => { const g = x.createRadialGradient(px(cx), pz(cz), 0, px(cx), pz(cz), L(rr)); g.addColorStop(0, `rgba(95,52,26,${a})`); g.addColorStop(1, 'rgba(95,52,26,0)'); x.fillStyle = g; x.fillRect(px(cx) - L(rr), pz(cz) - L(rr), L(rr * 2), L(rr * 2)); };
      worn(0, 0, 9, 0.35); worn(0, -60.5, 7, 0.25); for (const b of [B1, B2, B3]) worn(b[0], b[1], 6, 0.3);
      worn(-20, -110, 14, 0.12); worn(20, -110, 14, 0.12); worn(-50, -95, 12, 0.12); worn(50, -95, 12, 0.12);
      // drag rings + speckle on the skin
      x.save(); x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 0.05; x.strokeStyle = dirtL; x.lineWidth = L(0.7);
      for (let rr = 70; rr < 95; rr += 2.4) { x.beginPath(); x.arc(px(0), pz(-60.5), L(rr), Math.PI * 1.25, Math.PI * 1.75); x.stroke(); }
      x.restore();
      x.save(); x.beginPath(); x.arc(px(0), pz(-60.5), L(95), 0, 7); x.clip();
      const r2 = rng(5); x.globalAlpha = 0.22;
      for (let i = 0; i < (this.fast ? 14000 : 40000); i++) { x.fillStyle = r2() < 0.5 ? dirtD : dirtL; x.fillRect(r2() * S, r2() * S, 1.5, 1.5); }
      x.restore();
      // re-paint the infield grass over any speckle that landed on it
      x.save(); grassSq(x); x.clip(); x.fillStyle = C.a; x.fillRect(0, 0, S, S); this.paintMow(x, px, pz, L, S, true); x.restore();
      x.fillStyle = dirt; x.beginPath(); x.arc(px(0), pz(0), L(13), 0, 7); x.fill(); x.beginPath(); x.arc(px(0), pz(-60.5), L(9.3), 0, 7); x.fill();
      worn(0, 0, 8, 0.3);
      // ---- chalk ----
      x.strokeStyle = '#f7f7f2'; x.lineWidth = Math.max(1.5, L(0.3)); x.lineCap = 'butt';
      const ln = (a, b, c, d) => { x.beginPath(); x.moveTo(px(a), pz(b)); x.lineTo(px(c), pz(d)); x.stroke(); };
      // foul lines from the back corners of the batter's boxes out
      ln(5.4, -5.4, 112, -112); ln(-5.4, -5.4, -112, -112);
      // batter's boxes (4 x 6 ft, 6 in from the plate)
      for (const s of [-1, 1]) { const x0 = s > 0 ? 1.21 : -5.21; x.strokeRect(px(x0), pz(-3), L(4), L(6)); }
      // catcher's box
      ln(-1.79, 3, -1.79, 11); ln(1.79, 3, 1.79, 11); ln(-1.79, 11, 1.79, 11);
      // running lane (last 45 ft to first, 3 ft into foul ground)
      { const d = [0.7071, -0.7071], n = [0.7071, 0.7071], a = 45, b = 90; ln(d[0] * a + n[0] * 3, d[1] * a + n[1] * 3, d[0] * b + n[0] * 3, d[1] * b + n[1] * 3); }
      // home plate (also a 3D mesh)
      x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(px(-0.71), pz(-0.71)); x.lineTo(px(0.71), pz(-0.71)); x.lineTo(px(0.71), pz(0)); x.lineTo(px(0), pz(0.71)); x.lineTo(px(-0.71), pz(0)); x.closePath(); x.fill();
      // on-deck circles with the club logo
      for (const s of [-1, 1]) {
        const cx = px(s * decks[1]), cz = pz(14);
        x.fillStyle = T.c1; x.beginPath(); x.arc(cx, cz, L(2.7), 0, 7); x.fill();
        x.strokeStyle = '#f7f7f2'; x.lineWidth = L(0.18); x.beginPath(); x.arc(cx, cz, L(2.55), 0, 7); x.stroke();
        x.save(); x.beginPath(); x.arc(cx, cz, L(2.4), 0, 7); x.clip(); drawFit(x, this.logoSrc(), cx, cz, L(3.6), L(3.6)); x.restore();
      }
      tx.needsUpdate = true;
    };
    const tx = tex(cv); draw(); this.redraws.push(draw);
    // alpha mask: skin + grass square + home circle + on-deck circles + chalk lines
    const A = 1024, ca = canvas(A, A), ax = ca.getContext('2d');
    const apx = v => (v - X0) / W * A, apz = v => (v - Z0) / H * A, aL = v => v / W * A;
    ax.fillStyle = '#000'; ax.fillRect(0, 0, A, A); ax.fillStyle = '#fff';
    { // same shapes at mask resolution
      ax.save(); ax.beginPath(); ax.moveTo(apx(0), apz(4.24)); ax.lineTo(apx(-157.7), apz(-153.4)); ax.lineTo(apx(157.7), apz(-153.4)); ax.closePath(); ax.clip();
      ax.beginPath(); ax.arc(apx(0), apz(-60.5), aL(95), 0, 7); ax.fill(); ax.restore();
      for (const b of [B1, B3]) { ax.beginPath(); ax.arc(apx(b[0]), apz(b[1]), aL(13), 0, 7); ax.fill(); }
      ax.lineWidth = aL(6); ax.strokeStyle = '#fff'; ax.beginPath(); ax.moveTo(apx(0), apz(0)); ax.lineTo(apx(B1[0]), apz(B1[1])); ax.moveTo(apx(0), apz(0)); ax.lineTo(apx(B3[0]), apz(B3[1])); ax.stroke();
      ax.beginPath(); ax.arc(apx(0), apz(0), aL(13), 0, 7); ax.fill();
      for (const s of [-1, 1]) { ax.beginPath(); ax.arc(apx(s * decks[1]), apz(14), aL(2.75), 0, 7); ax.fill(); }
      ax.lineWidth = Math.max(1.5, aL(0.5)); ax.beginPath(); ax.moveTo(apx(0), apz(0)); ax.lineTo(apx(112), apz(-112)); ax.moveTo(apx(0), apz(0)); ax.lineTo(apx(-112), apz(-112)); ax.stroke();
      { const d = [0.7071, -0.7071], n = [0.7071, 0.7071]; ax.beginPath(); ax.moveTo(apx(d[0] * 45 + n[0] * 3), apz(d[1] * 45 + n[1] * 3)); ax.lineTo(apx(d[0] * 90 + n[0] * 3), apz(d[1] * 90 + n[1] * 3)); ax.stroke(); }
      ax.fillRect(apx(-1.95), apz(2.8), aL(3.9), aL(8.4));
    }
    const am = tex(ca, false);
    const geo = new THREE.PlaneGeometry(W, H); geo.rotateX(-Math.PI / 2); geo.translate((X0 + X1) / 2, 0.05, (Z0 + Z1) / 2);
    const m = withDetail(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.97, transparent: true, alphaMap: am, depthWrite: false }), 'dirt', 3.5, 0.45);
    const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; mesh.renderOrder = 1; this.group.add(mesh);
    // mound: smooth 10 in hump, 18 ft across
    const dm = withDetail(new THREE.MeshStandardMaterial({ color: dirt, roughness: 1 }), 'dirt', 3.5, 0.5); dm.userData.recv = true;
    const prof = [[0, 0.84], [2.6, 0.84], [3.4, 0.8], [5.2, 0.55], [7.2, 0.22], [8.6, 0.05], [9.3, 0]].map(([r, y]) => new THREE.Vector2(r, y));
    const mg = new THREE.LatheGeometry(prof.reverse(), 40); mg.translate(0, 0, -60.5);
    const mound = new THREE.Mesh(mg, dm); mound.receiveShadow = true; this.group.add(mound);
    const white = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.55 });
    const rub = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.5), white); rub.position.set(0, 0.88, -60.5); rub.receiveShadow = true; this.group.add(rub);
    // home plate (beveled pentagon slab)
    const sh = new THREE.Shape(); sh.moveTo(-0.708, -0.708); sh.lineTo(0.708, -0.708); sh.lineTo(0.708, 0); sh.lineTo(0, 0.708); sh.lineTo(-0.708, 0); sh.closePath();
    const pg = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1 });
    pg.rotateX(Math.PI / 2); pg.translate(0, 0.09, 0);
    const plate = new THREE.Mesh(pg, white); plate.receiveShadow = true; this.group.add(plate);
    // bases: 18 in square bags with a beveled top
    const bg = new THREE.BoxGeometry(1.5, 0.34, 1.5, 2, 1, 2);
    { const p = bg.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * 0.9); p.setZ(i, p.getZ(i) * 0.9); } bg.computeVertexNormals(); }
    for (const b of [1, 2, 3]) { const p = BASES[b]; const box = new THREE.Mesh(bg, white); box.position.set(p.x, 0.17, p.z); box.rotation.y = Math.PI / 4; box.castShadow = true; box.receiveShadow = true; this.group.add(box); }
  }
  // ---------- outfield wall ----------
  buildWall() {
    const pk = this.pk, T = this.team, N = this.fast ? 140 : 260;
    const isMonster = this.feats.includes('monster'), ivy = this.feats.includes('ivy'), brick = this.feats.includes('brickwall');
    const pts = []; let len = 0, prev = null;
    for (let i = 0; i <= N; i++) { const phi = (-45 + 90 * i / N) * D2R, r = this.wallR(phi), h = this.wallH(phi), p = dirOf(phi).multiplyScalar(r); if (prev) len += p.distanceTo(prev); prev = p; pts.push({ phi, r, h, p, s: len }); }
    this.wallPts = pts;
    const VH = Math.max(12, Math.ceil(Math.max(...pk.walls) + 2));
    const CWd = Math.min(this.fast ? 2048 : 4096, Math.ceil(len * 4)), CHt = this.fast ? 128 : 256;
    const cv = canvas(CWd, CHt);
    const sOf = (deg) => { let best = pts[0], bd = 9; for (const q of pts) { const d = Math.abs(q.phi - deg * D2R); if (d < bd) { bd = d; best = q; } } return best; };
    const wallCol = pk.wall;
    const draw = () => {
      const x = cv.getContext('2d');
      x.setTransform(CWd / len, 0, 0, CHt / VH, 0, 0); // draw in feet: (s, VH - y)
      x.fillStyle = wallCol; x.fillRect(0, 0, len, VH);
      if (ivy) {
        const r = rng(11); x.fillStyle = '#2b5a22'; x.fillRect(0, 0, len, VH);
        for (let i = 0; i < len * 9; i++) { x.fillStyle = ['#2d6a22', '#3c7d2a', '#24521c', '#4a8a33', '#1f4718', '#56953a'][r() * 6 | 0]; x.beginPath(); x.ellipse(r() * len, r() * VH, 0.5 + r() * 0.7, 0.35 + r() * 0.5, r() * 3, 0, 7); x.fill(); }
      } else if (brick) {
        const r = rng(13);
        for (let row = 0; row < VH / 0.25; row++) for (let c = 0; c < len / 0.7; c++) { x.fillStyle = mixHex('#8a3f2c', '#6e2f22', r()); x.fillRect(c * 0.7 + (row & 1) * 0.35, VH - (row + 1) * 0.25, 0.66, 0.22); }
      } else {
        // padding panels
        x.fillStyle = 'rgba(0,0,0,.22)'; for (let s = 0; s < len; s += 6) x.fillRect(s, 0, 0.12, VH);
        x.fillStyle = 'rgba(255,255,255,.05)'; for (let s = 0; s < len; s += 6) x.fillRect(s + 0.14, 0, 0.1, VH);
        const g = x.createLinearGradient(0, VH - 12, 0, VH); g.addColorStop(0, 'rgba(255,255,255,.06)'); g.addColorStop(1, 'rgba(0,0,0,.25)'); x.fillStyle = g; x.fillRect(0, VH - 12, len, 12);
      }
      if (isMonster) { const a = sOf(-45).s, b = sOf(-28.5).s; x.fillStyle = '#2b5c37'; x.fillRect(a, 0, b - a, VH); x.fillStyle = 'rgba(0,0,0,.18)'; for (let s = a; s < b; s += 4) x.fillRect(s, 0, 0.1, VH); }
      // ads in the padding (not on ivy / monster / brick)
      if (!ivy && !brick) {
        const ads = [0.13, 0.31, 0.69, 0.87];
        ads.forEach((u, k) => {
          const q = pts[Math.round(u * N)]; if (isMonster && q.phi < -28 * D2R) return;
          const h = Math.min(q.h - 1.6, 5.2); if (h < 2.5) return;
          const w = 26, s0 = q.s - w / 2, y0 = VH - 0.8 - h;
          if (k % 2 === 0) { x.fillStyle = T.c1; x.fillRect(s0, y0, w, h); x.save(); x.beginPath(); x.rect(s0, y0, w, h); x.clip(); drawFit(x, this.logoSrc(), s0 + w * 0.2, y0 + h / 2, h * 0.95, h * 0.9); x.restore(); txt(x, T.name.toUpperCase(), s0 + w * 0.62, y0 + h / 2, h * 0.62, lumOf(T.c1) > 0.6 ? '#111' : '#fff', w * 0.6); }
          else { x.fillStyle = '#0d1117'; x.fillRect(s0, y0, w, h); txt(x, 'GRAND SLAM 27', s0 + w / 2, y0 + h / 2, h * 0.6, '#f2c14e', w * 0.9); }
        });
      }
      // distance markers
      const marks = [[-44, pk.dims[0]], [-31, pk.dims[1]], [-17, pk.dims[2]], [0, pk.dims[3]], [17, pk.dims[4]], [31, pk.dims[5]], [44, pk.dims[6]]];
      for (const [a, d] of marks) { if (a === -31 || a === 31) { if (!this.big) continue; } const q = sOf(a); const hh = Math.min(3.2, q.h * 0.4), y = VH - Math.min(q.h - 0.9, 7.5); txt(x, String(d), q.s, y + hh * 0.05, hh, ivy ? '#f4f4ee' : '#f4f4ee', 12, true); }
      // Monster manual scoreboard
      if (isMonster) {
        const q = sOf(-37), w = 58, h = 17, s0 = q.s - w / 2, y0 = VH - 3 - h;
        x.fillStyle = '#204a2b'; x.fillRect(s0, y0, w, h); x.fillStyle = '#163820';
        for (let rr = 0; rr < 2; rr++) for (let i = 0; i < 10; i++) x.fillRect(s0 + 14 + i * 4, y0 + 3 + rr * 6, 3.4, 4.6);
        txt(x, 'VISITORS', s0 + 7, y0 + 5.3, 2.2, '#e8e8e0', 12); txt(x, T.name.toUpperCase(), s0 + 7, y0 + 11.3, 2.2, '#e8e8e0', 12);
        txt(x, 'BALL  STRIKE  OUT', s0 + w / 2, y0 + 15.3, 1.8, '#e8e8e0', 40);
      }
      // yellow home run line along the top
      x.fillStyle = '#f2c81e'; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; x.fillRect(a.s, VH - a.h, b.s - a.s + 0.05, 0.55); }
      // dirt kick stain at the bottom
      const g2 = x.createLinearGradient(0, VH - 1.6, 0, VH); g2.addColorStop(0, 'rgba(110,70,40,0)'); g2.addColorStop(1, 'rgba(110,70,40,.45)'); x.fillStyle = g2; x.fillRect(0, VH - 1.6, len, 1.6);
      x.setTransform(1, 0, 0, 1, 0, 0); tw.needsUpdate = true;
    };
    function txt(x, s, cx, cy, size, color, maxW, bold) { x.save(); x.font = `${bold ? 900 : 800} italic ${size}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color; const w = x.measureText(s).width; const k = maxW && w > maxW ? maxW / w : 1; x.translate(cx, cy); x.scale(k, 1); x.fillText(s, 0, 0); x.restore(); }
    const tw = tex(cv); draw(); this.redraws.push(draw);
    // front face
    const pos = [], uv = [], idx = [];
    pts.forEach((q, i) => { pos.push(q.p.x, 0, q.p.z, q.p.x, q.h, q.p.z); uv.push(q.s / len, 1, q.s / len, 1 - q.h / VH); if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    tw.flipY = false;
    const wm = new THREE.MeshStandardMaterial({ map: tw, roughness: 0.88, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(g, wm); wall.receiveShadow = true; this.group.add(wall);
    // top cap + back
    const capF = pts.map(q => ({ p: q.p, n: dirOf(q.phi) }));
    const capPos = [], capIdx = []; pts.forEach((q, i) => { const n = dirOf(q.phi); capPos.push(q.p.x, q.h, q.p.z, q.p.x + n.x * 1.6, q.h, q.p.z + n.z * 1.6, q.p.x + n.x * 1.6, 0, q.p.z + n.z * 1.6); if (i < N) { const a = i * 3; capIdx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); } });
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3)); cg.setIndex(capIdx); cg.computeVertexNormals();
    this.add(this.std('wallback', { color: shade(isMonster ? '#2b5c37' : wallCol, 0.7) }), cg);
    // corner walls: from each foul pole out to the stands
    for (const s of [-1, 1]) {
      const phi = s * 45 * D2R, base = dirOf(phi).multiplyScalar(this.wallR(phi)), n = new THREE.Vector3(s * 0.7071, 0, 0.7071), h = this.wallH(phi);
      const fr = [{ p: base, n: dirOf(phi) }, { p: base.clone().addScaledVector(n, this.foulOff + 2), n: dirOf(phi) }];
      this.rib(fr, [[0, 0], [0, h], [1.6, h], [1.6, 0]], this.std('padwall' + s, { color: isMonster && s < 0 ? '#2b5c37' : wallCol, roughness: 0.9 }));
      this.rib(fr, [[-0.05, h - 0.55], [-0.05, h]], this.std('hrline', { color: '#f2c81e', roughness: 0.6 }, { cast: false }));
    }
    this.wallTop = Math.max(...pk.walls);
  }
  // ---------- seats / materials ----------
  seatMat() {
    return this.mat('seats', () => {
      const cv = canvas(128, 64), x = cv.getContext('2d'), sc = this.pk.seats;
      x.fillStyle = '#5e6166'; x.fillRect(0, 0, 128, 64);              // tread (concrete)
      x.fillStyle = '#35373b'; x.fillRect(0, 0, 128, 7);               // riser shadow at the back
      for (let i = 0; i < 4; i++) {
        const x0 = i * 32 + 2;
        x.fillStyle = shade(sc, 0.62); x.fillRect(x0, 8, 28, 26);         // seat back
        x.fillStyle = sc; x.fillRect(x0 + 1, 9, 26, 22);
        x.fillStyle = mixHex(sc, '#ffffff', 0.18); x.fillRect(x0 + 1, 31, 26, 9); // seat bottom
        x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(x0, 40, 28, 4);
      }
      const t = tex(cv, true, true);
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide }); m.userData.cast = true; return m;
    });
  }
  concrete() { return this.std('concrete', { color: '#a9a69f', roughness: 0.92 }); }
  facadeMat() {
    return this.mat('facade', () => {
      const cv = canvas(256, 128), x = cv.getContext('2d'), f = this.pk.facade;
      x.fillStyle = f; x.fillRect(0, 0, 256, 128);
      x.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 256; i += 64) x.fillRect(i, 0, 3, 128); for (let j = 0; j < 128; j += 32) x.fillRect(0, j, 256, 2);
      const t = tex(cv, true, true); const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, side: THREE.DoubleSide }); m.userData.cast = true; return m;
    });
  }
  // windowed outer shell / concourse
  shellMat() {
    return this.mat('shell', () => {
      // stadium exterior: concrete bands, tall arched concourse openings below, ramp openings above
      const cv = canvas(256, 256), em = canvas(256, 256), x = cv.getContext('2d'), e = em.getContext('2d'), f = this.pk.facade;
      x.fillStyle = shade(f, 0.9); x.fillRect(0, 0, 256, 256); e.fillStyle = '#000'; e.fillRect(0, 0, 256, 256);
      x.fillStyle = shade(f, 0.75); x.fillRect(0, 120, 256, 10); x.fillRect(0, 0, 256, 8);
      for (let i = 0; i < 4; i++) {
        const x0 = i * 64 + 12;
        // big arch (lower half)
        x.fillStyle = '#1c2026'; x.beginPath(); x.moveTo(x0, 256); x.lineTo(x0, 170); x.arc(x0 + 20, 170, 20, Math.PI, 0); x.lineTo(x0 + 40, 256); x.closePath(); x.fill();
        e.fillStyle = '#ffcf8a'; e.beginPath(); e.moveTo(x0, 256); e.lineTo(x0, 170); e.arc(x0 + 20, 170, 20, Math.PI, 0); e.lineTo(x0 + 40, 256); e.closePath(); e.fill();
        // upper ramp openings
        x.fillStyle = '#2a3038'; x.fillRect(x0 - 4, 30, 48, 22); x.fillRect(x0 - 4, 72, 48, 22);
        if (i % 2 === 0) { e.fillStyle = '#7a6040'; e.fillRect(x0 - 4, 30, 48, 22); }
      }
      x.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 256; i += 64) x.fillRect(i, 0, 4, 256);
      const t = tex(cv, true, true), te = tex(em, true, true);
      const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: te, emissiveIntensity: 0, roughness: 0.85, side: THREE.DoubleSide }); m.userData.cast = true; m.userData.night = 0.5; return m;
    });
  }
  suiteMat() {
    return this.mat('suites', () => {
      const cv = canvas(256, 64), em = canvas(256, 64), x = cv.getContext('2d'), e = em.getContext('2d');
      x.fillStyle = '#1d2630'; x.fillRect(0, 0, 256, 64); e.fillStyle = '#000'; e.fillRect(0, 0, 256, 64);
      const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(160,190,220,.35)'); g.addColorStop(1, 'rgba(20,30,40,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 64);
      x.fillStyle = '#c9c9c4'; for (let i = 0; i < 256; i += 32) x.fillRect(i, 0, 3, 64); x.fillRect(0, 0, 256, 4); x.fillRect(0, 60, 256, 4);
      const r = rng(21); for (let i = 0; i < 256; i += 32) if (r() < 0.75) { e.fillStyle = r() < 0.5 ? '#b08a5a' : '#c9a774'; e.fillRect(i + 3, 4, 29, 56); }
      const t = tex(cv, true, true), te = tex(em, true, true);
      const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: te, emissiveIntensity: 0.15, roughness: 0.2, metalness: 0.3, side: THREE.DoubleSide }); m.userData.cast = true; m.userData.night = 0.4; m.userData.day = 0.1; return m;
    });
  }
  ribbonMat() {
    return this.mat('ribbonled', () => {
      const cv = canvas(2048, 64); this.ribbonCv = cv;
      const t = tex(cv, true, true);
      const draw = () => {
        const x = cv.getContext('2d'), T = this.team;
        const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, shade(T.c1, 1.15)); g.addColorStop(1, shade(T.c1, 0.75)); x.fillStyle = g; x.fillRect(0, 0, 2048, 64);
        const fg = lumOf(T.c1) > 0.6 ? '#111' : '#fff', acc = lumOf(T.c2) > 0.25 && T.c2.toLowerCase() !== T.c1.toLowerCase() ? T.c2 : '#f2c14e';
        const items = [`LET'S GO ${T.name.toUpperCase()}`, 'logo', 'GRAND SLAM 27', 'logo', this.pk.name.toUpperCase(), 'logo', T.city.toUpperCase(), 'logo'];
        x.textAlign = 'center'; x.textBaseline = 'middle';
        items.forEach((it, i) => {
          const cx = (i + 0.5) * 256;
          if (it === 'logo') { drawFit(x, this.logoSrc(), cx, 32, 52, 52); return; }
          x.font = `900 italic 40px ${FONT}`; x.fillStyle = i % 4 === 2 ? acc : fg; const w = x.measureText(it).width; x.save(); x.translate(cx, 34); if (w > 236) x.scale(236 / w, 1); x.fillText(it, 0, 0); x.restore();
        });
        x.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 2048; i += 3) x.fillRect(i, 0, 1, 64); // LED grid
        for (let j = 0; j < 64; j += 3) x.fillRect(0, j, 2048, 1);
        t.needsUpdate = true;
      };
      draw(); this.redraws.push(draw);
      const m = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, toneMapped: false, color: '#dddddd' }); m.userData.cast = false; m.userData.led = true; return m;
    });
  }
  // rake seats + crowd rows. o0,y0 -> o1,y1 along front. aisles every `asp` feet of front.
  rake(front, o0, y0, o1, y1, opts = {}) {
    const len = Math.hypot(o1 - o0, y1 - y0), rows = Math.max(1, Math.round((o1 - o0) / 2.9)), rowLen = len / rows;
    this.rib(front, [[o0, y0], [o1, y1]], this.seatMat(), 7, rowLen);
    const sm = sampler(front), asp = opts.aisle ?? 26, dens = opts.density ?? 0.9, step = 1.85;
    // aisles: concrete stair strips (merged)
    const ag = [], am = this.std('aisle', { color: '#6f6d68', roughness: 0.95 });
    if (asp) for (let s = asp / 2; s < sm.len - 2; s += asp) {
      const a = sm.at(s - 1.3, 0), b = sm.at(s + 1.3, 0);
      const fr = [{ p: a.p, n: a.n }, { p: b.p, n: b.n }];
      ag.push(this.ribbonGeo(fr, [[o0, y0 + 0.12], [o1, y1 + 0.12]], 3, rowLen / 2));
    }
    for (const g of ag) this.add(am, g);
    // vomitories (tunnel mouths) in big lower decks
    if (opts.vom && asp) {
      const dark = this.std('vom', { color: '#101317', roughness: 1 }, { cast: false });
      const r0 = Math.floor(rows * 0.45), r1 = r0 + 4;
      for (let s = asp * 1.5, k = 0; s < sm.len - asp; s += asp * 2, k++) {
        const oA = o0 + (o1 - o0) * r0 / rows, oB = o0 + (o1 - o0) * r1 / rows, yA = y0 + (y1 - y0) * r0 / rows, yB = y0 + (y1 - y0) * r1 / rows;
        const a = sm.at(s - 6, 0), b = sm.at(s + 6, 0);
        this.add(dark, this.ribbonGeo([{ p: a.p, n: a.n }, { p: b.p, n: b.n }], [[oA, yA + 0.15], [oB, yB + 0.15]], 10));
        this.add(dark, this.ribbonGeo([{ p: a.p, n: a.n }, { p: b.p, n: b.n }], [[oA, yA + 0.15], [oA, yA + 3.2]], 10));
        (opts.skip = opts.skip || []).push([s - 6.5, s + 6.5, r0 - 0.5, r1 + 0.5]);
      }
    }
    // crowd seats
    for (let r = 0; r < rows; r++) {
      const t = (r + 0.55) / rows, o = o0 + (o1 - o0) * t, y = y0 + (y1 - y0) * t;
      const sh = opts.shadeFn ? opts.shadeFn(o, y) : 1;
      for (let s = 1 + (r & 1) * step * 0.5; s < sm.len - 1; s += step) {
        if (asp) { const m = ((s % asp) + asp) % asp; if (Math.abs(m - asp / 2) < 2.4) continue; }
        if (opts.skip && opts.skip.some(([a, b, ra, rb]) => s > a && s < b && r > ra && r < rb)) continue;
        const q = sm.at(s, o);
        this.seats.push(q.p.x, y + 0.15, q.p.z, dens, sh);
      }
    }
  }
  // ---------- seating bowl around foul ground ----------
  buildStands() {
    const F = this.front, big = this.big;
    const fac = this.facadeMat(), conc = this.concrete();
    const padC = this.pk.wall;
    // padded wall in front of the seats (with logo ads every few sections)
    const fw = this.mat('frontwall', () => {
      const cv = canvas(1024, 64); const t = tex(cv, true, true);
      const draw = () => {
        const x = cv.getContext('2d'); x.fillStyle = padC; x.fillRect(0, 0, 1024, 64);
        x.fillStyle = 'rgba(0,0,0,.2)'; for (let i = 0; i < 1024; i += 51) x.fillRect(i, 0, 2, 64);
        x.fillStyle = this.team.c1; x.fillRect(380, 8, 264, 48); drawFit(x, this.logoSrc(), 420, 32, 44, 44);
        x.font = `900 italic 34px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = lumOf(this.team.c1) > 0.6 ? '#111' : '#fff'; x.fillText(this.team.name.toUpperCase(), 540, 34);
        x.fillStyle = '#f2c81e'; x.fillRect(0, 0, 1024, 3);
        t.needsUpdate = true;
      };
      draw(); this.redraws.push(draw);
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }); m.userData.cast = true; return m;
    });
    this.rib(F, [[0, 0], [0, 4.6]], fw, -80);
    this.rib(F, [[0, 4.6], [1.6, 4.6]], conc, 20);
    let contour;
    if (!big) {
      this.rake(F, 1.6, 4.8, 46, 21, { density: 0.8 });
      this.rib(F, [[46, 21], [46, 30]], fac, 30);
      this.rib(F, [[49, 0], [49, 30], [46, 30]], this.shellMat(), -60, 33);
      this.rib(F, [[40, 31], [54, 33]], this.std('canopy', { color: '#e7e7e2', roughness: 0.7 }), 20);
      contour = [[0, 0], [0, 4.6], [1.6, 4.6], [46, 21], [46, 30], [49, 30], [49, 0]];
      this.standTop = 33;
    } else {
      const shadeLow = (o, y) => (o > 60 ? 0.62 : 1);
      // lower bowl
      this.rake(F, 1.6, 4.8, 66, 31, { density: 0.95, shadeFn: shadeLow });
      this.rib(F, [[66, 31], [68, 31], [68, 33.5]], conc, 20);
      // suites level
      this.rib(F, [[68, 33.5], [68, 44.5]], this.suiteMat(), 32);
      this.rib(F, [[68, 44.5], [62, 44.5]], this.std('soffit', { color: '#3a3d43', roughness: 1 }), 20);
      // upper deck: facade with the LED ribbon, then the seats
      this.rib(F, [[62, 44.5], [62, 47.5]], fac, 30, 4);
      this.rib(F, [[61.9, 47.5], [61.9, 51.5]], this.ribbonMat(), -240);
      this.rib(F, [[62, 51.5], [62, 52.5], [64, 52.5]], fac, 30, 4);
      this.rake(F, 64, 52.8, 134, 101, { density: 0.86, aisle: 30, shadeFn: (o) => (o > 118 ? 0.7 : 1) });
      // underside of the upper deck
      this.rib(F, [[62, 44.6], [134, 97]], this.std('soffit2', { color: '#4a4c51', roughness: 1 }), 30);
      // back wall + roof canopy
      this.rib(F, [[134, 101], [134, 112]], fac, 30, 11);
      const canopy = this.std('canopy', { color: '#ecebe6', roughness: 0.7 });
      this.rib(F, [[110, 114], [150, 118]], canopy, 20);
      this.rib(F, [[110, 112], [110, 114.2]], this.feats.includes('frieze') ? this.friezeMat() : canopy, 12);
      if (this.feats.includes('frieze')) this.rib(F, [[110, 104], [110, 112]], this.friezeMat(), 12);
      // outer shell
      this.rib(F, [[150, 0], [150, 117], [134, 112]], this.shellMat(), -60, 134);
      contour = [[0, 0], [0, 4.6], [1.6, 4.6], [66, 31], [68, 33.5], [68, 44.5], [62, 44.5], [62, 52.5], [64, 52.5], [134, 101], [134, 112], [150, 117], [150, 0]];
      this.standTop = 118;
    }
    this.cap(F[0], contour, fac); this.cap(F[F.length - 1], contour, fac);
    // backstop netting (extended to the far ends of the dugouts)
    const netM = this.mat('net', () => {
      const cv = canvas(64, 64), x = cv.getContext('2d'); x.clearRect(0, 0, 64, 64); x.strokeStyle = 'rgba(30,30,30,.9)'; x.lineWidth = 2;
      x.beginPath(); for (let i = 0; i <= 64; i += 16) { x.moveTo(i, 0); x.lineTo(i, 64); x.moveTo(0, i); x.lineTo(64, i); } x.stroke();
      const t = tex(cv, true, true); const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, color: '#202020' }); m.userData.cast = false; m.userData.recv = false; m.userData.order = 3; return m;
    });
    const netF = F.filter(f => f.side === 0 || f.t < 150);
    this.rib(netF, [[0.3, 4.6], [0.3, 30]], netM, 1.4, 1.4);
    // net cables on top
    this.rib(netF, [[0.3, 29.8], [0.3, 30.2]], this.std('cable', { color: '#222' }, { cast: false }), 20);
    // dugouts on each side
    for (const s of [-1, 1]) this.dugout(s);
  }
  friezeMat() {
    return this.mat('frieze', () => {
      const cv = canvas(256, 128), x = cv.getContext('2d');
      x.clearRect(0, 0, 256, 128); x.fillStyle = '#f2f1ec'; x.fillRect(0, 0, 256, 20);
      x.strokeStyle = '#f2f1ec'; x.lineWidth = 7;
      for (let i = 0; i < 256; i += 32) { x.beginPath(); x.arc(i + 16, 20, 16, 0, Math.PI); x.stroke(); x.fillRect(i - 2, 0, 5, 128); }
      const t = tex(cv, true, true); const m = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, roughness: 0.6, side: THREE.DoubleSide }); m.userData.cast = true; return m;
    });
  }
  dugout(s) {
    const T = this.team, f = this.foulOff, d = dirOf(s * 45 * D2R), n = new THREE.Vector3(s * 0.7071, 0, 0.7071);
    const t0 = 55, t1 = 118, len = t1 - t0, mid = (t0 + t1) / 2;
    const c = d.clone().multiplyScalar(mid).addScaledVector(n, f - 4.2);
    const ry = Math.atan2(-d.z, d.x); // local x along the line
    const dark = this.std('dugin', { color: '#121418', roughness: 1 }, { cast: false });
    const roofM = this.mat('dugroof', () => {
      const cv = canvas(512, 64), x = cv.getContext('2d'), t = tex(cv);
      const draw = () => { x.fillStyle = T.c1; x.fillRect(0, 0, 512, 64); x.font = `900 italic 40px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = lumOf(T.c1) > 0.6 ? '#111' : '#fff'; x.fillText(T.name.toUpperCase(), 300, 34); drawFit(x, this.logoSrc(), 120, 32, 54, 54); t.needsUpdate = true; };
      draw(); this.redraws.push(draw);
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, side: THREE.DoubleSide }); m.userData.cast = true; return m;
    });
    const sideM = this.std('dugside', { color: shade(this.pk.wall, 0.9), roughness: 0.9 });
    // interior (dark), back wall + bench shadow
    this.add(dark, placed(new THREE.BoxGeometry(len, 4.4, 8.2), c.x, 2.0, c.z, ry));
    // roof slab
    const roof = new THREE.BoxGeometry(len + 1.5, 0.6, 9.4); placed(roof, c.x, 4.6, c.z, ry); this.add(roofM, roof);
    // side walls
    for (const e of [-1, 1]) { const p = c.clone().addScaledVector(d, e * len / 2); this.add(sideM, placed(new THREE.BoxGeometry(0.8, 4.4, 8.6), p.x, 2.1, p.z, ry)); }
    // top step lip + railing across the opening
    const front = c.clone().addScaledVector(n, -4.3);
    this.add(this.concrete(), placed(new THREE.BoxGeometry(len, 0.5, 0.9), front.x, 0.25, front.z, ry));
    const rail = this.std('rail', { color: '#9aa0a6', metalness: 0.6, roughness: 0.35 }, { cast: false });
    this.add(rail, placed(new THREE.CylinderGeometry(0.09, 0.09, len, 6), front.x, 2.6, front.z, ry, 0, Math.PI / 2));
    for (let k = 0; k <= 8; k++) { const p = front.clone().addScaledVector(d, (k / 8 - 0.5) * len); this.add(rail, placed(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5), p.x, 1.3, p.z, 0)); }
    // on-field camera well / photo pit edge = small dark slot near home end
    (this.dugouts = this.dugouts || []).push({ c, n, d });
  }
  // ---------- outfield seating, batter's eye, bullpen ----------
  buildOutfield() {
    const pk = this.pk, big = this.big, f = this.feats;
    const eyeA = Math.atan2(48, this.wallR(0));
    // front points: corner L (pole -> stands), wall, corner R
    const pts = [];
    const corner = (s, rev) => {
      const phi = s * 45 * D2R, base = dirOf(phi).multiplyScalar(this.wallR(phi) + 1.6), n = new THREE.Vector3(s * 0.7071, 0, 0.7071), h = this.wallH(phi);
      const arr = [], ks = []; for (let k = this.foulOff + 2; k > 3; k -= 8) ks.push(k); ks.push(0); for (const k of ks) arr.push({ p: base.clone().addScaledVector(n, k), n: dirOf(phi), phi, h, zone: 'c' });
      return rev ? arr.reverse() : arr;
    };
    pts.push(...corner(-1, false));
    const stp = this.fast ? 3 : 2;
    for (let a = -45 + stp; a <= 45 - stp + 0.01; a += stp) {
      const phi = a * D2R; const zone = Math.abs(phi) < eyeA ? 'eye' : (this.pen && a >= this.pen[0] && a <= this.pen[1]) ? 'pen' : this.pools.some(([p0, p1]) => a >= p0 && a <= p1) ? 'pool' : 'o';
      pts.push({ p: dirOf(phi).multiplyScalar(this.wallR(phi) + 1.6), n: dirOf(phi), phi, h: this.wallH(phi), zone });
    }
    pts.push(...corner(1, true));
    // split into zone runs (sharing boundary points so there are no cracks)
    const runs = []; let cur = null;
    for (const p of pts) {
      const z = p.zone === 'c' ? 'o' : p.zone;
      if (!cur || cur.zone !== z) { if (cur) cur.pts.push(p); cur = { zone: z, pts: cur ? [cur.pts[cur.pts.length - 1]] : [] }; runs.push(cur); }
      cur.pts.push(p);
    }
    const seat = this.seatMat(), fac = this.facadeMat(), shell = this.shellMat();
    const faceM = this.std('offace', { color: shade(pk.wall, 0.8), roughness: 0.9 });
    const D = big ? 64 : 40, slope = 0.42;
    this.ofTop = 0;
    for (const run of runs) {
      if (run.pts.length < 2) continue;
      const h0 = Math.max(...run.pts.map(p => p.h)), hb = h0 + 1.5;
      if (run.zone === 'eye') {
        // batter's eye: dark hedge wall the full width of the gap
        const hE = this.wallH(0) + 30;
        const eyeM = this.mat('eye', () => {
          const cv = canvas(128, 128), x = cv.getContext('2d'), r = rng(31); x.fillStyle = '#0f2416'; x.fillRect(0, 0, 128, 128);
          for (let i = 0; i < 900; i++) { x.fillStyle = ['#13301c', '#0c1e12', '#1a3a22'][r() * 3 | 0]; x.beginPath(); x.arc(r() * 128, r() * 128, 1 + r() * 3, 0, 7); x.fill(); }
          const t = tex(cv, true, true); const m = new THREE.MeshStandardMaterial({ map: t, roughness: 1, side: THREE.DoubleSide }); m.userData.cast = true; return m;
        });
        this.rib(run.pts, [[0, 0], [0, hE], [24, hE], [24, 0]], eyeM, 12, 12);
        this.cap(run.pts[0], [[0, 0], [0, hE], [24, hE], [24, 0]], eyeM); this.cap(run.pts[run.pts.length - 1], [[0, 0], [0, hE], [24, hE], [24, 0]], eyeM);
        // seats above / behind the eye in big parks
        if (big) { const ty = hE + 2; this.rib(run.pts, [[24, ty - 2], [24, ty], [26, ty]], fac, 20); this.rake(run.pts, 26, ty, 26 + D * 0.6, ty + D * 0.6 * slope, { density: 0.7, aisle: 0 }); this.rib(run.pts, [[26 + D * 0.6, ty + D * 0.6 * slope], [26 + D * 0.6, ty + D * 0.6 * slope + 8]], fac, 30, 8); this.rib(run.pts, [[28 + D * 0.6, 0], [28 + D * 0.6, ty + D * 0.6 * slope + 8], [26 + D * 0.6, ty + D * 0.6 * slope + 8]], shell, 60, ty + D * 0.6 * slope + 10); this.ofTop = Math.max(this.ofTop, ty + D * 0.6 * slope + 8); }
        continue;
      }
      if (f.includes('splash') && run.pts[0].phi > 15 * D2R) {
        // McCovey Cove side: brick arcade wall only, water beyond
        this.rib(run.pts, [[0, 0], [0, h0 + 3], [8, h0 + 3], [8, 0]], this.std('brickarc', { color: '#7b3a29', roughness: 0.95 }), 20);
        continue;
      }
      const o0 = run.zone === 'pen' ? 42 : run.zone === 'pool' ? 54 : 0;
      if (run.zone === 'pen') this.bullpen(run);
      if (f.includes('berm')) {
        this.rib(run.pts, [[o0, 0], [o0, h0], [o0 + 50, h0 + 14], [o0 + 60, h0 + 14]], this.std('berm', { color: '#3f7a3a', roughness: 1 }), 20);
        this.rake(run.pts, o0 + 3, h0 + 1, o0 + 46, h0 + 13, { density: 0.35, aisle: 0 });
        continue;
      }
      const top = hb + D * slope;
      const prof = [[o0, 0], [o0, hb], [o0 + 2, hb]];
      this.rib(run.pts, prof, faceM, 20);
      this.rake(run.pts, o0 + 2, hb + 0.2, o0 + D, top, { density: 0.86, aisle: 28 });
      this.rib(run.pts, [[o0 + D, top], [o0 + D, top + 6]], fac, 30, 6);
      this.rib(run.pts, [[o0 + D - 0.1, top + 6], [o0 + D - 0.1, top + 9]], this.ribbonMat(), 240);
      this.rib(run.pts, [[o0 + D + 2, 0], [o0 + D + 2, top + 9], [o0 + D, top + 9]], shell, 60, top + 11);
      const contour = [[o0, 0], [o0, hb], [o0 + 2, hb], [o0 + D, top], [o0 + D, top + 9], [o0 + D + 2, top + 9], [o0 + D + 2, 0]];
      this.cap(run.pts[0], contour, fac); this.cap(run.pts[run.pts.length - 1], contour, fac);
      this.ofTop = Math.max(this.ofTop, top + 9);
    }
    this.ofD = D;
  }
  bullpen(run) {
    // two mounds + plates on grass, a chain-link fence on top of the outfield wall
    const mid = run.pts[Math.floor(run.pts.length / 2)], n = mid.n, tng = new THREE.Vector3(-n.z, 0, n.x);
    const dm = this.std('pendirt', { color: '#a8714a', roughness: 1 }, { cast: false });
    for (const k of [-1, 1]) {
      const c = mid.p.clone().addScaledVector(n, 31).addScaledVector(tng, k * 14), c2 = mid.p.clone().addScaledVector(n, 20).addScaledVector(tng, k * 14);
      const mg = new THREE.CylinderGeometry(3.5, 6.5, 0.8, 18); placed(mg, c.x, 0.4, c.z); this.add(dm, mg);
      const lane = new THREE.PlaneGeometry(5, 32).rotateX(-Math.PI / 2); placed(lane, c2.x, 0.06, c2.z, Math.atan2(n.x, n.z)); this.add(dm, lane);
    }
    // fence above the wall
    const fenceM = this.mat('fence', () => {
      const cv = canvas(32, 32), x = cv.getContext('2d'); x.strokeStyle = 'rgba(40,44,48,.95)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(32, 32); x.moveTo(32, 0); x.lineTo(0, 32); x.stroke();
      const t = tex(cv, true, true); const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, color: '#333' }); m.userData.cast = false; m.userData.recv = false; m.userData.order = 3; return m;
    });
    const fr = run.pts.map(p => ({ p: p.p.clone().addScaledVector(p.n, -1.0), n: p.n }));
    const h = Math.max(...run.pts.map(p => p.h));
    this.rib(fr, [[0, h], [0, h + 6]], fenceM, 1, 1);
  }
  // ---------- lights ----------
  bankMat() {
    return this.mat('bank', () => {
      const cv = canvas(128, 64), x = cv.getContext('2d');
      x.fillStyle = '#1a1c20'; x.fillRect(0, 0, 128, 64);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) { const g = x.createRadialGradient(i * 16 + 8, j * 16 + 8, 0, i * 16 + 8, j * 16 + 8, 7); g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#e8eef8'); g.addColorStop(1, '#5c6066'); x.fillStyle = g; x.beginPath(); x.arc(i * 16 + 8, j * 16 + 8, 6.5, 0, 7); x.fill(); }
      const m = new THREE.MeshBasicMaterial({ map: tex(cv), toneMapped: false, side: THREE.DoubleSide, color: '#bdbdbd' }); m.userData.cast = false; return m;
    });
  }
  lightBank(p, y, w = 34, h = 13, target = null) {
    const tgt = target || new THREE.Vector3(0, 0, -150);
    const ry = yawTo(p.x, p.z, tgt.x, tgt.z), dist = Math.hypot(tgt.x - p.x, tgt.z - p.z), rx = Math.atan2(y - 10, dist) * 0.7;
    const panel = new THREE.PlaneGeometry(w, h); placed(panel, p.x, y, p.z, ry, rx); this.add(this.bankMat(), panel);
    const back = new THREE.BoxGeometry(w + 1.5, h + 1.5, 1.2); _o.position.set(p.x, y, p.z); _o.rotation.set(rx, ry, 0, 'YXZ'); _o.updateMatrix(); back.translate(0, 0, -0.75); back.applyMatrix4(_o.matrix); this.add(this.std('bankback', { color: '#8b9097', metalness: 0.4, roughness: 0.55 }, { cast: false }), back);
    this.lightPts.push(new THREE.Vector3(p.x, y, p.z).addScaledVector(new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)), 2));
  }
  tower(p, h) {
    const st = this.std('steel', { color: '#5d6168', metalness: 0.5, roughness: 0.5 });
    this.add(st, placed(new THREE.CylinderGeometry(1.2, 2, h, 8), p.x, h / 2, p.z));
    this.lightBank(p, h + 6, 30, 14);
  }
  buildLights() {
    if (this.closed) return; // roof lights are built with the roof
    if (this.big) {
      const F = this.front, sm = sampler(F);
      for (const u of [0.1, 0.26, 0.42, 0.58, 0.74, 0.9]) { const q = sm.at(sm.len * u, 126); this.lightBank(q.p, 127, 40, 12); }
      // canopy struts
      const st = this.std('steel', { color: '#5d6168', metalness: 0.5, roughness: 0.5 });
      for (const u of [0.1, 0.26, 0.42, 0.58, 0.74, 0.9]) { const q = sm.at(sm.len * u, 130); this.add(st, placed(new THREE.BoxGeometry(2, 14, 2), q.p.x, 121, q.p.z)); }
      for (const s of [-1, 1]) { const phi = s * 36 * D2R, p = dirOf(phi).multiplyScalar(this.wallR(phi) + 1.6 + this.ofD + 4); this.tower(p, Math.max(110, this.ofTop + 60)); }
    } else {
      const F = this.front, sm = sampler(F);
      for (const u of [0.08, 0.3, 0.7, 0.92]) { const q = sm.at(sm.len * u, 58); this.tower(q.p, 95); }
      for (const s of [-1, 1]) { const phi = s * 30 * D2R, p = dirOf(phi).multiplyScalar(this.wallR(phi) + 60); this.tower(p, 100); }
    }
  }
  buildPoles() {
    const ym = new THREE.MeshStandardMaterial({ color: '#f2d22e', roughness: 0.5, emissive: '#3a3000' });
    const finM = new THREE.MeshStandardMaterial({ color: '#f2d22e', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    for (const s of [-1, 1]) {
      const phi = s * 45 * D2R, r = this.wallR(phi), h = this.wallH(phi), p = dirOf(phi).multiplyScalar(r + 0.5), top = h + 62;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, top, 10), ym); pole.position.set(p.x, top / 2, p.z); pole.castShadow = true; this.group.add(pole);
      // screen on the fair side
      const fairDir = dirOf(phi - s * Math.PI / 2);
      const fin = new THREE.Mesh(new THREE.PlaneGeometry(2.6, top - h - 4), finM);
      fin.position.set(p.x + fairDir.x * 1.4, h + (top - h) / 2 + 1, p.z + fairDir.z * 1.4); fin.rotation.y = Math.atan2(dirOf(phi).x, dirOf(phi).z); this.group.add(fin);
    }
  }
  // ---------- landmarks / surroundings ----------
  buildExtras() {
    const f = this.feats, g = this.group, r = this.R;
    const water = (x0, z0, w, d, color = '#2b5f86', rot = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0.4 })); m.position.set(x0, 0.2, z0); m.rotation.y = rot; g.add(m); return m; };
    if (f.includes('splash')) { const p = dirOf(50 * D2R).multiplyScalar(700); water(p.x, p.z, 900, 1400, '#2d5f80', -0.5).position.y = -0.25; }
    if (f.includes('river')) { const p = dirOf(25 * D2R).multiplyScalar(680); water(p.x, p.z - 120, 2400, 380, '#3a5f72', -0.3).position.y = -0.25; }
    if (f.includes('fountains') || f.includes('fountain')) {
      this.fountains = [];
      const jetM = new THREE.MeshBasicMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.6, depthWrite: false });
      for (const s of f.includes('fountains') ? [-1, 1] : [-1]) {
        for (let a = 21; a <= 35; a += 2) { const phi = s * a * D2R, q = dirOf(phi).multiplyScalar(this.wallR(phi) + 28); const jet = new THREE.Mesh(new THREE.ConeGeometry(1.4, 22, 8, 1, true), jetM); jet.geometry.translate(0, 11, 0); jet.position.set(q.x, 0.3, q.z); g.add(jet); this.fountains.push(jet); }
      }
    }
    // trees (merged)
    const trunkM = this.std('trunk', { color: '#6b4a2e' }), pineM = this.std('pine', { color: '#24502a', roughness: 1 }), palmM = this.std('palm', { color: '#3b7a32', roughness: 1 });
    const tree = (x, z, kind) => {
      if (kind === 'palm') {
        this.add(trunkM, placed(new THREE.CylinderGeometry(0.8, 1.3, 50, 6), x, 25, z));
        for (let k = 0; k < 7; k++) { const fr = new THREE.ConeGeometry(2.2, 18, 4); fr.rotateZ(Math.PI / 2.4); fr.translate(9, 0, 0); placed(fr, x, 50, z, k / 7 * Math.PI * 2); this.add(palmM, fr); }
      } else {
        this.add(trunkM, placed(new THREE.CylinderGeometry(0.8, 1.2, 10, 6), x, 5, z));
        for (let k = 0; k < 3; k++) this.add(pineM, placed(new THREE.ConeGeometry(11 - k * 3, 16, 8), x, 14 + k * 9, z));
      }
    };
    if (f.includes('palms') || f.includes('pines') || f.includes('hills') || f.includes('rockpile')) {
      for (let i = 0; i < (this.fast ? 16 : 30); i++) { const phi = (-60 + r() * 120) * D2R, d = this.wallR(Math.max(-45 * D2R, Math.min(45 * D2R, phi))) + 120 + r() * 160; const p = dirOf(phi).multiplyScalar(d); tree(p.x, p.z, f.includes('palms') ? 'palm' : 'pine'); }
    }
    if (f.includes('hills')) { const hm = this.std('hill', { color: '#58763f', roughness: 1 }, { cast: false }); for (let i = 0; i < 5; i++) { const h = new THREE.SphereGeometry(300, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); h.scale(1, 0.5, 1); const p = dirOf((-60 + i * 30) * D2R).multiplyScalar(950); placed(h, p.x, -150, p.z); this.add(hm, h); } }
    if (f.includes('rocks') || f.includes('rockpile')) { const rm = this.std('rock', { color: '#8a7f73', roughness: 1 }); for (let i = 0; i < 9; i++) { const phi = (-8 + i * 2) * D2R, p = dirOf(phi).multiplyScalar(this.wallR(phi) + 10 + r() * 10); const rk = new THREE.DodecahedronGeometry(6 + r() * 7, 0); placed(rk, p.x, 4, p.z, r() * 3); this.add(rm, rk); } }
    // skyline (most parks are downtown)
    const urban = !['berm', 'hills'].some(k => f.includes(k)) && !this.closed;
    if (urban) {
      const mats = ['#7d858f', '#626a74', '#959aa0', '#76695e'].map((c, i) => this.mat('bld' + i, () => {
        const cv = canvas(128, 256), em = canvas(128, 256), x = cv.getContext('2d'), e = em.getContext('2d'), rr = rng(40 + i);
        x.fillStyle = c; x.fillRect(0, 0, 128, 256); e.fillStyle = '#000'; e.fillRect(0, 0, 128, 256);
        for (let j = 0; j < 32; j++) for (let k = 0; k < 8; k++) { x.fillStyle = rr() < 0.5 ? '#3c4a5a' : '#4d5d6e'; x.fillRect(k * 16 + 3, j * 8 + 2, 10, 5); if (rr() < 0.22) { e.fillStyle = rr() < 0.6 ? '#c9a46a' : '#d8cdb8'; e.fillRect(k * 16 + 3, j * 8 + 2, 10, 5); } }
        const t = tex(cv, true, true), te = tex(em, true, true);
        const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: te, emissiveIntensity: 0, roughness: 0.75 }); m.userData.cast = false; m.userData.night = 0.8; m.userData.dusk = 0.25; return m;
      }));
      this.buildingMats = mats;
      const n = this.fast ? 30 : 54;
      for (let i = 0; i < n; i++) {
        const phi = (-75 + r() * 150) * D2R, d = 950 + r() * 800, p = dirOf(phi).multiplyScalar(d);
        const h = 70 + r() * r() * (f.includes('skyline') ? 480 : 260), w = 50 + r() * 70, dp = w * (0.6 + r() * 0.6);
        const bg = new THREE.BoxGeometry(w, h, dp);
        const uvA = bg.attributes.uv; for (let k = 0; k < uvA.count; k++) uvA.setXY(k, uvA.getX(k) * w / 60, uvA.getY(k) * h / 60);
        placed(bg, p.x, h / 2 - 1, p.z, yawTo(p.x, p.z, 0, -150)); this.add(mats[i % 4], bg);
        if (r() < 0.3) this.add(mats[(i + 1) % 4], placed(new THREE.BoxGeometry(w * 0.5, h * 0.35, dp * 0.5), p.x, h + h * 0.175 - 1, p.z, yawTo(p.x, p.z, 0, -150)));
      }
    }
    const metal = this.std('metal', { color: '#cfd3d8', metalness: 0.7, roughness: 0.3 });
    if (f.includes('cntower')) { const p = dirOf(-30 * D2R).multiplyScalar(1300); this.add(metal, placed(new THREE.CylinderGeometry(5, 16, 1150, 10), p.x, 575, p.z)); this.add(metal, placed(new THREE.SphereGeometry(42, 14, 8).scale(1, 0.5, 1), p.x, 790, p.z)); this.add(metal, placed(new THREE.CylinderGeometry(1.5, 4, 300, 6), p.x, 1300, p.z)); }
    if (f.includes('arch')) { const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI; pts.push(new THREE.Vector3(Math.cos(t) * 170, Math.sin(t) * 600, 0)); } const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 9, 6); const p = dirOf(-8 * D2R).multiplyScalar(1600); placed(tg, p.x, 0, p.z); this.add(metal, tg); }
    if (f.includes('warehouse')) { const wm = this.mat('warehouse', () => { const cv = canvas(256, 128), x = cv.getContext('2d'); x.fillStyle = '#7a3b26'; x.fillRect(0, 0, 256, 128); for (let j = 0; j < 8; j++) for (let k = 0; k < 16; k++) { x.fillStyle = '#2a1d18'; x.fillRect(k * 16 + 4, j * 16 + 4, 8, 9); } const t = tex(cv, true, true); const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); m.userData.cast = true; return m; }); const bw = new THREE.BoxGeometry(40, 100, 1000); const uvA = bw.attributes.uv; for (let k = 0; k < uvA.count; k++) uvA.setXY(k, uvA.getX(k) * 12, uvA.getY(k) * 3); const p = dirOf(45 * D2R).multiplyScalar(this.wallR(45 * D2R) + 150); placed(bw, p.x + 60, 50, p.z - 150, -0.6); this.add(wm, bw); }
    if (f.includes('rooftops')) { for (let i = 0; i < 12; i++) { const s = i < 6 ? -1 : 1, k = i % 6, phi = s * (20 + k * 6) * D2R, p = dirOf(phi).multiplyScalar(this.wallR(phi) + 110); const bm = this.std('roof' + (k % 3), { color: ['#8a4b37', '#a8865e', '#6d6f73'][k % 3] }); this.add(bm, placed(new THREE.BoxGeometry(45, 45, 40), p.x, 22.5, p.z, yawTo(p.x, p.z, 0, 0))); this.add(this.seatMat(), placed(new THREE.BoxGeometry(40, 6, 30).translate(0, 0, 0), p.x, 48, p.z, yawTo(p.x, p.z, 0, 0), 0.25)); } }
    if (f.includes('apple')) { const p = dirOf(0).multiplyScalar(this.wallR(0) + 30); this.add(this.std('hat', { color: '#111' }), placed(new THREE.CylinderGeometry(14, 16, 12, 18), p.x, this.wallH(0) + 36, p.z)); this.add(this.std('apple', { color: '#c8102e', roughness: 0.3 }), placed(new THREE.SphereGeometry(9, 18, 12), p.x, this.wallH(0) + 49, p.z)); }
    if (f.includes('halo')) { const p = dirOf(-30 * D2R).multiplyScalar(1100); this.add(metal, placed(new THREE.CylinderGeometry(1.5, 1.5, 230, 6), p.x, 115, p.z)); this.add(this.std('halo', { color: '#f2c14e', emissive: '#a07000' }), placed(new THREE.TorusGeometry(26, 2.6, 6, 30), p.x, 235, p.z, 0, Math.PI / 2)); }
    if (f.includes('bell')) { const p = dirOf(40 * D2R).multiplyScalar(this.wallR(40 * D2R) + 95); this.add(this.std('bellc', { color: '#f2c14e', emissive: '#6a4a00' }), placed(new THREE.CylinderGeometry(8, 16, 26, 16, 1, true), p.x, 118, p.z)); }
    if (f.includes('riverboat')) { const p = dirOf(-15 * D2R).multiplyScalar(this.wallR(-15 * D2R) + 40); for (const k of [-1, 1]) this.add(this.std('stack', { color: '#222' }), placed(new THREE.CylinderGeometry(4, 4, 46, 10), p.x + k * 18, 40, p.z)); }
    if (f.includes('train')) { const phi = -38 * D2R, p = dirOf(phi).multiplyScalar(this.wallR(phi) + 6); this.add(this.std('train', { color: '#3a3d45' }), placed(new THREE.BoxGeometry(14, 12, 40), p.x, this.wallH(phi) + 12, p.z, yawTo(p.x, p.z, 0, 0) + Math.PI / 2)); }
    if (f.includes('pool')) { const phi = 20 * D2R, p = dirOf(phi).multiplyScalar(this.wallR(phi) + 18); water(p.x, p.z, 40, 22, '#2fb0d8', yawTo(p.x, p.z, 0, 0)); }
    // roof
    if (this.closed) this.buildRoof();
  }
  buildRoof() {
    const dome = this.pk.roof === 'dome', c = new THREE.Vector3(0, 0, -175), R = 420, y0 = 122, rise = dome ? 150 : 110;
    const roofM = this.mat('roof', () => {
      const cv = canvas(512, 256), x = cv.getContext('2d');
      x.fillStyle = dome ? '#e6e5df' : '#c9ccd1'; x.fillRect(0, 0, 512, 256);
      x.strokeStyle = 'rgba(70,75,85,.55)'; x.lineWidth = 3; for (let i = 0; i <= 512; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); }
      x.lineWidth = 2; for (let j = 0; j <= 256; j += 32) { x.beginPath(); x.moveTo(0, j); x.lineTo(512, j); x.stroke(); }
      const t = tex(cv, true, true); t.repeat.set(4, 1);
      // BackSide: the roof is seen from inside the park, and is see-through from the flyover outside
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, side: THREE.BackSide, emissive: '#ffffff', emissiveIntensity: 0.12, emissiveMap: t }); m.userData.cast = false; m.userData.recv = false; return m;
    });
    const prof = []; for (let i = 0; i <= 14; i++) { const a = i / 14; prof.push(new THREE.Vector2(Math.max(0.01, R * Math.cos(a * Math.PI / 2)), y0 + rise * Math.sin(a * Math.PI / 2))); }
    const rg = new THREE.LatheGeometry(prof, 48); rg.translate(c.x, 0, c.z); if (dome) rg.rotateX(0.03); this.add(roofM, rg);
    // enclosure skirt with windows down to the ground
    const skirt = new THREE.CylinderGeometry(R, R, y0 + 2, 48, 1, true); skirt.translate(c.x, (y0 + 2) / 2 - 1, c.z);
    this.add(this.std('domewall', { color: '#2b3038', roughness: 0.9, side: THREE.BackSide }, { cast: false }), skirt);
    // LED ring around the inside of the enclosure
    const ring = new THREE.CylinderGeometry(R - 2, R - 2, 7, 64, 1, true); ring.translate(c.x, 70, c.z);
    { const uvA = ring.attributes.uv; for (let k = 0; k < uvA.count; k++) uvA.setXY(k, -uvA.getX(k) * 11, uvA.getY(k)); }
    this.add(this.ribbonMat(), ring);
    // trusses + catwalk rings
    const st = this.std('steel', { color: '#5d6168', metalness: 0.5, roughness: 0.5 });
    for (let i = 0; i < (dome ? 5 : 3); i++) { const rr = R * (0.35 + i * 0.13), y = y0 + rise * Math.sin(Math.acos(rr / R)) - 6; this.add(st, placed(new THREE.TorusGeometry(rr, 1.1, 4, 64), c.x, y, c.z, 0, Math.PI / 2)); }
    // roof light rings
    const F = this.front, sm = sampler(F);
    for (const u of [0.12, 0.3, 0.5, 0.7, 0.88]) { const q = sm.at(sm.len * u, 70); this.lightBank(q.p, y0 + 14, 38, 11); }
    for (const s of [-1, 1]) { const phi = s * 25 * D2R, p = dirOf(phi).multiplyScalar(this.wallR(phi) + 40); this.lightBank(p, y0 + 20, 38, 11, new THREE.Vector3(0, 0, -60)); }
  }
  // ---------- video boards ----------
  buildBoard() {
    const big = this.big;
    const side = ['NYY', 'BOS', 'CHC', 'KC', 'ATL'].includes(this.id) ? (this.id === 'KC' ? 0 : -1) : 1;
    const phi = side * 22 * D2R, d = this.wallR(phi) + 1.6 + (this.ofD || 40) + 6;
    const cv = canvas(1024, 512); this.boardCanvas = cv;
    const t = tex(cv); this.boardTex = t;
    const w = big ? 150 : 100, h = w / 2;
    const p = dirOf(phi).multiplyScalar(d);
    const y = Math.max(this.ofTop || 40, this.wallTop + 30) + 8 + h / 2;
    const ry = yawTo(p.x, p.z, 0, 20);
    const st = this.std('steel', { color: '#2a2f36', metalness: 0.4, roughness: 0.6 });
    this.add(st, placed(new THREE.BoxGeometry(w + 6, h + 6, 4), p.x, y, p.z, ry));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    scr.position.set(p.x, y, p.z); scr.rotation.y = ry; scr.translateZ(2.2); this.group.add(scr);
    for (const k of [-1, 1]) { const q = p.clone().addScaledVector(new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry)), k * w * 0.32); this.add(st, placed(new THREE.BoxGeometry(5, y - h / 2, 5), q.x, (y - h / 2) / 2, q.z, ry)); }
    // crown with the club logo + name on top of the board
    const cc = canvas(512, 128), ct = tex(cc);
    const drawCrown = () => { const x = cc.getContext('2d'), T = this.team; x.clearRect(0, 0, 512, 128); x.fillStyle = T.c1; x.fillRect(0, 10, 512, 108); x.fillStyle = T.c2; x.fillRect(0, 10, 512, 6); x.fillRect(0, 112, 512, 6); drawFit(x, this.logoSrc(), 80, 64, 100, 96); x.font = `900 italic 64px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = lumOf(T.c1) > 0.6 ? '#111' : '#fff'; const s = T.name.toUpperCase(), mw = x.measureText(s).width; x.save(); x.translate(310, 68); if (mw > 360) x.scale(360 / mw, 1); x.fillText(s, 0, 0); x.restore(); ct.needsUpdate = true; };
    drawCrown(); this.redraws.push(drawCrown);
    const crown = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, w * 0.15), new THREE.MeshBasicMaterial({ map: ct, transparent: true, toneMapped: false, color: '#e8e8e8' }));
    crown.position.set(p.x, y + h / 2 + 3 + w * 0.075, p.z); crown.rotation.y = ry; crown.translateZ(1); this.group.add(crown);
    // secondary board (line score style) on the other side
    if (big) {
      const phi2 = (side === 0 ? -1 : -side) * 30 * D2R, d2 = this.wallR(phi2) + 1.6 + (this.ofD || 40) + 4;
      const p2 = dirOf(phi2).multiplyScalar(d2), w2 = 96, h2 = 34, y2 = Math.max(this.ofTop || 40, this.wallTop + 30) + 6 + h2 / 2, ry2 = yawTo(p2.x, p2.z, 0, 20);
      const c2 = canvas(1024, 362), t2 = tex(c2); this.board2 = { cv: c2, t: t2 };
      const draw2 = () => this.drawBoard2();
      draw2(); this.redraws.push(draw2);
      this.add(st, placed(new THREE.BoxGeometry(w2 + 4, h2 + 4, 3), p2.x, y2, p2.z, ry2));
      const s2 = new THREE.Mesh(new THREE.PlaneGeometry(w2, h2), new THREE.MeshBasicMaterial({ map: t2, toneMapped: false })); s2.position.set(p2.x, y2, p2.z); s2.rotation.y = ry2; s2.translateZ(1.7); this.group.add(s2);
      this.add(st, placed(new THREE.BoxGeometry(4, y2 - h2 / 2, 4), p2.x, (y2 - h2 / 2) / 2, p2.z, ry2));
    }
    if (this.feats.includes('scoreboard')) { // Wrigley-style green manual board in center
      const c3 = canvas(512, 192), x = c3.getContext('2d'); x.fillStyle = '#1f4a2c'; x.fillRect(0, 0, 512, 192); x.fillStyle = '#163820';
      for (let r = 0; r < 4; r++) for (let i = 0; i < 12; i++) x.fillRect(40 + i * 38, 30 + r * 36, 30, 28);
      x.fillStyle = '#f4f4ee'; x.font = `800 22px ${FONT}`; x.fillText('NATIONAL LEAGUE', 10, 20);
      x.fillStyle = '#e8e2c8'; x.beginPath(); x.arc(256, 176, 0, 0, 7); x.fill();
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(110, 40), new THREE.MeshStandardMaterial({ map: tex(c3), roughness: 0.9 }));
      const p3 = dirOf(0).multiplyScalar(this.wallR(0) + 60); pl.position.set(p3.x, (this.ofTop || 50) + 26, p3.z); pl.rotation.y = yawTo(p3.x, p3.z, 0, 0); this.group.add(pl);
      this.add(this.std('steel', { color: '#2a2f36', metalness: 0.4, roughness: 0.6 }), placed(new THREE.BoxGeometry(4, (this.ofTop || 50) + 6, 4), p3.x, ((this.ofTop || 50) + 6) / 2, p3.z));
    }
    this.drawBoard({ title: this.pk.name.toUpperCase(), sub: 'WELCOME TO ' + this.pk.city.toUpperCase() });
    this.redraws.push(() => { if (this._lastBoard) this.drawBoard(this._lastBoard); });
  }
  drawBoard2() {
    const { cv, t } = this.board2, x = cv.getContext('2d'), T = this.team, W = cv.width, H = cv.height;
    x.fillStyle = '#05080d'; x.fillRect(0, 0, W, H);
    x.fillStyle = T.c1; x.fillRect(0, 0, W, 70); drawFit(x, this.logoSrc(), 50, 35, 56, 56);
    x.font = `900 italic 46px ${FONT}`; x.fillStyle = lumOf(T.c1) > 0.6 ? '#111' : '#fff'; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText(this.pk.name.toUpperCase(), 100, 37);
    x.font = `800 40px ${FONT}`; x.textAlign = 'center';
    const cols = ['', 1, 2, 3, 4, 5, 6, 7, 8, 9, 'R', 'H', 'E'];
    cols.forEach((c, i) => { x.fillStyle = i > 9 ? '#f2c14e' : '#c8ccd2'; x.fillText(String(c), 150 + i * 66, 110); });
    const rows = this._line || [['AWAY', []], [T.id, []]];
    rows.forEach(([nm, cells], j) => { x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(nm, 24, 180 + j * 70); x.textAlign = 'center'; for (let i = 1; i < cols.length; i++) { x.fillStyle = i > 9 ? '#f2c14e' : '#fff'; x.fillText(cells[i - 1] ?? '', 150 + i * 66, 180 + j * 70); } });
    x.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < W; i += 3) x.fillRect(i, 0, 1, H);
    t.needsUpdate = true;
  }
  drawBoard(info) {
    const x = this.boardCanvas.getContext('2d'), W = 1024, H = 512, T = this.team;
    x.fillStyle = '#05080d'; x.fillRect(0, 0, W, H);
    const gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, T.c1); gr.addColorStop(1, '#05080d'); x.fillStyle = gr; x.globalAlpha = 0.7; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
    const logo = this.logoSrc();
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
    const fit = (s, cx, cy, size, maxW, color, weight = 900) => { x.font = `${weight} italic ${size}px ${FONT}`; x.fillStyle = color; const w = x.measureText(s).width; x.save(); x.translate(cx, cy); if (w > maxW) x.scale(maxW / w, 1); x.fillText(s, 0, 0); x.restore(); };
    if (info.big) { x.globalAlpha = 0.18; drawFit(x, logo, W / 2, H / 2, 480, 480); x.globalAlpha = 1; fit(info.big, W / 2, H * 0.44, 210, 960, '#fff'); fit(info.sub || '', W / 2, H * 0.82, 64, 940, '#f2c14e', 800); }
    else if (info.batter) {
      drawFit(x, logo, W - 120, 110, 170, 170);
      x.textAlign = 'left'; x.font = `800 italic 54px ${FONT}`; x.fillStyle = '#f2c14e'; x.fillText('NOW BATTING  #' + info.num, 50, 80);
      x.save(); x.font = `900 italic 120px ${FONT}`; const s = info.batter.toUpperCase(), mw = x.measureText(s).width; x.translate(50, 200); if (mw > 760) x.scale(760 / mw, 1); x.fillStyle = '#fff'; x.fillText(s, 0, 0); x.restore();
      x.fillStyle = '#fff'; x.font = `800 60px ${FONT}`; x.fillText(info.line || '', 50, 310);
      x.fillStyle = '#ffffffcc'; x.font = `800 54px ${FONT}`; x.fillText(info.score || '', 50, 430);
    } else { drawFit(x, logo, W / 2, H * 0.3, 260, 210); fit(info.title || '', W / 2, H * 0.66, 92, 960, '#fff'); fit(info.sub || '', W / 2, H * 0.84, 48, 940, '#f2c14e', 800); }
    x.fillStyle = 'rgba(0,0,0,.22)'; for (let i = 0; i < W; i += 4) x.fillRect(i, 0, 1, H);
    this._lastBoard = info;
    this.boardTex.needsUpdate = true;
  }
  setTime(time, scene) {
    const night = time === 'night' || this.closed, dusk = time === 'dusk';
    this.time = time;
    const bm = this.M && this.M.bank; if (bm) bm.color.set(night || dusk ? '#ffffff' : '#a9a9a9');
    for (const m of Object.values(this.M || {})) {
      if (m.userData.night != null) m.emissiveIntensity = night && !this.closed ? m.userData.night : dusk ? (m.userData.dusk ?? m.userData.night * 0.4) : (m.userData.day ?? 0);
      if (m.userData.led) m.color.set(night || dusk ? '#ffffff' : '#d8d8d8');
    }
    if (this.closed && this.M && this.M.suites) this.M.suites.emissiveIntensity = 0.6;
    // night: stands don't throw shadows (field is lit from every side)
    for (const m of this.structMeshes || []) m.castShadow = !night;
    // glow halos around the light banks
    if (!this.glows) {
      const cv = canvas(128, 128), x = cv.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.15, 'rgba(255,244,215,.6)'); g.addColorStop(0.5, 'rgba(255,235,200,.12)'); g.addColorStop(1, 'rgba(255,235,200,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      const sm = new THREE.SpriteMaterial({ map: tex(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false });
      this.glows = this.lightPts.map(p => { const s = new THREE.Sprite(sm); s.position.copy(p); s.scale.setScalar(this.closed ? 70 : 120); this.group.add(s); return s; });
      this.glowMat = sm;
    }
    const on = (night && !this.closed) || dusk || this.closed;
    for (const s of this.glows) s.visible = on;
    this.glowMat.opacity = this.closed ? 0.35 : dusk ? 0.6 : 0.9;
  }
  update(dt, t, excite) {
    // crowd.update is called by the game with the camera
    if (this.fountains) for (const [i, j] of this.fountains.entries()) j.scale.y = 0.75 + 0.25 * Math.sin(t * 2.2 + i * 0.7) + excite * 0.8;
  }
}
