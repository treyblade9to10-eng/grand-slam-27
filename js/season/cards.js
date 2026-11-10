// Season mode: shared UI bits - injected CSS, player card modal, box score modal, small formatters.
import * as DB from '../db.js';
import { h, badge, modal, fmt3, fmtERA, ipStr } from '../ui.js';
import { bline, pline } from './stats.js';

export function css() {
  if (document.getElementById('season-css')) return;
  const s = document.createElement('style'); s.id = 'season-css';
  s.textContent = `
.sn-head{max-width:1120px;margin:0 auto;padding:12px 16px 6px;display:flex;gap:12px;align-items:center}
.sn-head .tn{font:900 italic 26px/1 'Barlow Condensed';text-transform:uppercase}
.sn-head .ts{font:800 15px 'Barlow Condensed';letter-spacing:.5px;color:var(--mut);text-transform:uppercase;margin-top:3px}
.sn-row{display:flex;align-items:center;gap:10px;width:100%;background:var(--panel);border:1px solid var(--line);border-left:3px solid transparent;border-radius:4px;padding:8px 10px;text-align:left;font:600 15px Barlow;color:var(--txt);margin-bottom:5px;min-height:46px}
.sn-row:hover{background:var(--panel2)}
.sn-row.sel{border-color:var(--gold);border-left-color:var(--gold);background:#2a2614}
.sn-row.focus{outline:3px solid #fff;outline-offset:1px}
.sn-row .nm{font:800 italic 18px 'Barlow Condensed';text-transform:uppercase;letter-spacing:.3px;line-height:1.05}
.sn-row .sm{font:600 12.5px Barlow;color:var(--mut)}
.sn-row .gr{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.sn-row .num{font:900 italic 20px 'Barlow Condensed';color:var(--gold);min-width:22px;text-align:center}
.sn-row .r{margin-left:auto;text-align:right;font:700 13px Barlow;color:var(--mut);white-space:nowrap}
.sn-pos{min-width:42px;justify-content:center}
.sn-ovr{display:inline-block;min-width:30px;text-align:center;font:900 italic 18px 'Barlow Condensed';padding:1px 4px;border-radius:3px;background:var(--panel2)}
.sn-ovr.t1{background:var(--gold);color:#111}.sn-ovr.t2{background:#2f6b45}.sn-ovr.t3{background:#2b4a6e}
.sn-w{color:var(--green);font-weight:800}.sn-l{color:var(--red);font-weight:800}
.sn-next{border-top:4px solid var(--gold)}
.sn-next .when{font:800 15px 'Barlow Condensed';letter-spacing:.6px;color:var(--mut);text-transform:uppercase;text-align:center;margin-bottom:10px}
.sn-next .vs .side{padding:10px 8px}
.sn-next .rec{font:800 16px 'Barlow Condensed';color:var(--mut)}
.sn-next .sp{font:600 13px Barlow;color:var(--txt);text-align:center}
.sn-acts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
.sn-acts .btn{padding:11px 6px;font-size:18px}
.sn-kv{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center}
.sn-kv b{display:block;font:900 italic 28px 'Barlow Condensed';color:var(--gold)}
.sn-kv span{font:800 12px 'Barlow Condensed';letter-spacing:.6px;color:var(--mut);text-transform:uppercase}
.sn-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:12px}
.sn-lead{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr));gap:10px}
.sn-lead .panel{padding:12px}
.sn-lead h3{font-size:18px;color:var(--gold);margin-bottom:4px}
.sn-lr{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #ffffff0d;font-size:14px}
.sn-lr .k{width:16px;color:var(--mut);font:800 13px 'Barlow Condensed'}
.sn-lr .v{margin-left:auto;font:800 17px 'Barlow Condensed';font-variant-numeric:tabular-nums}
.sn-link{background:none;border:0;padding:0;font:inherit;color:var(--txt);text-align:left;cursor:pointer}
.sn-link.focus{outline:2px solid #fff}
.sn-bars{display:grid;grid-template-columns:44px 1fr 30px;gap:5px 8px;align-items:center;font:800 13px 'Barlow Condensed';letter-spacing:.5px;color:var(--mut)}
.sn-bars i{display:block;height:9px;background:var(--panel2);border-radius:2px;overflow:hidden}
.sn-bars i u{display:block;height:100%;background:#4a6a90}
.sn-bars i u.t1{background:var(--gold)}.sn-bars i u.t2{background:var(--green)}
.sn-bars b{color:var(--txt);text-align:right;font-size:15px}
.sn-pc{display:flex;gap:14px;align-items:center;margin-bottom:12px}
.sn-pc .big{font:900 italic 46px/1 'Barlow Condensed';color:var(--gold)}
.sn-ser{background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:8px 10px;margin-bottom:8px}
.sn-ser.me{border-color:var(--gold)}
.sn-ser .tr{display:flex;align-items:center;gap:8px;padding:3px 0;font:800 italic 18px 'Barlow Condensed'}
.sn-ser .tr.out{opacity:.4}
.sn-ser .tr .sd{width:16px;color:var(--mut);font-size:13px;font-style:normal}
.sn-ser .tr .wn{margin-left:auto;font-size:22px;color:var(--gold)}
.sn-ser .lbl{font:800 12px 'Barlow Condensed';letter-spacing:.6px;color:var(--mut);text-transform:uppercase}
.sn-brk{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.sn-prog{width:100%;height:10px;background:var(--panel2);border-radius:3px;overflow:hidden;margin:12px 0}
.sn-prog u{display:block;height:100%;background:var(--gold);width:0}
.sn-champ{text-align:center;padding:26px 16px;border-top:4px solid var(--gold)}
.sn-champ .yr{font:900 italic 22px 'Barlow Condensed';color:var(--gold);letter-spacing:1px}
.sn-champ .big{font:900 italic 44px/1 'Barlow Condensed';text-transform:uppercase;margin:6px 0}
.sn-champ canvas{margin:12px auto}
.sn-box td,.sn-box th{padding:4px 6px!important;font-size:13px}
.sn-mini{font-size:13px}
.sn-mini td{padding:4px 6px!important}
.sn-dec{font:800 13px 'Barlow Condensed';color:var(--gold);margin-left:4px}
.sn-slot{display:flex;gap:14px;align-items:center}
.sn-slot .gr{flex:1}
@media (max-width:640px){
 .sn-acts{grid-template-columns:1fr 1fr}
 .sn-brk{grid-template-columns:1fr}
 .sn-head .tn{font-size:21px}
 .sn-kv b{font-size:24px}
 .sn-next .vs{gap:8px}.sn-next .vs .side .nm{font-size:19px}.sn-next .vs .mid{font-size:24px}
 .hide-m{display:none}
}`;
  document.head.append(s);
}
export const tier = v => v >= 85 ? 't1' : v >= 75 ? 't2' : v >= 65 ? 't3' : '';
export const ovrTag = p => h('span', { class: 'sn-ovr ' + tier(p?.ovr || 0) }, String(p?.ovr ?? '--'));
export const isPit = p => p && (p.pos === 'SP' || p.pos === 'RP' || p.pos === 'CL');
export const nm = pid => DB.nm(DB.player(pid));
export function batShort(S, pid) {
  const o = bline(S.bat[pid]); if (!o.pa) return 'No stats yet';
  return `${fmt3(o.avg)}  ${o.hr} HR  ${o.rbi} RBI  ${fmt3(o.ops)} OPS`;
}
export function pitShort(S, pid) {
  const o = pline(S.pit[pid]); if (!o.g) return 'No stats yet';
  return `${o.w}-${o.l}  ${fmtERA(o.era)} ERA  ${ipStr(o.outs)} IP  ${o.so} K${o.sv ? '  ' + o.sv + ' SV' : ''}`;
}

