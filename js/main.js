// MLB Grand Slam 27 - app shell: router, title, quick play setup, controls guide, settings
import { h, $, $$, esc, toast, badge, menuNav, modal } from './ui.js';
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
const QP = { away: 'LAD', home: 'NYY', user: 'home', time: 'night', park: null, innings: Settings.innings };
function teamPicker(sel, onPick) {
  return h('div', { class: 'tgrid' }, DB.TEAMS.slice().sort((a, b) => a.city.localeCompare(b.city)).map(t => {
    const b = h('button', { class: 'tbtn' + (t.id === sel ? ' on' : ''), onclick: () => onPick(t.id) }, badge(t, 44), t.id);
    return b;
  }));
}
function sideCard(id, label) {
  const t = DB.team(id), ovr = DB.teamOvr(id), d = DB.DEPTH[id];
  const sp = d && DB.player(d.rotation[0]);
  return h('div', { class: 'side', style: `border-top:4px solid ${t.c1}` },
    h('span', { class: 'pill' }, label), badge(t, 84), h('div', { class: 'nm' }, t.city, h('br'), t.name),
    h('div', { class: 'muted cond', style: 'font:800 16px Barlow Condensed' }, 'TEAM OVR ' + ovr + (sp ? '  /  SP ' + DB.nm(sp) : '')));
}
register('play', (el, args) => {
  const draw = () => {
    el.innerHTML = '';
    const wrap = h('div', { class: 'wrapc' });
    const pk = DB.park(QP.park || QP.home);
    wrap.append(
      h('div', { class: 'vs' }, sideCard(QP.away, 'AWAY'), h('div', { class: 'mid' }, 'AT'), sideCard(QP.home, 'HOME')),
      h('div', { class: 'row', style: 'margin:14px 0;justify-content:center' },
        h('button', { class: 'btn ghost small', onclick: () => { [QP.away, QP.home] = [QP.home, QP.away]; QP.park = null; draw(); } }, 'SWAP'),
        h('button', { class: 'btn ghost small', onclick: () => { const ids = DB.TEAMS.map(t => t.id); QP.away = ids[Math.random() * 30 | 0]; do QP.home = ids[Math.random() * 30 | 0]; while (QP.home === QP.away); QP.park = null; draw(); } }, 'RANDOM')),
      h('div', { class: 'panel grid', style: 'gap:14px' },
        optRow('YOU CONTROL', [['away', 'AWAY'], ['home', 'HOME'], ['both', 'BOTH'], ['none', 'WATCH CPU']], QP.user, v => { QP.user = v; draw(); }),
        optRow('TIME', [['day', 'DAY'], ['dusk', 'SUNSET'], ['night', 'NIGHT']], QP.time, v => { QP.time = v; draw(); }),
        optRow('INNINGS', [[3, '3'], [5, '5'], [7, '7'], [9, '9']], QP.innings, v => { QP.innings = +v; Settings.innings = +v; saveSettings(); draw(); }),
        h('label', { class: 'f' }, 'BALLPARK', (() => {
          const s = h('select', { onchange: e => { QP.park = e.target.value === QP.home ? null : e.target.value; draw(); } },
            DB.TEAMS.slice().sort((a, b) => DB.park(a.id).name.localeCompare(DB.park(b.id).name)).map(t => h('option', { value: t.id, ...(t.id === (QP.park || QP.home) ? { selected: '' } : {}) }, DB.park(t.id).name + ' (' + t.id + ')')));
          return s;
        })()),
        h('div', { class: 'muted', style: 'font-size:13px' }, `${pk.name} - ${pk.city}. LF ${pk.dims[0]}  CF ${pk.dims[3]}  RF ${pk.dims[6]}. ${pk.roof === 'dome' ? 'Dome.' : pk.roof === 'retractable' ? 'Retractable roof.' : 'Open air.'}`)),
      h('div', { class: 'row', style: 'margin:16px 0;justify-content:center' },
        h('button', { class: 'btn', style: 'font-size:26px;padding:14px 40px', onclick: startQuick }, 'PLAY BALL')),
      h('h3', { style: 'margin:18px 0 8px' }, 'AWAY'), teamPicker(QP.away, id => { if (id === QP.home) QP.home = QP.away; QP.away = id; draw(); }),
      h('h3', { style: 'margin:18px 0 8px' }, 'HOME'), teamPicker(QP.home, id => { if (id === QP.away) QP.away = QP.home; QP.home = id; QP.park = null; draw(); }),
    );
    el.append(topBar('PLAY NOW', ''), wrap);
  };
  draw();
});
export function optRow(label, opts, cur, on) {
  return h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'cond', style: 'font:800 16px Barlow Condensed;letter-spacing:.6px;color:var(--mut)' }, label),
    h('div', { class: 'seg' }, opts.map(([v, t]) => h('button', { class: String(v) === String(cur) ? 'on' : '', onclick: () => on(v) }, t))));
}
async function startQuick() {
  goLandscape();
  const { playLive } = await import('./game/game.js');
  const spA = Math.random() * 5 | 0, spH = Math.random() * 5 | 0;
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
        optRow('BATTING CAMERA', [['broadcast', 'BROADCAST'], ['low', 'CATCHER']], Settings.camera, v => set('camera', v)),
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
