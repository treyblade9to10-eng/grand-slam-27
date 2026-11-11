// Season hub tabs: STANDINGS, SCHEDULE, STATS
import * as DB from '../db.js';
import { h, badge, fmt3, fmtERA, ipStr } from '../ui.js';
import * as SE from './season.js';
import { standings, divisions, wildCard, leaders, teamStats, BAT_CATS, PIT_CATS } from './stats.js';
import { dateOf } from './schedule.js';
import { nm, playerCard, optRow } from './cards.js';
import { resultRow, openBox } from './ui.js';

const VIEW = { stand: 'div', lg: 'MLB', stats: 'leaders', sort: 'r' };
const pct = v => v.toFixed(3).replace(/^0/, '');
const teamCell = (S, id) => h('td', { class: 'tm' }, h('span', {}, badge(DB.team(id), 20), id));

// ---------------- STANDINGS ----------------
export function standingsTab(ctx) {
  const S = ctx.S, st = standings(S), out = h('div', {});
  out.append(h('div', { class: 'row', style: 'margin-bottom:10px' }, optRow('', [['div', 'DIVISIONS'], ['wc', 'WILD CARD']], VIEW.stand, v => { VIEW.stand = v; ctx.draw(); })));
  const head = (first, extra) => h('tr', {}, h('th', {}, first), ['W', 'L', 'PCT', extra].map(k => h('th', { class: 'n' }, k)), h('th', { class: 'n' }, 'L10'), h('th', { class: 'n' }, 'STRK'), h('th', { class: 'n hide-m' }, 'HOME'), h('th', { class: 'n hide-m' }, 'AWAY'), h('th', { class: 'n' }, 'DIFF'));
  const row = (s, gb, cut) => h('tr', { class: s.id === S.team ? 'me' : '', style: cut ? 'border-top:2px solid var(--gold)' : '' }, teamCell(S, s.id),
    h('td', { class: 'n' }, String(s.w)), h('td', { class: 'n' }, String(s.l)), h('td', { class: 'n' }, pct(s.pct)), h('td', { class: 'n' }, gb === 0 ? '-' : gb > 0 ? String(gb) : '+' + (-gb)),
    h('td', { class: 'n' }, s.l10), h('td', { class: 'n' }, s.strk), h('td', { class: 'n hide-m' }, `${s.hw}-${s.hl}`), h('td', { class: 'n hide-m' }, `${s.aw}-${s.al}`), h('td', { class: 'n', style: `color:${s.diff > 0 ? 'var(--green)' : s.diff < 0 ? 'var(--red)' : 'inherit'}` }, (s.diff > 0 ? '+' : '') + s.diff));
  if (VIEW.stand === 'div') {
    const grid = h('div', { class: 'sn-cols', style: 'grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))' });
    for (const d of divisions(st)) grid.append(h('div', { class: 'panel', style: 'padding:12px' }, h('h3', { style: 'margin-bottom:6px' }, `${d.lg} ${d.div}`),
      h('div', { class: 'scroll-x' }, h('table', { class: 't sn-mini' }, head('TEAM', 'GB'), d.teams.map(s => row(s, s.gb))))));
    out.append(grid);
  } else {
    const grid = h('div', { class: 'sn-cols', style: 'grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))' });
    for (const lg of ['AL', 'NL']) {
      const wc = wildCard(st, lg);
      grid.append(h('div', { class: 'panel', style: 'padding:12px' }, h('h3', { style: 'margin-bottom:6px' }, `${lg} DIVISION LEADERS`),
        h('div', { class: 'scroll-x' }, h('table', { class: 't sn-mini' }, head('TEAM', ''), wc.leaders.map(s => row(s, 0)))),
        h('h3', { style: 'margin:12px 0 6px' }, `${lg} WILD CARD`),
        h('div', { class: 'scroll-x' }, h('table', { class: 't sn-mini' }, head('TEAM', 'WCGB'), wc.rest.map((s, i) => row(s, s.wcgb, i === 3))))));
    }
    out.append(grid, h('div', { class: 'muted', style: 'font-size:13px;margin-top:8px' }, 'Top three wild cards make it. The two best division winners in each league get a bye to the Division Series.'));
  }
  return out;
}

