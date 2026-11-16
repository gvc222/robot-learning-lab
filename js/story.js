// The "job": tickets, chat messages from your teammates, and the step-by-step guide popups.
import { state, episodes } from './util.js';
import { LESSONS } from './course/lessons.js';

const unitDone = (units) => LESSONS.filter((l) => units.includes(l.unit)).every((l) => state.course.done[l.id]);
const myGoodDemos = () => episodes.filter((e) => e.source === 'you' && e.task === 'red_bin' && e.robot === 'sprout' && e.metrics.success).length;

export const TICKETS = [
  { id: 'ROB-1', title: 'Meet the team', app: 'tickets', desc: 'Badge in and say hi.', done: () => !!state.name },
  { id: 'ROB-2', title: 'Academy: robot basics', app: 'academy',
    desc: 'Five short coding lessons: joint angles, kinematics and a control loop. You write the code, the tests check it.',
    done: () => unitDone([1]) || state.seen.skipBasics, progress: () => `${LESSONS.filter((l) => l.unit === 1 && state.course.done[l.id]).length}/5 lessons` },
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
    desc: 'Optional deep-dive: write MuJoCo XML, script a pick, design a reward, and train with reinforcement learning.',
    done: () => unitDone([2, 3]), progress: () => `${LESSONS.filter((l) => l.unit > 1 && state.course.done[l.id]).length}/${LESSONS.filter((l) => l.unit > 1).length} lessons` },
  { id: 'ROB-8', title: 'Capstone: ship the Friday demo', app: 'brief',
    desc: 'No more hand-holding. Read the project brief and hit every metric.',
    done: () => state.capstone.done },
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
};
