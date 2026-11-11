// In-game HUD: scorebug, lower thirds, banners, strike zone / PCI overlay, context buttons for touch, key hints.
import * as THREE from '../lib/three.min.js';
import { ZONE, PITCH_NAMES } from './phys.js';
import { player, team as teamOf, nm, full, pLine } from '../db.js';
import { badge, esc, fmt3 } from '../ui.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const SHORT = { FF: '4-SEAM', SI: 'SINKER', FC: 'CUTTER', SL: 'SLIDER', ST: 'SWEEPER', CU: 'CURVE', KC: 'KN-CURVE', CH: 'CHANGE', FS: 'SPLITTER', SV: 'SLURVE', KN: 'KNUCKLE', FO: 'FORK', SC: 'SCREW', CS: 'SLOW CRV', EP: 'EEPHUS' };

export class HUD {
  constructor(root, G) {
    this.G = G; this.root = el('div', 'hud'); root.append(this.root);
    this.zc = el('canvas', 'zone'); this.root.append(this.zc); this.zx = this.zc.getContext('2d');
    const top = el('div', 'hud-top');
    this.bug = el('div', 'bug'); this.pinfo = el('div', 'pinfo');
    const right = el('div', 'hud-right'); right.append(this.pinfo);
    this.pauseBtn = el('button', '', 'PAUSE'); this.pauseBtn.onclick = () => G.pause(); right.append(this.pauseBtn);
    top.append(this.bug, right); this.root.append(top);
    this.l3 = el('div', 'l3'); this.root.append(this.l3);
    this.bannerEl = el('div', 'banner'); this.root.append(this.bannerEl);
    this.tick = el('div', 'ticker'); this.root.append(this.tick);
    this.hint = el('div', 'keyhint'); this.root.append(this.hint);
    this.btns = el('div', 'hud-btns'); this.root.append(this.btns);
    this.pitchList = el('div', 'pitches'); this.root.append(this.pitchList);
    this.meterEl = el('div', 'meter', '<div class="fill"></div><div class="gold"></div><div class="cur"></div>'); this.root.append(this.meterEl);
    this.cardEl = null; this.btnKey = ''; this.hintKey = ''; this.pitchKey = '';
    this.resize(); this._rs = () => this.resize(); addEventListener('resize', this._rs);
  }
  resize() { const r = this.root.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (r.width === this.W && r.height === this.H && d === this.dpr) return; this.bugKey = null; this.zc.width = r.width * d; this.zc.height = r.height * d; this.dpr = d; this.W = r.width; this.H = r.height; }
  dispose() { removeEventListener('resize', this._rs); this.root.remove(); }
  // ---------- scorebug ----------
  drawBug() {
    const E = this.G.E, st = E.st, A = teamOf(st.box.away), H = teamOf(st.box.home);
    if (E.derby) { const d = E.derby, k = d.hr + '|' + d.outs; if (k === this.bugKey) return; this.bugKey = k; this.bug.className = 'bug derby'; this.bug.innerHTML = `<div class="mid" style="border:0"><div class="inn"><b>HR</b>${d.hr}</div><div class="inn"><b>OUTS</b>${d.outs}/${d.max}</div><div class="inn"><b>LONGEST</b>${d.best || '-'}</div></div>`; return; }
    if (!this.bugBuilt) {
      this.bugBuilt = true; this.bug.className = 'bug';
      const row = (t, i) => `<div class="tr" data-i="${i}" style="--c1:${t.c1};--c2:${t.c2}"><div class="lg"></div><div class="ab">${t.id}</div><div class="sc">0</div></div>`;
      this.bug.innerHTML = `<div class="main"><div class="tm">${row(A, 0)}${row(H, 1)}</div>
        <div class="mid"><div class="inn"><i class="arr"></i><span class="n">1</span></div>
        <div class="dia"><span class="b2"></span><span class="b3"></span><span class="b1"></span></div>
        <div class="cnt"><div class="bs">0-0</div><div class="outs"><i></i><i></i><i></i></div></div></div></div>
        <div class="strip"><span class="pp"></span><span class="pcn"></span></div>`;
      const lg = this.bug.querySelectorAll('.lg'); lg[0].append(badge(A, 26)); lg[1].append(badge(H, 26));
      this.bq = { rows: [...this.bug.querySelectorAll('.tr')], sc: [...this.bug.querySelectorAll('.sc')], arr: this.bug.querySelector('.arr'), inn: this.bug.querySelector('.inn .n'), bases: ['.b1', '.b2', '.b3'].map(q => this.bug.querySelector(q)), bs: this.bug.querySelector('.bs'), outs: [...this.bug.querySelectorAll('.outs i')], pp: this.bug.querySelector('.pp'), pcn: this.bug.querySelector('.pcn'), last: [0, 0] };
    }
    const p = player(E.pitcher()), pc = (st.pc[E.pitcher()] || 0) + (E.pitchesPA || 0);
    const key = [st.score, st.inn, st.top, st.bases.map(Boolean), st.outs, E.balls, E.strikes, pc, E.pitcher()].join('|');
    if (key === this.bugKey) return; this.bugKey = key;
    const q = this.bq;
    for (let i = 0; i < 2; i++) {
      const v = st.score[i]; if (q.sc[i].textContent !== String(v)) { q.sc[i].textContent = v; if (v > q.last[i]) { q.rows[i].classList.remove('flash'); void q.rows[i].offsetWidth; q.rows[i].classList.add('flash'); } q.last[i] = v; }
      q.rows[i].classList.toggle('bat', st.top ? i === 0 : i === 1);
    }
    q.arr.className = 'arr ' + (st.top ? 'up' : 'down'); q.inn.textContent = st.inn;
    st.bases.forEach((x, i) => q.bases[i].classList.toggle('on', !!x));
    q.bs.innerHTML = `${E.balls}<em>-</em>${E.strikes}`;
    q.outs.forEach((o, i) => o.classList.toggle('on', st.outs > i));
    q.pp.innerHTML = `<b>P</b> ${esc(p ? p.ln.toUpperCase() : '')}`; q.pcn.innerHTML = `<b>PC</b> ${pc}`;
  }
  pitchInfo(type, mph) { this.pinfo.innerHTML = `<div class="mph">${Math.round(mph)}<small>MPH</small></div><div class="ty">${PITCH_NAMES[type] || type}</div>`; this.pinfo.classList.add('on'); clearTimeout(this._pi); this._pi = setTimeout(() => this.pinfo.classList.remove('on'), 3200); }
  lower(pid, kind) {
    const p = player(pid); if (!p) return;
    const E = this.G.E, side = kind === 'bat' ? E.battingSide : E.fieldingSide, t = teamOf(E.st.sides[side].team);
    let line;
    const box = E.st.box;
    if (kind === 'bat') {
      const b = box.bat[pid] || { ab: 0, h: 0 }, ln = p.ln26 || [];
      const today = b.ab || b.bb ? `TODAY ${b.h}-${b.ab}${b.hr ? ', ' + b.hr + ' HR' : ''}${b.bb ? ', ' + b.bb + ' BB' : ''}` : 'FIRST AT-BAT';
      const pos = E.st.sides[side].lineup.find(x => x.pid === pid)?.pos || p.pos;
      line = `${pos}  <b>${ln[2] != null ? fmt3(ln[2]) : '---'}</b> AVG  <b>${ln[3] ?? 0}</b> HR  <b>${ln[4] ?? 0}</b> RBI  &middot;  ${today}`;
    } else {
      const ln = pLine(p);
      line = `${p.th === 'L' ? 'LHP' : 'RHP'}  <b>${ln[2] ?? 0}-${ln[3] ?? 0}</b>  <b>${ln[4] != null ? (+ln[4]).toFixed(2) : '-.--'}</b> ERA  <b>${ln[6] ?? 0}</b> K`;
    }
    this.l3.style.setProperty('--tc', t.c1);
    this.l3.innerHTML = `<div class="num">${p.num ?? ''}</div><div class="bx"><div class="nm">${esc(full(p))}</div><div class="ln">${line}</div></div>`;
    this.l3.classList.add('on'); clearTimeout(this._l3); this._l3 = setTimeout(() => this.l3.classList.remove('on'), 4200);
  }
  banner(big, sm = '', cls = '', ms = 1800) {
    this.bannerEl.innerHTML = `<div class="big ${cls}">${esc(big)}</div>${sm ? `<div class="sm">${esc(sm)}</div>` : ''}`;
    this.bannerEl.classList.remove('on'); void this.bannerEl.offsetWidth; this.bannerEl.classList.add('on');
    clearTimeout(this._bn); this._bn = setTimeout(() => this.bannerEl.classList.remove('on'), ms);
  }
  replayTag(on) {
    if (!this.rpEl) { this.rpEl = el('div', 'rptag', '<i></i>REPLAY'); this.root.append(this.rpEl); }
    this.rpEl.classList.toggle('on', on); this.root.classList.toggle('replaying', on);
  }
  ticker(text, ms = 3000) { this.tick.textContent = text; this.tick.classList.add('on'); clearTimeout(this._tk); this._tk = setTimeout(() => this.tick.classList.remove('on'), ms); }
  // ---------- per frame ----------
  update(dt, device) {
    const G = this.G, E = G.E;
    if (G.mode !== 'game') { this.zx.clearRect(0, 0, this.zc.width, this.zc.height); this.zc.style.visibility = 'hidden'; this.zVis = false; this.setButtons('', device); this.pitchList.style.display = 'none'; this.meterEl.classList.remove('on'); this.hint.style.display = 'none'; return; }
    this.drawBug();
    this.drawZone();
    const ph = E.phase;
    let ctx = '';
    if (E.userBats && (ph === 'aim' || ph === 'windup' || ph === 'pitch' || ph === 'intro')) ctx = 'bat';
    else if (E.userPitches && (ph === 'aim' || ph === 'intro')) ctx = 'pitch';
    else if (ph === 'live' && E.awaitThrow && E.userPitches) ctx = 'throw';
    else if (ph === 'live' && E.userBats && E.play && E.play.kind === 'hit') ctx = 'run';
    this.setButtons(ctx, device);
    // pitch list + meter
    if (ctx === 'pitch' || (E.userPitches && ph === 'windup')) {
      const ar = E.arsenal(), key = E.pitcher() + '|' + E.pitchSel + '|' + device;
      if (key !== this.pitchKey) {
        this.pitchKey = key; this.pitchList.innerHTML = '';
        ar.forEach(([t, mph], i) => {
          const b = el('button', i === E.pitchSel ? 'on' : '', `${device === 'keys' ? `<span class="k">${i + 1}</span>` : ''}${SHORT[t] || t}<span class="v">${Math.round(mph)}</span>`);
          b.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); G.input.tap('pitch' + i); };
          this.pitchList.append(b);
        });
        const f = player(E.pitcher());
        const en = Math.max(0, 1 - (E.st.pc[E.pitcher()] || 0) / (f && f.pos === 'SP' ? 110 : 35));
        this.pitchList.append(el('div', 'energy', `ENERGY <i style="width:${Math.round(en * 80)}px;background:${en > 0.5 ? '#3fbf6a' : en > 0.25 ? '#f2c14e' : '#e5484d'}"></i>`));
      }
      this.pitchList.style.display = 'flex';
    } else this.pitchList.style.display = 'none';
    if (E.userPitches && E.meter && (ph === 'aim' || ph === 'windup') && G.set.pitchMeter) {
      this.meterEl.classList.add('on');
      const m = E.meter, f = player(E.pitcher()), gold = 0.03 + ((f?.ctl ?? 50) / 99) * 0.04;
      const g = this.meterEl.querySelector('.gold'); g.style.left = ((0.85 - gold) * 100) + '%'; g.style.width = (gold * 200) + '%';
      this.meterEl.querySelector('.cur').style.left = (m.v * 100) + '%';
      this.meterEl.querySelector('.fill').style.width = (m.v * 100) + '%';
    } else this.meterEl.classList.remove('on');
  }
  setButtons(ctx, device) {
    const key = ctx + '|' + device + '|' + (this.G.E && this.G.E.meter ? 'm' : '');
    if (key === this.btnKey) return; this.btnKey = key;
    const G = this.G, B = this.btns; B.innerHTML = '';
    const mk = (label, action, cls = '', sub = '') => { const b = el('button', 'hud-btn ' + cls, `${label}${sub ? `<small>${sub}</small>` : ''}`); b.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 150); G.input.tap(action); }; return b; };
    const touch = device === 'touch';
    // key hints for keyboard / controller
    const K = (k, pad) => device === 'pad' ? `<span class="k pa ${pad.toLowerCase()}">${pad}</span>` : `<span class="k">${k}</span>`;
    let hint = '';
    if (ctx === 'bat') hint = device === 'pad' ? `${K('', 'A')}SWING ${K('', 'B')}POWER ${K('', 'X')}BUNT <span class="k">L-STICK</span>AIM <span class="k">LB</span>STEAL` : `${K('SPACE')}SWING ${K('K')}POWER ${K('L')}BUNT ${K('WASD')}AIM ${K('Q')}STEAL`;
    if (ctx === 'pitch') hint = device === 'pad' ? `<span class="k">LB/RB</span>PITCH <span class="k">L-STICK</span>AIM ${K('', 'A')}THROW, THEN ${K('', 'A')} IN THE GOLD` : `${K('1-5')}PITCH ${K('WASD')}AIM ${K('SPACE')}THROW, THEN ${K('SPACE')} IN THE GOLD`;
    if (ctx === 'throw') hint = device === 'pad' ? `THROW TO: ${K('', 'B')}1B ${K('', 'Y')}2B ${K('', 'X')}3B ${K('', 'A')}HOME <span class="k">LB</span>CUT` : `THROW TO: <span class="k">&rarr;</span>1B <span class="k">&uarr;</span>2B <span class="k">&larr;</span>3B <span class="k">&darr;</span>HOME ${K('C')}CUT`;
    if (ctx === 'run') hint = device === 'pad' ? `<span class="k">RT</span>SEND RUNNERS <span class="k">LT</span>BACK` : `${K('E')}SEND RUNNERS ${K('R')}BACK`;
    this.hint.innerHTML = hint; this.hint.style.display = hint && !touch ? 'flex' : 'none';
    if (!touch) return;
    if (ctx === 'bat') {
      const r1 = el('div', 'row2'); r1.append(mk('BUNT', 'bunt', 'sm'), mk('STEAL', 'steal', 'sm'));
      const r2 = el('div', 'row2'); r2.append(mk('POWER', 'power', 'red'), mk('SWING', 'swing', 'main'));
      B.append(r1, r2);
    } else if (ctx === 'pitch') {
      B.append(mk(this.G.E.meter ? 'STOP' : 'THROW', 'throw', 'main'));
    } else if (ctx === 'throw') {
      const d = el('div', 'diamondbtns');
      const b2 = mk('2B', 'b2', 'd2'), b1 = mk('1B', 'b1', 'd1'), b3 = mk('3B', 'b3', 'd3'), b4 = mk('HOME', 'b4', 'd4');
      d.append(b2, b1, b3, b4); B.append(d, mk('CUT', 'cut', 'sm'));
    } else if (ctx === 'run') {
      const r = el('div', 'row2'); r.append(mk('BACK', 'backAll', 'sm'), mk('GO', 'goAll', 'blue')); B.append(r);
    }
  }
  // project zone-plane point (x,y at z=0) to screen px
  proj(x, y, z = 0) { const v = new THREE.Vector3(x, y, z).project(this.G.cam); return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H, ok: v.z < 1 }; }
  unproj(px, py) { // screen -> zone plane z=0
    const cam = this.G.cam, ndc = new THREE.Vector2(px / this.W * 2 - 1, -(py / this.H) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, cam);
    const o = ray.ray.origin, d = ray.ray.direction; if (Math.abs(d.z) < 1e-6) return null;
    const t = -o.z / d.z; return { x: o.x + d.x * t, y: o.y + d.y * t };
  }
  drawZone() {
    const G = this.G, E = G.E, x = this.zx, dpr = this.dpr;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.zc.width, this.zc.height); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ph = E.phase, batting = E.userBats, pitching = E.userPitches;
    const showZone = (ph === 'aim' || ph === 'windup' || ph === 'pitch' || ph === 'post_pitch') && G.camMode !== 'play' && (batting || pitching);
    if (!showZone) { if (this.zVis !== false) { this.zc.style.visibility = 'hidden'; this.zVis = false; } return; }
    if (this.zVis !== true) { this.zc.style.visibility = ''; this.zVis = true; }
    const z = ZONE, a = this.proj(z.x0, z.y1), b = this.proj(z.x1, z.y0);
    if (G.set.strikeZone) {
      x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1.5; x.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      x.strokeStyle = 'rgba(255,255,255,.14)'; x.beginPath();
      for (let i = 1; i < 3; i++) { const xx = a.x + (b.x - a.x) * i / 3, yy = a.y + (b.y - a.y) * i / 3; x.moveTo(xx, a.y); x.lineTo(xx, b.y); x.moveTo(a.x, yy); x.lineTo(b.x, yy); }
      x.stroke();
    }
    // previous pitch locations this at-bat
    for (const p of G.paPitches || []) { const q = this.proj(p.x, p.y); x.fillStyle = p.strike ? 'rgba(229,72,77,.85)' : 'rgba(74,168,255,.85)'; x.beginPath(); x.arc(q.x, q.y, 6, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = '800 10px Barlow Condensed'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(p.n, q.x, q.y + 0.5); }
    if (batting && G.set.pci !== 'timing') {
      const c = this.proj(E.pci.x, E.pci.y), r = this.proj(E.pci.x + (0.34 + ((E.bat?.r?.con) ?? 50) / 99 * 0.24) * E.D.pci, E.pci.y);
      const R = Math.abs(r.x - c.x);
      x.strokeStyle = E.bat && E.bat.swing ? '#f2c14e' : 'rgba(255,255,255,.9)'; x.lineWidth = 2.5;
      x.beginPath(); x.ellipse(c.x, c.y, R, R * 0.9, 0, 0, 7); x.stroke();
      x.fillStyle = 'rgba(255,255,255,.12)'; x.fill();
      x.beginPath(); x.arc(c.x, c.y, 3.5, 0, 7); x.fillStyle = '#fff'; x.fill();
    }
    if (pitching && (ph === 'aim' || ph === 'windup')) {
      const c = this.proj(E.aim.x, E.aim.y);
      x.strokeStyle = '#f2c14e'; x.lineWidth = 2.5; x.beginPath(); x.arc(c.x, c.y, 13, 0, 7); x.stroke();
      x.beginPath(); x.moveTo(c.x - 20, c.y); x.lineTo(c.x - 7, c.y); x.moveTo(c.x + 7, c.y); x.lineTo(c.x + 20, c.y); x.moveTo(c.x, c.y - 20); x.lineTo(c.x, c.y - 7); x.moveTo(c.x, c.y + 7); x.lineTo(c.x, c.y + 20); x.stroke();
    }
  }
  // ---------- full-screen cards ----------
  card(html, opts = {}) {
    this.closeCard();
    const c = el('div', 'card', `<div class="in">${html}</div>${opts.skip !== false ? '<button class="card-skip">SKIP</button>' : ''}`);
    this.root.append(c); requestAnimationFrame(() => c.classList.add('on'));
    const sk = c.querySelector('.card-skip'); if (sk) sk.onclick = e => { e.stopPropagation(); opts.onSkip && opts.onSkip(); };
    this.cardEl = c; return c;
  }
  closeCard() { if (this.cardEl) { const c = this.cardEl; c.classList.remove('on'); setTimeout(() => c.remove(), 350); this.cardEl = null; } }
  lineScore() {
    const st = this.G.E.st, b = st.box, A = teamOf(b.away), H = teamOf(b.home), n = Math.max(st.innings, b.line.length);
    let hd = '<th></th>', ra = `<td class="t">${A.id}</td>`, rh = `<td class="t">${H.id}</td>`;
    for (let i = 0; i < n; i++) { const l = b.line[i] || [null, null]; hd += `<th>${i + 1}</th>`; ra += `<td>${l[0] ?? ''}</td>`; rh += `<td>${l[1] ?? (st.done && i === n - 1 && l[0] != null ? 'X' : '')}</td>`; }
    hd += '<th>R</th><th>H</th><th>E</th>';
    ra += `<td class="r">${st.score[0]}</td><td>${b.hits[0]}</td><td>${b.errors[0]}</td>`; rh += `<td class="r">${st.score[1]}</td><td>${b.hits[1]}</td><td>${b.errors[1]}</td>`;
    return `<div class="ls"><table><tr>${hd}</tr><tr>${ra}</tr><tr>${rh}</tr></table></div>`;
  }
}
export { ord };
