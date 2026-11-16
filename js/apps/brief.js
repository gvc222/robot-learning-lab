// Capstone: an open-ended project with hard targets, checked against your real eval runs.
import { h, fill, $, state, episodes, save, bus, fmt } from '../util.js';
import { TASKS, ROBOTS } from '../sim/scene.js';
import { MODELS } from '../models.js';

export const CAPSTONE = {
  robot: 'longarm', tasks: ['blue_bin', 'stack'],
  minTrials: 20, minSpread: 1.2,
  success: 0.8, time: 8, smooth: 50, valErr: 0.015, vramInfer: 8, gpuHours: 8, opsHours: 8, ownDemos: 4,
};
const C = CAPSTONE;

// Find the policy that satisfies the most requirements, using its latest qualifying eval per task.
export function capstoneStatus() {
  const gpu = Math.round((state.gpuHours - state.capstone.gpuAtStart) * 10) / 10, ops = state.opsHours - (state.capstone.opsAtStart || 0);
  const own = episodes.filter((e) => e.source === 'you' && e.robot === C.robot && C.tasks.includes(e.task) && e.metrics.success && e.label !== 'discard').length;
  let best = null;
  for (const pol of state.policies.filter((x) => x.robot === C.robot)) {
    const rows = C.tasks.map((t) => {
      const ev = state.evals.filter((e) => e.task === t && e.trials >= C.minTrials && e.spread >= C.minSpread - 1e-9 && e.rows.some((r) => r.policyId === pol.id)).pop();
      return ev ? ev.rows.find((r) => r.policyId === pol.id) : null;
    });
    const all = rows.every(Boolean);
    const checks = [
      ...C.tasks.map((t, i) => [`“${TASKS[t].text}”: success ≥ ${C.success * 100}%`, rows[i] ? `${Math.round(rows[i].success * 100)}%` : 'no qualifying run', !!rows[i] && rows[i].success >= C.success]),
      [`Average time per trajectory ≤ ${C.time} s (both tasks)`, all ? rows.map((r) => fmt(r.time) + ' s').join(' / ') : '—', all && rows.every((r) => r.time <= C.time)],
      [`Motion quality ≥ ${C.smooth}/100 (both tasks)`, all ? rows.map((r) => Math.round(r.smooth)).join(' / ') : '—', all && rows.every((r) => r.smooth >= C.smooth)],
      [`Offline: validation action error ≤ ${C.valErr}`, String(pol.valErr), pol.valErr <= C.valErr],
      [`Fits the onboard computer: inference VRAM ≤ ${C.vramInfer} GB`, `${pol.vramInfer} GB`, pol.vramInfer <= C.vramInfer],
    ];
    const score = checks.filter((c) => c[2]).length;
    if (!best || score > best.score) best = { pol, checks, score };
  }
  const global = [
    [`Teleop: ≥ ${C.ownDemos} successful demos of your own on ${ROBOTS[C.robot].name}`, `${own}`, own >= C.ownDemos],
    [`Compute budget: ≤ ${C.gpuHours} GPU-hours`, `${fmt(Math.max(0, gpu))} used`, gpu <= C.gpuHours],
    [`Operator budget: ≤ ${C.opsHours} operator-hours`, `${Math.max(0, ops)} used`, ops <= C.opsHours],
  ];
  const done = !!best && best.score === best.checks.length && global.every((g) => g[2]);
  return { best, global, done };
}

export default {
  id: 'brief', icon: '🏁', title: 'Capstone',
  mount(el) {
    const render = () => {
      const started = state.capstone.started;
      const st = started ? capstoneStatus() : null;
      if (st?.done && !state.capstone.done) { state.capstone.done = true; state.capstone.policy = st.best.pol.name; save(); }
      const req = ([text, val, ok]) => h('.req', {}, h('span.mark', { class: ok ? 'good' : 'dim' }, ok ? '✓' : '○'), h('span', { style: 'flex:1' }, text), h('span.mono', { class: ok ? 'good' : 'dim' }, val));
      fill(el, h('.pad', { style: 'max-width:820px' },
        h('h2', {}, 'Project brief: the Friday demo'),
        h('p', {}, 'A customer visits on Friday. They want to talk to the robot. One policy on the ', h('b', {}, ROBOTS[C.robot].name), ' must follow two instructions, and it has to run on the robot’s own 8 GB computer.'),
        h('.col', { style: 'margin-bottom:12px' }, C.tasks.map((t) => h('span.lang', {}, `“${TASKS[t].text}”`))),
        h('.card', {}, h('h3', {}, 'Ground rules'),
          h('ul', { style: 'margin:0;padding-left:18px' },
            h('li', {}, `Results only count from eval runs with ≥ ${C.minTrials} trials and cube spread ≥ ${C.minSpread}× (the customer will not put cubes where you trained).`),
            h('li', {}, 'Both task languages must pass with the ', h('b', {}, 'same policy'), '.'),
            h('li', {}, 'No demos exist for this robot yet. Collect your own and request operator time; then clean what comes back.'),
            h('li', {}, 'Any model, any hyper-parameters, any eval settings you can justify.'))),
        !started
          ? h('p', { style: 'margin-top:14px' }, h('button', { onclick: () => { state.capstone = { started: true, gpuAtStart: state.gpuHours, opsAtStart: state.opsHours, done: false }; save(); } }, 'Start the project'), h('span.dim', {}, '  Budgets start counting from here.'))
          : h('div', { id: 'brief-reqs', style: 'margin-top:14px' },
            h('h3', {}, st.best ? `Best candidate: ${st.best.pol.name} (${MODELS[st.best.pol.modelId].name})` : 'No Longarm policy trained yet'),
            ...(st.best ? st.best.checks : [[`Train a policy for ${ROBOTS[C.robot].name} and evaluate it`, '—', false]]).map(req),
            h('h3', { style: 'margin-top:14px' }, 'Project budgets'), ...st.global.map(req),
            state.capstone.done ? h('.card', { style: 'margin-top:16px;border-color:var(--good)' }, h('h2', {}, '🎉 Shipped.'),
              h('p', {}, `${state.capstone.policy} met every target. You collected data, cleaned it, picked a model under real constraints, and proved it with online evaluation. That is the job.`),
              h('p.dim', {}, 'Ideas for round two: beat it with half the operator hours, or find the largest cube spread it survives.')) : null)));
    };
    render();
    return bus.on('change', render);
  },
};
