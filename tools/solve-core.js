// Runtime-agnostic solver core (works in node, browsers, or macOS osascript -l JavaScript).
function solveAll(P, LEVELS, only, step) {
  const lines = [];
  LEVELS.forEach((lv, i) => {
    if (only != null && i !== only) return;
    let wins = 0, total = 0, best = null;
    const maxSteps = Math.round(20 / P.DT);
    for (let deg = 0; deg < 360; deg += (step || 1)) {
      for (let sp = 120; sp <= 800; sp += 15) {
        total++;
        const a = deg * Math.PI / 180;
        const r = P.simulate(lv, lv.start.x, lv.start.y, Math.cos(a) * sp, Math.sin(a) * sp, 0, maxSteps);
        if (r.result === 'win') {
          wins++;
          if (!best || r.stars.size > best.stars) best = { stars: r.stars.size, deg, sp };
        }
      }
    }
    lines.push(i + ' ' + lv.name.padEnd(14) + ' wins ' + String(wins).padStart(4) + '/' + total +
      ' (' + (100 * wins / total).toFixed(1) + '%)  max stars ' + (best ? best.stars + ' @ ' + best.deg + 'deg ' + best.sp : '-'));
  });
  return lines.join('\n');
}
if (typeof module !== 'undefined') module.exports = solveAll;
