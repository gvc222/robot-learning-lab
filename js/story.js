// The "job": tickets, chat messages from your teammates, and the step-by-step guide popups.
import { state, episodes } from './util.js';
import { LESSONS } from './course/lessons.js';

const courseDone = (courses) => LESSONS.filter((l) => courses.includes(l.course)).every((l) => state.course.done[l.id]);
const courseCount = (c) => `${LESSONS.filter((l) => l.course === c && state.course.done[l.id]).length}/${LESSONS.filter((l) => l.course === c).length} lessons`;
const lessonsDone = (ids) => ids.filter((id) => state.course.done[id]).length;
const goodDreams = () => episodes.filter((e) => e.source === 'dream' && e.label === 'keep' && e.kind === 'good').length;
const myGoodDemos = () => episodes.filter((e) => e.source === 'you' && e.task === 'red_bin' && e.robot === 'sprout' && e.metrics.success).length;

export const TICKETS = [
  { id: 'ROB-1', title: 'Meet the team', app: 'tickets', desc: 'Badge in and say hi.', done: () => !!state.name },
  { id: 'ROB-2', title: 'Academy: robot basics', app: 'academy',
    desc: 'Five short coding lessons: joint angles, kinematics and a control loop. You write the code, the tests check it.',
    done: () => courseDone(['basics']) || state.seen.skipBasics, progress: () => courseCount('basics') },
  { id: 'ROB-3', title: 'Teleoperate 3 demos', app: 'teleop',
    desc: 'Drive the Sprout arm with your keyboard and record 3 successful demos of “put the red cube in the bin”.',
    done: () => myGoodDemos() >= 3, progress: () => `${Math.min(3, myGoodDemos())}/3 successful demos` },
  { id: 'ROB-4', title: 'Clean the dataset', app: 'dataset',
    desc: 'Dev’s operators recorded more demos overnight. Watch every one, keep the good, discard the bad, then submit QA.',
    done: () => !!state.seen.qaSubmitted },
  { id: 'ROB-5', title: 'Train your first policy', app: 'train',
    desc: 'Fine-tune a model on your cleaned dataset and read the loss curves.',
    done: () => state.policies.some((p) => !p.baseline && !p.error) },
  { id: 'ROB-6', title: 'Evaluate on the workbench', app: 'eval',
    desc: 'Compare your policy against Maya’s baseline (trained on the uncleaned data): at least 10 trials each, same task language.',
    done: () => state.evals.some((e) => e.rows.length >= 2 && e.trials >= 10) },
  { id: 'ROB-7', title: 'Academy: simulation & RL', app: 'academy', optional: true,
    desc: 'Optional deep-dive: MuJoCo XML, a scripted pick, sim-to-real, rewards, Q-learning, RL on a simulator and reward models.',
    done: () => courseDone(['sim', 'rl']), progress: () => `${courseCount('sim')} sim · ${courseCount('rl')} RL` },
  { id: 'ROB-8', title: 'Capstone: ship the Friday demo', app: 'brief',
    desc: 'No more hand-holding. Read the project brief and hit every metric.',
    done: () => state.capstone.done },
  // ── Week 2: research tools ──
  { id: 'ROB-9', title: 'Dream up training data', app: 'dreams', week: 2,
    desc: 'Use a video world model to generate neural trajectories (DreamGen-style), review them, and add at least 4 good ones to your dataset.',
    done: () => goodDreams() >= 4, progress: () => `${Math.min(4, goodDreams())}/4 good dreams in the dataset` },
  { id: 'ROB-10', title: 'Annotate subtasks, train with language', app: 'dataset', week: 2,
    desc: 'Segment and caption episodes (by hand or with the auto-labeler), then train a language-conditioned policy with subtask captions.',
    done: () => state.policies.some((p) => !p.baseline && !p.reference && p.cfg?.lang && p.cfg.lang !== 'task' && p.stats?.annotated > 0) },
  { id: 'ROB-11', title: 'Academy: data, language & human video', app: 'academy', week: 2,
    desc: 'Subtask segmentation, what language buys you, egocentric pretraining, evaluation statistics, LeRobot export.',
    done: () => courseDone(['data']), progress: () => courseCount('data') },
  { id: 'ROB-12', title: 'Break it on the “real robot”', app: 'eval', week: 2,
    desc: 'Evaluate under shifted physics or the “real robot” toggle, and compare a domain-randomized policy with a normal one.',
    done: () => !!state.seen.sim2realEval && state.policies.some((p) => p.dr) },
  { id: 'ROB-13', title: 'Build and calibrate an SO-101', app: 'academy', week: 2,
    desc: 'The open-source arm from LeRobot: parts, motor IDs, assembly, wrist camera, arm calibration, camera intrinsics and extrinsics.',
    done: () => courseDone(['hardware']), progress: () => courseCount('hardware') },
  { id: 'ROB-14', title: 'CoRL 2026 Review Club', app: 'academy', week: 2,
    desc: 'Review the CoRL 2026 award finalists (SuperMimic won Best Paper) plus Diffusion Policy, FLORA and DreamGen. Complete at least 6.',
    done: () => LESSONS.filter((l) => l.course === 'corl' && state.course.done[l.id]).length >= 6, progress: () => courseCount('corl') },
  { id: 'ROB-15', title: 'Ship your data to LeRobot', app: 'dataset', week: 2,
    desc: 'Export your kept episodes as a LeRobotDataset bundle you can train with the real LeRobot.',
    done: () => !!state.seen.exported },
];

