// Lab benches for the week-5 lessons: manipulability map, trajectory profiles, SLAM loop closure.
import { h, lineChart } from '../util.js';

const note = (t) => h('p.dim', { style: 'font-size:12px' }, t);
const toJs = (x) => (x && x.toJs ? x.toJs({ dict_converter: Object.fromEntries }) : x);
function canvas(panel, w = 340, hgt = 300) {
  const c = h('canvas', { width: w * 2, height: hgt * 2, style: `width:100%;max-width:${w}px;aspect-ratio:${w}/${hgt};background:#0a0c10;border-radius:8px;border:1px solid var(--line)` });
  panel.append(c); const g = c.getContext('2d'); g.scale(2, 2); g.font = '11px system-ui'; return [c, g];
}

export const LABS6 = {
  singlab({ panel, ns }) {
    const w = ns.get('manipulability'), ik = ns.get('ik'), L1 = 0.116, L2 = 0.135, S = 700, O = [170, 250];
    const [c, g] = canvas(panel); let cell = 6, maxw = L1 * L2, bad = false, last = null;
    for (let px = 0; px < 340; px += cell) for (let py = 0; py < 270; py += cell) {
      const x = (px + cell / 2 - O[0]) / S, y = (O[1] - py - cell / 2) / S, r = Math.hypot(x, y);
      if (r > L1 + L2 || r < Math.abs(L1 - L2)) continue;
      let v = 0; try { const [a, b] = toJs(ik(x, y)); v = Number(w(a, b)); } catch { bad = true; break; }
      if (!Number.isFinite(v)) v = 0; const t = Math.max(0, Math.min(1, v / maxw));
      g.fillStyle = `rgb(${Math.round(30 + 40 * t)},${Math.round(40 + 190 * t)},${Math.round(70 + 40 * t)})`; g.fillRect(px, py, cell, cell);
    }
    g.fillStyle = '#c9d1e0'; g.fillRect(O[0] - 8, O[1] - 4, 16, 8);
    g.fillStyle = '#8d97a8'; g.fillText(bad ? 'manipulability() raised an error' : 'brighter green = more dexterous (your w)', 8, 290);
    c.onclick = (e) => { const r = c.getBoundingClientRect(), k = 340 / r.width; const x = ((e.clientX - r.left) * k - O[0]) / S, y = (O[1] - (e.clientY - r.top) * k) / S; last = [x, y];
      try { const [a, b] = toJs(ik(x, y)); out.textContent = `target (${x.toFixed(3)}, ${y.toFixed(3)}) m: θ₂ = ${(b * 180 / Math.PI).toFixed(0)}°, w = ${Number(w(a, b)).toExponential(2)}`; } catch { out.textContent = 'out of reach'; } };
    const out = h('p.mono', { style: 'font-size:12px' }, 'Click the map to read w at a target.');
    panel.append(out, note('The dark rim is the edge of the workspace (arm stretched or folded) where w → 0. The brightest ring is the right-angle elbow.'));
    return {};
  },
  trajlab({ panel, ns }) {
    const pos = ns.get('position'), T = ns.get('total_time'), d = 1.0, vm = 1.0, am = 2.0;
    let ts, p;
    try { const Tt = Number(T(d, vm, am)); const n = 160; ts = Array.from({ length: n + 1 }, (_, i) => Tt * 1.1 * i / n); p = ts.map((t) => Number(pos(t, d, vm, am))); }
    catch { panel.append(h('p.bad', {}, 'position() or total_time() raised an error.')); return {}; }
    const dt = ts[1] - ts[0], v = p.slice(1).map((x, i) => (x - p[i]) / dt), a = v.slice(1).map((x, i) => (x - v[i]) / dt);
    panel.append(note('Move of 1.0 rad with vmax = 1.0 rad/s and amax = 2.0 rad/s². Your position function, then its numerical derivatives:'));
    for (const [label, data, col, lim] of [['position (rad)', p, '#ff9d3c', null], ['velocity (rad/s): should be a trapezoid', v, '#4fd08a', 1.1], ['acceleration (rad/s²): +2, 0, −2', a, '#6db3ff', 2.5]]) {
      const cv = h('canvas.chart', { style: 'height:90px' }); panel.append(h('.dim', { style: 'font-size:12px' }, label), cv);
      lineChart(cv, [{ data, color: col }], lim ? { ymin: -lim, ymax: lim } : {});
    }
    return {};
  },
  slamlab({ panel, ns }) {
    const [, g] = canvas(panel, 340, 300); let raw, fixed;
    try { const o = ns.get('odometry'); raw = toJs(ns.get('integrate')(o)).map((p) => Array.from(p)); fixed = toJs(ns.get('close_loop')(ns.get('integrate')(o))).map((p) => Array.from(p)); }
    catch { panel.append(h('p.bad', {}, 'integrate() or close_loop() raised an error.')); return {}; }
    const xs = [...raw, ...fixed].map((p) => p[0]), ys = [...raw, ...fixed].map((p) => p[1]), x0 = Math.min(...xs, 0), x1 = Math.max(...xs, 2), y0 = Math.min(...ys, 0), y1 = Math.max(...ys, 2);
    const S = Math.min(280 / (x1 - x0 || 1), 250 / (y1 - y0 || 1)), X = (x) => 30 + (x - x0) * S, Y = (y) => 270 - (y - y0) * S;
    const line = (P, col, dash) => { g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(dash || []); g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke(); g.setLineDash([]); };
    g.strokeStyle = '#2e3542'; g.strokeRect(X(0), Y(2), 2 * S, 2 * S);
    line(raw, '#ff6b6b'); line(fixed, '#4fd08a');
    g.fillStyle = '#ff6b6b'; g.beginPath(); g.arc(X(raw.at(-1)[0]), Y(raw.at(-1)[1]), 4, 0, 7); g.fill();
    g.fillStyle = '#c9d1e0'; g.beginPath(); g.arc(X(0), Y(0), 5, 0, 7); g.fill();
    g.fillStyle = '#8d97a8'; g.fillText('grey: the true 2 m square · red: dead reckoning · green: after loop closure', 8, 292);
    const gap = Math.hypot(raw.at(-1)[0], raw.at(-1)[1]);
    panel.append(note(`Dead reckoning ends ${gap.toFixed(2)} m from where it started. The loop closure knows the start and end are the same place and removes that error along the whole path.`));
    return {};
  },
};
