// Training: pick a model, a dataset slice and hyper-parameters; watch the (simulated) job run.
import { h, fill, $, state, episodes, save, bus, toast, newId, lineChart, fmt } from '../util.js';
import { TASKS, ROBOTS } from '../sim/scene.js';
import { MODELS, GPUS, datasetStats, trainPolicy } from '../models.js';

export function ensureBaseline() {
  if (state.policies.some((p) => p.baseline)) return;
  const raw = episodes.filter((e) => e.source !== 'you').map((e) => ({ ...e, label: null }));
  const stats = datasetStats(raw, 'sprout', ['red_bin']);
  if (stats.total < 2) return;
  const m = MODELS.act, res = trainPolicy('act', { steps: m.stepsNeeded, lr: m.lrBest, batch: 8, gpu: 'rtx4090', lora: false }, stats, ['red_bin'], 7);
  state.policies.push({ ...res, curve: null, id: newId('pol'), name: 'maya/act-rawdata', robot: 'sprout', baseline: true, n: stats.total });
}

export default {
  id: 'train', icon: '🔥', title: 'Train',
  mount(el) {
    const f = state.seen.trainForm ||= { model: 'act', robot: 'sprout', tasks: ['red_bin'], steps: 30000, lr: 1e-5, batch: 8, gpu: 'rtx4090', lora: false };
    let running = false, timer;
    const term = h('.term', {}, 'No job running.'), chart = h('canvas.chart');
    const summary = h('#data-summary.card'), pols = h('div');
    const modelPick = h('#model-pick.col');
    const hp = h('#hparams');
    const btn = h('button#train-btn', { onclick: run }, 'Launch training job');

    function form() {
      const m = MODELS[f.model];
      fill(modelPick, ...Object.values(MODELS).map((mm) => h('label.check.card', { style: `align-items:flex-start;${mm.id === f.model ? 'border-color:var(--accent)' : ''}` },
        h('input', { type: 'radio', name: 'model', checked: mm.id === f.model, onchange: () => { f.model = mm.id; f.steps = mm.stepsNeeded; f.lr = mm.lrBest; f.lora = false; save(); form(); } }),
        h('div', {}, h('b', {}, mm.name), h('span.dim', {}, ` · ${mm.params} params · ${mm.lang ? 'reads language' : 'no language input'}`), h('.dim', { style: 'font-size:12px' }, mm.blurb)))));
      const lrs = [1e-6, 2.5e-6, 1e-5, 2.5e-5, 1e-4, 2.5e-4, 1e-3];
      const sel = (key, opts, lab = (v) => v) => h('select', { onchange: (e) => { f[key] = isNaN(+e.target.value) ? e.target.value : +e.target.value; save(); form(); } }, opts.map((o) => h('option', { value: o, selected: String(o) === String(f[key]) }, lab(o))));
      fill(hp, 
        h('label', {}, 'Robot (uses demos recorded on this robot)', sel('robot', Object.keys(ROBOTS), (r) => ROBOTS[r].name)),
        h('.dim', { style: 'font-size:12px' }, 'Tasks to train on'),
        ...Object.values(TASKS).map((t) => h('label.check', {}, h('input', { type: 'checkbox', checked: f.tasks.includes(t.id), onchange: (e) => { f.tasks = e.target.checked ? [...f.tasks, t.id] : f.tasks.filter((x) => x !== t.id); save(); form(); } }), `“${t.text}”`)),
        h('.row', { style: 'margin-top:8px' },
          h('label', { style: 'flex:1' }, 'Training steps', h('input', { type: 'number', min: 500, max: 200000, step: 500, value: f.steps, onchange: (e) => { f.steps = Math.max(500, Math.min(200000, +e.target.value || 500)); save(); form(); } })),
          h('label', { style: 'flex:1' }, 'Learning rate', sel('lr', lrs, (v) => v.toExponential(1))),
          h('label', { style: 'flex:1' }, 'Batch size', sel('batch', [2, 4, 8, 16, 32]))),
        h('label', {}, 'Compute', sel('gpu', Object.keys(GPUS), (g) => `${GPUS[g].name}${GPUS[g].rate > 1 ? ' · billed ' + GPUS[g].rate + '×' : ''}`)),
        m.lang ? h('label.check', {}, h('input', { type: 'checkbox', checked: f.lora, onchange: (e) => { f.lora = e.target.checked; save(); form(); } }), 'LoRA fine-tune (about half the VRAM, slightly lower quality)') : null);
      const stats = datasetStats(episodes, f.robot, f.tasks);
      const unl = episodes.filter((e) => e.robot === f.robot && f.tasks.includes(e.task) && !e.label).length;
      const est = trainPolicy(f.model, f, stats, f.tasks);
      fill(summary, h('h3', {}, 'Dataset going in'),
        ...f.tasks.map((t) => h('div', {}, h('span.mono', {}, `${String(stats.per[t].total).padStart(3)} episodes`), ` · “${TASKS[t].text}”`)),
        h('.dim', { style: 'font-size:12px;margin-top:4px' }, `${stats.total} total on ${ROBOTS[f.robot].name}, ${stats.own} recorded by you.`),
        unl ? h('.chip.warn', { style: 'margin-top:6px' }, `⚠ ${unl} unreviewed episodes are included`) : null,
        h('.dim', { style: 'font-size:12px;margin-top:6px' }, `Peak training memory: about ${est.vram} GB VRAM on a ${GPUS[f.gpu].vram} GB GPU.`),
        est.vram > GPUS[f.gpu].vram ? h('.chip.warn', {}, '⚠ will not fit on this GPU') : null);
      btn.disabled = running || !f.tasks.length;
    }

    function renderPolicies() {
      fill(pols, h('h3', {}, 'Policy registry'), state.policies.length ? h('.col', {}, state.policies.slice().reverse().map((p) => h('.card', {},
        h('.row', {}, h('b.mono', {}, p.name), h('span.spacer'), p.baseline ? h('span.chip', {}, 'baseline') : h('button.small.ghost', { onclick: () => { state.policies.splice(state.policies.indexOf(p), 1); save(); renderPolicies(); } }, '🗑')),
        h('.dim', { style: 'font-size:12px' }, `${MODELS[p.modelId].name} · ${ROBOTS[p.robot].name} · ${p.tasks.join(', ')} · ${p.n} demos`),
        h('div', { style: 'margin-top:6px' }, h('span.chip', {}, `val action err ${p.valErr}`), h('span.chip', {}, `${fmt(p.gpuHours)} GPU-h`), h('span.chip', {}, `train ${p.vram} GB`), h('span.chip', {}, `inference ${p.vramInfer} GB · ${Math.round(p.latency * 1000)} ms`))))) : h('p.dim', {}, 'No trained policies yet.'));
    }

    function run() {
      const stats = datasetStats(episodes, f.robot, f.tasks), m = MODELS[f.model], gpu = GPUS[f.gpu];
      const res = trainPolicy(f.model, { ...f }, stats, [...f.tasks], state.nextId);
      const name = `${(state.name || 'me').toLowerCase().replace(/\W+/g, '')}/${f.model}-${f.tasks.length > 1 ? 'multi' : f.tasks[0]}-v${state.policies.filter((p) => !p.baseline).length + 1}`;
      const log = [`$ lab train --policy ${f.model} --robot ${f.robot} --tasks ${f.tasks.join(',')} --steps ${f.steps} --lr ${f.lr} --batch ${f.batch}${f.lora ? ' --lora' : ''}`, `[cluster-bot] allocated ${gpu.name}`, `loading ${stats.total} episodes…`];
      const out = () => { term.textContent = log.join('\n'); term.scrollTop = term.scrollHeight; };
      if (res.error === 'nodata') { log.push('ERROR: need at least 2 episodes for these tasks on this robot. Go record or request some.'); return out(); }
      if (res.error === 'oom') { log.push(`loading ${m.name} weights (${m.params})…`, `torch.OutOfMemoryError: CUDA out of memory. Job needs ~${res.vram} GB, GPU has ${gpu.vram} GB.`, 'Hint: smaller batch, LoRA, or a bigger GPU.'); return out(); }
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
      h('.side', { style: 'width:340px' }, h('h3', {}, 'Model'), modelPick, h('h3', { style: 'margin-top:14px' }, 'Job config'), hp),
      h('.mainc.pad', { style: 'gap:12px' }, summary, h('.row', {}, btn, h('span.dim', { style: 'font-size:12px' }, h('span', { style: 'color:#6ab0ff' }, '━ train loss'), '  ', h('span', { style: 'color:#ff9d3c' }, '━ validation loss'))), chart, term, pols)));
    form(); renderPolicies();
    const off = bus.on('change', () => { if (!running) renderPolicies(); });
    return () => { clearInterval(timer); off(); };
  },
};
