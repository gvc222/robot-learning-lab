// Control lessons for "Robot basics & control": from the idea of a loop to controlling a whole arm and real servos.
const L = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;

export const CONTROL_INTRO = [
  {
    id: 'ctlloop', course: 'basics', title: 'What is a control loop?', kind: 'quiz', explain: 'loop',
    text: `<p>Kinematics told you <i>which</i> joint angles you want. Getting there is a different problem: motors are not teleporters. A <b>controller</b> closes the gap, and it does it in a loop that runs many times per second:</p>
<ol><li><b>Sense</b>: read the joint encoder (where am I?).</li><li><b>Compare</b>: error = target − measured.</li><li><b>Act</b>: send a command that shrinks the error (a speed, a current, a torque).</li></ol>
<p>Because it measures every time, this is <b>closed-loop</b> (feedback) control. <b>Open-loop</b> control sends a fixed command and hopes, like setting a microwave timer. Cruise control in a car, a thermostat and every servo in an SO-101 are closed loops.</p>
<p>Two numbers describe a loop: its <b>rate</b> (how often it runs: the SO-101 policy sends targets about 30 times a second, while the servo’s own loop runs much faster) and its <b>gains</b> (how hard it reacts to error). Play with both in the widget above, then answer.</p>`,
    quiz: [
      { q: 'In the widget, you drag the target. Which step notices first?', options: ['Act', 'Compare: the error jumps', 'Sense'], answer: 1 },
      { q: 'A microwave running for exactly 90 s is…', options: ['Closed-loop: it measures the food', 'Open-loop: no measurement of the result', 'A P controller'], answer: 1 },
      { q: 'You drop the loop rate to 2 Hz with the same kp. What happens?', options: ['Nothing changes', 'Each correction is based on stale information and overshoots', 'It becomes open-loop'], answer: 1 },
    ],
  },
];

