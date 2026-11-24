// Human-in-the-loop RL on a real SO-101 (HIL-SERL, as shipped in LeRobot), with a keyboard standing in for the gamepad.
// Follows https://huggingface.co/docs/lerobot/main/en/hilserl. Key mapping and event names follow LeRobot's keyboard_ee teleop
// (src/lerobot/teleoperators/keyboard/teleop_keyboard.py) on main as of November 2026.
const L = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const code = (s) => `<pre class="term" style="max-height:none;resize:none;margin:6px 0">${esc(s)}</pre>`;
const steps = (...xs) => { const items = []; for (const x of xs) { if (x.startsWith('<pre') && items.length) items[items.length - 1] += x; else items.push(x); } return `<ol>${items.map((x) => `<li>${x}</li>`).join('')}</ol>`; };
const defined = (body) => `<div class="card" style="margin:8px 0"><b>Already defined for you</b>: ${body}</div>`;
const stretch = (...xs) => `<p><b>Make it yours</b> (stretch goals):</p><ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const DOC = 'https://huggingface.co/docs/lerobot/main/en/hilserl';
const PAPER = 'https://arxiv.org/abs/2410.21845';
const KB_SRC = 'https://github.com/huggingface/lerobot/blob/main/src/lerobot/teleoperators/keyboard/teleop_keyboard.py';
const SO_ARM = 'https://github.com/TheRobotStudio/SO-ARM100';

export const COURSES11 = [
  { id: 'hilserl', title: 'Human-in-the-loop RL on your SO-101 (HIL-SERL)', blurb: 'Workspace bounds, a keyboard as your gamepad, interventions, rewards, then the real actor/learner run with LeRobot.' },
];

const KEYTABLE = `<table class="mono" style="font-size:12.5px;border-collapse:collapse;margin:6px 0">
<tr><th style="text-align:left;padding:2px 10px 2px 0">Key (pynput name)</th><th style="text-align:left">What it does</th></tr>
<tr><td><kbd>↑</kbd> up / <kbd>↓</kbd> down</td><td>delta_y = −1 / +1</td></tr>
<tr><td><kbd>←</kbd> left / <kbd>→</kbd> right</td><td>delta_x = +1 / −1</td></tr>
<tr><td><kbd>Left Shift</kbd> shift / <kbd>Right Shift</kbd> shift_r</td><td>delta_z = −1 / +1</td></tr>
<tr><td><kbd>Left Ctrl</kbd> ctrl_l / <kbd>Right Ctrl</kbd> ctrl_r</td><td>gripper = 0 (close) / 2 (open); otherwise 1 (stay)</td></tr>
<tr><td>any of the eight keys above, held</td><td><b>intervention</b>: you drive, the policy waits</td></tr>
<tr><td><kbd>S</kbd></td><td>success (reward 1)</td></tr>
<tr><td><kbd>R</kbd></td><td>end the episode and re-record it</td></tr>
<tr><td><kbd>Q</kbd></td><td>end the episode, not a success (reward 0)</td></tr>
</table>`;

export const MORE11 = [
  {
    id: 'hil_intro', course: 'hilserl', kind: 'read', title: '1 · What HIL-SERL is, and the plan',
    text: `<p>Imitation learning copies what you showed it. Reinforcement learning (RL) improves by trying things and getting a reward. On a real robot, pure RL is slow and risky: the arm has to stumble around for hours before it finds the cube even once. <b>HIL-SERL</b> (Human-in-the-Loop Sample-Efficient RL, ${L(PAPER, 'Luo et al., 2024')}) fixes that with three ideas, and ${L(DOC, 'LeRobot ships it')} for the SO-100/SO-101:</p>
