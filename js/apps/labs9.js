// Lab benches for the computer-vision course: convolution, kNN, linear classifier, autograd, NMS.
import { h, lineChart } from '../util.js';
const note = (t) => h('p.dim', { style: 'font-size:12px' }, t);
const toJs = (x) => (x && x.toJs ? x.toJs({ dict_converter: Object.fromEntries }) : x);
function canvas(panel, w, hgt) {
  const c = h('canvas', { width: w * 2, height: hgt * 2, style: `width:${w}px;max-width:100%;aspect-ratio:${w}/${hgt};background:#0a0c10;border-radius:6px;border:1px solid var(--line);image-rendering:pixelated` });
  panel.append(c); const g = c.getContext('2d'); g.scale(2, 2); g.font = '11px system-ui'; return [c, g];
}
// Draw a 2D grid of numbers as a grayscale (or red/blue diverging) picture.
function drawGrid(g, grid, x0, y0, cell, { diverge = false, lo = null, hi = null } = {}) {
  const flat = grid.flat(); const mn = lo ?? Math.min(...flat), mx = hi ?? Math.max(...flat), amp = Math.max(Math.abs(mn), Math.abs(mx)) || 1;
  grid.forEach((row, j) => row.forEach((v, i) => {
    if (diverge) { const t = Math.max(-1, Math.min(1, v / amp)); g.fillStyle = t >= 0 ? `rgb(${Math.round(40 + 215 * t)},${Math.round(40 + 30 * (1 - t))},${Math.round(40 + 30 * (1 - t))})` : `rgb(${Math.round(40 + 30 * (1 + t))},${Math.round(40 + 30 * (1 + t))},${Math.round(40 - 215 * t)})`; }
    else { const t = mx === mn ? 0 : (v - mn) / (mx - mn), c = Math.round(255 * t); g.fillStyle = `rgb(${c},${c},${c})`; }
    g.fillRect(x0 + i * cell, y0 + j * cell, cell, cell);
  }));
}
const unflat = (f, w = 8) => Array.from({ length: f.length / w }, (_, r) => f.slice(r * w, (r + 1) * w));

// A 32x32 test picture: a box, a disc and a diagonal line.
function testPicture() {
  const n = 32, im = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 4; y < 18; y++) for (let x = 4; x < 16; x++) im[y][x] = 1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if ((x - 23) ** 2 + (y - 11) ** 2 < 40) im[y][x] = 0.7; if (Math.abs(x - y - 2) < 1.2 && y > 18) im[y][x] = 1; }
  return im;
}
const KERNELS = {
  'vertical edges': [[1, 0, -1], [2, 0, -2], [1, 0, -1]], 'horizontal edges': [[1, 2, 1], [0, 0, 0], [-1, -2, -1]],
  'blur': Array.from({ length: 3 }, () => Array(3).fill(1 / 9)), 'sharpen': [[0, -1, 0], [-1, 5, -1], [0, -1, 0]], 'outline (Laplacian)': [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]],
};

