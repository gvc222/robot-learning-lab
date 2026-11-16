// Dataset viewer: replay every episode, label keep/discard, annotate subtasks, submit QA, export.
import { h, fill, $, state, episodes, save, bus, toast, newId, lineChart } from '../util.js';
import { Sim, loadMujoco, rng, sampleLayout, TASKS, ROBOTS, CONTROL_DT } from '../sim/sim.js';
import { Rollout, DEMO_KINDS, demoMix } from '../sim/operator.js';
import { truthOf, isKeeper } from '../models.js';
import { trueSubtasks, autoLabel, captionsFor } from '../annotate.js';
import { makeZip, dataUrlBytes } from '../zip.js';
import { Viewer } from '../sim/viewer.js';

const OPERATORS = ['ana', 'kofi', 'lin', 'tomás'];
const WHY = { ...Object.fromEntries(Object.entries(DEMO_KINDS).map(([k, v]) => [k, v.why])) };
const SEG_COLORS = ['#6ab0ff', '#ff9d3c', '#4fd08a', '#b79cff', '#8d97a8'];

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
    const timeline = h('canvas#d-timeline', { style: 'width:100%;height:26px;display:block;border-radius:6px;background:#0a0c10;cursor:pointer' });
    const segList = h('#d-segs');
    const metrics = h('#ep-metrics');
    const lang = h('.lang', {}, '—');
    const genBtn = h('button#gen-btn', { onclick: () => gen() }, '');
    const reqTask = h('select', {}, Object.values(TASKS).map((t) => h('option', { value: t.id }, t.text)));
    const qaBtn = h('button#qa-btn', { onclick: qa }, 'Submit QA');
    const side = h('.side', {},
      h('label', {}, 'Robot', h('select', { onchange: (e) => { filter = e.target.value; state.seen.dsRobot = filter; save(); cur = null; renderList(); } }, Object.values(ROBOTS).map((r) => h('option', { value: r.id, selected: r.id === filter }, r.name)))),
      h('#d-count.dim', { style: 'font-size:12px;margin-bottom:6px' }), list,
      h('hr', { style: 'border-color:var(--line)' }),
      h('label', {}, 'Request demos of', reqTask), genBtn, h('#d-prog.dim', { style: 'font-size:12px;margin-top:6px' }),
      h('hr', { style: 'border-color:var(--line)' }),
      h('button.ghost#auto-btn', { style: 'width:100%;margin-bottom:6px', onclick: autoAll }, '🏷 Auto-label all (FLORA-style)'),
      h('button.ghost#export-btn', { style: 'width:100%', onclick: exportDialog }, '⬇ Export LeRobotDataset'));
    const main = h('.mainc', {}, view,
      h('.toolbar', {}, h('button.small.ghost', { onclick: () => { playing = !playing; if (cur && frame >= cur.frames.length - 1) frame = 0; } }, '⏯'), h('div', { style: 'flex:1;min-width:120px' }, scrub),
        h('select', { onchange: (e) => { speed = +e.target.value; } }, [1, 2, 4].map((s) => h('option', { value: s }, s + '×')))),
      h('.pad', { style: 'padding-top:10px' },
        h('.row', { style: 'margin-bottom:8px' }, h('span.dim', {}, 'Task language:'), lang),
        metrics, h('.dim', { style: 'font-size:11px;margin-top:6px' }, 'End-effector speed over time'), spark,
        h('#d-annot', { style: 'margin-top:10px' },
          h('.row', { style: 'margin-bottom:4px' }, h('span.dim', { style: 'font-size:11px' }, 'Subtasks (click the bar to jump; Split adds a boundary at the playhead)'), h('span.spacer'),
            h('button.small.ghost', { onclick: split }, 'Split here (B)'), h('button.small.ghost', { onclick: () => { if (cur) { const r = autoLabel(cur, rng(Date.now() % 1e6)); cur.subtasks = r.subtasks; cur.outcome = r.outcome; save(true); renderAnnot(); } } }, 'Auto-label'),
            h('button.small.ghost', { onclick: () => { if (cur) { delete cur.subtasks; save(true); renderAnnot(); } } }, 'Clear')),
          timeline, segList),
        h('.row#label-btns', { style: 'margin-top:12px' },
          h('button.ok', { onclick: () => label('keep') }, 'Keep (K)'), h('button.danger', { onclick: () => label('discard') }, 'Discard (X)'),
          h('button.ghost', { onclick: () => step(-1) }, '← Prev'), h('button.ghost', { onclick: () => step(1) }, 'Next →'), h('span.spacer'), qaBtn)));
    el.append(h('.split', {}, side, main));

    timeline.addEventListener('click', (e) => { if (!cur) return; const r = timeline.getBoundingClientRect(); frame = Math.floor((e.clientX - r.left) / r.width * cur.frames.length); playing = false; show(); });

    const visible = () => episodes.filter((e) => e.robot === filter);
    const qaPool = () => episodes.filter((e) => e.source !== 'you' && e.source !== 'dream');
    function renderList() {
      const eps = visible(), unl = eps.filter((e) => !e.label).length;
      $('#d-count').textContent = `${eps.length} episodes · ${unl} unlabeled · ${eps.filter((e) => e.label === 'keep').length} kept · ${eps.filter((e) => e.subtasks?.length).length} annotated`;
      fill(list, ...eps.map((e) => h('button' + (e === cur ? '.sel' : ''), { onclick: () => select(e) },
        h('span', {}, `${e.id} `, h('span.dim', {}, `${e.source} · ${e.task}`), e.subtasks?.length ? h('span', { title: 'annotated' }, ' 🏷') : null),
        h('span', { class: e.label === 'keep' ? 'k' : e.label === 'discard' ? 'x' : 'dim' }, e.label === 'keep' ? 'keep' : e.label === 'discard' ? 'discard' : '•'))));
      const first = !qaPool().length;
      genBtn.textContent = first ? 'Pull night-shift demos (24)' : 'Request 12 more (2 operator-h)';
      reqTask.parentElement.style.display = first ? 'none' : '';
      genBtn.disabled = busy;
      qaBtn.disabled = !qaPool().length || episodes.some((e) => !e.label);
      qaBtn.title = qaBtn.disabled ? 'Label every episode (on every robot) first' : '';
      if (!cur && eps.length) select(eps.find((e) => !e.label) || eps[0]);
      if (!eps.length) { $('#d-id').textContent = 'no episodes for this robot yet'; fill(metrics); lang.textContent = '—'; }
    }
    function select(e) {
      cur = e; frame = 0; playing = true;
      if (sim && sim.robot.id !== e.robot) { sim.dispose(); sim = null; }
      if (!sim && mj) { sim = new Sim(mj, e.robot); viewer.setSim(sim); }
      viewer?.renderer && (viewer.renderer.domElement.style.filter = e.source === 'dream' ? 'saturate(1.35) contrast(0.92) blur(0.35px) hue-rotate(-8deg)' : '');
      scrub.max = e.frames.length - 1;
      lang.textContent = `“${TASKS[e.task].text}”`;
      const m = e.metrics, chip = (t, cls = '') => h('span.chip' + cls, {}, t);
      fill(metrics, chip(e.source === 'dream' ? `neural trajectory · ${e.wm || 'world model'}` : `operator: ${e.source}`), chip(`duration ${m.duration}s`, m.duration > 11 ? '.warn' : ''), chip(`path ${m.path} m`),
        chip(`idle ${m.idle}%`, m.idle > 30 ? '.warn' : ''), chip(`smoothness ${m.smooth}/100`, m.smooth < 45 ? '.warn' : ''),
        e.outcome ? chip(`auto outcome ${e.outcome}/5`, e.outcome >= 4 ? '.good' : e.outcome <= 2 ? '.bad' : '.warn') : null,
        e.revealed ? chip(`QA truth: ${truthOf(e)}`, isKeeper(e) ? '.good' : '.bad') : null);
      renderList(); renderAnnot(); show();
    }
    function renderAnnot() {
      const W = timeline.clientWidth || 600, H = 26, dpr = devicePixelRatio || 1;
      timeline.width = W * dpr; timeline.height = H * dpr;
      const c = timeline.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, W, H);
      if (!cur) return fill(segList);
      const n = cur.frames.length, segs = cur.subtasks || [];
      segs.forEach((s, i) => { c.fillStyle = SEG_COLORS[i % SEG_COLORS.length] + '99'; c.fillRect(W * s.start / n, 0, W * (s.end - s.start) / n - 1, H); });
      c.fillStyle = '#fff'; c.fillRect(W * frame / n, 0, 2, H);
      if (!segs.length) { c.fillStyle = '#8d97a8'; c.font = '11px system-ui'; c.fillText('not annotated', 8, 17); }
      const caps = captionsFor(cur.task);
      fill(segList, segs.map((s, i) => h('.row', { style: 'gap:6px;margin-top:4px;font-size:12px' },
        h('span', { style: `width:10px;height:10px;border-radius:2px;background:${SEG_COLORS[i % 5]}` }),
        h('span.mono.dim', { style: 'width:92px' }, `${(s.start * CONTROL_DT).toFixed(1)}–${(s.end * CONTROL_DT).toFixed(1)} s`),
        h('select', { style: 'flex:1;padding:2px 4px', onchange: (e) => { s.text = e.target.value; save(true); } },
          [...new Set([s.text, ...caps])].map((t) => h('option', { value: t, selected: t === s.text }, t))),
        segs.length > 1 ? h('button.small.ghost', { title: 'Merge with previous', onclick: () => { if (i) { segs[i - 1].end = s.end; segs.splice(i, 1); } else { segs[1].start = 0; segs.splice(0, 1); } save(true); renderAnnot(); } }, '⨉') : null)));
    }
    function split() {
      if (!cur) return;
      const n = cur.frames.length, f = Math.max(1, Math.min(n - 1, Math.floor(frame)));
      const segs = cur.subtasks ||= [{ start: 0, end: n, text: captionsFor(cur.task)[0] }];
      const i = segs.findIndex((s) => s.start < f && f < s.end);
      if (i < 0) return;
      const caps = captionsFor(cur.task);
      segs.splice(i + 1, 0, { start: f, end: segs[i].end, text: caps[Math.min(caps.length - 1, i + 1)] }); segs[i].end = f;
      state.seen.annotated = true; save(true); renderAnnot();
    }
    function show() {
      if (!cur || !sim) return;
      const f = Math.min(cur.frames.length - 1, Math.floor(frame));
      sim.restore(cur.frames[f]); viewer.draw();
      scrub.value = f;
      const seg = cur.subtasks?.find((s) => s.start <= f && f < s.end);
      $('#d-id').textContent = `${cur.id} · ${(f * CONTROL_DT).toFixed(1)} / ${cur.metrics.duration}s${seg ? ' · ' + seg.text : ''}`;
      lineChart(spark, [{ data: cur.speed, color: '#3d4656' }, { data: cur.speed, color: '#ff9d3c', upto: (f + 1) / cur.speed.length }], { ymin: 0 });
      renderAnnot();
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
      const first = !qaPool().length;
      busy = true; renderList();
      const prog = (i, n) => { $('#d-prog').textContent = `operators recording… ${i}/${n}`; };
      if (first) await generateDemos(mj, 'sprout', 'red_bin', 24, prog);
      else { state.opsHours += 2; await generateDemos(mj, filter, reqTask.value, 12, prog); }
      busy = false; $('#d-prog').textContent = ''; cur = null;
      toast('New episodes are in. They need QA before training.');
      renderList();
    }
    function autoAll() {
      const todo = visible().filter((e) => !e.subtasks?.length);
      if (!todo.length) return toast('Every episode on this robot is already annotated.');
      const rand = rng(Date.now() % 1e6);
      for (const e of todo) { const r = autoLabel(e, rand); e.subtasks = r.subtasks; e.outcome = r.outcome; }
      const cost = Math.max(0.1, Math.round(todo.length * 0.005 * 10) / 10);
      state.gpuHours = Math.round((state.gpuHours + cost) * 10) / 10; state.seen.annotated = true; save(true);
      toast(`Labeled ${todo.length} episodes with timestamped captions and 1–5 outcome scores (${cost} GPU-h). Spot-check a few: auto-labels are not always right.`);
      renderList(); if (cur) select(cur);
    }
    function qa() {
      const eps = qaPool().filter((e) => !e.revealed);
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
    function exportDialog() {
      const eps = visible().filter((e) => e.label === 'keep');
      const repo = h('input', { type: 'text', value: `${(state.name || 'me').toLowerCase().replace(/\W+/g, '') || 'me'}/tabletop-${filter}`, style: 'width:100%' });
      const imgs = h('input', { type: 'checkbox', checked: true });
      const status = h('.dim', { style: 'font-size:12px' });
      const go = h('button', { disabled: !eps.length, onclick: async () => { go.disabled = true; try { await exportZip(eps, repo.value.trim(), imgs.checked, (t) => { status.textContent = t; }); $('#modal').hidden = true; } catch (err) { status.textContent = 'Export failed: ' + err.message; go.disabled = false; } } }, `Export ${eps.length} kept episodes`);
      fill($('#modal'), h('.box', {}, h('h2', {}, 'Export to LeRobotDataset'),
        h('p', {}, 'Downloads a zip with your kept episodes (states, actions, task language, subtask captions and, optionally, front-camera frames) plus a script that rebuilds it as a real ', h('code', {}, 'LeRobotDataset'), ' you can train with LeRobot or push to the Hugging Face Hub.'),
        h('label', {}, 'Hub repo id (used by the script)', repo),
        h('label.check', {}, imgs, 'Include front-camera frames (bigger, a few seconds per episode)'),
        h('.row', {}, go, h('button.ghost', { onclick: () => { $('#modal').hidden = true; } }, 'Cancel')), status));
      $('#modal').hidden = false;
    }
    async function exportZip(eps, repoId, withImages, progress) {
      const files = [], W = 160, H = 120;
      let cam = null, camSim = null;
      if (withImages) {
        const holder = h('div', { style: `position:fixed;left:-9999px;top:0;width:${W}px;height:${H}px` }); document.body.append(holder);
        camSim = new Sim(mj, filter); cam = new Viewer(holder); cam.setSim(camSim); cam.useMujocoCamera(camSim, 'front'); cam.holder = holder;
      }
      const index = [];
      for (const [ei, e] of eps.entries()) {
        progress(`episode ${ei + 1}/${eps.length}…`);
        await new Promise((r) => setTimeout(r, 0));
        const rows = e.frames.map((q, i) => ({
          frame_index: i, timestamp: +(i * CONTROL_DT).toFixed(3), task: TASKS[e.task].text,
          subtask: e.subtasks?.find((s) => s.start <= i && i < s.end)?.text ?? null,
          'observation.state': [q[0], q[1], q[2], q[3], +(q[4] + q[5]).toFixed(4)],
          action: e.actions[i],
        }));
        const name = `episode_${String(ei).padStart(6, '0')}`;
        files.push({ name: `data/${name}.json`, data: JSON.stringify(rows) });
        if (withImages) for (let i = 0; i < e.frames.length; i++) {
          camSim.restore(e.frames[i]);
          files.push({ name: `images/${name}/frame_${String(i).padStart(6, '0')}.jpg`, data: dataUrlBytes(cam.snapshot(W, H, 0.7)) });
        }
        index.push({ episode_index: ei, id: e.id, task: TASKS[e.task].text, length: e.frames.length, source: e.source, subtasks: e.subtasks || [], outcome: e.outcome ?? null });
      }
      if (cam) { cam.dispose(); camSim.dispose(); cam.holder.remove(); }
      files.push({ name: 'meta/episodes.jsonl', data: index.map((r) => JSON.stringify(r)).join('\n') + '\n' });
      files.push({ name: 'meta/info.json', data: JSON.stringify(infoJson(repoId, withImages, eps.length, W, H), null, 2) });
      files.push({ name: 'convert_to_lerobot.py', data: CONVERT_PY });
      files.push({ name: 'README.md', data: readme(repoId, eps.length, withImages) });
      progress('zipping…');
      const blob = makeZip(files), a = h('a', { href: URL.createObjectURL(blob), download: `${repoId.replace(/\W+/g, '_')}.zip` });
      document.body.append(a); a.click(); a.remove();
      state.seen.exported = true; save();
      toast(`Exported ${eps.length} episodes (${(blob.size / 1e6).toFixed(1)} MB).`);
    }
    function infoJson(repoId, withImages, n, W, H) {
      const features = {
        'observation.state': { dtype: 'float32', shape: [5], names: ['yaw', 'shoulder', 'elbow', 'wrist', 'gripper_opening'] },
        action: { dtype: 'float32', shape: [4], names: ['dx', 'dy', 'dz', 'gripper_close'] },
      };
      if (withImages) features['observation.images.front'] = { dtype: 'video', shape: [H, W, 3], names: ['height', 'width', 'channels'] };
      return { repo_id: repoId, fps: Math.round(1 / CONTROL_DT), robot_type: `robot_learning_lab_${filter}`, total_episodes: n, features, source: 'Robot Learning Lab (MuJoCo simulation)' };
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
      if (k === 'k') label('keep'); else if (k === 'x') label('discard'); else if (k === 'b') split();
      else if (k === 'arrowright') step(1); else if (k === 'arrowleft') step(-1);
      else if (k === ' ') { playing = !playing; e.preventDefault(); }
    };
    window.addEventListener('keydown', kd);
    renderList();
    (async () => { mj = await loadMujoco(); if (!alive) return; viewer = new Viewer(view); cur = null; renderList(); raf = requestAnimationFrame(loop); })();
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); viewer?.dispose(); sim?.dispose(); };
  },
};

