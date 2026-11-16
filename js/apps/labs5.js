// Lab benches for week 4: real depth images, Jacobian tracking, RRT, and networks that actually train.
import { h, lineChart } from '../util.js';
import { Sim, loadMujoco, rng } from '../sim/sim.js';
import { Viewer } from '../sim/viewer.js';
import { MLP, shuffle } from '../nn.js';
import { collect, trainBC, runEpisode, rawObs, expert } from '../sim/bc.js';
import { walk, quadXML } from '../sim/legged.js';
import { CONTROL_DT } from '../sim/sim.js';

const note = (t) => h('p.dim', { style: 'font-size:12px' }, t);
const toJs = (x) => (x && x.toJs ? x.toJs({ dict_converter: Object.fromEntries }) : x);
const tick = () => new Promise((r) => setTimeout(r, 0));
function canvas(panel, w = 340, hgt = 255) {
  const c = h('canvas', { width: w * 2, height: hgt * 2, style: `width:100%;max-width:${w}px;aspect-ratio:${w}/${hgt};background:#0a0c10;border-radius:8px;border:1px solid var(--line)` });
  panel.append(c); const g = c.getContext('2d'); g.scale(2, 2); g.font = '11px system-ui'; return [c, g];
}
function bars(panel, rows, max) {
  panel.append(h('div', { style: 'display:grid;gap:4px;margin:6px 0' }, rows.map(([l, v, col, txt]) => h('.row', { style: 'gap:8px;font-size:12.5px' },
    h('span', { style: 'width:90px' }, l), h('span', { style: `height:12px;border-radius:3px;background:${col};width:${Math.max(2, 170 * v / max)}px` }), h('b', {}, txt ?? String(v))))));
}

// Depth image by ray casting from a MuJoCo camera. Returns pinhole intrinsics and OpenCV-convention extrinsics.
export function depthImage(sim, camName, W = 96, H = 72) {
  const { mj, model, data } = sim, id = sim.cameraId(camName), fovy = model.cam_fovy[id] * Math.PI / 180;
  const fy = (H / 2) / Math.tan(fovy / 2), fx = fy, cx = W / 2, cy = H / 2, M = data.cam_xmat, o = 9 * id;
  // MuJoCo camera axes: x right, y up, z backward. OpenCV: x right, y down, z forward.
  const R = [0, 1, 2].map((r) => [M[o + 3 * r], -M[o + 3 * r + 1], -M[o + 3 * r + 2]]);
  const t = [data.cam_xpos[3 * id], data.cam_xpos[3 * id + 1], data.cam_xpos[3 * id + 2]];
  const depth = new Float32Array(W * H), pnt = new Float64Array(t), vec = new Float64Array(3), gid = new Int32Array(1);
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const d = [(u + 0.5 - cx) / fx, (v + 0.5 - cy) / fy, 1], n = Math.hypot(...d);
    for (let r = 0; r < 3; r++) vec[r] = (R[r][0] * d[0] + R[r][1] * d[1] + R[r][2] * d[2]) / n;
    const dist = mj.mj_ray(model, data, pnt, vec, null, 1, -1, gid, null);
    depth[v * W + u] = dist > 0 ? dist / n : 0;   // z-depth along the optical axis
  }
  return { depth, W, H, fx, fy, cx, cy, R, t };
}

