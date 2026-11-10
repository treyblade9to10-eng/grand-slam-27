// Crowd: thousands of instanced billboard fans (2 triangles each) drawn from a generated sprite atlas.
// Fans bob, clap and stand up/cheer with the `excite` level. Shirts mostly in the home club's colors (jerseys, tees, hoodies).
// seats = flat [x, y, z, density, shade, ...] (shade < 1 = under an overhang)
import * as THREE from '../lib/three.min.js';

const COLS = 16, VAR = 32, ROWS = 4; // rows 0-1 = sitting variants, rows 2-3 = same fans cheering (arms up)
const CW = 64, CH = 96;
function atlas(team) {
  const cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * ROWS;
  const x = cv.getContext('2d');
  const skins = ['#f1d0b0', '#e3b48e', '#d6a47c', '#c99467', '#a5714a', '#8a5a3a', '#6b4429', '#4f3220'];
  const c1 = team.c1, c2 = team.c2, c3 = team.c3 || '#ffffff';
  // what people wear to the park: lots of home jerseys/tees, some neutral
  const kits = [
    ['jersey', '#f3f2ec', c1], ['tee', c1, c2], ['jersey', c1, c2], ['tee', c1, c3], ['hoodie', c1, c2], ['jersey', '#a7abb2', c1], ['tee', '#f2f2f2', c1], ['tee', c2, c1],
    ['tee', '#2a2d33', c1], ['hoodie', '#3b4a5c', '#ddd'], ['tee', '#d9d9d9', '#888'], ['jersey', '#f3f2ec', c1], ['tee', c1, c2], ['tee', '#7a2b2b', '#eee'], ['tee', '#2c5d8a', '#eee'], ['hoodie', '#5e6a52', '#ddd'],
  ];
  const hairs = ['#1b1210', '#3a2616', '#6b4423', '#c8a060', '#8a8a8a', '#111111', '#a0522d'];
  let seed = 9; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dark = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); };
  for (let v = 0; v < VAR; v++) {
    const sk = skins[(r() * skins.length) | 0], kit = kits[v % kits.length], hc = hairs[(r() * hairs.length) | 0];
    const cap = r() < 0.45, capC = r() < 0.75 ? c1 : r() < 0.5 ? '#f2f2f2' : '#222', longHair = !cap && r() < 0.35, kid = r() < 0.15, shades = r() < 0.15;
    const hold = r(); // 0..: nothing, drink, phone
    for (const cheer of [0, 1]) {
      const cx = (v % COLS) * CW + CW / 2, cy = (Math.floor(v / COLS) + cheer * 2) * CH;
      x.save(); x.translate(cx, cy + (kid ? 14 : 0)); x.scale(1.38, 1); if (kid) x.scale(0.82, 0.82);
      const [kind, shirt, trim] = kit;
      // long hair behind the shoulders
      if (longHair) { x.fillStyle = hc; x.beginPath(); x.ellipse(0, 40, 12, 17, 0, 0, 7); x.fill(); }
      // torso (shoulders -> seat line)
      const tg = x.createLinearGradient(-18, 0, 18, 0); tg.addColorStop(0, dark(shirt, 0.8)); tg.addColorStop(0.45, shirt); tg.addColorStop(1, dark(shirt, 0.7));
      x.fillStyle = tg; x.beginPath(); x.moveTo(-18, 96); x.lineTo(-17, 54); x.quadraticCurveTo(-15, 46, -6, 45); x.lineTo(6, 45); x.quadraticCurveTo(15, 46, 17, 54); x.lineTo(18, 96); x.closePath(); x.fill();
      if (kind === 'jersey') { x.fillStyle = trim; x.fillRect(-1, 47, 2, 49); x.font = '900 italic 11px Arial'; x.textAlign = 'center'; x.fillText(String((v * 7) % 99 + 1), 8, 64); x.fillRect(-17, 54, 4, 2); x.fillRect(13, 54, 4, 2); }
      else if (kind === 'tee') { x.fillStyle = trim; x.beginPath(); x.arc(0, 60, 5.5, 0, 7); x.fill(); }
      else { x.fillStyle = dark(shirt, 0.7); x.beginPath(); x.ellipse(0, 46, 11, 5, 0, 0, Math.PI); x.fill(); x.strokeStyle = trim; x.lineWidth = 1.2; x.beginPath(); x.moveTo(-3, 50); x.lineTo(-3, 60); x.moveTo(3, 50); x.lineTo(3, 60); x.stroke(); }
      // neck
      x.fillStyle = dark(sk, 0.85); x.fillRect(-4, 40, 8, 7);
      // arms
      x.lineCap = 'round'; x.lineJoin = 'round';
      const arm = (pts, hand) => { x.strokeStyle = shirt; x.lineWidth = 8; x.beginPath(); x.moveTo(...pts[0]); for (const p of pts.slice(1, 2)) x.lineTo(...p); x.stroke(); x.strokeStyle = kind === 'hoodie' || kind === 'jersey' && r() < 0.3 ? shirt : sk; x.lineWidth = 6.5; x.beginPath(); x.moveTo(...pts[1]); x.lineTo(...pts[2]); x.stroke(); x.fillStyle = sk; x.beginPath(); x.arc(hand[0], hand[1], 3.6, 0, 7); x.fill(); };
      if (cheer) { arm([[-14, 52], [-22, 30], [-19, 8]], [-19, 6]); arm([[14, 52], [22, 30], [19, 8]], [19, 6]); }
      else {
        arm([[-15, 53], [-18, 72], [-8, 80]], [-7, 80]);
        if (hold < 0.3) { arm([[15, 53], [18, 70], [10, 64]], [10, 63]); x.fillStyle = r() < 0.5 ? '#d33' : '#eee'; x.fillRect(7, 52, 7, 11); }
        else if (hold < 0.45) { arm([[15, 53], [17, 70], [6, 62]], [6, 62]); x.fillStyle = '#111'; x.fillRect(2, 54, 7, 10); }
        else arm([[15, 53], [18, 72], [8, 80]], [7, 80]);
      }
      // head
      const hg = x.createRadialGradient(-3, 28, 2, 0, 31, 12); hg.addColorStop(0, sk); hg.addColorStop(1, dark(sk, 0.78));
      x.fillStyle = hg; x.beginPath(); x.ellipse(0, 31, 9.5, 11.5, 0, 0, 7); x.fill();
      x.fillStyle = dark(sk, 0.85); x.beginPath(); x.ellipse(-9.5, 32, 2, 3.2, 0, 0, 7); x.ellipse(9.5, 32, 2, 3.2, 0, 0, 7); x.fill();
      // face hints
      if (shades) { x.fillStyle = '#111'; x.fillRect(-7, 29, 6, 3); x.fillRect(1, 29, 6, 3); }
      else { x.fillStyle = 'rgba(30,20,15,.7)'; x.fillRect(-5, 30, 2.5, 2); x.fillRect(2.5, 30, 2.5, 2); }
      x.fillStyle = cheer ? 'rgba(80,20,20,.8)' : 'rgba(120,60,50,.45)'; if (cheer) { x.beginPath(); x.ellipse(0, 37.5, 3, 2.4, 0, 0, 7); x.fill(); } else x.fillRect(-3, 37, 6, 1.4);
      if (cap) {
        x.fillStyle = capC; x.beginPath(); x.ellipse(0, 25, 10.8, 8, 0, Math.PI, 0); x.fill(); x.fillRect(-10.8, 24, 21.6, 3);
        x.fillStyle = dark(capC, 0.75); x.beginPath(); x.ellipse(0, 27, 11, 2.6, 0, 0, Math.PI); x.fill();
        x.fillStyle = capC === c1 ? c2 : c1; x.beginPath(); x.arc(0, 21, 2.3, 0, 7); x.fill();
      } else { x.fillStyle = hc; x.beginPath(); x.ellipse(0, 25, 10.3, 7, 0, Math.PI, 0); x.fill(); if (longHair) { x.fillRect(-10.3, 24, 3.5, 16); x.fillRect(6.8, 24, 3.5, 16); } }
      x.restore();
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  return t;
}

const VS = `
attribute vec3 offset; attribute vec4 info; // info.x variant, info.y phase, info.z eager, info.w shade
uniform float time; uniform float excite; uniform vec3 camPos;
varying vec2 vUv; varying float vShade;
void main(){
  float eager = info.z;
  float stand = smoothstep(0.0, 0.25, excite - (1.0 - eager) * 0.8);
  float bob = sin(time * (2.0 + eager * 3.0) + info.y * 6.28) * (0.04 + excite * 0.45 * eager);
  vec3 c = offset + vec3(0.0, bob + stand * 1.15, 0.0);
  vec3 to = camPos - c; to.y = 0.0; to = normalize(to);
  vec3 right = vec3(to.z, 0.0, -to.x);
  float w = 2.1, h = 3.1;
  vec3 p = c + right * position.x * w + vec3(0.0, position.y * h, 0.0);
  float v = info.x; float cheer = step(0.5, stand + step(0.93, fract(info.y * 13.7 + floor(time * 0.7 + info.y * 5.0) * 0.37)) * excite);
  float col = mod(v, ${COLS}.0), row = floor(v / ${COLS}.0) + cheer * 2.0;
  vUv = vec2((col + position.x + 0.5) / ${COLS}.0, 1.0 - (row + 1.0 - position.y) / ${ROWS}.0);
  vShade = (0.78 + 0.22 * fract(info.y * 7.3)) * info.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const FS = `
uniform sampler2D map; uniform float light; varying vec2 vUv; varying float vShade;
void main(){ vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb * vShade * light, 1.0);
#include <fog_fragment>
#include <colorspace_fragment>
}`;

export function makeCrowd(seats, team, opts = {}) {
  const fill = opts.fill ?? 0.9, maxN = opts.fast ? 10000 : 32000, ST = 5;
  const pts = [];
  let s = 1234567; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < seats.length; i += ST) if (r() < seats[i + 3] * fill) pts.push(i);
  // thin out evenly if too many
  const step = Math.max(1, pts.length / maxN);
  const n = Math.min(maxN, Math.floor(pts.length / step));
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const off = new Float32Array(n * 3), info = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const k = pts[Math.floor(i * step)];
    off[i * 3] = seats[k]; off[i * 3 + 1] = seats[k + 1]; off[i * 3 + 2] = seats[k + 2];
    info[i * 4] = Math.floor(r() * VAR); info[i * 4 + 1] = r(); info[i * 4 + 2] = r(); info[i * 4 + 3] = seats[k + 4] ?? 1;
  }
  g.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute('info', new THREE.InstancedBufferAttribute(info, 4));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS,
    uniforms: { map: { value: atlas(team) }, time: { value: 0 }, excite: { value: 0 }, camPos: { value: new THREE.Vector3() }, light: { value: 1 } },
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
  let ex = 0;
  return {
    mesh, count: n,
    update(dt, t, excite, cam) {
      ex += (excite - ex) * Math.min(1, dt * (excite > ex ? 6 : 1.2));
      mat.uniforms.time.value = t; mat.uniforms.excite.value = ex;
      if (cam) mat.uniforms.camPos.value.copy(cam.position);
    },
    setLight(v) { mat.uniforms.light.value = v; },
  };
}
