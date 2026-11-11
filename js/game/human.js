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
  reshapeBody(bodyMesh); evenTorso(bodyMesh); drapeJersey(bodyMesh);
  if (eyes) { const P = eyes.geometry.attributes.position; for (const sg of [-1, 1]) { const c = new THREE.Vector3(); let n = 0; for (let i = 0; i < P.count; i++) if (Math.sign(P.getX(i)) === sg) { c.x += P.getX(i); c.y += P.getY(i); c.z += P.getZ(i); n++; } c.multiplyScalar(1 / (n || 1)); for (let i = 0; i < P.count; i++) if (Math.sign(P.getX(i)) === sg) { P.setXYZ(i, c.x + (P.getX(i) - c.x) * 0.91, c.y + (P.getY(i) - c.y) * 0.91, c.z + (P.getZ(i) - c.z) * 0.91 - 0.0016); } } P.needsUpdate = true; }
  // thinner, more natural eyebrows (the stock ones are thick painted blocks)
  if (browMesh) { const P = browMesh.geometry.attributes.position; for (const sg of [-1, 1]) { let cy = 0, n = 0; for (let i = 0; i < P.count; i++) if (Math.sign(P.getX(i)) === sg) { cy += P.getY(i); n++; } cy /= n || 1; for (let i = 0; i < P.count; i++) if (Math.sign(P.getX(i)) === sg) P.setY(i, cy + (P.getY(i) - cy) * 0.55); } P.needsUpdate = true; }
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
const TONES = [[0, 1.04], [0.14, 1.0], [0.3, 0.97], [0.5, 0.94], [0.7, 0.9], [0.9, 0.84], [1, 0.74], [1, 0.6]];
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
  m.normalScale.set(0.45, 0.45);
  const u = {
    uJersey: { value: C(U.base) }, uPants: { value: C(U.pants || U.base) }, uTrim: { value: C(U.trim) }, uTrim2: { value: C(U.piping || U.trim2 || U.trim) },
    uUnder: { value: C(U.under || U.trim) }, uBelt: { value: C(U.belt || U.trim) }, uSock: { value: C(U.sock || U.trim) }, uStripe: { value: C(U.sockStripe || U.base) },
    uShoe: { value: C(U.shoe || '#1b1b1f') }, uGlove: { value: C(opt.gloveColor || U.trim) },
    uPin: { value: U.pin ? 1 : 0 }, uPipe: { value: U.piping ? 1 : 0 }, uSleeveEnd: { value: opt.sleeveEnd ?? 0.36 }, uUnderOn: { value: opt.under ? 1 : 0 }, uGloveOn: { value: opt.gloves ? 1 : 0 },
    uPantsEnd: { value: opt.long ? 0.16 : 0.40 }, uBuild: { value: opt.build || 1 }, uFaceA: { value: new THREE.Vector4(...(opt.face || [0, 0, 0, 0, 0, 0, 0, 0, 0]).slice(0, 4)) }, uFaceB: { value: new THREE.Vector4(...(opt.face || [0, 0, 0, 0, 0, 0, 0, 0, 0]).slice(4, 8)) }, uFaceC: { value: (opt.face || [])[8] || 0 }, uMirror: { value: opt.mirror ? -1 : 1 }, uUmp: { value: opt.ump ? 1 : 0 }, uBeard: { value: opt.beard || 0 }, uHairC: { value: C(opt.hairHex || '#2a1c14') }, uSeed: { value: opt.seed || 0 },
    uDecal: { value: opt.decal || null }, uDecalOn: { value: opt.decal ? 1 : 0 }, uPatch: { value: opt.patch || null }, uPatchOn: { value: opt.patch ? 1 : 0 },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vB; varying vec3 vBN; uniform float uSleeveEnd; uniform float uPantsEnd; uniform float uBuild; uniform vec4 uFaceA; uniform vec4 uFaceB; uniform float uFaceC;')
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
          vec3 p = transformed;
          // ---- per-player face: jaw, chin, nose, brow, skull width, cheekbones, lips, face length ----
          if (y > 1.545) {
            float hw = smoothstep(1.545, 1.575, y);
            float front = smoothstep(-0.02, 0.04, p.z);
            vec2 eL = vec2(ax - 0.033, y - 1.699);
            float eyeK = 1.0 - exp(-dot(eL, eL) / (0.021 * 0.021)); // keep the eye sockets where the eyeballs are
            float jaw = hw * (1.0 - smoothstep(1.62, 1.68, y)) * front;
            p.x *= 1.0 + 0.16 * uFaceA.x * jaw * eyeK;
            float chin = hw * (1.0 - smoothstep(1.595, 1.625, y)) * smoothstep(0.02, 0.06, p.z) * (1.0 - smoothstep(0.03, 0.06, ax));
            p.y -= 0.014 * uFaceA.y * chin; p.z += 0.008 * uFaceA.y * chin;
            vec3 nb = vec3(0.0, 1.652, 0.088); vec3 dn = p - nb;
            float nose = exp(-dot(dn, dn) / (0.026 * 0.026)) * step(0.075, p.z);
            p.z += dn.z * 0.45 * uFaceA.z * nose; p.y += dn.y * 0.22 * uFaceA.z * nose;
            p.x *= 1.0 + 0.36 * uFaceA.w * nose;
            float brow = exp(-pow((y - 1.722) / 0.012, 2.0)) * smoothstep(0.06, 0.085, p.z) * (1.0 - smoothstep(0.05, 0.075, ax));
            p.z += 0.004 * uFaceB.x * brow;
            p.x *= 1.0 + 0.032 * uFaceB.y * hw;
            vec3 ck = vec3(ax - 0.056, y - 1.664, p.z - 0.062);
            float cheek = exp(-dot(ck, ck) / (0.024 * 0.024)) * eyeK;
            p.x *= 1.0 + 0.1 * uFaceB.z * cheek; p.z += 0.004 * uFaceB.z * cheek;
            vec3 lp = vec3(p.x, y - 1.616, p.z - 0.088);
            p.z += 0.0045 * uFaceB.w * exp(-dot(lp, lp) / (0.017 * 0.017));
            float lower = hw * front * (1.0 - smoothstep(1.66, 1.69, y)) * eyeK;
            p.y = mix(p.y, 1.69 + (p.y - 1.69) * (1.0 + 0.065 * uFaceC), lower);
          }
          // body build: heavier players are wider through the trunk and thighs
          float bw = (uBuild - 1.0) * (smoothstep(0.55, 0.85, y) * (1.0 - smoothstep(1.35, 1.5, y))) * (1.0 - smoothstep(0.2, 0.3, ax));
          p.x += p.x * bw * 0.9; p.z += (p.z + 0.02) * bw * 1.1 * smoothstep(0.95, 1.15, y);
          transformed = p + normal * puff;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vB; varying vec3 vBN;
        uniform vec3 uJersey, uPants, uTrim, uTrim2, uUnder, uBelt, uSock, uStripe, uShoe, uGlove;
        uniform float uPin, uPipe, uSleeveEnd, uUnderOn, uGloveOn, uPantsEnd, uMirror, uDecalOn, uPatchOn, uUmp, uBeard, uSeed; uniform vec3 uHairC;
        float fhash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
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
          // ---- face detail: eye-socket depth, natural lip tone, beard / stubble painted on the skin ----
          if (c < 0.5 && y > 1.53 && vB.z > -0.06) {
            float lum = dot(col, vec3(0.3, 0.55, 0.15));
            // lips: same hue family as the skin (the base texture paints every tone with pink lips)
            vec2 lq = vec2(ax / 0.026, (y - 1.615) / 0.0105);
            float lip = (1.0 - smoothstep(0.7, 1.0, length(lq))) * smoothstep(0.072, 0.082, vB.z);
            vec3 lipC = mix(vec3(lum), col, 0.55) * vec3(1.02, 0.86, 0.84);
            col = mix(col, lipC, lip * 0.75);
            // nose tip: less shiny pink
            vec3 nt = vec3(ax, y - 1.655, vB.z - 0.105);
            col = mix(col, mix(vec3(lum), col, 0.7), exp(-dot(nt, nt) / (0.018 * 0.018)) * 0.6);
            // soft shadow in the eye sockets and under the brow (depth instead of a flat painted face)
            vec2 eo = vec2(ax - 0.034, (y - 1.701) * 1.35);
            float sock = exp(-dot(eo, eo) / (0.024 * 0.024)) * smoothstep(0.03, 0.07, vB.z);
            col *= 1.0 - 0.22 * sock * (1.0 - smoothstep(0.0, 0.012, abs(ax - 0.034) - 0.004 + abs(y - 1.700)));
            col *= 1.0 - 0.14 * exp(-pow((y - 1.712) / 0.006, 2.0)) * (1.0 - smoothstep(0.045, 0.06, ax)) * smoothstep(0.06, 0.08, vB.z);
            // beard / stubble zone: jaw line, chin, moustache, sideburns
            float top = mix(1.636, 1.676, smoothstep(0.03, 0.068, ax));
            float jawZ = mix(smoothstep(1.566, 1.582, y), smoothstep(1.585, 1.6, y), step(0.0, -vBN.y) * (1.0 - smoothstep(0.03, 0.06, ax)) * 0.0) * smoothstep(1.566, 1.582, y) * (1.0 - smoothstep(top - 0.008, top + 0.004, y)) * smoothstep(-0.035, 0.0, vB.z);
            float must = smoothstep(1.621, 1.626, y) * (1.0 - smoothstep(1.638, 1.645, y)) * (1.0 - smoothstep(0.026, 0.034, ax)) * smoothstep(0.07, 0.085, vB.z);
            float lipCut = lip;
            float bm = clamp(max(jawZ, must) - lipCut * 1.2, 0.0, 1.0);
            float n = fhash(floor(vB * vec3(1500.0, 520.0, 1500.0)) + uSeed);
            float n2 = fhash(floor(vB * 420.0) + uSeed * 1.7);
            float stub = min(uBeard, 0.45), full = smoothstep(0.5, 1.0, uBeard);
            col = mix(col, col * mix(vec3(1.0), uHairC * 1.4 + 0.25, 0.6) * 0.82, bm * stub * (0.55 + 0.45 * n));
            col = mix(col, uHairC * 0.7 * (0.7 + 0.6 * n * n2), bm * full * (0.6 + 0.4 * n) * (1.0 - 0.35 * smoothstep(1.6, 1.58, y) * step(vBN.y, -0.2)));
            // a little pore-scale variation so the skin is not plastic
            col *= 0.97 + 0.06 * fhash(floor(vB * 900.0));
          }
          diffuseColor.rgb = col; cloth = c;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.86, cloth);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, cloth * 0.85));');
  };
  m.customProgramCacheKey = () => 'gsUniform4';
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
  body.material = uniformMaterial(o.skinIdx, o.U, { decal, patch, mirror: o.lefty, gloves: o.gloves, gloveColor: o.gloveColor, under: o.under, long: o.long, ump: o.U.key === 'ump', sleeveEnd: o.sleeveEnd, build: Math.max(0.92, Math.min(1.2, o.look.build || 1)), face: faceParams(o.card && o.card.id), beard: faceHair(o), hairHex: o.hairHex, seed: (faceParams(o.card && o.card.id)[0] + 1) * 37 });
  eyes.material = new THREE.MeshStandardMaterial({ map: H.eyeT, roughness: 0.3, color: '#d8d2cc' });
  const hairC = new THREE.Color(o.hairHex || '#2a1c14');
  brows.material = new THREE.MeshStandardMaterial({ color: hairC.clone().multiplyScalar(0.85).lerp(new THREE.Color('#6b4a36'), 0.18), roughness: 0.95, transparent: true, opacity: 0.8 });
  brows.castShadow = false; eyes.castShadow = false;
  // hair + beard on the head bone (caps sit on top)
  const hm = new THREE.MeshStandardMaterial({ color: hairC, map: H.hairT, roughness: 0.85, side: THREE.DoubleSide });
  let style = HAIRSTYLE[o.look.hair] ?? 'buzz'; if (o.headgear && o.headgear !== 'none') style = o.look.hair === 'bald' ? null : 'buzz';
  const head = bones.Head;
  if (globalThis.__noHair) style = null;
  if (style && H.hair[style]) { const h = new THREE.Mesh(H.hair[style], hm); h.castShadow = true; const fw = faceParams(o.card && o.card.id)[5]; h.scale.set(1.012 + Math.max(0, 0.034 * fw), 1.006, 1.01); head.add(h); }
  if (globalThis.__meshBeard && o.look.beard && H.hair.beard) head.add(new THREE.Mesh(H.hair.beard, hm)); // beards are painted on now (faceHair)
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

