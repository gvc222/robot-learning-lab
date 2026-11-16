// The model zoo and the "pretend" parts of the lab.
//
// HONESTY NOTE: nothing in this file is a real neural network. Training here is a hand-written
// formula that turns (model, dataset, hyper-parameters) into a `skill` number, and a skill number
// into behaviour quirks for the scripted controller in sim/operator.js. The *direction* of every
// effect follows published results (cited inline); the exact numbers are invented for teaching.

// The architecture list mirrors the policies shipped in Hugging Face LeRobot (src/lerobot/policies).
export const MODELS = {
  act: {
    id: 'act', name: 'ACT', full: 'Action Chunking Transformer (Zhao et al., 2023)', params: '~80M', family: 'imitation',
    blurb: 'Small transformer trained from scratch on your demos, predicting chunks of future actions. No language input. Cheap and smooth, hungry for clean demos.',
    lang: false, nHalf: 14, ceiling: 0.97, robust: 0.3, visual: 0.5, multi: 0.5,
    stepsNeeded: 30000, lrBest: 1e-5, costPerK: 0.02, vramTrain: 6, vramInfer: 2, latency: 0.02,
  },
  diffusion: {
    id: 'diffusion', name: 'Diffusion Policy', full: 'Diffusion Policy (Chi et al., 2023)', params: '~250M', family: 'imitation',
    blurb: 'Generates action sequences by denoising noise. Handles demos where people solve the task in different ways. Slower inference (10 denoising steps).',
    lang: false, nHalf: 16, ceiling: 0.97, robust: 0.35, visual: 0.55, multi: 0.95,
    stepsNeeded: 60000, lrBest: 1e-4, costPerK: 0.03, vramTrain: 8, vramInfer: 3, latency: 0.1,
  },
  vqbet: {
    id: 'vqbet', name: 'VQ-BeT', full: 'Vector-Quantized Behavior Transformer (Lee et al., 2024)', params: '~40M', family: 'imitation',
    blurb: 'Turns actions into a small vocabulary of discrete codes, then predicts codes like a language model. Light and fast; a bit less precise.',
    lang: false, nHalf: 18, ceiling: 0.92, robust: 0.3, visual: 0.5, multi: 0.85,
    stepsNeeded: 40000, lrBest: 1e-4, costPerK: 0.015, vramTrain: 4, vramInfer: 1, latency: 0.015,
  },
  smolvla: {
    id: 'smolvla', name: 'SmolVLA', full: 'SmolVLA (Shukor et al., 2025)', params: '~450M', family: 'vla',
    blurb: 'Compact pretrained vision-language-action model. Reads the task language, needs fewer demos than ACT, fits on a laptop GPU.',
    lang: true, nHalf: 9, ceiling: 0.96, robust: 0.65, visual: 0.8, multi: 0.9,
    stepsNeeded: 15000, lrBest: 1e-4, costPerK: 0.07, vramTrain: 14, vramInfer: 4, latency: 0.09,
  },
  pi0: {
    id: 'pi0', name: 'π0', full: 'π0 flow-matching VLA (Black et al., 2024)', params: '~3.3B', family: 'vla',
    blurb: 'Large pretrained VLA with a flow-matching action expert. Strong few-shot learner, heavy on memory.',
    lang: true, nHalf: 5, ceiling: 0.96, robust: 0.8, visual: 0.9, multi: 0.95,
    stepsNeeded: 8000, lrBest: 2.5e-5, costPerK: 0.42, vramTrain: 40, vramInfer: 9, latency: 0.18,
  },
  pi0fast: {
    id: 'pi0fast', name: 'π0-FAST', full: 'π0 with FAST action tokenization (Pertsch et al., 2025)', params: '~3B', family: 'vla',
    blurb: 'Same backbone as π0 but predicts compressed action tokens autoregressively. Trains faster; decoding tokens one by one is slower at run time.',
    lang: true, nHalf: 5, ceiling: 0.95, robust: 0.78, visual: 0.9, multi: 0.85,
    stepsNeeded: 5000, lrBest: 2.5e-5, costPerK: 0.4, vramTrain: 38, vramInfer: 9, latency: 0.32,
  },
  pi05: {
    id: 'pi05', name: 'π0.5', full: 'π0.5 open-world VLA (Physical Intelligence, 2025)', params: '~3B', family: 'vla',
    blurb: 'Large generalist VLA co-trained on web and robot data. Best few-shot learner and most robust to new layouts; heavy and slow.',
    lang: true, nHalf: 4, ceiling: 0.97, robust: 0.88, visual: 0.95, multi: 0.95,
    stepsNeeded: 6000, lrBest: 2.5e-5, costPerK: 0.45, vramTrain: 40, vramInfer: 9, latency: 0.2,
  },
  groot: {
    id: 'groot', name: 'GR00T N1.7', full: 'NVIDIA GR00T N1.x generalist model', params: '~3B', family: 'vla',
    blurb: 'NVIDIA’s open generalist robot model: a VLM “slow” system plus a diffusion-transformer “fast” action head. Pretrained with human egocentric video.',
    lang: true, nHalf: 5, ceiling: 0.96, robust: 0.85, visual: 0.92, multi: 0.95,
    stepsNeeded: 7000, lrBest: 1e-4, costPerK: 0.38, vramTrain: 36, vramInfer: 8, latency: 0.12, egoNative: true,
  },
  fastwam: {
    id: 'fastwam', name: 'Fast-WAM', full: 'Fast World Action Model (Yuan et al., 2026)', params: 'video backbone (billions)', family: 'wam',
    blurb: 'World action model: trained to predict future video and actions together, but skips imagining video at run time. Strong generalization; needs a big GPU to train.',
    lang: true, nHalf: 5, ceiling: 0.96, robust: 0.9, visual: 0.93, multi: 0.95,
    stepsNeeded: 8000, lrBest: 5e-5, costPerK: 0.6, vramTrain: 64, vramInfer: 12, latency: 0.15, egoNative: true,
  },
};

