// Ball physics: pitches, batted balls (drag + backspin lift), bounces, fences. Feet / seconds. No three.js dependency.
export const G = 32.17;
export const MPH = 1.4667; // ft/s per mph
export const ZONE = { x0: -0.83, x1: 0.83, y0: 1.55, y1: 3.45 }; // strike zone at the front of the plate (incl. ball radius)
export const PITCH_NAMES = { FF: '4-SEAM', SI: 'SINKER', FC: 'CUTTER', SL: 'SLIDER', ST: 'SWEEPER', CU: 'CURVE', KC: 'KNUCKLE CURVE', CH: 'CHANGEUP', FS: 'SPLITTER', SV: 'SLURVE', KN: 'KNUCKLEBALL', FO: 'FORKBALL', SC: 'SCREWBALL', CS: 'SLOW CURVE', EP: 'EEPHUS' };
// movement in inches: [arm-side horizontal, induced vertical]. Arm side for a RHP is the 3B side (-x).
export const PITCH_MOVE = { FF: [7, 16], SI: [15, 8], FC: [-3, 8], SL: [-6, 2], ST: [-14, 1], CU: [-8, -10], KC: [-6, -9], CH: [14, 6], FS: [9, 2], SV: [-11, -5], KN: [0, 0], FO: [6, -1], SC: [12, -2], CS: [-7, -12], EP: [-4, -14] };

// path for a pitch: release R {x,y,z}, target T {x,y} at plate front (z=0), speed mph, move [h,v] inches, hand 'R'|'L'
export function pitchPath(R, T, mph, move, hand) {
  const dist = Math.abs(R.z);
  const vavg = mph * MPH * 0.93;
  const time = dist / vavg;
  const side = hand === 'L' ? 1 : -1;
  const drop = 0.5 * G * time * time;            // gravity
  const bx = side * move[0] / 12, by = move[1] / 12 - drop; // total break relative to a straight line
  const A = { x: T.x - bx, y: T.y - by };
  return {
    time, mph, at(u) { // u = 0..1 of flight; returns {x,y,z}
      const uu = u * u;
      return { x: R.x + (A.x - R.x) * u + bx * uu, y: R.y + (A.y - R.y) * u + by * uu, z: R.z + (0 - R.z) * u };
    },
    // where the ball is when it crosses z (for front of plate z=0)
  };
}

