// localStorage saves. All of Trey's github.io games share one ~5MB origin, so seasons are LZ-compressed.
// LZString is loaded by a classic <script> tag in index.html
const LZ = () => window.LZString;
const PRE = 'gs27_';
export const Settings = Object.assign({
  diff: 'pro',          // rookie | pro | allstar | legend
  pci: 'assist',        // assist (PCI pulls to the ball) | manual | timing (no PCI, timing only)
  pitchMeter: true,     // pitch meter on/off (off = classic aim + throw)
  autoThrow: false,     // fielders throw to the right base automatically
  autoRun: true,        // smart baserunning
  gfx: 'auto',          // auto | high | fast
  sound: true, music: true,
  innings: 9,
  camera: 'broadcast',  // broadcast | low
  strikeZone: true,
  logos: 'real',        // real (MLB logos from MLB's CDN at runtime) | classic (our own badges)
  camFollow: true,
  replays: true,        // instant replays of homers and diving catches      // camera chases the ball after contact
}, (() => { try { return JSON.parse(localStorage.getItem(PRE + 'settings') || '{}'); } catch (e) { return {}; } })());
export function saveSettings() { localStorage.setItem(PRE + 'settings', JSON.stringify(Settings)); }
export function save(key, obj) {
  try { localStorage.setItem(PRE + key, 'z' + LZ().compressToUTF16(JSON.stringify(obj))); return true; }
  catch (e) { console.warn('save failed', e); return false; }
}
export function load(key) {
  const s = localStorage.getItem(PRE + key); if (!s) return null;
  try { return JSON.parse(s[0] === 'z' ? LZ().decompressFromUTF16(s.slice(1)) : s); } catch (e) { return null; }
}
export function del(key) { localStorage.removeItem(PRE + key); }
export function has(key) { return localStorage.getItem(PRE + key) != null; }
export function saveRaw(key, v) { localStorage.setItem(PRE + key, JSON.stringify(v)); }
export function loadRaw(key, d = null) { try { const s = localStorage.getItem(PRE + key); return s ? JSON.parse(s) : d; } catch (e) { return d; } }
