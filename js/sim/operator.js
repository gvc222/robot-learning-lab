// A scripted pick-and-place controller with tunable imperfections.
//
// It plays two roles in the lab:
//   1. the "teammates" who teleoperate extra demos for your dataset (some sloppy on purpose)
//   2. a stand-in for a trained policy. We do NOT train a neural net in your browser; instead the
//      training app turns your choices into a `profile` (noise, hesitation, confusion...) and this
//      controller acts that out in real MuJoCo physics. The physics decides success, not a dice roll.
import { CONTROL_DT, HOME } from './sim.js';
import { TASKS, GEOM } from './scene.js';

export const PERFECT = {
  percNoise: 0,     // metres of error in where it thinks things are
  jitter: 0,        // random wobble added to each action (0..1)
  pauseProb: 0,     // chance per step of freezing for a moment
  speed: 1,         // fraction of max speed it likes to move at
  wrongObj: 0,      // probability of going for the wrong cube
  earlyClose: 0,    // probability of closing the gripper too high
  retries: 2,       // how many times it re-tries a missed grasp
  chunk: 1,         // actions per inference call
  latency: 0,       // seconds per inference call
  idleStart: 0,     // steps of doing nothing at the start
  fumble: 0,        // probability of letting go of the cube mid-carry
};

const clip = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));

export class Rollout {
  constructor(sim, taskId, profile, rand, { record = true, maxSteps = 360, actTask = null } = {}) {
    Object.assign(this, { sim, taskId, rand, record, maxSteps });
    this.p = { ...PERFECT, ...profile };
    this.task = TASKS[actTask || taskId]; // what it *does*; graded against taskId
    this.phase = 0; this.phaseSteps = 0; this.steps = 0; this.pause = this.p.idleStart; this.tries = 0;
    this.noise = [0, 0, 0]; this.wait = 0; this.sinceInfer = 1e9;
    this.frames = []; this.actions = []; this.eeTrace = [];
    this.done = false; this.grip = 0;
    const other = this.task.obj === 'red' ? 'blue' : 'red';
    this.objName = rand() < this.p.wrongObj ? other : this.task.obj;
    this.confused = this.objName !== this.task.obj;
    this.perceive();
    this.closeHigh = rand() < this.p.earlyClose;
    this.fumbleAt = rand() < this.p.fumble ? 3 + Math.floor(rand() * 12) : -1;
  }

  perceive() {
    const n = this.p.percNoise, g = () => this.rand.gauss() * n;
    this.offObj = [g(), g()]; this.offGoal = [g() * 0.7, g() * 0.7];
  }

  waypoint() {
    const s = this.sim, o = s.bodyPos(this.objName), c = GEOM.cube;
    const ox = o[0] + this.offObj[0], oy = o[1] + this.offObj[1];
    let gx, gy, gz;
    if (this.task.goal === 'bin') { gx = GEOM.bin.x; gy = GEOM.bin.y; gz = 0.06; }
    else {
      const gname = this.confused ? this.task.obj : this.task.goal;
      const g = s.bodyPos(gname); gx = g[0]; gy = g[1]; gz = g[2] + 2 * c + 0.006;
    }
    gx += this.offGoal[0]; gy += this.offGoal[1];
    const hover = 0.13;
    switch (this.phase) {
      case 0: return [[ox, oy, hover], 0, 0.008];
      case 1: return [[ox, oy, this.closeHigh ? o[2] + 0.034 : o[2] + 0.002], 0, 0.006];
      case 2: return [null, 1, 0];
      case 3: return [[ox, oy, hover + 0.01], 1, 0.012];
      case 4: return [[gx, gy, hover + 0.01], 1, 0.008];
      case 5: return [[gx, gy, gz], 1, 0.006];
      case 6: return [null, 0, 0];
      case 7: return [[gx, gy, hover], 0, 0.02];
      default: return [[...HOME], 0, 0.02];
    }
  }

  advance(wp, tol) {
    const s = this.sim, ee = s.ee();
    this.phaseSteps++;
    if (wp === null) { if (this.phaseSteps >= 9) this.next(); return; }
    const err = Math.hypot(ee[0] - wp[0], ee[1] - wp[1], ee[2] - wp[2]);
    if (err < tol + 0.012 * this.p.jitter || this.phaseSteps > 110) this.next();
  }

  next() {
    const s = this.sim;
    if (this.phase === 3) {
      const lifted = s.bodyPos(this.objName)[2] > GEOM.cube + 0.03;
      if (!lifted) {
        if (this.tries++ < this.p.retries) { this.perceive(); this.offObj = this.offObj.map((v) => v * 0.5); this.closeHigh = false; this.phase = 0; this.phaseSteps = 0; return; }
        this.phase = 8; this.phaseSteps = 0; return; // give up, go home
      }
    }
    this.phase++; this.phaseSteps = 0;
    if (this.phase >= 9) this.done = true;
  }

