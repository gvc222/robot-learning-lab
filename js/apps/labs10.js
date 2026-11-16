// Humanoid reward lab: a MuJoCo humanoid (DeepMind's humanoid model) learns to stand by random search. YOUR reward function decides what "good" means.
import { h, lineChart } from '../util.js';
import { loadMujoco, rng } from '../sim/sim.js';
import { Viewer } from '../sim/viewer.js';

const note = (t) => h('p.dim', { style: 'font-size:12px' }, t);
const tick = () => new Promise((r) => setTimeout(r, 0));
const toNum = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const CTRL_EVERY = 5, DT = 0.005, T_MAX = 3.0, FALL_H = 0.9;
let modelP = null;
const getXML = () => (modelP ||= fetch(new URL('../../vendor/humanoid/humanoid.xml', import.meta.url)).then((r) => r.text()).then((x) => x.replace('size="0 0 .05" type="plane"', 'size="3 3 .05" type="plane"')));

// The policy: PD to the standing pose plus learned feedback on how far the torso leans (and how fast): 10 numbers.
function makePolicy(m, d, names) {
  const idx = Object.fromEntries(names.map((n, i) => [n, i]));
  return (p) => () => {
    const R = d.xmat, i1 = 9, leanF = -R[i1 + 6], leanS = R[i1 + 7], wy = d.qvel[4], wx = d.qvel[3];
    for (let k = 0; k < m.nu; k++) d.ctrl[k] = -(p[0] * d.qpos[7 + k] + p[1] * d.qvel[6 + k]);
    for (const s of ['right', 'left']) {
      d.ctrl[idx['ankle_y_' + s]] += p[2] * leanF + p[3] * wy; d.ctrl[idx['hip_y_' + s]] += p[4] * leanF + p[5] * wy;
      d.ctrl[idx['ankle_x_' + s]] += p[6] * leanS + p[7] * wx; d.ctrl[idx['hip_x_' + s]] += p[8] * leanS + p[9] * wx;
    }
    for (let k = 0; k < m.nu; k++) d.ctrl[k] = Math.max(-1, Math.min(1, d.ctrl[k]));
  };
}

export const LABS10 = {
  async humlab({ panel, ns }) {
    const mj = await loadMujoco(), xml = await getXML(), m = mj.MjModel.from_xml_string(xml), d = new mj.MjData(m);
    const names = Array.from({ length: m.nu }, (_, i) => mj.mj_id2name(m, mj.mjtObj.mjOBJ_ACTUATOR.value, i)), mk = makePolicy(m, d, names);
    const reward = ns.get('reward');
    const status = h('p', { style: 'font-size:13px' }, 'Searching for a policy that maximises your reward…'); panel.append(status); await tick();

    // One episode: returns the total reward, how long it stayed up, how far it went, and (optionally) the frames.
    const episode = (p, rewardFn, record = null, T = T_MAX) => {
      mj.mj_resetData(m, d); d.qpos[2] = 1.282; mj.mj_forward(m, d); const act = mk(p); let total = 0, t = 0, x0 = d.qpos[0];
      for (let i = 0; i < T / DT; i++) {
        act(); mj.mj_step(m, d); t = (i + 1) * DT;
        if (i % CTRL_EVERY === CTRL_EVERY - 1) {
          const height = d.qpos[2], upright = d.xmat[9 + 8], vx = d.qvel[0]; let c = 0; for (let k = 0; k < m.nu; k++) c += d.ctrl[k] * d.ctrl[k];
          if (height < FALL_H) break;
          total += toNum(rewardFn(height, upright, vx, c)); record?.push(Float64Array.from(d.qpos));
        }
      }
      return { total, t, dist: d.qpos[0] - x0 };
    };
    const search = async (rewardFn, seed, iters = 180) => {
      const r = rng(seed); let best = [3, 0.3, 0, 0, 0, 0, 0, 0, 0, 0], bs = episode(best, rewardFn).total; const curve = [bs];
      for (let it = 0; it < iters; it++) {
        const cand = best.map((v, i) => v + (i < 2 ? 0.3 : 1.5) * r.gauss() * (1 - it / (iters + 40))), s = episode(cand, rewardFn).total;
        if (s >= bs) { best = cand; bs = s; } curve.push(bs); if (it % 30 === 29) await tick();
      }
      const frames = []; const res = episode(best, rewardFn, frames, T_MAX);
      return { best, curve, frames, ...res };
    };
    const mine = await search((a, b, c, e) => reward(a, b, c, e), 1);
    status.textContent = 'Comparing with a reward that only pays for forward speed…'; await tick();
    const speed = await search((a, b, c) => 5 * Math.max(0, c), 2);
    status.remove();

    const view = h('.view3d', { style: 'height:240px;flex:none;border-radius:8px;overflow:hidden' }, h('.hud', {}, h('span.chip#hum-chip', {}, 'your reward')));
    const sel = h('select', { onchange: () => { which = sel.value; i = 0; chip(); } }, h('option', { value: 'mine' }, 'policy trained on YOUR reward'), h('option', { value: 'speed' }, 'policy trained on “forward speed only”'));
    panel.append(h('label', { style: 'font-size:12.5px' }, 'Watch ', sel), view);
    const viewer = new Viewer(view, { cam: [0, -4.2, 1.3], look: [0, 0, 0.8], minDist: 1.5, maxDist: 9 }); viewer.setSim({ model: m, data: d });
    let which = 'mine', i = 0, raf, alive = true, last = 0; const chip = () => { const c = view.querySelector('#hum-chip'); if (c) c.textContent = which === 'mine' ? 'your reward' : 'forward speed only'; };
    const loop = (t) => { if (!alive) return; raf = requestAnimationFrame(loop); if (t - last < 25) return; last = t; const fr = (which === 'mine' ? mine : speed).frames; if (!fr.length) return;
      d.qpos.set(fr[Math.min(i, fr.length - 1)]); mj.mj_forward(m, d); viewer.draw(); i = (i + 1) % (fr.length + 30); };
    raf = requestAnimationFrame(loop);
    const cv = h('canvas.chart', { style: 'height:110px' }); panel.append(h('.dim', { style: 'font-size:12px' }, 'Best episode reward found so far (orange: your reward, blue: speed-only reward, different scales)'), cv);
    const norm = (c) => c.map((v) => v / (Math.max(...c) || 1)); lineChart(cv, [{ data: norm(mine.curve), color: '#ff9d3c' }, { data: norm(speed.curve), color: '#6ab0ff' }], { ymin: 0 });
    const row = (n, r) => `${n}: stayed up ${r.t.toFixed(1)} s of ${T_MAX.toFixed(1)}, travelled ${r.dist.toFixed(2)} m forward`;
    panel.append(h('p', { style: 'font-size:13px' }, row('Your reward', mine)), h('p', { style: 'font-size:13px' }, row('Speed-only reward', speed)),
      note('Random search (the simplest RL): try a small random change to the policy’s 10 numbers, keep it if the total reward did not go down. The reward function is the only thing that tells it what you want. Rewarding speed alone teaches it to fall forward: it “wins” by lunging, not by walking.'));
    return { tests: [['a policy trained on your reward stays up at least 2.5 s', mine.t >= 2.5, `stayed up ${mine.t.toFixed(1)} s`], ['…and it improved over the first random policy', mine.curve.at(-1) > mine.curve[0], `${mine.curve[0].toFixed(1)} → ${mine.curve.at(-1).toFixed(1)}`]],
      cleanup: () => { alive = false; cancelAnimationFrame(raf); viewer.dispose(); d.delete(); m.delete(); } };
  },
};
