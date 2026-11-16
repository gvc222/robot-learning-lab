// The model zoo and the "pretend" parts of the lab.
//
// HONESTY NOTE: nothing in this file is a real neural network. Training here is a hand-written
// formula that turns (model, dataset, hyper-parameters) into a `skill` number, and a skill number
// into behaviour quirks for the scripted controller in sim/operator.js. The trends are meant to
// match the folklore of robot learning (clean data matters, pretrained VLAs need fewer demos,
// big models cost GPU and latency) but the exact numbers are invented for teaching.

export const MODELS = {
  act: {
    id: 'act', name: 'ACT', full: 'Action Chunking Transformer', params: '~80M',
    blurb: 'Small transformer trained from scratch on your demos. No language input: it learns one behaviour. Cheap, fast, smooth, but hungry for clean demos.',
    lang: false, nHalf: 14, ceiling: 0.97, robust: 0.3, visual: 0.5,
    stepsNeeded: 30000, lrBest: 1e-5, costPerK: 0.02, vramTrain: 6, vramInfer: 2, latency: 0.02,
  },
  smolvla: {
    id: 'smolvla', name: 'SmolVLA', full: 'SmolVLA (compact vision-language-action)', params: '~450M',
    blurb: 'Compact pretrained VLA. Reads the task language, needs fewer demos than ACT, fits on a laptop GPU.',
    lang: true, nHalf: 9, ceiling: 0.96, robust: 0.65, visual: 0.8,
    stepsNeeded: 15000, lrBest: 1e-4, costPerK: 0.07, vramTrain: 14, vramInfer: 4, latency: 0.09,
  },
  pi05: {
    id: 'pi05', name: 'π0.5', full: 'π0.5 (large generalist VLA)', params: '~3B',
    blurb: 'Large generalist VLA. Best few-shot learner and most robust to new layouts, but heavy: lots of VRAM and slow inference.',
    lang: true, nHalf: 4, ceiling: 0.97, robust: 0.88, visual: 0.95,
    stepsNeeded: 6000, lrBest: 2.5e-5, costPerK: 0.45, vramTrain: 40, vramInfer: 9, latency: 0.2,
  },
};

export const GPUS = {
  rtx4090: { id: 'rtx4090', name: 'RTX 4090 workstation (24 GB)', vram: 24, speed: 1, rate: 1 },
  a100: { id: 'a100', name: 'A100 cloud node (80 GB)', vram: 80, speed: 1.5, rate: 3 },
};

export const DEFAULT_CFG = { steps: 20000, lr: 1e-4, batch: 8, gpu: 'rtx4090', lora: false };

// What kind of demo is this, really? Teammate demos carry a hidden `kind`; yours are judged from metrics.
export function truthOf(ep) {
  const m = ep.metrics;
  if (ep.kind) {
    if (m.wrong && !m.success) return 'wrong';
    if (!m.success) return 'failed';
    if (ep.kind === 'failed' || ep.kind === 'wrong') return 'good';
    return ep.kind;
  }
  if (m.wrong && !m.success) return 'wrong';
  if (!m.success) return 'failed';
  if (m.idle > 38) return 'idle';
  if (m.smooth < 38) return 'jerky';
  return 'good';
}
const KEEPERS = new Set(['good', 'slow', 'recovered']);
export const isKeeper = (ep) => KEEPERS.has(truthOf(ep));

// Summarise the episodes that will go into training (everything not explicitly discarded).
export function datasetStats(episodes, robot, tasks) {
  const per = {}, kinds = { failed: 0, idle: 0, jerky: 0, wrong: 0 };
  let total = 0, good = 0, own = 0;
  for (const t of tasks) per[t] = { good: 0, total: 0 };
  for (const ep of episodes) {
    if (ep.robot !== robot || ep.label === 'discard' || !per[ep.task]) continue;
    const k = truthOf(ep);
    total++; per[ep.task].total++;
    if (ep.source === 'you') own++;
    if (KEEPERS.has(k)) { good++; per[ep.task].good++; } else kinds[k]++;
  }
  return { per, kinds, total, good, own, bad: total - good };
}