// main.js is loaded with a ?v= query, so importing it here would run a second copy: local twins of its helpers
export function go(path) { location.hash = '#/' + path; }
export function topBar(title, back = '') {
  return h('div', { class: 'top' }, h('div', { class: 'in' },
    h('div', { class: 'brand', onclick: () => go('') }, h('span', {}, 'GRAND SLAM'), h('b', {}, '27')),
    h('div', { class: 'right' }, title ? h('span', { class: 'pill' }, title) : null,
      back !== null ? h('button', { class: 'btn ghost small', onclick: () => go(back) }, 'BACK') : null)));
}
export function optRow(label, opts, cur, on) {
  return h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'cond', style: 'font:800 16px Barlow Condensed;letter-spacing:.6px;color:var(--mut)' }, label),
    h('div', { class: 'seg' }, opts.map(([v, t]) => h('button', { class: String(v) === String(cur) ? 'on' : '', onclick: () => on(v) }, t))));
}

// ---------------- player card ----------------
export function playerCard(S, pid, actions = []) {
  const p = DB.player(pid); if (!p) return;
  const m = modal('');
  const club = S && S.own && pid in S.own ? S.own[pid] : p.t;
  const t = club ? DB.team(club) : null;
  const bars = (list) => h('div', { class: 'sn-bars' }, list.filter(([, v]) => v != null).flatMap(([k, v]) => [h('span', {}, k), h('i', {}, h('u', { class: tier(v), style: `width:${Math.max(4, v)}%` })), h('b', {}, String(v))]));
  const ht = p.ht ? `${Math.floor(p.ht / 12)}'${p.ht % 12}"` : '';
  const hitter = !isPit(p) || p.pos === 'DH';
  const twoWay = p.stf != null && p.con != null && !isPit(p) && p.pit && p.pit.length;
  const kids = [
    h('div', { class: 'sn-pc' }, t ? badge(t, 56) : null,
      h('div', { style: 'flex:1' }, h('div', { style: "font:900 italic 30px/1 'Barlow Condensed';text-transform:uppercase" }, DB.full(p)),
        h('div', { class: 'muted', style: 'margin-top:4px;font-size:14px' }, `${p.pos}${p.num != null ? '  #' + p.num : ''}  ·  ${t ? t.city + ' ' + t.name : 'Free agent'}`),
        h('div', { class: 'muted', style: 'font-size:13px' }, `Age ${p.age}  ·  B/T ${p.b}/${p.th}  ·  ${ht} ${p.wt || ''}`)),
      h('div', { style: 'text-align:center' }, h('div', { class: 'big' }, String(p.ovr)), h('div', { class: 'muted', style: "font:800 12px 'Barlow Condensed'" }, 'OVR'))),
  ];
  const cols = h('div', { class: 'sn-cols', style: 'grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))' });
  if (hitter || twoWay || !isPit(p)) cols.append(h('div', {}, h('h3', { style: 'font-size:17px;margin-bottom:6px' }, 'HITTING'), bars([['CON', p.con], ['POW', p.pow], ['EYE', p.eye], ['SPD', p.spd], ['FLD', p.fld], ['ARM', p.arm]])));
  if (isPit(p) || twoWay) {
    cols.append(h('div', {}, h('h3', { style: 'font-size:17px;margin-bottom:6px' }, 'PITCHING'), bars([['STF', p.stf], ['CTL', p.ctl], ['STA', p.sta], ['VEL', p.vel != null ? Math.max(20, Math.min(99, Math.round((p.vel - 84) * 5))) : null]]),
      p.vel ? h('div', { class: 'muted', style: 'font-size:13px;margin-top:6px' }, `Top velo ${p.vel} mph`) : null,
      p.pit && p.pit.length ? h('div', { style: 'margin-top:6px;display:flex;flex-wrap:wrap;gap:4px' }, p.pit.map(([c, mph, u]) => h('span', { class: 'pill' }, `${c} ${Math.round(mph)} · ${Math.round(u)}%`))) : null));
  }
  kids.push(cols);
  // real 2026 + this season
  const rows = [];
  const l = p.ln26;
  if (l && l.length === 7) rows.push(['2026 (REAL)', `${l[0]} G  ${l[1]} PA  ${fmt3(l[2])} AVG  ${l[3]} HR  ${l[4]} RBI  ${l[5]} SB  ${fmt3(l[6])} OPS`]);
  if (l && l.length === 9) rows.push(['2026 (REAL)', `${l[0]} G  ${l[1]} GS  ${l[2]}-${l[3]}  ${fmtERA(l[4])} ERA  ${l[5]} IP  ${l[6]} K${l[7] ? '  ' + l[7] + ' SV' : ''}  ${l[8]} WHIP`]);
  if (S) {
    const b = bline(S.bat[pid]), q = pline(S.pit[pid]);
    if (b.pa) rows.push([S.year + ' SEASON', `${b.g} G  ${b.pa} PA  ${fmt3(b.avg)} / ${fmt3(b.obp)} / ${fmt3(b.slg)}  ${b.hr} HR  ${b.rbi} RBI  ${b.r} R  ${b.sb} SB  ${b.bb} BB  ${b.so} K`]);
    if (q.g) rows.push([S.year + ' SEASON', `${q.g} G  ${q.gs} GS  ${q.w}-${q.l}  ${fmtERA(q.era)} ERA  ${ipStr(q.outs)} IP  ${q.so} K  ${q.bb} BB  ${q.sv} SV  ${q.whip == null ? '-' : q.whip.toFixed(2)} WHIP`]);
  }
  if (rows.length) kids.push(h('div', { style: 'margin-top:14px' }, rows.map(([k, v]) => h('div', { style: 'margin-bottom:8px' }, h('div', { class: 'pill' }, k), h('div', { style: 'font-size:14px;margin-top:3px;white-space:normal' }, v)))));
  kids.push(h('div', { class: 'row', style: 'margin-top:14px' }, actions.map(([label, fn, cls]) => h('button', { class: 'btn small ' + (cls || ''), onclick: () => { m.close(); fn(); } }, label)),
    h('button', { class: 'btn ghost small', onclick: () => m.close() }, 'CLOSE')));
  m.el.append(...kids);
  return m;
}