// ---------------- SCHEDULE ----------------
export function scheduleTab(ctx) {
  const S = ctx.S, out = h('div', {}), mine = [];
  S.games.forEach((g, i) => { if (SE.tid(g[1]) === S.team || SE.tid(g[2]) === S.team) mine.push(i); });
  const st = standings(S).find(s => s.id === S.team);
  out.append(h('div', { class: 'sub' }, `${st.w}-${st.l}  ·  ${S.len - st.g} games left  ·  tap a played game for its box score`));
  let mon = '', w = 0, l = 0, list = null, next = null;
  const n = SE.nextUserGame(S);
  for (const gi of mine) {
    const g = S.games[gi], d = dateOf(S.year, g[0], S.len);
    if (d.mon !== mon) { mon = d.mon; list = h('div', { class: 'panel', style: 'padding:10px;margin-bottom:10px' }, h('h3', { style: 'margin-bottom:8px' }, monthName(mon))); out.append(list); }
    const r = resultRow(S, gi, i => openBox(S, i));
    if (g[3] != null) { const home = SE.tid(g[2]) === S.team; if ((home ? g[4] : g[3]) > (home ? g[3] : g[4])) w++; else l++; r.append(h('span', { class: 'r', style: 'min-width:46px;margin-left:8px' }, `${w}-${l}`)); }
    if (gi === n) { next = r; r.classList.add('sel'); }
    list.append(r);
  }
  if (next) setTimeout(() => next.scrollIntoView({ block: 'center' }), 30);
  return out;
}
const MONTHS = { MAR: 'MARCH', APR: 'APRIL', MAY: 'MAY', JUN: 'JUNE', JUL: 'JULY', AUG: 'AUGUST', SEP: 'SEPTEMBER', OCT: 'OCTOBER' };
const monthName = m => MONTHS[m] || m;

// ---------------- STATS ----------------
export function statsTab(ctx) {
  const S = ctx.S, out = h('div', {});
  out.append(h('div', { class: 'row', style: 'margin-bottom:10px;justify-content:space-between' },
    optRow('', [['leaders', 'LEADERS'], ['teams', 'TEAMS']], VIEW.stats, v => { VIEW.stats = v; ctx.draw(); }),
    VIEW.stats === 'leaders' ? optRow('', [['MLB', 'MLB'], ['AL', 'AL'], ['NL', 'NL']], VIEW.lg, v => { VIEW.lg = v; ctx.draw(); }) : null));
  if (VIEW.stats === 'leaders') {
    const lg = VIEW.lg === 'MLB' ? null : VIEW.lg;
    const fmt = (k, v) => ['avg', 'obp', 'ops'].includes(k) ? fmt3(v) : ['era', 'whip'].includes(k) ? fmtERA(v) : k === 'ip' ? ipStr(Math.round(v * 3)) : String(v);
    const panel = (title, cat, pitch) => {
      const L = leaders(S, cat, { lg, n: 5, pitch });
      return h('div', { class: 'panel' }, h('h3', {}, title),
        L.length ? L.map((x, i) => h('div', { class: 'sn-lr' + (x.club === S.team ? ' gold' : '') }, h('span', { class: 'k' }, String(i + 1)), badge(DB.team(x.club), 18),
          h('button', { class: 'opt sn-link', onclick: () => playerCard(S, x.pid) }, nm(x.pid)), h('span', { class: 'v' }, fmt(cat, x.v))))
          : h('div', { class: 'muted', style: 'font-size:14px' }, 'No qualified players yet.'));
    };
    out.append(h('h3', { style: 'margin:4px 0 8px' }, 'HITTING'), h('div', { class: 'sn-lead' }, BAT_CATS.map(([k, t]) => panel(t, k, false))),
      h('h3', { style: 'margin:16px 0 8px' }, 'PITCHING'), h('div', { class: 'sn-lead' }, PIT_CATS.map(([k, t]) => panel(t, k, true))));
  } else {
    const T = teamStats(S), key = VIEW.sort, low = ['era', 'whip', 'ra'].includes(key);
    T.sort((a, b) => low ? (a[key] ?? 99) - (b[key] ?? 99) : (b[key] ?? -1) - (a[key] ?? -1));
    const cols = [['w', 'W'], ['l', 'L'], ['r', 'R'], ['ra', 'RA'], ['avg', 'AVG'], ['obp', 'OBP'], ['slg', 'SLG'], ['ops', 'OPS'], ['hr', 'HR'], ['sb', 'SB'], ['era', 'ERA'], ['whip', 'WHIP'], ['pso', 'K']];
    const f = (k, v) => v == null ? '-' : ['avg', 'obp', 'slg', 'ops'].includes(k) ? fmt3(v) : ['era', 'whip'].includes(k) ? fmtERA(v) : String(v);
    out.append(h('div', { class: 'row', style: 'margin-bottom:8px' }, optRow('SORT', [['r', 'RUNS'], ['ops', 'OPS'], ['hr', 'HR'], ['era', 'ERA'], ['w', 'WINS']], key, v => { VIEW.sort = v; ctx.draw(); })),
      h('div', { class: 'panel', style: 'padding:8px' }, h('div', { class: 'scroll-x' }, h('table', { class: 't sn-mini' },
        h('tr', {}, h('th', {}, 'TEAM'), cols.map(([k, t]) => h('th', { class: 'n', style: k === key ? 'color:var(--gold)' : '' }, t))),
        T.map(t => h('tr', { class: t.id === S.team ? 'me' : '' }, teamCell(S, t.id), cols.map(([k]) => h('td', { class: 'n' }, f(k, t[k])))))))));
  }
  return out;
}
