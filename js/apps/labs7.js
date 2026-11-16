// Lab benches for the simulation-pipeline course: scene generation, trajectory collection, training, closed-loop rollout, offline and online evaluation.
// Everything here is the real thing: MuJoCo episodes, a network that trains in your browser, rollouts in the viewer.
import { h, lineChart } from '../util.js';
import { Sim, loadMujoco, rng, sampleLayout, CONTROL_DT } from '../sim/sim.js';
import { Viewer } from '../sim/viewer.js';
import { rawObs, expert, goodFeatures, runEpisode } from '../sim/bc.js';
import { MLP, shuffle } from '../nn.js';

const note = (t) => h('p.dim', { style: 'font-size:12px' }, t);
const toJs = (x) => (x && x.toJs ? x.toJs({ dict_converter: Object.fromEntries }) : x);
const tick = () => new Promise((r) => setTimeout(r, 0));
const clip = (v) => Math.max(-1, Math.min(1, v));
function canvas(panel, w = 340, hgt = 200) {
  const c = h('canvas', { width: w * 2, height: hgt * 2, style: `width:100%;max-width:${w}px;aspect-ratio:${w}/${hgt};background:#0a0c10;border-radius:8px;border:1px solid var(--line)` });
  panel.append(c); const g = c.getContext('2d'); g.scale(2, 2); g.font = '11px system-ui'; return [c, g];
}
export const bars = (panel, rows, max) => panel.append(h('div', { style: 'display:grid;gap:4px;margin:6px 0' }, rows.map(([l, v, col, txt]) => h('.row', { style: 'gap:8px;font-size:12.5px' },
  h('span', { style: 'width:110px' }, l), h('span', { style: `height:12px;border-radius:3px;background:${col};width:${Math.max(2, 150 * v / max)}px` }), h('b', {}, txt ?? String(v))))));

const toAct = (a) => a.map((v, i) => (i < 3 ? clip(v) : v > 0.5 ? 1 : 0));
// One episode on a given layout. `policy(o, vstep)` -> 4 numbers; `exec(a, o)` can rewrite the action that is actually executed.
export function runLayout(sim, layout, policy, { maxSteps = 260, exec = null, onStep = null } = {}) {
  sim.reset(layout); const vstep = sim.robot.vmax * CONTROL_DT;
  for (let t = 0; t < maxSteps; t++) {
    const o = rawObs(sim), a = policy(o, vstep), act = toAct(exec ? exec(a, o) : a);
    onStep?.(o, a, act); sim.step(act);
    if (sim.check('red_bin').success) return { success: true, steps: t + 1 };
  }
  return { success: false, steps: maxSteps };
}
export const layoutOf = (seed, spread = 1) => sampleLayout(rng(seed), spread);

