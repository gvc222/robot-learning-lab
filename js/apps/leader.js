// Leader Arm station: plug a real SO-101 leader arm into this laptop and drive a simulated SO-101 follower.
// Reads servo positions over Web Serial (Chrome/Edge), maps them with your LeRobot calibration, and records episodes.
// No arm? The sliders drive the same simulated follower.
import { h, fill, $, state, save, toast } from '../util.js';
import { loadMujoco } from '../sim/sim.js';
import { stageModel, idOf } from '../sim/menagerie.js';
import { Viewer } from '../sim/viewer.js';
import { FeetechBus, SO101_MOTORS, DEFAULT_CAL, toDegrees, toGripper01 } from '../hw/feetech.js';

// A table-top scene around Menagerie's SO-101: floor, a light and two cubes to play with.
const addScene = (xml) => xml.replace('<worldbody>', `<worldbody>
    <light pos="0.3 -0.4 1.2" dir="-0.2 0.3 -1" diffuse="0.8 0.8 0.8"/>
    <geom name="floor" type="plane" size="0.6 0.6 0.05" rgba="0.86 0.84 0.8 1"/>
    <body name="red" pos="0.22 0.06 0.0151"><freejoint/><geom type="box" size="0.015 0.015 0.015" rgba="0.85 0.2 0.2 1" mass="0.02" condim="4" friction="1.2 0.005 0.0005"/></body>
    <body name="blue" pos="0.2 -0.1 0.0151"><freejoint/><geom type="box" size="0.015 0.015 0.015" rgba="0.2 0.4 0.9 1" mass="0.02" condim="4" friction="1.2 0.005 0.0005"/></body>`);

const JOINTS = SO101_MOTORS.map(([n]) => n);
const HZ = 30;

export async function buildFollower(mj) {
  const path = await stageModel(mj, 'robotstudio_so101', 'so101.xml', addScene);
  const model = mj.MjModel.from_xml_path(path), data = new mj.MjData(model);
  const act = JOINTS.map((n) => idOf(mj, model, 'mjOBJ_ACTUATOR', n));
  const range = act.map((a) => [model.actuator_ctrlrange[2 * a], model.actuator_ctrlrange[2 * a + 1]]);
  const homeQ = [0, -1.57, 1.57, 0.9, 0, 0];  // folded "rest" pose, like the real arm on the table
  const reset = () => { mj.mj_resetData(model, data); homeQ.forEach((q, i) => { data.qpos[i] = q; data.ctrl[act[i]] = q; }); mj.mj_forward(model, data); };
  reset();
  return {
    model, data, act, range, reset,
    // Joint targets in radians (gripper: 0 closed … 1 open) → actuators.
    command(targets) {
      targets.forEach((v, i) => {
        const [lo, hi] = range[i];
        const q = i === 5 ? lo + v * (hi - lo) : v;
        data.ctrl[act[i]] = Math.min(hi, Math.max(lo, q));
      });
    },
    step(seconds) { const n = Math.round(seconds / model.opt.timestep); for (let k = 0; k < n; k++) mj.mj_step(model, data); },
    dispose() { data.delete(); model.delete(); },
  };
}

// Leader reading → follower targets, the way LeRobot reports it: DEGREES around the calibrated middle, gripper 0–100%.
export function leaderToTargets(raw, cal, signs) {
  return JOINTS.map((n, i) => {
    if (raw[i] == null) return null;
    if (n === 'gripper') return toGripper01(raw[i], cal[n]);
    return signs[i] * toDegrees(raw[i], cal[n]) * Math.PI / 180;
  });
}

