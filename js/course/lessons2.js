// New courses: sim-to-real, reward models, data & language, hardware (SO-101), CoRL 2026 Review Club.
// Lesson kinds: Python (default: starter/solution/tests), quiz (questions), lab (an interactive widget).
// Every research number below comes from the cited paper; links go to arXiv / official docs.

const A = (id, text) => `<a href="https://arxiv.org/abs/${id}" target="_blank" rel="noopener">${text}</a>`;
const L = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
const LEROBOT_SO101 = 'https://huggingface.co/docs/lerobot/so101';
const SOARM = 'https://github.com/TheRobotStudio/SO-ARM100';

export const MORE = [
  // ───────────────────────── Simulation & sim-to-real ─────────────────────────
  {
    id: 'domainrand', course: 'sim', title: 'Sim-to-real: domain randomization', viz: 'domainrand',
    text: `<p>A simulator is a guess about the world. The real robot’s friction, masses, latency and camera pose are all a little different, so a policy that is perfect in one simulated world can fail on the real one. This is the <b>sim-to-real gap</b>.</p>
<p>The classic fix is <b>domain randomization</b>: during training, sample a different world every episode. If the policy works across all of them, the real world looks like just another sample.</p>
<p><b>Your task</b>: write <code>sample_physics(rng)</code>. Return a dict with <code>"friction"</code> drawn uniformly from 0.3 to 1.4 and <code>"mass"</code> uniformly from 0.7 to 3.0 (multipliers on the nominal values). Use <code>rng.uniform(a, b)</code>.</p>
<p>The lab then runs a fixed, non-randomized grasping controller in MuJoCo under 24 of your sampled worlds and plots which ones it survives. Then try the same knobs in <b>Eval → Physics</b>, and the <b>domain randomization</b> switch in <b>Train</b>.</p>`,
    pre: 'import random\n',
    starter: `def sample_physics(rng):\n    return {\n        "friction": ...,\n        "mass": ...,\n    }\n`,
    solution: `def sample_physics(rng):\n    return {\n        "friction": rng.uniform(0.3, 1.4),\n        "mass": rng.uniform(0.7, 3.0),\n    }\n`,
    hint: '<code>rng.uniform(0.3, 1.4)</code> gives a float in that range.',
    tests: [
      ['returns friction and mass', `s = sample_physics(random.Random(0))\nassert set(s) >= {"friction", "mass"}, "need keys friction and mass"`],
      ['values stay in range and actually vary', `r = random.Random(1)\nxs = [sample_physics(r) for _ in range(300)]\nf = [x["friction"] for x in xs]; m = [x["mass"] for x in xs]\nassert 0.3 <= min(f) and max(f) <= 1.4, "friction out of range"\nassert 0.7 <= min(m) and max(m) <= 3.0, "mass out of range"\nassert max(f) - min(f) > 0.8 and max(m) - min(m) > 1.5, "your samples barely vary: randomize!"`],
      ['uses the rng you are given (reproducible)', `assert sample_physics(random.Random(5)) == sample_physics(random.Random(5)), "same seed should give the same world"`],
    ],
  },

  // ───────────────────────── RL: reward models ─────────────────────────
  {
    id: 'rewardmodel', course: 'rl', title: 'Reward models: scoring robots automatically', viz: 'progress',
    text: `<p>In simulation, success is a line of code. On a real robot, someone has to watch every episode and judge it. A <b>reward model</b> is a vision-language model that does the watching.</p>
<p>NVIDIA’s ${A('2610.31779', 'FLORA')} (Oct 2026), the data engine behind GR00T, produces three kinds of label from video: an <b>outcome</b> score from 1 (failure) to 5 (success); <b>dense</b> labels every 0.5 s, each failure (1), suboptimal (2) or normal (3); and <b>rubric</b> rewards, where you list the steps of a task and each step’s allowed scores add up to at most 1.</p>
<p>It turns dense labels into a progress curve by weighting each step (failure 0, suboptimal 0.5, normal 1), accumulating, normalizing, and scaling by the outcome score mapped to [0, 1].</p>
<p><b>Your task</b>:</p><ol><li><code>rubric_score(grades, allowed)</code>: check that every grade is one of its step’s allowed values (else raise <code>ValueError</code>), and return the sum.</li><li><code>progress(labels, outcome)</code>: turn dense labels 1/2/3 into a cumulative progress list, scaled by <code>outcome</code> (already in [0, 1]).</li></ol>`,
    starter: `def rubric_score(grades, allowed):\n    # grades[i] must be in allowed[i]\n    ...\n\nWEIGHT = {1: 0.0, 2: 0.5, 3: 1.0}\n\ndef progress(labels, outcome):\n    q = [WEIGHT[l] for l in labels]\n    total = sum(q)\n    out, run = [], 0.0\n    for x in q:\n        run += x\n        out.append(...)\n    return out\n`,
    solution: `def rubric_score(grades, allowed):\n    for g, ok in zip(grades, allowed):\n        if g not in ok:\n            raise ValueError("grade %r not allowed" % (g,))\n    return sum(grades)\n\nWEIGHT = {1: 0.0, 2: 0.5, 3: 1.0}\n\ndef progress(labels, outcome):\n    q = [WEIGHT[l] for l in labels]\n    total = sum(q)\n    out, run = [], 0.0\n    for x in q:\n        run += x\n        out.append(outcome * run / total if total else 0.0)\n    return out\n`,
    hint: 'Progress at step t is <code>outcome * run / total</code>. For the rubric, loop with <code>zip(grades, allowed)</code>.',
    tests: [
      ['rubric: the FLORA “scoop beans” example scores 0.60', `allowed = [[0, 0.25], [0, 0.25], [0, 0.1, 0.25], [0, 0.25]]\nassert abs(rubric_score([0.25, 0.25, 0.1, 0.0], allowed) - 0.6) < 1e-9, "got %r" % (rubric_score([0.25, 0.25, 0.1, 0.0], allowed),)`],
      ['rubric: rejects a grade that is not allowed', `try:\n    rubric_score([0.3], [[0, 0.25]])\n    assert False, "0.3 is not an allowed grade: raise ValueError"\nexcept ValueError:\n    pass`],
      ['progress climbs to the outcome, flat on failures', `p = progress([3, 3, 1, 2, 3], 0.8)\nassert len(p) == 5\nassert abs(p[-1] - 0.8) < 1e-9, "progress should end at the outcome score"\nassert abs(p[2] - p[1]) < 1e-9, "a failure step adds no progress"\nassert all(b >= a for a, b in zip(p, p[1:])), "progress never goes down"`],
    ],
  },
  {
    id: 'rlfinetune', course: 'rl', title: 'RL fine-tuning with a reward model', kind: 'quiz',
    text: `<p>Imitation learning copies demonstrations; it can never get better than its teachers. <b>RL fine-tuning</b> lets a trained policy practise: roll out, score the attempt with a reward model, and nudge the policy toward attempts that scored well. Human-in-the-loop methods (like HIL-SERL, which ships in LeRobot) add an operator who takes over when the robot is about to fail, so practice is safer and faster.</p>
<p>The catch: the policy optimizes <i>what the reward model says</i>, not what actually happened. A reward model that gives credit for a near miss teaches near misses.</p>
<p><b>Try it</b>: train any policy, then open <b>Train → RL fine-tuning</b>. Every practice rollout runs in physics and is judged by a reward model that is right about 90% of the time; the log shows each mislabel.</p>`,
    quiz: [
      { q: 'Why can RL fine-tuning beat the demonstrations it started from?', options: ['It copies the demos more precisely', 'It improves from its own scored attempts, not only from what humans did', 'It uses a bigger model'], answer: 1 },
      { q: 'A reward model labels 30% of near-misses as successes. What happens during RL?', options: ['Nothing, RL is robust to label noise', 'The policy is rewarded for near-misses and may learn to stop just short', 'The policy trains faster'], answer: 1 },
      { q: 'What do human interventions add during practice?', options: ['Corrections exactly where the policy fails, plus safety', 'More GPU memory', 'A better language model'], answer: 0 },
    ],
  },

  // ───────────────────────── Data, language & human video ─────────────────────────
  {
    id: 'annotate', course: 'data', title: 'Subtask annotation', viz: 'segment',
    text: `<p>“Put the red cube in the bin” is one label for 8 seconds of motion. Inside it are phases: reach, grasp, carry, release, retreat. <b>Timestamped subtask captions</b> give a policy language at that finer grain, let you balance a dataset (“we have too few grasps of small objects”), and let a high-level model plan in subtasks.</p>
<p>FLORA ${A('2610.31779', '(NVIDIA, 2026)')} first <i>segments</i> a video into intervals, then captions each interval. You will write the segmenter, using two signals every teleop log already has: the gripper command and the object’s height.</p>
<p><b>Your task</b>: <code>segment(grip, z, lift_h)</code> returns <code>(close, lift, release)</code>:</p><ul><li><code>lift</code>: first step where <code>z &gt; lift_h</code> (return <code>None</code> if never).</li><li><code>close</code>: walk back from <code>lift</code> while the gripper was still closed; the start of that closed run. (Earlier failed grasps don’t count.)</li><li><code>release</code>: first step at or after <code>lift</code> where <code>grip</code> is 0.</li></ul>
<p>The lab runs a real MuJoCo demo with a missed first grasp and draws your segmentation against the ground truth. Then try <b>Dataset → Auto-label all</b>, and train with subtask captions.</p>`,
    starter: `def segment(grip, z, lift_h):\n    lift = ...\n    if lift is None:\n        return None\n    close = lift\n    while close > 0 and grip[close - 1] == 1:\n        ...\n    release = ...\n    return close, lift, release\n`,
    solution: `def segment(grip, z, lift_h):\n    lift = next((i for i, h in enumerate(z) if h > lift_h), None)\n    if lift is None:\n        return None\n    close = lift\n    while close > 0 and grip[close - 1] == 1:\n        close -= 1\n    release = next(i for i in range(lift, len(grip)) if grip[i] == 0)\n    return close, lift, release\n`,
    hint: '<code>next((i for i, h in enumerate(z) if h &gt; lift_h), None)</code> finds the first index. In the loop: <code>close -= 1</code>.',
    tests: [
      ['simple episode', `grip = [0,0,0,1,1,1,1,1,0,0]\nz   = [0,0,0,0,0,.1,.1,.1,0,0]\nassert segment(grip, z, 0.05) == (3, 5, 8), "got %r" % (segment(grip, z, 0.05),)`],
      ['a missed first grasp is not the real grasp', `grip = [0,1,1,0,0,1,1,1,1,0,0]\nz   = [0,0,0,0,0,0,.1,.1,.1,0,0]\nassert segment(grip, z, 0.05) == (5, 6, 9), "got %r" % (segment(grip, z, 0.05),)`],
      ['never lifted returns None', `assert segment([0,1,1,0], [0,0,0,0], 0.05) is None`],
    ],
  },
  {
    id: 'language', course: 'data', title: 'How much does language help?', kind: 'quiz',
    text: `<p>Language does two jobs. First, it tells a multi-task policy <i>which</i> task to do: a policy without language input trained on two tasks can only guess. (Try it: train ACT on two tasks and evaluate, then SmolVLA.) Second, richer language makes each demo more informative.</p>
<p>${A('2605.17077', 'DeMiAn')} (UCSD & NVIDIA, 2026) re-captioned existing demos, with no new robot data, along four aspects: physical motion, scene composition, arm pose, and reasoning. On a π0.5-based policy in RoboCasa: picking the best aspect per task gave <b>52%</b> average success versus <b>44%</b> with the task label only; a small learned “instructor” that picks the aspect at run time reached <b>49%</b> (about +5 points). No single aspect won everywhere: physical-motion captions took one task from 38% to 75% but hurt others. On two MolmoSpaces task families (NextTo and Color), trained on 1M clips, dense captions matched the baseline with about <b>62% less compute</b>, counting the cost of generating the captions.</p>
<p><b>Try it</b>: <b>Dataset → Auto-label all</b>, then <b>Train → Language supervision</b>. Only language-conditioned models can use it.</p>`,
    quiz: [
      { q: 'You train ACT (no language input) on “red cube in bin” and “blue cube in bin”. What happens at eval?', options: ['It does whichever task the instruction says', 'It often does the wrong task, because it cannot read the instruction', 'It refuses to move'], answer: 1 },
      { q: 'In DeMiAn, what did dense re-annotation require?', options: ['Collecting new demonstrations', 'Running a VLM over existing demonstrations', 'A new robot'], answer: 1 },
      { q: 'Which caption aspect was best on every task?', options: ['Physical motion', 'Reasoning', 'None: the best aspect depended on the task'], answer: 2 },
    ],
  },
  {
    id: 'ego', course: 'data', title: 'Learning from egocentric human video', viz: 'egonorm',
    text: `<p>Robot teleop is slow and expensive. People already do every manipulation task, all day, and a head-mounted camera can record it. That is <b>egocentric human video</b>.</p>
<p>${A('2410.24221', 'EgoMimic')} (Georgia Tech, 2024) co-trained one policy on Project Aria glasses recordings and robot teleop. Human data improved task scores by <b>34–228%</b> over robot data alone. One hour of hand data yielded about <b>1,400</b> demos versus about <b>135</b> per hour of robot teleop, and 2 h robot + 1 h human beat 3 h of robot data (128 vs 74 points). ${A('2606.20521', 'HumanScale')} (2026) pretrained on 5,000 h of egocentric video versus 5,000 h of robot data: on unseen tasks, robot pretraining stopped improving while ego pretraining kept scaling, and on real robots it held <b>90%</b> success on unseen objects where the no-pretraining baseline fell to 0%.</p>
<p>The catch is the <b>embodiment gap</b>: hands are not grippers. One cheap, important trick from EgoMimic: <b>normalize each source separately</b>. Hand and robot positions have different distributions; z-scoring them together lets the model tell them apart and learn two separate policies. Removing per-source normalization cost EgoMimic 38% of its score.</p>
<p><b>Your task</b>: write <code>zscore(xs)</code> (subtract the mean, divide by the standard deviation) and <code>normalize_by_source(samples)</code>, where samples is a list of <code>(source, value)</code>; return the values z-scored <i>within</i> each source, in the original order.</p>`,
    starter: `import math\n\ndef zscore(xs):\n    m = sum(xs) / len(xs)\n    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))\n    return ...\n\ndef normalize_by_source(samples):\n    out = [None] * len(samples)\n    for src in set(s for s, _ in samples):\n        idx = [i for i, (s, _) in enumerate(samples) if s == src]\n        ...\n    return out\n`,
    solution: `import math\n\ndef zscore(xs):\n    m = sum(xs) / len(xs)\n    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))\n    return [(x - m) / sd for x in xs]\n\ndef normalize_by_source(samples):\n    out = [None] * len(samples)\n    for src in set(s for s, _ in samples):\n        idx = [i for i, (s, _) in enumerate(samples) if s == src]\n        z = zscore([samples[i][1] for i in idx])\n        for i, v in zip(idx, z):\n            out[i] = v\n    return out\n`,
    hint: 'Inside the loop: <code>z = zscore([samples[i][1] for i in idx])</code>, then write each back with <code>out[i] = v</code>.',
    tests: [
      ['zscore has mean 0 and std 1', `z = zscore([1.0, 2.0, 3.0, 4.0])\nassert abs(sum(z)) < 1e-9 and abs(sum(v * v for v in z) / 4 - 1) < 1e-9`],
      ['each source is normalized on its own, order preserved', `s = [("hand", 10.0), ("robot", 0.0), ("hand", 12.0), ("robot", 1.0)]\nn = normalize_by_source(s)\nassert abs(n[0] + 1) < 1e-9 and abs(n[2] - 1) < 1e-9, "hand values should become -1 and 1"\nassert abs(n[1] + 1) < 1e-9 and abs(n[3] - 1) < 1e-9, "robot values should become -1 and 1"`],
    ],
  },
  {
    id: 'stats', course: 'data', title: 'Evaluation statistics: how many trials?', viz: 'ci',
    text: `<p>“Our policy succeeds 9/10 times, the baseline 7/10.” Is that a better policy, or luck? With 10 trials, the honest answer is usually <i>we can’t tell</i>.</p>
<p>A CoRL 2026 award finalist, ${A('2606.04233', 'What Are We Actually Benchmarking in Robot Manipulation?')}, checked published state-of-the-art claims: only <b>19.8%</b> of LIBERO claims and <b>19.7%</b> of SimplerEnv claims were provably statistically significant. It also found a 0.09B-parameter probe with no language encoder scoring within one point of the best published result on three of four LIBERO splits.</p>
<p>The fix starts with error bars. For a success rate, use the <b>Wilson score interval</b> (better than ±1.96·√(p(1−p)/n) when n is small or p is near 0 or 1):</p>
<p class="mono">centre = (p + z²/2n) / (1 + z²/n)<br>half = z·√(p(1−p)/n + z²/4n²) / (1 + z²/n)</p>
<p><b>Your task</b>: write <code>wilson(k, n, z=1.96)</code> returning <code>(low, high)</code>. The <b>Eval</b> workbench shows this interval for every policy, and runs a paired McNemar test on the top two (every policy sees the same cube layouts, so trials are paired).</p>`,
    pre: 'import math\n',
    starter: `def wilson(k, n, z=1.96):\n    p = k / n\n    d = 1 + z * z / n\n    centre = ...\n    half = ...\n    return centre - half, centre + half\n`,
    solution: `def wilson(k, n, z=1.96):\n    p = k / n\n    d = 1 + z * z / n\n    centre = (p + z * z / (2 * n)) / d\n    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d\n    return centre - half, centre + half\n`,
    hint: 'Translate the two formulas literally. <code>math.sqrt</code> is available.',
    tests: [
      ['8/10 gives about 49%–94%', `lo, hi = wilson(8, 10)\nassert abs(lo - 0.4902) < 0.002 and abs(hi - 0.9433) < 0.002, "got (%.3f, %.3f)" % (lo, hi)`],
      ['10/10 is not “certainly 100%”', `lo, hi = wilson(10, 10)\nassert hi <= 1.0 + 1e-9 and lo < 0.75, "10/10 still leaves room down to ~72%%; got low=%.3f" % lo`],
      ['more trials, narrower interval', `a = wilson(9, 10); b = wilson(90, 100)\nassert (b[1] - b[0]) < (a[1] - a[0]) / 2`],
    ],
  },
  {
    id: 'export', course: 'data', title: 'Export to LeRobotDataset', viz: null,
    text: `<p>${L('https://huggingface.co/docs/lerobot/lerobot-dataset-v3', 'LeRobotDataset')} is the format the open robot learning community trains on. Version 3 stores frames in Parquet files and camera streams as MP4 video, and describes everything in <code>meta/info.json</code>: each <b>feature</b> has a <code>dtype</code>, a <code>shape</code> and <code>names</code>. Recording goes: <code>LeRobotDataset.create(repo_id, fps, features)</code>, then <code>add_frame(frame)</code> for every step (each frame must include its <code>"task"</code> string), <code>save_episode()</code> after each episode, and <code>finalize()</code> at the end, before you read it or <code>push_to_hub()</code>.</p>
<p><b>Your task</b>: write <code>features(n_state, n_action)</code> returning the feature dict for <code>"observation.state"</code> and <code>"action"</code> (dtype <code>"float32"</code>, shape a 1-tuple), and <code>make_frame(state, action, task)</code> returning one frame dict.</p>
<p>Then press <b>Dataset → Export LeRobotDataset</b>: you get a zip and a <code>convert_to_lerobot.py</code> that rebuilds your kept demos as a real LeRobotDataset you can train with LeRobot or push to the Hub.</p>`,
    starter: `def features(n_state, n_action):\n    return {\n        "observation.state": {"dtype": ..., "shape": ...},\n        "action": ...,\n    }\n\ndef make_frame(state, action, task):\n    return ...\n`,
    solution: `def features(n_state, n_action):\n    return {\n        "observation.state": {"dtype": "float32", "shape": (n_state,)},\n        "action": {"dtype": "float32", "shape": (n_action,)},\n    }\n\ndef make_frame(state, action, task):\n    return {"observation.state": list(state), "action": list(action), "task": task}\n`,
    hint: 'A 1-tuple needs a trailing comma: <code>(n_state,)</code>.',
    tests: [
      ['features describe state and action', `f = features(5, 4)\nassert f["observation.state"] == {"dtype": "float32", "shape": (5,)}, f["observation.state"]\nassert f["action"] == {"dtype": "float32", "shape": (4,)}, f["action"]`],
      ['frames carry state, action and task', `fr = make_frame([0.1] * 5, [0, 0, 1, 0], "put the red cube in the bin")\nassert fr["task"] == "put the red cube in the bin" and len(fr["observation.state"]) == 5 and len(fr["action"]) == 4`],
    ],
  },

  // ───────────────────────── Hardware: build an SO-101 ─────────────────────────
  {
    id: 'so101parts', course: 'hardware', title: 'The SO-101 kit', kind: 'quiz',
    text: `<p>The ${L(SOARM, 'SO-101')} by The Robot Studio and Hugging Face is an open-source 6-DoF arm you can build for a few hundred dollars. You build two: a <b>follower</b> that does the work and a <b>leader</b> you move by hand to teleoperate it. All parts, STL files and the bill of materials are in the ${L(SOARM, 'SO-ARM100 repository')}; assembly and software are in the ${L(LEROBOT_SO101, 'LeRobot SO-101 guide')}.</p>
<p><b>Per arm</b>: six Feetech STS3215 serial bus servos, a Waveshare bus-servo control board, a power supply (5 V for the standard 7.4 V motors; 12 V 5 A+ if you buy the 12 V high-torque follower motors), a USB cable, 3-pin motor cables, screws, and the 3D-printed parts. Clean all support material off the prints first; a small screwdriver works.</p>
<p><b>Gear ratios</b>: the follower uses six STS3215 motors with 1/345 gearing. The leader mixes gearings so it can hold its own weight yet move easily by hand: 1/191 for base and elbow, 1/345 for shoulder lift, 1/147 for the wrist and gripper.</p>
<p><b>Screws</b>: motors are fastened into their holders with M2×6 mm screws (the smallest); motor horns and arm parts use M3×6 mm.</p>`,
    quiz: [
      { q: 'How many motors does one SO-101 follower arm use?', options: ['4', '6 STS3215 servos', '7 brushless motors'], answer: 1 },
      { q: 'Why does the leader arm mix gear ratios (1/191, 1/345, 1/147)?', options: ['To save money', 'So it holds its own weight but is light to move by hand', 'So it can lift heavier objects'], answer: 1 },
      { q: 'You upgraded the follower to the 12 V STS3215 motors. What else changes?', options: ['Nothing', 'You need a 12 V, 5 A+ power supply', 'You need a different USB cable'], answer: 1 },
      { q: 'Which screws fasten the motors into their holders?', options: ['M2×6 mm', 'M3×6 mm', 'M4×10 mm'], answer: 0 },
    ],
  },
  {
    id: 'so101motors', course: 'hardware', title: 'Set motor IDs (virtual bench)', kind: 'lab', viz: 'motors',
    text: `<p>All six servos on an arm share one data line, daisy-chained. The controller tells them apart by <b>ID</b> (1–6), and they must all talk at the same <b>baudrate</b>. New motors usually all ship as ID 1, so you program them one at a time, before chaining. The settings live in the motor’s EEPROM, so you do this once.</p>
<p>Real commands: <code>lerobot-find-port</code> (unplug the USB when asked; the port that disappears is your arm), then <code>lerobot-setup-motors --robot.type=so101_follower --robot.port=…</code>. The script asks for the gripper first, then works down the arm to the shoulder pan (ID 1). Each time, <b>exactly one</b> motor may be connected to the board. If you use the Waveshare board, set both jumpers to channel <b>B</b> (USB).</p>
<p><b>Your task</b>: run the bench on the right. Find the port, then connect the right motor, alone, at each prompt.</p>`,
  },
  {
    id: 'so101assembly', course: 'hardware', title: 'Assemble the arm and add a wrist camera', kind: 'quiz',
    text: `<p>Assembly goes joint by joint, base to gripper (videos for each step are in the ${L(LEROBOT_SO101, 'LeRobot guide')}):</p><ol><li><b>Joint 1</b>: both horns on motor 1 (top horn screwed with M3×6), motor into the base, four M2×6 screws, motor holder, shoulder part with M3×6 screws.</li><li><b>Joints 2–4</b>: same pattern: horns, slide the motor in, M2×6 into the holder, attach the next link with M3×6 on each side.</li><li><b>Joint 5</b>: wrist motor into the wrist holder; only one horn.</li><li><b>Gripper</b> (follower) or <b>handle and trigger</b> (leader).</li></ol>
<p>Tip: put a 3-pin cable into each motor as you place it; it is hard to reach later. After the IDs are set, chain the motors and connect motor 1 (shoulder pan) to the board.</p>
<p><b>Wrist camera</b>: the repo has optional wrist mounts for a 32×32 mm UVC camera module, Intel RealSense D405/D435 and a common webcam. A wrist camera sees the contact the scene camera misses (the gripper usually blocks its own view). Find your cameras with <code>lerobot-find-cameras opencv</code>, then pass them when recording: <code>--robot.cameras="{ wrist: {type: opencv, index_or_path: 0, width: 640, height: 480, fps: 30}, top: {…} }"</code>.</p>`,
    quiz: [
      { q: 'When is the easiest time to plug a 3-pin cable into each motor?', options: ['After the arm is fully assembled', 'As you place each motor', 'Never: the motors are wireless'], answer: 1 },
      { q: 'Which command lists the cameras LeRobot can see?', options: ['lerobot-find-cameras opencv', 'lerobot-find-port', 'lerobot-calibrate'], answer: 0 },
      { q: 'Why add a wrist camera when you already have a scene camera?', options: ['Higher resolution', 'It sees the gripper–object contact that the arm hides from the scene camera', 'It is required by LeRobot'], answer: 1 },
    ],
  },
  {
    id: 'so101calib', course: 'hardware', title: 'Calibrate the arm', viz: 'calib',
    text: `<p>Two arms are never assembled identically: a horn is a few teeth off, and raw servo positions (0–4095 per turn) differ. <b>Calibration</b> records, for every joint, a homing offset and the range it actually moves. Then positions are normalized, so leader and follower report the same number in the same pose. That is also what lets a policy trained on one SO-101 run on another.</p>
<p>The procedure (<code>lerobot-calibrate</code>): put every joint in the middle of its range, press Enter, then move each joint through its full range. LeRobot then maps a raw value to <b>−100…100</b> for joints and <b>0…100</b> for the gripper, after clamping it into the recorded range:</p>
<p class="mono">joint: (v − min) / (max − min) · 200 − 100<br>gripper: (v − min) / (max − min) · 100</p>
<p><b>Your task</b>: write <code>normalize(raw, rmin, rmax, gripper=False)</code> exactly like LeRobot’s <code>MotorsBus._normalize</code>. Then move the virtual joints on the right to record a range and watch your normalization.</p>`,
    starter: `def normalize(raw, rmin, rmax, gripper=False):\n    v = ...   # clamp raw into [rmin, rmax]\n    if gripper:\n        return ...\n    return ...\n`,
    solution: `def normalize(raw, rmin, rmax, gripper=False):\n    v = min(rmax, max(rmin, raw))\n    if gripper:\n        return (v - rmin) / (rmax - rmin) * 100\n    return (v - rmin) / (rmax - rmin) * 200 - 100\n`,
    hint: 'Clamp with <code>min(rmax, max(rmin, raw))</code>.',
    tests: [
      ['joint: ends map to −100 and 100, middle to 0', `assert normalize(1000, 1000, 3000) == -100 and normalize(3000, 1000, 3000) == 100 and normalize(2000, 1000, 3000) == 0`],
      ['gripper uses 0…100', `assert normalize(1500, 1000, 2000, gripper=True) == 50`],
      ['values outside the calibrated range are clamped', `assert normalize(4000, 1000, 3000) == 100 and normalize(0, 1000, 3000) == -100`],
    ],
  },
  {
    id: 'intrinsics', course: 'hardware', title: 'Camera intrinsics: the pinhole model', viz: 'intrinsics',
    text: `<p>A camera turns a 3D point into a pixel. In the <b>camera frame</b> (OpenCV convention: x right, y down, z forward out of the lens), a pinhole camera projects</p>
<p class="mono">u = fx · x / z + cx<br>v = fy · y / z + cy</p>
<p>The four <b>intrinsic</b> parameters are the focal lengths in pixels (fx, fy) and the principal point (cx, cy), usually near the image centre. Real lenses add distortion, which calibration also estimates. In practice you find them by photographing a checkerboard from many angles (Zhang’s method, <code>cv2.calibrateCamera</code>).</p>
<p>Simulators specify cameras by vertical field of view. For an image of height H: <span class="mono">fy = (H / 2) / tan(fovy / 2)</span>.</p>
<p><b>Your task</b>: write <code>focal_from_fov(fovy_deg, height)</code> and <code>project(p, fx, fy, cx, cy)</code>. The lab renders MuJoCo’s real front camera (fovy 50°, 320×240) and draws your projected cube corners on top. If your math is right, the dots land on the corners.</p>`,
    pre: 'import math\n',
    starter: `def focal_from_fov(fovy_deg, height):\n    return ...\n\ndef project(p, fx, fy, cx, cy):\n    x, y, z = p\n    return ...\n`,
    solution: `def focal_from_fov(fovy_deg, height):\n    return (height / 2) / math.tan(math.radians(fovy_deg) / 2)\n\ndef project(p, fx, fy, cx, cy):\n    x, y, z = p\n    return fx * x / z + cx, fy * y / z + cy\n`,
    hint: '<code>math.radians</code> converts degrees. Return a tuple <code>(u, v)</code>.',
    tests: [
      ['a 90° field of view on a 480 px image gives f = 240', `assert abs(focal_from_fov(90, 480) - 240) < 1e-6`],
      ['the optical axis hits the principal point', `assert project((0, 0, 2), 500, 500, 320, 240) == (320, 240)`],
      ['off-axis points', `u, v = project((0.1, -0.05, 0.5), 600, 600, 320, 240)\nassert abs(u - 440) < 1e-6 and abs(v - 180) < 1e-6, "got (%.1f, %.1f)" % (u, v)`],
    ],
  },
  {
    id: 'extrinsics', course: 'hardware', title: 'Camera extrinsics: where is the camera?', viz: 'extrinsics',
    text: `<p>Intrinsics describe the lens. <b>Extrinsics</b> describe where the camera sits: a rigid transform between the robot’s base frame and the camera frame. You need it to turn “the cube is at pixel (u, v)” into “move the gripper to (x, y, z)”, and to fuse several cameras.</p>
<p>We store a transform as a 4×4 matrix <span class="mono">T = [[R, t], [0 0 0 1]]</span>. Applying it to a point: <span class="mono">p' = R·p + t</span>. Its inverse is <span class="mono">[[Rᵀ, −Rᵀ·t], [0 0 0 1]]</span>. For a wrist camera the transform is found by <b>hand-eye calibration</b>: show the camera a marker (such as an ArUco tag) from several arm poses and solve for the fixed gripper-to-camera transform.</p>
<p><b>Your task</b>: write <code>transform(T, p)</code> and <code>invert(T)</code> (pure Python lists). The lab gives you the camera’s pose in the world, uses your <code>invert</code> to get world→camera, your <code>transform</code> to move the gripper tip into the camera frame, and your <code>project</code> from the last lesson (re-implemented for you) to draw it on the live MuJoCo image.</p>`,
    starter: `def transform(T, p):\n    x, y, z = p\n    return [T[i][0] * x + T[i][1] * y + T[i][2] * z + T[i][3] for i in range(3)]\n\ndef invert(T):\n    R = [row[:3] for row in T[:3]]\n    t = [row[3] for row in T[:3]]\n    Rt = ...          # transpose of R\n    nt = ...          # -Rt @ t\n    return [Rt[0] + [nt[0]], Rt[1] + [nt[1]], Rt[2] + [nt[2]], [0, 0, 0, 1]]\n`,
    solution: `def transform(T, p):\n    x, y, z = p\n    return [T[i][0] * x + T[i][1] * y + T[i][2] * z + T[i][3] for i in range(3)]\n\ndef invert(T):\n    R = [row[:3] for row in T[:3]]\n    t = [row[3] for row in T[:3]]\n    Rt = [[R[j][i] for j in range(3)] for i in range(3)]\n    nt = [-sum(Rt[i][k] * t[k] for k in range(3)) for i in range(3)]\n    return [Rt[0] + [nt[0]], Rt[1] + [nt[1]], Rt[2] + [nt[2]], [0, 0, 0, 1]]\n`,
    hint: 'Transpose: <code>[[R[j][i] for j in range(3)] for i in range(3)]</code>. Then <code>nt[i] = -sum(Rt[i][k] * t[k] for k in range(3))</code>.',
    tests: [
      ['transform applies rotation then translation', `T = [[0, -1, 0, 1], [1, 0, 0, 2], [0, 0, 1, 3], [0, 0, 0, 1]]\nassert transform(T, [1, 0, 0]) == [1, 3, 3], transform(T, [1, 0, 0])`],
      ['invert undoes transform', `T = [[0, -1, 0, 1], [1, 0, 0, 2], [0, 0, 1, 3], [0, 0, 0, 1]]\nq = transform(invert(T), transform(T, [0.3, -0.2, 0.7]))\nassert all(abs(a - b) < 1e-9 for a, b in zip(q, [0.3, -0.2, 0.7])), q`],
    ],
  },

  // ───────────────────────── CoRL 2026 Review Club ─────────────────────────
  {
    id: 'diffusion', course: 'corl', title: 'Diffusion Policy (the classic)', viz: 'bimodal',
    text: `<p><i>Review Club format: each lesson summarizes a paper, then you check one key idea yourself. As at CoRL, ask: what is claimed, what is the evidence, and does it hold on real robots?</i></p>
<p>${A('2303.04137', 'Diffusion Policy')} (Chi et al., RSS 2023) is the foundation of most modern action heads, so we start here. Its claim: generate actions by <b>denoising</b> random noise, the way image generators do. Across 15 tasks from 4 benchmarks it beat prior methods by <b>46.9%</b> on average. The reason is <b>multimodality</b>: when demonstrators go around an obstacle both left <i>and</i> right, a regression policy trained with mean-squared error predicts the average and drives into the obstacle. A diffusion policy samples one mode or the other. Other findings: predict a chunk of actions and execute about 8 before re-planning; position control beats velocity control; with DDIM, real-robot runs use 16 denoising steps instead of 100, which is what makes it fast enough to control a real arm.</p>
<p>Diffusion iteratively follows the <b>score</b> (the gradient of log-probability) with a little noise, called Langevin dynamics: <span class="mono">x ← x + ε·score(x) + √(2ε)·noise</span>.</p>
<p><b>Your task</b>: demos go around an obstacle at 0 either at −1 or +1. Write <code>regress(actions)</code> (the MSE-optimal single answer: the mean) and <code>langevin(x, steps, eps, rng)</code>. A <code>score(x)</code> for the two-mode data is provided. The lab histograms 500 of your samples.</p>`,
    pre: `import math, random\ndef score(x, s=0.2):\n    a = math.exp(-(x - 1) ** 2 / (2 * s * s)); b = math.exp(-(x + 1) ** 2 / (2 * s * s))\n    return (a * (1 - x) + b * (-1 - x)) / (s * s * (a + b + 1e-300))\n`,
    starter: `def regress(actions):\n    return ...\n\ndef langevin(x, steps, eps, rng):\n    for _ in range(steps):\n        x = ...\n    return x\n`,
    solution: `def regress(actions):\n    return sum(actions) / len(actions)\n\ndef langevin(x, steps, eps, rng):\n    for _ in range(steps):\n        x = x + eps * score(x) + math.sqrt(2 * eps) * rng.gauss(0, 1)\n    return x\n`,
    hint: '<code>x + eps * score(x) + math.sqrt(2 * eps) * rng.gauss(0, 1)</code>',
    tests: [
      ['regression averages the two ways around: straight into the obstacle', `assert abs(regress([-1, 1, -1, 1])) < 1e-9`],
      ['Langevin samples land on one side or the other, not in the middle', `r = random.Random(0)\nxs = [langevin(r.gauss(0, 1.5), 200, 0.004, r) for _ in range(500)]\nnear = sum(1 for x in xs if abs(abs(x) - 1) < 0.5) / 500\nmid = sum(1 for x in xs if abs(x) < 0.3) / 500\nleft = sum(1 for x in xs if x < 0) / 500\nassert near > 0.9 and mid < 0.05, "only %.0f%% of samples near a mode" % (100 * near)\nassert 0.3 < left < 0.7, "both modes should be used"\n_samples = xs`],
    ],
  },
  {
    id: 'supermimic', course: 'corl', title: '🏆 SuperMimic (Best Paper)', viz: 'supermimic',
    text: `<p>${A('2610.28480', 'SuperMimic: Scaling Humanoid Whole-Body Control with One Differentiable World Model')} (Liao et al., UC Berkeley) won the CoRL 2026 Best Paper award.</p>
<p><b>Claim</b>: humanoid motion trackers are usually trained with model-free RL (PPO) on huge clusters. The previous state of the art, SONIC, trained for about 168 h on 128 GPUs (≈21,000 GPU-hours). SuperMimic learns <b>one differentiable world model</b> of the robot’s dynamics from simulator data, then trains the policy by back-propagating the return through short imagined rollouts. In <b>3 hours on a single H100</b> it surpassed SONIC’s tracking return: <b>over 1000× fewer GPU-hours</b> (different GPU types, so read it as an order of magnitude). It failed on 25 of 129,514 benchmark motions (SONIC: 179), and on none after 9.8 h on two GPUs. The learned model ran 10× or more faster than the simulator, and analytic gradients reached PPO’s best return with about 64× fewer imagined steps. The policy transferred to a real Unitree G1, including flips.</p>
<p><b>Reviewer’s check</b>: the gain has two parts, a learned model that is cheap to roll out, and <i>gradients</i> instead of trial and error. You will reproduce the idea on a 1-D toy: fit a linear model <span class="mono">x′ = a·x + b·u</span> from logged transitions by least squares, then the lab optimizes a controller through your model (zero extra simulator calls) and compares with random search on the “simulator”.</p>
<p><b>Your task</b>: <code>fit_model(xs, us, xn)</code> returns <code>(a, b)</code>, solving the 2×2 normal equations.</p>`,
    pre: 'import random\n',
    starter: `def fit_model(xs, us, xn):\n    # minimize sum (a*x + b*u - x')^2  ->  2x2 linear system\n    sxx = sum(x * x for x in xs); suu = sum(u * u for u in us); sxu = sum(x * u for x, u in zip(xs, us))\n    sxy = sum(x * y for x, y in zip(xs, xn)); suy = sum(u * y for u, y in zip(us, xn))\n    det = sxx * suu - sxu * sxu\n    a = ...\n    b = ...\n    return a, b\n`,
    solution: `def fit_model(xs, us, xn):\n    sxx = sum(x * x for x in xs); suu = sum(u * u for u in us); sxu = sum(x * u for x, u in zip(xs, us))\n    sxy = sum(x * y for x, y in zip(xs, xn)); suy = sum(u * y for u, y in zip(us, xn))\n    det = sxx * suu - sxu * sxu\n    a = (sxy * suu - suy * sxu) / det\n    b = (suy * sxx - sxy * sxu) / det\n    return a, b\n`,
    hint: 'Cramer’s rule: <code>a = (sxy*suu - suy*sxu) / det</code>, <code>b = (suy*sxx - sxy*sxu) / det</code>.',
    tests: [
      ['recovers the true dynamics from noisy logs', `r = random.Random(0)\nxs = [r.uniform(-1, 1) for _ in range(200)]; us = [r.uniform(-1, 1) for _ in range(200)]\nxn = [0.9 * x + 0.5 * u + r.gauss(0, 0.01) for x, u in zip(xs, us)]\na, b = fit_model(xs, us, xn)\nassert abs(a - 0.9) < 0.01 and abs(b - 0.5) < 0.01, "got a=%.3f b=%.3f" % (a, b)`],
    ],
  },
  {
    id: 'flora', course: 'corl', title: 'FLORA: a data engine for robot labels', kind: 'quiz',
    text: `<p>${A('2610.31779', 'FLORA: An Open Model Suite for Scaling Robotics Data Engines')} (NVIDIA, Oct 2026) is not a CoRL paper, but it is the labeling engine you met in the reward-model and annotation lessons. The code and model weights are public (research use; check the license before using them commercially).</p>
<p><b>What it is</b>: three fine-tuned open VLMs. A segmenter (from Qwen3.5-9B) finds when each action happens; a captioner (Qwen3.5-27B) describes each interval using the frames before and after for context; a reward model (Qwen3.5-27B) gives outcome, dense and rubric rewards. It is used to train GR00T models and labels up to <b>200,000 hours of video per day</b> on 512 GB300 GPUs.</p>
<p><b>Evidence</b>: on RoboRewardBench its outcome error (MAE ×100) is <b>40.0</b> versus 55.4 for GPT-6 Astra, a 27.8% reduction, with the gain coming from <i>partially completed</i> tasks. It is about <b>125× cheaper</b> per video hour than Astra at maximum reasoning (an estimated $0.72 vs $88.49). It is not uniformly best: Astra still leads on the robot track of its own DenseCaptionBench, and its cost figure is a model that assumes $10 per GPU-hour, so treat it as an estimate.</p>`,
    quiz: [
      { q: 'Where does FLORA’s advantage over the frontier API model come from on outcome rewards?', options: ['Clear successes', 'Partially completed tasks', 'Clear failures'], answer: 1 },
      { q: 'Which three things does the FLORA suite produce?', options: ['Robot actions, video, maps', 'Timestamped captions, outcome/dense/rubric rewards, segment boundaries', 'Motor IDs, calibrations, URDFs'], answer: 1 },
      { q: 'A reviewer asks for FLORA’s weaknesses. Which is supported by the paper?', options: ['It cannot read video', 'It labels about 11% of normal steps as failures, and trails Astra on robot dense captions', 'It is closed source'], answer: 1 },
    ],
  },
  {
    id: 'audit', course: 'corl', title: '🏅 What are we actually benchmarking?', kind: 'quiz',
    text: `<p>Award finalist: ${A('2606.04233', 'What Are We Actually Benchmarking in Robot Manipulation?')} (Jiang et al., TTIC). In March 2026 alone, 79 arXiv papers reported results on LIBERO. The authors define four ways a benchmark score can stop measuring real capability, give a diagnostic for each, and audit five popular benchmarks.</p>
<ul><li><b>Shortcut solvability</b>: a 0.09B probe (DINOv2 + MLP, no language encoder, no robot pretraining) scored within one point of the best result on three of four LIBERO splits.</li><li><b>Statistical significance</b>: only 19.8% (LIBERO) and 19.7% (SimplerEnv) of state-of-the-art claims were provably significant, versus 53.3% (RoboCasa) and 73.7% (RoboTwin 2.0).</li><li><b>Creeping overfitting</b>: on CALVIN, re-sampling block poses <i>within</i> the training range dropped average tasks completed from 4.17 to 3.14 for one policy.</li><li><b>Data-source dependence</b>: a small model trained on demos collected next to the test setup can match a large general one.</li></ul>
<p>The benchmarks that appear most often failed the most diagnostics. Their recommendation: report per-trial outcomes so others can run paired tests. Our Eval workbench does that.</p>`,
    quiz: [
      { q: 'A tiny model with no language encoder nearly matches SOTA on LIBERO. What does that show?', options: ['Tiny models are best', 'A high LIBERO score alone is not evidence of general capability', 'Language is useless'], answer: 1 },
      { q: 'Re-sampling CALVIN block poses inside the training range lowered scores. Which failure mode is that?', options: ['Creeping overfitting', 'Shortcut solvability', 'Data-source dependence'], answer: 0 },
      { q: 'What should a paper report so readers can test significance?', options: ['Only the average success rate', 'Per-trial outcomes on the shared test instances', 'The number of GPUs used'], answer: 1 },
    ],
  },
  {
    id: 'robottt', course: 'corl', title: '🏅 RoboTTT: context scaling', viz: 'ttt',
    text: `<p>Award finalist: ${A('2607.15275', 'RoboTTT: Context Scaling for Robot Policies')} (NVIDIA, Stanford, UT Austin). Most robot policies see only the current moment. RoboTTT gives a VLA (GR00T N1.7) a memory of <b>8K timesteps</b> (minutes of experience) without slowing inference, using <b>test-time training</b>: some weights (“fast weights”) keep being updated by gradient descent <i>while the robot runs</i>, compressing history into parameters.</p>
<p><b>Evidence</b> (real bimanual assembly tasks): +87% task completion over the single-step baseline; it was the only method to fully finish a 5-minute, 10-stage assembly (2 of 10 trials); one-shot imitation from a single human video succeeded 6/10 times versus 0/10 for a recurrent baseline; and pretraining with 8K context beat 1K context by over 60%, suggesting context length as a new scaling axis.</p>
<p><b>Your task</b>: implement one fast-weight update for the simplest fast model, a scalar <span class="mono">f(k) = W·k</span> with loss <span class="mono">(W·k − v)²</span>: <span class="mono">W ← W − lr · 2(W·k − v)·k</span>. Stream (k, v) pairs from a hidden rule and watch W learn it with no training run: that is learning at test time.</p>`,
    pre: 'import random\n',
    starter: `def ttt_update(W, k, v, lr):\n    grad = ...\n    return ...\n`,
    solution: `def ttt_update(W, k, v, lr):\n    grad = 2 * (W * k - v) * k\n    return W - lr * grad\n`,
    hint: '<code>grad = 2 * (W * k - v) * k</code>, then <code>return W - lr * grad</code>.',
    tests: [
      ['one step moves W toward the target', `assert abs(ttt_update(0.0, 1.0, 3.0, 0.1) - 0.6) < 1e-9`],
      ['streaming context makes W converge to the hidden rule v = 3k', `r = random.Random(0); W = 0.0; _trace = []\nfor _ in range(200):\n    k = r.uniform(-1, 1); W = ttt_update(W, k, 3 * k, 0.2); _trace.append(W)\nassert abs(W - 3) < 0.05, "W ended at %.3f" % W`],
    ],
  },
  {
    id: 'play2perfect', course: 'corl', title: '🏅 Play2Perfect: play before precision', kind: 'quiz',
    text: `<p>Award finalist: ${A('2606.26428', 'Play2Perfect: What Matters in Dexterous Play Pretraining for Precise Assembly?')} (Stanford, Cornell). Precise assembly with a five-fingered hand is too contact-rich to teleoperate well and too sparse-reward for RL from scratch. Their answer: first <b>play</b>, with RL in simulation moving a thousand random objects to random 6D poses; then fine-tune that one policy on each assembly task with only a sparse success reward derived from the CAD model.</p>
<p><b>Evidence</b>: the play prior learned assembly <b>33× more sample-efficiently</b> than RL from scratch, even when scratch got hand-shaped dense rewards (that comparison is on a simplified insertion task; on the full tasks scratch made no progress in 24 hours). Scratch policies were also brittle (balancing the peg on the thumb). Zero-shot sim-to-real: <b>60%</b> success inserting a peg with 0.5 mm clearance, and over 50% on multi-part assembly and screwing.</p>
<p><b>What mattered</b>: more object diversity (1000 > 100 > 10 objects); a full 6D pose objective (translation-only play did not transfer); random goal trajectories rather than a fixed set; and tight goal tolerance (1 cm worked, 10 cm failed to transfer).</p>
<p>Connect it to the RL course: random search from a good starting point (a pretrained prior) needs far fewer episodes than from scratch.</p>`,
    quiz: [
      { q: 'Which play objective transferred worst to assembly?', options: ['Full 6D pose goals', 'Translation-only goals', 'Rotation-only goals'], answer: 1 },
      { q: 'What reward does the assembly fine-tuning use?', options: ['A dense, hand-shaped reward', 'A sparse success reward derived from the CAD design', 'Human preference labels'], answer: 1 },
      { q: 'Loosening play goal tolerance from 1 cm to 10 cm…', options: ['helped', 'made no difference', 'broke transfer to precise assembly'], answer: 2 },
    ],
  },
  {
    id: 'grail', course: 'corl', title: '🏅 GRAIL: humanoid data from world models', kind: 'quiz',
    text: `<p>Award finalist: ${A('2606.05160', 'GRAIL: Generating Humanoid Loco-Manipulation from World Models')} (NVIDIA, UCLA). Instead of teleoperating a humanoid, GRAIL stays fully digital until deployment: build a 3D scene (known object, camera, scale, and a human character shaped like the robot), render the first frame, ask a video generation model to show the person interacting, then reconstruct the 4D human-object motion. Because the scene was specified first, the reconstruction is anchored in metric 3D. The motion is retargeted to a Unitree G1 and tracked with RL.</p>
<p><b>Evidence</b>: over 20,000 generated sequences (pick-up, whole-body manipulation, sitting, terrain), about 14 minutes each on an A100. Visual policies trained <i>only</i> on GRAIL data reached <b>84%</b> real pick-up success (<b>80%</b> on unseen objects) and <b>90%</b> on stair climbing.</p>
<p>Compare with the World Models app: there, the world model generates <i>robot</i> video from a camera snapshot and an inverse dynamics model recovers actions (DreamGen). GRAIL generates <i>human</i> video, because video models know humans better than robots, and recovers motion by 3D reconstruction.</p>`,
    quiz: [
      { q: 'Why does GRAIL generate human videos rather than robot videos?', options: ['Video models have stronger priors for humans, and human pose tools are more mature', 'Humans are cheaper to render', 'Robots are not allowed in videos'], answer: 0 },
      { q: 'What makes GRAIL’s 4D reconstruction easier than reconstructing a random internet video?', options: ['Higher video resolution', 'The 3D scene, camera and scale are known before generation', 'It uses depth cameras'], answer: 1 },
      { q: 'Real-world pick-up success on unseen objects was…', options: ['20%', '80%', '100%'], answer: 1 },
    ],
  },
  {
    id: 'disco', course: 'corl', title: '🏅 DISCO: distilled tree search', viz: 'bandit',
    text: `<p>Award finalist: ${A('2610.25785', 'Long-Horizon Multi-Object Rearrangement via Distilled Tree Search over Continuous Actions')} (DISCO; CMU, Stanford). Packing a shelf needs foresight: put the mug first and the plate fits; the other order fails. Behavior cloning from single-object pick-and-place demos never learns that. DISCO runs <b>Monte Carlo tree search</b> in GPU simulation during training, with a policy proposing continuous actions and a value function scoring them, and repeatedly <b>distils</b> the search results back into the policy and value (as AlphaGo did). At test time there is no search and no simulator, just the distilled model acting on point clouds.</p>
<p><b>Evidence</b>: on held-out shelf packing the policy alone rose from 13.3% to 46.7% success over distillation rounds, and value guidance added more on top. On the real robot it succeeded 2/3 on shelf packing and 1/3 on table bussing versus 0/3 for the base policy (n = 3: a reviewer would ask for more trials).</p>
<p>MCTS picks which branch to explore with the <b>UCB</b> rule, balancing a known good average against trying under-explored options: <span class="mono">UCB = Q + c·√(ln N / n)</span> (N: parent visits, n: this child’s visits; an unvisited child scores infinity).</p>
<p><b>Your task</b>: write <code>ucb(q, N, n, c)</code> and <code>select(children, N, c)</code> (children are <code>(q, n)</code> pairs; return the index with the highest UCB). The lab runs your selection rule on a 5-armed bandit for 300 pulls.</p>`,
    pre: 'import math, random\n',
    starter: `def ucb(q, N, n, c):\n    if n == 0:\n        return float("inf")\n    return ...\n\ndef select(children, N, c):\n    return ...\n`,
    solution: `def ucb(q, N, n, c):\n    if n == 0:\n        return float("inf")\n    return q + c * math.sqrt(math.log(N) / n)\n\ndef select(children, N, c):\n    return max(range(len(children)), key=lambda i: ucb(children[i][0], N, children[i][1], c))\n`,
    hint: '<code>max(range(len(children)), key=lambda i: ucb(children[i][0], N, children[i][1], c))</code>',
    tests: [
      ['unvisited children are tried first', `assert select([(0.9, 10), (0.0, 0)], 10, 1.4) == 1`],
      ['exploration bonus can beat a slightly better average', `assert select([(0.6, 100), (0.5, 2)], 102, 1.4) == 1`],
      ['with no exploration, pick the best average', `assert select([(0.6, 100), (0.5, 2)], 102, 0.0) == 0`],
    ],
  },
  {
    id: 'wam', course: 'data', title: 'World models and world action models (WAMs)', kind: 'quiz', explain: 'wampipe',
    text: `<p>A <b>world model</b> predicts what happens next: given the current camera frame (and an instruction or actions), it imagines the next frames. Robotics uses them two ways, and the <b>World Models</b> app lets you try both.</p>
<ul><li><b>Video model + inverse dynamics</b> (two stages). An image-to-video model imagines the robot doing the task; a separate <b>inverse dynamics model (IDM)</b> looks at consecutive frames and guesses the actions that would cause them. ${A('2302.00111', 'UniPi')} (2023) framed policies this way; ${A('2505.12705', 'DreamGen')} (NVIDIA, 2025) used it to mass-produce training data. Weakness: actions are only as good as the IDM’s guess, and the video can break physics.</li>
<li><b>World action model (WAM)</b> (one stage). A single model predicts future frames <i>and</i> actions together, so they are consistent by construction. Examples: ${A('2503.00200', 'Unified Video Action model (UVA)')} (Stanford, RSS 2025), which learns a joint video–action latent and can skip video decoding at run time for fast action inference, and Fast-WAM in this lab’s Train app.</li></ul>
<p>Either way you get <b>generated trajectories</b>: synthetic demos to add to real ones. The recipe (from DreamGen): fine-tune the model on your own robot’s teleop first (with LoRA, so it keeps its general knowledge), prompt it from real first frames, label actions, then <b>review</b>: drop clips that ignore the instruction or break physics.</p>
<p><b>Evidence</b> (DreamGen): with only 10–13 real demos per task, adding generated trajectories raised real-robot success on an SO-100 arm from 21% to 45.5% and on a Franka from 23% to 37%; from pick-and-place teleop alone, a humanoid learned 14 new verbs. Training on generated data <i>only</i> reached 20.6% on RoboCasa, so it complements real data rather than replacing it. Most errors came from the generated videos, not the IDM.</p>`,
    quiz: [
      { q: 'In the two-stage pipeline, what produces the actions for a generated video?', options: ['The video model itself', 'A separate inverse dynamics model (or latent action model)', 'A human annotator'], answer: 1 },
      { q: 'What does a world action model (WAM) do differently?', options: ['It predicts frames and actions jointly in one model', 'It only predicts actions, never video', 'It needs no training data'], answer: 0 },
      { q: 'Policies trained only on generated trajectories reached 20.6% on RoboCasa. The best reading is…', options: ['Generated data is useless', 'It helps most alongside real demos', 'Real demos are no longer needed'], answer: 1 },
    ],
  },
];