export const GPUS = {
  rtx4090: { id: 'rtx4090', name: 'RTX 4090 workstation (24 GB)', vram: 24, speed: 1, rate: 1 },
  a100: { id: 'a100', name: 'A100 cloud node (80 GB)', vram: 80, speed: 1.5, rate: 3 },
};

export const LANG_LEVELS = {
  task: { id: 'task', name: 'Task label only', note: 'One sentence per episode, e.g. “put the red cube in the bin”.' },
  subtask: { id: 'subtask', name: '+ timestamped subtask captions', note: 'Each phase of the episode gets its own caption (needs annotations).' },
  dense: { id: 'dense', name: '+ dense multi-aspect captions', note: 'Motion, scene, arm-pose and reasoning captions per phase (DeMiAn-style; needs annotations).' },
};

export const DEFAULT_CFG = { steps: 20000, lr: 1e-4, batch: 8, gpu: 'rtx4090', lora: false, lang: 'task', ego: false, dr: false };

// What kind of demo is this, really? Teammate demos and dreams carry a hidden `kind`; yours are judged from metrics.
export function truthOf(ep) {
  const m = ep.metrics;
  if (ep.source === 'dream') return ep.kind; // 'good' | 'glitch' | 'offtask'
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
  const per = {}, kinds = { failed: 0, idle: 0, jerky: 0, wrong: 0, glitch: 0, offtask: 0 };
  let total = 0, good = 0, own = 0, dreams = 0, annotated = 0;
  for (const t of tasks) per[t] = { good: 0, total: 0, dream: 0 };
  for (const ep of episodes) {
    if (ep.robot !== robot || ep.label === 'discard' || !per[ep.task]) continue;
    const k = truthOf(ep);
    total++; per[ep.task].total++;
    if (ep.source === 'you') own++;
    if (ep.subtasks?.length) annotated++;
    if (ep.source === 'dream') { dreams++; if (k === 'good') per[ep.task].dream++; else kinds[k]++; continue; }
    if (KEEPERS.has(k)) { good++; per[ep.task].good++; } else kinds[k]++;
  }
  return { per, kinds, total, good, own, dreams, annotated, bad: total - good - Object.values(per).reduce((a, p) => a + p.dream, 0) };
}

