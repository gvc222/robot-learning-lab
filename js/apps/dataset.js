// Dataset viewer: replay every episode, label keep/discard, submit QA.
import { h, fill, $, state, episodes, save, bus, toast, newId, lineChart } from '../util.js';
import { Sim, loadMujoco, rng, sampleLayout, TASKS, ROBOTS, CONTROL_DT } from '../sim/sim.js';
import { Rollout, DEMO_KINDS, demoMix } from '../sim/operator.js';
import { truthOf, isKeeper } from '../models.js';
import { Viewer } from '../sim/viewer.js';

const OPERATORS = ['ana', 'kofi', 'lin', 'tomás'];
const WHY = { ...Object.fromEntries(Object.entries(DEMO_KINDS).map(([k, v]) => [k, v.why])) };

// Teammates "teleoperate" n demos: scripted operators with human-ish flaws, in real physics.
export async function generateDemos(mj, robot, task, n, onProgress) {
  const sim = new Sim(mj, robot), seed = (Date.now() % 100000) + episodes.length * 31, rand = rng(seed);
  const kinds = demoMix(n, rand);
  for (let i = 0; i < n; i++) {
    sim.reset(sampleLayout(rand));
    const r = new Rollout(sim, task, DEMO_KINDS[kinds[i]].profile, rand);
    while (!r.step());
    episodes.push({ ...r.result(), id: newId('ep'), source: rand.pick(OPERATORS), robot, kind: kinds[i], label: null });
    onProgress?.(i + 1, n);
    await new Promise((res) => setTimeout(res, 0));
  }
  sim.dispose(); save(true);
}

