// Season stat books: per-player totals (compact arrays), standings, leaders, awards.
import * as DB from '../db.js';

// batting  [g, ab, r, h, d, t, hr, rbi, bb, so, sb, cs, hbp, sf]
export const BK = ['g', 'ab', 'r', 'h', 'd', 't', 'hr', 'rbi', 'bb', 'so', 'sb', 'cs', 'hbp', 'sf'];
// pitching [g, gs, w, l, sv, outs, h, r, er, bb, so, hr, bf]
export const PK = ['g', 'gs', 'w', 'l', 'sv', 'outs', 'h', 'r', 'er', 'bb', 'so', 'hr', 'bf'];
const BI = Object.fromEntries(BK.map((k, i) => [k, i])), PI = Object.fromEntries(PK.map((k, i) => [k, i]));

export function addBox(S, box) {
  for (const pid in box.bat) {
    const b = box.bat[pid], a = S.bat[pid] || (S.bat[pid] = new Array(BK.length).fill(0));
    a[0]++; for (let i = 1; i < BK.length; i++) a[i] += b[BK[i]] || 0;
  }
  const d = box.dec || {};
  for (const side of [0, 1]) box.pitchers[side].forEach((pid, n) => {
    const p = box.pit[pid]; if (!p) return;
    const a = S.pit[pid] || (S.pit[pid] = new Array(PK.length).fill(0));
    a[0]++; if (!n) a[1]++;
    if (d.w == pid) a[2]++; if (d.l == pid) a[3]++; if (d.sv == pid) a[4]++;
    for (let i = 5; i < PK.length; i++) a[i] += p[PK[i]] || 0;
  });
}
export function bline(a) {
  if (!a) a = new Array(BK.length).fill(0);
  const o = {}; BK.forEach((k, i) => o[k] = a[i]);
  o.pa = o.ab + o.bb + o.hbp + o.sf;
  o.avg = o.ab ? o.h / o.ab : null;
  o.obp = o.pa ? (o.h + o.bb + o.hbp) / (o.ab + o.bb + o.hbp + o.sf) : null;
  o.slg = o.ab ? (o.h + o.d + 2 * o.t + 3 * o.hr) / o.ab : null;
  o.ops = o.obp != null && o.slg != null ? o.obp + o.slg : null;
  return o;
}
export function pline(a) {
  if (!a) a = new Array(PK.length).fill(0);
  const o = {}; PK.forEach((k, i) => o[k] = a[i]);
  o.ip = o.outs / 3;
  o.era = o.outs ? o.er * 27 / o.outs : null;
  o.whip = o.outs ? (o.h + o.bb) * 3 / o.outs : null;
  o.k9 = o.outs ? o.so * 27 / o.outs : null;
  return o;
}

// club of a player inside this season (signed / released players override the database)
export const clubOf = (S, pid) => S.own && pid in S.own ? S.own[pid] : DB.player(pid)?.t ?? null;

