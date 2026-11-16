// Academy: read, write code, run tests. Python runs locally in Pyodide; MuJoCo lessons use the real engine.
import { h, fill, $, state, save, bus, toast, lineChart, ask } from '../util.js';
import { LESSONS, UNITS } from '../course/lessons.js';
import { Sim, loadMujoco, CONTROL_DT } from '../sim/sim.js';
import { Viewer } from '../sim/viewer.js';

let pyPromise = null;
function getPy() {
  pyPromise ||= (async () => {
    const { loadPyodide } = await import('../../vendor/pyodide/pyodide.mjs');
    return loadPyodide({ indexURL: new URL('../../vendor/pyodide/', import.meta.url).href });
  })();
  return pyPromise;
}
const pyError = (e) => String(e.message || e).trim().split('\n').filter((l) => !l.includes('/lib/python') && !l.includes('pyodide')).slice(-4).join('\n');
const clip = (v) => Math.max(-1, Math.min(1, v));

function canvas(panel, w = 340, hgt = 300) { const c = h('canvas', { width: w * 2, height: hgt * 2, style: `width:100%;max-width:${w}px;aspect-ratio:${w}/${hgt};background:#0a0c10;border-radius:8px;border:1px solid var(--line)` }); panel.append(c); const g = c.getContext('2d'); g.scale(2, 2); return [c, g]; }
const LAYOUT = { red: [0.25, 0.10, 0], blue: [0.33, 0.2, 0] };

