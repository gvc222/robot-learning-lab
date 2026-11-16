# Vendored libraries

Checked in so the site runs from any static host with no build step and no CDN.

| Folder | Package | Version | License |
| --- | --- | --- | --- |
| `mujoco/` | [`@mujoco/mujoco`](https://www.npmjs.com/package/@mujoco/mujoco) (official MuJoCo WebAssembly bindings, Google DeepMind) | 4.0.1 | Apache-2.0 |
| `three/` | [`three`](https://www.npmjs.com/package/three) (`three.module.js`, `three.core.js`, `OrbitControls.js`) | 0.187.0 | MIT |
| `pyodide/` | [`pyodide`](https://www.npmjs.com/package/pyodide) (CPython on WebAssembly) | 314.0.8 | MPL-2.0 |
| `mediapipe/` | [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) (`vision_bundle.mjs`, SIMD wasm) | 1.2.3 | Apache-2.0 |
| `menagerie/` | [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie) `robotstudio_so101` (Apache-2.0), `i2rt_yam` (MIT) and `leap_hand` (MIT); meshes decimated to ≤ ~3k triangles, LEAP's OBJ converted to STL | main, Nov 2026 | see each LICENSE |

To update: `npm pack <package>` and copy the same files over.
