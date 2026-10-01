// player.js — pointer lock, WASD+SHIFT movement, collision, head bob / FOV kick.
import * as THREE from "three";
import { EYE, WALL_H } from "./world.js";
import { Capsule } from "three/addons/math/Capsule.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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
    this.extraCollisionBoxes = [];
    this.houseOctree = null;
    this.houseCollisionCapsule = new Capsule(
      new THREE.Vector3(0,0.4,0),
      new THREE.Vector3(0,EYE-0.2,0),
      PLAYER_RADIUS
    );
    this.ignoreWorldCollision = false;

    this.characterModel = null;
    this.characterMixer = null;
    this.characterFlashlight = null;
    this.characterFlashlightLens = null;
    this.characterLoaded = false;

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
      if(e.code === "KeyC" && this.locked) this.crouched = !this.crouched;
      if(e.code === "Space" && this.locked && this.jumpY <= 0.001 && !this.crouched){
        this.jumpVelocity = 4.8;
        this.stamina = Math.max(0, this.stamina - 8);
      }
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
    this.hands.name = "FirstPersonHazmatViewmodel";
    this.hands.renderOrder = 1000;
    this.hands.visible = true;
    this.camera.add(this.hands);

    this.characterRoot = new THREE.Group();
    this.characterRoot.name = "BackroomsHazmatCharacter";
    this.characterRoot.position.set(0,-1.58,-0.08);
    this.characterRoot.scale.setScalar(0.94);
    this.characterRoot.renderOrder = 1000;
    this.hands.add(this.characterRoot);

    this.handModels = [];
    this.loadCharacterModel();
  }

  loadCharacterModel() {
    const loader = new GLTFLoader();

    loader.load(
      "./assets/backrooms_rigged_hazmat.glb",
      (gltf)=>{
        const model=gltf.scene;
        model.name="Loco_BackroomsRiggedHazmat";
        model.traverse((obj)=>{
          if(!obj.isMesh) return;
          obj.frustumCulled=false;
          obj.renderOrder=1000;
          obj.castShadow=false;
          obj.receiveShadow=false;

          const mats=Array.isArray(obj.material)?obj.material:[obj.material];
          for(const mat of mats){
            if(!mat) continue;
            mat.toneMapped=true;
          }

          // Keep the camera out of the head/face geometry in first person.
          if(obj.name && /head|face|gasmask|mask/i.test(obj.name)){
            obj.visible=false;
          }
        });

        const box=new THREE.Box3().setFromObject(model);
        const size=box.getSize(new THREE.Vector3());
        const height=Math.max(size.y,0.001);
        const scale=1.78/height;

        model.scale.multiplyScalar(scale);

        const scaledBox=new THREE.Box3().setFromObject(model);
        const scaledCenter=scaledBox.getCenter(new THREE.Vector3());
        model.position.set(
          -scaledCenter.x,
          -scaledBox.min.y,
          -scaledCenter.z
        );

        this.characterRoot.add(model);
        this.characterModel=model;
        this.characterLoaded=true;

        const clip=gltf.animations?.[0];
        if(clip){
          this.characterMixer=new THREE.AnimationMixer(model);
          const action=this.characterMixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat,Infinity);
          action.play();
          this.characterMixer._deepseekerAction=action;
        }

        const hand=this.findRightHandBone(model);
        const flashlight=this.buildHeldFlashlight();
        hand.add(flashlight);

        this.characterFlashlight=flashlight;

        console.log(
          "[DeepSeeker] hazmat model ready",
          "animation:",clip?.name||"none",
          "hand:",hand.name
        );
      },
      undefined,
      (error)=>{
        console.error("[DeepSeeker] hazmat model failed to load:",error);
      }
    );
  }

  findRightHandBone(root){
    let best=null;
    root.traverse((obj)=>{
      if(!obj.isBone) return;
      const n=(obj.name||"").toLowerCase();

      if(
        /righthand|hand_r|hand.r|right_hand|mixamorig.*righthand|rightwrist/.test(n)
      ){
        best=best||obj;
      }
    });

    if(best) return best;

    root.traverse((obj)=>{
      if(!obj.isBone || best) return;
      const n=(obj.name||"").toLowerCase();
      if(/hand|wrist/.test(n)) best=obj;
    });

    return best||root;
  }

  buildHeldFlashlight(){
    const bodyMat=new THREE.MeshStandardMaterial({
      color:0x171917,
      roughness:.6,
      metalness:.35
    });

    const ringMat=new THREE.MeshStandardMaterial({
      color:0x55564c,
      roughness:.38,
      metalness:.7
    });

    const lensMat=new THREE.MeshStandardMaterial({
      color:0xf4e8be,
      emissive:0xd8bd72,
      emissiveIntensity:2.4,
      roughness:.28,
      metalness:.04
    });

    const flashlight=new THREE.Group();
    flashlight.name="HeldFlashlight";
    flashlight.position.set(0.055,-0.07,-0.13);
    flashlight.rotation.set(
      THREE.MathUtils.degToRad(-8),
      THREE.MathUtils.degToRad(-2),
      THREE.MathUtils.degToRad(2)
    );

    const body=new THREE.Mesh(
      new THREE.CylinderGeometry(.055,.066,.50,10),
      bodyMat
    );
    body.rotation.x=Math.PI/2;

    const head=new THREE.Mesh(
      new THREE.CylinderGeometry(.092,.067,.15,10),
      bodyMat
    );
    head.rotation.x=Math.PI/2;
    head.position.z=-.30;

    const bezel=new THREE.Mesh(
      new THREE.TorusGeometry(.094,.011,6,14),
      ringMat
    );
    bezel.rotation.x=Math.PI/2;
    bezel.position.z=-.375;

    const lens=new THREE.Mesh(
      new THREE.CylinderGeometry(.073,.073,.022,12),
      lensMat
    );
    lens.rotation.x=Math.PI/2;
    lens.position.z=-.388;

    const rear=new THREE.Mesh(
      new THREE.CylinderGeometry(.064,.064,.04,10),
      ringMat
    );
    rear.rotation.x=Math.PI/2;
    rear.position.z=.278;

    flashlight.add(body,head,bezel,lens,rear);

    flashlight.traverse(obj=>{
      obj.renderOrder=1100;
      if(obj.isMesh) obj.frustumCulled=false;
    });

    this.characterFlashlightLens=lens;
    this.setFlashlightVisual(true);
    return flashlight;
  }
  setFlashlightVisual(on){
    const lens=this.characterFlashlightLens;
    if(!lens) return;

    lens.material.emissiveIntensity=on ? 2.4 : 0.18;
    lens.material.color.set(on ? 0xf1e5b7 : 0x555448);

    if(this.characterFlashlight){
      this.characterFlashlight.visible=true;
    }
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

    // --- move with candidate-position collision ---
    // Calculate the whole next position first. The player is only moved to a
    // position that is actually clear, which prevents snapping/teleporting.
    const oldX = this.pos.x;
    const oldZ = this.pos.z;
    const stepX = this.vel.x * dt;
    const stepZ = this.vel.z * dt;
    const nextX = oldX + stepX;
    const nextZ = oldZ + stepZ;

    if (!this.isWallBlocked(nextX, nextZ)) {
      this.pos.x = nextX;
      this.pos.z = nextZ;
    } else {
      // Preserve smooth wall sliding: test each axis independently from the
      // original position instead of correcting the player into a new spot.
      const canX = !this.isWallBlocked(nextX, oldZ);
      const canZ = !this.isWallBlocked(oldX, nextZ);

      if (canX) this.pos.x = nextX;
      else this.vel.x = 0;

      if (canZ) this.pos.z = nextZ;
      else this.vel.z = 0;
    }

    // --- head bob + FOV kick ---
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);

    if(running && hSpeed > 0.5) {
      this.stamina = Math.max(0, this.stamina - 18 * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + (this.crouched ? 7 : 10) * dt);
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
    const targetEye = this.crouched ? 1.12 : EYE;

    this.jumpVelocity -= 18 * dt;
    this.jumpY += this.jumpVelocity * dt;

    // Keep the camera safely below the ceiling even if the map ceiling changes.
    const ceilingClearance = 0.15;
    const maxJumpY = Math.max(0, WALL_H - ceilingClearance - targetEye - this.bobOffset);
    if(this.jumpY > maxJumpY){
      this.jumpY = maxJumpY;
      if(this.jumpVelocity > 0) this.jumpVelocity = 0;
    }

    if(this.jumpY <= 0){
      this.jumpY = 0;
      this.jumpVelocity = 0;
    }

    const currentEye = this.camera.position.y - this.bobOffset;
    const eye = currentEye + (targetEye - currentEye) * (1 - Math.exp(-12 * dt));
    this.camera.position.set(this.pos.x, eye + this.bobOffset + this.jumpY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    if(this.characterMixer) {
      this.characterMixer.update(dt);
    }

    if(this.characterLoaded && this.characterRoot){
      const walkAmount=Math.min(1,hSpeed/WALK_SPEED);
      const viewBob=Math.sin(this.bobPhase)*0.018*walkAmount;
      const sway=Math.cos(this.bobPhase)*0.012*walkAmount;

      this.characterRoot.position.y=-1.58 + this.bobOffset*0.65 + viewBob;
      this.characterRoot.position.x=sway;
      this.characterRoot.rotation.z=sway*0.15;

      if(this.characterFlashlight){
        this.characterFlashlight.rotation.z=
          THREE.MathUtils.degToRad(2)+sway*1.8;
      }
    }

    // --- first-person hands ---
    if (this.hands && this.hands.visible && !this.characterLoaded) {
      // Viewmodel arms should never visibly pass through walls. When the
      // player gets close to a wall, retract the simple arm rectangles toward
      // the camera until they are safely on the player's side.
      let nearestWall = Infinity;
      for (const wall of this.world.getNearbyWallBounds(this.pos.x, this.pos.z, 1.2)) {
      const nx = Math.max(wall.minX, Math.min(this.pos.x, wall.maxX));
      const nz = Math.max(wall.minZ, Math.min(this.pos.z, wall.maxZ));
      nearestWall = Math.min(
      nearestWall,
      Math.hypot(this.pos.x - nx, this.pos.z - nz)
      );
      }
      const wallNear = nearestWall < 0.9;
      const armDepthTarget = wallNear ? -0.30 : -0.92;
      
      const moving = hSpeed > 0.5 ? Math.min(1, hSpeed / RUN_SPEED) : 0;
      const sway = moving ? Math.sin(this.bobPhase) * 0.018 : Math.sin(this.bobPhase * 0.35) * 0.004;
      const lift = moving ? Math.abs(Math.cos(this.bobPhase)) * 0.012 : 0;
      
      for (let i = 0; i < this.handModels.length; i++) {
      const side = i === 0 ? -1 : 1;
      const pivot = this.handModels[i];
      const baseX = side < 0 ? -0.42 : 0.45;
      const baseY = -0.62 - (this.crouched ? 0.08 : 0);
      const baseZ = -0.95;
      
      pivot.position.x = baseX + sway * side * 0.22;
      pivot.position.y = baseY + lift * 0.55;
      pivot.position.z += (baseZ - pivot.position.z) * (1 - Math.exp(-18 * dt));
      
      pivot.rotation.z =
      THREE.MathUtils.degToRad(side * 5) + sway * side * 0.8;
      }
      
      if(this.viewmodelFlashlight){
      this.viewmodelFlashlight.rotation.z=THREE.MathUtils.degToRad(-2)+sway*0.9;
      }
    }
  }

  // Exact circle-vs-thin-wall test at a proposed player position.
  isWallBlocked(x, z) {
    const r = PLAYER_RADIUS;

    if (!this.ignoreWorldCollision) {
      const walls = this.world.getNearbyWallBounds(x, z, r + 1.0);
      for (const wall of walls) {
        const nx = Math.max(wall.minX, Math.min(x, wall.maxX));
        const nz = Math.max(wall.minZ, Math.min(z, wall.maxZ));
        const dx = x - nx;
        const dz = z - nz;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }

    if (this.houseOctree && this.ignoreWorldCollision) {
      const capsule=this.houseCollisionCapsule;
      capsule.start.set(x,0.4,z);
      capsule.end.set(x,Math.max(0.8,EYE-0.2),z);
      capsule.radius=PLAYER_RADIUS;

      const hit=this.houseOctree.capsuleIntersect(capsule);
      if(hit && hit.normal && Math.abs(hit.normal.y)<0.65) return true;
    }

    for (const box of this.extraCollisionBoxes) {
      const nx = Math.max(box.minX, Math.min(x, box.maxX));
      const nz = Math.max(box.minZ, Math.min(z, box.maxZ));
      const dx = x - nx;
      const dz = z - nz;
      if (dx * dx + dz * dz < r * r) return true;
    }

    return false;
  }
}
