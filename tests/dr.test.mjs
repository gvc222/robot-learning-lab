// Does domain randomization help under shifted physics, in real rollouts?  Run: node tests/dr.test.mjs
import loadMujoco from '../vendor/mujoco/mujoco.js';
import { Sim, rng, sampleLayout } from '../js/sim/sim.js';
import { Rollout } from '../js/sim/operator.js';
import { rolloutSetup } from '../js/models.js';
const mj = await loadMujoco(), sim = new Sim(mj, 'sprout');
const pol = (dr) => ({ modelId: 'smolvla', tasks: ['red_bin'], skill: { red_bin: 0.92 * (dr ? 0.98 : 1) }, share: { red_bin: 1 }, motion: 1, stall: 0, confusion: 0, dr });
for (const [f, m] of [[1, 1], [0.5, 2.2]]) {
  const ev = { spread: 1, visual: false, chunk: 10, speed: 1, friction: f, mass: m };
  sim.setPhysics({ friction: f, mass: m });
  const row = [];
  for (const dr of [false, true]) {
    let ok = 0, t = 0;
    for (let i = 0; i < 20; i++) { const r0 = rng(300 + i); sim.reset(sampleLayout(r0)); const { profile } = rolloutSetup(pol(dr), 'red_bin', ev, r0); const r = new Rollout(sim, 'red_bin', profile, r0, { record: false }); while (!r.step()); const mm = r.result().metrics; ok += mm.success; t += mm.duration; }
    row.push(`${dr ? 'DR' : 'no DR'} ${ok}/20 ${(t / 20).toFixed(1)}s`);
  }
  console.log(`friction ${f} mass ${m}: ${row.join(' | ')}`);
}