// ---- per-lesson labs: extra checks that need JS/MuJoCo, plus the visual on the right ----
const LABS = {
  fk({ panel, ns }) {
    const [, g] = canvas(panel); const fk = ns.get('fk'); let t = 0, raf, bad = false;
    const S = 300, ox = 170, oy = 250, L = 0.22;
    const draw = () => {
      t += 0.02; const a = 0.9 + 0.6 * Math.sin(t), b = 0.9 + 0.8 * Math.cos(1.3 * t);
      const ex = L * Math.cos(a), ey = L * Math.sin(a), hx = ex + L * Math.cos(a + b), hy = ey + L * Math.sin(a + b);
      g.clearRect(0, 0, 340, 300); g.lineCap = 'round';
      g.strokeStyle = '#59647a'; g.lineWidth = 10; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + ex * S, oy - ey * S); g.lineTo(ox + hx * S, oy - hy * S); g.stroke();
      g.fillStyle = '#8d97a8'; g.fillRect(ox - 22, oy, 44, 8);
      try { const [x, y] = fk(a, b).toJs(); g.fillStyle = '#ff9d3c'; g.beginPath(); g.arc(ox + x * S, oy - y * S, 7, 0, 7); g.fill(); g.fillStyle = '#8d97a8'; g.font = '12px monospace'; g.fillText(`θ₁=${a.toFixed(2)} θ₂=${b.toFixed(2)}  your fk → (${x.toFixed(2)}, ${y.toFixed(2)})`, 10, 18); }
      catch { if (!bad) { bad = true; g.fillStyle = '#ff6b6b'; g.fillText('fk() raised an error', 10, 18); } }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return { cleanup: () => cancelAnimationFrame(raf) };
  },
  ik({ panel, ns }) {
    const [c, g] = canvas(panel); const ik = ns.get('ik');
    const S = 300, ox = 170, oy = 190, L = 0.22; let target = [0.25, 0.2];
    const draw = () => {
      g.clearRect(0, 0, 340, 300); g.lineCap = 'round';
      g.strokeStyle = '#232a36'; g.lineWidth = 1; g.beginPath(); g.arc(ox, oy, 0.44 * S, 0, 7); g.stroke();
      g.strokeStyle = '#ff9d3c'; g.lineWidth = 2; const [tx, ty] = [ox + target[0] * S, oy - target[1] * S];
      g.beginPath(); g.moveTo(tx - 7, ty); g.lineTo(tx + 7, ty); g.moveTo(tx, ty - 7); g.lineTo(tx, ty + 7); g.stroke();
      g.font = '12px monospace'; g.fillStyle = '#8d97a8';
      try {
        const [a, b] = ik(target[0], target[1]).toJs();
        const ex = L * Math.cos(a), ey = L * Math.sin(a), hx = ex + L * Math.cos(a + b), hy = ey + L * Math.sin(a + b);
        g.strokeStyle = '#59647a'; g.lineWidth = 10; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + ex * S, oy - ey * S); g.lineTo(ox + hx * S, oy - hy * S); g.stroke();
        g.fillText(`click to move the target · θ₁=${a.toFixed(2)} θ₂=${b.toFixed(2)}`, 10, 18);
      } catch { g.fillStyle = '#ff6b6b'; g.fillText('out of reach (or ik() raised an error)', 10, 18); }
    };
    c.onclick = (e) => { const r = c.getBoundingClientRect(), k = 340 / r.width; target = [((e.clientX - r.left) * k - ox) / S, (oy - (e.clientY - r.top) * k) / S]; draw(); };
    draw(); return {};
  },
  pcontrol({ panel, ns }) {
    const c = h('canvas.chart', { style: 'height:220px' }); panel.append(c, h('p.dim', { style: 'font-size:12px' }, 'Joint angle over 2 seconds with your KP (orange) against the target (grey).'));
    try {
      const f = ns.get('p_control'), kp = ns.get('KP'); let q = 0; const data = [0];
      for (let i = 0; i < 40; i++) { q += f(q, 1.0, kp) * 0.05; data.push(Math.max(-1, Math.min(3, q))); }
      lineChart(c, [{ data: data.map(() => 1), color: '#59647a' }, { data, color: '#ff9d3c' }], { ymin: 0, ymax: Math.max(1.5, ...data) });
    } catch { /* tests already report the error */ }
    return {};
  },
  qlearn({ panel, ns }) {
    const returns = ns.get('returns')?.toJs?.(), path = ns.get('path')?.toJs?.();
    if (!returns) { panel.append(h('p.dim', {}, 'The learning curve appears once your update rule runs.')); return {}; }
    const c = h('canvas.chart'); const sm = returns.map((_, i) => { const w = returns.slice(Math.max(0, i - 15), i + 1); return w.reduce((a, b) => a + b, 0) / w.length; });
    panel.append(h('.dim', { style: 'font-size:12px' }, 'Return per episode (smoothed) over 400 episodes'), c);
    lineChart(c, [{ data: sm, color: '#4fd08a' }]);
    const [, g] = canvas(panel, 300, 300), cell = 56, off = 10, walls = [[1, 1], [2, 1], [3, 3], [1, 3], [3, 0]];
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) { g.fillStyle = walls.some((w) => w[0] === x && w[1] === y) ? '#3a2630' : '#161b24'; g.fillRect(off + x * cell, off + y * cell, cell - 3, cell - 3); }
    g.font = '26px sans-serif'; g.fillText('🟥', off + 4 * cell + 12, off + 3 * cell + 36);
    g.strokeStyle = '#ff9d3c'; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath();
    path.forEach(([x, y], i) => { const px = off + x * cell + cell / 2 - 1, py = off + y * cell + cell / 2 - 1; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
    panel.append(h('p.dim', { style: 'font-size:12px' }, 'Orange: the route your trained agent takes when it stops exploring.'));
    return {};
  },
  async mjcf({ panel, code }) {
    const mj = await loadMujoco(), tests = []; let model;
    try { model = mj.MjModel.from_xml_string(code); tests.push(['MuJoCo compiles your XML', true]); }
    catch (e) { return { tests: [['MuJoCo compiles your XML', false, String(e.message || e).replace('MuJoCo Error: ', '')]] }; }
    const data = new mj.MjData(model), id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value, 'green');
    tests.push(['there is a body named "green"', id >= 0, 'No body has name="green".']);
    if (id >= 0) {
      mj.mj_forward(model, data); const z0 = data.xpos[3 * id + 2];
      tests.push(['it starts about 20 cm above the table', z0 > 0.12 && z0 < 0.4, `It starts at z = ${z0.toFixed(3)} m.`]);
      for (let i = 0; i < 1000; i++) mj.mj_step(model, data);
      const z1 = data.xpos[3 * id + 2];
      tests.push(['after 2 simulated seconds it has fallen and is resting on the table', z1 > 0.005 && z1 < 0.045, z1 > 0.1 ? `It is still at z = ${z1.toFixed(3)} m: without a <freejoint/> a body cannot move.` : `It ended at z = ${z1.toFixed(3)} m. A 4 cm cube on the table rests at z = 0.02. Does it have a box geom with size 0.02?`]);
      mj.mj_resetData(model, data);
    }
    const view = h('.view3d', { style: 'height:300px;flex:none;border-radius:8px;overflow:hidden' }); panel.append(view, h('p.dim', { style: 'font-size:12px' }, 'Your world, simulated live. It restarts every 3 seconds.'));
    const viewer = new Viewer(view, { cam: [0.55, -0.45, 0.4], look: [0.03, 0, 0.05] }); viewer.setSim({ model, data });
    let raf, steps = 0; mj.mj_forward(model, data);
    const loop = () => { for (let i = 0; i < 8; i++) mj.mj_step(model, data); if ((steps += 8) > 1500) { steps = 0; mj.mj_resetData(model, data); } viewer.draw(); raf = requestAnimationFrame(loop); };
    loop();
    return { tests, cleanup: () => { cancelAnimationFrame(raf); viewer.dispose(); data.delete(); model.delete(); } };
  },
  async waypoints({ panel, ns }) {
    const mj = await loadMujoco(); let wps;
    try { wps = ns.get('waypoints').toJs().map((w) => Array.from(w)); } catch { return {}; }
    const sim = new Sim(mj, 'sprout'); sim.reset(LAYOUT); const frames = [];
    for (const wp of wps.slice(0, 12)) {
      for (let i = 0, hold = 0; i < 90 && hold < 8; i++) {
        const v = sim.robot.vmax * CONTROL_DT, ee = sim.ee();
        sim.step([0, 1, 2].map((k) => clip((wp[k] - sim.target[k]) / v * 0.6)).concat(wp[3] ? 1 : 0)); frames.push(sim.snapshot());
        if (Math.hypot(ee[0] - wp[0], ee[1] - wp[1], ee[2] - wp[2]) < 0.008) hold++;
      }
    }
    const z = sim.bodyPos('red')[2], gap = sim.fingerGap();
    const tests = [['running your waypoints in MuJoCo lifts the red cube', z > 0.08, z < 0.03 ? `The cube is still on the table (z = ${z.toFixed(3)}). ${gap < 0.01 ? 'The gripper closed on nothing: was it low enough (z = 0.02) when it closed?' : 'Did you close the gripper (grip = 1) and keep it closed while lifting?'}` : `The cube only got to z = ${z.toFixed(3)}.`]];
    const view = h('.view3d', { style: 'height:300px;flex:none;border-radius:8px;overflow:hidden' }); panel.append(view, h('p.dim', { style: 'font-size:12px' }, 'Replay of your script on the simulated arm.'));
    const viewer = new Viewer(view); viewer.setSim(sim);
    // loop the replay, pausing on the last frame for a second
    let i = 0, raf, last = 0; const loop = (t) => { raf = requestAnimationFrame(loop); if (t - last < 45 || !frames.length) return; last = t; sim.restore(frames[Math.min(i, frames.length - 1)]); viewer.draw(); i = (i + 1) % (frames.length + 20); };
    raf = requestAnimationFrame(loop);
    return { tests, cleanup: () => { cancelAnimationFrame(raf); viewer.dispose(); sim.dispose(); } };
  },
  async hillclimb({ panel, ns, py, pyOk }) {
    if (!pyOk) return {};
    const mj = await loadMujoco(), sim = new Sim(mj, 'sprout'), goal = [0.30, 0.14, 0.10];
    const rollout = (params, rec) => {
      sim.reset(LAYOUT); let R = 0;
      for (let i = 0; i < 50; i++) {
        const ee = sim.ee(); sim.step([0, 1, 2].map((k) => clip(params[k] * (goal[k] - ee[k]))).concat(0));
        const e2 = sim.ee(); R -= Math.hypot(e2[0] - goal[0], e2[1] - goal[1], e2[2] - goal[2]); rec?.push(sim.snapshot());
      }
      return Number.isFinite(R) ? R : -1e3;
    };
    const propose = ns.get('propose'), keep = ns.get('keep_better'), rng = py.runPython('import random; random.Random(0)');
    let best = [2, 2, 2], bestR = rollout(best); const R0 = bestR, curve = [bestR]; let err = null;
    try {
      for (let it = 0; it < 40; it++) {
        const cand = Array.from(propose(py.toPy(best), 2.5, rng).toJs());
        const out = keep(py.toPy(best), bestR, py.toPy(cand), rollout(cand)).toJs();
        best = Array.from(out[0]); bestR = out[1]; curve.push(bestR);
      }
    } catch (e) { err = pyError(e); }
    const tests = [['40 episodes of random search in MuJoCo improve the return', !err && bestR > R0 * 0.75, err || `Return went from ${R0.toFixed(2)} to ${bestR.toFixed(2)}: not much better.`]];
    const c = h('canvas.chart', { style: 'height:120px' }), view = h('.view3d', { style: 'height:260px;flex:none;border-radius:8px;overflow:hidden' });
    panel.append(h('.dim', { style: 'font-size:12px' }, `Best return so far, per episode: ${R0.toFixed(2)} → ${bestR.toFixed(2)} (0 would be perfect)`), c, view,
      h('p.dim', { style: 'font-size:12px' }, `Learned gains: [${best.map((v) => v.toFixed(1)).join(', ')}]. The replay alternates: the first sluggish policy, then the learned one.`));
    lineChart(c, [{ data: curve, color: '#4fd08a' }]);
    const before = [], after = []; rollout([2, 2, 2], before); rollout(best, after);
    const frames = [...before, ...Array(15).fill(before.at(-1)), ...after, ...Array(15).fill(after.at(-1))];
    const viewer = new Viewer(view); viewer.setSim(sim);
    let i = 0, raf, last = 0; const loop = (t) => { raf = requestAnimationFrame(loop); if (t - last < 45) return; last = t; sim.restore(frames[i]); viewer.draw(); i = (i + 1) % frames.length; };
    raf = requestAnimationFrame(loop);
    return { tests, cleanup: () => { cancelAnimationFrame(raf); viewer.dispose(); sim.dispose(); } };
  },
};

