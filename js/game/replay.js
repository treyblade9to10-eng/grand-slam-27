// Instant replay: records every actor pose + the ball each frame of a live play, then plays it back
// in slow motion with TV-style camera angles. Purely visual - the engine is frozen while it plays.
import * as THREE from '../lib/three.min.js';

const MAX_FRAMES = 60 * 14;
function bonesOf(a) { return a.mesh && a.mesh.skeleton ? a.mesh.skeleton.bones : []; }

export class Recorder {
  constructor(G) { this.G = G; this.frames = []; this.on = false; }
  start() { this.frames = []; this.on = true; this.t = 0; this.contactAt = 0; }
  stop() { this.on = false; }
  capture(dt) {
    if (!this.on) return;
    this.t += dt;
    if (this.frames.length >= MAX_FRAMES) this.frames.shift();
    const G = this.G, acts = [];
    for (const a of G.actors.values()) {
      if (!a.root.visible) continue;
      const bs = bonesOf(a), rot = new Float32Array(bs.length * 3);
      for (let i = 0; i < bs.length; i++) { const r = bs[i].rotation; rot[i * 3] = r.x; rot[i * 3 + 1] = r.y; rot[i * 3 + 2] = r.z; }
      const bp = a.batPivot ? [a.batPivot.position.x, a.batPivot.position.y, a.batPivot.position.z, a.batPivot.rotation.x, a.batPivot.rotation.y, a.batPivot.rotation.z] : null;
      acts.push({ a, x: a.root.position.x, y: a.root.position.y, z: a.root.position.z, ry: a.root.rotation.y, fx: a.flip.scale.x, rot, by: bs[0] ? bs[0].position.y : 0, bp });
    }
    const um = G.ump && G.ump.root;
    const b = G.ballM;
    this.frames.push({ t: this.t, acts, ball: b.visible ? [b.position.x, b.position.y, b.position.z] : null, ump: um ? [um.position.x, um.position.z] : null });
  }
  get length() { return this.frames.length ? this.frames[this.frames.length - 1].t - this.frames[0].t : 0; }
}

// apply recorded frame i (with blend to i+1 by u)
function applyFrame(G, f) {
  const used = new Set();
  for (const s of f.acts) {
    const a = s.a; used.add(a);
    a.root.visible = true; a.root.position.set(s.x, s.y, s.z); a.root.rotation.y = s.ry; a.flip.scale.x = s.fx;
    const bs = bonesOf(a);
    for (let i = 0; i < bs.length && i * 3 < s.rot.length; i++) bs[i].rotation.set(s.rot[i * 3], s.rot[i * 3 + 1], s.rot[i * 3 + 2]);
    if (bs[0]) bs[0].position.y = s.by;
    if (a.sync) a.sync();
    if (s.bp && a.batPivot) { a.batPivot.position.set(s.bp[0], s.bp[1], s.bp[2]); a.batPivot.rotation.set(s.bp[3], s.bp[4], s.bp[5]); }
  }
  for (const a of G.actors.values()) if (!used.has(a)) a.root.visible = false;
  if (f.ump && G.ump) { G.ump.root.position.x = f.ump[0]; }
  if (f.ball) { G.ballM.visible = true; G.ballM.position.set(f.ball[0], f.ball[1], f.ball[2]); G.ballShadow.visible = f.ball[1] > 0.3; G.ballShadow.position.set(f.ball[0], 0.07, f.ball[2]); }
  else { G.ballM.visible = false; G.ballShadow.visible = false; }
  G.trail.visible = false;
}

