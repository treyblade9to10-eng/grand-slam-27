// Real human ballplayers: a CC0 rigged human body (Quaternius "Universal Base Characters", CC0) that is driven by the
// game's 17-bone animation rig (model.js). The uniform (jersey, pants, socks, cleats, belt, undershirt, batting gloves,
// name / number / wordmark / sleeve patch) is painted on by a shader using the body's rest-pose position, and the
// cloth is puffed out a little so it hangs like a real baggy uniform instead of a body suit.
import * as THREE from '../lib/three.min.js';

const BASE = new URL('../../models/', import.meta.url).href;
export let H = null; // loaded data

// target joint positions in the arms-down rest pose (meters, character faces +z, +x = character's left)
export const J = {
  pelvis: [0, 0.949, -0.043], spine: [0, 1.072, -0.007], chest: [0, 1.311, 0.007], neck: [0, 1.520, -0.041], head: [0, 1.600, -0.017],
  shL: [0.212, 1.455, -0.065], elL: [0.212, 1.204, -0.065], handL: [0.212, 0.961, -0.065],
  hipL: [0.114, 0.971, -0.036], knL: [0.114, 0.542, -0.036], ftL: [0.114, 0.086, -0.088],
};
export const HLEN = { thigh: 0.429, shin: 0.456, upper: 0.251, fore: 0.243, hipDy: 0.022, ankle: 0.086 };

// driver bone index -> target bones it drives (first one is the "same" joint)
const MAP = [
  [0, 'pelvis'], [1, 'spine_01'], [1, 'spine_02'], [2, 'spine_03'], [3, 'neck_01'], [4, 'Head'],
  [5, 'upperarm_l'], [6, 'lowerarm_l'], [7, 'hand_l'], [8, 'upperarm_r'], [9, 'lowerarm_r'], [10, 'hand_r'],
  [11, 'thigh_l'], [12, 'calf_l'], [13, 'foot_l'], [14, 'thigh_r'], [15, 'calf_r'], [16, 'foot_r'],
];
const DPARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15];

function loadTex(url, srgb = true) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, t => { t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, rej));
}
function loadImg(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }

