// MJCF scene builder: a 4-DoF tabletop arm with a parallel gripper, two cubes and a bin.
// Everything here is plain MuJoCo XML, so you can paste the output into the desktop
// MuJoCo viewer (`python -m mujoco.viewer`) and it will load.

export const ROBOTS = {
  sprout: {
    id: 'sprout', name: 'Sprout S1', blurb: 'Small desktop arm. Slow, stiff and precise.',
    L1: 0.22, L2: 0.22, kp: 220, kv: 24, vmax: 0.22, color: '0.93 0.55 0.2 1',
    reach: [0.14, 0.40],
  },
  longarm: {
    id: 'longarm', name: 'Longarm L2', blurb: 'Bigger reach and faster, but softer joints: it wobbles.',
    L1: 0.28, L2: 0.27, kp: 90, kv: 7, vmax: 0.36, color: '0.3 0.62 0.9 1',
    reach: [0.16, 0.48],
  },
};

export const GEOM = {
  shoulderZ: 0.12,   // height of the shoulder joint above the table
  L3: 0.085,         // wrist joint -> grasp point (between the finger pads)
  cube: 0.02,        // cube half-size
  bin: { x: 0.27, y: -0.17, half: 0.06, wall: 0.03 },
  spawn: { x: [0.20, 0.34], y: [0.03, 0.20] },
  fingerOpen: 0.036,
};

export function buildXML(robotId = 'sprout') {
  const r = ROBOTS[robotId];
  const { shoulderZ, cube, bin } = GEOM;
  const b = bin, t = 0.004;
  const wall = (n, x, y, sx, sy) =>
    `<geom name="bin_${n}" type="box" pos="${x} ${y} ${b.wall / 2}" size="${sx} ${sy} ${b.wall / 2}" rgba="0.35 0.38 0.45 1"/>`;
  return `
<mujoco model="tabletop-${r.id}">
  <compiler angle="radian" autolimits="true"/>
  <option timestep="0.002" integrator="implicitfast" cone="elliptic" impratio="10"/>
  <visual><global offwidth="640" offheight="480"/></visual>
  <default>
    <joint damping="1" armature="0.02"/>
    <geom solref="0.005 1" friction="1 0.01 0.001"/>
    <default class="arm"><geom rgba="${r.color}" contype="1" conaffinity="1"/></default>
    <default class="pad"><geom rgba="0.15 0.15 0.17 1" friction="2 0.05 0.002" condim="4" solimp="0.95 0.99 0.001"/></default>
    <default class="cube"><geom type="box" size="${cube} ${cube} ${cube}" mass="0.05" friction="1.5 0.02 0.002" condim="4"/></default>
  </default>
  <worldbody>
    <light pos="0.3 -0.3 1.2" dir="-0.1 0.2 -1" diffuse="0.9 0.9 0.9"/>
    <!-- fixed scene camera, looking at the workspace from the front (used for datasets and calibration) -->
    <camera name="front" pos="0.78 0 0.46" xyaxes="0 1 0 -0.633 0 0.774" fovy="50"/>
    <geom name="table" type="plane" size="0.8 0.8 0.1" rgba="0.86 0.84 0.8 1"/>
    <geom name="bin_floor" type="box" pos="${b.x} ${b.y} 0.001" size="${b.half} ${b.half} 0.001" rgba="0.25 0.27 0.33 1" contype="0" conaffinity="0"/>
    ${wall('n', b.x + b.half + t, b.y, t, b.half + 2 * t)}
    ${wall('s', b.x - b.half - t, b.y, t, b.half + 2 * t)}
    ${wall('e', b.x, b.y + b.half + t, b.half, t)}
    ${wall('w', b.x, b.y - b.half - t, b.half, t)}
    <body name="base">
      <geom class="arm" type="cylinder" size="0.055 0.03" pos="0 0 0.03" rgba="0.2 0.2 0.23 1"/>
      <body name="turret" pos="0 0 0.06" gravcomp="1">
        <joint name="yaw" axis="0 0 1" range="-2.8 2.8"/>
        <geom class="arm" type="cylinder" size="0.036 0.03" pos="0 0 0.03" mass="0.3"/>
        <body name="upper" pos="0 0 ${shoulderZ - 0.06}" gravcomp="1">
          <joint name="shoulder" axis="0 1 0" range="-1.7 1.7"/>
          <geom class="arm" type="capsule" fromto="0 0 0 0 0 ${r.L1}" size="0.018" mass="0.25"/>
          <body name="fore" pos="0 0 ${r.L1}" gravcomp="1">
            <joint name="elbow" axis="0 1 0" range="0 2.9"/>
            <geom class="arm" type="capsule" fromto="0 0 0 0 0 ${r.L2}" size="0.015" mass="0.2"/>
            <body name="hand" pos="0 0 ${r.L2}" gravcomp="1">
              <joint name="wrist" axis="0 1 0" range="-3.3 3.3"/>
              <geom class="arm" type="box" pos="0 0 0.03" size="0.018 0.05 0.012" mass="0.08" rgba="0.2 0.2 0.23 1"/>
              <site name="tcp" pos="0 0 ${GEOM.L3}" size="0.004" rgba="0 1 0 0"/>
              <camera name="wrist" pos="0.03 0 0.02" xyaxes="0 1 0 1 0 0" fovy="70"/>
              <body name="finger_l" pos="0 0 0.072" gravcomp="1">
                <joint name="finger_l" type="slide" axis="0 1 0" range="0 0.04" damping="4"/>
                <geom class="pad" type="box" pos="0 0.005 0" size="0.011 0.005 0.03" mass="0.02"/>
              </body>
              <body name="finger_r" pos="0 0 0.072" gravcomp="1">
                <joint name="finger_r" type="slide" axis="0 -1 0" range="0 0.04" damping="4"/>
                <geom class="pad" type="box" pos="0 -0.005 0" size="0.011 0.005 0.03" mass="0.02"/>
              </body>
            </body>
          </body>
        </body>
      </body>
    </body>
    <body name="red" pos="0.25 0.1 ${cube}"><freejoint name="red"/><geom class="cube" name="red" rgba="0.86 0.2 0.2 1"/></body>
    <body name="blue" pos="0.3 0.18 ${cube}"><freejoint name="blue"/><geom class="cube" name="blue" rgba="0.2 0.4 0.9 1"/></body>
  </worldbody>
  <actuator>
    <position name="yaw" joint="yaw" kp="${r.kp}" kv="${r.kv}" forcerange="-40 40"/>
    <position name="shoulder" joint="shoulder" kp="${r.kp}" kv="${r.kv}" forcerange="-40 40"/>
    <position name="elbow" joint="elbow" kp="${r.kp}" kv="${r.kv}" forcerange="-40 40"/>
    <position name="wrist" joint="wrist" kp="${r.kp * 0.5}" kv="${r.kv * 0.5}" forcerange="-20 20"/>
    <position name="finger_l" joint="finger_l" kp="400" kv="10" forcerange="-9 9"/>
    <position name="finger_r" joint="finger_r" kp="400" kv="10" forcerange="-9 9"/>
  </actuator>
</mujoco>`;
}

export const TASKS = {
  red_bin: { id: 'red_bin', text: 'put the red cube in the bin', obj: 'red', goal: 'bin' },
  blue_bin: { id: 'blue_bin', text: 'put the blue cube in the bin', obj: 'blue', goal: 'bin' },
  stack: { id: 'stack', text: 'stack the red cube on the blue cube', obj: 'red', goal: 'blue' },
};
