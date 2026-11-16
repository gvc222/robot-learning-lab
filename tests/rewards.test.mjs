// Rewards, project submissions, contact dialog, dock highlight. Run: node tests/rewards.test.mjs
import { open } from './shot.mjs';
const { browser, page, errors } = await open();
let bad = 0; const check = (n, ok, d = '') => { console.log(ok ? '  ok  ' : '  FAIL', n, d); if (!ok) bad++; };
await page.fill('#modal input', 'Tester'); await page.click('#modal button');
await page.evaluate(() => { lab.state.guideOff = true; lab.openApp('academy'); lab.openApp('tickets'); });
check('the header says Boinkie’s Robot Lab', (await page.textContent('.brand')).includes('Boinkie’s Robot Lab'));
check('XP chip starts at level 1', (await page.textContent('#m-xp')).startsWith('Lv 1 · 0 XP'));
for (const id of ['dataset', 'train', 'sandbox']) { await page.click(`#dock [data-app="${id}"]`); check(`only the ${id} icon is highlighted`, await page.locator('#dock button.active').count() === 1); }
// contact dialog
await page.click('#contact-btn');
const links = await page.locator('#modal a').evaluateAll((as) => as.map((a) => a.href));
check('contact dialog has website, GitHub and LinkedIn', links.includes('https://playtimediary.com/') && links.includes('https://github.com/gvc222') && links.includes('https://www.linkedin.com/in/giannacalderon'), links.join(' '));
check('contact dialog shows the Discord name', (await page.textContent('#modal')).includes('boinkie'));
await page.evaluate(() => { document.querySelector('#modal').hidden = true; });
// pass one lesson: XP, toast, chat
await page.evaluate(async () => { const { ORDERED } = await import('./js/apps/academy.js'); const x = ORDERED.find((y) => y.id === 'radians'); lab.state.seen.openCourses[x.course] = true; lab.openApp('academy'); [...document.querySelectorAll('.lesson-nav button')].find((b) => b.textContent.includes(x.title)).click(); lab.setCode(x.solution); });
await page.click('#run-tests'); await page.waitForFunction(() => document.querySelector('#run-tests').textContent === 'Run tests' && document.querySelector('.test'), null, { timeout: 90000 });
await page.waitForTimeout(300);
check('passing a lesson gives XP', /Lv 1 · 10 XP/.test(await page.textContent('#m-xp')), await page.textContent('#m-xp'));
check('a congratulation toast appears', /XP/.test(await page.textContent('#toasts')));
// project submission
await page.evaluate(async () => { const { ORDERED } = await import('./js/apps/academy.js'); const x = ORDERED.find((y) => y.id === 'proj_basics'); lab.state.seen.openCourses[x.course] = true; lab.openApp('tickets'); lab.openApp('academy'); [...document.querySelectorAll('.lesson-nav button')].find((b) => b.textContent.includes(x.title)).click(); });
await page.click('#proj-save'); check('an empty submission is refused', !(await page.evaluate(() => !!lab.state.projects?.proj_basics)));
await page.fill('#proj-url', 'https://github.com/someone/pd-arm'); await page.fill('#proj-note', 'PD plus gravity compensation on the SO-101.');
await page.click('#proj-save'); await page.waitForTimeout(300);
const proj = await page.evaluate(() => lab.state.projects.proj_basics);
check('the project is saved', proj?.url === 'https://github.com/someone/pd-arm' && proj.note.includes('gravity'));
check('submitting a project gives XP (4 + 10 + 40)', /54 XP/.test(await page.textContent('#m-xp')), await page.textContent('#m-xp'));
await page.evaluate(() => lab.openApp('tickets')); await page.waitForTimeout(300);
check('the progress page shows achievements and the portfolio', (await page.textContent('#app')).includes('Your achievements') && await page.locator('#portfolio-md').count() === 1);
check('no page errors', errors.length === 0, errors.join(' ; ').slice(0, 200));
await browser.close(); console.log(bad ? `${bad} failed` : 'all good'); process.exit(bad ? 1 : 0);
