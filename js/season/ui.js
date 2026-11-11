// Season mode screens: save slots, new season setup, season hub (HOME tab + play / sim actions).
// Routes: #/season  |  #/season/new/<slot>  |  #/season/hub/<slot>/<tab>
import * as DB from '../db.js';
import { h, badge, toast, modal, fmtERA, ord, tv, teamBanner, teamRatings, ratingBars, divisionGrid, navFocus } from '../ui.js';
import { Settings } from '../store.js';
import { simGame } from '../sim/simgame.js';
import * as SE from './season.js';
import * as PO from './playoffs.js';
import { standings, divisions, pline, awards, leaders } from './stats.js';
import { dateOf, postDate } from './schedule.js';
import { css, nm, boxScore, confirmBox, playerCard, topBar, go, optRow } from './cards.js';
import { standingsTab, scheduleTab, statsTab } from './tabs.js';
import { rosterTab } from './roster.js';
import { postTab, champTab } from './post.js';

let CUR = null; // { slot, S }
function getSeason(slot) {
  if (CUR && CUR.slot === slot) return CUR.S;
  const S = SE.loadSeason(slot); if (!S) return null;
  CUR = { slot, S }; return S;
}
function persist(S) { if (!SE.saveSeason(S)) toast('Could not save - storage is full'); }
// leaving season mode puts the original database ratings back (next-season drift only lives in the save)
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/season')) SE.restoreBase(); });

export function seasonView(el, args = []) {
  css();
  const [page, a1, a2] = args;
  if (page === 'new') return newView(el, +a1 || 1);
  if (page === 'hub') return hubView(el, +a1 || 1, a2 || 'home');
  return slotsView(el);
}

// ---------------- save slots ----------------
function slotsView(el) {
  const wrap = h('div', { class: 'wrapc sn' }, h('div', { class: 'sn-title' }, h('h1', {}, 'SEASON'), h('div', { class: 'sub' }, 'Three save slots. Pick a club, play or sim every game, and chase a ring in October.')));
  const list = h('div', { class: 'sn-slots' });
  for (const slot of [1, 2, 3]) {
    const S = SE.hasSeason(slot) ? SE.loadSeason(slot) : null;
    if (!S) {
      list.append(h('div', { class: 'sn-slot empty' }, h('div', { class: 'sl' }, 'SLOT ' + slot), h('div', { class: 'gr' }, h('div', { class: 'e1' }, 'EMPTY SLOT'), h('div', { class: 'e2' }, 'Start a new franchise season')),
        h('button', { class: 'btn', onclick: () => go('season/new/' + slot) }, 'NEW SEASON')));
      continue;
    }
    const t = DB.team(S.team), st = standings(S).find(s => s.id === S.team);
    const status = S.champ ? `${S.champ === S.team ? 'WORLD SERIES CHAMPIONS' : 'SEASON COMPLETE  ·  ' + S.champ + ' WON IT ALL'}`
      : S.post ? 'POSTSEASON' : `GAME ${Math.min(S.len, st.g + 1)} OF ${S.len}`;
    list.append(h('div', { class: 'sn-slot' },
      teamBanner(t, h('div', { class: 'rk' }, h('b', {}, `${st.w}-${st.l}`), h('span', {}, `${S.year}  ·  ${status}`))),
      h('div', { class: 'sl' }, 'SLOT ' + slot),
      h('div', { class: 'acts' },
        h('button', { class: 'btn', onclick: () => go(`season/hub/${slot}/home`) }, 'CONTINUE'),
        h('button', { class: 'btn ghost small', onclick: () => confirmBox('DELETE SAVE', `Delete the ${S.year} ${t.name} season in slot ${slot}? This can't be undone.`, 'DELETE', () => { SE.deleteSeason(slot); if (CUR && CUR.slot === slot) CUR = null; slotsView((el.innerHTML = '', el)); }, 'red') }, 'DELETE'))));
  }
  wrap.append(list);
  el.append(topBar('SEASON', ''), wrap);
  setTimeout(() => navFocus(el.querySelector('.sn-slots .btn')), 40);
}