<ol>
<li><b>Start from a few demonstrations</b> (10–20 episodes you teleoperate) and a <b>reward</b>: you press a key at success, or a small vision <b>reward classifier</b> learns to say “success” from camera images.</li>
<li><b>An actor and a learner</b> run at the same time. The <b>actor</b> drives the real arm with the current policy and streams transitions; the <b>learner</b> runs SAC (soft actor-critic) on a GPU and pushes fresh weights back every few seconds.</li>
<li><b>You intervene.</b> When the policy goes the wrong way, you take over for a moment, steer it, and let go. Those corrected transitions are labelled and are worth a lot. A good run has many interventions at first and fewer and fewer later.</li>
</ol>
<p>Two safety and speed tricks make it work on a cheap arm: the policy acts in <b>end-effector space</b> (move the gripper by Δx, Δy, Δz, using inverse kinematics from the arm’s URDF) inside a <b>bounded workspace box</b>, and the cameras are <b>cropped</b> to the work area and resized to 128×128 so the policy is not distracted by the room.</p>
<h3>You, a keyboard, and an SO-101</h3>
<p>The LeRobot guide recommends a gamepad. A keyboard works too: LeRobot has a teleoperator of type <code>keyboard_ee</code> (end-effector keyboard) that produces exactly the same action as the gamepad (Δx, Δy, Δz and a gripper command) plus the same episode events. In this course you will:</p>
${steps('compute the workspace box and keep every step inside it (what <code>EEBoundsAndSafety</code> does);', 'write the keyboard → gamepad-action mapping yourself, then <b>drive the lab arm with it</b> from your keyboard;', 'write the actor’s intervention and episode-ending logic;', 'write the image crop and reward-classifier glue;', 'run the real thing on your SO-101 (the project lesson): find bounds, record demos, crop, train, intervene.')}
<p><b>What you need for the real run</b>: an SO-101 follower arm (a leader arm helps for finding bounds but is optional), one or two USB cameras, an NVIDIA GPU (your own or rented) for the learner, Python with <code>pip install -e ".[hilserl]"</code> inside a LeRobot checkout, and the SO-101 URDF from ${L(SO_ARM, 'TheRobotStudio/SO-ARM100')}.</p>
<p><b>Pick a simple first task</b>, one that finishes in 5–10 seconds: push a cube into a goal area, or pick up a cube and lift it. Long multi-step tasks come later.</p>`,
  },
  {
    id: 'hil_bounds', course: 'hilserl', title: '2 · Workspace bounds and safe end-effector steps', viz: 'hilbounds',
    knobs: [{ name: 'MARGIN', min: 0, max: 0.05, step: 0.005 }],
    text: `<p>Before any RL, LeRobot asks you to run <code>lerobot-find-joint-limits</code> and move the arm over the region where the task happens. It records every end-effector position (computed from the joint angles with forward kinematics on the URDF) and prints the smallest and largest x, y and z it saw:</p>
${code(`# End Effector Bounds (x, y, z):
max_ee = [0.2417, 0.2012, 0.1027]
min_ee = [0.1663, -0.0823, 0.0336]`)}
<p>Those two corners become <code>env.processor.inverse_kinematics.end_effector_bounds</code>. During training every action is a small step <code>Δ</code> per axis, scaled by <code>end_effector_step_sizes</code> (for example 0.02 m), and the new target is <b>clipped</b> into the box before inverse kinematics turns it into joint angles. The policy cannot hit the table or wander off, and exploring a small box is far faster than exploring every joint configuration. The guide says plainly that RL in joint space is much harder and some tasks are nearly impossible there.</p>
<p><b>Your task</b>: write three functions.</p>
<ul>
<li><code>workspace_bounds(points, margin)</code>: <code>points</code> is a list of <code>[x, y, z]</code>. Return <code>{"min": [...], "max": [...]}</code>, the per-axis minimum minus <code>margin</code> and maximum plus <code>margin</code>.</li>
<li><code>clip_to_bounds(p, bounds)</code>: return <code>p</code> with each coordinate clamped into the box.</li>
<li><code>ee_step(p, delta, step_sizes, bounds)</code>: <code>delta</code> and <code>step_sizes</code> are dicts with keys <code>"x"</code>, <code>"y"</code>, <code>"z"</code>. Clamp each delta into [−1, 1], move <code>p</code> by <code>delta × step_size</code>, then clip into the box. Return a new list.</li>
</ul>
${defined('<code>AXES = ["x", "y", "z"]</code> and <code>MARGIN = 0.01</code>. The lab bench feeds a recorded trace through your functions and pushes the arm towards a corner.')}`,
    pre: 'AXES = ["x", "y", "z"]\n',
    starter: `MARGIN = 0.01   # metres of slack around what you recorded

def workspace_bounds(points, margin=MARGIN):
    lo = ...
    hi = ...
    return {"min": lo, "max": hi}

def clip_to_bounds(p, bounds):
    return ...

def ee_step(p, delta, step_sizes, bounds):
    new = []
    for i, axis in enumerate(AXES):
        d = ...   # clamp delta[axis] into [-1, 1]
        new.append(p[i] + d * step_sizes[axis])
    return ...
`,
    solution: `MARGIN = 0.01   # metres of slack around what you recorded

def workspace_bounds(points, margin=MARGIN):
    lo = [min(p[i] for p in points) - margin for i in range(3)]
    hi = [max(p[i] for p in points) + margin for i in range(3)]
    return {"min": lo, "max": hi}

def clip_to_bounds(p, bounds):
    return [min(bounds["max"][i], max(bounds["min"][i], p[i])) for i in range(3)]

def ee_step(p, delta, step_sizes, bounds):
    new = []
    for i, axis in enumerate(AXES):
        d = max(-1.0, min(1.0, delta[axis]))
        new.append(p[i] + d * step_sizes[axis])
    return clip_to_bounds(new, bounds)
