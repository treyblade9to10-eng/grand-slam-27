// MLB Grand Slam 27 - live 3D game: stage + engine + players + cameras + broadcast presentation
import * as THREE from '../lib/three.min.js';
import { makeStage } from './scene.js';
import { makeAthlete, animate, uniform, SKINMAP, PITCH_RELEASE, THROW_RELEASE, loadModels } from './model.js';
import { isTouch, goLandscape, leaveLandscape } from '../orient.js';
import { Engine, SWING_TIME } from './engine.js';
import { Recorder, makeReplay } from './replay.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { ZONE } from './phys.js';
import * as S from '../sim/simgame.js';
import * as DB from '../db.js';
import { Settings, saveSettings } from '../store.js';
import { badge, esc, fmt3, teamMark } from '../ui.js';

window.__teamMark = teamMark;
const FIXED = /fixeddt/.test(location.search) ? 1 / 20 : 0;
const FT = 3.2808;
const hashN = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const lerp = (a, b, t) => a + (b - a) * t;
const HAIRS = ['short', 'buzz', 'fade', 'crop', 'short', 'curly', 'long', 'bald', 'buzz', 'fade'];
function lookFor(p) {
  const h = hashN(p.id), skin = SKINMAP[Math.max(0, Math.min(5, p.skin ?? 2))];
  const ht = p.ht || 73, wt = p.wt || 210, bmi = wt / (ht * ht) * 703;
  return { skin, hair: HAIRS[h % HAIRS.length], hairC: skin >= 4 ? (h % 2) : [0, 1, 2, 3, 4, 1, 2][h % 7], beard: (h >> 3) % 3 === 0 ? 1 : 0, build: Math.max(0.9, Math.min(1.2, 0.95 + (bmi - 26) * 0.035)), h: ht / 73, sleeve: (h >> 5) % 4 === 0 ? 1 : 0, gloves: 0 };
}

export function playLive(opts) {
  return new Promise(resolve => { const g = new LiveGame(opts, resolve); g.boot(); });
}

