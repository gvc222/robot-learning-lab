// Optional capstone projects: one per course, to build outside the browser (real tools, real hardware or a GPU) and extend after you finish.
const L = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const code = (s) => `<pre class="term" style="max-height:none;resize:none;margin:6px 0">${esc(s)}</pre>`;
const steps = (...xs) => { const items = []; for (const x of xs) { if (x.startsWith('<pre') && items.length) items[items.length - 1] += x; else items.push(x); } return `<ol>${items.map((x) => `<li>${x}</li>`).join('')}</ol>`; };
const stretch = (...xs) => `<p><b>Make it yours</b> (stretch goals):</p><ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const ISAAC = 'https://isaac-sim.github.io/IsaacLab/main/index.html';
const MENAGERIE = 'https://github.com/google-deepmind/mujoco_menagerie';

export const MORE8 = [
  {
    id: 'proj_basics', course: 'basics', kind: 'read', title: '📖 Project: a PD arm on your own machine',
    text: `<p><b>Goal.</b> Run the controllers you wrote in the browser on a real MuJoCo arm on your computer, and track a moving target with them. About 2–4 hours. No GPU.</p>
${steps(`Set up: <code>python -m venv venv &amp;&amp; source venv/bin/activate &amp;&amp; pip install mujoco numpy matplotlib</code>. Clone ${L(MENAGERIE, 'MuJoCo Menagerie')} for the SO-101 (or I2RT YAM) model.`, 'Open the model in the viewer (<code>python -m mujoco.viewer --mjcf=path/to/scene.xml</code>) and list its joints and their ranges with <code>mujoco</code>’s Python API (<code>model.jnt_range</code>).', 'Write <code>controller.py</code> with your PD + gravity-compensation law. Menagerie arms use position actuators by default; switch to torque (motor) actuators in a copy of the XML so <code>data.ctrl</code> is a torque, like in the lessons. Gravity compensation is available as <code>data.qfrc_bias</code>, which you can compare with your formula.', 'Add Cartesian tracking: use <code>mujoco.mj_jacSite</code> for the hand Jacobian and your damped-least-squares step to follow a figure-eight in the plane.', 'Log joint error over time, plot it with matplotlib, and write down overshoot and settling time for three gain settings.')}
${stretch('Add a payload (a heavier gripper body) and show how much worse the sag is without the integral or feed-forward term.', 'Add joint-limit and singularity guards, and print when they trigger.', 'Run the same controller on the second robot (YAM) by changing only the model path and gains.')}`,
  },
  {
    id: 'proj_sim', course: 'sim', kind: 'read', title: '📖 Project: a randomized scene factory',
    text: `<p><b>Goal.</b> Build a script that generates thousands of varied, labelled scenes in MuJoCo and saves them: the data engine behind sim-to-real. About half a day.</p>
${steps('Write <code>make_scene(seed)</code> that returns MJCF text: a table, 2–5 objects with random shape, size, colour, mass and friction, and random positions that never overlap (bounded retries!).', 'Randomize the world too: light direction and brightness, camera position (a few cm and a few degrees), table colour.', 'Render each scene with <code>mujoco.Renderer</code> from a fixed camera: save an RGB image, a depth image, and a JSON file with every object’s pose and physical parameters.', 'Validate: load every generated scene, step it for one second, and reject scenes where an object falls off the table or interpenetrates.', 'Write a <code>README</code> with 12 sample images and a table of the randomization ranges.')}
${stretch('Add a scripted pick for the red object (reuse your waypoint code) and record success rate vs. randomization strength.', 'Add textures or procedurally coloured materials.', 'Export the images and poses in COCO or LeRobot format so you can train a detector or policy on them.')}`,
  },
  {
    id: 'proj_rl', course: 'rl', kind: 'read', title: '📖 Project: train a humanoid with RL (Isaac Lab or MuJoCo)',
    text: `<p><b>Goal.</b> Train a legged or humanoid robot to walk with reinforcement learning on a GPU, watch it, and then change its reward and see what changes. This is the real version of the rewards and random-search lessons. Allow a weekend.</p>