// The training formula. Returns everything the UI and the eval need.
export function trainPolicy(modelId, cfg, stats, tasks, seed = 1) {
  cfg = { ...DEFAULT_CFG, ...cfg };
  const m = MODELS[modelId], gpu = GPUS[cfg.gpu];
  const frac = (k) => (stats.total ? stats.kinds[k] / stats.total : 0);
  const extra = (cfg.dr ? 1.2 : 1) * (cfg.ego && !m.egoNative ? 1.25 : 1);
  const vram = Math.round((m.vramTrain * (0.55 + 0.45 * cfg.batch / 8)) * (cfg.lora ? 0.5 : 1));
  const gpuHours = Math.round(cfg.steps / 1000 * m.costPerK * (cfg.batch / 8) * (cfg.lora ? 0.7 : 1) * extra / gpu.speed * gpu.rate * 10) / 10;
  const out = { modelId, cfg, tasks, stats, vram, gpuHours, vramInfer: m.vramInfer, latency: m.latency, skill: {}, share: {}, dr: cfg.dr, ego: cfg.ego || !!m.egoNative };
  if (vram > gpu.vram) return { ...out, error: 'oom', gpuHours: 0 };
  if (stats.total < 2) return { ...out, error: 'nodata', gpuHours: 0 };

  const lrDev = Math.log10(cfg.lr / m.lrBest);
  const diverged = lrDev > 0.95;
  const lrTerm = diverged ? 0.05 : Math.exp(-1.1 * lrDev * lrDev);
  const fit = 1 - Math.exp(-3.2 * cfg.steps / m.stepsNeeded);
  const overfit = cfg.steps > 2.5 * m.stepsNeeded && stats.good < m.nHalf * 1.5 ? 0.9 : 1;
  const batchTerm = cfg.batch < 4 ? 0.93 : 1;
  // Egocentric pretraining: better data efficiency and much better out-of-distribution robustness
  // (EgoMimic, Kareer et al. 2024; HumanScale, Ma et al. 2026).
  const ego = out.ego && m.lang;
  const nHalf = m.nHalf * (ego ? 0.8 : 1);
  // Bad data hurts: each kind of bad demo costs skill and leaves its own fingerprint (below).
  const dirt = Math.max(0.1, 1 - 1.3 * frac('failed') - 0.8 * (frac('wrong') + frac('offtask')) - 0.5 * frac('idle')
    - 0.5 * (1 - 0.5 * m.multi) * frac('jerky') - 0.9 * frac('glitch'));
  // Language density helps language-conditioned models: DeMiAn (Kim et al. 2026) reports ~+5 pts average
  // success from dense re-annotation of the *same* demos. Only the annotated fraction counts.
  const coverage = stats.total ? stats.annotated / stats.total : 0;
  const langBoost = m.lang ? 1 + coverage * ({ task: 0, subtask: 0.04, dense: 0.07 }[cfg.lang] || 0) : 1;
  for (const t of tasks) {
    const nTask = stats.per[t].good;
    const nOther = stats.good - nTask;
    // Neural trajectories from a world model count, but less than real demos (DreamGen, Jang et al. 2025).
    const nDream = stats.per[t].dream;
    const nEff = nTask + 0.5 * nDream + (m.lang ? 0.35 * nOther : 0);
    const dataTerm = 1 - Math.exp(-1.6 * nEff / nHalf);
    out.skill[t] = Math.min(0.99, Math.max(0, m.ceiling * dataTerm * dirt * fit * lrTerm * overfit * batchTerm
      * (cfg.lora ? 0.96 : 1) * (cfg.dr ? 0.98 : 1) * langBoost));
    // A policy without language cannot tell tasks apart: it does whatever the data did most.
    out.share[t] = m.lang ? 1 : stats.per[t].total / Math.max(1, stats.total);
  }
  out.motion = Math.max(0, 1 - 1.6 * (1 - 0.5 * m.multi) * frac('jerky') - 0.6 * frac('glitch'));
  out.stall = frac('idle');
  out.confusion = Math.min(0.9, 0.9 * (frac('wrong') + frac('offtask')) * (m.lang && cfg.lang !== 'task' ? 0.6 : 1));
  out.diverged = diverged;
  out.robust = Math.min(0.97, m.robust + (ego ? 0.12 : 0));
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

// How far eval physics is from what the policy trained on (0 = identical).
export function physicsGap(ev) {
  const f = Math.abs(Math.log(ev.friction ?? 1)), w = Math.abs(Math.log(ev.mass ?? 1));
  return f + 0.6 * w + (ev.sim2real ? 0.35 : 0);
}

// Turn a trained policy + eval settings into controller quirks for one rollout.
export function rolloutSetup(policy, taskId, ev, rand) {
  const m = MODELS[policy.modelId];
  const robust = policy.robust ?? m.robust;
  const trained = policy.tasks.includes(taskId);
  let s = trained ? policy.skill[taskId] : (m.lang ? 0.25 * Math.max(...Object.values(policy.skill)) : 0);
  s *= Math.max(0, 1 - (1 - robust) * (ev.spread - 1) * 1.3);
  if (ev.visual) s *= m.visual;
  s *= Math.max(0.6, 1 - Math.max(0, ev.chunk - 20) / 100); // long open-loop chunks drift
  // A policy that only ever saw nominal physics is thrown off by different friction/mass (domain randomization helps).
  s *= Math.max(0.2, 1 - (policy.dr ? 0.15 : 0.55) * physicsGap(ev));
  const profile = {
    percNoise: 0.04 * Math.pow(1 - s, 1.3) + (ev.sim2real ? 0.004 : 0),
    fumble: 0.55 * (1 - s),
    jitter: 0.04 + 0.7 * (1 - policy.motion) + 0.55 * (1 - s),
    pauseProb: 0.035 * policy.stall + 0.01 * (1 - s),
    idleStart: Math.round(40 * policy.stall),
    speed: Math.min(ev.speed, 0.55 + 0.45 * s),
    wrongObj: policy.confusion,
    earlyClose: 0.35 * (1 - s),
    retries: s > 0.9 ? 2 : s > 0.65 ? 1 : 0,
    chunk: ev.chunk, latency: m.latency + (ev.sim2real ? 0.05 : 0),
    carry: policy.dr ? 0.55 : 1, // learned across heavy, slippery worlds: moves gently while holding things
  };
  // non-language policy trained on several tasks: sometimes does the other task entirely
  let actTask = null;
  if (trained && rand() > policy.share[taskId]) {
    const others = policy.tasks.filter((t) => t !== taskId);
    if (others.length) actTask = rand.pick(others);
  } else if (!trained && !m.lang && policy.tasks.length) actTask = rand.pick(policy.tasks);
  return { profile, actTask, skill: s };
}

// RL fine-tuning step (in the spirit of HIL-SERL / RL post-training): given rollout outcomes judged by a
// reward model, raise skill on the practised task. Mislabelled outcomes teach the wrong lesson.
export function rlUpdate(policy, taskId, outcomes, interventions) {
  const p = structuredClone(policy);
  const correct = outcomes.filter((o) => o.label === o.truth).length, wrongL = outcomes.length - correct;
  const s0 = p.skill[taskId] ?? 0;
  const gain = (0.012 * correct - 0.02 * wrongL) * (1 + 0.6 * Math.min(1, interventions / 10));
  p.skill[taskId] = Math.min(0.99, Math.max(0, s0 + (1 - s0) * Math.max(-0.2, Math.min(0.6, gain))));
  p.motion = Math.min(1, p.motion + 0.02 * correct / Math.max(1, outcomes.length));
  return p;
}

// "Lab reference checkpoints": one of each architecture, trained on a clean in-house dataset,
// so the eval workbench has something to compare from day one.
export function referenceCheckpoints(robot = 'sprout') {
  const tasks = ['red_bin', 'blue_bin', 'stack'];
  const stats = { per: {}, kinds: { failed: 0, idle: 0, jerky: 0, wrong: 0, glitch: 0, offtask: 0 }, total: 60, good: 60, own: 0, dreams: 0, annotated: 0, bad: 0 };
  for (const t of tasks) stats.per[t] = { good: 20, total: 20, dream: 0 };
  return Object.values(MODELS).map((m) => {
    const cfg = { steps: m.stepsNeeded * 1.5, lr: m.lrBest, batch: 8, gpu: m.vramTrain > 24 ? 'a100' : 'rtx4090', lora: false, lang: 'task', ego: false, dr: false };
    return { ...trainPolicy(m.id, cfg, stats, tasks, 11), curve: null, name: `lab/${m.id}-ref`, robot, reference: true, n: 60 };
  });
}

// Statistics helpers used by the eval workbench (and taught in the Academy).
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
// Exact two-sided McNemar test on paired trials (same seeds): b = A wins, c = B wins.
export function mcnemar(b, c) {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  let tail = 0, coef = 1;
  for (let i = 0; i <= k; i++) { if (i > 0) coef = coef * (n - i + 1) / i; tail += coef; }
  return Math.min(1, 2 * tail / Math.pow(2, n));
}
