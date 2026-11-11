// MLB Grand Slam 27 - game engine (headless-capable: no DOM, no rendering here).
// Pitch -> swing -> ball in play -> fielding/throws/baserunning -> result -> recordPA() into the shared sim state.
import * as S from '../sim/simgame.js';
import * as PH from './phys.js';
import { player } from '../db.js';

export const BASES = [[0, 0], [63.64, -63.64], [0, -127.28], [-63.64, -63.64], [0, 0]];
export const POSN = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 };
const SPOT = { 1: [0, -60.5], 2: [0, 3.4], 3: [64, -86], 4: [40, -142], 5: [-66, -84], 6: [-40, -142], 7: [-130, -255], 8: [0, -305], 9: [130, -255] };
const rand = Math.random, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const V = (x = 0, z = 0) => ({ x, z });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const baseP = i => V(BASES[i][0], BASES[i][1]);
const R = p => player(p) || {};
export const DIFF = {
  rookie: { win: 1.65, pci: 1.35, cpuCon: 0.78, cpuEye: 0.8, cpuCtl: 0.75, assist: 0.9, meter: 0.85 },
  pro: { win: 1.25, pci: 1.12, cpuCon: 0.95, cpuEye: 0.95, cpuCtl: 0.95, assist: 0.6, meter: 1.0 },
  allstar: { win: 1.0, pci: 1.0, cpuCon: 1.05, cpuEye: 1.05, cpuCtl: 1.05, assist: 0.35, meter: 1.15 },
  legend: { win: 0.8, pci: 0.9, cpuCon: 1.15, cpuEye: 1.15, cpuCtl: 1.15, assist: 0.15, meter: 1.3 },
};
export const SWING_TIME = 0.2; // press -> contact = SWING_TIME / 2 (the batter is already loaded when he starts)
// expected batting average on a fair, non-homer ball by exit velocity / launch angle (Statcast-shaped)
export function xBA(ev, la) {
  if (la < 10) { if (ev < 72) return 0.18; return clamp(0.12 + (ev - 82) * 0.01, 0.1, 0.45); }
  if (la < 25) { if (ev < 75) return 0.36; return clamp(0.42 + (ev - 88) * 0.012, 0.3, 0.8); }
  if (la < 50) return clamp(0.02 + (ev - 94) * 0.016, 0.01, 0.36);
  return 0.02;
} // seconds for the whole swing; contact at 50%

export class Engine {
  constructor(opts) {
    this.o = opts; // {away, home, park (Park or physics-only park), user:'home'|'away'|'both'|'none', innings, settings, state}
    this.park = opts.park;
    this.st = opts.state || S.newState(opts.away, opts.home, { park: opts.parkId, innings: opts.innings || 9 });
    this.set = opts.settings || { diff: 'pro', pci: 'assist', pitchMeter: true, autoThrow: false };
    this.D = DIFF[this.set.diff] || DIFF.pro;
    this.ev = []; // events for the view/HUD: {type, ...}
    this.time = 0;
    this.wind = opts.wind || { x: 0, z: 0 };
    this.kD = 0.00195 * (opts.altitude > 4000 ? 0.83 : 1);
    this.phase = 'pa_start'; this.pt = 0;
    this.in = { stick: { x: 0, y: 0 }, abs: null, press: {}, held: {} };
    this.balls = 0; this.strikes = 0; this.pitchesPA = 0;
    this.F = {}; this.runners = []; this.ball = { state: 'none', p: { x: 0, y: 0, z: 0 } };
    this.pci = { x: 0, y: 2.5 }; this.aim = { x: 0, y: 2.5 }; this.pitchSel = 0; this.meter = null;
    this.stats = { pitches: 0 };
    this.prevBases = [null, null, null];
    this.setupHalf();
  }
  emit(type, data = {}) { this.ev.push({ type, ...data }); }
  get battingSide() { return this.st.top ? 0 : 1; }
  get fieldingSide() { return this.st.top ? 1 : 0; }
  isUser(side) { const u = this.o.user; return u === 'both' || (u === 'home' && side === 1) || (u === 'away' && side === 0); }
  get userBats() { return this.isUser(this.battingSide); }
  get userPitches() { return this.isUser(this.fieldingSide); }
  batter() { return S.batterUp(this.st).pid; }
  pitcher() { return this.st.cur[this.fieldingSide]; }

