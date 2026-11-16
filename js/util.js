// Tiny DOM + state helpers. No framework, no build step.
export function h(tag, attrs = {}, ...kids) {
  // h('button.small.ghost#save') -> <button class="small ghost" id="save">
  const el = document.createElement(tag.match(/^[a-z0-9]+/i)?.[0] || 'div');
  const cls = [...tag.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  if (cls.length) el.className = cls.join(' ');
  const id = tag.match(/#([\w-]+)/)?.[1];
  if (id) el.id = id;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += ' ' + v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
// replace an element's children, skipping null/false (so `cond ? el : null` is safe)
export function fill(el, ...kids) { el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)); }
export const fmt = (n, d = 1) => Number(n).toFixed(d);
export const pct = (x) => Math.round(100 * x) + '%';

const listeners = {};
export const bus = {
  on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; },
  emit(ev, data) { (listeners[ev] || []).slice().forEach((fn) => fn(data)); },
};

const KEY = 'rll-state-v1', EP_KEY = 'rll-episodes-v1';
const blank = () => ({
  name: '', tickets: {}, course: { done: {}, code: {} }, policies: [], evals: [],
  gpuHours: 0, opsHours: 0, chat: [], guideOff: false, seen: {}, capstone: { started: false, gpuAtStart: 0, done: false },
  nextId: 1,
});
function load(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
export const state = Object.assign(blank(), load(KEY, {}));
export const episodes = load(EP_KEY, []);
let saveTimer = null;
export function save(withEpisodes = false) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: progress lives in memory only */ } }, 150);
  if (withEpisodes) {
    try { localStorage.setItem(EP_KEY, JSON.stringify(episodes)); }
    catch { toast('Browser storage is full: new episodes will be lost on reload.'); }
  }
  bus.emit('change');
}
export function resetAll() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(EP_KEY); } catch { /* ignore */ }
  location.reload();
}
export const newId = (p) => `${p}-${state.nextId++}`;

export function toast(text, ms = 3500) {
  const t = h('.toast', {}, text);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

// Minimal line chart on a canvas. series = [{data:[...], color}]
export function lineChart(canvas, series, { ymin = null, ymax = null, upto = 1 } = {}) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, hh = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = hh * dpr;
  const c = canvas.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, w, hh);
  const all = series.flatMap((s) => s.data);
  const lo = ymin ?? Math.min(...all), hi = ymax ?? Math.max(...all, lo + 1e-6);
  c.strokeStyle = '#2c3340'; c.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = 4 + (hh - 8) * i / 4; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  for (const s of series) {
    const n = Math.max(2, Math.ceil(s.data.length * (s.upto ?? upto)));
    c.strokeStyle = s.color; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i < n && i < s.data.length; i++) {
      const x = w * i / (s.data.length - 1), y = 4 + (hh - 8) * (1 - (s.data[i] - lo) / (hi - lo));
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  }
}

// In-page confirm dialog (window.confirm is blocked in some embedded viewers).
export function ask(text, okLabel = 'Yes') {
  return new Promise((res) => {
    const m = $('#modal'), close = (v) => { m.hidden = true; res(v); };
    fill(m, h('.box', { style: 'max-width:380px' }, h('p', {}, text), h('.row', {}, h('button', { onclick: () => close(true) }, okLabel), h('button.ghost', { onclick: () => close(false) }, 'Cancel'))));
    m.hidden = false;
  });
}

// ── progress file: take your progress to another browser or keep a backup (no account needed) ──
export function exportProgress(summary = {}) {
  const data = { app: 'robot-learning-lab', version: 1, exported: new Date().toISOString(), summary, state, episodes };
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), download: `robot-lab-progress-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
}
export async function importProgress(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'robot-learning-lab' || !data.state?.course) throw new Error('not a Robot Learning Lab progress file');
  localStorage.setItem(KEY, JSON.stringify(data.state));
  localStorage.setItem(EP_KEY, JSON.stringify(Array.isArray(data.episodes) ? data.episodes : []));
  location.reload();
}