const CURLSIGN = { l: 1, r: -1 };
const CURLAX = (sg) => { const a = (globalThis.__curlAxis || 'x'); const v = new THREE.Vector3(a[0] === 'x' ? 1 : 0, a[0] === 'y' ? 1 : 0, a[0] === 'z' ? 1 : 0); return v.multiplyScalar(sg * (a[1] === '-' ? -1 : 1)); };
const restLocal0 = (b) => b.quaternion.clone();
export async function loadHuman() {
  if (H) return H;
  const L = new THREE.GLTFLoader();
  const [body, buzz, parted, beard, brows, skinL, skinD, normal, hairT, eyeT] = await Promise.all([
    L.loadAsync(BASE + 'body.glb'), L.loadAsync(BASE + 'hair_buzzed.glb'), L.loadAsync(BASE + 'hair_simpleparted.glb'), L.loadAsync(BASE + 'hair_beard.glb'), L.loadAsync(BASE + 'eyebrows_regular.glb'),
    loadImg(BASE + 'skinL.jpg'), loadImg(BASE + 'skinD.jpg'), loadTex(BASE + 'bodyN.jpg', false), loadTex(BASE + 'hair1.jpg'), loadTex(BASE + 'eye.jpg'),
  ]);
  const tpl = body.scene;
  tpl.updateMatrixWorld(true);
  const bones = {}; tpl.traverse(o => { if (o.isBone) bones[o.name] = o; });
  let bodyMesh = null, eyes = null, browMesh = null;
  tpl.traverse(o => { if (o.isSkinnedMesh) { if (/Superhero/i.test(o.material.name)) bodyMesh = o; else if (/Eye/i.test(o.material.name)) eyes = o; else browMesh = o; } });
  // ---- arms-down rest: rotate the arms of the template from T-pose to hanging straight down ----
  const down = new THREE.Vector3(0, -1, 0), a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion(), pq = new THREE.Quaternion();
  for (const s of ['l', 'r']) for (const [n, c] of [['upperarm_' + s, 'lowerarm_' + s], ['lowerarm_' + s, 'hand_' + s]]) {
    const bn = bones[n], cn = bones[c]; tpl.updateMatrixWorld(true);
    bn.getWorldPosition(a); cn.getWorldPosition(b); const dir = b.sub(a).normalize();
    const rot = new THREE.Quaternion().setFromUnitVectors(dir, down);
    bn.getWorldQuaternion(q); q.premultiply(rot);
    bn.parent.getWorldQuaternion(pq); bn.quaternion.copy(pq.invert().multiply(q));
  }
  tpl.updateMatrixWorld(true);
  // relative-to-armature-root rest rotations (the template's own scene root is identity)
  const restQ = {}, restLocal = {};
  for (const [n, bn] of Object.entries(bones)) { const w = new THREE.Quaternion(); bn.getWorldQuaternion(w); restQ[n] = w; restLocal[n] = bn.quaternion.clone(); }
  // hair pieces as rigid meshes on the Head bone
  const headInv = new THREE.Matrix4();
  // use the bind matrices of the body's skeleton for the head (hair files share the same rest skeleton)
  const hb = bodyMesh.skeleton.bones.indexOf(bones.Head);
  headInv.copy(bodyMesh.skeleton.boneInverses[hb]);
  const rigid = (gl) => { let g = null; gl.scene.traverse(o => { if (o.isMesh && !g) g = o.geometry.clone(); }); if (!g) return null; for (const k of ['skinIndex', 'skinWeight']) g.deleteAttribute(k); g.applyMatrix4(headInv); g.computeBoundingSphere(); return g; };
  const hair = { buzz: rigid(buzz), parted: rigid(parted), beard: rigid(beard), brows: rigid(brows) };
  hairT.wrapS = hairT.wrapT = THREE.RepeatWrapping;
  // curled fingers (a relaxed grip): rotate each finger joint about its local z
  const curl = {};
  for (const n of Object.keys(bones)) { const m = /^(index|middle|ring|pinky|thumb)_0([123])_([lr])$/.exec(n); if (!m) continue; const th = m[1] === 'thumb'; const amt = th ? (m[2] === '1' ? 0.0 : 0.35) : (m[2] === '1' ? 0.9 : m[2] === '2' ? 1.1 : 0.7); curl[n] = restLocal0(bones[n]).multiply(new THREE.Quaternion().setFromAxisAngle(CURLAX(CURLSIGN[m[3]]), amt)); }
  // full fist around a bat handle
  const fist = {};
  for (const n of Object.keys(bones)) { const m = /^(index|middle|ring|pinky|thumb)_0([123])_([lr])$/.exec(n); if (!m) continue; const th = m[1] === 'thumb'; const amt = th ? (m[2] === '1' ? 0.35 : 0.75) : (m[2] === '1' ? 1.35 : m[2] === '2' ? 1.45 : 1.0);
    let ax = CURLAX(CURLSIGN[m[3]]);
    if (th) { const ta = globalThis.__thumbAx || 'z-'; ax = new THREE.Vector3(ta[0] === 'x' ? 1 : 0, ta[0] === 'y' ? 1 : 0, ta[0] === 'z' ? 1 : 0).multiplyScalar(CURLSIGN[m[3]] * (ta[1] === '-' ? -1 : 1)); }
    fist[n] = restLocal0(bones[n]).multiply(new THREE.Quaternion().setFromAxisAngle(ax, amt)); }
  // measure each hand in the arms-down rest: knuckle line (pinky -> index), palm side (where the fingers curl to)
  const grip = {}, gripOff = {};
  for (const sd of ['l', 'r']) {
    const wp = (n) => { const v = new THREE.Vector3(); bones[n].getWorldPosition(v); return v; };
    const hand = wp('hand_' + sd), K = wp('index_01_' + sd).sub(wp('pinky_01_' + sd)).normalize();
    const tip0 = wp('middle_04_leaf_' + sd);
    const F = tip0.clone().sub(hand).normalize();
    const keep = ['middle_01_', 'middle_02_', 'middle_03_'].map(n => [bones[n + sd], bones[n + sd].quaternion.clone()]);
    for (const [b] of keep) b.quaternion.copy(fist[b.name]); tpl.updateMatrixWorld(true);
    const N = wp('middle_04_leaf_' + sd).sub(tip0);
    const C = wp('middle_01_' + sd).add(wp('middle_03_' + sd)).multiplyScalar(0.5); // the hole in the fist
    for (const [b, q0] of keep) b.quaternion.copy(q0); tpl.updateMatrixWorld(true);
    N.addScaledVector(K, -N.dot(K)).normalize();
    const X = new THREE.Vector3().crossVectors(K, N);
    const o = C.sub(hand); gripOff[sd] = new THREE.Vector3(o.dot(K), o.dot(N), o.dot(X));
    grip[sd] = new THREE.Matrix4().makeBasis(K, N, X).transpose(); // inverse of the rest basis
  }
  // torso cross-sections (bind pose, meters) used to keep the arms outside the body: per 3cm slice of height,
  // the half width and the front/back of the trunk (arms are out to the side in the bind pose, so they are excluded)
  const slices = [];
  { const P = bodyMesh.geometry.attributes.position, Y0 = 0.80, DY = 0.03, N = 26;
    for (let i = 0; i < N; i++) slices.push([0, 9, -9]);
    for (let i = 0; i < P.count; i++) {
      const x = Math.abs(P.getX(i)), y = P.getY(i), z = P.getZ(i);
      const k = Math.floor((y - Y0) / DY); if (k < 0 || k >= N) continue;
      if (x > (y > 1.3 ? 0.165 : 0.2)) continue;
      const s = slices[k]; if (x > s[0]) s[0] = x; if (z < s[1]) s[1] = z; if (z > s[2]) s[2] = z;
    }
    for (const s of slices) if (s[1] > s[2]) { s[1] = -0.1; s[2] = 0.1; }
    slices.Y0 = Y0; slices.DY = DY;
  }
  H = { slices, grip, gripOff, fist, curl, tpl, bones, bodyMesh, eyes, browMesh, restQ, restLocal, skinImgs: [skinL, skinD], normal, hairT, eyeT, hair, skinCache: new Map(), headInvBind: headInv };
  return H;
}

