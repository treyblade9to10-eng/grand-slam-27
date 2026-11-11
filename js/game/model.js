// MLB Grand Slam 27 - 3D ballplayers (skinned bodies from HUCK), faces, uniforms, gear, animation
import * as THREE from '../lib/three.min.js';
import * as HUM from './human.js';
import { logoImg, loadLogo, onLogo, realLogos } from '../logos.js';
import { Settings } from '../store.js';
export const SKINS = ['#f0cfb6', '#e2ba9e', '#cfa083', '#bb8766', '#a67353', '#8e5e42', '#7a4c34', '#68402b'];
export const HAIRC = ['#1b1210','#2e1d14','#4a2d1a','#6b4423','#a5753c','#d8b26a','#b04a24','#888888'];
export const SKINMAP = [0, 1, 2, 4, 5, 7];

const matCache = new Map();
export function M(color, rough = 0.7, extra = {}) {
  const k = color + '|' + rough + '|' + JSON.stringify(extra);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  return matCache.get(k);
}
const geoCache = new Map();
const G = (k, f) => { if (!geoCache.has(k)) { const g = f(); g.userData.k = k; geoCache.set(k, g); } return geoCache.get(k); };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function shade(hex, f, toward = '#000000') { const c = new THREE.Color(hex), d = new THREE.Color(toward); c.lerp(d, f); return '#' + c.getHexString(); }

// ---------------- skeleton ----------------
// index: 0 pelvis 1 spine 2 chest 3 neck 4 head 5 shL 6 elL 7 handL 8 shR 9 elR 10 handR 11 hipL 12 knL 13 ftL 14 hipR 15 knR 16 ftR
const LEN = { thigh: 0.44, shin: 0.42, ankle: 0.09, upper: 0.29, fore: 0.26, hipOff: 0.05, ankleH: 0.085 };
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
// sleeve: the cap over the deltoid stays partly with the chest so a raised arm doesn't pop a ball out of the shoulder
const SLEEVE = (side) => (y) => chainW(y, side ? [2, 5, 6, 7] : [2, 8, 9, 10], [[1.435, 0.045], [1.17, 0.035], [0.91, 0.02]]);
const LEG = (side) => (y) => chainW(y, side ? [0, 11, 12, 13] : [0, 14, 15, 16], [[0.945, 0.045], [0.51, 0.045], [0.09, 0.02]]);

