// Hand pose → grasp type, for the Feix et al. GRASP taxonomy (33 types; IEEE THMS 46(1), 2016).
// Works on the 21 hand landmarks MediaPipe produces:
//   0 wrist · thumb 1 CMC 2 MCP 3 IP 4 tip · index 5 MCP 6 PIP 7 DIP 8 tip · middle 9–12 · ring 13–16 · pinky 17–20
// This is a heuristic, nearest-prototype classifier on hand shape alone. Many Feix types differ mostly by the
// object (large vs small diameter), so neighbours get confused: we always show the top 3.

export const FEIX = [
  'Large Diameter', 'Small Diameter', 'Medium Wrap', 'Adducted Thumb', 'Light Tool', 'Prismatic 4 Finger',
  'Prismatic 3 Finger', 'Prismatic 2 Finger', 'Palmar Pinch', 'Power Disk', 'Power Sphere', 'Precision Disk',
  'Precision Sphere', 'Tripod', 'Fixed Hook', 'Lateral', 'Index Finger Extension', 'Extension Type', 'Distal Type',
  'Writing Tripod', 'Tripod Variation', 'Parallel Extension', 'Adduction Grip', 'Tip Pinch', 'Lateral Tripod',
  'Sphere 4 Finger', 'Quadpod', 'Sphere 3 Finger', 'Stick', 'Palmar', 'Ring', 'Ventral', 'Inferior Pincer',
];

// Hand-shape prototypes. m = MCP flexion and c = PIP/DIP curl for index, middle, ring, pinky (0 straight … 1 fully bent);
// s = finger spread; ta = thumb abduction (0 alongside the index … 1 opposing the fingers); tf = thumb flexion.
const P = (m, c, s, ta, tf) => ({ m: Array.isArray(m) ? m : [m, m, m, m], c: Array.isArray(c) ? c : [c, c, c, c], s, ta, tf });
export const PROTOTYPES = [
  P(0.5, 0.35, 0.3, 0.9, 0.2), P(0.75, 0.85, 0.2, 0.8, 0.6), P(0.65, 0.6, 0.25, 0.7, 0.35), P(0.7, 0.75, 0.1, 0.1, 0.1),
  P([0.55, 0.7, 0.8, 0.85], [0.5, 0.7, 0.8, 0.85], 0.15, 0.15, 0.2), P(0.45, 0.15, 0.2, 0.85, 0.3),
  P([0.45, 0.45, 0.45, 0.85], [0.15, 0.15, 0.15, 0.9], 0.2, 0.85, 0.3), P([0.45, 0.45, 0.85, 0.85], [0.15, 0.15, 0.9, 0.9], 0.2, 0.85, 0.3),
  P([0.45, 0.1, 0.1, 0.1], [0.2, 0.1, 0.1, 0.1], 0.3, 0.8, 0.2), P(0.5, 0.4, 0.9, 0.95, 0.3), P(0.6, 0.5, 0.7, 0.9, 0.4),
  P(0.35, 0.3, 1.0, 1.0, 0.15), P(0.4, 0.35, 0.75, 0.9, 0.2), P([0.45, 0.45, 0.8, 0.85], [0.35, 0.35, 0.85, 0.9], 0.3, 0.85, 0.35),
  P(0.1, 0.85, 0.1, 0.1, 0.0), P(0.75, 0.8, 0.1, 0.05, 0.45), P([0.2, 0.75, 0.8, 0.85], [0.05, 0.8, 0.85, 0.9], 0.15, 0.3, 0.3),
  P(0.55, 0.05, 0.3, 0.9, 0.1), P([0.3, 0.3, 0.75, 0.8], [0.6, 0.6, 0.8, 0.85], 0.4, 0.7, 0.3),
  P([0.45, 0.5, 0.8, 0.85], [0.25, 0.6, 0.85, 0.9], 0.2, 0.7, 0.45), P([0.3, 0.55, 0.7, 0.8], [0.3, 0.55, 0.8, 0.85], 0.25, 0.5, 0.4),
  P(0.6, 0.0, 0.1, 0.3, 0.1), P([0.15, 0.2, 0.2, 0.2], 0.1, 0.0, 0.2, 0.1), P([0.5, 0.1, 0.1, 0.1], [0.65, 0.1, 0.1, 0.1], 0.3, 0.85, 0.5),
  P([0.6, 0.65, 0.85, 0.9], [0.6, 0.7, 0.9, 0.9], 0.1, 0.2, 0.45), P(0.5, 0.5, 0.55, 0.9, 0.35),
  P([0.45, 0.45, 0.45, 0.85], [0.35, 0.35, 0.35, 0.9], 0.35, 0.85, 0.35), P([0.5, 0.5, 0.5, 0.85], [0.5, 0.5, 0.5, 0.9], 0.5, 0.9, 0.35),
  P([0.3, 0.6, 0.8, 0.85], [0.2, 0.55, 0.8, 0.85], 0.2, 0.2, 0.2), P(0.25, 0.2, 0.3, 0.1, 0.05),
  P([0.55, 0.2, 0.2, 0.2], [0.5, 0.2, 0.2, 0.2], 0.3, 0.8, 0.3), P([0.2, 0.3, 0.3, 0.3], [0.7, 0.4, 0.4, 0.4], 0.2, 0.5, 0.2),
  P([0.45, 0.6, 0.7, 0.75], [0.15, 0.6, 0.7, 0.75], 0.2, 0.65, 0.15),
];

