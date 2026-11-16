// Training: pick a model, a dataset slice and hyper-parameters; watch the (simulated) job run.
// Then optionally RL fine-tune: real MuJoCo rollouts, judged by a reward model, nudge the policy.
import { h, fill, $, state, episodes, save, bus, toast, newId, lineChart, fmt } from '../util.js';
import { TASKS, ROBOTS } from '../sim/scene.js';
import { Sim, loadMujoco, rng, sampleLayout } from '../sim/sim.js';
import { Rollout } from '../sim/operator.js';
import { MODELS, GPUS, LANG_LEVELS, DEFAULT_CFG, datasetStats, trainPolicy, rolloutSetup, rlUpdate } from '../models.js';

export function ensureBaseline() {
  if (state.policies.some((p) => p.baseline)) return;
  const raw = episodes.filter((e) => e.source !== 'you' && e.source !== 'dream').map((e) => ({ ...e, label: null }));
  const stats = datasetStats(raw, 'sprout', ['red_bin']);
  if (stats.total < 2) return;
  const m = MODELS.act, res = trainPolicy('act', { steps: m.stepsNeeded, lr: m.lrBest, batch: 8, gpu: 'rtx4090' }, stats, ['red_bin'], 7);
  state.policies.push({ ...res, curve: null, id: newId('pol'), name: 'maya/act-rawdata', robot: 'sprout', baseline: true, n: stats.total });
}

