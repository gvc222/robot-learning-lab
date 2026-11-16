// Week 4 courses: perception, velocity kinematics, motion planning, ROS 2 — and policies that really train in your browser.
const A = (id, text) => `<a href="https://arxiv.org/abs/${id}" target="_blank" rel="noopener">${text}</a>`;
const L = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;

export const COURSES5 = [
  { id: 'core2', title: 'Perception, planning & ROS 2', blurb: 'Depth to point clouds, Jacobians, RRT motion planning, and how ROS 2 wires a robot together.' },
  { id: 'learn', title: 'Train real policies', blurb: 'No pretending: behaviour cloning, flow matching and a walking gait, trained in your browser on MuJoCo.' },
];

const MINI_ROS = `import heapq
# A tiny stand-in for rclpy with the same names, so the code you write here looks like real ROS 2 code.
_topics, _timers, _clock = {}, [], [0.0]
class _Pub:
    def __init__(self, topic): self.topic = topic
    def publish(self, msg):
        for cb in list(_topics.get(self.topic, [])): cb(msg)
class Node:
    def __init__(self, name): self.name = name
    def create_publisher(self, msg_type, topic, qos=10): return _Pub(topic)
    def create_subscription(self, msg_type, topic, callback, qos=10): _topics.setdefault(topic, []).append(callback)
    def create_timer(self, period, callback): heapq.heappush(_timers, (_clock[0] + period, len(_timers), period, callback))
def spin(seconds):
    end = _clock[0] + seconds
    while _timers and _timers[0][0] <= end + 1e-9:
        t, i, period, cb = heapq.heappop(_timers); _clock[0] = t; cb()
        heapq.heappush(_timers, (t + period, i, period, cb))
    _clock[0] = end
def _reset():
    _topics.clear(); _timers.clear(); _clock[0] = 0.0
Int32 = int
`;

const RRT_PRE = `import math, random
START, GOAL = (0.1, 0.1), (0.9, 0.9)
OBSTACLES = [(0.35, 0.3, 0.14), (0.62, 0.62, 0.15), (0.3, 0.72, 0.12), (0.72, 0.25, 0.1)]   # circles: (x, y, radius)
_tree = []
def rrt(start, goal, obstacles, seed=0, step=0.06, iters=3000):
    rng = random.Random(seed); nodes = [start]; parent = {0: None}; _tree.clear()
    for _ in range(iters):
        target = goal if rng.random() < 0.1 else (rng.random(), rng.random())
        i = min(range(len(nodes)), key=lambda k: math.dist(nodes[k], target))
        new = steer(nodes[i], target, step)
        if not segment_free(nodes[i], new, obstacles): continue
        nodes.append(new); parent[len(nodes) - 1] = i; _tree.append((nodes[i], new))
        if math.dist(new, goal) < step and segment_free(new, goal, obstacles):
            path, k = [goal], len(nodes) - 1
            while k is not None: path.append(nodes[k]); k = parent[k]
            return path[::-1]
    return None
`;