// ---- shared, cached pieces so later lessons start fast ----
let simP = null; export const getSim = async () => (simP ||= loadMujoco().then((mj) => new Sim(mj, 'sprout')));
const demoCache = new Map();
export function demoEpisodes(sim, n, noise = 0.15) {
  const key = `${n}:${noise}`; if (demoCache.has(key)) return demoCache.get(key);
  const eps = []; for (let i = 0; i < n; i++) { const ep = []; runEpisode(sim, expert, 1000 + i, { noise, record: ep }); eps.push(ep); }
  demoCache.set(key, eps); return eps;
}
const snapshot = (net) => ({ W: net.W.map((w) => Float64Array.from(w)), b: net.b.map((b) => Float64Array.from(b)) });
const restore = (net, s) => { net.W = s.W.map((w) => Float64Array.from(w)); net.b = s.b.map((b) => Float64Array.from(b)); };
export function trainNet(episodes, { epochs = 30, hidden = 64, lr = () => 2e-3, stop = null, seed = 1, snaps = false } = {}) {
  const data = episodes.flat(), r = rng(seed), X = data.map((d) => Float64Array.from(goodFeatures(d.o))), Y = data.map((d) => Float64Array.from(d.a));
  const idx = shuffle(X.length, r), nVal = Math.max(1, Math.floor(X.length * 0.15)), val = idx.slice(0, nVal), tr = idx.slice(nVal);
  const net = new MLP([X[0].length, hidden, hidden, 4], r), curve = [], saved = [];
  for (let e = 0; e < epochs; e++) {
    const order = shuffle(tr.length, r); let loss = 0, nb = 0;
    for (let b = 0; b < order.length; b += 32) { const ids = order.slice(b, b + 32).map((i) => tr[i]); loss += net.trainBatch(ids.map((i) => X[i]), ids.map((i) => Y[i]), lr(e)); nb++; }
    curve.push([loss / nb, net.loss(val.map((i) => X[i]), val.map((i) => Y[i]))]); if (snaps) saved.push(snapshot(net));
    if (stop && stop(curve.map((c) => c[1]))) break;
  }
  return { net, curve, saved };
}
export const policyOf = (net) => (o) => Array.from(net.forward(Float64Array.from(goodFeatures(o))));
let defaultP = null;
export async function defaultPolicy(sim, onStatus) {
  if (defaultP) return defaultP;
  onStatus?.('Recording 40 expert demos and training a reference policy (once, about 40 s)…'); await tick();
  const eps = demoEpisodes(sim, 40); await tick();
  const res = trainNet(eps, { epochs: 40, snaps: true }); defaultP = { ...res, eps, policy: policyOf(res.net) }; return defaultP;
}
const successRate = (sim, policy, seeds, spread = 1, opts = {}) => seeds.reduce((k, s) => k + (runLayout(sim, layoutOf(s, spread), policy, opts).success ? 1 : 0), 0);

// A looping 3D replay of closed-loop rollouts.
function live(panel, sim, policyFor, { label = 'live rollout', h: ht = 230 } = {}) {
  const view = h('.view3d', { style: `height:${ht}px;flex:none;border-radius:8px;overflow:hidden` }, h('.hud', {}, h('span.chip', {}, label)));
  panel.append(view);
  const viewer = new Viewer(view, { cam: [0.75, -0.35, 0.5], look: [0.27, 0, 0.03] }); viewer.setSim(sim);
  let alive = true, raf, seed = 9100, steps = 0, pol = policyFor(), vstep = sim.robot.vmax * CONTROL_DT;
  sim.reset(layoutOf(seed));
  const loop = () => {
    if (!alive) return;
    const o = rawObs(sim); sim.step(toAct(pol(o, vstep))); steps++;
    if (steps > 260 || sim.check('red_bin').success) { steps = 0; seed++; sim.reset(layoutOf(seed)); pol = policyFor(); }
    viewer.draw(); raf = setTimeout(() => requestAnimationFrame(loop), CONTROL_DT * 1000 * 0.6);
  };
  loop();
  return () => { alive = false; clearTimeout(raf); viewer.dispose(); };
}