// lathe-like tube with elliptical rings; prof = [[y, rx, rz, dz], ...] ascending y
function catmull(p, i, t) { const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[Math.min(p.length - 1, i + 1)], p3 = p[Math.min(p.length - 1, i + 2)]; const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
function tube(prof, { cx = 0, seg = 22, sub = 3, wfn, mat, a0 = -Math.PI / 2, uvMul = 1, uvAdd = 0 }) {
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
      const th = a0 + (j / seg) * Math.PI * 2;
      const x = cx + Math.sin(th) * rx, z = dz + Math.cos(th) * rz;
      pos.push(x, y, z); uv.push(j / seg * uvMul + uvAdd, (y - y0) / (y1 - y0 || 1));
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
// Canvas textures remember how they were drawn so they can be redrawn when fonts or real logos finish loading.
const texCache = new Map();
let _drawing = null; // texture being drawn: drawMark records which clubs' logos it is still waiting on
function canvasTex(key, w, h, draw, srgb = true) {
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.userData.waits = new Set(); t.userData.text = /^(j|sl|lg)/.test(key);
  t.userData.redraw = () => { const x = cv.getContext('2d'); x.clearRect(0, 0, w, h); t.userData.waits.clear(); _drawing = t; try { draw(x, w, h); } finally { _drawing = null; } t.needsUpdate = true; };
  t.userData.redraw();
  texCache.set(key, t); return t;
}
// redraw text textures once the web fonts are in, and logo textures as each real logo arrives
if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(() => { for (const t of texCache.values()) if (t.userData.text) t.userData.redraw(); });
onLogo((team) => { for (const t of texCache.values()) if (t.userData.waits.has(team.id)) t.userData.redraw(); });
// woven fabric: soft noise + fine twill, keeps whites from looking like plastic
function fabric(x, w, h, a = 0.07) {
  x.save(); x.globalAlpha = a;
  for (let i = 0; i < w; i += 3) for (let j = (i / 3) % 2 * 1.5; j < h; j += 3) { x.fillStyle = (i + j) % 2 ? '#000' : '#fff'; x.fillRect(i, j, 1.2, 1.2); }
  x.globalAlpha = a * 0.6; x.strokeStyle = '#000'; x.lineWidth = 0.6;
  for (let i = -h; i < w; i += 5) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke(); }
  x.restore();
}
const isLightC = (hex) => { const c = new THREE.Color(hex); return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.6; };
// real logo (or fallback letter mark) drawn into a box
function drawMark(x, team, kind, cx, cy, w, h, fill = '#fff', stroke = '#000') {
  const img = team && logoImg(team, kind);
  if (img) { const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1, s = Math.min(w / iw, h / ih); x.drawImage(img, cx - iw * s / 2, cy - ih * s / 2, iw * s, ih * s); return; }
  if (team && realLogos()) { loadLogo(team, kind); if (_drawing) _drawing.userData.waits.add(team.id); }
  const m = team ? (window.__teamMark ? window.__teamMark(team) : team.id) : '';
  x.save(); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  x.font = `900 italic ${h * (m.length > 2 ? 0.55 : m.length > 1 ? 0.75 : 0.95)}px "Barlow Condensed", "Arial Black", sans-serif`;
  const mw = x.measureText(m).width, sc = Math.min(1, w * 0.95 / (mw || 1));
  x.translate(cx, cy + h * 0.04); x.scale(sc, 1);
  x.lineWidth = h * 0.09; x.strokeStyle = stroke; x.strokeText(m, 0, 0); x.fillStyle = fill; x.fillText(m, 0, 0); x.restore();
}
// torso tube spans y J0..J1 (meters) top of canvas = J1
const J0 = 0.93, J1 = 1.525;
function jerseyTex(team, card, U) {
  const num = String(card.num ?? ''), name = (card.last || '').toUpperCase();
  return canvasTex('j' + U.key + '|' + num + name + (U.mirror ? 'm' : ''), 1024, 512, (x, W, H) => {
    const vy = (y) => H * (1 - (y - J0) / (J1 - J0));
    x.fillStyle = U.base; x.fillRect(0, 0, W, H);
    if (U.pin) { x.fillStyle = U.pinC || U.trim; x.globalAlpha = 0.75; for (let i = 3; i < W; i += 15) x.fillRect(i, 0, 1.6, H); x.globalAlpha = 1; }
    // soft folds + body shading baked lightly so the fabric reads
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,.05)'); gr.addColorStop(0.8, 'rgba(0,0,0,.0)'); gr.addColorStop(1, 'rgba(0,0,0,.16)'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    x.save(); x.globalAlpha = 0.05; x.strokeStyle = '#000'; x.lineWidth = 9;
    for (const [u, v0, v1] of [[0.14, 0.55, 0.95], [0.36, 0.55, 0.95], [0.6, 0.4, 0.9], [0.9, 0.4, 0.9]]) { x.beginPath(); x.moveTo(W * u, H * v0); x.quadraticCurveTo(W * (u + 0.02), H * (v0 + v1) / 2, W * (u - 0.01), H * v1); x.stroke(); }
    x.restore();
    fabric(x, W, H, 0.045);
    const tr = U.trim;
    // V neck showing the undershirt, piping around the collar and down the placket
    const fx = W * 0.25;
    x.fillStyle = U.under || tr; x.beginPath(); x.moveTo(fx - 46, 0); x.lineTo(fx, vy(1.43)); x.lineTo(fx + 46, 0); x.fill();
    x.strokeStyle = tr; x.lineWidth = 7; x.beginPath(); x.moveTo(fx - 50, 0); x.lineTo(fx, vy(1.425)); x.lineTo(fx + 50, 0); x.stroke();
    x.lineWidth = 5; x.beginPath(); x.moveTo(0, 3); x.lineTo(W, 3); x.stroke();
    if (U.piping) { x.lineWidth = 4; x.beginPath(); x.moveTo(fx + 6, vy(1.42)); x.lineTo(fx + 6, H); x.stroke(); }
    // placket seam + buttons
    x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 2; x.beginPath(); x.moveTo(fx - 7, vy(1.42)); x.lineTo(fx - 7, H); x.stroke();
    x.fillStyle = 'rgba(0,0,0,.28)'; for (let y = 1.39; y > J0; y -= 0.075) { x.beginPath(); x.arc(fx - 1, vy(y), 3.2, 0, 7); x.fill(); }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    const txt = (s, u, y, size, lw, maxW, opts = {}) => {
      if (!s) return;
      x.save(); x.translate(W * u, vy(y)); if (U.mirror) x.scale(-1, 1);
      x.font = `${opts.w || 900} italic ${size}px "Barlow Condensed", "Arial Black", sans-serif`;
      const mw = x.measureText(s).width, sc = Math.min(opts.sx || 1, maxW / (mw || 1));
      if (opts.rot) x.rotate(opts.rot);
      x.scale(sc, 1);
      if (opts.arc) { // arched wordmark: draw letter by letter on a gentle curve
        const chars = [...s]; let cur = -mw / 2; x.lineWidth = lw;
        for (const ch of chars) { const cw = x.measureText(ch).width, cxp = cur + cw / 2, yy = (cxp / (mw / 2 || 1)) ** 2 * opts.arc; x.strokeStyle = U.trim2 || tr; x.strokeText(ch, cxp, yy); cur += cw; }
        cur = -mw / 2; x.fillStyle = U.text; for (const ch of chars) { const cw = x.measureText(ch).width, cxp = cur + cw / 2, yy = (cxp / (mw / 2 || 1)) ** 2 * opts.arc; x.fillText(ch, cxp, yy); cur += cw; }
        if (opts.tail) { x.strokeStyle = U.text; x.lineWidth = size * 0.07; x.lineCap = 'round'; x.beginPath(); x.moveTo(-mw * 0.35, size * 0.55); x.quadraticCurveTo(mw * 0.1, size * 0.75, mw * 0.55, size * 0.3); x.stroke(); }
      } else {
        x.lineWidth = lw; x.strokeStyle = U.trim2 || tr; x.strokeText(s, 0, 0);
        if (opts.shadow) { x.lineWidth = lw * 0.45; x.strokeStyle = opts.shadow; x.strokeText(s, 0, 0); }
        x.fillStyle = U.text; x.fillText(s, 0, 0);
      }
      x.restore();
    };
    // front: chest wordmark (or a chest logo), small front number
    if (U.chestLogo) {
      x.save(); x.translate(W * 0.31, vy(1.33)); if (U.mirror) x.scale(-1, 1); drawMark(x, team, 'cap', 0, 0, 92, 92, U.text, U.trim2 || tr); x.restore();
    } else txt(U.word, 0.25, 1.31, 104, 9, 300, { arc: 14, tail: U.tail, rot: -0.05, sx: 0.95 });
    if (U.frontNum !== false) txt(num, U.chestLogo ? 0.31 : 0.315, 1.155, 64, 7, 80);
    // back: name arched over a big number
    txt(name, 0.75, 1.405, 46, 5, 250, { arc: 8, w: 800 });
    txt(num, 0.75, 1.235, 168, 12, 230, { sx: 0.95 });
  });
}
function sleeveTex(team, U, patch) {
  return canvasTex('sl' + U.key + (patch ? 'P' : '') + (U.mirror ? 'm' : ''), 512, 256, (x, W, H) => {
    x.fillStyle = U.base; x.fillRect(0, 0, W, H);
    if (U.pin) { x.fillStyle = U.pinC || U.trim; x.globalAlpha = 0.75; for (let i = 3; i < W; i += 8) x.fillRect(i, 0, 1, H); x.globalAlpha = 1; }
    fabric(x, W, H, 0.045);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,.05)'); g.addColorStop(1, 'rgba(0,0,0,.12)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    // trim bands at the hem
    x.fillStyle = U.trim; x.fillRect(0, H * 0.86, W, H * 0.07);
    if (U.trim2 && U.trim2 !== U.trim) { x.fillStyle = U.trim2; x.fillRect(0, H * 0.8, W, H * 0.035); }
    if (patch) { // club patch on the outside of the sleeve (u = .5)
      x.save(); x.translate(W * 0.5, H * 0.42); if (U.mirror) x.scale(-1, 1);
      drawMark(x, team, 'primary', 0, 0, 96, 96, U.text, U.trim2 || U.trim); x.restore();
    }
  });
}
function pantsTex(U) {
  const t = canvasTex('pa' + U.key, 256, 256, (x, W, H) => {
    x.fillStyle = U.pants; x.fillRect(0, 0, W, H);
    if (U.pin) { x.fillStyle = U.pinC || U.trim; x.globalAlpha = 0.75; for (let i = 3; i < W; i += 7) x.fillRect(i, 0, 1, H); x.globalAlpha = 1; }
    fabric(x, W, H, 0.05);
    if (U.stripe) { x.fillStyle = U.trim; x.fillRect(W * 0.5 - 5, 0, 10, H); if (U.trim2 && U.trim2 !== U.trim) { x.fillStyle = U.trim2; x.fillRect(W * 0.5 - 1.5, 0, 3, H); } }
  });
  t.wrapS = THREE.RepeatWrapping; return t;
}
function sockTex(U) {
  return canvasTex('so' + U.key, 128, 256, (x, W, H) => {
    x.fillStyle = U.sock; x.fillRect(0, 0, W, H); fabric(x, W, H, 0.06);
    if (U.sockStripe) { x.fillStyle = U.sockStripe; x.fillRect(0, H * 0.08, W, H * 0.07); x.fillRect(0, H * 0.2, W, H * 0.04); }
  });
}
const hairTex = () => canvasTex('hairstrands', 256, 256, (x, W, H) => {
  x.fillStyle = '#d0d0d0'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 3200; i++) { const v = 130 + Math.random() * 125 | 0; x.strokeStyle = `rgb(${v},${v},${v})`; x.globalAlpha = 0.55; x.lineWidth = 1; const px = Math.random() * W, py = Math.random() * H; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 4, py + 8 + Math.random() * 14); x.stroke(); }
  x.globalAlpha = 1;
});
const stubbleTex = () => canvasTex('stubble', 256, 256, (x, W, H) => {
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { const v = Math.random() * 120 | 0; x.fillStyle = `rgb(${v},${v},${v})`; x.globalAlpha = 0.5; x.fillRect(Math.random() * W, Math.random() * H, 1.3, 1.3); }
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
  for (const sx of [-1, 1]) {
    bump(p, 0.55 * sx, -0.05, 0.75, 0.4, 0.045);   // cheekbones
    bump(p, 0.38 * sx, 0.1, 0.9, 0.26, -0.07);      // eye sockets
    bump(p, 0.5 * sx, -0.62, 0.55, 0.35, 0.03);     // jaw corners
  }
  bump(p, 0, 0.27, 0.92, 0.5, 0.03);                // brow ridge
  bump(p, 0, -0.8, 0.6, 0.38, 0.06);                // chin
  if (p.y < 0) { p.x *= 1 + 0.17 * p.y; if (p.z < 0) p.z *= 1 + 0.45 * p.y; }
  if (p.z > 0.3) { // nose, lips and philtrum sculpted into the face (no stuck-on parts)
    const x = p.x, y = p.y, g = (v, w) => Math.exp(-(v * v) / (w * w));
    const ny = sstep(0.32, 0.12, y) * sstep(-0.3, -0.18, y);           // bridge -> tip
    const tip = g(y + 0.2, 0.07);
    const nose = ny * g(x, 0.085 + 0.08 * sstep(0.1, -0.2, y)) * (0.06 + 0.19 * sstep(0.25, -0.17, y)) + tip * g(x, 0.14) * 0.05;
    const alae = g(y + 0.21, 0.06) * (g(x - 0.14, 0.075) + g(x + 0.14, 0.075)) * 0.07;
    const lipU = g(y + 0.335, 0.045) * g(x, 0.21) * 0.06, lipL = g(y + 0.43, 0.05) * g(x, 0.18) * 0.065;
    const groove = g(y + 0.38, 0.018) * g(x, 0.22) * 0.03;
    const k = sstep(0.3, 0.6, p.z);
    p.z += (nose + alae + lipU + lipL - groove) * k;
  }
  if (p.y < -0.6 && p.z > 0) p.z += 0.12 * ((-p.y - 0.6) / 0.4) * p.z;
  if (p.z > 0.5) p.z = 0.5 + (p.z - 0.5) * 0.8;
  if (p.y > 0 && p.z < 0) p.z *= 1.06;
  p.set(p.x * HS.rx, p.y * HS.ry + HS.oy, p.z * HS.rz + HS.oz);
  return p;
}
function shellGeo(key, scale, keep, ws = 40, hs = 28, noise = 0, uvRep = true, alphaFn = null) {
  return G(key, () => {
    const g = new THREE.SphereGeometry(1, ws, hs);
    const pos = g.attributes.position, uv = g.attributes.uv, n = pos.count;
    const okV = new Uint8Array(n), v = new THREE.Vector3(), c = new THREE.Vector3(0, HS.oy, HS.oz), col = alphaFn ? new Float32Array(n * 4) : null;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i); okV[i] = keep(v) ? 1 : 0;
      if (col) { const a = alphaFn(v); col.set([1, 1, 1, a], i * 4); if (a > 0.01) okV[i] = 1; }
      let sc = scale; if (noise) sc += noise * (Math.sin(v.x * 23) * Math.sin(v.y * 21 + 1) * Math.sin(v.z * 25 + 2));
      const p = headPoint(v.clone()); p.sub(c).multiplyScalar(sc).add(c);
      pos.setXYZ(i, p.x, p.y, p.z); if (uvRep) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 2);
    }
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const idx = g.index.array, keepIdx = [];
    for (let i = 0; i < idx.length; i += 3) if (col ? (okV[idx[i]] || okV[idx[i + 1]] || okV[idx[i + 2]]) : (okV[idx[i]] && okV[idx[i + 1]] && okV[idx[i + 2]])) keepIdx.push(idx[i], idx[i + 1], idx[i + 2]);
    g.setIndex(keepIdx); g.computeVertexNormals();
    const nn = g.attributes.normal;
    for (let r = 0; r <= hs; r++) { const a = r * (ws + 1), b = a + ws; const x = (nn.getX(a) + nn.getX(b)) / 2, y = (nn.getY(a) + nn.getY(b)) / 2, z = (nn.getZ(a) + nn.getZ(b)) / 2; nn.setXYZ(a, x, y, z); nn.setXYZ(b, x, y, z); }
    return g;
  });
}
const headGeo = () => shellGeo('head3', 1, () => true, 60, 44, 0, false);
// head-local point -> uv on the head sphere (approximate inverse of headPoint)
function headUV(x, y, z) {
  let ux = x / HS.rx, uy = (y - HS.oy) / HS.ry, uz = (z - HS.oz) / HS.rz; const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
  let u = Math.atan2(uz, -ux) / (Math.PI * 2); if (u < 0) u += 1;
  return [u, Math.acos(Math.max(-1, Math.min(1, uy))) / Math.PI]; // [u, canvas y fraction from top]
}
// painted face: skin tone variation, brows, lash lines, lips, cheek warmth, stubble shadow
function faceTex(skinHex, look) {
  const key = 'face' + skinHex + look.hairC + (look.beard || 0) + (look.stub || 0);
  return canvasTex(key, 1024, 512, (x, W, H) => {
    const sk = new THREE.Color(skinHex), dark = sk.r < 0.45;
    x.fillStyle = skinHex; x.fillRect(0, 0, W, H);
    // subtle pores / tone noise
    x.save(); for (let i = 0; i < 5000; i++) { x.globalAlpha = 0.04; x.fillStyle = Math.random() < 0.5 ? '#000' : '#fff'; x.fillRect(Math.random() * W, Math.random() * H, 2, 2); } x.restore();
    const P = (px, py, pz) => { const [u, v] = headUV(px, py, pz); return [u * W, v * H]; };
    const blob = (px, py, pz, rx, ry, col, a) => { const [cx, cy] = P(px, py, pz); const g = x.createRadialGradient(cx, cy, 0, cx, cy, rx); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.globalAlpha = a; x.translate(cx, cy); x.scale(1, ry / rx); x.translate(-cx, -cy); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rx, 0, 7); x.fill(); x.restore(); };
    const warm = '#' + sk.clone().lerp(new THREE.Color('#c0503c'), 0.5).getHexString();
    const shadeC = '#' + sk.clone().multiplyScalar(0.55).getHexString();
    for (const sx of [-1, 1]) {
      blob(sx * 0.05, 0.09, 0.085, 34, 22, warm, dark ? 0.18 : 0.35);           // cheeks
      blob(sx * 0.031, 0.128, 0.08, 30, 20, shadeC, 0.55);                     // eye socket shadow
      blob(sx * 0.03, 0.142, 0.085, 26, 10, shadeC, 0.35);                      // crease above the eye
    }
    blob(0, 0.03, 0.09, 30, 16, shadeC, 0.25);    // under the lips / chin dimple
    for (const sx of [-1, 1]) blob(sx * 0.0105, 0.087, 0.1, 7, 5, '#1a0d08', 0.5); // nostrils
    blob(0, 0.07, 0.1, 24, 6, shadeC, 0.4);      // mouth line
    // stubble / beard shadow
    if (look.beard || look.stub) {
      const hc = HAIRC[look.hairC];
      x.save(); x.globalAlpha = (look.beard ? 0.3 : 0.16) * (dark ? 0.6 : 1); x.fillStyle = hc;
      const pts = [[0.07, 0.11, 0.03], [0.065, 0.06, 0.06], [0.04, 0.035, 0.085], [0, 0.02, 0.098], [-0.04, 0.035, 0.085], [-0.065, 0.06, 0.06], [-0.07, 0.11, 0.03]];
      x.beginPath(); pts.forEach((p, i) => { const [a, b] = P(...p); i ? x.lineTo(a, b) : x.moveTo(a, b); });
      const back = [[-0.06, 0.09, 0.05], [-0.03, 0.08, 0.09], [0, 0.083, 0.1], [0.03, 0.08, 0.09], [0.06, 0.09, 0.05]];
      back.forEach(p => { const [a, b] = P(...p); x.lineTo(a, b); }); x.closePath(); x.filter = 'blur(6px)'; x.fill(); x.restore();
    }
    // lips
    x.save(); x.globalAlpha = dark ? 0.35 : 0.5; x.fillStyle = '#' + sk.clone().lerp(new THREE.Color('#9c3f3a'), 0.45).getHexString();
    { const [a, b] = P(0, 0.07, 0.098); x.beginPath(); x.ellipse(a, b, 22, 7, 0, 0, 7); x.fill(); }
    x.restore();
    // brows
    x.save(); x.strokeStyle = HAIRC[look.hairC]; x.lineCap = 'round'; x.globalAlpha = 0.85;
    for (const sx of [-1, 1]) {
      const a = P(sx * 0.014, 0.148, 0.094), b = P(sx * 0.034, 0.153, 0.09), c = P(sx * 0.052, 0.147, 0.077);
      x.lineWidth = 7; x.globalAlpha = 0.55; x.beginPath(); x.moveTo(...a); x.quadraticCurveTo(...b, ...c); x.stroke();
    }
    x.restore();
  });
}
function hairline(v, front = 0.42, side = 0.05, back = -0.5) {
  const c = Math.cos(ang(v));
  const hl = c > 0 ? mix(side, front, Math.pow(c, 1.4)) : mix(side, back, -c);
  return v.y > hl;
}
const ang = (v) => Math.atan2(v.x, v.z);
function addHair(head, look, capped, lod = 1) {
  const col = HAIRC[look.hairC], s = look.hair;
  const hm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, map: hairTex() });
  const add = (g, m = hm) => { const x = new THREE.Mesh(g, m); x.castShadow = true; head.add(x); return x; };
  if (s === 'bald') return;
  if (capped) { // under a cap/helmet only the sides and back show; the shell is cut at the band so nothing pokes through
    const thick = s === 'buzz' || s === 'fade' || s === 'crop' ? 1.012 : 1.035;
    const hf = (v) => { const c = Math.cos(ang(v)); const hl = c > 0 ? mix(0.06, 0.42, Math.pow(c, 1.4)) : mix(0.06, -0.5, -c); return sstep(hl - 0.02, hl + 0.1, v.y) * sstep(0.62, 0.45, v.y) * (s === 'buzz' || s === 'fade' ? 0.75 : 1); };
    add(shellGeo('h_capf' + thick + s + lod, thick, () => false, lod ? 40 : 26, lod ? 30 : 20, 0.008, true, hf), new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, map: hairTex(), transparent: true, vertexColors: true, depthWrite: false }));
    if (s === 'long') { const back = add(G('h_drape', () => { const g = new THREE.CylinderGeometry(0.075, 0.09, 0.17, 18, 1, true, Math.PI * 0.55, Math.PI * 0.9); g.translate(0, -0.02, -0.005); return g; })); back.position.set(0, 0.07, 0); back.material = hm.clone(); back.material.side = THREE.DoubleSide; }
    if (s === 'curly' || s === 'afro' || s === 'braids') add(shellGeo('h_capcurl', 1.08, (v) => hairline(v, 0.42, -0.1, -0.6) && v.y < 0.3 && Math.cos(ang(v)) < 0.3, 40, 28, 0.05));
    return;
  }
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
}
// skin: a touch of emissive warmth so faces never go black under brims / at night (cheap stand-in for subsurface)
function skinMat(hex, map = null) {
  const k = 'skin' + hex + (map ? map.uuid : '');
  if (matCache.has(k)) return matCache.get(k);
  const c = new THREE.Color(hex);
  const m = new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : hex, map, roughness: 0.58, emissive: c.clone().multiplyScalar(c.r < 0.2 ? 0.22 : 0.12), emissiveMap: map });
  matCache.set(k, m); return m;
}
// merge mirrored left/right copies of small face parts into one geometry (fewer draw calls)
const _m4 = new THREE.Matrix4(), _e = new THREE.Euler(), _qq = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
function pairGeo(key, items) {
  return G('pair' + key, () => {
    const list = [];
    for (const [mk, x, y, z, rx = 0, ry = 0, rz = 0, mir = [0, 1, 1]] of items) for (const sx of [-1, 1]) {
      const g = mk().clone(); _qq.setFromEuler(_e.set(rx, ry * (mir[1] && sx < 0 ? -1 : 1), rz * (mir[2] && sx < 0 ? -1 : 1)));
      g.applyMatrix4(_m4.compose(_p.set(sx * x, y, z), _qq, _one)); list.push(g.index ? g.toNonIndexed() : g);
    }
    for (const g of list) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); }
    return THREE.mergeGeometries(list);
  });
}
function buildHead(head, look, skinHex, capped, lod = 1) {
  const face = faceTex(skinHex, look);
  const skin = skinMat(skinHex), fskin = skinMat(skinHex, face);
  const h = new THREE.Mesh(lod ? headGeo() : shellGeo('head3lo', 1, () => true, 36, 28, 0, false), fskin); h.castShadow = true; head.add(h);
  const white = M('#eeeae2', 0.2), irisC = ['#3b2414', '#2a1a0e', '#4a6a2a', '#3a6a9a', '#5a3a1a'][look.skin < 3 ? (look.hairC + look.skin) % 5 : (look.hairC % 2)];
  const add = (g, m) => { const o = new THREE.Mesh(g, m); head.add(o); return o; };
  const sg = lod ? 1 : 0.6, S = (n) => Math.max(4, Math.round(n * sg));
  add(pairGeo('eyes' + lod, [[() => new THREE.SphereGeometry(0.0128, S(14), S(10)), 0.031, 0.127, 0.078]]), white);
  add(pairGeo('iris' + lod, [[() => { const g = new THREE.SphereGeometry(0.0078, S(12), S(8)); g.scale(1, 1, 0.42); return g; }, 0.031, 0.1272, 0.0898]]), M(irisC, 0.15));
  add(pairGeo('pupil' + lod, [[() => { const g = new THREE.SphereGeometry(0.0038, 8, 6); g.scale(1, 1, 0.4); return g; }, 0.031, 0.1272, 0.0928]]), M('#050505', 0.05));
  add(pairGeo('skinparts' + lod, [
    [() => new THREE.SphereGeometry(0.0141, S(14), 6, 0, Math.PI * 2, 0, Math.PI * 0.42), 0.031, 0.1272, 0.0785, 0.66],
    [() => new THREE.SphereGeometry(0.0136, S(14), 4, 0, Math.PI * 2, Math.PI * 0.74, Math.PI * 0.26), 0.031, 0.127, 0.0785, -0.32],
    [() => { const g = new THREE.SphereGeometry(1, S(12), S(8)); g.scale(0.0095, 0.026, 0.017); return g; }, 0.074, 0.118, -0.004, 0, 0.2, 0],
  ]), skin);
  if (lod) add(pairGeo('lash', [[() => { const g = new THREE.TorusGeometry(0.0133, 0.0016, 3, 12, Math.PI * 0.8); g.rotateZ(Math.PI * 0.1); return g; }, 0.031, 0.1272, 0.0835, -0.5]]), M('#15100c', 0.6));
  add(pairGeo('brows' + lod, [[() => { const g = new THREE.CapsuleGeometry(0.003, 0.024, 2, S(6)); g.rotateZ(Math.PI / 2); g.scale(1, 0.75, 0.5); return g; }, 0.033, 0.1505, 0.0885, 0.1, 0, -0.14]]), M(HAIRC[look.hairC], 0.95));
  if (look.beard) {
    // soft-edged beard: per-vertex alpha fades out at the cheeks and around the mouth
    const bf = (v) => {
      const c = Math.cos(ang(v)); if (c < -0.1) return 0;
      const jaw = sstep(-0.16, -0.4, v.y) * sstep(-0.1, 0.25, c);                      // jaw + chin
      const side = sstep(0.6, 0.76, Math.abs(v.x)) * sstep(0.1, -0.05, v.y) * sstep(0.35, 0.6, c);           // sideburn to jaw
      const mouth = sstep(0.36, 0.22, Math.abs(v.x)) * sstep(-0.62, -0.5, v.y) * sstep(-0.12, -0.22, v.y) * (v.z > 0 ? 1 : 0);
      const mous = sstep(0.3, 0.15, Math.abs(v.x)) * sstep(-0.28, -0.22, v.y) * sstep(-0.12, -0.18, v.y) * (v.z > 0.6 ? 1 : 0);
      return Math.max(0, Math.min(1, Math.max(jaw, side, mous) - mouth * 0.9)) * 0.95;
    };
    const b = new THREE.Mesh(shellGeo('beard4' + lod, 1.018, () => false, lod ? 48 : 30, lod ? 34 : 22, 0.01, true, bf), new THREE.MeshStandardMaterial({ color: HAIRC[look.hairC], roughness: 1, map: hairTex(), transparent: true, vertexColors: true, depthWrite: false }));
    head.add(b);
  }
  addHair(head, look, capped, lod);
}

