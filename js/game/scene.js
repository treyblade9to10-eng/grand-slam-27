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
  dusk: { top: '#24305e', mid: '#c0607a', bot: '#ffb36b', sun: '#ffd2a0', sunI: 2.0, hemi: 1.0, fog: '#a2707a', exp: 1.08 },
  night: { top: '#02040b', mid: '#081226', bot: '#16233d', sun: '#f6f3ff', sunI: 2.3, hemi: 0.8, fog: '#0b1220', exp: 1.08 },
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
  scene.fog = new THREE.Fog(S.fog, 1200, 4200);
  const hemi = new THREE.HemisphereLight(time === 'night' ? '#dfe7ff' : '#ffffff', '#3b4a33', S.hemi); scene.add(hemi);
  const sun = new THREE.DirectionalLight(S.sun, S.sunI);
  // day: sun high behind the third base side; night: light banks overhead
  if (time === 'night' || park.closed) sun.position.set(80, 420, 160); else if (time === 'dusk') sun.position.set(-480, 260, 220); else sun.position.set(-300, 420, 160); // afternoon sun over the 3B stands: shade creeps onto the third base side
  sun.target.position.set(0, 0, -100); scene.add(sun, sun.target);
  if (renderer.shadowMap.enabled) {
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    const c = sun.shadow.camera; c.left = -330; c.right = 330; c.top = 340; c.bottom = -340; c.near = 50; c.far = 1600; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
  }
  if (time === 'night' && !park.closed) { // light banks all around: two soft fills from the outfield corners
    for (const [x, z] of [[-300, -420], [300, -420]]) { const fill = new THREE.DirectionalLight('#e6ecff', 0.55); fill.position.set(x, 300, z); fill.target.position.set(0, 0, -100); scene.add(fill, fill.target); }
  }
  if (park.closed) { const fill = new THREE.DirectionalLight('#fff8ee', 0.6); fill.position.set(-150, 300, -400); scene.add(fill); }
  park.setTime(time, scene);
  park.crowd.setLight(time === 'night' ? 0.85 : time === 'dusk' ? 0.8 : 1);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 12000);
  let lastW = 0, lastH = 0, lastDpr = 0;
  const resize = () => {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight, dpr = Math.min(window.devicePixelRatio || 1, fast ? 1.5 : 2);
    const cv = renderer.domElement;
    if (w === lastW && h === lastH && dpr === lastDpr && cv.width === Math.floor(w * dpr) && Math.abs(camera.aspect - w / h) < 1e-3) return false;
    lastW = w; lastH = h; lastDpr = dpr;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    return true;
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
