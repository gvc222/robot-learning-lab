// Calibration check: does "skill" turn into sensible success rates in real physics?
import loadMujoco from '../vendor/mujoco/mujoco.js';
import { Sim, rng, sampleLayout } from '../js/sim/sim.js';
import { Rollout } from '../js/sim/operator.js';
import { rolloutSetup, MODELS } from '../js/models.js';
const mj = await loadMujoco();
const ev = { spread: 1, visual: false, chunk: 10, speed: 1 };
for (const robot of ['sprout', 'longarm']) {
  const sim = new Sim(mj, robot);
  for (const modelId of ['act']) for (const task of ['red_bin', 'stack']) {
    let line = `${robot} ${modelId} ${task}: `;
    for (const skill of [0.4, 0.6, 0.8, 0.9, 0.97]) {
      const policy = { modelId, tasks: [task], skill: { [task]: skill }, share: { [task]: 1 }, motion: 1, stall: 0, confusion: 0 };
      let ok = 0, dur = 0, sm = 0; const N = 20;
      for (let i = 0; i < N; i++) {
        const rand = rng(77 + i * 13);
        sim.reset(sampleLayout(rand, ev.spread));
        const { profile, actTask } = rolloutSetup(policy, task, ev, rand);
        const r = new Rollout(sim, task, profile, rand, { record: false, actTask });
        while (!r.step());
        const m = r.result().metrics; ok += m.success; dur += m.duration; sm += m.smooth;
      }
      line += `s${skill}=${Math.round(100 * ok / N)}% ${(dur / N).toFixed(1)}s q${Math.round(sm / N)} | `;
    }
    console.log(line);
  }
  sim.dispose();
}