// ---------------- body ----------------
function hashN(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }
const bodyCache = new Map();
// material slots: 0 jersey, 1 left sleeve (patch), 2 pants, 3 skin (neck), 4 socks, 5 arms (skin or undershirt), 6 right sleeve, 7 belt
function bodyGeo(build, lod, pantsStyle = 'high') {
  const wb = Math.round(build * 20) / 20;
  const key = wb.toFixed(2) + lod + pantsStyle;
  if (bodyCache.has(key)) return bodyCache.get(key);
  const seg = lod ? 18 : 12, sub = lod ? 2 : 1;
  const ax = 0.205 + (0.188 * wb - 0.188);
  const T = (p) => p.map(([y, rx, rz, dz]) => [y, rx * wb, rz * (0.94 + 0.06 * wb), dz || 0]);
  const A = (p) => p.map(([y, a, b, d]) => [y, a * (0.9 + 0.1 * wb), b * (0.9 + 0.1 * wb), d || 0]);
  const parts = [];
  const shoulderW = (y, x) => { // torso skin weights that hand the deltoid over to the arm
    const w = TORSO(y), f = sstep(0.12, 0.21, Math.abs(x) / wb) * sstep(1.3, 1.42, y) * 0.65;
    if (f <= 0) return w;
    return w.map(([b2, v]) => [b2, v * (1 - f)]).concat([[x > 0 ? 5 : 8, f]]);
  };
  // jersey: tucked at the waist, broad chest, rounded deltoids, trapezius slope into the collar
  parts.push(tube(T([[J0, 0.158, 0.116], [0.99, 0.156, 0.113], [1.06, 0.15, 0.108, 0.002], [1.14, 0.156, 0.112, 0.006], [1.22, 0.17, 0.12, 0.012], [1.3, 0.186, 0.127, 0.016], [1.36, 0.203, 0.127, 0.012], [1.405, 0.218, 0.12, 0.004], [1.44, 0.21, 0.11, -0.004], [1.47, 0.178, 0.096, -0.01], [1.495, 0.122, 0.078, -0.012], [1.513, 0.075, 0.064, -0.008], [J1, 0.064, 0.06, -0.004]]), { seg: seg + 8, sub: sub + 1, wfn: shoulderW, mat: 0 }));
  // neck
  parts.push(tube([[1.47, 0.062, 0.06, -0.006], [1.52, 0.058, 0.057, -0.002], [1.57, 0.055, 0.055, 0.006], [1.615, 0.05, 0.05, 0.01]], { seg, sub, wfn: TORSO, mat: 3 }));
  // pants seat: u remapped so the side piping lands on both hips
  parts.push(tube(T([[0.85, 0.012, 0.012], [0.87, 0.1, 0.09], [0.92, 0.166, 0.123], [0.98, 0.171, 0.125], [1.035, 0.166, 0.121, 0.002]]), { seg: seg + 8, sub, mat: 2, uvMul: 2, uvAdd: 0.5, wfn: (y, x) => { const f = sstep(0.97, 0.88, y) * sstep(0.02, 0.09, Math.abs(x)) * 0.75; return [[0, 1 - f], [x > 0 ? 11 : 14, f]]; } }));
  // belt
  parts.push(tube(T([[0.985, 0.17, 0.124], [0.99, 0.173, 0.127], [1.03, 0.172, 0.126, 0.002], [1.035, 0.168, 0.122, 0.002]]), { seg: seg + 8, sub: 1, mat: 7, wfn: () => [[0, 1]] }));
  for (const side of [1, 0]) {
    const sx = side ? 1 : -1, lx = sx * 0.092, a0 = side ? -Math.PI / 2 : Math.PI / 2;
    const LW = LEG(side);
    // pant leg: roomy thigh, room over the knee, then either bloused at mid-calf (high socks) or down over the cleat
    const low = pantsStyle === 'long'
      ? [[0.075, 0.064, 0.074, 0.012], [0.12, 0.066, 0.072, 0.006], [0.25, 0.068, 0.072], [0.38, 0.075, 0.08, 0.006]]
      : [[0.3, 0.06, 0.064, -0.004], [0.315, 0.07, 0.074, -0.006], [0.36, 0.076, 0.08, -0.004], [0.42, 0.08, 0.084, 0.004]];
    parts.push(tube(low.concat([[0.51, 0.086, 0.09, 0.008], [0.6, 0.09, 0.094, 0.004], [0.7, 0.095, 0.1], [0.82, 0.102, 0.106], [0.92, 0.106, 0.108], [0.965, 0.1, 0.102]]).map(([y, a, b, d]) => [y, a * (0.92 + 0.08 * wb), b * (0.92 + 0.08 * wb), d || 0]), { cx: lx, seg, sub, mat: 2, a0, wfn: LW }));
    // calf in the sock
    if (pantsStyle === 'long') parts.push(tube([[0.06, 0.034, 0.036, -0.004], [0.13, 0.037, 0.04, -0.004]], { cx: lx, seg: 8, sub: 1, mat: 4, wfn: LW }));
    else parts.push(tube([[0.055, 0.035, 0.037, -0.004], [0.13, 0.037, 0.04, -0.005], [0.22, 0.047, 0.053, -0.012], [0.3, 0.054, 0.059, -0.012], [0.33, 0.055, 0.059, -0.008]], { cx: lx, seg, sub, mat: 4, wfn: LW }));
    const x = sx * ax;
    // upper arm (hidden top tucks into the sleeve), forearm to the wrist
    parts.push(tube(A([[1.14, 0.038, 0.04], [1.19, 0.045, 0.047], [1.26, 0.05, 0.053, 0.004], [1.33, 0.052, 0.053], [1.4, 0.048, 0.048]]), { cx: x, seg, sub, mat: 5, wfn: ARM(side) }));
    parts.push(tube(A([[0.895, 0.027, 0.022], [0.93, 0.03, 0.026], [1.0, 0.037, 0.032], [1.07, 0.043, 0.038], [1.13, 0.043, 0.041], [1.18, 0.04, 0.041]]), { cx: x, seg, sub, mat: 5, wfn: ARM(side) }));
    // short jersey sleeve: slight flare at the hem, rounded cap over the deltoid
    parts.push(tube(A([[1.215, 0.066, 0.068], [1.23, 0.067, 0.069], [1.3, 0.066, 0.068], [1.37, 0.065, 0.066], [1.42, 0.06, 0.061], [1.45, 0.05, 0.052], [1.47, 0.034, 0.036], [1.478, 0.012, 0.012]]), { cx: x - sx * 0.006, seg, sub, mat: side ? 1 : 6, a0, wfn: SLEEVE(side) }));
  }
  const byMat = [0, 1, 2, 3, 4, 5, 6, 7].map((m) => parts.filter((p) => p.userData.mat === m)).map((list) => THREE.mergeGeometries(list));
  const g = THREE.mergeGeometries(byMat, true);
  const out = { g, ax };
  bodyCache.set(key, out); return out;
}