`,
    hint: 'For the bounds, use <code>min(p[i] for p in points)</code> for each axis i. For the step, clamp with <code>max(-1.0, min(1.0, x))</code>, then reuse <code>clip_to_bounds</code> on the result.',
    tests: [
      ['bounds of the guide’s two corners', `b = workspace_bounds([[0.1663, -0.0823, 0.0336], [0.2417, 0.2012, 0.1027]], 0.0)\nassert [round(v, 4) for v in b["min"]] == [0.1663, -0.0823, 0.0336], b\nassert [round(v, 4) for v in b["max"]] == [0.2417, 0.2012, 0.1027], b`],
      ['the margin widens the box on both sides', `b = workspace_bounds([[0, 0, 0], [1, 2, 3]], 0.5)\nassert b["min"] == [-0.5, -0.5, -0.5] and b["max"] == [1.5, 2.5, 3.5], b`],
      ['points inside stay put, points outside are clamped', `B = {"min": [0, 0, 0], "max": [1, 1, 1]}\nassert clip_to_bounds([0.5, 0.2, 0.9], B) == [0.5, 0.2, 0.9]\nassert clip_to_bounds([-1, 2, 0.5], B) == [0, 1, 0.5]`],
      ['a step moves by delta × step size', `B = {"min": [0, 0, 0], "max": [1, 1, 1]}\nq = ee_step([0.5, 0.5, 0.5], {"x": 1, "y": -1, "z": 0}, {"x": 0.02, "y": 0.02, "z": 0.02}, B)\nassert [round(v, 6) for v in q] == [0.52, 0.48, 0.5], q`],
      ['deltas beyond ±1 are clamped, and the box always wins', `B = {"min": [0, 0, 0], "max": [1, 1, 1]}\nq = ee_step([0.5, 0.99, 0.5], {"x": 5, "y": 1, "z": -3}, {"x": 0.02, "y": 0.02, "z": 0.02}, B)\nassert [round(v, 6) for v in q] == [0.52, 1.0, 0.48], q`],
    ],
  },
  {
    id: 'hil_keyboard', course: 'hilserl', title: '3 · Your keyboard is the gamepad', viz: 'hilpad',
    text: `<p>HIL-SERL learns in end-effector space, so whatever you teleoperate with must output the same four numbers: <code>delta_x</code>, <code>delta_y</code>, <code>delta_z</code> (each −1, 0 or +1, scaled later by the step sizes) and a <code>gripper</code> command (<b>0 = close, 1 = stay, 2 = open</b>). It must also report <b>events</b>: am I intervening right now, was that a success, should this episode be re-recorded or ended.</p>
<p>A gamepad does this with sticks and buttons. LeRobot’s ${L(KB_SRC, '<code>keyboard_ee</code> teleoperator')} does it with these keys (this is the real mapping, so what you learn here is what your fingers will do on the SO-101):</p>
${KEYTABLE}
<p>Two things differ from the gamepad and are worth knowing before you touch the real arm:</p>
<ul>
<li><b>Intervention is “hold to drive”.</b> With a gamepad you hold a trigger to take over. With <code>keyboard_ee</code>, holding any move or gripper key is the takeover; let go and the policy is back in control.</li>
<li><b>There is no separate “failure” key.</b> <kbd>Q</kbd> ends the episode without success (reward 0), which is what failure means here. A time-out (<code>control_time_s</code>, 20 s by default) also ends it with reward 0.</li>
</ul>
<p>The arrow directions follow the robot’s base frame (+x points forward from the base, +y to the robot’s left). They read naturally if you stand on the robot’s left side, which is where the lab camera is.</p>
<p><b>Your task</b>: write <code>keys_to_action(pressed, use_gripper=True)</code>. <code>pressed</code> is a set of key names like <code>{"up", "shift_r"}</code>. Return a tuple <code>(action, events)</code>:</p>
<ul>
<li><code>action</code>: a dict with <code>"delta_x"</code>, <code>"delta_y"</code>, <code>"delta_z"</code> as floats, plus <code>"gripper"</code> (an int 0/1/2) only when <code>use_gripper</code> is true. If both keys of a pair are held, they cancel (add their contributions).</li>
<li><code>events</code>: a dict with booleans <code>"is_intervention"</code> (any key in <code>CONTROL_KEYS</code> held), <code>"success"</code> (<kbd>s</kbd>), <code>"rerecord_episode"</code> (<kbd>r</kbd>) and <code>"terminate_episode"</code> (<kbd>r</kbd> or <kbd>q</kbd>).</li>
</ul>
${defined('<code>CONTROL_KEYS = {"up", "down", "left", "right", "shift", "shift_r", "ctrl_l", "ctrl_r"}</code>.')}
<p>Then <b>play</b>: the lab bench turns into a gamepad you drive with your keyboard (click it first so it has focus), calling your function 20 times a second. Pick up the red cube, lift it, press <kbd>S</kbd>. Try <kbd>R</kbd> and <kbd>Q</kbd> too and watch the episode log.</p>`,
    pre: 'CONTROL_KEYS = {"up", "down", "left", "right", "shift", "shift_r", "ctrl_l", "ctrl_r"}\n',
    starter: `def keys_to_action(pressed, use_gripper=True):
    dx = dy = dz = 0.0
    if "up" in pressed:
        dy -= 1.0
    # ... down, left, right, shift, shift_r

    gripper = 1                      # stay
    # ... ctrl_l closes (0), ctrl_r opens (2)

    action = {"delta_x": dx, "delta_y": dy, "delta_z": dz}
    # ... add the gripper only when use_gripper is true

    events = {
        "is_intervention": ...,
        "success": ...,
        "rerecord_episode": ...,
        "terminate_episode": ...,
    }
    return action, events