// ── a simple kinematic hand (right hand, metres): palm in the x–y plane, fingers along +y, palm facing +z ──
const FINGERS = [ // MCP position x, y; segment lengths; spread direction
  { x: 0.024, y: 0.088, len: [0.045, 0.026, 0.020], dir: 1 }, { x: 0.004, y: 0.092, len: [0.049, 0.030, 0.021], dir: 0.3 },
  { x: -0.015, y: 0.087, len: [0.045, 0.028, 0.021], dir: -0.4 }, { x: -0.032, y: 0.078, len: [0.036, 0.021, 0.019], dir: -1 },
];
const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]), mul = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], norm = (a) => Math.hypot(...a), unit = (a) => mul(a, 1 / (norm(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rot = (v, k, t) => add(add(mul(v, Math.cos(t)), mul(cross(k, v), Math.sin(t))), mul(k, dot(k, v) * (1 - Math.cos(t))));  // Rodrigues
const D = Math.PI / 180;

export function handLandmarks(p) {
  const L = [[0, 0, 0]];
  // thumb: from the CMC, swing out of the palm plane (abduction), then curl toward the palm centre
  const cmc = [0.022, 0.025, 0.004];
  let d = unit([0.55 - 0.65 * p.ta, 1 - 0.35 * p.ta, 0.9 * p.ta]);
  const axis = unit(cross(d, [-1, 0.2, 0.35]));
  const seg = [0.04, 0.032, 0.027], bend = [10 * D, 50 * D * p.tf + 5 * D, 70 * D * p.tf];
  let pt = cmc; L.push(pt);
  for (let k = 0; k < 3; k++) { d = rot(d, axis, bend[k]); pt = add(pt, mul(d, seg[k])); L.push(pt); }
  FINGERS.forEach((f, i) => {
    const spread = (p.s - 0.3) * 12 * D * f.dir;
    let dir = [Math.sin(spread), Math.cos(spread), 0];
    const ax = unit(cross([0, 0, 1], dir));  // bending moves the finger toward +z (into the palm)
    let pt2 = [f.x, f.y, 0]; L.push(pt2);
    const angles = [88 * D * p.m[i], 100 * D * p.c[i], 75 * D * p.c[i]];
    for (let k = 0; k < 3; k++) { dir = rot(dir, mul(ax, -1), angles[k]); pt2 = add(pt2, mul(dir, f.len[k])); L.push(pt2); }
  });
  return L;
}

// ── features (rotation- and scale-invariant) ──
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b)))));
export function features(L) {
  const scale = norm(sub(L[9], L[0])) || 1;
  const normal = unit(cross(sub(L[5], L[0]), sub(L[17], L[0])));  // palm normal (sign set so fingers curl toward +normal)
  const palmDir = unit(sub(L[9], L[0]));
  const m = [], c = [];
  for (const b of [5, 9, 13, 17]) {
    m.push(angle(sub(L[b], L[0]), sub(L[b + 1], L[b])) / (88 * D));
    c.push((angle(sub(L[b + 1], L[b]), sub(L[b + 2], L[b + 1])) + angle(sub(L[b + 2], L[b + 1]), sub(L[b + 3], L[b + 2]))) / (175 * D));
  }
  const spread = angle(sub(L[6], L[5]).map((v, i) => v - dot(sub(L[6], L[5]), normal) * normal[i]), sub(L[18], L[17]).map((v, i) => v - dot(sub(L[18], L[17]), normal) * normal[i])) / (40 * D);
  const tdir = unit(sub(L[2], L[1]));
  const ta = Math.max(0, Math.asin(Math.max(-1, Math.min(1, Math.abs(dot(tdir, normal)))))) / (50 * D) * 0.6 + 0.4 * (1 - dot(tdir, palmDir));
  const tf = (angle(sub(L[2], L[1]), sub(L[3], L[2])) + angle(sub(L[3], L[2]), sub(L[4], L[3]))) / (120 * D);
  const tips = [8, 12, 16, 20].map((t) => norm(sub(L[4], L[t])) / scale);
  const lateral = norm(sub(L[4], mul(add(L[6], L[7]), 0.5))) / scale;
  return { m, c, spread, ta, tf, tips, lateral };
}
const vec = (f) => [...f.m, ...f.c, 0.6 * f.spread, 1.2 * f.ta, 0.8 * f.tf, ...f.tips.map((t) => 0.8 * t), 0.8 * f.lateral];
const PROTO_VECS = PROTOTYPES.map((p) => vec(features(handLandmarks(p))));

