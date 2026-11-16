import { h, fill, state, bus, resetAll } from '../util.js';
import { TICKETS, activeTicket } from '../story.js';

export default {
  id: 'tickets', icon: '🎫', title: 'Tickets',
  mount(el, { openApp }) {
    const render = () => {
      const active = activeTicket();
      fill(el, h('.pad', { style: 'max-width:760px' },
        h('h2', {}, `Onboarding board${state.name ? ' · ' + state.name : ''}`),
        h('p.dim', {}, 'Work top to bottom. Tickets close themselves when the work is done.'),
        TICKETS.map((t) => {
          const done = t.done(), isActive = active?.id === t.id;
          return h(`.ticket${done ? '.done' : ''}${isActive ? '.active' : ''}`, {},
            h('.id', {}, t.id),
            h('div', { style: 'flex:1' }, h('b', {}, t.title), t.optional ? h('span.chip', { style: 'margin-left:8px' }, 'optional') : null,
              h('.dim', {}, t.desc), !done && t.progress ? h('.mono.dim', {}, t.progress()) : null),
            h('.st', {}, done ? 'Done' : isActive ? 'In progress' : 'To do'),
            !done && t.app !== 'tickets' ? h('button.small' + (isActive ? '' : '.ghost'), { onclick: () => openApp(t.app) }, 'Open') : null);
        }),
        h('p.dim', { style: 'margin-top:24px' }, 'Want a clean slate? ', h('button.small.ghost', { onclick: () => confirm('Erase all progress, demos and policies in this browser?') && resetAll() }, 'Reset the lab'))));
    };
    render();
    return bus.on('change', render);
  },
};
