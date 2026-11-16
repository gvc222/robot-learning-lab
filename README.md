# 🦾 Robot Learning Lab

**A hands-on, beginner-friendly introduction to robotics and robot learning, played as your first week on the job at a robotics lab.**

You don't read about robot learning here. You badge in to *Tabletop Robotics*, get a board of tickets from your research lead, and do the work: write a little robot code, teleoperate an arm to collect demonstrations, clean a messy dataset by watching every episode, train a policy, and prove it on an evaluation workbench. Then you ship one on your own, against real constraints.

Everything runs in the browser. No install, no account, no backend.

> **Live site:** https://gvc222.github.io/robot-learning-lab/ (once GitHub Pages is on: Settings → Pages → Deploy from branch → `main` / root).

## What you do

**Week 1: onboarding**

| Ticket | App | What you learn |
| --- | --- | --- |
| ROB-2 | **Academy**: Robot basics | Joint state, radians, forward and inverse kinematics, a P-control loop. freeCodeCamp-style: explanation, editor, tests, a live visual driven by *your* function. |
| ROB-3 | **Teleop** | Drive a simulated arm with the keyboard (WASD + R/F + Space) and record demonstrations with a task language attached. |
| ROB-4 | **Dataset** | Replay 24 episodes from the "night shift", read the metrics, keep or discard each one, get a QA report on what you missed and why it matters. |
| ROB-5 | **Train** | Nine policy architectures modeled on what LeRobot ships (ACT, Diffusion Policy, VQ-BeT, SmolVLA, π0, π0-FAST, π0.5, GR00T N1.7, Fast-WAM). Hyper-parameters, loss curves, GPU-hours, out-of-memory errors, a diverging learning rate. |
| ROB-6 | **Eval** | One task language, several policies, same cube layouts. Change spread, visual shift, action chunk size and speed and watch who breaks. |
| ROB-7 | **Academy**: Simulation and RL (optional) | MuJoCo XML, a scripted pick, sim-to-real with domain randomization, rewards, Q-learning, random-search RL on the MuJoCo arm, reward models, RL fine-tuning. |
| ROB-8 | **Capstone** | No guide. A different robot, two task languages, one policy, and hard targets for success rate, time per trajectory, motion quality, offline error, onboard VRAM, GPU budget and operator budget. |

**Week 2: research tools**