export const LABS9 = {
  convlab({ panel, ns, py }) {
    const conv = ns.get('convolve2d'), img = testPicture(); let maxAbs = 0, size = 0, err = null;
    const sel = h('select', { onchange: () => draw() }, Object.keys(KERNELS).map((k) => h('option', {}, k))), info = h('p.dim', { style: 'font-size:12px' });
    const [, g] = canvas(panel, 340, 190); panel.append(h('label', { style: 'font-size:12.5px' }, 'Kernel ', sel), info);
    const draw = () => {
      g.clearRect(0, 0, 340, 190); const K = KERNELS[sel.value];
      try { const out = toJs(conv(py.toPy(img), py.toPy(K), 1, 1)); size = out.length; maxAbs = Math.max(...out.flat().map(Math.abs));
        drawGrid(g, img, 8, 20, 5, { lo: 0, hi: 1 }); drawGrid(g, out, 176, 20, 5, { diverge: K[0][0] * 0 !== 0 || sel.value !== 'blur' && sel.value !== 'sharpen' });
        g.fillStyle = '#8d97a8'; g.fillText('input (32×32)', 8, 14); g.fillText('your convolve2d output', 176, 14); info.textContent = `kernel ${JSON.stringify(K.map((r) => r.map((v) => +v.toFixed(2))))} · output ${out.length}×${out[0].length} · largest response ${maxAbs.toFixed(2)}`; err = null;
      } catch (e) { err = String(e.message || e).split('\n').pop(); g.fillStyle = '#ff6b6b'; g.fillText('convolve2d raised an error: ' + err, 8, 100); }
    };
    draw();
    return { tests: [['your convolution finds the edges of the test picture (32×32 output with padding 1)', !err && size === 32 && (() => { sel.value = 'vertical edges'; draw(); return maxAbs > 2; })(), err || `output ${size}×${size}, strongest response ${maxAbs.toFixed(2)}`]] };
  },

  knnlab({ panel, ns, py }) {
    const knn = ns.get('knn_predict'), train = ns.get('TRAIN'), test = toJs(ns.get('TEST')), res = [];
    let bad = [];
    for (const k of [1, 3, 5, 9, 15]) { let ok = 0; for (const [x, y] of test) { const p = Number(knn(train, py.toPy(x), k)); if (p === y) ok++; else if (k === 1 && bad.length < 8) bad.push([x, y, p]); } res.push([k, ok / test.length]); }
    panel.append(h('div', { style: 'display:grid;gap:4px;margin:6px 0' }, res.map(([k, a]) => h('.row', { style: 'gap:8px;font-size:12.5px' }, h('span', { style: 'width:46px' }, `k = ${k}`), h('span', { style: `height:12px;border-radius:3px;background:${a >= 0.75 ? '#4fd08a' : '#ff9d3c'};width:${Math.round(200 * a)}px` }), h('b', {}, `${(100 * a).toFixed(0)}%`)))));
    const CL = ['plus', 'box', 'diagonal'];
    if (bad.length) { const [, g] = canvas(panel, 340, 64); bad.forEach(([x, y, p], i) => { drawGrid(g, unflat(x), 4 + i * 41, 4, 4, { lo: 0, hi: 1 }); g.fillStyle = '#ff6b6b'; g.fillText(`${CL[y][0]}→${CL[p][0]}`, 6 + i * 41, 52); }); panel.append(note('Some pictures the k = 1 classifier gets wrong (true class → predicted class, first letters): shifted and noisy shapes land nearer another class.')); }
    return { tests: [['k = 1 reaches at least 75% on the test pictures', res[0][1] >= 0.75, `${(100 * res[0][1]).toFixed(0)}%`]] };
  },

  linlab({ panel, ns, py }) {
    const lag = ns.get('loss_and_grad'), train = toJs(ns.get('TRAIN')), test = toJs(ns.get('TEST'));
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 0.02; };
    const W = Array.from({ length: 3 }, () => Array.from({ length: 64 }, rnd)), b = [0, 0, 0], curve = []; let err = null;
    try {
      for (let ep = 0; ep < 20; ep++) { let tot = 0;
        for (const [x, y] of train) { const [loss, dW, db] = toJs(lag(py.toPy(W), py.toPy(b), py.toPy(x), y)); tot += loss; for (let c = 0; c < 3; c++) { for (let d = 0; d < 64; d++) W[c][d] -= 0.1 * dW[c][d]; b[c] -= 0.1 * db[c]; } }
        curve.push(tot / train.length); }
    } catch (e) { err = String(e.message || e).split('\n').pop(); }
    if (err) { panel.append(h('p.bad', {}, `loss_and_grad raised an error: ${err}`)); return { tests: [['training with your gradient runs', false, err]] }; }
    const acc = test.filter(([x, y]) => { const s = W.map((row, c) => row.reduce((t, w, d) => t + w * x[d], b[c])); return s.indexOf(Math.max(...s)) === y; }).length / test.length;
    const cv = h('canvas.chart', { style: 'height:100px' }); panel.append(h('.dim', { style: 'font-size:12px' }, 'Training loss per epoch (SGD, lr 0.1)'), cv); lineChart(cv, [{ data: curve, color: '#4fd08a' }], { ymin: 0 });
    const [, g] = canvas(panel, 340, 80); ['plus', 'box', 'diagonal'].forEach((n, c) => { drawGrid(g, unflat(W[c]), 8 + c * 110, 14, 11, { diverge: true }); g.fillStyle = '#8d97a8'; g.fillText(`template: ${n}`, 8 + c * 110, 10); });
    panel.append(h('p', { style: 'font-size:13px' }, `Test accuracy: ${(100 * acc).toFixed(0)}%.`), note('Red = positive weight (this pixel votes for the class), blue = negative. A blurry template is the best a single linear map can do for shifted shapes; compare with kNN.'));
    return { tests: [['training with your loss and gradient lowers the loss a lot', curve.at(-1) < curve[0] * 0.5, `${curve[0].toFixed(2)} → ${curve.at(-1).toFixed(2)}`], ['the trained classifier beats guessing (>45% on test pictures)', acc > 0.45, `${(100 * acc).toFixed(0)}%`]] };
  },

  autolab({ panel, ns }) {
    let out; try { out = toJs(ns.get('train_toy')(60, 0.1)); } catch (e) { panel.append(h('p.bad', {}, `train_toy raised: ${String(e.message || e).split('\n').pop()}`)); return {}; }
    const [losses, grid, pts] = out, cv = h('canvas.chart', { style: 'height:100px' });
    panel.append(h('.dim', { style: 'font-size:12px' }, 'Loss while training a 2-8-1 network built from your Value class'), cv); lineChart(cv, [{ data: losses, color: '#ff9d3c' }], { ymin: 0 });
    const [, g] = canvas(panel, 220, 220); drawGrid(g, grid, 10, 10, 10, { diverge: true });
    for (const [[x0, x1], y] of pts) { g.fillStyle = y > 0 ? '#ffd166' : '#6ab0ff'; g.strokeStyle = '#000'; g.beginPath(); g.arc(10 + ((x0 + 2) / 4) * 200, 10 + ((x1 + 2) / 4) * 200, 3, 0, 7); g.fill(); g.stroke(); }
    panel.append(note(`Network output over the plane (red positive, blue negative) with the training points (yellow: inner ring, blue: outer ring). Final loss ${losses.at(-1).toFixed(3)}; every gradient came from your backward().`));
    return {};
  },

  nmslab({ panel, ns, py }) {
    const nms = ns.get('nms'), boxes = [[20, 30, 90, 100], [26, 34, 96, 108], [14, 26, 86, 96], [24, 38, 100, 104], [150, 60, 210, 120], [156, 64, 214, 126], [60, 140, 110, 190], [64, 148, 118, 192], [66, 138, 112, 184]];
    const scores = [0.9, 0.75, 0.6, 0.8, 0.95, 0.7, 0.55, 0.85, 0.65];
    const thr = h('input', { type: 'range', min: 0.1, max: 0.9, step: 0.05, value: 0.5, oninput: () => draw() }), lab = h('b.mono', {}, '0.50'), [, g] = canvas(panel, 340, 210);
    let kept = [];
    const draw = () => {
      g.clearRect(0, 0, 340, 210); lab.textContent = Number(thr.value).toFixed(2);
      try { kept = Array.from(toJs(nms(py.toPy(boxes), py.toPy(scores), Number(thr.value)))); } catch { kept = []; g.fillStyle = '#ff6b6b'; g.fillText('nms raised an error', 8, 14); }
      boxes.forEach((b, i) => { const k = kept.includes(i); g.strokeStyle = k ? '#4fd08a' : '#59647a'; g.lineWidth = k ? 2.5 : 1; g.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); g.fillStyle = k ? '#4fd08a' : '#8d97a8'; g.fillText(scores[i].toFixed(2), b[0] + 2, b[1] + 11); });
      g.fillStyle = '#c9d1e0'; g.fillText(`${kept.length} of ${boxes.length} boxes kept`, 8, 202);
    };
    panel.append(h('label.row', { style: 'gap:8px;font-size:12.5px;align-items:center' }, 'IoU threshold', thr, lab)); draw();
    return { tests: [['at IoU 0.5 the nine boxes collapse to the three objects', (() => { thr.value = 0.5; draw(); return kept.length === 3; })(), `${kept.length} boxes kept`]] };
  },
};
