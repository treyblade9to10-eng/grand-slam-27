// MLB Grand Slam 27 - app shell: router, title, quick play setup, controls guide, settings
import { h, $, $$, esc, toast, badge, menuNav, modal, tv, teamVars, teamRatings, ratingBars, divisionGrid, navFocus } from './ui.js';
import { Settings, saveSettings, loadRaw, saveRaw, has } from './store.js';
import * as DB from './db.js';
import { preloadLogos } from './logos.js';
import { goLandscape } from './orient.js';

export const VERSION = document.querySelector('.ver')?.textContent || '';
const Views = {};
export function register(name, fn) { Views[name] = fn; }
export function go(path) { location.hash = '#/' + path; }
const app = $('#app');
export function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = parts[0] || 'title';
  const v = Views[name] || Views.title;
  app.innerHTML = ''; app.scrollTop = 0;
  if (window.__titleBg && name !== 'title') { window.__titleBg.stop(); window.__titleBg = null; }
  if (name === 'season' && parts[1] === 'hub' && +parts[2]) saveRaw('last_slot', +parts[2]); // title CONTINUE tile
  v(app, parts.slice(1));
}
window.addEventListener('hashchange', render);

export function topBar(title, back = '') {
  return h('div', { class: 'top' }, h('div', { class: 'in' },
    h('div', { class: 'brand', onclick: () => go('') }, h('span', {}, 'GRAND SLAM'), h('b', {}, '27')),
    h('div', { class: 'right' }, title ? h('span', { class: 'pill' }, title) : null,
      back !== null ? h('button', { class: 'btn ghost small', onclick: () => back ? go(back) : history.length > 1 ? history.back() : go('') }, 'BACK') : null)));
}

