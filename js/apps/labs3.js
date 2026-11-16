// Lab benches for the digital-twin, deployment and mobile-robot courses. All physics is real MuJoCo.
import { h, lineChart } from '../util.js';
import { loadMujoco, rng } from '../sim/sim.js';
import { Viewer } from '../sim/viewer.js';
import { CoffeeShift, naiveShift } from '../sim/skills.js';
import { Rover, CITY, H, W, CELL, find, cellCenter, occupancy, beamCells } from '../sim/mobile.js';

const note = (t) => h('p.dim', { style: 'font-size:12px' }, t);
const toJs = (x) => (x && x.toJs ? x.toJs({ dict_converter: Object.fromEntries }) : x);
const yieldUI = () => new Promise((r) => setTimeout(r, 0));
function canvas(panel, w = 340, hgt = 220) {
  const c = h('canvas', { width: w * 2, height: hgt * 2, style: `width:100%;max-width:${w}px;aspect-ratio:${w}/${hgt};background:#0a0c10;border-radius:8px;border:1px solid var(--line)` });
  panel.append(c); const g = c.getContext('2d'); g.scale(2, 2); g.font = '11px system-ui'; return [c, g];
}
function bars(panel, rows, max) {  // rows: [label, value, color]
  panel.append(h('div', { style: 'display:grid;gap:4px;margin:6px 0' }, rows.map(([l, v, col, txt]) => h('.row', { style: 'gap:8px;font-size:12.5px' },
    h('span', { style: 'width:120px' }, l), h('span', { style: `height:12px;border-radius:3px;background:${col};width:${Math.max(2, 180 * v / max)}px` }), h('b', {}, txt ?? String(v))))));
}

// ── digital twins: a tilting board in MuJoCo ──
const inclineXML = (mu) => `<mujoco><option timestep="0.002" cone="elliptic"/><worldbody>
 <body name="board" pos="0 0 0.05"><joint name="tilt" type="hinge" axis="1 0 0" damping="5"/><geom type="box" size="0.2 0.3 0.01" friction="${mu} 0.005 0.0001" mass="2"/></body>
 <body name="obj" pos="0 0 0.073"><freejoint/><geom type="box" size="0.04 0.04 0.012" friction="${mu} 0.005 0.0001" mass="0.3"/></body>
</worldbody><actuator><position joint="tilt" kp="400" kv="20"/></actuator></mujoco>`;
export function slipAngle(mj, mu, degPerSec = 4) {
  const m = mj.MjModel.from_xml_string(inclineXML(mu)), d = new mj.MjData(m);
  let slip = null;
  for (let t = 0; t < 40000 && slip == null; t++) {
    d.ctrl[0] = Math.min(70, t * 0.002 * degPerSec) * Math.PI / 180; mj.mj_step(m, d);
    const a = d.qpos[0], along = Math.cos(a) * d.qpos[2] + Math.sin(a) * (d.qpos[3] - 0.05);
    if (t > 200 && Math.abs(along) > 0.005) slip = a * 180 / Math.PI;
  }
  d.delete(); m.delete(); return slip;
}

// ── mobile: grid helpers in JS (the lab's own planner, used to move the lidar robot) ──
function bfs(grid, s, g) {
  const key = (p) => p[0] * 100 + p[1], prev = new Map([[key(s), null]]), q = [s];
  while (q.length) {
    const c = q.shift(); if (c[0] === g[0] && c[1] === g[1]) break;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [c[0] + dr, c[1] + dc];
      if (n[0] < 0 || n[1] < 0 || n[0] >= H || n[1] >= W || grid[n[0]][n[1]] || prev.has(key(n))) continue;
      prev.set(key(n), c); q.push(n);
    }
  }
  const path = []; let c = g; while (c) { path.push(c); c = prev.get(key(c)); } return path.reverse();
}
function drawCity(g, cells, size) {
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    g.fillStyle = cells(r, c); g.fillRect(c * size, r * size, size - 0.5, size - 0.5);
  }
  for (const ch of 'RABC') { const [r, c] = find(ch); g.fillStyle = '#0a0c10'; g.fillText(ch, c * size + size / 2 - 3, r * size + size / 2 + 4); }
}
const STOPS = ['R', 'A', 'B', 'C'].map(find);

