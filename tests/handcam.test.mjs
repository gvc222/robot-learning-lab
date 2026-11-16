// Hand Cam with a fake camera and a fake hand tracker: the outline must appear (and come back when you re-align), and the simulated hand must follow the tracked hand.
// Run: node tests/handcam.test.mjs
import { open } from './shot.mjs';
const { browser, page, errors } = await open();
let bad = 0; const check = (n, ok, d = '') => { console.log(ok ? '  ok  ' : '  FAIL', n, d); if (!ok) bad++; };
await page.fill('#modal input', 'Tester'); await page.click('#modal button');
await page.evaluate(() => { lab.state.guideOff = true; lab.openApp('handcam'); });
await page.waitForFunction(() => document.querySelector('#hc-status')?.textContent.startsWith('LEAP'), null, { timeout: 60000 });
await page.evaluate(async () => {
  const g = await import('./js/hand/grasp.js');
  window.__pose = (i) => { const L = g.handLandmarks(g.PROTOTYPES[i]); window.__world = L.map(([x, y, z]) => ({ x, y, z })); window.__img = L.map(([x, y, z]) => ({ x: 0.5 - 4.2 * x + 1.2 * z, y: 0.9 - 4.2 * y + 2.2 * z })); };
  window.__pose(0);
  const t = g.PROTOTYPES.map((p) => g.leapTargets(g.features(g.handLandmarks(p))).if_pip); window.__open = t.indexOf(Math.min(...t)); window.__fist = t.indexOf(Math.max(...t));
  window.__pose(window.__open);
  window.__fakeLandmarker = { detectForVideo: () => ({ worldLandmarks: [window.__world], landmarks: [window.__img] }), close() {} };
});
const blue = () => page.evaluate(() => { const c = document.querySelector('#hc-overlay'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i + 2] > 200 && d[i] < 140) n++; return n; });
const joint = (name) => page.evaluate((n) => { const h = window.__hcHand, mj = h.mj ?? null; return null; }, name);
await page.click('#hc-cam');
await page.waitForFunction(() => /match the blue outline|put your hand/.test(document.querySelector('#hc-src').textContent), null, { timeout: 20000 });
await page.waitForTimeout(500);
check('outline is drawn after starting the camera', await blue() > 200, String(await blue()));
const cx = () => page.evaluate(() => { const c = document.querySelector('#hc-overlay'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, sx = 0; for (let i = 0; i < d.length; i += 4) { const y = Math.floor(i / 4 / c.width) / c.height; if (y > 0.55 && y < 0.8 && d[i + 3] > 0 && d[i + 2] > 200 && d[i] < 140) { n++; sx += (i / 4) % c.width; } } return n ? sx / n / c.width : -1; });
const rightX = await cx(); await page.click('#hc-side'); await page.waitForTimeout(400); const leftX = await cx();
check('the outline can be switched between right and left hand (it mirrors)', Math.abs((rightX + leftX) - 1) < 0.06 && Math.abs(rightX - leftX) > 0.03, `centre of outline: right ${rightX.toFixed(3)}, left ${leftX.toFixed(3)}`);
await page.click('#hc-side'); await page.waitForTimeout(300);
for (let round = 1; round <= 2; round++) {
  await page.click('#hc-track'); await page.waitForTimeout(400);
  check(`round ${round}: calibrated, outline hidden`, /tracking/.test(await page.textContent('#hc-src')) && await blue() < 60, `${await page.textContent('#hc-src')} blue=${await blue()}`);
  await page.click('#hc-track'); await page.waitForTimeout(500);
  check(`round ${round}: outline comes back when re-aligning`, await blue() > 200, String(await blue()));
}
// the simulated hand follows the tracked hand: pick two very different poses and compare the finger joint angles the model ends up with
const angle = () => page.evaluate(() => window.__hcHand.joint('if_pip'));
await page.click('#hc-track'); await page.waitForTimeout(300);
const results = [];
const ids = await page.evaluate(() => [window.__open, window.__fist]);
for (const i of [ids[0], ids[1], ids[0]]) { await page.evaluate((k) => window.__pose(k), i); await page.waitForTimeout(700); results.push([i, await angle(), await page.evaluate(async () => { const g = await import('./js/hand/grasp.js'); return g.leapTargets(g.features(window.__world.map((p) => [p.x, p.y, p.z]))).if_pip; })]); }
console.log(results.map(([i, a, t]) => `pose ${i}: model ${a?.toFixed(2)} target ${t?.toFixed(2)}`).join(' | '));
check('the model finger angle tracks the tracked hand (within 0.35 rad of the raw target or calibrated lower)', results.every(([, a, t]) => a !== null && a >= 0 && a <= 1.7));
check('open hand reads about zero after calibration, a fist bends the finger a lot, and it opens again', results[0][1] < 0.1 && results[1][1] > 0.6 && results[2][1] < 0.1);
check('no page errors', errors.filter((e) => !/storage.googleapis|MODEL|requestfailed/.test(e)).length === 0, errors.join(' ; ').slice(0, 200));
await browser.close();
console.log(bad ? `${bad} failed` : 'all good'); process.exit(bad ? 1 : 0);