// ---------------- new season ----------------
const NEW = { team: null, len: 162 };
function newView(el, slot) {
  const draw = () => {
    el.innerHTML = '';
    const wrap = h('div', { class: 'wrapc sn' });
    const sel = NEW.team && DB.team(NEW.team);
    let top;
    if (sel) {
      const d = DB.DEPTH[sel.id], ace = DB.player(d.rotation[0]);
      const bat = d.lineup.map(([pid]) => DB.player(pid)).sort((a, b) => b.ovr - a.ovr)[0];
      const r = teamRatings(sel.id);
      top = teamBanner(sel, h('div', { class: 'qp-card-meta' }, h('span', { class: 'ovr' }, h('small', {}, 'OVR'), String(r.ovr)), ratingBars(r)),
        h('div', { class: 'keys' }, h('div', {}, h('small', {}, 'BEST BAT'), DB.full(bat), h('b', {}, String(bat.ovr))), h('div', {}, h('small', {}, 'ACE'), DB.full(ace), h('b', {}, String(ace.ovr))), h('div', {}, h('small', {}, 'DIVISION'), `${sel.lg} ${sel.div}`)));
    } else top = h('div', { class: 'sn-pickhint' }, h('div', { class: 'e1' }, 'PICK YOUR CLUB'), h('div', { class: 'e2' }, 'Tap any club below. All 30 have their real rosters and ballparks.'));
    wrap.append(h('div', { class: 'sn-newtop' }, top,
      h('div', { class: 'sn-newopts' },
        h('div', { class: 'lbl' }, `SLOT ${slot}  ·  ${Settings.diff.toUpperCase()} DIFFICULTY`),
        optRow('LENGTH', SE.LENS.map(n => [n, n + ' G']), NEW.len, v => { NEW.len = +v; draw(); }),
        h('div', { class: 'note' }, NEW.len === 162 ? 'The full real season. Sim it in seconds or play every game.' : NEW.len === 81 ? 'Half a season.' : NEW.len === 52 ? 'About a third of a season.' : 'A quick sprint to October.'),
        h('button', { class: 'btn sn-start', ...(sel ? {} : { disabled: '' }), onclick: start }, sel ? 'START SEASON' : 'PICK A CLUB'))));
    wrap.append(h('div', { class: 'panel sn-pick' }, h('h3', {}, 'SELECT YOUR CLUB'),
      divisionGrid(NEW.team, id => { const y = el.scrollTop; NEW.team = id; draw(); el.scrollTop = y; el.scrollTo({ top: 0, behavior: 'smooth' }); navFocus(el.querySelector('.sn-start'), true); }, { sub: t => 'OVR ' + DB.teamOvr(t.id) })));
    el.append(topBar('NEW SEASON', 'season'), wrap);
  };
  const start = () => {
    if (!NEW.team) return;
    const S = SE.newSeason(slot, NEW.team, NEW.len);
    SE.applyMods(S); persist(S); CUR = { slot, S };
    go(`season/hub/${slot}/home`);
  };
  draw();
}

