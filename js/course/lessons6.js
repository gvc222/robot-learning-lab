// Week 5 additions: 3D rotations, singularities, trajectory timing, and SLAM.
const L = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
const defined = (body) => `<div class="card" style="margin:8px 0"><b>Already defined for you</b>: ${body}</div>`;

export const MORE6 = [
  {
    id: 'rotations', course: 'core2', title: 'Rotation matrices and 3D rigid-body transforms',
    text: `<p>Everything so far lived in a plane, where one angle describes an orientation. In 3D a hand can point anywhere, and “where is the cube relative to the gripper?” needs <b>coordinate frames</b>. A frame is an origin plus three perpendicular axes. A <b>rigid-body transform</b> says how frame B sits in frame A: a rotation <b>R</b> (a 3×3 matrix) and a translation <b>p</b> (the origin of B, written in A).</p>
<p>A point <code>v</code> given in frame B has these coordinates in frame A:</p>
<p class="mono">v<sub>A</sub> = R · v<sub>B</sub> + p</p>
<p>A rotation matrix has three useful properties. Its columns are the axes of B written in A. It is orthonormal, so the inverse is the transpose: <code>R⁻¹ = Rᵀ</code> (cheap and exact). And rotations <b>do not commute</b>: turning 90° about x then about z is not the same as z then x. Order is the most common bug in robotics code.</p>
<p>Rotations about the coordinate axes (right-hand rule: thumb along the axis, fingers curl in the positive direction):</p>
<p class="mono">Rz(a) = [[cos a, −sin a, 0], [sin a, cos a, 0], [0, 0, 1]]<br>Rx(a) = [[1, 0, 0], [0, cos a, −sin a], [0, sin a, cos a]]</p>
<p>To undo a transform: <code>v<sub>B</sub> = Rᵀ · (v<sub>A</sub> − p)</code>, so the inverse transform is <code>(Rᵀ, −Rᵀ·p)</code>. Real stacks pack R and p into one 4×4 <i>homogeneous</i> matrix so chains of frames multiply together (this is what ROS 2 <code>tf2</code> does), and often store orientation as a <b>quaternion</b> to avoid gimbal lock when using three Euler angles.</p>
${defined('<code>math</code>, plus helpers <code>matmul(A, B)</code> (3×3 times 3×3), <code>matvec(R, v)</code> (3×3 times a 3-vector), <code>transpose(R)</code>, and <code>IDENTITY</code>. <b>You write</b> <code>rot_x(a)</code>, <code>rot_z(a)</code> (angle in radians, return a 3×3 list of lists), <code>to_frame_a(R, p, v)</code> and <code>inverse(R, p)</code> (returns the pair <code>(R_inv, p_inv)</code>).')}
<p><b>Your task</b>: fill in the four functions. The tests check the right-hand rule, that order matters, and that your inverse really undoes the transform.</p>`,
    pre: `import math
IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
def matmul(A, B): return [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
def matvec(R, v): return [sum(R[i][k] * v[k] for k in range(3)) for i in range(3)]
def transpose(R): return [[R[j][i] for j in range(3)] for i in range(3)]
`,
    starter: `def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return [[1, 0, 0],
            [0, ..., ...],
            [0, ..., ...]]

def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return [[..., ..., 0],
            [..., ..., 0],
            [0, 0, 1]]

def to_frame_a(R, p, v):
    # coordinates in frame A of a point v given in frame B
    return ...

def inverse(R, p):
    Rt = transpose(R)
    return Rt, ...
`,
    solution: `def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return [[1, 0, 0],
            [0, c, -s],
            [0, s, c]]

def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return [[c, -s, 0],
            [s, c, 0],
            [0, 0, 1]]

def to_frame_a(R, p, v):
    rv = matvec(R, v)
    return [rv[i] + p[i] for i in range(3)]

def inverse(R, p):
    Rt = transpose(R)
    rp = matvec(Rt, p)
    return Rt, [-x for x in rp]
`,
    hint: 'Rz has <code>[c, -s, 0]</code> and <code>[s, c, 0]</code> on top. For the inverse the translation is <code>-matvec(Rt, p)</code>: build it with <code>[-x for x in matvec(Rt, p)]</code>.',
    tests: [
      ['rot_z follows the right-hand rule', `v = matvec(rot_z(math.pi / 2), [1, 0, 0])\nassert abs(v[0]) < 1e-9 and abs(v[1] - 1) < 1e-9 and abs(v[2]) < 1e-9, "x axis turned 90 degrees about z should land on y, got %r" % v`],
      ['rot_x turns y into z', `v = matvec(rot_x(math.pi / 2), [0, 1, 0])\nassert abs(v[1]) < 1e-9 and abs(v[2] - 1) < 1e-9 and abs(v[0]) < 1e-9, "got %r" % v`],
      ['R times its transpose is the identity', `R = matmul(rot_z(0.7), rot_x(-1.1))\nP = matmul(R, transpose(R))\nassert all(abs(P[i][j] - IDENTITY[i][j]) < 1e-9 for i in range(3) for j in range(3))`],
      ['rotation order matters', `A = matmul(rot_x(math.pi / 2), rot_z(math.pi / 2))\nB = matmul(rot_z(math.pi / 2), rot_x(math.pi / 2))\nassert max(abs(A[i][j] - B[i][j]) for i in range(3) for j in range(3)) > 0.5, "these two orders must give different matrices"\nv = matvec(A, [1, 0, 0])\nassert abs(v[0]) < 1e-9 and abs(v[1] - 0) < 1e-9 and abs(v[2] - 1) < 1e-9, "Rx(90) after Rz(90) sends x to z; got %r" % v`],
      ['to_frame_a rotates then translates', `v = to_frame_a(rot_z(math.pi / 2), [1, 2, 3], [1, 0, 0])\nassert abs(v[0] - 1) < 1e-9 and abs(v[1] - 3) < 1e-9 and abs(v[2] - 3) < 1e-9, "got %r" % v`],
      ['inverse undoes the transform', `R, p = matmul(rot_z(0.4), rot_x(1.2)), [0.3, -0.2, 0.5]\nRi, pi = inverse(R, p)\nfor v in ([0.1, 0.2, 0.3], [1, -1, 2]):\n    w = to_frame_a(Ri, pi, to_frame_a(R, p, v))\n    assert all(abs(w[i] - v[i]) < 1e-9 for i in range(3)), "round trip gave %r instead of %r" % (w, v)`],
    ],
  },
  {
    id: 'singularity', course: 'core2', title: 'Singularities and manipulability', viz: 'singlab',
    text: `<p>You met singularities as “the arm fully stretched”. Now measure them. At a singular pose the Jacobian loses rank: there is a direction the hand <i>cannot</i> move however fast the joints turn, and the inverse problem (what joint speeds give this hand velocity?) needs infinite speed.</p>
<p>A smooth way to score how far a pose is from that is <b>manipulability</b> (Yoshikawa, 1985):</p>
<p class="mono">w(q) = √det(J·Jᵀ)</p>
<p>Geometrically, unit-speed joint motions trace a circle in joint space and the Jacobian turns it into an <b>ellipse</b> of reachable hand velocities. w is proportional to the ellipse’s area: round and big is a dexterous pose, thin and flat is near a singularity, and w = 0 means the ellipse has collapsed to a line. For our two-link arm it simplifies to <code>w = L1·L2·|sin θ₂|</code>: zero when the elbow is straight (θ₂ = 0) or folded flat (θ₂ = π), best at a right-angle elbow.</p>
<p>Practical consequences: plan paths that keep w above a margin, avoid placing objects at the very edge of the workspace, and keep damped least squares (last lesson) as the safety net. The lab paints w across the workspace using <i>your</i> function.</p>
${defined('<code>math</code>, <code>L1 = 0.116</code>, <code>L2 = 0.135</code>, <code>jacobian(t1, t2)</code> (2×2 list of lists, from the Jacobian lesson), and <code>ik(x, y)</code> returning <code>(theta1, theta2)</code>. <b>You write</b> <code>manipulability(t1, t2)</code> returning a number, and <code>is_safe(x, y, min_w)</code> returning True or False.')}
<p><b>Your task</b>: write <code>manipulability</code> from the definition (use the provided <code>jacobian</code>; the 2×2 determinant is <code>a·d − b·c</code>), then <code>is_safe</code>: solve IK for the target and check that w is at least <code>min_w</code>.</p>`,
    pre: `import math
L1, L2 = 0.116, 0.135
def jacobian(t1, t2):
    s1, c1, s12, c12 = math.sin(t1), math.cos(t1), math.sin(t1 + t2), math.cos(t1 + t2)
    return [[-L1 * s1 - L2 * s12, -L2 * s12], [L1 * c1 + L2 * c12, L2 * c12]]
def ik(x, y):
    c2 = max(-1.0, min(1.0, (x * x + y * y - L1 ** 2 - L2 ** 2) / (2 * L1 * L2)))
    t2 = math.acos(c2)
    return math.atan2(y, x) - math.atan2(L2 * math.sin(t2), L1 + L2 * math.cos(t2)), t2
`,
    starter: `def manipulability(t1, t2):
    J = jacobian(t1, t2)
    # A = J times J transposed (2x2), then w = sqrt(det(A))
    a = J[0][0]**2 + J[0][1]**2
    b = J[0][0]*J[1][0] + J[0][1]*J[1][1]
    d = J[1][0]**2 + J[1][1]**2
    return ...

def is_safe(x, y, min_w):
    t1, t2 = ik(x, y)
    return ...
`,
    solution: `def manipulability(t1, t2):
    J = jacobian(t1, t2)
    a = J[0][0]**2 + J[0][1]**2
    b = J[0][0]*J[1][0] + J[0][1]*J[1][1]
    d = J[1][0]**2 + J[1][1]**2
    return math.sqrt(max(0.0, a * d - b * b))

def is_safe(x, y, min_w):
    t1, t2 = ik(x, y)
    return manipulability(t1, t2) >= min_w
`,
    hint: 'det(A) is <code>a * d - b * b</code> because A is symmetric. Guard the square root with <code>max(0.0, ...)</code>: rounding can make the determinant a hair negative. For the second function: <code>return manipulability(t1, t2) >= min_w</code>.',
    tests: [
      ['matches the closed form L1·L2·|sin θ₂|', `for t1, t2 in [(0.3, 1.0), (1.2, -0.8), (-0.5, 2.0), (0.0, 0.2)]:\n    want = L1 * L2 * abs(math.sin(t2))\n    got = manipulability(t1, t2)\n    assert abs(got - want) < 1e-9, "at θ2=%.1f expected %.5f, got %.5f" % (t2, want, got)`],
      ['zero when the arm is stretched out, best at a right-angle elbow', `assert manipulability(0.4, 0.0) < 1e-9\nassert manipulability(0.4, math.pi / 2) > manipulability(0.4, 0.5)`],
      ['is_safe rejects the edge of the workspace and accepts a comfortable target', `assert is_safe(0.15, 0.10, 0.008) is True\nassert is_safe(L1 + L2 - 0.001, 0.0, 0.008) is False`],
    ],
  },
  {
    id: 'trajtime', course: 'core2', title: 'Trajectory timing: how fast can the joint go?', viz: 'trajlab',
    text: `<p>A planner gives a <i>path</i>: where the joint should go. A <b>trajectory</b> adds <i>time</i>: where it should be at each instant. The simplest robust recipe is the <b>trapezoidal velocity profile</b>: accelerate at a constant rate, cruise at a speed limit, decelerate symmetrically. The velocity graph is a trapezoid, and its area is the distance travelled.</p>
<p>Given a distance <code>d</code>, a speed limit <code>vmax</code> and an acceleration limit <code>amax</code> (all positive):</p>
<ul><li>Time to reach full speed: <code>ta = vmax / amax</code>, distance covered while doing so: <code>da = ½·amax·ta²</code>.</li><li>If <code>2·da ≤ d</code> there is room to cruise: total time <code>T = 2·ta + (d − 2·da) / vmax</code>.</li><li>Otherwise the move is too short to reach <code>vmax</code>: a <b>triangular</b> profile with peak speed <code>√(d·amax)</code> and <code>T = 2·√(d / amax)</code>.</li></ul>
<p>Why this matters: a policy’s target joint positions jump, and a servo that tries to follow a jump produces huge accelerations (jerk, noise, tripped current limits). Time-parameterising a path respects the motor’s limits. (Smoother still: minimum-jerk or S-curve profiles, as in the “smooth transitions” lesson. Production tools like Ruckig or MoveIt’s time parameterisation do this for many joints at once.)</p>
${defined('<code>math</code>. <b>You write</b> <code>total_time(d, vmax, amax)</code> (seconds) and <code>position(t, d, vmax, amax)</code> (the distance covered at time t; it should be 0 at t = 0 and equal d from t = T on).')}
<p><b>Your task</b>: implement both, handling the triangular case. The lab plots position, velocity and acceleration from your <code>position</code> function so you can check that the velocity really is a trapezoid.</p>`,
    pre: 'import math\n',
    starter: `def total_time(d, vmax, amax):
    ta = vmax / amax
    da = 0.5 * amax * ta * ta
    if 2 * da <= d:
        return ...          # accelerate, cruise, decelerate
    return ...              # triangular: never reaches vmax

def position(t, d, vmax, amax):
    T = total_time(d, vmax, amax)
    if t <= 0:
        return 0.0
    if t >= T:
        return d
    ta = min(vmax / amax, T / 2)     # time spent accelerating
    v = amax * ta                    # peak speed actually reached
    if t < ta:
        return ...                   # constant acceleration
    if t < T - ta:
        return ...                   # cruising
    return ...                       # decelerating: mirror image of the start
`,
    solution: `def total_time(d, vmax, amax):
    ta = vmax / amax
    da = 0.5 * amax * ta * ta
    if 2 * da <= d:
        return 2 * ta + (d - 2 * da) / vmax
    return 2 * math.sqrt(d / amax)

def position(t, d, vmax, amax):
    T = total_time(d, vmax, amax)
    if t <= 0:
        return 0.0
    if t >= T:
        return d
    ta = min(vmax / amax, T / 2)
    v = amax * ta
    if t < ta:
        return 0.5 * amax * t * t
    if t < T - ta:
        return 0.5 * amax * ta * ta + v * (t - ta)
    return d - 0.5 * amax * (T - t) ** 2
`,
    hint: 'Cruise: you have covered the acceleration distance <code>0.5*amax*ta*ta</code> plus <code>v*(t - ta)</code>. The braking phase is the start run backwards: distance remaining is <code>0.5*amax*(T - t)**2</code>, so <code>position = d - that</code>.',
    tests: [
      ['trapezoid time', `T = total_time(1.0, 1.0, 2.0)\nassert abs(T - 1.5) < 1e-9, "1 rad, vmax 1, amax 2 should take 1.5 s, got %r" % T`],
      ['triangular time for a short move', `T = total_time(0.1, 1.0, 2.0)\nassert abs(T - 2 * math.sqrt(0.05)) < 1e-9, "got %r" % T`],
      ['starts at 0, ends at d, never goes backwards', `d, vm, am = 1.0, 1.0, 2.0\nT = total_time(d, vm, am)\nprev = -1e-9\nfor i in range(0, 201):\n    p = position(T * i / 200, d, vm, am)\n    assert p >= prev - 1e-9, "went backwards at step %d" % i\n    prev = p\nassert abs(position(0, d, vm, am)) < 1e-9 and abs(position(T, d, vm, am) - d) < 1e-9`],
      ['respects the speed and acceleration limits', `d, vm, am = 1.0, 1.0, 2.0\nT = total_time(d, vm, am); dt = 1e-3\npos = [position(i * dt, d, vm, am) for i in range(int(T / dt) + 3)]\nvel = [(pos[i + 1] - pos[i]) / dt for i in range(len(pos) - 1)]\nacc = [(vel[i + 1] - vel[i]) / dt for i in range(len(vel) - 1)]\nassert max(vel) <= vm + 1e-2, "peak speed %.3f above the limit" % max(vel)\nassert max(abs(a) for a in acc[2:-2]) <= am * 1.05 + 20 * dt, "acceleration spikes to %.2f" % max(abs(a) for a in acc[2:-2])`],
    ],
  },
  {
    id: 'slam', course: 'mobile', title: 'SLAM: drift, loop closure and the pose graph', viz: 'slamlab',
    text: `<p>Odometry drifts, and lidar maps need to know where the robot was when each scan was taken. <b>SLAM</b> (Simultaneous Localization And Mapping) solves both at once: build the map <i>and</i> locate yourself in it, with no GPS and no prior map.</p>
<p>Almost every SLAM system has two halves:</p>
<ul><li><b>Front end</b>: from raw sensors, produce relative motion estimates (match this lidar scan to the last one, or track visual features) and notice <b>loop closures</b>: “I have been here before”.</li><li><b>Back end</b>: treat poses as nodes and measurements as constraints in a <b>pose graph</b>, then adjust all poses at once to best satisfy every constraint (a big least-squares problem; libraries like g2o, GTSAM and Ceres solve it).</li></ul>
<p>Dead reckoning (integrating odometry) alone makes errors accumulate without bound. A loop closure is the moment you learn the total error: you are back at the start, so the final pose <i>should</i> equal the first pose. The back end then spreads that error over the whole trajectory instead of leaving it all at the end.</p>
<p>The lab uses the simplest version of that idea so you can see it: drive a square, let the wheels slip a little, then <b>distribute the closing error linearly</b> along the path. Real back ends weigh each constraint by its uncertainty, but the picture is the same. You will meet this in practice as slam_toolbox (the default 2D lidar SLAM in ROS 2 Nav2), Cartographer, RTAB-Map and ORB-SLAM3.</p>
${defined('<code>math</code> and <code>odometry</code>, a list of <code>(distance, turn)</code> steps from drifting wheel encoders (metres and radians per step). <b>You write</b> <code>integrate(odometry)</code>, which returns the list of poses <code>[(x, y, heading), …]</code> starting at <code>(0, 0, 0)</code> (one pose per step plus the start), and <code>close_loop(poses)</code>, which returns corrected poses.')}
<p><b>Your task</b>: dead-reckon the poses (turn first, then move along the new heading), then implement the loop closure. The error at the end is <code>(x_N − x_0, y_N − y_0)</code>; pose <code>i</code> of <code>N</code> should be corrected by <code>i/N</code> of it.</p>`,
    pre: `import math
# a 2 m square: four sides of 20 steps (0.1 m each), a 90-degree turn at each corner, with slightly wrong wheels
odometry = []
for side in range(4):
    for k in range(20):
        odometry.append((0.1 * 1.012, 0.004 if k else 0.0))   # tiny steady heading drift, a bit too long a step
    odometry.append((0.0, math.pi / 2 * 1.03))                 # corner turn over-rotates by 3 percent
`,
    starter: `def integrate(odometry):
    x, y, th = 0.0, 0.0, 0.0
    poses = [(x, y, th)]
    for dist, turn in odometry:
        th += ...
        x += ...
        y += ...
        poses.append((x, y, th))
    return poses

def close_loop(poses):
    n = len(poses) - 1
    ex = poses[-1][0] - poses[0][0]
    ey = poses[-1][1] - poses[0][1]
    return [(x - ..., y - ..., th) for i, (x, y, th) in enumerate(poses)]
`,
    solution: `def integrate(odometry):
    x, y, th = 0.0, 0.0, 0.0
    poses = [(x, y, th)]
    for dist, turn in odometry:
        th += turn
        x += dist * math.cos(th)
        y += dist * math.sin(th)
        poses.append((x, y, th))
    return poses

def close_loop(poses):
    n = len(poses) - 1
    ex = poses[-1][0] - poses[0][0]
    ey = poses[-1][1] - poses[0][1]
    return [(x - ex * i / n, y - ey * i / n, th) for i, (x, y, th) in enumerate(poses)]
`,
    hint: 'Update the heading first: <code>th += turn</code>. Then <code>x += dist * math.cos(th)</code> and <code>y += dist * math.sin(th)</code>. In close_loop each pose moves by a fraction <code>i / n</code> of the end error: <code>x - ex * i / n</code>.',
    tests: [
      ['integrate starts at the origin and has one pose per step', `p = integrate([(1.0, 0.0), (1.0, math.pi / 2)])\nassert len(p) == 3 and p[0] == (0.0, 0.0, 0.0), "got %r" % (p,)`],
      ['dead reckoning follows the heading', `p = integrate([(1.0, 0.0), (1.0, math.pi / 2)])\nassert abs(p[1][0] - 1) < 1e-9 and abs(p[1][1]) < 1e-9\nassert abs(p[2][0] - 1) < 1e-9 and abs(p[2][1] - 1) < 1e-9, "second step turns left then moves 1 m, got %r" % (p[2],)`],
      ['the drifting square does not close (that is the problem)', `p = integrate(odometry)\nassert math.hypot(p[-1][0], p[-1][1]) > 0.1, "the end should be visibly away from the start, got %.3f m" % math.hypot(p[-1][0], p[-1][1])`],
      ['close_loop returns to the start and spreads the correction', `p = integrate(odometry); c = close_loop(p)\nassert len(c) == len(p)\nassert abs(c[-1][0] - c[0][0]) < 1e-9 and abs(c[-1][1] - c[0][1]) < 1e-9, "the loop is still open by %.3f m" % math.hypot(c[-1][0], c[-1][1])\nmid = len(p) // 2\nassert abs((p[mid][0] - c[mid][0]) - (p[-1][0] - c[-1][0]) / 2) < 1e-6, "the middle pose should take half of the correction"\nassert abs(c[0][0] - p[0][0]) < 1e-12 and abs(c[0][1] - p[0][1]) < 1e-12, "the start must not move"`],
    ],
  },
];
