// Home Run Derby: pick a slugger and a park, 10 outs, any swing that is not a homer is an out.
import { h, badge, esc, toast } from './ui.js';
import * as DB from './db.js';
import { Engine } from './game/engine.js';
import { loadRaw, saveRaw } from './store.js';

export class DerbyEngine extends Engine {
  constructor(o) { super(o); this.derby = { hr: 0, outs: 0, best: 0, list: [], max: o.outsMax || 10 }; this.o.user = 'away'; }
  paStart() {
    if (this.derby.outs >= this.derby.max) { if (this.phase !== 'final') { this.phase = 'final'; this.emit('derby_over'); } return; }
    this.balls = this.strikes = 0; this.pitchesPA = 0; this.runners = [];
    this.resetFielders();
    const pid = this.o.slugger, r = DB.player(pid) || {};
    this.bat = { pid, r, swing: null, mode: 'stance', hand: r.b === 'S' ? 'L' : (r.b || 'R') };
    this.pci = { x: 0, y: 2.5 };
    this.phase = 'intro'; this.pt = this.firstDone ? 0.6 : 0; this.firstDone = true;
    if (this.derby.outs === 0 && this.derby.hr === 0) this.emit('batter', { pid });
  }
  batter() { return this.o.slugger; }
  cpuChoosePitch() { this.pitchSel = 0; this.cpuTarget = { x: (Math.random() - 0.5) * 0.9, y: 2.2 + Math.random() * 1.0 }; this.aim = { ...this.cpuTarget }; }
  arsenal() { return [['FF', 71, 100]]; }
  startWindup() { super.startWindup(); this.curPitch.path = this.curPitch.path; }
  cpuBatDecision() { }
  afterPitch() {
    const sw = this.lastPitch && this.lastPitch.swung;
    if (sw) this.derbyOut('MISS');
    this.bat.swing = null; this.resetFielders(); this.toAim();
  }
  inPlay(c) { super.inPlay(c); this.runners = []; this.play.fate = 'out'; this.play.derby = true; }
  livePhase(dt) {
    const b = this.ball;
    if (b.state === 'air') {
      super.livePhase(dt);
      if (this.phase !== 'live') return;
      if (b.phys && (b.phys.landed || b.phys.stopped) && this.pt > 0.6) { this.play.ended = true; this.derbyOut(); this.phase = 'dead'; this.pt = 0; this.deadWait = 1.1; }
    } else { this.play.ended = true; this.derbyOut(); this.phase = 'dead'; this.pt = 0; this.deadWait = 1.1; }
  }
  tryCatch() { }
  foulBall() { this.play.ended = true; this.derbyOut('FOUL'); this.phase = 'dead'; this.pt = 0; this.deadWait = 1.0; }
  groundRuleDouble() { this.foulBall(); }
  homeRun() {
    const b = this.ball.phys, d = Math.round(Math.hypot(b.p.x, b.p.z) + this.estRemaining(b));
    this.play.ended = true; this.derby.hr++; this.derby.best = Math.max(this.derby.best, d); this.derby.list.push(d);
    this.emit('home_run', { dist: d, ev: this.play.ev, la: this.play.la, runners: 0, derby: true });
    this.phase = 'dead'; this.pt = 0; this.deadWait = 2.6;
  }
  derbyOut(why) { this.derby.outs++; this.emit('derby_out', { outs: this.derby.outs, why }); }
  endPA() { this.play = null; this.bat.swing = null; this.chaser = this.chaser2 = null; this.phase = 'pa_start'; this.pt = 0; }
}

export function derbyView(el) {
  const sluggers = [...DB.P.values()].filter(p => p.t && p.pow != null && !DB.isP(p)).sort((a, b) => b.pow - a.pow).slice(0, 24);
  let pick = sluggers[0]?.id, park = 'NYY', time = 'night';
  const best = loadRaw('derby_best', {});
  const draw = () => {
    el.innerHTML = '';
    const p = DB.player(pick), t = DB.team(p.t);
    const card = h('div', { class: 'panel', style: `border-top:4px solid ${t.c1};display:flex;gap:14px;align-items:center` }, badge(t, 64),
      h('div', {}, h('h2', {}, DB.full(p)), h('div', { class: 'muted' }, `${t.city} ${t.name}  -  POWER ${p.pow}  CONTACT ${p.con}  -  ${p.ln26 ? p.ln26[3] + ' HR in 2026' : ''}`),
        h('div', { class: 'gold', style: 'font:800 16px Barlow Condensed;margin-top:4px' }, best[pick] ? `YOUR BEST: ${best[pick].hr} HR, LONGEST ${best[pick].long} FT` : 'NO DERBY YET')));
    const list = h('div', { class: 'tgrid', style: 'grid-template-columns:repeat(auto-fill,minmax(150px,1fr))' }, sluggers.map(s => h('button', { class: 'tbtn' + (s.id === pick ? ' on' : ''), onclick: () => { pick = s.id; draw(); } }, badge(DB.team(s.t), 30), h('span', {}, DB.nm(s)), h('span', { class: 'muted', style: 'font-size:12px' }, 'POW ' + s.pow))));
    const parkSel = h('select', { onchange: e => { park = e.target.value; } }, DB.TEAMS.slice().sort((a, b) => DB.park(a.id).name.localeCompare(DB.park(b.id).name)).map(tt => h('option', { value: tt.id, ...(tt.id === park ? { selected: '' } : {}) }, DB.park(tt.id).name)));
    el.append(h('div', { class: 'top' }, h('div', { class: 'in' }, h('div', { class: 'brand', onclick: () => location.hash = '#/' }, h('span', {}, 'GRAND SLAM'), h('b', {}, '27')), h('div', { class: 'right' }, h('span', { class: 'pill' }, 'HOME RUN DERBY'), h('button', { class: 'btn ghost small', onclick: () => location.hash = '#/' }, 'BACK')))),
      h('div', { class: 'wrapc grid' }, h('h1', {}, 'HOME RUN DERBY'), h('div', { class: 'sub' }, '10 outs. Every swing that is not a home run is an out. Taking a pitch is free. Use POWER swings.'),
        card, h('div', { class: 'panel grid' }, h('label', { class: 'f' }, 'BALLPARK', parkSel)),
        h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn', style: 'font-size:24px;padding:13px 36px', onclick: start }, 'START DERBY')),
        h('h3', {}, 'PICK A SLUGGER'), list));
  };
  const start = async () => {
    const { playLive } = await import('./game/game.js');
    const p = DB.player(pick), side = DB.defaultSide(p.t);
    side.lineup = side.lineup.map(x => x.pid === pick ? x : x); if (!side.lineup.some(x => x.pid === pick)) side.lineup[0] = { pid: pick, pos: 'DH' };
    const opp = DB.defaultSide(p.t === park ? (p.t === 'NYY' ? 'BOS' : 'NYY') : park);
    const res = await playLive({ away: side, home: opp, park, time, user: 'away', innings: 9, mode: 'derby', derby: true, slugger: pick, EngineClass: DerbyEngine, skipIntro: true });
    if (res && res.derby) {
      const b = best[pick] || { hr: 0, long: 0 };
      if (res.derby.hr > b.hr || (res.derby.hr === b.hr && res.derby.best > b.long)) { best[pick] = { hr: res.derby.hr, long: res.derby.best }; saveRaw('derby_best', best); toast('NEW PERSONAL BEST'); }
    }
    draw();
  };
  draw();
}