`,
    solution: `def keys_to_action(pressed, use_gripper=True):
    dx = dy = dz = 0.0
    if "up" in pressed:
        dy -= 1.0
    if "down" in pressed:
        dy += 1.0
    if "left" in pressed:
        dx += 1.0
    if "right" in pressed:
        dx -= 1.0
    if "shift" in pressed:
        dz -= 1.0
    if "shift_r" in pressed:
        dz += 1.0

    gripper = 1                      # stay
    if "ctrl_l" in pressed:
        gripper = 0                  # close
    if "ctrl_r" in pressed:
        gripper = 2                  # open

    action = {"delta_x": dx, "delta_y": dy, "delta_z": dz}
    if use_gripper:
        action["gripper"] = gripper

    events = {
        "is_intervention": bool(set(pressed) & CONTROL_KEYS),
        "success": "s" in pressed,
        "rerecord_episode": "r" in pressed,
        "terminate_episode": "r" in pressed or "q" in pressed,
    }
    return action, events
`,
    hint: 'Each key adds +1 or −1 to one axis, so “up” and “down” together give 0. For intervention, <code>bool(set(pressed) &amp; CONTROL_KEYS)</code> is true when the two sets share any key.',
    tests: [
      ['nothing pressed: no motion, gripper stays, policy in control', `a, e = keys_to_action(set())\nassert a == {"delta_x": 0.0, "delta_y": 0.0, "delta_z": 0.0, "gripper": 1}, a\nassert e["is_intervention"] is False and not e["success"] and not e["terminate_episode"], e`],
      ['arrows follow LeRobot’s keyboard_ee mapping', `a, _ = keys_to_action({"up", "left"})\nassert (a["delta_x"], a["delta_y"]) == (1.0, -1.0), a\na, _ = keys_to_action({"down", "right"})\nassert (a["delta_x"], a["delta_y"]) == (-1.0, 1.0), a`],
      ['left shift lowers, right shift raises, both cancel', `assert keys_to_action({"shift"})[0]["delta_z"] == -1.0\nassert keys_to_action({"shift_r"})[0]["delta_z"] == 1.0\nassert keys_to_action({"shift", "shift_r"})[0]["delta_z"] == 0.0`],
      ['left ctrl closes (0), right ctrl opens (2)', `assert keys_to_action({"ctrl_l"})[0]["gripper"] == 0\nassert keys_to_action({"ctrl_r"})[0]["gripper"] == 2`],
      ['holding a move or gripper key is an intervention; S alone is not', `assert keys_to_action({"right"})[1]["is_intervention"] is True\nassert keys_to_action({"ctrl_l"})[1]["is_intervention"] is True\nassert keys_to_action({"s"})[1]["is_intervention"] is False`],
      ['S = success, R = re-record (and end), Q = end without success', `e = keys_to_action({"s"})[1]; assert e["success"] and not e["rerecord_episode"], e\ne = keys_to_action({"r"})[1]; assert e["rerecord_episode"] and e["terminate_episode"], e\ne = keys_to_action({"q"})[1]; assert e["terminate_episode"] and not e["success"] and not e["rerecord_episode"], e`],
      ['no gripper entry when use_gripper is False', `a, _ = keys_to_action({"ctrl_r"}, use_gripper=False)\nassert "gripper" not in a and len(a) == 3, a`],
    ],
  },
  {
    id: 'hil_actor', course: 'hilserl', title: '4 · The actor: interventions, rewards and episode ends',
    text: `<p>On the robot, LeRobot’s actor runs a loop at <code>env.fps</code> (10 Hz in the example config): read cameras and joints, ask the policy for an action, and send it. Processor steps in between do the human-in-the-loop part. <code>InterventionActionProcessorStep</code> swaps in your teleop action while you intervene, and the episode-control events decide the reward and when the episode ends. Every transition goes to the learner with an <code>is_intervention</code> flag, so the learner knows which actions came from you.</p>