// relaxed, slightly curled hand (palm faces the body: -x for the left hand). side 'L' | 'R'
function handGeo(side) {
  return G('hand2' + side, () => {
    const parts = [];
    const palm = new THREE.SphereGeometry(1, 12, 10); palm.scale(0.016, 0.045, 0.039); palm.translate(0, -0.045, 0.002); parts.push(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.CapsuleGeometry(0.0085, 0.038 - Math.abs(i - 1.2) * 0.004, 2, 6);
      f.translate(0, -0.02, 0); f.rotateZ(-0.55); f.translate(-0.004, -0.088, -0.026 + i * 0.017); parts.push(f);
    }
    const th = new THREE.CapsuleGeometry(0.0095, 0.03, 2, 6); th.rotateX(0.7); th.rotateZ(-0.35); th.translate(-0.008, -0.05, 0.04); parts.push(th);
    const g = THREE.mergeGeometries(parts.map(p => p.toNonIndexed ? p.index ? p.toNonIndexed() : p : p));
    if (side === 'R') { g.scale(-1, 1, 1); const ix = g.attributes.position; for (let i = 0; i < ix.count; i += 3) { const ax2 = ix.getX(i + 1), ay = ix.getY(i + 1), az = ix.getZ(i + 1); ix.setXYZ(i + 1, ix.getX(i + 2), ix.getY(i + 2), ix.getZ(i + 2)); ix.setXYZ(i + 2, ax2, ay, az); } }
    g.computeVertexNormals(); return g;
  });
}
function shoeGeo() {
  return G('shoe2', () => {
    const up = new THREE.SphereGeometry(1, 14, 10); up.scale(0.046, 0.05, 0.13); up.translate(0, -0.048, 0.045);
    const pos = up.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i), z = pos.getZ(i);
      if (y < -0.06) y = -0.06 - (y + 0.06) * 0.25;
      if (z > 0.09) y = Math.min(y, -0.03 - (z - 0.09) * 0.5); // lower toe box
      pos.setY(i, y);
    }
    up.computeVertexNormals(); return up;
  });
}
const soleGeo = () => G('sole2', () => { const g = new THREE.CapsuleGeometry(0.045, 0.18, 3, 10); g.rotateX(Math.PI / 2); g.scale(1, 0.26, 1); g.translate(0, -0.074, 0.045); return g; });