export const activeTicket = () => TICKETS.find((t) => !t.optional && !t.done());

export const PEOPLE = {
  Maya: { av: '👩🏽‍🔬', role: 'Research lead' },
  Dev: { av: '🧑🏻‍💻', role: 'Teleop operations' },
  'cluster-bot': { av: '🤖', role: 'GPU cluster' },
  You: { av: '🙂', role: '' },
};

// Posted to chat when a ticket becomes the active one.
export const BRIEFINGS = {
  'ROB-2': [['Maya', 'Welcome aboard! Before you touch a robot, do the <b>Academy</b> basics. It is five tiny coding exercises in Python. If you already know forward kinematics and P-control, there is a skip button in there.']],
  'ROB-3': [['Maya', 'Nice. Now the fun part. Robots learn manipulation mostly by <b>imitation</b>: a human drives the arm, we record what they saw and did, and a model learns to copy it. Open the <b>Teleop</b> station and record 3 clean demos.'],
    ['Dev', 'Tip from the ops floor: smooth and boring beats fast and heroic. The model copies your hesitations too.']],
  'ROB-4': [['Dev', 'My operators recorded 24 more episodes on Sprout overnight. Honest warning: night shift is… variable. They are in <b>Dataset</b>.'],
    ['Maya', 'Watch every episode. The numbers will point at suspects but only the video tells you what happened. Bad demos in → bad policy out.']],
  'ROB-5': [['Maya', 'Dataset looks reviewed. Open <b>Train</b> and fine-tune <b>ACT</b> on “put the red cube in the bin”. Watch the train and validation loss.'],
    ['cluster-bot', 'Reminder: every job is billed in GPU-hours. Your usage is in the top bar.']],
  'ROB-6': [['Maya', 'I trained a baseline, <code>maya/act-rawdata</code>, on the same demos <i>without</i> any cleaning. Put both on the <b>Eval</b> workbench with the same task language and see what your QA was worth. Then play with the parameters.']],
  'ROB-9': [['Maya', 'Week 2. You have seen how expensive teleop is. Today: <b>world models</b>. Open the <b>Dream Lab</b>, snapshot the scene from the robot camera, and prompt a video model to imagine demos for you.'],
    ['Dev', 'Fair warning: dreams lie. Objects teleport, the model ignores the prompt. Review them like my night shift.']],
  'ROB-10': [['Maya', 'One sentence per 8-second demo wastes information. Segment the episodes into subtasks and caption them (the <b>Dataset</b> auto-labeler is a FLORA-style VLM), then train a language model with <b>subtask captions</b>.']],
  'ROB-11': [['Maya', 'Time to read. The <b>Academy</b> has a new course on data: subtasks, language, human video, and how many trials an eval really needs.']],
  'ROB-12': [['Maya', 'Simulators flatter you. In <b>Eval</b>, crank friction and mass or flip the “real robot” switch. Then train one policy with <b>domain randomization</b> and compare.']],
  'ROB-13': [['Dev', 'Our SO-101 kits arrived. Before you touch one, do the <b>Build an SO-101</b> course: motor IDs, calibration and both kinds of camera calibration.']],
  'ROB-14': [['Maya', 'Reading group this week: the <b>CoRL 2026</b> award finalists, reviewed hands-on. SuperMimic took Best Paper. Bring opinions.']],
  'ROB-15': [['Maya', 'Last one: <b>export</b> your kept demos as a LeRobotDataset so the real-robot team can train on them.']],
  'ROB-8': [['Maya', 'You are onboarded. We have a demo on Friday and it is yours. The brief is in <b>Capstone</b>. Different robot, two task languages, real constraints. Good luck!'],
    ['Dev', 'Ping me (the request button in Dataset) if you need operator hours. They are not free.']],
};

