// MLB Grand Slam 27 - small UI helpers shared by every screen
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

// Original team badge (NOT the real club logo - those are trademarked). Circle cap-badge in club colors.
const badgeCache = new Map();
export function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; }
export function badgeCanvas(team, size = 64) {
  const k = team.id + size;
  if (badgeCache.has(k)) { const c = badgeCache.get(k); const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.getContext('2d').drawImage(c, 0, 0); n.style.width = n.style.height = size + 'px'; n.className = 'badge'; return n; }
  const dpr = 2, S = size * dpr, cv = document.createElement('canvas'); cv.width = cv.height = S;
  drawBadge(cv.getContext('2d'), team, S / 2, S / 2, S / 2 - 2 * dpr);
  badgeCache.set(k, cv);
  cv.style.width = cv.style.height = size + 'px'; cv.className = 'badge';
  return badgeCanvas(team, size);
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

// Keyboard / gamepad focus navigation for menus (arrow keys / d-pad + Enter / A)
let navOn = false;
export function menuNav() {
  if (navOn) return; navOn = true;
  const focusables = () => $$('#app .opt, #app .btn, #app .tbtn, #app .nav button, #app .seg button, .modal .btn, .modal .opt').filter(e => e.offsetParent && !e.disabled);
  let cur = null;
  const set = e => { $$('.focus').forEach(f => f.classList.remove('focus')); cur = e; if (e) { e.classList.add('focus'); e.scrollIntoView({ block: 'nearest' }); } };
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
  window.__menuNav = { move, act, back: () => { const b = $('.modal-bg'); if (b) b.remove(); else if (location.hash && location.hash !== '#/') history.back(); } };
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