export const LABS5 = {
  async depthlab({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), sim = new Sim(mj, 'sprout'), r = rng(11);
    const errs = []; let shown = null;
    for (let k = 0; k < 4; k++) {
      sim.reset({ red: [r.range(0.24, 0.34), r.range(0.08, 0.2), r.range(-0.6, 0.6)], blue: [0.37, -0.05, 0] });
      const im = depthImage(sim, 'front'), pix = [];
      for (let v = 0; v < im.H; v++) for (let u = 0; u < im.W; u++) { const d = im.depth[v * im.W + u]; if (d > 0) pix.push([u + 0.5, v + 0.5, d]); }
      ns.set('_pix', py.toPy(pix)); ns.set('_R', py.toPy(im.R)); ns.set('_t', py.toPy(im.t)); ns.set('_K', py.toPy([im.fx, im.fy, im.cx, im.cy]));
      const out = toJs(py.runPython('_pts = [cam_to_world(backproject(u, v, d, *_K), _R, _t) for (u, v, d) in _pix]\n_obj = crop(_pts, (0.15, 0.02, 0.008), (0.42, 0.26, 0.08))\n(list(centroid(_obj)) if _obj else None, len(_obj), len(_pts))', { globals: ns }));
      const truth = sim.bodyPos('red');
      errs.push(out[0] ? Math.hypot(out[0][0] - truth[0], out[0][1] - truth[1]) : 1);
      if (k === 0) shown = { im, est: out[0], truth, n: out[1], total: out[2] };
    }
    sim.dispose();
    const { im, est, truth, n, total } = shown, [, g] = canvas(panel, 336, 252), s = 336 / im.W;
    let lo = 9, hi = 0; for (const d of im.depth) if (d > 0) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
    for (let v = 0; v < im.H; v++) for (let u = 0; u < im.W; u++) { const d = im.depth[v * im.W + u], c = d > 0 ? Math.round(255 * (1 - (d - lo) / (hi - lo))) : 0; g.fillStyle = `rgb(${c},${Math.round(c * 0.85)},${Math.round(60 + c * 0.6)})`; g.fillRect(u * s, v * s, s + 0.5, s + 0.5); }
    const proj = (p) => { const q = [0, 1, 2].map((i) => im.R[0][i] * (p[0] - im.t[0]) + im.R[1][i] * (p[1] - im.t[1]) + im.R[2][i] * (p[2] - im.t[2])); return [(im.fx * q[0] / q[2] + im.cx) * s, (im.fy * q[1] / q[2] + im.cy) * s]; };
    if (est) { const [x, y] = proj(est); g.strokeStyle = '#4fd08a'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 9, 0, 7); g.moveTo(x - 13, y); g.lineTo(x + 13, y); g.moveTo(x, y - 13); g.lineTo(x, y + 13); g.stroke(); }
    panel.append(note(`A ${im.W}×${im.H} depth image ray-cast from MuJoCo’s front camera (near = bright). Your code turned ${total} pixels into a point cloud, cropped ${n} points above the table, and marked their centroid (green).`),
      h('p', { style: 'font-size:13px' }, est ? `Estimate (${est.map((v) => v.toFixed(3)).join(', ')}) m · true cube centre (${truth.map((v) => v.toFixed(3)).join(', ')}) m.` : 'No points survived your crop.'),
      note(`Error on 4 random layouts: ${errs.map((e) => (e * 100).toFixed(1) + ' cm').join(', ')}. The estimate leans toward the camera because only the top and front faces are visible.`));
    return { tests: [['your pipeline finds the cube within 1.5 cm on 4 layouts', errs.every((e) => e < 0.015), errs.map((e) => (e * 100).toFixed(1) + ' cm').join(', ')]] };
  },

  jaclab({ panel, ns, pyOk }) {
    if (!pyOk) return {};
    const step = ns.get('ik_step'), fk = ns.get('fk'), L1 = 0.116, L2 = 0.135;
    const target = (t) => [0.14 + 0.06 * Math.cos(t), 0.08 + 0.06 * Math.sin(t)];
    let q = [0.6, 0.9], worst = 0;
    for (let i = 0; i < 300; i++) { const tg = target(i * 0.03); q = toJs(step(q, tg, 0.02)); const p = toJs(fk(q[0], q[1])); if (i > 30) worst = Math.max(worst, Math.hypot(p[0] - tg[0], p[1] - tg[1])); }
    const [, g] = canvas(panel, 340, 260), S = 800, O = [70, 200]; let t = 0, alive = true, raf; q = [0.6, 0.9]; const trail = [];
    const draw = () => {
      if (!alive) return; t += 0.03; const tg = target(t);
      try { q = toJs(step(q, tg, 0.02)); } catch { alive = false; return; }
      const e = [L1 * Math.cos(q[0]), L1 * Math.sin(q[0])], hnd = [e[0] + L2 * Math.cos(q[0] + q[1]), e[1] + L2 * Math.sin(q[0] + q[1])];
      trail.push(hnd); if (trail.length > 220) trail.shift();
      g.clearRect(0, 0, 340, 260); g.lineCap = 'round';
      g.strokeStyle = '#2e3542'; g.lineWidth = 1; g.beginPath(); g.arc(O[0] + 0.14 * S, O[1] - 0.08 * S, 0.06 * S, 0, 7); g.stroke();
      g.strokeStyle = '#4fd08a'; g.lineWidth = 1.5; g.beginPath(); trail.forEach((p, i) => (i ? g.lineTo(O[0] + p[0] * S, O[1] - p[1] * S) : g.moveTo(O[0] + p[0] * S, O[1] - p[1] * S))); g.stroke();
      g.strokeStyle = '#c9d1e0'; g.lineWidth = 8; g.beginPath(); g.moveTo(...O); g.lineTo(O[0] + e[0] * S, O[1] - e[1] * S); g.lineTo(O[0] + hnd[0] * S, O[1] - hnd[1] * S); g.stroke();
      g.fillStyle = '#ff9d3c'; g.beginPath(); g.arc(O[0] + tg[0] * S, O[1] - tg[1] * S, 5, 0, 7); g.fill();
      raf = requestAnimationFrame(draw);
    };
    draw();
    panel.append(note(`Your damped-least-squares step, run once per frame, keeps the hand on a moving target (orange). Worst tracking error: ${(worst * 1000).toFixed(1)} mm.`));
    return { tests: [['the arm tracks a moving target within 5 mm', worst < 0.005, `${(worst * 1000).toFixed(1)} mm`]], cleanup: () => { alive = false; cancelAnimationFrame(raf); } };
  },

  rrtlab({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const out = toJs(py.runPython('(rrt(START, GOAL, OBSTACLES, seed=4), list(_tree), OBSTACLES, START, GOAL)', { globals: ns }));
    const [path, tree, obs, start, goal] = out, [, g] = canvas(panel, 320, 320), X = (x) => 10 + x * 300, Y = (y) => 310 - y * 300;
    g.fillStyle = '#3a2630'; for (const [x, y, r] of obs) { g.beginPath(); g.arc(X(x), Y(y), r * 300, 0, 7); g.fill(); }
    g.strokeStyle = '#3d5a80'; g.lineWidth = 1; for (const [a, b] of tree) { g.beginPath(); g.moveTo(X(a[0]), Y(a[1])); g.lineTo(X(b[0]), Y(b[1])); g.stroke(); }
    if (path) { g.strokeStyle = '#ff9d3c'; g.lineWidth = 3; g.beginPath(); path.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke(); }
    for (const [p, c] of [[start, '#4fd08a'], [goal, '#ff6b6b']]) { g.fillStyle = c; g.beginPath(); g.arc(X(p[0]), Y(p[1]), 6, 0, 7); g.fill(); }
    panel.append(note(`Blue: the ${tree.length} branches the tree grew. Orange: the path it found (${path ? path.length - 1 : 0} segments). It is valid but jagged: real planners shortcut and smooth it next.`));
    return {};
  },

  async bclab({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), sim = new Sim(mj, 'sprout'), obsFn = ns.get('observation');
    const feats = (o) => Array.from(toJs(obsFn(o.ee, o.cube, o.bin, o.gap, o.gapv, o.grip)));
    const status = h('p', { style: 'font-size:13px' }, 'Recording 40 expert demos in MuJoCo…'), chart = h('canvas.chart', { style: 'height:120px' });
    const view = h('.view3d', { style: 'height:220px;flex:none;border-radius:8px;overflow:hidden' }, h('.hud', {}, h('span.chip', {}, 'your trained network, live')));
    panel.append(status, chart, view); await tick();
    const N = [10, 20, 40], results = []; let last = null;
    const all = [];  // demos kept per episode so subsets are whole demos
    for (let i = 0; i < 40; i++) { const ep = []; runEpisode(sim, expert, 1000 + i, { noise: 0.15, record: ep }); all.push(ep); if (i % 8 === 7) await tick(); }
    for (const n of N) {
      const data = all.slice(0, n).flat();
      status.textContent = `Training on ${n} demos (${data.length} samples)…`; await tick();
      // one Python call for the whole dataset keeps this fast
      ns.set('_obs', py.toPy(data.map((d) => [d.o.ee, d.o.cube, d.o.bin, d.o.gap, d.o.gapv, d.o.grip])));
      const F = toJs(py.runPython('[list(observation(*o)) for o in _obs]', { globals: ns })), map = new Map(data.map((d, i) => [d.o, F[i]]));
      const res = trainBC(data, (o) => map.get(o), { epochs: 40 });
      lineChart(chart, [{ data: res.curve.map((c) => c[0]), color: '#ff9d3c' }, { data: res.curve.map((c) => c[1]), color: '#6ab0ff' }], { ymin: 0 });
      await tick();
      const policy = (o) => Array.from(res.net.forward(Float64Array.from(feats(o))));
      let ok = 0; for (let i = 0; i < 20; i++) { ok += runEpisode(sim, policy, 7000 + i); if (i % 5 === 4) { status.textContent = `Evaluating the ${n}-demo policy: ${ok}/${i + 1}…`; await tick(); } }
      results.push([n, ok, data.length, res.curve.at(-1)]); last = policy;
    }
    status.textContent = 'Success on 20 new cube layouts (real MuJoCo rollouts of your trained network):';
    bars(panel, results.map(([n, ok]) => [`${n} demos`, ok, ok >= 14 ? '#4fd08a' : ok >= 5 ? '#ff9d3c' : '#ff6b6b', `${ok}/20`]), 20);
    panel.append(note(`Loss curve above (orange train, blue validation) is for the 40-demo run: final ${results[2][3][0].toFixed(4)} / ${results[2][3][1].toFixed(4)}. Low loss is not success: with too few demos the loss also falls, but the policy still drifts off the data.`));
    // live rollout of the final policy
    const viewer = new Viewer(view, { cam: [0.75, -0.35, 0.5], look: [0.27, 0, 0.03] }); viewer.setSim(sim);
    let alive = true, raf, seed = 9000, steps = 0, r0 = rng(seed);
    const { sampleLayout } = await import('../sim/sim.js'); sim.reset(sampleLayout(r0));
    const loop = () => {
      if (!alive) return;
      const a = last(rawObs(sim)); sim.step(a.map((v, i) => (i < 3 ? Math.max(-1, Math.min(1, v)) : v > 0.5 ? 1 : 0))); steps++;
      if (steps > 260 || sim.check('red_bin').success) { steps = 0; r0 = rng(++seed); sim.reset(sampleLayout(r0)); }
      viewer.draw(); raf = setTimeout(() => requestAnimationFrame(loop), CONTROL_DT * 1000 * 0.6);
    };
    loop();
    return { tests: [['with 40 demos your policy solves at least 14/20 new layouts', results[2][1] >= 14, `${results[2][1]}/20 (10 demos: ${results[0][1]}, 20 demos: ${results[1][1]})`]],
      cleanup: () => { alive = false; clearTimeout(raf); viewer.dispose(); sim.dispose(); } };
  },

  async flowlab({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const r = rng(5), N = 3000, pairs = [];
    for (let i = 0; i < N; i++) pairs.push([r.gauss(), (r() < 0.5 ? -1 : 1) + 0.08 * r.gauss(), r()]);
    ns.set('_pairs', py.toPy(pairs));
    const rows = toJs(py.runPython('[(interpolate(x0, x1, t), t, target_velocity(x0, x1)) for (x0, x1, t) in _pairs]', { globals: ns }));
    const X = rows.map((q) => Float64Array.from([q[0], q[1]])), Y = rows.map((q) => Float64Array.from([q[2]]));
    const net = new MLP([2, 48, 48, 1], r), status = note('Training the velocity network…'); panel.append(status); await tick();
    for (let e = 0; e < 40; e++) { const idx = shuffle(N, r); for (let b = 0; b < N; b += 64) { const ids = idx.slice(b, b + 64); net.trainBatch(ids.map((i) => X[i]), ids.map((i) => Y[i]), 3e-3); } if (e % 10 === 9) await tick(); }
    const v = (x, t) => net.forward(Float64Array.from([x, t]))[0], sample = ns.get('sample');
    const starts = Array.from({ length: 200 }, () => r.gauss()), ends = starts.map((x0) => Number(sample(v, x0, 20)));
    const near = ends.filter((x) => Math.abs(Math.abs(x) - 1) < 0.35).length, left = ends.filter((x) => x < 0).length;
    status.remove();
    const [, g] = canvas(panel, 340, 240), Yp = (x) => 120 - x * 55;
    g.strokeStyle = '#2e3542'; g.lineWidth = 1; for (const m of [-1, 1]) { g.beginPath(); g.moveTo(30, Yp(m)); g.lineTo(330, Yp(m)); g.stroke(); }
    g.fillStyle = '#8d97a8'; g.fillText('noise (t = 0)', 30, 14); g.fillText('actions (t = 1)', 250, 14); g.fillText('right +1', 285, Yp(1) - 4); g.fillText('left −1', 290, Yp(-1) - 4);
    g.strokeStyle = 'rgba(106,176,255,0.28)';
    for (const x0 of starts.slice(0, 70)) { let x = x0; g.beginPath(); g.moveTo(30, Yp(x)); for (let k = 0; k < 20; k++) { x += v(x, k / 20) / 20; g.lineTo(30 + (k + 1) * 15, Yp(x)); } g.stroke(); }
    g.fillStyle = '#4fd08a'; for (const x of ends) { g.beginPath(); g.arc(334, Yp(x), 2, 0, 7); g.fill(); }
    g.strokeStyle = '#ff6b6b'; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(30, Yp(0)); g.lineTo(330, Yp(0)); g.stroke(); g.setLineDash([]); g.fillStyle = '#ff6b6b'; g.fillText('what MSE regression predicts: the average, 0 (straight into the obstacle)', 30, 232);
    panel.append(note(`A real network (about 2,500 weights) trained on ${N} points built with your interpolate() and target_velocity(). Blue: paths your sample() follows. Green: where 200 samples end: ${left} go left, ${200 - left} go right, ${near} land on a real action.`));
    return { tests: [['at least 90% of samples land on a real action (±1)', near >= 180, `${near}/200`], ['both modes are produced', left >= 50 && left <= 150, `${left} left / ${200 - left} right`]] };
  },

  async leglab({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), gait = ns.get('gait'), mutate = ns.get('mutate');
    const clamp = (p) => [Math.max(-0.6, Math.min(0.6, p[0])), Math.max(0, Math.min(1, p[1])), Math.max(0.5, Math.min(3.5, p[2])), p[3]];
    const run = (params, record = false) => { const pp = py.toPy(params); try { return walk(mj, (t) => toJs(gait(t, pp)).map((x) => Array.from(x)), 6, record); } finally { pp.destroy?.(); } };
    const score = (r) => (r.fell ? -1 : r.distance - 0.5 * r.drift);
    const status = h('p', { style: 'font-size:13px' }, 'Walking with your starting gait…'), chart = h('canvas.chart', { style: 'height:110px' });
    const view = h('.view3d', { style: 'height:210px;flex:none;border-radius:8px;overflow:hidden' }); panel.append(status, chart, view); await tick();
    let best = toJs(ns.get('START')), first = run(best), bs = score(first); const curve = [bs], rr = py.runPython('random.Random(3)', { globals: ns }), sigma = ns.get('SIGMA');
    for (let i = 0; i < 25; i++) {
      const cand = clamp(toJs(mutate(py.toPy(best), rr, sigma))), sc = score(run(cand));
      if (sc > bs) { bs = sc; best = cand; }
      curve.push(bs); status.textContent = `Random search ${i + 1}/25: best ${bs.toFixed(2)} m in 6 s`;
      lineChart(chart, [{ data: curve, color: '#4fd08a' }], { ymin: 0 }); await tick();
    }
    const final = run(best, true);
    status.textContent = `Your starting trot walked ${first.distance.toFixed(2)} m in 6 s${first.fell ? ' (and fell)' : ''}. After 25 rounds of random search: ${final.distance.toFixed(2)} m.`;
    panel.append(note(`Best parameters: A ${best[0].toFixed(2)} rad, B ${best[1].toFixed(2)} rad, ${best[2].toFixed(2)} Hz, knee timing ${best[3].toFixed(2)} rad. The curve is the best score so far (distance minus sideways drift). Real legged RL replaces the 4 gait numbers with a neural network and the 25 tries with billions of simulated steps.`));
    const m = mj.MjModel.from_xml_string(quadXML()), d = new mj.MjData(m), viewer = new Viewer(view, { cam: [0.5, -1.6, 0.7], look: [0.5, 0, 0.1], minDist: 0.5, maxDist: 6 }); viewer.setSim({ model: m, data: d });
    let i = 0, alive = true, raf; const play = () => { if (!alive || !final.frames.length) return; const f = final.frames[i++ % final.frames.length]; for (let k = 0; k < f.length; k++) d.qpos[k] = f[k]; mj.mj_forward(m, d); viewer.controls.target.set(f[0], 0, 0.1); viewer.camera.position.set(f[0] + 0.1, -1.5, 0.6); viewer.draw(); raf = setTimeout(() => requestAnimationFrame(play), 40); };
    play();
    return { tests: [['your trot walks forward more than 0.3 m without falling', !first.fell && first.distance > 0.3, `${first.distance.toFixed(2)} m${first.fell ? ', fell' : ''}`], ['random search does not make it worse (and usually improves it)', bs >= score(first), `${score(first).toFixed(2)} → ${bs.toFixed(2)}`]],
      cleanup: () => { alive = false; clearTimeout(raf); viewer.dispose(); d.delete(); m.delete(); } };
  },
};