<h3>Path A: Isaac Lab (needs an NVIDIA GPU, or a rented cloud one)</h3>
<p>${L(ISAAC, 'Isaac Lab')} is NVIDIA’s robot-learning framework on top of Isaac Sim, with 30+ ready-made environments. Follow the install guide for your OS and GPU, then the workflow is:</p>
${code(`# train (headless = no window, much faster)
./isaaclab.sh -p scripts/reinforcement_learning/rsl_rl/train.py --task Isaac-Velocity-Flat-G1-v0 --headless

# watch the trained policy (checkpoints land in logs/rsl_rl/<task>/<date>/)
./isaaclab.sh -p scripts/reinforcement_learning/rsl_rl/play.py --task Isaac-Velocity-Flat-G1-v0

# training curves
./isaaclab.sh -p -m tensorboard.main --logdir=logs`)}
<p>Tasks worth trying: <code>Isaac-Humanoid-v0</code> (a simple humanoid that learns to run), <code>Isaac-Velocity-Flat-G1-v0</code> (a Unitree G1 following velocity commands) and <code>Isaac-Velocity-Flat-H1-v0</code>. Run <code>train.py --help</code> to see how to set the number of parallel environments (thousands of copies is what makes GPU RL fast).</p>
<h3>Path B: no Isaac, MuJoCo on a laptop</h3>
${code(`pip install "gymnasium[mujoco]" stable-baselines3
python -c "
import gymnasium as gym
from stable_baselines3 import PPO
env = gym.make('Humanoid-v5')
model = PPO('MlpPolicy', env, verbose=1).learn(2_000_000)
model.save('humanoid_ppo')"`)}
<p>It is slower and the result is rougher, but it runs on a CPU and you can read every line.</p>
<h3>What to do with it</h3>
${steps('Train the baseline and write down the training time, the final reward, and how the robot behaves (does it shuffle, hop, fall over?).', 'Find the reward terms in the environment configuration (velocity tracking, falling penalty, joint-torque penalty, action-rate penalty). Change <b>one</b> weight, retrain, and compare behaviour and curves: a bigger torque penalty gives gentler motion, no action-rate penalty gives jitter.', 'Add a new reward term of your own (for example penalise sideways drift, or reward a straight torso) and say whether it helped.', 'Record a video of before and after and put both in a short write-up with the curves.')}
${stretch('Randomize friction and push the robot during training (domain randomization), then test it on a slippery floor.', 'Train a second morphology and compare sample efficiency.', 'Export the policy and run it in MuJoCo (sim-to-sim) to see what breaks.')}
<p><b>Rented GPUs.</b> If you do not own an NVIDIA GPU, rent one by the hour (see the “take it local” lesson in the simulation pipeline course): install, train, copy the checkpoint and logs to your machine, and <b>stop the machine</b>.</p>`,
  },
  {
    id: 'proj_data', course: 'data', kind: 'read', title: '📖 Project: record, clean and publish a dataset',
    text: `<p><b>Goal.</b> Record a small real (or simulated) manipulation dataset in LeRobot format, audit it with the tools from this course, and publish it with a dataset card. About one day.</p>
${steps('Choose a task with a clear success condition (put the cube in the bin, stack two blocks). Write the instruction string you will use for every episode.', 'Record 50 episodes with <code>lerobot-record</code> (run <code>lerobot-record --help</code> for the current flags; you give it the robot type, cameras, the dataset repo id and the task string). Vary start positions on purpose: mark a 5×5 grid on the table and rotate through it.', 'Audit: load the dataset in Python, compute episode length, idle fraction and a success label for each episode, and plot their distributions. Reuse your segmenter and Wilson-interval code.', 'Clean: drop failed or abnormally slow episodes, and say why in a log. Keep a second copy of the raw data.', 'Publish to the Hugging Face Hub with a dataset card: task, robot, cameras, number of episodes, collection protocol, known problems, licence.')}
${stretch('Add subtask annotations (reach, grasp, lift, place) and a language caption for each.', 'Record the same task with a second operator and measure how the data differs.', 'Train a small policy on the first 25 vs. all 50 episodes and report the success difference with a confidence interval.')}`,
  },
  {
    id: 'proj_hardware', course: 'hardware', kind: 'read', title: '📖 Project: your first policy on your own arm',
    text: `<p><b>Goal.</b> Close the whole loop on a real SO-101: teleoperate, record, train a policy, and run it on the arm. This is the project the whole hardware course points at.</p>