export default {
  id: 'leader', icon: '🦾', title: 'Leader Arm',
  mount(el) {
    let mj, f, viewer, raf, alive = true, bus = null, polling = false;
    const cal = structuredClone(state.seen.leaderCal || DEFAULT_CAL);
    const signs = state.seen.leaderSigns || [1, 1, 1, 1, 1, 1];
    let raw = Array(6).fill(null), targets = [0, -1.57, 1.57, 0.9, 0, 0], source = 'sliders';
    let rec = null, lastEp = null, lastRead = 0, reads = 0;

    const serialOk = typeof navigator !== 'undefined' && 'serial' in navigator;
    const view = h('.view3d', {}, h('.hud', {}, h('span.chip#l-status', {}, 'loading SO-101 model…'), h('span.chip#l-rate', {}, ''), h('span.chip#l-rec', { hidden: true }, '● REC')));
    const sliders = JOINTS.map((n, i) => {
      const lo = i === 5 ? 0 : -110, hi = i === 5 ? 100 : 110;
      const s = h('input', { type: 'range', min: lo, max: hi, value: i === 5 ? 0 : Math.round(targets[i] * 180 / Math.PI), 'data-j': n,
        oninput: (e) => { source = 'sliders'; targets[i] = i === 5 ? e.target.value / 100 : e.target.value * Math.PI / 180; } });
      return h('label', { style: 'font-size:12px' }, `${n} `, s);
    });
    const table = h('table', { style: 'font-size:12px;width:100%' });
    const connectBtn = h('button#l-connect', { onclick: () => (bus ? disconnect() : connect()), disabled: !serialOk }, 'Connect leader arm (USB)');
    const recBtn = h('button#l-recbtn', { onclick: () => toggleRec() }, '● Record episode');
    const dlBtn = h('button.ghost#l-dl', { hidden: true, onclick: () => download() }, '⬇ Download episode');
    const calInput = h('input', { type: 'file', accept: '.json', style: 'display:none', onchange: (e) => loadCal(e.target.files[0]) });

    const side = h('.side.right', {},
      h('h3', {}, 'Your leader arm'),
      serialOk
        ? h('p', { style: 'font-size:12.5px' }, 'Plug the leader’s controller board into USB, then connect and pick its port (on Linux/macOS it looks like ', h('code', {}, '/dev/ttyACM0'), ' or ', h('code', {}, 'tty.usbmodem…'), '). Torque is switched off so you can move it by hand.')
        : h('p.bad', { style: 'font-size:12.5px' }, 'This browser has no Web Serial. Open the lab in Chrome or Edge on a laptop to use a real arm. The sliders below still work.'),
      h('.row', {}, connectBtn, h('button.ghost', { onclick: () => calInput.click() }, 'Load calibration JSON'), calInput),
      h('p.dim#l-calname', { style: 'font-size:12px' }, state.seen.leaderCalName ? `Calibration: ${state.seen.leaderCalName}` : 'Calibration: default (half-turn homing, full range). Load the file lerobot-calibrate saved for a better match.'),
      table,
      h('h3', { style: 'margin-top:14px' }, 'Joints (no arm needed)'), ...sliders,
      h('h3', { style: 'margin-top:14px' }, 'Record'),
      h('.row', {}, recBtn, dlBtn, h('button.ghost', { onclick: () => { f?.reset(); toast('Scene reset'); } }, 'Reset scene')),
      h('p.dim', { style: 'font-size:12px' }, `Records ${HZ} Hz frames of action (leader joints) and observation (follower joints), the same pair lerobot-record stores.`));
    el.append(h('.split', {}, h('.mainc', {}, view), side));

    const renderTable = () => fill(table, h('tr', {}, ['joint', 'raw', 'target', 'flip'].map((t) => h('th', { style: 'text-align:left' }, t))),
      ...JOINTS.map((n, i) => h('tr', {}, h('td', {}, n), h('td.mono', {}, raw[i] ?? '—'),
        h('td.mono', {}, i === 5 ? `${Math.round(100 * targets[5])}%` : `${(targets[i] * 180 / Math.PI).toFixed(0)}°`),
        h('td', {}, i === 5 ? '' : h('input', { type: 'checkbox', checked: signs[i] < 0, title: 'Flip if the sim joint turns the wrong way', onchange: (e) => { signs[i] = e.target.checked ? -1 : 1; state.seen.leaderSigns = signs; save(); } })))));

    async function loadCal(file) {
      try {
        const j = JSON.parse(await file.text());
        for (const n of JOINTS) if (!j[n] || j[n].range_min == null || j[n].range_max == null) throw new Error(`missing "${n}" with range_min/range_max`);
        Object.assign(cal, j); state.seen.leaderCal = j; state.seen.leaderCalName = file.name; save();
        $('#l-calname').textContent = `Calibration: ${file.name}`; toast('Calibration loaded');
      } catch (e) { toast(`Not a LeRobot calibration file: ${e.message}`); }
    }

    async function connect() {
      try {
        const port = await navigator.serial.requestPort();
        bus = new FeetechBus(port); await bus.open();
        await bus.torqueOff(SO101_MOTORS.map(([, id]) => id));
        connectBtn.textContent = 'Disconnect'; source = 'leader'; polling = true; poll();
        $('#l-status').textContent = 'leader arm connected';
      } catch (e) { bus = null; if (e.name !== 'NotFoundError') toast(`Could not open the arm: ${e.message}`); }
    }
    async function disconnect() { polling = false; const b = bus; bus = null; await b?.close(); connectBtn.textContent = 'Connect leader arm (USB)'; source = 'sliders'; $('#l-status').textContent = 'sliders'; }
    async function poll() {
      while (polling && alive && bus) {
        const t0 = performance.now(), next = [];
        try { for (const [, id] of SO101_MOTORS) next.push(await bus.readPosition(id)); } catch (e) { toast(`Lost the arm: ${e.message}`); disconnect(); return; }
        raw = next; reads++;
        const tg = leaderToTargets(raw, cal, signs); tg.forEach((v, i) => { if (v != null) targets[i] = v; });
        const missing = next.filter((v) => v == null).length;
        if (missing) $('#l-status').textContent = `${missing} motor(s) not answering: check the chain and IDs`;
        await new Promise((r) => setTimeout(r, Math.max(0, 1000 / HZ - (performance.now() - t0))));
      }
    }

    function toggleRec() {
      if (rec) { lastEp = rec; rec = null; recBtn.textContent = '● Record episode'; $('#l-rec').hidden = true; dlBtn.hidden = false; toast(`Episode saved: ${lastEp.frames.length} frames`); return; }
      rec = { robot_type: 'so101_follower', fps: HZ, source, joints: JOINTS, frames: [] };
      recBtn.textContent = '■ Stop'; $('#l-rec').hidden = false; dlBtn.hidden = true;
    }
    function download() {
      const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(lastEp)], { type: 'application/json' })), download: `so101_episode_${Date.now()}.json` });
      document.body.append(a); a.click(); a.remove();
    }

    (async () => {
      mj = await loadMujoco(); if (!alive) return;
      f = await buildFollower(mj); if (!alive) { f.dispose(); return; }
      viewer = new Viewer(view, { cam: [0.55, -0.45, 0.42], look: [0.15, 0, 0.08], groups: [0, 1, 2] });
      viewer.setSim({ model: f.model, data: f.data });
      $('#l-status').textContent = 'sliders';
      let acc = 0, last = performance.now();
      const loop = (now) => {
        if (!alive) return;
        const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
        f.command(targets); f.step(dt);
        if (rec && acc >= 1 / HZ) {
          acc = 0;
          rec.frames.push({ t: +(rec.frames.length / HZ).toFixed(3), action: targets.map((v) => +v.toFixed(4)), 'observation.state': Array.from(f.data.qpos.slice(0, 6), (v) => +v.toFixed(4)) });
        } else if (!rec) acc = 0;
        if (now - lastRead > 500) { renderTable(); $('#l-rate').textContent = bus ? `${reads * 2} reads/s` : ''; reads = 0; lastRead = now; }
        viewer.draw(); raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();
    renderTable();
    return () => { alive = false; polling = false; cancelAnimationFrame(raf); bus?.close(); viewer?.dispose(); f?.dispose(); };
  },
};