// ---- make the superhero base mesh look like a ballplayer ----
// Every vertex is pulled toward (or pushed away from) the bones it is skinned to: limbs get slimmer around the bone
// axis, the chest/lats lose the V-taper, the waist fills in, hips/glutes come in. Done once, in the bind pose.
const RESHAPE = {
  thigh_l: 0.72, thigh_r: 0.72, calf_l: 0.86, calf_r: 0.86, upperarm_l: 0.76, upperarm_r: 0.76, lowerarm_l: 0.86, lowerarm_r: 0.86,
  clavicle_l: 0.8, clavicle_r: 0.8, neck_01: 0.84,
  spine_03: [0.82, 0.86], spine_02: [0.92, 0.95], spine_01: [1.04, 1.08], pelvis: [0.84, 0.76],
};
const CHILD = { thigh_l: 'calf_l', thigh_r: 'calf_r', calf_l: 'foot_l', calf_r: 'foot_r', upperarm_l: 'lowerarm_l', upperarm_r: 'lowerarm_r', lowerarm_l: 'hand_l', lowerarm_r: 'hand_r', clavicle_l: 'upperarm_l', clavicle_r: 'upperarm_r', neck_01: 'Head', spine_03: 'neck_01', spine_02: 'spine_03', spine_01: 'spine_02', pelvis: 'spine_01' };
function reshapeBody(mesh) {
  const sk = mesh.skeleton, G = mesh.geometry, P = G.attributes.position, SI = G.attributes.skinIndex, SW = G.attributes.skinWeight;
  const bindPos = sk.boneInverses.map(m => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(m).invert()));
  const idx = {}; sk.bones.forEach((b, i) => { idx[b.name] = i; });
  const seg = sk.bones.map((b) => { const f = RESHAPE[b.name], c = CHILD[b.name]; if (!f || idx[c] == null) return null; const A = bindPos[idx[b.name]], B = bindPos[idx[c]]; return { A, AB: B.clone().sub(A), L2: B.distanceToSquared(A), f }; });
  const v = new THREE.Vector3(), out = new THREE.Vector3(), p = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i); out.set(0, 0, 0); let wsum = 0;
    for (let k = 0; k < 4; k++) {
      const w = SW.getComponent(i, k); if (w <= 0) continue; const s = seg[SI.getComponent(i, k)];
      if (!s) { out.addScaledVector(v, w); wsum += w; continue; }
      const t = Math.max(0, Math.min(1, d.copy(v).sub(s.A).dot(s.AB) / s.L2));
      p.copy(s.A).addScaledVector(s.AB, t); d.copy(v).sub(p);
      if (Array.isArray(s.f)) { d.x *= s.f[0]; d.z *= s.f[1]; } else d.multiplyScalar(s.f);
      out.addScaledVector(p.add(d), w); wsum += w;
    }
    if (wsum > 0) P.setXYZ(i, out.x / wsum, out.y / wsum, out.z / wsum);
  }
  P.needsUpdate = true; G.computeBoundingSphere();
}

