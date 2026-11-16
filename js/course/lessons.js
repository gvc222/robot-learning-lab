import { MORE } from './lessons2.js';
import { MORE3, COURSES3 } from './lessons3.js';
import { CONTROL_INTRO, CONTROL_MORE } from './lessons4.js';
import { MORE5, COURSES5 } from './lessons5.js';
import { MORE6 } from './lessons6.js';
import { MORE7, COURSES7 } from './lessons7.js';
import { MORE8 } from './lessons8.js';
import { MORE9, COURSES9 } from './lessons9.js';
// Academy curriculum. Each lesson: explanation, starter code, a reference solution, and tests.
// Python lessons run in Pyodide (CPython compiled to WebAssembly); tests are plain asserts.
// `pre` runs before the learner's code. `viz` names a visualisation in apps/academy.js.

export const COURSES = [
  { id: 'basics', title: 'Robot basics & control', blurb: 'Real robots, joint angles, kinematics, then control loops from P to a whole arm.' },
  { id: 'sim', title: 'Simulation & sim-to-real', blurb: 'Build MuJoCo worlds, script a pick, survive the reality gap.' },
  ...COURSES7,
  { id: 'rl', title: 'Reinforcement learning', blurb: 'Rewards, Q-learning, random search and reward models.' },
  { id: 'data', title: 'Data, language & human video', blurb: 'Subtasks, captions, egocentric pretraining, eval statistics, LeRobot export.' },
  { id: 'hardware', title: 'Build an SO-101', blurb: 'From a box of parts to a calibrated arm with cameras.' },
  ...COURSES3,
  ...COURSES5,
  ...COURSES9,
  { id: 'corl', title: '🧪 Sandbox: CoRL 2026 Review Club', blurb: 'Exploratory: the award finalists and other landmark papers, reviewed hands-on.' },
];
const UNIT_COURSE = { 1: 'basics', 2: 'sim', 3: 'rl' };

const PY_ARM = 'import math\nL1 = 0.116   # SO-101 upper arm (m), measured from its MuJoCo model\nL2 = 0.135   # SO-101 forearm\nLINKS = [0.116, 0.135, 0.0637]   # all three planar links of the SO-101: upper arm, forearm, wrist→gripper\n';

