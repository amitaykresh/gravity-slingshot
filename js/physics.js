// Pure physics: no DOM. Shared by the game and by tools/solve.js (level checker).
(function (root) {
  'use strict';
  const W = 1600, H = 900;     // logical world size
  const DT = 1 / 120;          // fixed physics step (seconds)
  const PROBE_R = 5;           // probe collision radius
  const BOUND = 500;           // how far off-screen before the probe is "lost"
  const SOFTEN = 100;          // softening so gravity never blows up
  const MAX_AGE = 45;          // seconds before a flight is abandoned
  const STAR_R = 20;           // pickup radius of a star

  function massOf(b) {
    return b.m != null ? b.m : 34 * b.r * b.r * b.r; // "density" based mass
  }

  function orbitPos(o, t, out) {
    let cx = o.cx, cy = o.cy;
    if (o.around != null) { cx = out[o.around].x; cy = out[o.around].y; }
    const a = o.phase + o.w * t;
    return { x: cx + o.R * Math.cos(a), y: cy + o.R * Math.sin(a) };
  }

  // Positions of every gravitating body at time t.
  function bodiesAt(level, t) {
    const out = [];
    for (const b of level.bodies) {
      let x = b.x, y = b.y;
      if (b.orbit) { const p = orbitPos(b.orbit, t, out); x = p.x; y = p.y; }
      out.push({ x, y, r: b.r, m: massOf(b), type: b.type || 'planet', src: b });
    }
    return out;
  }

  function targetAt(level, t, bodies) {
    const tg = level.target;
    if (!tg) return null;
    if (!tg.orbit) return { x: tg.x, y: tg.y, r: tg.r };
    const p = orbitPos(tg.orbit, t, bodies || bodiesAt(level, t));
    return { x: p.x, y: p.y, r: tg.r };
  }

  function accel(x, y, bodies) {
    let ax = 0, ay = 0;
    for (const b of bodies) {
      const dx = b.x - x, dy = b.y - y;
      const d2 = dx * dx + dy * dy + SOFTEN;
      const inv = b.m / (d2 * Math.sqrt(d2));
      ax += dx * inv; ay += dy * inv;
    }
    return { ax, ay };
  }

  // Semi-implicit (symplectic) Euler: stable orbits, cheap.
  function stepProbe(p, bodies, dt) {
    const a = accel(p.x, p.y, bodies);
    p.vx += a.ax * dt; p.vy += a.ay * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }

  function check(p, bodies, target) {
    for (const b of bodies) {
      const dx = p.x - b.x, dy = p.y - b.y, rr = b.r + PROBE_R;
      if (dx * dx + dy * dy < rr * rr) return { hit: 'crash', body: b };
    }
    if (target) {
      const dx = p.x - target.x, dy = p.y - target.y;
      if (dx * dx + dy * dy < target.r * target.r) return { hit: 'win' };
    }
    if (p.x < -BOUND || p.x > W + BOUND || p.y < -BOUND || p.y > H + BOUND) return { hit: 'lost' };
    return null;
  }

  function starsHit(p, stars, got) {
    const found = [];
    if (!stars) return found;
    for (let i = 0; i < stars.length; i++) {
      if (got.has(i)) continue;
      const dx = p.x - stars[i].x, dy = p.y - stars[i].y;
      if (dx * dx + dy * dy < STAR_R * STAR_R) { got.add(i); found.push(i); }
    }
    return found;
  }

  // Simulate one flight. onPoint(x, y, step) is optional (used for the aim preview).
  function simulate(level, x, y, vx, vy, t0, maxSteps, onPoint) {
    const p = { x, y, vx, vy };
    const got = new Set();
    let t = t0;
    for (let s = 0; s < maxSteps; s++) {
      t += DT;
      const bodies = bodiesAt(level, t);
      stepProbe(p, bodies, DT);
      starsHit(p, level.stars, got);
      if (onPoint && onPoint(p.x, p.y, s) === false) break;
      const r = check(p, bodies, targetAt(level, t, bodies));
      if (r) return { result: r.hit, steps: s, stars: got, x: p.x, y: p.y };
    }
    return { result: 'timeout', steps: maxSteps, stars: got, x: p.x, y: p.y };
  }

  root.Physics = {
    W, H, DT, PROBE_R, BOUND, MAX_AGE, STAR_R,
    massOf, bodiesAt, targetAt, accel, stepProbe, check, starsHit, simulate,
  };
})(typeof window !== 'undefined' ? window : globalThis);
