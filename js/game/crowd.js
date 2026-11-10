// Crowd: thousands of instanced billboard fans (2 triangles each) drawn from a generated sprite atlas.
// Fans bob, clap and stand up/cheer with the `excite` level. Shirts mostly in the home club's colors.
import * as THREE from '../lib/three.min.js';

const COLS = 8, ROWS = 4; // rows 0-1 = sitting variants, rows 2-3 = same fans cheering (arms up)
function atlas(team) {
  const CW = 64, CH = 96, cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * ROWS;
  const x = cv.getContext('2d');
  const skins = ['#f1d0b0', '#e3b48e', '#c99467', '#a5714a', '#7d5233', '#5a3a22'];
  const shirts = [team.c1, team.c1, team.c2, team.c1, '#f2f2f2', team.c3 || team.c2, team.c1, '#3b4a5c', team.c2, '#d8d8d8', '#202226', team.c1, '#7a2b2b', team.c1, '#2c5d8a', team.c2];
  const hairs = ['#1b1210', '#3a2616', '#6b4423', '#c8a060', '#888', '#111'];
  let seed = 9; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let v = 0; v < COLS * 2; v++) {
    const sk = skins[(r() * 6) | 0], sh = shirts[v % shirts.length], hc = hairs[(r() * 6) | 0], cap = r() < 0.45, capC = r() < 0.7 ? team.c1 : '#222';
    for (const cheer of [0, 1]) {
      const cx = (v % COLS) * CW + CW / 2, cy = (Math.floor(v / COLS) + cheer * 2) * CH;
      x.save(); x.translate(cx, cy);
      // seat back
      x.fillStyle = 'rgba(0,0,0,0)';
      // torso
      x.fillStyle = sh; x.beginPath(); x.moveTo(-17, 92); x.lineTo(-15, 48); x.quadraticCurveTo(0, 38, 15, 48); x.lineTo(17, 92); x.closePath(); x.fill();
      x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(-17, 80, 34, 12);
      // arms
      x.strokeStyle = sh; x.lineWidth = 8; x.lineCap = 'round';
      if (cheer) { x.beginPath(); x.moveTo(-13, 52); x.lineTo(-22, 26); x.lineTo(-20, 6); x.moveTo(13, 52); x.lineTo(22, 26); x.lineTo(20, 6); x.stroke(); x.fillStyle = sk; x.beginPath(); x.arc(-20, 5, 4.5, 0, 7); x.arc(20, 5, 4.5, 0, 7); x.fill(); }
      else { x.beginPath(); x.moveTo(-14, 52); x.lineTo(-17, 72); x.lineTo(-8, 80); x.moveTo(14, 52); x.lineTo(17, 72); x.lineTo(8, 80); x.stroke(); }
      // head
      x.fillStyle = sk; x.beginPath(); x.ellipse(0, 33, 9.5, 11, 0, 0, 7); x.fill();
      if (cap) { x.fillStyle = capC; x.beginPath(); x.ellipse(0, 26, 10.5, 7, 0, Math.PI, 0); x.fill(); x.fillRect(-10.5, 25, 21, 3); }
      else { x.fillStyle = hc; x.beginPath(); x.ellipse(0, 27, 10, 6.5, 0, Math.PI, 0); x.fill(); }
      x.restore();
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const VS = `
attribute vec3 offset; attribute vec3 info; // info.x variant, info.y phase, info.z eager
uniform float time; uniform float excite; uniform vec3 camPos;
varying vec2 vUv; varying float vShade;
void main(){
  float eager = info.z;
  float stand = smoothstep(0.0, 0.25, excite - (1.0 - eager) * 0.8);
  float bob = sin(time * (2.0 + eager * 3.0) + info.y * 6.28) * (0.06 + excite * 0.5 * eager);
  vec3 c = offset + vec3(0.0, bob + stand * 1.1, 0.0);
  vec3 to = camPos - c; to.y = 0.0; to = normalize(to);
  vec3 right = vec3(to.z, 0.0, -to.x);
  float w = 2.2, h = 3.3;
  vec3 p = c + right * position.x * w + vec3(0.0, position.y * h, 0.0);
  float v = info.x; float cheer = step(0.5, stand + step(0.92, fract(info.y * 13.7 + floor(time * 0.7 + info.y * 5.0) * 0.37)) * excite);
  float col = mod(v, 8.0), row = floor(v / 8.0) + cheer * 2.0;
  vUv = vec2((col + position.x + 0.5) / 8.0, 1.0 - (row + 1.0 - position.y) / 4.0);
  vShade = 0.75 + 0.25 * fract(info.y * 7.3);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const FS = `
uniform sampler2D map; uniform float light; varying vec2 vUv; varying float vShade;
void main(){ vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb * vShade * light, 1.0);
#include <colorspace_fragment>
}`;

export function makeCrowd(seats, team, opts = {}) {
  // seats = flat [x,y,z,density,...]
  const fill = opts.fill ?? 0.9, maxN = opts.fast ? 6000 : 16000;
  const pts = [];
  let s = 1234567; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < seats.length; i += 4) if (r() < seats[i + 3] * fill) pts.push(seats[i], seats[i + 1], seats[i + 2]);
  // thin out evenly if too many
  const step = Math.max(1, pts.length / 3 / maxN);
  const n = Math.min(maxN, Math.floor(pts.length / 3 / step));
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const off = new Float32Array(n * 3), info = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i * step) * 3;
    off[i * 3] = pts[k]; off[i * 3 + 1] = pts[k + 1]; off[i * 3 + 2] = pts[k + 2];
    info[i * 3] = Math.floor(r() * 16); info[i * 3 + 1] = r(); info[i * 3 + 2] = r();
  }
  g.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute('info', new THREE.InstancedBufferAttribute(info, 3));
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