export default {
  id: 'academy', icon: '📚', title: 'Academy',
  mount(el) {
    let lesson = LESSONS.find((l) => !state.course.done[l.id]) || LESSONS[0], labCleanup = null, ns = null, busy = false, alive = true;
    const nav = h('.side.lesson-nav', { style: 'width:210px' }), text = h('.lesson-text'), editor = h('textarea.code', { spellcheck: false });
    const results = h('div'), term = h('.term', { style: 'min-height:40px' }), panel = h('.col'), title = h('h2');
    const runBtn = h('button#run-tests', { onclick: run }, 'Run tests');
    const nextBtn = h('button.ok', { hidden: true, onclick: () => { const i = LESSONS.indexOf(lesson); if (LESSONS[i + 1]) open(LESSONS[i + 1]); } }, 'Next lesson →');
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); const s = editor.selectionStart; editor.setRangeText('    ', s, editor.selectionEnd, 'end'); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    });
    editor.addEventListener('input', () => { state.course.code[lesson.id] = editor.value; save(); });

    function renderNav() {
      fill(nav, ...Object.entries(UNITS).flatMap(([u, name]) => [h('.unit', {}, `Unit ${u} · ${name}`),
        ...LESSONS.filter((l) => l.unit === +u).map((l) => h('button' + (l === lesson ? '.sel' : ''), { onclick: () => open(l) }, h('span', { class: state.course.done[l.id] ? 'good' : 'dim' }, state.course.done[l.id] ? '✓ ' : '○ '), l.title))]),
        !state.tickets['ROB-2'] ? h('p', { style: 'margin:14px 8px' }, h('button.small.ghost', { onclick: () => { state.seen.skipBasics = true; save(); toast('Unit 1 skipped. The lessons stay here if you want them later.'); } }, 'I know this: skip Unit 1')) : '');
    }
    function open(l) {
      labCleanup?.(); labCleanup = null; lesson = l;
      title.textContent = `${l.unit}.${LESSONS.filter((x) => x.unit === l.unit).indexOf(l) + 1}  ${l.title}`;
      text.innerHTML = l.text; editor.value = state.course.code[l.id] ?? l.starter;
      fill(results, ); term.textContent = l.lang === 'xml' ? 'MJCF (MuJoCo XML). Press Run tests to compile and simulate it.' : 'Python output appears here. Ctrl/⌘ + Enter runs the tests.';
      fill(panel, l.viz ? h('p.dim', {}, 'Run your code to bring this panel to life.') : h('p.dim', {}, 'No visual for this one: the tests are the feedback.'));
      nextBtn.hidden = true; renderNav(); el.querySelector('.mainc').scrollTop = 0;
    }
    async function run() {
      if (busy) return; busy = true; runBtn.disabled = true; runBtn.textContent = 'Running…';
      labCleanup?.(); labCleanup = null; fill(panel, ); fill(results, );
      const code = editor.value, out = [], rows = []; let pyOk = true, py = null;
      try {
        if (lesson.lang !== 'xml') {
          term.textContent = pyPromise ? 'running…' : 'starting Python in your browser (first run only, a few seconds)…';
          py = await getPy();
          py.setStdout({ batched: (s) => out.push(s) }); py.setStderr({ batched: (s) => out.push(s) });
          ns = py.globals.get('dict')();
          try { if (lesson.pre) py.runPython(lesson.pre, { globals: ns }); py.runPython(code, { globals: ns }); }
          catch (e) { pyOk = false; out.push(pyError(e)); rows.push(['your code runs without errors', false, 'Python stopped with an error (see the output below). A leftover ... placeholder is a common cause.']); }
          if (pyOk) for (const [name, test] of lesson.tests || []) {
            try { py.runPython(test, { globals: ns }); rows.push([name, true]); }
            catch (e) { const msg = pyError(e).split('\n').pop().replace(/^AssertionError:?\s*/, ''); rows.push([name, false, msg || 'Not yet.']); }
          }
        }
        const pyPassed = rows.every((r) => r[1]);
        if (lesson.viz && alive && (lesson.lang === 'xml' || rows[0]?.[0] !== 'your code runs without errors')) {
          const lab = await LABS[lesson.viz]({ panel, ns, py, code, pyOk: pyPassed });
          if (!alive) lab?.cleanup?.(); else labCleanup = lab?.cleanup || null;
          for (const t of lab?.tests || []) rows.push(t);
        }
      } catch (e) { rows.push(['lab ran', false, String(e.message || e)]); }
      term.textContent = out.join('\n') || (lesson.lang === 'xml' ? 'compiled with MuJoCo.' : '(no output)');
      fill(results, ...rows.map(([name, ok, msg]) => h('.test.' + (ok ? 'pass' : 'fail'), {}, name, !ok && msg ? h('.dim', { style: 'margin-left:18px;white-space:pre-wrap' }, msg) : null)));
      const passed = rows.length > 0 && rows.every((r) => r[1]);
      if (passed) {
        if (!state.course.done[lesson.id]) toast(`Lesson passed: ${lesson.title}`);
        state.course.done[lesson.id] = true; save(); renderNav();
        nextBtn.hidden = !LESSONS[LESSONS.indexOf(lesson) + 1];
      }
      busy = false; runBtn.disabled = false; runBtn.textContent = 'Run tests';
    }

    el.append(h('.split', {}, nav,
      h('.mainc.pad', { style: 'gap:10px;min-width:300px' }, title, text, editor,
        h('.row', {}, runBtn, nextBtn,
          h('button.ghost', { onclick: () => { fill(results, h('.card', { html: '💡 ' + lesson.hint })); } }, 'Hint'),
          h('button.ghost', { onclick: async () => { if (await ask('Replace your code with the starter?', 'Reset')) { editor.value = lesson.starter; delete state.course.code[lesson.id]; save(); } } }, 'Reset'),
          h('button.ghost', { onclick: async () => { if (await ask('Show the reference solution? Try the hint first.', 'Show it')) { editor.value = lesson.solution; state.course.code[lesson.id] = lesson.solution; save(); } } }, 'Solution')),
        results, term),
      h('.side.right', { style: 'width:350px' }, h('h3', {}, 'Lab bench'), panel)));
    open(lesson);
    getPy().catch(() => {}); // warm up in the background
    return () => { alive = false; labCleanup?.(); };
  },
};