// ---------------- title ----------------
// Show-style main menu: wordmark top left, "tonight at" park chip top right (the flyover's park),
// a row of mode tiles along the bottom (PLAY NOW is the big featured one). Line-art SVGs, no images.
const ART = {
  season: '<svg viewBox="0 0 120 120"><path d="M60 22 98 60 60 98 22 60Z"/><path d="M60 98 30 68M60 98 90 68" opacity=".5"/><rect x="55" y="17" width="10" height="10" transform="rotate(45 60 22)"/><rect x="93" y="55" width="10" height="10" transform="rotate(45 98 60)"/><rect x="17" y="55" width="10" height="10" transform="rotate(45 22 60)"/><circle cx="60" cy="62" r="5"/></svg>',
  derby: '<svg viewBox="0 0 160 120"><path d="M14 112C40 30 104 4 150 34" stroke-dasharray="2 9"/><circle cx="150" cy="34" r="6"/><path d="M96 112V70h58" opacity=".5"/><path d="M96 82h58M96 94h58" opacity=".22"/></svg>',
  controls: '<svg viewBox="0 0 120 80"><path d="M34 14h52c14 0 22 10 26 26l4 18c2 10-10 18-18 10L86 56H34L22 68C14 76 2 68 4 58l4-18C12 24 20 14 34 14Z"/><path d="M32 30v16M24 38h16"/><circle cx="84" cy="32" r="3.5"/><circle cx="94" cy="42" r="3.5"/><circle cx="74" cy="42" r="3.5"/><circle cx="84" cy="52" r="3.5"/></svg>',
  settings: '<svg viewBox="0 0 120 80"><path d="M12 20h96M12 40h96M12 60h96" opacity=".45"/><rect x="66" y="13" width="10" height="14" rx="2"/><rect x="30" y="33" width="10" height="14" rx="2"/><rect x="84" y="53" width="10" height="14" rx="2"/></svg>',
};
const WHEN = { day: 'THIS AFTERNOON', dusk: 'THIS EVENING', night: 'TONIGHT' };
// the season slot to offer on CONTINUE: the last one opened, else the first slot with a save
function continueSlot() {
  const last = loadRaw('last_slot', 0), ok = s => has('season_' + s);
  return ok(last) ? last : [1, 2, 3].find(ok) || 0;
}
register('title', async (el) => {
  const bg = h('div', { class: 'bgc' });
  const live = h('div', { class: 'tm-live' });
  const A = DB.team(QP.away), H = DB.team(QP.home);
  const tx = (k, t, s) => h('div', { class: 'tm-tx' }, h('div', { class: 'tm-k' }, k), h('div', { class: 't' }, t), s != null ? h('div', { class: 'tm-s' }, s) : null);
  const art = k => h('div', { class: 'tm-art', html: ART[k] });
  let i = 0;
  const tile = (k, cls, ...kids) => {
    const b = h('button', { class: 'tm-tile nv ' + cls, 'data-k': k, style: `--i:${i++}`, onclick: () => go(b.dataset.go || k) }, ...kids, h('i', { class: 'bar' }));
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') navFocus(b, true); });
    return b;
  };
  // PLAY NOW: the current quick-play matchup on two club-colored panels
  const play = tile('play', 'feat',
    h('div', { class: 'tm-mu' },
      h('div', { class: 'p a', ...tv(A) }, h('div', { class: 'lg' }, badge(A, 92))),
      h('div', { class: 'p h', ...tv(H) }, h('div', { class: 'lg' }, badge(H, 92))),
      h('b', { class: 'vs' }, 'VS')),
    tx('QUICK GAME', 'PLAY NOW', `${A.name} at ${H.name}  ·  ${DB.park(QP.park || QP.home).name}`));
  // SEASON: CONTINUE with the club, record and progress when a save exists
  const slot = continueSlot();
  const season = slot
    ? tile('season', 'season has', h('div', { class: 'tm-wm' }), tx('CONTINUE', 'SEASON', ''))
    : tile('season', 'season', art('season'), tx('FRANCHISE', 'SEASON', '20 to 162 games, then October'));
  const best = Object.values(loadRaw('derby_best', {}) || {}).reduce((m, b) => b && b.hr > (m?.hr ?? -1) ? b : m, null);
  const derby = tile('derby', 'derby', art('derby'),
    tx('10 OUTS', 'HOME RUN DERBY', best ? `Best: ${best.hr} HR  ·  ${best.long} ft` : 'Launch as many as you can'));
  const small = h('div', { class: 'tm-small' },
    tile('controls', 'mini', art('controls'), tx('HOW TO PLAY', 'CONTROLS')),
    tile('settings', 'mini', art('settings'), tx('OPTIONS', 'SETTINGS')));
  el.append(h('div', { class: 'title tm' }, bg, h('div', { class: 'shade' }),
    h('div', { class: 'tm-top' },
      h('h1', { class: 'tm-logo', 'aria-label': 'MLB Grand Slam 27' }, h('span', { class: 'mlb' }, 'MLB'), h('span', { class: 'gs' }, 'GRAND SLAM'), h('span', { class: 'n' }, '27')),
      live),
    h('div', { class: 'tm-tiles' }, play, season, derby, small),
    h('div', { class: 'tm-foot' },
      h('span', {}, h('span', { class: 'x' }, 'ALL 30 CLUBS  ·  '), `REAL ROSTERS AS OF ${DB.DATA_DATE}`, h('span', { class: 'x' }, '  ·  ALL 30 BALLPARKS')),
      h('span', { class: 'v' }, VERSION))));
  setTimeout(() => navFocus(play, true), 40);
  if (!Settings.favAsked) setTimeout(() => { if (document.contains(play)) pickFavorite(id => { if (id) render(); }); }, 700);
  if (slot) import('./season/season.js').then(async SE => {
    const { standings } = await import('./season/stats.js');
    const S = SE.loadSeason(slot); if (!S || !document.contains(season)) return;
    const t = DB.team(S.team), st = standings(S).find(s => s.id === S.team) || { w: 0, l: 0, g: 0 };
    const status = S.champ ? (S.champ === S.team ? 'WORLD SERIES CHAMPS' : 'SEASON COMPLETE') : S.post ? 'POSTSEASON' : `GAME ${Math.min(S.len, st.g + 1)} OF ${S.len}`;
    season.setAttribute('style', season.getAttribute('style') + ';' + teamVars(t)); season.dataset.tv = t.id;
    season.querySelector('.tm-wm').append(badge(t, 220));
    season.querySelector('.tm-s').replaceChildren(h('span', { class: 'lg' }, badge(t, 34)), h('span', { class: 'rec' }, `${st.w}-${st.l}`), h('span', {}, status));
    season.dataset.go = `season/hub/${slot}/home`;
  }).catch(e => console.warn(e));
  try {
    const m = await import('./game/titlebg.js');
    if (!document.contains(bg)) return;
    const tb = window.__titleBg = m.titleBg(bg, Settings.fav && DB.team(Settings.fav) ? Settings.fav : null);
    if (tb.id) live.append(h('span', { class: 'k' }, WHEN[tb.time] || 'TONIGHT'), h('span', { class: 'pk' }, DB.park(tb.id).name), badge(DB.team(tb.id), 26));
    live.classList.add('on');
  } catch (e) { console.warn(e); }
});

