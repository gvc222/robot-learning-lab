// Lab benches for the control lessons: your Python controller drives MuJoCo joints, and sliders rerun it with new gains.
import { h, lineChart } from '../util.js';
import { loadMujoco } from '../sim/sim.js';
import { Viewer } from '../sim/viewer.js';
import { slider, ARM2_XML } from '../course/explain.js';

const D = Math.PI / 180;
const note = (t) => h('p.dim', { style: 'font-size:12px' }, t);
const toJs = (x) => (x && x.toJs ? x.toJs() : x);

// One joint with inertia 0.01 kg·m² (horizontal, so no gravity), driven by a torque motor.
const JOINT_XML = `<mujoco><option timestep="0.002" integrator="implicitfast" gravity="0 0 0"/><worldbody>
  <body name="link"><joint name="j" type="hinge" axis="0 0 1"/><geom type="box" pos="0.1 0 0" size="0.1 0.01 0.01" mass="0.75" contype="0" conaffinity="0"/></body>
</worldbody><actuator><motor joint="j" ctrlrange="-20 20"/></actuator></mujoco>`;
// A 150 g link held out sideways against gravity (centre of mass 6 cm from the joint).
const PEND_XML = `<mujoco><option timestep="0.002" integrator="implicitfast"/><worldbody>
  <body name="link"><joint name="j" type="hinge" axis="0 -1 0" armature="0.0008"/><geom type="sphere" pos="0.06 0 0" size="0.005" mass="0.15" contype="0" conaffinity="0"/></body>
</worldbody><actuator><motor joint="j" ctrlrange="-1.5 1.5"/></actuator></mujoco>`;

function runJoint(mj, xml, q0, steps, torque) {
  const m = mj.MjModel.from_xml_string(xml), d = new mj.MjData(m); d.qpos[0] = q0; mj.mj_forward(m, d);
  const out = [];
  for (let i = 0; i < steps; i++) { d.ctrl[0] = torque(d.qpos[0], d.qvel[0]); mj.mj_step(m, d); if (i % 5 === 0) out.push(d.qpos[0]); }
  d.delete(); m.delete(); return out;
}

// A looping 3D replay of one hinge joint: the picture of what your controller did. Frames are joint angles (radians), played at about 30 fps.
export function replay3d(panel, mj, xml, { cam, look, height = 170, label = 'replay' } = {}) {
  const m = mj.MjModel.from_xml_string(xml), d = new mj.MjData(m);
  const view = h('.view3d', { style: `height:${height}px;flex:none;border-radius:8px;overflow:hidden` }, h('.hud', {}, h('span.chip', {}, label)));
  panel.append(view);
  const viewer = new Viewer(view, { cam, look, minDist: 0.1, maxDist: 2 }); viewer.setSim({ model: m, data: d });
  let frames = [0], i = 0, alive = true, raf, last = 0;
  const loop = (t) => { if (!alive) return; raf = requestAnimationFrame(loop); if (t - last < 33) return; last = t; const q = frames[Math.min(i, frames.length - 1)]; d.qpos[0] = q; mj.mj_forward(m, d); viewer.draw(); i = (i + 1) % (frames.length + 15); };
  raf = requestAnimationFrame(loop);
  return { set(f) { frames = f.length ? f : [0]; i = 0; }, cleanup() { alive = false; cancelAnimationFrame(raf); viewer.dispose(); d.delete(); m.delete(); } };
}

