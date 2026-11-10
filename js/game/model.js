// MLB Grand Slam 27 - 3D ballplayers (skinned bodies from HUCK), faces, uniforms, gear, animation
import * as THREE from '../lib/three.min.js';
export const SKINS = ['#f3d2b3','#e8bf9a','#d9a77f','#c18a5e','#a8714a','#8a5636','#6e4127','#54301c'];
export const HAIRC = ['#1b1210','#2e1d14','#4a2d1a','#6b4423','#a5753c','#d8b26a','#b04a24','#888888'];
export const SKINMAP = [0, 1, 2, 4, 5, 7];

const matCache = new Map();
export function M(color, rough = 0.7, extra = {}) {
  const k = color + '|' + rough + '|' + JSON.stringify(extra);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  return matCache.get(k);
}
const geoCache = new Map();
const G = (k, f) => { if (!geoCache.has(k)) geoCache.set(k, f()); return geoCache.get(k); };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function shade(hex, f, toward = '#000000') { const c = new THREE.Color(hex), d = new THREE.Color(toward); c.lerp(d, f); return '#' + c.getHexString(); }

// ---------------- skeleton ----------------
// index: 0 pelvis 1 spine 2 chest 3 neck 4 head 5 shL 6 elL 7 handL 8 shR 9 elR 10 handR 11 hipL 12 knL 13 ftL 14 hipR 15 knR 16 ftR
const LEN = { thigh: 0.44, shin: 0.42, ankle: 0.09, upper: 0.29, fore: 0.26 };
function buildBones(armX) {
  const B = []; const mk = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); if (parent !== null) B[parent].add(b); B.push(b); return b; };
  mk(null, 0, 1.0, 0);           // 0 pelvis (world 1.00)
  mk(0, 0, 0.08, 0);             // 1 spine 1.08
  mk(1, 0, 0.22, 0);             // 2 chest 1.30
  mk(2, 0, 0.20, 0);             // 3 neck 1.50
  mk(3, 0, 0.065, 0);            // 4 head 1.565
  mk(2, armX, 0.16, 0);          // 5 shL 1.46
  mk(5, 0, -LEN.upper, 0);       // 6 elL 1.17
  mk(6, 0, -LEN.fore, 0);        // 7 handL 0.91
  mk(2, -armX, 0.16, 0);         // 8 shR
  mk(8, 0, -LEN.upper, 0);       // 9 elR
  mk(9, 0, -LEN.fore, 0);        // 10 handR
  mk(0, 0.092, -0.05, 0);        // 11 hipL 0.95
  mk(11, 0, -LEN.thigh, 0);      // 12 knL 0.51
  mk(12, 0, -LEN.shin, 0);       // 13 ftL 0.09
  mk(0, -0.092, -0.05, 0);       // 14 hipR
  mk(14, 0, -LEN.thigh, 0);      // 15 knR
  mk(15, 0, -LEN.shin, 0);       // 16 ftR
  return B;
}
// weights along a vertical chain of bones
function chainW(y, bones, joints) {
  const out = []; let carry = 1;
  for (let k = 0; k < bones.length; k++) {
    if (k < joints.length) { const [jy, r] = joints[k]; const s = sstep(jy + r, jy - r, y); out.push([bones[k], carry * (1 - s)]); carry *= s; }
    else out.push([bones[k], carry]);
  }
  return out;
}
const TORSO = (y) => chainW(y, [4, 3, 2, 1, 0], [[1.575, 0.02], [1.5, 0.025], [1.28, 0.08], [1.06, 0.05]]);
const ARM = (side) => (y) => chainW(y, side ? [2, 5, 6, 7] : [2, 8, 9, 10], [[1.47, 0.03], [1.17, 0.035], [0.91, 0.02]]);
const TORSO_SH = (y, x) => {
  const w = TORSO(y), f = sstep(0.11, 0.19, Math.abs(x)) * sstep(1.33, 1.44, y) * 0.5;
  if (f <= 0) return w;
  return w.map(([b2, v]) => [b2, v * (1 - f)]).concat([[x > 0 ? 5 : 8, f]]);
};
const ARMONLY = (side) => (y) => chainW(y, side ? [5, 6, 7] : [8, 9, 10], [[1.17, 0.035], [0.91, 0.02]]);
const LEG = (side) => (y) => chainW(y, side ? [0, 11, 12, 13] : [0, 14, 15, 16], [[0.945, 0.045], [0.51, 0.045], [0.09, 0.02]]);

// lathe-like tube with elliptical rings; prof = [[y, rx, rz, dz], ...] ascending y
function catmull(p, i, t) { const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[Math.min(p.length - 1, i + 1)], p3 = p[Math.min(p.length - 1, i + 2)]; const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
function tube(prof, { cx = 0, seg = 22, sub = 3, wfn, mat }) {
  const rows = [];
  for (let i = 0; i < prof.length - 1; i++) for (let s = 0; s < sub; s++) {
    const t = s / sub, col = (k) => catmull(prof.map((p) => p[k] ?? 0), i, t);
    rows.push([col(0), col(1), col(2), col(3)]);
  }
  const last = prof[prof.length - 1]; rows.push([last[0], last[1], last[2], last[3] || 0]);
  const y0 = rows[0][0], y1 = rows[rows.length - 1][0];
  const pos = [], uv = [], idx = [], si = [], sw = [];
  for (let i = 0; i < rows.length; i++) {
    const [y, rx, rz, dz] = rows[i];
    for (let j = 0; j <= seg; j++) {
      const th = -Math.PI / 2 + (j / seg) * Math.PI * 2;
      const x = cx + Math.sin(th) * rx, z = dz + Math.cos(th) * rz;
      pos.push(x, y, z); uv.push(j / seg, (y - y0) / (y1 - y0 || 1));
      const w = wfn(y, x, z).filter((e) => e[1] > 0.001).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const tot = w.reduce((a, e) => a + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) { si.push(w[k] ? w[k][0] : 0); sw.push(w[k] ? w[k][1] / tot : 0); }
    }
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 2, d = a + seg + 1;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal; // weld the seam normals
  for (let i = 0; i < rows.length; i++) { const a = i * (seg + 1), b = a + seg; const x = (n.getX(a) + n.getX(b)) / 2, y = (n.getY(a) + n.getY(b)) / 2, z = (n.getZ(a) + n.getZ(b)) / 2; n.setXYZ(a, x, y, z); n.setXYZ(b, x, y, z); }
  g.userData.mat = mat;
  return g;
}

// ---------------- textures ----------------
const texCache = new Map();
function canvasTex(key, w, h, draw, srgb = true) {
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  texCache.set(key, t); return t;
}
function fabric(x, w, h, a = 0.07) {
  x.globalAlpha = a; x.fillStyle = '#000';
  for (let i = 0; i < w; i += 4) for (let j = (i / 4) % 2 * 2; j < h; j += 4) x.fillRect(i, j, 1.6, 1.6);
  x.globalAlpha = 1;
}
const ink = (c2) => (c2.toLowerCase() === '#ffffff' ? '#111111' : '#ffffff');
function jerseyTex(team, card, U) {
  // U = uniform {base, trim, text, pin, word, mirror}
  const num = String(card.num ?? ''), name = (card.last || '').toUpperCase();
  return canvasTex('j' + U.key + num + name + (U.mirror ? 'm' : ''), 1024, 512, (x, W, H) => {
    x.fillStyle = U.base; x.fillRect(0, 0, W, H);
    if (U.pin) { x.fillStyle = U.trim; x.globalAlpha = 0.55; for (let i = 0; i < W; i += 22) x.fillRect(i, 0, 2.2, H); x.globalAlpha = 1; }
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(0,0,0,.14)'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    fabric(x, W, H, 0.05);
    x.fillStyle = U.trim;
    x.fillRect(0, 0, W, H * 0.03); // collar
    // button placket down the front (u=.25 is the front)
    x.fillRect(W * 0.25 - 3, 0, 6, H); x.fillStyle = 'rgba(0,0,0,.25)'; for (let v = 0.12; v < 1; v += 0.13) { x.beginPath(); x.arc(W * 0.25 + 9, H * v, 3.5, 0, 7); x.fill(); }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    const txt = (s, u, v, size, lw, sx = 1) => {
      x.save(); x.translate(W * u, H * v); if (U.mirror) x.scale(-1, 1); x.scale(sx, 1);
      x.font = `900 italic ${size}px "Barlow Condensed", "Arial Black", sans-serif`; x.lineWidth = lw; x.strokeStyle = U.trim2 || U.trim; x.fillStyle = U.text;
      x.strokeText(s, 0, 0); x.fillText(s, 0, 0); x.restore();
    };
    const w = U.word || '';
    const wsz = Math.min(120, 900 / Math.max(4, w.length));
    txt(w, 0.25, 0.24, wsz, 7, 0.9);           // chest wordmark
    txt(num, 0.32, 0.5, 70, 6);                // small front number
    txt(name, 0.75, 0.17, 50, 5);              // back name
    txt(num, 0.75, 0.47, 200, 10);             // back number
  });
}
function plainTex(key, c1, c2, stripeAt) {
  return canvasTex(key, 256, 128, (x, W, H) => {
    x.fillStyle = c1; x.fillRect(0, 0, W, H); fabric(x, W, H);
    x.fillStyle = c2; for (const v of stripeAt) x.fillRect(0, H * (1 - v[1]), W, H * (v[1] - v[0]));
  });
}
function shortsTex(c, s) {
  return canvasTex('sh' + c + s, 256, 128, (x, W, H) => {
    x.fillStyle = c; x.fillRect(0, 0, W, H); fabric(x, W, H, 0.05);
    x.fillStyle = s; x.fillRect(0, 0, W * 0.04, H); x.fillRect(W * 0.96, 0, W * 0.04, H); x.fillRect(W * 0.48, 0, W * 0.04, H);
  });
}
const hairTex = () => canvasTex('hairstrands', 256, 256, (x, W, H) => {
  x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { const v = 150 + Math.random() * 105 | 0; x.strokeStyle = `rgb(${v},${v},${v})`; x.globalAlpha = 0.6; x.lineWidth = 1; const px = Math.random() * W, py = Math.random() * H; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 4, py + 10 + Math.random() * 16); x.stroke(); }
  x.globalAlpha = 1;
});
const braidTex = () => canvasTex('braids', 256, 256, (x, W, H) => {
  x.fillStyle = '#7a7a7a'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 12; i++) { const cx = (i + 0.5) * W / 12; for (let j = 0; j < 20; j++) { x.fillStyle = j % 2 ? '#e2e2e2' : '#c4c4c4'; x.beginPath(); x.ellipse(cx, j * H / 20 + 6, W / 30, H / 34, 0.4, 0, 7); x.fill(); } }
});