// ---------------- quick play setup ----------------
// MLB The Show style matchup screen: away card | VS | home card. Arrows, swipes or the 30-club grid change a side;
// the card slides out / in (transform + opacity only). Options strip + PLAY BALL underneath.
const rnd5 = () => Math.random() * 5 | 0;
const QP = { away: 'LAD', home: 'NYY', user: 'home', time: 'night', park: null, innings: Settings.innings, sp: { away: rnd5(), home: rnd5() } };
// biggest rival for each club: PLAY NOW starts as favorite (home) vs rival (away)
export const RIVAL = { NYY: 'BOS', BOS: 'NYY', LAD: 'SF', SF: 'LAD', CHC: 'STL', STL: 'CHC', NYM: 'PHI', PHI: 'NYM', ATL: 'NYM', MIA: 'TB', TB: 'MIA',
  WSH: 'BAL', BAL: 'WSH', CWS: 'CHC', CLE: 'DET', DET: 'CLE', KC: 'STL', MIN: 'MIL', MIL: 'MIN', CIN: 'CLE', PIT: 'PHI', HOU: 'TEX', TEX: 'HOU',
  SEA: 'SD', SD: 'LAD', ATH: 'SF', LAA: 'LAD', AZ: 'LAD', COL: 'AZ', TOR: 'NYY' };