// batted ball integrator
export function makeBall(p, v, spin = 1, opts = {}) { return { p: { ...p }, v: { ...v }, spin, t: 0, bounces: 0, rolling: false, stopped: false, kD: opts.kD ?? 0.0020, kL: opts.kL ?? 0.00112, wind: opts.wind || { x: 0, z: 0 } }; }
export function stepBall(b, dt, park) {
  if (b.stopped) return null;
  const v = b.v, wx = b.wind.x, wz = b.wind.z;
  const rx = v.x - wx, ry = v.y, rz = v.z - wz, sp = Math.hypot(rx, ry, rz) || 1e-6;
  let ax = 0, ay = -G, az = 0;
  if (!b.rolling) {
    ax -= b.kD * sp * rx; ay -= b.kD * sp * ry; az -= b.kD * sp * rz;
    // lift (backspin > 0, topspin < 0) perpendicular to velocity in the vertical plane
    const s = b.spin * Math.exp(-b.t / 5);
    if (s) {
      const ux = -(ry * rx) / (sp * sp), uy = 1 - (ry * ry) / (sp * sp), uz = -(ry * rz) / (sp * sp);
      const un = Math.hypot(ux, uy, uz) || 1;
      const L = b.kL * s * sp * sp / un;
      ax += L * ux; ay += L * uy; az += L * uz;
    }
  } else { ay = 0; }
  const ox = b.p.x, oz = b.p.z;
  v.x += ax * dt; v.y += ay * dt; v.z += az * dt;
  b.p.x += v.x * dt; b.p.y += v.y * dt; b.p.z += v.z * dt; b.t += dt;
  let ev = null;
  // ground
  if (b.p.y <= 0.12 && !b.rolling) {
    b.p.y = 0.12;
    if (!b.landed) { b.landed = { x: b.p.x, z: b.p.z, t: b.t }; ev = 'land'; }
    const turf = park && park.turf;
    const e = turf ? 0.42 : 0.36;
    if (Math.abs(v.y) < 3.5) { b.rolling = true; v.y = 0; }
    else { v.y = -v.y * e; const f = turf ? 0.8 : 0.72; v.x *= f; v.z *= f; b.bounces++; b.spin = 0; }
  }
  if (b.rolling) {
    const s = Math.hypot(v.x, v.z), fr = (park && park.turf ? 14 : 19) * dt;
    if (s <= fr) { v.x = v.z = 0; b.stopped = true; ev = ev || 'stop'; }
    else { v.x *= (s - fr) / s; v.z *= (s - fr) / s; }
  }
  // fence
  if (park) {
    const d = Math.hypot(b.p.x, b.p.z), phi = Math.atan2(b.p.x, -b.p.z);
    if (Math.abs(phi) <= 0.7854 + 0.01 && -b.p.z > 0) {
      const R = park.wallR(phi);
      if (d >= R && Math.hypot(ox, oz) < R) {
        const H = park.wallH(phi);
        if (b.p.y > H) { if (!b.landed && !b.hitFence) { b.hr = true; ev = 'hr'; } }
        else {
          // bounce off the wall
          const nx = b.p.x / d, nz = b.p.z / d, dot = v.x * nx + v.z * nz;
          v.x -= 1.55 * dot * nx; v.z -= 1.55 * dot * nz; v.y *= 0.7;
          b.p.x = nx * (R - 0.6); b.p.z = nz * (R - 0.6);
          b.hitFence = true; ev = 'wall';
        }
      }
    } else {
      // foul territory: stands boundary (~42 ft off the lines, 60 ft behind home)
      const off = Math.abs(Math.abs(b.p.x) - Math.max(0, -b.p.z) * 1) / 1.4142; // distance from the nearest foul line
      const behind = b.p.z > 0 && d > 58;
      if ((off > 41 && b.p.y < 8) || behind) { if (b.p.y < 30) { v.x *= -0.3; v.z *= -0.3; v.y = Math.min(v.y, 0); b.outOfPlay = true; ev = 'dead'; } else if (!b.landed) { b.outOfPlay = true; ev = 'dead'; } }
    }
  }
  return ev;
}
// simulate a copy forward; returns array of {t,x,y,z,landed,rolling} samples every dt
export function predict(b, park, T = 9, dt = 1 / 60) {
  const c = makeBall(b.p, b.v, b.spin, b); c.t = b.t; c.landed = b.landed; c.rolling = b.rolling; c.bounces = b.bounces; c.hitFence = b.hitFence;
  const out = [];
  for (let t = 0; t < T; t += dt) {
    const ev = stepBall(c, dt, park);
    out.push({ t: c.t, x: c.p.x, y: c.p.y, z: c.p.z, air: !c.landed, rolling: c.rolling, ev });
    if (c.hr || c.outOfPlay || c.stopped) break;
  }
  return { samples: out, hr: !!c.hr, landed: c.landed, outOfPlay: !!c.outOfPlay };
}
export function launch(evMph, laDeg, sprayDeg) {
  const s = evMph * MPH, la = laDeg * Math.PI / 180, ph = sprayDeg * Math.PI / 180;
  return { x: s * Math.cos(la) * Math.sin(ph), y: s * Math.sin(la), z: -s * Math.cos(la) * Math.cos(ph) };
}
export function spinFor(la) { return la > 8 ? Math.min(1.2, 0.35 + la / 40) : la < -2 ? -0.4 : 0.1; }
