// Motion capture for the swing and the pitching delivery (CMU Graphics Lab Motion Capture Database, free for all uses,
// subject 124: "baseball swing" 124_07, "baseball pitch" 124_01). Clips are joint positions in the character frame
// (meters, +z forward, +x = character's left); every frame they are turned into rotations for the 17-bone driver rig
// by lining each bone up with its mocap segment (and its bend plane), so the human mesh follows real movement.
import * as THREE from '../lib/three.min.js';
import { J as RJ } from './human.js';

const BASE = new URL('../../models/anim/', import.meta.url).href;
export const CLIPS = {};
export async function loadMocap() {
  if (CLIPS.swing) return CLIPS;
  const get = n => fetch(BASE + n + '.json').then(r => r.json());
  const [swing, pitch] = await Promise.all([get('swing'), get('pitch')]);
  for (const [k, c] of [['swing', swing], ['pitch', pitch]]) { c.ix = Object.fromEntries(c.joints.map((n, i) => [n, i])); c.n = c.F.length; CLIPS[k] = c; }
  return CLIPS;
}
// frame lookup tables: anim t (the game's 0..1 pose time) -> clip frame index
const MAP = {
  swing: [[0, 20], [0.25, 39], [0.5, 57], [1, 84]],       // stance -> load -> contact -> finish
  pitch: [[0, 0], [0.72, 109], [1, 157]],                 // set / leg lift -> release -> follow through
};
export function clipFrame(name, t) {
  const m = MAP[name]; t = Math.max(0, Math.min(1, t));
  let i = 0; while (i < m.length - 2 && t > m[i + 1][0]) i++;
  const [t0, f0] = m[i], [t1, f1] = m[i + 1];
  return f0 + (f1 - f0) * Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1)));
}
const V = () => new THREE.Vector3();
const _p = {}, _tmp = V(), _a = V(), _b = V(), _c = V(), _m = new THREE.Matrix4(), _m0 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
function jp(c, f, name, out) {
  const i = c.ix[name] * 3, f0 = Math.floor(f), f1 = Math.min(c.n - 1, f0 + 1), u = f - f0, A = c.F[f0], B = c.F[f1];
  return out.set(A[i] + (B[i] - A[i]) * u, A[i + 1] + (B[i + 1] - A[i + 1]) * u, A[i + 2] + (B[i + 2] - A[i + 2]) * u);
}
// rotation taking rest axes (p0 primary, s0 secondary) to target axes (d, s)
function basisQ(p0, s0, d, s, out) {
  const bx = (p, q, m) => { _a.copy(p).normalize(); _b.copy(q).addScaledVector(_a, -q.dot(_a)); if (_b.lengthSq() < 1e-8) _b.set(_a.y, _a.z, _a.x).cross(_a); _b.normalize(); _c.crossVectors(_a, _b); m.makeBasis(_a, _b, _c); };
  bx(p0, s0, _m0); bx(d, s, _m); _m.multiply(_m0.transpose());
  return out.setFromRotationMatrix(_m);
}
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), LEFT = new THREE.Vector3(1, 0, 0), RIGHTV = new THREE.Vector3(-1, 0, 0), FWD = new THREE.Vector3(0, 0, 1);
const W = Array.from({ length: 17 }, () => new THREE.Quaternion());
const PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15];
const P = n => _p[n] || (_p[n] = V());
// pose the driver rig P (bones 0..16) from clip `name` at anim time t. parts: 'all' | 'body' (no arms)
export function applyMocap(R, name, t, parts = 'all') {
  const c = CLIPS[name]; if (!c) return false;
  const f = clipFrame(name, t);
  for (const n of c.joints) jp(c, f, n, P(n));
  const hips = P('Hips'), chestTop = P('Neck');
  // pelvis: up the spine, left = hip line
  basisQ(UP, LEFT, _tmp.copy(P('Spine1')).sub(hips), V().copy(P('LeftUpLeg')).sub(P('RightUpLeg')), W[0]);
  // chest: up = spine to neck, left = shoulder line
  // chest: up = from the low back to between the shoulders (Neck sits on Spine1 in this skeleton), left = shoulder line
  const midSh = V().copy(P('LeftArm')).add(P('RightArm')).multiplyScalar(0.5);
  basisQ(UP, LEFT, _tmp.copy(midSh).sub(hips), V().copy(P('LeftArm')).sub(P('RightArm')), W[2]);
  W[1].copy(W[0]).slerp(W[2], 0.45);
  const neckUp = V().copy(P('Head')).sub(midSh); const chestLeft = V().copy(LEFT).applyQuaternion(W[2]);
  basisQ(UP, LEFT, neckUp, chestLeft, W[3]); W[4].copy(W[3]);
  if (name === 'swing') { // eyes on the pitcher (he is off the batter's left shoulder, +x) until the follow-through
    const k = 0.75 * (1 - Math.max(0, Math.min(1, (t - 0.55) / 0.3)));
    basisQ(FWD, UP, _tmp.set(1, -0.12, 0.12), UP, _q); W[4].slerp(_q, k); W[3].slerp(_q, k * 0.4);
  }
  // legs: thigh / shin follow the segments, knee hinge sets the twist; foot points at the toe
  const pelvisLeft = V().copy(LEFT).applyQuaternion(W[0]);
  for (const [s, b] of [['Left', 11], ['Right', 14]]) {
    const du = V().copy(P(s + 'Leg')).sub(P(s + 'UpLeg')), dl = V().copy(P(s + 'Foot')).sub(P(s + 'Leg'));
    let ax = V().crossVectors(du, dl); const L = ax.length(); ax = L > 0.004 ? ax.normalize().lerp(pelvisLeft, Math.max(0, 1 - L / 0.03)).normalize() : pelvisLeft.clone();
    basisQ(DOWN, LEFT, du, ax, W[b]); basisQ(DOWN, LEFT, dl, ax, W[b + 1]);
    basisQ(FWD, LEFT, V().copy(P(s + 'ToeBase')).sub(P(s + 'Foot')), ax, W[b + 2]);
  }
  if (parts === 'all') for (const [s, b] of [['Left', 5], ['Right', 8]]) {
    const du = V().copy(P(s + 'ForeArm')).sub(P(s + 'Arm')), dl = V().copy(P(s + 'Hand')).sub(P(s + 'ForeArm')), dh = V().copy(P(s + 'FingerBase')).sub(P(s + 'Hand'));
    let ax = V().crossVectors(du, dl); const L = ax.length(); const fb = V().copy(chestLeft).negate();
    ax = L > 0.004 ? ax.normalize().lerp(fb, Math.max(0, 1 - L / 0.03)).normalize() : fb;
    basisQ(DOWN, RIGHTV, du, ax, W[b]); basisQ(DOWN, RIGHTV, dl, ax, W[b + 1]); basisQ(DOWN, RIGHTV, dh.lengthSq() > 1e-6 ? dh : dl, ax, W[b + 2]);
  }
  // world -> local
  const bones = R.bones, n = parts === 'all' ? 17 : 17;
  for (let i = 0; i < n; i++) {
    if (parts !== 'all' && i >= 5 && i <= 10) continue;
    const p = PARENT[i];
    if (p < 0) bones[i].quaternion.copy(W[i]);
    else bones[i].quaternion.copy(_qi.copy(W[p]).invert().multiply(W[i]));
  }
  if (parts !== 'all') { // arms keep their own (IK) pose, but must ride on the new chest: re-express from the old chest
    // nothing to do: the IK in batPose runs after this and works in flip space
  }
  // pelvis position (the rest pelvis sits at RJ.pelvis)
  bones[0].position.set(hips.x + RJ.pelvis[0], hips.y - 0.0, hips.z + RJ.pelvis[2]);
  return true;
}
export function mocapHands(name, t, out) { // mid point between the wrists (for the bat grip)
  const c = CLIPS[name]; if (!c) return null; const f = clipFrame(name, t);
  jp(c, f, 'LeftHand', _a); jp(c, f, 'RightHand', _b); return out.copy(_a).add(_b).multiplyScalar(0.5);
}
