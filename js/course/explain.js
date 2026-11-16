// Interactive explainers shown above the code editor, before any testing.
// Each takes (box, lesson) and returns an optional cleanup function. Sliders everywhere a value is a knob.
import { h, fill, lineChart } from '../util.js';
import { loadMujoco } from '../sim/sim.js';
import { stageModel, idOf, nameOf } from '../sim/menagerie.js';
import { Viewer } from '../sim/viewer.js';

const D = Math.PI / 180;
const C = { bg: '#0a0c10', grid: '#1b2028', link: '#8d97a8', dim: '#59647a', acc: '#ff9d3c', ok: '#4fd08a', blue: '#6ab0ff', bad: '#ff6b6b', text: '#c9d1e0' };
function cv(w = 360, hgt = 240) {
  const c = h('canvas', { width: w * 2, height: hgt * 2, style: `width:100%;max-width:${w}px;aspect-ratio:${w}/${hgt};background:${C.bg};border-radius:8px;border:1px solid var(--line);touch-action:none` });
  const g = c.getContext('2d'); g.scale(2, 2); g.font = '12px system-ui'; g.lineCap = 'round'; g.lineJoin = 'round';
  return [c, g];
}
// A labelled slider. Returns [element, input]; `on(value)` fires on every move.
export function slider(label, { min, max, step = 1, value, fmt = (v) => v, on }) {
  const out = h('b.mono', { style: 'min-width:64px;text-align:right' }, fmt(value));
  const inp = h('input', { type: 'range', min, max, step, value, style: 'flex:1', oninput: (e) => { const v = +e.target.value; out.textContent = fmt(v); on(v); } });
  inp.setValue = (v) => { inp.value = v; out.textContent = fmt(v); };
  return [h('label.row', { style: 'gap:8px;align-items:center;font-size:12.5px;margin:2px 0' }, h('span', { style: 'min-width:92px' }, label), inp, out), inp];
}
const wrap = (...kids) => h('.card.explain', { style: 'margin:6px 0 4px;padding:10px 12px' }, h('.dim', { style: 'font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px' }, '▶ Try it'), ...kids);
const note = (t) => h('p.dim', { style: 'font-size:12px;margin:6px 0 0' }, t);
function arrow(g, x0, y0, x1, y1, col) {
  g.strokeStyle = g.fillStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 8 * Math.cos(a - 0.4), y1 - 8 * Math.sin(a - 0.4)); g.lineTo(x1 - 8 * Math.cos(a + 0.4), y1 - 8 * Math.sin(a + 0.4)); g.fill();
}
function plot(c, series, opts) { lineChart(c, series, opts); }

// ───────────── real robots (MuJoCo Menagerie) and their planar "arm in a plane" view ─────────────
// chain: bodies whose origins sit on the pitch joints (shoulder → elbow → wrist → hand), measured from the MJCF.
export const ROBOT_MODELS = {
  so101: { name: 'SO-101 (LeRobot)', dir: 'robotstudio_so101', xml: 'so101.xml', groups: [0, 1, 2], cam: [0.62, -0.62, 0.42], look: [0.12, 0, 0.1],
    chain: ['upper_arm', 'lower_arm', 'wrist', 'gripper'], joints: ['shoulder_lift', 'elbow_flex', 'wrist_flex'], q0: [0, 0, 0] },
  yam: { name: 'YAM (I2RT)', dir: 'i2rt_yam', xml: 'yam.xml', groups: [0, 1, 2], cam: [0.95, -0.95, 0.6], look: [0.08, 0, 0.18],
    chain: ['link_2', 'link_3', 'link_4', 'link_6'], joints: ['joint2', 'joint3', 'joint4'], q0: [1.2, 1.4, 0] },
};
const loaded = {};
async function loadRobot(key) {
  const mj = await loadMujoco(), r = ROBOT_MODELS[key];
  const model = mj.MjModel.from_xml_path(await stageModel(mj, r.dir, r.xml)), data = new mj.MjData(model);
  return { mj, model, data, r };
}
// Calibrate the planar chain: link lengths, and for each joint θ_i = offset_i + sign_i · q_i.
function planarChain(rb) {
  const { mj, model: m, data: d, r } = rb;
  const b = r.chain.map((n) => idOf(mj, m, 'mjOBJ_BODY', n)), jid = r.joints.map((n) => idOf(mj, m, 'mjOBJ_JOINT', n)), adr = jid.map((j) => m.jnt_qposadr[j]);
  const rel = () => {
    mj.mj_forward(m, d); const abs = [];
    for (let i = 0; i < b.length - 1; i++) { const p = 3 * b[i], q = 3 * b[i + 1]; abs.push(Math.atan2(d.xpos[q + 2] - d.xpos[p + 2], d.xpos[q] - d.xpos[p])); }
    return abs.map((a, i) => (i ? a - abs[i - 1] : a));
  };
  const save = Array.from(d.qpos); d.qpos.fill(0); const a0 = rel();
  const L = []; for (let i = 0; i < b.length - 1; i++) { const p = 3 * b[i], q = 3 * b[i + 1]; L.push(Math.hypot(d.xpos[q] - d.xpos[p], d.xpos[q + 1] - d.xpos[p + 1], d.xpos[q + 2] - d.xpos[p + 2])); }
  const sign = adr.map((a, i) => { d.qpos.fill(0); d.qpos[a] = 0.2; return Math.sign(rel()[i] - a0[i]) || 1; });
  save.forEach((v, i) => { d.qpos[i] = v; }); mj.mj_forward(m, d);
  const range = jid.map((j) => [m.jnt_range[2 * j], m.jnt_range[2 * j + 1]]);
  return { L, adr, offset: a0, sign, range,
    thetaRange: (i) => { const t = range[i].map((q) => a0[i] + sign[i] * q); return [Math.min(...t), Math.max(...t)]; },
    set(thetas) { thetas.forEach((t, i) => { if (i < adr.length) d.qpos[adr[i]] = Math.min(range[i][1], Math.max(range[i][0], (t - a0[i]) / sign[i])); }); mj.mj_forward(m, d); },
  };
}

