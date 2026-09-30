// player.js — pointer lock, WASD+SHIFT movement, collision, head bob / FOV kick.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
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
    this.hands.name = "FirstPersonAnimatedHumanHands";
    this.hands.renderOrder = 1000;
    this.hands.visible = false;
    this.camera.add(this.hands);

    this.handMixers = [];
    this.handModels = [];

    // Realistic rigged/animated anatomical hand model.
    // Source is pinned to a specific commit for reproducibility.
    const modelUrl =
      "https://raw.githubusercontent.com/emmalieker/anatomical-hand-model/" +
      "f27f19f55f8270b3108ea0b53ce5aa81c543ff7c/exports/hand_model.glb";

    const loader = new GLTFLoader();

    loader.load(
      modelUrl,
      (gltf) => {
        const source = gltf.scene;
        const sourceBox = new THREE.Box3().setFromObject(source);
        const sourceSize = sourceBox.getSize(new THREE.Vector3());
        const sourceCenter = sourceBox.getCenter(new THREE.Vector3());

        const targetHeight = 0.94;
        const baseScale = targetHeight / Math.max(sourceSize.y, 0.001);

        const makeHand = (side) => {
          const hand = SkeletonUtils.clone(source);
          hand.name = side < 0 ? "LeftHumanHand" : "RightHumanHand";

          hand.traverse((obj) => {
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
              // The mirrored hand can invert tangent-space normals; remove the
              // normal map only on that copy so it cannot produce black wedges.
              if (side > 0 && mat.normalMap) mat.normalMap = null;
              mat.needsUpdate = true;
            }
          });

          // Center the source mesh before placing it as a camera viewmodel.
          hand.position.set(
            -sourceCenter.x * baseScale,
            -sourceCenter.y * baseScale,
            -sourceCenter.z * baseScale
          );

          hand.scale.setScalar(baseScale);

          // Mirror the left/right pair. The material winding is corrected above
          // so the mirrored copy keeps proper surface shading.
          if (side > 0) hand.scale.x *= -1;

          const pivot = new THREE.Group();
          pivot.name = side < 0 ? "LeftHandPivot" : "RightHandPivot";
          pivot.position.set(side * 0.49, -0.43, -1.12);
          pivot.rotation.set(
            THREE.MathUtils.degToRad(-8),
            Math.PI + THREE.MathUtils.degToRad(side * 8),
            THREE.MathUtils.degToRad(side * 4)
          );
          pivot.add(hand);

          const mixer = new THREE.AnimationMixer(hand);

          if (gltf.animations.length) {
            const preferred =
              gltf.animations.find((clip) => /neutral/i.test(clip.name)) ||
              gltf.animations.find((clip) => /flat|open|spread/i.test(clip.name)) ||
              null;
            if (!preferred) {
              // Do not silently choose the first clip — the source's first clip
              // is a gesture pose, which is wrong for the default viewmodel.
              return;
            }
            const action = mixer.clipAction(preferred);
            action.reset();
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();
          }

          this.handMixers.push(mixer);
          this.handModels.push(pivot);
          return pivot;
        };

        this.hands.add(makeHand(-1), makeHand(1));
        this.hands.visible = true;
      },
      undefined,
      () => {
        // Keep the model group hidden rather than bringing back the old crude hands.
        this.hands.visible = false;
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
      for (const mixer of this.handMixers) mixer.update(dt);

      const moving = hSpeed > 0.5 ? Math.min(1, hSpeed / RUN_SPEED) : 0;
      const sway = moving ? Math.sin(this.bobPhase) * 0.018 : Math.sin(this.bobPhase * 0.35) * 0.004;
      const lift = moving ? Math.abs(Math.cos(this.bobPhase)) * 0.012 : 0;

      for (let i = 0; i < this.handModels.length; i++) {
        const side = i === 0 ? -1 : 1;
        const pivot = this.handModels[i];
        pivot.position.y = -0.43 + lift - (this.crouched ? 0.08 : 0);
        pivot.position.x = side * 0.49 + sway * side * 0.35;
        pivot.rotation.z =
          THREE.MathUtils.degToRad(side * 4) + sway * side;
      }
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