class LiveGame {
  constructor(o, resolve) {
    this.o = o; this.resolve = resolve; this.set = Settings;
    this.root = document.getElementById('game');
    this.mode = 'loading'; this.camMode = 'bat'; this.actors = new Map(); this.paPitches = []; this.excite = 0; this.t = 0;
  }
  async boot() {
    const o = this.o, root = this.root;
    root.innerHTML = ''; root.classList.add('on');
    const ld = document.createElement('div'); ld.className = 'loading'; ld.innerHTML = `LOADING ${esc(DB.park(o.park).name.toUpperCase())}<small>Getting the crowd in their seats</small>`; root.append(ld);
    goLandscape();
    this.touch = isTouch();
    await new Promise(r => setTimeout(r, 30));
    await loadModels();
    const homeT = DB.team(o.home.team), awayT = DB.team(o.away.team);
    this.homeT = homeT; this.awayT = awayT;
    const time = o.time || 'night';
    this.stage = makeStage(root, o.park, DB.park(o.park), homeT, time);
    this.cam = this.stage.camera; this.scene = this.stage.scene; this.park = this.stage.park;
    const alt = { COL: 5200 }[o.park] || 0;
    const wind = { x: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 };
    if (this.park.closed) { wind.x = wind.z = 0; }
    this.wind = wind;
    const EC = o.EngineClass || Engine;
    this.E = new EC({ slugger: o.slugger, away: o.away, home: o.home, park: this.park, parkId: o.park, user: o.user, innings: o.innings || 9, settings: this.set, state: o.state || S.newState(o.away, o.home, { park: o.park, innings: o.innings || 9, ...(o.simOpts || {}) }), altitude: alt, wind });
    this.hud = new HUD(root, this);
    this.rotEl = document.createElement('div'); this.rotEl.className = 'rotate';
    this.rotEl.innerHTML = `<div class="in"><svg viewBox="0 0 120 120" aria-hidden="true"><rect class="ph" x="38" y="16" width="44" height="80" rx="8"/><rect class="sc" x="43" y="25" width="34" height="58" rx="2"/><path class="ar" d="M22 74 A44 44 0 0 0 66 108"/><path class="ah" d="M60 101 L68 109 L58 114"/></svg><div class="t">TURN YOUR PHONE SIDEWAYS</div><div class="s">Grand Slam 27 plays in landscape</div></div>`;
    root.append(this.rotEl); this.rotOn = false;
    this.input = new Input(root);
    // ball
    this.ballM = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#9a9a9a', roughness: 0.4 }));
    this.ballM.castShadow = true; this.scene.add(this.ballM);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
    this.scene.add(this.ballShadow);
    const trailG = new THREE.BufferGeometry(); trailG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3));
    this.trail = new THREE.Line(trailG, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 })); this.trail.frustumCulled = false; this.scene.add(this.trail); this.trailPts = [];
    // umpire
    this.ump = makeAthlete({ id: 'ump', num: '', last: '', look: { skin: 1, hair: 'short', hairC: 1, beard: 0, build: 1.12, h: 1.0, sleeve: 0, gloves: 0 } }, null, { uni: uniform(homeT, 'ump'), head: 'catcher', mask: true });
    this.ump.root.position.set(0, 0, 6.6); this.ump.root.rotation.y = Math.PI; this.scene.add(this.ump.root);
    // shadows under players (cheap blobs for FAST mode)
    this.blobG = new THREE.CircleGeometry(1.4, 16).rotateX(-Math.PI / 2); this.blobM = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: this.stage.level === 'fast' ? 0.3 : 0.12, depthWrite: false });
    // fireworks
    this.fw = [];
    this.rec = new Recorder(this); this.replay = null; this.replayWant = null;
    ld.remove();
    Sound.start();
    this.loop = this.loop.bind(this); this.last = performance.now(); this.acc = 0; this.running = true;
    requestAnimationFrame(this.loop);
    window.__live = this;
    if (o.skipIntro || o.state) this.beginGame(); else this.pregame();
  }
  // ---------- actors ----------
  actor(pid, role, side) {
    const key = pid + '|' + role + '|' + side;
    let a = this.actors.get(key);
    if (!a) {
      const p = DB.player(pid) || { id: pid, num: 0, ln: '' }, t = DB.team(this.E.st.sides[side].team);
      const uni = uniform(t, side === 1 ? 'home' : 'away');
      const lefty = role === 'batL' ? true : role === 'bat' ? false : p.th === 'L';
      const opt = role === 'bat' || role === 'batL' ? { uni, head: 'helmet', bat: true, lefty } : role === 'catcher' ? { uni, head: 'catcher', glove: true, chestPad: t.c1, lefty } : { uni, head: 'cap', glove: true, lefty };
      a = makeAthlete({ id: pid, num: p.num ?? '', last: p.ln || '', look: lookFor(p) }, t, opt);
      a.key = key; a.pid = pid;
      const blob = new THREE.Mesh(this.blobG, this.blobM); blob.position.y = 0.06; a.root.add(blob); blob.scale.setScalar(1 / (a.root.scale.x || 1));
      this.scene.add(a.root); this.actors.set(key, a);
    }
    a.used = true; a.root.visible = true; return a;
  }
  setBatHand(a, hand) { const L = hand === 'L'; a.flip.scale.x = L ? -1 : 1; }
  syncActors(dt) {
    const E = this.E;
    for (const a of this.actors.values()) a.used = false;
    const fs = E.fieldingSide, bs = E.battingSide;
    // fielders
    for (const f of Object.values(E.F)) {
      const a = this.actor(f.pid, f.n === 2 ? 'catcher' : 'field', fs);
      const onMound = Math.hypot(f.p.x, f.p.z + 60.5) < 9;
      a.root.position.set(f.p.x, onMound ? 0.85 * Math.max(0, 1 - Math.hypot(f.p.x, f.p.z + 60.5) / 9) + 0.0 : 0, f.p.z);
      let pose = { mode: 'ready', speed: 0 };
      const ph = E.phase;
      if (f.n === 1 && (ph === 'aim' || ph === 'intro' || ph === 'pa_start')) { pose = { mode: 'set' }; a.root.rotation.y = 0; }
      else if (f.n === 1 && ph === 'windup') { pose = { mode: 'pitch', t: f.anim, snap: true }; a.root.rotation.y = 0; }
      else if (f.n === 1 && (ph === 'pitch' || ph === 'post_pitch') && E.pt < 0.5) { pose = { mode: 'pitch', t: Math.min(1, PITCH_RELEASE + E.pt * 0.9), snap: true }; a.root.rotation.y = 0; }
      else if (f.n === 2 && ph !== 'live' && ph !== 'dead') { pose = { mode: 'squat' }; a.root.rotation.y = Math.PI; a.root.position.set(0, 0, 3.4); }
      else if (f.mode === 'throw') { pose = { mode: 'throwOH', t: f.anim, snap: true }; a.root.rotation.y = f.face; }
      else if (f.mode === 'dive') { pose = { mode: 'layout' }; a.root.rotation.y = f.face; }
      else {
        a.root.rotation.y = f.face;
        if (f.moving) pose = { mode: 'run', speed: (f.vel || 20) / FT };
        else if (ph === 'live' && E.ball.state === 'air' && (f === E.chaser) && E.ball.p.y > 3 && Math.hypot(f.p.x - E.ball.p.x, f.p.z - E.ball.p.z) < 12) pose = { mode: 'catch', reachY: Math.min(2.4, E.ball.p.y / FT) };
        else if (ph === 'windup' || ph === 'pitch') pose = { mode: 'ready' };
        else pose = { mode: f.hasBall ? 'hold' : 'stand', speed: 0 };
      }
      animate(a, pose, dt);
    }
    // batter
    if (E.bat && (E.phase !== 'live' || !E.runners.some(r => r.isBatter)) && !['dead', 'pa_start', 'switch'].includes(E.phase) || (E.phase === 'dead' && E.bat && !E.runners.some(r => r.isBatter) && E.pendingRes && ['K'].includes(E.pendingRes.res))) {
      const a = this.actor(E.bat.pid, E.bat.hand === 'L' ? 'batL' : 'bat', bs);
      const L = E.bat.hand === 'L';
      a.root.position.set(L ? 2.9 : -2.9, 0, 0.1); a.root.rotation.y = L ? -Math.PI / 2 : Math.PI / 2;
      let pose = { mode: 'stance', load: E.phase === 'windup' ? Math.min(1, E.pt / (E.windupDur || 1)) : 0 };
      const sw = E.bat.swing;
      if (sw && sw.started != null) {
        const t = Math.min(1, (E.pt - sw.started) / SWING_TIME + (E.phase !== 'pitch' ? 1 : 0));
        const c = E.curPitch.path.at(1), aim = sw.pci || E.pci;
        pose = { mode: sw.kind === 'bunt' ? 'bunt' : 'swing', t, snap: true, dy: (aim.y - 2.5) / FT, dz: 0 };
        if (sw.kind === 'bunt') pose.t = Math.min(1, (E.pt - sw.started) / 0.3);
      } else if (sw && sw.kind === 'bunt') pose = { mode: 'bunt', t: Math.min(1, E.pt / 0.4), snap: true };
      animate(a, pose, dt);
    }
    // runners
    for (const r of E.runners) {
      const a = this.actor(r.pid, 'bat', bs); a.flip.scale.x = 1;
      a.root.position.set(r.p.x, 0, r.p.z);
      if (r.face != null && (r.vel || 0) > 0.5) a.root.rotation.y = r.face;
      let pose;
      if (r.mode === 'lead' && (r.vel || 0) < 1) { pose = { mode: E.phase === 'windup' || E.phase === 'pitch' ? 'lead' : 'stand' }; a.root.rotation.y = Math.atan2(-r.p.x, -60.5 - r.p.z) * 0 + (r.base === 1 ? -Math.PI / 4 * 3 + Math.PI : r.base === 2 ? Math.PI : -Math.PI / 4); }
      else if (r.at == null && (r.vel || 0) > 8 && r.mode === 'run' && this.nearBase(r) < 7 && (E.ball.state === 'thrown')) pose = { mode: 'slide' };
      else pose = { mode: (r.vel || 0) > 0.5 ? 'run' : 'stand', speed: (r.vel || 0) / FT };
      animate(a, pose, dt);
    }
    // umpire
    const slot = E.bat && E.bat.hand === 'L' ? 1.1 : -1.1;
    this.ump.root.position.x += (slot - this.ump.root.position.x) * Math.min(1, dt * 4);
    animate(this.ump, { mode: ['aim', 'windup', 'pitch', 'intro'].includes(E.phase) || (E.phase === 'post_pitch' && this.phoneL()) ? 'ump' : 'stand' }, dt);
    for (const a of this.actors.values()) if (!a.used) a.root.visible = false;
  }
  nearBase(r) { const B = [[63.64, -63.64], [0, -127.28], [-63.64, -63.64], [0, 0]]; let m = 1e9; for (const [x, z] of B) m = Math.min(m, Math.hypot(r.p.x - x, r.p.z - z)); return m; }
  // ---------- ball ----------
  syncBall() {
    const E = this.E; let p = null;
    if (E.phase === 'windup') {
      const a = this.actors.get(E.pitcher() + '|field|' + E.fieldingSide);
      if (a) { const v = new THREE.Vector3(); a.handR.getWorldPosition(v); p = v; }
    } else if (E.phase === 'pitch') {
      const P = E.curPitch, u = E.pt / P.path.time, q = P.path.at(Math.min(u, 1.12));
      p = new THREE.Vector3(q.x, q.y, Math.min(q.z, 2.6));
    } else if (E.ball && E.ball.p) {
      if (E.ball.state === 'held' && E.ball.holder) {
        const f = E.ball.holder, a = this.actors.get(f.pid + '|' + (f.n === 2 ? 'catcher' : 'field') + '|' + E.fieldingSide);
        if (a) { const v = new THREE.Vector3(); (a.glove || a.handL).getWorldPosition(v); p = v; }
      }
      if (!p) p = this.hrBall ? new THREE.Vector3(this.hrBall.p.x, this.hrBall.p.y, this.hrBall.p.z) : new THREE.Vector3(E.ball.p.x, E.ball.p.y, E.ball.p.z);
    }
    if (!p) { this.ballM.visible = false; this.ballShadow.visible = false; this.trail.visible = false; return; }
    this.ballM.visible = true; this.ballM.position.copy(p);
    { const d = this.cam.position.distanceTo(p), px = d * Math.tan(this.cam.fov * Math.PI / 360) * 2 / (this.hud.H || 700); this.ballM.scale.setScalar(Math.max(1, px * 5 / 0.4)); }
    this.ballShadow.visible = p.y > 0.3; this.ballShadow.position.set(p.x, 0.07, p.z);
    // trail while the ball is flying
    const flying = E.phase === 'pitch' || (this.hrBall && !this.hrBall.done) || (E.ball && (E.ball.state === 'air' || E.ball.state === 'thrown'));
    if (flying) { if (this.trailPts.length && this.trailPts[0].distanceTo(p) > 25) this.trailPts.length = 0; this.trailPts.unshift(p.clone()); if (this.trailPts.length > (this.camMode === 'play' ? 26 : 10)) this.trailPts.pop(); } else this.trailPts.length = 0;
    const arr = this.trail.geometry.attributes.position;
    for (let i = 0; i < 30; i++) { const q = this.trailPts[Math.min(i, this.trailPts.length - 1)] || p; arr.setXYZ(i, q.x, q.y, q.z); }
    arr.needsUpdate = true; this.trail.geometry.setDrawRange(0, Math.min(30, this.trailPts.length)); this.trail.visible = this.trailPts.length > 1;
  }
  // ---------- cameras ----------
  portrait() { return this.cam.aspect < 0.95; }
  // phone held sideways: wide and short screen with thumb buttons along the bottom corners
  phoneL() { return !!this.touch && this.cam.aspect >= 1.3 && (this.hud ? this.hud.H : innerHeight) < 560; }
  setCam(pos, look, fov, k = 1) {
    const c = this.cam;
    if (!this.camLook) this.camLook = new THREE.Vector3().copy(look);
    if (k >= 1) { c.position.copy(pos); this.camLook.copy(look); c.fov = fov; }
    else { c.position.lerp(pos, k); this.camLook.lerp(look, k); c.fov += (fov - c.fov) * k; }
    c.lookAt(this.camLook); c.updateProjectionMatrix();
  }
  camRig(name) {
    const P = this.portrait(), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const low = this.set.camera === 'low';
    switch (name) {
      case 'bat': if (this.phoneL()) return low ? [V(0, 9.5, 16), V(0, 0.8, -12), 40] : [V(0, 11, 19), V(0, 0.5, -12), 38];
        return P ? [V(0, low ? 13 : 16.5, low ? 26 : 33), V(0, 2.4, -40), 46] : low ? [V(0, 9.5, 16), V(0, 1.0, -12), 36] : [V(0, 11, 19.5), V(0, 0.8, -12), 34];
      case 'pitch': if (this.phoneL()) return [V(2.5, 8.5, -74), V(0, 2.4, 0), 13];
        return P ? [V(3.2, 11, -92), V(0, 2.4, 0), 32] : [V(3.4, 10.2, -82), V(0, 2.4, 0), 21];
      case 'intro': { const L = this.E.bat && this.E.bat.hand === 'L'; return [V(L ? -4 : 4, 5.6, -7.5), V(L ? 2.9 : -2.9, 4.6, 0), P ? 50 : 34]; }
      default: return null;
    }
  }
  updateCamera(dt) {
    const E = this.E, ph = E.phase;
    if (this.mode !== 'game') return;
    const k = 1 - Math.exp(-dt * 4);
    let want;
    if (ph === 'intro') want = this.E.pt < 0.8 && !this.o.fastIntro ? 'intro' : (E.userPitches && !E.userBats ? 'pitch' : 'bat');
    else if (['aim', 'windup', 'pitch', 'post_pitch'].includes(ph) && !(ph === 'post_pitch' && E.play && E.play.kind === 'steal')) want = E.userPitches && !E.userBats ? 'pitch' : 'bat';
    else if (ph === 'live' || ph === 'dead') want = 'play';
    else want = this.camMode;
    if (want !== this.camMode) { this.camMode = want; this.camCut = true; }
    if (want === 'play') { this.chaseCam(dt); this.camCut = false; return; }
    this.chase = null;
    const r = this.camRig(want); if (!r) return;
    this.setCam(r[0], r[1], r[2], this.camCut ? 1 : k);
    this.camCut = false;
  }
  // ---------- ball cam: follow the ball after contact (broadcast style) ----------
  chaseCam(dt) {
    const E = this.E, P = this.portrait(), V = THREE.Vector3;
    const cam = this.cam;
    if (!this.chase || this.camCut) this.chase = { t: 0, pos: cam.position.clone(), look: (this.camLook || new V(0, 3, -40)).clone(), fov: cam.fov, mode: '' };
    const C = this.chase; C.t += dt;
    const vis = this.ballM.visible ? this.ballM.position : null;
    const bp = vis ? vis.clone() : new V(E.ball?.p?.x || 0, E.ball?.p?.y || 3, E.ball?.p?.z || -60);
    const follow = this.set.camFollow !== false;
    const st = E.ball ? E.ball.state : 'none';
    const hz = Math.hypot(bp.x, bp.z);
    const pred = E.pred && E.pred.landed ? E.pred.landed : null;
    const deep = this.hrBall || (st === 'air' && !(E.ball.phys && E.ball.phys.landed) && ((pred && Math.hypot(pred.x, pred.z) > 170) || bp.y > 45));
    let pos, look, fov, kp = 3, kl = 7;
    if (E.trot && E.pt > (this.hrBall ? 99 : 2.8)) {
      // home run trot: low tracking shot on the batter
      const br = E.runners.find(r => r.isBatter) || E.runners[0];
      const rp = br ? new V(br.p.x, 3.2, br.p.z) : new V(0, 3, 0);
      const out = new V(rp.x, 0, rp.z).normalize(); if (!isFinite(out.x)) out.set(0, 0, 1);
      pos = new V(rp.x * 0.55, 14, rp.z * 0.55 + 46); look = rp; fov = P ? 44 : 30; kp = 2; kl = 5;
      C.mode = 'trot';
    } else if (!follow) {
      const tx = bp.x, tz = bp.z, ty = Math.min(bp.y, 60) * 0.5, d = hz;
      pos = new V(tx * 0.3, 42 + d * 0.16 + (P ? 30 : 0), 78 + (P ? 40 : 0) - Math.min(0, tz) * 0.12);
      look = new V(tx * 0.85, ty, tz * 0.85 - 10); fov = P ? 58 : 42;
    } else if (deep) {
      // fly ball: camera rises up behind the plate and rides out with the ball, zooming as it carries
      const dir = new V(bp.x, 0, bp.z); if (dir.lengthSq() < 1) dir.set(0, 0, -1); dir.normalize();
      const behind = bp.z > -25; // pop-ups behind the plate: look back at it from the infield
      const along = behind ? 0 : Math.min(hz * 0.42, 150);
      pos = behind ? new V(bp.x * 0.3, 34 + Math.min(bp.y, 120) * 0.3, -70) : new V(dir.x * (along - 34), 30 + Math.min(bp.y, 140) * 0.42 + hz * 0.08, dir.z * (along - 34) + 22);
      // aim between the ball and where it comes down, so the field stays in the shot
      const land = this.hrBall ? new V(bp.x, 0, bp.z) : pred ? new V(pred.x, 0, pred.z) : new V(bp.x, 0, bp.z);
      look = new V(bp.x * 0.6 + land.x * 0.4, bp.y * 0.4, bp.z * 0.6 + land.z * 0.4);
      const dist = pos.distanceTo(look);
      const toB = bp.clone().sub(pos).normalize(), toL = look.clone().sub(pos).normalize();
      const off = Math.acos(Math.max(-1, Math.min(1, toB.dot(toL)))) * 57.3; // degrees ball sits off-center
      const need = (off * 2 + 8) / (P ? 0.55 : 1);
      fov = Math.max(P ? 34 : 20, Math.min(P ? 70 : 52, Math.max(need, 2 * Math.atan(((P ? 60 : 44)) / dist) * 57.3)));
      kp = 2.6; kl = 14; C.mode = 'fly';
    } else {
      // grounders, line drives, throws: high home cam that pans with the ball and frames the play
      const ty = Math.min(bp.y, 40) * 0.35;
      const tgt = new V(bp.x, ty, bp.z);
      if (st === 'thrown' && E.ball.throw) { const T = E.ball.throw; tgt.set((bp.x * 2 + T.b.x) / 3, ty, (bp.z * 2 + T.b.z) / 3); }
      const d = Math.hypot(tgt.x, tgt.z);
      // keep the camera over fair territory behind the plate even when the ball goes foul / into the seats
      let ph2 = Math.atan2(tgt.x, -tgt.z); if (!isFinite(ph2)) ph2 = 0; ph2 = Math.max(-0.6, Math.min(0.6, ph2));
      const dc = Math.min(d, 260);
      const cx = Math.sin(ph2) * dc, cz = -Math.cos(ph2) * dc;
      pos = new V(cx * 0.42, 46 + d * 0.2 + (P ? 26 : 0), cz * 0.42 + 72 + (P ? 34 : 0));
      look = tgt;
      const dist = pos.distanceTo(tgt);
      fov = Math.max(P ? 40 : 26, Math.min(P ? 66 : 50, 2 * Math.atan(((P ? 95 : 70) + d * 0.12) / dist) * 57.3));
      kp = 2.2; kl = 6; C.mode = 'ground';
    }
    // first instant after contact: stay put and whip the look onto the ball (no teleport)
    if (C.t < 0.35 && C.mode !== 'trot') { pos = C.pos.clone().lerp(pos, C.t / 0.35 * 0.4); kl = 16; }
    const ap = 1 - Math.exp(-dt * kp), al = 1 - Math.exp(-dt * kl);
    C.pos.lerp(pos, ap); C.look.lerp(look, al); C.fov += (fov - C.fov) * (1 - Math.exp(-dt * 2.5));
    cam.position.copy(C.pos); cam.lookAt(C.look); cam.fov = C.fov; cam.updateProjectionMatrix();
    if (this.camLook) this.camLook.copy(C.look);
  }
  startReplay() {
    const w = this.replayWant; this.replayWant = null; this.rec.stop();
    if (this.E.derby && !window.__replayDerby) return;
    const r = makeReplay(this, this.rec, w.kind, w); if (!r) return;
    this.replay = r; this.hrBall = null;
    this.hud.replayTag(true);
  }
  endReplay() {
    this.replay = null; this.hud.replayTag(false); this.camCut = true;
    if (this.E.phase === 'dead') this.E.pt = Math.max(this.E.pt, this.E.deadWait);
  }
  // cosmetic flight of a home run ball after it clears the wall (the engine stops tracking it there)
  startHrBall() {
    const b = this.E.ball && this.E.ball.phys; if (!b) return;
    this.hrBall = { p: { ...b.p }, v: { ...b.v }, t: 0 };
  }
  stepHrBall(dt) {
    const H = this.hrBall; if (!H) return;
    if (this.paused) return;
    H.t += dt;
    if (!H.done) {
      if (this.E.deadWait) this.E.pt = Math.min(this.E.pt, this.E.deadWait - 1.6);
      const sp = Math.hypot(H.v.x, H.v.y, H.v.z), kD = 0.0019 * sp;
      H.v.x -= H.v.x * kD * dt; H.v.z -= H.v.z * kD * dt; H.v.y -= (32.17 + H.v.y * kD) * dt;
      H.p.x += H.v.x * dt; H.p.y += H.v.y * dt; H.p.z += H.v.z * dt;
      const phi = Math.atan2(H.p.x, -H.p.z), d = Math.hypot(H.p.x, H.p.z), wr = this.park.wallR(phi), wh = this.park.wallH(phi);
      const seat = wh + Math.max(0, d - wr - 6) * 0.42 + 4;
      if (H.p.y <= seat || H.t > 4) { H.done = true; H.p.y = Math.max(H.p.y, seat); H.land = H.t; }
    }
    if ((H.done && H.t - H.land > 1.4) || this.E.phase !== 'dead') this.hrBall = null;
  }
  // ---------- main loop ----------
  loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    let dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; if (FIXED) dt = FIXED; this.t += dt;
    // phones: the game only runs held sideways - hold everything while the phone is upright
    const needRot = this.touch && innerHeight > innerWidth * 1.05;
    if (needRot !== this.rotOn) { this.rotOn = needRot; this.rotEl.classList.toggle('on', needRot); this.root.classList.toggle('rotwait', needRot); if (needRot) Sound.excite(0); }
    if (needRot) { this.input.poll(); this.stage.renderer.render(this.scene, this.cam); return; }
    const inp = this.input.poll();
    this.device = inp.device;
    if (inp.press.pause && this.mode === 'game') this.pause();
    if (this.cardSkip && (inp.press.skip || inp.press.tap || inp.press.swing)) { const f = this.cardSkip; this.cardSkip = null; f(); }
    if (this.replay) {
      if (inp.press.skip || inp.press.tap || inp.press.swing || inp.press.power) this.replay.skip();
      if (!this.paused && !this.replay.update(dt)) this.endReplay();
    } else if (this.mode === 'game' && !this.paused) {
      const E = this.E;
      if (this.replayWant && E.phase === 'dead' && E.deadWait && E.pt >= E.deadWait - 0.3 && this.set.replays !== false) this.startReplay();
    }
    if (!this.replay && this.mode === 'game' && !this.paused) {
      const E = this.E;
      // feed input
      E.in.stick = inp.stick; E.in.press = { ...E.in.press, ...inp.press };
      if (inp.rel && (inp.rel.x || inp.rel.y) && this.hud.W) { // touch drag -> relative aim (about 120px per foot)
        const k = 1 / Math.max(60, this.hud.W * 0.16);
        const t = E.userPitches && !E.userBats ? E.aim : E.pci;
        t.x += inp.rel.x * k * (E.userPitches && !E.userBats ? 1 : 1); t.y -= inp.rel.y * k;
      }
      if (inp.mouse && this.hud.W) { const z = this.hud.unproj(inp.mouse.x, inp.mouse.y); if (z && Math.abs(z.x) < 3 && z.y > 0 && z.y < 5.5) { E.in.abs = z; E.in.absFor = E.userBats ? 'pci' : 'aim'; } }
      else if (!E.userBats && !E.userPitches) E.in.abs = null;
      this.acc += dt;
      while (this.acc >= 1 / 60) { E.update(1 / 60); this.acc -= 1 / 60; this.handleEvents(); if (this.mode !== 'game') break; }
      if (Math.abs(inp.stick.x) + Math.abs(inp.stick.y) > 0 || (inp.rel && (inp.rel.x || inp.rel.y))) E.in.abs = null;
    }
    if (!this.replay) {
      if (this.mode === 'game' || this.mode === 'pregame' || this.mode === 'switch' || this.mode === 'final') this.syncActors(dt);
      if (this.hrBall) this.stepHrBall(dt);
      this.syncBall();
      this.updateCamera(dt);
      if (this.rec.on) { if (this.mode === 'game' && ['live', 'dead'].includes(this.E.phase)) this.rec.capture(dt); else this.rec.stop(); }
    }
    if (this.presCam) this.presCam(dt);
    this.excite = Math.max(0, this.excite - dt * 0.25);
    this.park.update(dt, this.t, this.excite);
    this.park.crowd.update(dt, this.t, this.excite, this.cam);
    Sound.excite(this.excite);
    this.updateFireworks(dt);
    this.hud.update(dt, this.device);
    this.stage.renderer.render(this.scene, this.cam);
  }
  // ---------- engine events -> presentation ----------
  handleEvents() {
    const E = this.E, H = this.hud;
    const evs = E.ev.splice(0);
    for (const ev of evs) {
      switch (ev.type) {
        case 'batter': {
          this.paPitches = [];
          H.lower(ev.pid, 'bat');
          const p = DB.player(ev.pid), b = E.st.box.bat[ev.pid] || { h: 0, ab: 0 };
          this.park.drawBoard({ batter: DB.full(p), num: p.num ?? '', line: p.ln26 ? `${fmt3(p.ln26[2])} AVG   ${p.ln26[3]} HR   ${p.ln26[4]} RBI` : '', score: `${E.st.box.away} ${E.st.score[0]}   ${E.st.box.home} ${E.st.score[1]}   ${E.st.top ? 'TOP' : 'BOT'} ${E.st.inn}` });
          if (E.st.outs === 0 && E.st.idx[E.battingSide] % 9 === 0 && E.st.inn > 1 && !E.st.bases.some(Boolean)) H.lower(E.pitcher(), 'pitch');
          break;
        }
        case 'release': Sound.whoosh(); break;
        case 'swing': break;
        case 'pitch_result': {
          H.pitchInfo(ev.ptype, ev.mph);
          this.paPitches.push({ x: ev.x, y: ev.y, strike: ev.call !== 'ball', n: this.paPitches.length + 1 });
          Sound.mitt();
          if (ev.call === 'called' && ev.strikes < 3) H.ticker('STRIKE, CALLED');
          else if (ev.call === 'swinging' && ev.strikes < 3) H.ticker('SWING AND A MISS');
          else if (ev.call === 'ball' && ev.balls < 4) H.ticker('BALL ' + ev.balls);
          break;
        }
        case 'foul': Sound.crack(0.4); H.ticker('FOUL BALL'); this.excite = Math.max(this.excite, 0.15); break;
        case 'contact': { this.rec.start(); this.replayWant = null; const q = Math.min(1, ev.ev / 105); Sound.crack(q); this.excite = Math.max(this.excite, ev.ev > 95 && ev.la > 15 ? 0.6 : 0.3); break; }
        case 'catch': Sound.glove(); if (ev.dive && ev.fly && !this.replayWant) this.replayWant = { kind: 'catch', at: { x: E.ball.p.x, z: E.ball.p.z }, t: this.rec.t, lefty: E.bat && E.bat.hand === 'L' }; if (ev.dive) H.banner(ev.fly ? 'WHAT A CATCH' : 'GREAT STOP', '', 'gold', 1400); break;
        case 'dive_miss': this.excite = Math.max(this.excite, 0.5); break;
        case 'wall': Sound.thud(); this.excite = Math.max(this.excite, 0.7); break;
        case 'error': H.banner('ERROR', '', 'red', 1300); break;
        case 'out': {
          if (ev.how === 'fly' || ev.how === 'force' || ev.how === 'tag' || ev.how === 'doubled') H.ticker(ev.how === 'fly' ? 'OUT ON THE FLY' : ev.how === 'force' ? 'FORCE OUT' : ev.how === 'doubled' ? 'DOUBLED OFF' : 'TAGGED OUT');
          break;
        }
        case 'run_scores': this.excite = Math.max(this.excite, 0.75); break;
        case 'home_run': {
          this.excite = 1; Sound.horn(); this.startHrBall(); this.replayWant = { kind: 'hr', lefty: E.bat && E.bat.hand === 'L' };
          const slam = ev.runners === 3;
          H.banner(slam ? 'GRAND SLAM' : 'HOME RUN', `${ev.dist} FT   |   ${ev.ev.toFixed(1)} MPH   |   ${Math.round(ev.la)} DEG`, 'gold', 4200);
          this.park.drawBoard({ big: slam ? 'GRAND SLAM' : 'HOME RUN', sub: DB.full(DB.player(E.bat.pid)).toUpperCase() });
          if (E.battingSide === 1) this.fireworks();
          break;
        }
        case 'gr_double': H.banner('GROUND RULE DOUBLE', '', '', 1600); break;
        case 'pa_result': {
          if (ev.res === 'K') { H.banner('STRIKEOUT', E.lastPitch && !E.lastPitch.swung ? 'CAUGHT LOOKING' : 'SWINGING', '', 1500); this.excite = Math.max(this.excite, E.userPitches ? 0.55 : 0.2); }
          if (ev.res === 'BB') { H.banner('WALK', '', '', 1200); }
          if (ev.res === 'HBP') { H.banner('HIT BY PITCH', '', '', 1200); }
          break;
        }
        case 'play_over': {
          const names = { '1B': 'SINGLE', '2B': 'DOUBLE', '3B': 'TRIPLE', HR: 'INSIDE-THE-PARK HOME RUN', DP: 'DOUBLE PLAY', E: 'SAFE ON AN ERROR', FC: "FIELDER'S CHOICE", SF: 'SACRIFICE FLY' };
          if (names[ev.res]) H.banner(names[ev.res], '', ev.res === 'DP' ? 'red' : ['2B', '3B', 'HR'].includes(ev.res) ? 'gold' : '', 1400);
          if (['2B', '3B', 'HR'].includes(ev.res)) this.excite = Math.max(this.excite, 0.8);
          break;
        }
        case 'recorded': {
          const log = E.st.box.log; if (ev.runs > 0 && log.length) H.ticker(log[log.length - 1], 3500);
          if (ev.runs > 0) { if (ev.runs >= 2 || Math.random() < 0.4) Sound.organ('rally'); }
          if (ev.done) { this.finalCard(); return; }
          break;
        }
        case 'half': this.halfCard(); return;
        case 'final': this.finalCard(); return;
        case 'pitching_change': { const p = DB.player(ev.pid); H.ticker('PITCHING CHANGE: ' + DB.full(p).toUpperCase() + ' COMING IN', 3500); Sound.organ('change'); break; }
        case 'tired': H.ticker('YOUR PITCHER IS GETTING TIRED. CHANGE HIM FROM THE PAUSE MENU.', 4500); break;
        case 'steal_result': H.banner(ev.ok ? 'STOLEN BASE' : 'CAUGHT STEALING', '', ev.ok ? 'gold' : 'red', 1400); break;
        case 'msg': H.ticker(ev.text); break;
        case 'derby_out': H.banner('OUT ' + ev.outs, ev.why === 'MISS' ? 'SWING AND A MISS' : ev.why === 'FOUL' ? 'FOUL BALL' : 'IN THE PARK', 'red', 1100); break;
        case 'derby_over': this.derbyFinal(); return;
        case 'tag_go': H.ticker('TAGGING UP'); break;
      }
    }
  }
  // ---------- presentation ----------
  orbit(center, radius, height, speed, look = null) {
    let a = Math.random() * Math.PI * 2;
    this.presCam = dt => { a += dt * speed; const p = new THREE.Vector3(center.x + Math.sin(a) * radius, height, center.z + Math.cos(a) * radius); this.cam.position.copy(p); this.cam.lookAt(look || center); this.cam.fov = this.portrait() ? 60 : 45; this.cam.updateProjectionMatrix(); };
  }
  dolly(from, to, lookFrom, lookTo, dur, fov = 40) {
    let t = 0;
    this.presCam = dt => { t = Math.min(1, t + dt / dur); const u = t * t * (3 - 2 * t); this.cam.position.lerpVectors(from, to, u); const l = new THREE.Vector3().lerpVectors(lookFrom, lookTo, u); this.cam.lookAt(l); this.cam.fov = this.portrait() ? fov + 16 : fov; this.cam.updateProjectionMatrix(); };
  }
  sideRecord(side) { return this.o.records ? this.o.records[side] : ''; }
  async pregame() {
    this.mode = 'pregame';
    const E = this.E, A = this.awayT, Hm = this.homeT, pk = DB.park(this.o.park), H = this.hud;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    let skipped = false; const skip = () => { skipped = true; };
    const wait = ms => new Promise(r => { let t0 = performance.now(), last = t0; const f = () => { const n = performance.now(); if (this.rotOn) t0 += n - last; last = n; if (skipped || n - t0 > ms) r(); else requestAnimationFrame(f); }; f(); });
    this.cardSkip = skip;
    const temp = this.park.closed ? 72 : this.o.time === 'day' ? 74 + (Math.random() * 14 | 0) : 64 + (Math.random() * 12 | 0);
    const wmph = Math.round(Math.hypot(this.wind.x, this.wind.z) / 1.467);
    const wdir = Math.abs(this.wind.z) > Math.abs(this.wind.x) ? (this.wind.z < 0 ? 'OUT TO CENTER' : 'IN FROM CENTER') : (this.wind.x > 0 ? 'LEFT TO RIGHT' : 'RIGHT TO LEFT');
    const weather = this.park.closed ? 'ROOF CLOSED' : `${temp} DEGREES, WIND ${wmph ? wmph + ' MPH ' + wdir : 'CALM'}`;
    const firstPitch = this.o.time === 'day' ? '1:10 PM' : this.o.time === 'dusk' ? '6:40 PM' : '7:05 PM';
    // 1) flyover + matchup
    this.orbit(V(0, 0, -170), 560, 230, 0.07, V(0, 0, -150));
    this.park.drawBoard({ title: `${A.name.toUpperCase()} AT ${Hm.name.toUpperCase()}`, sub: pk.name.toUpperCase() });
    const tc = (t, side) => `<div class="t"><canvas data-b="${t.id}"></canvas><div class="nm">${esc(t.city)}<br>${esc(t.name)}</div><div class="rec">${esc(this.sideRecord(side) || 'TEAM OVR ' + DB.teamOvr(t.id))}</div></div>`;
    H.card(`<div class="pg-title"><span class="k">MLB GRAND SLAM 27</span><div class="p">${esc(pk.name)}</div><div class="s">${esc(pk.city.toUpperCase())}  &middot;  FIRST PITCH ${firstPitch}  &middot;  ${weather}</div></div>
      <div class="mu">${tc(A, 0)}<div class="at">AT</div>${tc(Hm, 1)}</div>`, { onSkip: skip });
    for (const c of H.cardEl.querySelectorAll('canvas[data-b]')) { const b = badge(DB.team(c.dataset.b), 110); c.replaceWith(b); }
    this.excite = 0.3;
    await wait(4200);
    // 2) lineups
    if (!skipped) {
      this.dolly(V(-70, 45, 10), V(70, 45, 10), V(0, 0, -100), V(0, 0, -100), 6, 44);
      const lu = (side, t) => { const s = E.st.sides[side]; return `<div class="lu"><div class="hd" style="background:${t.c1}">${badge(t, 30).outerHTML}${esc(t.name)}</div><table>${s.lineup.map((x, i) => { const p = DB.player(x.pid) || {}; const ln = p.ln26 || []; return `<tr><td class="o">${i + 1}</td><td class="p">${x.pos}</td><td>${esc(DB.full(p))}</td><td class="n">${ln[2] != null ? fmt3(ln[2]) : ''}</td><td class="n">${ln[3] ?? ''} HR</td></tr>`; }).join('')}<tr class="sp"><td class="o">SP</td><td class="p">${(DB.player(s.sp)?.th || 'R') + 'HP'}</td><td>${esc(DB.full(DB.player(s.sp)))}</td><td class="n">${DB.player(s.sp) && DB.pLine(DB.player(s.sp))[4] != null ? (+DB.pLine(DB.player(s.sp))[4]).toFixed(2) : ''}</td><td class="n">ERA</td></tr></table></div>`; };
      H.card(`<div class="pg-title"><div class="p">STARTING LINEUPS</div></div><div class="lus">${lu(0, A)}${lu(1, Hm)}</div>`, { onSkip: skip });
      for (const c of H.cardEl.querySelectorAll('canvas.badge[data-b]')) c.replaceWith(badge(DB.team(c.dataset.b), 30));
      await wait(6500);
    }
    // 3) pitching matchup with a close look at the mound
    if (!skipped) {
      this.dolly(V(14, 6, -44), V(9, 6.5, -47), V(0, 5, -60.5), V(0, 5.2, -60.5), 4.5, 30);
      const pc = pid => { const p = DB.player(pid) || {}, ln = DB.pLine(p); const ar = (p.pit || []).slice(0, 4).map(x => x[0] + ' ' + Math.round(x[1])).join('  '); return `<div class="t"><div class="nm" style="font-size:clamp(22px,3.6vw,38px)">${esc(DB.full(p))}</div><div class="rec">${ln[2] ?? 0}-${ln[3] ?? 0}, ${ln[4] != null ? (+ln[4]).toFixed(2) : '-.--'} ERA, ${ln[6] ?? 0} K</div><div class="rec" style="color:#f2c14e">${esc(ar)}</div></div>`; };
      H.card(`<div class="pg-title"><div class="p">PITCHING MATCHUP</div></div><div class="mu">${pc(E.st.sides[0].sp)}<div class="at">VS</div>${pc(E.st.sides[1].sp)}</div>`, { onSkip: skip });
      await wait(4500);
    }
    H.closeCard(); this.cardSkip = null;
    this.beginGame();
  }
  beginGame() {
    this.presCam = null; this.mode = 'game';
    this.hud.banner('PLAY BALL', `${this.awayT.name.toUpperCase()} AT ${this.homeT.name.toUpperCase()}`, 'gold', 1800);
    this.excite = 0.7; Sound.unlock();
    this.camCut = true;
  }
  halfCard() {
    const E = this.E, st = E.st, H = this.hud;
    this.mode = 'switch';
    const txt = st.top ? `MIDDLE OF THE ${ordinal(st.inn - 1 || 1)}` : `END OF THE ${ordinal(st.inn)}`;
    const head = st.top ? `TOP OF THE ${ordinal(st.inn)}` : `BOTTOM OF THE ${ordinal(st.inn)}`;
    this.orbit(new THREE.Vector3(0, 0, -150), 420, 150, 0.09, new THREE.Vector3(0, 0, -120));
    H.card(`<div class="pg-title"><div class="p">${txt}</div><div class="s">${head} IS NEXT</div></div>${H.lineScore()}`, { onSkip: () => go() });
    if (Math.random() < 0.5) Sound.organ('walk');
    let done = false;
    const go = () => { if (done) return; done = true; this.cardSkip = null; H.closeCard(); this.presCam = null; E.startNextHalf(); this.mode = 'game'; this.camCut = true; };
    this.cardSkip = go;
    setTimeout(go, 3600);
  }
  finalCard() {
    if (this.mode === 'final') return;
    const E = this.E, st = E.st, H = this.hud, b = st.box;
    this.mode = 'final';
    const win = st.score[1] > st.score[0] ? 1 : 0, wt = DB.team(win ? b.home : b.away);
    this.excite = win === 1 ? 1 : 0.15; if (win === 1) { Sound.organ('win'); this.fireworks(); }
    this.orbit(new THREE.Vector3(0, 0, -150), 480, 170, 0.06, new THREE.Vector3(0, 0, -120));
    const d = b.dec || {}, nmz = pid => pid ? esc(DB.full(DB.player(pid))) : '-';
    const pog = b.pog ? DB.player(b.pog) : null;
    const pl = b.pog && b.bat[b.pog] ? (() => { const s = b.bat[b.pog]; return `${s.h}-${s.ab}${s.hr ? ', ' + s.hr + ' HR' : ''}${s.rbi ? ', ' + s.rbi + ' RBI' : ''}`; })() : b.pog && b.pit[b.pog] ? (() => { const s = b.pit[b.pog]; return `${Math.floor(s.outs / 3)}.${s.outs % 3} IP, ${s.so} K, ${s.er} ER`; })() : '';
    H.card(`<div class="pg-title"><span class="k">FINAL</span><div class="p">${esc(wt.city)} ${esc(wt.name)} WIN</div></div>${H.lineScore()}
      <div class="decs"><span><b>W</b>${nmz(d.w)}</span><span><b>L</b>${nmz(d.l)}</span>${d.sv ? `<span><b>SV</b>${nmz(d.sv)}</span>` : ''}${pog ? `<span><b>PLAYER OF THE GAME</b>${esc(DB.full(pog))} ${pl}</span>` : ''}</div>
      <div class="bt"><button class="btn" id="gs-done">CONTINUE</button></div>`, { skip: false });
    const done = () => this.end(b);
    H.cardEl.querySelector('#gs-done').onclick = done;
    setTimeout(() => { this.cardSkip = done; }, 1200);
  }
  derbyFinal() {
    if (this.mode === 'final') return; this.mode = 'final';
    const d = this.E.derby, p = DB.player(this.o.slugger);
    this.orbit(new THREE.Vector3(0, 0, -150), 480, 170, 0.06, new THREE.Vector3(0, 0, -120));
    this.excite = d.hr >= 10 ? 1 : 0.4; if (d.hr >= 8) this.fireworks();
    this.hud.card(`<div class="pg-title"><span class="k">HOME RUN DERBY</span><div class="p">${esc(DB.full(p))}</div><div class="s">${esc(DB.park(this.o.park).name.toUpperCase())}</div></div>
      <div class="mu"><div class="t"><div class="nm">${d.hr}</div><div class="rec">HOME RUNS</div></div><div class="at"></div><div class="t"><div class="nm">${d.best || 0} FT</div><div class="rec">LONGEST</div></div></div>
      <div class="decs">${d.list.map((x, i) => `<span><b>${i + 1}</b>${x} FT</span>`).join('')}</div><div class="bt"><button class="btn" id="gs-done">CONTINUE</button></div>`, { skip: false });
    const done = () => this.end({ derby: { hr: d.hr, best: d.best } });
    this.hud.cardEl.querySelector('#gs-done').onclick = done; setTimeout(() => { this.cardSkip = done; }, 1200);
  }
  end(box) {
    if (!this.running) return;
    this.running = false; this.input.dispose(); this.hud.dispose(); Sound.stop();
    this.stage.dispose(); this.root.innerHTML = ''; this.root.classList.remove('on');
    window.__live = null;
    if (this.touch) leaveLandscape();
    this.resolve(box);
  }
  // ---------- pause ----------
  pause() {
    if (this.paused || this.mode !== 'game') return;
    this.paused = true;
    const E = this.E, fs = E.fieldingSide;
    const m = document.createElement('div'); m.className = 'pause-menu';
    const opts = [['resume', 'RESUME', '']];
    if (E.isUser(fs) && ['aim', 'intro', 'pa_start', 'post_pitch'].includes(E.phase)) opts.push(['change', 'PITCHING CHANGE', `${DB.full(DB.player(E.pitcher()))} has thrown ${(E.st.pc[E.pitcher()] || 0) + (E.pitchesPA || 0)} pitches`]);
    opts.push(['sim', 'SIM TO END OF GAME', 'The computer plays the rest of this game']);
    opts.push(['zone', 'STRIKE ZONE: ' + (this.set.strikeZone ? 'ON' : 'OFF'), '']);
    opts.push(['pci', 'SWING AIM: ' + ({ timing: 'TIMING ONLY', assist: 'ASSISTED', manual: 'MANUAL' }[this.set.pci]), 'Timing only = just swing on time']);
    opts.push(['meter', 'PITCH METER: ' + (this.set.pitchMeter ? 'ON' : 'OFF'), '']);
    opts.push(['diff', 'DIFFICULTY: ' + this.set.diff.toUpperCase(), 'ROOKIE / PRO / ALL-STAR / LEGEND']);
    opts.push(['quit', this.o.mode === 'season' ? 'QUIT (GAME WILL BE SIMMED)' : 'QUIT GAME', '']);
    m.innerHTML = `<div class="in"><h2>PAUSED</h2>${this.hud.lineScore()}<div style="height:10px"></div>${opts.map(([k, t, s]) => `<button class="opt" data-k="${k}">${t}${s ? `<small>${esc(s)}</small>` : ''}</button>`).join('')}</div>`;
    this.hud.root.append(m);
    const close = () => { m.remove(); this.paused = false; this.last = performance.now(); removeEventListener('keydown', key); clearInterval(padT); };
    const act = k => {
      if (k === 'resume') close();
      if (k === 'zone') { this.set.strikeZone = !this.set.strikeZone; saveSettings(); close(); this.pause(); }
      if (k === 'meter') { this.set.pitchMeter = !this.set.pitchMeter; saveSettings(); close(); this.pause(); }
      if (k === 'pci') { const o = ['timing', 'assist', 'manual']; this.set.pci = o[(o.indexOf(this.set.pci) + 1) % 3]; saveSettings(); close(); this.pause(); }
      if (k === 'diff') { const o = ['rookie', 'pro', 'allstar', 'legend']; this.set.diff = o[(o.indexOf(this.set.diff) + 1) % 4]; saveSettings(); this.E.D = null; import('./engine.js').then(mm => { this.E.D = mm.DIFF[this.set.diff]; }); close(); this.pause(); }
      if (k === 'sim') { close(); this.simToEnd(); }
      if (k === 'quit') { close(); if (this.o.mode === 'season') this.simToEnd(); else this.end(null); }
      if (k === 'change') { this.bullpenMenu(m, close); }
    };
    m.querySelectorAll('.opt').forEach(b => b.onclick = () => act(b.dataset.k));
    let fi = 0; const items = () => [...m.querySelectorAll('.opt')]; const foc = () => { items().forEach((b, i) => b.classList.toggle('focus', i === fi)); };
    foc();
    const key = e => { if (e.key === 'ArrowDown') { fi = Math.min(items().length - 1, fi + 1); foc(); } else if (e.key === 'ArrowUp') { fi = Math.max(0, fi - 1); foc(); } else if (e.key === 'Enter') items()[fi]?.click(); else if (e.key === 'Escape') close(); };
    setTimeout(() => addEventListener('keydown', key), 50);
    let prev = {}; const padT = setInterval(() => { const p = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null; if (!p) return; const s = { u: p.buttons[12]?.pressed || p.axes[1] < -0.6, d: p.buttons[13]?.pressed || p.axes[1] > 0.6, a: p.buttons[0]?.pressed, b: p.buttons[1]?.pressed || p.buttons[9]?.pressed }; if (s.d && !prev.d) { fi = Math.min(items().length - 1, fi + 1); foc(); } if (s.u && !prev.u) { fi = Math.max(0, fi - 1); foc(); } if (s.a && !prev.a) items()[fi]?.click(); if (s.b && !prev.b) close(); prev = s; }, 50);
  }
  bullpenMenu(m, close) {
    const E = this.E, fs = E.fieldingSide;
    const avail = S.bullpenLeft(E.st, fs);
    const inn = m.querySelector('.in');
    inn.innerHTML = `<h2>BULLPEN</h2>${avail.map(pid => { const p = DB.player(pid) || {}; const ln = DB.pLine(p); return `<button class="opt" data-p="${pid}">${esc(DB.full(p))} <small>${p.pos} &middot; ${p.th}HP &middot; OVR ${p.ovr} &middot; ${ln[4] != null ? (+ln[4]).toFixed(2) + ' ERA' : ''}</small></button>`; }).join('') || '<div class="muted">Nobody left in the bullpen.</div>'}<button class="opt" data-p="">BACK</button>`;
    inn.querySelectorAll('.opt').forEach(b => b.onclick = () => { const pid = +b.dataset.p; close(); if (pid) { E.userPitchingChange(pid); this.handleEvents(); } });
  }
  simToEnd() {
    const E = this.E;
    E.endPA && E.pendingRes && E.endPA();
    S.simFrom(E.st, {});
    this.finalCard();
  }
  // ---------- fireworks ----------
  fireworks() {
    if (this.o.time === 'day' || this.park.closed) return;
    for (let k = 0; k < 6; k++) setTimeout(() => {
      const n = 90, g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), vel = [];
      const cx = (Math.random() - 0.5) * 500, cy = 260 + Math.random() * 140, cz = -480 - Math.random() * 120;
      for (let i = 0; i < n; i++) { pos[i * 3] = cx; pos[i * 3 + 1] = cy; pos[i * 3 + 2] = cz; const a = Math.random() * 6.28, b = Math.acos(Math.random() * 2 - 1), s = 60 + Math.random() * 40; vel.push(Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const col = [this.homeT.c1, this.homeT.c2, '#ffffff', '#f2c14e'][k % 4];
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: 7, transparent: true, opacity: 1, depthWrite: false }));
      this.scene.add(pts); this.fw.push({ pts, vel, t: 0 });
      Sound.thud();
    }, k * 380);
  }
  updateFireworks(dt) {
    for (const f of this.fw) {
      f.t += dt; const a = f.pts.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) { f.vel[i * 3 + 1] -= 30 * dt; a.setXYZ(i, a.getX(i) + f.vel[i * 3] * dt, a.getY(i) + f.vel[i * 3 + 1] * dt, a.getZ(i) + f.vel[i * 3 + 2] * dt); }
      a.needsUpdate = true; f.pts.material.opacity = Math.max(0, 1 - f.t / 2.2);
    }
    this.fw = this.fw.filter(f => { if (f.t > 2.3) { this.scene.remove(f.pts); f.pts.geometry.dispose(); return false; } return true; });
  }
}
function ordinal(n) { const s = ['TH', 'ST', 'ND', 'RD'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
