// Season schedule: every club plays exactly `len` games in 2-4 game series.
// Weighted like the real MLB schedule (more games vs division rivals, then league, then interleague).
// Games are compact arrays: [day, awayIdx, homeIdx, awayRuns|null, homeRuns|null] (team idx = TEAMS order).

export function rng(seed) {
  let s = seed | 0;
  return () => { let t = (s = (s + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// series lengths summing to len (mostly 3s, a few 2s and 4s for variety)
function seriesPlan(len, R) {
  const out = []; let left = len;
  while (left > 0) {
    let L = 3;
    if (left === 4 || left === 2) L = left;
    else if (left === 5) L = 2;
    else if (left > 8) { const r = R(); L = r < 0.12 ? 2 : r < 0.24 ? 4 : 3; }
    out.push(L); left -= L;
  }
  return out;
}
export function makeSchedule(teams, len, seed = 1) {
  const R = rng(seed), n = teams.length;
  const w = (a, b) => a.lg === b.lg ? (a.div === b.div ? 13 : 6.4) : 3.07;
  const tot = teams.map((t, i) => teams.reduce((s, u, j) => s + (i === j ? 0 : w(t, u)), 0));
  const target = [], played = [];
  for (let i = 0; i < n; i++) { target.push([]); played.push(new Array(n).fill(0)); for (let j = 0; j < n; j++) target[i].push(i === j ? 0 : len * w(teams[i], teams[j]) / tot[i]); }
  const home = new Array(n).fill(0), away = new Array(n).fill(0), last = new Array(n).fill(-1);
  const meetH = []; for (let i = 0; i < n; i++) meetH.push(new Array(n).fill(0)); // home games of i vs j
  const games = []; let day = 0;
  for (const L of seriesPlan(len, R)) {
    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let s = (target[i][j] - played[i][j]) / L + R() * 0.6 + 0.35 * Math.abs((home[i] - away[i]) - (home[j] - away[j])) / L;
      if (last[i] === j) s -= 50;
      pairs.push([s, i, j]);
    }
    pairs.sort((a, b) => b[0] - a[0]);
    const used = new Array(n).fill(false);
    for (const [, i, j] of pairs) {
      if (used[i] || used[j]) continue;
      used[i] = used[j] = true; last[i] = j; last[j] = i;
      played[i][j] += L; played[j][i] += L;
      // home: the club owed home games in this matchup, then the one with fewer home games overall
      let hi;
      const bi = meetH[i][j] - meetH[j][i], bal = (home[i] - away[i]) - (home[j] - away[j]);
      if (Math.abs(bal) >= L) hi = bal < 0 ? i : j; else if (bi !== 0) hi = bi < 0 ? i : j; else if (bal !== 0) hi = bal < 0 ? i : j; else hi = R() < 0.5 ? i : j;
      const ai = hi === i ? j : i;
      home[hi] += L; away[ai] += L; meetH[hi][ai] += L;
      for (let g = 0; g < L; g++) games.push([day + g, ai, hi, null, null]);
    }
    day += L;
  }
  games.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  return { games, days: day };
}
// calendar: opening day late March, an off day after every 6 game days in long seasons
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export function dateOf(year, day, len) {
  const off = len >= 81 ? Math.floor(day / 6) : 0;
  const d = new Date(Date.UTC(year, 2, 26 + day + off));
  return { mon: MON[d.getUTCMonth()], d: d.getUTCDate(), dow: DOW[d.getUTCDay()], short: MON[d.getUTCMonth()] + ' ' + d.getUTCDate() };
}
export function postDate(year, i) {
  const d = new Date(Date.UTC(year, 8, 30 + i));
  return { mon: MON[d.getUTCMonth()], d: d.getUTCDate(), dow: DOW[d.getUTCDay()], short: MON[d.getUTCMonth()] + ' ' + d.getUTCDate() };
}