// ---------------- head ----------------
const HS = { rx: 0.078, ry: 0.118, rz: 0.098, oy: 0.115, oz: 0.008 };
function bump(p, cx, cy, cz, r, amt) { const d = Math.hypot(p.x - cx, p.y - cy, p.z - cz); if (d < r) { const f = amt * (0.5 + 0.5 * Math.cos(Math.PI * d / r)); p.multiplyScalar(1 + f); } }
function headPoint(p) { // p = unit sphere point (mutated) -> head-local coordinates
  for (const sx of [-1, 1]) { bump(p, 0.55 * sx, -0.05, 0.75, 0.4, 0.04); bump(p, 0.38 * sx, 0.1, 0.9, 0.28, -0.06); }
  bump(p, 0, 0.24, 0.92, 0.5, 0.025);
  if (p.y < 0) { p.x *= 1 + 0.3 * p.y; if (p.z < 0) p.z *= 1 + 0.45 * p.y; }
  if (p.y < -0.6 && p.z > 0) p.z += 0.12 * ((-p.y - 0.6) / 0.4) * p.z;
  if (p.z > 0.5) p.z = 0.5 + (p.z - 0.5) * 0.8;
  if (p.y > 0 && p.z < 0) p.z *= 1.06;
  p.set(p.x * HS.rx, p.y * HS.ry + HS.oy, p.z * HS.rz + HS.oz);
  return p;
}
function shellGeo(key, scale, keep, ws = 40, hs = 28, noise = 0) {
  return G(key, () => {
    const g = new THREE.SphereGeometry(1, ws, hs);
    const pos = g.attributes.position, uv = g.attributes.uv, n = pos.count;
    const okV = new Uint8Array(n), v = new THREE.Vector3(), c = new THREE.Vector3(0, HS.oy, HS.oz);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i); okV[i] = keep(v) ? 1 : 0;
      let sc = scale; if (noise) sc += noise * (Math.sin(v.x * 23) * Math.sin(v.y * 21 + 1) * Math.sin(v.z * 25 + 2));
      const p = headPoint(v.clone()); p.sub(c).multiplyScalar(sc).add(c);
      pos.setXYZ(i, p.x, p.y, p.z); uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 2);
    }
    const idx = g.index.array, keepIdx = [];
    for (let i = 0; i < idx.length; i += 3) if (okV[idx[i]] && okV[idx[i + 1]] && okV[idx[i + 2]]) keepIdx.push(idx[i], idx[i + 1], idx[i + 2]);
    g.setIndex(keepIdx); g.computeVertexNormals();
    // weld the u-seam normals
    const nn = g.attributes.normal;
    for (let r = 0; r <= hs; r++) { const a = r * (ws + 1), b = a + ws; const x = (nn.getX(a) + nn.getX(b)) / 2, y = (nn.getY(a) + nn.getY(b)) / 2, z = (nn.getZ(a) + nn.getZ(b)) / 2; nn.setXYZ(a, x, y, z); nn.setXYZ(b, x, y, z); }
    return g;
  });
}
const headGeo = () => shellGeo('head', 1, () => true, 48, 36);
const ang = (v) => Math.atan2(v.x, v.z);
function hairline(v, front = 0.42, side = 0.05, back = -0.5) {
  const c = Math.cos(ang(v));
  const hl = c > 0 ? mix(side, front, Math.pow(c, 1.4)) : mix(side, back, -c);
  return v.y > hl;
}
function addHair(head, look) {
  const col = HAIRC[look.hairC], s = look.hair;
  const hm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, map: hairTex() });
  const add = (g, m = hm) => { const x = new THREE.Mesh(g, m); x.castShadow = true; head.add(x); return x; };
  if (s === 'bald') return;
  if (s === 'buzz') add(shellGeo('h_buzz', 1.012, (v) => hairline(v, 0.45, 0.12, -0.45)), new THREE.MeshStandardMaterial({ color: col, roughness: 1, transparent: true, opacity: 0.88 }));
  if (s === 'short' || s === 'headband') add(shellGeo('h_short', 1.05, (v) => hairline(v, 0.4, 0.08, -0.45), 40, 28, 0.012));
  if (s === 'crop' || s === 'fade') { add(shellGeo('h_fade', 1.012, (v) => hairline(v, 0.45, 0.1, -0.45))).material = new THREE.MeshStandardMaterial({ color: col, roughness: 1, transparent: true, opacity: 0.7 }); add(shellGeo('h_top', 1.075, (v) => hairline(v, 0.38, 0.42, 0.3), 40, 28, 0.02)); }
  if (s === 'curly') add(shellGeo('h_curly', 1.09, (v) => hairline(v, 0.36, 0.05, -0.45), 48, 36, 0.06));
  if (s === 'afro') { const m = add(shellGeo('h_afro', 1.32, (v) => hairline(v, 0.32, -0.15, -0.6), 48, 36, 0.05)); m.position.set(0, 0.025, -0.012); }
  if (s === 'braids') add(shellGeo('h_braid', 1.03, (v) => hairline(v, 0.42, 0.05, -0.5)), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, map: braidTex() }));
  if (s === 'long') {
    add(shellGeo('h_long', 1.06, (v) => hairline(v, 0.4, -0.1, -0.9), 40, 28, 0.01));
    const back = add(G('h_drape', () => { const g = new THREE.CylinderGeometry(0.075, 0.09, 0.17, 18, 1, true, Math.PI * 0.55, Math.PI * 0.9); g.translate(0, -0.02, -0.005); return g; }));
    back.position.set(0, 0.07, 0); back.material = hm.clone(); back.material.side = THREE.DoubleSide;
  }
  if (s === 'bun') { add(shellGeo('h_short2', 1.045, (v) => hairline(v, 0.42, 0.08, -0.4))); const b = add(G('bun', () => new THREE.SphereGeometry(0.042, 16, 12))); b.position.set(0, 0.22, -0.06); }
  if (s === 'mohawk') {
    add(shellGeo('h_buzz', 1.012, (v) => hairline(v, 0.45, 0.12, -0.45)), new THREE.MeshStandardMaterial({ color: col, roughness: 1, transparent: true, opacity: 0.6 }));
    const r = add(G('mohawk', () => { const g = new THREE.SphereGeometry(1, 16, 12); g.scale(0.018, 0.04, 0.11); return g; })); r.position.set(0, 0.228, -0.005); r.rotation.x = -0.1;
  }
  if (s === 'headband' || look.band >= 0) {
    const cols = ['#ffffff', '#e53935', '#1e88e5', '#111111', '#f2c14e', '#43a047'];
    const b = add(G('band', () => { const g = new THREE.TorusGeometry(1, 0.17, 8, 40); g.scale(HS.rx * 1.06, HS.rz * 1.06, 0.1); return g; }), M(cols[Math.max(0, look.band)], 0.8));
    b.rotation.x = Math.PI / 2 - 0.22; b.position.set(0, HS.oy + 0.062, HS.oz - 0.004);
  }
}
function buildHead(head, look, skinHex) {
  const skin = M(skinHex, 0.52);
  const h = new THREE.Mesh(headGeo(), skin); h.castShadow = true; head.add(h);
  const lip = M(shade(skinHex, 0.35, '#8a3b36'), 0.45);
  const lid = skin, white = M('#f1ede6', 0.25), irisC = ['#3b2414', '#2a1a0e', '#4a6a2a', '#3a6a9a', '#5a3a1a'][look.skin < 3 ? (look.hairC + look.skin) % 5 : (look.hairC % 2)];
  const part = (g, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); head.add(o); return o; };
  for (const sx of [-1, 1]) {
    part(G('eye', () => new THREE.SphereGeometry(0.0125, 16, 12)), white, sx * 0.031, 0.127, 0.079);
    part(G('iris', () => { const g = new THREE.SphereGeometry(0.0072, 14, 10); g.scale(1, 1, 0.45); return g; }), M(irisC, 0.2), sx * 0.031, 0.1275, 0.0905);
    part(G('pupil', () => { const g = new THREE.SphereGeometry(0.0036, 10, 8); g.scale(1, 1, 0.4); return g; }), M('#050505', 0.1), sx * 0.031, 0.1275, 0.0935);
    part(G('lidU', () => new THREE.SphereGeometry(0.0138, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.44)), lid, sx * 0.031, 0.1275, 0.0785, 0.42);
    part(G('lidL', () => new THREE.SphereGeometry(0.0134, 16, 6, 0, Math.PI * 2, Math.PI * 0.72, Math.PI * 0.28)), lid, sx * 0.031, 0.127, 0.0785, -0.2);
    part(G('brow', () => { const g = new THREE.CapsuleGeometry(0.0042, 0.026, 3, 6); g.rotateZ(Math.PI / 2); g.scale(1, 1, 0.8); return g; }), M(HAIRC[look.hairC], 0.9), sx * 0.032, 0.149, 0.093, 0.1, 0, sx * -0.12);
    part(G('ear', () => { const g = new THREE.SphereGeometry(1, 14, 10); g.scale(0.011, 0.027, 0.019); return g; }), skin, sx * 0.077, 0.12, -0.002, 0, sx * 0.35, 0);
  }
  part(G('noseB', () => { const g = new THREE.SphereGeometry(1, 12, 10); g.scale(0.0105, 0.026, 0.014); return g; }), skin, 0, 0.106, 0.098, -0.35);
  part(G('noseT', () => new THREE.SphereGeometry(0.0115, 12, 10)), skin, 0, 0.09, 0.106);
  for (const sx of [-1, 1]) part(G('nost', () => new THREE.SphereGeometry(0.0082, 10, 8)), skin, sx * 0.0115, 0.088, 0.1);
  part(G('lipU', () => { const g = new THREE.SphereGeometry(1, 16, 8); g.scale(0.02, 0.0055, 0.008); return g; }), lip, 0, 0.0745, 0.0975);
  part(G('lipL', () => { const g = new THREE.SphereGeometry(1, 16, 8); g.scale(0.018, 0.0068, 0.009); return g; }), lip, 0, 0.0645, 0.0955);
  if (look.beard) {
    const b = new THREE.Mesh(shellGeo('beard', 1.03, (v) => { const c = Math.cos(ang(v)); if (c < -0.05) return false; if (Math.abs(v.x) < 0.32 && v.y > -0.62 && v.y < -0.22 && v.z > 0) return false; return v.y < -0.3 || (Math.abs(v.x) > 0.62 && v.y < 0.08); }, 40, 28, 0.015), new THREE.MeshStandardMaterial({ color: HAIRC[look.hairC], roughness: 1, map: hairTex() }));
    head.add(b);
  }
  addHair(head, look);
}

