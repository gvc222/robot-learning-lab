// Academy: read, write code, run tests. Python runs locally in Pyodide; MuJoCo lessons use the real engine.
import { h, fill, $, state, save, bus, toast, lineChart, ask } from '../util.js';
import { LESSONS, COURSES } from '../course/lessons.js';
import { Sim, loadMujoco, CONTROL_DT, rng, sampleLayout } from '../sim/sim.js';
import { Rollout, DEMO_KINDS } from '../sim/operator.js';
import { trueSubtasks } from '../annotate.js';
import { NEW_LABS } from './labs2.js';
import { LABS3 } from './labs3.js';
import { LABS4 } from './labs4.js';
import { LABS5 } from './labs5.js';
import { LABS6 } from './labs6.js';
import { LABS7 } from './labs7.js';
import { LABS9 } from './labs9.js';
import { EXPLAIN } from '../course/explain.js';
import { FEEDBACK_URL, REPO_URL } from '../config.js';
import { EditorView, basicSetup, keymap, EditorState, Compartment, indentWithTab, indentUnit, python, xml, oneDark } from '../../vendor/codemirror/cm.js';
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
  fk({ panel, ns, ref }) {
    const [, g] = canvas(panel); const fk = ns.get('fk'), rfk = ref?.get('fk'); let t = 0, raf, bad = false;
    const LK = ns.get('LINKS').toJs(), S = 130 / LK.reduce((u, v) => u + v, 0), ox = 170, oy = 250;
    const draw = () => {
      t += 0.02; const th = [0.9 + 0.6 * Math.sin(t), 0.9 + 0.8 * Math.cos(1.3 * t), -0.6 + 0.7 * Math.sin(0.7 * t)];
      g.clearRect(0, 0, 340, 300); g.lineCap = 'round';
      g.strokeStyle = '#59647a'; g.lineWidth = 10; g.beginPath(); g.moveTo(ox, oy);
      let x = 0, y = 0, a = 0; LK.forEach((l, i) => { a += th[i]; x += l * Math.cos(a); y += l * Math.sin(a); g.lineTo(ox + x * S, oy - y * S); }); g.stroke();
      g.fillStyle = '#8d97a8'; g.fillRect(ox - 22, oy, 44, 8);
      try {
        if (rfk) { const [ex, ey] = rfk(th).toJs(); g.strokeStyle = '#4fd08a'; g.lineWidth = 2; g.beginPath(); g.arc(ox + ex * S, oy - ey * S, 11, 0, 7); g.stroke(); g.fillStyle = '#4fd08a'; g.fillText('green ring = where the hand should be', 10, 50); }
        const [hx, hy] = fk(th).toJs(); g.fillStyle = '#ff9d3c'; g.beginPath(); g.arc(ox + hx * S, oy - hy * S, 7, 0, 7); g.fill();
        g.fillStyle = '#8d97a8'; g.font = '12px monospace'; g.fillText(`θ=(${th.map((v) => v.toFixed(2)).join(', ')})`, 10, 18); g.fillText(`your fk → (${hx.toFixed(3)}, ${hy.toFixed(3)})`, 10, 34);
      } catch { if (!bad) { bad = true; g.fillStyle = '#ff6b6b'; g.fillText('fk() raised an error', 10, 18); } }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return { cleanup: () => cancelAnimationFrame(raf) };
  },
  ik({ panel, ns, ref }) {
    const [c, g] = canvas(panel); const ik = ns.get('ik'), rik = ref?.get('ik');
    const L1 = Number(ns.get('L1')), L2 = Number(ns.get('L2')), S = 130 / (L1 + L2), ox = 170, oy = 190; let target = [0.15, 0.1];
    const draw = () => {
      g.clearRect(0, 0, 340, 300); g.lineCap = 'round';
      g.strokeStyle = '#232a36'; g.lineWidth = 1; g.beginPath(); g.arc(ox, oy, (L1 + L2) * S, 0, 7); g.stroke();
      g.strokeStyle = '#ff9d3c'; g.lineWidth = 2; const [tx, ty] = [ox + target[0] * S, oy - target[1] * S];
      g.beginPath(); g.moveTo(tx - 7, ty); g.lineTo(tx + 7, ty); g.moveTo(tx, ty - 7); g.lineTo(tx, ty + 7); g.stroke();
      g.font = '12px monospace'; g.fillStyle = '#8d97a8';
      try {
        const [a, b] = ik(target[0], target[1]).toJs();
        const ex = L1 * Math.cos(a), ey = L1 * Math.sin(a), hx = ex + L2 * Math.cos(a + b), hy = ey + L2 * Math.sin(a + b);
        if (rik) { const [ra, rb] = rik(target[0], target[1]).toJs(), rx = L1 * Math.cos(ra), ry = L1 * Math.sin(ra); g.strokeStyle = '#4fd08a'; g.lineWidth = 3; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + rx * S, oy - ry * S); g.lineTo(ox + (rx + L2 * Math.cos(ra + rb)) * S, oy - (ry + L2 * Math.sin(ra + rb)) * S); g.stroke(); }
        g.strokeStyle = '#59647a'; g.lineWidth = 10; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + ex * S, oy - ey * S); g.lineTo(ox + hx * S, oy - hy * S); g.stroke();
        g.fillText(`click to move the target · θ₁=${a.toFixed(2)} θ₂=${b.toFixed(2)}`, 10, 18);
      } catch { g.fillStyle = '#ff6b6b'; g.fillText('out of reach (or ik() raised an error)', 10, 18); }
    };
    c.onclick = (e) => { const r = c.getBoundingClientRect(), k = 340 / r.width; target = [((e.clientX - r.left) * k - ox) / S, (oy - (e.clientY - r.top) * k) / S]; draw(); };
    draw(); return {};
  },
  pcontrol({ panel, ns, ref }) {
    const c = h('canvas.chart', { style: 'height:220px' }); panel.append(c, h('p.dim', { style: 'font-size:12px' }, 'Joint angle over 2 seconds with your KP (orange) against the target (grey).'));
    try {
      const f = ns.get('p_control'), kp = ns.get('KP'); let q = 0; const data = [0];
      for (let i = 0; i < 40; i++) { q += f(q, 1.0, kp) * 0.05; data.push(Math.max(-1, Math.min(3, q))); }
      const series = [{ data: data.map(() => 1), color: '#59647a' }, { data, color: '#ff9d3c' }];
      if (ref) { const rf = ref.get('p_control'), rk = ref.get('KP'); let rq = 0; const rd = [0]; for (let i = 0; i < 40; i++) { rq += rf(rq, 1.0, rk) * 0.05; rd.push(rq); } series.push({ data: rd, color: '#4fd08a' }); panel.append(h('p.dim', { style: 'font-size:12px' }, 'Green: the reference solution, for comparison.')); }
      lineChart(c, series, { ymin: 0, ymax: Math.max(1.5, ...data) });
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
  ...NEW_LABS,
  ...LABS3,
  ...LABS4,
  ...LABS5,
  ...LABS6,
  ...LABS7,
  ...LABS9,
};


// Lessons in course order (the nav and "Next lesson" follow this).
export const ORDERED = COURSES.flatMap((c) => LESSONS.filter((l) => l.course === c.id));
const kindOf = (l) => l.kind || (l.lang === 'xml' ? 'xml' : 'py');

export default {
  id: 'academy', icon: '📚', title: 'Academy',
  mount(el, { openApp } = {}) {
    let lesson = ORDERED.find((l) => l.id === state.seen.lastLesson) || ORDERED.find((l) => !state.course.done[l.id]) || ORDERED[0];
    let labCleanup = null, ns = null, busy = false, alive = true;
    const open_ = state.seen.openCourses ||= { [lesson.course]: true };
    const nav = h('.side.lesson-nav', { style: 'width:230px' }), text = h('.lesson-text'), edBox = h('.code-editor');
    // A real code editor (CodeMirror 6): syntax colours, auto-indent, bracket matching, no spellcheck.
    const langConf = new Compartment(); let settingValue = false;
    const cm = new EditorView({ parent: edBox, state: EditorState.create({ doc: '', extensions: [
      keymap.of([{ key: 'Mod-Enter', run: () => { run(); return true; } }, indentWithTab]), basicSetup, indentUnit.of('    '), EditorState.tabSize.of(4), oneDark, langConf.of(python()),
      EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'data-gramm': 'false' }),
      EditorView.updateListener.of((u) => { if (u.docChanged && !settingValue && lesson) { state.course.code[lesson.id] = u.state.doc.toString(); save(); } }),
    ] }) });
    const editor = {
      get value() { return cm.state.doc.toString(); },
      set value(v) { settingValue = true; cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: v } }); settingValue = false; },
      set hidden(v) { edBox.hidden = v; },
      setLang(k) { cm.dispatch({ effects: langConf.reconfigure(k === 'xml' ? xml() : python()) }); },
    };
    window.lab.setCode = (v) => { editor.value = v; if (lesson) { state.course.code[lesson.id] = v; save(); } };
    const results = h('div'), term = h('.term#term', { style: 'min-height:140px;max-height:70vh;resize:vertical' }), panel = h('.col'), title = h('h2'), crumb = h('.dim', { style: 'font-size:12px' });
    const runBtn = h('button#run-tests', { onclick: run }, 'Run tests');
    const nextBtn = h('button.ok#next-lesson', { hidden: true, onclick: () => { const i = ORDERED.indexOf(lesson); if (ORDERED[i + 1]) open(ORDERED[i + 1]); } }, 'Next lesson →');
    const hintBtn = h('button.ghost', { onclick: () => { fill(results, h('.card', { html: '💡 ' + lesson.hint })); } }, 'Hint');
    const resetBtn = h('button.ghost', { onclick: async () => { if (await ask('Replace your code with the starter?', 'Reset')) { editor.value = lesson.starter; delete state.course.code[lesson.id]; save(); } } }, 'Reset');
    const solBtn = h('button.ghost', { onclick: async () => { if (await ask('Show the reference solution? Try the hint first.', 'Show it')) { editor.value = lesson.solution; state.course.code[lesson.id] = lesson.solution; save(); } } }, 'Solution');
    const codeRow = h('.row', {}, runBtn, nextBtn, hintBtn, resetBtn, solBtn);
    // Per-lesson feedback: goes to a Google Sheet when FEEDBACK_URL is set (js/config.js), otherwise to a pre-filled GitHub issue.
    const fbBtn = h('button.small.ghost#feedback-btn', { style: 'align-self:flex-start', onclick: () => {
      const l = lesson; let rating = '';
      const ta = h('textarea#fb-text', { rows: 4, style: 'width:100%', placeholder: 'What was confusing, broken or missing? What would you like next?' });
      const chips = h('.row', { style: 'gap:6px' }, ['👍 clear', '😕 confusing', '🐛 something broke', '💡 idea'].map((t) => h('button.small.ghost', { onclick: (e) => { rating = t; chips.querySelectorAll('button').forEach((b) => b.classList.add('ghost')); e.currentTarget.classList.remove('ghost'); } }, t)));
      const send = async () => {
        const row = { lesson: l.id, title: l.title, course: l.course, rating, text: ta.value.trim(), passed: !!state.course.done[l.id], lessons_done: Object.values(state.course.done).filter(Boolean).length, when: new Date().toISOString(), page: location.href };
        if (!row.rating && !row.text) { toast('Pick a reaction or write a line first.'); return; }
        (state.feedback ||= []).push(row); save();
        if (FEEDBACK_URL) {
          try { await fetch(FEEDBACK_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(row) }); toast('Thanks! Feedback sent.'); }
          catch { toast('Could not reach the feedback sheet. Saved in your progress file instead.'); }
        } else {
          window.open(`${REPO_URL}/issues/new?title=${encodeURIComponent(`[feedback] ${l.title}`)}&body=${encodeURIComponent(`**Lesson:** ${l.id}\n**Reaction:** ${rating || '-'}\n\n${row.text}`)}`, '_blank', 'noopener');
          toast('Opening a pre-filled GitHub issue.');
        }
        $('#modal').hidden = true;
      };
      fill($('#modal'), h('.box', {}, h('h2', {}, `Feedback: ${l.title}`), chips, ta,
        h('p.dim', { style: 'font-size:12px' }, FEEDBACK_URL ? 'Sent anonymously: the lesson, your reaction and text, and how many lessons you have finished. No name or email.' : 'Opens a GitHub issue you can review before posting.'),
        h('.row', {}, h('button#fb-send', { onclick: send }, 'Send'), h('button.ghost', { onclick: () => { $('#modal').hidden = true; } }, 'Cancel'))));
      $('#modal').hidden = false;
    } }, '💬 Feedback on this lesson');
    const quizBox = h('#quiz.col', { style: 'gap:10px' });
    const explainBox = h('#explain'); let explainCleanup = null;
    const sidePanel = h('.side.right', { style: 'width:360px' }, h('h3', {}, 'Lab bench'), panel);

    function pass() {
      if (!state.course.done[lesson.id]) toast(`Lesson passed: ${lesson.title}`);
      state.course.done[lesson.id] = true; save(); renderNav();
      nextBtn.hidden = !ORDERED[ORDERED.indexOf(lesson) + 1];
    }
    function renderNav() {
      fill(nav, ...COURSES.flatMap((c) => {
        const ls = ORDERED.filter((l) => l.course === c.id), n = ls.filter((l) => state.course.done[l.id]).length, isOpen = open_[c.id];
        return [h('button.unit', { style: 'background:none;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:8px 8px 3px;text-align:left;width:100%;font-weight:600', onclick: () => { open_[c.id] = !isOpen; save(); renderNav(); } },
          `${isOpen ? '▾' : '▸'} ${c.title} `, h('span', { style: `font-weight:400;${n === ls.length ? 'color:var(--good)' : ''}` }, `${n}/${ls.length}`)),
        ...(isOpen ? ls.map((l) => h('button' + (l === lesson ? '.sel' : ''), { onclick: () => open(l) }, h('span', { class: state.course.done[l.id] ? 'good' : 'dim' }, state.course.done[l.id] ? '✓ ' : kindOf(l) === 'quiz' ? '? ' : kindOf(l) === 'lab' ? '⚙ ' : kindOf(l) === 'read' ? '📖 ' : '○ '), l.title)) : [])];
      }),
      !state.tickets['ROB-2'] ? h('p', { style: 'margin:14px 8px' }, h('button.small.ghost', { onclick: () => { state.seen.skipBasics = true; save(); toast('Robot basics skipped. The lessons stay here if you want them later.'); } }, 'I know this: skip Robot basics')) : '');
    }
    function open(l) {
      labCleanup?.(); labCleanup = null; lesson = l; state.seen.lastLesson = l.id; open_[l.course] = true; save();
      const c = COURSES.find((x) => x.id === l.course);
      crumb.textContent = `${c.title} · lesson ${ORDERED.filter((x) => x.course === l.course).indexOf(l) + 1}`;
      title.textContent = l.title;
      text.innerHTML = l.text;
      explainCleanup?.(); explainCleanup = null; fill(explainBox);
      if (l.explain && EXPLAIN[l.explain]) { try { explainCleanup = EXPLAIN[l.explain](explainBox, l) || null; } catch (e) { explainBox.append(h('p.bad', {}, `explainer failed: ${e.message}`)); } }
      text.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => e.stopPropagation()));
      const k = kindOf(l);
      editor.hidden = codeRow.hidden = term.hidden = !(k === 'py' || k === 'xml');
      hintBtn.hidden = resetBtn.hidden = solBtn.hidden = false;
      quizBox.hidden = k !== 'quiz' && k !== 'read';
      sidePanel.hidden = k === 'quiz' || k === 'read';
      fill(results); nextBtn.hidden = true;
      if (k === 'py' || k === 'xml') {
        editor.setLang(k); editor.value = state.course.code[l.id] ?? l.starter;
        term.textContent = k === 'xml' ? 'MJCF (MuJoCo XML). Press Run tests to compile and simulate it.' : 'Python output appears here. Ctrl/⌘ + Enter runs the tests.';
        fill(panel, l.viz ? h('p.dim', {}, 'Run your code to bring this panel to life.') : h('p.dim', {}, 'No visual for this one: the tests are the feedback.'));
      } else if (k === 'quiz') renderQuiz(l);
      else if (k === 'read') fill(quizBox, h('button.ok#mark-read', { style: 'align-self:flex-start', onclick: () => { pass(); } }, '✓ Mark as done'));
      else if (k === 'lab') {
        fill(panel);
        Promise.resolve(LABS[l.viz]({ panel, done: () => { if (lesson === l) pass(); } })).then((r) => { labCleanup = r?.cleanup || null; });
        if (state.course.done[l.id]) nextBtn.hidden = false;
      }
      if (state.course.done[l.id] && k !== 'py' && k !== 'xml') { results.replaceChildren(h('p.good', {}, '✓ Completed')); nextBtn.hidden = !ORDERED[ORDERED.indexOf(l) + 1]; }
      renderNav(); el.querySelector('.mainc').scrollTop = 0;
    }
    function renderQuiz(l) {
      const answers = {};
      fill(quizBox, ...l.quiz.map((q, qi) => {
        const fb = h('.dim', { style: 'font-size:12.5px;min-height:1em' });
        const opts = q.options.map((o, oi) => h('button.ghost.quiz-opt', { style: 'text-align:left;font-weight:400;display:block;width:100%;margin-bottom:4px', 'data-q': qi, 'data-o': oi, onclick: (e) => {
          const ok = oi === q.answer; answers[qi] = ok;
          e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => { b.style.borderColor = ''; });
          e.currentTarget.style.borderColor = ok ? 'var(--good)' : 'var(--bad)';
          fb.innerHTML = ok ? '<span class="good">Correct.</span>' : '<span class="bad">Not quite. Re-read the summary above and try again.</span>';
          if (l.quiz.every((_, i) => answers[i])) pass();
        } }, o));
        return h('.card', {}, h('b', {}, `${qi + 1}. ${q.q}`), h('div', { style: 'margin-top:8px' }, opts), fb);
      }));
    }
    async function run() {
      if (busy) return; busy = true; runBtn.disabled = true; runBtn.textContent = 'Running…';
      labCleanup?.(); labCleanup = null; fill(panel); fill(results);
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
        if (lesson.viz && alive) {
          // The lab bench always shows up. It uses your code; if your code cannot run, it shows the reference solution instead (and never counts that towards passing).
          let refNs = null;
          if (py && lesson.solution && lesson.lang !== 'xml') { try { refNs = py.globals.get('dict')(); if (lesson.pre) py.runPython(lesson.pre, { globals: refNs }); py.runPython(lesson.solution, { globals: refNs }); } catch { refNs = null; } }
          const labBox = h('div'), knobRow = h('div', { style: 'margin-bottom:6px' });
          fill(panel, knobRow, labBox);
          let usedRef = false;
          const runLab = async (first) => {
            labCleanup?.(); labCleanup = null; fill(labBox);
            const call = (n, r) => LABS[lesson.viz]({ panel: labBox, ns: n, py, code, pyOk: true, ref: r });
            let lab = null; usedRef = false;
            try { if (!pyOk) throw new Error('your code did not run'); lab = await call(ns, refNs); }
            catch (e) { fill(labBox); if (refNs) { try { lab = await call(refNs, null); usedRef = true; } catch { /* nothing to show */ } } }
            if (!alive) lab?.cleanup?.(); else labCleanup = lab?.cleanup || null;
            if (usedRef) labBox.prepend(h('p.bad', { style: 'font-size:12.5px' }, 'Your code could not drive this lab yet, so this is the reference solution running, to show what the goal looks like. Fix the errors above and run again.'));
            else if (first && !pyPassed && lesson.lang !== 'xml') labBox.prepend(h('p.dim', { style: 'font-size:12.5px' }, 'Some tests are failing: this is what your code does right now.'));
            return lab;
          };
          const lab = await runLab(true);
          if (!usedRef) for (const t of lab?.tests || []) rows.push(t);
          // Live knobs: drag a constant from your code and watch the lab bench change (the code in the editor is not touched).
          if (lesson.knobs && ns && pyOk) {
            let timer = null;
            knobRow.append(h('.dim', { style: 'font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px' }, '🎛 Live knobs (try values here, then put your favourite in the code)'),
              ...lesson.knobs.map((k) => { let cur = Number(ns.get(k.name)); if (!Number.isFinite(cur)) cur = k.min;
                const out = h('b.mono', { style: 'min-width:48px;text-align:right' }, cur.toFixed(k.step < 0.01 ? 3 : 2));
                const inp = h('input', { type: 'range', min: k.min, max: k.max, step: k.step, value: cur, style: 'flex:1', oninput: (e) => { const v = +e.target.value; out.textContent = v.toFixed(k.step < 0.01 ? 3 : 2); ns.set(k.name, v); clearTimeout(timer); timer = setTimeout(() => runLab(false), 250); } });
                return h('label.row', { style: 'gap:8px;align-items:center;font-size:12.5px;margin:2px 0' }, h('span', { style: 'min-width:70px' }, k.name), inp, out); }));
          }
        }
      } catch (e) { rows.push(['lab ran', false, String(e.message || e)]); }
      term.textContent = out.join('\n') || (lesson.lang === 'xml' ? 'compiled with MuJoCo.' : '(no output)');
      fill(results, ...rows.map(([name, ok, msg]) => h('.test.' + (ok ? 'pass' : 'fail'), {}, name, !ok && msg ? h('.dim', { style: 'margin-left:18px;white-space:pre-wrap' }, msg) : null)));
      if (rows.length > 0 && rows.every((r) => r[1])) pass();
      busy = false; runBtn.disabled = false; runBtn.textContent = 'Run tests';
    }

    el.append(h('.split', {}, nav,
      h('.mainc.pad', { style: 'gap:10px;min-width:300px' }, crumb, title, text, explainBox, quizBox, edBox, codeRow, results, term, fbBtn),
      sidePanel));
    open(lesson);
    getPy().catch(() => {}); // warm up in the background
    return () => { alive = false; labCleanup?.(); explainCleanup?.(); cm.destroy(); };
  },
};