export const MORE5 = [
  // ───────────────────────── Perception ─────────────────────────
  {
    id: 'pointcloud', course: 'core2', title: 'Perception: from depth image to object position', viz: 'depthlab',
    text: `<p>A policy that takes images can learn perception implicitly. Classical pipelines, and most debugging, do it explicitly: <b>depth image → point cloud → object</b>. A depth camera (stereo like the RealSense D405 on an SO-101 wrist, or time-of-flight) gives, for every pixel (u, v), the distance <code>d</code> along the camera’s forward axis.</p>
<p>You already know the pinhole model from the calibration lessons. Run it backwards (<b>back-projection</b>) to lift a pixel into 3D in the camera frame:</p>
<p class="mono">x = (u − cx)·d / fx &nbsp; y = (v − cy)·d / fy &nbsp; z = d</p>
<p>Then the extrinsics (rotation R and position t of the camera) move it into the world frame: <code>p_world = R·p_cam + t</code>. Crop the cloud to the workspace above the table and take the <b>centroid</b>: a first object-position estimate. It is biased toward the faces the camera can see, which is why real systems fit a shape or use several views; for grasping a 4 cm cube it is close enough.</p>
<p><b>Your task</b>: write <code>backproject</code>, <code>cam_to_world</code> (R is a list of 3 rows), <code>crop</code> (keep points inside an axis-aligned box) and <code>centroid</code>. The lab ray-casts a real depth image from MuJoCo’s front camera and uses your four functions to find the red cube.</p>`,
    starter: `def backproject(u, v, d, fx, fy, cx, cy):
    return (..., ..., d)

def cam_to_world(p, R, t):
    # R is 3 rows; p_world = R @ p + t
    return tuple(... for i in range(3))

def crop(points, lo, hi):
    return [p for p in points if all(...)]

def centroid(points):
    n = len(points)
    return tuple(...)
`,
    solution: `def backproject(u, v, d, fx, fy, cx, cy):
    return ((u - cx) * d / fx, (v - cy) * d / fy, d)

def cam_to_world(p, R, t):
    return tuple(R[i][0] * p[0] + R[i][1] * p[1] + R[i][2] * p[2] + t[i] for i in range(3))

def crop(points, lo, hi):
    return [p for p in points if all(lo[i] <= p[i] <= hi[i] for i in range(3))]

def centroid(points):
    n = len(points)
    return tuple(sum(p[i] for p in points) / n for i in range(3))
`,
    hint: 'Row i of the rotation: <code>R[i][0]*p[0] + R[i][1]*p[1] + R[i][2]*p[2] + t[i]</code>. Crop: <code>lo[i] <= p[i] <= hi[i]</code>.',
    tests: [
      ['the centre pixel back-projects straight ahead', `assert backproject(160, 120, 0.5, 300, 300, 160, 120) == (0, 0, 0.5)\nx, y, z = backproject(190, 120, 0.5, 300, 300, 160, 120)\nassert abs(x - 0.05) < 1e-9 and y == 0`],
      ['camera to world', `R = [[0, 0, 1], [-1, 0, 0], [0, -1, 0]]\nassert cam_to_world((1, 2, 3), R, (10, 20, 30)) == (13, 19, 28)`],
      ['crop and centroid', `pts = [(0, 0, 0), (1, 1, 1), (3, 3, 3), (1, 5, 1)]\nc = crop(pts, (0, 0, 0), (2, 2, 2))\nassert c == [(0, 0, 0), (1, 1, 1)]\nassert centroid(c) == (0.5, 0.5, 0.5)`],
    ],
  },
  // ───────────────────────── Jacobians ─────────────────────────
  {
    id: 'jacobian', course: 'core2', title: 'Velocity kinematics: the Jacobian', viz: 'jaclab',
    text: `<p>Forward kinematics maps joint angles to a hand position. Its derivative, the <b>Jacobian</b> J, maps joint <i>velocities</i> to hand velocity: <code>ẋ = J(q)·q̇</code>. For the two-link arm (SO-101 lengths again):</p>
<p class="mono">J = [ −L1·sin θ₁ − L2·sin(θ₁+θ₂) &nbsp;&nbsp; −L2·sin(θ₁+θ₂) ]<br>&nbsp;&nbsp;&nbsp;&nbsp;[ &nbsp;L1·cos θ₁ + L2·cos(θ₁+θ₂) &nbsp;&nbsp;&nbsp; L2·cos(θ₁+θ₂) ]</p>
<p>Why care? Closed-form IK only exists for simple arms. With J you can solve IK for <i>any</i> arm numerically: look at the hand error e, and step the joints by <code>Δq = Jᵀ(JJᵀ + λ²I)⁻¹·e</code>. This is <b>damped least squares</b>; the damping λ keeps the step sane near <b>singularities</b> (arm fully stretched: J loses rank, and a plain inverse would ask for infinite joint speed). It is what MuJoCo-based teleop stacks and most 6- and 7-joint arm controllers run every cycle. The same J also maps forces: joint torques τ = Jᵀ·F.</p>
<p><b>Your task</b>: write <code>jacobian(t1, t2)</code> (2 rows) and <code>ik_step(q, target, lam)</code> returning the new (θ₁, θ₂). <code>fk</code> and a 2×2 solver <code>solve2(A, b)</code> are provided. The lab makes the arm chase a moving target with your step.</p>`,
    pre: `import math
L1, L2 = 0.116, 0.135
def fk(t1, t2): return (L1 * math.cos(t1) + L2 * math.cos(t1 + t2), L1 * math.sin(t1) + L2 * math.sin(t1 + t2))
def solve2(A, b):
    det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
    return ((A[1][1] * b[0] - A[0][1] * b[1]) / det, (A[0][0] * b[1] - A[1][0] * b[0]) / det)
`,
    starter: `def jacobian(t1, t2):
    s1, c1, s12, c12 = math.sin(t1), math.cos(t1), math.sin(t1 + t2), math.cos(t1 + t2)
    return [[..., ...],
            [..., ...]]

def ik_step(q, target, lam=0.02):
    x, y = fk(*q)
    e = (target[0] - x, target[1] - y)
    J = jacobian(*q)
    # A = J J^T + lam^2 I   (2x2)
    A = [[J[0][0]**2 + J[0][1]**2 + lam**2, J[0][0]*J[1][0] + J[0][1]*J[1][1]],
         [J[0][0]*J[1][0] + J[0][1]*J[1][1], J[1][0]**2 + J[1][1]**2 + lam**2]]
    w = solve2(A, e)
    # dq = J^T w
    dq = (..., ...)
    return (q[0] + dq[0], q[1] + dq[1])
`,
    solution: `def jacobian(t1, t2):
    s1, c1, s12, c12 = math.sin(t1), math.cos(t1), math.sin(t1 + t2), math.cos(t1 + t2)
    return [[-L1 * s1 - L2 * s12, -L2 * s12],
            [L1 * c1 + L2 * c12, L2 * c12]]

def ik_step(q, target, lam=0.02):
    x, y = fk(*q)
    e = (target[0] - x, target[1] - y)
    J = jacobian(*q)
    A = [[J[0][0]**2 + J[0][1]**2 + lam**2, J[0][0]*J[1][0] + J[0][1]*J[1][1]],
         [J[0][0]*J[1][0] + J[0][1]*J[1][1], J[1][0]**2 + J[1][1]**2 + lam**2]]
    w = solve2(A, e)
    dq = (J[0][0] * w[0] + J[1][0] * w[1], J[0][1] * w[0] + J[1][1] * w[1])
    return (q[0] + dq[0], q[1] + dq[1])
`,
    hint: 'Jᵀw: <code>dq[0] = J[0][0]*w[0] + J[1][0]*w[1]</code>, <code>dq[1] = J[0][1]*w[0] + J[1][1]*w[1]</code>.',
    tests: [
      ['matches a numerical derivative of fk', `q = (0.7, -1.1); h = 1e-6; J = jacobian(*q)\nfor j in range(2):\n    dq = [0, 0]; dq[j] = h\n    a = fk(q[0] + dq[0], q[1] + dq[1]); b = fk(*q)\n    for i in range(2):\n        assert abs(J[i][j] - (a[i] - b[i]) / h) < 1e-4, "J[%d][%d] is off" % (i, j)`],
      ['a few steps reach the target', `q = (0.5, 0.8)\nfor _ in range(30): q = ik_step(q, (0.1, 0.17))\nx, y = fk(*q)\nassert math.hypot(x - 0.1, y - 0.17) < 1e-4, "ended at (%.3f, %.3f)" % (x, y)`],
      ['stays calm at a singularity (arm straight)', `q = ik_step((0.3, 0.0), (0.2, 0.2))\nassert abs(q[0]) < 10 and abs(q[1]) < 10, "the step exploded: add the damping term"`],
    ],
  },
  // ───────────────────────── Motion planning ─────────────────────────
  {
    id: 'rrt', course: 'core2', title: 'Motion planning around obstacles: RRT', viz: 'rrtlab',
    text: `<p>IK gives a goal pose; it does not say how to get there without hitting the table, a shelf or the robot itself. <b>Motion planning</b> searches the robot’s <b>configuration space</b> (one axis per joint) for a collision-free path. Grids like A* stop scaling beyond 3 or 4 joints, so arms use <b>sampling-based planners</b>.</p>
<p>The classic is the <b>Rapidly-exploring Random Tree</b> (LaValle, 1998): pick a random point, find the nearest node of the tree, take one small step toward the point, and keep the step if it is collision-free. The tree floods free space; with a small bias toward the goal it finds a path quickly. RRT-Connect and RRT* are the versions inside ${L('https://moveit.ai', 'MoveIt')} and ${L('https://ompl.kavrakilab.org', 'OMPL')}. Paths come out jagged, so planners shortcut and smooth them afterwards (your min-jerk lesson).</p>
<p>Here the “robot” is a point in a 2D space with circular obstacles, which is exactly what a 2-joint arm’s configuration space looks like. The <code>rrt()</code> loop is provided; it calls two functions you write.</p>
<p><b>Your task</b>: <code>steer(a, b, step)</code>: the point at most <code>step</code> from a toward b. <code>segment_free(a, b, obstacles)</code>: True if the straight segment a→b stays outside every circle (x, y, r). Hint for the second: find the closest point on the segment to each centre.</p>`,
    pre: RRT_PRE,
    starter: `def steer(a, b, step):
    d = math.dist(a, b)
    if d <= step:
        return b
    return (..., ...)

def segment_free(a, b, obstacles):
    ax, ay = a; bx, by = b
    for (cx, cy, r) in obstacles:
        # closest point on the segment to the centre: a + t (b - a), t clamped to [0, 1]
        L2 = (bx - ax) ** 2 + (by - ay) ** 2
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / L2))
        px, py = ..., ...
        if math.hypot(px - cx, py - cy) <= r:
            return False
    return True
`,
    solution: `def steer(a, b, step):
    d = math.dist(a, b)
    if d <= step:
        return b
    return (a[0] + (b[0] - a[0]) * step / d, a[1] + (b[1] - a[1]) * step / d)

def segment_free(a, b, obstacles):
    ax, ay = a; bx, by = b
    for (cx, cy, r) in obstacles:
        L2 = (bx - ax) ** 2 + (by - ay) ** 2
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / L2))
        px, py = ax + t * (bx - ax), ay + t * (by - ay)
        if math.hypot(px - cx, py - cy) <= r:
            return False
    return True
`,
    hint: 'Steer: move a fraction <code>step / d</code> of the way. Closest point: <code>ax + t*(bx-ax), ay + t*(by-ay)</code>.',
    tests: [
      ['steer takes one step, or lands on a near target', `p = steer((0, 0), (1, 0), 0.25)\nassert abs(p[0] - 0.25) < 1e-9 and p[1] == 0\nassert steer((0, 0), (0.1, 0), 0.25) == (0.1, 0)`],
      ['segment_free sees a circle in the middle of a segment', `assert not segment_free((0, 0), (1, 0), [(0.5, 0.05, 0.1)]), "the segment passes through the circle"\nassert segment_free((0, 0), (1, 0), [(0.5, 0.5, 0.1)])\nassert segment_free((0, 0), (0.2, 0), [(0.5, 0.0, 0.1)]), "the circle is beyond the end of the segment"`],
      ['RRT finds a collision-free path', `path = rrt(START, GOAL, OBSTACLES, seed=1)\nassert path, "no path found"\nassert path[0] == START and path[-1] == GOAL\nfor p, q in zip(path, path[1:]):\n    for (cx, cy, r) in OBSTACLES:\n        for k in range(11):\n            x = p[0] + (q[0] - p[0]) * k / 10; y = p[1] + (q[1] - p[1]) * k / 10\n            assert math.hypot(x - cx, y - cy) > r - 1e-9, "the path cuts through an obstacle"`],
    ],
  },
  // ───────────────────────── ROS 2 ─────────────────────────
  {
    id: 'ros2', course: 'core2', title: 'ROS 2 in ten minutes', kind: 'quiz',
    text: `<p>Everything so far ran in one program. A real robot is many programs: a camera driver, a motor driver, a planner, a policy. <b>ROS 2</b> (Robot Operating System) is the plumbing most labs and companies use to connect them. It is not an operating system; it is a set of conventions and tools on top of Linux.</p>
<ul><li><b>Node</b>: one program with one job (<code>camera_driver</code>, <code>arm_controller</code>).</li>
<li><b>Topic</b>: a named stream of typed messages. Nodes <b>publish</b> and <b>subscribe</b>; neither knows about the other. A camera publishes <code>sensor_msgs/Image</code> on <code>/camera/image_raw</code>; anything can listen. Joint angles travel as <code>sensor_msgs/JointState</code> on <code>/joint_states</code>.</li>
<li><b>Service</b>: a quick request and reply (“reset the gripper”). <b>Action</b>: a long-running goal with feedback and cancel (“move the arm there”, “navigate to the kitchen”).</li>
<li><b>tf2</b>: the tree of coordinate frames (<code>base_link → camera_link</code>): your extrinsics lesson, kept up to date for every node.</li>
<li><b>Launch files</b> start many nodes at once; <b>bags</b> record topics to disk (a ROS dataset).</li></ul>
<p>The stacks you met have ROS 2 versions: ${L('https://moveit.ai', 'MoveIt 2')} (motion planning), ${L('https://nav2.org', 'Nav2')} (your A* and pure pursuit, hardened), ${L('https://github.com/SteveMacenski/slam_toolbox', 'slam_toolbox')} (mapping), and ros2_control (your PID loops). Three commands to remember: <code>ros2 topic list</code>, <code>ros2 topic echo /joint_states</code>, <code>ros2 run &lt;package&gt; &lt;node&gt;</code>.</p>
<p>Do you need it for robot learning? LeRobot deliberately skips ROS: plain Python talks to the motors and cameras. You meet ROS 2 the moment you add a mobile base, an industrial arm, or a team’s existing stack. Installing it needs Ubuntu (for example the long-term release Jazzy on Ubuntu 24.04); ${L('https://docs.ros.org/en/jazzy/Tutorials.html', 'the official tutorials')} are the next step after this page.</p>`,
    quiz: [
      { q: 'A policy node needs every camera frame as it arrives. Which mechanism?', options: ['A service call per frame', 'Subscribe to the camera’s image topic', 'An action'], answer: 1 },
      { q: '“Drive to the kitchen, tell me progress, let me cancel.” Which mechanism?', options: ['Topic', 'Service', 'Action'], answer: 2 },
      { q: 'Where does ROS 2 keep the camera-to-base transform you calibrated?', options: ['In the tf2 frame tree', 'In a launch file comment', 'Inside each image message'], answer: 0 },
    ],
  },
  {
    id: 'ros2code', course: 'core2', title: 'Write two ROS 2 nodes',
    text: `<p>ROS 2 itself cannot run in a browser tab, so this lesson uses a 40-line stand-in with the same class and method names as <code>rclpy</code>, the real Python client. What you write here is, almost line for line, a real ROS 2 node.</p>
<p>The pattern of every node: subclass <code>Node</code>, create publishers, subscriptions and timers in <code>__init__</code>, and do the work in <b>callbacks</b>. Nothing runs until something <b>spins</b> the node (the event loop).</p>
<p><b>Your task</b></p><ol><li><code>Talker</code>: every 0.5 s, publish a counter (0, 1, 2, …) on the topic <code>"chatter"</code>.</li><li><code>Doubler</code>: subscribe to <code>"chatter"</code> and publish twice each number on <code>"doubled"</code>.</li></ol>
<p>The methods: <code>self.create_publisher(Int32, "topic", 10)</code> returns a publisher with <code>.publish(msg)</code>; <code>self.create_subscription(Int32, "topic", callback, 10)</code>; <code>self.create_timer(period_s, callback)</code>. (In real ROS 2 the message is an <code>Int32</code> object with a <code>.data</code> field; here it is a plain int.)</p>`,
    pre: MINI_ROS,
    starter: `class Talker(Node):
    def __init__(self):
        super().__init__("talker")
        self.pub = self.create_publisher(Int32, "chatter", 10)
        self.count = 0
        self.create_timer(..., self.tick)

    def tick(self):
        ...

class Doubler(Node):
    def __init__(self):
        super().__init__("doubler")
        self.pub = self.create_publisher(Int32, "doubled", 10)
        self.create_subscription(Int32, ..., self.on_msg, 10)

    def on_msg(self, msg):
        ...
`,
    solution: `class Talker(Node):
    def __init__(self):
        super().__init__("talker")
        self.pub = self.create_publisher(Int32, "chatter", 10)
        self.count = 0
        self.create_timer(0.5, self.tick)

    def tick(self):
        self.pub.publish(self.count)
        self.count += 1

class Doubler(Node):
    def __init__(self):
        super().__init__("doubler")
        self.pub = self.create_publisher(Int32, "doubled", 10)
        self.create_subscription(Int32, "chatter", self.on_msg, 10)

    def on_msg(self, msg):
        self.pub.publish(msg * 2)
`,
    hint: 'Timer period is <code>0.5</code>. In <code>tick</code>: publish <code>self.count</code>, then add 1. In <code>on_msg</code>: <code>self.pub.publish(msg * 2)</code>.',
    tests: [
      ['Talker publishes 0, 1, 2, 3 in two seconds', `_reset(); got = []\nprobe = Node("probe"); probe.create_subscription(Int32, "chatter", got.append, 10)\nt = Talker(); spin(2.0)\nassert got == [0, 1, 2, 3], "heard %r on chatter" % (got,)`],
      ['Doubler republishes twice the value', `_reset(); got = []\nprobe = Node("probe"); probe.create_subscription(Int32, "doubled", got.append, 10)\nd = Doubler(); t = Talker(); spin(1.5)\nassert got == [0, 2, 4], "heard %r on doubled" % (got,)`],
      ['nodes are decoupled: Doubler works with any publisher', `_reset(); got = []\nprobe = Node("probe"); probe.create_subscription(Int32, "doubled", got.append, 10)\nd = Doubler(); probe.create_publisher(Int32, "chatter", 10).publish(21)\nassert got == [42]`],
    ],
  },

  // ───────────────────────── Train real policies ─────────────────────────
  {
    id: 'bc', course: 'learn', title: 'Behaviour cloning, for real', viz: 'bclab',
    text: `<p>The Train app is a simulation of training. This lesson is not: a small neural network (two hidden layers of 64 units, about 5,000 weights) really trains in your browser, on demonstrations really recorded in MuJoCo, and then really drives the arm.</p>
<p><b>Behaviour cloning</b> (BC) is supervised learning on demonstrations: collect pairs (observation, action) from an expert, and fit a network to predict the action. The loss here is mean squared error; ACT, Diffusion Policy and VLAs are bigger answers to the same question.</p>
<p>Two things decide whether BC works, and you control one of them:</p>
<ul><li><b>Features.</b> The network sees whatever you put in the observation. Raw world coordinates force it to memorise where things were. <b>Relative</b> quantities (cube − hand, bin − hand) describe the task the same way wherever the cube is, so a small network generalises. Scale matters too: inputs around ±1 train far better than inputs around ±0.01.</li>
<li><b>How much data.</b> The lab trains on 10, 20 and 40 demos. Expect a cliff, not a slope: small errors compound (the policy drifts into states the expert never visited, the <b>covariate shift</b> problem), so success stays near zero until coverage is good enough.</li></ul>
<p><b>Your task</b>: write <code>observation(ee, cube, bin, gap, gapv, grip)</code> returning a flat list of numbers for the network. <code>ee</code>, <code>cube</code>, <code>bin</code> are (x, y, z) in metres; <code>gap</code> is the finger opening (0.072 open, about 0.04 holding a cube); <code>gapv</code> its speed; <code>grip</code> the last gripper command (0 or 1). Also write <code>mse(pred, target)</code>. Pass: at least 14 of 20 held-out layouts solved with 40 demos. Training and evaluation take about 30 seconds.</p>`,
    starter: `def observation(ee, cube, bin, gap, gapv, grip):
    # Works badly: absolute positions, tiny numbers. Make it relative and scale it.
    return list(ee) + list(cube) + list(bin) + [gap, gapv, grip]

def mse(pred, target):
    return ...
`,
    solution: `def observation(ee, cube, bin, gap, gapv, grip):
    rel_cube = [(cube[i] - ee[i]) * 10 for i in range(3)]
    rel_bin = [(bin[0] - ee[0]) * 10, (bin[1] - ee[1]) * 10]
    return rel_cube + rel_bin + [(ee[2] - 0.06) * 10, (gap - 0.04) * 30, gapv * 10, grip]

def mse(pred, target):
    return sum((p - t) ** 2 for p, t in zip(pred, target)) / len(pred)
`,
    hint: 'Use differences like <code>(cube[i] - ee[i]) * 10</code> and <code>(bin[i] - ee[i]) * 10</code>, keep the hand height, and scale the gap: <code>(gap - 0.04) * 30</code>.',
    tests: [
      ['mse', `assert abs(mse([1, 2, 3], [1, 2, 5]) - 4 / 3) < 1e-9`],
      ['observation returns a flat list of numbers', `o = observation((0.2, 0, 0.1), (0.3, 0.1, 0.02), (0.27, -0.17, 0.1), 0.07, 0.0, 0)\nassert isinstance(o, list) and 4 <= len(o) <= 40 and all(isinstance(v, (int, float)) for v in o)`],
    ],
  },
  {
    id: 'flow', course: 'learn', title: 'Flow matching: when there are two right answers', viz: 'flowlab',
    text: `<p>Ask ten people to pass an obstacle and some go left, some go right. Both are right; the <i>average</i> (straight into it) is wrong. A network trained with MSE predicts exactly that average. This is why modern policies are <b>generative</b>: they sample one good action instead of averaging all of them. Diffusion Policy does it by denoising; ${A('2410.24164', 'π0')} and SmolVLA use the simpler <b>flow matching</b> (${A('2210.02747', 'Lipman et al., 2022')}).</p>
<p>Flow matching in four lines:</p>
<ol><li>Take a noise sample x₀ and a real action x₁. Pick a random time t in [0, 1].</li><li>Stand on the straight line between them: <code>x_t = (1 − t)·x₀ + t·x₁</code>.</li><li>Train a network v(x_t, t) to predict the line’s velocity: <code>x₁ − x₀</code>.</li><li>To sample: start from fresh noise and follow the learned velocity with small Euler steps: <code>x ← x + v(x, t)·dt</code>.</li></ol>
<p>Different noise ends at different modes, so the samples reproduce the whole distribution. π0 integrates its action chunk in 10 such steps.</p>
<p><b>Your task</b>: write <code>interpolate(x0, x1, t)</code>, <code>target_velocity(x0, x1)</code> and <code>sample(v, x0, steps)</code> (v is a function of (x, t); return the final x). The lab trains a real velocity network on a two-mode action distribution (go left = −1, go right = +1) using your first two functions, then draws samples with your third.</p>`,
    starter: `def interpolate(x0, x1, t):
    return ...

def target_velocity(x0, x1):
    return ...

def sample(v, x0, steps=20):
    x, dt = x0, 1.0 / steps
    for k in range(steps):
        t = k * dt
        x = ...
    return x
`,
    solution: `def interpolate(x0, x1, t):
    return (1 - t) * x0 + t * x1

def target_velocity(x0, x1):
    return x1 - x0

def sample(v, x0, steps=20):
    x, dt = x0, 1.0 / steps
    for k in range(steps):
        t = k * dt
        x = x + v(x, t) * dt
    return x
`,
    hint: 'Euler step: <code>x = x + v(x, t) * dt</code>.',
    tests: [
      ['the path is a straight line from noise to data', `assert interpolate(2.0, 6.0, 0.0) == 2.0 and interpolate(2.0, 6.0, 1.0) == 6.0 and interpolate(2.0, 6.0, 0.25) == 3.0\nassert target_velocity(2.0, 6.0) == 4.0`],
      ['Euler sampling follows a known velocity field', `x = sample(lambda x, t: 3.0, 1.0, 10)\nassert abs(x - 4.0) < 1e-9\nx = sample(lambda x, t: -x, 1.0, 1000)\nassert abs(x - 0.3679) < 1e-3, "integrating dx/dt = -x for 1 s should give e^-1, got %r" % x`],
    ],
  },
  {
    id: 'legged', course: 'learn', title: 'Legged locomotion: learn a gait', viz: 'leglab',
    text: `<p>Wheels need roads. Legs go anywhere, at a price: the robot is always about to fall. Modern quadrupeds and humanoids learn to walk with <b>reinforcement learning</b> in simulation, thousands of robots in parallel on a GPU with heavy domain randomization, then transfer zero-shot (${A('2109.11978', 'Rudin et al., 2021')}, “Learning to Walk in Minutes”, is the paper that made it routine). The reward is mostly: track the commanded velocity, stay upright, do not waste energy.</p>
<p>A browser tab cannot run 4,096 robots, but the loop is the same at small scale. We use two classic ingredients:</p>
<ul><li>A <b>central pattern generator</b> (CPG): each leg follows the same rhythm, shifted in phase. In a <b>trot</b>, diagonal legs move together: front-left and rear-right in phase, the other pair half a cycle later. Per leg: the hip swings as a sine; the knee bends only during the swing, to lift the foot.</li>
<li><b>Random search</b> over the gait’s parameters (amplitudes, frequency, knee timing): try a small random change, keep it if the robot walked farther. You met this in the RL course; ${A('1803.07055', 'Mania et al., 2018')} showed it can match deep RL on locomotion benchmarks.</li></ul>
<p><b>Your task</b>: set <code>TROT</code> (phases for FL, FR, RL, RR), write <code>leg_targets(t, phase, A, B, f, delta)</code> → (hip, knee) with <code>hip = 0.5 + A·sin θ</code>, <code>knee = −1.0 − B·max(0, sin(θ + delta))</code>, θ = 2π·f·t + phase, and <code>mutate(params, rng, sigma)</code> (add Gaussian noise <code>sigma[i]</code> to each parameter). The lab walks a MuJoCo quadruped with your gait, then improves it with 25 rounds of random search.</p>`,
    pre: 'import math, random\nSTART = [0.2, 0.3, 1.5, -1.57]   # A, B, f, delta\nSIGMA = [0.06, 0.1, 0.25, 0.4]\ndef gait(t, params):\n    return [leg_targets(t, ph, *params) for ph in TROT]\n',
    starter: `TROT = [0.0, ..., ..., 0.0]   # FL, FR, RL, RR

def leg_targets(t, phase, A, B, f, delta):
    th = 2 * math.pi * f * t + phase
    hip = ...
    knee = ...
    return (hip, knee)

def mutate(params, rng, sigma):
    return [...]
`,
    solution: `TROT = [0.0, math.pi, math.pi, 0.0]

def leg_targets(t, phase, A, B, f, delta):
    th = 2 * math.pi * f * t + phase
    hip = 0.5 + A * math.sin(th)
    knee = -1.0 - B * max(0.0, math.sin(th + delta))
    return (hip, knee)

def mutate(params, rng, sigma):
    return [p + rng.gauss(0, s) for p, s in zip(params, sigma)]
`,
    hint: 'Diagonal pairs share a phase: <code>[0, π, π, 0]</code>. Mutate: <code>[p + rng.gauss(0, s) for p, s in zip(params, sigma)]</code>.',
    tests: [
      ['trot: diagonal legs in phase, the other pair half a cycle later', `assert abs(TROT[0] - TROT[3]) < 1e-9 and abs(TROT[1] - TROT[2]) < 1e-9\nassert abs(abs(TROT[0] - TROT[1]) - math.pi) < 1e-9`],
      ['hip swings around 0.5, the knee only bends further', `h, k = leg_targets(0.0, 0.0, 0.2, 0.3, 1.5, 0.0)\nassert abs(h - 0.5) < 1e-9 and abs(k + 1.0) < 1e-9\nh, k = leg_targets(1 / 6, 0.0, 0.2, 0.3, 1.5, 0.0)\nassert abs(h - 0.7) < 1e-9 and abs(k + 1.3) < 1e-9\nks = [leg_targets(i / 50, 0.0, 0.2, 0.3, 1.5, 0.4)[1] for i in range(50)]\nassert max(ks) <= -1.0 + 1e-9`],
      ['mutate changes every parameter, reproducibly', `a = mutate(START, random.Random(1), SIGMA); b = mutate(START, random.Random(1), SIGMA)\nassert a == b and len(a) == 4 and all(x != y for x, y in zip(a, START))`],
    ],
  },
];