<p>The rules, with the defaults from <code>ResetConfig</code>:</p>
<ul>
<li>Re-record: drop the episode, don’t learn from it, start it again.</li>
<li>Success: reward 1. With <code>terminate_on_success = True</code> the episode ends. When recording data for a <b>reward classifier</b> you set it to <code>False</code>, so the episode keeps going and you collect many more “success” frames.</li>
<li>Terminate (Q, or the gamepad’s fail button): reward 0, episode ends.</li>
<li>Time limit: after <code>control_time_s</code> seconds (20 by default) the episode ends with reward 0.</li>
</ul>
<p><b>Your task</b>:</p>
<ul>
<li><code>choose_action(policy_action, teleop_action, is_intervention)</code>: the action that is actually sent.</li>
<li><code>episode_outcome(events, step, fps, control_time_s=20.0, terminate_on_success=True)</code>: return <code>(reward, done, rerecord)</code>, checking in the order above. <code>step</code> counts from 0, so the episode has lasted <code>(step + 1) / fps</code> seconds after this step. Missing event keys mean <code>False</code>.</li>
<li><code>intervention_rate(flags)</code>: the fraction of <code>True</code> in a list of per-step <code>is_intervention</code> flags (0.0 for an empty list). This is the curve you watch in Trackio: high at first, falling as the policy learns.</li>
</ul>`,
    starter: `def choose_action(policy_action, teleop_action, is_intervention):
    return ...

def episode_outcome(events, step, fps, control_time_s=20.0, terminate_on_success=True):
    # returns (reward, done, rerecord)
    ...
    return 0.0, False, False

def intervention_rate(flags):
    return ...
`,
    solution: `def choose_action(policy_action, teleop_action, is_intervention):
    return teleop_action if is_intervention else policy_action

def episode_outcome(events, step, fps, control_time_s=20.0, terminate_on_success=True):
    # returns (reward, done, rerecord)
    if events.get("rerecord_episode", False):
        return 0.0, True, True
    if events.get("success", False):
        return 1.0, terminate_on_success, False
    if events.get("terminate_episode", False):
        return 0.0, True, False
    if (step + 1) / fps >= control_time_s:
        return 0.0, True, False
    return 0.0, False, False

def intervention_rate(flags):
    return sum(1 for f in flags if f) / len(flags) if flags else 0.0
`,
    hint: 'Use <code>events.get("success", False)</code> so missing keys are False. Return early in the order: re-record, success, terminate, time limit.',
    tests: [
      ['the human wins while intervening', `assert choose_action("pi", "you", True) == "you"\nassert choose_action("pi", "you", False) == "pi"`],
      ['a normal step: no reward, not done', `assert episode_outcome({}, 5, 10) == (0.0, False, False)`],
      ['success ends the episode with reward 1', `assert episode_outcome({"success": True}, 30, 10) == (1.0, True, False)`],
      ['…but keeps going when recording classifier data', `assert episode_outcome({"success": True}, 30, 10, terminate_on_success=False) == (1.0, False, False)`],
      ['Q / fail ends with reward 0; re-record wins over everything', `assert episode_outcome({"terminate_episode": True}, 3, 10) == (0.0, True, False)\nassert episode_outcome({"terminate_episode": True, "rerecord_episode": True, "success": True}, 3, 10) == (0.0, True, True)`],
      ['the 20 s limit at 10 Hz is step 199', `assert episode_outcome({}, 198, 10) == (0.0, False, False)\nassert episode_outcome({}, 199, 10) == (0.0, True, False)`],
      ['intervention rate', `assert intervention_rate([True, False, False, True]) == 0.5\nassert intervention_rate([]) == 0.0`],
    ],
  },
  {
    id: 'hil_vision', course: 'hilserl', title: '5 · Crop, resize, and a reward from a classifier',
    text: `<p>Visual RL is easily distracted: a shadow, a person walking past or a mug at the edge of the frame changes the image and the policy’s value estimates with it. So LeRobot crops every camera to a <b>region of interest</b> (just the workspace, the gripper and the objects) and resizes it to 128×128 (or 64×64 to save GPU memory). You choose the crop once with <code>python -m lerobot.rl.crop_dataset_roi</code>, which prints rectangles as <b>(top, left, height, width)</b>:</p>
${code(`observation.images.side: [180, 207, 180, 200]
observation.images.front: [180, 250, 120, 150]`)}
<p>Those go into <code>env.processor.image_preprocessing.crop_params_dict</code>, and <code>ImageCropResizeProcessorStep</code> applies them on every frame.</p>
<p>Pressing <kbd>S</kbd> for every success works, but an optional <b>reward classifier</b> (a small pretrained CNN, e.g. ResNet-10, trained on your success / not-success frames) can do it for you. It outputs a probability, and <code>RewardClassifierProcessorStep</code> turns that into a reward with <code>success_threshold</code> and <code>success_reward</code>.</p>
<p><b>Your task</b> (images are lists of rows of numbers here, standing in for one camera channel):</p>
<ul>
<li><code>crop(image, top, left, height, width)</code>: the sub-image.</li>
<li><code>resize_nearest(image, out_h, out_w)</code>: nearest-neighbour resize. Output pixel <code>(i, j)</code> takes input row <code>i * in_h // out_h</code> and column <code>j * in_w // out_w</code>.</li>
<li><code>classifier_reward(prob, success_threshold=0.5, success_reward=1.0)</code>: <code>success_reward</code> when <code>prob</code> is strictly greater than the threshold, else 0.0. Returns <code>(reward, is_success)</code>.</li>
</ul>`,
    starter: `def crop(image, top, left, height, width):
    return ...

