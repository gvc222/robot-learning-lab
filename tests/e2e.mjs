// End-to-end walk through the whole lab in headless Chrome.  Run: node tests/e2e.mjs
import { open, server } from './shot.mjs';
import { LESSONS } from '../js/course/lessons.js';
const shots = process.env.SHOTS || '/tmp';
const { browser, page, errors } = await open();
const log = (...a) => console.log(...a);
let failed = 0; const check = (name, ok, extra = '') => { log(ok ? '  ok  ' : '  FAIL', name, extra); if (!ok) failed++; };
const app = (id) => page.evaluate((i) => window.lab.openApp(i), id);
// click via the DOM so a guide popup sitting on top of a button cannot block the test
const press = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);

await page.fill('#modal input', 'Tester'); await page.click('#modal button');
await page.evaluate(() => { lab.state.guideOff = false; });

log('Academy');
await app('academy');
for (const l of LESSONS) {
  await page.evaluate((title) => [...document.querySelectorAll('.lesson-nav button')].find((b) => b.textContent.includes(title)).click(), l.title);
  if (l.id === 'fk') { // the untouched starter must fail politely, not crash
    await page.click('#run-tests'); await page.waitForFunction(() => document.querySelector('#run-tests').textContent === 'Run tests' && document.querySelector('.test'), null, { timeout: 90000 });
    check('starter code fails with a readable message', await page.locator('.test.fail').count() > 0);
  }
  await page.fill('textarea.code', l.solution); await page.dispatchEvent('textarea.code', 'input');
  await page.click('#run-tests');
  await page.waitForFunction(() => document.querySelector('#run-tests').textContent === 'Run tests' && document.querySelector('.test'), null, { timeout: 90000 });
  const fails = await page.locator('.test.fail').allTextContents();
  check(`lesson ${l.id}: solution passes`, fails.length === 0, fails.join(' | '));
  if (['ik', 'mjcf', 'hillclimb', 'qlearn'].includes(l.id)) { await page.waitForTimeout(700); await page.screenshot({ path: `${shots}/academy-${l.id}.png` }); }
}

log('Teleop');
await app('teleop');
await page.waitForFunction(() => document.querySelector('#t-status')?.textContent.includes('not recording'), null, { timeout: 30000 });
await page.keyboard.press('Enter');
for (const k of ['w', 'd', 'f']) { await page.keyboard.down(k); await page.waitForTimeout(500); await page.keyboard.up(k); }
await page.keyboard.press('Space'); await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/teleop.png` });
await page.keyboard.press('Enter'); await page.waitForTimeout(300);
check('a keyboard demo was recorded', await page.evaluate(async () => (await import('./js/util.js')).episodes.filter((e) => e.source === 'you').length) === 1);
// stand in for a human: three clean demos through the same physics
await page.evaluate(async () => {
  const { episodes, save, newId } = await import('./js/util.js');
  const { Sim, loadMujoco, rng, sampleLayout } = await import('./js/sim/sim.js');
  const { Rollout, DEMO_KINDS } = await import('./js/sim/operator.js');
  const mj = await loadMujoco(); episodes.length = 0;
  window.demo = (robot, task, n) => { const sim = new Sim(mj, robot); for (let i = 0; i < n; i++) { const rand = rng(900 + i + episodes.length); sim.reset(sampleLayout(rand)); const r = new Rollout(sim, task, DEMO_KINDS.good.profile, rand); while (!r.step()); episodes.push({ ...r.result(), id: newId('you'), source: 'you', robot, label: 'keep' }); } sim.dispose(); save(true); };
  window.demo('sprout', 'red_bin', 3);
});
await page.waitForTimeout(400);
check('ROB-3 closes after 3 successful demos', await page.evaluate(() => !!lab.state.tickets['ROB-3']));

log('Dataset');
await app('dataset');
await page.waitForTimeout(1500); await press('#gen-btn');
await page.waitForFunction(() => document.querySelectorAll('.eplist button').length >= 27, null, { timeout: 120000 });
const labelAll = () => page.evaluate(async () => { const { episodes, save } = await import('./js/util.js'); const { isKeeper } = await import('./js/models.js'); let wrong = 0; for (const e of episodes) if (!e.label) { e.label = isKeeper(e) ? 'keep' : 'discard'; if (wrong++ < 2) e.label = 'keep'; } save(true); return episodes.map((e) => e.kind + ':' + e.metrics.success).join(' '); });
await page.waitForTimeout(1200); await page.screenshot({ path: `${shots}/dataset.png` });
await page.keyboard.press('k'); await page.keyboard.press('x');
log('   kinds:', await labelAll());
await app('tickets'); await app('dataset'); await page.waitForTimeout(1500);
await press('#qa-btn');
check('QA report opens', await page.locator('#modal h2').textContent().then((t) => /QA report/.test(t)));
await page.screenshot({ path: `${shots}/qa.png` });
await page.click('#modal button');

log('Train');
await app('train'); await page.screenshot({ path: `${shots}/train0.png` });
await press('#train-btn');
await page.waitForFunction(() => lab.state.policies.some((p) => !p.baseline), null, { timeout: 30000 });
await page.screenshot({ path: `${shots}/train.png` });
log('   policies:', JSON.stringify(await page.evaluate(() => lab.state.policies.map((p) => [p.name, p.skill, p.valErr, p.gpuHours]))));
check('baseline policy was added', await page.evaluate(() => lab.state.policies.some((p) => p.baseline)));

log('Eval');
await app('eval'); await page.waitForTimeout(1500);
for (let i = 0; i < 2; i++) await page.click(`#eval-policies input >> nth=${i}`);
await page.selectOption('#eval-params select >> nth=1', '4');
await press('#eval-run'); await page.waitForTimeout(5000); await page.screenshot({ path: `${shots}/eval-running.png` });
await page.waitForFunction(() => lab.state.evals.length >= 1, null, { timeout: 300000 });
await page.screenshot({ path: `${shots}/eval.png` });
log('   rows:', JSON.stringify(await page.evaluate(() => lab.state.evals[0].rows.map((r) => [r.name, r.success, +r.time.toFixed(1), Math.round(r.smooth)]))));
check('ROB-6 closes', await page.evaluate(() => !!lab.state.tickets['ROB-6']));

