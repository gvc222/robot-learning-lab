// Grasp classifier and Feetech protocol checks. Run: node tests/hand.test.mjs
import { FEIX, PROTOTYPES, handLandmarks, classify, features } from '../js/hand/grasp.js';
import { packet, readPacket, parseReply, word, toDegrees, toGripper01 } from '../js/hw/feetech.js';
let fail = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fail++; };

check('33 Feix grasp types', FEIX.length === 33 && PROTOTYPES.length === 33);
let top1 = 0, top3 = 0; const confused = [];
PROTOTYPES.forEach((p, i) => { const r = classify(handLandmarks(p)); if (r[0].id === i + 1) top1++; else confused.push(`${i + 1}->${r[0].id}`); if (r.some((x) => x.id === i + 1)) top3++; });
check('every prototype classifies as itself', top1 === 33, confused.join(' '));
// robustness: random rotation + scale + noise, as from a real camera
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
let noisy3 = 0, n = 0;
for (let i = 0; i < 33; i++) for (let t = 0; t < 10; t++) {
  const a = rnd() * 6.28, b = rnd() * 6.28, sc = 0.8 + 0.4 * rnd();
  const R = (v) => { let [x, y, z] = v; [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]; [y, z] = [y * Math.cos(b) - z * Math.sin(b), y * Math.sin(b) + z * Math.cos(b)]; return [x, y, z].map((q) => q * sc + (rnd() - 0.5) * 0.004); };
  const L = handLandmarks(PROTOTYPES[i]).map(R); n++;
  if (classify(L).some((x) => x.id === i + 1)) noisy3++;
}
check('rotation/scale invariant, noisy top-3', noisy3 / n > 0.85, `${noisy3}/${n}`);

// Feetech: compare with bytes from Feetech's SCServo SDK (READ id 1, Present_Position @56, 2 bytes)
check('read packet matches SDK', JSON.stringify(Array.from(readPacket(1, 56, 2))) === JSON.stringify([0xff, 0xff, 1, 4, 2, 56, 2, 0xbe]));
const reply = packet(3, 0, [0x10, 0x08]);  // status from ID 3: error 0, position 0x0810 = 2064
const r = parseReply(Uint8Array.from([0x00, 0xff, ...reply, 0x55]));
check('parse a reply after noise', r && r.id === 3 && word(r.params) === 2064 && r.used === 2 + reply.length);
const bad = Uint8Array.from(reply); bad[bad.length - 1] ^= 1;
check('reject a bad checksum', parseReply(bad) === null);
check('partial reply waits for more bytes', parseReply(reply.slice(0, 5)) === null);
check('LeRobot degrees: middle of range is 0°, a quarter turn is ~90°', Math.abs(toDegrees(2047.5, { range_min: 0, range_max: 4095 })) < 1e-9 && Math.abs(toDegrees(3071, { range_min: 0, range_max: 4095 }) - 90) < 0.1);
check('gripper clamps to 0–1', toGripper01(5000, { range_min: 2000, range_max: 3000 }) === 1 && toGripper01(2500, { range_min: 2000, range_max: 3000 }) === 0.5);
console.log(fail ? `${fail} failed` : 'all good'); process.exit(fail ? 1 : 0);