// ---- skin tone textures: blend the light and dark painted skins, then tint ----
const TONES = [[0, 1.04], [0.14, 1.0], [0.3, 0.98], [0.5, 0.97], [0.66, 0.95], [0.82, 0.92], [1, 0.88], [1, 0.74]];
function skinTex(idx) {
  idx = Math.max(0, Math.min(7, idx | 0));
  if (H.skinCache.has(idx)) return H.skinCache.get(idx);
  const [t, mul] = TONES[idx], S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d'); x.drawImage(H.skinImgs[0], 0, 0, S, S);
  if (t > 0) { x.globalAlpha = t; x.drawImage(H.skinImgs[1], 0, 0, S, S); x.globalAlpha = 1; }
  if (mul !== 1) { x.globalCompositeOperation = mul < 1 ? 'multiply' : 'screen'; const v = mul < 1 ? Math.round(255 * mul) : Math.round(255 * (mul - 1) * 4); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(0, 0, S, S); x.globalCompositeOperation = 'source-over'; }
  const tx = new THREE.CanvasTexture(cv); tx.flipY = false; tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  H.skinCache.set(idx, tx); return tx;
}

// ---- the uniform shader ----
const C = (h) => new THREE.Color(h || '#ffffff');
function uniformMaterial(skinIdx, U, opt) {
  const m = new THREE.MeshStandardMaterial({ map: skinTex(skinIdx), normalMap: H.normal, roughness: 0.62, metalness: 0 });
  m.normalScale.set(0.8, 0.8);
  const u = {
    uJersey: { value: C(U.base) }, uPants: { value: C(U.pants || U.base) }, uTrim: { value: C(U.trim) }, uTrim2: { value: C(U.piping || U.trim2 || U.trim) },
    uUnder: { value: C(U.under || U.trim) }, uBelt: { value: C(U.belt || U.trim) }, uSock: { value: C(U.sock || U.trim) }, uStripe: { value: C(U.sockStripe || U.base) },
    uShoe: { value: C(U.shoe || '#1b1b1f') }, uGlove: { value: C(opt.gloveColor || U.trim) },
    uPin: { value: U.pin ? 1 : 0 }, uPipe: { value: U.piping ? 1 : 0 }, uSleeveEnd: { value: opt.sleeveEnd ?? 0.36 }, uUnderOn: { value: opt.under ? 1 : 0 }, uGloveOn: { value: opt.gloves ? 1 : 0 },
    uPantsEnd: { value: opt.long ? 0.16 : 0.40 }, uBuild: { value: opt.build || 1 }, uMirror: { value: opt.mirror ? -1 : 1 }, uUmp: { value: opt.ump ? 1 : 0 },
    uDecal: { value: opt.decal || null }, uDecalOn: { value: opt.decal ? 1 : 0 }, uPatch: { value: opt.patch || null }, uPatchOn: { value: opt.patch ? 1 : 0 },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vB; varying vec3 vBN; uniform float uSleeveEnd; uniform float uPantsEnd; uniform float uBuild;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vB = position; vBN = normal;
        {
          float ax = abs(position.x), y = position.y;
          float puff = 0.0;
          // jersey body: loose, hangs off the chest
          float torso = step(ax, 0.215) * smoothstep(0.98, 1.06, y) * (1.0 - smoothstep(1.43, 1.50, y));
          puff += torso * (0.026 + 0.014 * smoothstep(1.25, 1.0, y));
          // sleeves: wide short sleeve
          float sleeve = step(0.205, ax) * (1.0 - step(uSleeveEnd, ax)) * step(1.30, y);
          puff += sleeve * (0.008 + 0.012 * smoothstep(0.24, uSleeveEnd, ax));
          // pants: baggy, extra room at the thigh and knee
          float pants = step(uPantsEnd, y) * (1.0 - smoothstep(1.0, 1.05, y)) * step(ax, 0.3);
          puff += pants * (0.018 + 0.012 * exp(-pow((y - 0.55) / 0.08, 2.0)) + 0.006 * smoothstep(0.6, 0.85, y));
          // blouse the pants just above the sock line
          puff += pants * 0.012 * exp(-pow((y - uPantsEnd - 0.03) / 0.03, 2.0));
          // slim the superhero build a bit (shoulders / lats / arms)
          vec3 p = transformed;
          if (y > 1.0 && y < 1.6) {
            float band = smoothstep(1.0, 1.15, y) * (1.0 - smoothstep(1.52, 1.6, y));
            float k = mix(0.92, 1.0, smoothstep(0.17, 0.27, ax));
            p.x = mix(p.x, p.x * k, band); p.z = mix(p.z, p.z * 0.92, band * (1.0 - smoothstep(0.17, 0.27, ax)));
            // flatten the superhero traps
            p.y -= 0.022 * smoothstep(0.05, 0.12, ax) * (1.0 - smoothstep(0.17, 0.22, ax)) * smoothstep(1.47, 1.53, y);
          }
          if (ax >= 0.13 && y > 1.28) { vec3 axis = vec3(p.x, 1.44, -0.068); vec3 d = p - axis; p = axis + d * mix(1.0, 0.8, smoothstep(0.14, 0.22, ax)); }
          // body build: heavier players are wider through the trunk and thighs
          float bw = (uBuild - 1.0) * (smoothstep(0.55, 0.85, y) * (1.0 - smoothstep(1.35, 1.5, y))) * (1.0 - smoothstep(0.2, 0.3, ax));
          p.x += p.x * bw * 0.9; p.z += (p.z + 0.02) * bw * 1.1 * smoothstep(0.95, 1.15, y);
          transformed = p + normal * puff;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vB; varying vec3 vBN;
        uniform vec3 uJersey, uPants, uTrim, uTrim2, uUnder, uBelt, uSock, uStripe, uShoe, uGlove;
        uniform float uPin, uPipe, uSleeveEnd, uUnderOn, uGloveOn, uPantsEnd, uMirror, uDecalOn, uPatchOn, uUmp;
        uniform sampler2D uDecal; uniform sampler2D uPatch;
        float cloth = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float x = vB.x * uMirror, ax = abs(vB.x), y = vB.y;
          vec3 col = diffuseColor.rgb; float c = 0.0;
          bool arm = ax > 0.205 && y > 1.28;
          if (y < 0.112) { col = y < 0.026 ? vec3(0.92) : uShoe; c = 1.0; }
          else if (y < uPantsEnd && !arm) {
            col = uSock; c = 1.0;
            float t = uPantsEnd - y; if (uPantsEnd > 0.3 && t < 0.11 && t > 0.03) col = (t > 0.055 && t < 0.085) ? uStripe : uSock;
          }
          else if (y < 1.05 && !arm && ax < 0.3) {
            col = uPants; c = 1.0;
            if (y > 1.0) col = uBelt; // belt
            else if (uUmp < 0.5 && uPipe > 0.5) { // piping down the outside of each leg
              float side = abs(vBN.x); if (side > 0.86 && y < 0.92) col = uTrim2;
            }
          }
          else if (!arm) {
            // jersey body up to the collar (v-neck in front)
            float neck = vBN.z > 0.0 ? 1.435 + ax * 1.1 : 1.505;
            if (ax > 0.085) neck = 1.62;
            if (y < neck) {
              col = uJersey; c = 1.0;
              if (uPin > 0.5 && fract(vB.x * 52.0 + 0.5) < 0.09) col = mix(uJersey, uTrim, 0.75);
              // collar / placket piping
              if (vBN.z > 0.0 && abs(y - neck) < 0.012 && ax < 0.085) col = uTrim2;
              if (vBN.z > 0.2 && abs(vB.x) < 0.006 && y < 1.43) col = uTrim; // button placket
              if (uUnderOn > 0.5 && y > neck - 0.025 && ax < 0.08 && vBN.z > 0.0) col = uUnder; // undershirt at the v
              if (uDecalOn > 0.5 && y > 1.06 && y < 1.50 && ax < 0.21) {
                vec2 dv; bool on = false;
                if (vBN.z < -0.25) { dv = vec2(0.25 - 0.5 * x / 0.42, (1.48 - y) / 0.5); on = true; }
                else if (vBN.z > 0.3) { dv = vec2(0.75 + 0.5 * x / 0.42, (1.48 - y) / 0.5); on = true; }
                if (on && dv.y > 0.0 && dv.y < 1.0) { vec4 d = texture2D(uDecal, dv); col = mix(col, d.rgb, d.a); }
              }
            }
          } else {
            // arm: sleeve -> undershirt or skin -> batting glove
            if (ax < uSleeveEnd) {
              col = uJersey; c = 1.0;
              if (uPin > 0.5 && fract(vB.z * 52.0) < 0.09) col = mix(uJersey, uTrim, 0.75);
              if (ax > uSleeveEnd - 0.022 && ax < uSleeveEnd - 0.008) col = uTrim;
              if (uPatchOn > 0.5 && vB.x * uMirror > 0.235 && vB.x * uMirror < 0.315 && vBN.y > 0.35) {
                vec2 pv = vec2((ax - 0.235) / 0.08, (vB.z + 0.105) / 0.08);
                if (pv.y > 0.0 && pv.y < 1.0) { vec4 d = texture2D(uPatch, pv); col = mix(col, d.rgb, d.a); }
              }
            } else if (uGloveOn > 0.5 && ax > 0.655) { col = uGlove; c = 1.0; if (ax < 0.675) col = vec3(0.95); }
            else if (uUnderOn > 0.5 && ax < 0.655) { col = uUnder; c = 1.0; }
          }
          diffuseColor.rgb = col; cloth = c;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.86, cloth);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, cloth * 0.85));');
  };
  m.customProgramCacheKey = () => 'gsUniform2';
  return m;
}

