// Season mode core: create / save / load, daily sim, rotations + bullpen rest, roster moves, next season.
import * as DB from '../db.js';
import { save, load, del, has } from '../store.js';
import { simGame, clearCache } from '../sim/simgame.js';
import { makeSchedule } from './schedule.js';
import { addBox, clubOf } from './stats.js';

export const LENS = [20, 52, 81, 162];
export const MAX_BOX = 60;
const TI = Object.fromEntries(DB.TEAMS.map((t, i) => [t.id, i]));
export const tid = i => DB.TEAMS[i].id;
export const tix = id => TI[id];
const key = slot => 'season_' + slot;

// ---------------- create / persist ----------------
export function copyDepth(d) {
  return { lineup: d.lineup.map(x => [x[0], x[1]]), bench: [...(d.bench || [])], rotation: [...d.rotation], bullpen: [...d.bullpen], closer: d.closer };
}
export function newSeason(slot, team, len, prev = null) {
  const seed = (Math.random() * 2 ** 31) | 0, year = prev ? prev.year + 1 : 2027;
  const { games, days } = makeSchedule(DB.TEAMS, len, seed);
  const S = {
    v: 1, slot, team, len, year, seed, day: 0, days, games,
    depth: prev ? prev.depth : copyDepth(DB.DEPTH[team]),
    own: prev ? prev.own : {}, mods: prev ? prev.mods : {},
    rot: {}, ls: {}, rp: {}, bat: {}, pit: {}, boxes: [], post: null, awards: null, champ: null,
    hist: prev ? prev.hist : [], created: Date.now(),
  };
  return S;
}
export const saveSeason = S => save(key(S.slot), S);
export const loadSeason = slot => repair(load(key(slot)));
// a roster refresh in data.js can drop players: rebuild the depth chart if it points at someone who no longer exists
function repair(S) {
  if (!S || !S.depth) return S;
  const d = S.depth, ok = pid => pid != null && DB.player(pid);
  if (!DB.T[S.team]) return null;
  if (d.lineup.length !== 9 || !d.lineup.every(x => ok(x[0])) || d.rotation.length < 5 || !d.rotation.every(ok)) { S.depth = copyDepth(DB.DEPTH[S.team]); return S; }
  d.bench = d.bench.filter(ok); d.bullpen = d.bullpen.filter(ok); if (!ok(d.closer)) d.closer = d.bullpen.shift() ?? null;
  return S;
}
export const deleteSeason = slot => del(key(slot));
export const hasSeason = slot => has(key(slot));

// ---------------- player ratings drift between seasons (applied on top of the database) ----------------
const MODK = ['age', 'con', 'pow', 'eye', 'spd', 'fld', 'arm', 'vel', 'ctl', 'stf', 'sta', 'ovr'];
let BASE = null, applied = null;
export function applyMods(S) {
  if (!BASE) { BASE = new Map(); for (const p of DB.P.values()) BASE.set(p.id, MODK.map(k => p[k])); }
  if (applied === S) return;
  restoreBase();
  for (const pid in S.mods || {}) {
    const p = DB.player(+pid), m = S.mods[pid]; if (!p) continue;
    MODK.forEach((k, i) => { if (m[i] && p[k] != null) p[k] = k === 'age' || k === 'vel' ? p[k] + m[i] : Math.max(20, Math.min(99, p[k] + m[i])); });
  }
  applied = S; clearCache();
}
export function restoreBase() {
  if (!BASE || !applied) return;
  for (const [pid, v] of BASE) { const p = DB.player(pid); MODK.forEach((k, i) => p[k] = v[i]); }
  applied = null; clearCache();
}

// ---------------- rosters ----------------
export function fortyMan(S) { // user club 40-man
  const out = [];
  for (const p of DB.P.values()) if (clubOf(S, p.id) === S.team) out.push(p.id);
  return out;
}
export function activeList(S) { const d = S.depth; return [...d.lineup.map(x => x[0]), ...d.bench, ...d.rotation, ...d.bullpen, d.closer].filter(x => x != null); }
export function freeAgents(S) {
  const out = [];
  for (const p of DB.P.values()) if (clubOf(S, p.id) == null) out.push(p.id);
  return out.sort((a, b) => (DB.player(b).ovr || 0) - (DB.player(a).ovr || 0));
}
export function depthOf(S, team) { return team === S.team ? S.depth : DB.DEPTH[team]; }