// ---------------- standings ----------------
export function standings(S) {
  const T = DB.TEAMS, n = T.length;
  const st = T.map((t, i) => ({ id: t.id, i, lg: t.lg, div: t.div, w: 0, l: 0, rs: 0, ra: 0, hw: 0, hl: 0, aw: 0, al: 0, last: [], h2h: new Array(n).fill(0) }));
  for (const g of S.games) {
    if (g[3] == null) continue;
    const a = st[g[1]], h = st[g[2]], hw = g[4] > g[3];
    a.rs += g[3]; a.ra += g[4]; h.rs += g[4]; h.ra += g[3];
    if (hw) { h.w++; h.hw++; a.l++; a.al++; h.h2h[a.i]++; } else { a.w++; a.aw++; h.l++; h.hl++; a.h2h[h.i]++; }
    h.last.push(hw ? 1 : 0); a.last.push(hw ? 0 : 1);
  }
  for (const s of st) {
    s.g = s.w + s.l; s.pct = s.g ? s.w / s.g : 0;
    const l10 = s.last.slice(-10); s.l10 = l10.filter(Boolean).length + '-' + l10.filter(x => !x).length;
    let k = 0; const L = s.last; while (k < L.length && L[L.length - 1 - k] === L[L.length - 1]) k++;
    s.strk = L.length ? (L[L.length - 1] ? 'W' : 'L') + k : '-';
    s.diff = s.rs - s.ra;
  }
  return st;
}
// sort with tiebreaks: pct, head-to-head, run differential, team id
export function sortTeams(list) {
  return list.slice().sort((a, b) => (b.pct - a.pct) || (b.h2h[a.i] - a.h2h[b.i]) || (b.diff - a.diff) || a.id.localeCompare(b.id));
}
export function divisions(st) {
  const out = [];
  for (const lg of ['AL', 'NL']) for (const div of ['East', 'Central', 'West']) {
    const t = sortTeams(st.filter(s => s.lg === lg && s.div === div)), top = t[0];
    t.forEach(s => s.gb = ((top.w - s.w) + (s.l - top.l)) / 2);
    out.push({ lg, div, teams: t });
  }
  return out;
}
// 6 seeds per league: 3 division winners (by record) + 3 wild cards
export function seeds(st, lg) {
  const divs = divisions(st).filter(d => d.lg === lg);
  const winners = sortTeams(divs.map(d => d.teams[0]));
  const rest = sortTeams(st.filter(s => s.lg === lg && !winners.includes(s)));
  return [...winners, ...rest.slice(0, 3)].map(s => s.id);
}
export function wildCard(st, lg) {
  const divs = divisions(st).filter(d => d.lg === lg), win = divs.map(d => d.teams[0]);
  const rest = sortTeams(st.filter(s => s.lg === lg && !win.includes(s)));
  const cut = rest[2];
  rest.forEach(s => s.wcgb = cut ? ((cut.w - s.w) + (s.l - cut.l)) / 2 : 0);
  return { leaders: sortTeams(win), rest };
}

// ---------------- leaders ----------------
export function qualifiers(S) {
  // games played by the clubs so far
  const gp = {}; for (const g of S.games) if (g[3] != null) { gp[g[1]] = (gp[g[1]] || 0) + 1; gp[g[2]] = (gp[g[2]] || 0) + 1; }
  const maxG = Math.max(1, ...Object.values(gp));
  return { pa: maxG * 3.1, outs: maxG * 3 };
}
export const BAT_CATS = [
  ['avg', 'AVG', 1, true], ['hr', 'HR', 0], ['rbi', 'RBI', 0], ['ops', 'OPS', 1, true], ['h', 'H', 0], ['sb', 'SB', 0], ['r', 'R', 0], ['obp', 'OBP', 1, true],
];
export const PIT_CATS = [
  ['w', 'W', 0], ['era', 'ERA', -1, true], ['so', 'SO', 0], ['sv', 'SV', 0], ['whip', 'WHIP', -1, true], ['ip', 'IP', 0],
];
export function leaders(S, cat, { lg = null, n = 5, pitch = false } = {}) {
  const q = qualifiers(S), out = [];
  const src = pitch ? S.pit : S.bat;
  const [key, , dir, rate] = (pitch ? PIT_CATS : BAT_CATS).find(c => c[0] === cat);
  for (const pid in src) {
    const club = clubOf(S, +pid); if (!club) continue;
    if (lg && DB.team(club)?.lg !== lg) continue;
    const o = pitch ? pline(src[pid]) : bline(src[pid]);
    if (rate && (pitch ? o.outs < q.outs : o.pa < q.pa)) continue;
    const v = o[key]; if (v == null) continue;
    out.push({ pid: +pid, club, v, o });
  }
  out.sort((a, b) => dir < 0 ? a.v - b.v : b.v - a.v);
  return out.slice(0, n);
}
export function teamStats(S) {
  const st = standings(S), T = {};
  for (const s of st) T[s.id] = { id: s.id, g: s.g, w: s.w, l: s.l, r: s.rs, ra: s.ra, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, hbp: 0, sf: 0, sb: 0, so: 0, outs: 0, er: 0, pso: 0, pbb: 0, ph: 0 };
  for (const pid in S.bat) { const c = clubOf(S, +pid), t = T[c]; if (!t) continue; const o = bline(S.bat[pid]); for (const k of ['ab', 'h', 'd', 't', 'hr', 'bb', 'hbp', 'sf', 'sb', 'so']) t[k] += o[k]; }
  for (const pid in S.pit) { const c = clubOf(S, +pid), t = T[c]; if (!t) continue; const o = pline(S.pit[pid]); t.outs += o.outs; t.er += o.er; t.pso += o.so; t.pbb += o.bb; t.ph += o.h; }
  return Object.values(T).map(t => ({ ...t, avg: t.ab ? t.h / t.ab : null, obp: t.ab ? (t.h + t.bb + t.hbp) / (t.ab + t.bb + t.hbp + t.sf) : null, slg: t.ab ? (t.h + t.d + 2 * t.t + 3 * t.hr) / t.ab : null, era: t.outs ? t.er * 27 / t.outs : null, whip: t.outs ? (t.ph + t.pbb) * 3 / t.outs : null }))
    .map(t => ({ ...t, ops: t.obp != null ? t.obp + t.slg : null }));
}

