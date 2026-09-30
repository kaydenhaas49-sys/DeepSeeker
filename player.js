// player.js — pointer lock, WASD+SHIFT movement, collision, head bob / FOV kick.
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { CELL, EYE } from "./world.js";

const WALK_SPEED = 4; // m/s
const RUN_SPEED = 8; // m/s
const CROUCH_SPEED = 2.2; // m/s
const PLAYER_RADIUS = 0.4; // m
const MOUSE_SENS = 0.0022;
const ACCEL = 12; // velocity smoothing (per second)
const PITCH_LIMIT = Math.PI / 2 - 0.01;

export class Player {
  constructor(camera, domElement, world) {
    this.camera = camera;
    this.dom = domElement;
    this.world = world;

    // Spawn at the center of chunk (0,0), which is kept clear of walls.
    this.pos = new THREE.Vector3(32, EYE, 32);
    this.yaw = 0;
    this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.locked = false;
    this.bobPhase = 0;
    this.bobOffset = 0;
    this.fov = 70;
    this.crouched = false;
    this.stamina = 100;
    this.stepDistance = 0;
    this.onStep = null;
    this.jumpY = 0;
    this.jumpVelocity = 0;

    camera.rotation.order = "YXZ";
    this.setupHands();

    this.onKeyDown = (e) => {
      if (
        e.code.startsWith("Arrow") ||
        e.code === "KeyW" ||
        e.code === "KeyA" ||
        e.code === "KeyS" ||
        e.code === "KeyD"
      ) {
        e.preventDefault();
      }
      if(e.repeat && (e.code === "KeyC" || e.code === "Space")) return;
      if(e.code === "KeyC") this.crouched = !this.crouched;
      if(e.code === "Space" && this.locked && this.jumpY <= 0.001 && !this.crouched) this.jumpVelocity = 5.8;
      this.keys.add(e.code);
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onMouseMove = (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * MOUSE_SENS;
      this.pitch -= e.movementY * MOUSE_SENS;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
    };
    this.onLockChange = () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) this.keys.clear();
    };
    this.onBlur = () => this.keys.clear();
  }

  setupHands() {
    this.hands = new THREE.Group();
    this.hands.name = "FirstPersonRealArms";
    this.hands.renderOrder = 1000;
    this.hands.visible = false;
    this.camera.add(this.hands);

    // Real CC0 first-person arm/hand mesh by DevMops.
    const baseUrl =
      "https://raw.githubusercontent.com/CSUNX233/mineworld/364976a4284fc1719f7c297c2ea92aaa0e5a792b/" +
      "art/sunlit-actors/starfire-hero/source/devmops-hands/original/";
    const modelUrl = baseUrl + "arms_low_poly.fbx";

    const loader = new FBXLoader();
    loader.setResourcePath(baseUrl);

    loader.load(
      modelUrl,
      (model) => {
        model.name = "DevMopsRealArms";
        model.traverse((obj) => {
          if (!obj.isMesh) return;
          obj.frustumCulled = false;
          obj.renderOrder = 1000;
          obj.castShadow = false;
          obj.receiveShadow = false;

          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of materials) {
            if (!mat) continue;
            mat.side = THREE.DoubleSide;
            mat.depthTest = false;
            mat.depthWrite = false;
          }
        });

        // Normalize the imported asset into a comfortable first-person viewmodel.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const targetWidth = 1.35;
        const targetHeight = 0.95;
        const scale = Math.min(
          targetWidth / Math.max(size.x, 0.001),
          targetHeight / Math.max(size.y, 0.001)
        );

        model.scale.setScalar(scale);
        model.position.set(
          -center.x * scale,
          -0.52 - center.y * scale,
          -1.18 - center.z * scale
        );

        // The source asset's camera-facing hand pose is oriented toward +Z.
        model.rotation.set(0, Math.PI, 0);

        this.hands.add(model);
        this.hands.visible = true;
        this.realHands = model;
      },
      undefined,
      (error) => {
        console.warn("DeepSeeker: real arm model failed to load; using no hand fallback.", error);
      }
    );
  }

  attach() {
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onLockChange);
    window.addEventListener("blur", this.onBlur);
  }

  detach() {
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    window.removeEventListener("blur", this.onBlur);
  }

  lock() {
    try {
      const p = this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => {}); // some browsers reject without gesture
    } catch {
      /* pointer lock unavailable — overlay stays up */
    }
  }

  get wantsToRun() {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
  }

  get isRunning() {
    return this.locked && !this.crouched && this.wantsToRun && this.stamina > 1;
  }

  update(dt) {
    // --- input direction (relative to yaw); ignored while unlocked ---
    const k = this.keys;
    const active = this.locked;
    const f = active
      ? (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) -
          (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0)
      : 0;
    const s = active
      ? (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) -
          (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0)
      : 0;
    const running = active && this.isRunning;
    const speed = this.crouched ? CROUCH_SPEED : running ? RUN_SPEED : WALK_SPEED;

    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    let dx = fx * f + rx * s;
    let dz = fz * f + rz * s;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
    }

    // --- velocity smoothing (frame-rate independent) ---
    const kSm = 1 - Math.exp(-ACCEL * dt);
    this.vel.x += (dx * speed - this.vel.x) * kSm;
    this.vel.z += (dz * speed - this.vel.z) * kSm;

    // --- move with per-axis collision ---
    this.moveAxis("x", this.vel.x * dt);
    this.moveAxis("z", this.vel.z * dt);

    // --- head bob + FOV kick ---
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);

    if(running && hSpeed > 0.5) {
      this.stamina = Math.max(0, this.stamina - 28 * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + (this.crouched ? 12 : 19) * dt);
    }

    if(hSpeed > 0.45) {
      this.stepDistance += hSpeed * dt;
      const stride = this.crouched ? 2.0 : running ? 2.15 : 2.45;
      if(this.stepDistance >= stride) {
        this.stepDistance -= stride;
        if(this.onStep) this.onStep({running,crouched:this.crouched,intensity:Math.min(1,hSpeed/RUN_SPEED)});
      }
    }
    if (hSpeed > 0.5) this.bobPhase += dt * hSpeed * 1.8;
    const bobTarget =
      Math.sin(this.bobPhase) * (this.crouched ? 0.025 : 0.05) * Math.min(1, hSpeed / WALK_SPEED);
    this.bobOffset += (bobTarget - this.bobOffset) * (1 - Math.exp(-10 * dt));

    const targetFov = running && hSpeed > 1 ? 74 : this.crouched ? 67 : 70;
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-8 * dt));
    if (Math.abs(this.fov - this.camera.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // --- camera ---
    this.jumpVelocity -= 18 * dt;
    this.jumpY += this.jumpVelocity * dt;
    if(this.jumpY <= 0){
      this.jumpY = 0;
      this.jumpVelocity = 0;
    }

    const targetEye = this.crouched ? 1.12 : EYE;
    const currentEye = this.camera.position.y - this.bobOffset;
    const eye = currentEye + (targetEye - currentEye) * (1 - Math.exp(-12 * dt));
    this.camera.position.set(this.pos.x, eye + this.bobOffset + this.jumpY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    // --- first-person hands ---
    if (this.hands && this.hands.visible) {
      const moving = hSpeed > 0.5 ? Math.min(1, hSpeed / RUN_SPEED) : 0;
      const sway = moving ? Math.sin(this.bobPhase) * 0.018 : 0;
      const lift = moving ? Math.abs(Math.cos(this.bobPhase)) * 0.012 : 0;
      this.hands.position.y = lift - (this.crouched ? 0.08 : 0);
      this.hands.rotation.z = sway;
    }
  }

  // Move along one axis, resolving circle (player) vs AABB (wall cell)
  // overlaps by pushing back to the cell boundary.
  moveAxis(axis, delta) {
    if (delta === 0) return;
    const p = this.pos;
    if (axis === "x") p.x += delta;
    else p.z += delta;

    const r = PLAYER_RADIUS;
    const minX = Math.floor((p.x - r) / CELL);
    const maxX = Math.floor((p.x + r) / CELL);
    const minZ = Math.floor((p.z - r) / CELL);
    const maxZ = Math.floor((p.z + r) / CELL);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        if (!this.world.isCellBlocked(cx, cz)) continue;
        const nx = Math.max(cx * CELL, Math.min(p.x, (cx + 1) * CELL));
        const nz = Math.max(cz * CELL, Math.min(p.z, (cz + 1) * CELL));
        const ddx = p.x - nx;
        const ddz = p.z - nz;
        if (ddx * ddx + ddz * ddz < r * r) {
          if (axis === "x") p.x = delta > 0 ? cx * CELL - r : (cx + 1) * CELL + r;
          else p.z = delta > 0 ? cz * CELL - r : (cz + 1) * CELL + r;
        }
      }
    }
  }
}