// decal atlas: left half = back (name over number), right half = front (wordmark + number)
function decalCanvas(card, U, team, chestLogoImg) {
  const W = 1024, Hh = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const x = cv.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  const num = String(card.num ?? ''), name = (card.last || '').toUpperCase();
  const txt = (s, cx, cy, size, sx, lw) => { x.save(); x.translate(cx, cy); x.scale(sx, 1); x.font = `900 italic ${size}px "Barlow Condensed", "Arial Black", sans-serif`; x.lineWidth = lw; x.strokeStyle = U.trim2 || U.trim; x.fillStyle = U.text || U.trim; if (lw) x.strokeText(s, 0, 0); x.fillText(s, 0, 0); x.restore(); };
  if (U.key !== 'ump') {
    // back
    if (name) { const sz = Math.min(64, 420 / Math.max(5, name.length) * 1.7); txt(name, 256, 70, sz, 1, 4); }
    if (num) txt(num, 256, 250, 230, num.length > 1 ? 0.8 : 1, 10);
    // front: wordmark (or chest logo), small number below on the left side of the chest
    if (chestLogoImg) { const s = Math.min(300 / chestLogoImg.width, 150 / chestLogoImg.height); x.drawImage(chestLogoImg, 768 - chestLogoImg.width * s / 2, 110 - chestLogoImg.height * s / 2, chestLogoImg.width * s, chestLogoImg.height * s); }
    else if (U.word) {
      const w = U.word; let sz = 120;
      x.font = `900 italic ${sz}px "Barlow Condensed", "Arial Black", sans-serif`;
      const full = x.measureText(w).width; if (full > 290) { sz = Math.floor(sz * 290 / full); x.font = `900 italic ${sz}px "Barlow Condensed", "Arial Black", sans-serif`; }
      // gentle arch
      x.save(); x.translate(768, 150); const n = w.length, span = Math.min(290, x.measureText(w).width) * (n > 1 ? (n - 1) / n : 0);
      for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) - 0.5 : 0; x.save(); x.translate(t * span, -Math.cos(t * 1.2) * 26 + 26); x.rotate(t * 0.22); x.lineWidth = 7; x.strokeStyle = U.trim2 || U.trim; x.fillStyle = U.text || U.trim; x.strokeText(w[i], 0, 0); x.fillText(w[i], 0, 0); x.restore(); }
      x.restore();
    }
    if (num) txt(num, 768 - 105 * 0.0 + 110, 300, 80, 1, 5);
  }
  return cv;
}