function favMatchup() { const f = Settings.fav; if (!f || !DB.team(f)) return; QP.home = f; QP.away = RIVAL[f] || 'LAD'; QP.park = null; QP.user = 'home'; }
favMatchup();
// favorite-team picker (first visit, and from Settings)
export function pickFavorite(after) {
  const m = modal('', { locked: true }); m.el.classList.add('pickm', 'favm');
  const finish = (id) => { Settings.favAsked = 1; if (id) Settings.fav = id; saveSettings(); m.close(); if (id) favMatchup(); after && after(id); };
  m.el.append(h('div', { class: 'pickh' }, h('div', {}, h('h2', {}, 'WOULD YOU LIKE TO SET YOUR FAVORITE TEAM?'),
      h('div', { class: 'favsub' }, 'Your ballpark shows on the main menu, and PLAY NOW starts with your team at home against its rival.')),
    h('button', { class: 'btn ghost small', onclick: () => finish(null) }, 'NOT NOW')),
    divisionGrid(Settings.fav, id => finish(id), { sub: t => t.name.toUpperCase() }));
  setTimeout(() => navFocus(m.el.querySelector('.tbtn.on') || m.el.querySelector('.tbtn')), 30);
}
const TEAM_ORDER = () => DB.TEAMS.slice().sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name)).map(t => t.id);
const other = side => side === 'away' ? 'home' : 'away';
const chev = d => h('span', { class: 'chev' + (d < 0 ? ' l' : '') });
function matchCard(side) {
  const t = DB.team(QP[side]), r = teamRatings(t.id), d = DB.DEPTH[t.id];
  const sp = d && DB.player(d.rotation[QP.sp[side] % d.rotation.length]);
  return h('div', { class: 'qp-card', ...tv(t) },
    h('div', { class: 'wm' }, badge(t, 300)),
    h('div', { class: 'logo' }, badge(t, 120)),
    h('div', { class: 'tx' },
      h('div', { class: 'city' }, t.city),
      h('div', { class: 'name' }, t.name),
      h('div', { class: 'meta' }, h('span', { class: 'ovr' }, h('small', {}, 'OVR'), String(r.ovr)), ratingBars(r)),
      sp ? h('div', { class: 'sp' }, h('small', {}, 'SP'), DB.full(sp), h('b', {}, String(sp.ovr))) : null));
}
register('play', (el) => {
  const ctlLabel = side => QP.user === 'both' || QP.user === side ? 'YOU' : 'CPU';
  const sideEl = side => {
    const slot = h('div', { class: 'qp-slot nv', title: 'Tap for all 30 clubs' }, matchCard(side));
    const s = h('div', { class: 'qp-side ' + side },
      h('div', { class: 'qp-tag' }, h('span', {}, side === 'away' ? 'AWAY' : 'HOME'), h('b', { class: 'ctl' }, ctlLabel(side))),
      slot,
      h('button', { class: 'qp-arr prev nv', 'aria-label': 'Previous club', onclick: () => cycle(side, -1) }, chev(-1)),
      h('button', { class: 'qp-arr next nv', 'aria-label': 'Next club', onclick: () => cycle(side, 1) }, chev(1)));
    swipe(slot, side);
    return s;
  };
  // swipe a card left / right to change club, tap it for the grid
  const swipe = (slot, side) => {
    let sx = 0, sy = 0, dx = 0, drag = false, id = null, moved = false;
    slot.addEventListener('pointerdown', e => { id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = 0; drag = false; moved = false; });
    slot.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      dx = e.clientX - sx; const dy = e.clientY - sy;
      if (!drag && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) { drag = true; moved = true; try { slot.setPointerCapture(id); } catch (er) { } }
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
      if (drag) { const c = slot.querySelector('.qp-card:not(.out)'); if (c) { c.style.transition = 'none'; c.style.transform = `translateX(${dx * 0.55}px)`; c.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / 500)); } }
    });
    const end = e => {
      if (e.pointerId !== id) return; id = null;
      const c = slot.querySelector('.qp-card:not(.out)');
      if (drag && c) { c.style.transition = ''; c.style.opacity = ''; if (Math.abs(dx) > 45) cycle(side, dx < 0 ? 1 : -1); else c.style.transform = ''; }
      drag = false;
    };
    slot.addEventListener('pointerup', end); slot.addEventListener('pointercancel', end);
    slot.addEventListener('click', () => { if (!moved) pickGrid(side); moved = false; });
  };
  const swapCard = (side, dir) => {
    const slot = el.querySelector('.qp-side.' + side + ' .qp-slot'); if (!slot) return;
    slot.querySelectorAll('.qp-card.out').forEach(e => e.remove());
    const old = slot.querySelector('.qp-card'), nw = matchCard(side);
    nw.classList.add(dir > 0 ? 'from-r' : dir < 0 ? 'from-l' : 'from-z'); slot.append(nw);
    if (old) { old.style.transform = old.style.transform || ''; old.classList.add('out', dir > 0 ? 'to-l' : dir < 0 ? 'to-r' : 'to-z'); old.style.transform = ''; setTimeout(() => old.remove(), 340); }
    void nw.offsetWidth; nw.classList.remove('from-r', 'from-l', 'from-z');
  };
  const setTeam = (side, id, dir) => {
    if (id === QP[side]) return;
    const o = other(side), swapped = id === QP[o];
    if (swapped) { QP[o] = QP[side]; QP.sp[o] = rnd5(); }
    QP[side] = id; QP.sp[side] = rnd5(); QP.park = null;
    swapCard(side, dir); if (swapped) swapCard(o, -dir || 0);
    drawOpts();
  };
  const cycle = (side, dir) => {
    const ids = TEAM_ORDER(); let i = ids.indexOf(QP[side]);
    do i = (i + dir + ids.length) % ids.length; while (ids[i] === QP[other(side)]);
    setTeam(side, ids[i], dir);
  };
  const pickGrid = side => {
    const m = modal(''); m.el.classList.add('pickm');
    const done = () => { m.close(); navFocus(el.querySelector(`.qp-side.${side} .qp-slot`), true); };
    m.el.append(h('div', { class: 'pickh' }, h('h2', {}, side === 'away' ? 'SELECT AWAY CLUB' : 'SELECT HOME CLUB'),
      h('button', { class: 'btn ghost small', onclick: done }, 'CLOSE')),
      divisionGrid(QP[side], id => { done(); setTeam(side, id, 0); }, { other: QP[other(side)], sub: t => 'OVR ' + DB.teamOvr(t.id) }));
    setTimeout(() => navFocus(m.el.querySelector('.tbtn.on')), 30);
  };
  const opts = h('div', { class: 'qp-opts' });
  const drawOpts = () => {
    const pk = DB.park(QP.park || QP.home);
    for (const s of ['away', 'home']) { const c = el.querySelector(`.qp-side.${s} .ctl`); if (c) { c.textContent = ctlLabel(s); c.classList.toggle('you', ctlLabel(s) === 'YOU'); } }
    const parks = DB.TEAMS.slice().sort((a, b) => DB.park(a.id).name.localeCompare(DB.park(b.id).name)).map(t => t.id);
    const stepPark = d => { const i = parks.indexOf(QP.park || QP.home), n = parks[(i + d + parks.length) % parks.length]; QP.park = n === QP.home ? null : n; drawOpts(); };
    const navs = () => [...opts.querySelectorAll('button')];
    const fi = navs().findIndex(b => b.classList.contains('focus')); // keep keyboard / controller focus across the redraw
    opts.innerHTML = '';
    opts.append(
      h('div', { class: 'qp-row' },
        optRow('YOU CONTROL', [['away', 'AWAY'], ['home', 'HOME'], ['both', 'BOTH'], ['none', 'WATCH CPU']], QP.user, v => { QP.user = v; drawOpts(); }),
        optRow('TIME', [['day', 'DAY'], ['dusk', 'SUNSET'], ['night', 'NIGHT']], QP.time, v => { QP.time = v; drawOpts(); }),
        optRow('INNINGS', [[3, '3'], [5, '5'], [7, '7'], [9, '9']], QP.innings, v => { QP.innings = +v; Settings.innings = +v; saveSettings(); drawOpts(); })),
      h('div', { class: 'qp-row qp-bot' },
        h('div', { class: 'qp-park' },
          h('span', { class: 'lbl' }, 'BALLPARK'),
          h('button', { class: 'qp-step nv', 'aria-label': 'Previous ballpark', onclick: () => stepPark(-1) }, chev(-1)),
          h('div', { class: 'pk' },
            h('select', { 'aria-label': 'Ballpark', onchange: e => { QP.park = e.target.value === QP.home ? null : e.target.value; drawOpts(); } },
              parks.map(id => h('option', { value: id, ...(id === (QP.park || QP.home) ? { selected: '' } : {}) }, DB.park(id).name))),
            h('div', { class: 'pn' }, pk.name),
            h('div', { class: 'pd' }, `${pk.city}  ·  LF ${pk.dims[0]}  CF ${pk.dims[3]}  RF ${pk.dims[6]}  ·  ${pk.roof === 'dome' ? 'DOME' : pk.roof === 'retractable' ? 'RETRACTABLE ROOF' : 'OPEN AIR'}`)),
          h('button', { class: 'qp-step nv', 'aria-label': 'Next ballpark', onclick: () => stepPark(1) }, chev(1))),
        h('button', { class: 'btn qp-play', onclick: startQuick }, 'PLAY BALL')));
    if (fi >= 0) navFocus(navs()[fi], true);
  };
  const randomize = () => {
    const ids = DB.TEAMS.map(t => t.id); let a = ids[Math.random() * 30 | 0], b; do b = ids[Math.random() * 30 | 0]; while (b === a);
    QP.away = a; QP.home = b; QP.sp = { away: rnd5(), home: rnd5() }; QP.park = null; swapCard('away', 1); swapCard('home', 1); drawOpts();
  };
  const swapSides = () => { [QP.away, QP.home] = [QP.home, QP.away]; [QP.sp.away, QP.sp.home] = [QP.sp.home, QP.sp.away]; QP.park = null; swapCard('away', 1); swapCard('home', -1); drawOpts(); };
  const stage = h('div', { class: 'qp-stage' }, sideEl('away'),
    h('div', { class: 'qp-mid' }, h('div', { class: 'qp-vs' }, 'VS'),
      h('button', { class: 'qp-sm nv', onclick: swapSides }, 'SWAP'),
      h('button', { class: 'qp-sm nv', onclick: randomize }, 'RANDOM')),
    sideEl('home'));
  el.append(topBar('PLAY NOW', ''), h('div', { class: 'qp' }, stage, opts));
  drawOpts();
  setTimeout(() => navFocus(el.querySelector('.qp-play')), 40);
});
export function optRow(label, opts, cur, on) {
  return h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'cond', style: 'font:800 16px Barlow Condensed;letter-spacing:.6px;color:var(--mut)' }, label),
    h('div', { class: 'seg' }, opts.map(([v, t]) => h('button', { class: String(v) === String(cur) ? 'on' : '', onclick: () => on(v) }, t))));
}
async function startQuick() {
  goLandscape();
  const { playLive } = await import('./game/game.js');
  const spA = QP.sp.away, spH = QP.sp.home; // the starters shown on the matchup cards
  const box = await playLive({
    away: DB.defaultSide(QP.away, spA), home: DB.defaultSide(QP.home, spH), park: QP.park || QP.home, time: QP.time,
    user: QP.user, innings: QP.innings, mode: 'exhibition',
  });
  render();
  if (box && box.final) showFinal(box);
}
export function showFinal(box) {
  const a = DB.team(box.away), hm = DB.team(box.home);
  modal(`<h2>FINAL</h2><div class="sub">${esc(DB.park(box.park || box.home).name)}</div>
  <div style="font:900 italic 34px 'Barlow Condensed'">${a.id} ${box.score[0]} - ${box.score[1]} ${hm.id}</div>
  <div class="muted" style="margin-top:8px">${box.pog ? 'Player of the game: ' + esc(DB.full(DB.player(box.pog))) : ''}</div>
  <div class="row" style="margin-top:14px"><button class="btn small" onclick="this.closest('.modal-bg').remove()">DONE</button></div>`);
}