// ---------------- hub ----------------
const TABS = [['home', 'HOME'], ['standings', 'STANDINGS'], ['schedule', 'SCHEDULE'], ['stats', 'STATS'], ['roster', 'ROSTER']];
function hubView(el, slot, tab) {
  const S = getSeason(slot);
  if (!S) return go('season');
  SE.applyMods(S);
  const ctx = {
    S, slot, tab, el,
    draw: () => { const y = el.scrollTop; el.innerHTML = ''; hubView(el, slot, tab); el.scrollTop = y; },
    save: () => persist(S),
    go: t => go(`season/hub/${slot}/${t}`),
    reset: N => { CUR = { slot, S: N }; },
  };
  const t = DB.team(S.team), st = standings(S), me = st.find(s => s.id === S.team);
  const div = divisions(st).find(d => d.lg === t.lg && d.div === t.div), place = div.teams.indexOf(me) + 1;
  const tabs = [...TABS]; if (S.post) tabs.push(['post', 'POSTSEASON']); if (S.champ) tabs.push(['champ', 'AWARDS']);
  const status = S.champ ? `${S.year} SEASON COMPLETE` : S.post ? `${S.year} POSTSEASON` : SE.seasonOver(S) ? 'REGULAR SEASON FINAL' : `GAME ${me.g + 1} OF ${S.len}`;
  const nav = h('div', { class: 'nav sn-tabs' }, h('i', { class: 'ind' }), tabs.map(([k, l]) => h('button', { class: k === tab ? 'on' : '', 'data-k': k, onclick: () => ctx.go(k) }, h('span', {}, l))));
  const root = h('div', { class: 'sn', ...tv(t) });
  root.append(topBar(S.year + ' SEASON', 'season'),
    h('div', { class: 'sn-head' }, h('div', { class: 'in' },
      h('div', { class: 'id' }, badge(t, 46), h('div', { class: 'tt' }, h('div', { class: 'tn' }, t.city + ' ' + t.name),
        h('div', { class: 'ts' }, me.g ? h('b', {}, `${me.w}-${me.l}`) : null, me.g ? `${ord(place)} ${t.lg} ${t.div}  ·  ${status}` : `${t.lg} ${t.div}  ·  OPENING DAY`))),
      nav)));
  const body = h('div', { class: 'wrapc sn-body' });
  root.append(body); el.append(root);
  const view = { home: homeTab, standings: standingsTab, schedule: scheduleTab, stats: statsTab, roster: rosterTab, post: postTab, champ: champTab }[tab] || homeTab;
  ctx.play = () => playUser(ctx); ctx.simTo = (n, label) => simDays(ctx, n, label);
  body.append(view(ctx));
  // tab change: slide the gold marker from the old tab to the new one and ease the new page in
  const idx = tabs.findIndex(([k]) => k === tab), prev = LAST_TAB.slot === slot ? LAST_TAB.idx : -1;
  const btn = nav.querySelector('button.on'), ind = nav.querySelector('.ind');
  const place_ = (b, anim) => { if (!b) return; ind.style.transition = anim ? '' : 'none'; ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft}px) skewX(-10deg)`; };
  const from = prev >= 0 && prev !== idx ? nav.querySelectorAll('button')[prev] : null;
  place_(from || btn, false);
  if (from) { void ind.offsetWidth; requestAnimationFrame(() => place_(btn, true)); body.style.setProperty('--dx', (idx > prev ? 18 : -18) + 'px'); body.classList.add('enter'); }
  if (btn && (btn.offsetLeft + btn.offsetWidth > nav.scrollLeft + nav.clientWidth || btn.offsetLeft < nav.scrollLeft)) nav.scrollLeft = btn.offsetLeft - 20;
  LAST_TAB = { slot, idx };
}
let LAST_TAB = { slot: 0, idx: -1 };

// ---------------- HOME ----------------
function sideBox(S, team, sp, label) {
  const t = DB.team(team), s = standings(S).find(x => x.id === team), p = DB.player(sp), q = pline(S.pit[sp]);
  return h('div', { class: 'qp-mini', ...tv(t) }, h('div', { class: 'wm' }, badge(t, 150)),
    h('div', { class: 'tag' + (label === 'YOU' ? ' you' : '') }, label), badge(t, 58),
    h('div', { class: 'tx' }, h('div', { class: 'nm' }, t.name), h('div', { class: 'rec' }, `${s.w}-${s.l}`),
      h('div', { class: 'sp' }, h('small', {}, 'SP'), DB.nm(p), h('span', {}, q.g ? `${q.w}-${q.l}, ${fmtERA(q.era)} ERA` : `OVR ${p?.ovr ?? '-'}`))));
}
const matchup = (S, at, ht, spA, spH) => h('div', { class: 'sn-mu' }, sideBox(S, at, spA, at === S.team ? 'YOU' : 'AWAY'), h('div', { class: 'vs' }, 'VS'), sideBox(S, ht, spH, ht === S.team ? 'YOU' : 'HOME'));
const timeOf = (S, day) => { const d = dateOf(S.year, day, S.len); return d.dow === 'SUN' || (d.dow === 'SAT' && day % 2) ? 'day' : 'night'; };
function nextCard(ctx) {
  const S = ctx.S, gi = SE.userGameIdx(S, S.day); if (gi < 0) return null;
  const g = S.games[gi], at = SE.tid(g[1]), ht = SE.tid(g[2]), dt = dateOf(S.year, S.day, S.len);
  const spA = SE.probable(S, at, S.day), spH = SE.probable(S, ht, S.day);
  return h('div', { class: 'panel sn-next' },
    h('div', { class: 'when' }, h('b', {}, 'NEXT GAME'), h('span', {}, `${dt.dow} ${dt.short}  ·  ${timeOf(S, S.day) === 'day' ? 'DAY GAME' : 'NIGHT GAME'}  ·  ${DB.park(ht).name}`)),
    matchup(S, at, ht, spA, spH),
    h('div', { class: 'sn-acts' },
      h('button', { class: 'btn', onclick: ctx.play }, 'PLAY'),
      h('button', { class: 'btn ghost', onclick: () => ctx.simTo(1) }, 'SIM GAME'),
      h('button', { class: 'btn ghost', onclick: () => ctx.simTo(7) }, 'SIM WEEK'),
      h('button', { class: 'btn ghost', onclick: () => confirmBox('SIM TO END', 'Sim the rest of the regular season? You can still play the postseason.', 'SIM IT', () => ctx.simTo(1e9, 'end')) }, 'SIM TO END')));
}
function myResults(S, n = 5) {
  const out = [];
  for (let i = S.games.length - 1; i >= 0 && out.length < n; i--) { const g = S.games[i]; if (g[3] != null && (SE.tid(g[1]) === S.team || SE.tid(g[2]) === S.team)) out.push(i); }
  return out;
}
export function resultRow(S, gi, onOpen) {
  const g = S.games[gi], home = SE.tid(g[2]) === S.team, opp = SE.tid(home ? g[1] : g[2]), my = home ? g[4] : g[3], th = home ? g[3] : g[4];
  const dt = dateOf(S.year, g[0], S.len), won = my > th, played = g[3] != null;
  return h('button', { class: 'opt sn-row', onclick: () => onOpen(gi) },
    h('span', { class: 'sm', style: 'min-width:54px' }, dt.short), badge(DB.team(opp), 26),
    h('span', { class: 'gr nm' }, (home ? 'vs ' : '@ ') + opp),
    played ? h('span', { class: won ? 'sn-w' : 'sn-l' }, `${won ? 'W' : 'L'} ${my}-${th}`) : h('span', { class: 'sm' }, gi === SE.nextUserGame(S) ? 'NEXT' : ''));
}
export function openBox(S, gi) {
  const b = S.boxes.find(x => x.gi === gi);
  if (b) boxScore(b); else toast(S.games[gi][3] == null ? 'Not played yet' : 'Only your last 60 box scores are kept');
}
function teamLeaders(S) {
  const mine = pid => (S.own && pid in S.own ? S.own[pid] : DB.player(pid)?.t) === S.team;
  const pick = (cat, pitch) => { const l = leaders(S, cat, { n: 400, pitch }).filter(x => mine(x.pid)); return l[0]; };
  const rows = [['AVG', pick('avg'), v => v.toFixed(3).replace(/^0/, '')], ['HR', pick('hr'), v => v], ['RBI', pick('rbi'), v => v], ['W', pick('w', true), v => v], ['ERA', pick('era', true), v => v.toFixed(2)], ['SV', pick('sv', true), v => v]];
  return h('div', { class: 'panel' }, h('h3', { style: 'margin-bottom:6px' }, 'TEAM LEADERS'),
    rows.map(([k, x, f]) => h('div', { class: 'sn-lr' }, h('span', { class: 'k', style: 'width:34px' }, k), x ? h('button', { class: 'opt sn-link', onclick: () => playerCard(S, x.pid) }, nm(x.pid)) : h('span', { class: 'muted' }, '-'), h('span', { class: 'v' }, x ? String(f(x.v)) : ''))));
}
function homeTab(ctx) {
  const S = ctx.S, out = h('div', { class: 'grid' });
  const st = standings(S), me = st.find(s => s.id === S.team), t = DB.team(S.team);
  if (!SE.seasonOver(S)) out.append(nextCard(ctx));
  else if (!S.post) {
    out.append(h('div', { class: 'panel sn-champ' }, h('div', { class: 'yr' }, 'REGULAR SEASON COMPLETE'),
      h('div', { class: 'big' }, `${me.w}-${me.l}`), h('div', { class: 'muted' }, 'Twelve clubs move on. Division winners and three wild cards per league.'),
      h('div', { class: 'row', style: 'justify-content:center;margin-top:14px' }, h('button', { class: 'btn', onclick: () => startPostseason(ctx) }, 'START POSTSEASON'))));
  } else if (!S.champ) out.append(postCardHome(ctx));
  else out.append(h('div', { class: 'panel sn-champ', ...tv(DB.team(S.champ)) }, badge(DB.team(S.champ), 90), h('div', { class: 'yr' }, `${S.year} WORLD SERIES CHAMPIONS`), h('div', { class: 'big' }, DB.teamName(DB.team(S.champ))),
    h('div', { class: 'row', style: 'justify-content:center;margin-top:12px' }, h('button', { class: 'btn', onclick: () => ctx.go('champ') }, 'AWARDS + NEXT SEASON'))));
  // record panel
  const div = divisions(st).find(d => d.lg === t.lg && d.div === t.div), place = div.teams.indexOf(me) + 1;
  out.append(h('div', { class: 'panel sn-kvp' }, h('div', { class: 'sn-kv' },
    h('div', {}, h('b', {}, `${me.w}-${me.l}`), h('span', {}, 'RECORD')),
    h('div', {}, h('b', {}, place === 1 ? '1ST' : String(me.gb)), h('span', {}, place === 1 ? t.div + ' LEADER' : 'GAMES BACK')),
    h('div', {}, h('b', {}, me.strk), h('span', {}, 'STREAK')),
    h('div', {}, h('b', {}, (me.diff > 0 ? '+' : '') + me.diff), h('span', {}, 'RUN DIFF')))));
  const res = myResults(S);
  const cols = h('div', { class: 'sn-cols' });
  cols.append(h('div', { class: 'panel' }, h('h3', { style: 'margin-bottom:8px' }, 'LAST RESULTS'),
    res.length ? res.map(gi => resultRow(S, gi, i => openBox(S, i))) : h('div', { class: 'muted' }, 'No games played yet.')));
  cols.append(h('div', { class: 'panel' }, h('h3', { style: 'margin-bottom:6px' }, `${t.lg} ${t.div}`),
    h('table', { class: 't sn-mini' }, h('tr', {}, h('th', {}, 'TEAM'), h('th', { class: 'n' }, 'W'), h('th', { class: 'n' }, 'L'), h('th', { class: 'n' }, 'GB'), h('th', { class: 'n' }, 'L10')),
      div.teams.map(s => h('tr', { class: s.id === S.team ? 'me' : '' }, h('td', { class: 'tm' }, h('span', {}, badge(DB.team(s.id), 20), s.id)), h('td', { class: 'n' }, String(s.w)), h('td', { class: 'n' }, String(s.l)), h('td', { class: 'n' }, s.gb ? String(s.gb) : '-'), h('td', { class: 'n' }, s.l10))))));
  cols.append(teamLeaders(S));
  out.append(cols);
  return out;
}
function postCardHome(ctx) {
  const S = ctx.S, s = PO.userSeries(S);
  if (!s) return h('div', { class: 'panel sn-champ' }, h('div', { class: 'yr' }, `${S.year} POSTSEASON  ·  ${PO.ROUNDS[S.post.round]}`),
    h('div', { class: 'muted', style: 'margin:8px 0' }, PO.seedOf(S.post, S.team) ? 'Your club is out. Watch the rest of October play out.' : 'Your club missed the postseason this year.'),
    h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn', onclick: () => ctx.go('post') }, 'OPEN BRACKET')));
  return postGameCard(ctx, s);
}
export function postGameCard(ctx, s) {
  const S = ctx.S, [at, ht] = PO.nextGame(s), day = S.days + S.post.day, pd = postDate(S.year, S.post.day);
  const spA = SE.probable(S, at, day), spH = SE.probable(S, ht, day);
  const lead = s.w[0] === s.w[1] ? `SERIES TIED ${s.w[0]}-${s.w[1]}` : `${s.w[0] > s.w[1] ? s.hi : s.lo} LEADS ${Math.max(...s.w)}-${Math.min(...s.w)}`;
  return h('div', { class: 'panel sn-next' },
    h('div', { class: 'when' }, h('b', {}, PO.ROUNDS[s.r]), h('span', {}, `GAME ${s.g.length + 1}  ·  ${lead}  ·  ${pd.dow} ${pd.short}`)),
    matchup(S, at, ht, spA, spH),
    h('div', { class: 'sn-acts' },
      h('button', { class: 'btn', onclick: ctx.play }, 'PLAY'),
      h('button', { class: 'btn ghost', onclick: () => postSim(ctx, 'day') }, 'SIM GAME'),
      h('button', { class: 'btn ghost', onclick: () => postSim(ctx, 'series') }, 'SIM SERIES'),
      h('button', { class: 'btn ghost', onclick: () => ctx.go('post') }, 'BRACKET')));
}
export function startPostseason(ctx) {
  const S = ctx.S; if (S.post) return ctx.go('post');
  PO.startPost(S); S.awards = awards(S); ctx.save();
  const in_ = PO.seedOf(S.post, S.team);
  toast(in_ ? `You are the ${ord(in_)} seed. October baseball.` : 'Missed the cut this year', 2600);
  ctx.go('post');
}
// postseason sims: 'day' = one day, 'series' = until the user's series ends, 'round', 'all'
export function postSim(ctx, how) {
  const S = ctx.S, P = S.post; if (!P || P.done) return;
  if (how === 'day') PO.postDay(S);
  else if (how === 'series') { const s = PO.userSeries(S); while (!P.done && s && !s.win) PO.postDay(S); }
  else if (how === 'round') PO.simRound(S);
  else PO.simPostAll(S);
  ctx.save();
  if (S.champ) { ctx.go('champ'); return; }
  ctx.draw();
}

// ---------------- play + sim ----------------
async function playUser(ctx) {
  const S = ctx.S, post = !!S.post;
  let at, ht, day, series = null;
  if (post) { series = PO.userSeries(S); if (!series) return; [at, ht] = PO.nextGame(series); day = S.days + S.post.day; }
  else { const gi = SE.userGameIdx(S, S.day); if (gi < 0) return; const g = S.games[gi]; at = SE.tid(g[1]); ht = SE.tid(g[2]); day = S.day; }
  const a = SE.sideFor(S, at, day), hm = SE.sideFor(S, ht, day);
  const simOpts = SE.gameOpts(S, a, hm, day, post ? { ghost: false } : {});
  for (const s of [a, hm]) { s.bullpen = s.bullpen.filter(p => !simOpts.tired.includes(p)); if (simOpts.tired.includes(s.closer)) s.closer = null; }
  let box = null;
  try {
    const { playLive } = await import('../game/game.js');
    box = await playLive({ away: a, home: hm, park: ht, time: post ? 'night' : timeOf(S, day), user: at === S.team ? 'away' : 'home', innings: 9, mode: 'season', state: null, simOpts });
  } catch (e) {
    console.warn('live game unavailable, simming', e);
    box = simGame(a, hm, simOpts);
    toast('3D game not ready yet - your game was simmed', 2600);
  }
  if (!box || !box.final) { ctx.draw(); return; }
  if (post) { PO.postDay(S, box); } else SE.simDay(S, box);
  ctx.save();
  showResult(ctx, box);
}
function showResult(ctx, box) {
  const S = ctx.S, side = box.home === S.team ? 1 : 0, won = box.score[side] > box.score[1 - side];
  if (S.champ) { ctx.go('champ'); return; }
  ctx.draw();
  const m = modal('');
  const A = DB.team(box.away), H = DB.team(box.home);
  m.el.append(h('h2', { class: won ? 'sn-w' : 'sn-l' }, won ? 'WIN' : 'LOSS'),
    h('div', { style: "font:900 italic 34px 'Barlow Condensed'" }, `${A.id} ${box.score[0]} - ${box.score[1]} ${H.id}`),
    box.pog ? h('div', { class: 'muted', style: 'margin-top:6px' }, 'Player of the game: ' + DB.full(DB.player(box.pog))) : null,
    h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn small', onclick: () => m.close() }, 'CONTINUE'), h('button', { class: 'btn ghost small', onclick: () => { m.close(); boxScore(box); } }, 'BOX SCORE')));
  setTimeout(() => m.el.querySelector('.btn')?.classList.add('focus'), 30);
}
// Sim n days in chunks so the page stays responsive. Shows a progress modal for long sims.
function simDays(ctx, n, label) {
  const S = ctx.S, end = Math.min(S.days, S.day + n), total = end - S.day;
  if (total <= 0) return;
  if (total <= 7) { while (S.day < end) SE.simDay(S); ctx.save(); afterSim(ctx, total); return; }
  const m = modal('', { locked: true }); let stop = false;
  const bar = h('u'), txt = h('div', { class: 'muted' }, '');
  m.el.append(h('h2', {}, 'SIMULATING'), txt, h('div', { class: 'sn-prog' }, bar), h('button', { class: 'btn ghost small', onclick: () => { stop = true; } }, 'STOP'));
  const t0 = performance.now();
  const step = () => {
    const until = performance.now() + 40;
    while (S.day < end && performance.now() < until && !stop) SE.simDay(S);
    const done = total - (end - S.day);
    bar.style.width = (100 * done / total).toFixed(1) + '%';
    const d = dateOf(S.year, Math.min(S.day, S.days - 1), S.len);
    txt.textContent = `${d.short}  ·  day ${S.day} of ${S.days}`;
    if (S.day < end && !stop) return setTimeout(step, 0);
    console.log(`sim ${done} days in ${(performance.now() - t0).toFixed(0)} ms`);
    ctx.save(); m.close(); afterSim(ctx, done);
  };
  step();
}
function afterSim(ctx, days) {
  const S = ctx.S;
  if (SE.seasonOver(S)) { toast('Regular season complete'); ctx.go('home'); ctx.draw(); return; }
  const last = myResults(S, Math.min(days, 7)).reverse();
  if (days === 1 && last.length) { const g = S.games[last[0]], home = SE.tid(g[2]) === S.team, my = home ? g[4] : g[3], th = home ? g[3] : g[4]; toast(`${my > th ? 'WIN' : 'LOSS'} ${my}-${th}`); }
  else if (last.length) { let w = 0; for (const gi of last) { const g = S.games[gi], home = SE.tid(g[2]) === S.team; if ((home ? g[4] : g[3]) > (home ? g[3] : g[4])) w++; } toast(`Went ${w}-${last.length - w}`); }
  ctx.draw();
}
