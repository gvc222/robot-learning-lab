// Rewards for learning: XP and levels, course badges, congratulations from Boinkie, confetti, and the project portfolio.
import { h, state, bus, toast } from './util.js';

export const LEVELS = [[0, 'Intern'], [60, 'Lab assistant'], [150, 'Junior roboticist'], [300, 'Robot whisperer'], [500, 'Research engineer'], [800, 'Boinkie-approved'], [1200, 'Robot learning legend']];
export const XP = { lesson: 10, read: 4, course: 50, project: 40 };
const CHEERS = ['Nice work!', 'That one is done.', 'Clean.', 'You are getting the hang of this.', 'Another one down.', 'Solid.', 'Look at you go.', 'That was a good one to finish.', 'Boom.', 'Progress you can feel.'];
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const init = () => { state.xp ||= 0; state.badges ||= {}; state.projects ||= {}; };
export const levelOf = (xp = state.xp || 0) => { let i = 0; LEVELS.forEach(([min], k) => { if (xp >= min) i = k; }); const next = LEVELS[i + 1]; return { n: i + 1, name: LEVELS[i][1], next: next ? next[0] : null, nextName: next ? next[1] : null, base: LEVELS[i][0] }; };
export const levelLabel = () => { const l = levelOf(); return `Lv ${l.n} · ${state.xp || 0} XP`; };

// A short burst of confetti over the whole page (skipped for people who prefer reduced motion).
export function confetti(n = 140) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = h('canvas', { style: 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999' }); c.width = innerWidth; c.height = innerHeight; document.body.append(c);
  const g = c.getContext('2d'), cols = ['#ff9d3c', '#4fd08a', '#6ab0ff', '#ff6b6b', '#ffd166', '#c792ea'];
  const ps = Array.from({ length: n }, () => ({ x: c.width / 2 + (Math.random() - 0.5) * 200, y: c.height * 0.35, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, col: pick(cols) }));
  let t = 0; const step = () => { t++; g.clearRect(0, 0, c.width, c.height);
    for (const p of ps) { p.vy += 0.45; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.col; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); }
    if (t < 140) requestAnimationFrame(step); else c.remove(); };
  step();
}
const say = (html) => bus.emit('post', { from: 'Boinkie', html });

export function addXP(n, why) {
  init(); const before = levelOf().n; state.xp += n; const after = levelOf();
  if (after.n > before) { confetti(90); say(`Level up! You are now <b>${after.name}</b> (level ${after.n}). ${after.nextName ? `Next up: ${after.nextName} at ${after.next} XP.` : 'That is the top level. Go build something.'}`); }
  return why;
}

// Called the first time a lesson is passed. info: { lesson, course, courseDone, courseTotal, totalDone, totalAll }
export function lessonDone({ lesson, course, courseDone, courseTotal, totalDone, totalAll }) {
  init(); const gain = lesson.kind === 'read' ? XP.read : XP.lesson; addXP(gain);
  toast(`🎉 ${pick(CHEERS)} +${gain} XP · ${course.title}: ${courseDone}/${courseTotal}`);
  if (totalDone === 1) say('First lesson done! That is the hardest one: starting. Keep going, I will keep count.');
  else if (totalDone % 10 === 0 && totalDone < totalAll) say(`${totalDone} lessons finished. That is real work, not just reading. Check <b>Tickets → Your progress</b> for your badges.`);
  if (courseDone === courseTotal && !state.badges[course.id]) {
    state.badges[course.id] = Date.now(); addXP(XP.course); confetti(200);
    say(`🏅 You finished <b>${course.title}</b>! Badge earned and +${XP.course} XP. ${course.id === 'basics' ? 'You can now talk about robot joints and control with a straight face.' : 'Pick an optional project from that course if you want to make it permanent: building something outside the browser is what turns lessons into skills.'}`);
  }
  if (totalDone === totalAll) { confetti(300); say('🏆 Every lesson in the Lab is done. I mean it: that is a serious amount of robot learning. Pick a project, publish it, and tell people what you built.'); }
  bus.emit('change');
}

export function submitProject(lesson, { url, note }) {
  init(); const first = !state.projects[lesson.id];
  state.projects[lesson.id] = { title: lesson.title, course: lesson.course, url, note, t: Date.now() };
  if (first) { addXP(XP.project); confetti(160); say(`📬 Project saved: <b>${lesson.title}</b>. That is the part that goes on a portfolio. +${XP.project} XP.`); }
  bus.emit('change');
}

export function portfolioMarkdown() {
  init(); const rows = Object.values(state.projects).sort((a, b) => a.t - b.t);
  return `# ${state.name ? state.name + '’s' : 'My'} robot-learning projects\n\nBuilt with Boinkie’s Robot Lab.\n\n` + (rows.length ? rows.map((p) => `## ${p.title}\n\n${p.url ? `- Link: ${p.url}\n` : ''}- Date: ${new Date(p.t).toISOString().slice(0, 10)}\n\n${p.note || ''}\n`).join('\n') : '_No projects yet._\n');
}

// The "Your achievements" block for the progress page.
export function achievementsPanel(COURSES) {
  init(); const l = levelOf(), have = COURSES.filter((c) => state.badges[c.id]), projects = Object.entries(state.projects);
  const pctBar = l.next ? Math.round(100 * ((state.xp - l.base) / (l.next - l.base))) : 100;
  return h('div', { style: 'margin:8px 0 4px' },
    h('h3', { style: 'margin:22px 0 6px' }, '🏆 Your achievements'),
    h('.card', {}, h('div', { style: 'display:flex;justify-content:space-between;font-size:13px' }, h('b', {}, `Level ${l.n}: ${l.name}`), h('span.dim', {}, `${state.xp || 0} XP${l.next ? ` · next level at ${l.next}` : ''}`)),
      h('div', { style: 'height:8px;background:#222a36;border-radius:5px;margin:6px 0 10px;overflow:hidden' }, h('div', { style: `height:100%;width:${pctBar}%;background:var(--accent)` })),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' }, have.length ? have.map((c) => h('span.chip', { title: `Finished ${new Date(state.badges[c.id]).toLocaleDateString()}` }, `🏅 ${c.title}`)) : h('span.dim', { style: 'font-size:12.5px' }, 'Finish every lesson in a course to earn its badge.'))),
    projects.length ? h('div', { style: 'margin-top:10px' }, h('b', { style: 'font-size:13px' }, `📬 Projects you submitted (${projects.length})`),
      ...projects.map(([, p]) => h('div', { style: 'font-size:13px;margin:4px 0' }, p.url ? h('a', { href: p.url, target: '_blank', rel: 'noopener' }, p.title) : p.title)),
      h('button.small.ghost#portfolio-md', { style: 'margin-top:6px', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([portfolioMarkdown()], { type: 'text/markdown' })), download: 'my-robot-projects.md' }); document.body.append(a); a.click(); a.remove(); } }, '⬇ Download portfolio (markdown)')) : null);
}