const FT = 3.2808;
function isLight(hex) { const c = new THREE.Color(hex); return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.72; }
// real cap crown / brim colors where they differ from the club's first color
const CAP = { BOS: ['#0C2340'], SF: ['#27251F'], MIA: ['#111111'], BAL: ['#111111', '#DF4601'], COL: ['#1b1b1f'], ATL: ['#13274F', '#CE1141'], ATH: ['#003831', '#EFB21E'], CWS: ['#1b1b1f'], PIT: ['#1b1b1f'], SD: ['#2F241D'], TOR: ['#134A8E'], WSH: ['#AB0003'], HOU: ['#002D62'], MIL: ['#12284B'] };
const PIN = { NYY: 1, PHI: 1, CHC: 1, MIN: 0 };
const TAIL = { LAD: 1, BAL: 1, KC: 1, TEX: 0, MIN: 1, PHI: 0, BOS: 0, DET: 0 };
// uniform for a club: kind = 'home' | 'away' | 'ump'
export function uniform(team, kind) {
  const c1 = team.c1, c2 = team.c2, c3 = team.c3 || c2;
  if (kind === 'ump') return { key: 'ump', base: '#1b2233', pants: '#4a4e55', trim: '#0f1420', text: '#1b2233', sock: '#111317', cap: '#111317', capBrim: '#111317', word: '', shoe: '#111', under: '#0f1420', belt: '#111', frontNum: false };
  const home = kind === 'home';
  const base = home ? '#f4f3ee' : '#bcbfc4';
  const cap = (CAP[team.id] || [c1])[0], capBrim = (CAP[team.id] || [])[1] || cap;
  const dark = isLight(c1) ? (isLight(c2) ? '#1b1b1f' : c2) : c1;
  return {
    key: team.id + kind, base, pants: base, trim: dark, trim2: [c2, c3].find(c => c && c.toLowerCase() !== dark.toLowerCase() && !isLight(c)) || (home ? dark : '#ffffff'), text: dark, pin: home && PIN[team.id], pinC: dark,
    word: home ? team.name : (team.city.length > 11 ? team.city.split(' ').pop() : team.city), tail: !!TAIL[team.id], chestLogo: home && team.id === 'NYY',
    sock: dark, sockStripe: isLight(c2) ? '#ffffff' : c2, cap, capBrim, capMark: c2, shoe: '#1b1b1f', shoeAccent: dark, under: dark, belt: dark, stripe: !home || PIN[team.id] ? 0 : 1, piping: !home && !PIN[team.id],
  };
}
// logo decal texture (transparent) for caps / helmets
function logoTex(team, kind, fill, stroke) {
  return canvasTex('lg' + (team ? team.id : 'x') + kind, 256, 256, (x, W, H) => { if (team) drawMark(x, team, kind, W / 2, H / 2, W * 0.9, H * 0.9, fill, stroke); });
}
function capTex(color) {
  return canvasTex('capc' + color, 256, 128, (x, W, H) => {
    x.fillStyle = color; x.fillRect(0, 0, W, H); fabric(x, W, H, 0.06);
    // six panel seams + eyelets (sphere u = .25 faces front)
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) { const u = (0.25 + k / 6) % 1; x.beginPath(); x.moveTo(u * W, 0); x.lineTo(u * W, H); x.stroke(); }
    x.fillStyle = 'rgba(0,0,0,.45)'; for (let k = 0; k < 6; k++) { const u = (0.25 + 1 / 12 + k / 6) % 1; x.beginPath(); x.arc(u * W, H * 0.3, 1.6, 0, 7); x.fill(); }
  });
}
// cap crown: sphere cap, a little taller in front
const CAPR = 0.092, CAPS = [1, 1.0, 1.1];
const capGeo = () => G('capdome2', () => { const g = new THREE.SphereGeometry(CAPR, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.53); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); if (z > 0) p.setY(i, y + z * 0.12 * (y / CAPR)); } g.scale(...CAPS); g.computeVertexNormals(); return g; });
// curved brim: inner edge hugs the crown, sides droop, gentle downward pitch
function brimGeo(len, key) {
  return G('brim' + key, () => {
    const NS = 16, NT = 3, pos = [], uv = [], idx = [];
    const Rx = CAPR * CAPS[0] * 0.99, Rz = CAPR * CAPS[2] * 0.99;
    for (let i = 0; i <= NS; i++) {
      const s = i / NS * 2 - 1, a = s * 1.12;
      for (let j = 0; j <= NT; j++) {
        const t = j / NT, ix = Math.sin(a) * Rx, iz = Math.cos(a) * Rz;
        const reach = len * Math.pow(Math.cos(a * 0.92), 0.7);
        const ox = Math.sin(a) * (Rx + 0.004), oz = Math.cos(a) * Rz + reach;
        pos.push(mix(ix, ox, t), -0.022 * s * s * t - 0.012 * t * t - 0.004 * s * s, mix(iz, oz, t)); uv.push(i / NS, t);
      }
    }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) { const a = i * (NT + 1) + j, b = a + NT + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  });
}
// decal patch on a sphere-shaped shell: sphere segment centred on +z
function decalGeo(key, R, scale, w, th0, th1, push = 1.012) {
  return G('dec' + key, () => {
    const g = new THREE.SphereGeometry(R * push, 14, 10, Math.PI / 2 - w / 2, w, th0, th1 - th0);
    g.scale(...scale); g.computeVertexNormals(); return g;
  });
}
const decalMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
const HELR = 0.118, HELS = [1, 0.95, 1.12];
const helmetGeo = () => G('helmet2', () => { const g = new THREE.SphereGeometry(HELR, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.6); g.scale(...HELS); return g; });
function addCap(hg, team, U, kind, mirror) {
  const y0 = 0.115 + 0.035;
  if (kind === 'helmet' || kind === 'skull') {
    const capM = new THREE.MeshPhysicalMaterial({ color: U.cap, roughness: 0.25, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 });
    const h = new THREE.Mesh(helmetGeo(), capM); h.position.set(0, y0 - 0.005, -0.006); h.castShadow = true; hg.add(h);
    if (kind === 'skull') return;
    // ear flap covers the ear facing the pitcher (+x for a righty) and wraps the jaw a bit
    const flap = new THREE.Mesh(G('flap2', () => { const g = new THREE.SphereGeometry(0.066, 16, 10, 0, Math.PI, 0, Math.PI * 0.55); g.scale(0.55, 1.2, 1.05); g.rotateX(Math.PI); g.rotateY(Math.PI / 2); return g; }), capM);
    flap.position.set(0.098, y0 - 0.03, 0.0); hg.add(flap);
    const br = new THREE.Mesh(brimGeo(0.05, 'h'), new THREE.MeshPhysicalMaterial({ color: U.cap, roughness: 0.3, clearcoat: 1, side: THREE.DoubleSide })); br.position.set(0, y0 - 0.018, 0.0); br.scale.set(HELR / CAPR * 0.97, 1, HELR / CAPR * 1.02); hg.add(br);
    if (team) {
      const d = new THREE.Mesh(decalGeo('helm', HELR, HELS, 0.9, Math.PI * 0.14, Math.PI * 0.4, 1.006), decalMat(logoTex(team, 'cap', '#fff', '#000')));
      d.position.copy(h.position); if (mirror) d.scale.x = -1; hg.add(d);
    }
    return;
  }
  const capM = new THREE.MeshStandardMaterial({ map: capTex(U.cap), roughness: 0.85 });
  const cg = new THREE.Group(); cg.position.set(0, 0.168, 0.006); cg.rotation.x = -0.16; hg.add(cg); cg.userData.cap = 1;
  const d = new THREE.Mesh(capGeo(), capM); d.castShadow = true; cg.add(d);
  const brTop = new THREE.Mesh(brimGeo(0.072, 'c2'), new THREE.MeshStandardMaterial({ color: U.capBrim || U.cap, roughness: 0.8 }));
  const brBot = new THREE.Mesh(brimGeo(0.072, 'c2'), new THREE.MeshStandardMaterial({ color: shade(U.capBrim || U.cap, 0.45), roughness: 0.9, side: THREE.BackSide }));
  for (const b of [brTop, brBot]) { b.position.y = 0.002; b.rotation.x = 0.1; b.castShadow = true; cg.add(b); }
  const bt = new THREE.Mesh(G('capbtn2', () => { const g = new THREE.SphereGeometry(0.01, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.6, 1); return g; }), M(U.cap, 0.8)); bt.position.set(0, CAPR * CAPS[1] - 0.001, 0); cg.add(bt);
  if (team) {
    const dm = new THREE.Mesh(decalGeo('cap2', CAPR, CAPS, 1.0, Math.PI * 0.16, Math.PI * 0.44, 1.012), decalMat(logoTex(team, 'cap', '#fff', '#000')));
    if (mirror) dm.scale.x = -1;
    const p = dm.geometry.attributes.position; if (!dm.geometry.userData.lift) { dm.geometry.userData.lift = 1; for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); if (z > 0) p.setY(i, y + z * 0.12 * (y / (CAPR * CAPS[2]))); } dm.geometry.computeVertexNormals(); }
    cg.add(dm);
  }
}
// catcher's / umpire's mask: padded frame with steel bars
function maskGeo() {
  return G('mask3', () => {
    const parts = [];
    for (const [y, r, arc] of [[0.175, 0.122, 2.0], [0.135, 0.134, 2.2], [0.095, 0.13, 2.1], [0.055, 0.112, 1.7]]) {
      const t = new THREE.TorusGeometry(r, 0.0034, 5, 22, arc); t.rotateX(Math.PI / 2); t.rotateY(arc / 2 - Math.PI / 2); t.translate(0, y, 0.008); parts.push(t);
    }
    for (const sx of [-0.036, 0.036]) { const t = new THREE.CylinderGeometry(0.0042, 0.0042, 0.13, 5); t.translate(sx, 0.112, 0.136); parts.push(t); }
    const c = new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 5); c.translate(0, 0.112, 0.141); parts.push(c);
    return THREE.mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
  });
}
function maskPadGeo() { return G('maskpad2', () => { const arc = Math.PI * 1.1; const g = new THREE.TorusGeometry(0.112, 0.014, 6, 24, arc); g.rotateX(Math.PI / 2); g.rotateY(arc / 2 - Math.PI / 2); g.translate(0, 0, 0.0); return g; }); }
const LEATHER = [['#9a5a26', '#5c3315'], ['#7a3f1a', '#3a1d0c'], ['#1d1b1a', '#7a3f1a'], ['#b37a3c', '#4a2a12'], ['#5a2a14', '#c49a62']];
export function makeGlove(catcher = false, style = 0) {
  const g = new THREE.Group();
  const [lc, lace] = LEATHER[style % LEATHER.length];
  const leather = M(catcher ? '#3b2416' : lc, 0.55), laceM = M(catcher ? '#7a4a28' : lace, 0.7), palmM = M(shade(catcher ? '#3b2416' : lc, 0.25, '#000'), 0.7);
  if (catcher) {
    const pocket = new THREE.Mesh(G('mitt2', () => { const s = new THREE.SphereGeometry(0.12, 14, 10); s.scale(1, 1.08, 0.5); return s; }), leather); pocket.position.set(0, -0.11, 0.035); g.add(pocket);
    const rim = new THREE.Mesh(G('mittrim', () => { const t = new THREE.TorusGeometry(0.115, 0.018, 8, 26); t.scale(1, 1.08, 1); return t; }), laceM); rim.position.set(0, -0.11, 0.05); g.add(rim);
    const pk = new THREE.Mesh(G('mittpk', () => { const s = new THREE.CircleGeometry(0.085, 20); s.scale(1, 1.08, 1); return s; }), palmM); pk.position.set(0, -0.11, 0.066); g.add(pk);
  } else {
    const back = new THREE.Mesh(G('gback', () => { const s = new THREE.SphereGeometry(0.075, 12, 8); s.scale(1, 1.2, 0.5); return s; }), leather); back.position.set(0, -0.1, 0.03); g.add(back);
    const pk = new THREE.Mesh(G('gpk', () => { const s = new THREE.CircleGeometry(0.06, 16); s.scale(1, 1.2, 1); return s; }), palmM); pk.position.set(0, -0.11, 0.068); g.add(pk);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(G('gfing2', () => new THREE.CapsuleGeometry(0.019, 0.1, 2, 6)), leather); f.position.set(-0.052 + i * 0.03, -0.215 + Math.abs(i - 1.5) * 0.012, 0.04); f.rotation.z = (i - 1.5) * 0.1; f.rotation.x = 0.15; g.add(f); }
    const th = new THREE.Mesh(G('gthumb', () => new THREE.CapsuleGeometry(0.02, 0.09, 2, 6)), leather); th.position.set(0.075, -0.15, 0.04); th.rotation.z = 0.45; g.add(th);
    const web = new THREE.Mesh(G('gweb2', () => { const b = new THREE.BoxGeometry(0.05, 0.065, 0.008, 3, 3, 1); return b; }), laceM); web.position.set(0.05, -0.215, 0.05); web.rotation.z = 0.2; g.add(web);
    const wrist = new THREE.Mesh(G('gwrist', () => { const t = new THREE.TorusGeometry(0.045, 0.012, 6, 16); t.scale(1, 1, 0.6); return t; }), laceM); wrist.position.set(0, -0.025, 0.03); wrist.rotation.x = Math.PI / 2; g.add(wrist);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
const BATS = ['#d9b27c', '#c8925a', '#1b1b1f', '#7a3f1a', 'two'];
export function makeBat(color = '#c89a5a') {
  const g = new THREE.Group();
  // knob, thin handle, long taper, barrel, cupped end. meters, knob at origin, barrel along +y
  const prof = [[0, 0], [0.004, 0.02], [0.016, 0.022], [0.026, 0.012], [0.12, 0.0125], [0.3, 0.014], [0.45, 0.019], [0.58, 0.027], [0.7, 0.032], [0.82, 0.033], [0.852, 0.031], [0.86, 0.022], [0.858, 0.0]].map(([y, r]) => new THREE.Vector2(r, y));
  const two = color === 'two';
  const m = new THREE.Mesh(G('bat2', () => new THREE.LatheGeometry(prof, 12)), two ? new THREE.MeshStandardMaterial({ map: batTex(), roughness: 0.35 }) : M(color, 0.35));
  m.castShadow = true; g.add(m);
  const tape = new THREE.Mesh(G('battape2', () => new THREE.CylinderGeometry(0.0138, 0.013, 0.17, 12)), M('#1b1b1f', 0.75)); tape.position.y = 0.11; g.add(tape);
  return g;
}
const batTex = () => canvasTex('bat2tone', 16, 256, (x, W, H) => { x.fillStyle = '#1b1b1f'; x.fillRect(0, 0, W, H * 0.45); x.fillStyle = '#d9b27c'; x.fillRect(0, H * 0.45, W, H); });
// phones / FAST graphics get the lighter model unless the caller asks
function defaultLod() {
  const g = Settings.gfx;
  if (g === 'fast') return 0;
  if (g === 'high') return 1;
  const mobile = typeof navigator !== 'undefined' && (/iPhone|iPad|Android|CrOS/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4);
  return mobile ? 0 : 1;
}
// Build a ballplayer. card = {id, num, last, look}, opts = {uni, team, head:'cap'|'helmet'|'catcher'|'none', glove:true, bat:false, lefty:false, lod}
export function makeAthlete(card, team, opts = {}) {
  const look = { ...card.look }, lod = opts.lod ?? defaultLod(), U = opts.uni || uniform(team, 'home');
  const skinHex = SKINS[look.skin] || SKINS[2];
  const h2 = hashN(card.id);
  if (look.stub == null) look.stub = !look.beard && (h2 >> 7) % 3 === 0 ? 1 : 0;
  const pantsStyle = U.key === 'ump' ? 'long' : (h2 >> 4) % 5 < 2 ? 'long' : 'high';
  if (HUM.H) return makeHumanAthlete(card, team, opts, look, U, h2, pantsStyle);
  const { g, ax } = bodyGeo(look.build, lod, pantsStyle);
  const bones = buildBones(ax);
  const Um = { ...U, mirror: !!opts.lefty };
  const fab = (map, r = 0.82) => new THREE.MeshStandardMaterial({ map, roughness: r, emissive: '#000000' });
  const sleeveColor = look.sleeve ? U.under || U.trim : null;
  const armMat = sleeveColor ? new THREE.MeshStandardMaterial({ color: sleeveColor, roughness: 0.55 }) : skinMat(skinHex);
  const mats = [
    fab(jerseyTex(team || { id: 'x' }, card, Um)),
    fab(sleeveTex(team, Um, !!team)),
    fab(pantsTex(U), 0.85),
    skinMat(skinHex),
    fab(sockTex(U), 0.9),
    armMat,
    fab(sleeveTex(team, Um, false)),
    M(U.belt || U.trim, 0.45),
  ];
  const mesh = new THREE.SkinnedMesh(g, mats);
  mesh.add(bones[0]); mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.frustumCulled = false;
  const root = new THREE.Group(), flip = new THREE.Group(); root.add(flip); flip.add(mesh);
  if (opts.lefty) flip.scale.x = -1;
  const P = { root, flip, mesh, U, body: bones[0], hips: bones[0], torso: bones[1], chest: bones[2], neck: bones[3], head: bones[4], shL: bones[5], elL: bones[6], handL: bones[7], shR: bones[8], elR: bones[9], handR: bones[10], hipL: bones[11], knL: bones[12], ftL: bones[13], hipR: bones[14], knR: bones[15], ftR: bones[16] };
  const hg = new THREE.Group(); hg.scale.setScalar(1.07); P.head.add(hg);
  const capped = opts.head && opts.head !== 'none';
  look.band = -1;
  buildHead(hg, look, skinHex, capped, lod);
  const mirror = !!opts.lefty;
  hg.userData.capRoot = 1;
  if (opts.head === 'cap') addCap(hg, team, U, 'cap', mirror);
  else if (opts.head === 'helmet') addCap(hg, team, U, 'helmet', mirror);
  else if (opts.head === 'ump') addCap(hg, null, U, 'cap', mirror);
  if (opts.head === 'catcher' || opts.mask) {
    addCap(hg, team, U, 'skull', mirror);
    const frame = new THREE.Mesh(maskGeo(), M(U.key === 'ump' ? '#2a2a2a' : '#1d1f24', 0.35, { metalness: 0.6 })); frame.position.set(0, 0.01, 0); hg.add(frame);
    for (const y of [0.2, 0.04]) { const pad = new THREE.Mesh(maskPadGeo(), M('#4a3628', 0.8)); pad.position.set(0, y, 0.004); pad.scale.set(1, 0.6, 1); hg.add(pad); }
    const chin = new THREE.Mesh(G('chinpad', () => { const g2 = new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.4); g2.scale(1.1, 0.8, 1.05); return g2; }), M('#3a2a20', 0.8)); chin.position.set(0, 0.06, 0.03); hg.add(chin);
  }
  hg.traverse(o => { if (o.isMesh && (o.parent.userData.cap || /brim|flap|helmet|dec/.test(o.geometry.userData.k || ''))) o.userData.noShadow = true; });
  if (opts.chestPad) {
    const padM = new THREE.MeshPhysicalMaterial({ color: opts.chestPad, roughness: 0.45, clearcoat: 0.5 });
    const pad = new THREE.Mesh(G('cpad3', () => { const b = new THREE.BoxGeometry(0.36, 0.5, 0.05, 10, 12, 1); const p = b.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const ex = Math.abs(x) / 0.18, ey = Math.abs(y) / 0.25; let sx = 1; if (y < -0.08) sx = 1 - (-0.08 - y) * 1.1; p.setX(i, x * sx); p.setZ(i, p.getZ(i) - x * x * 2.2 + (1 - ey * ey) * 0.02 + Math.sin(y * 40) * 0.003); } b.computeVertexNormals(); return b; }), padM);
    pad.position.set(0, -0.02, 0.15); P.chest.add(pad);
    for (const s of ['L', 'R']) {
      const sg = new THREE.Mesh(G('shin2', () => { const c = new THREE.CapsuleGeometry(0.058, 0.3, 4, 12, 1); c.scale(1, 1, 0.85); return c; }), padM); sg.position.set(0, -0.19, 0.045); P['kn' + s].add(sg);
      const kc = new THREE.Mesh(G('kneecap', () => { const k = new THREE.SphereGeometry(0.068, 14, 10); k.scale(1, 0.9, 0.8); return k; }), padM); kc.position.set(0, -0.005, 0.06); P['kn' + s].add(kc);
    }
  }
  const glovesOn = look.gloves || opts.bat;
  const handM = glovesOn ? M(opts.bat ? U.trim : '#1a1c22', 0.55) : skinMat(skinHex);
  for (const s of ['L', 'R']) { const hm = new THREE.Mesh(handGeo(s), s === 'R' || opts.bat ? handM : skinMat(skinHex)); hm.castShadow = true; hm.rotation.y = s === 'L' ? -0.25 : 0.25; P['hand' + s].add(hm); }
  if (opts.glove) { const gl = makeGlove(opts.head === 'catcher', h2 >> 9); P.handL.add(gl); P.glove = gl; }
  if (opts.bat) {
    // the bat lives in the body frame (not the hand) so swings read cleanly from any camera
    const pivot = new THREE.Group(); pivot.rotation.order = 'YXZ'; P.flip.add(pivot); const bat = makeBat(BATS[(h2 >> 6) % BATS.length]); pivot.add(bat); P.batPivot = pivot; P.bat = bat;
  }
  const shoeC = U.shoe || '#1b1b1f';
  for (const s of ['L', 'R']) {
    const u = new THREE.Mesh(shoeGeo(), M(shoeC, 0.4)); u.castShadow = true; P['ft' + s].add(u);
    const so = new THREE.Mesh(soleGeo(), M(U.shoeAccent && (h2 >> 11) % 3 === 0 ? U.shoeAccent : '#f4f4f4', 0.6)); P['ft' + s].add(so);
  }
  root.scale.setScalar(look.h * FT);
  root.traverse((o) => { if (o.isMesh) o.castShadow = !o.userData.noShadow; });
  P.anim = { phase: Math.random() * 6, t: 0 };
  return P;
}