export const LABS4 = {
  async pdlab({ panel, ns, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), pd = ns.get('pd_torque');
    let kp = Number(ns.get('KP')), kd = Number(ns.get('KD'));
    const chart = h('canvas.chart', { style: 'height:170px' }), info = h('p', { style: 'font-size:13px' });
    const run = () => {
      const data = runJoint(mj, JOINT_XML, 0, 500, (q, v) => pd(q, v, 1.0, kp, kd));
      lineChart(chart, [{ data: data.map(() => 1), color: '#59647a' }, { data, color: '#ff9d3c' }], { ymin: 0, ymax: Math.max(1.4, ...data) });
      rp.set(data); const peak = Math.max(...data); info.textContent = `MuJoCo joint, 1 s, your pd_torque with kp ${kp.toFixed(1)}, kd ${kd.toFixed(3)}: overshoot ${Math.max(0, (peak - 1) * 100).toFixed(0)}%, final ${data.at(-1).toFixed(3)} rad.`;
      return { peak, at: data[60] };
    };
    const rp = replay3d(panel, mj, JOINT_XML, { cam: [0.1, -0.05, 0.55], look: [0.1, 0, 0], label: 'your PD controller, seen from above (target = straight right, 57°)' });
    panel.append(note('Your PD controller on a MuJoCo joint (inertia from the link’s real mass). The sliders rerun it with new gains.'), chart,
      slider('kp', { min: 0, max: 10, step: 0.1, value: kp, fmt: (v) => v.toFixed(1), on: (v) => { kp = v; run(); } })[0],
      slider('kd', { min: 0, max: 0.6, step: 0.005, value: kd, fmt: (v) => v.toFixed(3), on: (v) => { kd = v; run(); } })[0], info);
    const r = run();
    return { tests: [['your KP/KD work on the MuJoCo joint too (< 5% overshoot)', r.peak < 1.05, `overshoot ${((r.peak - 1) * 100).toFixed(0)}%`]], cleanup: () => rp.cleanup() };
  },

  async pidlab({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), pidStep = ns.get('pid_step'), ff = ns.get('gravity_ff'), dict = py.globals.get('dict');
    let kp = 1.5, ki = 3, kd = 0.06;
    const chart = h('canvas.chart', { style: 'height:170px' }), info = h('p', { style: 'font-size:13px' });
    const run = () => {
      const modes = {
        PD: () => { const st = dict(); return (q, v) => pidStep(st, q, v, 0, kp, 0, kd, 0.002); },
        PID: () => { const st = dict(); return (q, v) => pidStep(st, q, v, 0, kp, ki, kd, 0.002); },
        'PD + feed-forward': () => { const st = dict(); return (q, v) => pidStep(st, q, v, 0, kp, 0, kd, 0.002) + ff(q); },
      };
      const out = Object.fromEntries(Object.entries(modes).map(([k, f]) => [k, runJoint(mj, PEND_XML, -0.3, 1500, f()).map((x) => x / D)]));
      lineChart(chart, [{ data: out.PD.map(() => 0), color: '#59647a' }, { data: out.PD, color: '#ff6b6b' }, { data: out.PID, color: '#6ab0ff' }, { data: out['PD + feed-forward'], color: '#4fd08a' }], { ymin: -20, ymax: 10 });
      info.textContent = Object.entries(out).map(([k, d]) => `${k}: ${d.at(-1).toFixed(1)}°`).join(' · ');
      last = out; rp.set(out[mode].map((x) => x * D));
      return out;
    };
    const rp = replay3d(panel, mj, PEND_XML, { cam: [0.0, -0.45, 0.02], look: [0.06, 0, 0], label: 'the link, side view (level = 0°)' }); let mode = 'PD';
    const modeSel = h('select', { onchange: (e) => { mode = e.target.value; if (last) rp.set(last[mode].map((x) => x * D)); } }, ['PD', 'PID', 'PD + feed-forward'].map((k) => h('option', {}, k))); let last = null;
    panel.append(h('label', { style: 'font-size:12.5px' }, 'Watch the 3D link under ', modeSel), note('Holding a 150 g link level in MuJoCo for 3 s. Red PD (sags), blue PID, green PD + gravity feed-forward. All three use your functions.'), chart,
      slider('kp', { min: 0.2, max: 6, step: 0.1, value: kp, fmt: (v) => v.toFixed(1), on: (v) => { kp = v; run(); } })[0],
      slider('ki', { min: 0, max: 15, step: 0.5, value: ki, fmt: (v) => v.toFixed(1), on: (v) => { ki = v; run(); } })[0],
      slider('kd', { min: 0, max: 0.3, step: 0.005, value: kd, fmt: (v) => v.toFixed(3), on: (v) => { kd = v; run(); } })[0], info);
    const o = run();
    return { tests: [['in MuJoCo, PID and feed-forward hold the link level (< 1°)', Math.abs(o.PID.at(-1)) < 1 && Math.abs(o['PD + feed-forward'].at(-1)) < 1, info.textContent]], cleanup: () => rp.cleanup() };
  },

  async armlab({ panel, ns, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), arm = ns.get('arm_torques');
    const m = mj.MjModel.from_xml_string(ARM2_XML()), d = new mj.MjData(m);
    const targets = [[60 * D, -90 * D], [10 * D, 40 * D], [90 * D, -120 * D]];
    let kp = 3, kd = 0.08;
    const view = h('.view3d', { style: 'height:230px;flex:none;border-radius:8px;overflow:hidden' }), chart = h('canvas.chart', { style: 'height:140px' }), info = h('p', { style: 'font-size:13px' });
    const viewer = new Viewer(view, { cam: [0.05, -0.55, 0.12], look: [0.08, 0, 0.02], minDist: 0.2, maxDist: 2 }); viewer.setSim({ model: m, data: d });
    let frames = [], alive = true, raf;
    const run = () => {
      mj.mj_resetData(m, d); d.qpos[0] = 0; d.qpos[1] = 0; mj.mj_forward(m, d); frames = []; const e1 = [], e2 = [], finals = [];
      for (const tg of targets) {
        for (let i = 0; i < 750; i++) {
          const t = toJs(arm([d.qpos[0], d.qpos[1]], [d.qvel[0], d.qvel[1]], tg, kp, kd));
          d.ctrl[0] = t[0]; d.ctrl[1] = t[1]; mj.mj_step(m, d);
          if (i % 10 === 0) { e1.push((tg[0] - d.qpos[0]) / D); e2.push((tg[1] - d.qpos[1]) / D); frames.push([d.qpos[0], d.qpos[1]]); }
        }
        finals.push(Math.max(Math.abs(tg[0] - d.qpos[0]), Math.abs(tg[1] - d.qpos[1])) / D);
      }
      lineChart(chart, [{ data: e1, color: '#ff9d3c' }, { data: e2, color: '#6ab0ff' }], { ymin: -60, ymax: 60 });
      info.textContent = `Joint errors through 3 waypoints (1.5 s each). Final errors: ${finals.map((f) => f.toFixed(1) + '°').join(', ')}.`;
      return finals;
    };
    panel.append(view, chart, slider('kp', { min: 0.5, max: 10, step: 0.1, value: kp, fmt: (v) => v.toFixed(1), on: (v) => { kp = v; run(); } })[0],
      slider('kd', { min: 0, max: 0.4, step: 0.005, value: kd, fmt: (v) => v.toFixed(3), on: (v) => { kd = v; run(); } })[0], info, note('Orange: shoulder error, blue: elbow error. The 3D view replays the run.'));
    const finals = run();
    let i = 0; const play = () => { if (!alive) return; const f = frames[i++ % frames.length]; d.qpos[0] = f[0]; d.qpos[1] = f[1]; mj.mj_forward(m, d); viewer.draw(); raf = setTimeout(() => requestAnimationFrame(play), 20); }; play();
    return { tests: [['your controller reaches all 3 waypoints in MuJoCo (within 1°)', finals.every((f) => f < 1), finals.map((f) => f.toFixed(1) + '°').join(', ')]],
      cleanup: () => { alive = false; clearTimeout(raf); viewer.dispose(); d.delete(); m.delete(); } };
  },
};