def resize_nearest(image, out_h, out_w):
    in_h, in_w = len(image), len(image[0])
    return ...

def classifier_reward(prob, success_threshold=0.5, success_reward=1.0):
    return ...
`,
    solution: `def crop(image, top, left, height, width):
    return [row[left:left + width] for row in image[top:top + height]]

def resize_nearest(image, out_h, out_w):
    in_h, in_w = len(image), len(image[0])
    return [[image[i * in_h // out_h][j * in_w // out_w] for j in range(out_w)] for i in range(out_h)]

def classifier_reward(prob, success_threshold=0.5, success_reward=1.0):
    ok = prob > success_threshold
    return (success_reward if ok else 0.0), ok
`,
    hint: 'Slices do the crop: rows <code>image[top:top + height]</code>, then <code>row[left:left + width]</code> in each row.',
    tests: [
      ['crop picks the right rectangle', `img = [[10 * r + c for c in range(6)] for r in range(5)]\nassert crop(img, 1, 2, 2, 3) == [[12, 13, 14], [22, 23, 24]]`],
      ['crop keeps (top, left, height, width) order', `img = [[10 * r + c for c in range(6)] for r in range(5)]\nout = crop(img, 0, 4, 3, 2)\nassert len(out) == 3 and len(out[0]) == 2 and out[0] == [4, 5], out`],
      ['nearest-neighbour downscale', `img = [[r * 4 + c for c in range(4)] for r in range(4)]\nassert resize_nearest(img, 2, 2) == [[0, 2], [8, 10]]`],
      ['nearest-neighbour upscale', `assert resize_nearest([[1, 2]], 2, 4) == [[1, 1, 2, 2], [1, 1, 2, 2]]`],
      ['threshold and reward value', `assert classifier_reward(0.8, 0.7) == (1.0, True)\nassert classifier_reward(0.7, 0.7) == (0.0, False)\nassert classifier_reward(0.9, 0.5, 2.0) == (2.0, True)`],
    ],
  },
  {
    id: 'hil_quiz', course: 'hilserl', title: '6 · Check: before you power the arm', kind: 'quiz',
    quiz: [
      { q: 'You are holding ← on the keyboard_ee teleop while the policy is running. What happens?', options: ['Nothing until you press Space to take over', 'You are intervening: your Δx = +1 action is sent instead of the policy’s, and the step is flagged as an intervention', 'The episode ends as a failure'], answer: 1 },
      { q: 'The arm keeps trying to swing out over the edge of the table. What should you fix first?', options: ['Raise temperature_init so it explores more', 'Tighten end_effector_bounds (re-run lerobot-find-joint-limits over just the task area)', 'Lower the image resolution to 64×64'], answer: 1 },
      { q: 'You are recording data to train a reward classifier. How should terminate_on_success be set?', options: ['False, so episodes continue after success and you collect many success frames', 'True, as for normal HIL-SERL training', 'It does not matter'], answer: 0 },
      { q: 'Learning stalls and your interventions seem to have no effect. Which setting does the guide point to?', options: ['temperature_init is too high; start around 1e-2', 'policy_parameters_push_frequency is too low', 'storage_device should be "cpu"'], answer: 0 },
      { q: 'What does a healthy intervention-rate curve look like?', options: ['Flat at zero from the start', 'High early, then falling as the policy improves', 'Rising steadily until the end'], answer: 1 },
    ],
    text: `<p>Five questions on what you just built. They are the mistakes that cost the most time on a real arm.</p>`,
  },
  {
    id: 'proj_hilserl', course: 'hilserl', kind: 'read', title: 'Project: HIL-SERL on your SO-101 with a keyboard',
    text: `<p><b>Goal.</b> Train an SO-101 to <i>pick up a cube and lift it</i> (or push it into a marked area) with LeRobot’s HIL-SERL, using your keyboard as the teleoperator, until the policy succeeds on its own. Allow a weekend: about 1 h of setup, 30 min of demos, and 1–3 h of supervised training. Commands follow the ${L(DOC, 'LeRobot HIL-SERL guide')}; flags change between LeRobot versions, so check <code>--help</code> if one is rejected.</p>

<h3>0 · Install and get the URDF</h3>
${code(`git clone https://github.com/huggingface/lerobot.git && cd lerobot
pip install -e ".[hilserl]"
git clone https://github.com/TheRobotStudio/SO-ARM100.git   # URDF: SO-ARM100/Simulation/SO101/so101_new_calib.urdf
hf auth login                                                # only if you will push datasets/models to the Hub`)}
<p>Calibrate the follower first (<code>lerobot-calibrate</code>), and find its port with <code>lerobot-find-port</code> (on Linux it is usually <code>/dev/ttyACM0</code>).</p>
<p><b>Keyboard on Linux</b>: <code>keyboard_ee</code> uses <code>pynput</code>, which listens to the whole desktop session. It works under X11. Under Wayland it often sees no keys at all, so if nothing moves, log in with an X11 (“Xorg”) session. Because it listens globally, keys you type in other windows also count: keep your hands off the keyboard unless you mean it.</p>

<h3>1 · Find the workspace bounds</h3>
<p>Move the arm over the task area while the script records end-effector positions. The guide’s tool reads a leader arm:</p>
${code(`lerobot-find-joint-limits \\
  --robot.type=so101_follower \\
  --robot.port=/dev/ttyACM0 \\
  --robot.id=my_follower \\
  --teleop.type=so101_leader \\
  --teleop.port=/dev/ttyACM1 \\
  --teleop.id=my_leader \\
  --urdf_path=SO-ARM100/Simulation/SO101/so101_new_calib.urdf \\
  --target_frame_name=gripper_frame_link`)}
<p>No leader arm? Start with a small, conservative box around the cube (for example min <code>[0.16, -0.08, 0.03]</code>, max <code>[0.24, 0.20, 0.10]</code>, as in the guide), drive the arm around it with the keyboard in step 3’s recording mode, and widen or shrink it until the gripper can reach everything it needs and nothing else. <b>Frame name</b>: use the same link name for <code>--target_frame_name</code> and <code>target_frame_name</code> in the config. The guide’s examples use <code>gripper</code> and <code>end_effector</code>; list the links your URDF actually has with <code>grep '&lt;link name' SO-ARM100/Simulation/SO101/so101_new_calib.urdf</code> and pick the gripper frame.</p>

<h3>2 · Write the environment config</h3>
<p>Download the example configs, then edit <code>rl/env_config.json</code>:</p>
${code(`hf download lerobot/config_examples rl/env_config.json rl/train_config.json --repo-type dataset --local-dir .`)}
<p>The parts that matter for an SO-101 with a keyboard (keep the rest of the example file as it is):</p>
${code(`{
  "env": {
    "type": "gym_manipulator",
    "name": "real_robot",
    "fps": 10,
    "robot": {
      "type": "so101_follower",
      "port": "/dev/ttyACM0",
      "id": "my_follower",
      "cameras": {
        "front": { "type": "opencv", "index_or_path": 0, "width": 640, "height": 480, "fps": 30 },
        "wrist": { "type": "opencv", "index_or_path": 2, "width": 640, "height": 480, "fps": 30 }
      }
    },
    "teleop": {
      "type": "keyboard_ee",
      "use_gripper": true
    },
    "processor": {
      "observation": { "display_cameras": false },
      "image_preprocessing": { "crop_params_dict": {}, "resize_size": [128, 128] },
      "gripper": { "use_gripper": true, "gripper_penalty": 0.0 },
      "reset": {
        "fixed_reset_joint_positions": [0.0, 0.0, 0.0, 90.0, 0.0, 30.0],
        "reset_time_s": 5.0,
        "control_time_s": 20.0,
        "terminate_on_success": true
      },
      "inverse_kinematics": {
        "urdf_path": "SO-ARM100/Simulation/SO101/so101_new_calib.urdf",
        "target_frame_name": "gripper_frame_link",
        "end_effector_bounds": { "min": [0.16, -0.08, 0.03], "max": [0.24, 0.20, 0.10] },
        "end_effector_step_sizes": { "x": 0.02, "y": 0.02, "z": 0.02 }
      }
    }
  },
  "dataset": {
    "repo_id": "YOUR_HF_USER/so101_lift_cube",
    "root": null,
    "task": "pick up the cube and lift it",
    "num_episodes_to_record": 15,
    "replay_episode": null,
    "push_to_hub": true
  },
  "mode": "record",
  "device": "cpu"
}`)}
<ul>
<li><b>Bounds</b>: paste yours from step 1 (or your conservative box).</li>
<li><b>Reset pose</b>: <code>fixed_reset_joint_positions</code> is one value per motor (shoulder pan, shoulder lift, elbow flex, wrist flex, wrist roll, gripper), in degrees with the follower’s default <code>use_degrees</code>. The numbers above are placeholders: put the arm in a comfortable pose above the cube, read its positions, and use those.</li>
<li><b>Cameras</b>: find indices with <code>lerobot-find-cameras opencv</code>. Camera names become <code>observation.images.front</code> and <code>observation.images.wrist</code>.</li>
<li><b>control_mode</b>: the guide shows <code>"gamepad"</code> or <code>"leader"</code>. The teleoperator is chosen by <code>teleop.type</code>, so <code>keyboard_ee</code> is what makes it a keyboard; leave <code>control_mode</code> at its default.</li>
</ul>

<h3>3 · Record 10–20 demonstrations</h3>
${code(`python -m lerobot.rl.gym_manipulator --config_path rl/env_config.json`)}
<p>Each episode: the arm moves to the reset pose, you have 20 s. Drive with the arrows and shifts, close with <b>Left Ctrl</b>, lift, press <kbd>S</kbd>. Press <kbd>R</kbd> to redo a bad one and <kbd>Q</kbd> to end one as a failure. Keep the demos short and direct, and vary the cube position a little.</p>
${KEYTABLE}

<h3>4 · Crop the cameras</h3>
${code(`python -m lerobot.rl.crop_dataset_roi --repo-id YOUR_HF_USER/so101_lift_cube`)}
<p>Draw a rectangle around the workspace on each camera, press <kbd>c</kbd> to confirm, and copy the printed <code>[top, left, height, width]</code> values into <code>crop_params_dict</code> (keys like <code>"observation.images.front"</code>) in <b>both</b> config files. The script also writes a cropped copy of the dataset; train on that.</p>

<h3>5 · (Optional) a reward classifier</h3>
<p>Start with <kbd>S</kbd> as your reward. If you get tired of pressing it, record 20 episodes with <code>"terminate_on_success": false</code> into a new <code>repo_id</code>, then train with <code>lerobot-train --config_path reward_classifier_train_config.json</code> using the classifier config from the guide (ResNet-10 encoder, two cameras, 128×128). The guide’s example encoder <code>helper2424/resnet10</code> needs <code>trust_remote_code</code>: read its code on the Hub before you enable that. Then point <code>env.processor.reward_classifier.pretrained_path</code> at the trained model, with a <code>success_threshold</code> around 0.7.</p>

<h3>6 · Train: learner and actor</h3>
<p>Edit <code>rl/train_config.json</code>: copy the same <code>env</code> block in (robot, <code>keyboard_ee</code> teleop, bounds, crop), point <code>dataset.repo_id</code> at your cropped dataset, set the policy device to <code>cuda</code>, and check that the policy’s input features match your camera names. Then, in two terminals on the machine with the GPU and the arm (or run the learner on a GPU box and the actor next to the arm):</p>
${code(`# terminal 1: the learner (SAC on the GPU, gRPC server)
python -m lerobot.rl.learner --config_path rl/train_config.json

# terminal 2: the actor (drives the arm, sends transitions)
python -m lerobot.rl.actor --config_path rl/train_config.json`)}
<p>With <code>trackio.enable</code> set to true, follow it with <code>trackio show --project &lt;project&gt;</code>.</p>
<p><b>How to intervene well</b> (from the guide): let the policy explore on its own for the first few episodes. When it heads the wrong way, hold the arrow keys for a moment to steer it, then let go. Don’t drive whole episodes yourself. Once it roughly works, intervene only with short nudges, for example a quick <b>Left Ctrl</b> to grasp at the right moment. Watch the intervention rate: high at first, falling over time. Press <kbd>S</kbd> on successes if you have no classifier.</p>
<p><b>Settings worth knowing</b>:</p>
<ul>
<li><code>algorithm.temperature_init</code>: start at <code>1e-2</code>. Too high and the policy explores so much that your corrections barely register.</li>
<li><code>policy.actor_learner_config.policy_parameters_push_frequency</code>: default 4 s. 1–2 s gives the actor fresher weights if your network can take it.</li>
<li><code>policy.storage_device</code>: set it to <code>"cuda"</code> if the GPU has room, so the learner does more updates per second.</li>
<li><code>env.processor.gripper.gripper_penalty</code>: a small negative reward for useless gripper commands. Leave it at 0 until the basic task works.</li>
</ul>

<h3>Troubleshooting</h3>
<ul>
<li><b>Keys do nothing</b>: Wayland (see step 0), or no desktop session (pynput needs one; run it from a terminal in your graphical session, not over plain SSH).</li>
<li><b>The arm jerks or refuses to move</b>: the target is outside the bounds, or the URDF frame name doesn’t exist. Check both, and that the follower is calibrated.</li>
<li><b>It works in demos but RL never improves</b>: tighten the crop, shrink the bounds to the task, lower <code>temperature_init</code>, and make sure your successes actually produce reward 1 (watch the logged reward).</li>
</ul>
${stretch('Plot intervention rate and success rate per episode from your Trackio logs and say when the policy “took over”.', 'Train the reward classifier and compare training time with manual <kbd>S</kbd> rewards.', 'Move on to pick-and-place, with a second goal area, once lift works reliably.', 'Buy a cheap gamepad and compare: is it easier to give short, precise interventions with a stick or with keys?')}`,
  },
];
