// Evaluation workbench: one task language, several policies, tweakable conditions, real physics rollouts.
import { h, fill, $, state, save, bus, newId, fmt } from '../util.js';
import { Sim, loadMujoco, rng, sampleLayout, TASKS, ROBOTS, CONTROL_DT } from '../sim/sim.js';
import { Rollout } from '../sim/operator.js';
import { MODELS, rolloutSetup } from '../models.js';
import { Viewer } from '../sim/viewer.js';

export default {
  id: 'eval', icon: '📊', title: 'Eval',
  mount(el) {
    const p = state.seen.evalForm ||= { task: 'red_bin', picks: [], trials: 10, spread: 1, visual: false, chunk: 10, speed: 1, watch: 4 };
    let mj, sim, viewer, alive = true, running = false, cancel = false, live = null;
    const view = h('.view3d', {}, h('.hud', {}, h('span.chip#e-status', {}, 'idle')));
    const table = h('div'), history = h('div');
    const polBox = h('#eval-policies'), params = h('#eval-params');
    const runBtn = h('button#eval-run', { onclick: () => (running ? (cancel = true) : run()) }, 'Run evaluation');

    function side() {
      p.picks = p.picks.filter((id) => state.policies.some((x) => x.id === id));
      fill(polBox, h('.dim', { style: 'font-size:12px' }, 'Policies to compare'), ...(state.policies.length ? state.policies.map((pol) => h('label.check', {},
        h('input', { type: 'checkbox', checked: p.picks.includes(pol.id), onchange: (e) => { p.picks = e.target.checked ? [...p.picks, pol.id] : p.picks.filter((x) => x !== pol.id); save(); } }),
        h('span', {}, h('span.mono', {}, pol.name), h('span.dim', {}, ` · ${MODELS[pol.modelId].name} · ${ROBOTS[pol.robot].name.split(' ')[0]}`)))) : [h('p.dim', {}, 'Train a policy first.')]));
      const rng1 = (key, min, max, stepv, label, fmtv = (v) => v) => { const out = h('b', {}, fmtv(p[key])); return h('label', {}, label, ' ', out, h('input', { type: 'range', min, max, step: stepv, value: p[key], oninput: (e) => { p[key] = +e.target.value; out.textContent = fmtv(p[key]); save(); } })); };
      fill(params, 
        h('label', {}, 'Trials per policy', h('select', { onchange: (e) => { p.trials = +e.target.value; save(); } }, [5, 10, 20, 40].map((n) => h('option', { value: n, selected: n === p.trials }, n)))),
        rng1('spread', 1, 1.6, 0.05, 'Cube position spread', (v) => `${fmt(v, 2)}× ${v > 1.05 ? '(out of distribution)' : '(as in training)'}`),
        rng1('chunk', 1, 40, 1, 'Action chunk (steps per inference)', (v) => `${v} = ${fmt(v * CONTROL_DT, 2)} s open-loop`),
        rng1('speed', 0.5, 1, 0.05, 'Speed limit', (v) => `${Math.round(v * 100)}%`),
        h('label.check', {}, h('input', { type: 'checkbox', checked: p.visual, onchange: (e) => { p.visual = e.target.checked; viewer?.setLook(p.visual); save(); } }), 'Visual shift (new lighting + table)'),
        h('label', {}, 'Playback', h('select', { onchange: (e) => { p.watch = +e.target.value; save(); } }, [[1, 'real time'], [4, '4× fast'], [0, 'headless (fastest)']].map(([v, t]) => h('option', { value: v, selected: v === p.watch }, t)))));
    }

    const cols = ['Policy', 'Model', 'Success', 'Wrong object', 'Avg time', 'Motion quality', 'Inference', 'VRAM'];
    const rowEl = (r) => h('tr', {}, h('td.mono', {}, r.name), h('td', {}, MODELS[r.modelId].name),
      h('td', { class: r.success >= 0.8 ? 'good' : r.success < 0.5 ? 'bad' : '' }, `${Math.round(r.success * 100)}% `, h('span.dim', {}, `(${r.ok}/${r.n})`)),
      h('td', {}, `${Math.round(r.wrong * 100)}%`), h('td', {}, `${fmt(r.time)} s`), h('td', {}, `${Math.round(r.smooth)}/100`),
      h('td', {}, `${Math.round(r.latency * 1000)} ms`), h('td', {}, `${r.vramInfer} GB`));
    const runTable = (e) => h('.card', { style: 'margin-bottom:10px;overflow:auto' },
      h('.row', { style: 'margin-bottom:6px' }, h('span.lang', {}, `“${TASKS[e.task].text}”`), h('span.chip', {}, `${e.trials} trials`), h('span.chip', {}, `spread ${fmt(e.spread, 2)}×`), h('span.chip', {}, `chunk ${e.chunk}`), h('span.chip', {}, `speed ${Math.round(e.speed * 100)}%`), e.visual ? h('span.chip.warn', {}, 'visual shift') : null),
      h('table', {}, h('tr', {}, cols.map((c) => h('th', {}, c))), e.rows.map(rowEl)));
    function results() {
      fill(table, live ? runTable(live) : h('p.dim', {}, 'Results appear here, trial by trial.'));
      fill(history, h('h3', {}, 'Earlier runs'), ...state.evals.slice().reverse().slice(0, 8).map(runTable));
    }

    async function run() {
      const pols = state.policies.filter((x) => p.picks.includes(x.id));
      if (!pols.length || !mj) { $('#e-status').textContent = 'tick at least one policy'; return; }
      running = true; cancel = false; runBtn.textContent = 'Stop'; runBtn.className = 'danger';
      const ev = { id: newId('eval'), task: p.task, trials: p.trials, spread: p.spread, visual: p.visual, chunk: p.chunk, speed: p.speed, rows: [], t: Date.now() };
      live = ev; const base = 4242 + state.evals.length * 97;
      for (const [pi, pol] of pols.entries()) {
        if (!sim || sim.robot.id !== pol.robot) { sim?.dispose(); sim = new Sim(mj, pol.robot); viewer.setSim(sim); viewer.setLook(p.visual); }
        const row = { policyId: pol.id, name: pol.name, modelId: pol.modelId, robot: pol.robot, valErr: pol.valErr, latency: pol.latency, vramInfer: pol.vramInfer, ok: 0, n: 0, success: 0, wrong: 0, time: 0, smooth: 0 };
        ev.rows.push(row); let wrong = 0, time = 0, smooth = 0;
        for (let i = 0; i < p.trials && !cancel && alive; i++) {
          sim.reset(sampleLayout(rng(base + i * 101), p.spread)); // same layouts for every policy
          const rand = rng(base * 3 + i * 17 + pi * 7919);
          const { profile, actTask } = rolloutSetup(pol, p.task, p, rand);
          const r = new Rollout(sim, p.task, profile, rand, { record: false, actTask });
          $('#e-status').textContent = `${pol.name} · trial ${i + 1}/${p.trials} · “${TASKS[p.task].text}”`;
          await play(r);
          const m = r.result().metrics;
          row.n++; row.ok += m.success; wrong += m.wrong && !m.success; time += m.duration; smooth += m.smooth;
          Object.assign(row, { success: row.ok / row.n, wrong: wrong / row.n, time: time / row.n, smooth: smooth / row.n });
          results();
        }
      }
      if (alive) {
        if (!cancel) { state.evals.push(ev); save(); }
        live = cancel ? null : ev; running = false; runBtn.textContent = 'Run evaluation'; runBtn.className = '';
        $('#e-status').textContent = cancel ? 'stopped (run not saved)' : 'done'; if (!cancel) live = null; results();
      }
    }
    // step a rollout, drawing as we go
    function play(r) {
      return new Promise((res) => {
        let last = performance.now(), acc = 0;
        const tick = (t) => {
          if (!alive || cancel) return res();
          let done = false;
          if (p.watch === 0) { const t0 = performance.now(); while (!done && performance.now() - t0 < 14) done = r.step(); }
          else { acc += Math.min(0.1, (t - last) / 1000) * p.watch; last = t; while (acc >= CONTROL_DT && !done) { done = r.step(); acc -= CONTROL_DT; } }
          viewer.draw();
          done ? res() : requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }

    el.append(h('.split', {},
      h('.side', { style: 'width:320px' },
        h('label#eval-task', {}, 'Task language', h('select', { onchange: (e) => { p.task = e.target.value; save(); } }, Object.values(TASKS).map((t) => h('option', { value: t.id, selected: t.id === p.task }, `“${t.text}”`)))),
        polBox, h('h3', { style: 'margin-top:14px' }, 'Conditions'), params, runBtn),
      h('.mainc', {}, view, h('.pad', {}, table, history))));
    side(); results();
    const off = bus.on('change', () => { if (!running) { side(); } });
    (async () => { mj = await loadMujoco(); if (!alive) return; viewer = new Viewer(view); sim = new Sim(mj, 'sprout'); viewer.setSim(sim); viewer.setLook(p.visual); })();
    return () => { alive = false; off(); viewer?.dispose(); sim?.dispose(); };
  },
};