// Robot picker + 3D view + a slider per joint. Also loads your own URDF or MJCF (with its mesh files).
function robot3d(box) {
  let alive = true, viewer = null, rb = null, raf;
  const sel = h('select', {}, Object.entries(ROBOT_MODELS).map(([k, r]) => h('option', { value: k }, r.name)), h('option', { value: 'upload' }, 'Your own URDF / MJCF…'));
  const file = h('input', { type: 'file', multiple: true, accept: '.xml,.urdf,.stl,.obj,.msh,.png', style: 'display:none', onchange: (e) => loadUpload([...e.target.files]) });
  const view = h('.view3d', { style: 'height:260px;flex:none;border-radius:8px;overflow:hidden' }, h('.hud', {}, h('span.chip', {}, 'loading…')));
  const sliders = h('div', { style: 'max-height:220px;overflow:auto' }), state = h('pre.mono', { style: 'font-size:12px;white-space:pre-wrap;margin:6px 0 0' });
  const msg = note('');
  box.append(wrap(h('.row', { style: 'gap:8px' }, h('span', { style: 'font-size:12.5px' }, 'Robot'), sel, file), view, sliders, state, msg));
  sel.onchange = () => (sel.value === 'upload' ? file.click() : show(() => loadRobot(sel.value)));

  async function show(get) {
    try {
      const next = await get(); if (!alive) return;
      viewer?.dispose(); rb?.data.delete(); rb?.model.delete(); rb = next;
      const r = rb.r || { groups: null, cam: [0.8, -0.8, 0.6], look: [0, 0, 0.15] };
      view.querySelector('.chip').textContent = r.name || 'your robot';
      viewer = new Viewer(view, { cam: r.cam, look: r.look, groups: r.groups, minDist: 0.15, maxDist: 4 });
      viewer.setSim(rb); buildSliders();
      msg.textContent = rb.r ? `${rb.r.name} from MuJoCo Menagerie: ${rb.model.njnt} joints, ${rb.model.nu} actuators.` : msg.textContent;
    } catch (e) { msg.textContent = `Could not load: ${String(e.message || e).replace('MuJoCo Error: ', '')}`; }
  }
  function buildSliders() {
    const { mj, model: m, data: d } = rb, rows = [];
    for (let j = 0; j < m.njnt; j++) {
      const type = m.jnt_type[j]; if (type !== 2 && type !== 3) continue;  // hinge (3) and slide (2) only
      const adr = m.jnt_qposadr[j], lim = m.jnt_limited ? m.jnt_limited[j] : 1;
      let [lo, hi] = [m.jnt_range[2 * j], m.jnt_range[2 * j + 1]]; if (!lim || lo === hi) [lo, hi] = type === 3 ? [-Math.PI, Math.PI] : [-0.1, 0.1];
      const hinge = type === 3, k = hinge ? 1 / D : 1000;
      rows.push(slider(nameOf(mj, m, 'mjOBJ_JOINT', j) || `joint ${j}`, { min: lo * k, max: hi * k, step: hinge ? 1 : 0.5, value: d.qpos[adr] * k, fmt: (v) => (hinge ? `${v.toFixed(0)}°` : `${v.toFixed(1)} mm`), on: (v) => { d.qpos[adr] = v / k; mj.mj_forward(m, d); upd(); } })[0]);
    }
    fill(sliders, rows.length ? rows : note('This model has no hinge or slide joints.'));
    mj.mj_forward(m, d); upd();
  }
  function upd() {
    const { mj, model: m, data: d } = rb, names = [], vals = [];
    for (let j = 0; j < m.njnt; j++) { const t = m.jnt_type[j]; if (t !== 2 && t !== 3) continue; names.push(nameOf(mj, m, 'mjOBJ_JOINT', j)); vals.push(d.qpos[m.jnt_qposadr[j]].toFixed(3)); }
    state.textContent = `joint_state = [${vals.join(', ')}]   # radians (metres for sliders)\n# ${names.join(', ')}`;
  }
  async function loadUpload(files) {
    if (!files.length) { sel.value = 'so101'; return; }
    show(async () => {
      const mj = await loadMujoco(), dir = `/upload${Date.now()}`; mj.FS.mkdirTree(dir);
      const main = files.find((f) => /\.urdf$/i.test(f.name)) || files.filter((f) => /\.xml$/i.test(f.name)).sort((a, b) => b.size - a.size)[0];
      if (!main) throw new Error('pick the robot’s .urdf or .xml file (plus its mesh files)');
      for (const f of files) if (f !== main) mj.FS.writeFile(`${dir}/${f.name}`, new Uint8Array(await f.arrayBuffer()));
      // Mesh paths in downloaded robots point into packages and sub-folders; we flatten everything into one folder.
      let text = (await main.text()).replace(/(filename|file)="([^"]*?)([^"/\\]+)"/g, '$1="$3"').replace(/\smeshdir="[^"]*"/g, '').replace(/\stexturedir="[^"]*"/g, '');
      if (/<robot\b/.test(text) && !/<mujoco>/.test(text)) text = text.replace(/<robot([^>]*)>/, '<robot$1><mujoco><compiler discardvisual="false" balanceinertia="true"/></mujoco>');
      mj.FS.writeFile(`${dir}/${main.name}`, text);
      const model = mj.MjModel.from_xml_path(`${dir}/${main.name}`), data = new mj.MjData(model);
      msg.textContent = `${main.name}: ${model.njnt} joints, ${model.nmesh} meshes. MuJoCo reads URDF directly; missing meshes are the usual error, so select them together with the URDF.`;
      return { mj, model, data, r: null };
    });
  }
  show(() => loadRobot('so101'));
  const loop = () => { if (!alive) return; viewer?.draw(); raf = requestAnimationFrame(loop); }; loop();
  return () => { alive = false; cancelAnimationFrame(raf); viewer?.dispose(); rb?.data.delete(); rb?.model.delete(); };
}