// Top-k grasp types with a softmax confidence. Pass 21 landmarks as [x, y, z] (MediaPipe worldLandmarks work best).
export function classify(L, k = 3) {
  const v = vec(features(L));
  const d = PROTO_VECS.map((p) => Math.hypot(...p.map((x, i) => x - v[i])));
  const w = d.map((x) => Math.exp(-x / 0.12)), Z = w.reduce((a, b) => a + b, 0) || 1;
  return d.map((x, i) => ({ id: i + 1, name: FEIX[i], dist: x, p: w[i] / Z })).sort((a, b) => a.dist - b.dist).slice(0, k);
}

// Joint targets for MuJoCo Menagerie's LEAP Hand (radians), from the same features.
export const LEAP_ORDER = ['if_mcp', 'if_rot', 'if_pip', 'if_dip', 'mf_mcp', 'mf_rot', 'mf_pip', 'mf_dip', 'rf_mcp', 'rf_rot', 'rf_pip', 'rf_dip', 'th_cmc', 'th_axl', 'th_mcp', 'th_ipl'];
export function leapTargets(f) {
  const out = {}, clamp = (x) => Math.max(0, Math.min(1.05, x));
  ['if', 'mf', 'rf'].forEach((n, i) => {
    out[`${n}_mcp`] = 1.9 * clamp(f.m[i]);
    out[`${n}_rot`] = [0.25, 0, -0.25][i] * (f.spread - 0.3);
    out[`${n}_pip`] = 1.6 * clamp(f.c[i]);
    out[`${n}_dip`] = 1.3 * clamp(f.c[i]);
  });
  out.th_cmc = 1.6 * clamp(f.ta);
  out.th_axl = 0.3 + 0.6 * clamp(f.ta);
  out.th_mcp = 1.2 * clamp(f.tf);
  out.th_ipl = 1.0 * clamp(f.tf);
  return out;
}
