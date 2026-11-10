// Renderer, sky, lights, time of day
import * as THREE from '../lib/three.min.js';
import { Park } from './park.js';
import { Settings } from '../store.js';

export function gfxLevel() {
  if (Settings.gfx === 'high') return 'high';
  if (Settings.gfx === 'fast') return 'fast';
  const mobile = /iPhone|iPad|Android|CrOS/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
  return mobile ? 'fast' : 'high';
}
const SKY = {
  day: { top: '#3a7bd5', mid: '#8fbfe8', bot: '#dfe9f0', sun: '#fff4e0', sunI: 2.6, hemi: 1.1, fog: '#c7d8e6', exp: 1.0 },
  dusk: { top: '#24305e', mid: '#c0607a', bot: '#ffb36b', sun: '#ffc48a', sunI: 1.5, hemi: 0.75, fog: '#a2707a', exp: 1.05 },
  night: { top: '#03060f', mid: '#0b1630', bot: '#1d2c4a', sun: '#f4f1ff', sunI: 2.1, hemi: 0.55, fog: '#0d1424', exp: 1.1 },
  dome: { top: '#cfd2d6', mid: '#cfd2d6', bot: '#cfd2d6', sun: '#fffaf0', sunI: 2.0, hemi: 0.95, fog: '#b9bcc2', exp: 1.0 },
};
export function makeStage(container, parkId, pk, team, time) {
  const level = gfxLevel(), fast = level === 'fast';
  const renderer = new THREE.WebGLRenderer({ antialias: !fast, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, fast ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !fast; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const park = new Park(parkId, pk, team, { fast, time });
  const S = SKY[park.closed ? 'dome' : time] || SKY.night;
  renderer.toneMappingExposure = S.exp;
  scene.add(park.group);
  // sky dome
  const skyM = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(S.top) }, mid: { value: new THREE.Color(S.mid) }, bot: { value: new THREE.Color(S.bot) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.7, h)) : mix(bot, mid, smoothstep(-0.05, 0.15, h)); gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), skyM); scene.add(sky);
  if (time === 'night' && !park.closed) { // stars
    const n = 600, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, e = 0.15 + Math.random() * 1.3; p[i * 3] = Math.cos(a) * Math.cos(e) * 5000; p[i * 3 + 1] = Math.sin(e) * 5000; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 5000; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#cfd8ff', size: 6, sizeAttenuation: true, transparent: true, opacity: 0.7 })));
  }
  scene.fog = new THREE.Fog(S.fog, 1400, 5200);
  const hemi = new THREE.HemisphereLight('#ffffff', '#3b4a33', S.hemi); scene.add(hemi);
  const sun = new THREE.DirectionalLight(S.sun, S.sunI);
  // day: sun high behind the third base side; night: light banks overhead
  if (time === 'night' || park.closed) sun.position.set(80, 420, 160); else if (time === 'dusk') sun.position.set(-500, 160, 200); else sun.position.set(-260, 520, 120);
  sun.target.position.set(0, 0, -100); scene.add(sun, sun.target);
  if (renderer.shadowMap.enabled) {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera; c.left = -200; c.right = 200; c.top = 220; c.bottom = -220; c.near = 50; c.far = 1400; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.4;
  }
  if (time === 'night' && !park.closed) { const fill = new THREE.DirectionalLight('#dfe6ff', 0.7); fill.position.set(-200, 300, -300); scene.add(fill); }
  park.setTime(time, scene);
  park.crowd.setLight(time === 'night' ? 0.85 : time === 'dusk' ? 0.8 : 1);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 12000);
  const resize = () => {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  resize(); window.addEventListener('resize', resize);
  return {
    renderer, scene, camera, park, sun, level, resize,
    dispose() {
      window.removeEventListener('resize', resize);
      renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement.remove();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}
