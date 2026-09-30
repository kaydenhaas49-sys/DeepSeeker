// player.js — pointer lock, WASD+SHIFT movement, collision, head bob / FOV kick.
import * as THREE from "three";
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
    const hands = new THREE.Group();
    hands.name = "FirstPersonArms";
    hands.renderOrder = 1000;

    const skin = new THREE.MeshStandardMaterial({
      color: 0xb87860,
      roughness: 0.82,
      metalness: 0.0,
      depthTest: false,
      depthWrite: false
    });
    const skinDark = new THREE.MeshStandardMaterial({
      color: 0x8e5748,
      roughness: 0.9,
      metalness: 0.0,
      depthTest: false,
      depthWrite: false
    });
    const sleeve = new THREE.MeshStandardMaterial({
      color: 0x202126,
      roughness: 0.92,
      metalness: 0.0,
      depthTest: false,
      depthWrite: false
    });
    const cuff = new THREE.MeshStandardMaterial({
      color: 0x4a4c52,
      roughness: 0.85,
      depthTest: false,
      depthWrite: false
    });

    const capsule = (radius,length,mat)=>{
      const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(radius,length,8,12),mat);
      mesh.frustumCulled=false;
      mesh.renderOrder=1000;
      return mesh;
    };

    const makeArm=(side)=>{
      const g=new THREE.Group();
      g.renderOrder=1000;

      const forearm=capsule(.105,.72,sleeve);
      forearm.rotation.z=side*0.10;
      forearm.rotation.x=-0.12;
      forearm.position.set(side*.38,-.43,-1.12);

      const cuffMesh=new THREE.Mesh(
        new THREE.CylinderGeometry(.12,.125,.14,12),
        cuff
      );
      cuffMesh.rotation.z=side*.1;
      cuffMesh.position.set(side*.40,-.16,-1.29);
      cuffMesh.renderOrder=1000;
      cuffMesh.frustumCulled=false;

      const wrist=new THREE.Mesh(
        new THREE.SphereGeometry(.125,16,12),
        skinDark
      );
      wrist.scale.set(.95,1,1.05);
      wrist.position.set(side*.41,-.11,-1.38);
      wrist.renderOrder=1000;
      wrist.frustumCulled=false;

      const palm=new THREE.Mesh(
        new THREE.SphereGeometry(.17,18,14),
        skin
      );
      palm.scale.set(.86,1.1,1.2);
      palm.position.set(side*.42,-.08,-1.52);
      palm.renderOrder=1000;
      palm.frustumCulled=false;

      const fingerOffsets=[-.085,-.028,.028,.085];
      for(let i=0;i<4;i++){
        const f=capsule(.031,.16,skin);
        f.rotation.x=-.18;
        f.rotation.z=side*(.05+(i-1.5)*.045);
        f.position.set(
          side*.42+fingerOffsets[i],
          -.005-Math.abs(i-1.5)*.008,
          -1.67
        );
        g.add(f);
      }

      const thumb=capsule(.038,.16,skin);
      thumb.rotation.z=side*.7;
      thumb.rotation.x=-.38;
      thumb.position.set(side*.53,-.08,-1.56);

      g.add(forearm,cuffMesh,wrist,palm,thumb);
      return g;
    };

    this.hands=hands;
    this.hands.visible=true;
    this.leftHand=makeArm(-1);
    this.rightHand=makeArm(1);
    hands.add(this.leftHand,this.rightHand);
    this.camera.add(hands);

    this.handBase={
      left:new THREE.Vector3(-.42,-.08,-1.52),
      right:new THREE.Vector3(.42,-.08,-1.52)
    };
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
    if (this.hands) {
      const moving = hSpeed > 0.5 ? Math.min(1, hSpeed / RUN_SPEED) : 0;
      const sway = moving ? Math.sin(this.bobPhase) * 0.024 : 0;
      const lift = moving ? Math.abs(Math.cos(this.bobPhase)) * 0.018 : 0;
      this.leftHand.position.set(
        this.handBase.left.x,
        this.handBase.left.y + lift - sway,
        this.handBase.left.z
      );
      this.rightHand.position.set(
        this.handBase.right.x,
        this.handBase.right.y + lift + sway,
        this.handBase.right.z
      );
      const handDrop = this.crouched ? 0.08 : 0;
      this.leftHand.position.y -= handDrop;
      this.rightHand.position.y -= handDrop;
      this.leftHand.rotation.z = -0.06 + sway * 1.0;
      this.rightHand.rotation.z = 0.06 + sway * 1.0;
      this.leftHand.rotation.x = -0.06 + sway * 0.35;
      this.rightHand.rotation.x = -0.06 - sway * 0.35;
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
