// A small quadruped in MuJoCo: 4 legs, each with a hip and a knee (8 position-controlled joints).
// Gaits come from a central pattern generator (CPG): every leg runs the same rhythm at a different phase.
export const LEGS = ['FL', 'FR', 'RL', 'RR'];
export const quadXML = () => {
  const leg = (n, x, y) => `<body name="${n}" pos="${x} ${y} -0.02">
        <joint name="${n}_hip" type="hinge" axis="0 1 0" range="-1.2 1.2" damping="0.3" armature="0.01"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.1" size="0.014" mass="0.12" rgba="0.95 0.6 0.25 1"/>
        <body pos="0 0 -0.1">
          <joint name="${n}_knee" type="hinge" axis="0 1 0" range="-2.2 0.1" damping="0.3" armature="0.01"/>
          <geom type="capsule" fromto="0 0 0 0 0 -0.1" size="0.012" mass="0.08" rgba="0.8 0.82 0.88 1"/>
          <geom type="sphere" pos="0 0 -0.1" size="0.016" mass="0.02" friction="1.5 0.02 0.001" rgba="0.15 0.15 0.15 1"/>
        </body>
      </body>`;
  return `<mujoco model="quadruped">
  <compiler angle="radian"/>
  <option timestep="0.002" integrator="implicitfast"/>
  <worldbody>
    <light pos="0 -1 2" dir="0 0.4 -1"/>
    <geom name="ground" type="plane" size="6 2 0.05" pos="2 0 0" friction="1 0.02 0.001" rgba="0.22 0.25 0.3 1"/>
    ${[1, 2, 3, 4].map((k) => `<geom type="box" pos="${k} 0 0.0005" size="0.01 0.6 0.0005" contype="0" conaffinity="0" rgba="0.4 0.45 0.55 1"/>`).join('')}
    <body name="torso" pos="0 0 0.24"><freejoint/>
      <geom type="box" size="0.14 0.07 0.025" mass="1.2" rgba="0.3 0.6 0.95 1"/>
      <geom type="box" pos="0.15 0 0.015" size="0.03 0.04 0.02" mass="0.05" rgba="1 0.6 0.24 1"/>
      ${leg('FL', 0.12, 0.085)}${leg('FR', 0.12, -0.085)}${leg('RL', -0.12, 0.085)}${leg('RR', -0.12, -0.085)}
    </body>
  </worldbody>
  <actuator>${LEGS.map((n) => `<position joint="${n}_hip" kp="12" ctrlrange="-1.2 1.2" forcerange="-4 4"/><position joint="${n}_knee" kp="12" ctrlrange="-2.2 0.1" forcerange="-4 4"/>`).join('')}</actuator>
</mujoco>`;
};
// gait(t) -> [[hip, knee] x 4] in LEGS order. Returns distance walked, whether it fell, and optional frames for replay.
export function walk(mj, gait, seconds = 6, record = false) {
  const m = mj.MjModel.from_xml_string(quadXML()), d = new mj.MjData(m), frames = [];
  const stand = [0.5, -1.0]; for (let i = 0; i < 4; i++) { d.qpos[7 + 2 * i] = stand[0]; d.qpos[8 + 2 * i] = stand[1]; d.ctrl[2 * i] = stand[0]; d.ctrl[2 * i + 1] = stand[1]; }
  d.qpos[2] = 0.2; mj.mj_forward(m, d);
  for (let k = 0; k < 250; k++) mj.mj_step(m, d);  // settle
  const x0 = d.qpos[0]; let fell = false, energy = 0;
  const n = Math.round(seconds / 0.02);
  for (let s = 0; s < n && !fell; s++) {
    const tg = gait(s * 0.02);
    for (let i = 0; i < 4; i++) { d.ctrl[2 * i] = tg[i][0]; d.ctrl[2 * i + 1] = tg[i][1]; }
    for (let k = 0; k < 10; k++) mj.mj_step(m, d);
    for (let i = 0; i < 8; i++) energy += Math.abs(d.actuator_force[i] * d.qvel[6 + i]) * 0.02;
    const [w, x, y, z] = [d.qpos[3], d.qpos[4], d.qpos[5], d.qpos[6]], up = 1 - 2 * (x * x + y * y);
    if (up < 0.5 || d.qpos[2] < 0.08) fell = true;
    if (record && s % 2 === 0) frames.push(Array.from(d.qpos));
    void w; void z;
  }
  const out = { distance: d.qpos[0] - x0, drift: Math.abs(d.qpos[1]), fell, energy, frames };
  d.delete(); m.delete(); return out;
}
export const TROT = [0, Math.PI, Math.PI, 0];
export function cpgLeg(t, phase, A, B, f, delta) {
  const th = 2 * Math.PI * f * t + phase;
  return [0.5 + A * Math.sin(th), -1.0 - B * Math.max(0, Math.sin(th + delta))];
}
export const score = (r) => (r.fell ? -1 : r.distance - 0.5 * r.drift);
