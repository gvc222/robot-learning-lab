// HIL-SERL labs: workspace bounds (your bounds code on a recorded end-effector trace) and a "gamepad" you drive with the keyboard,
// using LeRobot's keyboard_ee key mapping through YOUR keys_to_action function, on the MuJoCo arm.
import { h } from '../util.js';
import { Sim, loadMujoco, rng, sampleLayout, CONTROL_DT, GEOM } from '../sim/sim.js';
import { Viewer } from '../sim/viewer.js';

const note = (t) => h('p.dim', { style: 'font-size:12px' }, t);
const toJs = (x) => (x && typeof x.toJs === 'function' ? x.toJs({ dict_converter: Object.fromEntries }) : x);
// Workspace used by the keyboard lab, in the sim's base frame (metres). Same shape as env.processor.inverse_kinematics.end_effector_bounds.
export const LAB_BOUNDS = { min: [0.16, -0.10, 0.02], max: [0.36, 0.22, 0.20] };

// A wandering end-effector trace, like the one lerobot-find-joint-limits sees while you move the arm over the task area.
function fakeTrace(seed = 7) {
  const r = rng(seed), pts = []; let p = [0.22, 0.05, 0.08], v = [0, 0, 0];
  for (let i = 0; i < 400; i++) {
    v = v.map((x, k) => 0.85 * x + 0.004 * r.gauss() + 0.002 * ([0.21, 0.06, 0.07][k] - p[k]));
    p = p.map((x, k) => x + v[k]); p[2] = Math.max(0.03, p[2]); pts.push([...p]);
  }
  return pts;
}

// Two orthographic views: top (x, y) and side (x, z), with the trace, the box and an extra path.
function drawViews(cv, pts, box, path = []) {
  const ctx = cv.getContext('2d'), W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = cv.clientHeight * devicePixelRatio;
  ctx.clearRect(0, 0, W, H); ctx.font = `${11 * devicePixelRatio}px sans-serif`;
  const views = [{ a: 0, b: 1, name: 'top view (x → right, y ↑)', lo: [0.08, -0.2], hi: [0.42, 0.32] }, { a: 0, b: 2, name: 'side view (x → right, z ↑)', lo: [0.08, -0.02], hi: [0.42, 0.26] }];
  views.forEach((v, i) => {
    const x0 = i * W / 2 + 10, w = W / 2 - 20, y0 = 18 * devicePixelRatio, hh = H - y0 - 8;
    const sx = (x) => x0 + (x - v.lo[0]) / (v.hi[0] - v.lo[0]) * w, sy = (y) => y0 + hh - (y - v.lo[1]) / (v.hi[1] - v.lo[1]) * hh;
    ctx.fillStyle = '#8a93a6'; ctx.fillText(v.name, x0, 12 * devicePixelRatio);
    ctx.strokeStyle = '#333a48'; ctx.strokeRect(x0, y0, w, hh);
    ctx.fillStyle = 'rgba(106,176,255,.55)'; for (const p of pts) ctx.fillRect(sx(p[v.a]) - 1, sy(p[v.b]) - 1, 2.5, 2.5);
    if (box) { ctx.strokeStyle = '#ff9d3c'; ctx.lineWidth = 2; const X1 = sx(box.min[v.a]), X2 = sx(box.max[v.a]), Y1 = sy(box.min[v.b]), Y2 = sy(box.max[v.b]); ctx.strokeRect(Math.min(X1, X2), Math.min(Y1, Y2), Math.abs(X2 - X1), Math.abs(Y2 - Y1)); ctx.lineWidth = 1; }
    if (path.length) { ctx.strokeStyle = '#5fd38d'; ctx.beginPath(); path.forEach((p, k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, sx(p[v.a]), sy(p[v.b]))); ctx.stroke(); const e = path.at(-1); ctx.fillStyle = '#5fd38d'; ctx.beginPath(); ctx.arc(sx(e[v.a]), sy(e[v.b]), 4, 0, 7); ctx.fill(); }
  });
}

// The keys we track, named the way LeRobot's keyboard_ee teleop (pynput) names them.
const CODE_TO_KEY = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ShiftLeft: 'shift', ShiftRight: 'shift_r', ControlLeft: 'ctrl_l', ControlRight: 'ctrl_r', KeyS: 's', KeyR: 'r', KeyQ: 'q' };