// ---------------- body ----------------
const SHOES = ['#f4f4f4', '#1b1b1f', '#ff5a1f', '#2dd4bf', '#f2c14e', '#e53935', '#1e88e5', '#b9f227'];
function hashN(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }
const bodyCache = new Map();
function bodyGeo(build, lod) {
  const key = build.toFixed(2) + lod;
  if (bodyCache.has(key)) return bodyCache.get(key);
  const seg = lod ? 22 : 14, sub = lod ? 3 : 2;
  const wb = build, ax = 0.205 + (0.188 * wb - 0.188);
  const T = (p) => p.map(([y, rx, rz, dz]) => [y, rx * wb, rz * (0.95 + 0.05 * wb), dz || 0]);
  const parts = [];
  // 0 jersey, 1 sleeve, 2 shorts, 3 skin, 4 socks, 5 arm skin (or compression sleeve)
  parts.push(tube(T([[0.965, 0.158, 0.113], [1.02, 0.156, 0.11], [1.1, 0.149, 0.106], [1.18, 0.154, 0.11, 0.003], [1.26, 0.167, 0.118, 0.008], [1.33, 0.18, 0.124, 0.01], [1.39, 0.188, 0.122, 0.006], [1.425, 0.18, 0.112], [1.46, 0.15, 0.098, -0.005], [1.49, 0.105, 0.08, -0.006], [1.51, 0.07, 0.06, -0.004], [1.52, 0.05, 0.05]]), { seg: seg + 10, sub, wfn: TORSO_SH, mat: 0 }));
  parts.push(tube([[1.47, 0.062, 0.058, -0.006], [1.52, 0.056, 0.055, -0.002], [1.57, 0.054, 0.054, 0.004], [1.61, 0.05, 0.05, 0.008]], { seg, sub, wfn: TORSO, mat: 3 }));
  // shorts
  parts.push(tube(T([[0.855, 0.015, 0.015], [0.875, 0.1, 0.085], [0.92, 0.158, 0.114], [0.98, 0.164, 0.117], [1.03, 0.16, 0.115]]), { seg: seg + 10, sub, mat: 2, wfn: (y, x) => { const f = sstep(0.97, 0.88, y) * sstep(0.02, 0.09, Math.abs(x)) * 0.75; return [[0, 1 - f], [x > 0 ? 11 : 14, f]]; } }));
  for (const side of [1, 0]) {
    const sx = side ? 1 : -1, lx = sx * 0.092;
    parts.push(tube([[0.69, 0.093, 0.095], [0.78, 0.096, 0.098], [0.88, 0.1, 0.101], [0.955, 0.1, 0.1]], { cx: lx, seg, sub, mat: 2, wfn: LEG(side) }));
    parts.push(tube([[0.43, 0.062, 0.064, 0.004], [0.5, 0.07, 0.074, 0.008], [0.6, 0.083, 0.088, 0.006], [0.75, 0.092, 0.095], [0.9, 0.095, 0.098]], { cx: lx, seg, sub, mat: 2, wfn: LEG(side) }));
    parts.push(tube([[0.06, 0.031, 0.033, -0.005], [0.15, 0.035, 0.037, -0.004], [0.25, 0.043, 0.048, -0.011], [0.36, 0.051, 0.058, -0.014], [0.44, 0.052, 0.056, -0.006], [0.47, 0.055, 0.058, 0.004]], { cx: lx, seg, sub, mat: 4, wfn: LEG(side) }));
    parts.push(tube([[0.05, 0.035, 0.037, -0.005], [0.15, 0.038, 0.04, -0.004], [0.25, 0.046, 0.051, -0.011], [0.315, 0.05, 0.056, -0.013], [0.325, 0.05, 0.056, -0.013]], { cx: lx, seg, sub, mat: 4, wfn: LEG(side) }));
    const x = sx * ax;
    parts.push(tube([[1.14, 0.035, 0.037], [1.2, 0.043, 0.043], [1.28, 0.049, 0.051, 0.004], [1.36, 0.051, 0.051], [1.41, 0.048, 0.048], [1.44, 0.03, 0.03]].map(([y, a, b, d]) => [y, a * (0.9 + 0.1 * wb), b * (0.9 + 0.1 * wb), d]), { cx: x, seg, sub, mat: 5, wfn: ARM(side) }));
    parts.push(tube([[1.33, 0.056, 0.057], [1.38, 0.058, 0.059], [1.42, 0.057, 0.058], [1.45, 0.048, 0.05], [1.47, 0.02, 0.02]].map(([y, a, b]) => [y, a * (0.9 + 0.1 * wb), b * (0.9 + 0.1 * wb), 0]), { cx: x - sx * 0.004, seg, sub, mat: 1, wfn: ARMONLY(side) }));
    parts.push(tube([[1.37, 0.03, 0.03], [1.39, 0.05, 0.052], [1.42, 0.064, 0.066], [1.45, 0.06, 0.062], [1.475, 0.04, 0.042], [1.492, 0.006, 0.006]].map(([y, a2, b2]) => [y, a2 * (0.9 + 0.1 * wb), b2 * (0.9 + 0.1 * wb), 0]), { cx: x - sx * 0.014, seg, sub, mat: 1, wfn: ARMONLY(side) }));
    parts.push(tube([[0.895, 0.027, 0.023], [0.95, 0.031, 0.027], [1.05, 0.039, 0.035], [1.12, 0.041, 0.038], [1.18, 0.037, 0.038]], { cx: x, seg, sub, mat: 5, wfn: ARM(side) }));
  }
  // merge by material
  const byMat = [0, 1, 2, 3, 4, 5].map((m) => parts.filter((p) => p.userData.mat === m)).map((list) => THREE.mergeGeometries(list));
  const g = THREE.mergeGeometries(byMat, true);
  const out = { g, ax };
  bodyCache.set(key, out); return out;
}