log('Capstone (is it achievable?)');
await page.evaluate(() => { lab.state.guideOff = true; }); await page.waitForTimeout(700);
await app('brief'); await page.click('text=Start the project');
const cap = await page.evaluate(async () => {
  const { state, episodes, save, newId } = await import('./js/util.js');
  const { loadMujoco, rng, sampleLayout, Sim } = await import('./js/sim/sim.js');
  const { generateDemos } = await import('./js/apps/dataset.js');
  const { isKeeper, datasetStats, trainPolicy, MODELS, rolloutSetup } = await import('./js/models.js');
  const { Rollout } = await import('./js/sim/operator.js');
  const { capstoneStatus } = await import('./js/apps/brief.js');
  const mj = await loadMujoco(), tasks = ['blue_bin', 'stack'];
  window.demo('longarm', 'blue_bin', 2); window.demo('longarm', 'stack', 2);
  for (const t of tasks) for (let k = 0; k < 2; k++) { await generateDemos(mj, 'longarm', t, 12); state.opsHours += 2; }
  for (const e of episodes) if (!e.label) e.label = isKeeper(e) ? 'keep' : 'discard';
  const out = {};
  for (const modelId of ['act', 'smolvla', 'pi05']) {
    const m = MODELS[modelId], cfg = { steps: m.stepsNeeded * 2, lr: m.lrBest, batch: 8, gpu: 'rtx4090', lora: modelId === 'pi05' };
    const res = trainPolicy(modelId, cfg, datasetStats(episodes, 'longarm', tasks), tasks, 3);
    const pol = { ...res, curve: null, id: newId('pol'), name: 'cap/' + modelId, robot: 'longarm' };
    state.policies.push(pol); state.gpuHours += res.gpuHours;
    const sim = new Sim(mj, 'longarm'), p = { spread: 1.2, visual: false, chunk: 10, speed: 1 };
    for (const task of tasks) {
      const row = { policyId: pol.id, name: pol.name, ok: 0, n: 0, time: 0, smooth: 0 };
      for (let i = 0; i < 20; i++) { sim.reset(sampleLayout(rng(5000 + i * 101), 1.2)); const rand = rng(31 + i * 17); const s = rolloutSetup(pol, task, p, rand); const r = new Rollout(sim, task, s.profile, rand, { record: false, actTask: s.actTask }); while (!r.step()); const mm = r.result().metrics; row.n++; row.ok += mm.success; row.time += mm.duration / 20; row.smooth += mm.smooth / 20; }
      row.success = row.ok / row.n;
      state.evals.push({ id: newId('eval'), task, trials: 20, spread: 1.2, chunk: 10, speed: 1, rows: [row], t: 0 });
      out[modelId + ':' + task] = [res.skill[task].toFixed(2), row.success, row.time.toFixed(1), Math.round(row.smooth), res.valErr, res.gpuHours, res.vram];
    }
    sim.dispose();
  }
  save(true);
  const st = capstoneStatus();
  return { out, best: st.best.pol.name, checks: st.best.checks.map((c) => c[2]), global: st.global.map((g) => [g[1], g[2]]), done: st.done };
});
log('  ', JSON.stringify(cap, null, 1).replace(/\n\s+/g, ' '));
check('capstone can be completed (with SmolVLA)', cap.done && cap.best === 'cap/smolvla');
await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/capstone.png` });
await app('tickets'); await page.screenshot({ path: `${shots}/tickets.png` });

const real = errors.filter((e) => !/google|favicon/.test(e));
check('no console or page errors', real.length === 0, real.slice(0, 5).join('\n'));
await browser.close(); server.close();
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('all good');