// pose the arm-down rest for driver bones: positions that match the human body's joints
export function buildHumanBones() {
  const B = []; const mk = (parent, w) => { const b = new THREE.Bone(); const p = parent === null ? new THREE.Vector3(...w) : new THREE.Vector3(...w).sub(B[parent].userData.w); b.position.copy(p); b.userData.w = new THREE.Vector3(...w); if (parent !== null) B[parent].add(b); B.push(b); return b; };
  const m = (v) => [-v[0], v[1], v[2]];
  mk(null, J.pelvis); mk(0, J.spine); mk(1, J.chest); mk(2, J.neck); mk(3, J.head);
  mk(2, J.shL); mk(5, J.elL); mk(6, J.handL);
  mk(2, m(J.shL)); mk(8, m(J.elL)); mk(9, m(J.handL));
  mk(0, J.hipL); mk(11, J.knL); mk(12, J.ftL);
  mk(0, m(J.hipL)); mk(14, m(J.knL)); mk(15, m(J.ftL));
  return B;
}

const HAIRSTYLE = { bald: null, buzz: 'buzz', crop: 'buzz', fade: 'buzz', short: 'parted', headband: 'parted', curly: 'buzz', afro: 'buzz', braids: 'buzz', long: 'parted', bun: 'parted', mohawk: 'buzz' };