function handGeo() {
  return G('hand', () => {
    const palm = new THREE.SphereGeometry(1, 14, 10); palm.scale(0.017, 0.048, 0.04); palm.translate(0, -0.045, 0.002);
    const fing = new THREE.SphereGeometry(1, 14, 10); fing.scale(0.015, 0.04, 0.037); fing.translate(0, -0.11, 0.006);
    const thumb = new THREE.CapsuleGeometry(0.0095, 0.03, 3, 8); thumb.rotateX(0.6); thumb.translate(0, -0.05, 0.042);
    return THREE.mergeGeometries([palm, fing, thumb]);
  });
}
function shoeGeo() {
  return G('shoe', () => {
    const up = new THREE.SphereGeometry(1, 20, 14); up.scale(0.047, 0.048, 0.128); up.translate(0, -0.05, 0.045);
    const pos = up.attributes.position; for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.06) pos.setY(i, -0.06 - (pos.getY(i) + 0.06) * 0.25);
    up.computeVertexNormals(); return up;
  });
}
const soleGeo = () => G('sole', () => { const g = new THREE.CapsuleGeometry(0.046, 0.17, 4, 14); g.rotateX(Math.PI / 2); g.scale(1, 0.32, 1); g.translate(0, -0.074, 0.043); return g; });