// ---------------- controls ----------------
export const CONTROLS = {
  bat: [
    ['Aim your swing (the circle)', 'W A S D or the mouse', 'Left stick', 'Drag your thumb anywhere'],
    ['Normal swing', 'Space, J or left click', 'A', 'SWING button'],
    ['Power swing', 'K or right click', 'B', 'POWER button'],
    ['Bunt', 'L', 'X', 'BUNT button'],
    ['Steal (before the pitch)', 'Q', 'LB', 'STEAL button'],
  ],
  pitch: [
    ['Pick a pitch', '1 2 3 4 5', 'LB / RB (or d-pad left/right)', 'Tap a pitch'],
    ['Aim the pitch', 'W A S D or the mouse', 'Left stick', 'Drag your thumb anywhere'],
    ['Throw with the meter', 'Space to start, Space again in the gold', 'A to start, A again in the gold', 'THROW, then THROW again in the gold'],
  ],
  field: [
    ['Throw to a base (laid out like the diamond)', 'Arrows: Right 1B, Up 2B, Left 3B, Down HOME', 'B 1B, Y 2B, X 3B, A HOME (or the d-pad)', 'Tap the base buttons'],
    ['Throw to the cutoff man', 'C', 'LB', 'CUT button'],
    ['Fielders run to the ball for you', '-', '-', '-'],
  ],
  run: [
    ['Send all runners', 'E', 'RT', 'GO button'],
    ['Send all runners back', 'R', 'LT', 'BACK button'],
  ],
  other: [
    ['Pause / pitching change / sim to end', 'Esc or P', 'Start', 'Pause button (top right)'],
    ['Skip a cutscene', 'Enter', 'A', 'Tap the screen'],
    ['Menus', 'Arrows + Enter, Esc = back', 'D-pad + A, B = back', 'Tap'],
  ],
};
register('controls', (el) => {
  const tbl = (title, rows) => h('div', { class: 'panel' }, h('h3', {}, title),
    h('div', { class: 'scroll-x' }, h('table', { class: 't' }, h('tr', {}, h('th', {}, 'ACTION'), h('th', {}, 'KEYBOARD'), h('th', {}, 'CONTROLLER'), h('th', {}, 'PHONE')),
      rows.map(r => h('tr', {}, r.map((c, i) => h('td', { style: i ? 'white-space:normal' : 'font-weight:700' }, c)))))));
  el.append(topBar('CONTROLS', ''), h('div', { class: 'wrapc' },
    h('h1', {}, 'HOW TO PLAY'),
    h('div', { class: 'sub' }, 'The buttons you need always show on the screen during a game. On ROOKIE, the swing aim follows the ball for you - just time the swing.'),
    h('div', { class: 'grid' },
      tbl('HITTING', CONTROLS.bat), tbl('PITCHING', CONTROLS.pitch), tbl('FIELDING', CONTROLS.field), tbl('BASERUNNING', CONTROLS.run), tbl('EVERYWHERE', CONTROLS.other),
      h('div', { class: 'panel' }, h('h3', {}, 'TIPS'), h('ul', { style: 'margin:6px 0 0 18px;line-height:1.6' },
        h('li', {}, 'Hitting: swing when the ball reaches the front of the plate. Early = pulled foul or a weak grounder, late = opposite field.'),
        h('li', {}, 'Power swings hit it farther but the sweet spot is smaller. Use them when you are ahead in the count.'),
        h('li', {}, 'Pitching: hit the gold part of the meter for a perfect pitch. Miss it and the ball drifts toward the middle.'),
        h('li', {}, 'Tired pitchers (low energy bar) miss more. Make a pitching change from the pause menu.'),
        h('li', {}, 'Fielders run to the ball for you. You just pick where to throw (the base buttons are laid out like the diamond).'))))));
});

