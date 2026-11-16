// Every code lesson's reference solution must pass its own tests. Run: node tests/solutions.mjs [lessonId ...]
import { open } from './shot.mjs';
const only = process.argv.slice(2);
const { browser, page } = await open();
await page.fill('#modal input', 'Tester'); await page.click('#modal button');
await page.evaluate(() => { lab.state.guideOff = true; window.lab.openApp('academy'); });
const lessons = await page.evaluate(async () => (await import('./js/apps/academy.js')).ORDERED.filter((l) => !l.quiz && l.kind !== 'lab' && l.solution).map((l) => ({ id: l.id, title: l.title })));
let bad = 0;
for (const l of lessons.filter((x) => !only.length || only.includes(x.id))) {
  await page.evaluate(async (id) => {
    const { ORDERED } = await import('./js/apps/academy.js'); const x = ORDERED.find((y) => y.id === id);
    lab.state.seen.openCourses[x.course] = true; lab.openApp('tickets'); lab.openApp('academy');
    [...document.querySelectorAll('.lesson-nav button')].find((b) => b.textContent.includes(x.title)).click();
    lab.setCode(x.solution);
  }, l.id);
  await page.click('#run-tests', { timeout: 280000 });
  await page.waitForFunction(() => document.querySelector('#run-tests').textContent === 'Run tests' && document.querySelector('.test'), null, { timeout: 240000 });
  const passed = await page.evaluate((id) => !!lab.state.course.done[id], l.id);
  const why = passed ? '' : await page.evaluate(() => [...document.querySelectorAll('.test.fail')].map((n) => n.textContent.trim().slice(0, 160)).join(' | '));
  console.log(passed ? '  ok  ' : '  FAIL', l.id, why);
  if (!passed) bad++;
}
await browser.close();
console.log(bad ? `${bad} solutions fail their tests` : 'all solutions pass');
process.exit(bad ? 1 : 0);