const FT = 3.2808;
function isLight(hex) { const c = new THREE.Color(hex); return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.72; }
// uniform for a club: kind = 'home' | 'away'
export function uniform(team, kind) {
  const PIN = { NYY: 1, PHI: 1, CHC: 1, MIN: 1 };
  const c1 = team.c1, c2 = team.c2, c3 = team.c3 || c2;
  const outline = isLight(c2) ? (isLight(c3) ? '#ffffff' : c3) : c2;
  if (kind === 'ump') return { key: 'ump', base: '#1b2233', pants: '#40444b', trim: '#0f1420', text: '#1b2233', sock: '#111317', cap: '#111317', word: '', shoe: '#111' };
  const home = kind === 'home';
  const base = home ? '#f3f2ec' : '#a7abb2';
  return {
    key: team.id + kind, base, pants: base, trim: c1, trim2: outline === base ? c1 : outline, text: c1, pin: home && PIN[team.id],
    word: home ? team.name : (team.city.length > 11 ? team.city.split(' ').pop() : team.city), sock: c1, cap: c1, capMark: c2, shoe: isLight(c1) ? '#1b1b1f' : c1,
  };
}
function capTex(team) {
  return canvasTex('cap' + team.id, 256, 128, (x, W, H) => {
    x.fillStyle = team.c1; x.fillRect(0, 0, W, H); fabric(x, W, H, 0.06);
    // team letter mark on the front panel (u=.25 faces front, cap sphere uv)
    const m = window.__teamMark ? window.__teamMark(team) : team.id;
    x.font = `900 italic ${m.length > 2 ? 34 : 46}px "Barlow Condensed", Arial Black`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 5; x.strokeStyle = isLight(team.c2) ? (isLight(team.c3 || '#000') ? '#111' : team.c3) : team.c2;
    x.fillStyle = isLight(team.c1) ? team.c3 || '#111' : (isLight(team.c2) ? '#ffffff' : team.c2);
    x.save(); x.translate(W * 0.25, H * 0.62); x.scale(1, 1.35); x.strokeText(m, 0, 0); x.fillText(m, 0, 0); x.restore();
  });
}
const capGeo = () => G('capdome', () => { const g = new THREE.SphereGeometry(0.104, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.52); g.rotateY(-Math.PI / 2); g.scale(1, 0.86, 1.08); return g; });
const brimGeo = () => G('capbrim', () => { const g = new THREE.CylinderGeometry(0.1, 0.1, 0.008, 24, 1, false, -Math.PI * 0.42, Math.PI * 0.84); g.scale(0.95, 1, 0.9); return g; });
const helmetGeo = () => G('helmet', () => { const g = new THREE.SphereGeometry(0.118, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.6); g.scale(1, 0.95, 1.12); return g; });
function addCap(hg, team, U, kind) {
  const capM = kind === 'helmet' ? new THREE.MeshStandardMaterial({ color: U.cap, roughness: 0.18, metalness: 0.15 }) : new THREE.MeshStandardMaterial({ map: team ? capTex(team) : null, color: team ? '#ffffff' : U.cap, roughness: 0.8 });
  const y0 = 0.115 + 0.035;
  if (kind === 'helmet') {
    const h = new THREE.Mesh(helmetGeo(), capM); h.position.set(0, y0 - 0.005, -0.006); hg.add(h);
    const flap = new THREE.Mesh(G('flap', () => { const g = new THREE.SphereGeometry(0.06, 14, 10, 0, Math.PI, 0, Math.PI * 0.5); g.scale(0.5, 1.2, 1); g.rotateX(Math.PI); return g; }), capM);
    flap.position.set(0.105, y0 - 0.03, 0.005); hg.add(flap); // ear flap faces the pitcher (left side)
    const br = new THREE.Mesh(brimGeo(), capM); br.position.set(0, y0 - 0.012, 0.04); br.scale.set(0.9, 1, 0.7); hg.add(br);
  } else {
    const d = new THREE.Mesh(capGeo(), capM); d.position.set(0, y0 - 0.006, 0.002); hg.add(d);
    const br = new THREE.Mesh(brimGeo(), M(U.cap, 0.8)); br.position.set(0, y0 - 0.01, 0.055); br.rotation.x = 0.12; hg.add(br);
    const bt = new THREE.Mesh(G('capbtn', () => new THREE.SphereGeometry(0.012, 8, 6)), M(U.cap, 0.8)); bt.position.set(0, y0 + 0.083, 0.004); hg.add(bt);
  }
}
export function makeGlove(catcher = false) {
  const g = new THREE.Group();
  const leather = M(catcher ? '#3b2416' : '#8a5428', 0.62), lace = M('#2a170c', 0.7);
  const pocket = new THREE.Mesh(G(catcher ? 'mitt' : 'glovep', () => { const s = new THREE.SphereGeometry(catcher ? 0.11 : 0.085, 18, 12); s.scale(1, 1.25, 0.45); return s; }), leather);
  pocket.position.set(0, -0.11, 0.035); g.add(pocket);
  if (!catcher) for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(G('gfing', () => { const c = new THREE.CapsuleGeometry(0.018, 0.08, 3, 8); return c; }), leather); f.position.set(-0.045 + i * 0.03, -0.2, 0.035); f.rotation.z = (i - 1.5) * 0.08; g.add(f); }
  const web = new THREE.Mesh(G('gweb', () => new THREE.BoxGeometry(0.05, 0.06, 0.01)), lace); web.position.set(0.06, -0.18, 0.04); g.add(web);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function makeBat(color = '#c89a5a') {
  const g = new THREE.Group();
  const prof = [[0, 0.016], [0.02, 0.022], [0.03, 0.013], [0.35, 0.014], [0.5, 0.02], [0.66, 0.03], [0.8, 0.033], [0.84, 0.031], [0.86, 0.0]].map(([y, r]) => new THREE.Vector2(r, y));
  const m = new THREE.Mesh(G('bat', () => new THREE.LatheGeometry(prof, 16)), M(color, 0.4));
  m.castShadow = true; g.add(m);
  const tape = new THREE.Mesh(G('battape', () => new THREE.CylinderGeometry(0.0145, 0.0145, 0.16, 12)), M('#1b1b1f', 0.7)); tape.position.y = 0.11; g.add(tape);
  return g; // knob at origin, barrel along +y (meters, scaled by the athlete root)
}
// Build a ballplayer. card = {id, num, last, look}, opts = {uni, team, head:'cap'|'helmet'|'catcher'|'none', glove:true, bat:false, lefty:false, lod}
export function makeAthlete(card, team, opts = {}) {
  const look = card.look, lod = opts.lod ?? 1, U = opts.uni || uniform(team, 'home');
  const skinHex = SKINS[look.skin];
  const { g, ax } = bodyGeo(look.build, lod);
  const bones = buildBones(ax);
  const h2 = hashN(card.id);
  const mats = [
    new THREE.MeshStandardMaterial({ map: jerseyTex(team || { id: 'x' }, card, { ...U, mirror: !!opts.lefty }), roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ map: plainTex('sl' + U.key, U.base, U.trim, [[0.02, 0.1]]), roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ map: shortsTex(U.pants, U.trim), roughness: 0.78 }),
    M(skinHex, 0.52),
    new THREE.MeshStandardMaterial({ map: plainTex('so' + U.sock, U.sock, U.sock, []), roughness: 0.85 }),
    look.sleeve ? M(U.trim, 0.6) : M(skinHex, 0.52),
  ];
  const mesh = new THREE.SkinnedMesh(g, mats);
  mesh.add(bones[0]); mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.frustumCulled = false;
  const root = new THREE.Group(), flip = new THREE.Group(); root.add(flip); flip.add(mesh);
  if (opts.lefty) flip.scale.x = -1;
  const P = { root, flip, mesh, U, body: bones[0], hips: bones[0], torso: bones[1], chest: bones[2], neck: bones[3], head: bones[4], shL: bones[5], elL: bones[6], handL: bones[7], shR: bones[8], elR: bones[9], handR: bones[10], hipL: bones[11], knL: bones[12], ftL: bones[13], hipR: bones[14], knR: bones[15], ftR: bones[16] };
  const hg = new THREE.Group(); hg.scale.setScalar(1.07); P.head.add(hg);
  const lk = { ...look }; if (opts.head && opts.head !== 'none' && ['afro', 'curly', 'mohawk', 'bun', 'braids'].includes(lk.hair)) lk.hair = 'short';
  lk.band = -1;
  buildHead(hg, lk, skinHex);
  if (opts.head === 'cap') addCap(hg, team, U, 'cap');
  else if (opts.head === 'helmet') addCap(hg, team, U, 'helmet');
  else if (opts.head === 'ump') addCap(hg, null, U, 'cap');
  if (opts.head === 'catcher' || opts.mask) {
    addCap(hg, team, U, 'helmet');
    const cage = new THREE.Mesh(G('cage', () => { const c = new THREE.SphereGeometry(0.115, 12, 8, -Math.PI * 0.4, Math.PI * 0.8, Math.PI * 0.25, Math.PI * 0.45); return c; }), new THREE.MeshStandardMaterial({ color: '#222', wireframe: true }));
    cage.position.set(0, 0.11, 0.025); hg.add(cage);
  }
  if (opts.chestPad) {
    const pad = new THREE.Mesh(G('cpad', () => { const b = new THREE.CapsuleGeometry(0.15, 0.22, 4, 12); b.scale(1.05, 1, 0.45); return b; }), M(opts.chestPad, 0.6));
    pad.position.set(0, 0.06, 0.09); P.chest.add(pad);
    for (const s of ['L', 'R']) { const sg = new THREE.Mesh(G('shin', () => { const c = new THREE.CapsuleGeometry(0.06, 0.32, 4, 10); c.scale(1, 1, 0.8); return c; }), M(opts.chestPad, 0.5)); sg.position.set(0, -0.2, 0.04); P['kn' + s].add(sg); }
  }
  const handM = look.gloves || opts.bat ? M(opts.bat ? U.trim : '#1a1c22', 0.6) : M(skinHex, 0.52);
  for (const s of ['L', 'R']) { const hm = new THREE.Mesh(handGeo(), s === 'R' || opts.bat ? handM : M(skinHex, 0.52)); hm.castShadow = true; hm.rotation.y = s === 'L' ? -0.25 : 0.25; P['hand' + s].add(hm); }
  if (opts.glove) { const gl = makeGlove(opts.head === 'catcher'); P.handL.add(gl); P.glove = gl; }
  if (opts.bat) {
    // the bat lives in the body frame (not the hand) so swings read cleanly from any camera
    const pivot = new THREE.Group(); pivot.rotation.order = 'YXZ'; P.flip.add(pivot); const bat = makeBat(); pivot.add(bat); P.batPivot = pivot; P.bat = bat;
  }
  const shoeC = U.shoe || '#1b1b1f';
  for (const s of ['L', 'R']) {
    const u = new THREE.Mesh(shoeGeo(), M(shoeC, 0.45)); u.castShadow = true; P['ft' + s].add(u);
    const so = new THREE.Mesh(soleGeo(), M('#f4f4f4', 0.6)); P['ft' + s].add(so);
  }
  root.scale.setScalar(look.h * FT);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  P.anim = { phase: Math.random() * 6, t: 0 };
  return P;
}

