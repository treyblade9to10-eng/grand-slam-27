// Season hub ROSTER tab: lineup + positions, rotation / bullpen order, 40-man call ups, free agents.
// Tap a player to select him, tap another to swap them, tap the selected player again for his card.
import * as DB from '../db.js';
import { h, toast, modal } from '../ui.js';
import * as SE from './season.js';
import { clubOf } from './stats.js';
import { playerCard, confirmBox, optRow, ovrTag, isPit, batShort, pitShort } from './cards.js';

const VIEW = { sec: 'lineup' };
let SEL = null; // { g: 'lu'|'bn'|'rot'|'cl'|'bp', i }
const POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const MAX_ACTIVE = 26, MAX_40 = 40, MAX_PIT = 13;
const HIT_G = ['lu', 'bn'], PIT_G = ['rot', 'cl', 'bp'];

function getPid(d, g, i) { return g === 'lu' ? d.lineup[i][0] : g === 'bn' ? d.bench[i] : g === 'rot' ? d.rotation[i] : g === 'cl' ? d.closer : d.bullpen[i]; }
function setPid(d, g, i, pid) { if (g === 'lu') d.lineup[i][0] = pid; else if (g === 'bn') d.bench[i] = pid; else if (g === 'rot') d.rotation[i] = pid; else if (g === 'cl') d.closer = pid; else d.bullpen[i] = pid; }
const twoWay = p => p && p.con != null && p.stf != null && p.pit && p.pit.length && !isPit(p);
function swap(ctx, a, b) {
  const d = ctx.S.depth, pa = getPid(d, a.g, a.i), pb = getPid(d, b.g, b.i);
  const hitA = HIT_G.includes(a.g), hitB = HIT_G.includes(b.g);
  if (hitA !== hitB && !(twoWay(DB.player(pa)) || twoWay(DB.player(pb)))) { toast('Swap hitters with hitters, pitchers with pitchers'); return false; }
  if (a.g === 'lu' && b.g === 'lu') { const t = d.lineup[a.i]; d.lineup[a.i] = d.lineup[b.i]; d.lineup[b.i] = t; return true; }
  setPid(d, a.g, a.i, pb); setPid(d, b.g, b.i, pa);
  return true;
}
function restLabel(S, pid) {
  const ls = S.ls[pid], day = S.post ? S.days + S.post.day : S.day;
  if (ls == null || day - ls >= 5) return 'READY';
  const n = 5 - (day - ls); return n + (n === 1 ? ' DAY' : ' DAYS');
}