// ---- real human body (human.js) driven by the same 17-bone rig ----
const HAIRHEX = HAIRC;
function makeHumanAthlete(card, team, opts, look, U, h2, pantsStyle) {
  Object.assign(LEN, { thigh: HUM.HLEN.thigh, shin: HUM.HLEN.shin, upper: HUM.HLEN.upper, fore: HUM.HLEN.fore, hipOff: -HUM.HLEN.hipDy, ankleH: HUM.HLEN.ankle });
  const bones = HUM.buildHumanBones();
  const root = new THREE.Group(), flip = new THREE.Group(); root.add(flip);
  const drv = new THREE.Group(); drv.add(bones[0]); flip.add(drv);
  if (opts.lefty) flip.scale.x = -1;
  const P = { root, flip, mesh: { skeleton: { bones } }, bones, U, body: bones[0], hips: bones[0], torso: bones[1], chest: bones[2], neck: bones[3], head: bones[4], shL: bones[5], elL: bones[6], handL: bones[7], shR: bones[8], elR: bones[9], handR: bones[10], hipL: bones[11], knL: bones[12], ftL: bones[13], hipR: bones[14], knR: bones[15], ftR: bones[16] };
  const isUmp = U.key === 'ump';
  const patch = team && !isUmp ? canvasTex('hpatch' + team.id, 256, 256, (x, W, H) => drawMark(x, team, 'primary', W / 2, H / 2, W * 0.92, H * 0.92, '#fff', '#000')) : null;
  const skinIdx = Math.max(0, Math.min(7, (SKINMAP[look.skin] ?? look.skin) | 0));
  HUM.attachHuman(P, {
    U, card, team, look, skinIdx, hairHex: HAIRHEX[look.hairC] || HAIRHEX[1], lefty: !!opts.lefty,
    gloves: !!opts.bat || !!look.gloves, gloveColor: opts.bat ? U.trim : '#1a1c22', under: !!look.sleeve || isUmp, long: pantsStyle === 'long',
    headgear: opts.mask ? 'catcher' : opts.head, patchCanvas: patch ? patch.image : null, chestLogo: U.chestLogo && team ? logoImg(team, 'cap') : null, sleeveEnd: isUmp ? 0.5 : 0.355,
  });
  if (patch) P.hm.body.material.userData.u.uPatch.value = patch;
  // caps / helmets / masks sit on the head bone, re-centred on the human skull
  const hg = new THREE.Group(); hg.position.set(0, -0.036, 0.026); hg.rotation.x = 0.2; hg.scale.setScalar(1.1); P.head.add(hg);
  const mirror = !!opts.lefty;
  hg.userData.capRoot = 1;
  if (opts.head === 'cap') addCap(hg, team, U, 'cap', mirror);
  else if (opts.head === 'helmet') { hg.position.y += 0.012; hg.position.z -= 0.006; hg.rotation.x = 0.1; addCap(hg, team, U, 'helmet', mirror); }
  else if (opts.head === 'ump') addCap(hg, null, U, 'cap', mirror);
  if (opts.head === 'catcher' || opts.mask) {
    addCap(hg, team, U, 'skull', mirror);
    const frame = new THREE.Mesh(maskGeo(), M(isUmp ? '#2a2a2a' : '#1d1f24', 0.35, { metalness: 0.6 })); frame.position.set(0, 0.01, 0); hg.add(frame);
    for (const y of [0.2, 0.04]) { const pad = new THREE.Mesh(maskPadGeo(), M('#4a3628', 0.8)); pad.position.set(0, y, 0.004); pad.scale.set(1, 0.6, 1); hg.add(pad); }
  }
  hg.traverse(o => { if (o.isMesh && (o.parent.userData.cap || /brim|flap|helmet|dec/.test(o.geometry.userData.k || ''))) o.userData.noShadow = true; });
  if (opts.chestPad) {
    const padM = new THREE.MeshPhysicalMaterial({ color: opts.chestPad, roughness: 0.45, clearcoat: 0.5 });
    const pad = new THREE.Mesh(G('cpad3', () => { const b = new THREE.BoxGeometry(0.36, 0.5, 0.05, 10, 12, 1); const p = b.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const ey = Math.abs(y) / 0.25; let sx = 1; if (y < -0.08) sx = 1 - (-0.08 - y) * 1.1; p.setX(i, x * sx); p.setZ(i, p.getZ(i) - x * x * 2.2 + (1 - ey * ey) * 0.02 + Math.sin(y * 40) * 0.003); } b.computeVertexNormals(); return b; }), padM);
    pad.position.set(0, -0.03, 0.16); P.chest.add(pad);
    for (const s of ['L', 'R']) {
      const sg = new THREE.Mesh(G('shin2', () => { const c = new THREE.CapsuleGeometry(0.058, 0.3, 4, 12, 1); c.scale(1, 1, 0.85); return c; }), padM); sg.position.set(0, -0.2, 0.06); P['kn' + s].add(sg);
      const kc = new THREE.Mesh(G('kneecap', () => { const k = new THREE.SphereGeometry(0.068, 14, 10); k.scale(1, 0.9, 0.8); return k; }), padM); kc.position.set(0, -0.005, 0.07); P['kn' + s].add(kc);
    }
  }
  if (opts.glove) { const gl = makeGlove(opts.head === 'catcher', h2 >> 9); gl.position.set(0, 0.02, 0); P.handL.add(gl); P.glove = gl; }
  const shoeC = U.shoe || '#1b1b1f';
  for (const s of ['L', 'R']) {
    const u = new THREE.Mesh(shoeGeo(), M(shoeC, 0.4)); u.castShadow = true; u.scale.set(1.12, 1.05, 1.06); u.position.set(0, 0.004, 0.0); P['ft' + s].add(u);
    const so = new THREE.Mesh(soleGeo(), M(U.shoeAccent && (h2 >> 11) % 3 === 0 ? U.shoeAccent : '#f4f4f4', 0.6)); so.scale.set(1.12, 1, 1.06); so.position.set(0, 0.004, 0); P['ft' + s].add(so);
  }
  if (opts.bat) { const pivot = new THREE.Group(); pivot.rotation.order = 'YXZ'; P.flip.add(pivot); const bat = makeBat(BATS[(h2 >> 6) % BATS.length]); pivot.add(bat); P.batPivot = pivot; P.bat = bat; }
  root.scale.setScalar(look.h * FT * 0.985);
  root.traverse((o) => { if (o.isMesh) o.castShadow = !o.userData.noShadow; });
  P.anim = { phase: Math.random() * 6, t: 0 };
  P.sync();
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
  const groundY = LEN.hipOff + ext + LEN.ankleH;
  const y = T.bodyY ?? groundY;
  P.body.position.y += (y - P.body.position.y) * (T.bodyY != null ? k : 1);
  if (P.batPivot) batPose(P, pose);
  if (P.sync) P.sync();
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
  [0, -1.95, 0.82, -0.2, 1.36, 0.1],
  [0.25, -2.1, 0.78, -0.24, 1.32, 0.06],
  [0.4, -1.35, 0.25, -0.06, 1.12, 0.14],
  [0.5, 0.0, 0.0, 0.06, 1.0, 0.34],
  [0.62, 1.35, 0.15, 0.24, 1.08, 0.2],
  [1, 2.7, 0.95, 0.02, 1.45, -0.12],
];
const KB_BUNT = [[0, -1.95, 0.82, -0.2, 1.36, 0.1], [0.4, 0.15, 0.12, 0.05, 1.05, 0.38], [1, 0.15, 0.12, 0.05, 1.05, 0.38]];
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
  else { P.batPivot.visible = false; if (P.hm) P.hm.grip = null; return; }
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
  if (P.hm) {
    // real hands: fists around the handle, top (right) hand just above the bottom (left) hand
    const g = P.hm.grip || (P.hm.grip = { d: new THREE.Vector3(), NL: new THREE.Vector3(), NR: new THREE.Vector3() });
    g.d.copy(_bd);
    g.NR.set(1, 0, 0).addScaledVector(_bd, -_bd.x); if (g.NR.lengthSq() < 0.05) g.NR.set(0, 0, 1).addScaledVector(_bd, -_bd.z); g.NR.normalize();
    g.NL.copy(g.NR).negate();
    const wrist = (gp, N, side, out) => { const o = HUM.H.gripOff[side]; _gf.crossVectors(_bd, N); return out.copy(gp).addScaledVector(_bd, -o.x).addScaledVector(N, -o.y).addScaledVector(_gf, -o.z); };
    const gR = _v.copy(P.batPivot.position).addScaledVector(_bd, 0.14), gL = _w.copy(P.batPivot.position).addScaledVector(_bd, 0.055);
    const wR = wrist(gR, g.NR, 'r', new THREE.Vector3()), wL = wrist(gL, g.NL, 'l', new THREE.Vector3());
    ikArm(P, 'R', wR, BAT_POLE_R); ikArm(P, 'L', wL, BAT_POLE_L);
    return;
  }
  ikArm(P, 'R', _v.copy(P.batPivot.position).addScaledVector(_bd, 0.13));
  ikArm(P, 'L', _w.copy(P.batPivot.position).addScaledVector(_bd, 0.04));
}
const _gf = new THREE.Vector3(), _pole = new THREE.Vector3(), _o = new THREE.Vector3(), _u = new THREE.Vector3(), _wv = new THREE.Vector3(), _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _mb = new THREE.Matrix4();
const BAT_POLE_R = new THREE.Vector3(-0.5, -1, -0.2), BAT_POLE_L = new THREE.Vector3(0.25, -1, 0.35);
// place a hand (side 'L'|'R') at a target given in flip-group space (meters); pole = elbow direction hint (flip space)
function ikArm(P, side, target, pole) {
  const sh = P['sh' + side], el = P['el' + side];
  const tw = P.flip.localToWorld(target.clone());
  const t = sh.parent.worldToLocal(tw).sub(sh.position);
  const u = LEN.upper, f = LEN.fore;
  const d = Math.min(t.length(), (u + f) * 0.995);
  const bend = Math.PI - Math.acos(Math.max(-1, Math.min(1, (u * u + f * f - d * d) / (2 * u * f))));
  el.rotation.set(-bend, 0, 0);
  if (!pole) {
    _h0.set(0, -u - f * Math.cos(bend), f * Math.sin(bend)).normalize();
    _q.setFromUnitVectors(_h0, t.normalize());
    sh.quaternion.copy(_q);
    return;
  }
  // pole: convert the direction from flip space into the shoulder's parent space
  _o.set(0, 0, 0); P.flip.localToWorld(_o); _pole.copy(pole); P.flip.localToWorld(_pole).sub(_o);
  sh.parent.getWorldQuaternion(_q); _pole.applyQuaternion(_q.invert()).normalize();
  const td = t.clone().normalize();
  _pole.addScaledVector(td, -_pole.dot(td)); if (_pole.lengthSq() < 1e-6) _pole.set(0, -1, 0).addScaledVector(td, -td.y); _pole.normalize();
  const a = Math.acos(Math.max(-1, Math.min(1, (u * u + d * d - f * f) / (2 * u * d)))); // shoulder angle
  _u.copy(td).multiplyScalar(Math.cos(a)).addScaledVector(_pole, Math.sin(a)).normalize(); // upper arm dir
  // forearm bends toward the target, perpendicular to the upper arm
  _wv.copy(td).addScaledVector(_u, -td.dot(_u)); if (_wv.lengthSq() < 1e-8) _wv.copy(_pole).negate(); _wv.normalize();
  _ly.copy(_u).negate(); _lx.crossVectors(_ly, _wv).normalize(); _wv.crossVectors(_lx, _ly).normalize();
  _mb.makeBasis(_lx, _ly, _wv); sh.quaternion.setFromRotationMatrix(_mb);
}

// Real human body meshes are loaded once before a game starts (see human.js). Safe to call many times.
let _modelsP = null;
export function loadModels() { if (!_modelsP) _modelsP = HUM.loadHuman().catch(e => { console.warn('human model failed, using fallback', e); return null; }); return _modelsP; }