// Planar arm: sliders for θ1…θn, angle arcs, live forward kinematics. Presets use real link lengths; "custom" lets you add links.
const PRESETS = { so101: 'SO-101 (real lengths)', yam: 'YAM (real lengths)', custom: 'Custom arm (add links)' };
function armfk(box) {
  let alive = true, raf, preset = 'so101', rb = null, chain = null, viewer = null;
  let L = [0.116, 0.135], th = [60 * D, -70 * D];
  const sel = h('select', { onchange: (e) => setPreset(e.target.value) }, Object.entries(PRESETS).map(([k, v]) => h('option', { value: k }, v)));
  const addB = h('button.small.ghost', { onclick: () => { if (L.length < 5) { L.push(0.08); th.push(20 * D); build(); } } }, '+ link');
  const rmB = h('button.small.ghost', { onclick: () => { if (L.length > 1) { L.pop(); th.pop(); build(); } } }, '− link');
  const [c, g] = cv(360, 250), view = h('.view3d', { style: 'height:250px;flex:1;min-width:200px;border-radius:8px;overflow:hidden' });
  const sl = h('div'), formula = h('pre.mono', { style: 'font-size:12px;white-space:pre-wrap;margin:6px 0 0' });
  box.append(wrap(h('.row', { style: 'gap:8px;flex-wrap:wrap' }, h('span', { style: 'font-size:12.5px' }, 'Arm'), sel, addB, rmB),
    h('.row', { style: 'gap:8px;align-items:stretch;flex-wrap:wrap' }, c, view), sl, formula,
    note('θ₁ is measured from the table (horizontal). Every later θ is measured from the previous link (the dashed line), so a link’s direction is the running sum θ₁ + θ₂ + …. The 3D robot gets the exact same angles, converted to its own joint commands.')));
  async function setPreset(p) {
    preset = p; addB.hidden = rmB.hidden = p !== 'custom';
    if (p === 'custom') { viewer?.dispose(); viewer = null; view.hidden = true; L = [0.12, 0.1, 0.07]; th = [50 * D, -40 * D, -30 * D]; build(); return; }
    view.hidden = false;
    if (!loaded[p]) loaded[p] = loadRobot(p);
    rb = await loaded[p]; if (!alive || preset !== p) return;
    chain = planarChain(rb); L = chain.L.slice(); th = chain.offset.map((o, i) => o + chain.sign[i] * rb.r.q0[i]);
    viewer?.dispose(); viewer = new Viewer(view, { cam: rb.r.cam, look: rb.r.look, groups: rb.r.groups, minDist: 0.15, maxDist: 3 }); viewer.setSim(rb);
    build();
  }
  function build() {
    fill(sl, th.map((t, i) => {
      const [lo, hi] = chain && preset !== 'custom' ? chain.thetaRange(i).map((x) => x / D) : [-180, 180];
      return slider(`θ${i + 1}${chain && preset !== 'custom' ? ` (${rb.r.joints[i]})` : ''}`, { min: Math.floor(lo), max: Math.ceil(hi), value: Math.round(t / D), fmt: (v) => `${v}°`, on: (v) => { th[i] = v * D; draw(); } })[0];
    }));
    draw();
  }
  function draw() {
    const reach = L.reduce((a, b) => a + b, 0), S = 165 / reach, ox = 175, oy = 205;
    g.clearRect(0, 0, 360, 250);
    g.strokeStyle = C.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(10, oy); g.lineTo(350, oy); g.stroke();
    g.fillStyle = C.dim; g.fillRect(ox - 18, oy, 36, 8);
    let x = 0, y = 0, a = 0; const pts = [[0, 0]];
    th.forEach((t, i) => {
      const px = ox + x * S, py = oy - y * S, prevA = a; a += t;
      // reference direction (table or previous link) and the angle arc
      g.setLineDash([4, 4]); g.strokeStyle = C.dim; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(prevA) * 34, py - Math.sin(prevA) * 34); g.stroke(); g.setLineDash([]);
      g.strokeStyle = i ? C.blue : C.acc; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 22 + 4 * i, -prevA, -a, t > 0); g.stroke();
      const mid = prevA + t / 2; g.fillStyle = i ? C.blue : C.acc; g.fillText(`θ${'₁₂₃₄₅'[i]}`, px + Math.cos(mid) * (34 + 4 * i) - 6, py - Math.sin(mid) * (34 + 4 * i) + 4);
      x += L[i] * Math.cos(a); y += L[i] * Math.sin(a); pts.push([x, y]);
    });
    g.strokeStyle = '#c9d1e0'; g.lineWidth = 7; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(ox + px * S, oy - py * S) : g.moveTo(ox, oy))); g.stroke();
    pts.forEach(([px, py], i) => { g.fillStyle = i === pts.length - 1 ? C.ok : '#2e3542'; g.beginPath(); g.arc(ox + px * S, oy - py * S, i === pts.length - 1 ? 6 : 5, 0, 7); g.fill(); });
    g.fillStyle = C.text; g.fillText(`hand: x = ${x.toFixed(3)} m, y = ${y.toFixed(3)} m`, 10, 18);
    const terms = (f) => L.map((l, i) => `${l.toFixed(3)}·${f}(${th.slice(0, i + 1).map((t) => `${(t / D).toFixed(0)}°`).join('+')})`).join(' + ');
    formula.textContent = `x = ${terms('cos')}\n  = ${x.toFixed(3)}\ny = ${terms('sin')}\n  = ${y.toFixed(3)}`;
    if (chain && preset !== 'custom') chain.set(th);
  }
  setPreset('so101');
  const loop = () => { if (!alive) return; viewer?.draw(); raf = requestAnimationFrame(loop); }; loop();
  return () => { alive = false; cancelAnimationFrame(raf); viewer?.dispose(); };
}

// Inverse kinematics: drag the target; both solutions (elbow down / elbow up) drawn.
function armik(box) {
  let L1 = 0.116, L2 = 0.135, T = [0.15, 0.1], drag = false;
  const lens = { so101: [0.116, 0.135], yam: [0.264, 0.252], equal: [0.22, 0.22] };
  const sel = h('select', { onchange: (e) => { [L1, L2] = lens[e.target.value]; const k = (L1 + L2) / 0.251; T = [0.15 * k, 0.1 * k]; s1i.setValue(L1 * 1000); s2i.setValue(L2 * 1000); draw(); } },
    h('option', { value: 'so101' }, 'SO-101 (0.116 + 0.135 m)'), h('option', { value: 'yam' }, 'YAM (0.264 + 0.252 m)'), h('option', { value: 'equal' }, 'Equal links (0.22 + 0.22 m)'));
  const [s1, s1i] = slider('L1 (mm)', { min: 50, max: 300, value: 116, on: (v) => { L1 = v / 1000; draw(); } });
  const [s2, s2i] = slider('L2 (mm)', { min: 50, max: 300, value: 135, on: (v) => { L2 = v / 1000; draw(); } });
  const [c, g] = cv(360, 260), info = h('pre.mono', { style: 'font-size:12px;margin:6px 0 0;white-space:pre-wrap' });
  box.append(wrap(h('.row', { style: 'gap:8px' }, h('span', { style: 'font-size:12.5px' }, 'Arm'), sel), c, s1, s2, info,
    note('Drag the orange target. Inside the ring there are usually two answers (elbow down, elbow up). Outside the ring: no answer at all, cos θ₂ would be bigger than 1.')));
  const S = () => 110 / (L1 + L2), O = [180, 150];
  const toWorld = (e) => { const r = c.getBoundingClientRect(), k = 360 / r.width; return [((e.clientX - r.left) * k - O[0]) / S(), (O[1] - (e.clientY - r.top) * k) / S()]; };
  c.onpointerdown = (e) => { drag = true; T = toWorld(e); draw(); }; c.onpointermove = (e) => { if (drag) { T = toWorld(e); draw(); } }; c.onpointerup = c.onpointerleave = () => { drag = false; };
  function arm(t1, t2, col, w) {
    const s = S(), ex = L1 * Math.cos(t1), ey = L1 * Math.sin(t1);
    g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(O[0], O[1]); g.lineTo(O[0] + ex * s, O[1] - ey * s); g.lineTo(O[0] + (ex + L2 * Math.cos(t1 + t2)) * s, O[1] - (ey + L2 * Math.sin(t1 + t2)) * s); g.stroke();
  }
  function draw() {
    const s = S(); g.clearRect(0, 0, 360, 260);
    g.fillStyle = 'rgba(79,208,138,0.07)'; g.beginPath(); g.arc(O[0], O[1], (L1 + L2) * s, 0, 7); g.arc(O[0], O[1], Math.abs(L1 - L2) * s, 0, 7, true); g.fill();
    g.strokeStyle = C.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(10, O[1]); g.lineTo(350, O[1]); g.stroke();
    const [x, y] = T, c2 = (x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    if (Math.abs(c2) <= 1) {
      const sols = [Math.acos(c2), -Math.acos(c2)].map((t2) => [Math.atan2(y, x) - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2)), t2]);
      arm(...sols[1], 'rgba(106,176,255,0.45)', 5); arm(...sols[0], '#c9d1e0', 7);
      info.textContent = `target (${x.toFixed(3)}, ${y.toFixed(3)})   cos θ₂ = ${c2.toFixed(3)}\nwhite:  θ₁ = ${(sols[0][0] / D).toFixed(1)}°, θ₂ = ${(sols[0][1] / D).toFixed(1)}°\nblue:   θ₁ = ${(sols[1][0] / D).toFixed(1)}°, θ₂ = ${(sols[1][1] / D).toFixed(1)}°`;
    } else info.textContent = `target (${x.toFixed(3)}, ${y.toFixed(3)})   cos θ₂ = ${c2.toFixed(2)}: out of reach`;
    g.strokeStyle = C.acc; g.lineWidth = 2; const tx = O[0] + x * s, ty = O[1] - y * s; g.beginPath(); g.arc(tx, ty, 8, 0, 7); g.moveTo(tx - 12, ty); g.lineTo(tx + 12, ty); g.moveTo(tx, ty - 12); g.lineTo(tx, ty + 12); g.stroke();
  }
  draw();
}

