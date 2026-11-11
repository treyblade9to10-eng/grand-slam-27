// Season hub POSTSEASON (bracket) + AWARDS / champion tabs
import * as DB from '../db.js';
import { h, badge, fmt3, fmtERA, ipStr, tv } from '../ui.js';
import * as SE from './season.js';
import * as PO from './playoffs.js';
import { bline, pline } from './stats.js';
import { nm, playerCard, confirmBox, go } from './cards.js';
import { postGameCard, postSim, startPostseason } from './ui.js';

function seriesCard(S, s, label, wait = null) {
  const P = S.post, me = s && (s.hi === S.team || s.lo === S.team);
  if (!s) return h('div', { class: 'sn-ser', style: 'opacity:.6' }, h('div', { class: 'lbl' }, label),
    wait ? h('div', { class: 'tr' }, h('span', { class: 'sd' }, String(PO.seedOf(P, wait))), badge(DB.team(wait), 24), h('span', { style: wait === S.team ? 'color:var(--gold)' : '' }, wait)) : null,
    h('div', { class: 'tr' }, h('span', { class: 'muted' }, 'TBD')));
  const tr = (team, w) => h('div', { class: 'tr' + (s.win && s.win !== team ? ' out' : '') }, h('span', { class: 'sd' }, String(PO.seedOf(P, team))), badge(DB.team(team), 24),
    h('span', { style: team === S.team ? 'color:var(--gold)' : '' }, team), h('span', { class: 'wn' }, String(w)));
  const games = s.g.map(g => `${g[2]}-${g[3]}`).join('  ');
  return h('div', { class: 'sn-ser' + (me ? ' me' : '') }, h('div', { class: 'lbl' }, `${label}  ·  BEST OF ${s.best}`), tr(s.hi, s.w[0]), tr(s.lo, s.w[1]),
    games ? h('div', { class: 'lbl', style: 'margin-top:3px;text-transform:none' }, games) : null);
}
export function postTab(ctx) {
  const S = ctx.S, out = h('div', { class: 'grid' });
  if (!S.post) {
    out.append(h('div', { class: 'panel' }, h('div', { class: 'muted' }, SE.seasonOver(S) ? 'The regular season is over.' : 'The postseason starts after the regular season.'),
      SE.seasonOver(S) ? h('button', { class: 'btn', style: 'margin-top:10px', onclick: () => startPostseason(ctx) }, 'START POSTSEASON') : null));
    return out;
  }
  const P = S.post, by = id => P.series.find(s => s.id === id);
  const mine = PO.userSeries(S);
  if (!P.done) {
    if (mine) out.append(postGameCard(ctx, mine));
    else out.append(h('div', { class: 'panel' }, h('h3', {}, PO.ROUNDS[P.round]),
      h('div', { class: 'muted', style: 'font-size:14px;margin:4px 0 10px' }, !PO.seedOf(P, S.team) ? 'Your club missed the postseason.' : P.series.some(x => x.win && x.win !== S.team && (x.hi === S.team || x.lo === S.team)) ? 'Your club has been eliminated.' : P.series.some(x => x.win === S.team) ? 'Your club moved on. Sim ahead to the next round.' : 'Your club has a first-round bye. Sim ahead to the Division Series.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => postSim(ctx, 'day') }, 'SIM DAY'), h('button', { class: 'btn ghost', onclick: () => postSim(ctx, 'round') }, 'SIM ROUND'),
        h('button', { class: 'btn ghost', onclick: () => postSim(ctx, 'all') }, 'SIM TO CHAMPION'))));
  } else out.append(h('div', { class: 'panel sn-champ', ...tv(DB.team(S.champ)) }, badge(DB.team(S.champ), 80), h('div', { class: 'yr' }, `${S.year} WORLD SERIES CHAMPIONS`), h('div', { class: 'big' }, DB.teamName(DB.team(S.champ))),
    h('button', { class: 'btn', onclick: () => ctx.go('champ') }, 'AWARDS + NEXT SEASON')));
  const col = (title, cards) => h('div', {}, h('h3', { style: 'margin-bottom:8px;font-size:18px' }, title), ...cards);
  const brk = h('div', { class: 'sn-brk' });
  brk.append(
    col('WILD CARD', ['AL', 'NL'].flatMap(lg => [seriesCard(S, by(lg + 'WC1'), lg + ' WC'), seriesCard(S, by(lg + 'WC2'), lg + ' WC')])),
    col('DIVISION SERIES', ['AL', 'NL'].flatMap(lg => [seriesCard(S, by(lg + 'DS1'), lg + ' DS', P.seeds[lg][0]), seriesCard(S, by(lg + 'DS2'), lg + ' DS', P.seeds[lg][1])])),
    col('LCS', ['AL', 'NL'].map(lg => seriesCard(S, by(lg + 'CS'), lg + 'CS'))),
    col('WORLD SERIES', [seriesCard(S, by('WS'), 'WORLD SERIES')]));
  const byes = ['AL', 'NL'].map(lg => `${lg} ${P.seeds[lg][0]}, ${P.seeds[lg][1]}`).join('  ·  ');
  out.append(h('div', { class: 'panel', style: 'padding:12px' }, h('div', { class: 'muted', style: 'font-size:13px;margin-bottom:10px' }, 'First-round byes:  ' + byes), brk));
  return out;
}