${steps('Finish assembly, motor IDs and calibration (lessons above). Check teleoperation works smoothly before recording anything.', 'Record 50 episodes of one simple task with fixed cameras (a scene camera and a wrist camera).', 'Train an ACT policy. On a machine with an NVIDIA GPU (your own, a free notebook, or a rented one), the training command has this shape; check <code>lerobot-train --help</code> because flags evolve:', code(`lerobot-train \\
  --dataset.repo_id=\${HF_USER}/my_dataset \\
  --policy.type=act \\
  --output_dir=outputs/train/act_my_task \\
  --job_name=act_my_task \\
  --policy.device=cuda \\
  --wandb.enable=true \\
  --policy.repo_id=\${HF_USER}/my_policy`), 'Run it on the arm. Evaluation episodes are recorded as a dataset whose name starts with <code>eval_</code>, pointing at your trained policy:', code(`lerobot-record \\
  --robot.type=so101_follower \\
  --robot.port=<your port> \\
  --dataset.repo_id=\${HF_USER}/eval_my_dataset \\
  --dataset.single_task="<your task string>" \\
  --policy.path=\${HF_USER}/my_policy`), 'Score 20 attempts with the same start positions you trained on, then 20 with new ones. Report both with Wilson intervals.')}
${stretch('Double the data and see how much the success rate moves.', 'Add a second object or a moved bin.', 'Compare ACT to Diffusion Policy on the same data.', 'Write up your failure modes with a short video of each.')}`,
  },
  {
    id: 'proj_twin', course: 'twin', kind: 'read', title: '📖 Project: a digital twin of a real object',
    text: `<p><b>Goal.</b> Turn a real object into a simulation asset, and check that the simulation behaves like the real thing. About a day.</p>
${steps('Pick a small rigid object (a mug, a block). Weigh it and measure its dimensions with a ruler.', 'Take 40–80 overlapping photos around it on a plain background and reconstruct it with COLMAP or Meshroom (or model it in CAD).', 'Clean the mesh in Blender or MeshLab: remove the floor, fill holes, set the scale from your measurement, and place the origin at a sensible point.', 'Make collision shapes: convex decomposition (for example with CoACD or V-HACD), not the raw mesh. Write the MJCF with the real mass and inertia.', 'Validate against reality: film a tilt-board friction test and a drop test with your phone, reproduce both in MuJoCo, and compare the slide angle and bounce.', 'Write down the sim-to-real gap you measured, and tune friction until the two agree.')}
${stretch('Make three objects and a scene where a scripted pick works on all of them.', 'Compare a photogrammetry mesh to a hand-made CAD one for grasp success.')}`,
  },
  {
    id: 'proj_deploy', course: 'deploy', kind: 'read', title: '📖 Project: a deployment harness',
    text: `<p><b>Goal.</b> Wrap a skill (a scripted pick, or a trained policy) in the machinery a real deployment needs: timeouts, retries, logging and reporting. This is the unglamorous 80% of getting robots to work every day.</p>
${steps('Write a <code>SkillRunner</code> in Python: it runs a skill, enforces a time limit, detects failure (a check function), retries up to N times with a recovery action (open, back off, re-observe), and logs every attempt as one JSON line (time, skill, outcome, duration, retry count).', 'Chain three skills into a task (pick, carry, place) with a state machine; a failure in skill 2 triggers a defined recovery, not a crash.', 'Inject failures in simulation: random slips, a moved object, a dropped cube. Run 100 trials per setting.', 'Write <code>report.py</code>: success rate with a Wilson interval, mean retries, the three most common failure reasons, and a plot of success against injected-failure rate.', 'Add a safety layer: a maximum joint-velocity clamp and an emergency stop that every skill respects.')}
${stretch('Add a watchdog that restarts a skill when sensor data stops arriving.', 'Add a simple web dashboard that tails the log.', 'Replace the scripted skill with a policy trained in the pipeline course and compare reliability.')}`,
  },
  {
    id: 'proj_mobile', course: 'mobile', kind: 'read', title: '📖 Project: SLAM and navigation on a simulated robot',
    text: `<p><b>Goal.</b> Run a complete mobile-robot stack in simulation: build a map with SLAM, then drive to goals with navigation, using the real ROS 2 tools. About a weekend.</p>
