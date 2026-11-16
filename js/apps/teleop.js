// Teleop station: drive the arm with the keyboard, record demonstrations.
import { h, fill, $, state, episodes, save, bus, toast, newId, fmt } from '../util.js';
import { Sim, loadMujoco, rng, sampleLayout, TASKS, ROBOTS, CONTROL_DT } from '../sim/sim.js';
import { finishEpisode } from '../sim/operator.js';
import { Viewer } from '../sim/viewer.js';

// The camera looks at the robot from the front, so "away from you" is -x and "right" is +y.
const KEYMAP = { w: [0, -1], s: [0, 1], a: [1, -1], d: [1, 1], r: [2, 1], f: [2, -1], arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [1, -1], arrowright: [1, 1] };
const MAX_STEPS = 600; // 30 s

export default {
  id: 'teleop', icon: '🎮', title: 'Teleop',
  mount(el) {
    let sim, viewer, mj, raf, alive = true;
    let robot = state.seen.teleopRobot || 'sprout', task = state.seen.teleopTask || 'red_bin';
    const keys = new Set();
    let grip = 0, recording = false, frames = [], actions = [], trace = [], acc = 0, last = 0, okSteps = 0, seed = Date.now() % 1e6;

    const view = h('.view3d', {}, h('.hud', {}, h('span.chip#t-status', {}, 'loading physics…'), h('span.chip#t-time', {}, '0.0 s'), h('span.chip#t-grip', {}, 'gripper open')), h('.banner#t-banner', { hidden: true }));
    const lang = h('.lang', {}, '');
    const recBtn = h('button#rec-btn', { onclick: () => toggleRec() }, '● Record');
    const pad = (label, key) => {
      const b = h('button', { title: key }, label);
      const down = (e) => { e.preventDefault(); key === ' ' ? (grip = grip ? 0 : 1) : keys.add(key); };
      const up = (e) => { e.preventDefault(); keys.delete(key); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up);
      return b;
    };
    const mine = h('#my-demos');
    const side = h('.side.right', {},
      h('h3', {}, 'Task language'), lang,
      h('label', { style: 'margin-top:12px' }, 'Task', h('select', { onchange: (e) => { task = e.target.value; state.seen.teleopTask = task; save(); newScene(); } }, Object.values(TASKS).map((t) => h('option', { value: t.id, selected: t.id === task }, t.text)))),
      h('label', {}, 'Robot', h('select', { onchange: (e) => { robot = e.target.value; state.seen.teleopRobot = robot; save(); build(); } }, Object.values(ROBOTS).map((r) => h('option', { value: r.id, selected: r.id === robot }, r.name)))),
      h('.dim', { id: 't-robot', style: 'font-size:12px;margin:-4px 0 12px' }),
      h('.row', {}, recBtn, h('button.ghost', { onclick: () => newScene() }, 'New layout')),
      h('h3', { style: 'margin-top:16px' }, 'Controls'),
      h('p', { style: 'font-size:12.5px' }, h('kbd', {}, 'W'), h('kbd', {}, 'S'), ' away / toward you · ', h('kbd', {}, 'A'), h('kbd', {}, 'D'), ' left / right', h('br'), h('kbd', {}, 'R'), h('kbd', {}, 'F'), ' up / down · ', h('kbd', {}, 'Space'), ' gripper', h('br'), h('kbd', {}, 'Enter'), ' record / save · ', h('kbd', {}, 'Esc'), ' cancel'),
      h('.row', {}, h('.keys', {}, h('span'), pad('W', 'w'), h('span'), pad('A', 'a'), pad('S', 's'), pad('D', 'd')), h('.keys', { style: 'grid-template-columns:38px' }, pad('▲', 'r'), pad('▼', 'f')), h('button.ghost', { style: 'touch-action:none', onpointerdown: (e) => { e.preventDefault(); grip = grip ? 0 : 1; } }, 'Grip')),
      h('h3', { style: 'margin-top:16px' }, 'Your demos'), mine);
    el.append(h('.split', {}, h('.mainc', {}, view), side));

    const renderMine = () => {
      const eps = episodes.filter((e) => e.source === 'you');
      fill(mine, eps.length ? h('.eplist', {}, eps.slice().reverse().map((e) => h('.row', { style: 'gap:4px;font-size:12.5px;margin-bottom:3px' },
        h('span', { class: e.metrics.success ? 'good' : 'bad' }, e.metrics.success ? '✓' : '✗'),
        h('span', { style: 'flex:1' }, `${e.id} · ${ROBOTS[e.robot].name.split(' ')[0]} · ${e.task} · ${e.metrics.duration}s · smooth ${e.metrics.smooth}`),
        h('button.small.ghost', { title: 'Delete this demo', onclick: () => { episodes.splice(episodes.indexOf(e), 1); save(true); renderMine(); } }, '🗑')))) : h('p.dim', {}, 'Nothing recorded yet.'));
    };

    function newScene() {
      if (!sim) return;
      recording = false; frames = []; actions = []; trace = []; grip = 0; okSteps = 0;
      sim.reset(sampleLayout(rng(++seed)));
      lang.textContent = `“${TASKS[task].text}”`;
      $('#t-banner').hidden = true; recBtn.textContent = '● Record'; recBtn.className = '';
      hud();
    }
    function build() {
      sim?.dispose(); sim = new Sim(mj, robot); viewer.setSim(sim);
      $('#t-robot').textContent = ROBOTS[robot].blurb;
      newScene();
    }
    function hud() {
      $('#t-status').innerHTML = recording ? '<span class="rec">REC</span>' : 'not recording';
      $('#t-time').textContent = `${fmt(frames.length * CONTROL_DT)} s`;
      $('#t-grip').textContent = grip ? 'gripper closed' : 'gripper open';
    }
    function toggleRec() {
      if (!sim) return;
      if (!recording && frames.length === 0) { recording = true; state.seen.recorded = true; save(); recBtn.textContent = '■ Stop & save'; recBtn.className = 'danger'; }
      else finish(true);
      hud();
    }
    function finish(keep) {
      if (!frames.length) { newScene(); return; }
      recording = false;
      if (keep) {
        const ep = finishEpisode(sim, task, frames, actions, trace);
        Object.assign(ep, { id: newId('you'), source: 'you', robot, label: 'keep' });
        episodes.push(ep); save(true); renderMine();
        toast(ep.metrics.success ? `Saved ${ep.id}: success in ${ep.metrics.duration}s, smoothness ${ep.metrics.smooth}/100.` : `Saved ${ep.id}, but the task was not completed. Consider deleting it.`);
      }
      newScene();
    }
    function control() {
      const a = [0, 0, 0, grip];
      for (const k of keys) { const m = KEYMAP[k]; if (m) a[m[0]] += m[1]; }
      sim.step(a);
      if (recording) {
        frames.push(sim.snapshot()); actions.push(a); trace.push(sim.ee());
        const ok = sim.check(task).success;
        okSteps = ok ? okSteps + 1 : 0;
        const b = $('#t-banner');
        if (okSteps > 8) { b.hidden = false; b.innerHTML = '<b class="good">Task complete!</b> Press <kbd>Enter</kbd> to save this demo.'; } else b.hidden = true;
        if (frames.length >= MAX_STEPS) { toast('30 second limit reached: episode stopped.'); finish(true); }
      }
      hud();
    }
    function loop(t) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.2, (t - last) / 1000 || 0); last = t; acc += dt;
      let n = 0;
      while (acc >= CONTROL_DT && n++ < 3) { control(); acc -= CONTROL_DT; }
      viewer.draw();
    }
    const kd = (e) => {
      if (e.target.matches('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if (KEYMAP[k]) { keys.add(k); e.preventDefault(); }
      else if (k === ' ') { if (!e.repeat) grip = grip ? 0 : 1; e.preventDefault(); }
      else if (k === 'enter') { toggleRec(); e.preventDefault(); }
      else if (k === 'escape') finish(false);
    };
    const ku = (e) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

    renderMine();
    (async () => {
      mj = await loadMujoco();
      if (!alive) return;
      viewer = new Viewer(view);
      build();
      raf = requestAnimationFrame(loop);
    })().catch((err) => { $('#t-status').textContent = 'Could not start MuJoCo: ' + err.message; });

    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); viewer?.dispose(); sim?.dispose(); };
  },
};
