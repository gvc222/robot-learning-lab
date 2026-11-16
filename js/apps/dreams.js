// Dream Lab: generate synthetic demos ("neural trajectories") with a video world model, DreamGen-style.
import { h, fill, $, state, episodes, save, bus, toast, newId } from '../util.js';
import { Sim, loadMujoco, rng, sampleLayout, ROBOTS, TASKS, CONTROL_DT } from '../sim/sim.js';
import { WORLD_MODELS, MIN_TUNE_DEMOS, parsePrompt, dream } from '../sim/dreams.js';
import { Viewer } from '../sim/viewer.js';

const PRESETS = ['put the red cube in the bin', 'put the blue cube in the bin', 'stack the red cube on the blue cube', 'wave hello to the camera'];
let pending = []; // generated but not yet reviewed (kept in memory only)

export default {
  id: 'dreams', icon: '🌙', title: 'Dream Lab',
  mount(el) {
    const d = state.dream ||= { robot: 'sprout', wm: 'cosmos_zero', tuned: {}, n: 4, prompt: PRESETS[0] };
    let mj, sim, viewer, alive = true, raf, snaps = [], cur = null, frame = 0, last = 0, acc = 0, busy = false;

    const view = h('.view3d', {}, h('.hud', {}, h('span.chip#w-status', {}, 'loading physics…')), h('.banner#w-banner', { hidden: true }));
    const snapRow = h('.row#w-snaps', { style: 'gap:6px' });
    const wmBox = h('#w-wm'), dreamList = h('#w-list.col', { style: 'gap:8px' });
    const promptIn = h('input#w-prompt', { type: 'text', value: d.prompt, oninput: (e) => { d.prompt = e.target.value; save(); hint(); } });
    const hintEl = h('.dim', { style: 'font-size:12px;margin-top:3px' });
    const goBtn = h('button#w-go', { onclick: generate }, 'Dream');
    const commitBtn = h('button.ok#w-commit', { onclick: commit }, 'Add kept dreams to dataset');

    const tunedKey = () => `${d.robot}:${d.wm}`;
    const realDemos = () => episodes.filter((e) => e.robot === d.robot && e.source !== 'dream' && e.label === 'keep').length;
    function hint() {
      const t = parsePrompt(d.prompt);
      hintEl.textContent = t ? `The IDM will label this clip as “${TASKS[t].text}”.` : 'No task in this lab matches that prompt: expect the world model to improvise.';
    }
    function renderWM() {
      const wm = WORLD_MODELS[d.wm], tuned = !wm.lora || d.tuned[tunedKey()];
      fill(wmBox,
        h('label', {}, 'World model', h('select', { onchange: (e) => { d.wm = e.target.value; save(); renderWM(); } },
          Object.values(WORLD_MODELS).map((m) => h('option', { value: m.id, selected: m.id === d.wm }, m.name)))),
        h('.dim', { style: 'font-size:12px;margin:-4px 0 8px' }, wm.note),
        wm.lora && !tuned ? h('.card', { style: 'margin-bottom:8px' },
          h('div', { style: 'font-size:12.5px' }, `Fine-tune first: LoRA on ≥ ${MIN_TUNE_DEMOS} kept real demos of ${ROBOTS[d.robot].name}. You have ${realDemos()}.`),
          h('button.small', { style: 'margin-top:6px', disabled: realDemos() < MIN_TUNE_DEMOS, onclick: () => {
            d.tuned[tunedKey()] = true; state.gpuHours = Math.round((state.gpuHours + wm.tuneCost) * 10) / 10; save();
            toast(`Fine-tuned ${wm.name.split(' +')[0]} with LoRA on your teleop videos (${wm.tuneCost} GPU-h).`); renderWM();
          } }, `Fine-tune (${wm.tuneCost} GPU-h)`)) : null);
      goBtn.disabled = busy || !tuned || !snaps.length;
      goBtn.title = !snaps.length ? 'Take at least one camera snapshot first' : !tuned ? 'Fine-tune this world model first' : '';
    }
    function renderSnaps() {
      fill(snapRow, snaps.map((s, i) => h('div', { style: 'position:relative' },
        h('img', { src: s.img, style: 'width:72px;border-radius:5px;border:1px solid var(--line);display:block' }),
        h('button.small.ghost', { style: 'position:absolute;top:2px;right:2px;padding:0 5px', title: 'Remove', onclick: () => { snaps.splice(i, 1); renderSnaps(); renderWM(); } }, '×'))));
    }
    function renderList() {
      const reviewed = pending.filter((x) => x.label).length;
      fill(dreamList, pending.length ? pending.map((x) => h('.card' + (x === cur ? '' : ''), { style: `padding:8px 10px;${x === cur ? 'border-color:var(--accent)' : ''}` },
        h('.row', { style: 'gap:8px;flex-wrap:nowrap' },
          h('img', { src: x.snap, style: 'width:56px;border-radius:4px;cursor:pointer', onclick: () => select(x) }),
          h('div', { style: 'flex:1;min-width:0;cursor:pointer', onclick: () => select(x) }, h('.mono', { style: 'font-size:12px' }, x.id), h('.dim', { style: 'font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, `“${x.prompt}”`),
            x.revealed ? h('span.chip', { class: x.kind === 'good' ? 'good' : 'bad' }, `truth: ${x.kind}`) : null),
          h('button.small' + (x.label === 'keep' ? '.ok' : '.ghost'), { onclick: () => { x.label = 'keep'; renderList(); } }, 'Keep'),
          h('button.small' + (x.label === 'discard' ? '.danger' : '.ghost'), { onclick: () => { x.label = 'discard'; renderList(); } }, 'Drop'))))
        : [h('p.dim', {}, 'No dreams yet. Snapshot a scene, write a prompt, press Dream.')]);
      commitBtn.disabled = !pending.length || reviewed < pending.length;
      commitBtn.textContent = pending.length ? `Add kept dreams to dataset (${reviewed}/${pending.length} reviewed)` : 'Add kept dreams to dataset';
    }
    function select(x) {
      cur = x; frame = 0;
      if (sim.robot.id !== x.robot) build(x.robot);
      viewer.useMujocoCamera(sim, 'front');
      viewer.renderer.domElement.style.filter = 'saturate(1.35) contrast(0.92) blur(0.35px) hue-rotate(-8deg)';
      $('#w-banner').hidden = false; $('#w-banner').innerHTML = `<b>Generated video</b> · “${x.prompt}” · watch for objects that teleport or vanish`;
      renderList();
    }
    function live() {
      cur = null; viewer.useMujocoCamera(sim, 'front'); viewer.renderer.domElement.style.filter = '';
      $('#w-banner').hidden = true; sim.reset(layout); viewer.draw(); renderList();
    }
    let layout = sampleLayout(rng(Date.now() % 1e6));
    function build(robot) {
      sim?.dispose(); sim = new Sim(mj, robot); viewer.setSim(sim); viewer.useMujocoCamera(sim, 'front');
      sim.reset(layout); viewer.draw();
    }
    async function generate() {
      const wm = WORLD_MODELS[d.wm]; busy = true; renderWM();
      const rand = rng(Date.now() % 1e9), simD = new Sim(mj, d.robot), made = [];
      for (const [si, s] of snaps.entries()) for (let i = 0; i < d.n; i++) {
        $('#w-status').textContent = `dreaming ${made.length + 1}/${snaps.length * d.n}…`;
        await new Promise((r) => setTimeout(r, 0));
        const ep = dream(simD, s.layout, d.prompt, wm, rand);
        made.push({ ...ep, id: newId('dream'), source: 'dream', robot: d.robot, snap: s.img, label: null, wm: wm.id });
      }
      simD.dispose();
      const cost = Math.round(made.length * wm.costPer * 10) / 10;
      state.gpuHours = Math.round((state.gpuHours + cost) * 10) / 10; state.seen.dreamed = true; save();
      pending.push(...made); busy = false;
      $('#w-status').textContent = `${made.length} dreams generated · ${cost} GPU-h`;
      renderWM(); select(made[0]);
    }
    function commit() {
      let added = 0, badIn = 0, goodOut = 0;
      for (const x of pending) {
        x.revealed = true;
        if (x.label === 'keep') { added++; if (x.kind !== 'good') badIn++; const { snap, revealed, ...ep } = x; episodes.push({ ...ep, label: 'keep' }); }
        else if (x.kind === 'good') goodOut++;
      }
      save(true); state.seen.dreamsCommitted = (state.seen.dreamsCommitted || 0) + added; save();
      fill($('#modal'), h('.box', {}, h('h2', {}, `${added} neural trajectories added`),
        h('p', {}, badIn ? `${badIn} of them ${badIn === 1 ? 'was' : 'were'} broken (off-task or a physics glitch) and ${badIn === 1 ? 'is' : 'are'} now in your training data. Broken dreams hurt the policy like bad teleop does: find them in Dataset (source “dream”) and discard them.` : 'Nothing broken slipped through. Nice review.'),
        goodOut ? h('p.dim', {}, `You dropped ${goodOut} good dream(s). That is cheap to fix: dream again.`) : null,
        h('p.dim', {}, 'Dreams show up in Dataset with source “dream”. In Train they count, but less than real demos.'),
        h('button', { onclick: () => { $('#modal').hidden = true; pending = []; cur = null; renderList(); live(); } }, 'Close')));
      $('#modal').hidden = false;
    }
    function loop(t) {
      if (!alive) return; raf = requestAnimationFrame(loop);
      const dt = Math.min(0.2, (t - last) / 1000 || 0); last = t;
      if (cur && sim) { acc += dt * 2; if (acc >= CONTROL_DT) { frame = (frame + Math.floor(acc / CONTROL_DT)) % (cur.frames.length + 15); acc %= CONTROL_DT; sim.restore(cur.frames[Math.min(frame, cur.frames.length - 1)]); viewer.draw(); } }
    }

    el.append(h('.split', {},
      h('.side', { style: 'width:320px' },
        h('h3', {}, '1 · Camera snapshot'),
        h('p.dim', { style: 'font-size:12px;margin-bottom:6px' }, 'A world model starts from a real first frame: what the robot’s camera sees right now.'),
        h('label', {}, 'Robot', h('select', { onchange: (e) => { d.robot = e.target.value; save(); build(d.robot); renderWM(); } }, Object.values(ROBOTS).map((r) => h('option', { value: r.id, selected: r.id === d.robot }, r.name)))),
        h('.row', { style: 'margin-bottom:8px' },
          h('button.ghost.small', { onclick: () => { layout = sampleLayout(rng(Date.now() % 1e6)); live(); } }, 'New layout'),
          h('button.small#w-snap', { onclick: () => { if (snaps.length >= 6) return toast('Six snapshots is plenty.'); live(); snaps.push({ layout, img: viewer.snapshot(240, 180) }); layout = sampleLayout(rng(Date.now() % 1e6 + 7)); sim.reset(layout); viewer.draw(); renderSnaps(); renderWM(); } }, '📷 Snapshot')),
        snapRow,
        h('h3', { style: 'margin-top:14px' }, '2 · World model'), wmBox,
        h('h3', { style: 'margin-top:6px' }, '3 · Prompt'),
        h('label', {}, 'What should happen in the video?', promptIn), hintEl,
        h('.row', { style: 'gap:4px;margin:6px 0 10px' }, PRESETS.map((p) => h('button.small.ghost', { onclick: () => { promptIn.value = d.prompt = p; save(); hint(); } }, p.split(' ').slice(0, 3).join(' ') + '…'))),
        h('label', {}, 'Dreams per snapshot', h('select', { onchange: (e) => { d.n = +e.target.value; save(); } }, [2, 4, 8].map((n) => h('option', { value: n, selected: n === d.n }, n)))),
        goBtn),
      h('.mainc', {}, view, h('.pad', {}, h('.row', { style: 'margin-bottom:8px' }, h('h3', { style: 'margin:0' }, '4 · Review'), h('span.spacer'), h('button.small.ghost', { onclick: live }, 'Back to live camera'), commitBtn),
        h('p.dim', { style: 'font-size:12.5px' }, 'Each dream is a generated video plus pseudo-actions inferred by an inverse dynamics model. Keep the ones that follow the prompt and obey physics.'),
        dreamList))));
    hint(); renderSnaps(); renderList();
    const off = bus.on('change', () => { if (!busy) renderWM(); });
    (async () => {
      mj = await loadMujoco(); if (!alive) return;
      viewer = new Viewer(view); build(d.robot); $('#w-status').textContent = 'front camera · live';
      renderWM(); raf = requestAnimationFrame(loop);
    })();
    return () => { alive = false; off(); cancelAnimationFrame(raf); viewer?.dispose(); sim?.dispose(); };
  },
};