// flatten the superhero hourglass: the trunk's outline (half width per height) is pulled toward a broad moving
// average, so the waist fills in and the chest / hips stop flaring. Arms (out to the side in the bind pose) are skipped.
function evenTorso(mesh) {
  const P = mesh.geometry.attributes.position, Y0 = 0.78, DY = 0.01, N = 66, w = new Float32Array(N);
  const torso = (x, y) => Math.abs(x) < (y > 1.3 ? 0.17 : 0.22);
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i); const k = Math.round((y - Y0) / DY); if (k < 0 || k >= N || !torso(x, y)) continue; w[k] = Math.max(w[k], Math.abs(x)); }
  for (let k = 1; k < N - 1; k++) if (!w[k]) w[k] = (w[k - 1] + w[k + 1]) / 2;
  const avg = new Float32Array(N);
  for (let k = 0; k < N; k++) { let s = 0, n = 0; for (let j = k - 11; j <= k + 11; j++) if (j >= 0 && j < N && w[j]) { s += w[j]; n++; } avg[k] = n ? s / n : w[k]; }
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i); const k = Math.round((y - Y0) / DY); if (k < 0 || k >= N || !torso(x, y) || !w[k]) continue;
    const edge = Math.min(1, (y - 0.80) / 0.08, (1.44 - y) / 0.08); if (edge <= 0) continue;
    const f = 1 + (Math.max(0.9, Math.min(1.14, avg[k] / w[k])) - 1) * 0.8 * edge;
    P.setX(i, x * f);
  }
  P.needsUpdate = true;
}