export const LESSONS = [
  {
    id: 'state', unit: 1, course: 'basics', title: 'Describe a robot with numbers', explain: 'robot3d',
    text: `<p>A robot arm is a chain of <b>links</b> connected by <b>joints</b>. If you know the angle of every joint, you know exactly where the whole arm is. That list of numbers is called the <b>joint state</b> (or <i>configuration</i>).</p>
<p>Above is a real, widely used arm: the open-source <b>SO-101</b> from LeRobot, loaded from its MuJoCo model. Drag the sliders: each one is a joint, and the list underneath is the robot’s joint state, in <b>radians</b>. It has 6 numbers: shoulder pan, shoulder lift, elbow flex, wrist flex, wrist roll and the gripper. Switch to <b>YAM</b> (a larger research arm) to compare, or load your own robot’s URDF or MJCF (select the file together with its mesh files).</p>
<p>Why not a made-up “dummy” arm? Simple toy arms are handy for deriving formulas (we use a two-link one in the next lessons), but the numbers you learn here should match a robot you can actually buy, build and download data for. So the lessons use the SO-101’s real link lengths.</p>
<p><b>Your task</b></p><ol><li>Make a list called <code>joint_angles</code> with one number per SO-101 joint (6), for example copied from the widget.</li><li>Set <code>gripper_open</code> to <code>True</code>.</li><li>Set <code>num_joints</code> using <code>len(...)</code>, not by typing 6.</li></ol>`,
    starter: `# The SO-101's state: one angle per joint, in radians\n# shoulder_pan, shoulder_lift, elbow_flex, wrist_flex, wrist_roll, gripper\njoint_angles = [0.0, -0.5, ...]\n\ngripper_open = ...\n\nnum_joints = ...\n\nprint("joints:", joint_angles)\n`,
    solution: `joint_angles = [0.0, -0.5, 0.8, 0.3, 0.0, 0.2]\ngripper_open = True\nnum_joints = len(joint_angles)\nprint("joints:", joint_angles)\n`,
    hint: 'Replace every <code>...</code>. A list looks like <code>[0.0, 0.5, 1.2, 1.4]</code>.',
    tests: [
      ['joint_angles is a list of 6 numbers', `assert isinstance(joint_angles, list), "joint_angles should be a list"\nassert len(joint_angles) == 6, "the SO-101 has 6 joints (5 + gripper), you gave %d" % len(joint_angles)\nassert all(isinstance(q, (int, float)) for q in joint_angles), "every angle must be a number"`],
      ['gripper_open is True', `assert gripper_open is True`],
      ['num_joints is computed with len()', `assert num_joints == len(joint_angles) == 6`],
    ],
  },
  {
    id: 'radians', unit: 1, course: 'basics', title: 'Degrees to radians', explain: 'unitcircle',
    text: `<p>Humans think in degrees; robot software thinks in radians. A full turn is 360° = 2π radians, so</p><p class="mono">radians = degrees × π / 180</p>
<p><b>Your task</b>: finish <code>deg_to_rad</code>, then use it to set <code>elbow</code> to 45 degrees.</p>`,
    pre: 'import math\n',
    starter: `import math\n\ndef deg_to_rad(deg):\n    return ...\n\nelbow = ...   # 45 degrees, in radians\nprint(elbow)\n`,
    solution: `import math\n\ndef deg_to_rad(deg):\n    return deg * math.pi / 180\n\nelbow = deg_to_rad(45)\nprint(elbow)\n`,
    hint: '<code>math.pi</code> is π. Then <code>elbow = deg_to_rad(45)</code>.',
    tests: [
      ['deg_to_rad(180) is π', `assert abs(deg_to_rad(180) - math.pi) < 1e-9, "got %r" % (deg_to_rad(180),)`],
      ['deg_to_rad(90) is π/2 and deg_to_rad(0) is 0', `assert abs(deg_to_rad(90) - math.pi/2) < 1e-9\nassert deg_to_rad(0) == 0`],
      ['elbow is 45° in radians', `assert abs(elbow - math.pi/4) < 1e-9, "elbow should be about 0.785, got %r" % (elbow,)`],
    ],
  },
  {
    id: 'fk', unit: 1, course: 'basics', title: 'Forward kinematics', viz: 'fk', explain: 'armfk',
    text: `<p><b>Forward kinematics</b> answers: <i>given the joint angles, where is the hand?</i></p>
<p>Look at the SO-101 from the side: shoulder lift, elbow flex and wrist flex all bend in the same vertical plane, so in that plane it is a <b>planar arm with 3 links</b> (upper arm, forearm, wrist to gripper). In the widget, move θ₁, θ₂, θ₃ and watch the formula update; switch to YAM, or build a custom arm and add links.</p>
<p>Start with two links of lengths <code>L1</code> and <code>L2</code>. The first points at angle θ₁. The second is attached to its tip and bends a further θ₂, so it points at θ₁ + θ₂. Add them tip to tail:</p>
<p class="mono">x = L1·cos(θ₁) + L2·cos(θ₁ + θ₂)<br>y = L1·sin(θ₁) + L2·sin(θ₁ + θ₂)</p>
<p>A third link just adds a third term, pointing at θ₁ + θ₂ + θ₃. Writing a new line for each link doesn’t scale, so the general recipe is a <b>loop</b>: keep a running <code>angle</code> (the sum of the θ’s so far) and a running tip position, and for each link add its angle, then step along it.</p>
<p class="mono">angle += θᵢ<br>x += Lᵢ·cos(angle)<br>y += Lᵢ·sin(angle)</p>
<p><b>Your task</b>: finish <code>fk(thetas)</code> so it works for <i>any</i> number of links. <code>LINKS</code> (the SO-101’s three lengths) and <code>math</code> are already defined. The picture on the right draws the true arm in grey and <span style="color:var(--accent)">your answer as an orange dot</span>: it should ride on the tip of the last link.</p>`,
    pre: PY_ARM,
    starter: `def fk(thetas, links=LINKS):\n    x, y, angle = 0.0, 0.0, 0.0\n    for theta, length in zip(thetas, links):\n        angle += ...          # each joint adds to the direction\n        x += ...\n        y += ...\n    return x, y\n\nprint(fk([0, 0, 0]))\n`,
    solution: `def fk(thetas, links=LINKS):\n    x, y, angle = 0.0, 0.0, 0.0\n    for theta, length in zip(thetas, links):\n        angle += theta\n        x += length * math.cos(angle)\n        y += length * math.sin(angle)\n    return x, y\n\nprint(fk([0, 0, 0]))\n`,
    hint: 'Inside the loop: <code>angle += theta</code>, then <code>x += length * math.cos(angle)</code> and the same with <code>math.sin</code> for y. Don’t reset <code>angle</code> inside the loop.',
    tests: [
      ['arm straight out: fk([0,0,0]) = (0.3147, 0)', `x, y = fk([0, 0, 0])\nassert abs(x - 0.3147) < 1e-6 and abs(y) < 1e-6, "got (%.4f, %.4f)" % (x, y)`],
      ['arm straight up: fk([π/2,0,0]) = (0, 0.3147)', `x, y = fk([math.pi/2, 0, 0])\nassert abs(x) < 1e-6 and abs(y - 0.3147) < 1e-6, "got (%.4f, %.4f)" % (x, y)`],
      ['elbow bent 90°: fk([0,π/2,0]) = (0.116, 0.1987)', `x, y = fk([0, math.pi/2, 0])\nassert abs(x - 0.116) < 1e-6 and abs(y - 0.1987) < 1e-6, "got (%.4f, %.4f)" % (x, y)`],
      ['works for any links: three unit links bent 0, 90°, 90° end at (0, 1)', `x, y = fk([0, math.pi/2, math.pi/2], [1, 1, 1])\nassert abs(x) < 1e-6 and abs(y - 1) < 1e-6, "got (%.3f, %.3f). Is angle a running sum?" % (x, y)`],
      ['and for two links too', `x, y = fk([0.5, -0.5], [1, 2])\nassert abs(x - (math.cos(0.5) + 2)) < 1e-6 and abs(y - math.sin(0.5)) < 1e-6, "got (%.3f, %.3f)" % (x, y)`],
    ],
  },
  {
    id: 'ik', unit: 1, course: 'basics', title: 'Inverse kinematics', viz: 'ik', explain: 'armik',
    text: `<p><b>Inverse kinematics</b> is the question you actually care about: <i>I want the hand at (x, y). What joint angles get it there?</i></p>
<p>For two links there is a closed-form answer from the law of cosines. (With a third link, like the SO-101’s wrist, there are infinitely many answers, since the wrist can tilt freely. The usual trick is to choose the wrist angle yourself, move the target back by the last link, and solve the remaining two links as below.)</p>
<p class="mono">cos(θ₂) = (x² + y² − L1² − L2²) / (2·L1·L2)<br>θ₁ = atan2(y, x) − atan2(L2·sin(θ₂), L1 + L2·cos(θ₂))</p>
<p>Drag the target in the widget first: notice the two solutions (elbow down and elbow up, the ± of the arccos) and the ring of reachable points. This is exactly how the lab’s arm turns your keyboard’s “move left” into joint commands.</p>
<div class="card" style="margin:8px 0"><b>Already defined for you</b>: <code>math</code> (imported), <code>L1 = 0.116</code> and <code>L2 = 0.135</code> (link lengths in metres). <b>You write</b> a function named <code>ik(x, y)</code> that takes the target in metres and returns the two angles <code>(theta1, theta2)</code> in radians. The names <code>c2</code>, <code>theta1</code>, <code>theta2</code> inside it are just your own working variables.</div>
<p><b>Your task</b>: fill in the two missing lines. Then <b>click anywhere in the picture</b>: the arm uses <i>your</i> function to reach for the click.</p>`,
    pre: PY_ARM,
    starter: `def ik(x, y):\n    c2 = ...                      # cos(theta2), from the formula\n    theta2 = math.acos(c2)\n    theta1 = math.atan2(y, x) - ...\n    return theta1, theta2\n\nprint(ik(0.15, 0.1))\n`,
    solution: `def ik(x, y):\n    c2 = (x*x + y*y - L1**2 - L2**2) / (2 * L1 * L2)\n    theta2 = math.acos(c2)\n    theta1 = math.atan2(y, x) - math.atan2(L2 * math.sin(theta2), L1 + L2 * math.cos(theta2))\n    return theta1, theta2\n\nprint(ik(0.15, 0.1))\n`,
    hint: 'Squares in Python: <code>x*x</code> or <code>L1**2</code>. The second term of θ₁ is <code>math.atan2(L2 * math.sin(theta2), L1 + L2 * math.cos(theta2))</code>.',
    tests: [
      ['ik returns two angles', `t = ik(0.15, 0.1)\nassert len(t) == 2`],
      ['plugging ik into forward kinematics lands on the target', `def _fk(a, b):\n    return L1*math.cos(a)+L2*math.cos(a+b), L1*math.sin(a)+L2*math.sin(a+b)\nfor (tx, ty) in [(0.15, 0.1), (0.05, 0.18), (-0.1, 0.15), (0.2, -0.05)]:\n    x, y = _fk(*ik(tx, ty))\n    assert abs(x-tx) < 1e-6 and abs(y-ty) < 1e-6, "asked for (%.2f, %.2f) but the arm went to (%.2f, %.2f)" % (tx, ty, x, y)`],
    ],
  },
  ...CONTROL_INTRO,
  {
    id: 'pcontrol', unit: 1, course: 'basics', title: 'P control: one joint', viz: 'pcontrol', explain: 'presp', knobs: [{ name: 'KP', min: 0, max: 60, step: 0.5 }],
    text: `<p>Knowing the angle you want is not the same as being there. A <b>controller</b> runs many times per second: measure where the joint is, compare with where it should be, push accordingly.</p>
<p>The simplest one is <b>proportional (P) control</b>: push in proportion to the error.</p><p class="mono">command = kp × (target − current)</p>
<p><b>Two spellings, on purpose</b>: lowercase <code>kp</code> is the <i>parameter</i> inside your function (a local name; the function works for any gain). Capital <code>KP</code> is the <i>constant</i> you choose at the bottom, the actual gain value the tests pass in as <code>p_control(q, target, KP)</code>. Python treats <code>KP</code> and <code>kp</code> as two unrelated names, and the capitals are only a convention for “a setting at the top of the file”.</p>
<p>Too small a gain <code>kp</code> and the joint crawls. Too big and it overshoots and oscillates. Drag the sliders above: what matters is kp × (loop period). With our 20 Hz loop, anything above 20 overshoots and above 40 it explodes; run the loop faster and you can afford a higher gain.</p>
<p><b>Your task</b>: write <code>p_control</code>, then pick a gain <code>KP</code> that gets within 1% of the target in under one second without overshooting. The plot shows the response.</p>`,
    starter: `def p_control(q, q_target, kp):\n    return ...\n\nKP = 1.0   # tune me\n`,
    solution: `def p_control(q, q_target, kp):\n    return kp * (q_target - q)\n\nKP = 8.0\n`,
    hint: 'The function is one line: <code>kp * (q_target - q)</code>. For the gain, try something between 5 and 20.',
    tests: [
      ['p_control pushes toward the target', `assert abs(p_control(0.0, 1.0, 2.0) - 2.0) < 1e-9\nassert abs(p_control(1.0, 0.0, 2.0) + 2.0) < 1e-9\nassert p_control(0.5, 0.5, 9.0) == 0`],
      ['with your KP the joint reaches the target within 1 s', `q, dt = 0.0, 0.05\nfor _ in range(20):\n    q += p_control(q, 1.0, KP) * dt\nassert abs(q - 1.0) < 0.01, "after 1 s the joint is at %.3f, target is 1.0. Is KP too low (or wildly high)?" % q`],
      ['…and never overshoots', `q, dt, peak = 0.0, 0.05, 0.0\nfor _ in range(40):\n    q += p_control(q, 1.0, KP) * dt\n    peak = max(peak, q)\nassert peak <= 1.0 + 1e-9, "it overshot to %.2f. Lower KP." % peak`],
    ],
  },
  ...CONTROL_MORE,
  {
    id: 'mjcf', unit: 2, course: 'sim', title: 'Build a world in MuJoCo', viz: 'mjcf', lang: 'xml',
    text: `<p><b>MuJoCo</b> is the physics engine behind a huge share of robot learning research. You describe a world in an XML format called <b>MJCF</b>; MuJoCo simulates it.</p>
<ul><li><code>&lt;body&gt;</code> is a rigid object. <code>pos</code> is its x y z position in metres.</li><li><code>&lt;geom&gt;</code> gives a body its shape. For a box, <code>size</code> is the <i>half</i>-width in x, y, z.</li><li><code>&lt;freejoint/&gt;</code> lets a body move freely. Without a joint, a body is welded to the world.</li></ul>
<p>The scene has a table and a red cube resting on it. This is real MuJoCo: the same XML loads in the desktop simulator.</p>
<p><b>Your task</b>: add a second body named <code>green</code>, a 4 cm cube (<code>size="0.02 0.02 0.02"</code>), starting 20 cm above the table so that it <b>falls</b>. Give it a colour with <code>rgba</code>.</p>`,
    starter: `<mujoco>\n  <worldbody>\n    <light pos="0 0 1.5"/>\n    <geom name="table" type="plane" size="0.5 0.5 0.1" rgba="0.85 0.83 0.8 1"/>\n\n    <body name="red" pos="0 0 0.02">\n      <freejoint/>\n      <geom type="box" size="0.02 0.02 0.02" rgba="0.86 0.2 0.2 1"/>\n    </body>\n\n    <!-- add your green cube here -->\n\n  </worldbody>\n</mujoco>\n`,
    solution: `<mujoco>\n  <worldbody>\n    <light pos="0 0 1.5"/>\n    <geom name="table" type="plane" size="0.5 0.5 0.1" rgba="0.85 0.83 0.8 1"/>\n\n    <body name="red" pos="0 0 0.02">\n      <freejoint/>\n      <geom type="box" size="0.02 0.02 0.02" rgba="0.86 0.2 0.2 1"/>\n    </body>\n\n    <body name="green" pos="0.1 0 0.2">\n      <freejoint/>\n      <geom type="box" size="0.02 0.02 0.02" rgba="0.2 0.75 0.3 1"/>\n    </body>\n\n  </worldbody>\n</mujoco>\n`,
    hint: 'Copy the red body, rename it <code>green</code>, change <code>pos</code> to something like <code>"0.1 0 0.2"</code> and the <code>rgba</code>. Forgot the <code>&lt;freejoint/&gt;</code>? Then it hangs in the air.',
  },
  {
    id: 'waypoints', unit: 2, course: 'sim', title: 'Script a pick', viz: 'waypoints',
    text: `<p>Before learning anything, robots were (and mostly still are) programmed with <b>waypoints</b>: go here, then here, close the gripper, go there.</p>
<p>The red cube sits at x = 0.25, y = 0.10. Its centre is 2 cm above the table. Each waypoint is <code>(x, y, z, grip)</code> in metres, with <code>grip</code> 0 = open and 1 = closed. The lab runs your list on the simulated Sprout arm in MuJoCo.</p>
<p><b>Your task</b>: add three waypoints so the arm goes down to the cube, closes, and lifts it back up to z = 0.12.</p>
<p class="dim">Notice how brittle this is: move the cube 3 cm and the script grabs air. That brittleness is why we want robots that <i>learn</i>.</p>`,
    starter: `waypoints = [\n    (0.25, 0.10, 0.12, 0),   # 1. hover above the cube, gripper open\n    # 2. go down to the cube (z = 0.02), still open\n    # 3. close the gripper\n    # 4. lift back up, still closed\n]\n`,
    solution: `waypoints = [\n    (0.25, 0.10, 0.12, 0),\n    (0.25, 0.10, 0.02, 0),\n    (0.25, 0.10, 0.02, 1),\n    (0.25, 0.10, 0.12, 1),\n]\n`,
    hint: 'Step 2 is <code>(0.25, 0.10, 0.02, 0)</code>. Step 3 is the same place with grip 1.',
    tests: [['waypoints is a list of at least 4 (x, y, z, grip) entries', `assert isinstance(waypoints, list) and len(waypoints) >= 4, "need at least 4 waypoints"\nfor w in waypoints:\n    assert len(w) == 4, "each waypoint needs 4 numbers: x, y, z, grip"`]],
  },
  {
    id: 'reward', unit: 3, course: 'rl', title: 'Design a reward',
    text: `<p>In <b>reinforcement learning</b> (RL) nobody shows the robot what to do. It tries things, and a <b>reward</b> number tells it how well that went. The robot’s only goal is to collect as much reward as possible, so the reward function <i>is</i> the task description.</p>
<p>A reward that only pays out at the very end (“cube is in the bin: +10”) is called <b>sparse</b>: honest, but the robot may flail for a very long time before stumbling on it. So we add <b>shaping</b>: small rewards for progress.</p>
<p><b>Your task</b>: write a reward that</p><ul><li>starts at minus the gripper-to-cube distance (closer is better),</li><li>adds 1 if the cube is lifted,</li><li>adds 10 if the cube is in the bin.</li></ul>`,
    starter: `def reward(dist_to_cube, lifted, in_bin):\n    r = ...\n    if lifted:\n        ...\n    if in_bin:\n        ...\n    return r\n`,
    solution: `def reward(dist_to_cube, lifted, in_bin):\n    r = -dist_to_cube\n    if lifted:\n        r += 1\n    if in_bin:\n        r += 10\n    return r\n`,
    hint: 'Start with <code>r = -dist_to_cube</code>, then <code>r += 1</code> and <code>r += 10</code> inside the ifs.',
    tests: [
      ['closer to the cube is better', `assert reward(0.1, False, False) > reward(0.3, False, False)\nassert abs(reward(0.3, False, False) + 0.3) < 1e-9, "far away, nothing lifted: expected -0.3, got %r" % (reward(0.3, False, False),)`],
      ['lifting earns +1', `assert abs(reward(0.0, True, False) - 1.0) < 1e-9, "expected 1.0, got %r" % (reward(0.0, True, False),)`],
      ['cube in the bin earns +10 on top', `assert abs(reward(0.1, True, True) - 10.9) < 1e-9, "expected 10.9, got %r" % (reward(0.1, True, True),)`],
    ],
  },
  {
    id: 'qlearn', unit: 3, course: 'rl', title: 'Q-learning from scratch', viz: 'qlearn',
    text: `<p>Time to actually train something. A gripper lives on a 5×5 grid. It starts top-left and must reach the cube. Dark cells are obstacles (−5 and the episode ends); every step costs −0.1; reaching the cube pays +10.</p>
<p><b>Q-learning</b> keeps a table <code>Q[state][action]</code>: “how much total reward do I expect if I take this action here and act well afterwards?” After every step it nudges one entry toward what it just experienced:</p>
<p class="mono">target = r + γ · max(Q[next_state])&nbsp;&nbsp;&nbsp;(just r if the episode ended)<br>Q[s][a] += α · (target − Q[s][a])</p>
<p>α is the learning rate, γ (gamma) says how much the future counts.</p>
<p><b>Your task</b>: fill in the two lines. The lab then runs 400 real training episodes in Python with your update rule and shows the learning curve and the route it learned.</p>`,
    pre: `import random
class GridEnv:
    N = 5; START = (0, 0); GOAL = (4, 3); WALLS = {(1, 1), (2, 1), (3, 3), (1, 3), (3, 0)}
    MOVES = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    def reset(self):
        self.s = self.START; return self.s
    def step(self, a):
        dx, dy = self.MOVES[a]
        x = min(self.N - 1, max(0, self.s[0] + dx)); y = min(self.N - 1, max(0, self.s[1] + dy))
        self.s = (x, y)
        if self.s in self.WALLS: return self.s, -5.0, True
        if self.s == self.GOAL: return self.s, 10.0, True
        return self.s, -0.1, False
def _train(update, episodes=400, seed=0):
    rnd = random.Random(seed); env = GridEnv()
    Q = {(x, y): [0.0] * 4 for x in range(5) for y in range(5)}
    returns = []
    for ep in range(episodes):
        s = env.reset(); total = 0.0; eps = max(0.05, 1.0 - ep / 250)
        for _ in range(60):
            a = rnd.randrange(4) if rnd.random() < eps else max(range(4), key=lambda i: Q[s][i])
            s2, r, done = env.step(a)
            update(Q, s, a, r, s2, done)
            s = s2; total += r
            if done: break
        returns.append(total)
    return Q, returns
def _greedy_path(Q):
    env = GridEnv(); s = env.reset(); path = [s]
    for _ in range(25):
        s, r, done = env.step(max(range(4), key=lambda i: Q[s][i])); path.append(s)
        if done: break
    return path
`,
    starter: `def q_update(Q, s, a, r, s2, done, alpha=0.5, gamma=0.95):\n    if done:\n        target = r\n    else:\n        target = ...\n    Q[s][a] += ...\n`,
    solution: `def q_update(Q, s, a, r, s2, done, alpha=0.5, gamma=0.95):\n    if done:\n        target = r\n    else:\n        target = r + gamma * max(Q[s2])\n    Q[s][a] += alpha * (target - Q[s][a])\n`,
    hint: '<code>target = r + gamma * max(Q[s2])</code> and <code>Q[s][a] += alpha * (target - Q[s][a])</code>.',
    tests: [
      ['one update moves Q toward the target', `Q = {"a": [0.0, 0.0], "b": [2.0, 4.0]}\nq_update(Q, "a", 0, 1.0, "b", False, alpha=0.5, gamma=0.5)\nassert abs(Q["a"][0] - 1.5) < 1e-9, "expected Q to become 1.5, got %r" % (Q["a"][0],)`],
      ['terminal steps do not look into the future', `Q = {"a": [0.0, 0.0], "b": [2.0, 4.0]}\nq_update(Q, "a", 1, 1.0, "b", True, alpha=0.5, gamma=0.5)\nassert abs(Q["a"][1] - 0.5) < 1e-9, "expected 0.5, got %r" % (Q["a"][1],)`],
      ['after 400 episodes the learned route reaches the cube', `_Q, returns = _train(q_update)\npath = _greedy_path(_Q)\nassert path[-1] == GridEnv.GOAL, "the greedy route ends at %r, not at the cube" % (path[-1],)\nassert len(path) <= 9, "it gets there, but in %d steps: not the shortest route" % (len(path) - 1)`],
    ],
  },
  {
    id: 'hillclimb', unit: 3, course: 'rl', title: 'RL on a real simulator', viz: 'hillclimb',
    text: `<p>Tables do not scale to robots: an arm has endlessly many states. So we give the robot a <b>policy with parameters</b> and search for parameters that earn more reward.</p>
<p>Here the policy is tiny: three gains, one per axis.</p><p class="mono">action = gain × (target position − hand position)</p>
<p>The task: reach a point above the red cube as fast as possible, in MuJoCo. Reward is minus the distance at every step, so dawdling is expensive. The starting gains are sluggish.</p>
<p>The simplest RL algorithm that works is <b>random search</b> (hill climbing): wiggle the parameters at random, run an episode, keep the wiggle if the return went up. Fancier methods (PPO, SAC) are smarter versions of the same loop: <i>try, score, improve</i>.</p>
<p><b>Your task</b>: write both functions. The lab runs 40 MuJoCo episodes with them and plays back the policy you ended up with.</p>`,
    pre: 'import random\n',
    starter: `def propose(params, sigma, rng):\n    # return a NEW list: every parameter plus Gaussian noise rng.gauss(0, sigma)\n    return ...\n\ndef keep_better(best, best_return, candidate, candidate_return):\n    # return the (params, return) pair with the higher return\n    ...\n`,
    solution: `def propose(params, sigma, rng):\n    return [p + rng.gauss(0, sigma) for p in params]\n\ndef keep_better(best, best_return, candidate, candidate_return):\n    if candidate_return > best_return:\n        return candidate, candidate_return\n    return best, best_return\n`,
    hint: 'A list comprehension does the first: <code>[p + rng.gauss(0, sigma) for p in params]</code>. The second is an <code>if</code> with two <code>return</code>s.',
    tests: [
      ['propose returns a new, perturbed list', `_r = random.Random(1)\n_p = [1.0, 2.0, 3.0]\n_c = propose(_p, 0.5, _r)\nassert isinstance(_c, list) and len(_c) == 3, "propose must return a list of 3 numbers"\nassert _p == [1.0, 2.0, 3.0], "do not modify params in place"\nassert _c != _p, "the candidate is identical to params: add noise"`],
      ['keep_better keeps the higher return', `assert keep_better([1], -5.0, [2], -3.0) == ([2], -3.0)\nassert keep_better([1], -2.0, [2], -3.0) == ([1], -2.0)`],
    ],
  },
  ...MORE,
  ...MORE3,
  ...MORE5,
  ...MORE6,
  ...MORE7,
  ...MORE9,
  ...MORE8,
];

// Slot the newer lessons where they teach best (the arrays above are in the order they were written).
function place(id, beforeId) {
  const i = LESSONS.findIndex((l) => l.id === id), j = LESSONS.findIndex((l) => l.id === beforeId);
  if (i < 0 || j < 0) return;
  const [l] = LESSONS.splice(i, 1); LESSONS.splice(LESSONS.findIndex((x) => x.id === beforeId), 0, l);
}
place('rotations', 'pointcloud');
place('singularity', 'rrt');
place('trajtime', 'rrt');
place('slam', 'delivery');
