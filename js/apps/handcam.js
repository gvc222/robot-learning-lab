// Hand Cam: teleoperate a simulated dexterous hand (MuJoCo Menagerie's LEAP Hand) with your webcam,
// and watch an automatic grasp-type detector label your hand against the 33 Feix GRASP types.
// Hand tracking: MediaPipe Hand Landmarker, running locally in the browser (the video never leaves the laptop).
import { h, fill, $, toast, state, save } from '../util.js';
import { loadMujoco } from '../sim/sim.js';
import { stageModel, idOf } from '../sim/menagerie.js';
import { Viewer } from '../sim/viewer.js';
import { FEIX, PROTOTYPES, handLandmarks, classify, features, leapTargets, LEAP_ORDER } from '../hand/grasp.js';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
// Guide hand (normalised image coordinates, palm toward the camera, fingers spread): the user lines their real hand up with it, then clicks Track.
const GUIDE = [[.5, .85], [.40, .78], [.33, .68], [.28, .60], [.24, .53], [.42, .58], [.40, .45], [.39, .36], [.385, .28], [.5, .55], [.5, .41], [.5, .31], [.5, .22], [.58, .58], [.60, .45], [.61, .36], [.615, .28], [.65, .64], [.69, .54], [.71, .47], [.725, .41]].map(([x, y]) => ({ x, y }));
const norm = (P) => { const w = P[0], m = P[9], sc = Math.hypot(m.x - w.x, m.y - w.y) || 1; return P.map((p) => [(p.x - w.x) / sc, (p.y - w.y) / sc]); };
const matchScore = (P) => { const a = norm(P), b = norm(GUIDE); const err = a.reduce((t, p, i) => t + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length; return Math.max(0, Math.round(100 * (1 - err / 0.6))); };
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

async function buildHand(mj) {
  const path = await stageModel(mj, 'leap_hand', 'right_hand.xml', (x) => x.replace('<worldbody>', `<worldbody>
    <light pos="0.2 -0.3 0.6" dir="-0.3 0.4 -1" diffuse="0.9 0.9 0.9"/>
    <geom name="floor" type="plane" size="0.4 0.4 0.05" pos="0 0 -0.02" rgba="0.2 0.23 0.28 1"/>`));
  const model = mj.MjModel.from_xml_path(path), data = new mj.MjData(model);
  model.opt.gravity[2] = 0;  // the palm is fixed; keep fingers from sagging between frames
  const act = Object.fromEntries(LEAP_ORDER.map((n) => [n, idOf(mj, model, 'mjOBJ_ACTUATOR', `${n}_act`)]));
  return {
    model, data,
    command(t) { for (const [n, a] of Object.entries(act)) { const lo = model.actuator_ctrlrange[2 * a], hi = model.actuator_ctrlrange[2 * a + 1]; data.ctrl[a] = Math.min(hi, Math.max(lo, t[n])); } },
    step(sec) { const n = Math.round(sec / model.opt.timestep); for (let k = 0; k < n; k++) mj.mj_step(model, data); },
    dispose() { data.delete(); model.delete(); },
  };
}

export default {
  id: 'handcam', icon: '🖐', title: 'Hand Cam',
  mount(el) {
    let mj, hand, viewer, raf, alive = true, landmarker = null, stream = null, lastVideoT = -1, locked = false, preview = null, score = 0;
    let L = handLandmarks(PROTOTYPES[10]), img = null, source = 'demo', top = [], log = [];
    const video = h('video', { playsinline: true, muted: true, style: 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1)' });
    const overlay = h('canvas#hc-overlay', { width: 640, height: 480, style: 'position:absolute;inset:0;width:100%;height:100%;transform:scaleX(-1)' });
    const cam = h('div', { style: 'position:relative;aspect-ratio:4/3;background:#0a0c10;border-radius:10px;overflow:hidden;border:1px solid var(--line)' }, video, overlay,
      h('.hud', {}, h('span.chip#hc-src', {}, 'demo pose')));
    const view = h('.view3d', { style: 'aspect-ratio:4/3;min-height:0;overflow:hidden;border-radius:10px;border:1px solid var(--line)' }, h('.hud', {}, h('span.chip#hc-status', {}, 'loading LEAP Hand…')));
    const result = h('#hc-result');
    const demoSel = h('select#hc-demo', { onchange: (e) => { stopCam(); L = handLandmarks(PROTOTYPES[+e.target.value]); img = null; source = 'demo'; $('#hc-src').textContent = `demo pose: ${FEIX[+e.target.value]}`; } },
      FEIX.map((n, i) => h('option', { value: i, selected: i === 10 }, `${i + 1}. ${n}`)));
    const camBtn = h('button#hc-cam', { onclick: () => (stream ? stopCam() : startCam()) }, '📷 Start webcam');
    const trackBtn = h('button#hc-track', { hidden: true, onclick: () => { locked = !locked; trackBtn.textContent = locked ? '↺ Show the outline again' : '✋ Match the outline, then click to track'; $('#hc-src').textContent = locked ? 'webcam: tracking' : 'webcam: match the outline'; if (!locked) img = null; } }, '✋ Match the outline, then click to track');
    const logList = h('#hc-log');
    const side = h('.side.right', {},
      h('h3', {}, 'Grasp type (Feix GRASP taxonomy)'), result,
      h('.row', { style: 'margin-top:10px' }, camBtn, trackBtn, h('button.ghost#hc-logbtn', { onclick: () => logGrasp() }, '＋ Log this grasp')),
      h('label', { style: 'margin-top:10px' }, 'Or try a preset hand pose', demoSel),
      h('p.dim', { style: 'font-size:12px' }, 'Hold a real object in front of the camera, palm toward the lens, whole hand in view. The detector only sees hand shape, so grasps that differ mainly by object size (Large vs Small Diameter, Power Sphere vs Sphere 4 Finger) get mixed up: that is why it shows its top 3.'),
      h('h3', { style: 'margin-top:12px' }, 'Grasp log'), logList);
    el.append(h('.split', {}, h('.mainc', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start' }, cam, view,
      h('p.dim', { style: 'grid-column:1/3;font-size:12.5px;margin:0' }, 'Left: what the camera sees (mirrored, like a selfie) with the 21 tracked landmarks. Right: the same pose retargeted to a 16-joint LEAP Hand in MuJoCo. Retargeting maps finger flexion, spread and thumb opposition joint by joint; it is the simplest of the methods used for dexterous teleop.')), side));

    const renderResult = () => fill(result, top.map((r, i) => h('.row', { style: 'gap:8px;margin-bottom:4px;font-size:13px' },
      h('b', { style: 'width:22px' }, `${r.id}`), h('span', { style: 'flex:1' }, r.name),
      h('span', { style: `width:${Math.round(90 * r.p) + 4}px;height:8px;border-radius:4px;background:${i ? '#59647a' : '#4fd08a'}` }), h('span.dim.mono', {}, `${Math.round(100 * r.p)}%`))),
      h('p.dim.mono', { style: 'font-size:11px' }, (() => { const f = features(L); return `flex I/M/R/P ${f.m.map((v, i) => (v + f.c[i]).toFixed(1)).join(' ')} · thumb abd ${f.ta.toFixed(2)} · spread ${f.spread.toFixed(2)}`; })()));
    const renderLog = () => fill(logList, log.length ? [h('.eplist', {}, log.slice(-8).reverse().map((g) => h('div', { style: 'font-size:12.5px' }, `${g.t} · ${g.id}. ${g.name} (${Math.round(100 * g.p)}%, ${g.source})`))),
      h('button.small.ghost', { onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(log, null, 1)], { type: 'application/json' })), download: 'grasp_log.json' }); document.body.append(a); a.click(); a.remove(); } }, '⬇ Download log (with landmarks)')]
      : h('p.dim', {}, 'Log grasps to build a small labeled dataset of your own hand.'));
    function logGrasp() {
      if (!top.length) return;
      log.push({ t: new Date().toLocaleTimeString(), ...top[0], top3: top.map((r) => r.id), source, landmarks: L.map((p) => p.map((v) => +v.toFixed(4))) });
      state.seen.grasps = [...new Set([...(state.seen.grasps || []), top[0].id])]; save();
      renderLog(); toast(`Logged: ${top[0].name}`);
    }

    async function startCam() {
      try {
        if (!landmarker) {
          $('#hc-src').textContent = 'loading hand tracker…';
          const { FilesetResolver, HandLandmarker } = await import('../../vendor/mediapipe/vision_bundle.mjs');
          const files = await FilesetResolver.forVisionTasks(new URL('../../vendor/mediapipe/wasm', import.meta.url).href);
          landmarker = await HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1 });
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        video.srcObject = stream; await video.play();
        camBtn.textContent = '■ Stop webcam'; source = 'webcam'; locked = false; preview = null; trackBtn.hidden = false; trackBtn.textContent = '✋ Match the outline, then click to track'; $('#hc-src').textContent = 'webcam: match the outline';
      } catch (e) { stopCam(); toast(`Webcam unavailable: ${e.message}`); }
    }
    function stopCam() {
      stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; camBtn.textContent = '📷 Start webcam'; trackBtn.hidden = true; locked = false; preview = null;
      if (source === 'webcam') { source = 'demo'; $('#hc-src').textContent = 'demo pose'; }
    }
    function track() {
      if (!stream || !landmarker || video.readyState < 2 || video.currentTime === lastVideoT) return;
      lastVideoT = video.currentTime;
      const r = landmarker.detectForVideo(video, performance.now());
      if (!locked) { preview = r.landmarks?.[0] || null; score = preview ? matchScore(preview) : 0; return; }  // aligning: show the guide, do not drive the model yet
      if (r.worldLandmarks?.[0]) { L = r.worldLandmarks[0].map((p) => [p.x, p.y, p.z]); img = r.landmarks[0]; $('#hc-src').textContent = 'webcam: tracking'; }
      else { img = null; $('#hc-src').textContent = 'webcam: no hand in view'; }
    }
    // Demo poses come from a 3D hand model: draw them with a simple projection so the camera pane is never empty.
    const demoImage = () => L.map(([x, y, z]) => ({ x: 0.5 - 4.2 * x + 1.2 * z, y: 0.9 - 4.2 * y + 2.2 * z }));
    function drawOverlay() {
      const g = overlay.getContext('2d'); g.clearRect(0, 0, 640, 480);
      if (source === 'webcam' && !locked) {
        g.strokeStyle = '#6db3ff'; g.lineWidth = 4; g.setLineDash([8, 6]);
        for (const [a, b] of BONES) { g.beginPath(); g.moveTo(GUIDE[a].x * 640, GUIDE[a].y * 480); g.lineTo(GUIDE[b].x * 640, GUIDE[b].y * 480); g.stroke(); }
        g.setLineDash([]); g.fillStyle = '#6db3ff'; for (const p of GUIDE) { g.beginPath(); g.arc(p.x * 640, p.y * 480, 5, 0, 7); g.fill(); }
        if (preview) { g.strokeStyle = 'rgba(255,157,60,.8)'; g.lineWidth = 2; for (const [a, b] of BONES) { g.beginPath(); g.moveTo(preview[a].x * 640, preview[a].y * 480); g.lineTo(preview[b].x * 640, preview[b].y * 480); g.stroke(); } }
        $('#hc-src').textContent = preview ? `match the blue outline: ${score}%` : 'webcam: put your hand on the blue outline';
        return;
      }
      const img_ = source === 'demo' ? demoImage() : img;
      if (!img_) return;
      const img = img_;
      g.strokeStyle = '#4fd08a'; g.lineWidth = 3;
      for (const [a, b] of BONES) { g.beginPath(); g.moveTo(img[a].x * 640, img[a].y * 480); g.lineTo(img[b].x * 640, img[b].y * 480); g.stroke(); }
      g.fillStyle = '#ff9d3c'; for (const p of img) { g.beginPath(); g.arc(p.x * 640, p.y * 480, 4, 0, 7); g.fill(); }
    }

    (async () => {
      mj = await loadMujoco(); if (!alive) return;
      hand = await buildHand(mj); if (!alive) { hand.dispose(); return; }
      viewer = new Viewer(view, { cam: [0.2, -0.24, 0.36], look: [0.0, 0.0, 0.17], groups: [1], minDist: 0.12, maxDist: 0.8, show: (m, i) => m.geom_group[i] === 1 || m.geom_type[i] === 7 });
      viewer.setSim({ model: hand.model, data: hand.data });
      for (const m of viewer.meshes) if (m.material.color.getHex() < 0x333333) m.material.color.setHex(0x3a4250);  // LEAP's black parts, readable on a dark background
      $('#hc-status').textContent = 'LEAP Hand (MuJoCo Menagerie)';
      let last = performance.now(), lastCls = 0;
      const loop = (now) => {
        if (!alive) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        track();
        if (now - lastCls > 100) { top = classify(L); renderResult(); drawOverlay(); lastCls = now; }
        hand.command(leapTargets(features(L))); hand.step(dt);
        viewer.draw(); raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();
    renderLog();
    return () => { alive = false; cancelAnimationFrame(raf); stopCam(); landmarker?.close(); viewer?.dispose(); hand?.dispose(); };
  },
};
