// Thin wrapper around the official MuJoCo WASM bindings.
// Works in the browser and in Node (see tests/sim.test.mjs).
import { buildXML, ROBOTS, GEOM, TASKS } from './scene.js';

export const CONTROL_DT = 0.05; // 20 Hz control
export const HOME = [0.22, 0.0, 0.16];

// Small seeded RNG so episodes are reproducible.
export function rng(seed) {
  // scramble the seed so that nearby seeds give unrelated streams
  let s = (Math.imul((seed >>> 0) ^ 0x9e3779b9, 2654435761) >>> 0) || 1;
  const f = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  f.range = (a, b) => a + (b - a) * f();
  f.gauss = () => Math.sqrt(-2 * Math.log(f() + 1e-12)) * Math.cos(2 * Math.PI * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  for (let i = 0; i < 8; i++) f();
  return f;
}

export function sampleLayout(rand, spread = 1) {
  // spread 1 = the training distribution. >1 pushes cubes outside it (out-of-distribution).
  const { spawn } = GEOM;
  const cx = (spawn.x[0] + spawn.x[1]) / 2, cy = (spawn.y[0] + spawn.y[1]) / 2;
  const hx = (spawn.x[1] - spawn.x[0]) / 2 * spread, hy = (spawn.y[1] - spawn.y[0]) / 2 * spread;
  const one = () => [
    Math.min(0.38, Math.max(0.17, cx + rand.range(-hx, hx))),
    Math.min(0.26, Math.max(-0.02, cy + rand.range(-hy, hy))),
    rand.range(-0.5, 0.5),
  ];
  let red = one(), blue = one(), n = 0;
  while (Math.hypot(red[0] - blue[0], red[1] - blue[1]) < 0.075 && n++ < 50) blue = one();
  return { red, blue };
}

export class Sim {
  constructor(mujoco, robotId = 'sprout', xml = null) {
    this.mj = mujoco;
    this.robot = ROBOTS[robotId];
    this.model = mujoco.MjModel.from_xml_string(xml || buildXML(robotId));
    this.data = new mujoco.MjData(this.model);
    const id = (type, name) => mujoco.mj_name2id(this.model, mujoco.mjtObj[type].value, name);
    this.ids = {
      tcp: id('mjOBJ_SITE', 'tcp'),
      red: id('mjOBJ_BODY', 'red'), blue: id('mjOBJ_BODY', 'blue'),
    };
    this.nsub = Math.round(CONTROL_DT / this.model.opt.timestep);
    this.target = [...HOME];
    this.grip = 0;
    this.reset();
  }

  dispose() { this.data.delete(); this.model.delete(); }

  // Analytic IK: yaw to face the target, 2-link solve in the vertical plane, wrist keeps the gripper pointing down.
  ik([x, y, z]) {
    const { L1, L2 } = this.robot;
    const yaw = Math.atan2(y, x);
    let r = Math.hypot(x, y), zw = z + GEOM.L3 - GEOM.shoulderZ;
    let d = Math.hypot(r, zw);
    const dmax = (L1 + L2) * 0.995;
    if (d > dmax) { r *= dmax / d; zw *= dmax / d; d = dmax; }
    const c = Math.min(1, Math.max(-1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
    const q2 = Math.acos(c);
    const q1 = Math.atan2(r, zw) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
    return [yaw, q1, q2, Math.PI - q1 - q2];
  }

  clampTarget() {
    const t = this.target, [rmin, rmax] = this.robot.reach;
    t[2] = Math.min(0.30, Math.max(0.012, t[2]));
    let r = Math.hypot(t[0], t[1]);
    const a = Math.max(-2.2, Math.min(2.2, Math.atan2(t[1], t[0])));
    r = Math.min(rmax, Math.max(rmin, r));
    t[0] = r * Math.cos(a); t[1] = r * Math.sin(a);
  }

  reset(layout = null) {
    const { mj, model, data } = this;
    mj.mj_resetData(model, data);
    this.target = [...HOME]; this.grip = 0; this.time = 0;
    const q = this.ik(this.target), qpos = data.qpos;
    for (let i = 0; i < 4; i++) qpos[i] = q[i];
    qpos[4] = qpos[5] = GEOM.fingerOpen;
    if (layout) {
      const put = (base, [x, y, yaw]) => {
        qpos[base] = x; qpos[base + 1] = y; qpos[base + 2] = GEOM.cube;
        qpos[base + 3] = Math.cos(yaw / 2); qpos[base + 4] = 0; qpos[base + 5] = 0; qpos[base + 6] = Math.sin(yaw / 2);
      };
      put(6, layout.red); put(13, layout.blue);
    }
    this.writeCtrl();
    mj.mj_forward(model, data);
  }

  writeCtrl() {
    const q = this.ik(this.target), ctrl = this.data.ctrl;
    for (let i = 0; i < 4; i++) ctrl[i] = q[i];
    ctrl[4] = ctrl[5] = this.grip > 0.5 ? 0 : GEOM.fingerOpen;
  }

  // action = [dx, dy, dz, grip], each of dx/dy/dz in [-1, 1] (fraction of max speed), grip 0=open 1=closed
  step(action) {
    const v = this.robot.vmax * CONTROL_DT;
    for (let i = 0; i < 3; i++) this.target[i] += Math.max(-1, Math.min(1, action[i])) * v;
    this.grip = action[3];
    this.clampTarget();
    this.writeCtrl();
    for (let i = 0; i < this.nsub; i++) this.mj.mj_step(this.model, this.data);
    this.time += CONTROL_DT;
  }

  bodyPos(name) { const p = this.data.xpos, i = this.ids[name] * 3; return [p[i], p[i + 1], p[i + 2]]; }
  ee() { const p = this.data.site_xpos, i = this.ids.tcp * 3; return [p[i], p[i + 1], p[i + 2]]; }
  fingerGap() { return this.data.qpos[4] + this.data.qpos[5]; }

  obs() { return { ee: this.ee(), target: [...this.target], grip: this.grip, gap: this.fingerGap(), red: this.bodyPos('red'), blue: this.bodyPos('blue'), t: this.time }; }

  snapshot() { return Array.from(this.data.qpos, (v) => Math.round(v * 1e4) / 1e4); }
  restore(q) {
    const qpos = this.data.qpos;
    for (let i = 0; i < q.length; i++) qpos[i] = q[i];
    this.data.qvel.fill(0);
    this.mj.mj_forward(this.model, this.data);
  }

  inBin(name) {
    const p = this.bodyPos(name), b = GEOM.bin;
    return Math.abs(p[0] - b.x) < b.half && Math.abs(p[1] - b.y) < b.half && p[2] < GEOM.cube + 0.012;
  }
  // which task-relevant things are true right now
  check(taskId) {
    const task = TASKS[taskId], ee = this.ee(), obj = this.bodyPos(task.obj);
    const released = this.grip < 0.5 && Math.hypot(ee[0] - obj[0], ee[1] - obj[1], ee[2] - obj[2]) > 0.035;
    const other = task.obj === 'red' ? 'blue' : 'red';
    let success, wrong = false;
    if (task.goal === 'bin') {
      success = this.inBin(task.obj) && released;
      wrong = this.inBin(other);
    } else {
      const g = this.bodyPos(task.goal);
      success = Math.hypot(obj[0] - g[0], obj[1] - g[1]) < 0.018 && Math.abs(obj[2] - g[2] - 2 * GEOM.cube) < 0.008 && released;
      wrong = Math.abs(g[2] - obj[2] - 2 * GEOM.cube) < 0.008 && Math.hypot(obj[0] - g[0], obj[1] - g[1]) < 0.02;
    }
    return { success, wrong, lifted: obj[2] > GEOM.cube + 0.03 };
  }
}

export async function loadMujoco() {
  const mod = await import('../../vendor/mujoco/mujoco.js');
  return await mod.default();
}

export { TASKS, ROBOTS, GEOM };