// Build the visible human for a driver rig P. opts: {U, card, team, look, skinIdx, hairHex, lefty, gloves, under, patchCanvas, chestLogo}
export function attachHuman(P, o) {
  const root = THREE.cloneSkinned(H.tpl);
  const bones = {}; root.traverse(b => { if (b.isBone) bones[b.name] = b; });
  // reset clone bones to the arms-down rest
  for (const [n, b] of Object.entries(bones)) b.quaternion.copy(H.restLocal[n]);
  let body = null, eyes = null, brows = null;
  root.traverse(m => { if (m.isSkinnedMesh) { if (/Superhero/i.test(m.material.name)) body = m; else if (/Eye/i.test(m.material.name)) eyes = m; else brows = m; m.frustumCulled = false; m.castShadow = true; } });
  const decal = o.team || o.U.key === 'ump' ? new THREE.CanvasTexture(decalCanvas(o.card, o.U, o.team, o.chestLogo)) : null;
  if (decal) { decal.flipY = false; decal.colorSpace = THREE.SRGBColorSpace; decal.anisotropy = 4; }
  const patch = o.patchCanvas ? new THREE.CanvasTexture(o.patchCanvas) : null; if (patch) patch.colorSpace = THREE.SRGBColorSpace;
  body.material = uniformMaterial(o.skinIdx, o.U, { decal, patch, mirror: o.lefty, gloves: o.gloves, gloveColor: o.gloveColor, under: o.under, long: o.long, ump: o.U.key === 'ump', sleeveEnd: o.sleeveEnd, build: Math.max(0.92, Math.min(1.2, o.look.build || 1)) });
  eyes.material = new THREE.MeshStandardMaterial({ map: H.eyeT, roughness: 0.2 });
  const hairC = new THREE.Color(o.hairHex || '#2a1c14');
  brows.material = new THREE.MeshStandardMaterial({ color: hairC.clone().multiplyScalar(0.8), roughness: 0.9 });
  brows.castShadow = false; eyes.castShadow = false;
  // hair + beard on the head bone (caps sit on top)
  const hm = new THREE.MeshStandardMaterial({ color: hairC, map: H.hairT, roughness: 0.85, side: THREE.DoubleSide });
  let style = HAIRSTYLE[o.look.hair] ?? 'buzz'; if (o.headgear && o.headgear !== 'none') style = o.look.hair === 'bald' ? null : 'buzz';
  const head = bones.Head;
  if (globalThis.__noHair) style = null;
  if (style && H.hair[style]) { const h = new THREE.Mesh(H.hair[style], hm); h.castShadow = true; head.add(h); }
  if (o.look.beard && H.hair.beard) head.add(new THREE.Mesh(H.hair.beard, hm));
  P.flip.add(root);
  // retarget bookkeeping
  const order = []; root.traverse(b => { if (b.isBone) order.push(b); });
  const drive = new Map(MAP.map(([d, n]) => [n, d]));
  P.hm = { root, bones, order, drive, body, rel: new Map(), dq: new Array(17).fill(null).map(() => new THREE.Quaternion()), head };
  P.sync = () => syncHuman(P);
  return P.hm;
}

