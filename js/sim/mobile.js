// A small delivery robot in a MuJoCo city block: differential drive (two driven wheels + a caster), real wheel–ground
// contact, and a 2D lidar made of MuJoCo ray casts. The map is a grid of 0.25 m cells.
export const CELL = 0.25;
export const WHEEL_R = 0.04, TRACK = 0.17;
// '#' building · '.' street · R restaurant · A/B/C customers
export const CITY = [
  '####################',
  '#R.....#......#....#',
  '#.###..#.####.#.##.#',
  '#.###....####...##A#',
  '#.......#....#.....#',
  '###.##..#.##.####..#',
  '#...##....##.......#',
  '#.#....##....###.#.#',
  '#.#.##.##.##.....#B#',
  '#...##....##.###...#',
  '#C........##.......#',
  '####################',
];
export const H = CITY.length, W = CITY[0].length;
export const find = (ch) => { for (let r = 0; r < H; r++) { const c = CITY[r].indexOf(ch); if (c >= 0) return [r, c]; } return null; };
export const cellCenter = ([r, c]) => [(c + 0.5) * CELL, -(r + 0.5) * CELL];  // row grows toward -y
export const worldToCell = ([x, y]) => [Math.floor(-y / CELL), Math.floor(x / CELL)];
export const occupancy = () => CITY.map((row) => [...row].map((ch) => (ch === '#' ? 1 : 0)));

export function cityXML(start = find('R')) {
  const blocks = [];
  CITY.forEach((row, r) => [...row].forEach((ch, c) => {
    const [x, y] = cellCenter([r, c]);
    if (ch === '#') blocks.push(`<geom type="box" pos="${x} ${y} 0.08" size="${CELL / 2} ${CELL / 2} 0.08" rgba="0.42 0.46 0.55 1"/>`);
    else if ('RABC'.includes(ch)) blocks.push(`<geom type="cylinder" pos="${x} ${y} 0.001" size="0.1 0.001" contype="0" conaffinity="0" rgba="${ch === 'R' ? '1 0.6 0.24' : '0.3 0.82 0.54'} 0.9"/>`);
  }));
  const [sx, sy] = cellCenter(start);
  return `<mujoco model="city">
  <option timestep="0.004" integrator="implicitfast"/>
  <visual><global offwidth="320" offheight="240"/></visual>
  <worldbody>
    <light pos="2.5 -1.5 3" dir="0 0 -1" diffuse="0.9 0.9 0.9"/>
    <geom name="ground" type="plane" pos="${W * CELL / 2} ${-H * CELL / 2} 0" size="${W * CELL / 2} ${H * CELL / 2} 0.05" rgba="0.2 0.22 0.26 1"/>
    ${blocks.join('\n    ')}
    <body name="bot" pos="${sx} ${sy} 0.05"><freejoint/>
      <geom name="chassis" type="box" size="0.09 0.07 0.03" mass="2" rgba="0.3 0.6 0.95 1"/>
      <geom type="box" pos="-0.01 0 0.05" size="0.06 0.05 0.02" mass="0.2" rgba="1 0.6 0.24 1"/>
      <geom type="sphere" size="0.02" pos="-0.07 0 -0.03" friction="0 0 0" mass="0.05" rgba="0.2 0.2 0.2 1"/>
      <body pos="0.03 ${TRACK / 2} -0.01"><joint name="wl" type="hinge" axis="0 1 0"/><geom type="cylinder" size="${WHEEL_R} 0.012" quat="0.7071 0.7071 0 0" mass="0.2" friction="1.2 0.01 0.001" rgba="0.1 0.1 0.1 1"/></body>
      <body pos="0.03 ${-TRACK / 2} -0.01"><joint name="wr" type="hinge" axis="0 1 0"/><geom type="cylinder" size="${WHEEL_R} 0.012" quat="0.7071 0.7071 0 0" mass="0.2" friction="1.2 0.01 0.001" rgba="0.1 0.1 0.1 1"/></body>
    </body>
  </worldbody>
  <actuator><velocity name="left" joint="wl" kv="3" ctrlrange="-25 25"/><velocity name="right" joint="wr" kv="3" ctrlrange="-25 25"/></actuator>
</mujoco>`;
}

export class Rover {
  constructor(mj, start) {
    this.mj = mj;
    this.model = mj.MjModel.from_xml_string(cityXML(start));
    this.data = new mj.MjData(this.model);
    this.bot = mj.mj_name2id(this.model, mj.mjtObj.mjOBJ_BODY.value, 'bot');
    this.chassis = mj.mj_name2id(this.model, mj.mjtObj.mjOBJ_GEOM.value, 'chassis');
    mj.mj_forward(this.model, this.data);
    this.time = 0; this.bumps = 0;
  }
  pose() {
    const q = this.data.qpos, [w, x, y, z] = [q[3], q[4], q[5], q[6]];
    return [q[0], q[1], Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))];
  }
  // Wheel angular speeds (rad/s) for a body velocity: the differential-drive inverse kinematics.
  static wheels(v, w) { return [(v - w * TRACK / 2) / WHEEL_R, (v + w * TRACK / 2) / WHEEL_R]; }
  drive(wl, wr, seconds = 0.05) {
    const d = this.data, m = this.model, n = Math.round(seconds / m.opt.timestep);
    d.ctrl[0] = wl; d.ctrl[1] = wr;
    for (let k = 0; k < n; k++) this.mj.mj_step(m, d);
    for (let i = 0; i < d.ncon; i++) {  // any contact between the chassis and a building counts as a bump
      const c = d.contact.get ? d.contact.get(i) : d.contact[i];
      if (c && (c.geom1 === this.chassis || c.geom2 === this.chassis) && c.geom1 !== 0 && c.geom2 !== 0) { this.bumps++; break; }
    }
    this.time += seconds;
  }
  // 2D lidar: n rays at chassis height. Returns ranges in metres (max range if nothing is hit).
  lidar(n = 72, maxRange = 2.5) {
    const [x, y, th] = this.pose(), out = [];
    const pnt = new Float64Array([x, y, 0.06]), vec = new Float64Array(3), gid = new Int32Array(1);
    for (let i = 0; i < n; i++) {
      const a = th + (2 * Math.PI * i) / n; vec[0] = Math.cos(a); vec[1] = Math.sin(a); vec[2] = 0;
      const r = this.mj.mj_ray(this.model, this.data, pnt, vec, null, 1, this.bot, gid, null);
      out.push(r < 0 || r > maxRange ? maxRange : r);
    }
    return out;
  }
  dispose() { this.data.delete(); this.model.delete(); }
}

// Cells a lidar beam passes through (free) and the cell it ends in (hit), via Bresenham on the grid.
export function beamCells([x0, y0], [x1, y1]) {
  let [r0, c0] = worldToCell([x0, y0]); const [r1, c1] = worldToCell([x1, y1]);
  const free = [], dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0), sr = r0 < r1 ? 1 : -1, sc = c0 < c1 ? 1 : -1;
  let err = dc - dr;
  while (!(r0 === r1 && c0 === c1)) {
    free.push([r0, c0]);
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c0 += sc; }
    if (e2 < dc) { err += dc; r0 += sr; }
  }
  return { free, end: [r1, c1] };
}
