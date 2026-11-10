// MLB Grand Slam 27 - fast plate-appearance game sim (no 3D) + shared game-state logic.
// The live 3D game uses newState / recordPA / recordSteal / cpuPitchingChange too, so everything here is
// plain serializable state (JSON-safe) driven by a seeded RNG stored in state.rs.
//
// side  = { team, lineup:[{pid,pos}]x9, sp, bullpen:[pid], closer, bench:[pid] }
// state = { inn, top, outs, bases:[pid|null x3], score:[a,h], idx:[a,h] (next batter index), cur:[awayP, homeP],
//           pc:{pid:pitches}, sides:[away,home], box, innings, done, park, ghost, rs (rng seed), resp/ue (per base:
//           pitcher responsible / unearned flag), meta (W/L/SV bookkeeping) }
// recordPA(state, result, adv?, extra?)  result: K BB HBP 1B 2B 3B HR OUT_GB OUT_FB OUT_LD DP SF E FC
//   adv (optional, from the 3D play) = { runners:[to1B, to2B, to3B], batterTo }
//     runners[i] = where the runner who started on base i+1 ended: 1|2|3 base, 4 = scored, 'out', null = no runner/stayed
//     batterTo   = 0|'out' (out) or 1..4
//   extra (optional) = { pitches } real pitch count of the PA (else estimated)
import { player, PARKS, DEPTH } from '../db.js';

export const RESULTS = ['K', 'BB', 'HBP', '1B', '2B', '3B', 'HR', 'OUT_GB', 'OUT_FB', 'OUT_LD', 'DP', 'SF', 'E', 'FC'];
const HITS = { '1B': 1, '2B': 2, '3B': 3, HR: 4 };

// League environment + rating sensitivities (tuned by .openclaw/tmp/gs/season/calib.mjs)
export const TUNE = {
  k: 0.212, bb: 0.081, hbp: 0.011, hrc: 0.041, bab: 0.287, d2: 0.22, t3: 0.015, err: 0.024,
  kCon: 0.22, kEye: 0.06, kPow: 0.10, bbEye: 0.24, bbPow: 0.08, hrPow: 0.27, babCon: 0.014, babSpd: 0.006,
  pkStf: 0.13, pkVel: 0.05, pbbCtl: 0.20, phrStf: 0.12, phrCtl: 0.08, pbabStf: 0.006,
  real: 0.45,        // weight of the real 2026 line (ln26) blended into the rating-based rates, scaled by sample size
  dp: 0.46, sf: 0.62, fc: 0.10, sbTry: 0.08, sbOk: 0.72,
};

