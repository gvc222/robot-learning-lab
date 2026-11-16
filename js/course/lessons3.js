// Courses added in week 3: digital twins, long-horizon deployment, and mobile robots.
// Plus two hardware-station lessons (leader-arm teleop, dexterous hands and grasp taxonomies).
const A = (id, text) => `<a href="https://arxiv.org/abs/${id}" target="_blank" rel="noopener">${text}</a>`;
const L = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;

export const COURSES3 = [
  { id: 'twin', title: 'Digital twins', blurb: 'Scan or CAD a real object, fix the mesh, measure its physics, drop it in sim.' },
  { id: 'deploy', title: 'Deployment: the coffee shift', blurb: 'Long-horizon tasks, failure recovery, smooth transitions, failure data.' },
  { id: 'mobile', title: 'Mobile robots & delivery', blurb: 'Wheels, car models, odometry, Kalman filters, mapping, A*, pure pursuit.' },
];

const CUBE_MM = `V = [(0,0,0),(40,0,0),(40,40,0),(0,40,0),(0,0,40),(40,0,40),(40,40,40),(0,40,40)]
F = [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),(1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
`;

export const MORE3 = [
  // ───────────────────────── Digital twins ─────────────────────────
  {
    id: 'twincapture', course: 'twin', title: 'Getting a real object into the computer', kind: 'quiz',
    text: `<p>A <b>digital twin</b> is a sim asset that looks, weighs, slides and collides like the real thing. Policies trained or evaluated on it transfer only as well as the twin matches. There are two ways to get the shape:</p>
<ul><li><b>Model it in CAD</b> when the object is simple or man-made (a mug, a box, a 3D-printed part). Measure with calipers, sketch, extrude, export STL/OBJ. ${L('https://www.tinkercad.com', 'Tinkercad')} (beginner, in the browser) and ${L('https://www.onshape.com', 'Onshape')} (parametric, in the browser) are free to use but not open source; ${L('https://www.freecad.org', 'FreeCAD')} and ${L('https://www.blender.org', 'Blender')} are fully open source.</li>
<li><b>Scan it</b> when the shape is organic or textured (fruit, a croissant, a plush toy). <b>Photogrammetry</b> takes 50–200 overlapping photos from all around and solves for camera poses and 3D points (structure from motion), then a dense mesh and a texture. Open-source pipelines: ${L('https://colmap.github.io', 'COLMAP')} and ${L('https://alicevision.org', 'Meshroom / AliceVision')}. A phone with a LiDAR sensor or a structured-light scanner gives faster but coarser geometry.</li></ul>
<p>Photogrammetry tips that decide whether it works: diffuse even light (no harsh shadows), a textured background or turntable with markers, no shiny or transparent surfaces (dust them with spray or powder), and <b>put a ruler in the scene</b>. Structure from motion recovers shape only up to scale, so without a known length your mug could be 9 cm or 9 m.</p>`,
    quiz: [
      { q: 'You scan a coffee mug with photogrammetry. Why must a ruler or known-size marker be in the photos?', options: ['It improves the texture colors', 'Structure from motion only recovers shape up to an unknown scale', 'COLMAP refuses to run without one'], answer: 1 },
      { q: 'Which object is the better fit for CAD rather than scanning?', options: ['A crumpled shirt', 'A 3D-printed gripper finger you designed', 'A banana'], answer: 1 },
      { q: 'Your scan of a glass cup is full of holes. The most likely cause?', options: ['Too many photos', 'Transparent and shiny surfaces break feature matching', 'The turntable was too slow'], answer: 1 },
    ],
  },
  {
    id: 'twinmesh', course: 'twin', title: 'Fixing the mesh: units, holes, volume',
    text: `<p>A raw scan or CAD export is rarely sim-ready. The three checks every asset pipeline runs first:</p>
<ol><li><b>Units.</b> CAD tools export millimetres; MuJoCo works in metres. An unscaled 40 mm cube becomes a 40 m building.</li>
<li><b>Watertight.</b> A closed surface uses every edge in exactly two triangles. Scans often have holes (an edge used once), which breaks volume, inertia and convex decomposition. Fill holes in ${L('https://www.meshlab.net', 'MeshLab')} or Blender.</li>
<li><b>Volume.</b> For a closed mesh, volume is the sum of signed tetrahedra from the origin to each triangle: <code>V = Σ (a · (b × c)) / 6</code>. With the measured mass it gives density, a quick sanity check (a “mug” at 50 g/cm³ is a broken mesh).</li></ol>
<p><b>Your task</b>: write <code>to_meters(verts, unit)</code> (unit is "mm", "cm" or "m"), <code>is_watertight(faces)</code> and <code>volume(verts, faces)</code>. The tests use a 40 mm cube.</p>`,
    pre: CUBE_MM,
    starter: `SCALE = {"mm": 0.001, "cm": 0.01, "m": 1.0}

def to_meters(verts, unit):
    ...

def is_watertight(faces):
    # count how many triangles use each undirected edge
    count = {}
    for (a, b, c) in faces:
        for e in ((a, b), (b, c), (c, a)):
            key = tuple(sorted(e))
            count[key] = count.get(key, 0) + 1
    return ...

def volume(verts, faces):
    total = 0.0
    for (i, j, k) in faces:
        a, b, c = verts[i], verts[j], verts[k]
        # a . (b x c)
        ...
    return abs(total) / 6.0
`,
    solution: `SCALE = {"mm": 0.001, "cm": 0.01, "m": 1.0}

def to_meters(verts, unit):
    s = SCALE[unit]
    return [(x * s, y * s, z * s) for (x, y, z) in verts]

def is_watertight(faces):
    count = {}
    for (a, b, c) in faces:
        for e in ((a, b), (b, c), (c, a)):
            key = tuple(sorted(e))
            count[key] = count.get(key, 0) + 1
    return all(n == 2 for n in count.values())

def volume(verts, faces):
    total = 0.0
    for (i, j, k) in faces:
        a, b, c = verts[i], verts[j], verts[k]
        cx = (b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0])
        total += a[0] * cx[0] + a[1] * cx[1] + a[2] * cx[2]
    return abs(total) / 6.0
`,
    hint: 'Watertight means every edge count is exactly 2. For the cross product: <code>b × c = (b1c2 − b2c1, b2c0 − b0c2, b0c1 − b1c0)</code>.',
    tests: [
      ['mm → m', `m = to_meters(V, "mm")\nassert abs(m[6][0] - 0.04) < 1e-12, "40 mm should be 0.04 m"`],
      ['the cube is watertight; with a face missing it is not', `assert is_watertight(F), "a closed cube should pass"\nassert not is_watertight(F[:-1]), "a cube with a missing triangle has a hole"`],
      ['volume of a 40 mm cube is 64 cm³', `v = volume(to_meters(V, "mm"), F)\nassert abs(v - 6.4e-5) < 1e-9, "expected 6.4e-5 m^3, got %r" % v`],
    ],
  },
  {
    id: 'twininertia', course: 'twin', title: 'Mass and inertia from a kitchen scale',
    text: `<p>Physics needs more than shape: <b>mass</b> (weigh it) and the <b>inertia tensor</b> (how hard it is to spin). Wrong inertia makes a sim mug wobble or spin like a top. MuJoCo can compute inertia from a watertight mesh and a density, but for simple objects the formulas are worth knowing, and they double as a check.</p>
<ul><li>Solid box with half-sizes (a, b, c): <code>Ixx = m(b²+c²)/3</code>, and the same pattern for Iyy, Izz. (With full side lengths it is the familiar <code>m(w²+h²)/12</code>.)</li>
<li>Solid cylinder, radius r, height h, axis z: <code>Izz = m r²/2</code>, <code>Ixx = Iyy = m(3r² + h²)/12</code>.</li></ul>
<p>Then write it into MJCF: <code>&lt;inertial pos="0 0 0" mass="0.32" diaginertia="Ixx Iyy Izz"/&gt;</code>.</p>
<p><b>Your task</b>: write <code>box_inertia(m, a, b, c)</code> (half-sizes), <code>cylinder_inertia(m, r, h)</code>, and <code>inertial_xml(m, I)</code> that returns that tag with values formatted by <code>%.6g</code>.</p>`,
    starter: `def box_inertia(m, a, b, c):
    return (..., ..., ...)

def cylinder_inertia(m, r, h):
    ...

def inertial_xml(m, I):
    return '<inertial pos="0 0 0" mass="%.6g" diaginertia="%.6g %.6g %.6g"/>' % (...)
`,
    solution: `def box_inertia(m, a, b, c):
    return (m * (b*b + c*c) / 3, m * (a*a + c*c) / 3, m * (a*a + b*b) / 3)

def cylinder_inertia(m, r, h):
    side = m * (3*r*r + h*h) / 12
    return (side, side, m * r * r / 2)

def inertial_xml(m, I):
    return '<inertial pos="0 0 0" mass="%.6g" diaginertia="%.6g %.6g %.6g"/>' % (m, I[0], I[1], I[2])
`,
    hint: 'Half-sizes: <code>m*(b*b + c*c)/3</code>. Cylinder sides: <code>m*(3r² + h²)/12</code>.',
    tests: [
      ['box matches the full-size formula', `I = box_inertia(0.3, 0.05, 0.03, 0.02)\nassert abs(I[0] - 0.3 * (0.06**2 + 0.04**2) / 12) < 1e-12, "Ixx wrong"\nassert abs(I[2] - 0.3 * (0.1**2 + 0.06**2) / 12) < 1e-12, "Izz wrong"`],
      ['a mug-sized cylinder (r 4 cm, h 9.5 cm, 320 g)', `I = cylinder_inertia(0.32, 0.04, 0.095)\nassert abs(I[2] - 0.000256) < 1e-9, "Izz should be m r^2 / 2"\nassert abs(I[0] - 0.32 * (3*0.0016 + 0.009025) / 12) < 1e-12`],
      ['valid MJCF tag', `s = inertial_xml(0.32, cylinder_inertia(0.32, 0.04, 0.095))\nassert s.startswith('<inertial') and 'mass="0.32"' in s and 'diaginertia="' in s, s`],
    ],
  },
  {
    id: 'twinfriction', course: 'twin', title: 'Measure friction with a tilting board', viz: 'incline', explain: 'inclinefbd',
    text: `<p>Friction decides whether a grasp holds and whether a pushed object slides or tips, and nobody knows its value for your mug on your table. Measure it with the oldest trick in physics: put the object on a board and tilt slowly until it slides.</p>
<p>At the moment of slipping, gravity along the slope (<code>m g sin θ</code>) equals the maximum static friction (<code>μ m g cos θ</code>), so <b>μ = tan θ</b>. Use your phone’s level app for θ, repeat a few times, and use the <b>median</b> so one jerky tilt does not ruin it.</p>
<p><b>Your task</b>: write <code>mu_from_angle(deg)</code> and <code>estimate_mu(angles_deg)</code> (median of the per-trial μ). The lab then builds a real tilting-board experiment in MuJoCo with an object whose friction is hidden, runs 5 trials, feeds you the slip angles, and checks your estimate against the truth. Your number goes straight into the object’s <code>friction="μ 0.005 0.0001"</code>.</p>`,
    pre: 'import math\n',
    starter: `def mu_from_angle(deg):
    ...

def estimate_mu(angles_deg):
    mus = sorted(mu_from_angle(a) for a in angles_deg)
    ...
`,
    solution: `def mu_from_angle(deg):
    return math.tan(math.radians(deg))

def estimate_mu(angles_deg):
    mus = sorted(mu_from_angle(a) for a in angles_deg)
    n = len(mus)
    return mus[n // 2] if n % 2 else (mus[n // 2 - 1] + mus[n // 2]) / 2
`,
    hint: '<code>math.tan(math.radians(deg))</code>. The median of a sorted list is the middle element (or the mean of the two middle ones).',
    tests: [
      ['45° means μ = 1', `assert abs(mu_from_angle(45) - 1) < 1e-9`],
      ['median ignores one bad trial', `assert abs(estimate_mu([30, 31, 29, 30.5, 55]) - math.tan(math.radians(30.5))) < 1e-9, "use the median, not the mean"`],
    ],
  },
  {
    id: 'twinvalidate', course: 'twin', title: 'Textures, collision shapes and the drop test', kind: 'quiz',
    text: `<p>A twin has two meshes. The <b>visual</b> mesh carries the texture (the photo colors from photogrammetry, mapped by UV coordinates) and can be detailed. The <b>collision</b> mesh must be simple: MuJoCo collides meshes as their <b>convex hull</b>, so a mug’s hollow and handle disappear. For concave objects, split the mesh into convex parts with a convex decomposition tool (CoACD or V-HACD) and add each part as its own geom. Menagerie models follow this pattern: visual geoms in one group, collision geoms in another (you saw it in the Leader Arm station).</p>
<p>Shrink heavy textures (1024² is plenty for a tabletop object). The camera of a vision policy sees them, and texture realism matters most when you train from images.</p>
<p>Then validate the twin against reality with cheap experiments: drop it from 20 cm and compare the bounce and settle on video; push it with a known force and compare how far it slides; tilt it (the friction lab). If sim and real disagree, adjust one parameter at a time. This loop of measuring, fitting and re-checking is <b>system identification</b>.</p>`,
    quiz: [
      { q: 'You import a scanned mug as one mesh geom. Why can’t the robot hook its finger through the handle in MuJoCo?', options: ['The texture is too large', 'MuJoCo collides a mesh as its convex hull, which fills the handle hole', 'Mugs need a freejoint'], answer: 1 },
      { q: 'Your sim mug slides 3× farther than the real one when pushed. What do you adjust first?', options: ['The texture resolution', 'The friction coefficient (then re-check with the tilt test)', 'The camera field of view'], answer: 1 },
      { q: 'Which mesh should be detailed and textured?', options: ['The visual mesh', 'The collision mesh', 'Both must be identical'], answer: 0 },
    ],
  },

  // ───────────────────────── Deployment: the coffee shift ─────────────────────────
  {
    id: 'deployintro', course: 'deploy', title: 'Why long tasks fail', kind: 'quiz', explain: 'compound',
    text: `<p>Pick-and-place demos hide a brutal fact: steps multiply. If each of 6 steps succeeds 95% of the time and nothing recovers, the whole task succeeds 0.95⁶ ≈ <b>74%</b>; at 20 steps, 36%. A cafe robot making 200 drinks a day would fail dozens of times.</p>
<p>Deployed systems fight this three ways:</p>
<ul><li><b>Structure</b>: break the task into skills (pick, place, press) and sequence them with a state machine or behavior tree, checking a condition after every step.</li>
<li><b>Recovery</b>: when a check fails (cup not in the gripper), go back to a state that can fix it (find the cup, regrasp) instead of continuing blindly.</li>
<li><b>Recovery data</b>: learned policies only recover if their training data shows recoveries. Clean, perfect demos teach a policy nothing about what to do after a slip.</li></ul>
<p>Real failure data exists. ${L('https://huggingface.co/datasets/sii-rhos-ai/ViFailback-Dataset', 'ViFailback')} (${A('2512.02787', 'paper')}, CVPR 2026, MIT license) has 5,202 real ALOHA trajectories over 100 tasks; 4,545 of them are failures, labeled with what went wrong, plus 58,128 question–answer pairs for training failure-reasoning models. For LeRobot-format episodes that include regrasps, see ${L('https://huggingface.co/datasets/eliasab16/grab_and_insert_with_recovery_method_2', 'grab_and_insert_with_recovery_method_2')} and open it in the ${L('https://huggingface.co/spaces/lerobot/visualize_dataset', 'LeRobot dataset visualizer')}.</p>`,
    quiz: [
      { q: 'A 10-step task where each step succeeds 97% of the time, with no recovery. Roughly how often does it finish?', options: ['97%', '74%', '30%'], answer: 1 },
      { q: 'Your policy, trained only on perfect demos, freezes after the cup slips. Why?', options: ['It needs a bigger GPU', 'It never saw a state like “cup on the counter after a slip” with a recovery action', 'The camera is miscalibrated'], answer: 1 },
      { q: 'Why does ViFailback contain far more failures than successes?', options: ['Collection went badly', 'It is built to teach models to detect and explain failures', 'Successes were deleted for privacy'], answer: 1 },
    ],
  },
  {
    id: 'deployrecover', course: 'deploy', title: 'Write the coffee shift (with regrasps)', viz: 'coffee',
    text: `<p>Your robot works a coffee counter in MuJoCo. One order: <b>cup from the counter → under the machine → press the brew button → wait → cup onto the serving tray</b>. Today’s cups are slippery: about 1 carry in 3, the cup slips out mid-move and lands on the counter, for real, in the physics.</p>
<p>You get skills on a <code>robot</code> object:</p>
<ul><li><code>robot.pick()</code> grasps the cup wherever it is; returns <code>True</code> if the robot is holding it afterwards.</li>
<li><code>robot.place("machine")</code> or <code>robot.place("tray")</code>; returns <code>True</code> if the cup ended up there.</li>
<li><code>robot.press()</code> presses the brew button (only brews if the cup is under the machine).</li>
<li><code>robot.wait(seconds)</code>, <code>robot.home()</code>, <code>robot.where()</code> (one of "counter", "machine", "tray", "gripper").</li></ul>
<p><b>Your task</b>: write <code>serve(robot)</code> that survives slips: after every step, <i>check</i> where the cup is, and retry (at most 4 times per stage, a real shift has a clock). The lab runs 20 orders with your code and 20 with a script that never checks, and needs you at 17/20 or better.</p>`,
    starter: `def serve(robot):
    # Stage 1: get the cup under the machine
    robot.pick()
    robot.place("machine")
    # Stage 2: brew
    robot.press()
    robot.wait(1.0)
    # Stage 3: serve
    robot.pick()
    robot.place("tray")
    robot.home()
`,
    solution: `def serve(robot):
    for attempt in range(4):
        if robot.where() == "machine":
            break
        if robot.where() != "gripper":
            robot.pick()
        if robot.where() == "gripper":
            robot.place("machine")
    robot.press()
    robot.wait(1.0)
    for attempt in range(4):
        if robot.where() == "tray":
            break
        if robot.where() != "gripper":
            robot.pick()
        if robot.where() == "gripper":
            robot.place("tray")
    robot.home()
`,
    hint: 'Wrap each stage in <code>for attempt in range(4):</code>, <code>break</code> when <code>robot.where()</code> is the goal, otherwise pick (if not already holding) and place again.',
    tests: [['serve(robot) is defined', `assert callable(serve)`]],
  },
  {
    id: 'deploysmooth', course: 'deploy', title: 'Smooth transitions between skills', viz: 'blend', explain: 'minjerk',
    text: `<p>Watch the coffee robot: it stops dead at every waypoint, “above the cup”, “at the cup”, “above the machine”. Each stop costs time and each start is a jerk that sloshes coffee. Two standard fixes:</p>
<ul><li><b>Minimum-jerk motion</b> within a move: <code>s(τ) = 10τ³ − 15τ⁴ + 6τ⁵</code> for τ from 0 to 1, which starts and ends with zero velocity and zero acceleration (it is also how human reaching moves, per Flash & Hogan, 1985).</li>
<li><b>Blending</b> between moves: don’t stop exactly at an intermediate waypoint. Start curving toward the next one when you get within a blend radius. Industrial arm languages call it a blend radius or zone; the robot never fully stops until the final point.</li></ul>
<p>For learned policies the same problem shows up between <i>skills</i>: the last action of “pick” and the first of “place” can disagree. Action chunking with temporal ensembling, from the ACT paper, smooths this by averaging overlapping predictions.</p>
<p><b>Your task</b>: write <code>min_jerk(a, b, n)</code> (n points from a to b, 1D) and <code>via(points, n_per_seg, blend)</code>: a 1D path through the points where each segment is min-jerk, but the robot never waits at an interior waypoint: the next segment starts <code>blend</code> samples early, and during the overlap its displacement (<code>seg[k] − seg[0]</code>) is <b>added</b> to the motion still finishing. This is superposition blending; the corner gets slightly rounded. The lab plots velocity for stop-and-go vs yours.</p>`,
    starter: `def min_jerk(a, b, n):
    out = []
    for i in range(n):
        t = i / (n - 1)
        s = ...
        out.append(a + (b - a) * s)
    return out

def via(points, n_per_seg, blend):
    segs = [min_jerk(points[i], points[i + 1], n_per_seg) for i in range(len(points) - 1)]
    path = list(segs[0])
    for seg in segs[1:]:
        # start seg \`blend\` samples early: add its displacement to the tail of path
        ...
    return path
`,
    solution: `def min_jerk(a, b, n):
    out = []
    for i in range(n):
        t = i / (n - 1)
        s = 10 * t**3 - 15 * t**4 + 6 * t**5
        out.append(a + (b - a) * s)
    return out

def via(points, n_per_seg, blend):
    segs = [min_jerk(points[i], points[i + 1], n_per_seg) for i in range(len(points) - 1)]
    path = list(segs[0])
    for seg in segs[1:]:
        if blend > 0:
            tail = path[-blend:]
            mixed = [tail[k] + (seg[k] - seg[0]) for k in range(blend)]
            path = path[:-blend] + mixed + [p + tail[-1] - seg[0] for p in seg[blend:]]
        else:
            path += list(seg[1:])
    return path
`,
    hint: '<code>s = 10*t**3 - 15*t**4 + 6*t**5</code>. Overlap: <code>mixed = [tail[k] + (seg[k] - seg[0]) for k in range(blend)]</code>, then append the rest of seg shifted by <code>tail[-1] - seg[0]</code>.',
    tests: [
      ['min-jerk ends exactly and starts/ends slowly', `p = min_jerk(0.0, 1.0, 51)\nassert abs(p[0]) < 1e-12 and abs(p[-1] - 1) < 1e-12\nassert p[1] - p[0] < 0.002 and p[-1] - p[-2] < 0.002, "velocity should be ~0 at both ends"\nassert abs(p[25] - 0.5) < 1e-9, "symmetric: halfway at the middle"`],
      ['blending shortens the path and keeps the endpoints', `a = via([0.0, 1.0, 0.0], 40, 0)\nb = via([0.0, 1.0, 0.0], 40, 12)\nassert len(b) < len(a), "blending should save samples (time)"\nassert abs(b[0]) < 1e-9 and abs(b[-1]) < 1e-9`],
      ['no stop at the middle waypoint', `b = via([0.0, 1.0, 2.0], 40, 12)\nv = [abs(y - x) for x, y in zip(b, b[1:])]\nmid = v[len(v) // 3: 2 * len(v) // 3]\nassert min(mid) > 0.004, "the robot still comes to a stop between segments"`],
    ],
  },
  {
    id: 'deploydata', course: 'deploy', title: 'Curating failure and recovery data', viz: 'coffeedata',
    text: `<p>After a week, your coffee robot has logged hundreds of shifts. Before training on them, sort every episode. Each log is a list of events like <code>{"e": "pick", "ok": True}</code>, <code>{"e": "slip"}</code>, <code>{"e": "place", "spot": "tray", "ok": True}</code>, plus a final <code>served</code> flag.</p>
<ul><li><b>clean</b>: served, no slip. Keep it.</li><li><b>recovered</b>: served <i>after</i> at least one slip. Keep these: they are the only examples of regrasping. Many teams even upweight them.</li><li><b>failed</b>: not served. Don’t train a policy to imitate it, but keep it for failure detectors and reward models (that is what ViFailback is for).</li><li><b>bad</b>: an operator error or broken log, with no pick at all or an episode longer than 60 s. Drop it.</li></ul>
<p><b>Your task</b>: write <code>label(ep)</code> returning one of those four strings. The lab runs 24 real shifts in MuJoCo with mixed scripts, labels them with your function, and exports the sorted set as JSON.</p>`,
    starter: `def label(ep):
    events = ep["events"]
    picks = [e for e in events if e["e"] == "pick"]
    slips = [e for e in events if e["e"] == "slip"]
    ...
`,
    solution: `def label(ep):
    events = ep["events"]
    picks = [e for e in events if e["e"] == "pick"]
    slips = [e for e in events if e["e"] == "slip"]
    if not picks or ep["time"] > 60:
        return "bad"
    if not ep["served"]:
        return "failed"
    return "recovered" if slips else "clean"
`,
    hint: 'Check “bad” first, then “failed”, then decide between “recovered” and “clean” from the slips.',
    tests: [
      ['the four kinds', `E = lambda *k: [{"e": x} for x in k]\nassert label({"events": E("pick", "place"), "served": True, "time": 12}) == "clean"\nassert label({"events": E("pick", "slip", "pick", "place"), "served": True, "time": 18}) == "recovered"\nassert label({"events": E("pick", "slip", "place"), "served": False, "time": 14}) == "failed"\nassert label({"events": E("press"), "served": False, "time": 3}) == "bad"\nassert label({"events": E("pick", "place"), "served": True, "time": 75}) == "bad"`],
    ],
  },

  // ───────────────────────── Mobile robots ─────────────────────────
  {
    id: 'mobileintro', course: 'mobile', title: 'From cars to delivery robots', kind: 'quiz',
    text: `<p>Arms stay put; mobile robots must move themselves. <b>Locomotion</b> options trade simplicity for terrain: <b>wheels</b> (efficient, simple, need flat ground), <b>tracks</b> (rough ground, slip when turning), <b>legs</b> (stairs and rubble, hard to control), and <b>wheel-legs</b> in between. Sidewalk delivery robots are almost all wheeled.</p>
<p>Much of the software comes straight from <b>automotive</b> autonomy, organized as a stack:</p>
<ol><li><b>Perception</b>: lidar, cameras, radar, wheel encoders, IMU, GPS.</li><li><b>Localization</b>: where am I? Fuse odometry with GPS or a map (Kalman filters).</li><li><b>Mapping</b>: what is around me? Occupancy grids, HD maps.</li><li><b>Planning</b>: route (A* on a road graph) then local path.</li><li><b>Control</b>: follow the path (pure pursuit, Stanley, MPC) and hold speed (PID cruise control).</li></ol>
<p>The ${L('https://www.sae.org/standards/content/j3016_202104/', 'SAE J3016')} levels 0–5 describe how much of the driving the system does; a sidewalk robot that phones a remote operator when stuck is the same idea as a Level 4 robotaxi with remote assistance.</p>
<p><b>Do you need SLAM first?</b> No separate course: localization and mapping are the middle of this one. You’ll build the pieces in order (odometry, Kalman, mapping from lidar, then planning), because <b>SLAM</b> (simultaneous localization and mapping) is just doing the localization and mapping steps at the same time, each correcting the other. Full SLAM back-ends (pose graphs, loop closure, e.g. ${L('https://github.com/cartographer-project/cartographer', 'Cartographer')} or ${L('https://github.com/SteveMacenski/slam_toolbox', 'slam_toolbox')} in ROS 2) are a good next course once these feel natural.</p>`,
    quiz: [
      { q: 'Which layer of the stack answers “where am I?”', options: ['Planning', 'Localization', 'Control'], answer: 1 },
      { q: 'What does SLAM add over mapping with a known pose?', options: ['It estimates the robot’s pose and the map together', 'It replaces the planner', 'It only works outdoors'], answer: 0 },
      { q: 'A delivery robot must climb a curb to reach a door. Which locomotion choice helps most?', options: ['Smaller wheels', 'Legs or wheel-legs', 'A faster motor'], answer: 1 },
    ],
  },
  {
    id: 'diffdrive', course: 'mobile', title: 'Differential drive kinematics', explain: 'diffarc',
    text: `<p>Most indoor and sidewalk robots steer like a wheelchair: two driven wheels on one axle, a caster for balance. Spin both wheels forward and it drives straight; spin them differently and it turns.</p>
<p>With wheel radius <code>r</code>, track width <code>T</code> (distance between wheels) and wheel speeds ω<sub>L</sub>, ω<sub>R</sub> in rad/s:</p>
<p><code>v = r(ω_R + ω_L)/2</code> and <code>ω = r(ω_R − ω_L)/T</code>.</p>
<p>The controller needs the inverse: given the forward speed v and turn rate ω you want, compute the wheel speeds. Then <b>odometry</b> integrates v and ω over time to track the pose (x, y, θ).</p>
<p><b>Your task</b>: write <code>wheel_speeds(v, w, r, T)</code> → (ω_L, ω_R) and <code>integrate(pose, v, w, dt)</code> → new (x, y, θ). The delivery robot in this course uses r = 0.035 m and T = 0.13 m.</p>`,
    pre: 'import math\n',
    starter: `def wheel_speeds(v, w, r, T):
    wl = ...
    wr = ...
    return wl, wr

def integrate(pose, v, w, dt):
    x, y, th = pose
    return (x + ..., y + ..., th + w * dt)
`,
    solution: `def wheel_speeds(v, w, r, T):
    wl = (v - w * T / 2) / r
    wr = (v + w * T / 2) / r
    return wl, wr

def integrate(pose, v, w, dt):
    x, y, th = pose
    return (x + v * math.cos(th) * dt, y + v * math.sin(th) * dt, th + w * dt)
`,
    hint: 'Each wheel moves at <code>v ± ω·T/2</code> along the ground; divide by r for rad/s.',
    tests: [
      ['straight: both wheels equal', `wl, wr = wheel_speeds(0.3, 0, 0.04, 0.17)\nassert abs(wl - 7.5) < 1e-9 and abs(wr - 7.5) < 1e-9`],
      ['turn in place: opposite wheels', `wl, wr = wheel_speeds(0, 1.0, 0.04, 0.17)\nassert abs(wl + wr) < 1e-9 and wr > 0, "spinning left: right wheel forward, left backward"`],
      ['a full circle brings you home', `p = (0.0, 0.0, 0.0)\nfor _ in range(2000):\n    p = integrate(p, 0.2, 0.5, 2 * math.pi / 0.5 / 2000)\nassert math.hypot(p[0], p[1]) < 0.01, "after one full turn you should be back at the start"`],
    ],
  },
  {
    id: 'bicycle', course: 'mobile', title: 'How cars steer: the bicycle model', explain: 'bicycle',
    text: `<p>Cars cannot turn in place. They use <b>Ackermann steering</b>: the front wheels turn, at slightly different angles so both roll around the same centre. For planning and control, automotive engineers collapse the four wheels into one front and one rear wheel on the centreline: the <b>kinematic bicycle model</b>.</p>
<p>With wheelbase L, steering angle δ and speed v (rear-axle reference):</p>
<p><code>ẋ = v cos θ</code>, <code>ẏ = v sin θ</code>, <code>θ̇ = v tan δ / L</code>, so the turning radius is <b>R = L / tan δ</b>.</p>
<p>This is why parallel parking takes several moves, why trucks swing wide, and why a car’s path planner must respect a minimum turning radius (planners like Reeds–Shepp and Hybrid A* build that in). Pure pursuit, the controller you’ll use for delivery, was designed for exactly this model.</p>
<p><b>Your task</b>: <code>steer_for_radius(L, R)</code>, <code>min_radius(L, max_steer_deg)</code> and <code>bicycle_step(state, v, delta, L, dt)</code>.</p>`,
    pre: 'import math\n',
    starter: `def steer_for_radius(L, R):
    ...

def min_radius(L, max_steer_deg):
    ...

def bicycle_step(state, v, delta, L, dt):
    x, y, th = state
    ...
`,
    solution: `def steer_for_radius(L, R):
    return math.atan(L / R)

def min_radius(L, max_steer_deg):
    return L / math.tan(math.radians(max_steer_deg))

def bicycle_step(state, v, delta, L, dt):
    x, y, th = state
    return (x + v * math.cos(th) * dt, y + v * math.sin(th) * dt, th + v * math.tan(delta) / L * dt)
`,
    hint: '<code>R = L / tan δ</code>, so <code>δ = atan(L / R)</code>.',
    tests: [
      ['a 2.7 m wheelbase car at 35° steering turns on ~3.9 m radius', `assert abs(min_radius(2.7, 35) - 3.856) < 0.01, min_radius(2.7, 35)`],
      ['steering for a radius is the inverse', `assert abs(min_radius(2.7, math.degrees(steer_for_radius(2.7, 10))) - 10) < 1e-9`],
      ['driving the circumference closes the circle', `L, R = 2.7, 8.0\nd = steer_for_radius(L, R); s = (0.0, 0.0, 0.0); n = 4000\nfor _ in range(n):\n    s = bicycle_step(s, 2.0, d, L, 2 * math.pi * R / 2.0 / n)\nassert math.hypot(s[0], s[1]) < 0.05, "should end where it started"`],
    ],
  },
  {
    id: 'kalman', course: 'mobile', title: 'Odometry drifts, GPS jumps: the Kalman filter', viz: 'kalman', explain: 'kalmanviz',
    text: `<p>Wheel odometry is smooth but drifts: a wheel slips, the radius is a bit off, and errors add up forever. GPS (or any absolute fix) never drifts but is noisy, jumping ±1–3 m. Cars fuse both, and the classic tool is the <b>Kalman filter</b>.</p>
<p>In 1D (position along a street), keep an estimate x and its variance P. Each step:</p>
<ol><li><b>Predict</b> with odometry: <code>x = x + u</code>, <code>P = P + Q</code> (uncertainty grows by the odometry noise Q).</li><li><b>Update</b> with a measurement z of noise variance R: gain <code>K = P/(P+R)</code>, then <code>x = x + K(z − x)</code>, <code>P = (1 − K)P</code>.</li></ol>
<p>K is a trust dial: when P is large (unsure), trust the GPS; when R is large (bad GPS), trust the prediction. Self-driving cars run the same idea in many dimensions (the extended or unscented Kalman filter).</p>
<p><b>Your task</b>: write <code>kalman(us, zs, Q, R)</code> returning the list of estimates. The tests simulate a robot driving with a slipping wheel and a noisy GPS: your filter must beat both sensors.</p>`,
    pre: `import random
def _drive(seed=3, n=200):
    rng = random.Random(seed)
    truth, odo, gps, us = [0.0], [0.0], [], []
    for t in range(n):
        step = 0.1
        truth.append(truth[-1] + step)
        u = step * 1.06 + rng.gauss(0, 0.01)   # slipping wheel: reads 6% long
        us.append(u); odo.append(odo[-1] + u)
        gps.append(truth[-1] + rng.gauss(0, 1.0))
    return truth[1:], odo[1:], gps, us
`,
    starter: `def kalman(us, zs, Q, R):
    x, P = 0.0, 1.0
    out = []
    for u, z in zip(us, zs):
        # predict
        ...
        # update
        ...
        out.append(x)
    return out
`,
    solution: `def kalman(us, zs, Q, R):
    x, P = 0.0, 1.0
    out = []
    for u, z in zip(us, zs):
        x = x + u
        P = P + Q
        K = P / (P + R)
        x = x + K * (z - x)
        P = (1 - K) * P
        out.append(x)
    return out
`,
    hint: 'Predict: <code>x += u; P += Q</code>. Update: <code>K = P/(P+R); x += K*(z-x); P *= (1-K)</code>.',
    tests: [
      ['beats odometry and GPS alone', `truth, odo, gps, us = _drive()\nest = kalman(us, gps, 0.01, 1.0)\nrmse = lambda a: (sum((x - y)**2 for x, y in zip(a, truth)) / len(a)) ** 0.5\nassert rmse(est) < rmse(gps) and rmse(est) < rmse(odo), "rmse est %.2f, gps %.2f, odo %.2f" % (rmse(est), rmse(gps), rmse(odo))`],
      ['huge GPS noise → trust odometry', `est = kalman([1, 1, 1], [100, 100, 100], 0.01, 1e9)\nassert abs(est[-1] - 3) < 0.01`],
    ],
  },
  {
    id: 'lidarmap', course: 'mobile', title: 'Mapping with lidar: occupancy grids', viz: 'lidarmap',
    text: `<p>A lidar spins a laser and returns the distance to the nearest surface in each direction. To build a map, chop the world into cells and keep, for each, the <b>log-odds</b> that it is occupied (log of p/(1−p); 0 means “no idea”).</p>
<p>For each beam: the cell where it <b>ends</b> is evidence of a wall, so add <code>L_OCC</code>; every cell it <b>passes through</b> is evidence of free space, so add <code>L_FREE</code> (negative). Clamp to ±5 so the map can still change if something moves. Log-odds turn Bayes’ rule into addition, which is why every occupancy-grid mapper (and SLAM system) uses them.</p>
<p><b>Your task</b>: write <code>update(grid, free_cells, hit_cells)</code> (grid is a list of lists of log-odds, cells are (row, col)) and <code>occupied(l)</code>. The lab drives the MuJoCo delivery robot through the city, casts 72 real MuJoCo rays per scan, and builds the map with your function. Pose here comes from the simulator; in SLAM it would be estimated at the same time.</p>`,
    pre: 'L_OCC, L_FREE, CLAMP = 0.85, -0.4, 5.0\n',
    starter: `def update(grid, free_cells, hit_cells):
    for (r, c) in free_cells:
        ...
    for (r, c) in hit_cells:
        ...
    return grid

def occupied(l):
    ...
`,
    solution: `def update(grid, free_cells, hit_cells):
    for (r, c) in free_cells:
        grid[r][c] = max(-CLAMP, grid[r][c] + L_FREE)
    for (r, c) in hit_cells:
        grid[r][c] = min(CLAMP, grid[r][c] + L_OCC)
    return grid

def occupied(l):
    return l > 0
`,
    hint: 'Add <code>L_FREE</code> or <code>L_OCC</code> and clamp with <code>max(-CLAMP, …)</code> / <code>min(CLAMP, …)</code>.',
    tests: [
      ['repeated hits saturate at the clamp', `g = [[0.0]]\nfor _ in range(20): update(g, [], [(0, 0)])\nassert abs(g[0][0] - 5.0) < 1e-9 and occupied(g[0][0])`],
      ['a free beam clears a cell', `g = [[0.0, 0.0]]\nupdate(g, [(0, 0)], [(0, 1)])\nassert not occupied(g[0][0]) and occupied(g[0][1])`],
    ],
  },
  {
    id: 'astar', course: 'mobile', title: 'Route planning with A*', viz: 'astar',
    text: `<p>With a map, plan a route. <b>A*</b> searches the grid outward from the start, always expanding the cell with the lowest <code>f = g + h</code>: <code>g</code> is the cost so far, <code>h</code> a guess of the remaining cost. If h never overestimates (straight-line or Manhattan distance on a 4-connected grid), A* returns a shortest path. Car navigation runs the same algorithm, or descendants like contraction hierarchies, on road graphs.</p>
<p><b>Your task</b>: finish <code>astar(grid, start, goal)</code> on a 4-connected grid (1 = blocked). Return the list of cells from start to goal, or <code>None</code>. The lab plans the delivery routes on the city map.</p>`,
    pre: 'import heapq\n',
    starter: `def astar(grid, start, goal):
    H, W = len(grid), len(grid[0])
    h = lambda p: abs(p[0] - goal[0]) + abs(p[1] - goal[1])
    open_ = [(h(start), 0, start)]
    came, g = {start: None}, {start: 0}
    while open_:
        f, cost, cur = heapq.heappop(open_)
        if cur == goal:
            path = []
            while cur is not None:
                path.append(cur)
                cur = came[cur]
            return path[::-1]
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb = (cur[0] + dr, cur[1] + dc)
            if not (0 <= nb[0] < H and 0 <= nb[1] < W) or grid[nb[0]][nb[1]]:
                continue
            ...
    return None
`,
    solution: `def astar(grid, start, goal):
    H, W = len(grid), len(grid[0])
    h = lambda p: abs(p[0] - goal[0]) + abs(p[1] - goal[1])
    open_ = [(h(start), 0, start)]
    came, g = {start: None}, {start: 0}
    while open_:
        f, cost, cur = heapq.heappop(open_)
        if cur == goal:
            path = []
            while cur is not None:
                path.append(cur)
                cur = came[cur]
            return path[::-1]
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb = (cur[0] + dr, cur[1] + dc)
            if not (0 <= nb[0] < H and 0 <= nb[1] < W) or grid[nb[0]][nb[1]]:
                continue
            ng = cost + 1
            if ng < g.get(nb, 1e18):
                g[nb] = ng
                came[nb] = cur
                heapq.heappush(open_, (ng + h(nb), ng, nb))
    return None
`,
    hint: 'For each neighbour: <code>ng = cost + 1</code>; if it beats <code>g.get(nb, inf)</code>, record <code>g[nb]</code>, <code>came[nb] = cur</code> and push <code>(ng + h(nb), ng, nb)</code>.',
    tests: [
      ['finds the shortest way around a wall', `G = [[0,0,0,0],[1,1,1,0],[0,0,0,0]]\np = astar(G, (0, 0), (2, 0))\nassert p and p[0] == (0, 0) and p[-1] == (2, 0) and len(p) == 9, p`],
      ['returns None when walled in', `assert astar([[0,1,0]], (0, 0), (0, 2)) is None`],
    ],
  },
  {
    id: 'delivery', course: 'mobile', title: '🛵 Capstone: deliver the food', viz: 'delivery', explain: 'lookahead',
    text: `<p>Three orders are ready at the restaurant (orange). Deliver to customers A, B and C (green) in the MuJoCo city, then you’re done. Your A* from the last lesson plans the route (it is pre-loaded); you write the <b>controller</b> that follows it.</p>
<p><b>Pure pursuit</b> (Coulter, CMU, 1992) is the classic path follower from autonomous cars: pick the point on the path one <b>lookahead distance</b> ahead of you, and steer along the circular arc that passes through it. In the robot’s frame, with that point at lateral offset <code>y_r</code> and distance <code>ℓ</code>, the arc’s curvature is <code>κ = 2·y_r / ℓ²</code>, so <code>ω = v·κ</code>. Short lookahead: tight tracking but wobbly; long: smooth but cuts corners into buildings.</p>
<p>Pure pursuit was built for cars, which can’t turn in place. A differential-drive robot can, and should when the target is beside or behind it (at the start of a leg, or at a T-junction). Otherwise it arcs wide into a building.</p>
<p><b>Your task</b>: write <code>pursue(pose, path, lookahead)</code> → (v, ω). <code>pose</code> is (x, y, θ) and <code>path</code> a list of (x, y) points in metres. Find the first path point at least <code>lookahead</code> away, at or after the closest point, and transform it into the robot frame (x<sub>r</sub>, y<sub>r</sub>). If <code>x_r &lt; 0.7·ℓ</code> (target more than ~45° off the nose), turn in place: v = 0, ω = 1.5·sign(y<sub>r</sub>). Otherwise v = 0.4 m/s (0.2 when |κ| ≥ 3) and ω = v·κ. The lab converts (v, ω) to wheel speeds and drives real wheel contacts with your <code>LOOKAHEAD</code>. Pass: all 3 delivered, no more than 3 bumps into buildings. Then try LOOKAHEAD = 0.2 and 1.0 and watch what breaks.</p>`,
    pre: `import math, heapq
${'' /* A* from the previous lesson, provided */}def astar(grid, start, goal):
    H, W = len(grid), len(grid[0])
    h = lambda p: abs(p[0] - goal[0]) + abs(p[1] - goal[1])
    open_ = [(h(start), 0, start)]; came, g = {start: None}, {start: 0}
    while open_:
        f, cost, cur = heapq.heappop(open_)
        if cur == goal:
            path = []
            while cur is not None: path.append(cur); cur = came[cur]
            return path[::-1]
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb = (cur[0] + dr, cur[1] + dc)
            if not (0 <= nb[0] < H and 0 <= nb[1] < W) or grid[nb[0]][nb[1]]: continue
            ng = cost + 1
            if ng < g.get(nb, 1e18): g[nb] = ng; came[nb] = cur; heapq.heappush(open_, (ng + h(nb), ng, nb))
    return None
`,
    starter: `LOOKAHEAD = 0.4   # metres: try 0.2 and 1.0 too

def pursue(pose, path, lookahead):
    x, y, th = pose
    # 1. closest path index
    i0 = min(range(len(path)), key=lambda i: (path[i][0] - x) ** 2 + (path[i][1] - y) ** 2)
    # 2. first point at least \`lookahead\` away, after i0 (or the last point)
    goal = path[-1]
    for px, py in path[i0:]:
        if math.hypot(px - x, py - y) >= lookahead:
            goal = (px, py)
            break
    # 3. goal in the robot frame
    dx, dy = goal[0] - x, goal[1] - y
    xr = ...
    yr = ...
    l2 = max(1e-6, xr * xr + yr * yr)
    if xr < 0.7 * math.sqrt(l2):
        return 0.0, ...   # turn in place toward the target
    kappa = ...
    v = ...
    return v, v * kappa
`,
    solution: `LOOKAHEAD = 0.4

def pursue(pose, path, lookahead):
    x, y, th = pose
    i0 = min(range(len(path)), key=lambda i: (path[i][0] - x) ** 2 + (path[i][1] - y) ** 2)
    goal = path[-1]
    for px, py in path[i0:]:
        if math.hypot(px - x, py - y) >= lookahead:
            goal = (px, py)
            break
    dx, dy = goal[0] - x, goal[1] - y
    xr = math.cos(th) * dx + math.sin(th) * dy
    yr = -math.sin(th) * dx + math.cos(th) * dy
    l2 = max(1e-6, xr * xr + yr * yr)
    if xr < 0.7 * math.sqrt(l2):
        return 0.0, 1.5 if yr >= 0 else -1.5
    kappa = 2 * yr / l2
    v = 0.4 if abs(kappa) < 3 else 0.2
    return v, v * kappa
`,
    hint: 'Rotate by −θ: <code>xr = cos θ·dx + sin θ·dy</code>, <code>yr = −sin θ·dx + cos θ·dy</code>. Turn in place with <code>1.5 if yr >= 0 else -1.5</code>. Then <code>kappa = 2*yr/l2</code>.',
    tests: [
      ['goal straight ahead → no turning', `v, w = pursue((0, 0, 0), [(0, 0), (1, 0), (2, 0)], 0.5)\nassert v > 0 and abs(w) < 1e-9`],
      ['goal to the left → turn left (ω > 0)', `v, w = pursue((0, 0, 0), [(0, 0), (0.5, 0.15), (0.9, 0.35)], 0.4)\nassert v > 0 and w > 0`],
      ['target behind → turn in place', `v, w = pursue((0, 0, 0), [(0, 0), (-1, 0.1), (-2, 0.2)], 0.5)\nassert v == 0 and abs(w) > 0, "stop and rotate when the target is behind you"`],
      ['works when facing north too', `v, w = pursue((0, 0, math.pi / 2), [(0, 0), (0, 1), (0, 2)], 0.5)\nassert abs(w) < 1e-6, "path straight ahead when facing +y"`],
    ],
  },

  // ───────────────────────── hardware stations ─────────────────────────
  {
    id: 'leaderteleop', course: 'hardware', title: 'Teleop with your real leader arm', kind: 'quiz',
    text: `<p>Got an SO-101 <b>leader</b> arm? Open the <b>Leader Arm</b> station (dock, 🦾) in Chrome or Edge on a laptop, plug the leader’s controller board into USB, and press <i>Connect</i>. The page talks to the servos directly through the browser’s ${L('https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API', 'Web Serial API')}: no Python, no drivers on Linux and macOS.</p>
<p>What it does, the same way LeRobot does:</p>
<ul><li>Opens the bus at <b>1,000,000 baud</b> and turns <b>torque off</b> on all six motors, so you can move the leader by hand.</li><li>About 30 times a second, sends each motor a READ of register <b>56, Present_Position</b> (2 bytes, 0–4095 for one turn): packet <code>FF FF id 04 02 38 02 checksum</code>.</li><li>Converts to degrees around the middle of your calibrated range (LeRobot’s <code>use_degrees</code> mode) and the gripper to 0–100%, then commands the simulated follower.</li></ul>
<p>Load the calibration file <code>lerobot-calibrate</code> saved (under <code>~/.cache/huggingface/lerobot/calibration/teleoperators/so101_leader/</code>) so the sim matches your arm’s ranges. If a joint turns the wrong way, tick its <i>flip</i> box. Record episodes and download them as JSON (actions and follower state at 30 Hz). Close <code>lerobot-teleoperate</code> first: only one program can own the serial port.</p>`,
    quiz: [
      { q: 'Why does the page turn torque off on the leader arm?', options: ['To save battery', 'So you can move it by hand: the leader is an input device', 'Because Web Serial requires it'], answer: 1 },
      { q: 'The Connect button says the port is busy. Most likely cause?', options: ['Wrong baud rate', 'lerobot-teleoperate (or another program) still has the port open', 'The calibration file is missing'], answer: 1 },
      { q: 'Your sim elbow bends up when the real one bends down. Fix?', options: ['Recalibrate the motor IDs', 'Tick that joint’s flip box (or fix the sign in the mapping)', 'Lower the frame rate'], answer: 1 },
    ],
  },
  {
    id: 'dexgrasp', course: 'data', title: 'Dexterous hands and grasp taxonomies', kind: 'quiz',
    text: `<p>Parallel grippers pinch; human hands have about 20 degrees of freedom and dozens of distinct grasps. To talk about (and label) hand data, robotics uses <b>grasp taxonomies</b>. The most cited is the ${L('https://grasp.xief.net', 'GRASP taxonomy')} of Feix et al. (IEEE Transactions on Human-Machine Systems, 2016), which merges 22 earlier taxonomies into <b>33 grasp types</b>. It arranges them by <b>power vs intermediate vs precision</b>, by <b>opposition type</b> (palm, pad or side), by which fingers act together as <b>virtual fingers</b>, and by whether the thumb is <b>abducted or adducted</b>.</p>
<p>Open the <b>Hand Cam</b> station (🖐). MediaPipe Hand Landmarker tracks 21 points on your hand from the webcam, locally in the browser. They are retargeted to MuJoCo Menagerie’s 16-joint <b>LEAP Hand</b>, and a nearest-prototype classifier labels your grasp with its top-3 Feix types. Try holding a pen (Writing Tripod), a mug (Medium Wrap) and a key (Lateral).</p>
<p>Be critical of the detector: it sees only hand shape. Many Feix types differ mainly by the object (Large vs Small Diameter), so it confuses neighbours. That is a real limitation of camera-only hand labeling, and why egocentric-video pipelines add object detection and contact estimation.</p>`,
    quiz: [
      { q: 'How many grasp types does the Feix GRASP taxonomy define?', options: ['16', '33', '45'], answer: 1 },
      { q: 'The detector says “Large Diameter” while you hold a thin broom handle. Why might that happen?', options: ['The webcam is low resolution', 'Large and Small Diameter differ mostly by object size, which hand shape alone barely shows', 'The LEAP Hand has only 4 fingers'], answer: 1 },
      { q: 'What does retargeting do?', options: ['Maps human hand joint angles onto a robot hand with different kinematics', 'Re-trains the hand tracker', 'Changes camera intrinsics'], answer: 0 },
    ],
  },
];