// the jersey hangs off the chest and shoulder blades instead of clinging to pecs and abs: the front/back of the
// trunk below the chest is filled out to a straight line that falls from the chest to the belt.
function drapeJersey(mesh) {
  const P = mesh.geometry.attributes.position, Y0 = 0.96, DY = 0.01, N = 46, zF = new Float32Array(N).fill(-9), zB = new Float32Array(N).fill(9);
  const torso = (x, y) => Math.abs(x) < (y > 1.3 ? 0.15 : 0.19);
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); const k = Math.round((y - Y0) / DY); if (k < 0 || k >= N || !torso(x, y)) continue; zF[k] = Math.max(zF[k], z); zB[k] = Math.min(zB[k], z); }
  const tF = new Float32Array(N), tB = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    let f = zF[k], b = zB[k];
    for (let j = k + 1; j < N; j++) { const dy = (j - k) * DY; f = Math.max(f, zF[j] - 0.18 * dy); b = Math.min(b, zB[j] + 0.3 * dy); }
    tF[k] = f; tB[k] = b;
  }
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i); const k = Math.round((y - Y0) / DY); if (k < 0 || k >= N || !torso(x, y)) continue;
    const edge = Math.min(1, (y - 0.97) / 0.05, (1.42 - y) / 0.04); if (edge <= 0) continue;
    const c = (zF[k] + zB[k]) / 2;
    const side = Math.max(0, 1 - Math.pow(Math.abs(x) / (y > 1.3 ? 0.15 : 0.19), 4)); // full effect in the middle, fades at the sides
    if (z > c && zF[k] > c) P.setZ(i, c + (z - c) * (1 + ((tF[k] - c) / (zF[k] - c) - 1) * edge * side));
    else if (z < c && zB[k] < c) P.setZ(i, c + (z - c) * (1 + ((c - tB[k]) / (c - zB[k]) - 1) * edge * side));
  }
  P.needsUpdate = true;
}

// nine face-shape knobs in -1..1, fixed per player (from his id) so he always looks the same
// facial hair amount: 0 = clean, ~0.15-0.45 = stubble, 1 = full beard (painted in the skin shader)
function faceHair(o) {
  if (o.U && o.U.key === 'ump') return 0.25;
  if (o.look && o.look.beard) return 0.75 + 0.25 * Math.abs(faceParams((o.card && o.card.id) + 'b')[1]);
  const u = Math.abs(faceParams((o.card && o.card.id) + 's')[2]);
  return u < 0.3 ? 0 : 0.12 + u * 0.33;
}
function faceParams(id) {
  let h = 2166136261; for (const ch of String(id ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const out = []; for (let i = 0; i < 9; i++) { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; const u = (h >>> 0) / 4294967296; out.push((u * 2 - 1) * (0.5 + 0.5 * Math.abs(u * 2 - 1))); }
  return out;
}