// ---------------- animation ----------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function legExt(h, k) { return LEN.thigh * Math.cos(h) + LEN.shin * Math.cos(h + k); }
// pose: {mode, speed, t, forehand, lob, reachY, turn}
export function animate(P, pose, dt) {
  const A = P.anim, sp = pose.speed || 0, m = pose.mode;
  const run = clamp(sp / 7, 0, 1), walk = clamp(sp / 2, 0, 1);
  const cyc = 1.0 + sp * 0.17;
  A.phase += (sp > 0.2 ? sp / cyc : 0.6) * dt * Math.PI * 2 * (m === 'run' || m === 'reach' ? 1 : 0.5);
  A.t += dt;
  const ph = A.phase, s = Math.sin(ph), c = Math.cos(ph);
  const T = { hipLx: 0, hipRx: 0, hipLz: 0.03, hipRz: -0.03, knL: 0, knR: 0, shLx: 0, shRx: 0, shLz: 0.1, shRz: -0.1, elL: -0.25, elR: -0.25, spineX: 0, spineY: 0, chestY: 0, chestX: 0, pelvisY: 0, pelvisX: 0, pelvisZ: 0, headX: 0, headY: 0, bodyY: null, ftLx: null, ftRx: null, shLy: 0, shRy: 0 };
  // locomotion base
  const amp = 0.18 + 0.62 * run;
  T.hipLx = -s * amp * walk - 0.1 * run; T.hipRx = s * amp * walk - 0.1 * run;
  T.knL = 0.08 + walk * (0.15 + (0.25 + 1.25 * run) * Math.max(0, c)); T.knR = 0.08 + walk * (0.15 + (0.25 + 1.25 * run) * Math.max(0, -c));
  T.shLx = s * (0.25 + 0.65 * run) * walk; T.shRx = -s * (0.25 + 0.65 * run) * walk;
  T.elL = -0.3 - 1.05 * run - Math.max(0, -T.shLx) * 0.35; T.elR = -0.3 - 1.05 * run - Math.max(0, -T.shRx) * 0.35;
  T.spineX = 0.04 + 0.26 * run; T.headX = -0.18 * run; T.chestY = s * 0.16 * run; T.pelvisY = -s * 0.12 * run;
  T.pelvisZ = clamp((pose.turn || 0) * 0.05, -0.28, 0.28);
  if (m === 'idle') { // athletic ready stance
    const b = Math.sin(A.t * 2.2) * 0.02;
    Object.assign(T, { hipLx: -0.32, hipRx: -0.26, knL: 0.55, knR: 0.48, hipLz: 0.1, hipRz: -0.1, spineX: 0.28 + b, headX: -0.25, shLx: -0.35, shRx: -0.3, shLz: 0.28, shRz: -0.28, elL: -0.7, elR: -0.65, chestY: 0, pelvisY: 0 });
  }
  if (m === 'stand') Object.assign(T, { hipLx: -0.02, hipRx: 0.02, knL: 0.06, knR: 0.08, spineX: 0.02, shLz: 0.12, shRz: -0.12, elL: -0.2, elR: -0.25 });
  if (m === 'mark') {
    const sh = Math.sin(A.t * 6) * 0.06;
    Object.assign(T, { hipLx: -0.45, hipRx: -0.45, hipLz: 0.28 + sh, hipRz: -0.28 + sh, knL: 0.85, knR: 0.85, spineX: 0.38, headX: -0.32, shLx: -0.5, shRx: -0.5, shLz: 1.2, shRz: -1.2, elL: -0.25, elR: -0.25, chestY: 0, pelvisY: 0 });
  }
  if (m === 'throw') {
    const t = pose.t || 0, fh = pose.forehand, lob = pose.lob;
    const wind = t < 0.55 ? sstep(0, 0.55, t) : 1 - sstep(0.55, 0.72, t), rel = sstep(0.55, 0.8, t);
    Object.assign(T, { hipLx: -0.7, hipRx: 0.25, knL: 0.75, knR: 0.35, hipLz: 0.12, hipRz: -0.12, spineX: 0.3, headX: -0.2, shLx: -0.6, shLz: 0.7, elL: -0.5, chestY: 0, pelvisY: 0 });
    if (lob) { T.shRx = mix(0.4, 0.7, wind) - rel * 2.9; T.shRz = -0.35; T.elR = -0.5 + rel * 0.4; T.chestY = -0.3 * wind + rel * 0.3; T.spineX = 0.2 - rel * 0.25; }
    else if (fh) { T.shRx = -0.5 - rel * 0.9; T.shRz = mix(-0.5, -1.3, wind) + rel * 0.9; T.elR = -1.5 + rel * 1.25; T.chestY = -0.75 * wind + rel * 0.55; }
    else { T.shRx = -1.25; T.shRz = mix(-0.2, 1.25, wind) - rel * 2.0; T.elR = -0.8 * wind - 0.15; T.chestY = 0.85 * wind - rel * 1.1; T.spineY = 0.25 * wind - rel * 0.3; }
  }
  if (m === 'catch' || m === 'reach') {
    const hy = pose.reachY ?? 1.4, up = hy > 1.75 ? -2.85 : hy > 1.1 ? -1.55 : -0.85;
    T.shLx = mix(T.shLx, up, 0.85); T.shRx = mix(T.shRx, up, 0.85); T.shLz = 0.18; T.shRz = -0.18; T.elL = T.elR = -0.3;
  }
  if (m === 'jump') Object.assign(T, { hipLx: -1.0, hipRx: -0.35, knL: 1.5, knR: 0.7, shLx: -2.95, shRx: -2.95, shLz: 0.15, shRz: -0.15, elL: -0.15, elR: -0.15, spineX: 0.05, headX: -0.4, chestY: 0, pelvisY: 0, bodyY: 1.0 });
  if (m === 'layout') Object.assign(T, { pelvisX: 1.38, bodyY: 0.4, hipLx: 0.3, hipRx: 0.1, knL: 0.7, knR: 0.25, shLx: -3.0, shRx: -3.0, shLz: 0.14, shRz: -0.14, elL: -0.05, elR: -0.05, spineX: -0.1, headX: -0.95, chestY: 0, pelvisY: 0 });
  if (m === 'down') Object.assign(T, { pelvisX: 1.5, bodyY: 0.15, hipLx: 0.1, hipRx: 0.05, knL: 0.35, knR: 0.15, shLx: -2.8, shRx: -2.6, shLz: 0.3, shRz: -0.2, elL: -0.3, elR: -0.2, spineX: 0, headX: -0.7, chestY: 0, pelvisY: 0 });
  if (m === 'cheer') {
    const p2 = Math.sin(A.t * 9);
    Object.assign(T, { hipLx: -0.1, hipRx: 0.05, knL: 0.15 + Math.max(0, p2) * 0.6, knR: 0.15 + Math.max(0, p2) * 0.6, shLz: 2.65, shRz: -2.65, shLx: -0.25 + p2 * 0.2, shRx: -0.25 - p2 * 0.2, elL: -0.35, elR: -0.35, spineX: -0.12, headX: 0.25, chestY: 0, pelvisY: 0 });
  }
  if (m === 'sad') Object.assign(T, { hipLx: -0.05, hipRx: 0, knL: 0.12, knR: 0.1, spineX: 0.35, headX: 0.45, shLx: 0.1, shRx: 0.1, shLz: 0.05, shRz: -0.05, elL: -0.1, elR: -0.1, chestY: 0, pelvisY: 0 });
  if (m === 'pose') Object.assign(T, { hipLx: -0.05, hipRx: 0.05, hipLz: 0.12, hipRz: -0.12, knL: 0.06, knR: 0.06, spineX: 0, shLz: 0.25, shRz: -0.25, shLx: 0.05, shRx: 0.05, elL: -0.15, elR: -0.15, headX: -0.05 });
  if (m === 'arms') Object.assign(T, { hipLx: -0.05, hipRx: 0.05, hipLz: 0.12, hipRz: -0.12, knL: 0.06, knR: 0.06, spineX: -0.02, shLx: -1.0, shRx: -1.0, shLz: -0.55, shRz: 0.55, elL: -1.9, elR: -1.9, headX: -0.08 });
  if (m === 'hold') Object.assign(T, { hipLx: -0.05, hipRx: 0.05, hipLz: 0.1, hipRz: -0.1, knL: 0.08, knR: 0.06, spineX: 0.02, shLz: 0.18, shLx: 0.05, elL: -0.2, shRx: -0.7, shRz: -0.15, elR: -1.25, headX: -0.05 });
  // ---- baseball ----
  if (m === 'pitch') Object.assign(T, kf(KF_PITCH, pose.t || 0));
  if (m === 'throwOH') Object.assign(T, kf(KF_THROW, pose.t || 0));
  if (m === 'swing' || m === 'stance' || m === 'bunt') Object.assign(T, kf(m === 'bunt' ? KF_BUNT : KF_SWING, m === 'stance' ? (pose.load || 0) * 0.25 : pose.t || 0));
  if (m === 'set') Object.assign(T, KF_PITCH[0][1], { spineX: 0.08 + Math.sin(A.t * 1.3) * 0.01, hipLx: 0, hipRx: 0, pelvisY: 0, chestY: 0 });
  if (m === 'squat') Object.assign(T, { hipLx: -1.75, hipRx: -1.75, hipLz: 0.5, hipRz: -0.5, knL: 2.35, knR: 2.35, spineX: 0.35, headX: -0.3, shLx: -1.25, shLz: 0.2, elL: -0.35, shRx: -0.2, shRz: -0.25, elR: -1.2, bodyY: 0.47, chestY: 0, pelvisY: 0 });
  if (m === 'ump') Object.assign(T, { hipLx: -0.75, hipRx: -0.75, hipLz: 0.32, hipRz: -0.32, knL: 1.25, knR: 1.25, spineX: 0.55, headX: -0.5, shLx: -0.5, shRx: -0.5, shLz: 0.25, shRz: -0.25, elL: -0.7, elR: -0.7, chestY: 0, pelvisY: 0 });
  if (m === 'ready') { const b = Math.sin(A.t * 3) * 0.03; Object.assign(T, { hipLx: -0.5, hipRx: -0.5, hipLz: 0.22, hipRz: -0.22, knL: 0.9, knR: 0.9, spineX: 0.55 + b, headX: -0.5, shLx: -0.7, shRx: -0.6, shLz: 0.25, shRz: -0.25, elL: -0.6, elR: -0.6, chestY: 0, pelvisY: 0 }); }
  if (m === 'scoop') Object.assign(T, { hipLx: -0.9, hipRx: -0.4, hipLz: 0.35, hipRz: -0.35, knL: 1.3, knR: 1.0, spineX: 0.95, headX: -0.75, shLx: -1.2, shRx: -1.1, shLz: 0.1, shRz: -0.1, elL: -0.15, elR: -0.3, chestY: 0, pelvisY: 0 });
  if (m === 'lead') Object.assign(T, { hipLx: -0.3, hipRx: -0.3, hipLz: 0.3, hipRz: -0.3, knL: 0.6, knR: 0.6, spineX: 0.4, headX: -0.35, shLx: -0.2, shRx: -0.2, shLz: 0.35, shRz: -0.35, elL: -0.5, elR: -0.5, chestY: 0, pelvisY: 0 });
  if (m === 'slide') Object.assign(T, { pelvisX: -1.2, bodyY: 0.3, hipLx: -1.3, hipRx: -0.6, knL: 0.2, knR: 1.6, spineX: -0.3, headX: 0.6, shLx: -2.6, shRx: -2.4, shLz: 0.3, shRz: -0.3, elL: -0.2, elR: -0.2, chestY: 0, pelvisY: 0 });
  if (m === 'clap') { const c2 = Math.sin(A.t * 14); Object.assign(T, { shLx: -1.2, shRx: -1.2, shLz: -0.25 - c2 * 0.15, shRz: 0.25 + c2 * 0.15, elL: -1.0, elR: -1.0, spineX: 0.05, chestY: 0, pelvisY: 0 }); }
  if (m === 'point') Object.assign(T, { shRx: -2.6, shRz: -0.3, elR: -0.1, shLx: -0.2, elL: -0.4, chestY: 0, pelvisY: 0 });

  const k = pose.snap ? 1 : 1 - Math.exp(-dt * 18);
  const r = (o, ax, v) => { o.rotation[ax] += (v - o.rotation[ax]) * k; };
  r(P.hipL, 'x', T.hipLx); r(P.hipR, 'x', T.hipRx); r(P.hipL, 'z', T.hipLz); r(P.hipR, 'z', T.hipRz);
  r(P.knL, 'x', T.knL); r(P.knR, 'x', T.knR);
  r(P.shL, 'x', T.shLx); r(P.shR, 'x', T.shRx); r(P.shL, 'z', T.shLz); r(P.shR, 'z', T.shRz);
  r(P.elL, 'x', T.elL); r(P.elR, 'x', T.elR);
  r(P.torso, 'x', T.spineX); r(P.torso, 'y', T.spineY); r(P.chest, 'y', T.chestY); r(P.chest, 'x', T.chestX);
  r(P.body, 'y', T.pelvisY); r(P.body, 'x', T.pelvisX); r(P.body, 'z', T.pelvisZ);
  r(P.head, 'x', T.headX); r(P.head, 'y', T.headY);
  // feet stay flat
  P.ftL.rotation.x = -(P.hipL.rotation.x + P.knL.rotation.x) * 0.92 - P.body.rotation.x * 0.3;
  P.ftR.rotation.x = -(P.hipR.rotation.x + P.knR.rotation.x) * 0.92 - P.body.rotation.x * 0.3;
  // keep the planted foot on the ground
  const ext = Math.max(legExt(P.hipL.rotation.x, P.knL.rotation.x) * Math.cos(P.hipL.rotation.z), legExt(P.hipR.rotation.x, P.knR.rotation.x) * Math.cos(P.hipR.rotation.z));
  const groundY = 0.05 + ext + 0.085;
  const y = T.bodyY ?? groundY;
  P.body.position.y += (y - P.body.position.y) * (T.bodyY != null ? k : 1);
  if (P.batPivot) batPose(P, pose);
}

