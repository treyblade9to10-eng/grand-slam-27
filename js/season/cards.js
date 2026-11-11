// Season mode: shared UI bits - injected CSS, player card modal, box score modal, small formatters.
import * as DB from '../db.js';
import { h, badge, modal, fmt3, fmtERA, ipStr } from '../ui.js';
import { bline, pline } from './stats.js';

export function css() {
  if (document.getElementById('season-css')) return;
  const s = document.createElement('style'); s.id = 'season-css';
  s.textContent = `
/* ---- season mode: broadcast look (dark navy panels, club color accents, condensed italic caps) ---- */
.sn{--ac:var(--gold);min-height:100%}
.sn-title{margin:4px 0 12px}
.sn-title .sub{margin-bottom:0}
/* club header strip + tabs */
.sn-head{position:relative;overflow:hidden;border-bottom:1px solid var(--line);background:var(--bg)}
.sn-head::before{content:'';position:absolute;inset:0;background:linear-gradient(100deg,var(--cb) 0%,color-mix(in srgb,var(--cb) 55%,transparent) 26%,transparent 58%)}
.sn-head::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,var(--ac),transparent 55%)}
.sn-head .in{position:relative;max-width:1120px;margin:0 auto;display:flex;align-items:center;gap:10px 18px;padding:10px 16px;flex-wrap:wrap}
.sn-head .id{display:flex;align-items:center;gap:12px;min-width:0}
.sn-head .id canvas{filter:drop-shadow(0 2px 6px rgba(0,0,0,.4))}
.sn-head .tn{font:900 italic 28px/1 'Barlow Condensed';text-transform:uppercase;white-space:nowrap;text-shadow:0 2px 0 rgba(0,0,0,.25)}
.sn-head .ts{font:800 14px 'Barlow Condensed';letter-spacing:.8px;color:#ffffffbf;text-transform:uppercase;margin-top:3px;white-space:nowrap;display:flex;gap:8px;align-items:center}
.sn-head .ts b{background:#0b0f15cc;color:var(--gold);padding:0 7px;font:900 italic 15px 'Barlow Condensed'}
.sn-tabs.nav{position:relative;margin:0 0 0 auto;padding:3px 4px;max-width:100%;gap:2px}
.sn-tabs .ind{position:absolute;top:3px;bottom:3px;left:0;width:0;background:var(--gold);border-radius:2px;transition:transform .3s cubic-bezier(.2,.8,.2,1),width .3s cubic-bezier(.2,.8,.2,1);pointer-events:none}
.sn-tabs button{position:relative;z-index:1;transition:color .18s .06s;transform:none}
.sn-tabs button span{transform:none}
@media (hover:hover){.sn-tabs button:not(.on):hover{color:#fff}}
.sn-tabs button.on{background:none;color:#111}
.sn-body{padding-top:12px}
@keyframes snIn{from{opacity:0;transform:translateX(var(--dx,0px))}to{opacity:1;transform:none}}
.sn-body.enter{animation:snIn .28s cubic-bezier(.2,.8,.2,1)}
/* panels: squared broadcast plates with a title band */
.sn .panel{background:linear-gradient(180deg,#141b26,#10161f);border:1px solid #1f2836;border-radius:2px}
.sn .panel:not(.sn-champ){padding:12px 14px!important}
.sn .panel>h3:first-child{display:flex;align-items:center;gap:9px;font-size:17px;letter-spacing:1px;color:#fff;margin:-12px -14px 10px!important;padding:8px 14px 7px;background:linear-gradient(90deg,#1b2432,#141b26 70%);border-bottom:1px solid #1f2836}
.sn .panel>h3:first-child::before{content:'';flex:none;width:5px;height:15px;background:var(--ac);transform:skewX(-14deg)}
.sn .panel>h3:not(:first-child){font-size:16px;letter-spacing:.8px;color:#c9d1dc}
.sn .sub{color:#8d98aa}
/* tables */
.sn table.t th{background:#0d1219;color:#7f8a9c;font-size:12px;letter-spacing:.9px;padding:6px 8px}
.sn table.t td{border-bottom:1px solid #ffffff0a;font-variant-numeric:tabular-nums}
.sn table.t tr:nth-child(odd) td{background:#ffffff04}
.sn table.t tr.me td{background:color-mix(in srgb,var(--ac) 16%,transparent)}
.sn table.t tr.me td:first-child{box-shadow:inset 3px 0 0 var(--ac)}
.sn table.t td.tm{font:800 italic 16px 'Barlow Condensed';letter-spacing:.3px}
.sn table.t td.tm span{display:inline-flex;align-items:center;gap:7px}
.sn .seg{border-radius:2px}
/* list rows (results, roster) */
.sn-row{display:flex;align-items:center;gap:10px;width:100%;background:#151c27;border:1px solid #1f2836;border-left:3px solid #2a3444;border-radius:2px;padding:7px 10px;text-align:left;font:600 15px Barlow;color:var(--txt);margin-bottom:4px;min-height:44px;transition:background .15s,border-color .15s}
.sn-row:hover{background:#1b2431;border-left-color:var(--ac)}
.sn-row.sel{border-color:var(--gold);border-left-color:var(--gold);background:color-mix(in srgb,var(--gold) 12%,#151c27)}
.sn-row.focus{outline:3px solid #fff;outline-offset:1px}
.sn-row .nm{font:800 italic 18px 'Barlow Condensed';text-transform:uppercase;letter-spacing:.3px;line-height:1.05}
.sn-row .sm{font:700 12.5px 'Barlow Condensed';letter-spacing:.5px;color:var(--mut);text-transform:uppercase}
.sn-row .gr{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sn-row .gr .sm{white-space:pre;text-transform:none;font:600 12.5px Barlow;letter-spacing:0;overflow:hidden;text-overflow:ellipsis}
.sn-row .num{font:900 italic 20px 'Barlow Condensed';color:var(--gold);min-width:24px;text-align:center}
.sn-row .r{margin-left:auto;text-align:right;font:800 14px 'Barlow Condensed';letter-spacing:.5px;color:var(--mut);white-space:nowrap}
.sn-row .sn-w,.sn-row .sn-l{font:900 italic 16px 'Barlow Condensed';color:#fff;padding:2px 9px;min-width:64px;text-align:center;clip-path:polygon(4px 0,100% 0,calc(100% - 4px) 100%,0 100%)}
.sn-row .sn-w{background:#1d7a43}.sn-row .sn-l{background:#9a2a2e}
.sn-pos{min-width:46px;justify-content:center}
.sn-ovr{display:inline-block;min-width:34px;text-align:center;font:900 italic 18px 'Barlow Condensed';padding:1px 6px;background:#263142;clip-path:polygon(4px 0,100% 0,calc(100% - 4px) 100%,0 100%)}
.sn-ovr.t1{background:var(--gold);color:#111}.sn-ovr.t2{background:#2f7a4c}.sn-ovr.t3{background:#2d5683}
.sn-w{color:var(--green);font-weight:800}.sn-l{color:var(--red);font-weight:800}
/* next game */
.sn .panel.sn-next{padding:0!important;overflow:hidden}
.sn-next .when{display:flex;align-items:center;gap:10px;font:800 14px 'Barlow Condensed';letter-spacing:.8px;color:#c4ccd8;text-transform:uppercase;background:#0d1219;border-bottom:1px solid #1f2836;padding-right:12px;white-space:nowrap;overflow:hidden}
.sn-next .when b{background:var(--gold);color:#111;font:900 italic 15px 'Barlow Condensed';padding:6px 16px 5px 12px;clip-path:polygon(0 0,100% 0,calc(100% - 8px) 100%,0 100%);flex:none}
.sn-next .when span{overflow:hidden;text-overflow:ellipsis}
.sn-mu{display:grid;grid-template-columns:1fr 64px 1fr;align-items:stretch;padding:12px 12px 0}
.sn-mu .vs{display:flex;align-items:center;justify-content:center;font:900 italic 34px 'Barlow Condensed';color:var(--gold);text-shadow:0 2px 0 #000}
.qp-mini{position:relative;overflow:hidden;display:flex;align-items:center;gap:12px;padding:22px 16px 12px;color:#fff;min-width:0}
.sn-mu .qp-mini:first-child{clip-path:polygon(0 0,100% 0,calc(100% - 18px) 100%,0 100%)}
.sn-mu .qp-mini:last-child{clip-path:polygon(18px 0,100% 0,100% 100%,0 100%);padding-left:30px}
.qp-mini .wm{position:absolute;right:-30px;bottom:-40px;opacity:.12;pointer-events:none}
.qp-mini>canvas.badge{position:relative;flex:none;filter:drop-shadow(0 3px 8px rgba(0,0,0,.35))}
.qp-mini .tag{position:absolute;top:0;left:0;background:#0b0f15;font:900 italic 12px 'Barlow Condensed';letter-spacing:1px;padding:2px 10px}
.sn-mu .qp-mini:last-child .tag{left:auto;right:0}
.qp-mini .tag.you{background:var(--gold);color:#111}
.qp-mini .tx{position:relative;min-width:0}
.qp-mini .nm{font:900 italic 30px/.95 'Barlow Condensed';text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qp-mini .rec{font:800 16px 'Barlow Condensed';letter-spacing:.8px;color:#ffffffcc}
.qp-mini .sp{display:flex;gap:6px;align-items:baseline;font:600 13px Barlow;white-space:nowrap;margin-top:2px}
.qp-mini .sp small{font:800 11px 'Barlow Condensed';letter-spacing:1px;color:#ffffffa0}
.qp-mini .sp span{color:#ffffffb0;font-size:12px}
.sn-acts{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:8px;padding:12px}
.sn-acts .btn{padding:11px 6px;font-size:19px}
/* record strip */
.sn .panel.sn-kvp{padding:0!important}
.sn-kv{display:grid;grid-template-columns:repeat(4,1fr);text-align:center}
.sn-kv>div{padding:10px 6px;border-left:1px solid #1f2836}
.sn-kv>div:first-child{border-left:0}
.sn-kv b{display:block;font:900 italic 30px/1.05 'Barlow Condensed';color:#fff}
.sn-kv>div:first-child b{color:var(--gold)}
.sn-kv span{font:800 12px 'Barlow Condensed';letter-spacing:1px;color:var(--mut);text-transform:uppercase}
.sn-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:12px}
/* leaders */
.sn-lead{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr));gap:10px}
.sn-lr{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #ffffff0a;font-size:14px;min-width:0}
.sn-lr:last-child{border-bottom:0}
.sn-lr .k{width:16px;color:var(--mut);font:800 13px 'Barlow Condensed';flex:none}
.sn-lr .v{margin-left:auto;font:900 italic 18px 'Barlow Condensed';font-variant-numeric:tabular-nums;flex:none}
.sn-lead .sn-lr:first-of-type .v{color:var(--gold)}
.sn-lr.gold .sn-link{color:var(--gold)}
.sn-link{background:none;border:0;padding:0;font:inherit;color:var(--txt);text-align:left;cursor:pointer;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sn-link:hover{color:#fff;text-decoration:underline}
.sn-link.focus{outline:2px solid #fff}
/* player card bars */
.sn-bars{display:grid;grid-template-columns:44px 1fr 30px;gap:5px 8px;align-items:center;font:800 13px 'Barlow Condensed';letter-spacing:.5px;color:var(--mut)}
.sn-bars i{display:block;height:8px;background:var(--panel2);overflow:hidden;transform:skewX(-20deg)}
.sn-bars i u{display:block;height:100%;background:#4a6a90}
.sn-bars i u.t1{background:var(--gold)}.sn-bars i u.t2{background:var(--green)}
.sn-bars b{color:var(--txt);text-align:right;font-size:15px}
.sn-pc{display:flex;gap:14px;align-items:center;margin-bottom:12px}
.sn-pc .big{font:900 italic 46px/1 'Barlow Condensed';color:var(--gold)}
/* postseason bracket */
.sn-ser{background:#151c27;border:1px solid #1f2836;border-left:3px solid #2a3444;border-radius:2px;padding:7px 10px;margin-bottom:8px}
.sn-ser.me{border-color:var(--gold);border-left-color:var(--gold)}
.sn-ser .tr{display:flex;align-items:center;gap:8px;padding:3px 0;font:800 italic 18px 'Barlow Condensed'}
.sn-ser .tr.out{opacity:.4}
.sn-ser .tr .sd{width:16px;color:var(--mut);font-size:13px;font-style:normal}
.sn-ser .tr .wn{margin-left:auto;font-size:22px;color:var(--gold)}
.sn-ser .lbl{font:800 12px 'Barlow Condensed';letter-spacing:.8px;color:var(--mut);text-transform:uppercase}
.sn-brk{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.sn-brk h3{color:#c9d1dc;letter-spacing:1px}
.sn-prog{width:100%;height:10px;background:var(--panel2);overflow:hidden;margin:12px 0;transform:skewX(-20deg)}
.sn-prog u{display:block;height:100%;background:var(--gold);width:0}
/* champions / season over */
.sn-champ{text-align:center;padding:24px 16px!important;border-top:3px solid var(--gold)!important;position:relative;overflow:hidden}
.sn-champ[data-tv]{background:var(--cb);background:linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(5,8,13,.6) 100%),linear-gradient(150deg,color-mix(in srgb,var(--cb) 88%,#fff),var(--cb) 40%,color-mix(in srgb,var(--cb) 50%,#06090e))}
.sn-champ .yr{font:900 italic 22px 'Barlow Condensed';color:var(--gold);letter-spacing:1.5px;text-shadow:0 2px 0 rgba(0,0,0,.35)}
.sn-champ .big{font:900 italic 46px/1 'Barlow Condensed';text-transform:uppercase;margin:6px 0;text-shadow:0 2px 0 rgba(0,0,0,.25)}
.sn-champ canvas{margin:10px auto;filter:drop-shadow(0 4px 10px rgba(0,0,0,.4))}
.sn-champ .muted{color:#ffffffb3}
.sn-box td,.sn-box th{padding:4px 6px!important;font-size:13px}
.sn-mini{font-size:13px}
.sn-mini td{padding:5px 7px!important}
.sn-dec{font:800 13px 'Barlow Condensed';color:var(--gold);margin-left:4px}
/* save slots */
.sn-slots{display:grid;gap:10px}
.sn-slot{position:relative;display:flex;align-items:center;gap:12px;background:#121822;border:1px solid #1f2836;min-height:86px}
.sn-slot .tbanner{flex:1;min-width:0;align-self:stretch;padding-top:16px}
.sn-slot .tbanner .rk{position:relative;margin-left:auto;text-align:right;padding-right:22px}
.sn-slot .tbanner .rk b{display:block;font:900 italic 34px/1 'Barlow Condensed'}
.sn-slot .tbanner .rk span{font:800 13px 'Barlow Condensed';letter-spacing:.8px;color:#ffffffc8}
.sn-slot .sl{position:absolute;top:0;left:0;z-index:2;background:#0b0f15;color:var(--gold);font:900 italic 12px 'Barlow Condensed';letter-spacing:1.2px;padding:2px 10px}
.sn-slot .acts{display:flex;flex-direction:column;gap:6px;padding:10px 14px 10px 0;flex:none}
.sn-slot.empty{border-style:dashed;border-color:#2a3444;background:#0f141c;padding:16px 14px 12px}
.sn-slot.empty .gr{flex:1}
.sn-slot .e1,.sn-pickhint .e1{font:900 italic 24px 'Barlow Condensed';color:#c9d1dc;letter-spacing:.5px}
.sn-slot .e2,.sn-pickhint .e2{font:600 13px Barlow;color:var(--mut)}
/* new season */
.sn-newtop{display:grid;grid-template-columns:1fr 320px;gap:12px;margin-bottom:12px}
.sn-newtop .tbanner{min-height:120px;flex-wrap:wrap;align-content:center}
.sn-newtop .tbanner .tx{flex:1}
.sn-pickhint{display:flex;flex-direction:column;justify-content:center;padding:16px 18px;background:#0f141c;border:1px dashed #2a3444;min-height:120px}
.tbanner .qp-card-meta{position:relative;display:flex;align-items:center;gap:12px}
.tbanner .ovr{display:flex;flex-direction:column;align-items:center;background:#0b0f15e6;color:var(--gold);font:900 italic 30px/1 'Barlow Condensed';padding:4px 12px 3px;clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)}
.tbanner .ovr small{font:800 11px 'Barlow Condensed';letter-spacing:1.5px;color:#ffffffa8;font-style:normal}
.tbanner .keys{position:relative;flex-basis:100%;display:flex;gap:6px 18px;flex-wrap:wrap;font:600 13px Barlow}
.tbanner .keys>div{display:flex;gap:6px;align-items:baseline;background:#0b0f1580;padding:2px 9px;white-space:nowrap}
.tbanner .keys small{font:800 11px 'Barlow Condensed';letter-spacing:1px;color:#ffffffa0}
.tbanner .keys b{font:900 italic 14px 'Barlow Condensed';color:var(--gold)}
.sn-newopts{display:flex;flex-direction:column;justify-content:center;gap:8px;background:#121822;border:1px solid #1f2836;padding:12px 14px}
.sn-newopts .lbl{font:800 12px 'Barlow Condensed';letter-spacing:1px;color:var(--mut)}
.sn-newopts .note{font:600 12.5px Barlow;color:var(--mut)}
.sn-newopts .row>span{font-size:14px!important}
.btn.sn-start{font-size:24px;padding:11px 20px}
.sn-pick .dgrid{margin-top:2px}
@media (max-width:640px){
 .sn-acts{grid-template-columns:1fr 1fr}
 .sn-brk{grid-template-columns:1fr}
 .sn-head .tn{font-size:21px}
 .sn-kv b{font-size:24px}
 .sn-mu{grid-template-columns:1fr;gap:6px}.sn-mu .vs{font-size:22px}
 .sn-mu .qp-mini:first-child,.sn-mu .qp-mini:last-child{clip-path:none;padding-left:16px}
 .sn-newtop{grid-template-columns:1fr}
 .hide-m{display:none}
}
@media (orientation:landscape) and (max-height:500px){
 .sn-head .in{flex-wrap:nowrap;padding:6px max(14px,env(safe-area-inset-right)) 6px max(14px,env(safe-area-inset-left));gap:12px}
 .sn-head .id{flex:none;gap:9px}
 .sn-head .id canvas{width:36px!important;height:36px!important}
 .sn-head .tn{font-size:20px}
 .sn-head .ts{font-size:12px;margin-top:1px}
 .sn-head .ts b{font-size:13px}
 .sn-tabs.nav{flex:1;min-width:0;margin:0;justify-content:flex-end}
 .sn-tabs button{font-size:15px;padding:5px 9px}
 .sn-body{padding-top:8px}
 .sn .panel:not(.sn-champ){padding:10px 12px!important}
 .sn .panel>h3:first-child{margin:-10px -12px 8px!important;padding:6px 12px 5px;font-size:15px}
 .sn-next .when{font-size:12px}
 .sn-next .when b{font-size:13px;padding:4px 14px 3px 10px}
 .sn-mu{padding:8px 10px 0;grid-template-columns:1fr 50px 1fr}
 .sn-mu .vs{font-size:26px}
 .qp-mini{padding:18px 12px 8px;gap:10px}
 .qp-mini>canvas.badge{width:44px!important;height:44px!important}
 .qp-mini .nm{font-size:22px}
 .qp-mini .rec{font-size:14px}
 .sn-acts{padding:8px 10px 10px;gap:6px}
 .sn-acts .btn{font-size:16px;padding:8px 4px}
 .sn-kv>div{padding:6px 4px}
 .sn-kv b{font-size:24px}
 .sn-kv span{font-size:11px}
 .sn-row{min-height:38px;padding:5px 9px}
 .sn-row .nm{font-size:16px}
 .sn-slot{min-height:70px}
 .sn-slot .tbanner .rk b{font-size:26px}
 .sn-newtop{grid-template-columns:1fr 280px;gap:8px;margin-bottom:8px}
 .sn-newtop .tbanner{min-height:0;padding:10px 14px;gap:6px 10px}
 .sn-newtop .tbanner .tx{flex:none}
 .sn-newtop .tbanner .ovr{font-size:22px;padding:3px 9px 2px}
 .tbanner .keys{font-size:12px;gap:4px 8px}
 .sn-newopts{padding:8px 12px;gap:6px}
 .btn.sn-start{font-size:20px;padding:8px 16px}
 .sn-champ{padding:14px 12px!important}
 .sn-champ .big{font-size:34px}
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