  // ---------- setup ----------
  setupHalf() {
    const st = this.st, side = this.st.sides[this.fieldingSide];
    this.F = {};
    const dims = this.park.pk ? this.park.pk.dims : [330, 360, 380, 400, 380, 360, 330];
    const of = (dims[3] / 400 + 1) / 2;
    for (const x of side.lineup) {
      const n = POSN[x.pos]; if (!n) continue;
      this.F[n] = this.mkFielder(n, x.pid, of);
    }
    this.F[1] = this.mkFielder(1, st.cur[this.fieldingSide], of);
    this.halfKey = st.inn + (st.top ? 'T' : 'B');
  }
  mkFielder(n, pid, of = 1) {
    const r = R(pid), sp = SPOT[n], k = n >= 7 ? of : 1;
    return {
      n, pid, p: V(sp[0] * k, sp[1] * k), home: V(sp[0] * k, sp[1] * k), tgt: null, face: 0, mode: n === 2 ? 'squat' : n === 1 ? 'set' : 'ready', anim: 0,
      speed: 22.5 + (r.spd ?? 50) * 0.065, react: (n >= 7 ? 0.58 : 0.3) - (r.fld ?? 50) * 0.0018, arm: (n === 1 ? 82 : 66) + (r.arm ?? 50) * (n === 1 ? 0.12 : 0.27), fld: r.fld ?? 50, hasBall: false, job: null,
    };
  }
  // ---------- per frame ----------
  update(dt) {
    this.time += dt; this.pt += dt;
    const ph = this.phase;
    if (ph === 'pa_start') this.paStart();
    else if (ph === 'intro') { if (this.pt > (this.o.fastIntro ? 0.05 : 1.3) || this.in.press.skip) this.toAim(); }
    else if (ph === 'aim') this.aimPhase(dt);
    else if (ph === 'windup') this.windupPhase(dt);
    else if (ph === 'pitch') this.pitchPhase(dt);
    else if (ph === 'post_pitch') { if (this.pt > this.postWait) this.afterPitch(); }
    else if (ph === 'live') this.livePhase(dt);
    else if (ph === 'dead') { this.moveActors(dt); if (this.pt > this.deadWait || (this.pt > 1.2 && this.in.press.skip)) this.endPA(); }
    else if (ph === 'half_end') { if (this.pt > 0.1) { this.phase = 'switch'; this.pt = 0; } }
    // batter stance PCI movement during aim/windup/pitch
    if (this.userBats && (ph === 'aim' || ph === 'windup' || ph === 'pitch')) this.movePCI(dt);
    this.in.press = {};
  }
  // ---------- plate appearance ----------
  paStart() {
    const st = this.st;
    if (st.done) { this.phase = 'final'; this.emit('final'); return; }
    if (this.halfKey !== st.inn + (st.top ? 'T' : 'B')) { this.phase = 'switch'; this.pt = 0; this.emit('half', { inn: st.inn, top: st.top }); return; }
    // CPU bullpen moves (user teams get a suggestion in the HUD instead)
    const fs = this.fieldingSide;
    if (!this.isUser(fs)) { const np = S.cpuPitchingChange(st, fs); if (np) { this.F[1] = this.mkFielder(1, np); this.emit('pitching_change', { pid: np, side: fs }); } }
    else if (S.pitcherTired(st, fs) && !this.tiredWarned) { this.tiredWarned = this.pitcher(); this.emit('tired', { pid: this.pitcher() }); }
    if (this.tiredWarned && this.tiredWarned !== this.pitcher()) this.tiredWarned = null;
    this.balls = 0; this.strikes = 0; this.pitchesPA = 0;
    this.buildRunners();
    this.resetFielders();
    this.bat = { pid: this.batter(), r: R(this.batter()), swing: null, mode: 'stance' };
    const b = this.bat.r, pr = R(this.pitcher());
    this.bat.hand = b.b === 'S' ? (pr.th === 'L' ? 'R' : 'L') : (b.b || 'R');
    this.pci = { x: 0, y: 2.5 }; this.stealCall = null;
    this.phase = 'intro'; this.pt = 0;
    this.emit('batter', { pid: this.bat.pid });
  }
  buildRunners() {
    const st = this.st, old = this.runners || [];
    this.runners = [];
    for (let i = 0; i < 3; i++) if (st.bases[i]) {
      const prev = old.find(r => r.pid === st.bases[i]);
      const r = this.mkRunner(st.bases[i], i + 1);
      if (prev && !prev.out && prev.p) { r.p = { ...prev.p }; r.jog = true; } // jogs over from where the last play left him
      this.runners.push(r);
    }
  }
  mkRunner(pid, base) {
    const r = R(pid);
    return { pid, base, s: 0, goal: base, p: baseP(base), speed: 24 + (r.spd ?? 50) * 0.062, acc: 0, out: false, scored: false, lead: 0, tag: false, safe: true, jog: false, forced: false, mode: 'lead' };
  }
  resetFielders() { for (const f of Object.values(this.F)) { f.p = { ...f.home }; f.tgt = null; f.mode = f.n === 2 ? 'squat' : f.n === 1 ? 'set' : 'ready'; f.hasBall = f.n === 1; f.job = null; f.anim = 0; f.reactLeft = null; f.dove = false; f.userWait = 0; f.userWaitDone = false; f.runIn = false; } this.ball = { state: 'held', holder: this.F[1], p: { x: 0, y: 5, z: -60.5 } }; }
  toAim() {
    this.phase = 'aim'; this.pt = 0; this.meter = null;
    if (!this.userPitches) this.cpuChoosePitch();
    else { const ar = this.arsenal(); this.pitchSel = Math.min(this.pitchSel, ar.length - 1); this.aim = { x: 0, y: 2.5 }; }
    // runners take leads; CPU steal decision
    for (const r of this.runners) { r.lead = r.base === 3 ? 8 : r.steal ? 14 : 11; r.jog = false; }
    if (!this.userBats) this.cpuStealDecision();
    this.emit('aim');
  }
  arsenal() {
    const p = R(this.pitcher());
    let ar = (p.pit && p.pit.length ? p.pit : [['FF', p.vel || 93, 55], ['SL', (p.vel || 93) - 8, 30], ['CH', (p.vel || 93) - 9, 15]]).filter(x => PH.PITCH_MOVE[x[0]]);
    ar = ar.slice().sort((a, b) => b[2] - a[2]).slice(0, 5);
    if (!ar.length) ar = [['FF', 92, 100]];
    return ar;
  }
  cpuChoosePitch() {
    const ar = this.arsenal(), tot = ar.reduce((s, x) => s + x[2], 0);
    let r = rand() * tot, i = 0; for (; i < ar.length - 1; i++) { r -= ar[i][2]; if (r <= 0) break; }
    this.pitchSel = i;
    // location: ahead in the count -> expand; behind -> attack the zone
    const z = PH.ZONE, b = this.balls, s = this.strikes;
    const zoneP = b === 3 ? 0.9 : s === 2 && b < 2 ? 0.45 : b >= 2 ? 0.78 : 0.64;
    const type = ar[i][0], breaking = ['SL', 'ST', 'CU', 'KC', 'SV', 'CS'].includes(type), down = breaking || ['CH', 'FS', 'FO'].includes(type);
    let x, y;
    if (rand() < zoneP) { x = (rand() * 2 - 1) * 0.65; y = 1.75 + rand() * 1.5; }
    else { const e = rand(); x = e < 0.5 ? (rand() < 0.5 ? -1 : 1) * (0.9 + rand() * 0.45) : (rand() * 2 - 1) * 0.7; y = e >= 0.5 ? (down || rand() < 0.6 ? 1.15 - rand() * 0.5 : 3.75 + rand() * 0.4) : 1.6 + rand() * 1.8; }
    this.cpuTarget = { x, y };
    this.aim = { x, y };
  }
  aimPhase(dt) {
    const I = this.in;
    if (this.userPitches) {
      const ar = this.arsenal();
      for (let k = 0; k < 5; k++) if (I.press['pitch' + k] && k < ar.length && !this.meter) { this.pitchSel = k; this.emit('pitch_sel', { i: k }); }
      if (!this.meter && I.press.pitchPrev) { this.pitchSel = (this.pitchSel + ar.length - 1) % ar.length; this.emit('pitch_sel', { i: this.pitchSel }); }
      if (!this.meter && I.press.pitchNext) { this.pitchSel = (this.pitchSel + 1) % ar.length; this.emit('pitch_sel', { i: this.pitchSel }); }
      // aim
      if (I.abs && I.absFor === 'aim') { this.aim.x = clamp(I.abs.x, -1.6, 1.6); this.aim.y = clamp(I.abs.y, 0.7, 4.3); }
      else { this.aim.x = clamp(this.aim.x + I.stick.x * dt * 1.9, -1.6, 1.6); this.aim.y = clamp(this.aim.y + I.stick.y * dt * 1.9, 0.7, 4.3); }
      if (I.press.pickoff && this.runners.some(r => r.base === 1)) { this.emit('msg', { text: 'PICKOFF THROW - RUNNER DIVES BACK' }); this.pt = 0; return; }
      if (this.set.pitchMeter) {
        if (!this.meter && I.press.throw) { this.meter = { t: 0, stopped: false, v: 0 }; this.emit('meter_start'); }
        else if (this.meter && !this.meter.stopped) {
          const speed = 1.1 * this.D.meter * (1 + S.fatigue(this.st, this.fieldingSide) * 0.25);
          this.meter.t += dt * speed;
          const v = this.meter.t <= 1 ? this.meter.t : Math.max(0, 2 - this.meter.t);
          this.meter.v = v;
          if (I.press.throw || this.meter.t >= 2) { this.meter.stopped = true; this.meter.acc = this.meterAcc(v, this.meter.t >= 2); this.startWindup(); }
        }
      } else if (I.press.throw) { this.meter = { stopped: true, acc: 0.55 + rand() * 0.35 }; this.startWindup(); }
    } else {
      if (this.pt > 0.6 + rand() * 0.2) this.startWindup();
    }
    if (this.userBats && I.press.steal) this.callSteal();
  }
  meterAcc(v, timeout) {
    if (timeout) return 0;
    const p = R(this.pitcher()), gold = 0.03 + (p.ctl ?? 50) / 99 * 0.04 - S.fatigue(this.st, this.fieldingSide) * 0.02;
    const d = Math.abs(v - 0.85);
    if (d <= gold) return 1;
    return clamp(1 - (d - gold) / 0.32, 0, 0.98);
  }
  callSteal() {
    const r = this.runners.find(x => x.base === 1 && !this.runners.some(y => y.base === 2)) || this.runners.find(x => x.base === 2 && !this.runners.some(y => y.base === 3));
    if (r && !r.steal) { r.steal = true; this.emit('msg', { text: 'RUNNER GOING ON THE PITCH' }); }
  }
  cpuStealDecision() {
    const r = this.runners.find(x => x.base === 1 && !this.runners.some(y => y.base === 2));
    if (!r) return;
    const spd = R(r.pid).spd ?? 50, diff = this.st.score[this.battingSide] - this.st.score[this.fieldingSide];
    if (Math.abs(diff) > 4 || spd < 60) return;
    if (rand() < (spd - 55) / 45 * 0.11) r.steal = true;
  }
  startWindup() {
    this.phase = 'windup'; this.pt = 0;
    const ar = this.arsenal(), [type, mph] = ar[this.pitchSel];
    const p = R(this.pitcher()), fat = S.fatigue(this.st, this.fieldingSide);
    let speed = mph * (1 - fat * 0.035) + gauss() * 0.7;
    let tx = this.aim.x, ty = this.aim.y;
    if (this.userPitches) {
      const acc = this.meter ? this.meter.acc : 0.7;
      const err = (1 - acc) * (0.55 + (1 - (p.ctl ?? 50) / 99) * 0.6) + fat * 0.25 + 0.06;
      tx += gauss() * err; ty += gauss() * err;
      if (acc < 0.5 && rand() < 0.5) { tx *= 0.5; ty = 2.5 + (ty - 2.5) * 0.4; } // hanging mistake over the plate
      if (acc === 1) speed += 1;
    } else {
      const ctl = (p.ctl ?? 50) * this.D.cpuCtl;
      const err = 0.13 + (1 - clamp(ctl, 20, 110) / 110) * 0.55 + fat * 0.3;
      tx += gauss() * err; ty += gauss() * err;
    }
    const hand = p.th === 'L' ? 'L' : 'R';
    const ext = 6 + (p.ht ? (p.ht - 74) * 0.08 : 0);
    const rel = { x: hand === 'L' ? 1.7 : -1.7, y: 5.8 + (p.ht ? (p.ht - 74) * 0.04 : 0), z: -60.5 + ext };
    const move = PH.PITCH_MOVE[type].map(v => v * (0.85 + rand() * 0.3) * (1 + ((p.stf ?? 50) - 60) / 250));
    this.curPitch = { type, mph: Math.round(speed * 10) / 10, path: PH.pitchPath(rel, { x: tx, y: ty }, speed, move, hand), target: { x: tx, y: ty }, hand };
    this.windupDur = this.runners.length ? 0.85 : 1.15;
    this.emit('windup', { ptype: type, mph: this.curPitch.mph });
  }
  windupPhase(dt) {
    this.F[1].mode = 'pitch'; this.F[1].anim = clamp(this.pt / this.windupDur * 0.72, 0, 0.72);
    // runners: lead off; stealers break at first movement
    for (const r of this.runners) if (r.steal && this.pt > 0.05 && !r.running) { r.running = true; r.goal = r.base + 1; r.mode = 'run'; }
    if (this.userBats) this.handleSwingInput();
    if (this.pt >= this.windupDur) {
      this.phase = 'pitch'; this.pt = 0; this.ball = { state: 'pitch', p: this.curPitch.path.at(0) };
      this.cpuBatDecision();
      this.emit('release', { ptype: this.curPitch.type, mph: this.curPitch.mph });
    }
  }
  movePCI(dt) {
    if (this.set.pci === 'timing') { // perfect aim, timing only
      if (this.phase === 'pitch') { const c = this.curPitch.path.at(1); this.pci.x = c.x; this.pci.y = c.y; } else { this.pci.x = 0; this.pci.y = 2.5; }
      return;
    }
    const I = this.in;
    if (I.abs && I.absFor === 'pci') { this.pci.x = clamp(I.abs.x, -1.5, 1.5); this.pci.y = clamp(I.abs.y, 0.9, 4.1); }
    else { this.pci.x = clamp(this.pci.x + I.stick.x * dt * 4.2, -1.5, 1.5); this.pci.y = clamp(this.pci.y + I.stick.y * dt * 4.2, 0.9, 4.1); }
    if (this.set.pci === 'assist' && this.phase === 'pitch') { // drift toward where the ball will cross
      // keyboard players who aren't steering get a much stronger pull (aiming with keys is hard)
      const steer = Math.abs(I.stick.x) + Math.abs(I.stick.y) > 0 || (I.abs && I.absFor === 'pci');
      const c = this.curPitch.path.at(1), k = Math.min(1, this.D.assist * dt * (I.keys && !steer ? 9 : 3.2));
      this.pci.x += (c.x - this.pci.x) * k; this.pci.y += (c.y - this.pci.y) * k;
    }
  }
  handleSwingInput() {
    if (this.bat.swing) return;
    const I = this.in;
    const kind = I.press.swing ? 'normal' : I.press.power ? 'power' : I.press.bunt ? 'bunt' : null;
    if (!kind) return;
    this.bat.swing = { kind, at: this.phase === 'pitch' ? this.pt : -(this.windupDur - this.pt), t: 0, pci: { ...this.pci } };
    this.emit('swing', { kind });
  }
  // time (since release) the ball reaches the front of the plate
  get tArrive() { return this.curPitch.path.time; }
  cpuBatDecision() {
    if (this.userBats) return;
    const b = this.bat.r, p = R(this.pitcher()), c = this.curPitch.path.at(1), z = PH.ZONE;
    const inZone = c.x > z.x0 && c.x < z.x1 && c.y > z.y0 && c.y < z.y1;
    const edge = Math.max(0, Math.abs(c.x) - 0.83, z.y0 - c.y, c.y - z.y1);
    const eye = (b.eye ?? 50) * this.D.cpuEye, con = (b.con ?? 50) * this.D.cpuCon;
    let sw;
    if (inZone) sw = 0.66 + (this.strikes === 2 ? 0.22 : 0) - (this.balls === 3 && this.strikes < 2 ? 0.15 : 0) + (this.balls === 0 && this.strikes === 0 ? -0.12 : 0);
    else sw = Math.max(0.02, (0.36 - eye * 0.0026 - edge * 0.45) * (this.strikes === 2 ? 1.5 : 1) * (1 + ((p.stf ?? 50) - 60) / 200));
    if (this.runners.some(r => r.steal) && this.strikes < 2) sw *= 0.6;
    if (rand() >= sw) return;
    // timing + aim errors for the CPU hitter
    const qual = clamp(((p.stf ?? 50) + (p.vel ? (p.vel - 93) * 2 : 0) - con) / 100, -0.6, 0.6);
    const tErr = gauss() * 0.07 * (1 + qual * 0.7);
    const aimErr = Math.abs(gauss()) * (0.47 + qual * 0.2 + (inZone ? 0 : 0.14) + edge * 0.3);
    const ang = rand() * Math.PI * 2;
    const kind = (b.pow ?? 50) > 78 && this.balls > this.strikes && rand() < 0.45 ? 'power' : 'normal';
    const at = this.tArrive - SWING_TIME * 0.5 + tErr;
    this.bat.swing = { kind, at, t: 0, pci: { x: c.x + Math.cos(ang) * aimErr, y: c.y + Math.sin(ang) * aimErr * 0.8 }, cpu: true };
  }
  pitchPhase(dt) {
    const P = this.curPitch, u = this.pt / P.path.time;
    if (this.userBats) this.handleSwingInput();
    const sw = this.bat.swing;
    if (sw && !sw.started && this.pt >= sw.at) { sw.started = this.pt; this.emit('swing_anim', { kind: sw.kind }); }
    // contact check at the swing's contact moment
    if (sw && !sw.resolved && this.pt >= sw.at + SWING_TIME * 0.5) {
      sw.resolved = true;
      if (!sw.cpu) sw.pci = { ...this.pci };
      const res = this.contact(sw);
      if (res) { this.inPlay(res); return; }
    }
    if (u >= 1.12) { // ball reaches the catcher
      const c = P.path.at(1), z = PH.ZONE;
      const strike = c.x > z.x0 && c.x < z.x1 && c.y > z.y0 && c.y < z.y1;
      const swung = !!(sw && sw.resolved);
      this.pitchesPA++;
      this.lastPitch = { x: c.x, y: c.y, strike, swung, type: P.type, mph: P.mph };
      this.ball = { state: 'held', holder: this.F[2], p: { x: c.x, y: c.y, z: 1.5 } };
      let call;
      if (sw && sw.kind === 'bunt' && !swung) { sw.resolved = true; }
      if (swung || strike || (sw && sw.kind === 'bunt')) { this.strikes++; call = swung ? 'swinging' : 'called'; }
      else { this.balls++; call = 'ball'; }
      if (call === 'ball' && rand() < 0.008) call = 'hbp';
      this.emit('pitch_result', { call, x: c.x, y: c.y, mph: P.mph, ptype: P.type, balls: this.balls, strikes: this.strikes });
      this.phase = 'post_pitch'; this.pt = 0; this.postWait = 0.75;
      this.pendingCall = call;
      // steal attempt in progress -> catcher throws
      const stealer = this.runners.find(r => r.running && !r.out);
      if (stealer && call !== 'hbp' && !(call === 'ball' && this.balls >= 4)) { this.startStealPlay(stealer); }
    }
  }
  startStealPlay(r) {
    const cR = R(this.F[2].pid), rR = R(r.pid);
    const pSafe = clamp(0.6 + ((rR.spd ?? 50) - 50) / 100 * 0.7 - ((cR.arm ?? 50) - 50) / 100 * 0.35 - (r.goal === 3 ? 0.08 : 0), 0.3, 0.93);
    this.phase = 'live'; this.pt = 0; this.play = { kind: 'steal', outs: 0, steal: r, hit: false, ev: [], stealSafe: rand() < pSafe };
    const base = r.goal, cover = base === 2 ? (rand() < 0.5 ? this.F[6] : this.F[4]) : this.F[5];
    cover.job = { cover: base }; cover.tgt = baseP(base);
    const c = this.F[2]; c.hasBall = true; this.ball = { state: 'held', holder: c, p: { ...c.p, y: 3 } };
    c.holdT = 0.88 - (R(c.pid).arm ?? 50) * 0.003; // transfer (pop time ~2.0 s total)
    this.forceThrowTo = base;
  }
  afterPitch() {
    const call = this.pendingCall;
    if (this.syncAfterSteal) {
      this.syncAfterSteal = false;
      if (this.halfKey !== this.st.inn + (this.st.top ? 'T' : 'B') || this.st.done) { this.phase = 'pa_start'; this.pt = 0; this.runners = []; return; }
      this.buildRunners();
    }
    if (call === 'hbp') return this.finishPA('HBP');
    if (this.balls >= 4) return this.finishPA('BB');
    if (this.strikes >= 3) return this.finishPA('K');
    for (const r of this.runners) { r.steal = false; r.running = false; r.mode = 'lead'; r.goal = r.base; }
    this.bat.swing = null;
    this.resetFielders();
    this.toAim();
  }
  // ---------- contact ----------
  contact(sw) {
    const P = this.curPitch, b = this.bat.r, D = this.D;
    const c = P.path.at(1);
    const dt = sw.at + SWING_TIME * 0.5 - this.tArrive; // + late, - early
    const W = 0.075 * (sw.cpu ? 1.25 : D.win) * (sw.kind === 'bunt' ? 3 : 1);
    const con = b.con ?? 50, pow = b.pow ?? 50;
    let r = (0.34 + con / 99 * 0.24) * (sw.cpu ? 1 : D.pci) * (sw.kind === 'power' ? 0.78 : 1) * (sw.kind === 'bunt' ? 1.25 : 1);
    const d = Math.hypot(c.x - sw.pci.x, (c.y - sw.pci.y) * 1.1), R0 = r + 0.12;
    if (d > R0 || Math.abs(dt) > W * 1.35) { this.emit('whiff'); return null; }
    const tq = clamp(1 - Math.abs(dt) / (W * 1.35), 0, 1), aq = clamp(1 - d / R0, 0, 1);
    const Q = Math.pow(tq, 0.75) * Math.pow(aq, 0.55);
    const pullDir = this.bat.hand === 'L' ? 1 : -1;
    let ev, la, spray;
    if (sw.kind === 'bunt') {
      ev = 22 + rand() * 18; la = -10 - rand() * 15; spray = (rand() * 2 - 1) * 30;
    } else {
      ev = 64 + Math.pow(Q, 0.7) * (30 + pow * 0.27) + (sw.kind === 'power' ? 5 : 0) + gauss() * 4;
      if (P.mph > 95) ev += (P.mph - 95) * 0.2;
      ev = Math.min(ev, 106 + pow * 0.12);
      const ov = (c.y - sw.pci.y) / R0; // ball above the PCI center -> bat under the ball -> lift
      la = 11 + ov * 52 + gauss() * 9 + (sw.kind === 'power' ? 3 : 0) + (pow - 60) * 0.06;
      spray = pullDir * clamp(-dt / W, -1, 1) * 36 + gauss() * 9 - c.x * pullDir * 7;
      if (Math.abs(dt) > W * 0.95) spray = pullDir * Math.sign(-dt) * (47 + rand() * 40);
    }
    // weak or badly-timed contact often fouls off
    const foulBack = (Q < 0.3 && rand() < 0.75) || rand() < 0.1;
    if (foulBack) { ev = 60 + rand() * 25; la = 25 + rand() * 50; spray = (rand() < 0.5 ? -1 : 1) * (100 + rand() * 50); }
    this.lastContact = { ev, la, spray, Q };
    return { ev, la, spray };
  }
  inPlay({ ev, la, spray }) {
    const P = this.curPitch;
    this.pitchesPA++;
    const p0 = { x: (this.bat.hand === 'L' ? 1 : -1) * 0.2, y: clamp(P.path.at(1).y, 1.2, 4), z: -1.2 };
    const v = PH.launch(ev, la, spray);
    const b = PH.makeBall(p0, v, PH.spinFor(la), { kD: this.kD, wind: this.wind });
    this.ball = { state: 'air', phys: b, p: b.p, firstFair: null };
    this.play = { kind: 'hit', fate: rand() < xBA(ev, la) ? 'hit' : 'out', ev, la, spray, outs: 0, hit: true, caughtFly: false, events: [], start: this.time, scored: [], foul: false, maxBase: 0, errors: 0, fieldedBy: null };
    this.phase = 'live'; this.pt = 0;
    this.emit('contact', { ev, la, spray });
    // batter becomes a runner
    const br = this.mkRunner(this.bat.pid, 0); br.goal = 1; br.mode = 'run'; br.isBatter = true; br.delay = 0.35; br.forced = true;
    this.runners.unshift(br);
    this.bat.mode = 'drop';
    this.predictBall();
    this.assignFielders();
    this.runnersOnContact();
  }
  // ---------- live play ----------
  predictBall() { this.pred = PH.predict(this.ball.phys, this.physPark(), 10, 1 / 40); this.predAt = this.time; }
  physPark() { return { wallR: this.park.wallR, wallH: this.park.wallH, turf: this.park.pk && this.park.pk.turf === 'turf' }; }
  assignFielders() {
    const S2 = this.pred.samples;
    let best = null, bt = 1e9, best2 = null, bt2 = 1e9;
    for (const f of Object.values(this.F)) {
      f.job = null; f.tgt = null;
      if (f.n === 2 && S2.length && Math.hypot(S2[S2.length - 1].x, S2[S2.length - 1].z) > 30) continue;
      let ft = null, pt = null;
      for (const s of S2) {
        if (s.y > 9.5) continue;
        const reach = s.y < 6.5 ? (f.n >= 7 ? 3 : 4.5) : 2.5;
        const need = f.react + Math.max(0, dist(f.p, s) - reach) / f.speed + 0.08;
        if (need <= s.t) { ft = s.t; pt = s; break; }
      }
      if (!pt) { const s = S2[S2.length - 1]; ft = f.react + dist(f.p, s) / f.speed + 1; pt = s; }
      if (ft < bt) { best2 = best; bt2 = bt; best = f; bt = ft; f.icpt = pt; }
      else if (ft < bt2) { best2 = f; bt2 = ft; f.icpt = pt; }
      else f.icpt = pt;
    }
    this.chaser = best; best.job = { chase: true }; best.tgt = { x: best.icpt.x, z: best.icpt.z };
    this.chaser2 = null;
    if (best2 && bt2 < bt + 0.5 && (best2.n >= 7) === (best.n >= 7) && best2.n !== 2 && best2.n !== 1) { this.chaser2 = best2; best2.job = { chase: true }; best2.tgt = { x: best2.icpt.x, z: best2.icpt.z }; }
    if (best2 && !this.chaser2 && best2.n >= 7 && best.n >= 7) { best2.job = { backup: true }; best2.tgt = { x: best.icpt.x * 0.9 + best2.p.x * 0.1, z: best.icpt.z + (best.icpt.z < 0 ? -18 : 18) }; }
    // coverage
    const cover = (n, base) => { const f = this.F[n]; if (f && !f.job) { f.job = { cover: base }; f.tgt = baseP(base); } };
    const right = this.ball.phys.v.x > 0;
    if (best.n === 3) cover(1, 1); else cover(3, 1);
    if (best.n === 4 || best.n === 6) cover(best.n === 4 ? 6 : 4, 2); else cover(right ? 6 : 4, 2);
    if (best.n === 5) cover(6, 3); else cover(5, 3);
    if (best.n === 2) cover(1, 4); else cover(2, 4);
    // the other middle infielder: relay man toward an outfield ball
    for (const n of [4, 6]) { const f = this.F[n]; if (!f.job && best.n >= 7) { f.job = { cut: true }; f.tgt = { x: best.icpt.x * 0.45, z: best.icpt.z * 0.5 }; } }
    if (!this.F[1].job) { this.F[1].job = { backup: true }; this.F[1].tgt = { x: 0, z: -40 }; }
    for (const f of Object.values(this.F)) if (!f.job) { f.job = { hold: true }; f.tgt = { x: f.home.x * 0.95, z: f.home.z * 0.95 }; }
  }
  runnersOnContact() {
    const pl = this.play, fly = pl.la > 10 && pl.ev > 60;
    const twoOut = this.st.outs === 2;
    // forced chain
    const occ = new Set(this.runners.filter(r => !r.isBatter).map(r => r.base));
    for (const r of this.runners) {
      if (r.isBatter) continue;
      let forced = true; for (let b = 1; b < r.base; b++) if (!occ.has(b)) forced = false;
      if (!occ.has(1) && r.base >= 1) forced = r.base === 1 ? true : forced;
      r.forced = forced && occ.has(1) || r.base === 1;
      if (r.base > 1) { let ok = true; for (let b = 1; b < r.base; b++) if (!occ.has(b)) ok = false; r.forced = ok; }
      r.steal = false;
      if (twoOut || (r.forced && !fly)) { r.goal = r.base + 1; r.mode = 'run'; }
      else if (fly) { r.mode = 'half'; r.goal = r.base; r.tag = r.base === 3 || (r.base === 2 && Math.abs(pl.spray) > 10); }
      else { // ground ball / liner, not forced
        const rightSide = pl.spray > 12;
        if (r.base === 2 && rightSide && pl.ev < 95) { r.goal = 3; r.mode = 'run'; }
        else { r.goal = r.base; r.mode = 'hold'; }
      }
    }
  }
  livePhase(dt) {
    const pl = this.play, b = this.ball;
    // --- ball ---
    if (b.state === 'air') {
      if (!b.prevP) b.prevP = { x: b.p.x, z: b.p.z };
      if (pl.kind === 'hit' && this.wallPlay(dt)) return;
      const steps = 4; let ev = null;
      for (let i = 0; i < steps; i++) { const e = PH.stepBall(b.phys, dt / steps, this.physPark()); if (e) ev = e; if (b.phys.hr || b.phys.outOfPlay || b.phys.stopped) break; }
      b.p = b.phys.p;
      const fair = Math.abs(Math.atan2(b.p.x, -b.p.z)) <= 0.7854 && -b.p.z > -0.5;
      const dd = Math.hypot(b.p.x, b.p.z);
      if (pl.kind === 'hit' && pl.fair == null) {
        // fair/foul: decided where it lands past the bases, or when it passes / stops before the bases
        if (b.phys.landed && dd > 95) pl.fair = Math.abs(Math.atan2(b.phys.landed.x, -b.phys.landed.z)) <= 0.7854 && -b.phys.landed.z > 0;
        else if (b.phys.landed && (dd > 90 || b.phys.stopped)) pl.fair = fair;
        if (pl.fair === false) return this.foulBall();
      }
      if (b.phys.hr) { pl.fair = true; return this.homeRun(); }
      if (b.phys.outOfPlay) { if (pl.fair !== true) return this.foulBall(); return this.groundRuleDouble(); }
      if (ev === 'wall' || ev === 'land') { if (ev === 'wall') this.emit('wall'); this.predictBall(); this.retarget(); }
      else if (this.time - this.predAt > 0.35) { this.predictBall(); this.retarget(); }
      this.tryCatch(dt);
    } else if (b.state === 'thrown') {
      const T = b.throw; T.t += dt; const u = clamp(T.t / T.dur, 0, 1);
      b.p = { x: T.a.x + (T.b.x - T.a.x) * u, y: T.ay + (T.by - T.ay) * u + T.arc * 4 * u * (1 - u), z: T.a.z + (T.b.z - T.a.z) * u };
      if (u >= 1) this.throwArrives();
    } else if (b.state === 'held') {
      const h = b.holder; b.p = { x: h.p.x, y: 4, z: h.p.z };
      h.holdT = (h.holdT || 0) - dt;
      if (h.holdT <= 0) this.decideWithBall(h);
    }
    this.moveActors(dt);
    this.runnerLogic(dt);
    this.checkPlayEnd();
  }
  // ---------- at the wall: the outfielder plants a foot on the fence and leaps (can rob a home run) ----------
  wallPlay(dt) {
    const b = this.ball, pl = this.play, ph = b.phys;
    if (ph.landed || ph.hitFence) return false;
    const dd = Math.hypot(b.p.x, b.p.z), phi = Math.atan2(b.p.x, -b.p.z);
    if (Math.abs(phi) > 0.79 || -b.p.z <= 0) return false;
    const R = this.park.wallR(phi), H = this.park.wallH(phi);
    const vh = (ph.v.x * b.p.x + ph.v.z * b.p.z) / (dd || 1); // speed toward the wall
    if (vh <= 5) return false;
    const toWall = (R - dd) / vh;
    // already decided: make the catch when the ball reaches the glove at the top of the leap
    const W = pl.wall;
    if (W) {
      if (W.catch && toWall <= dt * 1.2 + 0.02) {
        const f = W.f; pl.fateDone = true; pl.robbed = W.hr;
        this.flyCaught(f, true, { wall: true, rob: W.hr });
        this.ball.p = { x: b.p.x, y: b.p.y, z: b.p.z };
        return true;
      }
      return false;
    }
    if (toWall > 0.42 || toWall < 0) return false;
    // where will it be at the wall, and how high?
    const yW = b.p.y + ph.v.y * toWall - 16 * toWall * toWall;
    const wx = Math.sin(phi) * (R - 1.2), wz = -Math.cos(phi) * (R - 1.2);
    let f = null, fd = 1e9;
    for (const o of Object.values(this.F)) { if (o.n < 7 || o.mode === 'throw') continue; const d = Math.hypot(o.p.x - wx, o.p.z - wz); if (d < fd) { fd = d; f = o; } }
    pl.wall = { tried: true };
    if (!f || fd > 9 + f.speed * toWall * 0.6) return false;
    const reach = 11.2 + (f.fld - 60) / 45; // glove height at the top of a leap with a foot on the wall
    if (yW < 7.5 || yW > reach + 1.5) return false;
    const hr = yW > H;
    let ok;
    if (hr) ok = rand() < clamp(0.36 + (f.fld - 70) / 90 - Math.max(0, yW - H - 1.5) / 9 - Math.max(0, fd - 5) / 14, 0.04, 0.6);
    else ok = yW <= reach && pl.fate === 'out';
    if (yW > reach) ok = false;
    f.mode = 'leap'; f.anim = Math.max(0, 0.4 - toWall); f.moving = false; f.vel = 0;
    f.p.x = wx; f.p.z = wz; f.face = Math.atan2(wx, wz); f.tgt = null;
    pl.wall = { tried: true, f, catch: ok, hr };
    this.emit('leap', { n: f.n, hr, ok });
    if (!ok && f === this.chaser) this.chaserLock = this.time + 0.8;
    return false;
  }
  // earliest point on the predicted path this fielder can get to: {t, s}
  intercept(f) {
    const t0 = this.ball.phys.t, S2 = this.pred.samples;
    for (const s of S2) {
      if (s.y > 9.5) continue;
      const rc = s.y < 6.5 ? (f.n >= 7 ? 3 : 4.5) : 2.5;
      const react = f.reactLeft > 0 ? f.reactLeft : 0;
      if (react + Math.max(0, dist(f.p, s) - rc) / f.speed <= s.t - t0 + 0.02) return { t: s.t - t0, s };
    }
    const s = S2[S2.length - 1] || { x: this.ball.p.x, z: this.ball.p.z, t: t0 };
    return { t: Math.max(s.t - t0, dist(f.p, s) / f.speed) + 0.5, s, late: true };
  }
  retarget() {
    if (this.ball.state !== 'air') return;
    const ch = this.chaser; if (!ch) return;
    const ic = this.intercept(ch);
    ch.tgt = { x: ic.s.x, z: ic.s.z };
    const c2 = this.chaser2;
    if (c2) { const i2 = this.intercept(c2); if (i2.late && !ic.late) { c2.job = { hold: true }; c2.tgt = null; this.chaser2 = null; } else c2.tgt = { x: i2.s.x, z: i2.s.z }; }
    // hand the ball to a clearly better-placed fielder (bounces off walls, misplays)
    let best = ch, bt = ic.t;
    for (const f of Object.values(this.F)) {
      if (f === ch || f.n === 2 || f.mode === 'throw') continue;
      if (f.job && f.job.cover && this.runners.some(r => !r.out && r.goal === f.job.cover)) continue;
      const i = this.intercept(f); if (i.t < bt - 0.45) { best = f; bt = i.t; best._ic = i; }
    }
    if (best !== ch) { if (ch.job) ch.job = { hold: true }; ch.tgt = null; this.chaser = best; best.job = { chase: true }; best.tgt = { x: best._ic.s.x, z: best._ic.s.z }; }
  }
  tryCatch(dt) {
    const b = this.ball, pp0 = b.prevP;
    // anyone the ball comes near can field it (not only the assigned chasers)
    const list = Object.values(this.F).filter(f => f.n !== 2 && f.mode !== 'throw' && dist(f.p, b.p) < 14).sort((a, c) => dist(a.p, b.p) - dist(c.p, b.p));
    for (const ch of list) { if (this.ball !== b || b.state !== 'air') break; b.prevP = pp0; this.tryCatchOne(ch); }
    if (this.ball === b) b.prevP = { x: b.p.x, z: b.p.z };
  }
  tryCatchOne(ch) {
    const b = this.ball, pl = this.play; if (!ch) return;
    // closest approach of the ball to the fielder during this frame
    const pp = b.prevP || b.p, sx = b.p.x - pp.x, sz = b.p.z - pp.z, L2 = sx * sx + sz * sz;
    let u = L2 > 0 ? ((ch.p.x - pp.x) * sx + (ch.p.z - pp.z) * sz) / L2 : 1; u = clamp(u, 0, 1);
    const cp = { x: pp.x + sx * u, z: pp.z + sz * u };
    const d = dist(ch.p, cp), y = b.p.y;
    const fate = pl.kind === 'hit' ? pl.fate : null, dd0 = Math.hypot(b.p.x, b.p.z);
    if (fate === 'hit' && !pl.fateDone) {
      if (!b.phys.landed) return;                                   // falls in
      if (ch.n <= 6 && dd0 < 125 && !(pl.ev < 76 && pl.la < 10)) return; // finds a hole through the infield
    }
    const boost = fate === 'out' && !pl.fateDone ? 2.5 : 0;
    const reach = (!b.phys.landed ? (ch.n >= 7 ? 2.8 : 3.2) : (ch.n >= 7 ? 3.6 : 5.6)) + boost;
    if (y > 9.5 || d > reach + 7) return;
    if (!b.phys.landed) {
      if (d <= reach && y <= 8.5) { // routine catch
        const err = 0.006 + (1 - ch.fld / 99) * 0.01;
        if (rand() < err && pl.kind === 'hit') return this.bobble(ch);
        pl.fateDone = true; return this.flyCaught(ch, false);
      }
      if (d <= reach + 4.5 && y <= 5 && !ch.dove) { // dive / leap
        ch.dove = true; ch.mode = 'dive'; ch.anim = 0;
        const pc = clamp(0.42 - (d - reach) / 4.5 * 0.35 + (ch.fld - 60) / 200, 0.05, 0.7);
        if (fate === 'out' || (!fate && rand() < pc)) { this.emit('dive', { n: ch.n }); pl.fateDone = true; return this.flyCaught(ch, true); }
        this.emit('dive_miss', { n: ch.n });
      }
      return;
    }
    // ground ball / rolling / bouncing
    if (d <= reach && y <= 6.5) {
      if (ch.dove && ch.mode === 'dive' && ch.anim < 0.8) return;
      if (ch.n === 1 && Math.hypot(b.phys.v.x, b.phys.v.z) > 110 && rand() < 0.45) { ch.dove = true; return; }
      const hard = Math.hypot(b.phys.v.x, b.phys.v.z) > 75 ? 1.6 : 1;
      const err = (0.008 + (1 - ch.fld / 99) * 0.022) * hard * (ch.n >= 7 ? 0.4 : 1);
      if (rand() < err) return this.bobble(ch);
      pl.fateDone = true;
      this.fielded(ch, fate === 'hit' && ch.n <= 6 ? 1.1 : 0);
    } else if (d <= reach + 5 && !ch.dove && ch.n <= 6 && Math.hypot(b.phys.v.x, b.phys.v.z) > 40 && y < 3) {
      ch.dove = true; ch.mode = 'dive'; ch.anim = 0;
      if (fate === 'out' || (!fate && rand() < 0.5)) { this.emit('dive', { n: ch.n }); pl.fateDone = true; this.fielded(ch, 0.6); }
    }
  }
  bobble(f) {
    this.play.errors++; this.play.error = true;
    const v = this.ball.phys.v; v.x = -v.x * 0.2 + gauss() * 6; v.z = -v.z * 0.2 + gauss() * 6; v.y = 4;
    this.ball.phys.rolling = false; this.ball.phys.landed = this.ball.phys.landed || { x: f.p.x, z: f.p.z, t: 0 };
    this.emit('error', { n: f.n }); f.holdT = 0;
    this.predictBall(); this.retarget();
    this.chaserLock = this.time + 0.6;
  }
  flyCaught(f, dive, extra = {}) {
    const pl = this.play; this.chaser = f; this.chaser2 = null;
    pl.caughtFly = true; pl.fair = true;
    this.markOut(this.runners.find(r => r.isBatter), 'fly');
    f.hasBall = true; this.ball = { state: 'held', holder: f, p: { ...f.p, y: 5 } };
    f.holdT = extra.wall ? 1.25 : dive ? 1.0 : 0.45;
    this.emit('catch', { n: f.n, dive, fly: true, ...extra });
    // runners must tag up: anyone who left early heads back
    for (const r of this.runners) {
      if (r.out || r.isBatter) continue;
      if (r.goal > r.base || r.s > 0) { r.mode = 'return'; r.goal = r.base; }
      r.tagReady = true;
    }
  }
  fielded(f, delay = 0) {
    this.chaser = f; this.chaser2 = null;
    f.hasBall = true; this.ball = { state: 'held', holder: f, p: { ...f.p, y: 3 } };
    f.holdT = 0.32 + delay + (f.n >= 7 ? 0.15 : 0);
    if (this.play.fair == null) this.play.fair = Math.abs(Math.atan2(f.p.x, -f.p.z)) <= 0.7854 && -f.p.z > 0;
    if (this.play.fair === false) return this.foulBall();
    this.play.fieldedBy = this.play.fieldedBy || f.n;
    this.emit('field', { n: f.n });
  }
  // fielder with the ball decides what to do
  decideWithBall(f) {
    const user = this.isUser(this.fieldingSide) && !this.set.autoThrow;
    const pl = this.play;
    if (pl.done) return;
    if (this.forceThrowTo != null) { const b = this.forceThrowTo; this.forceThrowTo = null; return this.throwTo(f, b); }
    if (user && !f.userWaitDone) {
      f.userWait = (f.userWait || 0) + 1 / 60;
      const I = this.in;
      const pick = I.press.b1 ? 1 : I.press.b2 ? 2 : I.press.b3 ? 3 : I.press.b4 ? 4 : I.press.cut ? 'cut' : null;
      if (!this.awaitThrow) { this.awaitThrow = f; this.emit('await_throw', { n: f.n }); }
      if (pick != null) { f.userWaitDone = true; this.awaitThrow = null; this.emit('await_done'); if (pick === 'cut') return this.throwToCut(f); return this.throwTo(f, pick); }
      if (f.userWait < (this.set.diff === 'rookie' ? 1.4 : 1.1) && this.activeRunners().length) return;
      f.userWaitDone = true; this.awaitThrow = null; this.emit('await_done');
    }
    const tgt = this.cpuThrowTarget(f);
    if (tgt == null) { // run the ball in / hold it
      f.holdT = 0.25;
      if (dist(f.p, V(0, -60)) > 140 && !f.runIn) { f.runIn = true; return this.throwToCut(f); }
      return;
    }
    if (tgt === 'step') return; // handled
    this.throwTo(f, tgt);
  }
  activeRunners() { return this.runners.filter(r => !r.out && !r.scored && (r.mode === 'run' || r.mode === 'return' || r.s > 0.02)); }
  // time for a runner to reach base `b`
  runnerETA(r, b) {
    if (r.out || r.scored) return 1e9;
    const pos = r.p, target = baseP(b);
    let d;
    if (r.goal === b || (r.base < b)) { d = 0; let cur = pos; for (let k = Math.max(r.base + (r.s > 0 ? 1 : 0), 0); k <= b; k++) { if (k === 0) continue; const bp = baseP(k); d += dist(cur, bp); cur = bp; } if (r.base + (r.s > 0 ? 1 : 0) > b) d = dist(pos, target); }
    else d = dist(pos, target);
    return d / r.speed + (r.acc < 1 ? 0.3 : 0);
  }
  throwTime(f, b) { const tp = baseP(b), d = dist(f.p, tp); return 0.18 + d / (f.arm * PH.MPH * (d > 170 ? 0.8 : 0.92)); }
  cpuThrowTarget(f) {
    // lead runner we can get
    const cands = [];
    for (const r of this.runners) {
      if (r.out || r.scored) continue;
      const moving = r.mode === 'run' || r.mode === 'return' || r.s > 0.04 || (r.goal !== r.base);
      if (!moving) continue;
      const b = r.mode === 'return' ? r.base : r.goal;
      if (b < 1 || r.at === b) continue;
      const eta = this.runnerETA(r, b);
      const cover = this.coverFor(b);
      const runT = dist(f.p, baseP(b)) / f.speed + 0.05, thT = this.throwTime(f, b) + (cover ? Math.max(0, dist(cover.p, baseP(b)) / cover.speed - this.throwTime(f, b)) : 9);
      const self = runT < thT || dist(f.p, baseP(b)) < 10;
      const tt = Math.min(runT, thT);
      cands.push({ r, b, margin: eta - tt, self });
    }
    if (!cands.length) {
      // nothing on: get the ball back to the infield
      return dist(f.p, V(0, -60)) > 110 ? null : null;
    }
    cands.sort((a, b) => b.b - a.b);
    const good = cands.filter(c => c.margin > 0.05);
    if (good.length) {
      const pick = good[0];
      if (pick.self) { this.stepOnBase(f, pick.b); return 'step'; }
      return pick.b;
    }
    // no out possible: throw ahead of the lead runner to keep him there (if we are not already standing there)
    const lead = cands[0];
    if (dist(f.p, baseP(lead.b)) < 20) return null;
    return Math.min(4, lead.b);
  }
  coverFor(b) {
    let best = null, bd = 1e9;
    for (const f of Object.values(this.F)) { if (f.hasBall) continue; const d = dist(f.p, baseP(b)) - (f.job && f.job.cover === b ? 40 : 0); if (d < bd) { bd = d; best = f; } }
    return best;
  }
  stepOnBase(f, b) { f.tgt = baseP(b); f.job = { cover: b, carrying: true }; f.holdT = 99; this.carry = { f, b }; }
  throwTo(f, b) {
    const recv = this.coverFor(b);
    if (!recv) return;
    recv.tgt = baseP(b); recv.job = { cover: b };
    const bp = baseP(b);
    const spd = f.arm * PH.MPH * (dist(f.p, baseP(b)) > 170 ? 0.8 : 0.94);
    let to = bp, dd = dist(f.p, bp), dur = 0.16 + dd / spd;
    const tr = (recv.reactLeft > 0 ? recv.reactLeft : 0) + dist(recv.p, bp) / recv.speed;
    if (tr > dur + 0.05) { // lead the receiver: he catches it on the way and then touches the base
      const dx = bp.x - recv.p.x, dz = bp.z - recv.p.z, n = Math.hypot(dx, dz) || 1, go = Math.min(n, recv.speed * Math.max(0, dur - 0.15));
      to = { x: recv.p.x + dx / n * go, z: recv.p.z + dz / n * go }; dd = dist(f.p, to); dur = 0.16 + dd / spd;
    }
    f.hasBall = false; f.mode = 'throw'; f.anim = 0; f.userWaitDone = false; f.userWait = 0;
    const errP = 0.003 + (1 - (R(f.pid).fld ?? 50) / 99) * 0.006 + (dd > 200 ? 0.005 : 0);
    const wild = rand() < errP;
    this.ball = { state: 'thrown', p: { ...f.p, y: 6 }, throw: { a: { ...f.p }, b: wild ? { x: to.x + gauss() * 14, z: to.z + gauss() * 14 } : { ...to }, ay: 6, by: wild ? 2 : 4.5, arc: Math.min(28, dd * dd / 9000), t: -0.12, dur, base: b, recv, from: f, wild } };
    this.emit('throw', { from: f.n, base: b });
  }
  throwToCut(f) {
    // to the nearest middle infielder / pitcher area
    const cut = [this.F[6], this.F[4], this.F[1]].sort((a, b) => dist(a.p, f.p) - dist(b.p, f.p))[0];
    const spd = f.arm * PH.MPH * 0.88, dd = dist(f.p, cut.p);
    f.hasBall = false; f.mode = 'throw'; f.anim = 0;
    this.ball = { state: 'thrown', p: { ...f.p, y: 6 }, throw: { a: { ...f.p }, b: { ...cut.p }, ay: 6, by: 4.5, arc: Math.min(26, dd * dd / 9000), t: -0.12, dur: 0.16 + dd / spd, base: null, recv: cut, from: f } };
    cut.tgt = null; this.emit('throw', { from: f.n, base: 'cut' });
  }
  throwArrives() {
    const T = this.ball.throw, recv = T.recv;
    if (!T.wild && dist(recv.p, T.b) <= 12) { recv.p = { x: T.b.x, z: T.b.z }; }
    if (T.wild || dist(recv.p, T.b) > 12) { // ball gets away
      this.play.errors++; this.play.error = true; this.emit('error', { n: T.from.n, throw: true });
      const dir = { x: T.b.x - T.a.x, z: T.b.z - T.a.z }, n = Math.hypot(dir.x, dir.z) || 1;
      const ph = PH.makeBall({ x: T.b.x, y: 2, z: T.b.z }, { x: dir.x / n * 30, y: 2, z: dir.z / n * 30 }, 0, { kD: this.kD });
      ph.landed = { x: T.b.x, z: T.b.z, t: 0 };
      this.ball = { state: 'air', phys: ph, p: ph.p };
      this.predictBall(); this.chaser = recv; recv.job = { chase: true }; this.retarget();
      return;
    }
    recv.hasBall = true; this.ball = { state: 'held', holder: recv, p: { ...recv.p, y: 4 } };
    recv.holdT = 0.25;
    this.emit('catch', { n: recv.n, fly: false });
    if (T.base != null) {
      if (dist(recv.p, baseP(T.base)) <= 7) this.ballAtBase(recv, T.base);
      else this.stepOnBase(recv, T.base);
    }
  }
  // fielder holding the ball on base b: force / tag outs
  ballAtBase(f, b) {
    if (dist(f.p, baseP(b)) > 7) return;
    let outs = 0;
    for (const r of this.runners) {
      if (r.out || r.scored) continue;
      const headed = (r.mode === 'return' ? r.base : r.goal) === b;
      const onIt = r.at === b;
      if (!headed || onIt) continue;
      if (this.play.caughtFly && r.mode === 'return' && r.base === b) { if (dist(r.p, baseP(b)) > 6) { this.markOut(r, 'doubled'); outs++; } continue; }
      if (this.play.kind === 'steal' && this.play.stealSafe) { this.emit('safe', { base: b }); continue; }
      if (r.forcedTo === b || r.isBatter && b === 1 || this.isForced(r, b)) { this.markOut(r, 'force'); outs++; }
      else if (dist(r.p, baseP(b)) > 1.5) { this.markOut(r, 'tag'); outs++; }
    }
    if (outs) { f.holdT = 0.35; this.emit('out_at', { base: b }); }
    if (this.play.kind === 'steal') this.play.done = true;
  }
  isForced(r, b) { return r.forced && b === r.base + 1 && !this.play.caughtFly; }
  markOut(r, how) {
    if (!r || r.out) return;
    r.out = true; r.mode = 'out'; this.play.outs++;
    if (this.play.kind === 'hit' && this.play.fair == null) this.play.fair = true;
    this.emit('out', { pid: r.pid, how, outs: this.st.outs + this.play.outs, base: r.goal, batter: !!r.isBatter, from: r.base });
    // after an out, runners no longer forced if the batter is out at first
    if (r.isBatter) for (const x of this.runners) x.forced = false;
    if (this.st.outs + this.play.outs >= 3) { this.play.done = true; }
  }
  // ---------- runners ----------
  runnerLogic(dt) {
    const pl = this.play, b = this.ball;
    const ballLoose = b.state === 'air' || b.state === 'thrown';
    for (const r of this.runners) {
      if (r.out || r.scored) continue;
      if (r.delay > 0) { r.delay -= dt; continue; }
      // tag-up after a caught fly
      if (r.tagReady && r.at === r.base && r.mode !== 'run') {
        r.tagReady = false;
        const tgt = r.base + 1, eta = this.runnerETA(r, tgt);
        const h = b.state === 'held' ? b.holder : this.chaser;
        const tt = h ? this.throwTime(h, tgt) + (b.state === 'held' ? 0 : 0.6) : 9;
        const outsNow = this.st.outs + pl.outs;
        if (outsNow < 3 && !this.runners.some(x => !x.out && !x.scored && x !== r && x.base === tgt) && eta + (tgt === 4 ? -0.55 : 0.3) < tt) { r.goal = tgt; r.mode = 'run'; this.emit('tag_go', { pid: r.pid }); }
        else r.mode = 'hold';
      }
      // user overrides
      if (this.userBats && this.in.press.goAll && r.mode !== 'run' && r.at === r.goal && r.goal < 4 && !pl.caughtFly) { r.goal = Math.min(4, r.goal + 1); r.mode = 'run'; }
      if (this.userBats && this.in.press.backAll && r.mode === 'run' && !r.isBatter && !r.forcedTo) { r.goal = Math.max(r.base, r.goal - 1); r.mode = 'return'; }
      // fly in the air: half-way runners wait to see it
      if (r.mode === 'half') {
        if (b.state === 'air' && !b.phys.landed) { r.goal = r.base; r.halfS = r.tag ? 0 : pl.la < 20 ? 0.06 : (r.base === 2 ? 0.22 : 0.34); }
        else if (b.state !== 'air' || b.phys.landed) { if (!pl.caughtFly) { r.mode = 'run'; r.goal = r.base + 1; } else { r.mode = 'return'; r.goal = r.base; } }
      }
      // reached a base: decide whether to take another
      if (r.at != null && r.at === r.goal && (r.mode === 'run' || (r.mode === 'hold' && pl.kind === 'hit' && !pl.caughtFly && r.at < 4 && (b.state !== 'held' || dist(b.holder.p, V(0, -60)) > 95)))) {
        if (r.at === 4) { this.score(r); continue; }
        const next = r.at + 1;
        const blocked = this.runners.some(x => x !== r && !x.out && !x.scored && (x.at === next || (x.goal === next && x.at !== next && x.base >= r.at)));
        const lead = this.runners.filter(x => x !== r && !x.out && !x.scored && x.goal >= next);
        let go = false;
        if (!blocked && !lead.some(x => x.goal === next) && pl.kind === 'hit') {
          const eta = this.runnerETA(r, next);
          let def;
          if (b.state === 'held') def = b.holder ? this.throwTime(b.holder, next) + 0.15 : 0;
          else if (b.state === 'thrown') def = b.throw.base === next ? (b.throw.dur - b.throw.t) : (b.throw.dur - b.throw.t) + this.throwTime(b.throw.recv, next) + 0.3;
          else { const ch = this.chaser; const pt = b.p; def = ch ? (dist(ch.p, pt) / ch.speed + 0.35 + 0.18 + dist(pt, baseP(next)) / (ch.arm * PH.MPH * 0.82)) : 3; }
          def += next === 4 ? 0.35 : 0.15; // catcher / fielder still has to apply the tag
          go = eta + (r.isBatter ? (next === 3 ? -0.2 : 0.45) : (this.st.outs + pl.outs === 2 ? -0.6 : next === 3 ? 0.15 : -0.35)) < def && !(pl.caughtFly);
        }
        if (go) { r.goal = next; r.mode = 'run'; this.emit('runner_go', { pid: r.pid, base: next }); }
        else { r.mode = 'hold'; }
      }
      // a runner who stopped can be forced along
      if (r.mode === 'hold' && r.at != null) {
        const behind = this.runners.find(x => x !== r && !x.out && !x.scored && x.goal === r.at && x.at !== r.at && x.mode === 'run');
        if (behind && r.at < 4) { r.goal = r.at + 1; r.mode = 'run'; r.forcedTo = r.goal; }
      }
    }
    // runner caught between bases when the fielder near him holds the ball: tag
    if (b.state === 'held') {
      const f = b.holder;
      for (const r of this.runners) { if (r.out || r.scored || r.at != null) continue; if (dist(f.p, r.p) < 4.5) { this.markOut(r, 'tag'); this.emit('out_at', { base: null }); } }
      // carrying the ball to a base
      if (this.carry && this.carry.f === f && dist(f.p, baseP(this.carry.b)) < 2.5) { const cb = this.carry.b; this.carry = null; f.holdT = 0.2; this.ballAtBase(f, cb); }
    }
  }
  score(r) {
    if (r.scored) return;
    // a run doesn't count if the third out was a force / batter out before reaching first
    r.scored = true; r.mode = 'scored'; this.play.scored.push(r.pid);
    this.emit('run_scores', { pid: r.pid });
  }
  // ---------- movement ----------
  moveActors(dt) {
    for (const f of Object.values(this.F)) {
      if (f.mode === 'throw' || f.mode === 'dive' || f.mode === 'leap') {
        // a dive carries the fielder forward through the air and into a short slide
        if (f.mode === 'dive' && f.anim > 0.08 && f.anim < 0.62) { const sp = 15 * (1 - (f.anim - 0.08) / 0.54); f.p.x += Math.sin(f.face) * sp * dt; f.p.z += Math.cos(f.face) * sp * dt; }
        f.anim += dt * (f.mode === 'dive' ? 1.0 : f.mode === 'leap' ? 1.05 : 2.2); if (f.anim >= 1) { f.mode = 'ready'; f.anim = 0; } continue; }
      const t = f.tgt;
      if (t) {
        const d = dist(f.p, t);
        const pl = this.play, boosted = pl && pl.kind === 'hit' && pl.fate === 'out' && !pl.fateDone && (f === this.chaser || f === this.chaser2);
        const lim = f.speed * dt * (this.phase === 'live' ? (boosted ? 1.3 : 1) : 0.45);
        if (d > 0.3) {
          if (f.reactLeft == null && this.phase === 'live') f.reactLeft = f.react;
          if (f.reactLeft > 0) { f.reactLeft -= dt; continue; }
          const k = Math.min(1, lim / d); f.p.x += (t.x - f.p.x) * k; f.p.z += (t.z - f.p.z) * k; f.face = Math.atan2(t.x - f.p.x, t.z - f.p.z); f.moving = d > 1; f.vel = d > 1 ? lim / dt : 0;
          // the warning track ends at the fence: never run into or through the wall
          if (f.n >= 7 && -f.p.z > 0) { const ph = Math.atan2(f.p.x, -f.p.z); if (Math.abs(ph) < 0.8) { const R = this.park.wallR(ph) - 2.2, dd = Math.hypot(f.p.x, f.p.z); if (dd > R) { f.p.x *= R / dd; f.p.z *= R / dd; if (dist(f.p, t) > 1.5) { f.moving = false; f.vel = 0; } } } }
        } else { f.moving = false; f.vel = 0; }
      } else { f.moving = false; f.vel = 0; }
      if (!f.moving) { const bp = this.ball.p; f.face = Math.atan2(bp.x - f.p.x, bp.z - f.p.z); }
    }
    for (const r of this.runners) {
      if (r.out) { // jog off toward the dugout
        const dg = { x: r.p.x > 0 || this.st.top ? 80 : -80, z: 30 }; const d = dist(r.p, dg); if (d > 1) { r.p.x += (dg.x - r.p.x) / d * 12 * dt; r.p.z += (dg.z - r.p.z) / d * 12 * dt; } r.vel = 12; continue;
      }
      if (r.scored) { const dg = { x: this.st.top ? -60 : 60, z: 25 }; const d = dist(r.p, dg); if (d > 1) { r.p.x += (dg.x - r.p.x) / d * 14 * dt; r.p.z += (dg.z - r.p.z) / d * 14 * dt; } r.vel = 14; continue; }
      if (r.delay > 0) continue;
      // lead-off during the pitch
      if (r.mode === 'lead') {
        const lead = (this.phase === 'windup' || this.phase === 'pitch' || this.phase === 'aim') ? r.lead : 0;
        const from = baseP(r.base), to = baseP(r.base + 1), L = dist(from, to);
        const want = { x: from.x + (to.x - from.x) * lead / L, z: from.z + (to.z - from.z) * lead / L };
        const d = dist(r.p, want), sp = r.jog ? 14 : 6;
        if (d > 0.2) { const k = Math.min(1, sp * dt / d); r.p.x += (want.x - r.p.x) * k; r.p.z += (want.z - r.p.z) * k; r.vel = sp; } else r.vel = 0;
        r.at = d < 2 && lead === 0 ? r.base : null; if (lead > 0) r.at = r.base; // a lead-off still counts as on base (no pickoffs yet)
        continue;
      }
      if (r.mode === 'hold' && r.at != null) { r.vel = 0; continue; }
      // path movement toward goal (forward or back along the bases)
      const goal = r.mode === 'half' ? null : r.goal;
      let tx, tz;
      if (r.mode === 'half') {
        const from = baseP(r.base), to = baseP(r.base + 1), s = r.halfS || 0;
        tx = from.x + (to.x - from.x) * s; tz = from.z + (to.z - from.z) * s;
      } else {
        // next waypoint: the next base in the direction of the goal
        const cur = r.at != null ? r.at : null;
        let wp;
        if (r.mode === 'return' || (goal != null && goal < (r.lastBase ?? r.base))) wp = goal;
        else wp = Math.min(goal, (r.lastBase ?? r.base) + 1);
        if (cur != null && cur === goal) { r.vel = 0; continue; }
        const bp = baseP(wp); tx = bp.x; tz = bp.z;
      }
      r.acc = Math.min(1, r.acc + dt * 1.8);
      const sp = r.speed * (0.45 + 0.55 * r.acc);
      const d = Math.hypot(tx - r.p.x, tz - r.p.z);
      if (d <= sp * dt) {
        r.p.x = tx; r.p.z = tz;
        if (r.mode !== 'half') { const wb = BASES.findIndex((q, i) => i > 0 && Math.abs(q[0] - tx) < 0.01 && Math.abs(q[1] - tz) < 0.01); r.lastBase = wb; r.at = wb; if (wb > r.maxBase || r.maxBase == null) r.maxBase = wb; if (r.isBatter) this.play.maxBase = Math.max(this.play.maxBase, wb); if (wb === 4) { r.at = 4; } }
        r.vel = 0;
      } else { r.p.x += (tx - r.p.x) / d * sp * dt; r.p.z += (tz - r.p.z) / d * sp * dt; r.at = null; r.vel = sp; }
      r.face = Math.atan2(tx - r.p.x, tz - r.p.z);
      if (r.at === 4 && r.mode === 'run' && r.goal === 4) this.score(r);
    }
  }
  // ---------- end of play ----------
  checkPlayEnd() {
    const pl = this.play; if (!pl || pl.ended) return;
    const b = this.ball;
    if (this.st.outs + pl.outs >= 3) { if (!pl.thirdT) pl.thirdT = this.time; if (this.time - pl.thirdT > 0.6) return this.resolvePlay(); return; }
    const moving = this.runners.some(r => !r.out && !r.scored && (r.at == null || r.at !== r.goal) && r.mode !== 'hold');
    const held = b.state === 'held';
    const inInf = held && dist(b.holder.p, V(0, -60)) < 110;
    if (pl.kind === 'steal' && (pl.done || (held && !moving))) { if (!pl.endT) pl.endT = this.time; if (this.time - pl.endT > 0.5) return this.resolvePlay(); return; }
    if (held && !moving) {
      if (!pl.stillT) pl.stillT = this.time;
      if (this.time - pl.stillT > (inInf ? 0.55 : 1.4)) return this.resolvePlay();
    } else pl.stillT = null;
    if (this.pt > 25) this.resolvePlay();
  }
  foulBall() {
    const pl = this.play; pl.ended = true; pl.foul = true;
    this.runners = this.runners.filter(r => !r.isBatter);
    for (const r of this.runners) { r.mode = 'lead'; r.goal = r.base; r.out = false; r.steal = false; r.running = false; r.tagReady = false; r.at = r.base; }
    if (this.strikes < 2) this.strikes++;
    this.emit('foul', { balls: this.balls, strikes: this.strikes });
    this.phase = 'post_pitch'; this.pt = 0; this.postWait = 1.6; this.pendingCall = 'foul';
    this.lastPitch = null;
  }
  homeRun() {
    const pl = this.play; pl.ended = true; pl.hr = true;
    const b = this.ball.phys, d = Math.round(Math.hypot(b.p.x, b.p.z) + this.estRemaining(b));
    this.emit('home_run', { dist: d, ev: pl.ev, la: pl.la, runners: this.runners.filter(r => !r.isBatter).length });
    for (const r of this.runners) { r.mode = 'run'; r.goal = 4; r.delay = 0; r.speed = 15; r.trot = true; }
    this.trot = true;
    const adv = { runners: [0, 1, 2].map(i => this.st.bases[i] ? 4 : null), batterTo: 4 };
    this.pendingRes = { res: 'HR', adv }; this.phase = 'dead'; this.pt = 0; this.deadWait = 6.5;
  }
  estRemaining(b) { const v = b.v; const vh = Math.hypot(v.x, v.z); return b.p.y > 0 ? vh * Math.max(0, (v.y + Math.sqrt(v.y * v.y + 2 * 32 * b.p.y)) / 32) * 0.75 : 0; }
  groundRuleDouble() {
    const pl = this.play; pl.ended = true;
    this.emit('gr_double');
    const adv = { runners: [0, 1, 2].map(i => this.st.bases[i] ? Math.min(4, i + 1 + 2) : null), batterTo: 2 };
    this.pendingRes = { res: '2B', adv }; this.phase = 'dead'; this.pt = 0; this.deadWait = 2.2;
  }
  resolvePlay() {
    const pl = this.play; if (pl.ended) return; pl.ended = true;
    const st = this.st, br = this.runners.find(r => r.isBatter);
    // destination of every runner who started on base
    const runners = [null, null, null];
    for (let i = 0; i < 3; i++) {
      const pid = st.bases[i]; if (!pid) continue;
      const r = this.runners.find(x => x.pid === pid && !x.isBatter);
      if (!r) { runners[i] = i + 1; continue; }
      runners[i] = r.out ? 'out' : r.scored ? 4 : (r.at ?? r.lastBase ?? r.goal ?? i + 1);
      if (typeof runners[i] === 'number') runners[i] = Math.max(i + 1, runners[i]);
    }
    if (pl.kind === 'steal') {
      const r = pl.steal, i = r.base - 1;
      st.bases[i] === r.pid && S.recordSteal(st, i, !r.out);
      this.emit('steal_result', { pid: r.pid, ok: !r.out });
      this.phase = 'post_pitch'; this.pt = 0; this.postWait = 0.8;
      // continue the at-bat (unless the count already ended it)
      this.pendingCall = this.pendingCall || 'none';
      this.syncAfterSteal = true;
      return;
    }
    let batTo = br.out ? 'out' : br.scored ? 4 : (br.at ?? br.lastBase ?? 1);
    if (batTo === 0) batTo = 1;
    let res;
    const nOut = pl.outs, othersOut = this.runners.some(r => !r.isBatter && r.out);
    if (br.out && pl.caughtFly) res = (pl.scored.length && st.outs + nOut < 3 ? 'SF' : pl.la < 18 ? 'OUT_LD' : 'OUT_FB');
    else if (br.out) res = nOut >= 2 ? 'DP' : 'OUT_GB';
    else if (othersOut) res = 'FC';
    else if (pl.error) res = 'E';
    else res = ['1B', '1B', '2B', '3B', 'HR'][batTo] || '1B';
    this.pendingRes = { res, adv: { runners, batterTo: batTo } };
    this.emit('play_over', { res, outs: nOut });
    this.phase = 'dead'; this.pt = 0; this.deadWait = 1.4;
  }
  finishPA(res) {
    // walks / strikeouts / HBP end the PA at the plate
    this.pendingRes = { res, adv: null };
    this.emit('pa_result', { res });
    this.phase = 'dead'; this.pt = 0; this.deadWait = res === 'K' ? 1.5 : 1.2;
    if (res === 'BB' || res === 'HBP') { // forced runners jog up
      const occ = this.st.bases.slice();
      const br = this.mkRunner(this.bat.pid, 0); br.goal = 1; br.mode = 'run'; br.speed = 13; br.isBatter = true; this.runners.unshift(br);
      if (occ[0]) { const r = this.runners.find(x => x.pid === occ[0]); r.goal = 2; r.mode = 'run'; r.speed = 13; if (occ[1]) { const r2 = this.runners.find(x => x.pid === occ[1]); r2.goal = 3; r2.mode = 'run'; r2.speed = 13; if (occ[2]) { const r3 = this.runners.find(x => x.pid === occ[2]); r3.goal = 4; r3.mode = 'run'; r3.speed = 13; } } }
    }
  }
  endPA() {
    const st = this.st;
    if (this.syncAfterSteal) { this.syncAfterSteal = false; }
    const pr = this.pendingRes; this.pendingRes = null;
    if (pr) {
      const before = st.score.slice(), outsBefore = st.outs, half = st.top, inn = st.inn;
      const r = S.recordPA(st, pr.res, pr.adv, { pitches: this.pitchesPA || 1 });
      this.emit('recorded', { res: pr.res, runs: r.runs, outs: r.outs, scoreBefore: before, score: st.score.slice(), halfOver: half !== st.top || inn !== st.inn, done: st.done });
    }
    this.trot = false;
    this.play = null; this.bat.swing = null; this.chaser = null; this.chaser2 = null; this.carry = null; this.awaitThrow = null;
    this.runners = this.runners.filter(r => !r.out && !r.scored && !r.isBatter);
    this.phase = 'pa_start'; this.pt = 0;
  }
  // called by the view after the half-inning transition is shown
  startNextHalf() { this.setupHalf(); this.runners = []; this.phase = 'pa_start'; this.pt = 0; }
  // user pause-menu actions
  userPitchingChange(pid) { const fs = this.fieldingSide; S.changePitcher(this.st, fs, pid); this.F[1] = this.mkFielder(1, pid); this.F[1].hasBall = true; this.emit('pitching_change', { pid, side: fs }); }
}