function unitcircle(box) {
  let deg = 45; const [c, g] = cv(360, 200), out = h('pre.mono', { style: 'font-size:12.5px;margin:6px 0 0' });
  const [s] = slider('angle', { min: -360, max: 360, value: 45, fmt: (v) => `${v}°`, on: (v) => { deg = v; draw(); } });
  box.append(wrap(c, s, out, note('A radian is the angle where the arc is as long as the radius. Half a turn is π ≈ 3.14 of them.')));
  function draw() {
    const r = 70, o = [110, 100], a = deg * D; g.clearRect(0, 0, 360, 200);
    g.strokeStyle = C.grid; g.lineWidth = 1; g.beginPath(); g.arc(o[0], o[1], r, 0, 7); g.moveTo(o[0] - 90, o[1]); g.lineTo(o[0] + 90, o[1]); g.stroke();
    g.strokeStyle = C.acc; g.lineWidth = 4; g.beginPath(); g.arc(o[0], o[1], r, 0, -a, a > 0); g.stroke();
    g.strokeStyle = C.text; g.lineWidth = 3; g.beginPath(); g.moveTo(...o); g.lineTo(o[0] + r * Math.cos(a), o[1] - r * Math.sin(a)); g.stroke();
    g.fillStyle = C.text; g.font = '14px system-ui'; g.fillText(`${deg}°`, 230, 70); g.fillStyle = C.acc; g.fillText(`= ${(a).toFixed(3)} rad`, 230, 95); g.fillStyle = C.dim; g.fillText(`= ${(deg / 180).toFixed(3)} π`, 230, 120); g.font = '12px system-ui';
    out.textContent = `radians = ${deg} × π / 180 = ${a.toFixed(4)}`;
  }
  draw();
}

// ───────────── control ─────────────
function loop_(box) {
  let target = 1, kp = 4, hz = 20, q = 0, t = 0, alive = true, raf, last = performance.now(), acc = 0; const hist = [];
  const [c, g] = cv(380, 170), chart = h('canvas.chart', { style: 'height:110px' });
  const [a] = slider('target', { min: -2, max: 2, step: 0.1, value: 1, fmt: (v) => `${v.toFixed(1)} rad`, on: (v) => { target = v; } });
  const [b] = slider('kp', { min: 0, max: 30, step: 0.5, value: 4, fmt: (v) => v.toFixed(1), on: (v) => { kp = v; } });
  const [d] = slider('loop rate', { min: 2, max: 100, value: 20, fmt: (v) => `${v} Hz`, on: (v) => { hz = v; } });
  box.append(wrap(c, a, b, d, chart, note('Every tick the loop does the same three things: sense the joint angle, compare it with the target, act with a command proportional to the error. Move the target and watch the numbers flow around the loop.')));
  const boxAt = (x, y, w, label, val, col) => { g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(x, y, w, 40); g.fillStyle = C.dim; g.fillText(label, x + 6, y + 15); g.fillStyle = col; g.font = '13px monospace'; g.fillText(val, x + 6, y + 32); g.font = '12px system-ui'; };
  function frame(now) {
    if (!alive) return; const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    while (acc >= 1 / hz) { acc -= 1 / hz; const u = kp * (target - q); q += u / hz; t += 1 / hz; hist.push([target, q]); if (hist.length > 160) hist.shift(); }
    const e = target - q, u = kp * e;
    g.clearRect(0, 0, 380, 170);
    boxAt(8, 20, 78, 'target', target.toFixed(2), C.acc); boxAt(110, 20, 78, 'error', e.toFixed(2), C.blue); boxAt(212, 20, 78, 'command', u.toFixed(2), C.ok);
    // the joint as a dial
    g.strokeStyle = C.grid; g.lineWidth = 1; g.beginPath(); g.arc(335, 40, 30, 0, 7); g.stroke();
    g.strokeStyle = C.acc; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(335, 40); g.lineTo(335 + 30 * Math.cos(target), 40 - 30 * Math.sin(target)); g.stroke(); g.setLineDash([]);
    g.strokeStyle = C.text; g.lineWidth = 4; g.beginPath(); g.moveTo(335, 40); g.lineTo(335 + 28 * Math.cos(q), 40 - 28 * Math.sin(q)); g.stroke();
    g.fillStyle = C.dim; g.fillText('joint', 320, 88);
    arrow(g, 86, 40, 108, 40, C.dim); arrow(g, 188, 40, 210, 40, C.dim); arrow(g, 290, 40, 302, 40, C.dim);
    g.strokeStyle = C.dim; g.beginPath(); g.moveTo(335, 72); g.lineTo(335, 130); g.lineTo(150, 130); g.stroke(); arrow(g, 150, 130, 150, 62, C.dim);
    g.fillStyle = C.dim; g.fillText(`sense: measured ${q.toFixed(2)} rad`, 170, 148); g.fillText('−', 140, 72);
    g.fillText(`${hz} Hz · e = target − measured · command = kp · e`, 8, 166);
    if (hist.length > 2) plot(chart, [{ data: hist.map((p) => p[0]), color: C.dim }, { data: hist.map((p) => p[1]), color: C.acc }], { ymin: -2.2, ymax: 2.2 });
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); };
}

function presp(box) {
  let kp = 8, hz = 20; const chart = h('canvas.chart', { style: 'height:150px' }), verdict = h('p', { style: 'font-size:13px;margin:4px 0 0' });
  const [a] = slider('kp', { min: 0.5, max: 50, step: 0.5, value: 8, fmt: (v) => v.toFixed(1), on: (v) => { kp = v; draw(); } });
  const [b] = slider('loop rate', { min: 5, max: 200, value: 20, fmt: (v) => `${v} Hz`, on: (v) => { hz = v; draw(); } });
  box.append(wrap(chart, a, b, verdict, note('q ← q + kp·(target − q)·dt. Each tick closes a fraction kp·dt of the remaining gap. Above kp·dt = 1 it jumps past the target; above 2 every jump is bigger than the last.')));
  function draw() {
    const dt = 1 / hz, n = Math.round(2 / dt); let q = 0; const data = [0];
    for (let i = 0; i < n; i++) { q += kp * (1 - q) * dt; data.push(Math.max(-1, Math.min(3, q))); }
    const step = Math.max(1, Math.floor(data.length / 120)), ds = data.filter((_, i) => i % step === 0);
    plot(chart, [{ data: ds.map(() => 1), color: C.dim }, { data: ds, color: C.acc }], { ymin: -0.2, ymax: 2 });
    const f = kp * dt;
    verdict.innerHTML = `kp·dt = <b>${f.toFixed(2)}</b>: ${f < 0.05 ? 'crawls: far too slow' : f <= 1 ? (data.findIndex((v) => Math.abs(v - 1) < 0.01) * dt < 1 ? '<span class="good">smooth, no overshoot, settles within 1 s</span>' : 'smooth but slow') : f < 2 ? '<span style="color:var(--accent)">overshoots and rings</span>' : '<span class="bad">unstable: it blows up</span>'}`;
  }
  draw();
}