// Guide popups. `app` is where the step happens; `sel` is the element it points at;
// `until` (optional) auto-advances when it becomes true.
export const GUIDE = {
  'ROB-2': [
    { app: 'academy', sel: '.lesson-text', text: 'Each lesson explains one idea. Read this first.' },
    { app: 'academy', sel: 'textarea.code', text: 'This is your editor. Replace the <code>...</code> placeholders with real Python.' },
    { app: 'academy', sel: '#run-tests', text: 'Run the tests. Green ticks mean you can move on; red crosses tell you what to fix. Stuck? Use <b>Hint</b>.' },
  ],
  'ROB-3': [
    { app: 'teleop', sel: '.view3d', text: 'This is a real physics simulation (MuJoCo) running in your browser. Drag to orbit the camera.' },
    { app: 'teleop', sel: '.lang', text: 'The <b>task language</b>. It is saved with every demo: it is how a language-conditioned policy knows what to do.' },
    { app: 'teleop', sel: '#rec-btn', text: 'Press <b>Record</b> (or <kbd>Enter</kbd>), then drive: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move, <kbd>R</kbd>/<kbd>F</kbd> up/down, <kbd>Space</kbd> to grip.', until: () => state.seen.recorded },
    { app: 'teleop', sel: '.view3d', text: 'Hover over the red cube, come down, grip, lift, carry it over the bin, release. When the task is detected, save the episode.', until: () => episodes.some((e) => e.source === 'you') },
    { app: 'teleop', sel: '#my-demos', text: 'Your demos land here. A failed or messy one? Delete it and go again. You need 3 good ones.' },
  ],
  'ROB-4': [
    { app: 'dataset', sel: '#gen-btn', text: 'Pull in the night shift’s episodes.', until: () => episodes.some((e) => e.source !== 'you') },
    { app: 'dataset', sel: '.view3d', text: 'Every episode replays here. Does the video match the task language? Does it finish? Is the motion clean?' },
    { app: 'dataset', sel: '#ep-metrics', text: 'These numbers flag suspects: long duration, high idle time, low smoothness. They do <i>not</i> tell you whether the task succeeded. Watch.' },
    { app: 'dataset', sel: '#label-btns', text: 'Label each one: <kbd>K</kbd> keep, <kbd>X</kbd> discard. Careful: slow-but-clean demos and recoveries from a missed grasp are worth keeping.' },
    { app: 'dataset', sel: '#qa-btn', text: 'When every episode has a label, submit. You will get a QA report showing what you caught and what you missed.' },
  ],
  'ROB-5': [
    { app: 'train', sel: '#model-pick', text: 'Three model families. Start with <b>ACT</b>: small, fast, trained from scratch on your demos.' },
    { app: 'train', sel: '#data-summary', text: 'This is what goes in: every episode you did not discard. Check the count.' },
    { app: 'train', sel: '#hparams', text: 'Hyper-parameters. The defaults for each model are sensible. Learning rate too high and the loss explodes; too few steps and it under-fits.' },
    { app: 'train', sel: '#train-btn', text: 'Launch the job and watch both curves. <b>Validation</b> loss is measured on held-out demos: if it rises while train loss falls, you are over-fitting.' },
  ],
  'ROB-6': [
    { app: 'eval', sel: '#eval-task', text: 'Pick the task language to test. Language-conditioned models read it; ACT ignores it.' },
    { app: 'eval', sel: '#eval-policies', text: 'Tick your policy <i>and</i> <code>maya/act-rawdata</code>. Same seeds, same cube positions, fair fight.' },
    { app: 'eval', sel: '#eval-params', text: 'Evaluation knobs. Leave them for the first run. Afterwards try a wider cube spread or a visual shift and see who breaks.' },
    { app: 'eval', sel: '#eval-run', text: 'Run it. Every trial is a real physics rollout. Offline numbers (loss) are cheap; online trials are the truth.' },
  ],
  'ROB-8': [
    { app: 'brief', sel: '#brief-reqs', text: 'Your targets. They update live from your eval runs. How you get there is up to you.' },
  ],
  'ROB-9': [
    { app: 'dreams', sel: '#w-snap', text: 'A world model starts from a real first frame. Take a few <b>snapshots</b> of the scene from the robot’s front camera (new layout between each).', until: () => document.querySelectorAll('#w-snaps img').length >= 2 },
    { app: 'dreams', sel: '#w-wm', text: 'Zero-shot world models don’t know your arm. Pick a <b>+ LoRA</b> model and fine-tune it on your teleop first: that is step 1 of DreamGen.' },
    { app: 'dreams', sel: '#w-prompt', text: 'Write what should happen. Prompts that match a lab task get labelled with that task.' },
    { app: 'dreams', sel: '#w-go', text: 'Dream. Each clip costs a little GPU time.', until: () => state.seen.dreamed },
    { app: 'dreams', sel: '#w-list', text: 'Review every dream: keep it only if it follows the prompt and obeys physics (watch for cubes that blink or jump). Then add the kept ones.' },
  ],
  'ROB-10': [
    { app: 'dataset', sel: '#d-annot', text: 'The coloured bar is the subtask timeline. Scrub, press <b>Split here (B)</b> to add a boundary, and pick a caption for each segment.' },
    { app: 'dataset', sel: '#auto-btn', text: 'Or let the FLORA-style auto-labeler caption everything and score outcomes 1–5. Spot-check it.', until: () => state.seen.annotated },
    { app: 'train', sel: '#lang-level', text: 'Pick a language model (SmolVLA, π0.5, GR00T…) and set <b>Language supervision</b> to subtask or dense captions. Then train.' },
  ],
  'ROB-12': [
    { app: 'eval', sel: '#eval-params', text: 'Scroll to <b>Physics</b>: lower friction, raise mass, or tick “real robot”. Run a policy and watch grasps slip.' },
    { app: 'train', sel: '#hparams', text: 'Now train a policy with <b>Domain randomization</b> ticked, and evaluate both under the shifted physics.' },
  ],
  'ROB-15': [
    { app: 'dataset', sel: '#export-btn', text: 'Export your kept episodes. The zip includes a Python script that rebuilds them as a real LeRobotDataset.' },
  ],
};
