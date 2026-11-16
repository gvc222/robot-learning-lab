import { h, fill, state, bus, resetAll, ask, exportProgress, importProgress, toast } from '../util.js';
import { TICKETS, activeTicket } from '../story.js';
import { achievementsPanel } from '../rewards.js';
import { COURSES } from '../course/lessons.js';
import { LESSONS } from '../course/lessons.js';

const summary = () => ({ name: state.name || null, xp: state.xp || 0, projects_submitted: Object.keys(state.projects || {}).length, lessons_done: Object.keys(state.course.done).filter((k) => state.course.done[k]).length, lessons_total: LESSONS.length,
  tickets_done: TICKETS.filter((t) => t.done()).map((t) => t.id), capstone_done: !!state.capstone?.done, policies: state.policies.length, evals: (state.evals || []).length, gpu_hours: state.gpuHours });

export default {
  id: 'tickets', icon: '🎫', title: 'Tickets',
  mount(el, { openApp }) {
    const render = () => {
      const active = activeTicket();
      fill(el, h('.pad', { style: 'max-width:760px' },
        h('h2', {}, `Onboarding board${state.name ? ' · ' + state.name : ''}`),
        h('p.dim', {}, 'Work top to bottom. Tickets close themselves when the work is done.'),
        TICKETS.map((t, i) => {
          const done = t.done(), isActive = active?.id === t.id;
          const header = t.week && TICKETS[i - 1]?.week !== t.week ? h('h3', { style: 'margin:22px 0 8px' }, { 2: 'Week 2 · research tools', 3: 'Week 3 · twins, deployment, mobile, hands', 4: 'Week 4 · fundamentals and real training' }[t.week]) : null;
          return [header, h(`.ticket${done ? '.done' : ''}${isActive ? '.active' : ''}`, {},
            h('.id', {}, t.id),
            h('div', { style: 'flex:1' }, h('b', {}, t.title), t.optional ? h('span.chip', { style: 'margin-left:8px' }, 'optional') : null,
              h('.dim', {}, t.desc), !done && t.progress ? h('.mono.dim', {}, t.progress()) : null),
            h('.st', {}, done ? 'Done' : isActive ? 'In progress' : 'To do'),
            !done && t.app !== 'tickets' ? h('button.small' + (isActive ? '' : '.ghost'), { onclick: () => openApp(t.app) }, 'Open') : null)];
        }),
        achievementsPanel(COURSES),
        h('h3', { style: 'margin:26px 0 6px' }, 'Your progress'),
        h('p.dim', {}, 'Progress is saved in this browser only. Download a progress file to back it up or move to another computer.'),
        h('.row', {}, h('button.small#export-progress', { onclick: () => exportProgress(summary()) }, '⬇ Download progress file'),
          h('button.small.ghost', { onclick: () => el.querySelector('#import-progress').click() }, '⬆ Load a progress file'),
          h('input#import-progress', { type: 'file', accept: '.json', style: 'display:none', onchange: async (e) => {
            const f = e.target.files[0]; if (!f) return;
            if (!(await ask('Replace the progress in this browser with the file?', 'Replace'))) return;
            try { await importProgress(f); } catch (err) { toast(`Could not load: ${err.message}`); }
          } })),
        h('p.dim', { style: 'margin-top:24px' }, 'Want a clean slate? ', h('button.small.ghost', { onclick: async () => (await ask('Erase all progress, demos and policies in this browser?', 'Erase everything')) && resetAll() }, 'Reset the lab'))));
    };
    render();
    return bus.on('change', render);
  },
};
