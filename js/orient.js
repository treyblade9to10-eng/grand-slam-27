// Phones play sideways: fullscreen + landscape lock where the browser allows it (Android Chrome).
// iPhone Safari can't lock, so the game shows a "turn your phone sideways" overlay instead (game.js).
export const isTouch = () => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
export function goLandscape() {
  if (!isTouch()) return;
  try {
    const el = document.documentElement, rq = el.requestFullscreen || el.webkitRequestFullscreen;
    const lock = () => { try { const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (p && p.catch) p.catch(() => { }); } catch (e) { } };
    if (rq && !document.fullscreenElement && !document.webkitFullscreenElement) { const p = rq.call(el, { navigationUI: 'hide' }); if (p && p.then) p.then(lock, lock); else lock(); }
    else lock();
  } catch (e) { }
}
export function leaveLandscape() {
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { }
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => { }); } catch (e) { }
}
