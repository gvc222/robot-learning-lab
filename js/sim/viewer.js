// Draws any MuJoCo model with three.js by mirroring its geoms. MuJoCo does the physics; this only paints.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';

const G = { PLANE: 0, SPHERE: 2, CAPSULE: 3, ELLIPSOID: 4, CYLINDER: 5, BOX: 6, MESH: 7 };

// A MuJoCo mesh's vertices are stored in the geom's own frame, so they can be used as-is.
const meshCache = new WeakMap();
function meshGeometry(m, id) {
  let byId = meshCache.get(m); if (!byId) meshCache.set(m, (byId = new Map()));
  if (byId.has(id)) return byId.get(id);
  const va = m.mesh_vertadr[id], vn = m.mesh_vertnum[id], fa = m.mesh_faceadr[id], fn = m.mesh_facenum[id];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(m.mesh_vert.subarray(3 * va, 3 * (va + vn))), 3));
  geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(m.mesh_face.subarray(3 * fa, 3 * (fa + fn))), 1));
  geo.computeVertexNormals();
  byId.set(id, geo); return geo;
}

export class Viewer {
  constructor(container, { cam = [0.98, -0.04, 0.66], look = [0.19, 0.0, 0.02], groups = null, show = null, minDist = 0.3, maxDist = 1.6 } = {}) {
    this.container = container; this.groups = groups; this.show = show;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(r.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b2028);
    this.camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.01, 10);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(...cam);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.target.set(...look);
    this.controls.enablePan = false; this.controls.minDistance = minDist; this.controls.maxDistance = maxDist;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.update();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 1.5);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(0.3, -0.5, 1.2); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -0.7, right: 0.7, top: 0.7, bottom: -0.7, near: 0.1, far: 3 });
    this.scene.add(this.hemi, this.sun);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 640, hgt = this.container.clientHeight || 480;
    this.renderer.setSize(w, hgt, false);
    this.camera.aspect = w / hgt; this.camera.updateProjectionMatrix();
    this.draw();
  }

  setSim(sim) {
    this.sim = sim;
    this.group.clear();
    this.meshes = [];
    const m = sim.model, type = m.geom_type, size = m.geom_size, rgba = m.geom_rgba;
    for (let i = 0; i < m.ngeom; i++) {
      const [a, b, c] = [size[3 * i], size[3 * i + 1], size[3 * i + 2]];
      let geo;
      switch (type[i]) {
        case G.PLANE: geo = new THREE.PlaneGeometry(2 * (a || 1), 2 * (b || 1)); break;
        case G.SPHERE: geo = new THREE.SphereGeometry(a, 24, 16); break;
        case G.CAPSULE: geo = new THREE.CapsuleGeometry(a, 2 * b, 8, 20).rotateX(Math.PI / 2); break;
        case G.CYLINDER: geo = new THREE.CylinderGeometry(a, a, 2 * b, 28).rotateX(Math.PI / 2); break;
        case G.ELLIPSOID: geo = new THREE.SphereGeometry(1, 24, 16).scale(a, b, c); break;
        case G.MESH: geo = meshGeometry(m, m.geom_dataid[i]); break;
        default: geo = new THREE.BoxGeometry(2 * a, 2 * b, 2 * c);
      }
      const mi = m.geom_matid[i], src = mi >= 0 ? m.mat_rgba : rgba, o = mi >= 0 ? 4 * mi : 4 * i;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(src[o], src[o + 1], src[o + 2]), roughness: 0.65, metalness: 0.05,
        transparent: src[o + 3] < 1, opacity: src[o + 3],
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = type[i] !== G.PLANE; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      // visual-only groups (e.g. Menagerie models keep collision shapes in groups 3-4)
      if ((this.groups && !this.groups.includes(m.geom_group[i])) || (this.show && !this.show(m, i))) mesh.visible = false;
      this.group.add(mesh); this.meshes.push(mesh);
    }
    this.draw();
  }

  // "visual shift" used by the eval workbench: different lighting and table colour
  setLook(shifted) {
    this.scene.background.set(shifted ? 0x2a1d1d : 0x1b2028);
    this.sun.color.set(shifted ? 0xffc38a : 0xffffff); this.sun.intensity = shifted ? 1.2 : 2.2;
    this.sun.position.set(shifted ? -0.6 : 0.3, shifted ? 0.5 : -0.5, 1.2);
    if (this.meshes?.[0]) this.meshes[0].material.color.set(shifted ? 0x6f7f6a : 0xdbd6cc);
    this.draw();
  }

  draw() {
    if (this.sim) {
      const d = this.sim.data, p = d.geom_xpos, R = d.geom_xmat;
      for (let i = 0; i < this.meshes.length; i++) {
        const j = 9 * i, k = 3 * i;
        this.meshes[i].matrix.set(
          R[j], R[j + 1], R[j + 2], p[k],
          R[j + 3], R[j + 4], R[j + 5], p[k + 1],
          R[j + 6], R[j + 7], R[j + 8], p[k + 2],
          0, 0, 0, 1);
      }
    }
    if (this.mjCam) this.syncMujocoCamera();
    this.renderer.render(this.scene, this.camera);
  }

  // Look through one of the MuJoCo cameras (e.g. 'front' or 'wrist') instead of the orbit camera.
  useMujocoCamera(sim, name) {
    this.mjCam = name ? { sim, id: sim.cameraId(name) } : null;
    this.controls.enabled = !name;
    if (name) { this.camera.fov = sim.model.cam_fovy[this.mjCam.id]; this.camera.updateProjectionMatrix(); }
    this.draw();
  }

  syncMujocoCamera() {
    const { sim, id } = this.mjCam, p = sim.data.cam_xpos, R = sim.data.cam_xmat, j = 9 * id;
    // MuJoCo and three.js cameras share a convention: look down -z with +y up. Columns of xmat are the camera axes.
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(R[j], R[j + 3], R[j + 6]), new THREE.Vector3(R[j + 1], R[j + 4], R[j + 7]), new THREE.Vector3(R[j + 2], R[j + 5], R[j + 8]));
    this.camera.position.set(p[3 * id], p[3 * id + 1], p[3 * id + 2]);
    this.camera.quaternion.setFromRotationMatrix(m);
    this.camera.updateMatrixWorld(true);
  }

  // JPEG data URL of the current view (used for "camera snapshots" and dataset export).
  snapshot(w = 320, h = 240, quality = 0.8) {
    const r = this.renderer, size = r.getSize(new THREE.Vector2()), aspect = this.camera.aspect;
    r.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.draw();
    const url = r.domElement.toDataURL('image/jpeg', quality);
    r.setSize(size.x, size.y, false); this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    this.draw();
    return url;
  }

  dispose() {
    this.ro.disconnect(); this.controls.dispose(); this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}