// ---------------- rng ----------------
export function rnd(st) {
  let t = (st.rs = (st.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------- ratings -> rates ----------------
let NORM = null;
const BP = new Map(), PP = new Map(), PFC = new Map();
export function clearCache() { NORM = null; BP.clear(); PP.clear(); PFC.clear(); }
function norms() {
  if (NORM) return NORM;
  const hit = [], pit = [];
  for (const d of Object.values(DEPTH)) {
    for (const [pid] of d.lineup) { const p = player(pid); if (p) hit.push(p); }
    for (const pid of [...d.rotation, ...d.bullpen, d.closer]) { const p = player(pid); if (p) pit.push(p); }
  }
  const ms = (a, k) => {
    const v = a.map(p => p[k]).filter(x => x != null); if (!v.length) return { m: 60, s: 10 };
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    return { m, s: Math.max(3, Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length)) };
  };
  NORM = {}; for (const k of ['con', 'pow', 'eye', 'spd', 'fld', 'arm']) NORM[k] = ms(hit, k);
  for (const k of ['vel', 'ctl', 'stf', 'sta']) NORM[k] = ms(pit, k);
  return NORM;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function z(p, k, dflt = -1.5) { const n = norms()[k], v = p && p[k]; return v == null ? dflt : clamp((v - n.m) / n.s, -3.5, 3.8); }
// batter profile (multipliers vs league)
export function bprof(pid) {
  let c = BP.get(pid); if (c) return c;
  const p = player(pid), T = TUNE, pit = p && (p.pos === 'SP' || p.pos === 'RP' || p.pos === 'CL') && p.con == null;
  const zc = pit ? -3 : z(p, 'con'), zp = pit ? -3 : z(p, 'pow'), ze = pit ? -2 : z(p, 'eye'), zs = z(p, 'spd', -0.5);
  c = {
    k: Math.exp(-T.kCon * zc - T.kEye * ze + T.kPow * zp),
    bb: Math.exp(T.bbEye * ze + T.bbPow * zp - 0.04 * zc),
    hr: Math.exp(T.hrPow * zp + 0.05 * zc),
    bab: T.babCon * zc + T.babSpd * zs,
    d2: Math.exp(0.18 * zp + 0.06 * zs), t3: Math.exp(0.7 * zs), fb: clamp(0.36 + 0.04 * zp, 0.25, 0.5),
    zs, bats: p?.b || 'R',
  };
  // Blend in the real 2026 line so stars post star numbers (ratings still drive most of it)
  const l = p && p.ln26 && !pit && p.ln26.length === 7 ? p.ln26 : null;
  if (l && l[1] > 60) {
    const w = T.real * l[1] / (l[1] + 350), hrpa = l[3] / l[1];
    const ratHR = T.hrc * (1 - T.k * c.k - T.bb * c.bb) * c.hr; // rating HR/PA estimate
    const realHR = Math.max(0.004, hrpa);
    c.hr *= Math.exp(w * Math.log(realHR / Math.max(0.004, ratHR)));
    const kk = T.k * c.k, bb = T.bb * c.bb, con = 1 - kk - bb - T.hbp, hrp = T.hrc * c.hr, bp = T.bab + c.bab;
    const ratAvg = con * (hrp + (1 - hrp) * bp) / (1 - bb - T.hbp), realAvg = clamp(l[2], 0.17, 0.36);
    c.bab += w * (realAvg - ratAvg) * (1 - bb) / Math.max(0.4, con);
  }
  BP.set(pid, c); return c;
}
export function pprof(pid) {
  let c = PP.get(pid); if (c) return c;
  const p = player(pid), T = TUNE, isP = p && (p.pos === 'SP' || p.pos === 'RP' || p.pos === 'CL');
  const pos = p && p.stf == null && !isP; // position player pitching (blowouts only)
  const zs = pos ? -3.2 : Math.max(-2.2, z(p, 'stf')), zv = pos ? -3 : Math.max(-2.2, z(p, 'vel')), zt = pos ? -1 : Math.max(-2.2, z(p, 'ctl'));
  const sta = p?.sta ?? 30;
  const sp = p?.pos === 'SP' || (p?.ln26 && p.ln26.length === 9 && p.ln26[1] >= 8 && p.ln26[1] / p.ln26[0] > 0.6);
  c = {
    k: Math.exp(T.pkStf * zs + T.pkVel * zv + 0.04 * zt),
    bb: Math.exp(-T.pbbCtl * zt + 0.04 * zs),
    hr: Math.exp(-T.phrStf * zs - T.phrCtl * zt),
    bab: -T.pbabStf * zs,
    limit: sp ? 58 + 0.46 * sta : 16 + 0.36 * sta,
    sp, throws: p?.th || 'R', ovr: p?.ovr || 50,
  };
  const l = p && p.ln26 && p.ln26.length === 9 ? p.ln26 : null;
  if (l && l[5] > 15 && !pos) {
    const ip = l[5], w = T.real * ip / (ip + 70);
    const k9 = l[6] / ip * 9, era = clamp(l[4], 1.2, 8);
    c.k *= Math.exp(w * Math.log(clamp(k9 / 8.8, 0.5, 1.8) / c.k));
    const q = Math.exp(w * 0.55 * Math.log(era / 4.1)); // run prevention: spread over HR + BABIP
    c.hr *= q; c.bab += (q - 1) * 0.03;
  }
  PP.set(pid, c); return c;
}
// Park factors from real dimensions/altitude (normalized so the league average park = 1)
function rawPark(pk, bats) {
  if (!pk) return { hr: 1, bab: 1, d2: 1, t3: 1 };
  const d = pk.dims || [330, 375, 385, 400, 385, 375, 330], w = pk.walls || [8, 8, 8, 8, 8, 8, 8];
  // pull side carries the most weight: RHB -> LF, LHB -> RF
  const wts = bats === 'L' ? [0.05, 0.08, 0.12, 0.18, 0.2, 0.22, 0.15] : bats === 'R' ? [0.15, 0.22, 0.2, 0.18, 0.12, 0.08, 0.05] : [0.1, 0.15, 0.16, 0.18, 0.16, 0.15, 0.1];
  let dist = 0, wall = 0; for (let i = 0; i < 7; i++) { dist += d[i] * wts[i]; wall += Math.min(w[i], 40) * wts[i]; }
  const alt = (pk.alt || 0) / 5280;
  return { hr: Math.exp(-0.022 * (dist - 370) - 0.012 * (wall - 9)) * (1 + 0.24 * alt), bab: 1 + 0.07 * alt + 0.0006 * (d[3] - 400), d2: 1 + 0.12 * alt + 0.004 * (wall - 9), t3: Math.exp(0.025 * (d[3] - 402) + 0.4 * alt) };
}
export function parkF(id, bats = 'S') {
  const key = id + bats; let c = PFC.get(key); if (c) return c;
  const all = Object.values(PARKS).map(pk => rawPark(pk, bats)), n = all.length || 1;
  const avg = k => all.reduce((s, x) => s + x[k], 0) / n, r = rawPark(PARKS[id], bats);
  c = { hr: r.hr / avg('hr'), bab: r.bab / avg('bab'), d2: r.d2 / avg('d2'), t3: r.t3 / avg('t3') };
  PFC.set(key, c); return c;
}

// ---------------- state ----------------
const blankBat = () => ({ ab: 0, r: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0, cs: 0, hbp: 0, sf: 0 });
const blankPit = () => ({ outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, bf: 0, pc: 0 });
export function newState(away, home, opts = {}) {
  const innings = opts.innings || 9;
  const box = {
    away: away.team, home: home.team, park: opts.park || home.team, score: [0, 0], line: [[0, null]], hits: [0, 0], errors: [0, 0],
    bat: {}, pit: {}, order: [away.lineup.map(x => x.pid), home.lineup.map(x => x.pid)], pitchers: [[away.sp], [home.sp]],
    dec: { w: null, l: null, sv: null }, pog: null, final: false, innings, log: [],
  };
  for (const s of [away, home]) for (const x of s.lineup) box.bat[x.pid] = blankBat();
  box.pit[away.sp] = blankPit(); box.pit[home.sp] = blankPit();
  return {
    inn: 1, top: true, outs: 0, bases: [null, null, null], score: [0, 0], idx: [0, 0], cur: [away.sp, home.sp],
    pc: { [away.sp]: 0, [home.sp]: 0 }, sides: [away, home], box, innings, done: false,
    park: box.park, ghost: opts.ghost !== false, rs: (opts.seed ?? (Math.random() * 2 ** 31)) | 0,
    resp: [null, null, null], ue: [0, 0, 0], tired: opts.tired || [], hrBase: opts.hrBase || {},
    meta: { lead: 0, w: null, l: null, entry: { [away.sp]: 0, [home.sp]: 0 } },
  };
}
export const batterUp = st => st.sides[st.top ? 0 : 1].lineup[st.idx[st.top ? 0 : 1] % 9];
export const pitcherUp = st => st.cur[st.top ? 1 : 0];
export function fatigue(st, side) { const pid = st.cur[side]; return clamp(((st.pc[pid] || 0) - 0.8 * pprof(pid).limit) / (0.45 * pprof(pid).limit), 0, 1.3); }
export function pitcherTired(st, side) { return fatigue(st, side) >= 0.55; }
export function changePitcher(st, side, pid) {
  if (!pid || st.cur[side] === pid) return;
  st.cur[side] = pid; st.box.pitchers[side].push(pid);
  if (!st.box.pit[pid]) st.box.pit[pid] = blankPit();
  if (st.pc[pid] == null) st.pc[pid] = 0;
  st.meta.entry[pid] = st.score[side] - st.score[1 - side];
}
export function bullpenLeft(st, side) {
  const s = st.sides[side], used = st.box.pitchers[side];
  return s.bullpen.filter(x => x != null && !used.includes(x) && !st.tired.includes(x));
}

// CPU manager: decides (and makes) a pitching change for `side` (0 away, 1 home). Returns the new pid or null.
export function cpuPitchingChange(st, side) {
  if (st.done || (st.top ? 1 : 0) !== side) return null;
  const pid = st.cur[side], P = pprof(pid), pc = st.pc[pid] || 0, ln = st.box.pit[pid];
  const lead = st.score[side] - st.score[1 - side], inn = st.inn, last = st.innings, fresh = st.outs === 0 && !st.bases[0] && !st.bases[1] && !st.bases[2];
  const starter = st.box.pitchers[side][0] === pid, closer = st.sides[side].closer;
  const avail = bullpenLeft(st, side); if (!avail.length) return null;
  const save = lead >= 1 && lead <= 3, late = inn >= last;
  let pull = false;
  if (starter) {
    if (pc >= P.limit + 10 || (fresh && pc >= P.limit - 4)) pull = true;
    else if (ln.r >= 7 || (ln.r >= 5 && inn <= 5) || (ln.r >= 4 && inn <= 3 && st.outs < 2)) pull = true;
    else if (fresh && late && save && avail.includes(closer) && ln.r > 0) pull = true;
    else if (fresh && inn >= last - 1 && pc >= P.limit - 18 && Math.abs(lead) <= 3) pull = true;
    else if (fatigue(st, side) > 0.9 && st.bases.some(Boolean)) pull = true;
  } else {
    const outs = ln.outs, mop = Math.abs(lead) >= 5;
    if (pid === closer) pull = pc >= P.limit + 12 || ln.r >= 4;
    else if (fresh && outs >= (mop ? 6 : 3)) pull = true;
    else if (pc >= P.limit + 8 || (st.meta.entry[pid] > 0 && lead <= 0 && st.bases.some(Boolean) && ln.r >= 2)) pull = true;
    if (!pull && fresh && late && save && avail.includes(closer)) pull = true;
  }
  if (!pull) return null;
  const nonCl = avail.filter(x => x !== closer), best = a => a.slice().sort((x, y) => pprof(y).ovr - pprof(x).ovr);
  let pick;
  if (late && lead <= 3 && (lead >= 1 || (lead === 0 && side === 1)) && avail.includes(closer)) pick = closer;
  else if (!nonCl.length) pick = avail[0];
  else if (inn >= last - 2 && lead >= -1 && lead <= 3) pick = best(nonCl)[Math.min(nonCl.length - 1, inn >= last - 1 ? 0 : 1)];
  else if (Math.abs(lead) >= 5) pick = best(nonCl)[nonCl.length - 1];
  else { const b = best(nonCl); pick = b[Math.min(b.length - 1, 1 + (rnd(st) * (b.length - 1) | 0))]; }
  changePitcher(st, side, pick);
  return pick;
}

// ---------------- plate appearance ----------------
const lastName = pid => player(pid)?.ln || '?';
// Roll a PA outcome for the current matchup (CPU vs CPU)
export function rollPA(st) {
  const bt = st.top ? 0 : 1, ft = 1 - bt, T = TUNE;
  const bpid = batterUp(st).pid, ppid = st.cur[ft];
  const B = bprof(bpid), P = pprof(ppid), f = fatigue(st, ft);
  const bats = B.bats === 'S' ? (P.throws === 'L' ? 'R' : 'L') : B.bats, same = bats === P.throws;
  const pf = parkF(st.park, bats);
  const k = T.k * B.k * P.k * (same ? 1.07 : 0.96) * (1 - 0.15 * f);
  const bb = T.bb * B.bb * P.bb * (same ? 0.95 : 1.03) * (1 + 0.35 * f);
  let r = rnd(st);
  if (r < k) return 'K'; r -= k;
  if (r < bb) return 'BB'; r -= bb;
  if (r < T.hbp) return 'HBP';
  r = rnd(st);
  const hr = T.hrc * B.hr * P.hr * pf.hr * (same ? 0.9 : 1.06) * (1 + 0.35 * f);
  if (r < hr) return 'HR';
  const def = st.defZ ? st.defZ[ft] : 0;
  const bab = (T.bab + B.bab + P.bab - 0.007 * def + (same ? -0.006 : 0.004) + 0.012 * f) * pf.bab;
  r = rnd(st);
  if (r < bab) {
    r = rnd(st);
    const t3 = T.t3 * B.t3 * pf.t3, d2 = T.d2 * B.d2 * pf.d2;
    return r < t3 ? '3B' : r < t3 + d2 ? '2B' : '1B';
  }
  if (rnd(st) < T.err * Math.exp(-0.35 * def)) return 'E';
  r = rnd(st);
  const out = r < B.fb ? 'OUT_FB' : r < B.fb + 0.17 ? 'OUT_LD' : 'OUT_GB';
  const outs = st.outs, b = st.bases;
  if (out === 'OUT_GB' && outs < 2 && b[0]) {
    const zs = B.zs;
    if (rnd(st) < T.dp * Math.exp(-0.25 * zs)) return 'DP';
    if (rnd(st) < T.fc) return 'FC';
  }
  if (out === 'OUT_FB' && outs < 2 && b[2] && rnd(st) < T.sf) return 'SF';
  return out;
}
function estPitches(st, res) {
  const r = rnd(st);
  switch (res) {
    case 'K': return 3 + (r * 4.2 | 0);
    case 'BB': return 4 + (r * 3.6 | 0);
    case 'HBP': return 1 + (r * 4 | 0);
    default: return 1 + (r * 5.3 | 0);
  }
}
// Default runner movement for a result. Returns {to:[to for runner on 1B,2B,3B], bat}
function defaultAdv(st, res) {
  const b = st.bases, spd = i => b[i] ? bprof(b[i]).zs : 0, to = [null, null, null];
  const out2 = st.outs === 2;
  const force = () => { // walk-style forced advance
    if (b[0]) { to[0] = 2; if (b[1]) { to[1] = 3; if (b[2]) to[2] = 4; } }
  };
  switch (res) {
    case 'BB': case 'HBP': force(); return { to, bat: 1 };
    case 'HR': for (let i = 0; i < 3; i++) if (b[i]) to[i] = 4; return { to, bat: 4 };
    case '3B': for (let i = 0; i < 3; i++) if (b[i]) to[i] = 4; return { to, bat: 3 };
    case '2B':
      if (b[2]) to[2] = 4; if (b[1]) to[1] = 4;
      if (b[0]) to[0] = rnd(st) < (out2 ? 0.62 : 0.42) * Math.exp(0.25 * spd(0)) ? 4 : 3;
      return { to, bat: 2 };
    case '1B': case 'E': {
      if (b[2]) to[2] = 4;
      if (b[1]) to[1] = res === 'E' ? 3 : rnd(st) < (out2 ? 0.82 : 0.6) * Math.exp(0.15 * spd(1)) ? 4 : 3;
      if (b[0]) to[0] = (to[1] === 3 || res === 'E') ? 2 : rnd(st) < 0.28 * Math.exp(0.3 * spd(0)) ? 3 : 2;
      return { to, bat: 1 };
    }
    case 'K': case 'OUT_LD': return { to, bat: 0 };
    case 'OUT_FB':
      if (!out2 && b[1] && !b[2] && rnd(st) < 0.3) to[1] = 3;
      return { to, bat: 0 };
    case 'SF':
      if (b[2]) to[2] = 4; if (b[1] && rnd(st) < 0.25) to[1] = 3;
      return { to, bat: 0 };
    case 'OUT_GB':
      if (!out2) {
        if (b[0]) to[0] = 2;
        if (b[1] && (b[0] || rnd(st) < 0.55)) to[1] = 3;
        if (b[2]) { if ((b[0] && b[1]) || rnd(st) < 0.5) to[2] = 4; else if (to[1] === 3) to[1] = null; }
      }
      return { to, bat: 0 };
    case 'DP':
      if (b[0]) to[0] = 'out'; else { const i = b[1] ? 1 : b[2] ? 2 : -1; if (i >= 0) to[i] = 'out'; }
      if (st.outs === 0 && b[0]) { if (b[2]) to[2] = 4; if (b[1]) to[1] = 3; }
      return { to, bat: 0 };
    case 'FC': { // lead forced runner out, batter safe at first
      let lead = -1; for (let i = 0; i < 3 && b[i]; i++) lead = i;
      if (lead >= 0) { for (let i = 0; i < lead; i++) to[i] = i + 2; to[lead] = 'out'; }
      else { const i = b[2] ? 2 : b[1] ? 1 : -1; if (i >= 0) to[i] = 'out'; }
      return { to, bat: 1 };
    }
  }
  return { to, bat: 0 };
}

function halfStart(st) {
  const bt = st.top ? 0 : 1;
  if (st.top) st.box.line.push([0, null]); else st.box.line[st.inn - 1][1] = 0;
  st.bases = [null, null, null]; st.resp = [null, null, null]; st.ue = [0, 0, 0]; st.outs = 0;
  if (st.ghost && st.inn > st.innings) { // extra-inning runner on 2nd: the hitter before the leadoff man
    const lu = st.sides[bt].lineup, pid = lu[(st.idx[bt] + 8) % 9].pid;
    st.bases[1] = pid; st.resp[1] = st.cur[1 - bt]; st.ue[1] = 1;
  }
}
function endHalf(st) {
  const sc = st.score;
  if (st.top) {
    if (st.inn >= st.innings && sc[1] > sc[0]) return finish(st);
    st.top = false;
  } else {
    if (st.inn >= st.innings && sc[0] !== sc[1]) return finish(st);
    st.top = true; st.inn++;
  }
  if (st.inn > 30) return finish(st); // safety valve
  halfStart(st);
}
function scoreRun(st, i, runner, batter, rbiOk) {
  const bt = st.top ? 0 : 1, ft = 1 - bt, box = st.box;
  st.score[bt]++; box.score[bt]++; box.line[st.inn - 1][bt]++;
  box.bat[runner] && box.bat[runner].r++;
  const rp = (i >= 0 ? st.resp[i] : st.cur[ft]) || st.cur[ft], ue = i >= 0 ? st.ue[i] : 0;
  const pl = box.pit[rp] || (box.pit[rp] = blankPit()); pl.r++; if (!ue) pl.er++;
  if (rbiOk) box.bat[batter].rbi++;
  // pitcher of record bookkeeping
  const m = st.meta, lead = Math.sign(st.score[1] - st.score[0]);
  if (lead !== m.lead) {
    if (lead !== 0) { const win = lead > 0 ? 1 : 0; m.w = st.cur[win]; m.l = rp; m.wside = win; }
    else { m.w = m.l = null; }
    m.lead = lead;
  }
}
// Apply a plate appearance result. Returns { runs, outs } for the play.
export function recordPA(st, res, adv = null, extra = {}) {
  if (st.done) return { runs: 0, outs: 0 };
  const bt = st.top ? 0 : 1, ft = 1 - bt, box = st.box;
  const bpid = batterUp(st).pid, ppid = st.cur[ft];
  const bs = box.bat[bpid] || (box.bat[bpid] = blankBat()), ps = box.pit[ppid] || (box.pit[ppid] = blankPit());
  const pitches = extra.pitches ?? estPitches(st, res);
  st.pc[ppid] = (st.pc[ppid] || 0) + pitches; ps.pc += pitches; ps.bf++;
  let mv;
  if (adv) {
    const to = [0, 1, 2].map(i => st.bases[i] ? (adv.runners?.[i] ?? i + 1) : null);
    let bat = adv.batterTo; if (bat === 'out') bat = 0; if (bat == null) bat = HITS[res] || (['BB', 'HBP', 'E', 'FC'].includes(res) ? 1 : 0);
    mv = { to, bat };
  } else mv = defaultAdv(st, res);
  // batter line
  const hit = HITS[res] || 0;
  if (res !== 'BB' && res !== 'HBP' && res !== 'SF') bs.ab++;
  if (hit) { bs.h++; ps.h++; box.hits[bt]++; if (hit === 2) bs.d++; else if (hit === 3) bs.t++; else if (hit === 4) { bs.hr++; ps.hr++; } }
  if (res === 'K') { bs.so++; ps.so++; } else if (res === 'BB') { bs.bb++; ps.bb++; } else if (res === 'HBP') bs.hbp++; else if (res === 'SF') bs.sf++;
  if (res === 'E') box.errors[ft]++;
  // outs on the play
  let outs = mv.bat === 0 ? 1 : 0;
  for (let i = 0; i < 3; i++) if (st.bases[i] && mv.to[i] === 'out') outs++;
  const endsInning = st.outs + outs >= 3, forceEnd = endsInning && (mv.bat === 0 || res === 'FC' || res === 'DP');
  // move runners (lead runner first) + score
  const nb = [null, null, null], nr = [null, null, null], nu = [0, 0, 0];
  let runs = 0; const scorers = [];
  const walkoffPossible = !st.top && st.inn >= st.innings;
  const rbiOk = !(res === 'E' || res === 'DP');
  for (let i = 2; i >= 0; i--) {
    const pid = st.bases[i]; if (!pid) continue;
    const t = mv.to[i];
    if (t === 'out') continue;
    if (t === 4) { if (!forceEnd) scorers.push(i); continue; }
    const dest = (t == null ? i + 1 : t) - 1;
    nb[dest] = pid; nr[dest] = st.resp[i]; nu[dest] = st.ue[i];
  }
  if (mv.bat === 4 && !forceEnd) scorers.push(-1);
  else if (mv.bat > 0 && mv.bat < 4) { nb[mv.bat - 1] = bpid; nr[mv.bat - 1] = ppid; nu[mv.bat - 1] = res === 'E' ? 1 : 0; }
  for (const i of scorers) {
    if (walkoffPossible && res !== 'HR' && st.score[1] > st.score[0]) break; // walk-off: only the winning run counts
    scoreRun(st, i, i < 0 ? bpid : st.bases[i], bpid, rbiOk); runs++;
  }
  ps.outs += Math.min(outs, 3 - st.outs);
  st.bases = nb; st.resp = nr; st.ue = nu;
  st.outs = Math.min(3, st.outs + outs);
  st.idx[bt]++;
  if (runs && st.log !== false) {
    const half = (st.top ? 'T' : 'B') + st.inn, n = lastName(bpid);
    let s;
    if (res === 'HR') { const tot = (st.hrBase[bpid] || 0) + bs.hr; s = `${half}: ${n} homers (${tot})${runs > 1 ? ', ' + runs + ' RBI' : ''}${runs === 4 ? ' - GRAND SLAM' : ''}`; }
    else s = `${half}: ${n} ${VERB[res] || 'drives one in'}${rbiOk ? ', ' + runs + (runs > 1 ? ' RBI' : ' RBI') : ', ' + runs + ' scores'}`;
    box.log.push(s);
  }
  if (walkoffPossible && st.score[1] > st.score[0]) return finish(st), { runs, outs };
  if (st.outs >= 3) endHalf(st);
  return { runs, outs };
}
const VERB = { '1B': 'singles', '2B': 'doubles', '3B': 'triples', BB: 'walks', HBP: 'is hit by a pitch', SF: 'hits a sac fly', OUT_GB: 'grounds out', OUT_FB: 'flies out', OUT_LD: 'lines out', E: 'reaches on an error', FC: 'reaches on a fielder\'s choice', DP: 'grounds into a double play', K: 'strikes out' };

// Stolen base attempt by the runner on `base` (0 = 1B, 1 = 2B). ok = safe?
export function recordSteal(st, base, ok) {
  const pid = st.bases[base]; if (!pid || st.done) return;
  const bs = st.box.bat[pid] || (st.box.bat[pid] = blankBat());
  if (ok) {
    bs.sb++;
    if (base === 2) {
      scoreRun(st, 2, pid, pid, false); st.bases[2] = null; st.resp[2] = null; st.ue[2] = 0;
      if (!st.top && st.inn >= st.innings && st.score[1] > st.score[0]) finish(st);
      return;
    }
    st.bases[base + 1] = pid; st.resp[base + 1] = st.resp[base]; st.ue[base + 1] = st.ue[base];
  } else {
    bs.cs++; st.outs++; const ps = st.box.pit[st.cur[st.top ? 1 : 0]]; if (ps) ps.outs++;
  }
  st.bases[base] = null; st.resp[base] = null; st.ue[base] = 0;
  if (st.outs >= 3) endHalf(st);
}
function trySteal(st) {
  const b = st.bases; if (!b[0] || b[1] || st.outs === 2 && rnd(st) < 0.5) return;
  const diff = st.score[st.top ? 0 : 1] - st.score[st.top ? 1 : 0]; if (diff <= -4 || diff >= 6) return;
  const zs = bprof(b[0]).zs; if (zs < -0.6) return;
  if (rnd(st) < TUNE.sbTry * Math.exp(1.15 * zs)) recordSteal(st, 0, rnd(st) < clamp(TUNE.sbOk + 0.05 * zs, 0.55, 0.94));
}

// ---------------- finish: decisions + player of the game ----------------
function finish(st) {
  st.done = true; const box = st.box, m = st.meta;
  box.score = st.score.slice(); box.final = true;
  const win = st.score[1] > st.score[0] ? 1 : 0, lose = 1 - win;
  let w = m.w, l = m.l;
  const ps = box.pitchers[win], starter = ps[0];
  if (w === starter && box.pit[starter].outs < Math.round(15 * st.innings / 9) && ps.length > 1) {
    const rel = ps.slice(1).sort((a, b) => (box.pit[b].outs - 3 * box.pit[b].r) - (box.pit[a].outs - 3 * box.pit[a].r));
    w = rel[0];
  }
  if (!w) w = ps[0]; if (!l) l = box.pitchers[lose][0];
  const fin = ps[ps.length - 1];
  let sv = null;
  if (fin !== w) { const e = m.entry[fin] ?? 0; if ((e >= 1 && e <= 3 && box.pit[fin].outs >= 1) || box.pit[fin].outs >= 9) sv = fin; }
  box.dec = { w, l, sv };
  // player of the game (winning side)
  let best = null, bv = -1e9;
  for (const pid of box.order[win]) { const b = box.bat[pid]; if (!b) continue; const v = b.h + b.d + 2 * b.t + 3 * b.hr + b.r + b.rbi * 1.2 + 0.5 * b.bb + 0.6 * b.sb - 0.3 * (b.ab - b.h); if (v > bv) { bv = v; best = pid; } }
  for (const pid of ps) { const p = box.pit[pid]; const v = p.outs / 3 * 1.1 + p.so * 0.45 - p.er * 1.8 - (p.h + p.bb) * 0.4 + (pid === w ? 1 : 0) - 2.5; if (v > bv) { bv = v; best = pid; } }
  box.pog = best;
  return box;
}

// ---------------- drivers ----------------
export function simFrom(st, opts = {}) {
  if (opts.log === false) st.log = false;
  if (!st.defZ) st.defZ = st.sides.map(s => s.lineup.reduce((a, x) => a + z(player(x.pid), 'fld', -1), 0) / 9);
  let guard = 0;
  while (!st.done && guard++ < 3000) {
    const ft = st.top ? 1 : 0;
    cpuPitchingChange(st, ft);
    const half = st.top, inn = st.inn;
    trySteal(st);
    if (st.done || half !== st.top || inn !== st.inn) continue;
    recordPA(st, rollPA(st));
  }
  if (!st.done) finish(st);
  return st.box;
}
export function simGame(away, home, opts = {}) { return simFrom(newState(away, home, opts), opts); }

// Rough live win probability for the home side (0..1)
export function winProb(st) {
  if (st.done) return st.score[1] > st.score[0] ? 1 : 0;
  const diff = st.score[1] - st.score[0];
  const left = Math.max(0.5, (st.innings - st.inn + 1) * 2 - (st.top ? 0 : 1) - st.outs / 3);
  const onb = (st.bases[0] ? 0.4 : 0) + (st.bases[1] ? 0.6 : 0) + (st.bases[2] ? 0.8 : 0);
  const adj = diff + 0.06 + (st.top ? -onb : onb) * (1 - st.outs / 3) * 0.5;
  return 1 / (1 + Math.exp(-adj / (0.55 * Math.sqrt(left) + 0.2)));
}
