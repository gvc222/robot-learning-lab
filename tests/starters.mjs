// Every code lesson's untouched starter must NOT pass its own tests (otherwise the lesson teaches nothing).
// Run: node tests/starters.mjs
import { open } from './shot.mjs';
const { browser, page, errors } = await open();
await page.fill('#modal input', 'Tester'); await page.click('#modal button');
await page.evaluate(() => { lab.state.guideOff = false; window.lab.openApp('academy'); });
const lessons = await page.evaluate(async () => (await import('./js/apps/academy.js')).ORDERED.filter((l) => !l.quiz && l.kind !== 'lab' && l.kind !== 'read').map((l) => ({ id: l.id, title: l.title })));
let bad = 0;
for (const l of lessons) {
  await page.evaluate(async (t) => {
    const { ORDERED } = await import('./js/apps/academy.js'); const x = ORDERED.find((y) => y.title === t);
    lab.state.seen.openCourses[x.course] = true; lab.openApp('tickets'); lab.openApp('academy');
    [...document.querySelectorAll('.lesson-nav button')].find((b) => b.textContent.includes(t)).click();
  }, l.title);
  await page.click('#run-tests');
  await page.waitForFunction(() => document.querySelector('#run-tests').textContent === 'Run tests' && document.querySelector('.test'), null, { timeout: 240000 });
  const passed = await page.evaluate((id) => !!lab.state.course.done[id], l.id);
  console.log(passed ? '  FAIL' : '  ok  ', l.id, passed ? 'the starter already passes' : '');
  if (passed) bad++;
}
await browser.close();
console.log(bad ? `${bad} lessons pass with their starter` : 'all starters fail as they should');
process.exit(bad ? 1 : 0);
