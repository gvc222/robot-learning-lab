// Headless check that the physics, IK and scripted operator actually work.  Run: node tests/sim.test.mjs
import loadMujoco from '../vendor/mujoco/mujoco.js';
import { Sim, rng, sampleLayout } from '../js/sim/sim.js';
import { Rollout, DEMO_KINDS, PERFECT } from '../js/sim/operator.js';

const mj = await loadMujoco();
let fail = 0;
for (const robot of ['sprout', 'longarm']) {
  const sim = new Sim(mj, robot);
  for (const task of ['red_bin', 'blue_bin', 'stack']) {
    for (const kind of process.argv[2] ? Object.keys(DEMO_KINDS) : ['good']) {
      let ok = 0, dur = 0, smooth = 0, idle = 0, wrong = 0; const N = 20; const t0 = Date.now();
      for (let i = 0; i < N; i++) {
        const rand = rng(1000 + i * 7 + task.length);
        sim.reset(sampleLayout(rand));
        const r = new Rollout(sim, task, kind === 'perfect' ? PERFECT : DEMO_KINDS[kind].profile, rand, { record: false });
        while (!r.step());
        const m = r.result().metrics;
        ok += m.success; dur += m.duration; smooth += m.smooth; idle += m.idle; wrong += m.wrong;
      }
      console.log(robot.padEnd(8), task.padEnd(9), kind.padEnd(10), `success ${ok}/${N}  wrong ${wrong}  dur ${(dur / N).toFixed(1)}s  smooth ${(smooth / N).toFixed(0)}  idle ${(idle / N).toFixed(0)}%  (${Date.now() - t0}ms)`);
      if (kind === 'good' && ok < N * 0.85) fail++;
    }
  }
  sim.dispose();
}
if (fail) { console.error('FAIL: good demos should succeed'); process.exit(1); }
console.log('ok');