const _tq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _v3 = new THREE.Vector3();
// copy the driver rig's world rotations onto the human skeleton
export function syncHuman(P) {
  const hm = P.hm; if (!hm) return;
  const D = P.bones, dq = hm.dq;
  for (let i = 0; i < 17; i++) { const p = DPARENT[i]; if (p < 0) dq[i].copy(D[i].quaternion); else dq[i].multiplyQuaternions(dq[p], D[i].quaternion); }
  const rel = hm.rel;
  for (const b of hm.order) {
    const parentRel = rel.get(b.parent) || null;
    const di = hm.drive.get(b.name);
    let w = rel.get(b); if (!w) { w = new THREE.Quaternion(); rel.set(b, w); }
    if (di != null) {
      w.multiplyQuaternions(dq[di], H.restQ[b.name]);
      if (parentRel) b.quaternion.copy(_pq.copy(parentRel).invert().multiply(w)); else b.quaternion.copy(w);
    } else {
      b.quaternion.copy(((hm.grip || globalThis.__fistAll) && H.fist[b.name]) || H.curl[b.name] || H.restLocal[b.name]);
      if (parentRel) w.multiplyQuaternions(parentRel, b.quaternion); else w.copy(b.quaternion);
    }
    if (b.name === 'pelvis') {
      // pelvis position follows the driver pelvis (both measured in the same rest frame)
      b.position.copy(D[0].position);
      if (parentRel) b.position.applyQuaternion(_pq.copy(parentRel).invert());
    }
  }
  // batting grip: turn each hand so the fist wraps the handle (knuckle line along the bat)
  const g = hm.grip;
  if (g) for (const [side, N, s] of [['l', g.NL, -1], ['r', g.NR, 1]]) {
    const hb = hm.bones['hand_' + side]; if (!hb) continue;
    // rest basis (arms-down rest): knuckle line +z, palm normal (-x left, +x right), finger dir -y
    _X1.crossVectors(g.d, N);
    _m1.makeBasis(g.d, N, _X1).multiply(H.grip[side]);
    _tq.setFromRotationMatrix(_m1).multiply(H.restQ[hb.name]);
    const pr = rel.get(hb.parent);
    hb.quaternion.copy(_pq.copy(pr).invert().multiply(_tq));
  }
}
const _K0 = new THREE.Vector3(), _N0 = new THREE.Vector3(), _X0 = new THREE.Vector3(), _X1 = new THREE.Vector3(), _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4();