// ---------------- box score ----------------
export function boxScore(box, title = '') {
  const m = modal(''), A = DB.team(box.away), H = DB.team(box.home);
  const inn = Math.max(box.innings || 9, box.line.length);
  const ls = h('table', { class: 't sn-box' },
    h('tr', {}, h('th', {}, ''), Array.from({ length: inn }, (_, i) => h('th', { class: 'n' }, String(i + 1))), h('th', { class: 'n' }, 'R'), h('th', { class: 'n' }, 'H'), h('th', { class: 'n' }, 'E')),
    [0, 1].map(s => h('tr', {}, h('td', { style: 'font-weight:800' }, [A, H][s].id),
      Array.from({ length: inn }, (_, i) => h('td', { class: 'n' }, box.line[i] ? (box.line[i][s] == null ? 'X' : String(box.line[i][s])) : '')),
      h('td', { class: 'n gold', style: 'font-weight:800' }, String(box.score[s])), h('td', { class: 'n' }, String(box.hits[s])), h('td', { class: 'n' }, String(box.errors[s])))));
  const dec = pid => box.dec && (box.dec.w == pid ? 'W' : box.dec.l == pid ? 'L' : box.dec.sv == pid ? 'S' : '');
  const batT = s => h('div', { class: 'scroll-x' }, h('table', { class: 't sn-box' },
    h('tr', {}, ['BATTERS', 'AB', 'R', 'H', 'RBI', 'BB', 'SO', 'HR'].map((k, i) => h('th', { class: i ? 'n' : '' }, k))),
    box.order[s].map(pid => { const b = box.bat[pid] || {}; return h('tr', {}, h('td', {}, nm(pid)), ['ab', 'r', 'h', 'rbi', 'bb', 'so', 'hr'].map(k => h('td', { class: 'n' }, String(b[k] ?? 0)))); })));
  const pitT = s => h('div', { class: 'scroll-x' }, h('table', { class: 't sn-box' },
    h('tr', {}, ['PITCHERS', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'HR', 'PC'].map((k, i) => h('th', { class: i ? 'n' : '' }, k))),
    box.pitchers[s].map(pid => { const p = box.pit[pid] || {}; const d = dec(pid); return h('tr', {}, h('td', {}, nm(pid), d ? h('span', { class: 'sn-dec' }, d) : null), h('td', { class: 'n' }, ipStr(p.outs || 0)), ['h', 'r', 'er', 'bb', 'so', 'hr', 'pc'].map(k => h('td', { class: 'n' }, String(p[k] ?? 0)))); })));
  m.el.append(
    h('h2', {}, title || 'BOX SCORE'),
    h('div', { class: 'sub' }, `${A.city} ${A.name} at ${H.city} ${H.name}  ·  ${DB.park(box.park || box.home)?.name || ''}`),
    h('div', { class: 'scroll-x' }, ls),
    box.pog ? h('div', { class: 'muted', style: 'margin:8px 0 2px;font-size:14px' }, 'Player of the game: ', h('b', { style: 'color:var(--txt)' }, DB.full(DB.player(box.pog)))) : null,
    ...[0, 1].map(s => h('div', { style: 'margin-top:12px' }, h('h3', { style: 'font-size:18px;color:var(--gold)' }, [A, H][s].city + ' ' + [A, H][s].name), batT(s), h('div', { style: 'height:6px' }), pitT(s))),
    box.log && box.log.length ? h('div', { style: 'margin-top:12px' }, h('h3', { style: 'font-size:18px' }, 'SCORING'), h('div', { class: 'muted', style: 'font-size:14px;line-height:1.6;white-space:normal' }, box.log.map(s => h('div', {}, s)))) : null,
    h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn ghost small', onclick: () => m.close() }, 'CLOSE')));
  return m;
}
export function confirmBox(title, text, yes, onYes, cls = '') {
  const m = modal('');
  m.el.append(h('h2', {}, title), h('div', { class: 'sub', style: 'white-space:normal' }, text),
    h('div', { class: 'row' }, h('button', { class: 'btn small ' + cls, onclick: () => { m.close(); onYes(); } }, yes), h('button', { class: 'btn ghost small', onclick: () => m.close() }, 'CANCEL')));
  setTimeout(() => m.el.querySelector('.btn')?.classList.add('focus'), 30);
  return m;
}
