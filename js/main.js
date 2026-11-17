// Gravity Slingshot — rendering, input, sound, game flow.
(() => {
  'use strict';
  const P = window.Physics, LEVELS = window.LEVELS;
  const { W, H, DT } = P;
  const LAUNCH_K = 3.6, MAX_PULL = 220;            // drag px -> speed (max ~790 px/s)

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  // ---------- viewport ----------
  let vw = 0, vh = 0, dpr = 1, scale = 1, ox = 0, oy = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = innerWidth; vh = innerHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
    const top = $('hud').offsetHeight + 4;
    scale = Math.min(vw / W, (vh - top) / H);
    ox = (vw - W * scale) / 2; oy = top + ((vh - top) - H * scale) / 2;
  }
  const toWorld = (cx, cy) => ({ x: (cx - ox) / scale, y: (cy - oy) / scale });
  addEventListener('resize', resize);

  // ---------- storage (best stars per level) ----------
  let best = {};
  try { best = JSON.parse(localStorage.getItem('slingshot.best') || '{}') || {}; } catch (e) { best = {}; }
  function saveBest() { try { localStorage.setItem('slingshot.best', JSON.stringify(best)); } catch (e) { /* ignore */ } }

  // ---------- sound (WebAudio, synthesized — no files) ----------
  const sfx = (() => {
    let ac = null, master = null, nbuf = null;
    function A() {
      if (S.muted) return null;
      if (!ac) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ac = new C(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    function tone(f0, f1, dur, type, vol, delay = 0) {
      const a = A(); if (!a) return;
      const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(dur, vol, f0, f1, type = 'bandpass', delay = 0) {
      const a = A(); if (!a) return;
      if (!nbuf) {
        nbuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
        const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = a.currentTime + delay, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = nbuf; f.type = type; f.Q.value = 0.9;
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.05);
    }
    return {
      launch(sp) { const k = Math.min(1, sp / 800); noise(0.45, 0.35, 300, 600 + 2600 * k); tone(160, 380 + 600 * k, 0.3, 'triangle', 0.1); },
      crash() { noise(0.9, 0.7, 1800, 50, 'lowpass'); tone(120, 30, 0.7, 'sawtooth', 0.16); },
      star() { tone(1318.5, 0, 0.12, 'sine', 0.14); tone(1760, 0, 0.3, 'sine', 0.12, 0.08); },
      win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0, 0.4, 'triangle', 0.15, i * 0.11)); tone(1568, 0, 0.7, 'sine', 0.08, 0.46); },
      lost() { tone(440, 110, 0.8, 'sine', 0.12); },
      place() { tone(220, 330, 0.12, 'sine', 0.12); },
      unlock() { A(); },
    };
  })();

  // ---------- state ----------
  const S = {
    mode: 'menu', idx: 0, level: LEVELS[0], t: 0,
    probes: [], particles: [], shots: 0, won: false,
    drag: null, tool: 'launch', muted: false, hue: 0, realT: 0,
  };
  try { S.muted = localStorage.getItem('slingshot.muted') === '1'; } catch (e) { /* ignore */ }

  // ---------- background ----------
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const bgStars = Array.from({ length: 520 }, () => ({
    x: rnd() * 2600 - 500, y: rnd() * 1700 - 400, s: rnd() * 1.5 + 0.3, tw: rnd() * 6.28, sp: 0.6 + rnd() * 2.2, d: 0.2 + rnd() * 0.8,
  }));

  const PALETTES = [
    ['#ffe0a8', '#e8823a', '#4a1a08', '255,150,70'],
    ['#b6e4ff', '#3a86d1', '#0a1f48', '90,170,255'],
    ['#d4f7b0', '#55a843', '#11331a', '120,220,120'],
    ['#f2c4ff', '#9a4fd0', '#2a0e42', '200,120,255'],
    ['#fff0b8', '#c9a23c', '#3e2c0a', '255,210,100'],
    ['#ffc2c2', '#d0504f', '#3d0d10', '255,110,110'],
  ];

  // ---------- flow ----------
  function setBodyClass() {
    document.body.className = S.mode === 'menu' ? 'menu' : S.mode === 'sandbox' ? 'sandbox' : '';
    resize();
  }

  function starsHtml(n, of = 3) {
    let s = '';
    for (let i = 0; i < of; i++) s += i < n ? '★' : '<span class="off">★</span>';
    return `<span class="stars">${s}</span>`;
  }

  function updateHud() {
    $('lvlname').textContent = S.mode === 'level' ? `· ${S.idx + 1}. ${S.level.name}` : S.mode === 'sandbox' ? '· Sandbox' : '';
    $('shots').textContent = S.shots;
    $('beststars').innerHTML = starsHtml(best[S.idx] || 0).replace('<span class="stars">', '').replace(/<\/span>$/, '');
    $('btn-sound').textContent = S.muted ? '🔇' : '🔊';
    $('btn-sandbox').classList.toggle('on', S.mode === 'sandbox');
    document.querySelectorAll('#tools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === S.tool));
  }

  function showPanel(html) { $('card').innerHTML = html; $('panel').classList.add('show'); }
  function hidePanel() { $('panel').classList.remove('show'); }

  let toastTimer = 0;
  function toast(msg, secs = 2.2) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), secs * 1000);
  }

  function showMenu() {
    S.mode = 'menu'; S.drag = null; S.probes = []; S.level = LEVELS[0]; S.t = 0;
    setBodyClass(); updateHud();
    const buttons = LEVELS.map((lv, i) =>
      `<button data-level="${i}"><span class="n">Level ${i + 1}</span>${lv.name}<br>${starsHtml(best[i] || 0)}</button>`).join('');
    showPanel(`
      <h1>GRAVITY SLINGSHOT</h1>
      <p>Fling a probe through a solar system. Planets pull, moons move, black holes bend space.
      Reach the green target — and grab all three stars in a single flight.</p>
      <div class="how">
        <b>Aim</b><span>Drag anywhere and pull back like a slingshot. Release to launch.</span>
        <b>Preview</b><span>The dotted line shows the first second of your flight. The rest is up to gravity.</span>
        <b>Stars</b><span>Only stars picked up on the winning flight count.</span>
        <b>Keys</b><span><kbd>R</kbd> restart · <kbd>N</kbd> next · <kbd>S</kbd> sandbox · <kbd>M</kbd> mute · <kbd>Esc</kbd> menu</span>
      </div>
      <div class="grid">${buttons}</div>
      <div class="row">
        <button class="primary" data-level="${firstUnfinished()}">Play</button>
        <button data-sandbox="1">Sandbox — build your own universe</button>
      </div>`);
  }

  function firstUnfinished() {
    for (let i = 0; i < LEVELS.length; i++) if (best[i] == null) return i;
    return 0;
  }

  function startLevel(i) {
    S.mode = 'level'; S.idx = i; S.level = LEVELS[i]; S.t = 0;
    S.probes = []; S.particles = []; S.shots = 0; S.won = false; S.drag = null;
    hidePanel(); setBodyClass(); updateHud();
    toast(S.level.hint, 4.5);
  }

  function startSandbox() {
    S.mode = 'sandbox'; S.t = 0; S.probes = []; S.particles = []; S.drag = null; S.tool = 'launch';
    S.level = { name: 'Sandbox', bodies: [{ x: 800, y: 450, r: 60 }, { x: 1180, y: 300, r: 16, m: 1.6e7, type: 'hole' }], stars: [], target: null };
    hidePanel(); setBodyClass(); updateHud();
    toast('Sandbox: launch from anywhere, draw planets, drop black holes. Try to make an orbit!', 4.5);
  }

  function onWin(p) {
    S.won = true;
    const n = p.stars.size;
    const improved = best[S.idx] == null || n > best[S.idx];
    if (improved) best[S.idx] = n; // 0 still records "completed"
    saveBest(); updateHud();
    sfx.win();
    const tg = P.targetAt(S.level, S.t);
    burst(tg.x, tg.y, 90, ['#5dffb0', '#ffd84d', '#7fd8ff', '#ffffff'], 420, 1.6);
    const last = S.idx === LEVELS.length - 1;
    setTimeout(() => {
      if (S.mode !== 'level' || !S.won) return;
      showPanel(`
        <h2>${last ? 'Tour complete! 🎉' : 'Target reached!'}</h2>
        <div class="big-stars">${starsHtml(n)}</div>
        <p>${S.level.name} · ${S.shots} shot${S.shots === 1 ? '' : 's'}${improved && n ? ' · new best!' : ''}
        ${n < 3 ? '<br>Hint: a different flight path can sweep up every star.' : ''}</p>
        <div class="row">
          ${last ? '<button class="primary" data-sandbox="1">Open sandbox</button>' : `<button class="primary" data-level="${S.idx + 1}">Next level →</button>`}
          <button data-level="${S.idx}">Retry</button>
          <button data-menu="1">Menu</button>
        </div>`);
    }, 900);
  }

  // ---------- launching ----------
  function launchVector(d) {
    let dx = d.sx - d.cx, dy = d.sy - d.cy;
    const len = Math.hypot(dx, dy);
    if (len > MAX_PULL) { dx *= MAX_PULL / len; dy *= MAX_PULL / len; }
    return { vx: dx * LAUNCH_K, vy: dy * LAUNCH_K, pull: Math.min(len, MAX_PULL) };
  }
  function launchOrigin(d) { return S.mode === 'level' ? S.level.start : { x: d.sx, y: d.sy }; }

  function launch(o, v) {
    if (S.mode === 'level') {
      if (S.won) return;
      S.probes = S.probes.filter((p) => p.alive);
      S.probes.forEach((p) => { p.alive = false; p.ghost = true; });
      S.probes = S.probes.slice(-1);
      S.shots++; updateHud();
    } else if (S.probes.length > 40) S.probes.shift();
    S.hue = (S.hue + 53) % 360;
    S.probes.push({
      x: o.x, y: o.y, vx: v.vx, vy: v.vy, age: 0, alive: true, dead: 0, stars: new Set(),
      trail: [{ x: o.x, y: o.y }], hue: S.mode === 'sandbox' ? S.hue : 190, n: 0,
    });
    sfx.launch(Math.hypot(v.vx, v.vy));
    const sp = Math.hypot(v.vx, v.vy) || 1;
    for (let i = 0; i < 18; i++) {
      const a = Math.atan2(-v.vy, -v.vx) + (Math.random() - 0.5) * 1.2, s = 60 + Math.random() * 180;
      S.particles.push({ x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, c: '#9fe6ff', size: 2 + (sp / 400) });
    }
  }

  function burst(x, y, n, colors, speed, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.2 + Math.random() * 0.8), l = life * (0.5 + Math.random() * 0.5);
      S.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, c: colors[i % colors.length], size: 1.5 + Math.random() * 2.5 });
    }
  }

  // ---------- simulation ----------
  function physicsStep() {
    S.t += DT;
    const bodies = P.bodiesAt(S.level, S.t);
    const target = S.mode === 'level' ? P.targetAt(S.level, S.t, bodies) : null;
    for (const p of S.probes) {
      if (!p.alive) { p.dead += DT; continue; }
      P.stepProbe(p, bodies, DT);
      p.age += DT;
      if (++p.n % 2 === 0) {
        p.trail.push({ x: p.x, y: p.y });
        const cap = S.mode === 'level' ? 1400 : 500;
        if (p.trail.length > cap) p.trail.shift();
      }
      if (S.mode === 'level') {
        for (const i of P.starsHit(p, S.level.stars, p.stars)) {
          sfx.star(); const s = S.level.stars[i];
          burst(s.x, s.y, 24, ['#ffd84d', '#fff3b0'], 160, 0.7);
        }
      }
      const r = P.check(p, bodies, target);
      if (r && r.hit === 'crash') {
        p.alive = false; p.ghost = true;
        sfx.crash();
        const pal = r.body.type === 'hole' ? ['#ffb35c', '#ff6b3d', '#ffffff'] : ['#ffb35c', '#ff6b6b', '#ffe9a8', '#ffffff'];
        burst(p.x, p.y, 70, pal, 260, 1.1);
        if (S.mode === 'level') toast(r.body.type === 'hole' ? 'Swallowed by the black hole. Try again!' : 'Crashed! Try again.');
      } else if (r && r.hit === 'win' && S.mode === 'level') {
        p.alive = false; onWin(p);
      } else if ((r && r.hit === 'lost') || p.age > P.MAX_AGE) {
        p.alive = false; p.ghost = true;
        if (S.mode === 'level') { sfx.lost(); toast('Lost in deep space. Try again!'); }
      }
    }
    if (S.mode === 'sandbox') S.probes = S.probes.filter((p) => p.alive || p.dead < 3);
  }

  // ---------- drawing ----------
  function drawBackground(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#070a1a'); g.addColorStop(1, '#03040a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    setWorld();
    // nebulae
    for (const [x, y, r, c] of [[300, 200, 600, '80,60,160'], [1350, 760, 700, '20,90,140'], [1100, 120, 420, '140,50,110']]) {
      const n = ctx.createRadialGradient(x, y, 0, x, y, r);
      n.addColorStop(0, `rgba(${c},0.16)`); n.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = n; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (const s of bgStars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * s.sp + s.tw));
      ctx.globalAlpha = a * s.d; ctx.fillStyle = '#dfe6ff';
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    // play-area frame
    ctx.strokeStyle = 'rgba(140,170,255,0.08)'; ctx.lineWidth = 2 / scale;
    ctx.strokeRect(0, 0, W, H);
  }

  function setWorld() { ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy); }

  function drawPlanet(b, i, time) {
    const pal = PALETTES[i % PALETTES.length], { x, y, r } = b;
    const halo = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 2.8);
    halo.addColorStop(0, `rgba(${pal[3]},0.22)`); halo.addColorStop(1, `rgba(${pal[3]},0)`);
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 2.8, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.08, x, y, r);
    g.addColorStop(0, pal[0]); g.addColorStop(0.55, pal[1]); g.addColorStop(1, pal[2]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (r >= 40) { // soft bands
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      ctx.globalAlpha = 0.13; ctx.fillStyle = '#ffffff';
      for (let k = -2; k <= 2; k++) {
        const yy = y + k * r * 0.38 + Math.sin(time * 0.3 + i + k) * 3;
        ctx.fillRect(x - r, yy, r * 2, r * 0.1);
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r - 0.75, Math.PI * 1.05, Math.PI * 1.65); ctx.stroke();
  }

  function drawHole(b, time) {
    const { x, y, r } = b;
    const halo = ctx.createRadialGradient(x, y, r, x, y, r * 6);
    halo.addColorStop(0, 'rgba(255,150,60,0.45)'); halo.addColorStop(0.35, 'rgba(255,90,40,0.12)'); halo.addColorStop(1, 'rgba(255,90,40,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 6, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.38);
    for (let k = 0; k < 36; k++) {
      const a0 = time * 1.6 + k * 0.5, rr = r * (1.6 + (k % 6) * 0.28);
      ctx.strokeStyle = `rgba(255,${150 + (k % 5) * 20},${60 + (k % 3) * 40},${0.15 + (k % 4) * 0.08})`;
      ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 0, rr, a0, a0 + 0.9); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,120,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.stroke();
  }

  function drawOrbitPaths() {
    ctx.setLineDash([4, 10]); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(160,180,255,0.16)';
    const now = P.bodiesAt(S.level, S.t);
    const ring = (o) => {
      const cx = o.around != null ? now[o.around].x : o.cx, cy = o.around != null ? now[o.around].y : o.cy;
      ctx.beginPath(); ctx.arc(cx, cy, o.R, 0, Math.PI * 2); ctx.stroke();
    };
    S.level.bodies.forEach((b) => b.orbit && ring(b.orbit));
    if (S.level.target && S.level.target.orbit) { ctx.strokeStyle = 'rgba(93,255,176,0.18)'; ring(S.level.target.orbit); }
    ctx.setLineDash([]);
  }

  function drawTarget(tg, time) {
    const pulse = 1 + 0.07 * Math.sin(time * 4);
    const g = ctx.createRadialGradient(tg.x, tg.y, 0, tg.x, tg.y, tg.r * 2.2);
    g.addColorStop(0, 'rgba(93,255,176,0.25)'); g.addColorStop(1, 'rgba(93,255,176,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5dffb0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.r * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.translate(tg.x, tg.y); ctx.rotate(time * 0.8);
    ctx.setLineDash([6, 8]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(93,255,176,0.6)';
    ctx.beginPath(); ctx.arc(0, 0, tg.r * 1.35, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); ctx.setLineDash([]);
    ctx.fillStyle = '#5dffb0'; ctx.beginPath(); ctx.arc(tg.x, tg.y, 4, 0, Math.PI * 2); ctx.fill();
  }

  function starPath(x, y, R, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? R * 0.45 : R;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function drawStars(time) {
    const live = S.probes.find((p) => p.alive);
    S.level.stars.forEach((s, i) => {
      const got = live && live.stars.has(i);
      const bob = Math.sin(time * 2 + i) * 3;
      if (got) {
        ctx.strokeStyle = 'rgba(255,216,77,0.35)'; ctx.lineWidth = 1.5;
        starPath(s.x, s.y + bob, 12, time); ctx.stroke(); return;
      }
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 30);
      g.addColorStop(0, 'rgba(255,216,77,0.35)'); g.addColorStop(1, 'rgba(255,216,77,0)');
      ctx.fillStyle = g; ctx.fillRect(s.x - 30, s.y - 30, 60, 60);
      ctx.fillStyle = '#ffd84d'; starPath(s.x, s.y + bob, 12, time * 0.7); ctx.fill();
    });
  }

  function drawStart(time) {
    const s = S.level.start;
    ctx.strokeStyle = 'rgba(127,216,255,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(s.x, s.y, 16 + Math.sin(time * 3) * 2, 0, Math.PI * 2); ctx.stroke();
    const flying = S.probes.some((p) => p.alive);
    if (!flying && !S.won) drawProbeBody(s.x, s.y, -1, 0, 190);
  }

  function drawProbeBody(x, y, vx, vy, hue) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
    g.addColorStop(0, `hsla(${hue},100%,80%,0.9)`); g.addColorStop(1, `hsla(${hue},100%,60%,0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawTrail(p) {
    const tr = p.trail, n = tr.length;
    if (n < 2) return;
    const fade = p.ghost ? 0.35 : 1;
    const chunk = 24;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < n - 1; i += chunk) {
      const a = (S.mode === 'sandbox' ? (i / n) : 0.25 + 0.75 * (i / n)) * fade * (p.alive ? 1 : Math.max(0, 1 - p.dead / 3) + (S.mode === 'level' ? 0.5 : 0));
      ctx.strokeStyle = `hsla(${p.hue},100%,70%,${Math.min(1, a)})`;
      ctx.beginPath(); ctx.moveTo(tr[i].x, tr[i].y);
      for (let j = i + 1; j <= Math.min(n - 1, i + chunk); j++) ctx.lineTo(tr[j].x, tr[j].y);
      if (i + chunk >= n - 1 && p.alive) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  function drawAim() {
    const d = S.drag;
    if (!d || d.kind !== 'launch') return;
    const o = launchOrigin(d), v = launchVector(d);
    if (v.pull < 6) return;
    // rubber band (pull-back)
    const k = v.pull / Math.hypot(d.sx - d.cx, d.sy - d.cy || 1e-9);
    const bx = o.x - (d.sx - d.cx) * (isFinite(k) ? k : 0), by = o.y - (d.sy - d.cy) * (isFinite(k) ? k : 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill();
    // predicted path (first ~1s in levels, longer in sandbox)
    const steps = S.mode === 'level' ? 120 : 360;
    let ended = null;
    const pts = [];
    const lv = S.mode === 'level' ? S.level : Object.assign({}, S.level, { target: null });
    const res = P.simulate(lv, o.x, o.y, v.vx, v.vy, S.t, steps, (x, y, s) => { if (s % 4 === 0) pts.push([x, y]); });
    if (res.result === 'crash') ended = [res.x, res.y, '#ff6b6b'];
    if (res.result === 'win') ended = [res.x, res.y, '#5dffb0'];
    pts.forEach(([x, y], i) => {
      ctx.fillStyle = `rgba(200,235,255,${0.9 * (1 - i / pts.length)})`;
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
    });
    if (ended) { ctx.strokeStyle = ended[2]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ended[0], ended[1], 9, 0, Math.PI * 2); ctx.stroke(); }
    // power readout
    const pct = Math.round(100 * v.pull / MAX_PULL);
    ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = pct >= 100 ? '#ffd84d' : 'rgba(232,236,255,0.85)';
    ctx.fillText(`${pct}%`, o.x + 22, o.y - 18);
  }

  function drawSandboxGhost() {
    const d = S.drag;
    if (!d || d.kind !== 'planet') return;
    const r = Math.max(12, Math.min(140, Math.hypot(d.cx - d.sx, d.cy - d.sy)));
    ctx.strokeStyle = 'rgba(127,216,255,0.8)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(d.sx, d.sy, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }

  function drawParticles(dt) {
    for (const q of S.particles) {
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.985; q.vy *= 0.985;
      ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.c;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    S.particles = S.particles.filter((q) => q.life > 0);
  }

  function render(dt, time) {
    drawBackground(time);
    setWorld();
    const bodies = P.bodiesAt(S.level, S.t);
    drawOrbitPaths();
    if (S.mode !== 'sandbox' && S.level.target) drawTarget(P.targetAt(S.level, S.t, bodies), time);
    if (S.mode !== 'sandbox') { drawStars(time); drawStart(time); }
    for (const p of S.probes) drawTrail(p);
    bodies.forEach((b, i) => (b.type === 'hole' ? drawHole(b, time) : drawPlanet(b, i, time)));
    for (const p of S.probes) {
      if (!p.alive) continue;
      // exhaust
      if (Math.random() < 0.6) S.particles.push({ x: p.x, y: p.y, vx: -p.vx * 0.05 + (Math.random() - 0.5) * 30, vy: -p.vy * 0.05 + (Math.random() - 0.5) * 30, life: 0.35, max: 0.35, c: `hsl(${p.hue},100%,75%)`, size: 1.6 });
      drawProbeBody(p.x, p.y, p.vx, p.vy, p.hue);
    }
    drawParticles(dt);
    drawAim();
    drawSandboxGhost();
  }

  // ---------- loop ----------
  let last = performance.now(), acc = 0;
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1; // tab was hidden
    S.realT += dt;
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 30) { physicsStep(); acc -= DT; n++; }
    render(dt, S.realT);
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  canvas.addEventListener('pointerdown', (e) => {
    if (S.mode === 'menu') return;
    sfx.unlock();
    const w = toWorld(e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
    if (S.mode === 'sandbox' && S.tool !== 'launch') {
      if (S.tool === 'planet') { S.drag = { kind: 'planet', sx: w.x, sy: w.y, cx: w.x, cy: w.y }; return; }
      if (S.tool === 'hole') { S.level.bodies.push({ x: w.x, y: w.y, r: 16, m: 1.6e7, type: 'hole' }); sfx.place(); return; }
      if (S.tool === 'erase') {
        const bs = S.level.bodies; let bi = -1, bd = 1e9;
        bs.forEach((b, i) => { const d = Math.hypot(b.x - w.x, b.y - w.y) - b.r; if (d < 24 && d < bd) { bd = d; bi = i; } });
        if (bi >= 0) { const b = bs[bi]; burst(b.x, b.y, 40, ['#ffb35c', '#7fd8ff', '#fff'], 200, 0.8); bs.splice(bi, 1); sfx.crash(); }
        return;
      }
    }
    if (S.mode === 'level' && S.won) return;
    S.drag = { kind: 'launch', sx: w.x, sy: w.y, cx: w.x, cy: w.y };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!S.drag) return;
    const w = toWorld(e.clientX, e.clientY);
    S.drag.cx = w.x; S.drag.cy = w.y;
  });
  function endDrag() {
    const d = S.drag; S.drag = null;
    if (!d) return;
    if (d.kind === 'planet') {
      const r = Math.max(12, Math.min(140, Math.hypot(d.cx - d.sx, d.cy - d.sy)));
      S.level.bodies.push({ x: d.sx, y: d.sy, r: Math.round(r) }); sfx.place();
      return;
    }
    const v = launchVector(d);
    if (v.pull < 8) return;
    launch(launchOrigin(d), v);
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => { S.drag = null; });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    sfx.unlock();
    if (b.dataset.level != null) startLevel(+b.dataset.level);
    else if (b.dataset.sandbox) startSandbox();
    else if (b.dataset.menu) showMenu();
    else if (b.dataset.tool) { S.tool = b.dataset.tool; updateHud(); }
    b.blur();
  });
  $('btn-restart').onclick = () => startLevel(S.idx);
  $('btn-sandbox').onclick = () => (S.mode === 'sandbox' ? showMenu() : startSandbox());
  $('btn-menu').onclick = showMenu;
  $('btn-clear').onclick = () => { S.level.bodies = []; S.probes = []; toast('Empty space. Draw some planets!'); };
  $('btn-sound').onclick = () => { S.muted = !S.muted; try { localStorage.setItem('slingshot.muted', S.muted ? '1' : '0'); } catch (e) { /* ignore */ } updateHud(); };

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (S.drag) S.drag = null; else showMenu(); }
    else if (k === 'r' && S.mode === 'level') startLevel(S.idx);
    else if (k === 'n' && S.mode === 'level' && S.won && S.idx < LEVELS.length - 1) startLevel(S.idx + 1);
    else if (k === 's') (S.mode === 'sandbox' ? showMenu() : startSandbox());
    else if (k === 'm') $('btn-sound').click();
  });

  // ---------- go ----------
  resize();
  showMenu();
  requestAnimationFrame(frame);
})();
