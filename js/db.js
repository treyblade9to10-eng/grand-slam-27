// Decoded roster database built from data.js (real MLB teams/players/parks as of DATA_DATE)
import { TEAMS, PARKS, PLAYERS, DEPTH, FREE_AGENTS, PF, DATA_DATE } from './data.js';
export { TEAMS, PARKS, DEPTH, DATA_DATE };
const dec = row => { const o = {}; PF.forEach((k, i) => o[k] = row[i] ?? null); return o; };
export const P = new Map();
for (const r of PLAYERS) { const p = dec(r); P.set(p.id, p); }
export const FA = (FREE_AGENTS || []).map(dec);
for (const p of FA) { p.t = null; P.set(p.id, p); }
export const T = Object.fromEntries(TEAMS.map(t => [t.id, t]));
export const player = id => P.get(id);
export const team = id => T[id];
export const park = id => PARKS[id];
export const nm = p => p ? p.fn[0] + '. ' + p.ln : '';
export const full = p => p ? p.fn + ' ' + p.ln : '';
export const isP = p => p && (p.pos === 'SP' || p.pos === 'RP' || p.pos === 'CL');
export const teamName = t => t.city + ' ' + t.name;
export function teamPlayers(id) { return [...P.values()].filter(p => p.t === id); }
// Default game sides from the depth chart. sp = which rotation slot (0..4)
export function defaultSide(teamId, spSlot = 0, depth = DEPTH[teamId]) {
  return {
    team: teamId,
    lineup: depth.lineup.map(([pid, pos]) => ({ pid, pos })),
    sp: depth.rotation[spSlot % depth.rotation.length],
    bullpen: [...depth.bullpen, depth.closer].filter(x => x != null),
    closer: depth.closer,
    bench: [...(depth.bench || [])],
  };
}
// Team strength used by menus / odds
export function teamOvr(id, depth = DEPTH[id]) {
  if (!depth) return 60;
  const hit = depth.lineup.map(([pid]) => player(pid)?.ovr || 60);
  const sp = depth.rotation.map(pid => player(pid)?.ovr || 60);
  const rp = [...depth.bullpen, depth.closer].filter(Boolean).map(pid => player(pid)?.ovr || 60);
  const avg = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  return Math.round(avg(hit) * 0.5 + avg(sp) * 0.32 + avg(rp) * 0.18);
}