// A joint with inertia: I·q̈ = kp·e − kd·q̇
function pdresp(box) {
  let kp = 2, kd = 0.05, I = 0.01; const chart = h('canvas.chart', { style: 'height:150px' }), verdict = h('p', { style: 'font-size:13px;margin:4px 0 0' });
  const rows = [slider('kp (N·m/rad)', { min: 0, max: 10, step: 0.1, value: kp, fmt: (v) => v.toFixed(1), on: (v) => { kp = v; draw(); } })[0],
    slider('kd (N·m·s/rad)', { min: 0, max: 0.6, step: 0.005, value: kd, fmt: (v) => v.toFixed(3), on: (v) => { kd = v; draw(); } })[0],
    slider('inertia (kg·m²)', { min: 0.002, max: 0.05, step: 0.001, value: I, fmt: (v) => v.toFixed(3), on: (v) => { I = v; draw(); } })[0]];
  box.append(wrap(chart, ...rows, verdict, note('A real joint has mass, so the controller sets a torque (acceleration), not a speed. kp is a spring pulling toward the target; kd is a shock absorber. Damping ratio ζ = kd / (2·√(kp·I)): below 1 it overshoots, at 1 it arrives fastest without overshoot.')));
  function draw() {
    let q = 0, v = 0; const dt = 0.002, data = [];
    for (let i = 0; i <= 1000; i++) { if (i % 8 === 0) data.push(q); const tau = kp * (1 - q) - kd * v; v += (tau / I) * dt; q += v * dt; }
    plot(chart, [{ data: data.map(() => 1), color: C.dim }, { data: data.map((x) => Math.max(-0.5, Math.min(2.5, x))), color: C.acc }], { ymin: -0.2, ymax: 2 });
    const z = kp > 0 ? kd / (2 * Math.sqrt(kp * I)) : 0, peak = Math.max(...data);
    verdict.innerHTML = `ζ = <b>${z.toFixed(2)}</b> · overshoot ${Math.max(0, (peak - 1) * 100).toFixed(0)}% · ${z < 0.05 ? '<span class="bad">barely damped: it oscillates</span>' : z < 0.9 ? '<span style="color:var(--accent)">underdamped</span>' : z <= 1.15 ? '<span class="good">near critical damping</span>' : 'overdamped: no overshoot but sluggish'}`;
  }
  draw();
}

