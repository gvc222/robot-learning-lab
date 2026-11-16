// Evaluation workbench: one task language, several policies, tweakable conditions, real physics rollouts.
import { h, fill, $, state, save, bus, newId, fmt, toast } from '../util.js';
import { Sim, loadMujoco, rng, sampleLayout, TASKS, ROBOTS, CONTROL_DT } from '../sim/sim.js';
import { Rollout } from '../sim/operator.js';
import { MODELS, rolloutSetup, referenceCheckpoints, wilson, mcnemar, physicsGap } from '../models.js';
import { Viewer } from '../sim/viewer.js';

export default {
  id: 'eval', icon: '📊', title: 'Eval',
  mount(el) {
    const p = state.seen.evalForm = { task: 'red_bin', picks: [], trials: 10, spread: 1, visual: false, chunk: 10, speed: 1, watch: 4, friction: 1, mass: 1, sim2real: false, ...(state.seen.evalForm || {}) };
    let mj, sim, viewer, alive = true, running = false, cancel = false, live = null;
    const view = h('.view3d', {}, h('.hud', {}, h('span.chip#e-status', {}, 'idle')));
    const table = h('div'), history = h('div');
    const polBox = h('#eval-policies'), params = h('#eval-params');
    const runBtn = h('button#eval-run', { onclick: () => (running ? (cancel = true) : run()) }, 'Run evaluation');

    function side() {
      p.picks = p.picks.filter((id) => state.policies.some((x) => x.id === id));
      const hasRefs = state.policies.some((x) => x.reference);
      fill(polBox, h('.row', {}, h('.dim', { style: 'font-size:12px;flex:1' }, 'Policies to compare'),
          !hasRefs ? h('button.small.ghost#load-refs', { onclick: () => { for (const r of referenceCheckpoints()) state.policies.push({ ...r, id: newId('pol') }); save(); toast('Loaded one lab reference checkpoint per architecture (Sprout, trained on 60 clean demos across all three tasks).'); side(); } }, '+ lab references') : null),
        ...(state.policies.length ? state.policies.map((pol) => h('label.check', {},
          h('input', { type: 'checkbox', checked: p.picks.includes(pol.id), onchange: (e) => { p.picks = e.target.checked ? [...p.picks, pol.id] : p.picks.filter((x) => x !== pol.id); save(); } }),
          h('span', {}, h('span.mono', {}, pol.name), h('span.dim', {}, ` · ${MODELS[pol.modelId].name} · ${ROBOTS[pol.robot].name.split(' ')[0]}`)))) : [h('p.dim', {}, 'Train a policy first, or load the lab references.')]));
      const rng1 = (key, min, max, stepv, label, fmtv = (v) => v) => { const out = h('b', {}, fmtv(p[key])); return h('label', {}, label, ' ', out, h('input', { type: 'range', min, max, step: stepv, value: p[key], oninput: (e) => { p[key] = +e.target.value; out.textContent = fmtv(p[key]); save(); } })); };
      fill(params,
        h('label', {}, 'Trials per policy', h('select', { onchange: (e) => { p.trials = +e.target.value; save(); } }, [5, 10, 20, 40].map((n) => h('option', { value: n, selected: n === p.trials }, n)))),
        rng1('spread', 1, 1.6, 0.05, 'Cube position spread', (v) => `${fmt(v, 2)}× ${v > 1.05 ? '(out of distribution)' : '(as in training)'}`),
        rng1('chunk', 1, 40, 1, 'Action chunk (steps per inference)', (v) => `${v} = ${fmt(v * CONTROL_DT, 2)} s open-loop`),
        rng1('speed', 0.5, 1, 0.05, 'Speed limit', (v) => `${Math.round(v * 100)}%`),
        h('label.check', {}, h('input', { type: 'checkbox', checked: p.visual, onchange: (e) => { p.visual = e.target.checked; viewer?.setLook(p.visual); save(); } }), 'Visual shift (new lighting + table)'),
        h('h3', { style: 'margin-top:10px' }, 'Physics (sim-to-real)'),
        rng1('friction', 0.3, 1.5, 0.05, 'Friction', (v) => `${fmt(v, 2)}×`),
        rng1('mass', 0.5, 3, 0.1, 'Cube mass', (v) => `${fmt(v, 1)}×`),
        h('label.check', {}, h('input', { type: 'checkbox', checked: p.sim2real, onchange: (e) => { p.sim2real = e.target.checked; save(); } }), '“Real robot”: hidden calibration error + 50 ms extra latency'),
        h('label', {}, 'Playback', h('select', { onchange: (e) => { p.watch = +e.target.value; save(); } }, [[1, 'real time'], [4, '4× fast'], [0, 'headless (fastest)']].map(([v, t]) => h('option', { value: v, selected: v === p.watch }, t)))));
    }

    const cols = ['Policy', 'Model', 'Success', '95% CI', 'Wrong obj', 'Avg time', 'Motion', 'Inference', 'VRAM'];
    const rowEl = (r) => {
      const [lo, hi] = wilson(r.ok, r.n);
      return h('tr', {}, h('td.mono', {}, r.name), h('td', {}, MODELS[r.modelId].name),
        h('td', { class: r.success >= 0.8 ? 'good' : r.success < 0.5 ? 'bad' : '' }, `${Math.round(r.success * 100)}% `, h('span.dim', {}, `(${r.ok}/${r.n})`)),
        h('td.dim', {}, `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`),
        h('td', {}, `${Math.round(r.wrong * 100)}%`), h('td', {}, `${fmt(r.time)} s`), h('td', {}, `${Math.round(r.smooth)}/100`),
        h('td', {}, `${Math.round(r.latency * 1000)} ms`), h('td', {}, `${r.vramInfer} GB`));
    };
    // Same seeds for every policy, so trials are paired: compare the top two with McNemar's test.
    function verdict(e) {
      const rows = e.rows.filter((r) => r.out?.length === e.trials);
      if (rows.length < 2) return null;
      const [a, b] = rows.slice().sort((x, y) => y.success - x.success);
      let wa = 0, wb = 0;
      for (let i = 0; i < e.trials; i++) { if (a.out[i] && !b.out[i]) wa++; if (b.out[i] && !a.out[i]) wb++; }
      const pv = mcnemar(wa, wb);
      return h('.dim', { style: 'font-size:12px;margin-top:6px' }, `Top two: `, h('span.mono', {}, a.name), ` vs `, h('span.mono', {}, b.name), ` · paired trials where only one succeeded: ${wa} vs ${wb} · McNemar p = ${pv.toFixed(3)} `,
        h('b', { class: pv < 0.05 ? 'good' : '' }, pv < 0.05 ? '→ significant difference' : '→ not significant; run more trials before claiming a winner'));
    }
    const runTable = (e) => h('.card', { style: 'margin-bottom:10px;overflow:auto' },
      h('.row', { style: 'margin-bottom:6px' }, h('span.lang', {}, `“${TASKS[e.task].text}”`), h('span.chip', {}, `${e.trials} trials`), h('span.chip', {}, `spread ${fmt(e.spread, 2)}×`), h('span.chip', {}, `chunk ${e.chunk}`), h('span.chip', {}, `speed ${Math.round(e.speed * 100)}%`),
        e.visual ? h('span.chip.warn', {}, 'visual shift') : null, (e.friction ?? 1) !== 1 || (e.mass ?? 1) !== 1 ? h('span.chip.warn', {}, `friction ${fmt(e.friction ?? 1, 2)}× · mass ${fmt(e.mass ?? 1, 1)}×`) : null, e.sim2real ? h('span.chip.warn', {}, '“real robot”') : null),
      h('table', {}, h('tr', {}, cols.map((c) => h('th', {}, c))), e.rows.map(rowEl)), verdict(e));
    function results() {
      fill(table, live ? runTable(live) : h('p.dim', {}, 'Results appear here, trial by trial.'));
      fill(history, h('h3', {}, 'Earlier runs'), ...state.evals.slice().reverse().slice(0, 8).map(runTable));
    }

    async function run() {
      const pols = state.policies.filter((x) => p.picks.includes(x.id));
      if (!pols.length || !mj) { $('#e-status').textContent = 'tick at least one policy'; return; }
      running = true; cancel = false; runBtn.textContent = 'Stop'; runBtn.className = 'danger';
      const ev = { id: newId('eval'), task: p.task, trials: p.trials, spread: p.spread, visual: p.visual, chunk: p.chunk, speed: p.speed, friction: p.friction, mass: p.mass, sim2real: p.sim2real, rows: [], t: Date.now() };
      live = ev; const base = 4242 + state.evals.length * 97;
      for (const [pi, pol] of pols.entries()) {
        if (!sim || sim.robot.id !== pol.robot) { sim?.dispose(); sim = new Sim(mj, pol.robot); viewer.setSim(sim); viewer.setLook(p.visual); }
        // the "real robot" is a little heavier and less grippy than the simulator thinks
        sim.setPhysics({ friction: p.friction * (p.sim2real ? 0.8 : 1), mass: p.mass * (p.sim2real ? 1.3 : 1) });
        const row = { policyId: pol.id, name: pol.name, modelId: pol.modelId, robot: pol.robot, valErr: pol.valErr, latency: pol.latency, vramInfer: pol.vramInfer, ok: 0, n: 0, success: 0, wrong: 0, time: 0, smooth: 0, out: [] };
        ev.rows.push(row); let wrong = 0, time = 0, smooth = 0;
        for (let i = 0; i < p.trials && !cancel && alive; i++) {
          sim.reset(sampleLayout(rng(base + i * 101), p.spread)); // same layouts for every policy
          const rand = rng(base * 3 + i * 17 + pi * 7919);
          const { profile, actTask } = rolloutSetup(pol, p.task, p, rand);
          const r = new Rollout(sim, p.task, profile, rand, { record: false, actTask });
          $('#e-status').textContent = `${pol.name} · trial ${i + 1}/${p.trials} · “${TASKS[p.task].text}”`;
          await play(r);
          const m = r.result().metrics;
          row.n++; row.ok += m.success; row.out.push(m.success ? 1 : 0); wrong += m.wrong && !m.success; time += m.duration; smooth += m.smooth;
          Object.assign(row, { success: row.ok / row.n, wrong: wrong / row.n, time: time / row.n, smooth: smooth / row.n });
          results();
        }
      }
      sim?.setPhysics({});
      if (alive) {
        if (!cancel) { state.evals.push(ev); if (physicsGap(p) > 0.3) state.seen.sim2realEval = true; save(); }
        running = false; runBtn.textContent = 'Run evaluation'; runBtn.className = '';
        $('#e-status').textContent = cancel ? 'stopped (run not saved)' : 'done'; live = null; results();
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