export const LABS3 = {
  async incline({ panel, ns, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), r = rng(77), trueMu = +(0.45 + 0.25 * r()).toFixed(3), angles = [];
    for (let i = 0; i < 5; i++) {
      const mu = trueMu * (1 + r.range(-0.03, 0.03));  // a real surface varies a little spot to spot
      angles.push(+slipAngle(mj, mu, r.range(2.5, 5)).toFixed(1)); await yieldUI();
    }
    const est = ns.get('estimate_mu')(angles.slice());
    const [, g] = canvas(panel, 340, 150);
    const a = angles.reduce((x, y) => x + y) / angles.length * Math.PI / 180;
    g.strokeStyle = '#59647a'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 130); g.lineTo(40 + 220 * Math.cos(a), 130 - 220 * Math.sin(a)); g.stroke();
    g.save(); g.translate(40 + 130 * Math.cos(a), 130 - 130 * Math.sin(a)); g.rotate(-a); g.fillStyle = '#ff9d3c'; g.fillRect(-16, -14, 32, 12); g.restore();
    g.fillStyle = '#8d97a8'; g.fillText(`slips at ≈ ${(a * 180 / Math.PI).toFixed(1)}°`, 200, 125);
    panel.append(note(`MuJoCo slip angles over 5 trials (board tilted at different speeds): ${angles.join('°, ')}°.`));
    const err = Math.abs(est - trueMu);
    panel.append(h('p', {}, `Your estimate μ = ${est.toFixed(3)}. The hidden value was ${trueMu}. In MJCF: `, h('code', {}, `friction="${est.toFixed(2)} 0.005 0.0001"`)));
    panel.append(note('Slip shows up a fraction of a degree late (the object has to move before you notice), so the tilt test slightly overestimates μ. Tilting slowly helps; so does repeating.'));
    return { tests: [['your estimate is within 0.06 of the hidden friction', err < 0.06, `off by ${err.toFixed(3)}`]] };
  },

  async coffee({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), serve = ns.get('serve'), N = 20;
    const status = note('Running 20 orders with a script that never checks…'); panel.append(status);
    const run = async (fn, record) => {
      const out = [];
      for (let s = 1; s <= N; s++) {
        const c = new CoffeeShift(mj, { seed: 500 + s, slip: 0.35, record });
        let err = null;
        try { fn(c); } catch (e) { err = String(e.message || e).split('\n').filter(Boolean).pop(); }
        out.push({ ...c.result(), err, frames: record ? c.frames : null }); c.dispose(); await yieldUI();
      }
      return out;
    };
    const base = await run(naiveShift, false);
    status.textContent = 'Now 20 orders with your serve(robot)…';
    const robotOf = (c) => ({ pick: () => c.pick(), place: (s) => c.place(String(s)), press: () => c.press(), wait: (t) => c.wait(Number(t)), home: () => c.home(), where: () => c.where(), holding: () => c.holding() });
    const mine = await run((c) => serve(robotOf(c)), true);
    status.remove();
    const ok = (xs) => xs.filter((x) => x.served).length, avg = (xs) => (xs.reduce((a, x) => a + x.time, 0) / xs.length).toFixed(1);
    bars(panel, [['no checks', ok(base), '#ff6b6b', `${ok(base)}/${N} served · ${avg(base)} s`], ['your serve()', ok(mine), '#4fd08a', `${ok(mine)}/${N} served · ${avg(mine)} s`]], N);
    const slips = mine.reduce((a, x) => a + x.drops, 0), errs = mine.filter((x) => x.err);
    panel.append(note(`The cup slipped ${slips} times during your 20 shifts. Recovery costs seconds; skipping it costs the order.${errs.length ? ` ${errs.length} shift(s) stopped with an error, e.g. “${errs[0].err}”.` : ''}`));
    // replay the most eventful recovered shift
    const rec = mine.filter((x) => x.served && x.drops).sort((a, b) => b.drops - a.drops)[0] || mine.find((x) => x.served);
    let cleanup = null;
    if (rec?.frames?.length) {
      const holder = h('.view3d', { style: 'min-height:240px;border-radius:8px;overflow:hidden' }); panel.append(holder, note(`Replay: a shift with ${rec.drops} slip(s) that still got served (${rec.time} s). Events: ${rec.events.map((e) => e.e + (e.ok === false ? '✗' : '')).join(' → ')}`));
      const c = new CoffeeShift(mj, { seed: 1 }), viewer = new Viewer(holder, { cam: [0.75, -0.35, 0.5], look: [0.27, 0, 0.03] });
      viewer.setSim(c.sim); let i = 0, alive = true;
      const tick = () => { if (!alive) return; c.sim.restore(rec.frames[i]); viewer.draw(); i = (i + 1) % rec.frames.length; setTimeout(() => requestAnimationFrame(tick), 90); };
      tick();
      cleanup = () => { alive = false; viewer.dispose(); c.dispose(); };
    }
    return {
      tests: [['your shift serves at least 17/20 orders under slips', ok(mine) >= 17, `${ok(mine)}/20 served`],
        ['and beats the script without checks', ok(mine) > ok(base), `${ok(mine)} vs ${ok(base)}`]],
      cleanup,
    };
  },

  blend({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const pts = [0, 1, 0.4, 1.2];
    const a = toJs(ns.get('via')(py.toPy(pts), 40, 0)), b = toJs(ns.get('via')(py.toPy(pts), 40, 14));
    const vel = (p) => p.slice(1).map((x, i) => Math.abs(x - p[i]) * 20);
    const c = h('canvas.chart', { style: 'height:160px' }); panel.append(note('Speed along the move. Red: stop at every waypoint. Green: your blended path.'), c);
    lineChart(c, [{ data: vel(a), color: '#ff6b6b' }, { data: vel(b), color: '#4fd08a' }], { ymin: 0 });
    panel.append(note(`Stop-and-go takes ${a.length} control steps, blended ${b.length}: ${Math.round(100 * (1 - b.length / a.length))}% faster, and the speed never drops to zero between skills.`));
    return {};
  },

  async coffeedata({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), label = ns.get('label');
    const robust = (c) => {
      for (let i = 0; i < 4 && c.where() !== 'machine'; i++) { if (c.where() !== 'gripper') c.pick(); if (c.holding()) c.place('machine'); }
      c.press(); c.wait(1);
      for (let i = 0; i < 4 && c.where() !== 'tray'; i++) { if (c.where() !== 'gripper') c.pick(); if (c.holding()) c.place('tray'); }
      c.home();
    };
    const sloppy = (c) => { c.press(); c.wait(0.5); c.home(); };  // operator forgot the cup
    const scripts = [robust, robust, naiveShift, sloppy];
    const status = note('Logging 24 real shifts…'); panel.append(status);
    const eps = [];
    for (let i = 0; i < 24; i++) {
      const c = new CoffeeShift(mj, { seed: 900 + i, slip: 0.35 });
      try { scripts[i % 4](c); } catch { /* out of time counts as a failed shift */ }
      const r = c.result(); c.dispose();
      eps.push({ episode_index: i, served: r.served, time: r.time, events: r.events, drops: r.drops });
      await yieldUI();
    }
    status.remove();
    const counts = { clean: 0, recovered: 0, failed: 0, bad: 0 }, truth = [];
    for (const e of eps) {
      const l = String(label(py.toPy(e))); e.label = l; counts[l] = (counts[l] || 0) + 1;
      const t = !e.events.some((x) => x.e === 'pick') || e.time > 60 ? 'bad' : !e.served ? 'failed' : e.drops ? 'recovered' : 'clean';
      truth.push(t === l);
    }
    bars(panel, [['clean (train)', counts.clean, '#4fd08a'], ['recovered (train ×2)', counts.recovered, '#6ab0ff'], ['failed (detector)', counts.failed, '#ff9d3c'], ['bad (drop)', counts.bad, '#ff6b6b']], 24);
    const dl = h('button.small.ghost', { onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(eps, null, 1)], { type: 'application/json' })), download: 'coffee_shifts_labeled.json' }); document.body.append(a); a.click(); a.remove(); } }, '⬇ Download the labeled shifts');
    panel.append(dl, note('Want the real thing? ViFailback has thousands of labeled real-robot failures; the LeRobot visualizer opens any LeRobot-format dataset in your browser.'));
    return { tests: [['all 24 real shifts labeled correctly', truth.every(Boolean), `${truth.filter(Boolean).length}/24 match`]] };
  },

  kalman({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const [truth, odo, gps, us] = toJs(py.runPython('_drive()', { globals: ns }));
    const est = toJs(ns.get('kalman')(py.toPy(us), py.toPy(gps), 0.01, 1.0));
    const err = (a) => a.map((x, i) => x - truth[i]);
    const c = h('canvas.chart', { style: 'height:170px' });
    panel.append(note('Position error over 200 steps. Orange: GPS. Red: odometry (drifting). Green: your filter.'), c);
    lineChart(c, [{ data: err(gps), color: '#ff9d3c' }, { data: err(odo), color: '#ff6b6b' }, { data: err(est), color: '#4fd08a' }], { ymin: -3, ymax: 3 });
    return {};
  },

  async lidarmap({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), rover = new Rover(mj, find('R')), occ = occupancy();
    const grid = py.runPython(`[[0.0] * ${W} for _ in range(${H})]`), update = ns.get('update'), occupied = ns.get('occupied');
    const route = []; for (let i = 0; i < 3; i++) route.push(...bfs(occ, STOPS[i], STOPS[i + 1]));
    let scans = 0;
    for (let k = 0; k < route.length; k += 2) {
      const [x, y] = cellCenter(route[k]), q = rover.data.qpos; q[0] = x; q[1] = y; mj.mj_forward(rover.model, rover.data);
      const ranges = rover.lidar(72, 3.5), free = [], hits = [];
      ranges.forEach((d, i) => {
        const a = (2 * Math.PI * i) / 72, e = d + 0.05, end = [x + Math.cos(a) * e, y + Math.sin(a) * e];  // 5 cm past the hit lands inside the wall cell
        const b = beamCells([x, y], end);
        free.push(...b.free); if (d < 3.49) hits.push(b.end);
      });
      update(grid, py.toPy(free), py.toPy(hits)); scans++;
      if (scans % 10 === 0) await yieldUI();
    }
    rover.dispose();
    const G = toJs(grid); let seen = 0, right = 0;
    const [, g] = canvas(panel, 340, 210), size = 340 / W;
    drawCity(g, (r, c) => {
      const l = G[r][c]; if (Math.abs(l) < 1e-9) return '#1b2028';
      seen++; const o = !!occupied(l); if (o === !!occ[r][c]) right++;
      return o ? '#c9d1e0' : '#2a5a44';
    }, size);
    grid.destroy?.();
    panel.append(note(`${scans} lidar scans, 72 MuJoCo rays each. White: walls you mapped. Green: free street. Dark: never seen. ${right}/${seen} observed cells match the true city.`));
    return { tests: [['your map matches the city on ≥ 90% of observed cells', right / seen >= 0.9, `${Math.round(100 * right / seen)}%`]] };
  },

  astar({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const occ = occupancy(), astar = ns.get('astar'), paths = [], tup = (a) => py.globals.get('tuple')(py.toPy(a));
    let valid = true, optimal = true;
    for (let i = 0; i < 3; i++) {
      const p = toJs(astar(py.toPy(occ), tup(STOPS[i]), tup(STOPS[i + 1])));
      if (!p) { valid = false; continue; }
      paths.push(p.map((c) => Array.from(c)));
      const pp = paths.at(-1);
      for (let k = 1; k < pp.length; k++) if (Math.abs(pp[k][0] - pp[k - 1][0]) + Math.abs(pp[k][1] - pp[k - 1][1]) !== 1 || occ[pp[k][0]][pp[k][1]]) valid = false;
      if (pp.length !== bfs(occ, STOPS[i], STOPS[i + 1]).length) optimal = false;
    }
    const [, g] = canvas(panel, 340, 210), size = 340 / W, on = new Set(paths.flat().map(([r, c]) => r * 100 + c));
    drawCity(g, (r, c) => (occ[r][c] ? '#59647a' : on.has(r * 100 + c) ? '#ff9d3c' : '#1b2028'), size);
    panel.append(note(`Routes R → A → B → C: ${paths.map((p) => p.length - 1).join(' + ')} cells of ${CELL} m.`));
    return { tests: [['routes are connected and avoid buildings', valid], ['routes are shortest', optimal]] };
  },

  async delivery({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), occ = occupancy(), astar = ns.get('astar'), pursue = ns.get('pursue'), tup = (a) => py.globals.get('tuple')(py.toPy(a));
    const rover = new Rover(mj, find('R')), trace = [], legs = [];
    let look = 0.4; try { look = Number(ns.get('LOOKAHEAD')) || 0.4; } catch { /* default */ }
    const holder = h('.view3d', { style: 'min-height:240px;border-radius:8px;overflow:hidden' });
    const status = note('Driving…'); panel.append(holder, status);
    const viewer = new Viewer(holder, { cam: [W * CELL / 2, -H * CELL - 5, 9], look: [W * CELL / 2, -H * CELL / 2, 0], minDist: 2, maxDist: 25 });
    viewer.setSim(rover);
    let error = null;
    try {
      for (let i = 0; i < 3; i++) {
        const cells = toJs(astar(py.toPy(occ), tup(STOPS[i]), tup(STOPS[i + 1])));
        const path = cells.map((c) => cellCenter(Array.from(c))), goal = path.at(-1), t0 = rover.time;
        const pyPath = py.toPy(path);
        let arrived = false;
        while (rover.time - t0 < 90) {
          const p = rover.pose();
          if (Math.hypot(p[0] - goal[0], p[1] - goal[1]) < 0.2) { arrived = true; break; }
          const [v, w] = toJs(pursue(py.toPy(p), pyPath, look));
          rover.drive(...Rover.wheels(v, w)); trace.push(p);
          if (trace.length % 20 === 0) { viewer.draw(); await yieldUI(); }
        }
        pyPath.destroy?.();
        rover.drive(0, 0, 0.5);
        legs.push({ to: 'ABC'[i], arrived, time: +(rover.time - t0).toFixed(1) });
        status.textContent = legs.map((l) => `${l.to}: ${l.arrived ? `delivered in ${l.time} s` : 'not reached'}`).join(' · ');
        if (!arrived) break;
      }
    } catch (e) { error = String(e.message || e).split('\n').filter(Boolean).pop(); }
    viewer.draw();
    const [, g] = canvas(panel, 340, 210), size = 340 / W;
    drawCity(g, (r, c) => (occ[r][c] ? '#59647a' : '#1b2028'), size);
    g.strokeStyle = '#4fd08a'; g.lineWidth = 2; g.beginPath();
    trace.forEach(([x, y], i) => (i ? g.lineTo(x / CELL * size, -y / CELL * size) : g.moveTo(x / CELL * size, -y / CELL * size))); g.stroke();
    const done = legs.filter((l) => l.arrived).length;
    panel.append(note(`${done}/3 delivered · ${rover.bumps} bump(s) into buildings · ${rover.time.toFixed(0)} s total.${error ? ` Stopped with: ${error}` : ''} Lookahead ${look} m: too short and it stalls and wobbles, too long and it clips corners.`));
    return {
      tests: [['all three orders delivered', done === 3, `${done}/3`], ['at most 3 bumps into buildings', rover.bumps <= 3, `${rover.bumps} bumps`]],
      cleanup: () => { viewer.dispose(); rover.dispose(); },
    };
  },
};