function readme(repoId, n, withImages) {
  return `# ${repoId}

${n} episodes exported from Robot Learning Lab (a MuJoCo simulation running in the browser).

- \`data/episode_XXXXXX.json\`: one row per 20 Hz control step with \`observation.state\`, \`action\`, \`task\` and \`subtask\`.
- \`meta/episodes.jsonl\`: one line per episode (task, length, source, subtask captions, auto outcome score).
- \`meta/info.json\`: feature schema in LeRobot's format.
${withImages ? '- `images/episode_XXXXXX/frame_XXXXXX.jpg`: front-camera frames (160x120).\n' : ''}
## Turn it into a real LeRobotDataset

\`\`\`bash
pip install lerobot pillow
python convert_to_lerobot.py --repo-id ${repoId}          # builds it locally
python convert_to_lerobot.py --repo-id ${repoId} --push   # and uploads it to the Hub
\`\`\`

The action space is end-effector velocity commands (dx, dy, dz as a fraction of max speed, gripper 0/1),
not joint targets, so these episodes train policies for the simulated arm, not directly for an SO-101.
`;
}

const CONVERT_PY = `"""Rebuild a Robot Learning Lab export as a LeRobotDataset (v3 API: create / add_frame / save_episode / finalize)."""
import argparse, json
from pathlib import Path

import numpy as np
from lerobot.datasets.lerobot_dataset import LeRobotDataset

ap = argparse.ArgumentParser()
ap.add_argument("--repo-id", required=True)
ap.add_argument("--root", default=None, help="where to write the dataset (default: LeRobot cache)")
ap.add_argument("--push", action="store_true", help="push to the Hugging Face Hub when done")
args = ap.parse_args()

here = Path(__file__).parent
info = json.loads((here / "meta/info.json").read_text())
features = {k: {**v, "shape": tuple(v["shape"])} for k, v in info["features"].items()}
has_images = "observation.images.front" in features

ds = LeRobotDataset.create(repo_id=args.repo_id, fps=info["fps"], features=features, root=args.root,
                           robot_type=info["robot_type"], use_videos=has_images)

for line in (here / "meta/episodes.jsonl").read_text().splitlines():
    ep = json.loads(line)
    name = f"episode_{ep['episode_index']:06d}"
    rows = json.loads((here / f"data/{name}.json").read_text())
    for r in rows:
        frame = {
            "observation.state": np.asarray(r["observation.state"], dtype=np.float32),
            "action": np.asarray(r["action"], dtype=np.float32),
            "task": r["task"],
        }
        if has_images:
            from PIL import Image
            img = Image.open(here / f"images/{name}/frame_{r['frame_index']:06d}.jpg").convert("RGB")
            frame["observation.images.front"] = np.asarray(img)
        ds.add_frame(frame)
    ds.save_episode()
    print(f"saved {name}: {len(rows)} frames - {ep['task']}")

ds.finalize()  # required in v3 before reading or pushing
if args.push:
    ds.push_to_hub()
print("done:", ds.root)
`;