// ---------------- portraits (card art) ----------------
let pr = null;
const portraitCache = new Map();
function portraitRig() {
  if (pr) return pr;
  const cv = document.createElement('canvas'); cv.width = 300; cv.height = 360;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return null; }
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#3a3f4a', 1.1));
  const key = new THREE.DirectionalLight('#fff1dc', 3.2); key.position.set(1.6, 2.4, 2.6); scene.add(key);
  const fill = new THREE.DirectionalLight('#bcd6ff', 0.9); fill.position.set(-2.5, 1, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight('#ffffff', 2.4); rim.position.set(-1.5, 2.2, -2.5); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(24, 300 / 360, 0.3, 60);
  pr = { renderer, scene, cam }; return pr;
}
export function portrait(card, team) {
  const L = card.look;
  const key = [card.id, team.c1, team.c2, card.num, L.hair, L.skin, L.hairC, L.beard, L.band].join('|');
  if (portraitCache.has(key)) return portraitCache.get(key);
  const R = portraitRig(); if (!R) return '';
  const P = makeAthlete(card, team, { head: 'cap', uni: uniform(team, 'home') });
  for (let i = 0; i < 20; i++) animate(P, { mode: 'pose', speed: 0 }, 0.1);
  P.root.rotation.y = -0.32;
  R.scene.add(P.root); P.root.updateMatrixWorld(true);
  const y = 1.5 * L.h * FT;
  R.cam.position.set(0.6, y + 0.4, 7.7); R.cam.lookAt(0, y - 0.3, 0);
  R.renderer.render(R.scene, R.cam);
  const url = R.renderer.domElement.toDataURL('image/png');
  R.scene.remove(P.root);
  portraitCache.set(key, url);
  return url;
}