// ---------------- game sides ----------------
const REST = 5; // a starter can go again 5 days after his last start (4 days of rest)
function pickStarter(S, team, day) {
  const d = depthOf(S, team), rot = d.rotation, n = rot.length;
  let k = S.rot[team] || 0;
  for (let j = 0; j < n; j++) { const pid = rot[(k + j) % n]; if (S.ls[pid] == null || day - S.ls[pid] >= REST) return (k + j) % n; }
  let best = k % n, bd = -1; rot.forEach((pid, i) => { const r = S.ls[pid] == null ? 99 : day - S.ls[pid]; if (r > bd) { bd = r; best = i; } });
  return best;
}
export function tiredArms(S, team, day) {
  const d = depthOf(S, team), out = [];
  for (const pid of [...d.bullpen, d.closer]) {
    const u = S.rp[pid]; if (!u) continue;
    const [last, pc, streak] = u, ago = day - last;
    if ((ago === 1 && (pc > 28 || streak >= 2)) || (ago === 2 && pc > 45)) out.push(pid);
  }
  return out;
}
export function sideFor(S, team, day) {
  const d = depthOf(S, team), slot = pickStarter(S, team, day);
  return DB.defaultSide(team, slot, d);
}
export function probable(S, team, day) { const d = depthOf(S, team); return d.rotation[pickStarter(S, team, day)]; }
function hrBase(S, a, h) { const o = {}; for (const s of [a, h]) for (const x of s.lineup) o[x.pid] = S.bat[x.pid]?.[6] || 0; return o; }
export function gameOpts(S, a, h, day, extra = {}) {
  return { park: h.team, innings: 9, tired: [...tiredArms(S, a.team, day), ...tiredArms(S, h.team, day)], hrBase: hrBase(S, a, h), ...extra };
}
// bookkeeping after any game (regular season or postseason)
export function afterGame(S, box, day, a, h) {
  for (const side of [0, 1]) {
    const s = [a, h][side], ps = box.pitchers[side];
    const sp = ps[0]; S.ls[sp] = day;
    const d = depthOf(S, s.team), k = d.rotation.indexOf(sp);
    if (k >= 0) S.rot[s.team] = (k + 1) % d.rotation.length; else S.rot[s.team] = ((S.rot[s.team] || 0) + 1) % d.rotation.length;
    for (const pid of ps.slice(1)) {
      const u = S.rp[pid], pc = box.pit[pid]?.pc || 0;
      S.rp[pid] = [day, pc, u && u[0] === day - 1 ? u[2] + 1 : 1];
    }
  }
}
export function keepBox(S, gi, box) {
  const b = { ...box }; b.gi = gi;
  S.boxes = S.boxes.filter(x => x.gi !== gi); S.boxes.push(b);
  if (S.boxes.length > MAX_BOX) S.boxes.splice(0, S.boxes.length - MAX_BOX);
}
export const userGameIdx = (S, day) => S.games.findIndex(g => g[0] === day && (tid(g[1]) === S.team || tid(g[2]) === S.team));
export function nextUserGame(S) { for (let i = 0; i < S.games.length; i++) { const g = S.games[i]; if (g[3] == null && (tid(g[1]) === S.team || tid(g[2]) === S.team)) return i; } return -1; }

// Record a finished regular-season game
export function recordGame(S, gi, box) {
  const g = S.games[gi];
  g[3] = box.score[0]; g[4] = box.score[1];
  addBox(S, box);
  const a = { team: tid(g[1]), lineup: [] }, h = { team: tid(g[2]), lineup: [] };
  afterGame(S, box, g[0], a, h);
  if (a.team === S.team || h.team === S.team) keepBox(S, gi, box);
}
// Sim every unplayed game of the current day. userBox: result of the user's game if it was played live.
export function simDay(S, userBox = null) {
  if (S.day >= S.days) return false;
  const day = S.day;
  for (let gi = 0; gi < S.games.length; gi++) {
    const g = S.games[gi]; if (g[0] !== day || g[3] != null) continue;
    const at = tid(g[1]), ht = tid(g[2]), mine = at === S.team || ht === S.team;
    let box = mine ? userBox : null;
    if (!box) {
      const a = sideFor(S, at, day), h = sideFor(S, ht, day);
      box = simGame(a, h, gameOpts(S, a, h, day, { log: mine }));
      if (!mine) box.log = [];
    }
    recordGame(S, gi, box);
  }
  S.day++;
  return true;
}
export const seasonOver = S => S.day >= S.days;

// ---------------- next season ----------------
function drift(R, age, k) {
  let m = age <= 24 ? 2.2 : age <= 27 ? 1 : age <= 30 ? 0 : age <= 33 ? -1.2 : -2.4;
  if (k === 'spd') m -= 0.8;
  return Math.round(m + (R() - 0.5) * 4);
}
export function nextSeason(S) {
  const R = Math.random;
  applyMods(S);
  const mods = { ...S.mods };
  for (const p of DB.P.values()) {
    const m = mods[p.id] ? [...mods[p.id]] : new Array(MODK.length).fill(0);
    m[0]++;
    let sum = 0, n = 0;
    for (const k of ['con', 'pow', 'eye', 'spd', 'fld', 'arm', 'ctl', 'stf', 'sta']) {
      if (p[k] == null) continue; const d = drift(R, p.age, k); m[MODK.indexOf(k)] += d;
      if (['con', 'pow', 'eye', 'stf', 'ctl'].includes(k)) { sum += d; n++; }
    }
    if (p.vel != null && p.age >= 31) m[MODK.indexOf('vel')] -= R() < 0.4 ? 1 : 0;
    m[MODK.length - 1] += n ? Math.round(sum / n) : 0;
    mods[p.id] = m;
  }
  const hist = [...S.hist, { year: S.year, champ: S.champ, rec: S.post?.rec?.[S.team] || null, awards: S.awards }];
  const N = newSeason(S.slot, S.team, S.len, { ...S, mods, hist });
  restoreBase(); applyMods(N);
  return N;
}