export default {
  id: 'dataset', icon: '🗂️', title: 'Dataset',
  mount(el) {
    let mj, sim, viewer, alive = true, raf, cur = null, frame = 0, playing = true, speed = 1, acc = 0, last = 0, busy = false;
    let filter = state.seen.dsRobot || 'sprout';

    const list = h('.eplist'), view = h('.view3d', {}, h('.hud', {}, h('span.chip#d-id', {}, 'no episode')));
    const scrub = h('input', { type: 'range', min: 0, max: 1, value: 0, oninput: (e) => { frame = +e.target.value; playing = false; show(); } });
    const spark = h('canvas.spark');
    const metrics = h('#ep-metrics');
    const lang = h('.lang', {}, '—');
    const genBtn = h('button#gen-btn', { onclick: () => gen() }, '');
    const reqTask = h('select', {}, Object.values(TASKS).map((t) => h('option', { value: t.id }, t.text)));
    const qaBtn = h('button#qa-btn', { onclick: qa }, 'Submit QA');
    const side = h('.side', {},
      h('label', {}, 'Robot', h('select', { onchange: (e) => { filter = e.target.value; state.seen.dsRobot = filter; save(); cur = null; renderList(); } }, Object.values(ROBOTS).map((r) => h('option', { value: r.id, selected: r.id === filter }, r.name)))),
      h('#d-count.dim', { style: 'font-size:12px;margin-bottom:6px' }), list,
      h('hr', { style: 'border-color:var(--line)' }),
      h('label', {}, 'Request demos of', reqTask), genBtn, h('#d-prog.dim', { style: 'font-size:12px;margin-top:6px' }));
    const main = h('.mainc', {}, view,
      h('.toolbar', {}, h('button.small.ghost', { onclick: () => { playing = !playing; if (cur && frame >= cur.frames.length - 1) frame = 0; } }, '⏯'), h('div', { style: 'flex:1;min-width:120px' }, scrub),
        h('select', { onchange: (e) => { speed = +e.target.value; } }, [1, 2, 4].map((s) => h('option', { value: s }, s + '×')))),
      h('.pad', { style: 'padding-top:10px' },
        h('.row', { style: 'margin-bottom:8px' }, h('span.dim', {}, 'Task language:'), lang),
        metrics, h('.dim', { style: 'font-size:11px;margin-top:6px' }, 'End-effector speed over time'), spark,
        h('.row#label-btns', { style: 'margin-top:12px' },
          h('button.ok', { onclick: () => label('keep') }, 'Keep (K)'), h('button.danger', { onclick: () => label('discard') }, 'Discard (X)'),
          h('button.ghost', { onclick: () => step(-1) }, '← Prev'), h('button.ghost', { onclick: () => step(1) }, 'Next →'), h('span.spacer'), qaBtn)));
    el.append(h('.split', {}, side, main));

    const visible = () => episodes.filter((e) => e.robot === filter);
    function renderList() {
      const eps = visible(), unl = eps.filter((e) => !e.label).length;
      $('#d-count').textContent = `${eps.length} episodes · ${unl} unlabeled · ${eps.filter((e) => e.label === 'keep').length} kept`;
      fill(list, ...eps.map((e) => h('button' + (e === cur ? '.sel' : ''), { onclick: () => select(e) },
        h('span', {}, `${e.id} `, h('span.dim', {}, `${e.source} · ${e.task}`)),
        h('span', { class: e.label === 'keep' ? 'k' : e.label === 'discard' ? 'x' : 'dim' }, e.label === 'keep' ? 'keep' : e.label === 'discard' ? 'discard' : '•'))));
      const first = !episodes.some((e) => e.source !== 'you');
      genBtn.textContent = first ? 'Pull night-shift demos (24)' : 'Request 12 more (2 operator-h)';
      reqTask.parentElement.style.display = first ? 'none' : '';
      genBtn.disabled = busy;
      qaBtn.disabled = !episodes.some((e) => e.source !== 'you') || episodes.some((e) => !e.label);
      qaBtn.title = qaBtn.disabled ? 'Label every episode (on every robot) first' : '';
      if (!cur && eps.length) select(eps.find((e) => !e.label) || eps[0]);
      if (!eps.length) { $('#d-id').textContent = 'no episodes for this robot yet'; fill(metrics, ); lang.textContent = '—'; }
    }
    function select(e) {
      cur = e; frame = 0; playing = true;
      if (sim && sim.robot.id !== e.robot) { sim.dispose(); sim = null; }
      if (!sim && mj) { sim = new Sim(mj, e.robot); viewer.setSim(sim); }
      scrub.max = e.frames.length - 1;
      lang.textContent = `“${TASKS[e.task].text}”`;
      const m = e.metrics, chip = (t, cls = '') => h('span.chip' + cls, {}, t);
      fill(metrics, chip(`operator: ${e.source}`), chip(`duration ${m.duration}s`, m.duration > 11 ? '.warn' : ''), chip(`path ${m.path} m`),
        chip(`idle ${m.idle}%`, m.idle > 30 ? '.warn' : ''), chip(`smoothness ${m.smooth}/100`, m.smooth < 45 ? '.warn' : ''),
        e.revealed ? chip(`QA truth: ${truthOf(e)}`, isKeeper(e) ? '.good' : '.bad') : null);
      renderList(); show();
    }
    function show() {
      if (!cur || !sim) return;
      const f = Math.min(cur.frames.length - 1, Math.floor(frame));
      sim.restore(cur.frames[f]); viewer.draw();
      scrub.value = f;
      $('#d-id').textContent = `${cur.id} · ${(f * CONTROL_DT).toFixed(1)} / ${cur.metrics.duration}s`;
      lineChart(spark, [{ data: cur.speed, color: '#3d4656' }, { data: cur.speed, color: '#ff9d3c', upto: (f + 1) / cur.speed.length }], { ymin: 0 });
    }
    function label(l) { if (!cur) return; cur.label = l; save(true); step(1, true); }
    function step(d, preferUnlabeled = false) {
      const eps = visible(); if (!eps.length) return;
      let i = eps.indexOf(cur);
      if (preferUnlabeled) { const nxt = eps.slice(i + 1).concat(eps.slice(0, i)).find((e) => !e.label); if (nxt) return select(nxt); }
      select(eps[(i + d + eps.length) % eps.length]);
    }
    async function gen() {
      if (!mj || busy) return;
      const first = !episodes.some((e) => e.source !== 'you');
      busy = true; renderList();
      const prog = (i, n) => { $('#d-prog').textContent = `operators recording… ${i}/${n}`; };
      if (first) await generateDemos(mj, 'sprout', 'red_bin', 24, prog);
      else { state.opsHours += 2; await generateDemos(mj, filter, reqTask.value, 12, prog); }
      busy = false; $('#d-prog').textContent = ''; cur = null;
      toast('New episodes are in. They need QA before training.');
      renderList();
    }
    function qa() {
      const eps = episodes.filter((e) => e.source !== 'you' && !e.revealed);
      let right = 0; const rows = [];
      for (const e of eps) {
        const k = truthOf(e), should = isKeeper(e) ? 'keep' : 'discard', ok = e.label === should;
        right += ok; e.revealed = true;
        if (!ok) rows.push(h('tr', {}, h('td', {}, e.id), h('td', {}, `you: ${e.label}`), h('td.bad', {}, `should ${should}`), h('td', { style: 'white-space:normal' }, WHY[k])));
      }
      state.seen.qaSubmitted = true; save(true);
      const score = eps.length ? Math.round(100 * right / eps.length) : 100;
      fill($('#modal'), h('.box', {}, h('h2', {}, `QA report: ${right}/${eps.length} correct (${score}%)`),
        h('p', {}, rows.length ? 'These are the ones a senior reviewer would have labelled differently. You can still change any label; training uses whatever is marked keep.' : 'Spotless. Every call matched the senior reviewer.'),
        rows.length ? h('table', {}, rows) : null,
        h('p.dim', { style: 'margin-top:10px' }, 'Why it matters: imitation learning copies everything. Failed, stalled, shaky and mislabeled demos each leave a different fingerprint on the policy, and you will see it in evaluation.'),
        h('button', { onclick: () => { $('#modal').hidden = true; } }, 'Close')));
      $('#modal').hidden = false; cur = null; renderList();
    }
    function loop(t) {
      if (!alive) return; raf = requestAnimationFrame(loop);
      const dt = Math.min(0.2, (t - last) / 1000 || 0); last = t;
      if (cur && playing && sim) {
        acc += dt * speed;
        if (acc >= CONTROL_DT) { frame += Math.floor(acc / CONTROL_DT); acc %= CONTROL_DT; if (frame >= cur.frames.length - 1) { frame = cur.frames.length - 1; playing = false; } show(); }
      } else viewer?.draw();
    }
    const kd = (e) => {
      if (e.target.matches('input[type=text], textarea, select') || !$('#modal').hidden) return;
      const k = e.key.toLowerCase();
      if (k === 'k') label('keep'); else if (k === 'x') label('discard');
      else if (k === 'arrowright') step(1); else if (k === 'arrowleft') step(-1);
      else if (k === ' ') { playing = !playing; e.preventDefault(); }
    };
    window.addEventListener('keydown', kd);
    renderList();
    (async () => { mj = await loadMujoco(); if (!alive) return; viewer = new Viewer(view); cur = null; renderList(); raf = requestAnimationFrame(loop); })();
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); viewer?.dispose(); sim?.dispose(); };
  },
};