// ---------------- baseball keyframes ----------------
const BASE = { hipLx: 0, hipRx: 0, hipLz: 0.03, hipRz: -0.03, knL: 0.05, knR: 0.05, shLx: 0, shRx: 0, shLz: 0.1, shRz: -0.1, elL: -0.25, elR: -0.25, spineX: 0.02, spineY: 0, chestY: 0, chestX: 0, pelvisY: 0, pelvisX: 0, pelvisZ: 0, headX: 0, headY: 0 };
function kf(list, t) {
  let i = 0; while (i < list.length - 2 && t > list[i + 1][0]) i++;
  const [t0, a] = list[i], [t1, b] = list[i + 1];
  const u = sstep(0, 1, Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1))));
  const o = {};
  for (const k of Object.keys(BASE)) o[k] = mix(a[k] ?? BASE[k], b[k] ?? BASE[k], u);
  return o;
}
// right-handed pitcher facing +z (home plate). Ball leaves the hand at t = PITCH_RELEASE
export const PITCH_RELEASE = 0.72;
const KF_PITCH = [
  [0, { shLx: -0.75, shLz: -0.15, elL: -1.7, shRx: -0.7, shRz: 0.15, elR: -1.7, knL: 0.12, knR: 0.12, spineX: 0.08, headY: 0 }],
  [0.3, { hipLx: -1.55, knL: 1.7, hipRx: 0.02, knR: 0.25, pelvisY: -0.75, chestY: -0.55, spineX: -0.05, shLx: -0.8, shLz: -0.1, elL: -1.6, shRx: -0.75, shRz: 0.1, elR: -1.6, headY: 0.95 }],
  [0.55, { hipLx: -1.0, knL: 0.55, hipLz: 0.25, hipRx: 0.45, knR: 0.55, hipRz: -0.2, pelvisY: -0.35, chestY: -0.7, spineX: 0.05, shLx: -1.4, shLz: 0.35, elL: -0.4, shRx: 0.9, shRz: -1.35, elR: -1.5, headY: 0.7 }],
  [0.72, { hipLx: -0.95, knL: 0.35, hipLz: 0.2, hipRx: 0.55, knR: 0.8, hipRz: -0.15, pelvisY: 0.2, chestY: 0.45, spineX: 0.65, shLx: -0.3, shLz: 0.2, elL: -1.8, shRx: -2.5, shRz: -0.55, elR: -0.15, headY: 0, headX: -0.45 }],
  [1, { hipLx: -0.55, knL: 0.45, hipRx: -0.45, knR: 1.0, pelvisY: 0.35, chestY: 0.7, spineX: 0.85, shLx: -0.2, shLz: 0.3, elL: -1.6, shRx: -0.5, shRz: 0.55, elR: -0.7, headX: -0.4 }],
];
export const THROW_RELEASE = 0.6;
const KF_THROW = [
  [0, { hipLx: -0.3, knL: 0.4, hipRx: -0.2, knR: 0.45, spineX: 0.3, shLx: -0.9, elL: -1.2, shRx: -0.8, elR: -1.4 }],
  [0.35, { hipLx: -0.7, knL: 0.4, hipLz: 0.2, hipRx: 0.35, knR: 0.5, pelvisY: -0.5, chestY: -0.7, spineX: 0.1, shLx: -1.5, shLz: 0.3, elL: -0.3, shRx: 1.0, shRz: -1.3, elR: -1.5, headY: 0.7 }],
  [0.6, { hipLx: -0.8, knL: 0.3, hipRx: 0.5, knR: 0.7, pelvisY: 0.2, chestY: 0.45, spineX: 0.55, shLx: -0.3, elL: -1.7, shRx: -2.5, shRz: -0.5, elR: -0.15, headY: 0 }],
  [1, { hipLx: -0.4, knL: 0.4, hipRx: -0.3, knR: 0.8, pelvisY: 0.3, chestY: 0.6, spineX: 0.6, shLx: -0.2, elL: -1.4, shRx: -0.6, shRz: 0.5, elR: -0.6 }],
];
// right-handed batter facing +z (the plate); pitcher is to his left (+x). Contact at t = SWING_CONTACT
export const SWING_CONTACT = 0.5;
const KF_SWING = [
  [0, { hipLx: -0.28, hipRx: -0.32, hipLz: 0.24, hipRz: -0.26, knL: 0.42, knR: 0.48, spineX: 0.28, chestY: -0.22, pelvisY: -0.08, headY: 1.15, headX: -0.1 }],
  [0.25, { hipLx: -0.45, hipRx: -0.3, hipLz: 0.38, hipRz: -0.26, knL: 0.5, knR: 0.55, spineX: 0.3, chestY: -0.38, pelvisY: -0.15, headY: 1.2, headX: -0.1 }],
  [0.5, { hipLx: -0.4, hipRx: -0.1, hipLz: 0.36, hipRz: -0.12, knL: 0.2, knR: 0.8, spineX: 0.3, chestY: 0.45, pelvisY: 0.85, headY: 0.3, headX: -0.1 }],
  [1, { hipLx: -0.3, hipRx: 0.1, hipLz: 0.3, hipRz: 0.0, knL: 0.15, knR: 0.9, spineX: 0.12, chestY: 0.95, pelvisY: 1.2, headY: 0.0 }],
];
const KF_BUNT = [
  [0, KF_SWING[0][1]],
  [0.4, { hipLx: -0.5, hipRx: -0.5, hipLz: 0.3, hipRz: -0.3, knL: 0.8, knR: 0.8, spineX: 0.35, pelvisY: 0.7, chestY: 0.5, headY: 0.3 }],
  [1, { hipLx: -0.5, hipRx: -0.5, hipLz: 0.3, hipRz: -0.3, knL: 0.8, knR: 0.8, spineX: 0.35, pelvisY: 0.75, chestY: 0.55, headY: 0.3 }],
];
// bat path: [t, psi (barrel yaw, 0 = over the plate, + toward pitcher), e (elevation), hands x, y, z] in root frame meters
const KB_SWING = [
  [0, -2.0, 1.05, -0.17, 1.42, 0.0],
  [0.25, -2.15, 0.95, -0.2, 1.36, -0.04],
  [0.4, -1.35, 0.25, -0.06, 1.12, 0.14],
  [0.5, 0.0, 0.0, 0.06, 1.0, 0.34],
  [0.62, 1.35, 0.15, 0.24, 1.08, 0.2],
  [1, 2.7, 0.95, 0.02, 1.45, -0.12],
];
const KB_BUNT = [[0, -2.0, 1.05, -0.17, 1.42, 0.0], [0.4, 0.15, 0.12, 0.05, 1.05, 0.38], [1, 0.15, 0.12, 0.05, 1.05, 0.38]];
function kb(list, t) {
  let i = 0; while (i < list.length - 2 && t > list[i + 1][0]) i++;
  const a = list[i], b = list[i + 1], u = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0] || 1)));
  return [1, 2, 3, 4, 5].map(j => mix(a[j], b[j], u));
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _h0 = new THREE.Vector3(), _bd = new THREE.Vector3();
function batPose(P, pose) {
  const m = pose.mode;
  let k;
  if (m === 'swing') k = kb(KB_SWING, pose.t || 0);
  else if (m === 'stance') k = kb(KB_SWING, (pose.load || 0) * 0.25);
  else if (m === 'bunt') k = kb(KB_BUNT, pose.t || 0);
  else { P.batPivot.visible = false; return; }
  P.batPivot.visible = true;
  let [psi, e, hx, hy, hz] = k;
  if (m === 'swing' || m === 'bunt') { // aim the barrel at the pitch near contact (pose.dy meters, + = high; pose.dz = reach)
    const near = Math.max(0, 1 - Math.abs((pose.t || 0) - 0.5) / 0.22);
    const dy = pose.dy || 0;
    hy += dy * 0.55 * near; e += (dy < 0 ? dy * 1.1 : dy * 0.3) * near;
    hz += (pose.dz || 0) * near;
  }
  P.batPivot.position.set(hx, hy, hz);
  P.batPivot.rotation.set(Math.PI / 2 - e, psi, 0);
  P.root.updateMatrixWorld(true);
  _bd.set(0, 1, 0).applyQuaternion(P.batPivot.quaternion);
  ikArm(P, 'R', _v.copy(P.batPivot.position).addScaledVector(_bd, 0.13));
  ikArm(P, 'L', _w.copy(P.batPivot.position).addScaledVector(_bd, 0.04));
}
// place a hand (side 'L'|'R') at a target given in flip-group space (meters)
function ikArm(P, side, target) {
  const sh = P['sh' + side], el = P['el' + side];
  const tw = P.flip.localToWorld(target.clone());
  const t = sh.parent.worldToLocal(tw).sub(sh.position);
  const u = LEN.upper, f = LEN.fore;
  const d = Math.min(t.length(), (u + f) * 0.995);
  const bend = Math.PI - Math.acos(Math.max(-1, Math.min(1, (u * u + f * f - d * d) / (2 * u * f))));
  el.rotation.set(-bend, 0, 0);
  _h0.set(0, -u - f * Math.cos(bend), f * Math.sin(bend)).normalize();
  _q.setFromUnitVectors(_h0, t.normalize());
  sh.quaternion.copy(_q);
}
