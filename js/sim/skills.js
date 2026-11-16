// The coffee shift: a long-horizon task built from skills on the Sprout arm in MuJoCo.
// Cup (red cube) on the counter → under the machine → press the brew button → wait → cup onto the serving tray (the bin).
// Every skill really runs the physics, and a "slippery cup" hazard can open the gripper mid-carry, so the cup falls for real.
import { Sim, CONTROL_DT, HOME, rng } from './sim.js';
import { buildXML, GEOM } from './scene.js';

export const SPOTS = { counter: [0.21, 0.16], machine: [0.33, 0.06], button: [0.31, -0.05], tray: [GEOM.bin.x, GEOM.bin.y] };
const marker = ([x, y], size, rgba, h = 0.002) => `<geom type="cylinder" pos="${x} ${y} ${h / 2}" size="${size} ${h / 2}" contype="0" conaffinity="0" rgba="${rgba}"/>`;
export const coffeeXML = () => buildXML('sprout').replace('</worldbody>', `
    ${marker(SPOTS.machine, 0.035, '0.35 0.3 0.28 1')}
    <geom type="box" pos="${SPOTS.machine[0] + 0.075} ${SPOTS.machine[1]} 0.09" size="0.03 0.05 0.09" contype="0" conaffinity="0" rgba="0.25 0.22 0.2 1"/>
    <geom type="box" pos="${SPOTS.machine[0] + 0.03} ${SPOTS.machine[1]} 0.17" size="0.045 0.05 0.012" contype="0" conaffinity="0" rgba="0.25 0.22 0.2 1"/>
    ${marker(SPOTS.button, 0.016, '1 0.55 0.15 1', 0.01)}
    ${marker(SPOTS.counter, 0.03, '0.75 0.72 0.65 1')}
  </worldbody>`);

export class CoffeeShift {
  // slip: chance that a carry ends with the cup slipping out of the gripper
  constructor(mj, { seed = 1, slip = 0.3, record = false } = {}) {
    this.sim = new Sim(mj, 'sprout', coffeeXML());
    this.rand = rng(seed); this.slip = slip; this.record = record;
    this.frames = []; this.events = []; this.brewed = false; this.steps = 0; this.jerk = 0; this.lastV = [0, 0, 0];
    const r = this.rand;
    this.sim.reset({ red: [SPOTS.counter[0] + r.range(-0.01, 0.01), SPOTS.counter[1] + r.range(-0.01, 0.01), r.range(-0.4, 0.4)], blue: [0.37, 0.2, 0] });
    this.log('start');
  }
  log(e, extra = {}) { this.events.push({ t: +this.sim.time.toFixed(2), e, ...extra }); }
  tick(action) {
    this.sim.step(action); this.steps++;
    const v = action.slice(0, 3); this.jerk += Math.hypot(v[0] - this.lastV[0], v[1] - this.lastV[1], v[2] - this.lastV[2]); this.lastV = v;
    if (this.record && this.steps % 2 === 0) this.frames.push(this.sim.snapshot());
    if (this.steps > 1600) throw new Error('Shift over: out of time (80 s)');
  }
  cup() { return this.sim.bodyPos('red'); }
  holding() { const c = this.cup(), e = this.sim.ee(); return this.sim.grip > 0.5 && c[2] > GEOM.cube + 0.008 && Math.hypot(c[0] - e[0], c[1] - e[1]) < 0.03; }
  where() {
    const [x, y, z] = this.cup();
    if (this.holding()) return 'gripper';
    if (z > GEOM.cube + 0.02) return 'falling';
    if (this.sim.inBin('red')) return 'tray';
    if (Math.hypot(x - SPOTS.machine[0], y - SPOTS.machine[1]) < 0.025) return 'machine';
    return 'counter';
  }
  // Move the hand to a point (proportional controller on the 20 Hz command). blend > 0 keeps moving instead of stopping exactly.
  moveTo([x, y, z], grip = this.sim.grip, { tol = 0.004, blend = 0, carry = false } = {}) {
    const vmax = this.sim.robot.vmax * CONTROL_DT;
    const willSlip = carry && this.rand() < this.slip, slipAt = 0.15 + 0.4 * this.rand();
    const start = this.sim.ee(), total = Math.hypot(x - start[0], y - start[1], z - start[2]) || 1e-6;
    for (let k = 0; k < 200; k++) {
      const e = this.sim.ee(), d = [x - e[0], y - e[1], z - e[2]], dist = Math.hypot(...d);
      if (dist < Math.max(tol, blend)) return true;
      if (willSlip && grip > 0.5 && 1 - dist / total > slipAt) { grip = 0; this.log('slip'); }
      this.tick([...d.map((v) => Math.max(-1, Math.min(1, v / vmax))), grip]);
    }
    return false;
  }
  wait(seconds) { const n = Math.round(seconds / CONTROL_DT); for (let i = 0; i < n; i++) this.tick([0, 0, 0, this.sim.grip]); }
  // ── skills ──
  pick() {
    const [x, y] = this.cup();
    if (Math.hypot(x - 0.0, y) > this.sim.robot.reach[1] - 0.01) { this.log('pick', { ok: false, why: 'out of reach' }); return false; }
    this.moveTo([x, y, 0.09], 0); this.moveTo([x, y, GEOM.cube + 0.002], 0); this.wait(0.3);
    this.tick([0, 0, 0, 1]); this.wait(0.4); this.moveTo([x, y, 0.1], 1);
    const ok = this.holding(); this.log('pick', { ok }); return ok;
  }
  place(spot) {
    const [x, y] = SPOTS[spot];
    const z = spot === 'tray' ? 0.07 : GEOM.cube + 0.006;
    this.moveTo([x, y, 0.1], this.sim.grip, { carry: true });
    const had = this.holding();
    if (had) this.moveTo([x, y, z], 1);
    this.tick([0, 0, 0, 0]); this.wait(0.4); this.moveTo([x, y, 0.1], 0);
    const ok = had && this.where() === spot; this.log('place', { spot, ok }); return ok;
  }
  press() {
    const [x, y] = SPOTS.button;
    this.moveTo([x, y, 0.08], this.sim.grip); this.moveTo([x, y, 0.03], this.sim.grip); this.moveTo([x, y, 0.08], this.sim.grip);
    this.brewed = this.where() === 'machine'; this.log('press', { brewing: this.brewed }); return this.brewed;
  }
  home() { this.moveTo(HOME, this.sim.grip); }
  result() {
    const served = this.where() === 'tray' && this.brewed;
    return { served, brewed: this.brewed, where: this.where(), time: +this.sim.time.toFixed(1), drops: this.events.filter((e) => e.e === 'slip').length, smooth: +(100 / (1 + this.jerk / Math.max(1, this.steps) * 20)).toFixed(0), events: this.events };
  }
  dispose() { this.sim.model.delete(); this.sim.data.delete(); }
}

// What a bare script does: no checks, no retries.
export function naiveShift(c) { c.pick(); c.place('machine'); c.press(); c.wait(1); c.pick(); c.place('tray'); c.home(); }