export const LABS11 = {
  hilbounds({ panel, ns, py }) {
    const pts = fakeTrace(), wb = ns.get('workspace_bounds'), step = ns.get('ee_step');
    const m = Number(ns.get('MARGIN')), box = toJs(wb(py.toPy(pts), Number.isFinite(m) ? m : 0.01));
    // Push hard towards +x and +z for 60 steps from the middle of the box: the bounds must stop it at the wall.
    // Python dicts from JS: a Map converts to a dict in every Pyodide version.
    const dict = (o) => py.toPy(new Map(Object.entries(o)));
    const sizes = dict({ x: 0.02, y: 0.02, z: 0.02 }), b = dict(box), push = dict({ x: 1, y: 0.3, z: 1 });
    let p = [0.21, 0.06, 0.06]; const path = [[...p]];
    for (let i = 0; i < 60; i++) { p = Array.from(toJs(step(py.toPy(p), push, sizes, b))); path.push(p); }
    const cv = h('canvas.chart', { style: 'height:190px;width:100%' });
    panel.append(h('p', { style: 'font-size:13px' }, 'Blue: 400 end-effector positions recorded while “you” moved the arm over the task area. Orange: the box your ', h('code', {}, 'workspace_bounds'), ' computed. Green: 60 steps of your ', h('code', {}, 'ee_step'), ' with the keys held towards +x, +y and +z.'), cv,
      h('pre.term', { style: 'max-height:none;resize:none;font-size:12px' }, `"end_effector_bounds": {\n  "min": [${box.min.map((v) => v.toFixed(4)).join(', ')}],\n  "max": [${box.max.map((v) => v.toFixed(4)).join(', ')}]\n}`),
      note('That JSON block is what you paste into env.processor.inverse_kinematics.end_effector_bounds after running lerobot-find-joint-limits on the real arm.'));
    requestAnimationFrame(() => drawViews(cv, pts, box, path));
    const inside = (q) => q.every((v, k) => v >= box.min[k] - 1e-9 && v <= box.max[k] + 1e-9);
    return { tests: [['every step of the push stays inside your box', path.every(inside), 'a step left the box'], ['the push reaches the +x wall and stays there', Math.abs(p[0] - box.max[0]) < 1e-6, `x ended at ${p[0].toFixed(3)}, wall at ${box.max[0].toFixed(3)}`]] };
  },

  async hilpad({ panel, ns, py }) {
    const fn = ns.get('keys_to_action'), mj = await loadMujoco();
    const sim = new Sim(mj, 'sprout'); let seed = 11; sim.reset(sampleLayout(rng(seed)));
    const pressed = new Set(); let alive = true, raf, last = 0, acc = 0, t = 0, episode = 1, interventionSteps = 0, steps = 0, flash = '', flashT = 0;
    const log = [];
    // Watch from the robot's +y side so LeRobot's arrow mapping reads naturally: ↑ = away from you (−y), ← = your left (+x).
    const view = h('.view3d', { style: 'height:220px;flex:none;border-radius:8px;overflow:hidden' }, h('.hud', {}, h('span.chip#hp-ep', {}, 'episode 1'), h('span.chip#hp-int', {}, 'policy'), h('span.chip#hp-t', {}, '0.0 s')));
    const viewer = new Viewer(view, { cam: [0.26, 0.78, 0.46], look: [0.26, 0.02, 0.04], minDist: 0.4, maxDist: 2 }); viewer.setSim(sim);
    const btn = (label, key, w = 38) => h('button.pad-key', { 'data-k': key, style: `width:${w}px;padding:6px 0;font-size:12px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px` }, label);
    const pad = h('.card#hil-pad', { tabindex: 0, style: 'outline:none;display:grid;gap:8px;cursor:pointer' },
      h('b', { style: 'font-size:12.5px' }, '🎮 Keyboard gamepad (click here, then use your keyboard)'),
      h('.row', { style: 'gap:14px;align-items:flex-start' },
        h('div', {}, h('.dim', { style: 'font-size:11px' }, 'move x / y'), h('.keys', {}, h('span'), btn('↑', 'up'), h('span'), btn('←', 'left'), btn('↓', 'down'), btn('→', 'right'))),
        h('div', {}, h('.dim', { style: 'font-size:11px' }, 'z: down / up'), h('.row', { style: 'gap:4px' }, btn('L⇧', 'shift', 42), btn('R⇧', 'shift_r', 42)),
          h('.dim', { style: 'font-size:11px;margin-top:6px' }, 'gripper: close / open'), h('.row', { style: 'gap:4px' }, btn('LCtrl', 'ctrl_l', 42), btn('RCtrl', 'ctrl_r', 42))),
        h('div', {}, h('.dim', { style: 'font-size:11px' }, 'episode'), h('.col', { style: 'gap:4px' }, btn('S ✓', 's', 58), btn('R ↺', 'r', 58), btn('Q ✗', 'q', 58)))),
      h('.mono#hp-act', { style: 'font-size:12px' }, 'action: –'));
    const events = h('.dim', { style: 'font-size:12px;max-height:110px;overflow:auto' });
    panel.append(view, pad, h('b', { style: 'font-size:12.5px' }, 'Episode log'), events,
      note('Holding any move or gripper key IS the intervention: the policy is paused while you hold it and resumes when you let go. Here the “policy” is a do-nothing stand-in, so the arm only moves when you intervene. The workspace box is not drawn; the arm simply stops at its walls (x 0.16–0.36, y −0.10–0.22, z 0.02–0.20 m). The arm is the lab’s 4-DoF stand-in, not an SO-101 model, but the action and event plumbing is exactly what you will run on your SO-101.'));
    // preventDefault also stops browser shortcuts such as Ctrl+R (reload) while you hold Left Ctrl to grip.
    const kd = (e) => { const k = CODE_TO_KEY[e.code]; if (!k) return; e.preventDefault(); if (e.repeat && 'srq'.includes(k)) return; pressed.add(k); };
    const ku = (e) => { const k = CODE_TO_KEY[e.code]; if (k) pressed.delete(k); };
    const blur = () => pressed.clear();
    pad.addEventListener('keydown', kd); pad.addEventListener('keyup', ku); pad.addEventListener('blur', blur);
    // Pointer support for the on-screen buttons too.
    pad.querySelectorAll('.pad-key').forEach((b) => { const k = b.dataset.k; b.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.focus(); pressed.add(k); }); for (const ev of ['pointerup', 'pointerleave']) b.addEventListener(ev, () => pressed.delete(k)); });
    pad.addEventListener('click', () => pad.focus());

    const endEpisode = (why, reward) => {
      const rate = steps ? interventionSteps / steps : 0;
      log.unshift(`ep ${episode}: ${why}, reward ${reward}, ${t.toFixed(1)} s, intervention ${(100 * rate).toFixed(0)}% of steps`);
      events.innerHTML = log.map((x) => `<div>${x}</div>`).join('');
      if (why !== 'rerecord') episode++;
      sim.reset(sampleLayout(rng(++seed))); t = 0; steps = 0; interventionSteps = 0; flash = why; flashT = 1.2;
    };
    const control = () => {
      const keys = py.toPy(new Set(pressed)), res = fn(keys, true), arr = toJs(res); res.destroy?.(); keys.destroy?.();
      const [a, ev] = arr; steps++; t += CONTROL_DT;
      if (ev.is_intervention) interventionSteps++;
      const policy = { delta_x: 0, delta_y: 0, delta_z: 0, gripper: 1 }, act = ev.is_intervention ? a : policy;
      // Workspace bounds: same idea as EEBoundsAndSafety, the target never leaves the box.
      const g = act.gripper === 0 ? 1 : act.gripper === 2 ? 0 : sim.grip;
      const v = sim.robot.vmax * CONTROL_DT, d = [act.delta_x, act.delta_y, act.delta_z];
      for (let k = 0; k < 3; k++) sim.target[k] = Math.min(LAB_BOUNDS.max[k], Math.max(LAB_BOUNDS.min[k], sim.target[k] + Math.max(-1, Math.min(1, +d[k] || 0)) * v));
      sim.clampTarget(); sim.grip = g; sim.writeCtrl();
      for (let i = 0; i < sim.nsub; i++) mj.mj_step(sim.model, sim.data);
      sim.time += CONTROL_DT;
      pad.querySelector('#hp-act').textContent = `action: Δx ${(+act.delta_x).toFixed(0)}  Δy ${(+act.delta_y).toFixed(0)}  Δz ${(+act.delta_z).toFixed(0)}  gripper ${act.gripper} (0 close · 1 stay · 2 open)`;
      pad.querySelectorAll('.pad-key').forEach((b) => { b.style.background = pressed.has(b.dataset.k) ? 'var(--accent, #ff9d3c)' : 'var(--panel2)'; });
      if (ev.rerecord_episode) { pressed.delete('r'); endEpisode('rerecord', 0); }
      else if (ev.success) { pressed.delete('s'); endEpisode('success', 1); }
      else if (ev.terminate_episode) { pressed.delete('q'); endEpisode('quit (not a success)', 0); }
      else if (t >= 20) endEpisode('time limit', 0);
      const lifted = sim.bodyPos('red')[2] > GEOM.cube + 0.03;
      view.querySelector('#hp-ep').textContent = flashT > 0 ? `→ ${flash}` : `episode ${episode}${lifted ? ' · red cube lifted: press S' : ''}`;
      view.querySelector('#hp-int').textContent = ev.is_intervention ? 'YOU (intervening)' : 'policy';
      view.querySelector('#hp-t').textContent = `${t.toFixed(1)} s / 20 s`;
    };
    const loop = (now) => {
      if (!alive) return; raf = requestAnimationFrame(loop);
      const dt = Math.min(0.2, (now - last) / 1000 || 0); last = now; acc += dt; flashT -= dt;
      let n = 0; while (acc >= CONTROL_DT && n++ < 3) { try { control(); } catch (e) { alive = false; events.innerHTML = `<span class="bad">keys_to_action failed: ${String(e.message || e).split('\n').pop()}</span>`; } acc -= CONTROL_DT; }
      viewer.draw();
    };
    raf = requestAnimationFrame(loop);
    return { tests: [], cleanup: () => { alive = false; cancelAnimationFrame(raf); viewer.dispose(); sim.dispose(); } };
  },
};