${steps('Install a current ROS 2 LTS release (for example Humble or Jazzy) on Ubuntu, plus the Nav2 and SLAM Toolbox packages, and a simulated TurtleBot3 in Gazebo (follow the Nav2 “getting started” guide for exact commands for your release).', 'Drive the robot with the keyboard while <b>slam_toolbox</b> builds the map. Watch the map in RViz; drive a loop and watch the loop closure correct the drift, exactly like the SLAM lesson.', 'Save the map, then run Nav2 with that map and send goals from RViz. Record how often it reaches them.', 'Add an obstacle that is not on the map and watch the local planner avoid it.', 'Write a small node of your own (Python, <code>rclpy</code>) that sends a sequence of three goals and reports success or failure of each.')}
${stretch('Swap Nav2’s global planner for your own A* from the lesson.', 'Add noise to the odometry and see when localization fails.', 'Run the same stack on a different simulated robot.')}`,
  },
  {
    id: 'proj_core2', course: 'core2', kind: 'read', title: '📖 Project: a ROS 2 pick pipeline',
    text: `<p><b>Goal.</b> Wire perception, planning and control into separate ROS 2 nodes that pick up an object in simulation, the way real systems are structured. About two days.</p>
${steps('Install a current ROS 2 LTS (Humble or Jazzy) and a simulator that publishes an RGB-D camera and joint states (a MuJoCo or Gazebo arm, or the MoveIt 2 tutorial robot).', '<b>Perception node</b>: subscribe to depth and camera info, back-project to a point cloud (your lesson code), publish the object pose as a <code>geometry_msgs/PoseStamped</code>.', '<b>Planning node</b>: take that pose, compute a pre-grasp and grasp pose (use your rotation-matrix and transform code, and <code>tf2</code> to move from camera to base frame), solve IK (your Jacobian solver or MoveIt), and publish a joint trajectory with timing (your trapezoid code).', '<b>Control node</b>: follow the trajectory with a PD loop and publish a success flag.', 'Record a <code>ros2 bag</code> of one run and replay it to debug offline.')}
${stretch('Add a second object and choose the closest one.', 'Add a manipulability check and refuse grasps near singularities.', 'Add RRT planning around an obstacle.')}`,
  },
  {
    id: 'proj_learn', course: 'learn', kind: 'read', title: '📖 Project: train Diffusion Policy on PushT',
    text: `<p><b>Goal.</b> Train a standard policy on a standard benchmark and evaluate it properly: a result you can compare to published numbers. Needs a GPU for a reasonable training time (a free notebook GPU is enough to start).</p>
${steps('Install LeRobot (see its README for the current instructions) and the PushT simulation extra.', 'Train Diffusion Policy on the PushT dataset with the simulated environment attached for periodic evaluation:', code(`lerobot-train \\
  --dataset.repo_id=lerobot/pusht \\
  --policy.type=diffusion \\
  --env.type=pusht`), 'Watch the loss and the evaluation success rate in Weights &amp; Biases or the log. Stop when evaluation stops improving.', 'Evaluate the final checkpoint on fixed seeds with <code>lerobot-eval</code> (see <code>lerobot-eval --help</code>) and report success with a confidence interval.', 'Repeat with <code>--policy.type=act</code> and compare: same data, different policy.')}
${stretch('Change one hyperparameter (observation horizon, number of denoising steps) and plot its effect.', 'Evaluate under a perturbation (start poses far from the training set).', 'Implement the flow-matching variant you built in the browser inside LeRobot’s framework.')}`,
  },
];
