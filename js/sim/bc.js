// Behaviour cloning for real: a reactive expert picks the red cube into the bin, we record (observation, action) pairs,
// train a small MLP on them, and roll the network out in MuJoCo.
import { Sim, CONTROL_DT, rng, sampleLayout } from './sim.js';
import { GEOM } from './scene.js';
import { MLP, shuffle } from '../nn.js';

export const rawObs = (sim) => ({ ee: sim.ee(), cube: sim.bodyPos('red'), bin: [GEOM.bin.x, GEOM.bin.y, 0.1], gap: sim.fingerGap(), gapv: sim.data.qvel[4] + sim.data.qvel[5], grip: sim.grip > 0.5 ? 1 : 0 });
// The expert only looks at the current observation (no memory), so a network can imitate it exactly in principle.
export function expert(o, vstep) {
  const mv = (t, grip) => [...t.map((v, i) => Math.max(-1, Math.min(1, (v - o.ee[i]) / vstep))), grip];
  const dxy = Math.hypot(o.cube[0] - o.ee[0], o.cube[1] - o.ee[1]), dbin = Math.hypot(o.bin[0] - o.ee[0], o.bin[1] - o.ee[1]);
  const inBin = Math.hypot(o.cube[0] - o.bin[0], o.cube[1] - o.bin[1]) < 0.05 && o.cube[2] < 0.04;
  if (!o.grip) {
    if (inBin) return mv([o.ee[0], o.ee[1], 0.12], 0);
    if (dxy > 0.006) return mv([o.cube[0], o.cube[1], Math.max(o.ee[2], 0.08)], 0);
    if (o.ee[2] > o.cube[2] + 0.004) return mv([o.cube[0], o.cube[1], o.cube[2] + 0.002], 0);
    return [0, 0, 0, 1];
  }
  if (Math.abs(o.gapv) > 0.01) return [0, 0, 0, 1]; // fingers still closing
  if (o.gap < 0.03) return [0, 0, 0, 0];           // closed on nothing: open and try again
  if (dbin > 0.012) return o.ee[2] < 0.09 ? mv([o.ee[0], o.ee[1], 0.1], 1) : mv([o.bin[0], o.bin[1], 0.1], 1);
  if (o.ee[2] > 0.075) return mv([o.bin[0], o.bin[1], 0.07], 1);
  return [0, 0, 0, 0];
}
export function runEpisode(sim, policy, seed, { maxSteps = 260, noise = 0, record = null, spread = 1 } = {}) {
  const r = rng(seed); sim.reset(sampleLayout(r, spread)); const vstep = sim.robot.vmax * CONTROL_DT;
  for (let t = 0; t < maxSteps; t++) {
    const o = rawObs(sim), a = policy(o, vstep);
    if (record) record.push({ o, a: expert(o, vstep) });   // label with what the expert would do here
    const act = a.map((v, i) => (i < 3 ? Math.max(-1, Math.min(1, v + noise * r.gauss())) : v > 0.5 ? 1 : 0));
    sim.step(act);
    if (sim.check('red_bin').success) return true;
  }
  return false;
}
export function collect(sim, n, seed0 = 1000, noise = 0.15) {
  const data = []; let ok = 0;
  for (let i = 0; i < n; i++) ok += runEpisode(sim, expert, seed0 + i, { noise, record: data });
  return { data, ok };
}
// features: (rawObs) -> number[]
export function trainBC(data, features, { epochs = 30, hidden = 64, lr = 2e-3, seed = 1, onEpoch = null } = {}) {
  const r = rng(seed), X = data.map((d) => Float64Array.from(features(d.o))), Y = data.map((d) => Float64Array.from(d.a));
  const idx = shuffle(X.length, r), nVal = Math.max(1, Math.floor(X.length * 0.15)), val = idx.slice(0, nVal), tr = idx.slice(nVal);
  const net = new MLP([X[0].length, hidden, hidden, 4], r), curve = [];
  for (let e = 0; e < epochs; e++) {
    const order = shuffle(tr.length, r); let loss = 0, nb = 0;
    for (let b = 0; b < order.length; b += 32) { const ids = order.slice(b, b + 32).map((i) => tr[i]); loss += net.trainBatch(ids.map((i) => X[i]), ids.map((i) => Y[i]), lr); nb++; }
    curve.push([loss / nb, net.loss(val.map((i) => X[i]), val.map((i) => Y[i]))]); onEpoch?.(e, curve);
  }
  return { net, curve, policy: (o) => Array.from(net.forward(Float64Array.from(features(o)))) };
}
export const goodFeatures = (o) => [...o.cube.map((v, i) => (v - o.ee[i]) * 10), (o.bin[0] - o.ee[0]) * 10, (o.bin[1] - o.ee[1]) * 10, (o.ee[2] - 0.06) * 10, (o.gap - 0.04) * 30, o.gapv * 10, o.grip];
export { Sim };