export function champTab(ctx) {
  const S = ctx.S, out = h('div', { class: 'grid' });
  if (!S.champ) { out.append(h('div', { class: 'panel muted' }, 'Awards are handed out after the World Series.')); return out; }
  const ws = S.post.series.find(s => s.id === 'WS'), loser = ws.win === ws.hi ? ws.lo : ws.hi, wl = [Math.max(...ws.w), Math.min(...ws.w)];
  const mine = S.champ === S.team;
  out.append(h('div', { class: 'panel sn-champ', ...tv(DB.team(S.champ)) },
    h('div', { class: 'yr' }, `${S.year} WORLD SERIES CHAMPIONS`), badge(DB.team(S.champ), 130),
    h('div', { class: 'big' }, DB.teamName(DB.team(S.champ))),
    h('div', { class: 'muted' }, `Beat the ${DB.team(loser).name} ${wl[0]}-${wl[1]}`),
    mine ? h('div', { class: 'gold', style: "font:900 italic 24px 'Barlow Condensed';margin-top:8px" }, 'YOUR CLUB WON IT ALL') : null));
  const A = S.awards;
  if (A) {
    const who = (pid, pitch) => {
      const p = DB.player(pid); if (!p) return null;
      const o = pitch ? pline(S.pit[pid]) : bline(S.bat[pid]);
      const line = pitch ? `${o.w}-${o.l}, ${fmtERA(o.era)} ERA, ${o.so} K, ${ipStr(o.outs)} IP` : `${fmt3(o.avg)}, ${o.hr} HR, ${o.rbi} RBI, ${fmt3(o.ops)} OPS`;
      const club = S.own && pid in S.own ? S.own[pid] : p.t;
      return h('button', { class: 'opt sn-row', onclick: () => playerCard(S, pid) }, club ? badge(DB.team(club), 30) : null,
        h('span', { class: 'gr' }, h('div', { class: 'nm' }, DB.full(p)), h('div', { class: 'sm' }, line)));
    };
    const cols = h('div', { class: 'sn-cols' });
    for (const lg of ['AL', 'NL']) {
      const a = A[lg];
      cols.append(h('div', { class: 'panel' }, h('h2', { style: 'margin-bottom:8px' }, lg + ' AWARDS'),
        h('h3', { class: 'gold', style: 'font-size:17px;margin:6px 0' }, 'MVP'), who(a.mvp[0]),
        a.mvp.length > 1 ? h('div', { class: 'muted', style: 'font-size:13px;margin:-2px 0 8px' }, 'Finalists: ' + a.mvp.slice(1).map(nm).join(', ')) : null,
        h('h3', { class: 'gold', style: 'font-size:17px;margin:6px 0' }, 'CY YOUNG'), who(a.cy[0], true),
        a.cy.length > 1 ? h('div', { class: 'muted', style: 'font-size:13px;margin:-2px 0 8px' }, 'Finalists: ' + a.cy.slice(1).map(nm).join(', ')) : null,
        h('h3', { class: 'gold', style: 'font-size:17px;margin:10px 0 6px' }, 'SILVER SLUGGERS'),
        h('table', { class: 't sn-mini' }, Object.entries(a.ss).map(([pos, pid]) => { const o = bline(S.bat[pid]); return h('tr', {}, h('td', { style: 'font-weight:800;color:var(--mut)' }, pos), h('td', {}, nm(pid)), h('td', { class: 'n' }, `${o.hr} HR`), h('td', { class: 'n' }, fmt3(o.ops))); }))));
    }
    out.append(cols);
  }
  if (S.hist && S.hist.length) out.append(h('div', { class: 'panel' }, h('h3', { style: 'margin-bottom:6px' }, 'PAST SEASONS'),
    h('table', { class: 't sn-mini' }, S.hist.map(x => h('tr', {}, h('td', { style: 'font-weight:800' }, String(x.year)), h('td', {}, x.rec ? `${x.rec[0]}-${x.rec[1]}` : ''), h('td', {}, 'Champion: ' + (x.champ || '-')))))));
  out.append(h('div', { class: 'row', style: 'justify-content:center;margin:8px 0' }, h('button', { class: 'btn', style: 'font-size:24px;padding:12px 34px', onclick: () =>
    confirmBox('NEXT SEASON', `Start the ${S.year + 1} season? Stats reset, players get a year older and their ratings shift a little. Your roster moves carry over.`, 'START ' + (S.year + 1), () => {
      const N = SE.nextSeason(S); SE.saveSeason(N); ctx.reset(N); go(`season/hub/${S.slot}/home`);
    }) }, 'NEXT SEASON')));
  return out;
}
