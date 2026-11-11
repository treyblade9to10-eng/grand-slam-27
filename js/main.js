// MLB Grand Slam 27 - app shell: router, title, quick play setup, controls guide, settings
import { h, $, $$, esc, toast, badge, menuNav, modal, tv, teamRatings, ratingBars, divisionGrid, navFocus } from './ui.js';
import { Settings, saveSettings } from './store.js';
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
register('title', async (el) => {
  const bg = h('div', { class: 'bgc' });
  const opts = [
    ['play', 'PLAY NOW', 'Pick any two clubs and play a game in their real ballpark'],
    ['season', 'SEASON', 'Run a club through 20 to 162 games, sim or play every game, chase October'],
    ['derby', 'HOME RUN DERBY', 'Pick a slugger, 10 outs, see how many you can launch'],
    ['controls', 'CONTROLS', 'Keyboard, controller and touch, all on one page'],
    ['settings', 'SETTINGS', 'Difficulty, swing aim, pitch meter, graphics, sound'],
  ];
  el.append(h('div', { class: 'title' }, bg, h('div', { class: 'shade' }),
    h('div', { class: 'in' },
      h('div', { class: 'logo27' }, h('span', { class: 'mlb' }, 'MLB'), h('span', { class: 'gs' }, 'GRAND SLAM'), h('span', { class: 'n' }, '27')),
      h('div', { class: 'muted', style: 'font-size:14px' }, `All 30 clubs, real rosters as of ${DB.DATA_DATE}, all 30 real ballparks.`),
      h('div', { class: 'menu' }, opts.map(([k, t, s]) => h('button', { class: 'opt', onclick: () => go(k) }, h('div', {}, t, h('small', {}, s)))))),
    h('div', { class: 'ver' }, VERSION)));
  setTimeout(() => $('.menu .opt')?.classList.add('focus'), 50);
  try { const m = await import('./game/titlebg.js'); if (document.contains(bg)) window.__titleBg = m.titleBg(bg); } catch (e) { console.warn(e); }
});

// ---------------- quick play setup ----------------
// MLB The Show style matchup screen: away card | VS | home card. Arrows, swipes or the 30-club grid change a side;
// the card slides out / in (transform + opacity only). Options strip + PLAY BALL underneath.
const rnd5 = () => Math.random() * 5 | 0;
const QP = { away: 'LAD', home: 'NYY', user: 'home', time: 'night', park: null, innings: Settings.innings, sp: { away: rnd5(), home: rnd5() } };
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
        optRow('DIFFICULTY', [['rookie', 'ROOKIE'], ['pro', 'PRO'], ['allstar', 'ALL-STAR'], ['legend', 'LEGEND']], Settings.diff, v => set('diff', v)),
        optRow('SWING AIM', [['timing', 'TIMING ONLY'], ['assist', 'ASSISTED'], ['manual', 'MANUAL']], Settings.pci, v => set('pci', v)),
        h('div', { class: 'muted', style: 'font-size:13px;margin-top:-8px' }, 'Timing only: just swing on time. Assisted: you aim, it helps. Manual: full control.'),
        optRow('PITCH METER', [[true, 'ON'], [false, 'OFF']], Settings.pitchMeter, v => set('pitchMeter', v === true || v === 'true')),
        optRow('AUTO THROW', [[true, 'ON'], [false, 'OFF']], Settings.autoThrow, v => set('autoThrow', v === true || v === 'true')),
        optRow('STRIKE ZONE', [[true, 'SHOW'], [false, 'HIDE']], Settings.strikeZone, v => set('strikeZone', v === true || v === 'true')),
        optRow('TEAM LOGOS', [['real', 'REAL'], ['classic', 'CLASSIC']], Settings.logos, v => { set('logos', v); }),
        optRow('FOLLOW THE BALL', [[true, 'ON'], [false, 'OFF']], Settings.camFollow, v => set('camFollow', v === true || v === 'true')),
        optRow('REPLAYS', [[true, 'ON'], [false, 'OFF']], Settings.replays, v => set('replays', v === true || v === 'true')),
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