// ---------------- awards ----------------
const POSV = { C: 14, SS: 10, CF: 7, '2B': 6, '3B': 5, RF: 2, LF: 0, '1B': -6, DH: -10 };
export function posOf(S, pid) {
  if (S.depth && S.depth.lineup) { const x = S.depth.lineup.find(l => l[0] === pid); if (x) return x[1]; }
  const c = clubOf(S, pid), d = DB.DEPTH[c]; const x = d && d.lineup.find(l => l[0] === pid);
  return x ? x[1] : DB.player(pid)?.pos;
}
export function awards(S) {
  const q = qualifiers(S), lgTot = { h: 0, ab: 0, bb: 0, hbp: 0, sf: 0, tb: 0, er: 0, outs: 0 };
  for (const pid in S.bat) { const o = bline(S.bat[pid]); lgTot.h += o.h; lgTot.ab += o.ab; lgTot.bb += o.bb; lgTot.hbp += o.hbp; lgTot.sf += o.sf; lgTot.tb += o.h + o.d + 2 * o.t + 3 * o.hr; }
  for (const pid in S.pit) { const o = pline(S.pit[pid]); lgTot.er += o.er; lgTot.outs += o.outs; }
  const lgOps = (lgTot.h + lgTot.bb + lgTot.hbp) / Math.max(1, lgTot.ab + lgTot.bb + lgTot.hbp + lgTot.sf) + lgTot.tb / Math.max(1, lgTot.ab);
  const lgEra = lgTot.er * 27 / Math.max(1, lgTot.outs);
  const st = standings(S), rec = Object.fromEntries(st.map(s => [s.id, s.pct]));
  const out = {};
  for (const lg of ['AL', 'NL']) {
    const bats = [], pits = [];
    for (const pid in S.bat) {
      const c = clubOf(S, +pid); if (!c || DB.team(c).lg !== lg) continue;
      const o = bline(S.bat[pid]); if (o.pa < q.pa * 0.8) continue;
      const pos = posOf(S, +pid);
      const v = (o.ops - lgOps) * o.pa * 0.42 + (POSV[pos] ?? 0) * o.pa / 650 + o.sb * 0.15 + (rec[c] - 0.5) * 12;
      bats.push({ pid: +pid, club: c, v, o, pos });
    }
    for (const pid in S.pit) {
      const c = clubOf(S, +pid); if (!c || DB.team(c).lg !== lg) continue;
      const o = pline(S.pit[pid]); if (o.outs < q.outs * 0.5) continue;
      const v = (lgEra - o.era) * o.ip / 9 * 1.0 + o.so * 0.02 + o.w * 0.15 + o.sv * 0.05;
      pits.push({ pid: +pid, club: c, v, o });
    }
    bats.sort((a, b) => b.v - a.v); pits.sort((a, b) => b.v - a.v);
    const ss = {};
    for (const pos of ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']) { const b = bats.filter(x => x.pos === pos).sort((a, b) => b.o.ops - a.o.ops)[0]; if (b) ss[pos] = b.pid; }
    out[lg] = { mvp: bats.slice(0, 3).map(x => x.pid), cy: pits.slice(0, 3).map(x => x.pid), ss };
  }
  return out;
}
