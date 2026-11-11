// Title screen background: a slow helicopter shot over a random real ballpark
import { makeStage } from './scene.js';
import * as DB from '../db.js';
import * as THREE from '../lib/three.min.js';
export function titleBg(el) {
  const ids = DB.TEAMS.map(t => t.id), id = ids[Math.random() * ids.length | 0];
  const time = ['night', 'night', 'dusk', 'day'][Math.random() * 4 | 0];
  const st = makeStage(el, id, DB.park(id), DB.team(id), time);
  let run = true, a = Math.random() * 6, last = performance.now();
  const loop = now => {
    if (!run) return; requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; a += dt * 0.05;
    st.camera.position.set(Math.sin(a) * 520, 190, -170 + Math.cos(a) * 520); st.camera.lookAt(0, 0, -150);
    st.park.crowd.update(dt, now / 1000, 0.15, st.camera);
    st.renderer.render(st.scene, st.camera);
  };
  requestAnimationFrame(loop);
  st.park.drawBoard({ title: 'MLB GRAND SLAM 27', sub: DB.park(id).name.toUpperCase() });
  return { id, time, stop() { run = false; st.dispose(); } };
}