// Playback. kind: 'hr' | 'catch' | 'play'. Returns a controller with update(dt) -> false when finished.
export function makeReplay(G, rec, kind, info = {}) {
  const F = rec.frames; if (F.length < 20) return null;
  const t0 = F[0].t, tEnd = F[F.length - 1].t;
  // find the moment of contact: first frame where the ball is moving away from home fast
  let ci = 0; for (let i = 1; i < F.length; i++) { const b = F[i].ball; if (b && b[2] < -6 && Math.hypot(b[0], b[2]) > 8) { ci = Math.max(0, i - 4); break; } }
  const tc = F[ci].t;
  const start = Math.max(t0, tc - 0.55);
  const lefty = info.lefty;
  // shots: [fromT, toT, speed, cameraFn]
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ballAt = (f) => f.ball ? V(f.ball[0], f.ball[1], f.ball[2]) : V(0, 3, -40);
  const shots = [];
  // 1) the swing, side-on and low from the open side of the batter, super slow
  shots.push({ a: start, b: Math.min(tEnd, tc + 0.5), speed: 0.3, cam: (f, u) => { const sx = lefty ? -1 : 1; return { pos: V(sx * 13 - 2 * u * sx, 4.6, -9 + u * 1.5), look: V(sx * -1.2, 3.6, 0), fov: 30 }; } });
  // where the ball ends up (last recorded spot) and the apex
  let lastB = null, apex = 0; for (const f of F) if (f.ball && F.indexOf(f) > ci) { lastB = f.ball; apex = Math.max(apex, f.ball[1]); }
  const endP = lastB ? V(lastB[0], 0, lastB[2]) : V(0, 0, -300);
  if (kind === 'hr' || kind === 'play') {
    // 2) off the bat: high behind the plate, framing the ball over the field (broadcast angle), slow
    shots.push({ a: tc + 0.05, b: Math.min(tEnd, tc + (kind === 'hr' ? 2.6 : 3.0)), speed: 0.55, cam: (f, u) => {
      const b = ballAt(f), dir = V(endP.x, 0, endP.z).normalize();
      const pos = V(-dir.x * 30 + 8, 26 + u * 10, -dir.z * 30 + 18);
      const look = V(b.x * 0.65 + endP.x * 0.35, b.y * 0.45, b.z * 0.65 + endP.z * 0.35);
      const toB = b.clone().sub(pos).normalize(), toL = look.clone().sub(pos).normalize();
      const off = Math.acos(Math.max(-1, Math.min(1, toB.dot(toL)))) * 57.3;
      return { pos, look, fov: Math.max(24, Math.min(55, off * 2 + 10)) };
    } });
  }
  if (kind === 'hr' && lastB) {
    // 3) from the seats where it lands, looking back toward home as it drops in
    const dir = V(endP.x, 0, endP.z).normalize(), side = V(-dir.z, 0, dir.x);
    // 3) from the outfield grass in front of the wall, looking up as it sails over into the seats
    const back = Math.min(90, Math.hypot(endP.x, endP.z) * 0.3);
    const cpos = V(endP.x - dir.x * back + side.x * 30, 9, endP.z - dir.z * back + side.z * 30);
    shots.push({ a: Math.max(tc + 1.2, tEnd - 2.4), b: tEnd, speed: 0.6, cam: (f) => { const b = ballAt(f); return { pos: cpos, look: V(b.x * 0.75 + endP.x * 0.25, Math.max(14, b.y * 0.75), b.z * 0.75 + endP.z * 0.25), fov: 50 }; } });
  }
  if (kind === 'catch' && info.at) {
    // 2) the catch, close from the infield side
    const at = info.at, dir = V(at.x, 0, at.z).normalize();
    shots.push({ a: Math.max(tc, info.t - 1.6), b: Math.min(tEnd, info.t + 1.0), speed: 0.4, cam: (f) => ({ pos: V(at.x - dir.x * 40 + dir.z * 12, 7, at.z - dir.z * 40 - dir.x * 12), look: V(at.x, 3, at.z), fov: 26 }) });
  }
  let si = 0, t = shots[0].a, done = false;
  const findFrame = (tt) => { let lo = 0, hi = F.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (F[m].t <= tt) lo = m; else hi = m - 1; } return F[lo]; };
  const cam = G.cam;
  return {
    update(dt) {
      if (done) return false;
      const S = shots[si];
      t += dt * S.speed;
      if (t >= S.b) { si++; if (si >= shots.length) { done = true; return false; } t = shots[si].a; }
      const S2 = shots[si], f = findFrame(t);
      applyFrame(G, f);
      const u = Math.max(0, Math.min(1, (t - S2.a) / Math.max(0.01, S2.b - S2.a)));
      const c = S2.cam(f, u);
      cam.position.copy(c.pos); cam.lookAt(c.look); cam.fov = G.portrait() ? Math.min(80, c.fov * 1.5) : c.fov; cam.updateProjectionMatrix();
      if (G.ballM.visible) { const d = cam.position.distanceTo(G.ballM.position), px = d * Math.tan(cam.fov * Math.PI / 360) * 2 / (G.hud.H || 700); G.ballM.scale.setScalar(Math.max(1, px * 5 / 0.4)); }
      return true;
    },
    skip() { done = true; },
  };
}
