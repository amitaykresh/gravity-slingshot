# Gravity Slingshot

**Play:** https://amitaykresh.github.io/gravity-slingshot/

A browser-only gravity puzzle built for Lab 1 of *Agentic Programming* (AICODE 67723, HUJI).
Fling a probe through a tiny solar system: planets pull, moons move, black holes bend your path.
Reach the green target and collect all three stars in a single flight.

- 6 levels (static planets, an orbiting moon, a black hole, an asteroid gate, a moving target)
- Live aim preview, real N-body-style gravity (fixed-step symplectic integrator)
- Synthesized sound effects (Web Audio — no audio files)
- **Sandbox mode**: launch from anywhere, draw planets, drop black holes, try to make an orbit
- Works with mouse and touch; plain HTML + CSS + JavaScript, no server, no build step

## Controls
Drag anywhere and pull back like a slingshot, release to launch.
`R` restart · `N` next level · `S` sandbox · `M` mute · `Esc` menu

## Files
- `index.html` — page, HUD and styles
- `js/physics.js` — pure physics (no DOM)
- `js/levels.js` — level data
- `js/main.js` — rendering, input, sound, game flow
- `tools/solve.js` — brute-force checker that proves each level is winnable and that all 3 stars fit on one winning flight (`node tools/solve.js`)

## Run locally
Open `index.html` in a browser, or `python3 -m http.server` and visit http://localhost:8000.