// ---------------- settings ----------------
register('settings', (el) => {
  const draw = () => {
    el.innerHTML = '';
    const set = (k, v) => { Settings[k] = v; saveSettings(); draw(); };
    el.append(topBar('SETTINGS', ''), h('div', { class: 'wrapc' }, h('h1', {}, 'SETTINGS'),
      h('div', { class: 'panel grid', style: 'gap:16px;margin-top:12px' },
        h('div', { class: 'favrow' }, h('span', { class: 'lbl' }, 'FAVORITE TEAM'),
          Settings.fav && DB.team(Settings.fav) ? h('span', { class: 'favt', ...tv(DB.team(Settings.fav)) }, badge(DB.team(Settings.fav), 28), DB.team(Settings.fav).name.toUpperCase()) : h('span', { class: 'muted' }, 'NONE'),
          h('button', { class: 'btn small', onclick: () => pickFavorite(() => draw()) }, Settings.fav ? 'CHANGE' : 'SET')),
        optRow('DIFFICULTY', [['rookie', 'ROOKIE'], ['pro', 'PRO'], ['allstar', 'ALL-STAR'], ['legend', 'LEGEND']], Settings.diff, v => set('diff', v)),
        optRow('SWING AIM', [['timing', 'TIMING ONLY'], ['assist', 'ASSISTED'], ['manual', 'MANUAL']], Settings.pci, v => set('pci', v)),
        h('div', { class: 'muted', style: 'font-size:13px;margin-top:-8px' }, 'Timing only: just swing on time. Assisted: you aim, it helps. Manual: full control.'),
        optRow('PITCH METER', [[true, 'ON'], [false, 'OFF']], Settings.pitchMeter, v => set('pitchMeter', v === true || v === 'true')),
        optRow('AUTO THROW', [[true, 'ON'], [false, 'OFF']], Settings.autoThrow, v => set('autoThrow', v === true || v === 'true')),
        optRow('STRIKE ZONE', [[true, 'SHOW'], [false, 'HIDE']], Settings.strikeZone, v => set('strikeZone', v === true || v === 'true')),
        optRow('TEAM LOGOS', [['real', 'REAL'], ['classic', 'CLASSIC']], Settings.logos, v => { set('logos', v); }),
        optRow('FOLLOW THE BALL', [[true, 'ON'], [false, 'OFF']], Settings.camFollow, v => set('camFollow', v === true || v === 'true')),
        optRow('REPLAYS', [[true, 'ON'], [false, 'OFF']], Settings.replays, v => set('replays', v === true || v === 'true')),
        optRow('BASE MAP', [[true, 'ON'], [false, 'OFF']], Settings.minimap, v => set('minimap', v === true || v === 'true')),
        optRow('BATTING CAMERA', [['zone', 'CATCHER VIEW'], ['broadcast', 'BROADCAST']], Settings.camera, v => set('camera', v)),
        optRow('GRAPHICS', [['auto', 'AUTO'], ['high', 'HIGH'], ['fast', 'FAST']], Settings.gfx, v => set('gfx', v)),
        optRow('SOUND', [[true, 'ON'], [false, 'OFF']], Settings.sound, v => set('sound', v === true || v === 'true')),
        optRow('MUSIC', [[true, 'ON'], [false, 'OFF']], Settings.music, v => set('music', v === true || v === 'true')),
      )));
  };
  draw();
});

register('derby', async (el, args) => { const m = await import('./derby.js'); m.derbyView(el, args); });
register('season', async (el, args) => {
  try { const m = await import('./season/ui.js'); m.seasonView(el, args); }
  catch (e) { console.error(e); el.append(topBar('SEASON', ''), h('div', { class: 'wrapc' }, h('h2', {}, 'Season mode is loading in the next update.'))); }
});

menuNav();
preloadLogos(DB.TEAMS, ['primaryDark']);
import('./game/model.js').then(m => m.loadModels()).catch(() => { });
render();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
window.__gs = { DB, Settings, go, render };