| Ticket | App | What you learn |
| --- | --- | --- |
| ROB-9 | **Dream Lab** | DreamGen-style synthetic data: snapshot the robot's camera, LoRA-tune a video world model on your teleop, prompt it, label pseudo-actions with an inverse dynamics model, and review the "dreams" for off-task behavior and physics glitches before they enter your dataset. |
| ROB-10 | **Dataset** + **Train** | Split episodes into timestamped subtasks by hand or with a FLORA-style auto-labeler (captions + 1–5 outcome scores), then train with subtask or dense captions. |
| ROB-11 | **Academy**: Data, language & human video | Write a subtask segmenter, what language buys (DeMiAn), egocentric pretraining (EgoMimic, HumanScale), Wilson intervals and how many trials an eval needs, LeRobotDataset export. |
| ROB-12 | **Eval** | Sim-to-real: change friction and mass in MuJoCo, or flip on a "real robot" with hidden calibration error and latency. Compare policies trained with and without domain randomization. Every run shows 95% intervals and a paired McNemar test. |
| ROB-13 | **Academy**: Build an SO-101 | The open-source LeRobot arm: kit and gear ratios, a virtual `lerobot-setup-motors` bench, assembly and wrist cameras, arm calibration (LeRobot's exact normalization), camera intrinsics and extrinsics checked against MuJoCo's real cameras. |
| ROB-14 | **Academy**: CoRL 2026 Review Club | The six CoRL 2026 award finalists (SuperMimic won Best Paper; also the benchmark audit, RoboTTT, Play2Perfect, GRAIL, DISCO) plus Diffusion Policy, FLORA and DreamGen. Each has a paper summary with its real numbers and a code check or reviewer quiz. |
| ROB-15 | **Dataset** | Export kept episodes as a zip plus `convert_to_lerobot.py`, which rebuilds them as a real `LeRobotDataset` (v3 API) to train with LeRobot or push to the Hub. |

Orange sticky notes from your lead (the guide popups) walk you through each ticket step by step.

## What is real and what is pretend

It matters to be honest about this in a teaching tool.

**Real**

- **Physics.** The arm, gripper, cubes and bin are simulated by the official [MuJoCo](https://mujoco.org) WebAssembly build. Grasps succeed or fail because of contact and friction, not a random number, including under the eval workbench's friction and mass changes. The scene is plain MJCF ([`js/sim/scene.js`](js/sim/scene.js)) with two real MuJoCo cameras.
- **Your code.** Academy lessons run real Python (CPython via [Pyodide](https://pyodide.org)) against real tests. Several labs check your code against the simulator itself: your camera projection must land on MuJoCo's rendered cube corners, your segmenter runs on a recorded demo.
- **Teleoperation, recording, replay, metrics, statistics.** Demos are recorded at 20 Hz; duration, path length, idle time and smoothness come from the trajectory. Confidence intervals and the McNemar test are computed from the actual trials.
- **Online evaluation and RL practice rollouts.** Every trial is a full physics rollout with success detected from the simulated state.
- **The LeRobot export.** The zip and script produce a genuine LeRobotDataset.

**Pretend**

- **Model training.** No neural network is trained in your browser. [`js/models.js`](js/models.js) is a small, readable formula that turns (model, the data you kept, hyper-parameters, language, pretraining, domain randomization) into a hidden skill level and behaviour quirks. The *direction* of each effect follows a cited paper; the sizes are invented.
- **The policies.** A "trained policy" is a scripted pick-and-place controller ([`js/sim/operator.js`](js/sim/operator.js)) acting out those quirks: mis-perceiving the cube, fumbling, stalling if it learned from idle demos, shaking if it learned from shaky ones, doing the wrong task if it can't read language. Domain-randomized policies carry objects more gently, a real physical difference that helps on heavy, slippery cubes and costs time on normal ones.
- **World models and labelers.** A "dream" is a MuJoCo rollout corrupted the way generated video fails (ignoring the prompt; objects that blink or teleport), with noisy pseudo-actions. The FLORA-style auto-labeler and the RL reward model are rule-based with realistic error rates.
- **The numbers on the model cards** (GPU-hours, VRAM, latency) are plausible but invented. Parameter counts and paper results quoted in lessons are real and linked.

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
js/annotate.js        subtask segmentation + FLORA-style auto-labeler
js/zip.js             tiny zip writer for the LeRobot export
js/guide.js           the step-by-step popups
js/models.js          model zoo + the pretend training formula        ← tune the "learning" here
js/sim/scene.js       MJCF: robots, cubes, bin, task languages        ← add robots and tasks here
js/sim/sim.js         MuJoCo wrapper: IK, stepping, success checks
js/sim/operator.js    scripted controller + demo/episode metrics
js/sim/viewer.js      three.js renderer for any MuJoCo model (orbit or MuJoCo cameras)
js/sim/dreams.js      "neural trajectories" for the Dream Lab
js/course/lessons*.js Academy curriculum: 6 courses, 34 lessons (code, quiz or lab)  ← add lessons here
js/apps/labs2.js      interactive lab benches for the newer lessons
js/apps/*.js          one file per app (Academy, Teleop, Dataset, Dream Lab, Train, Eval, Capstone, Tickets)
vendor/               MuJoCo WASM, three.js, Pyodide (checked in; see vendor/README.md)
tests/                headless checks (below)
```

No framework and no build step: plain ES modules.

## Tests

```sh
npm test                  # physics + scripted controller in Node (no browser needed)
npm run test:calibration  # does the hidden "skill" number map to sensible success rates?
node tests/dr.test.mjs    # does domain randomization help under shifted physics (real rollouts)?
npm run test:e2e          # whole flow in headless Chrome via Playwright: every lesson passes
                          # (code, quizzes, the motor bench), Dream Lab, annotation, export,
                          # RL fine-tuning, eval statistics, and the capstone is achievable
```

`test:e2e` expects Playwright and Chrome to be available; adjust the paths at the top of `tests/shot.mjs`.

## Ideas for next steps

- More robots (a bimanual setup, a mobile base) and tasks (pushing, drawers, sorting by language).
- A genuinely trained tiny policy (behaviour cloning with a small MLP in the browser) next to the pretend zoo.
- An SO-101 MJCF model in the sim, so teleop and calibration use the arm you build.
- Gamepad teleoperation and a leader-arm style input.
- Import a real LeRobotDataset from the Hub into the Dataset viewer.

## Credits

Physics by [MuJoCo](https://github.com/google-deepmind/mujoco) (Google DeepMind, Apache-2.0). Rendering with [three.js](https://threejs.org) (MIT). Python by [Pyodide](https://pyodide.org) (MPL-2.0). SO-101 build and calibration content follows the [LeRobot SO-101 guide](https://huggingface.co/docs/lerobot/so101) and [SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100). Paper summaries link to their sources on arXiv. The model families referenced (ACT, Diffusion Policy, VQ-BeT, SmolVLA, π0, π0-FAST, π0.5, GR00T, Fast-WAM) and tools (Cosmos, Wan, FLORA, DreamGen) belong to their authors; this project is not affiliated with them and does not run those models.

MIT licensed. See [LICENSE](LICENSE).
