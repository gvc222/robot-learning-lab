// Step-by-step guide popups anchored to elements on screen.
import { h, fill, $, state, save, bus } from './util.js';
import { GUIDE, activeTicket } from './story.js';

let ticketId = null, step = 0, ringEl = null, currentApp = () => null, openApp = () => {};

export function initGuide(getApp, open) {
  currentApp = getApp; openApp = open;
  $('#guide-toggle').onclick = () => { state.guideOff = !state.guideOff; save(); render(); };
  setInterval(tick, 500);
  bus.on('app', render);
  window.addEventListener('resize', render);
}

function steps() { return GUIDE[ticketId] || []; }

function tick() {
  const t = activeTicket();
  if ((t?.id || null) !== ticketId) { ticketId = t?.id || null; step = 0; }
  const s = steps()[step];
  if (s?.until && s.until()) step++;
  render();
}

function render() {
  const el = $('#guide');
  $('#guide-toggle').textContent = `Guide: ${state.guideOff ? 'off' : 'on'}`;
  ringEl?.classList.remove('guide-ring'); ringEl = null;
  const s = steps()[step];
  if (state.guideOff || !s || !$('#modal').hidden) { el.hidden = true; return; }
  const here = currentApp() === s.app;
  const target = here ? $(s.sel) : $(`#dock [data-app="${s.app}"]`);
  if (!target || target.offsetParent === null) { el.hidden = true; return; }
  const text = here ? s.text : `Next up: open <b>${target.dataset.title}</b>.`;
  const key = `${ticketId}:${step}:${here}`;
  if (el.dataset.key !== key) {
    el.dataset.key = key;
    fill(el, 
      h('.gh', {}, '👩🏽‍🔬 Maya', h('span.spacer'), h('span', {}, `${ticketId} · ${step + 1}/${steps().length}`),
        h('button', { title: 'Hide the guide (bring it back from the top bar)', onclick: () => { state.guideOff = true; save(); render(); } }, '✕')),
      h('.gb', { html: text }),
      h('.gf', {},
        !here ? h('button.small', { onclick: () => openApp(s.app) }, 'Take me there') : null,
        here && step > 0 ? h('button.small.ghost', { onclick: () => { step--; render(); } }, 'Back') : null,
        here ? h('button.small', { onclick: () => { step++; render(); } }, s.until ? 'Skip' : step === steps().length - 1 ? 'Got it' : 'Next') : null,
        here && s.until ? h('span', { style: 'font-size:12px;opacity:.7' }, 'waiting for you…') : null),
    );
  }
  el.hidden = false;
  ringEl = target; target.classList.add('guide-ring');
  // place the popup beside the target, wherever there is room
  const r = target.getBoundingClientRect(), gw = el.offsetWidth, gh = el.offsetHeight, W = innerWidth, H = innerHeight;
  let x, y;
  if (r.right + gw + 14 < W) { x = r.right + 12; y = r.top; }
  else if (r.left - gw - 14 > 0) { x = r.left - gw - 12; y = r.top; }
  else if (r.bottom + gh + 14 < H) { x = r.left; y = r.bottom + 12; }
  else if (r.top - gh - 14 > 0) { x = r.left; y = r.top - gh - 12; }
  else { x = r.right - gw - 16; y = r.bottom - gh - 16; } // huge target: tuck into its corner
  el.style.left = Math.max(8, Math.min(W - gw - 8, x)) + 'px';
  el.style.top = Math.max(48, Math.min(H - gh - 8, y)) + 'px';
}
