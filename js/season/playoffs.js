// Postseason: 12 clubs (3 division winners + 3 wild cards per league, seeds 1-2 get a bye).
// Wild Card best-of-3 all at the higher seed, Division Series best-of-5 (2-2-1),
// LCS + World Series best-of-7 (2-3-2). No extra-inning runner in October.
import * as DB from '../db.js';
import { simGame } from '../sim/simgame.js';
import { standings, seeds } from './stats.js';
import { sideFor, gameOpts, afterGame, keepBox } from './season.js';

const PAT = { 3: [1, 1, 1], 5: [1, 1, 0, 0, 1], 7: [1, 1, 0, 0, 0, 1, 1] }; // 1 = higher seed at home
export const ROUNDS = ['WILD CARD', 'DIVISION SERIES', 'LCS', 'WORLD SERIES'];

export function startPost(S) {
  const st = standings(S), rec = Object.fromEntries(st.map(s => [s.id, [s.w, s.l]]));
  const P = { round: 0, day: 0, seeds: { AL: seeds(st, 'AL'), NL: seeds(st, 'NL') }, series: [], rec, done: false };
  for (const lg of ['AL', 'NL']) {
    const s = P.seeds[lg];
    P.series.push(mk(lg + 'WC1', 0, lg, s[2], s[5], 3), mk(lg + 'WC2', 0, lg, s[3], s[4], 3));
  }
  S.post = P; return P;
}
function mk(id, r, lg, hi, lo, best) { return { id, r, lg, hi, lo, best, w: [0, 0], g: [], win: null }; }
export const need = s => (s.best + 1) >> 1;
export const seedOf = (P, team) => { for (const lg of ['AL', 'NL']) { const i = P.seeds[lg].indexOf(team); if (i >= 0) return i + 1; } return null; };
export const active = P => P.series.filter(s => s.r === P.round && !s.win);
// next game of a series: [awayTeam, homeTeam]
export function nextGame(s) {
  const n = s.g.length, hiHome = PAT[s.best][n];
  return hiHome ? [s.lo, s.hi] : [s.hi, s.lo];
}
export function userSeries(S) { const P = S.post; return P && active(P).find(s => s.hi === S.team || s.lo === S.team) || null; }

// record one game of a series
export function recordPostGame(S, s, box) {
  const [a, h] = nextGame(s), P = S.post;
  const winTeam = box.score[1] > box.score[0] ? h : a;
  s.g.push([a, h, box.score[0], box.score[1]]);
  s.w[winTeam === s.hi ? 0 : 1]++;
  if (s.w[0] >= need(s)) s.win = s.hi; else if (s.w[1] >= need(s)) s.win = s.lo;
  afterGame(S, box, S.days + P.day, { team: a }, { team: h });
  if (a === S.team || h === S.team) keepBox(S, 'p' + s.id + s.g.length, { ...box, post: s.id });
}
function simOne(S, s) {
  const [at, ht] = nextGame(s), day = S.days + S.post.day;
  const a = sideFor(S, at, day), h = sideFor(S, ht, day);
  return simGame(a, h, gameOpts(S, a, h, day, { ghost: false, log: at === S.team || ht === S.team }));
}
// One postseason day: every active series plays a game (userBox = the user's live result, if any)
export function postDay(S, userBox = null) {
  const P = S.post; if (!P || P.done) return;
  for (const s of active(P)) {
    const mine = s.hi === S.team || s.lo === S.team;
    recordPostGame(S, s, mine && userBox ? userBox : simOne(S, s));
  }
  P.day++;
  advance(S);
}
function advance(S) {
  const P = S.post;
  if (active(P).length) return;
  const by = id => P.series.find(s => s.id === id), better = (x, y) => { // home field to the better seed / record
    const sx = seedOf(P, x), sy = seedOf(P, y);
    if (DB.team(x).lg === DB.team(y).lg) return sx < sy ? [x, y] : [y, x];
    const rx = P.rec[x], ry = P.rec[y]; return rx[0] - rx[1] >= ry[0] - ry[1] ? [x, y] : [y, x];
  };
  if (P.round === 0) {
    for (const lg of ['AL', 'NL']) {
      const s = P.seeds[lg];
      P.series.push(mk(lg + 'DS1', 1, lg, s[0], by(lg + 'WC2').win, 5), mk(lg + 'DS2', 1, lg, s[1], by(lg + 'WC1').win, 5));
    }
  } else if (P.round === 1) {
    for (const lg of ['AL', 'NL']) { const [hi, lo] = better(by(lg + 'DS1').win, by(lg + 'DS2').win); P.series.push(mk(lg + 'CS', 2, lg, hi, lo, 7)); }
  } else if (P.round === 2) {
    const [hi, lo] = better(by('ALCS').win, by('NLCS').win); P.series.push(mk('WS', 3, 'WS', hi, lo, 7));
  } else { P.done = true; S.champ = by('WS').win; return; }
  P.round++;
}
// sims until the user's next game day (or the end). Returns true if it stopped for a user game.
export function simPostUntilUser(S) {
  while (S.post && !S.post.done) { if (userSeries(S)) return true; postDay(S); }
  return false;
}
export function simRound(S) { const r = S.post.round; while (!S.post.done && S.post.round === r) postDay(S); }
export function simPostAll(S) { while (S.post && !S.post.done) postDay(S); }