  // one control step. returns true when the episode is over.
  step() {
    if (this.done) return true;
    const s = this.sim, p = this.p;
    let a = [0, 0, 0, this.grip];
    if (this.pause > 0) { this.pause--; }
    else if (this.wait > 0) { this.wait--; }
    else {
      const boundary = this.sinceInfer >= p.chunk;
      if (boundary) {
        // a new "inference call": re-plan, maybe change phase, draw fresh noise
        const [wp0, , tol0] = this.waypoint();
        this.advance(wp0, tol0);
        for (let k = 1; k < p.chunk && !this.done; k++) this.phaseSteps++;
        // one noise draw per inference call: longer chunks are smoother
        this.noise = [0, 1, 2].map(() => this.rand.gauss() * p.jitter / Math.sqrt(p.chunk));
        this.sinceInfer = 0;
        const stall = Math.round(p.latency / CONTROL_DT) - (p.chunk - 1);
        if (stall > 0) this.wait = stall; // robot has to wait for the model
        if (this.rand() < p.pauseProb * p.chunk) this.pause = 6 + Math.floor(this.rand() * 30);
      }
      this.sinceInfer++;
      if (!this.done) {
        const [wp, grip] = this.waypoint();
        if (this.phase === 4 && this.phaseSteps >= this.fumbleAt && this.fumbleAt >= 0) this.fumbled = true;
        this.grip = this.fumbled && this.phase < 6 ? 0 : grip;
        a[3] = this.grip;
        if (wp) {
          const v = s.robot.vmax * CONTROL_DT, t = s.target;
          const slow = this.phase === 1 || this.phase === 5 ? 0.6 : 1;
          for (let i = 0; i < 3; i++) a[i] = clip(clip((wp[i] - t[i]) / v * 0.6, -p.speed * slow, p.speed * slow) + this.noise[i]);
        }
      }
    }
    s.step(a);
    this.steps++;
    if (this.record) { this.frames.push(s.snapshot()); this.actions.push(a.map((v) => Math.round(v * 1e3) / 1e3)); }
    this.eeTrace.push(s.ee());
    if (this.steps >= this.maxSteps) this.done = true;
    return this.done;
  }

  result() { return finishEpisode(this.sim, this.taskId, this.frames, this.actions, this.eeTrace); }
}

// Metrics shared by teleop demos, teammate demos and policy rollouts.
export function finishEpisode(sim, taskId, frames, actions, eeTrace) {
  const n = eeTrace.length, check = sim.check(taskId);
  let path = 0, idle = 0, jerk = 0;
  const vel = [];
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(...[0, 1, 2].map((k) => eeTrace[i][k] - eeTrace[i - 1][k]));
    path += d; vel.push(d / CONTROL_DT);
    if (d / CONTROL_DT < 0.004) idle++;
  }
  for (let i = 1; i < vel.length; i++) jerk += Math.abs(vel[i] - vel[i - 1]);
  jerk = vel.length > 1 ? jerk / (vel.length - 1) : 0;
  // 100 = glassy smooth, 0 = shaking like a leaf
  const smooth = Math.round(100 * Math.max(0, 1 - jerk / (0.2 * sim.robot.vmax)));
  return {
    task: taskId, frames, actions,
    speed: vel.map((v) => Math.round(v * 1e3) / 1e3),
    metrics: {
      success: check.success, wrong: check.wrong,
      duration: Math.round(n * CONTROL_DT * 10) / 10,
      path: Math.round(path * 100) / 100,
      idle: Math.round(100 * idle / Math.max(1, n - 1)),
      smooth,
    },
  };
}

// Teammate teleoperators. `kind` is the hidden ground truth used to grade your data cleaning.
export const DEMO_KINDS = {
  good: { keep: true, why: 'Clean, successful demo.', profile: { percNoise: 0.002, jitter: 0.05, speed: 0.9 } },
  slow: { keep: true, why: 'Slow and careful, but it succeeds smoothly. Slow is fine: keep it.', profile: { percNoise: 0.002, jitter: 0.03, speed: 0.5 } },
  recovered: { keep: true, why: 'Missed the first grasp, then recovered. Recovery behaviour is valuable data.', profile: { percNoise: 0.004, jitter: 0.06, speed: 0.85, earlyClose: 1, retries: 2 } },
  failed: { keep: false, why: 'Never completes the task. A policy that imitates this learns to fail.', profile: { percNoise: 0.03, jitter: 0.08, retries: 0, speed: 0.9 } },
  idle: { keep: false, why: 'Operator froze for seconds at a time. Idle frames teach the policy to stall.', profile: { percNoise: 0.002, jitter: 0.05, pauseProb: 0.03, idleStart: 50, speed: 0.8 } },
  jerky: { keep: false, why: 'Shaky, erratic motion. It succeeds, but it teaches bad motion quality.', profile: { percNoise: 0.003, jitter: 0.75, speed: 1, retries: 3 } },
  wrong: { keep: false, why: 'Operator moved the wrong cube: the video does not match the task language.', profile: { percNoise: 0.002, jitter: 0.05, wrongObj: 1 } },
};

export function demoMix(n, rand) {
  // a fixed recipe per dozen (about 60% keepers), shuffled
  const dozen = ['good', 'good', 'good', 'good', 'good', 'slow', 'recovered', 'failed', 'failed', 'idle', 'jerky', 'wrong'];
  const out = [];
  for (let i = 0; i < n; i++) out.push(dozen[i % 12]);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
