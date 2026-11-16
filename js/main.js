// LabOS shell: dock, window, chat, clock, tickets watcher.
import { h, fill, $, state, save, bus, toast, fmt } from './util.js';
import { levelLabel } from './rewards.js';
import { CONTACT } from './config.js';
import { TICKETS, BRIEFINGS, PEOPLE, activeTicket } from './story.js';
import { initGuide } from './guide.js';
import tickets from './apps/tickets.js';
import academy from './apps/academy.js';
import teleop from './apps/teleop.js';
import dataset from './apps/dataset.js';
import dreams from './apps/dreams.js';
import train from './apps/train.js';
import evalApp from './apps/eval.js';
import brief from './apps/brief.js';
import leader from './apps/leader.js';
import handcam from './apps/handcam.js';
import sandbox from './apps/sandbox.js';

leader.sandbox = handcam.sandbox = true;   // reachable from the Sandbox hub, not from the dock
const APPS = [tickets, academy, teleop, dataset, dreams, train, evalApp, brief, sandbox, leader, handcam,
  { id: 'chat', icon: '💬', title: 'Chat', narrowOnly: true, mount(el) { const c = $('#chat'); c.classList.add('as-app'); el.append(c); return () => { c.classList.remove('as-app'); $('#shell').append(c); }; } }];
let current = null, unmount = null;

export function openApp(id) {
  if (current === id) return;
  unmount?.(); unmount = null;
  const app = APPS.find((a) => a.id === id), el = $('#app');
  fill(el, ); el.scrollTop = 0;
  current = id;
  $('#win-title').textContent = `${app.title}`;
  document.querySelectorAll('#dock button').forEach((b) => b.classList.toggle('active', b.dataset.app === id || (!!app.sandbox && b.dataset.app === 'sandbox')));
  unmount = app.mount(el, { openApp }) || null;
  bus.emit('app', id);
}

function buildDock() {
  const dock = $('#dock');
  for (const a of APPS) {
    if (a.sandbox) continue;
    const b = h('button', { 'data-app': a.id, 'data-title': a.title, onclick: () => openApp(a.id) }, h('span.ico', {}, a.icon), a.title);
    if (a.narrowOnly) b.classList.add('narrow-only');
    dock.append(b);
  }
  const mq = matchMedia('(max-width: 1150px)');
  const sync = () => { $('#dock .narrow-only').style.display = mq.matches ? '' : 'none'; if (!mq.matches && current === 'chat') openApp('tickets'); };
  mq.addEventListener('change', sync); sync();
}

// ---- chat ----
export function post(from, html) {
  state.chat.push({ from, html, t: Date.now() });
  save(); renderChat();
  if (from !== 'You') toast(`💬 ${from}: ${html.replace(/<[^>]+>/g, '').slice(0, 90)}…`);
}
function renderChat() {
  const log = h('.chat-log', {}, state.chat.map((m) => h('.msg', {},
    h('.av', {}, PEOPLE[m.from]?.av || '👤'),
    h('div', {}, h('.who', {}, m.from, h('span.when', {}, new Date(m.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))), h('.body', { html: m.html })))));
  fill($('#chat'), h('.chat-head', {}, '# robot-learning'), log);
  log.scrollTop = log.scrollHeight;
}

// ---- tickets watcher ----
function watch() {
  $('#m-gpu').textContent = fmt(state.gpuHours, 1);
  $('#m-ops').textContent = state.opsHours;
  $('#m-xp').textContent = levelLabel();
  for (const t of TICKETS) {
    if (!state.tickets[t.id] && t.done()) {
      state.tickets[t.id] = true; save();
      toast(`✅ ${t.id} done: ${t.title}`);
      const next = activeTicket();
      if (next && !state.seen['brief:' + next.id]) {
        state.seen['brief:' + next.id] = true;
        (BRIEFINGS[next.id] || []).forEach(([who, text], i) => setTimeout(() => post(who, text), 900 + 1400 * i));
      } else if (!next && !state.seen.allDone) { state.seen.allDone = true; setTimeout(() => post('Boinkie', 'That is everything. You shipped it. 🎉 The lab stays open: try other robots, models and tasks.'), 900); }
    }
  }
}

function welcome() {
  const input = h('input', { type: 'text', placeholder: 'Your first name', maxLength: 24 });
  const go = () => {
    state.name = input.value.trim() || 'New hire';
    $('#modal').hidden = true; save();
    post('Boinkie', `Hi ${state.name}! I am Boinkie, I lead robot learning here. Your onboarding is a list of tickets, top to bottom. I will leave you sticky notes (the orange popups) as you go.`);
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  fill($('#modal'), h('.box', {},
    h('h2', {}, '🦾 Welcome to Boinkie’s Robot Lab'),
    h('p', {}, 'It is your first day as a robot learning researcher. This week you will write a little robot code, teleoperate an arm to collect data, clean that data, train a policy, and evaluate it. Then you ship one on your own.'),
    h('p.dim', {}, 'The physics is real (MuJoCo, running in your browser). Model training is simulated so it takes seconds instead of GPU-days. No account, nothing to install; progress is saved in this browser.'),
    h('label', {}, 'What should the team call you?', input),
    h('button', { onclick: go }, 'Badge in')));
  $('#modal').hidden = false; input.focus();
}

buildDock(); renderChat();
bus.on('change', watch);
bus.on('post', ({ from, html }) => post(from, html));
$('#xp-chip').addEventListener('click', () => openApp('tickets'));
$('#contact-btn').addEventListener('click', () => {
  const link = (icon, label, url) => h('a', { href: url, target: '_blank', rel: 'noopener', style: 'display:flex;gap:10px;align-items:center;padding:9px 12px;border:1px solid var(--line);border-radius:8px;color:var(--text);text-decoration:none;margin:6px 0' }, h('span', { style: 'font-size:20px' }, icon), h('span', {}, label));
  fill($('#modal'), h('.box', {}, h('h2', {}, '👋 Find me online'),
    h('p', {}, `I am ${CONTACT.name}, and I built this lab. Questions, bugs, ideas, or something you built with it? Say hi.`),
    link('🌐', `My website: ${CONTACT.website.label}`, CONTACT.website.url), link('🐙', `GitHub: ${CONTACT.github.label}`, CONTACT.github.url), link('💼', `LinkedIn: ${CONTACT.linkedin.label}`, CONTACT.linkedin.url),
    h('div', { style: 'display:flex;gap:10px;align-items:center;padding:9px 12px;border:1px solid var(--line);border-radius:8px;margin:6px 0' }, h('span', { style: 'font-size:20px' }, '💬'), h('span', { style: 'flex:1' }, 'Discord: ', h('b.mono', {}, CONTACT.discord)),
      h('button.small.ghost#copy-discord', { onclick: async () => { try { await navigator.clipboard.writeText(CONTACT.discord); toast('Copied my Discord name.'); } catch { toast(`My Discord name is ${CONTACT.discord}`); } } }, 'Copy')),
    h('button', { onclick: () => { $('#modal').hidden = true; } }, 'Close')));
  $('#modal').hidden = false;
});
initGuide(() => current, openApp);
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 1000);
openApp('tickets');
watch();
if (!state.name) welcome();
window.lab = { state, openApp }; // handy in the console
