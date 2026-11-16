// Sandbox: exploratory tools that are not part of the main path (webcam hand tracking, the leader arm, the paper review club).
import { h, state, save } from '../util.js';
import { LESSONS } from '../course/lessons.js';

export default {
  id: 'sandbox', icon: '🧪', title: 'Sandbox',
  mount(el, { openApp } = {}) {
    const card = (icon, title, text, go, id) => h('.card', { style: 'display:flex;gap:12px;align-items:center;margin-bottom:10px' },
      h('span', { style: 'font-size:28px' }, icon), h('div', { style: 'flex:1' }, h('b', {}, title), h('p.dim', { style: 'margin:3px 0 0;font-size:13px' }, text)), h('button' + (id ? '#' + id : ''), { onclick: go }, 'Open'));
    el.append(h('.mainc.pad', { style: 'gap:6px;max-width:680px' }, h('h2', {}, '🧪 Sandbox'),
      h('p.dim', {}, 'Exploratory tools. They are fun and real, but they are not required for the main lessons or the story, and some need a webcam or hardware.'),
      card('🖐', 'Hand Cam', 'Teleoperate a simulated dexterous hand with your webcam and see which of the 33 Feix grasp types you are making. Line your hand up with an outline, then track.', () => openApp('handcam'), 'sb-handcam'),
      card('🕹', 'Leader Arm', 'Drive the simulated arm with a leader-arm style teleoperation interface.', () => openApp('leader'), 'sb-leader'),
      card('🏆', 'CoRL 2026 Review Club', 'The award finalists and other landmark papers, reviewed hands-on with small labs.', () => { const l = LESSONS.find((x) => x.course === 'corl'); if (l) state.seen.lastLesson = l.id; state.seen.openCourses = { ...(state.seen.openCourses || {}), corl: true }; save(); openApp('academy'); }, 'sb-corl')));
  },
};
