// Generated trajectories: synthetic demos from a world model (video model + inverse dynamics, or a world action model).
//
// HONESTY NOTE: no video model runs in your browser. A "dream" is a MuJoCo rollout of the scripted
// operator, then corrupted the way real generated videos go wrong: they ignore the instruction,
// or break physics (objects teleport or vanish). The inverse dynamics model (IDM) that labels
// pseudo-actions adds noise. The pipeline and its failure modes mirror the paper; the rates are made up.
import { Sim, rng, sampleLayout, CONTROL_DT } from './sim.js';
import { TASKS, GEOM } from './scene.js';
import { Rollout, finishEpisode, DEMO_KINDS } from './operator.js';

// Three generic families. Examples of each are named in the Academy lesson; none of them runs here.
export const WORLD_MODELS = {
  video_zero: {
    id: 'video_zero', name: 'Video world model, zero-shot (+ inverse dynamics)', lora: false, follow: 0.45, physics: 0.55, costPer: 0.08, idm: 0.2,
    note: 'An open image-to-video model that has never seen your robot. It knows physics in general, not your arm. An inverse dynamics model (IDM) guesses the actions from the frames.',
  },
  video_lora: {
    id: 'video_lora', name: 'Video world model + LoRA on your teleop (+ inverse dynamics)', lora: true, follow: 0.88, physics: 0.86, costPer: 0.08, tuneCost: 2.5, idm: 0.08,
    note: 'The same video model, fine-tuned (LoRA) on your robot’s teleop videos so it learns how this arm looks and moves. Actions still come from a separate IDM.',
  },
  wam: {
    id: 'wam', name: 'World action model (WAM), fine-tuned: frames + actions together', lora: true, follow: 0.9, physics: 0.88, costPer: 0.12, tuneCost: 3.5, idm: 0.03,
    note: 'One model predicts the future frames and the robot actions jointly, so actions agree with the video by construction (no separate IDM). Costs more to fine-tune and to sample.',
  },
};
// Older saves used model ids from before the rename.
export const WM_ALIASES = { cosmos_zero: 'video_zero', cosmos_lora: 'video_lora', wan_lora: 'video_lora' };
export const MIN_TUNE_DEMOS = 8;

// Very small "language understanding": map a prompt to one of the lab's tasks.
export function parsePrompt(text) {
  const t = text.toLowerCase();
  const red = /\bred\b/.test(t), blue = /\bblue\b/.test(t);
  if (/\bstack|on top of|on the blue\b/.test(t) && red) return 'stack';
  if (/\bbin|box|basket\b/.test(t) && red !== blue) return red ? 'red_bin' : 'blue_bin';
  return null;
}

// Generate one dream from an initial layout ("the camera snapshot") and a prompt.
export function dream(sim, layout, prompt, wm, rand) {
  const task = parsePrompt(prompt);
  let kind = 'good', act = task;
  if (!task || rand() > wm.follow) { // ignores or misreads the instruction
    kind = 'offtask';
    act = rand.pick(Object.keys(TASKS).filter((k) => k !== task));
  }
  sim.reset(layout);
  const r = new Rollout(sim, task || act, { ...DEMO_KINDS.good.profile, jitter: 0.06 }, rand, { actTask: act === task ? null : act });
  while (!r.step());
  const ep = r.result();
  // physics violations
  if (kind === 'good' && rand() > wm.physics) { kind = 'glitch'; corrupt(ep.frames, task, rand); }
  // Pseudo-actions: inferred from pixels by an IDM (video models) or predicted jointly (WAM); never perfect
  const idm = wm.idm;
  ep.actions = ep.actions.map((a) => a.map((v, i) => (i < 3 ? Math.round((v + rand.gauss() * idm) * 1e3) / 1e3 : v)));
  // the task we *asked for* is what the clip gets labelled with
  ep.task = task || 'red_bin';
  // re-score against the labelled task on the (possibly corrupted) final frame
  sim.restore(ep.frames.at(-1));
  ep.metrics.success = kind === 'good' && sim.check(ep.task).success;
  ep.metrics.wrong = kind === 'offtask';
  return { ...ep, kind, prompt };
}

function corrupt(frames, task, rand) {
  const obj = TASKS[task].obj === 'red' ? 6 : 13, n = frames.length;
  if (rand() < 0.5) { // object blinks out of existence for a moment
    const a = Math.floor(n * (0.3 + 0.3 * rand()));
    for (let i = a; i < Math.min(n, a + 10); i++) frames[i][obj + 2] = -1;
  } else { // object teleports: jumps sideways and stays there
    const a = Math.floor(n * (0.25 + 0.4 * rand())), dx = (rand() - 0.5) * 0.12, dy = 0.04 + rand() * 0.05;
    for (let i = a; i < n; i++) { frames[i][obj] += dx; frames[i][obj + 1] += dy; }
  }
}

export const dreamLayout = (seed) => sampleLayout(rng(seed));
export { CONTROL_DT, GEOM };
