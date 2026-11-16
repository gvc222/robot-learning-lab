// The simulation pipeline course: generate a scene, collect trajectories, train, run the policy, evaluate offline and online, then take it local.
const L = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
const defined = (body) => `<div class="card" style="margin:8px 0"><b>Already defined for you</b>: ${body}</div>`;

export const COURSES7 = [
  { id: 'pipeline', title: 'Simulation pipeline: scene to policy', blurb: 'The whole loop in MuJoCo: generate scenes, collect trajectories, train, run the policy, evaluate offline and online. Then take it to your own machine.' },
];

export const MORE7 = [
  {
    id: 'scenegen', course: 'pipeline', title: '1 · Generate a scene', viz: 'scenelab',
    text: `<p>Every robot-learning project starts with the world it learns in. A <b>scene generator</b> is a function from a random seed to a scene: where the objects are, how they are rotated, what they look like. The distribution it draws from <i>is</i> your task: too narrow and the policy memorises one layout, too wide (or unreachable) and nothing can solve it.</p>
<p>Our scene is the SO-101-style arm with a red cube to put in the bin and a blue distractor. A scene is two cubes, each <code>(x, y, yaw)</code>: metres on the table and a rotation in radians. The rules:</p>
<ul><li>Cubes must be <b>reachable</b>: x between 0.17 and 0.38, y between −0.02 and 0.26.</li><li>They must not touch: centres at least <code>MIN_GAP = 0.075</code> m apart.</li><li>Yaw is random in ±0.5 rad.</li><li>The <code>spread</code> argument scales the sampling box around the middle of the reachable area: 1.0 is the training distribution, larger values are harder, “out of distribution” test scenes (clamp to the reachable area so they stay solvable).</li><li>If no valid position is found after 50 tries, just keep the last one (never loop forever).</li><li>The same seed must give the same scene: reproducibility is what lets you re-run an evaluation later.</li></ul>
${defined('<code>math</code>, <code>random</code>, <code>X_RANGE = (0.17, 0.38)</code>, <code>Y_RANGE = (-0.02, 0.26)</code>, <code>MIN_GAP = 0.075</code>. <b>You write</b> <code>sample_scene(rng, spread=1.0)</code>, where <code>rng</code> is a <code>random.Random</code> you draw from (<code>rng.uniform(a, b)</code>). Return <code>{"red": (x, y, yaw), "blue": (x, y, yaw)}</code>.')}
<p><b>Your task</b>: fill in the sampler. The bench draws 150 of your scenes from above, steps the 3D view through a few, and checks that the scripted expert can actually solve them.</p>`,
    pre: 'import math, random\nX_RANGE = (0.17, 0.38)\nY_RANGE = (-0.02, 0.26)\nMIN_GAP = 0.075\n',
    starter: `def sample_scene(rng, spread=1.0):
    cx = (X_RANGE[0] + X_RANGE[1]) / 2
    cy = (Y_RANGE[0] + Y_RANGE[1]) / 2
    hx = (X_RANGE[1] - X_RANGE[0]) / 2 * spread
    hy = (Y_RANGE[1] - Y_RANGE[0]) / 2 * spread

    def one():
        x = ...                      # uniform around the middle, then clamp into X_RANGE
        y = ...
        yaw = rng.uniform(-0.5, 0.5)
        return (x, y, yaw)

    red = one()
    blue = one()
    for _ in range(50):              # resample the blue cube (at most 50 tries) until it is MIN_GAP away from the red one
        if ...:
            break
        blue = one()
    return {"red": red, "blue": blue}
`,
    solution: `def sample_scene(rng, spread=1.0):
    cx = (X_RANGE[0] + X_RANGE[1]) / 2
    cy = (Y_RANGE[0] + Y_RANGE[1]) / 2
    hx = (X_RANGE[1] - X_RANGE[0]) / 2 * spread
    hy = (Y_RANGE[1] - Y_RANGE[0]) / 2 * spread

    def one():
        x = min(X_RANGE[1], max(X_RANGE[0], rng.uniform(cx - hx, cx + hx)))
        y = min(Y_RANGE[1], max(Y_RANGE[0], rng.uniform(cy - hy, cy + hy)))
        yaw = rng.uniform(-0.5, 0.5)
        return (x, y, yaw)

    red = one()
    blue = one()
    for _ in range(50):
        if math.hypot(red[0] - blue[0], red[1] - blue[1]) >= MIN_GAP:
            break
        blue = one()
    return {"red": red, "blue": blue}
`,
    hint: 'Uniform around the middle: <code>rng.uniform(cx - hx, cx + hx)</code>, then <code>min(X_RANGE[1], max(X_RANGE[0], …))</code> to clamp. The check inside the loop is <code>math.hypot(red[0] - blue[0], red[1] - blue[1]) &gt;= MIN_GAP</code>. (Why a bounded loop and not <code>while</code>? With a very small spread no valid position may exist, and a <code>while</code> would hang forever. Always bound your retries.)',
    tests: [
      ['returns two cubes with (x, y, yaw)', `s = sample_scene(random.Random(1))\nassert set(s) == {"red", "blue"} and len(s["red"]) == 3 and len(s["blue"]) == 3`],
      ['cubes are on the reachable part of the table', `for i in range(300):\n    s = sample_scene(random.Random(i), 2.0)\n    for k in ("red", "blue"):\n        x, y, yaw = s[k]\n        assert X_RANGE[0] <= x <= X_RANGE[1] and Y_RANGE[0] <= y <= Y_RANGE[1], "%s cube at (%.2f, %.2f) is out of reach" % (k, x, y)\n        assert abs(yaw) <= 0.5 + 1e-9`],
      ['cubes never touch', `for i in range(300):\n    s = sample_scene(random.Random(i))\n    d = math.hypot(s["red"][0] - s["blue"][0], s["red"][1] - s["blue"][1])\n    assert d >= MIN_GAP - 1e-9, "scene %d: cubes only %.3f m apart" % (i, d)`],
      ['the same seed gives the same scene', `assert sample_scene(random.Random(7)) == sample_scene(random.Random(7))\nassert sample_scene(random.Random(7)) != sample_scene(random.Random(8))`],
      ['scenes are varied, and a bigger spread is more varied', `def sd(sp):\n    xs = [sample_scene(random.Random(i), sp)["red"][0] for i in range(300)]\n    m = sum(xs) / len(xs)\n    return (sum((x - m) ** 2 for x in xs) / len(xs)) ** 0.5\nassert sd(1.0) > 0.03, "scenes barely vary: sd %.3f" % sd(1.0)\nassert sd(1.0) > sd(0.6) * 1.3, "spread should widen the distribution"`],
    ],
  },
  {
    id: 'collectdata', course: 'pipeline', title: '2 · Collect trajectories', viz: 'collectlab', knobs: [{ name: 'SIGMA', min: 0, max: 0.5, step: 0.01 }],
    text: `<p>Imitation learning needs <b>trajectories</b>: sequences of (observation, action). In simulation you get them from a <b>scripted expert</b> that peeks at the true cube position, the cheap, perfect demonstrator real labs wish they had. The catch is a classic one: an expert that never makes mistakes only visits good states. When the learned policy drifts a little, it ends up somewhere the data never showed it, and errors compound (<i>covariate shift</i>).</p>
<p>The standard fix in simulation is <b>noise injection</b> (the idea behind DART): while recording, <i>execute</i> a perturbed action, but store the expert’s <b>clean</b> action as the label. Now the dataset contains states slightly off the ideal path, each labelled with how to get back.</p>
<p>The second half of collection is <b>filtering</b>. Keep only episodes that worked, and not the ones where the robot flailed for the whole time limit: bad data teaches bad habits.</p>
${defined('<code>math</code>, <code>random</code>, <code>SIGMA = 0.15</code> (noise scale, in action units where ±1 is full speed). <b>You write</b> <code>perturb(action, rng, sigma)</code>, where <code>action</code> is the expert’s <code>[dx, dy, dz, grip]</code> and <code>rng</code> a <code>random.Random</code>: return the action that will be <i>executed</i>. And <code>keep(success, n_steps)</code>.')}
<p><b>Your task</b>: write both. <code>perturb</code> adds <code>rng.gauss(0, sigma)</code> to the three motion numbers, clips them to [−1, 1], and leaves the gripper command exactly as is (a flipped gripper command drops the cube). <code>keep</code> accepts an episode only if it succeeded in fewer than 250 steps. Drag the <b>SIGMA</b> knob on the bench: with no noise the dataset covers few states, with too much the expert itself starts failing.</p>`,
    pre: 'import math, random\nSIGMA = 0.15\n',
    starter: `def perturb(action, rng, sigma):
    noisy = [..., ..., ...]            # the three motion numbers, each plus Gaussian noise, clipped to [-1, 1]
    return noisy + [action[3]]         # leave the gripper alone

def keep(success, n_steps):
    return ...
`,
    solution: `def perturb(action, rng, sigma):
    noisy = [max(-1.0, min(1.0, action[i] + rng.gauss(0, sigma))) for i in range(3)]
    return noisy + [action[3]]

def keep(success, n_steps):
    return success and n_steps < 250
`,
    hint: 'A list comprehension: <code>[max(-1.0, min(1.0, action[i] + rng.gauss(0, sigma))) for i in range(3)]</code>. For <code>keep</code> combine both conditions with <code>and</code>.',
    tests: [
      ['perturb returns four numbers and keeps the gripper', `a = perturb([0.5, -0.2, 0.1, 1], random.Random(0), 0.2)\nassert len(a) == 4 and a[3] == 1`],
      ['with sigma = 0 nothing changes', `a = perturb([0.5, -0.2, 0.1, 0], random.Random(0), 0.0)\nassert all(abs(x - y) < 1e-12 for x, y in zip(a, [0.5, -0.2, 0.1, 0])), "got %r" % (a,)`],
      ['noise stays inside [-1, 1]', `r = random.Random(1)\nfor _ in range(500):\n    a = perturb([0.95, -0.95, 0.0, 0], r, 0.5)\n    assert all(-1.0 <= v <= 1.0 for v in a[:3]), "unclipped: %r" % (a,)`],
      ['the noise has the right size', `r = random.Random(2)\nd = [perturb([0, 0, 0, 0], r, 0.2)[0] for _ in range(2000)]\nm = sum(d) / len(d)\nsd = (sum((x - m) ** 2 for x in d) / len(d)) ** 0.5\nassert 0.16 < sd < 0.24, "sd %.3f, expected about 0.2" % sd`],
      ['keep only successful, reasonably short episodes', `assert keep(True, 120) is True or keep(True, 120) == True\nassert not keep(False, 120)\nassert not keep(True, 260)`],
    ],
  },
  {
    id: 'trainloop', course: 'pipeline', title: '3 · Train the model', viz: 'trainlab', knobs: [{ name: 'BASE_LR', min: 0.0005, max: 0.012, step: 0.0005 }],
    text: `<p>You now have (observation, action) pairs. Training a behaviour-cloning policy is supervised learning: minimise the squared error between the network’s output and the expert’s action. The network here is real (two hidden layers of 64 units, trained in your browser). The craft is in the loop around it:</p>
<ul><li><b>Learning-rate schedule.</b> Large steps early to move fast, small steps late to settle. A <b>cosine decay</b> from <code>base</code> down to 10% of it is the common default: <code>lr = base · (0.1 + 0.9 · ½ · (1 + cos(π · epoch / epochs)))</code>.</li><li><b>Validation loss.</b> A slice of the data is never trained on; its loss tells you when the network starts memorising instead of learning.</li><li><b>Early stopping with best-weights.</b> Stop when validation loss has not improved for <code>patience</code> epochs, and keep the weights from the <i>best</i> epoch, not the last one.</li></ul>
${defined('<code>math</code>, <code>BASE_LR = 0.004</code>, <code>PATIENCE = 10</code>. <b>You write</b> three functions: <code>lr_schedule(epoch, epochs, base)</code> (a number), <code>best_epoch(val_losses)</code> (the index of the lowest validation loss) and <code>should_stop(val_losses, patience)</code> (True once the best epoch is at least <code>patience</code> epochs behind the newest one). <code>val_losses</code> is a list with one number per finished epoch.')}
<p><b>Your task</b>: write the three. The bench records 40 demonstrations in MuJoCo, trains with <i>your</i> schedule and stopping rule, restores the best weights, and rolls the result out on 10 new layouts. Move the <b>BASE_LR</b> knob and watch the loss curves.</p>`,
    pre: 'import math\nBASE_LR = 0.004\nPATIENCE = 10\n',
    starter: `def lr_schedule(epoch, epochs, base):
    return ...                          # cosine decay from base down to 0.1 * base

def best_epoch(val_losses):
    return ...                          # index of the smallest value

def should_stop(val_losses, patience):
    # True when the best epoch is at least 'patience' epochs older than the newest epoch
    return ...
`,
    solution: `def lr_schedule(epoch, epochs, base):
    return base * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * epoch / epochs)))

def best_epoch(val_losses):
    return min(range(len(val_losses)), key=lambda i: val_losses[i])

def should_stop(val_losses, patience):
    return len(val_losses) - 1 - best_epoch(val_losses) >= patience
`,
    hint: 'Cosine: <code>base * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * epoch / epochs)))</code>. Index of the minimum: <code>min(range(len(v)), key=lambda i: v[i])</code>. Newest index is <code>len(v) - 1</code>.',
    tests: [
      ['learning rate starts at base and decays to 10%', `assert abs(lr_schedule(0, 40, 0.01) - 0.01) < 1e-12\nassert abs(lr_schedule(40, 40, 0.01) - 0.001) < 1e-9\nassert lr_schedule(10, 40, 0.01) > lr_schedule(30, 40, 0.01)`],
      ['halfway the rate is 55% of base', `assert abs(lr_schedule(20, 40, 1.0) - 0.55) < 1e-9`],
      ['best_epoch finds the lowest validation loss', `assert best_epoch([0.5, 0.3, 0.2, 0.25, 0.4]) == 2\nassert best_epoch([0.1]) == 0`],
      ['should_stop waits for patience epochs without improvement', `v = [0.5, 0.3, 0.2, 0.25, 0.26, 0.27]\nassert should_stop(v, 3) is True or should_stop(v, 3) == True\nassert not should_stop(v, 4)\nassert not should_stop([0.5, 0.4, 0.3], 2)`],
    ],
  },
  {
    id: 'runpolicy', course: 'pipeline', title: '4 · Run the policy', viz: 'runlab', knobs: [{ name: 'ALPHA', min: 0.05, max: 1, step: 0.05 }],
    text: `<p>A trained network outputs four raw numbers. To <i>run</i> it you close the loop: observe, predict, convert the prediction into a legal command, act, and repeat 20 times a second. Two small pieces of glue decide whether a good network looks good on the robot:</p>
<ul><li><b>Post-processing.</b> The network can output 1.3 or −0.4 for a motion that only accepts [−1, 1], and 0.62 for a gripper that is either open or closed. Clip the motion and threshold the gripper at 0.5.</li><li><b>Action smoothing.</b> Networks jitter from step to step. An <b>exponential moving average</b> blends the new command with the previous one: <code>smooth = α·new + (1 − α)·previous</code>. α = 1 follows the network exactly (jittery); a small α is smooth but lags behind the target (the arm overshoots or misses). Real policies fight the same trade-off with action chunking and temporal ensembling.</li></ul>
${defined('<code>math</code>, <code>ALPHA = 0.9</code>. <b>You write</b> <code>postprocess(raw)</code> (takes the network’s four numbers, returns a list of four: three motion values in [−1, 1] and the gripper as exactly 0 or 1) and <code>smooth(prev, new, alpha)</code> (takes two lists of three numbers, returns the blended list).')}
<p><b>Your task</b>: write both. The bench runs the reference policy (trained on 40 demos) through <i>your</i> glue on 12 layouts and shows a live rollout. Drag the <b>ALPHA</b> knob.</p>`,
    pre: 'import math\nALPHA = 0.9\n',
    starter: `def postprocess(raw):
    motion = [..., ..., ...]            # clip each of the first three numbers into [-1, 1]
    grip = ...                          # 1 if raw[3] > 0.5 else 0
    return motion + [grip]

def smooth(prev, new, alpha):
    return [... for p, n in zip(prev, new)]
`,
    solution: `def postprocess(raw):
    motion = [max(-1.0, min(1.0, v)) for v in raw[:3]]
    grip = 1 if raw[3] > 0.5 else 0
    return motion + [grip]

def smooth(prev, new, alpha):
    return [alpha * n + (1 - alpha) * p for p, n in zip(prev, new)]
`,
    hint: 'Clip: <code>max(-1.0, min(1.0, v))</code>. Blend: <code>alpha * n + (1 - alpha) * p</code>.',
    tests: [
      ['postprocess clips motion and thresholds the gripper', `a = postprocess([1.4, -0.3, -2.0, 0.62])\nassert a == [1.0, -0.3, -1.0, 1], "got %r" % (a,)\nassert postprocess([0, 0, 0, 0.4])[3] == 0`],
      ['smooth blends old and new', `s = smooth([0.0, 1.0, -1.0], [1.0, 1.0, 1.0], 0.25)\nassert all(abs(x - y) < 1e-12 for x, y in zip(s, [0.25, 1.0, -0.5])), "got %r" % (s,)`],
      ['alpha = 1 follows the network, alpha = 0 ignores it', `assert smooth([0.2, 0.2, 0.2], [0.9, -0.9, 0.0], 1.0) == [0.9, -0.9, 0.0]\nassert smooth([0.2, 0.2, 0.2], [0.9, -0.9, 0.0], 0.0) == [0.2, 0.2, 0.2]`],
    ],
  },
  {
    id: 'offlineeval', course: 'pipeline', title: '5 · Offline evaluation', viz: 'offlab',
    text: `<p><b>Offline evaluation</b> scores a policy on data you already have, with no robot or simulator in the loop: feed held-out observations, compare the predicted actions with the recorded ones. It is the fast, cheap check you run after every epoch.</p>
<p>The standard metric is the <b>mean squared error</b> over all action dimensions. The honest question is how well it predicts what you really want, <b>success in the world</b>. Checkpoints with lower error usually, but not always, perform better, because MSE treats every mistake equally: jitter in a harmless direction counts exactly as much as a wrong gripper decision at the critical moment.</p>
<p>To quantify that, use a <b>rank correlation</b>: do checkpoints rank the same way by offline error and by online success? <b>Spearman’s ρ</b> is the Pearson correlation of the <i>ranks</i>. With ties (several checkpoints with equal success) give tied values the average of their ranks.</p>
${defined('<code>math</code>. <b>You write</b> <code>mean_squared_error(preds, targets)</code> (two lists of equal-length action lists; average the squared difference over every number) and <code>spearman(xs, ys)</code>.')}
<p><b>Your task</b>: write both. The bench scores five training checkpoints offline on held-out expert data and online with 10 rollouts each, and uses <i>your</i> <code>spearman</code> to tell you how much the offline number told you.</p>`,
    pre: 'import math\n',
    starter: `def mean_squared_error(preds, targets):
    total, count = 0.0, 0
    for p, t in zip(preds, targets):
        for a, b in zip(p, t):
            total += ...
            count += 1
    return ...

def ranks(values):
    # rank 1 = smallest; tied values share the average of their ranks
    order = sorted(range(len(values)), key=lambda i: values[i])
    r = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = ...          # average of ranks i+1 .. j+1
        i = j + 1
    return r

def spearman(xs, ys):
    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    cov = ...
    vx = sum((a - mx) ** 2 for a in rx)
    vy = sum((b - my) ** 2 for b in ry)
    return cov / math.sqrt(vx * vy) if vx > 0 and vy > 0 else 0.0
`,
    solution: `def mean_squared_error(preds, targets):
    total, count = 0.0, 0
    for p, t in zip(preds, targets):
        for a, b in zip(p, t):
            total += (a - b) ** 2
            count += 1
    return total / count

def ranks(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    r = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r

def spearman(xs, ys):
    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    vx = sum((a - mx) ** 2 for a in rx)
    vy = sum((b - my) ** 2 for b in ry)
    return cov / math.sqrt(vx * vy) if vx > 0 and vy > 0 else 0.0
`,
    hint: 'Squared error: <code>(a - b) ** 2</code>; the mean is <code>total / count</code>. Tied ranks i+1 … j+1 average to <code>(i + j) / 2 + 1</code>. Covariance of the ranks: <code>sum((a - mx) * (b - my) for a, b in zip(rx, ry))</code>.',
    tests: [
      ['mean squared error', `assert abs(mean_squared_error([[1, 2], [3, 4]], [[1, 2], [3, 6]]) - 1.0) < 1e-12`],
      ['ranks handle ties', `assert ranks([10, 20, 20, 30]) == [1.0, 2.5, 2.5, 4.0], ranks([10, 20, 20, 30])`],
      ['perfectly monotone data has rho = 1, reversed has rho = -1', `assert abs(spearman([1, 2, 3, 4], [10, 20, 35, 90]) - 1) < 1e-12\nassert abs(spearman([1, 2, 3, 4], [9, 7, 3, 1]) + 1) < 1e-12`],
      ['a known mixed case', `assert abs(spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]) - 0.8) < 1e-12`],
    ],
  },
  {
    id: 'onlineeval', course: 'pipeline', title: '6 · Online evaluation', viz: 'onlinelab',
    text: `<p><b>Online evaluation</b> means running the policy and counting successes. In simulation it is cheap and fully repeatable: fix a list of <b>seeds</b> so every policy faces the same scenes, then report a success rate <i>with an interval</i>. (The earlier Evaluation statistics lesson derived Wilson intervals; here you use one in an eval harness.)</p>
<p>Three things to build:</p>
<ul><li><code>evaluate(rollout, seeds)</code>: call <code>rollout(seed)</code> (it returns True or False) for each seed and return <code>(successes, n)</code>. In a real harness <code>rollout</code> is the simulator episode.</li><li><code>wilson(k, n)</code>: the 95% interval for k successes in n trials, <code>centre = (p + z²/2n) / (1 + z²/n)</code>, <code>half = z·√(p(1−p)/n + z²/4n²) / (1 + z²/n)</code> with z = 1.96.</li><li><code>significantly_better(k1, n1, k2, n2)</code>: a two-proportion z-test with the pooled rate <code>p = (k1+k2)/(n1+n2)</code>, <code>z = (p1 − p2) / √(p(1−p)(1/n1 + 1/n2))</code>. Return True only if policy 1 is better and <code>z &gt; 1.96</code>.</li></ul>
<p>The bench compares a policy trained on 4 demos against the 40-demo policy on the same 30 seeds, then tests the 24-demo policy on scenes drawn from a wider layout distribution (out of distribution). Online evaluation can also include <b>perturbations</b> (a changed friction, a pushed cube); the Sim-to-real lesson has those knobs.</p>
${defined('<code>math</code>. <b>You write</b> the three functions above. <code>rollout</code> is a function the bench hands to your <code>evaluate</code>.')}
<p><b>Your task</b>: write them. Then read the verdicts: is the difference real, or inside the noise?</p>`,
    pre: 'import math\n',
    starter: `def evaluate(rollout, seeds):
    k = 0
    for s in seeds:
        if ...:
            k += 1
    return k, len(seeds)

def wilson(k, n, z=1.96):
    p = k / n
    denom = 1 + z * z / n
    centre = ...
    half = ...
    return (max(0.0, centre - half), min(1.0, centre + half))

def significantly_better(k1, n1, k2, n2):
    p1, p2 = k1 / n1, k2 / n2
    p = (k1 + k2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    if se == 0:
        return False
    return ...
`,
    solution: `def evaluate(rollout, seeds):
    k = 0
    for s in seeds:
        if rollout(s):
            k += 1
    return k, len(seeds)

def wilson(k, n, z=1.96):
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))

def significantly_better(k1, n1, k2, n2):
    p1, p2 = k1 / n1, k2 / n2
    p = (k1 + k2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    if se == 0:
        return False
    return (p1 - p2) / se > 1.96
`,
    hint: 'Count with <code>if rollout(s):</code>. Wilson: <code>centre = (p + z*z/(2*n)) / denom</code> and <code>half = z * math.sqrt(p*(1-p)/n + z*z/(4*n*n)) / denom</code>. Last line: <code>return (p1 - p2) / se &gt; 1.96</code>.',
    tests: [
      ['evaluate counts successes', `k, n = evaluate(lambda s: s % 3 == 0, list(range(30)))\nassert (k, n) == (10, 30), (k, n)`],
      ['Wilson interval for 8 of 10', `lo, hi = wilson(8, 10)\nassert abs(lo - 0.4902) < 1e-3 and abs(hi - 0.9433) < 1e-3, (lo, hi)`],
      ['Wilson stays inside [0, 1] at the extremes', `lo, hi = wilson(10, 10)\nassert 0.6 < lo < 1.0 and hi <= 1.0\nlo, hi = wilson(0, 10)\nassert lo >= 0.0 and 0 < hi < 0.4`],
      ['a clear difference is significant, a small one is not, and direction matters', `assert significantly_better(27, 30, 12, 30)\nassert not significantly_better(16, 30, 14, 30)\nassert not significantly_better(12, 30, 27, 30)`],
    ],
  },
  {
    id: 'pipelinelocal', course: 'pipeline', kind: 'read', title: '7 · Take it local: your own sim and your own GPU',
    text: `<p>Everything in this course ran in your browser. The real version has the same six stages, with bigger parts. Here is how to run it for real, in order of effort.</p>
<h3>Step 1: the same loop on your laptop (no GPU needed)</h3>
<p>MuJoCo is a pip install: <code>pip install mujoco</code>. A first script that loads a scene, steps it and renders:</p>
<pre class="term" style="max-height:none">import mujoco, numpy as np
model = mujoco.MjModel.from_xml_path("scene.xml")   # your MJCF from the Build a world lesson
data = mujoco.MjData(model)
with mujoco.viewer.launch_passive(model, data) as v:   # python -m mujoco.viewer also works
    while v.is_running():
        mujoco.mj_step(model, data); v.sync()</pre>
<p>Then port each stage: your <code>sample_scene</code> becomes a function that writes MJCF (or moves bodies by name), the expert becomes a Python function, and trajectories are saved as episodes (a few NumPy arrays or a ${L('https://github.com/huggingface/lerobot', 'LeRobotDataset')}).</p>
<h3>Step 2: use a standard framework</h3>
<p><b>LeRobot</b> already has the whole pipeline for imitation learning: record or load a dataset, <code>lerobot-train</code> (policy types such as ACT and Diffusion Policy), <code>lerobot-eval</code> on a simulated environment (it supports gym-style envs such as PushT and ALOHA sim, installed as extras). Check its README for the current flags, they change quickly.</p>
<h3>Step 3: where to get a GPU</h3>
<p>The small policies here train on a laptop CPU. Real policies (ACT, Diffusion Policy, then VLAs) want a GPU. Your options:</p>
<ul><li><b>Your own NVIDIA GPU.</b> Install a CUDA build of PyTorch. VRAM is the limit: ACT and Diffusion Policy fit comfortably on a consumer card with 8–12 GB; large VLAs need much more or LoRA fine-tuning. Use a smaller batch size when you run out of memory.</li><li><b>Free notebooks.</b> Google Colab or Kaggle give you a shared GPU for a few hours: enough for a first ACT run on a small dataset.</li><li><b>Rented cloud GPUs.</b> Pay by the hour on providers such as Lambda, RunPod or Vast.ai, or the big clouds. Prices and availability change monthly, so look at the current price list; as a rule, small policies cost a few dollars per run, large fine-tunes cost far more. Always <b>stop the instance</b> when you finish, and save checkpoints to storage that outlives it.</li><li><b>Apple silicon:</b> PyTorch’s MPS backend works for small models, but not every operation is supported.</li></ul>
<p>A tidy workflow: develop and debug on a tiny dataset on your laptop, then rent a GPU only for the long run, with the exact same command line.</p>
<h3>Optional project: the full pipeline, outside the browser</h3>
<ol><li>Create a repo with folders <code>scenes/</code>, <code>collect/</code>, <code>train/</code>, <code>eval/</code>.</li><li>Port your scene generator and expert to MuJoCo in Python; collect 100 noisy demos; save them.</li><li>Train a policy (start with your own PyTorch MLP, then try LeRobot’s ACT).</li><li>Write <code>eval.py</code>: fixed seeds, 50 rollouts, a Wilson interval, and a table comparing at least two policies. Add an out-of-distribution seed set.</li><li>Stretch goals: more objects, a camera observation (then a CNN), a second task, domain randomization, and a README with your results table. Publish it.</li></ol>`,
  },
];