// The training formula. Returns everything the UI and the eval need.
export function trainPolicy(modelId, cfg, stats, tasks, seed = 1) {
  const m = MODELS[modelId], gpu = GPUS[cfg.gpu];
  const frac = (k) => (stats.total ? stats.kinds[k] / stats.total : 0);
  const vram = Math.round((m.vramTrain * (0.55 + 0.45 * cfg.batch / 8)) * (cfg.lora ? 0.5 : 1));
  const gpuHours = Math.round(cfg.steps / 1000 * m.costPerK * (cfg.batch / 8) * (cfg.lora ? 0.7 : 1) / gpu.speed * gpu.rate * 10) / 10;
  const out = { modelId, cfg, tasks, stats, vram, gpuHours, vramInfer: m.vramInfer, latency: m.latency, skill: {}, share: {} };
  if (vram > gpu.vram) return { ...out, error: 'oom', gpuHours: 0 };
  if (stats.total < 2) return { ...out, error: 'nodata', gpuHours: 0 };

  const lrDev = Math.log10(cfg.lr / m.lrBest);
  const diverged = lrDev > 0.95;
  const lrTerm = diverged ? 0.05 : Math.exp(-1.1 * lrDev * lrDev);
  const fit = 1 - Math.exp(-3.2 * cfg.steps / m.stepsNeeded);
  const overfit = cfg.steps > 2.5 * m.stepsNeeded && stats.good < m.nHalf * 1.5 ? 0.9 : 1;
  const batchTerm = cfg.batch < 4 ? 0.93 : 1;
  // every kind of bad demo costs skill; each also leaves its own fingerprint (below)
  const dirt = Math.max(0.1, 1 - 1.3 * frac('failed') - 0.8 * frac('wrong') - 0.5 * frac('idle') - 0.5 * frac('jerky'));
  for (const t of tasks) {
    const nTask = stats.per[t].good;
    const nOther = stats.good - nTask;
    const nEff = nTask + (m.lang ? 0.35 * nOther : 0);
    const dataTerm = 1 - Math.exp(-1.6 * nEff / m.nHalf);
    out.skill[t] = Math.max(0, m.ceiling * dataTerm * dirt * fit * lrTerm * overfit * batchTerm * (cfg.lora ? 0.96 : 1));
    // A policy without language cannot tell tasks apart: it does whatever the data did most.
    out.share[t] = m.lang ? 1 : stats.per[t].total / Math.max(1, stats.total);
  }
  out.motion = Math.max(0, 1 - 1.6 * frac('jerky'));
  out.stall = frac('idle');
  out.confusion = Math.min(0.9, 0.9 * frac('wrong'));
  out.diverged = diverged;
  const mean = tasks.reduce((a, t) => a + out.skill[t], 0) / tasks.length;
  // offline numbers: lower is better
  out.valErr = Math.round((0.004 + 0.06 * (1 - mean) + 0.03 * frac('jerky') + (overfit < 1 ? 0.012 : 0)) * 1e4) / 1e4;
  out.curve = lossCurve(cfg.steps, mean, diverged, overfit < 1, seed);
  return out;
}

function lossCurve(steps, skill, diverged, overfit, seed) {
  const n = 60, train = [], val = [];
  let s = seed * 9301 + 49297;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 - 0.5; };
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    if (diverged) { const v = 0.5 + x * x * 6 + r() * 0.4; train.push(v); val.push(v * 1.1); continue; }
    const floor = 0.02 + 0.25 * (1 - skill);
    const t = floor + (1 - floor) * Math.exp(-6 * x) + r() * 0.02;
    let v = floor * 1.25 + (1 - floor) * Math.exp(-5.5 * x) + r() * 0.025;
    if (overfit) { v += Math.max(0, x - 0.4) * 0.25; }
    train.push(Math.max(0.005, t * (overfit ? 1 - 0.5 * x : 1))); val.push(Math.max(0.01, v));
  }
  return { train, val, steps };
}

// Turn a trained policy + eval settings into controller quirks for one rollout.
export function rolloutSetup(policy, taskId, ev, rand) {
  const m = MODELS[policy.modelId];
  const trained = policy.tasks.includes(taskId);
  let s = trained ? policy.skill[taskId] : (m.lang ? 0.25 * Math.max(...Object.values(policy.skill)) : 0);
  s *= Math.max(0, 1 - (1 - m.robust) * (ev.spread - 1) * 1.3);
  if (ev.visual) s *= m.visual;
  s *= Math.max(0.6, 1 - Math.max(0, ev.chunk - 20) / 100); // long open-loop chunks drift
  const profile = {
    percNoise: 0.04 * Math.pow(1 - s, 1.3),
    fumble: 0.55 * (1 - s),
    jitter: 0.04 + 0.7 * (1 - policy.motion) + 0.55 * (1 - s),
    pauseProb: 0.035 * policy.stall + 0.01 * (1 - s),
    idleStart: Math.round(40 * policy.stall),
    speed: Math.min(ev.speed, 0.55 + 0.45 * s),
    wrongObj: policy.confusion,
    earlyClose: 0.35 * (1 - s),
    retries: s > 0.9 ? 2 : s > 0.65 ? 1 : 0,
    chunk: ev.chunk, latency: m.latency,
  };
  // non-language policy trained on several tasks: sometimes does the other task entirely
  let actTask = null;
  if (trained && rand() > policy.share[taskId]) {
    const others = policy.tasks.filter((t) => t !== taskId);
    if (others.length) actTask = rand.pick(others);
  } else if (!trained && !m.lang && policy.tasks.length) actTask = rand.pick(policy.tasks);
  return { profile, actTask, skill: s };
}
