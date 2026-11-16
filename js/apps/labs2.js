// Interactive "lab bench" panels for the newer Academy lessons.
// Each lab gets the learner's Python namespace (ns) and returns extra test rows and a cleanup function.
import { h, lineChart, toast } from '../util.js';
import { Sim, loadMujoco, rng, sampleLayout } from '../sim/sim.js';
import { Rollout, DEMO_KINDS } from '../sim/operator.js';
import { trueSubtasks } from '../annotate.js';
import { Viewer } from '../sim/viewer.js';

const note = (t) => h('p.dim', { style: 'font-size:12px' }, t);
function canvas(panel, w = 340, hgt = 260) {
  const c = h('canvas', { width: w * 2, height: hgt * 2, style: `width:100%;max-width:${w}px;aspect-ratio:${w}/${hgt};background:#0a0c10;border-radius:8px;border:1px solid var(--line)` });
  panel.append(c); const g = c.getContext('2d'); g.scale(2, 2); return [c, g];
}
const toJs = (x) => (x && x.toJs ? x.toJs({ dict_converter: Object.fromEntries }) : x);

// Camera geometry shared by the two calibration labs (MuJoCo 'front' camera, rendered at 320x240).
const IMG_W = 320, IMG_H = 240;
function frontCamera(sim) {
  const id = sim.cameraId('front'), p = sim.data.cam_xpos, R = sim.data.cam_xmat, j = 9 * id;
  const pos = [p[3 * id], p[3 * id + 1], p[3 * id + 2]];
  // MuJoCo camera axes (columns of xmat): x right, y up, z backwards. OpenCV: x right, y down, z forward.
  const axes = [[R[j], R[j + 3], R[j + 6]], [-R[j + 1], -R[j + 4], -R[j + 7]], [-R[j + 2], -R[j + 5], -R[j + 8]]];
  const fovy = sim.model.cam_fovy[id];
  const f = (IMG_H / 2) / Math.tan(fovy * Math.PI / 360);
  // camera pose in the world, as a 4x4 (columns = OpenCV axes)
  const T_world_cam = [0, 1, 2].map((r) => [axes[0][r], axes[1][r], axes[2][r], pos[r]]).concat([[0, 0, 0, 1]]);
  const toCam = (w) => axes.map((a) => a[0] * (w[0] - pos[0]) + a[1] * (w[1] - pos[1]) + a[2] * (w[2] - pos[2]));
  return { pos, axes, fovy, f, T_world_cam, toCam, project: (c) => [f * c[0] / c[2] + IMG_W / 2, f * c[1] / c[2] + IMG_H / 2] };
}
function cubeCorners(sim, name) {
  const b = sim.ids[name], x = sim.data.xpos, M = sim.data.xmat, s = 0.02, out = [];
  for (const dx of [-s, s]) for (const dy of [-s, s]) for (const dz of [-s, s]) {
    out.push([0, 1, 2].map((r) => x[3 * b + r] + M[9 * b + 3 * r] * dx + M[9 * b + 3 * r + 1] * dy + M[9 * b + 3 * r + 2] * dz));
  }
  return out;
}
async function cameraBench(panel) {
  const mj = await loadMujoco(), sim = new Sim(mj, 'sprout');
  sim.reset(sampleLayout(rng(3)));
  const wrap = h('div', { style: `position:relative;width:${IMG_W}px;max-width:100%;aspect-ratio:4/3;border-radius:8px;overflow:hidden;border:1px solid var(--line)` });
  const holder = h('div', { style: 'position:absolute;inset:0' });
  const overlay = h('canvas', { width: IMG_W * 2, height: IMG_H * 2, style: 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none' });
  wrap.append(holder, overlay); panel.append(wrap);
  const viewer = new Viewer(holder); viewer.setSim(sim); viewer.useMujocoCamera(sim, 'front');
  const g = overlay.getContext('2d'); g.scale(2 * overlay.clientWidth / IMG_W || 2, 2 * overlay.clientHeight / IMG_H || 2);
  return { mj, sim, viewer, g, cam: frontCamera(sim), cleanup: () => { viewer.dispose(); sim.dispose(); } };
}
const dot = (g, [u, v], color, r = 3) => { g.fillStyle = color; g.beginPath(); g.arc(u, v, r, 0, 7); g.fill(); };

const BANDIT_PY = `
def _bandit(select_fn, pulls=300, seed=0):
    r = random.Random(seed); means = [0.2, 0.4, 0.5, 0.55, 0.7]
    def run(policy):
        q = [0.0] * 5; n = [0] * 5; total = 0; curve = []
        for t in range(1, pulls + 1):
            i = policy(q, n, t)
            rew = 1 if r.random() < means[i] else 0
            n[i] += 1; q[i] += (rew - q[i]) / n[i]; total += rew; curve.append(total / t)
        return curve, n
    ucb_curve, ucb_n = run(lambda q, n, t: select(list(zip(q, n)), t, 1.4))
    rnd_curve, rnd_n = run(lambda q, n, t: r.randrange(5))
    return {"ucb": ucb_curve, "rand": rnd_curve, "ucb_n": ucb_n}
`;
const SUPERMIMIC_PY = `
def _compare(seed=0):
    r = random.Random(seed); A, B = 0.9, 0.5; calls = [0]
    def J_true(k):
        calls[0] += 1; x, c = 1.0, 0.0
        for _ in range(30):
            u = -k * x; c += x * x + 0.1 * u * u; x = A * x + B * u + r.gauss(0, 0.01)
        return c
    # 1) model-free random search on the "simulator": every candidate costs a rollout
    best_k, best = 0.0, J_true(0.0); rs = [best]
    for _ in range(59):
        k = best_k + r.gauss(0, 0.3); j = J_true(k)
        if j < best: best_k, best = k, j
        rs.append(best)
    # 2) model-based: log 60 random transitions (2 rollouts' worth), fit, then follow gradients through the model
    xs = [r.uniform(-1, 1) for _ in range(60)]; us = [r.uniform(-1, 1) for _ in range(60)]
    xn = [A * x + B * u + r.gauss(0, 0.01) for x, u in zip(xs, us)]
    a, b = fit_model(xs, us, xn)
    def J_model(k):
        x, c = 1.0, 0.0
        for _ in range(30):
            u = -k * x; c += x * x + 0.1 * u * u; x = a * x + b * u
        return c
    k = 0.0
    for _ in range(200):
        g = (J_model(k + 1e-4) - J_model(k - 1e-4)) / 2e-4
        k -= 0.02 * g
    calls[0] = 0; final = J_true(k)
    return {"random_search": rs, "model_k": k, "model_J": final, "a": a, "b": b}
`;

export const NEW_LABS = {
  async domainrand({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), sim = new Sim(mj, 'sprout');
    const worlds = toJs(py.runPython('[sample_physics(random.Random(1000 + i)) for i in range(24)]', { globals: ns }));
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const s = worlds[i];
      sim.setPhysics({ friction: s.friction, mass: s.mass });
      const r0 = rng(900 + i); sim.reset(sampleLayout(r0));
      const r = new Rollout(sim, 'red_bin', DEMO_KINDS.good.profile, r0, { record: false });
      while (!r.step());
      pts.push({ ...s, ok: r.result().metrics.success });
      if (i % 4 === 3) await new Promise((res) => setTimeout(res, 0));
    }
    sim.dispose();
    const [, g] = canvas(panel, 320, 240), X = (f) => 30 + (f - 0.3) / 1.1 * 270, Y = (m) => 215 - (m - 0.7) / 2.3 * 195;
    g.strokeStyle = '#2e3542'; g.strokeRect(30, 20, 270, 195); g.fillStyle = '#8d97a8'; g.font = '11px system-ui';
    g.fillText('friction →', 240, 234); g.save(); g.translate(12, 120); g.rotate(-Math.PI / 2); g.fillText('cube mass →', -30, 0); g.restore();
    for (const p of pts) dot(g, [X(p.friction), Y(p.mass)], p.ok ? '#4fd08a' : '#ff6b6b', 5);
    const ok = pts.filter((p) => p.ok).length;
    panel.append(note(`${ok}/24 worlds survived (green). A controller tuned for nominal physics fails where the cube is heavy and slippery. Train across these worlds and the policy learns to grip harder and move gentler.`));
    return {};
  },
  progress({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const labels = [3, 3, 3, 2, 2, 3, 3, 1, 1, 3, 3, 3, 3, 2, 3, 3];
    const p = toJs(ns.get('progress')(py.toPy(labels), 0.8));
    const c = h('canvas.chart', { style: 'height:150px' }); panel.append(note('Dense labels (each 0.5 s step), then your progress curve.'), h('.row', { style: 'gap:2px;margin-bottom:6px' }, labels.map((l) => h('span', { style: `flex:1;height:12px;border-radius:2px;background:${['', '#ff6b6b', '#ff9d3c', '#4fd08a'][l]}`, title: ['', 'failure', 'suboptimal', 'normal'][l] }))), c);
    lineChart(c, [{ data: p, color: '#6ab0ff' }], { ymin: 0, ymax: 1 });
    panel.append(note('Flat stretches are failures: no credit. Feed a curve like this to RL as a dense reward, or use the final value to filter a dataset.'));
    return {};
  },
  async segment({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), sim = new Sim(mj, 'sprout'), r0 = rng(21);
    sim.reset(sampleLayout(r0));
    const r = new Rollout(sim, 'red_bin', DEMO_KINDS.recovered.profile, r0);
    while (!r.step());
    const ep = { ...r.result(), task: 'red_bin' }; sim.dispose();
    const grip = ep.actions.map((a) => (a[3] > 0.5 ? 1 : 0)), z = ep.frames.map((f) => f[8]);
    let mine; try { mine = toJs(ns.get('segment')(py.toPy(grip), py.toPy(z), 0.05)); } catch (e) { return { tests: [['segment runs on a real episode', false, String(e.message || e).split('\n').pop()]] }; }
    const truth = trueSubtasks(ep), n = ep.frames.length;
    const [, g] = canvas(panel, 340, 120);
    const bar = (y, cuts, label) => {
      const col = ['#6ab0ff', '#ff9d3c', '#4fd08a', '#b79cff'];
      const xs = [0, ...cuts, n];
      for (let i = 0; i < xs.length - 1; i++) { g.fillStyle = col[i % 4] + 'aa'; g.fillRect(10 + 320 * xs[i] / n, y, 320 * (xs[i + 1] - xs[i]) / n - 1, 26); }
      g.fillStyle = '#e7e9ee'; g.font = '11px system-ui'; g.fillText(label, 10, y - 4);
    };
    bar(20, truth.slice(1, 4).map((s) => s.start), 'ground truth: reach · grasp · carry · release+');
    if (mine) bar(78, mine, 'your segment(): reach · grasp · carry · release+');
    // where were the earlier (missed) grasps?
    g.strokeStyle = '#ff6b6b'; grip.forEach((v, i) => { if (v && !grip[i - 1]) { g.beginPath(); g.moveTo(10 + 320 * i / n, 14); g.lineTo(10 + 320 * i / n, 108); g.stroke(); } });
    panel.append(note('Red ticks: every time the gripper closed. This demo missed its first grasp; a good segmenter ignores that.'));
    const ok = !!mine && [truth[1].start, truth[2].start, truth[3].start].every((v, i) => Math.abs(v - mine[i]) <= 1);
    return { tests: [['matches ground truth on a real MuJoCo demo with a retry', ok, `yours: ${JSON.stringify(mine)}, truth: [${truth[1].start}, ${truth[2].start}, ${truth[3].start}]`]] };
  },
  egonorm({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const r = rng(4), samples = [];
    for (let i = 0; i < 300; i++) samples.push(['hand', 0.12 + 0.06 * r.gauss()], ['robot', -0.04 + 0.02 * r.gauss()]);
    const out = toJs(ns.get('normalize_by_source')(py.toPy(samples)));
    const hist = (vals, lo, hi, bins = 30) => { const b = Array(bins).fill(0); for (const v of vals) { const k = Math.floor((v - lo) / (hi - lo) * bins); if (k >= 0 && k < bins) b[k]++; } return b; };
    const raw = (src) => samples.filter((s) => s[0] === src).map((s) => s[1]), nor = (src) => samples.map((s, i) => [s[0], out[i]]).filter((s) => s[0] === src).map((s) => s[1]);
    const c1 = h('canvas.chart', { style: 'height:110px' }), c2 = h('canvas.chart', { style: 'height:110px' });
    panel.append(note('Left-right hand position (orange) vs robot gripper (blue), raw:'), c1, note('After per-source normalization: the distributions line up, so one policy can share what it learns.'), c2);
    lineChart(c1, [{ data: hist(raw('hand'), -0.15, 0.35), color: '#ff9d3c' }, { data: hist(raw('robot'), -0.15, 0.35), color: '#6ab0ff' }], { ymin: 0 });
    lineChart(c2, [{ data: hist(nor('hand'), -3, 3), color: '#ff9d3c' }, { data: hist(nor('robot'), -3, 3), color: '#6ab0ff' }], { ymin: 0 });
    return {};
  },
  ci({ panel, ns, pyOk }) {
    if (!pyOk) return {};
    const w = ns.get('wilson'), ns_ = [5, 10, 15, 20, 30, 40, 60, 80, 100], lo = [], hi = [];
    for (const n of ns_) { const [a, b] = toJs(w(Math.round(0.8 * n), n)); lo.push(a); hi.push(b); }
    const c = h('canvas.chart', { style: 'height:150px' });
    panel.append(note('95% interval for a policy that truly succeeds 80% of the time, as trials grow (5 → 100):'), c);
    lineChart(c, [{ data: hi, color: '#4fd08a' }, { data: ns_.map(() => 0.8), color: '#59647a' }, { data: lo, color: '#ff6b6b' }], { ymin: 0.3, ymax: 1 });
    panel.append(note(`At 10 trials the interval is ${Math.round(100 * lo[1])}–${Math.round(100 * hi[1])}%. To tell 80% from 90% reliably you need on the order of a hundred paired trials.`));
    return {};
  },
  calib({ panel, ns, pyOk }) {
    if (!pyOk) return {};
    const norm = ns.get('normalize'), joints = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];
    const range = joints.map(() => [2048, 2048]), rows = [];
    const out = h('div');
    for (const [i, j] of joints.entries()) {
      const val = h('span.mono', { style: 'width:150px;text-align:right' }, '');
      const s = h('input', { type: 'range', min: 0, max: 4095, value: 2048, style: 'flex:1' });
      const upd = () => {
        const v = +s.value; range[i][0] = Math.min(range[i][0], v); range[i][1] = Math.max(range[i][1], v);
        const [mn, mx] = range[i];
        let nv = '—'; if (mx > mn) { try { nv = (+norm(v, mn, mx, j === 'gripper')).toFixed(1); } catch { nv = 'error'; } }
        val.textContent = `raw ${String(v).padStart(4)} → ${nv}`;
      };
      s.addEventListener('input', upd); upd(); rows.push(s);
      out.append(h('.row', { style: 'gap:6px;flex-wrap:nowrap;font-size:12px' }, h('span', { style: 'width:90px' }, j), s, val));
    }
    panel.append(note('1) All joints start mid-range. 2) Sweep each slider end to end: that records min/max. 3) Watch raw ticks map to −100…100 (gripper 0…100) with your function.'), out,
      h('button.small.ghost', { style: 'margin-top:6px', onclick: () => { range.forEach((r, i) => { r[0] = r[1] = +rows[i].value; }); rows.forEach((s) => s.dispatchEvent(new Event('input'))); } }, 'Reset recorded ranges'));
    return {};
  },
  async intrinsics({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const b = await cameraBench(panel), proj = ns.get('project'), fov = ns.get('focal_from_fov');
    const fMine = +fov(b.cam.fovy, IMG_H);
    let worst = 0;
    for (const name of ['red', 'blue']) for (const w of cubeCorners(b.sim, name)) {
      const c = b.cam.toCam(w), truth = b.cam.project(c), mine = toJs(proj(py.toPy(c), fMine, fMine, IMG_W / 2, IMG_H / 2));
      worst = Math.max(worst, Math.hypot(mine[0] - truth[0], mine[1] - truth[1]));
      dot(b.g, mine, name === 'red' ? '#ffd23c' : '#7af0ff', 2.5);
    }
    b.viewer.draw();
    panel.append(note(`Dots: your projections of every cube corner. Focal length: yours ${fMine.toFixed(1)} px, MuJoCo’s ${b.cam.f.toFixed(1)} px.`));
    return { tests: [['your dots land on MuJoCo’s rendered corners (within 1 px)', worst < 1, `worst error ${worst.toFixed(1)} px`]], cleanup: b.cleanup };
  },
  async extrinsics({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const b = await cameraBench(panel), inv = ns.get('invert'), tf = ns.get('transform');
    const T_cam_world = toJs(inv(py.toPy(b.cam.T_world_cam)));
    const pts = [['gripper tip', b.sim.ee(), '#ffd23c'], ['red cube', b.sim.bodyPos('red'), '#ff6b6b'], ['blue cube', b.sim.bodyPos('blue'), '#7af0ff']];
    let worst = 0;
    for (const [, w, col] of pts) {
      const mine = toJs(tf(py.toPy(T_cam_world), py.toPy(w))), truth = b.cam.toCam(w);
      worst = Math.max(worst, Math.hypot(mine[0] - truth[0], mine[1] - truth[1], mine[2] - truth[2]));
      const uv = b.cam.project(mine); dot(b.g, uv, col, 4); b.g.strokeStyle = '#000'; b.g.stroke();
    }
    b.viewer.draw();
    panel.append(note('Yellow: gripper tip; red and cyan: cube centres, all moved into the camera frame by your invert() and transform(). If they sit on the objects, your extrinsics are right.'));
    return { tests: [['world → camera with your inverse matches MuJoCo (within 1 mm)', worst < 1e-3, `worst error ${(worst * 1000).toFixed(1)} mm`]], cleanup: b.cleanup };
  },
  motors({ panel, done }) {
    const ORDER = [['gripper', 6], ['wrist_roll', 5], ['wrist_flex', 4], ['elbow_flex', 3], ['shoulder_lift', 2], ['shoulder_pan', 1]];
    const st = { stage: 'port', idx: 0, connected: new Set(), usb: true, ids: {} };
    const term = h('.term', { style: 'max-height:240px;min-height:160px' }), log = (t) => { term.textContent += t + '\n'; term.scrollTop = term.scrollHeight; };
    const motors = h('.col', { style: 'gap:4px' }), actions = h('.row', { style: 'margin-top:8px' });
    const render = () => {
      motors.replaceChildren(...ORDER.map(([m]) => h('label.check', { style: 'margin:0' },
        h('input', { type: 'checkbox', checked: st.connected.has(m), disabled: st.stage !== 'ids', onchange: (e) => { e.target.checked ? st.connected.add(m) : st.connected.delete(m); } }),
        h('span.mono', {}, m), st.ids[m] ? h('span.chip.good', {}, `id ${st.ids[m]}`) : h('span.chip', {}, 'id 1 (factory)'))));
      actions.replaceChildren(
        st.stage === 'port' ? h('button.small', { onclick: () => {
          if (st.usb) { log('$ lerobot-find-port\nFinding all available ports for the MotorBus.\n[\'/dev/ttyACM0\', \'/dev/ttyACM1\']\nRemove the USB cable from your MotorsBus and press Enter when done.'); st.usb = false; render(); }
        } }, st.usb ? 'Run lerobot-find-port' : '…') : null,
        st.stage === 'port' && !st.usb ? h('button.small', { onclick: () => { log('The port of this MotorsBus is /dev/ttyACM0\nReconnect the USB cable.\n\n$ lerobot-setup-motors --robot.type=so101_follower --robot.port=/dev/ttyACM0'); st.stage = 'ids'; prompt(); render(); } }, 'Unplug USB, press Enter') : null,
        st.stage === 'ids' ? h('button.small', { onclick: enter }, 'Press Enter') : null,
        st.stage === 'done' ? h('span.good', {}, '✓ All six motors configured. Now daisy-chain them and connect shoulder_pan to the board.') : null);
    };
    const prompt = () => log(`Connect the controller board to the '${ORDER[st.idx][0]}' motor only and press enter.`);
    function enter() {
      const [m, id] = ORDER[st.idx], c = [...st.connected];
      if (!c.length) return log('Error: no motor found on the bus. Check the power supply, the USB cable and the 3-pin cable. (Waveshare board? Jumpers on B.)');
      if (c.length > 1) return log(`Error: found ${c.length} motors on the bus. Disconnect all but '${m}': with factory IDs they all answer as id 1.`);
      if (c[0] !== m) return log(`Error: that is the '${c[0]}' motor. The script expects '${m}' now.`);
      st.ids[m] = id; st.connected.clear(); log(`'${m}' motor id set to ${id}`);
      if (++st.idx >= ORDER.length) { st.stage = 'done'; log('\nDone. You can now daisy-chain the motors.'); done?.(); } else prompt();
      render();
    }
    panel.append(note('Tick which motor is plugged into the controller board, then press Enter like you would in the terminal.'), motors, actions, term);
    render();
    return {};
  },
  bimodal({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const xs = toJs(ns.get('_samples')), mean = +ns.get('regress')(py.toPy(xs));
    const bins = Array(40).fill(0); for (const x of xs) { const k = Math.floor((x + 2) / 4 * 40); if (k >= 0 && k < 40) bins[k]++; }
    const [, g] = canvas(panel, 340, 180), mx = Math.max(...bins);
    bins.forEach((b, i) => { g.fillStyle = '#6ab0ff'; g.fillRect(10 + i * 8, 150 - 130 * b / mx, 7, 130 * b / mx); });
    const xm = 10 + (mean + 2) / 4 * 320; g.fillStyle = '#ff6b6b'; g.fillRect(xm - 1, 10, 2, 140); g.fillStyle = '#ff6b6b'; g.font = '11px system-ui'; g.fillText('regression: ' + mean.toFixed(2), xm + 4, 22);
    g.fillStyle = '#3a2630'; g.fillRect(10 + (1.75 / 4) * 320, 150, 0.5 / 4 * 320, 8); g.fillStyle = '#8d97a8'; g.fillText('obstacle', 10 + (1.75 / 4) * 320, 172);
    panel.append(note('Blue: 500 samples from your Langevin sampler. Red: the single regression answer, right into the obstacle.'));
    return {};
  },
  supermimic({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    py.runPython(SUPERMIMIC_PY, { globals: ns });
    const r = toJs(ns.get('_compare')());
    const c = h('canvas.chart', { style: 'height:140px' });
    panel.append(note('Best cost found by model-free random search, by number of simulator rollouts (lower is better):'), c);
    lineChart(c, [{ data: r.random_search, color: '#ff9d3c' }, { data: r.random_search.map(() => r.model_J), color: '#4fd08a' }]);
    panel.append(h('table', { style: 'font-size:12px' },
      h('tr', {}, h('td', {}, 'Random search on the simulator'), h('td.mono', {}, `cost ${r.random_search.at(-1).toFixed(2)} after 60 rollouts`)),
      h('tr', {}, h('td', {}, 'Gradients through your learned model'), h('td.mono.good', {}, `cost ${r.model_J.toFixed(2)} from 2 rollouts of logged data`)),
      h('tr', {}, h('td', {}, 'Your fitted model'), h('td.mono', {}, `a=${r.a.toFixed(3)}, b=${r.b.toFixed(3)} (true 0.9, 0.5)`))));
    panel.append(note('Green line: the model-based result. Same idea as SuperMimic, at toy scale: learn the dynamics once, then let gradients do the searching.'));
    return {};
  },
  ttt({ panel, ns, pyOk }) {
    if (!pyOk) return {};
    const tr = toJs(ns.get('_trace')), c = h('canvas.chart', { style: 'height:140px' });
    panel.append(note('Fast weight W over 200 streamed (k, v) pairs. Grey: the hidden rule (3).'), c);
    lineChart(c, [{ data: tr.map(() => 3), color: '#59647a' }, { data: tr, color: '#4fd08a' }], { ymin: 0, ymax: 3.5 });
    return {};
  },
  bandit({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    py.runPython(BANDIT_PY, { globals: ns });
    const r = toJs(ns.get('_bandit')(ns.get('select')));
    const c = h('canvas.chart', { style: 'height:140px' });
    panel.append(note('Average reward per pull. Green: your UCB selection. Orange: random choice. Best possible: 0.7.'), c);
    lineChart(c, [{ data: r.ucb, color: '#4fd08a' }, { data: r.rand, color: '#ff9d3c' }], { ymin: 0, ymax: 0.8 });
    panel.append(note(`Pulls per arm under UCB (true means 0.2, 0.4, 0.5, 0.55, 0.7): ${r.ucb_n.join(', ')}. It explores a little, then commits to the best.`));
    return {};
  },
};
