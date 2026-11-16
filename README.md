# 🦾 Robot Learning Lab

**A hands-on, beginner-friendly introduction to robotics and robot learning, played as your first week on the job at a robotics lab.**

You don't read about robot learning here. You badge in to *Tabletop Robotics*, get a board of tickets from your research lead, and do the work: write a little robot code, teleoperate an arm to collect demonstrations, clean a messy dataset by watching every episode, train a policy, and prove it on an evaluation workbench. Then you ship one on your own, against real constraints.

Everything runs in the browser. No install, no account, no backend.

> **Live site:** https://gvc222.github.io/robot-learning-lab/ (once GitHub Pages is on: Settings → Pages → Deploy from branch → `main` / root).

## What you do

**Week 1: onboarding**

| Ticket | App | What you learn |
| --- | --- | --- |
| ROB-2 | **Academy**: Robot basics & control | Starts on real robots, not a toy arm: the SO-101 (default) and I2RT YAM from MuJoCo Menagerie, or load your own URDF/MJCF, with a slider per joint. Radians, forward kinematics (θ₁, θ₂… drawn as angle arcs, real link lengths, add links), inverse kinematics (drag the target, see both elbow solutions), then a control track: what a control loop is, P, PD (damping ratio), PID and gravity feed-forward, joint-space PD + gravity compensation on a two-link arm in MuJoCo, and how real smart servos do it (LeRobot's SO-101 servo gains). Every lesson opens with an interactive explainer before the code, and control labs have gain sliders that rerun your controller. |
| ROB-3 | **Teleop** | Drive a simulated arm with the keyboard (WASD + R/F + Space) and record demonstrations with a task language attached. |
| ROB-4 | **Dataset** | Replay 24 episodes from the "night shift", read the metrics, keep or discard each one, get a QA report on what you missed and why it matters. |
| ROB-5 | **Train** | Nine policy architectures modeled on what LeRobot ships (ACT, Diffusion Policy, VQ-BeT, SmolVLA, π0, π0-FAST, π0.5, GR00T N1.7, Fast-WAM). Hyper-parameters, loss curves, GPU-hours, out-of-memory errors, a diverging learning rate. |
| ROB-6 | **Eval** | One task language, several policies, same cube layouts. Change spread, visual shift, action chunk size and speed and watch who breaks. |
| ROB-7 | **Academy**: Simulation and RL (optional) | MuJoCo XML, a scripted pick, sim-to-real with domain randomization, rewards, Q-learning, random-search RL on the MuJoCo arm, reward models, RL fine-tuning. |
| ROB-8 | **Capstone** | No guide. A different robot, two task languages, one policy, and hard targets for success rate, time per trajectory, motion quality, offline error, onboard VRAM, GPU budget and operator budget. |

**Week 2: research tools**

| Ticket | App | What you learn |
| --- | --- | --- |
| ROB-9 | **World Models** | Generate synthetic robot data with a world model: snapshot the robot's camera, fine-tune either a video world model (actions inferred by an inverse dynamics model) or a world action model (frames and actions predicted together), prompt it, and review the generated rollouts for off-task behavior and physics glitches before they enter your dataset. |
| ROB-10 | **Dataset** + **Train** | Split episodes into timestamped subtasks by hand or with a FLORA-style auto-labeler (captions + 1–5 outcome scores), then train with subtask or dense captions. |
| ROB-11 | **Academy**: Data, language & human video | Write a subtask segmenter, what language buys (DeMiAn), egocentric pretraining (EgoMimic, HumanScale), Wilson intervals and how many trials an eval needs, LeRobotDataset export. |
| ROB-12 | **Eval** | Sim-to-real: change friction and mass in MuJoCo, or flip on a "real robot" with hidden calibration error and latency. Compare policies trained with and without domain randomization. Every run shows 95% intervals and a paired McNemar test. |
| ROB-13 | **Academy**: Build an SO-101 | The open-source LeRobot arm: kit and gear ratios, a virtual `lerobot-setup-motors` bench, assembly and wrist cameras, arm calibration (LeRobot's exact normalization), camera intrinsics and extrinsics checked against MuJoCo's real cameras. |
| ROB-14 | **Academy**: CoRL 2026 Review Club | The six CoRL 2026 award finalists (SuperMimic won Best Paper; also the benchmark audit, RoboTTT, Play2Perfect, GRAIL, DISCO) plus Diffusion Policy and FLORA. Each has a paper summary with its real numbers and a code check or reviewer quiz. |
| ROB-15 | **Dataset** | Export kept episodes as a zip plus `convert_to_lerobot.py`, which rebuilds them as a real `LeRobotDataset` (v3 API) to train with LeRobot or push to the Hub. |

### Week 3: twins, deployment, mobile robots, hands

| Ticket | App | What you learn |
| --- | --- | --- |
| ROB-16 | **Academy**: Digital twins | Scan (photogrammetry with COLMAP/Meshroom) or CAD (Tinkercad, Onshape, FreeCAD) a real object; fix units, holes and volume; mass and inertia into MJCF; measure friction with a tilting board that really runs in MuJoCo; visual vs collision meshes and system identification. |
| ROB-17 | **Academy**: Deployment, the coffee shift | A long-horizon cafe task in MuJoCo (cup → machine → brew → tray) with cups that really slip: write a shift that checks and regrasps (at a 35% slip rate, a script without checks serves only a few of 20 orders), blend between skills with minimum-jerk superposition, and sort real shift logs into clean / recovered / failed / bad. Points to the real ViFailback failure dataset. |
| ROB-18 | **Academy**: Mobile robots & delivery | Locomotion and the automotive autonomy stack, differential drive, the kinematic bicycle model, a Kalman filter fusing slipping odometry with GPS, occupancy-grid mapping from MuJoCo ray-cast lidar, A*, and a capstone where your pure-pursuit controller drives a wheeled robot (real wheel contacts) on three food deliveries. Mapping and localization are taught inside the course rather than as a separate SLAM prerequisite. |
| ROB-19 | **Hand Cam** | Webcam teleop of a dexterous hand: MediaPipe tracks 21 landmarks in the browser, they are retargeted onto MuJoCo Menagerie's 16-joint LEAP Hand, and a detector labels your grasp with its top-3 Feix GRASP taxonomy types (33 types). Log grasps with their landmarks. |
| ROB-20 | **Leader Arm** (optional) | Plug a real SO-101 leader arm into the laptop. Chrome/Edge talk to the Feetech STS3215 servos over the Web Serial API (1 Mbaud, torque off, READ of Present_Position at register 56), map them with your `lerobot-calibrate` file the way LeRobot's degrees mode does, and drive a simulated SO-101 (MuJoCo Menagerie). Record 30 Hz episodes. No arm? Sliders. |

Orange sticky notes from your lead (the guide popups) walk you through each ticket step by step.

## What is real and what is pretend

It matters to be honest about this in a teaching tool.

**Real**

- **Physics.** The arm, gripper, cubes and bin are simulated by the official [MuJoCo](https://mujoco.org) WebAssembly build. Grasps succeed or fail because of contact and friction, not a random number, including under the eval workbench's friction and mass changes. The scene is plain MJCF ([`js/sim/scene.js`](js/sim/scene.js)) with two real MuJoCo cameras.
- **Your code.** Academy lessons run real Python (CPython via [Pyodide](https://pyodide.org)) against real tests. Several labs check your code against the simulator itself: your camera projection must land on MuJoCo's rendered cube corners, your segmenter runs on a recorded demo.
- **Teleoperation, recording, replay, metrics, statistics.** Demos are recorded at 20 Hz; duration, path length, idle time and smoothness come from the trajectory. Confidence intervals and the McNemar test are computed from the actual trials.
- **Online evaluation and RL practice rollouts.** Every trial is a full physics rollout with success detected from the simulated state.
- **The LeRobot export.** The zip and script produce a genuine LeRobotDataset.
- **Week 3 physics.** The friction incline, the coffee shift (including every slip and regrasp), the delivery robot's wheel contacts and its lidar rays are all MuJoCo. The SO-101 and LEAP Hand are MuJoCo Menagerie models (meshes decimated to keep the page light).
- **The leader-arm protocol.** Packets match Feetech's SCServo SDK byte for byte (unit-tested); a mock serial port exercises the full read loop in the e2e test. It has not been run against a physical arm from this repo's CI, so treat first contact as a test.
- **Hand tracking.** MediaPipe Hand Landmarker runs in your browser; the video never leaves the laptop. The model file downloads from Google's storage the first time.

**Pretend**

- **Model training.** No neural network is trained in your browser. [`js/models.js`](js/models.js) is a small, readable formula that turns (model, the data you kept, hyper-parameters, language, pretraining, domain randomization) into a hidden skill level and behaviour quirks. The *direction* of each effect follows a cited paper; the sizes are invented.
- **The policies.** A "trained policy" is a scripted pick-and-place controller ([`js/sim/operator.js`](js/sim/operator.js)) acting out those quirks: mis-perceiving the cube, fumbling, stalling if it learned from idle demos, shaking if it learned from shaky ones, doing the wrong task if it can't read language. Domain-randomized policies carry objects more gently, a real physical difference that helps on heavy, slippery cubes and costs time on normal ones.
- **World models and labelers.** A generated rollout is a MuJoCo rollout corrupted the way generated video fails (ignoring the prompt; objects that blink or teleport), with noisy pseudo-actions. The FLORA-style auto-labeler and the RL reward model are rule-based with realistic error rates.
- **The grasp detector** is a nearest-prototype heuristic on hand shape, with prototypes written by hand for each of the 33 Feix types. It is right on clean demo poses and noisy on real hands; it cannot see object size, which separates several Feix types.
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
js/sim/dreams.js      generated rollouts for the World Models app
js/sim/skills.js      the coffee shift: pick/place/press skills with real slips
js/sim/mobile.js      the delivery robot, city map and ray-cast lidar
js/sim/menagerie.js   loads MuJoCo Menagerie models (SO-101, LEAP Hand) into MuJoCo's file system
js/hw/feetech.js      Feetech STS3215 protocol over Web Serial (the SO-101 servos)
js/hand/grasp.js      hand landmarks → features → Feix-33 grasp type; LEAP Hand retargeting
js/course/explain.js  interactive explainers shown before each lesson's code (sliders, live MuJoCo)
js/course/lessons*.js Academy curriculum: 9 courses, 56 lessons (code, quiz or lab)  ← add lessons here
js/apps/labs2-4.js    interactive lab benches for the newer lessons
js/apps/*.js          one file per app (Academy, Teleop, Leader Arm, Hand Cam, Dataset, World Models, Train, Eval, Capstone, Tickets)
vendor/               MuJoCo WASM, three.js, Pyodide, MediaPipe, Menagerie models (checked in; see vendor/README.md)
tests/                headless checks (below)
```

No framework and no build step: plain ES modules.

## Tests

```sh
npm test                  # physics + scripted controller in Node (no browser needed)
npm run test:calibration  # does the hidden "skill" number map to sensible success rates?
node tests/dr.test.mjs    # does domain randomization help under shifted physics (real rollouts)?
node tests/hand.test.mjs  # Feix classifier (incl. rotated/noisy hands) + Feetech packets vs the SDK
npm run test:e2e          # whole flow in headless Chrome via Playwright: every lesson passes
                          # (code, quizzes, the motor bench), World Models, annotation, export,
                          # RL fine-tuning, eval statistics, and the capstone is achievable
```

`test:e2e` expects Playwright and Chrome to be available; adjust the paths at the top of `tests/shot.mjs`.

## Ideas for next steps

- More robots (a bimanual setup, a mobile base) and tasks (pushing, drawers, sorting by language).
- A genuinely trained tiny policy (behaviour cloning with a small MLP in the browser) next to the pretend zoo.
- Use the SO-101 Menagerie model in the main Teleop, Dataset and Eval apps, not only the Leader Arm station.
- Gamepad teleoperation; record leader-arm episodes straight into the Dataset app.
- A laundry-folding variant of the deployment course (MuJoCo flex/cloth).
- A full SLAM course (pose graphs, loop closure) after Mobile robots.
- Import a real LeRobotDataset from the Hub into the Dataset viewer.

## Credits

Physics by [MuJoCo](https://github.com/google-deepmind/mujoco) (Google DeepMind, Apache-2.0). Rendering with [three.js](https://threejs.org) (MIT). Python by [Pyodide](https://pyodide.org) (MPL-2.0). Robot models from [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie) (SO-101 by TheRobotStudio, Apache-2.0; I2RT YAM, MIT; LEAP Hand, MIT). Hand tracking by [MediaPipe](https://github.com/google-ai-edge/mediapipe) (Apache-2.0). Grasp types from Feix et al., *The GRASP Taxonomy of Human Grasp Types*, IEEE THMS 2016. SO-101 build and calibration content follows the [LeRobot SO-101 guide](https://huggingface.co/docs/lerobot/so101) and [SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100). Paper summaries link to their sources on arXiv. The model families referenced (ACT, Diffusion Policy, VQ-BeT, SmolVLA, π0, π0-FAST, π0.5, GR00T, Fast-WAM) and tools (DreamGen, UVA, FLORA) belong to their authors; this project is not affiliated with them and does not run those models.

MIT licensed. See [LICENSE](LICENSE).
