// Real club logos, loaded at runtime from MLB's public logo CDN (never copied into the repo).
// Settings.logos = 'real' (default) | 'classic' (our own circle badges). If a logo can't load we fall back to the badge.
import { Settings } from './store.js';
const BASE = 'https://www.mlbstatic.com/team-logos/';
// kind: 'primary' (club logo, for light backgrounds), 'primaryDark' (for dark backgrounds - menus/HUD), 'cap' (cap insignia, drawn for a dark/colored cap), 'capLight' (for a light cap)
const PATH = { primary: '', primaryDark: 'team-primary-on-dark/', cap: 'team-cap-on-dark/', capLight: 'team-cap-on-light/' };
const cache = new Map(); // key -> {img, ok, p}
const listeners = new Set();
export const realLogos = () => Settings.logos !== 'classic';
export function logoKey(team, kind = 'primary') { return kind + team.mlbId; }
export function loadLogo(team, kind = 'primary') {
  if (!team || !team.mlbId) return Promise.resolve(null);
  const k = logoKey(team, kind);
  if (cache.has(k)) return cache.get(k).p;
  const e = { img: null, ok: false };
  e.p = new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
    const done = ok => { e.ok = ok && img.naturalWidth > 0; e.img = e.ok ? img : null; res(e.img); if (e.ok) for (const f of listeners) try { f(team, kind); } catch (er) { } };
    img.onload = () => done(true); img.onerror = () => done(false);
    setTimeout(() => { if (!e.img && !e.done) { e.done = true; } }, 8000);
    img.src = BASE + PATH[kind] + team.mlbId + '.svg';
  });
  cache.set(k, e); return e.p;
}
// sync: the loaded image or null
export function logoImg(team, kind = 'primary') { if (!realLogos() || !team) return null; const e = cache.get(logoKey(team, kind)); return e && e.ok ? e.img : null; }
export function onLogo(f) { listeners.add(f); return () => listeners.delete(f); }
export function preloadLogos(teams, kinds = ['primary']) { if (!realLogos()) return Promise.resolve(); return Promise.all(teams.flatMap(t => kinds.map(k => loadLogo(t, k)))); }
// draw an image fitted (contain) into a box centered at cx,cy
export function drawFit(x, img, cx, cy, w, h) {
  const iw = img.naturalWidth || img.width || 1, ih = img.naturalHeight || img.height || 1, s = Math.min(w / iw, h / ih);
  x.drawImage(img, cx - iw * s / 2, cy - ih * s / 2, iw * s, ih * s);
}