export function rosterTab(ctx) {
  const S = ctx.S, d = S.depth, out = h('div', {});
  const active = SE.activeList(S), forty = SE.fortyMan(S);
  const pitchers = active.filter(pid => isPit(DB.player(pid))).length;
  out.append(h('div', { class: 'row', style: 'margin-bottom:8px;justify-content:space-between' },
    optRow('', [['lineup', 'LINEUP'], ['pitch', 'PITCHING'], ['forty', '40-MAN'], ['fa', 'FREE AGENTS']], VIEW.sec, v => { VIEW.sec = v; SEL = null; ctx.draw(); }),
    h('span', { class: 'pill' }, `ACTIVE ${active.length}/${MAX_ACTIVE}  ·  40-MAN ${forty.length}/${MAX_40}`)));
  const tap = (g, i) => {
    const pid = getPid(d, g, i);
    if (SEL && SEL.g === g && SEL.i === i) { SEL = null; cardFor(ctx, pid, g); return; }
    if (SEL) { const a = SEL; SEL = null; if (swap(ctx, a, { g, i })) { ctx.save(); toast('Swapped'); } ctx.draw(); return; }
    SEL = { g, i }; ctx.draw();
  };
  const prow = (g, i, label, sub, extra = null) => {
    const pid = getPid(d, g, i), p = DB.player(pid), sel = SEL && SEL.g === g && SEL.i === i;
    const btn = h('button', { class: 'opt sn-row' + (sel ? ' sel' : ''), style: 'margin:0;flex:1;min-width:0', onclick: () => tap(g, i) },
      h('span', { class: 'num' }, label), h('span', { class: 'gr' }, h('div', { class: 'nm' }, DB.full(p)), h('div', { class: 'sm' }, sub)), ovrTag(p));
    return h('div', { style: 'display:flex;gap:6px;align-items:stretch;margin-bottom:5px' }, btn, extra);
  };
  const hint = h('div', { class: 'muted', style: 'font-size:13px;margin:-2px 0 10px' }, SEL ? 'Now tap the player to swap with. Tap him again for his card.' : 'Tap a player, then another to swap them. Tap twice for the player card.');
  if (VIEW.sec === 'lineup') {
    out.append(hint, h('div', { class: 'sn-cols' },
      h('div', { class: 'panel', style: 'padding:10px' }, h('h3', { style: 'margin-bottom:8px' }, 'BATTING ORDER'),
        d.lineup.map(([pid, pos], i) => prow('lu', i, String(i + 1), `${DB.player(pid).b}  ·  ${batShort(S, pid)}`,
          h('button', { class: 'btn ghost small sn-pos', onclick: () => posPicker(ctx, i) }, pos)))),
      h('div', { class: 'panel', style: 'padding:10px' }, h('h3', { style: 'margin-bottom:8px' }, 'BENCH'),
        d.bench.length ? d.bench.map((pid, i) => prow('bn', i, DB.player(pid).pos, batShort(S, pid))) : h('div', { class: 'muted' }, 'Nobody on the bench. Call someone up from the 40-man.'),
        h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn ghost small', onclick: () => autoLineup(ctx) }, 'RESET TO DEFAULT')))));
  } else if (VIEW.sec === 'pitch') {
    out.append(hint, h('div', { class: 'sn-cols' },
      h('div', { class: 'panel', style: 'padding:10px' }, h('h3', { style: 'margin-bottom:8px' }, 'ROTATION'),
        d.rotation.map((pid, i) => prow('rot', i, 'SP' + (i + 1), `${restLabel(S, pid)}  ·  ${pitShort(S, pid)}`)),
        h('div', { class: 'muted', style: 'font-size:13px;margin-top:6px' }, 'Starters need 4 days of rest. A tired starter gets skipped.')),
      h('div', { class: 'panel', style: 'padding:10px' }, h('h3', { style: 'margin-bottom:8px' }, 'CLOSER'), d.closer != null ? prow('cl', 0, 'CL', pitShort(S, d.closer)) : h('div', { class: 'muted' }, 'No closer'),
        h('h3', { style: 'margin:12px 0 8px' }, 'BULLPEN'), d.bullpen.map((pid, i) => prow('bp', i, 'RP', pitShort(S, pid))),
        h('div', { class: 'muted', style: 'font-size:13px;margin-top:6px' }, 'The top of the bullpen gets the late, close innings.'))));
  } else if (VIEW.sec === 'forty') {
    const res = forty.filter(pid => !active.includes(pid)).sort((a, b) => DB.player(b).ovr - DB.player(a).ovr);
    out.append(h('div', { class: 'muted', style: 'font-size:13px;margin:-2px 0 10px' }, `Players on the 40-man who are not active. Active roster: ${active.length}/${MAX_ACTIVE} (${pitchers} pitchers, max ${MAX_PIT}). Send players down from their card.`),
      h('div', { class: 'panel', style: 'padding:10px' }, res.length ? res.map(pid => listRow(ctx, pid, () => cardFor(ctx, pid, null))) : h('div', { class: 'muted' }, 'Everyone on the 40-man is active.')));
  } else {
    const fa = SE.freeAgents(S).slice(0, 120);
    out.append(h('div', { class: 'muted', style: 'font-size:13px;margin:-2px 0 10px' }, `Unsigned players. Signing one adds him to the 40-man (${forty.length}/${MAX_40}), then call him up.`),
      h('div', { class: 'panel', style: 'padding:10px' }, fa.map(pid => listRow(ctx, pid, () => playerCard(S, pid, [['SIGN', () => sign(ctx, pid)]])))));
  }
  return out;
}
function listRow(ctx, pid, on) {
  const S = ctx.S, p = DB.player(pid), pit = isPit(p);
  const real = p.ln26 ? (p.ln26.length === 9 ? `2026: ${p.ln26[2]}-${p.ln26[3]}, ${p.ln26[4]} ERA, ${p.ln26[5]} IP` : `2026: ${p.ln26[2].toFixed(3).replace(/^0/, '')}, ${p.ln26[3]} HR, ${p.ln26[1]} PA`) : 'No 2026 MLB stats';
  return h('button', { class: 'opt sn-row', onclick: on }, h('span', { class: 'num', style: 'font-size:15px;min-width:30px' }, p.pos),
    h('span', { class: 'gr' }, h('div', { class: 'nm' }, DB.full(p)), h('div', { class: 'sm' }, `Age ${p.age}  ·  ${S.bat[pid] || S.pit[pid] ? (pit ? pitShort(S, pid) : batShort(S, pid)) : real}`)), ovrTag(p));
}
function posPicker(ctx, i) {
  const d = ctx.S.depth, m = modal(''), cur = d.lineup[i][1], p = DB.player(d.lineup[i][0]);
  m.el.append(h('h2', {}, DB.full(p)), h('div', { class: 'sub' }, `Pick a position (natural: ${p.pos}). Whoever plays it now takes his spot.`),
    h('div', { class: 'row' }, POS.map(pos => h('button', { class: 'btn small ' + (pos === cur ? '' : 'ghost'), onclick: () => {
      m.close(); if (pos === cur) return;
      const j = d.lineup.findIndex(x => x[1] === pos); if (j >= 0) d.lineup[j][1] = cur;
      d.lineup[i][1] = pos; ctx.save(); ctx.draw();
    } }, pos))), h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn ghost small', onclick: () => m.close() }, 'CANCEL')));
  setTimeout(() => m.el.querySelector('.btn')?.classList.add('focus'), 30);
}
function autoLineup(ctx) {
  const S = ctx.S, def = SE.copyDepth(DB.DEPTH[S.team]), all = [...def.lineup.map(x => x[0]), ...def.bench, ...def.rotation, ...def.bullpen, def.closer];
  if (all.some(pid => clubOf(S, pid) !== S.team)) { toast('Default roster has players who left the club'); return; }
  const signed = SE.activeList(S).filter(pid => !all.includes(pid)); // keep active signings on the bench / bullpen
  for (const pid of signed) (isPit(DB.player(pid)) ? def.bullpen : def.bench).push(pid);
  S.depth = def; SEL = null; ctx.save(); toast('Default lineup restored'); ctx.draw();
}
function cardFor(ctx, pid, g) {
  const S = ctx.S, d = S.depth, acts = [];
  const active = SE.activeList(S).includes(pid);
  if (active && (g === 'bn' || g === 'bp')) acts.push(['SEND DOWN', () => {
    if (g === 'bn') d.bench.splice(d.bench.indexOf(pid), 1); else { if (d.bullpen.length <= 3) return toast('Keep at least 3 relievers'); d.bullpen.splice(d.bullpen.indexOf(pid), 1); }
    ctx.save(); toast(DB.nm(DB.player(pid)) + ' sent down'); ctx.draw();
  }, 'ghost']);
  if (!active) {
    acts.push(['CALL UP', () => callUp(ctx, pid)]);
    acts.push(['RELEASE', () => confirmBox('RELEASE', `Release ${DB.full(DB.player(pid))}? He becomes a free agent.`, 'RELEASE', () => { S.own[pid] = null; ctx.save(); ctx.draw(); }, 'red'), 'ghost']);
  }
  const m = playerCard(S, pid, acts);
  if (active && !acts.length && m) m.el.append(h('div', { class: 'muted', style: 'font-size:13px;margin-top:8px' }, 'Starters and the closer must be swapped out before they can be sent down.'));
}
function callUp(ctx, pid) {
  const S = ctx.S, d = S.depth, p = DB.player(pid), act = SE.activeList(S);
  if (act.length >= MAX_ACTIVE) return toast('Active roster is full - send someone down first', 2400);
  if (isPit(p)) { if (act.filter(x => isPit(DB.player(x))).length >= MAX_PIT) return toast('Max 13 pitchers - send a pitcher down first', 2400); d.bullpen.push(pid); }
  else d.bench.push(pid);
  ctx.save(); toast(DB.nm(p) + ' called up'); ctx.draw();
}
function sign(ctx, pid) {
  const S = ctx.S;
  if (SE.fortyMan(S).length >= MAX_40) return toast('40-man roster is full - release someone first', 2400);
  S.own[pid] = S.team; ctx.save();
  toast(`Signed ${DB.nm(DB.player(pid))}. Call him up from the 40-MAN tab`, 2600); ctx.draw();
}