export const CONTROL_MORE = [
  {
    id: 'pd', course: 'basics', title: 'Real joints have mass: PD control', explain: 'pdresp', viz: 'pdlab',
    text: `<p>Your P controller set the joint’s <i>speed</i> directly. A real joint has inertia: a motor makes <b>torque</b>, torque makes <b>acceleration</b> (I·q̈ = τ), and speed builds up. Push in proportion to the error alone and the joint arrives with speed to spare and swings past, like a mass on a spring.</p>
<p>Add a term that pushes against the speed, a shock absorber:</p>
<p class="mono">τ = kp·(target − q) − kd·q̇</p>
<p>That is <b>PD control</b>. The damping ratio ζ = kd / (2·√(kp·I)) says it all: ζ &lt; 1 overshoots, ζ = 1 (critical damping) arrives fastest with no overshoot, ζ &gt; 1 crawls. Try it in the widget.</p>
<p><b>What is q̇?</b> The dot means “rate of change”: <code>q</code> is the joint angle, <code>q̇</code> (<code>qd</code> in code) is how fast it is changing, the joint’s <b>velocity</b> in rad/s. Robotics calls the set of all joint variables the <i>generalized coordinates</i> and their rates the <i>generalized velocities</i>: “generalized” because it covers hinge joints (radians, rad/s) and sliding joints (metres, m/s) with one symbol. <code>q̈</code> (two dots) is acceleration.</p>
<div class="card" style="margin:8px 0"><b>Already defined for you</b>: <code>math</code> and <code>I = 0.01</code> (the joint’s inertia). <b>You write</b> <code>pd_torque(q, qd, q_target, kp, kd)</code> (returns one torque) and set the two constants <code>KP</code> and <code>KD</code>.</div>
<p><b>Your task</b>: write <code>pd_torque(q, qd, q_target, kp, kd)</code>, then choose <code>KP</code> and <code>KD</code> for a joint with inertia I = 0.01 kg·m² so it moves 1 rad with under 5% overshoot and settles within 2% in 0.6 s. The lab runs your controller on a real MuJoCo joint.</p>`,
    pre: 'import math\nI = 0.01\n',
    starter: `def pd_torque(q, qd, q_target, kp, kd):
    return ...

KP = 2.0
KD = 0.0   # tune me: try the critical-damping formula
`,
    solution: `def pd_torque(q, qd, q_target, kp, kd):
    return kp * (q_target - q) - kd * qd

KP = 2.0
KD = 2 * math.sqrt(KP * I)
`,
    hint: 'One line: <code>kp * (q_target - q) - kd * qd</code>. For critical damping, <code>KD = 2 * math.sqrt(KP * I)</code>.',
    tests: [
      ['spring and damper terms', `assert abs(pd_torque(0, 0, 1, 3, 0.5) - 3) < 1e-9\nassert abs(pd_torque(1, 2, 1, 3, 0.5) + 1) < 1e-9, "at the target, moving at 2 rad/s, only damping acts"`],
      ['under 5% overshoot, settled in 0.6 s', `q, v, dt, peak = 0.0, 0.0, 0.002, 0.0\nfor i in range(300):\n    v += pd_torque(q, v, 1.0, KP, KD) / I * dt; q += v * dt; peak = max(peak, q)\nassert peak < 1.05, "overshoot %.0f%%: more kd" % ((peak - 1) * 100)\nassert abs(q - 1) < 0.02, "at 0.6 s the joint is at %.3f: too slow (kd too big or kp too small?)" % q`],
    ],
  },
  {
    id: 'pid', course: 'basics', title: 'Gravity: the integral term and feed-forward', explain: 'gravity', viz: 'pidlab',
    text: `<p>Turn the arm so a link sticks out sideways and gravity joins in: it pulls down with torque <code>m·g·l<sub>c</sub>·cos q</code> (l<sub>c</sub> is the distance to the link’s centre of mass). A PD controller only pushes when there is an error, so it settles where its push equals gravity: it <b>sags</b>.</p>
<p>Two fixes, and real arms use both:</p>
<ul><li><b>Integral term</b>: keep a running sum of the error and push with <code>ki·∫e dt</code>. Any lasting error keeps growing the push until the error is gone. That is <b>PID</b>. Watch for <i>windup</i>: if the motor is saturated the sum keeps growing and later overshoots, so real code clamps it.</li>
<li><b>Feed-forward</b>: you know the physics, so add the gravity torque directly: <code>τ += m·g·l<sub>c</sub>·cos q</code>. The feedback terms then only handle what the model gets wrong.</li></ul>
<p><b>Quick review of the three terms</b> (e = target − q is the error):</p>
<ul><li><b>P</b>, <code>kp·e</code>: push in proportion to the error <i>now</i>. Fast, but stalls when the push equals a steady load like gravity.</li><li><b>I</b>, <code>ki·∫e dt</code>: push in proportion to the error <i>accumulated over time</i> (the running sum of e·dt). It remembers the past, so a lasting error eventually wins.</li><li><b>D</b>, <code>kd·ė</code>: push against how fast the error is changing, the shock absorber. With a fixed target, ė = −q̇, which is why the code says <code>− kd·qd</code>.</li></ul>
<p><b>What is <code>pid_step</code>?</b> One tick of the controller, called every <code>dt</code> seconds inside the control loop. The I term needs a memory between ticks, so the running sum lives in the dictionary <code>state</code> that you pass in every call (<code>state["i"]</code>), and the function returns the torque for this tick. How to find it: it is simply the three terms added together, <code>kp·e + ki·state["i"] − kd·qd</code>, after you have updated the sum with <code>e·dt</code>.</p>
<div class="card" style="margin:8px 0"><b>Already defined for you</b>: <code>math</code>, <code>M = 0.15</code> kg, <code>G = 9.81</code>, <code>LC = 0.06</code> m (the link’s centre-of-mass distance). <b>You write</b> two functions, <code>pid_step(...)</code> and <code>gravity_ff(q)</code>; the starter marks the blanks.</div>
<p><b>Your task</b>: write <code>pid_step(state, q, qd, q_target, kp, ki, kd, dt)</code> (add <code>e·dt</code> to <code>state["i"]</code>, return the PID torque) and <code>gravity_ff(q)</code> using the constants <code>M</code>, <code>G</code>, <code>LC</code>. The tests hold a 150 g link level, and the lab does it in MuJoCo.</p>`,
    pre: 'import math\nM, G, LC = 0.15, 9.81, 0.06\nI = M * LC * LC + 0.0008\ndef _hold(ctrl, steps=1500, dt=0.002, target=0.0):\n    q, v = target - 0.3, 0.0\n    for _ in range(steps):\n        tau = max(-1.5, min(1.5, ctrl(q, v)))\n        v += (tau - M * G * LC * math.cos(q)) / I * dt; q += v * dt\n    return q\n',
    starter: `def pid_step(state, q, qd, q_target, kp, ki, kd, dt):
    e = q_target - q
    state["i"] = state.get("i", 0.0) + ...
    return ...

def gravity_ff(q):
    return ...
`,
    solution: `def pid_step(state, q, qd, q_target, kp, ki, kd, dt):
    e = q_target - q
    state["i"] = state.get("i", 0.0) + e * dt
    return kp * e + ki * state["i"] - kd * qd

def gravity_ff(q):
    return M * G * LC * math.cos(q)
`,
    hint: 'PID: <code>kp * e + ki * state["i"] - kd * qd</code>. Feed-forward: <code>M * G * LC * math.cos(q)</code>.',
    tests: [
      ['PD alone sags (that is the problem)', `sag = _hold(lambda q, v: pid_step({}, q, v, 0.0, 1.5, 0.0, 0.06, 0.002))\nassert sag < -0.03, "expected a visible sag with ki = 0"`],
      ['PID removes the sag', `st = {}\nq = _hold(lambda q, v: pid_step(st, q, v, 0.0, 1.5, 3.0, 0.06, 0.002))\nassert abs(q) < 0.01, "still %.1f degrees off" % math.degrees(q)`],
      ['PD + gravity feed-forward removes it too', `q = _hold(lambda q, v: pid_step({}, q, v, 0.0, 1.5, 0.0, 0.06, 0.002) + gravity_ff(q))\nassert abs(q) < 0.01, "still %.1f degrees off" % math.degrees(q)`],
    ],
  },
  {
    id: 'armctl', course: 'basics', title: 'Control a whole arm', explain: 'armctl', viz: 'armlab',
    text: `<p>Now two joints at once, an SO-101-sized arm in the vertical plane (upper arm 0.116 m and 120 g, forearm 0.135 m and 150 g). The standard recipe is <b>joint-space PD with gravity compensation</b>: each joint gets its own PD term, plus the torque gravity needs at the current pose:</p>
<p class="mono">τ = kp·(q<sub>target</sub> − q) − kd·q̇ + g(q)</p>
<p>Gravity on the forearm pulls on both joints (the shoulder also holds the forearm up). With each link’s centre of mass at its middle:</p>
<p class="mono">g₂ = M2·G·(L2/2)·cos(q₁ + q₂)<br>g₁ = (M1·L1/2 + M2·L1)·G·cos(q₁) + g₂</p>
<p><b>Reading the variables</b>: <code>q</code> is a pair of joint angles, <code>q = (q1, q2)</code>, so in Python <code>q[0]</code> is the shoulder angle (from horizontal) and <code>q[1]</code> is the elbow angle (relative to the upper arm). They are <i>joint angles</i>, not positions of anything: in the formulas the centres of mass are the “/2” terms (each link’s middle, <code>L1/2</code> and <code>L2/2</code>). <code>qd</code> and <code>q_target</code> are pairs in the same order. Unpack with <code>q1, q2 = q</code> if the indexing is confusing.</p>
<div class="card" style="margin:8px 0"><b>Already defined for you</b>: <code>math</code>, <code>L1</code>, <code>L2</code> (link lengths, m), <code>M1</code>, <code>M2</code> (link masses, kg), <code>G</code>. <b>You write</b> <code>gravity(q)</code> returning <code>(g1, g2)</code>, and <code>arm_torques(...)</code> returning a list of two torques.</div>
<p>Combine this with your IK from earlier and you have the classic arm controller: IK turns a hand target into joint targets, PD + g(q) gets the joints there. Move the sliders in the widget above, and untick gravity compensation to feel the difference.</p>
<p><b>Your task</b>: write <code>gravity(q)</code> and <code>arm_torques(q, qd, q_target, kp, kd)</code> (both return two numbers). The lab sends your torques to a MuJoCo arm through three waypoints.</p>`,
    pre: 'import math\nL1, L2, M1, M2, G = 0.116, 0.135, 0.12, 0.15, 9.81\n',
    starter: `def gravity(q):
    q1, q2 = q          # shoulder angle, elbow angle
    g2 = ...
    g1 = ...
    return g1, g2

def arm_torques(q, qd, q_target, kp, kd):
    g = gravity(q)
    return [kp * (q_target[i] - q[i]) - kd * qd[i] + ... for i in range(2)]
`,
    solution: `def gravity(q):
    g2 = M2 * G * (L2 / 2) * math.cos(q[0] + q[1])
    g1 = (M1 * L1 / 2 + M2 * L1) * G * math.cos(q[0]) + g2
    return g1, g2

def arm_torques(q, qd, q_target, kp, kd):
    g = gravity(q)
    return [kp * (q_target[i] - q[i]) - kd * qd[i] + g[i] for i in range(2)]
`,
    hint: 'Copy the two formulas; <code>q[0]</code> is the shoulder, <code>q[1]</code> the elbow. Then add <code>g[i]</code> in the list.',
    tests: [
      ['arm straight out: both joints hold weight', `g1, g2 = gravity((0, 0))\nassert abs(g2 - 0.15 * 9.81 * 0.0675) < 1e-9, "g2 = %r" % g2\nassert abs(g1 - ((0.12 * 0.058 + 0.15 * 0.116) * 9.81 + g2)) < 1e-9`],
      ['arm straight up: no gravity torque', `g1, g2 = gravity((math.pi / 2, 0))\nassert abs(g1) < 1e-9 and abs(g2) < 1e-9`],
      ['at rest on target, the torque is exactly gravity', `t = arm_torques((0.3, -0.5), (0, 0), (0.3, -0.5), 3, 0.1)\ng = gravity((0.3, -0.5))\nassert abs(t[0] - g[0]) < 1e-9 and abs(t[1] - g[1]) < 1e-9`],
    ],
  },
  {
    id: 'servo', course: 'basics', title: 'How real arms do it: smart servos', kind: 'quiz',
    text: `<p>On an SO-101 you never write torque loops yourself. Each Feetech STS3215 servo runs its own position controller inside the motor: you send a <b>Goal_Position</b>, its microcontroller reads the encoder and drives the motor current many times faster than any Python loop could.</p>
<p>LeRobot puts every follower motor in <b>position mode</b> and sets the servo’s gains to <b>P = 16, I = 0, D = 32</b> (registers 21, 23 and 22; see ${L('https://github.com/huggingface/lerobot/blob/main/src/lerobot/robots/so_follower/config_so_follower.py', 'config_so_follower.py')}). I = 0 because gravity on a small arm is modest and integral windup causes surprises; the cost is a little sag under load, which a policy trained on real data learns to compensate.</p>
<p>The layers stack up:</p>
<ul><li><b>Policy</b> (ACT, SmolVLA…): about 30 Hz, outputs target joint positions.</li><li><b>Safety</b>: LeRobot can clamp how far a target may jump in one step (<code>max_relative_target</code>), and the servo enforces limits.</li><li><b>Servo PID</b>: inside each motor, much faster, turns position error into current.</li></ul>
<p>MuJoCo models this with <code>&lt;position kp="…"/&gt;</code> actuators, which is what the Menagerie SO-101 and YAM models use. Bigger industrial and research arms (like YAM’s motors) often expose torque control too, so you can run the PD + g(q) controller you just wrote, or impedance control for gentle contact.</p>`,
    quiz: [
      { q: 'Your SO-101 policy outputs a joint angle 30 times a second. Who turns that into motor current?', options: ['Your Python code', 'The PID loop inside each servo', 'MuJoCo'], answer: 1 },
      { q: 'With LeRobot’s defaults (I = 0), what do you expect when the arm holds a heavy object out sideways?', options: ['Exactly zero error', 'A small sag below the target', 'Integral windup'], answer: 1 },
      { q: 'A policy glitch asks the elbow to jump 90° in one step. What can stop it?', options: ['max_relative_target clamps the step', 'Nothing', 'A larger D gain'], answer: 0 },
    ],
  },
];
