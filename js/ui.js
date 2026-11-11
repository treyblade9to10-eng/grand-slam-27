// MLB Grand Slam 27 - small UI helpers shared by every screen
import { logoImg, loadLogo, onLogo, realLogos, drawFit } from './logos.js';
import * as DB from './db.js';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
let toastT = 0;
export function toast(msg, ms = 1800) {
  let t = $('#toast'); if (!t) { t = h('div', { id: 'toast', class: 'toast' }); document.body.append(t); }
  t.className = 'toast'; t.textContent = msg; requestAnimationFrame(() => t.classList.add('on'));
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}
export function modal(html, opts = {}) {
  const bg = h('div', { class: 'modal-bg' }); const m = h('div', { class: 'modal', html }); bg.append(m);
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg && !opts.locked) close(); });
  document.body.append(bg); return { el: m, close };
}
export const fmt3 = v => (v == null || isNaN(v)) ? '---' : (v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, ''));
export const fmtERA = v => (v == null || !isFinite(v)) ? '-.--' : v.toFixed(2);
export const ipStr = outs => Math.floor(outs / 3) + '.' + (outs % 3);
export function ord(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// Team badge: the real club logo (runtime from MLB's CDN, see logos.js) or our own circle badge as fallback / "classic" setting.
const badgeCache = new Map();
const pendingBadges = new Map(); // team id -> [WeakRef<canvas>]
export function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; }
function paintBadge(cv, team) {
  const x = cv.getContext('2d'), S = cv.width, img = logoImg(team, 'primaryDark');
  x.clearRect(0, 0, S, S);
  if (img) { drawFit(x, img, S / 2, S / 2, S * 0.92, S * 0.92); return true; }
  drawBadge(x, team, S / 2, S / 2, S / 2 - 4); return false;
}
onLogo((team, kind) => {
  if (kind !== 'primaryDark') return;
  for (const [k, cv] of badgeCache) if (k.startsWith(team.id + '|')) paintBadge(cv, team);
  const list = pendingBadges.get(team.id) || []; pendingBadges.delete(team.id);
  for (const r of list) { const cv = r.deref(); if (cv) paintBadge(cv, team); }
});
export function badgeCanvas(team, size = 64) {
  const dpr = 2, S = size * dpr, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ok = paintBadge(cv, team);
  if (!ok && realLogos()) { loadLogo(team, 'primaryDark'); if (typeof WeakRef !== 'undefined') { const l = pendingBadges.get(team.id) || []; l.push(new WeakRef(cv)); pendingBadges.set(team.id, l); } }
  cv.style.width = cv.style.height = size + 'px'; cv.className = 'badge'; cv.dataset.b = team.id;
  return cv;
}
// canvas with the badge drawn, cached (for textures / overlays that only read it)
export function badgeSource(team, S = 256) {
  const k = team.id + '|' + S; if (badgeCache.has(k)) return badgeCache.get(k);
  const cv = document.createElement('canvas'); cv.width = cv.height = S; paintBadge(cv, team); badgeCache.set(k, cv); return cv;
}
export function teamMark(team) { const m = { AZ: 'A', ATH: 'A', ATL: 'A', BAL: 'O', BOS: 'B', CHC: 'C', CWS: 'SOX', CIN: 'C', CLE: 'C', COL: 'CR', DET: 'D', HOU: 'H', KC: 'KC', LAA: 'A', LAD: 'LA', MIA: 'M', MIL: 'M', MIN: 'TC', NYM: 'NY', NYY: 'NY', PHI: 'P', PIT: 'P', SD: 'SD', SF: 'SF', SEA: 'S', STL: 'STL', TB: 'TB', TEX: 'T', TOR: 'T', WSH: 'W' }; return m[team.id] || team.id; }
export function drawBadge(x, team, cx, cy, r) {
  const c1 = team.c1, c2 = team.c2, c3 = team.c3 || c2;
  x.save();
  // outer ring
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = c2; x.fill();
  x.beginPath(); x.arc(cx, cy, r * 0.9, 0, Math.PI * 2); x.fillStyle = c1; x.fill();
  // stitched seam arcs (baseball feel)
  x.strokeStyle = c3; x.globalAlpha = 0.35; x.lineWidth = r * 0.05;
  x.beginPath(); x.arc(cx - r * 1.25, cy, r * 0.95, -0.7, 0.7); x.stroke();
  x.beginPath(); x.arc(cx + r * 1.25, cy, r * 0.95, Math.PI - 0.7, Math.PI + 0.7); x.stroke();
  x.globalAlpha = 1;
  // mark
  const m = teamMark(team);
  const fs = r * (m.length === 1 ? 1.25 : m.length === 2 ? 0.88 : 0.66);
  x.font = `900 italic ${fs}px "Barlow Condensed", Arial Black, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round'; x.lineWidth = r * (m.length > 1 ? 0.08 : 0.12); try { x.letterSpacing = (m.length > 1 ? r * 0.05 : 0) + 'px'; } catch (e) { } x.strokeStyle = lum(c1) > 0.6 ? c3 : c2 === c1 ? '#fff' : c2;
  const fill = lum(c1) > 0.6 ? c1 === '#FFFFFF' ? c3 : '#111' : (lum(c2) > 0.85 && lum(c3) < 0.7 && c3 !== c1 ? c3 : '#ffffff');
  x.strokeText(m, cx, cy + r * 0.06); x.fillStyle = fill; x.fillText(m, cx, cy + r * 0.06);
  x.restore();
}
export function badge(team, size = 40) { return badgeCanvas(team, size); }

// ---- team-color helpers for the broadcast-style menus ----
// CSS custom props for a club: --c1/--c2/--c3 raw colors, --ac = an accent that reads on a dark panel,
// --cb = the color the card background is built from (very dark clubs lean on their second color)
export function teamAccent(t) {
  for (const c of [t.c1, t.c2, t.c3]) if (c && lum(c) >= 0.24 && lum(c) <= 0.92) return c;
  return '#f2c14e';
}
export function teamVars(t) {
  let cb = lum(t.c1) < 0.13 && lum(t.c2) > 0.25 && lum(t.c2) < 0.9 ? mix(t.c1, t.c2, 0.35) : t.c1;
  // a logo that is mostly the club's own main color (SF, BAL, LAA...) would vanish on it: go dark instead
  if (logoClash(t, cb)) cb = lum(t.c2) < 0.2 ? mix(t.c2, t.c1, 0.12) : mix(t.c1, '#0b0f15', 0.72);
  return `--c1:${t.c1};--c2:${t.c2};--c3:${t.c3 || t.c2};--ac:${teamAccent(t)};--cb:${cb}`;
}
// attrs for a team-colored element; refreshed when the club's logo finishes loading (it can change --cb)
export const tv = t => ({ style: teamVars(t), 'data-tv': t.id });
const clash = new Map();
function logoClash(t, cb) {
  if (clash.has(t.id)) return clash.get(t.id);
  const img = logoImg(t, 'primaryDark'); if (!img) return false;
  let res = false;
  try {
    const N = 40, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const x = cv.getContext('2d', { willReadFrequently: true }); drawFit(x, img, N / 2, N / 2, N, N);
    const d = x.getImageData(0, 0, N, N).data; let r = 0, g = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; r += d[i] * a; g += d[i + 1] * a; b += d[i + 2] * a; w += a; }
    if (w > 0) { const c = [1, 3, 5].map(i => parseInt(cb.slice(i, i + 2), 16)); res = Math.hypot(r / w - c[0], g / w - c[1], b / w - c[2]) < 95; }
  } catch (e) { }
  clash.set(t.id, res); return res;
}
onLogo((team, kind) => {
  if (kind !== 'primaryDark') return;
  for (const e of document.querySelectorAll(`[data-tv="${team.id}"]`)) e.setAttribute('style', (e.getAttribute('style') || '').replace(/--c1:[^;]*;--c2:[^;]*;--c3:[^;]*;--ac:[^;]*;--cb:[^;]*/, teamVars(team)));
});
function mix(a, b, k) {
  const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)), A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
// Show-style team ratings: overall plus hitting / pitching / defense (all on the player 0-99 scale)
export function teamRatings(id, depth = DB.DEPTH[id]) {
  const avg = a => Math.round(a.reduce((s, x) => s + x, 0) / Math.max(1, a.length));
  if (!depth) return { ovr: 60, hit: 60, pit: 60, def: 60 };
  const bats = depth.lineup.map(([pid]) => DB.player(pid)).filter(Boolean);
  const arms = [...depth.rotation, ...depth.rotation, ...depth.bullpen, depth.closer].filter(x => x != null).map(DB.player).filter(Boolean);
  return { ovr: DB.teamOvr(id, depth), hit: avg(bats.map(p => p.ovr)), pit: avg(arms.map(p => p.ovr)), def: avg(bats.filter(p => p.fld != null).map(p => p.fld)) };
}
// thin labeled rating bars (used on the matchup cards)
export function ratingBars(r) {
  return h('div', { class: 'rbars' }, [['HIT', r.hit], ['PIT', r.pit], ['DEF', r.def]].map(([k, v]) =>
    h('div', {}, h('span', {}, k), h('i', {}, h('u', { style: `width:${Math.max(6, Math.min(100, (v - 40) / 59 * 100)).toFixed(0)}%` })), h('b', {}, String(v)))));
}
// All 30 clubs laid out by division (6 columns: AL East .. NL West)
const DIVS = [['AL', 'East'], ['AL', 'Central'], ['AL', 'West'], ['NL', 'East'], ['NL', 'Central'], ['NL', 'West']];
export function divisionGrid(sel, onPick, opts = {}) {
  return h('div', { class: 'dgrid' }, DIVS.map(([lg, dv]) => h('div', { class: 'dcol' }, h('div', { class: 'dh' }, lg + ' ' + dv),
    DB.TEAMS.filter(t => t.lg === lg && t.div === dv).sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name)).map(t =>
      h('button', { class: 'tbtn dt' + (t.id === sel ? ' on' : '') + (t.id === opts.other ? ' opp' : ''), ...tv(t), onclick: () => onPick(t.id) },
        badge(t, 30), h('span', { class: 'id' }, t.id), opts.sub ? h('small', {}, opts.sub(t)) : null)))));
}
// Broadcast-style club banner: team-color card with the logo, city / name and an optional right-hand block
export function teamBanner(t, ...right) {
  return h('div', { class: 'tbanner', ...tv(t) }, h('div', { class: 'wm' }, badge(t, 200)), badge(t, 64),
    h('div', { class: 'tx' }, h('div', { class: 'city' }, t.city), h('div', { class: 'name' }, t.name)), ...right);
}
// put keyboard / controller focus on an element (menuNav keeps its own cursor)
export function navFocus(e, noScroll = false) { if (window.__menuNav && e) window.__menuNav.focus(e, noScroll); }

// Keyboard / gamepad focus navigation for menus (arrow keys / d-pad + Enter / A)
let navOn = false;
export function menuNav() {
  if (navOn) return; navOn = true;
  const focusables = () => {
    const m = $$('.modal-bg').pop()?.querySelector('.modal'); // with a modal open, only it is navigable
    if (m) return $$('.btn, .opt, .tbtn, .seg button, .nv', m).filter(e => e.offsetParent && !e.disabled);
    return $$('#app .opt, #app .btn, #app .tbtn, #app .nav button, #app .seg button, #app .nv').filter(e => e.offsetParent && !e.disabled);
  };
  let cur = null;
  const set = (e, noScroll) => { $$('.focus').forEach(f => f.classList.remove('focus')); cur = e; if (e) { e.classList.add('focus'); if (!noScroll) e.scrollIntoView({ block: 'nearest' }); } };
  const move = (dx, dy) => {
    const f = focusables(); if (!f.length) return;
    if (!cur || !f.includes(cur)) { set(f[0]); return; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bd = 1e9;
    for (const e of f) {
      if (e === cur) continue; const b = e.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const ddx = bx - ax, ddy = by - ay;
      if (dx && Math.sign(ddx) !== dx) continue; if (dy && Math.sign(ddy) !== dy) continue;
      if (dx && Math.abs(ddx) < 4) continue; if (dy && Math.abs(ddy) < 4) continue;
      const d = dx ? Math.abs(ddx) + Math.abs(ddy) * 2.5 : Math.abs(ddy) + Math.abs(ddx) * 2.5;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) set(best);
  };
  const act = () => { if (cur && document.contains(cur)) cur.click(); };
  window.__menuNav = { move, act, focus: set, back: () => { const b = $('.modal-bg'); if (b) b.remove(); else if (location.hash && location.hash !== '#/') history.back(); } };
  window.addEventListener('keydown', e => {
    if (document.getElementById('game').classList.contains('on')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const k = e.key;
    if (k === 'ArrowDown') { move(0, 1); e.preventDefault(); } else if (k === 'ArrowUp') { move(0, -1); e.preventDefault(); }
    else if (k === 'ArrowLeft') { move(-1, 0); e.preventDefault(); } else if (k === 'ArrowRight') { move(1, 0); e.preventDefault(); }
    else if (k === 'Enter' && cur && document.contains(cur)) { act(); e.preventDefault(); }
    else if (k === 'Escape') window.__menuNav.back();
  });
  // gamepad polling for menus
  let prev = {};
  const poll = () => {
    requestAnimationFrame(poll);
    if (document.getElementById('game').classList.contains('on')) { prev = {}; return; }
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (!pads.length) return;
    const p = pads[0], b = i => p.buttons[i] && p.buttons[i].pressed;
    const st = { u: b(12) || p.axes[1] < -0.6, d: b(13) || p.axes[1] > 0.6, l: b(14) || p.axes[0] < -0.6, r: b(15) || p.axes[0] > 0.6, a: b(0), b: b(1) };
    if (st.u && !prev.u) move(0, -1); if (st.d && !prev.d) move(0, 1);
    if (st.l && !prev.l) move(-1, 0); if (st.r && !prev.r) move(1, 0);
    if (st.a && !prev.a) act(); if (st.b && !prev.b) window.__menuNav.back();
    prev = st;
  };
  poll();
}
