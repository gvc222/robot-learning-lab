# 🦾 Robot Learning Lab

**A hands-on, beginner-friendly introduction to robotics and robot learning, played as your first week on the job at a robotics lab.**

You don't read about robot learning here. You badge in to *Tabletop Robotics*, get a board of tickets from your research lead, and do the work: write a little robot code, teleoperate an arm to collect demonstrations, clean a messy dataset by watching every episode, train a policy, and prove it on an evaluation workbench. Then you ship one on your own, against real constraints.

Everything runs in the browser. No install, no account, no backend.

> **Live site:** https://gvc222.github.io/robot-learning-lab/ (once GitHub Pages is on: Settings → Pages → Deploy from branch → `main` / root).

## What you do

| Ticket | App | What you learn |
| --- | --- | --- |
| ROB-2 | **Academy**, unit 1 | Joint state, radians, forward and inverse kinematics, a P-control loop. freeCodeCamp-style: explanation, editor, tests, a live visual driven by *your* function. |
| ROB-3 | **Teleop** | Drive a simulated arm with the keyboard (WASD + R/F + Space) and record demonstrations with a task language attached. |
| ROB-4 | **Dataset** | Replay 24 episodes from the "night shift", read the metrics, keep or discard each one, get a QA report on what you missed and why it matters. |
| ROB-5 | **Train** | Pick a model family (ACT, SmolVLA, π0.5), set hyper-parameters, watch train/validation loss, pay for it in GPU-hours. Run out of VRAM. Blow up the learning rate. |
| ROB-6 | **Eval** | One task language, several policies, same cube layouts. Change spread, visual shift, action chunk size and speed and watch who breaks. |
| ROB-7 | **Academy**, units 2–3 (optional) | Write MuJoCo XML, script a pick with waypoints, design a reward, implement Q-learning, run random-search RL on the MuJoCo arm. |
| ROB-8 | **Capstone** | No guide. A different robot, two task languages, one policy, and hard targets for success rate, time per trajectory, motion quality, offline error, onboard VRAM, GPU budget and operator budget. |

Orange sticky notes from your lead (the guide popups) walk you through each ticket step by step, and switch off for the capstone.

## What is real and what is pretend

It matters to be honest about this in a teaching tool.

**Real**

- **Physics.** The arm, gripper, cubes and bin are simulated by the official [MuJoCo](https://mujoco.org) WebAssembly build. Grasps succeed or fail because of contact and friction, not a random number. The scene is plain MJCF ([`js/sim/scene.js`](js/sim/scene.js)) and loads in desktop MuJoCo.
- **Your code.** Academy lessons run real Python (CPython via [Pyodide](https://pyodide.org)) against real tests. The Q-learning lesson trains a real agent with your update rule; the last lesson runs 40 real MuJoCo episodes of random search with your functions.
- **Teleoperation, recording, replay and metrics.** Demos are recorded at 20 Hz; duration, path length, idle time and smoothness are computed from the trajectory.
- **Online evaluation.** Every trial is a full physics rollout with success detected from the simulated state.

**Pretend**

- **Model training.** No neural network is trained in your browser. [`js/models.js`](js/models.js) is a small, readable formula that turns (model family, the demos you kept, hyper-parameters) into a hidden skill level and a set of behaviour quirks.
- **The policies.** A "trained policy" is a scripted pick-and-place controller ([`js/sim/operator.js`](js/sim/operator.js)) acting out those quirks: mis-perceiving where the cube is, fumbling a grasp, stalling if it learned from idle demos, shaking if it learned from shaky ones, going for the wrong cube if demos didn't match their language or the model can't read language at all.
- **The numbers on the model cards** (GPU-hours, VRAM, latency) are plausible but invented. The *trends* are the lesson: clean data beats more data, pretrained language-conditioned models need fewer demos, big models cost memory and latency, action chunking hides latency, offline loss is not success rate.

The "night shift" teleoperators are the same scripted controller with human-looking flaws, so their episodes are real physics too.

## Run it locally

It is a static site. Any web server works:

```sh
git clone https://github.com/gvc222/robot-learning-lab.git
cd robot-learning-lab
python3 -m http.server 8000    # then open http://localhost:8000
```

(Opening `index.html` straight from disk will not work: browsers block ES modules and WebAssembly on `file://`.)

Progress is saved in the browser's `localStorage`. "Reset the lab" on the Tickets board wipes it.

## Project layout

```
index.html            page shell
css/style.css         all styles
js/main.js            LabOS shell: dock, window, chat, ticket watcher
js/story.js           tickets, teammate messages, guide popup steps   ← edit the "job" here
js/guide.js           the step-by-step popups
js/models.js          model zoo + the pretend training formula        ← tune the "learning" here
js/sim/scene.js       MJCF: robots, cubes, bin, task languages        ← add robots and tasks here
js/sim/sim.js         MuJoCo wrapper: IK, stepping, success checks
js/sim/operator.js    scripted controller + demo/episode metrics
js/sim/viewer.js      three.js renderer for any MuJoCo model
js/course/lessons.js  Academy curriculum: text, starter, solution, tests  ← add lessons here
js/apps/*.js          one file per app (Academy, Teleop, Dataset, Train, Eval, Capstone, Tickets)
vendor/               MuJoCo WASM, three.js, Pyodide (checked in; see vendor/README.md)
tests/                headless checks (below)
```

No framework and no build step: plain ES modules, about 2,000 lines.

## Tests

```sh
npm test                  # physics + scripted controller in Node (no browser needed)
npm run test:calibration  # does the hidden "skill" number map to sensible success rates?
npm run test:e2e          # whole flow in headless Chrome via Playwright: every lesson's
                          # solution passes, tickets close, and the capstone is achievable
```

`test:e2e` expects Playwright and Chrome to be available; adjust the paths at the top of `tests/shot.mjs`.

## Ideas for next steps

- More robots (a bimanual setup, a mobile base) and tasks (pushing, drawers, sorting by language).
- A wrist camera view rendered in the dataset viewer, with trimming of idle frames instead of all-or-nothing discard.
- A genuinely trained tiny policy (behaviour cloning with a small MLP in the browser) next to the pretend zoo.
- Export recorded demos in LeRobot dataset format.
- Gamepad teleoperation and a leader-arm style input.

## Credits

Physics by [MuJoCo](https://github.com/google-deepmind/mujoco) (Google DeepMind, Apache-2.0). Rendering with [three.js](https://threejs.org) (MIT). Python by [Pyodide](https://pyodide.org) (MPL-2.0). The model families referenced are [ACT](https://arxiv.org/abs/2304.13705), [SmolVLA](https://huggingface.co/blog/smolvla) and [π0.5](https://www.physicalintelligence.company/blog/pi05); this project is not affiliated with their authors and does not run those models.

MIT licensed. See [LICENSE](LICENSE).