export const LABS7 = {
  async scenelab({ panel, ns }) {
    const sim = await getSim(), sample = ns.get('sample_scene'), R = ns.get('random').Random;
    const scenes = []; for (let i = 0; i < 150; i++) scenes.push(toJs(sample(R(i), Number(ns.get('SPREAD')))));
    const [, g] = canvas(panel, 340, 200); const X0 = 0.10, X1 = 0.45, Y0 = -0.10, Y1 = 0.34, sx = (x) => 10 + (x - X0) / (X1 - X0) * 320, sy = (y) => 190 - (y - Y0) / (Y1 - Y0) * 180;
    g.fillStyle = '#1b222d'; g.fillRect(10, 10, 320, 180);
    for (const s of scenes) { g.fillStyle = 'rgba(255,107,107,.7)'; g.fillRect(sx(s.red[0]) - 2, sy(s.red[1]) - 2, 4, 4); g.fillStyle = 'rgba(106,176,255,.7)'; g.fillRect(sx(s.blue[0]) - 2, sy(s.blue[1]) - 2, 4, 4); }
    g.fillStyle = '#8d97a8'; g.fillText('150 of your scenes from above: red cube, blue cube', 12, 12);
    const view = h('.view3d', { style: 'height:210px;flex:none;border-radius:8px;overflow:hidden' }, h('.hud', {}, h('span.chip#scene-chip', {}, 'scene 1')));
    panel.append(view, note('The 3D view steps through your scenes every second. Below: can the scripted expert actually solve them?'));
    const viewer = new Viewer(view, { cam: [0.75, -0.35, 0.5], look: [0.27, 0, 0.03] }); viewer.setSim(sim);
    let i = 0; const show = () => { sim.reset(scenes[i % 12]); viewer.draw(); const c = view.querySelector('#scene-chip'); if (c) c.textContent = `scene ${i % 12 + 1}`; i++; };
    show(); const iv = setInterval(show, 1000);
    const solved = scenes.slice(20, 32).reduce((k, s) => k + (runLayout(sim, s, (o, v) => expert(o, v)).success ? 1 : 0), 0);
    panel.append(h('p', { style: 'font-size:13px' }, `Expert solves ${solved}/12 of your scenes.`));
    return { tests: [['the scripted expert solves at least 10 of 12 of your scenes', solved >= 10, `${solved}/12: are some cubes unreachable or touching?`]], cleanup: () => { clearInterval(iv); viewer.dispose(); } };
  },

  async collectlab({ panel, ns }) {
    const sim = await getSim(), perturb = ns.get('perturb'), keep = ns.get('keep'), R = ns.get('random').Random, sigma = Number(ns.get('SIGMA'));
    const status = h('p', { style: 'font-size:13px' }, 'Running 16 episodes in MuJoCo…'); panel.append(status); await tick();
    const run = async (sg, userPerturb) => {
      const kept = [], cells = new Set(); let ok = 0, samples = 0;
      for (let e = 0; e < 16; e++) {
        const rn = R(4000 + e), ep = [];
        const res = runLayout(sim, layoutOf(4000 + e), (o, v) => expert(o, v), { exec: (a) => (userPerturb ? Array.from(toJs(perturb(a, rn, sg))) : a), onStep: (o, a) => { ep.push({ o, a }); cells.add(`${Math.round(o.ee[0] * 50)},${Math.round(o.ee[1] * 50)},${Math.round(o.ee[2] * 50)}`); } });
        ok += res.success ? 1 : 0; if (userPerturb ? keep(res.success, res.steps) : res.success) { kept.push(ep); samples += ep.length; }
        if (e % 4 === 3) await tick();
      }
      return { kept: kept.length, ok, samples, cells: cells.size };
    };
    const mine = await run(sigma, true), clean = await run(0, false);
    status.textContent = 'Same 16 layouts, two ways of collecting:';
    bars(panel, [['your noise, kept', mine.kept, '#4fd08a', `${mine.kept}/16 episodes · ${mine.samples} samples`], ['no noise, kept', clean.kept, '#59647a', `${clean.kept}/16 episodes · ${clean.samples} samples`]], 16);
    bars(panel, [['states covered (yours)', mine.cells, '#ff9d3c', `${mine.cells} 2 cm cells`], ['states covered (clean)', clean.cells, '#59647a', `${clean.cells} 2 cm cells`]], Math.max(mine.cells, clean.cells));
    panel.append(note(`The expert’s clean action is always the label; your noise only changes what the robot actually does. That makes the policy see (and learn to recover from) states it would otherwise never visit. Too much noise and the expert can no longer finish (${mine.ok}/16 succeed with σ = ${sigma.toFixed(2)}).`));
    return { tests: [['at least 10 of 16 noisy episodes are kept', mine.kept >= 10, `${mine.kept}/16 kept`], ['your noise visits more states than the clean expert', mine.cells > clean.cells * 1.05, `${mine.cells} vs ${clean.cells} cells`]] };
  },

  async trainlab({ panel, ns, py }) {
    const sim = await getSim(), sched = ns.get('lr_schedule'), stop = ns.get('should_stop'), best = ns.get('best_epoch');
    const base = Number(ns.get('BASE_LR')), patience = Number(ns.get('PATIENCE')), EPOCHS = 60;
    const status = h('p', { style: 'font-size:13px' }, 'Collecting 40 demos…'); panel.append(status); await tick();
    const eps = demoEpisodes(sim, 40); status.textContent = 'Training with your schedule and early stopping…'; await tick();
    const res = trainNet(eps, { epochs: EPOCHS, lr: (e) => Number(sched(e, EPOCHS, base)), stop: (v) => Boolean(stop(py.toPy(v), patience)), snaps: true });
    const val = res.curve.map((c) => c[1]), b = Number(best(py.toPy(val))); restore(res.net, res.saved[b]);
    const c = h('canvas.chart', { style: 'height:130px' }); panel.append(c);
    lineChart(c, [{ data: res.curve.map((x) => x[0]), color: '#ff9d3c' }, { data: val, color: '#6ab0ff' }], { ymin: 0 });
    const ok = successRate(sim, policyOf(res.net), [7000, 7001, 7002, 7003, 7004, 7005, 7006, 7007, 7008, 7009]);
    panel.append(h('p', { style: 'font-size:13px' }, `Stopped after ${res.curve.length} of ${EPOCHS} epochs; kept the weights from epoch ${b + 1} (validation loss ${val[b].toFixed(4)}). Success on 10 new layouts: ${ok}/10.`), note('Orange: training loss. Blue: validation loss. The learning-rate schedule is in your code; the knob moves BASE_LR.'));
    status.remove();
    const cleanup = live(panel, sim, () => policyOf(res.net), { label: 'the policy you just trained' });
    return { tests: [['training stops early and keeps the best weights', res.curve.length < EPOCHS || b < res.curve.length - 1 || val[b] <= Math.min(...val) + 1e-12, 'check should_stop / best_epoch'], ['the trained policy solves at least 8 of 10 new layouts', ok >= 8, `${ok}/10`]], cleanup };
  },

  async runlab({ panel, ns }) {
    const sim = await getSim(), status = h('p', { style: 'font-size:13px' }, 'Loading the reference policy…'); panel.append(status);
    const ref = await defaultPolicy(sim, (t) => { status.textContent = t; }); status.remove();
    const post = ns.get('postprocess'), smooth = ns.get('smooth'), alpha = Number(ns.get('ALPHA'));
    const mk = () => { let prev = [0, 0, 0]; return (o) => { const a = Array.from(toJs(post(ref.policy(o)))); prev = Array.from(toJs(smooth(prev, a.slice(0, 3), alpha))); return [...prev, a[3]]; }; };
    let okReal = 0; for (let i = 0; i < 12; i++) { const p = mk(); okReal += runLayout(sim, layoutOf(8000 + i), (o) => p(o)).success ? 1 : 0; }
    panel.append(h('p', { style: 'font-size:13px' }, `Closed loop with your post-processing (α = ${alpha.toFixed(2)}): ${okReal}/12 layouts solved.`),
      note('α = 1 trusts every new network output; small α blends in the previous action, which smooths jitter but makes the arm lag. Move the ALPHA knob and watch the rollout.'));
    const cleanup = live(panel, sim, mk, { label: `α = ${alpha.toFixed(2)}` });
    return { tests: [['the closed-loop policy solves at least 9 of 12 layouts', okReal >= 9, `${okReal}/12`]], cleanup };
  },

  async offlab({ panel, ns }) {
    const sim = await getSim(), mse = ns.get('mean_squared_error'), spear = ns.get('spearman');
    const status = h('p', { style: 'font-size:13px' }, 'Loading checkpoints…'); panel.append(status);
    const ref = await defaultPolicy(sim, (t) => { status.textContent = t; });
    status.textContent = 'Scoring five checkpoints offline (held-out data) and online (rollouts)…'; await tick();
    const test = []; for (let i = 0; i < 6; i++) { const ep = []; runEpisode(sim, expert, 5000 + i, { noise: 0.15, record: ep }); test.push(...ep); }
    const rows = []; const net = new MLP(ref.net.sizes, rng(1));
    for (const e of [0, 3, 9, 19, 39]) {
      restore(net, ref.saved[e]); const pol = policyOf(net);
      const preds = test.map((d) => pol(d.o)), targs = test.map((d) => d.a);
      const m = Number(mse(preds, targs)), ok = successRate(sim, pol, [6000, 6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6009]); rows.push([e + 1, m, ok]); await tick();
    }
    status.remove();
    panel.append(h('table', { style: 'font-size:12.5px;width:100%' }, h('tr', {}, h('th', {}, 'epoch'), h('th', {}, 'offline MSE'), h('th', {}, 'online success')), ...rows.map((r) => h('tr', {}, h('td', {}, r[0]), h('td.mono', {}, r[1].toFixed(4)), h('td', {}, `${r[2]}/10`)))));
    const rho = Number(spear(rows.map((r) => -r[1]), rows.map((r) => r[2])));
    panel.append(h('p', { style: 'font-size:13px' }, `Spearman correlation between (−MSE) and success: ${rho.toFixed(2)}.`), note('Offline error is cheap and a useful early warning, but it only roughly predicts success: errors that matter (a missed grasp) and errors that do not (jitter) weigh the same in MSE. That is why you also evaluate online.'));
    return { tests: [['your spearman() returns a correlation between −1 and 1 for these checkpoints', Number.isFinite(rho) && Math.abs(rho) <= 1.0000001, `got ${rho}`]] };
  },

  async onlinelab({ panel, ns, py }) {
    const sim = await getSim(), evaluate = ns.get('evaluate'), wilson = ns.get('wilson'), better = ns.get('significantly_better');
    const status = h('p', { style: 'font-size:13px' }, 'Training a small-data policy and loading the reference…'); panel.append(status);
    const ref = await defaultPolicy(sim, (t) => { status.textContent = t; });
    const small = trainNet(demoEpisodes(sim, 4), { epochs: 30 }), pA = policyOf(small.net), pB = ref.policy;
    const mkRollout = (pol, spread) => (seed) => runLayout(sim, layoutOf(Number(seed), spread), (o) => pol(o)).success;
    const seeds = py.toPy(Array.from({ length: 30 }, (_, i) => 20000 + i));
    status.textContent = 'Evaluating on 30 seeds each…'; await tick();
    const [kA, nA] = Array.from(toJs(evaluate(mkRollout(pA, 1), seeds))), [kB, nB] = Array.from(toJs(evaluate(mkRollout(pB, 1), seeds)));
    const [kO, nO] = Array.from(toJs(evaluate(mkRollout(pB, 1.7), seeds)));
    status.remove();
    const ci = (k, n) => Array.from(toJs(wilson(k, n))), fmt = (k, n) => { const [lo, hi] = ci(k, n); return `${k}/${n} (95% CI ${(100 * lo).toFixed(0)}–${(100 * hi).toFixed(0)}%)`; };
    const verdict = Boolean(better(kB, nB, kA, nA)), vOod = Boolean(better(kB, nB, kO, nO));
    bars(panel, [['4 demos', kA, '#ff6b6b', fmt(kA, nA)], ['40 demos', kB, '#4fd08a', fmt(kB, nB)], ['40 demos, new layouts (1.7× wider)', kO, '#ff9d3c', fmt(kO, nO)]], 30);
    panel.append(h('p', { style: 'font-size:13px' }, `40 demos vs 4 demos: ${verdict ? 'a significant difference' : 'not a significant difference'}. In-distribution vs wider layouts: ${vOod ? 'significantly worse out of distribution' : 'no significant drop'}.`),
      note('Same policy, same seeds, real MuJoCo rollouts. The interval is the honest part: with 30 rollouts you cannot tell apart policies that differ by a few points.'));
    return { tests: [['evaluate() counted every rollout', nA === 30 && nB === 30 && nO === 30, `n = ${nA}, ${nB}, ${nO}`], ['the verdicts make sense (40 demos beat 4 demos)', kB > kA ? verdict === true : true, `${kB} vs ${kA}`]] };
  },
};
