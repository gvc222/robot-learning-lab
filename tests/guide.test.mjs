// Every element a guide popup points at must still exist somewhere in the source.
// (A stale selector silently breaks the popup, e.g. after swapping the code editor.)
import fs from 'fs';
import path from 'path';
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.js') && !p.endsWith('story.js')) files.push(p); } };
walk('js'); files.push('index.html');
const src = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const story = fs.readFileSync('js/story.js', 'utf8');
const sels = [...new Set([...story.matchAll(/sel: '([^']+)'/g)].map((m) => m[1]))];
let bad = 0;
for (const s of sels) {
  const name = s.replace(/^[#.]/, '').split(/[\s.#\[:]/)[0];
  const ok = src.includes(name);
  if (!ok) { console.log('  FAIL guide selector not found in the app:', s); bad++; }
}
console.log(bad ? `${bad} stale guide selectors` : `all ${sels.length} guide selectors exist`);
process.exit(bad ? 1 : 0);