export default {
  id: 'train', icon: '🔥', title: 'Train',
  mount(el) {
    const f = state.seen.trainForm = { ...DEFAULT_CFG, model: 'act', robot: 'sprout', tasks: ['red_bin'], steps: 30000, lr: 1e-5, ...(state.seen.trainForm || {}) };
    let running = false, timer, alive = true;
    const term = h('.term', {}, 'No job running.'), chart = h('canvas.chart');
    const summary = h('#data-summary.card'), pols = h('div'), rlBox = h('#rl-box.card');
    const modelPick = h('#model-pick.col', { style: 'gap:6px' });
    const hp = h('#hparams');
    const btn = h('button#train-btn', { onclick: run }, 'Launch training job');

    function form() {
      const m = MODELS[f.model];
      fill(modelPick, ...Object.values(MODELS).map((mm) => h('label.check.card', { style: `align-items:flex-start;padding:8px 10px;margin:0;${mm.id === f.model ? 'border-color:var(--accent)' : ''}` },
        h('input', { type: 'radio', name: 'model', checked: mm.id === f.model, onchange: () => { f.model = mm.id; f.steps = mm.stepsNeeded; f.lr = mm.lrBest; f.lora = false; if (!mm.lang) f.lang = 'task'; save(); form(); } }),
        h('div', {}, h('b', {}, mm.name), h('span.dim', {}, ` · ${mm.params} · ${mm.lang ? 'reads language' : 'no language input'}`),
          mm.id === f.model ? h('.dim', { style: 'font-size:12px' }, mm.blurb) : null))));
      const lrs = [1e-6, 2.5e-6, 1e-5, 2.5e-5, 5e-5, 1e-4, 2.5e-4, 1e-3];
      const sel = (key, opts, lab = (v) => v, extra = {}) => h('select', { ...extra, onchange: (e) => { f[key] = isNaN(+e.target.value) ? e.target.value : +e.target.value; save(); form(); } }, opts.map((o) => h('option', { value: o, selected: String(o) === String(f[key]) }, lab(o))));
      const stats = datasetStats(episodes, f.robot, f.tasks);
      const coverage = stats.total ? stats.annotated / stats.total : 0;
      fill(hp,
        h('label', {}, 'Robot (uses demos recorded on this robot)', sel('robot', Object.keys(ROBOTS), (r) => ROBOTS[r].name)),
        h('.dim', { style: 'font-size:12px' }, 'Tasks to train on'),
        ...Object.values(TASKS).map((t) => h('label.check', {}, h('input', { type: 'checkbox', checked: f.tasks.includes(t.id), onchange: (e) => { f.tasks = e.target.checked ? [...f.tasks, t.id] : f.tasks.filter((x) => x !== t.id); save(); form(); } }), `“${t.text}”`)),
        h('.row', { style: 'margin-top:8px' },
          h('label', { style: 'flex:1' }, 'Training steps', h('input', { type: 'number', min: 500, max: 200000, step: 500, value: f.steps, onchange: (e) => { f.steps = Math.max(500, Math.min(200000, +e.target.value || 500)); save(); form(); } })),
          h('label', { style: 'flex:1' }, 'Learning rate', sel('lr', lrs, (v) => v.toExponential(1))),
          h('label', { style: 'flex:1' }, 'Batch size', sel('batch', [2, 4, 8, 16, 32]))),
        h('label', {}, 'Compute', sel('gpu', Object.keys(GPUS), (g) => `${GPUS[g].name}${GPUS[g].rate > 1 ? ' · billed ' + GPUS[g].rate + '×' : ''}`)),
        h('h3', { style: 'margin-top:10px' }, 'Data recipe'),
        h('label#lang-level', {}, 'Language supervision', sel('lang', Object.keys(LANG_LEVELS), (k) => LANG_LEVELS[k].name, { disabled: !m.lang })),
        h('.dim', { style: 'font-size:12px;margin:-6px 0 8px' }, m.lang ? `${LANG_LEVELS[f.lang].note} ${f.lang !== 'task' ? `Coverage: ${Math.round(100 * coverage)}% of these episodes are annotated.` : ''}` : `${m.name} has no language input, so captions cannot help it.`),
        h('label.check', {}, h('input', { type: 'checkbox', checked: f.ego || !!m.egoNative, disabled: !m.lang || !!m.egoNative, onchange: (e) => { f.ego = e.target.checked; save(); form(); } }),
          m.egoNative ? `Egocentric human-video pretraining (built into ${m.name})` : 'Start from an egocentric-video pretrained checkpoint (+GPU)'),
        h('label.check', {}, h('input', { type: 'checkbox', checked: f.dr, onchange: (e) => { f.dr = e.target.checked; save(); form(); } }), 'Domain randomization: vary friction and mass in training (+20% GPU)'),
        m.lang ? h('label.check', {}, h('input', { type: 'checkbox', checked: f.lora, onchange: (e) => { f.lora = e.target.checked; save(); form(); } }), 'LoRA fine-tune (about half the VRAM, slightly lower quality)') : null);
      const unl = episodes.filter((e) => e.robot === f.robot && f.tasks.includes(e.task) && !e.label).length;
      const est = trainPolicy(f.model, f, { ...stats, total: Math.max(2, stats.total) }, f.tasks);
      fill(summary, h('h3', {}, 'Dataset going in'),
        ...f.tasks.map((t) => h('div', {}, h('span.mono', {}, `${String(stats.per[t].total).padStart(3)} episodes`), stats.per[t].dream ? h('span.dim', {}, ` (incl. ${stats.per[t].dream} good dreams)`) : null, ` · “${TASKS[t].text}”`)),
        h('.dim', { style: 'font-size:12px;margin-top:4px' }, `${stats.total} total on ${ROBOTS[f.robot].name}: ${stats.own} recorded by you, ${stats.dreams} neural trajectories, ${stats.annotated} annotated.`),
        unl ? h('.chip.warn', { style: 'margin-top:6px' }, `⚠ ${unl} unreviewed episodes are included`) : null,
        h('.dim', { style: 'font-size:12px;margin-top:6px' }, `Estimate: ~${fmt(est.gpuHours)} GPU-h · peak ${est.vram} GB VRAM on a ${GPUS[f.gpu].vram} GB GPU.`),
        est.vram > GPUS[f.gpu].vram ? h('.chip.warn', {}, '⚠ will not fit on this GPU') : null);
      btn.disabled = running || !f.tasks.length;
      renderRL();
    }

    function renderPolicies() {
      fill(pols, h('h3', {}, 'Policy registry'), state.policies.length ? h('.col', {}, state.policies.slice().reverse().map((p) => h('.card', {},
        h('.row', {}, h('b.mono', {}, p.name), h('span.spacer'), p.baseline ? h('span.chip', {}, 'baseline') : p.reference ? h('span.chip', {}, 'lab reference') : h('button.small.ghost', { onclick: () => { state.policies.splice(state.policies.indexOf(p), 1); save(); renderPolicies(); renderRL(); } }, '🗑')),
        h('.dim', { style: 'font-size:12px' }, `${MODELS[p.modelId].name} · ${ROBOTS[p.robot].name} · ${p.tasks.join(', ')} · ${p.n} demos${p.rl ? ` · RL ×${p.rl}` : ''}${p.dr ? ' · DR' : ''}${p.ego ? ' · ego-pretrained' : ''}`),
        h('div', { style: 'margin-top:6px' }, h('span.chip', {}, `val action err ${p.valErr}`), h('span.chip', {}, `${fmt(p.gpuHours)} GPU-h`), h('span.chip', {}, `train ${p.vram} GB`), h('span.chip', {}, `inference ${p.vramInfer} GB · ${Math.round(p.latency * 1000)} ms`))))) : h('p.dim', {}, 'No trained policies yet.'));
    }

    // ---- RL fine-tuning ----
    const rl = state.seen.rlForm ||= { policy: null, task: 'red_bin', rollouts: 20, interventions: 0 };
    function renderRL() {
      const mine = state.policies.filter((p) => !p.baseline && !p.reference && !p.error);
      if (!mine.find((p) => p.id === rl.policy)) rl.policy = mine.at(-1)?.id || null;
      const pol = mine.find((p) => p.id === rl.policy);
      fill(rlBox, h('h3', {}, 'RL fine-tuning (optional)'),
        h('p.dim', { style: 'font-size:12.5px' }, 'Let the policy practise. Each rollout runs in physics, a reward model scores it, and the policy is nudged toward what scored well. Human interventions (HIL) make it faster but cost operator time.'),
        !mine.length ? h('p.dim', {}, 'Train a policy first.') : h('div', {},
          h('.row', {},
            h('label', { style: 'flex:2' }, 'Policy', h('select', { onchange: (e) => { rl.policy = e.target.value; save(); renderRL(); } }, mine.map((p) => h('option', { value: p.id, selected: p.id === rl.policy }, p.name)))),
            h('label', { style: 'flex:2' }, 'Practise task', h('select', { onchange: (e) => { rl.task = e.target.value; save(); } }, (pol?.tasks || []).map((t) => h('option', { value: t, selected: t === rl.task }, TASKS[t].text))))),
          h('.row', {},
            h('label', { style: 'flex:1' }, 'Rollouts', h('select', { onchange: (e) => { rl.rollouts = +e.target.value; save(); } }, [10, 20, 40].map((n) => h('option', { value: n, selected: n === rl.rollouts }, n)))),
            h('label', { style: 'flex:1' }, 'Human interventions', h('select', { onchange: (e) => { rl.interventions = +e.target.value; save(); } }, [[0, 'none'], [5, '5 (1 operator-h)'], [10, '10 (2 operator-h)']].map(([v, t]) => h('option', { value: v, selected: v === rl.interventions }, t))))),
          h('button#rl-btn', { disabled: running || !pol, onclick: () => runRL(pol) }, 'Practise with RL')));
    }
    async function runRL(pol) {
      if (!pol.tasks.includes(rl.task)) rl.task = pol.tasks[0];
      running = true; form();
      const mj = await loadMujoco(), sim = new Sim(mj, pol.robot), rand = rng(Date.now() % 1e9), out = [];
      const log = [`$ lab rl-finetune --policy ${pol.name} --task ${rl.task} --rollouts ${rl.rollouts} --reward flora-rewarder`];
      for (let i = 0; i < rl.rollouts && alive; i++) {
        sim.reset(sampleLayout(rand, 1.1));
        const { profile, actTask } = rolloutSetup(pol, rl.task, { spread: 1.1, chunk: 10, speed: 1, visual: false }, rand);
        const r = new Rollout(sim, rl.task, profile, rand, { record: false, actTask });
        while (!r.step());
        const truth = r.result().metrics.success;
        const label = rand() < 0.9 ? truth : !truth; // reward models are good, not perfect
        out.push({ truth, label });
        log.push(`rollout ${String(i + 1).padStart(2)}  physics: ${truth ? 'success' : 'fail   '}  reward model says: ${label ? 'success' : 'fail'}${truth !== label ? '   ← mislabeled' : ''}`);
        term.textContent = log.join('\n'); term.scrollTop = term.scrollHeight;
        await new Promise((res) => setTimeout(res, 0));
      }
      sim.dispose();
      if (!alive) return;
      const upd = rlUpdate(pol, rl.task, out, rl.interventions);
      const gpu = Math.round(rl.rollouts * 0.03 * 10) / 10;
      Object.assign(pol, { skill: upd.skill, motion: upd.motion, rl: (pol.rl || 0) + 1, gpuHours: Math.round((pol.gpuHours + gpu) * 10) / 10 });
      if (!pol.name.includes('+rl')) pol.name += '+rl';
      state.gpuHours = Math.round((state.gpuHours + gpu) * 10) / 10; state.opsHours += rl.interventions / 5;
      state.seen.rlDone = true;
      const sr = out.filter((o) => o.truth).length;
      log.push(`practice success ${sr}/${out.length} · mislabeled ${out.filter((o) => o.truth !== o.label).length} · billed ${gpu} GPU-h`, `updated ${pol.name}. Re-run the eval workbench to see if it helped.`);
      term.textContent = log.join('\n'); running = false; save(); form(); renderPolicies();
    }

    function run() {
      const stats = datasetStats(episodes, f.robot, f.tasks), m = MODELS[f.model], gpu = GPUS[f.gpu];
      const res = trainPolicy(f.model, { ...f }, stats, [...f.tasks], state.nextId);
      const name = `${(state.name || 'me').toLowerCase().replace(/\W+/g, '') || 'me'}/${f.model}-${f.tasks.length > 1 ? 'multi' : f.tasks[0]}-v${state.policies.filter((p) => !p.baseline && !p.reference).length + 1}`;
      const flags = [f.lora && '--lora', f.dr && '--domain-rand', (f.ego || m.egoNative) && m.lang && '--init ego-pretrained', m.lang && f.lang !== 'task' && `--lang ${f.lang}`].filter(Boolean).join(' ');
      const log = [`$ lab train --policy ${f.model} --robot ${f.robot} --tasks ${f.tasks.join(',')} --steps ${f.steps} --lr ${f.lr} --batch ${f.batch} ${flags}`, `[cluster-bot] allocated ${gpu.name}`, `loading ${stats.total} episodes…`];
      const out = () => { term.textContent = log.join('\n'); term.scrollTop = term.scrollHeight; };
      if (res.error === 'nodata') { log.push('ERROR: need at least 2 episodes for these tasks on this robot. Go record, dream or request some.'); return out(); }
      if (res.error === 'oom') { log.push(`loading ${m.name} weights (${m.params})…`, `torch.OutOfMemoryError: CUDA out of memory. Job needs ~${res.vram} GB, GPU has ${gpu.vram} GB.`, 'Hint: smaller batch, LoRA, or a bigger GPU.'); return out(); }
      if (m.lang && f.lang !== 'task' && stats.annotated / stats.total < 0.5) log.push(`warning: only ${stats.annotated}/${stats.total} episodes have subtask captions; the rest train on the task label alone.`);
      running = true; form(); out();
      const total = 60, c = res.curve; let i = 0;
      const stopAt = res.diverged ? 26 : total;
      timer = setInterval(() => {
        i++;
        const step = Math.round(f.steps * i / total);
        if (i % 4 === 0 || i === stopAt) log.push(`step ${String(step).padStart(6)}/${f.steps}  loss ${c.train[i].toFixed(3)}  val ${c.val[i].toFixed(3)}  vram ${res.vram}/${gpu.vram} GB`);
        lineChart(chart, [{ data: c.train, color: '#6ab0ff' }, { data: c.val, color: '#ff9d3c' }], { ymin: 0, ymax: Math.max(1.1, ...c.val.slice(0, i + 1)), upto: i / total });
        if (i >= stopAt) {
          clearInterval(timer); running = false;
          const spent = Math.round(res.gpuHours * stopAt / total * 10) / 10;
          state.gpuHours = Math.round((state.gpuHours + spent) * 10) / 10;
          if (res.diverged) { log.push('loss is nan. Training diverged: the learning rate is far too high for this model.', `[cluster-bot] job failed, billed ${spent} GPU-h`); }
          else {
            ensureBaseline();
            state.policies.push({ ...res, curve: null, id: newId('pol'), name, robot: f.robot, n: stats.total });
            log.push(`done. val action error ${res.valErr} (lower is better)`, `saved checkpoint → ${name}`, `[cluster-bot] billed ${spent} GPU-h`);
            toast(`Policy ${name} is ready. Offline numbers look ${res.valErr < 0.015 ? 'good' : res.valErr < 0.03 ? 'okay' : 'rough'}; the workbench will tell you the truth.`);
          }
          save(); form(); renderPolicies();
        }
        out();
      }, 130);
    }

    el.append(h('.split', {},
      h('.side', { style: 'width:350px' }, h('h3', {}, 'Model'), modelPick, h('h3', { style: 'margin-top:14px' }, 'Job config'), hp),
      h('.mainc.pad', { style: 'gap:12px' }, summary, h('.row', {}, btn, h('span.dim', { style: 'font-size:12px' }, h('span', { style: 'color:#6ab0ff' }, '━ train loss'), '  ', h('span', { style: 'color:#ff9d3c' }, '━ validation loss'))), chart, term, rlBox, pols)));
    form(); renderPolicies();
    const off = bus.on('change', () => { if (!running) renderPolicies(); });
    return () => { alive = false; clearInterval(timer); off(); };
  },
};