// A link held up against gravity: P, PD, PID, gravity feed-forward
function gravity(box) {
  let kp = 1.5, ki = 3, kd = 0.06, mode = 'pd', ff = false, target = 0;
  const m = 0.15, lc = 0.06, I = m * lc * lc + 0.0008, G = 9.81;
  const [c, g] = cv(360, 170), chart = h('canvas.chart', { style: 'height:120px' }), info = h('p', { style: 'font-size:13px;margin:4px 0 0' });
  const modes = h('.row', { style: 'gap:6px' }, ['p', 'pd', 'pid'].map((k) => h('button.small' + (k === mode ? '' : '.ghost'), { 'data-m': k, onclick: (e) => { mode = k; modes.querySelectorAll('button').forEach((b) => b.classList.toggle('ghost', b.dataset.m !== k)); draw(); } }, k.toUpperCase())),
    h('label.row', { style: 'gap:4px;font-size:12.5px' }, h('input', { type: 'checkbox', onchange: (e) => { ff = e.target.checked; draw(); } }), '+ gravity feed-forward'));
  const rows = [slider('kp', { min: 0, max: 6, step: 0.1, value: kp, fmt: (v) => v.toFixed(1), on: (v) => { kp = v; draw(); } })[0],
    slider('ki', { min: 0, max: 15, step: 0.5, value: ki, fmt: (v) => v.toFixed(1), on: (v) => { ki = v; draw(); } })[0],
    slider('kd', { min: 0, max: 0.3, step: 0.005, value: kd, fmt: (v) => v.toFixed(3), on: (v) => { kd = v; draw(); } })[0],
    slider('target', { min: -60, max: 60, value: 0, fmt: (v) => `${v}°`, on: (v) => { target = v * D; draw(); } })[0]];
  box.append(wrap(c, modes, ...rows, chart, info, note('Hold an SO-101-sized forearm (150 g) out sideways. Gravity pulls down with torque m·g·l·cos q. A spring-like P (or PD) controller only pushes back when there is an error, so it must sag to hold the weight. The integral term or a gravity feed-forward removes the sag.')));
  function draw() {
    let q = target - 0.3, v = 0, integ = 0; const dt = 0.002, data = [];
    for (let i = 0; i <= 1500; i++) {
      const e = target - q; integ += e * dt;
      let tau = kp * e + (mode !== 'p' ? -kd * v : 0) + (mode === 'pid' ? ki * integ : 0) + (ff ? m * G * lc * Math.cos(q) : 0);
      tau = Math.max(-1.5, Math.min(1.5, tau));
      const acc = (tau - m * G * lc * Math.cos(q)) / I; v += acc * dt; q += v * dt;
      if (i % 10 === 0) data.push(q / D);
    }
    plot(chart, [{ data: data.map(() => target / D), color: C.dim }, { data: data.map((x) => Math.max(-120, Math.min(120, x))), color: C.acc }], { ymin: -100, ymax: 100 });
    const err = target / D - data.at(-1);
    info.innerHTML = `after 3 s the error is <b>${err.toFixed(1)}°</b>${Math.abs(err) < 0.5 ? ' <span class="good">(holds the target)</span>' : ' <span style="color:var(--accent)">(sag)</span>'}`;
    g.clearRect(0, 0, 360, 170); const o = [120, 85], qe = data.at(-1) * D;
    g.strokeStyle = C.dim; g.setLineDash([4, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(...o); g.lineTo(o[0] + 120 * Math.cos(target), o[1] - 120 * Math.sin(target)); g.stroke(); g.setLineDash([]);
    g.strokeStyle = C.text; g.lineWidth = 9; g.beginPath(); g.moveTo(...o); g.lineTo(o[0] + 120 * Math.cos(qe), o[1] - 120 * Math.sin(qe)); g.stroke();
    g.fillStyle = C.dim; g.beginPath(); g.arc(...o, 9, 0, 7); g.fill();
    arrow(g, o[0] + 60 * Math.cos(qe), o[1] - 60 * Math.sin(qe), o[0] + 60 * Math.cos(qe), o[1] - 60 * Math.sin(qe) + 40, C.bad); g.fillStyle = C.bad; g.fillText('m·g', o[0] + 60 * Math.cos(qe) + 6, o[1] - 60 * Math.sin(qe) + 34);
  }
  draw();
}

// Two-link arm in the vertical plane: joint-space PD (+ gravity compensation), simulated live in MuJoCo.
export const ARM2_XML = (L1 = 0.116, L2 = 0.135, m1 = 0.12, m2 = 0.15) => `<mujoco model="arm2">
  <option timestep="0.002" integrator="implicitfast"/>
  <worldbody>
    <light pos="0 -1 1.5" dir="0 1 -1"/>
    <geom type="plane" size="0.5 0.5 0.01" pos="0 0 -0.3" rgba="0.2 0.22 0.26 1"/>
    <geom type="cylinder" size="0.03 0.04" pos="0 0 -0.02" rgba="0.45 0.48 0.55 1" contype="0" conaffinity="0"/>
    <body name="upper" pos="0 0 0">
      <joint name="j1" type="hinge" axis="0 -1 0" damping="0.002"/>
      <geom type="capsule" fromto="0 0 0 ${L1} 0 0" size="0.016" mass="${m1}" rgba="0.95 0.6 0.25 1" contype="0" conaffinity="0"/>
      <body name="fore" pos="${L1} 0 0">
        <joint name="j2" type="hinge" axis="0 -1 0" damping="0.002"/>
        <geom type="capsule" fromto="0 0 0 ${L2} 0 0" size="0.013" mass="${m2}" rgba="0.8 0.82 0.88 1" contype="0" conaffinity="0"/>
        <site name="hand" pos="${L2} 0 0" size="0.012" rgba="0.3 0.82 0.54 1"/>
      </body>
    </body>
  </worldbody>
  <actuator><motor joint="j1" ctrlrange="-3 3"/><motor joint="j2" ctrlrange="-3 3"/></actuator>
</mujoco>`;
// Gravity torques for that arm (capsules: centre of mass at mid-link), q measured up from horizontal.
export function arm2Gravity(q, L1 = 0.116, L2 = 0.135, m1 = 0.12, m2 = 0.15, G = 9.81) {
  const g2 = m2 * G * (L2 / 2) * Math.cos(q[0] + q[1]);
  return [(m1 * L1 / 2 + m2 * L1) * G * Math.cos(q[0]) + g2, g2];
}
function armctl(box) {
  let kp = 3, kd = 0.08, comp = true, target = [40 * D, -60 * D], alive = true, raf, mj, m, d, viewer, err = h('pre.mono', { style: 'font-size:12px;margin:6px 0 0' });
  const view = h('.view3d', { style: 'height:240px;flex:none;border-radius:8px;overflow:hidden' }, h('.hud', {}, h('span.chip', {}, 'MuJoCo: 2-link arm, SO-101 sizes')));
  const rows = [slider('target θ₁', { min: -30, max: 120, value: 40, fmt: (v) => `${v}°`, on: (v) => { target[0] = v * D; } })[0],
    slider('target θ₂', { min: -150, max: 150, value: -60, fmt: (v) => `${v}°`, on: (v) => { target[1] = v * D; } })[0],
    slider('kp', { min: 0, max: 10, step: 0.1, value: kp, fmt: (v) => v.toFixed(1), on: (v) => { kp = v; } })[0],
    slider('kd', { min: 0, max: 0.4, step: 0.005, value: kd, fmt: (v) => v.toFixed(3), on: (v) => { kd = v; } })[0]];
  const chk = h('label.row', { style: 'gap:6px;font-size:12.5px' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { comp = e.target.checked; } }), 'gravity compensation g(q)');
  box.append(wrap(view, ...rows, chk, err, note('Each joint gets its own PD torque, plus the torque gravity needs at this pose. Untick gravity compensation and the forearm sags; raise kp and it sags less but rings more.')));
  (async () => {
    mj = await loadMujoco(); if (!alive) return;
    m = mj.MjModel.from_xml_string(ARM2_XML()); d = new mj.MjData(m); d.qpos[0] = target[0]; d.qpos[1] = target[1]; mj.mj_forward(m, d);
    viewer = new Viewer(view, { cam: [0.05, -0.55, 0.12], look: [0.08, 0, 0.02], minDist: 0.2, maxDist: 2 }); viewer.setSim({ model: m, data: d });
    let last = performance.now();
    const frame = (now) => {
      if (!alive) return; const n = Math.min(25, Math.round((now - last) / 2)); last = now;
      for (let k = 0; k < n; k++) {
        const q = [d.qpos[0], d.qpos[1]], v = [d.qvel[0], d.qvel[1]], gq = comp ? arm2Gravity(q) : [0, 0];
        for (let i = 0; i < 2; i++) d.ctrl[i] = kp * (target[i] - q[i]) - kd * v[i] + gq[i];
        mj.mj_step(m, d);
      }
      err.textContent = `error θ₁ ${((target[0] - d.qpos[0]) / D).toFixed(1)}°   θ₂ ${((target[1] - d.qpos[1]) / D).toFixed(1)}°   torques ${d.ctrl[0].toFixed(2)}, ${d.ctrl[1].toFixed(2)} N·m`;
      viewer.draw(); raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  })();
  return () => { alive = false; cancelAnimationFrame(raf); viewer?.dispose(); d?.delete(); m?.delete(); };
}

// ───────────── other courses ─────────────
function compound(box) {
  let p = 0.95, n = 6, r = 0; const [c, g] = cv(360, 150), out = h('p', { style: 'font-size:13px;margin:4px 0 0' });
  const rows = [slider('per-step success', { min: 0.5, max: 0.999, step: 0.001, value: p, fmt: (v) => `${(v * 100).toFixed(1)}%`, on: (v) => { p = v; draw(); } })[0],
    slider('steps', { min: 1, max: 30, value: n, on: (v) => { n = v; draw(); } })[0],
    slider('retries per step', { min: 0, max: 3, value: 0, on: (v) => { r = v; draw(); } })[0]];
  box.append(wrap(c, ...rows, out));
  function draw() {
    const ps = 1 - (1 - p) ** (r + 1), task = ps ** n; g.clearRect(0, 0, 360, 150);
    for (let i = 0; i < n; i++) { const w = 330 / n; g.fillStyle = C.grid; g.fillRect(15 + i * w, 40, w - 3, 50); g.fillStyle = C.ok; g.fillRect(15 + i * w, 40 + 50 * (1 - ps ** (i + 1)), w - 3, 50 * ps ** (i + 1)); }
    g.fillStyle = C.text; g.fillText('chance the task is still on track after each step', 15, 25);
    out.innerHTML = `Whole task: <b>${(task * 100).toFixed(1)}%</b>${r ? ` (each step ${(ps * 100).toFixed(2)}% with ${r} retr${r > 1 ? 'ies' : 'y'})` : ''}. Retrying a failed step is what failure recovery buys you.`;
  }
  draw();
}
function diffarc(box) {
  let wl = 6, wr = 9; const R = 0.035, T = 0.13; const [c, g] = cv(360, 220), out = h('pre.mono', { style: 'font-size:12px;margin:6px 0 0' });
  const rows = [slider('left wheel', { min: -12, max: 12, step: 0.5, value: wl, fmt: (v) => `${v} rad/s`, on: (v) => { wl = v; draw(); } })[0], slider('right wheel', { min: -12, max: 12, step: 0.5, value: wr, fmt: (v) => `${v} rad/s`, on: (v) => { wr = v; draw(); } })[0]];
  box.append(wrap(c, ...rows, out, note('Two seconds of driving from the same start. Equal speeds: straight. Opposite speeds: spin in place.')));
  function draw() {
    const v = R * (wr + wl) / 2, w = R * (wr - wl) / T; let x = 0, y = 0, th = 0; g.clearRect(0, 0, 360, 220);
    const S = 220, o = [70, 150]; g.strokeStyle = C.acc; g.lineWidth = 2; g.beginPath(); g.moveTo(...o);
    for (let i = 0; i < 200; i++) { x += v * Math.cos(th) * 0.01; y += v * Math.sin(th) * 0.01; th += w * 0.01; g.lineTo(o[0] + x * S, o[1] - y * S); } g.stroke();
    g.save(); g.translate(o[0] + x * S, o[1] - y * S); g.rotate(-th); g.fillStyle = C.blue; g.fillRect(-12, -9, 24, 18); g.fillStyle = C.text; g.fillRect(-4, -12, 10, 3); g.fillRect(-4, 9, 10, 3); g.restore();
    out.textContent = `v = r(ωR+ωL)/2 = ${v.toFixed(3)} m/s    ω = r(ωR−ωL)/T = ${w.toFixed(2)} rad/s    turn radius ${Math.abs(w) < 1e-6 ? '∞' : (v / w).toFixed(2) + ' m'}`;
  }
  draw();
}
function bicycle(box) {
  let L = 2.7, delta = 20; const [c, g] = cv(360, 220), out = h('pre.mono', { style: 'font-size:12px;margin:6px 0 0' });
  const rows = [slider('wheelbase', { min: 1, max: 6, step: 0.1, value: L, fmt: (v) => `${v.toFixed(1)} m`, on: (v) => { L = v; draw(); } })[0], slider('steering δ', { min: -40, max: 40, value: delta, fmt: (v) => `${v}°`, on: (v) => { delta = v; draw(); } })[0]];
  box.append(wrap(c, ...rows, out, note('A car (blue) and its turning circle. Longer wheelbase or less steering: a wider circle. That is why trucks swing wide.')));
  function draw() {
    g.clearRect(0, 0, 360, 220); const d = delta * D, R = Math.abs(d) < 1e-3 ? Infinity : L / Math.tan(d), S = 9, o = [180, 150];
    if (isFinite(R)) { g.strokeStyle = C.acc; g.lineWidth = 1.5; g.beginPath(); g.arc(o[0], o[1] - R * S, Math.abs(R) * S, 0, 7); g.stroke(); g.fillStyle = C.acc; g.beginPath(); g.arc(o[0], o[1] - R * S, 3, 0, 7); g.fill(); }
    g.fillStyle = C.blue; g.fillRect(o[0] - 0.5 * S, o[1] - 0.9 * S, (L + 1) * S, 1.8 * S);
    g.save(); g.translate(o[0] + L * S, o[1]); g.rotate(-d); g.fillStyle = C.text; g.fillRect(-0.4 * S, -0.15 * S, 0.8 * S, 0.3 * S); g.restore(); g.fillStyle = C.text; g.fillRect(o[0] - 0.4 * S, o[1] - 0.15 * S, 0.8 * S, 0.3 * S);
    out.textContent = `R = L / tan δ = ${isFinite(R) ? Math.abs(R).toFixed(2) + ' m' : '∞ (straight)'}`;
  }
  draw();
}
function kalmanviz(box) {
  let Q = 0.01, R = 1.0; const chart = h('canvas.chart', { style: 'height:150px' }), out = h('p', { style: 'font-size:13px;margin:4px 0 0' });
  const rows = [slider('Q (odometry noise)', { min: 0.0005, max: 0.5, step: 0.0005, value: Q, fmt: (v) => v.toFixed(4), on: (v) => { Q = v; draw(); } })[0], slider('R (GPS noise)', { min: 0.05, max: 10, step: 0.05, value: R, fmt: (v) => v.toFixed(2), on: (v) => { R = v; draw(); } })[0]];
  box.append(wrap(chart, ...rows, out, note('Position error: orange GPS, red odometry, green filter. Small Q/R: trust odometry (smooth, drifts). Large Q/R: trust GPS (noisy).')));
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const truth = [], odo = [], gps = [], us = []; let t = 0, o = 0;
  for (let i = 0; i < 200; i++) { t += 0.1; const u = 0.106 + gauss() * 0.01; o += u; us.push(u); truth.push(t); odo.push(o); gps.push(t + gauss()); }
  function draw() {
    let x = 0, P = 1; const est = us.map((u, i) => { x += u; P += Q; const K = P / (P + R); x += K * (gps[i] - x); P *= 1 - K; return x; });
    const e = (a) => a.map((v, i) => v - truth[i]), rmse = (a) => Math.sqrt(e(a).reduce((s2, v) => s2 + v * v, 0) / a.length);
    plot(chart, [{ data: e(gps), color: C.acc }, { data: e(odo), color: C.bad }, { data: e(est), color: C.ok }], { ymin: -3, ymax: 3 });
    out.innerHTML = `RMSE: GPS ${rmse(gps).toFixed(2)} m · odometry ${rmse(odo).toFixed(2)} m · <b class="good">filter ${rmse(est).toFixed(2)} m</b>`;
  }
  draw();
}
function inclinefbd(box) {
  let ang = 20, mu = 0.5; const [c, g] = cv(360, 200), out = h('p', { style: 'font-size:13px;margin:4px 0 0' });
  const rows = [slider('tilt', { min: 0, max: 60, value: ang, fmt: (v) => `${v}°`, on: (v) => { ang = v; draw(); } })[0], slider('μ', { min: 0.1, max: 1.2, step: 0.01, value: mu, fmt: (v) => v.toFixed(2), on: (v) => { mu = v; draw(); } })[0]];
  box.append(wrap(c, ...rows, out));
  function draw() {
    const a = ang * D, slides = Math.tan(a) > mu; g.clearRect(0, 0, 360, 200); const o = [40, 175];
    g.strokeStyle = C.link; g.lineWidth = 4; g.beginPath(); g.moveTo(...o); g.lineTo(o[0] + 300 * Math.cos(a), o[1] - 300 * Math.sin(a)); g.stroke();
    const bx = o[0] + 150 * Math.cos(a), by = o[1] - 150 * Math.sin(a);
    g.save(); g.translate(bx, by); g.rotate(-a); g.fillStyle = slides ? C.bad : C.acc; g.fillRect(-25, -30, 50, 30); g.restore();
    const cx = bx - 15 * Math.sin(a), cy = by - 15 * Math.cos(a), F = 60;
    const down = F * Math.sin(a), fr = Math.min(down, F * mu * Math.cos(a));
    arrow(g, cx, cy, cx - down * Math.cos(a), cy + down * Math.sin(a), C.bad);
    arrow(g, cx, cy, cx + fr * Math.cos(a), cy - fr * Math.sin(a), C.ok);
    g.fillStyle = C.bad; g.fillText('gravity along slope', 200, 190); g.fillStyle = C.ok; g.fillText('friction', 200, 172);
    out.innerHTML = `pull down the slope m·g·sin θ ∝ <b>${Math.sin(a).toFixed(2)}</b>, max friction μ·m·g·cos θ ∝ <b>${(mu * Math.cos(a)).toFixed(2)}</b> → ${slides ? '<span class="bad">slides</span>' : '<span class="good">holds</span>'}. It starts to slide at θ = atan μ = ${(Math.atan(mu) / D).toFixed(1)}°.`;
  }
  draw();
}
function lookahead(box) {
  let la = 0.4; const [c, g] = cv(360, 200), out = h('p', { style: 'font-size:13px;margin:4px 0 0' });
  const [s] = slider('lookahead', { min: 0.1, max: 1.5, step: 0.05, value: la, fmt: (v) => `${v.toFixed(2)} m`, on: (v) => { la = v; draw(); } });
  box.append(wrap(c, s, out, note('A kinematic robot following an L-shaped street (grey) with pure pursuit. Short lookahead: tight but twitchy. Long: smooth but it cuts the corner.')));
  const path = []; for (let i = 0; i <= 30; i++) path.push([i * 0.1, 0]); for (let i = 1; i <= 20; i++) path.push([3, -i * 0.1]);
  function draw() {
    let x = 0, y = 0.15, th = 0, maxCut = 0; const tr = [];
    for (let k = 0; k < 600; k++) {
      let i0 = 0, b = 1e9; path.forEach((p, i) => { const dd = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (dd < b) { b = dd; i0 = i; } });
      let goal = path.at(-1); for (const p of path.slice(i0)) if (Math.hypot(p[0] - x, p[1] - y) >= la) { goal = p; break; }
      if (Math.hypot(path.at(-1)[0] - x, path.at(-1)[1] - y) < 0.05) break;
      const dx = goal[0] - x, dy = goal[1] - y, xr = Math.cos(th) * dx + Math.sin(th) * dy, yr = -Math.sin(th) * dx + Math.cos(th) * dy, l2 = xr * xr + yr * yr;
      const v = 0.4, w = v * 2 * yr / Math.max(1e-6, l2); x += v * Math.cos(th) * 0.02; y += v * Math.sin(th) * 0.02; th += w * 0.02; tr.push([x, y]);
      maxCut = Math.max(maxCut, Math.min(Math.abs(y), Math.abs(x - 3)) * (x < 3 && y < 0 ? 1 : 0));
    }
    g.clearRect(0, 0, 360, 200); const S = 75, o = [40, 30];
    g.strokeStyle = '#2e3542'; g.lineWidth = 22; g.beginPath(); path.forEach(([px, py], i) => (i ? g.lineTo(o[0] + px * S, o[1] - py * S) : g.moveTo(o[0] + px * S, o[1] - py * S))); g.stroke();
    g.strokeStyle = C.acc; g.lineWidth = 2; g.beginPath(); tr.forEach(([px, py], i) => (i ? g.lineTo(o[0] + px * S, o[1] - py * S) : g.moveTo(o[0] + px * S, o[1] - py * S))); g.stroke();
    out.innerHTML = `corner cut: <b>${(maxCut * 100).toFixed(0)} cm</b> inside the bend${maxCut > 0.2 ? ' <span class="bad">(into the building)</span>' : ''}`;
  }
  draw();
}
function minjerk(box) {
  let blend = 12; const chart = h('canvas.chart', { style: 'height:140px' }), out = h('p', { style: 'font-size:13px;margin:4px 0 0' });
  const [s] = slider('blend (samples)', { min: 0, max: 30, value: blend, on: (v) => { blend = v; draw(); } });
  box.append(wrap(chart, s, out, note('Speed through three moves. Blend 0: the robot stops at each waypoint. Larger blend: the next move starts early and the stops disappear.')));
  const mj = (a, b, n) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return a + (b - a) * (10 * t ** 3 - 15 * t ** 4 + 6 * t ** 5); });
  function draw() {
    const pts = [0, 1, 0.4, 1.2], segs = pts.slice(1).map((p, i) => mj(pts[i], p, 40)); let path = segs[0].slice();
    for (const sg of segs.slice(1)) { if (blend) { const tail = path.slice(-blend); path = path.slice(0, -blend).concat(tail.map((v, k) => v + sg[k] - sg[0]), sg.slice(blend).map((v) => v + tail.at(-1) - sg[0])); } else path = path.concat(sg.slice(1)); }
    const vel = path.slice(1).map((v, i) => Math.abs(v - path[i]) * 20);
    plot(chart, [{ data: vel, color: C.ok }], { ymin: 0 });
    out.textContent = `${path.length} control steps (${Math.round(100 * (1 - path.length / 118))}% faster than stopping at each waypoint)`;
  }
  draw();
}
function wampipe(box) {
  let mode = 'two'; const [c, g] = cv(380, 170);
  const btns = h('.row', { style: 'gap:6px' }, [['two', 'Video model + inverse dynamics'], ['wam', 'World action model']].map(([k, t]) => h('button.small' + (k === mode ? '' : '.ghost'), { 'data-k': k, onclick: () => { mode = k; btns.querySelectorAll('button').forEach((b) => b.classList.toggle('ghost', b.dataset.k !== k)); draw(); } }, t)));
  box.append(wrap(btns, c));
  const bx = (x, y, w, t, col) => { g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(x, y, w, 36); g.fillStyle = col; g.fillText(t, x + 6, y + 22); };
  function draw() {
    g.clearRect(0, 0, 380, 170);
    bx(6, 20, 96, 'camera frame', C.text); bx(6, 70, 96, 'instruction', C.text);
    if (mode === 'two') {
      bx(130, 45, 100, 'video model', C.acc); bx(262, 20, 110, 'future frames', C.acc); bx(262, 105, 110, 'actions (guessed)', C.bad);
      arrow(g, 102, 38, 128, 58, C.dim); arrow(g, 102, 88, 128, 70, C.dim); arrow(g, 230, 58, 260, 40, C.dim);
      g.fillStyle = C.blue; g.fillText('inverse dynamics', 280, 85); arrow(g, 316, 56, 316, 103, C.blue);
      g.fillStyle = C.dim; g.fillText('two models: actions are inferred from pixels after the fact', 6, 162);
    } else {
      bx(130, 45, 100, 'WAM', C.ok); bx(262, 20, 110, 'future frames', C.acc); bx(262, 105, 110, 'actions', C.ok);
      arrow(g, 102, 38, 128, 58, C.dim); arrow(g, 102, 88, 128, 70, C.dim); arrow(g, 230, 58, 260, 40, C.dim); arrow(g, 230, 70, 260, 120, C.dim);
      g.fillStyle = C.dim; g.fillText('one model predicts both, so they agree; video can be skipped at run time', 6, 162);
    }
  }
  draw();
}

export const EXPLAIN = { robot3d, armfk, armik, unitcircle, loop: loop_, presp, pdresp, gravity, armctl, compound, diffarc, bicycle, kalmanviz, inclinefbd, lookahead, minjerk, wampipe };
