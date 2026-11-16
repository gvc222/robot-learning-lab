// Subtask segmentation: ground truth from the recorded signals, plus a FLORA-style auto-labeler.
import { TASKS, GEOM } from './sim/scene.js';

export function captionsFor(task) {
  const t = TASKS[task], obj = `the ${t.obj} cube`, goal = t.goal === 'bin' ? 'the bin' : 'the blue cube';
  return [`reach for ${obj}`, `grasp ${obj}`, `carry it to ${goal}`, t.goal === 'bin' ? 'release it into the bin' : 'set it down on the blue cube', 'move back to home'];
}

// Boundaries come straight from the data: the gripper command and the object's height.
export function trueSubtasks(ep) {
  const n = ep.frames.length, grip = ep.actions.map((a) => a[3]), zi = (TASKS[ep.task].obj === 'red' ? 6 : 13) + 2;
  const z = ep.frames.map((f) => f[zi]);
  let lift = z.findIndex((v) => v > GEOM.cube + 0.03);
  if (lift < 0) return null; // never lifted: no clean segmentation
  let close = lift; while (close > 0 && grip[close - 1] > 0.5) close--;
  let release = lift; while (release < n && grip[release] > 0.5) release++;
  if (release >= n) return null;
  let home = Math.min(n - 1, release + 8);
  const cuts = [0, close, lift, release, home, n];
  const cap = captionsFor(ep.task);
  return cap.map((text, i) => ({ start: cuts[i], end: cuts[i + 1], text })).filter((s) => s.end > s.start);
}

// A vision-language labeler is good but not perfect: boundaries wobble, outcomes on partial progress are hard.
export function autoLabel(ep, rand) {
  const truth = trueSubtasks(ep);
  const subtasks = truth ? truth.map((s, i) => ({ ...s, start: i ? Math.max(0, s.start + Math.round(rand.gauss() * 2)) : 0 }))
    .map((s, i, a) => ({ ...s, end: i < a.length - 1 ? a[i + 1].start : s.end })) : [];
  const m = ep.metrics;
  let score = m.success ? 5 : truth ? 3 : 1;
  if (m.success && m.smooth < 40) score = 4;
  if (rand() < 0.1) score = Math.max(1, Math.min(5, score + (rand() < 0.5 ? -1 : 1)));
  return { subtasks, outcome: score };
}
