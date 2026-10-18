// player.js — pointer lock, WASD+SHIFT movement, collision, head bob / FOV kick.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EYE, WALL_H } from "./world.js?v=20261016-qualitymenu1";
import { createHazmatCharacter } from "./character.js";

const WALK_SPEED = 4; // m/s
const RUN_SPEED = 8; // m/s
const CROUCH_SPEED = 2.2; // m/s
const PLAYER_RADIUS = 0.4; // m
const MOUSE_SENS = 0.0022;
const ACCEL = 12; // velocity smoothing (per second)
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const JUMP_SPEED = 3.2;
const JUMP_GRAVITY = 20;


function makeLocalFirstPersonFlashlight(group){
  // A standalone first-person torch. Keep the camera-local viewmodel free of
  // sleeves, gloves, fingers, or arm meshes so the prop remains clean and stable.
  const flashlight=new THREE.Group();
  flashlight.name="LocalFirstPersonFlashlight";
  flashlight.position.set(.245,-.345,-.68);
  flashlight.rotation.set(
    THREE.MathUtils.degToRad(-3),
    THREE.MathUtils.degToRad(4),
    THREE.MathUtils.degToRad(-1)
  );
  group.add(flashlight);

  const metal=new THREE.MeshStandardMaterial({
    color:0x252923, roughness:.52, metalness:.34,
    side:THREE.DoubleSide, depthTest:false, depthWrite:false
  });
  const trim=new THREE.MeshStandardMaterial({
    color:0x73766a, roughness:.38, metalness:.62,
    side:THREE.DoubleSide, depthTest:false, depthWrite:false
  });
  const gripMaterial=new THREE.MeshStandardMaterial({
    color:0x131611, roughness:.84, metalness:.08,
    side:THREE.DoubleSide, depthTest:false, depthWrite:false
  });
  const lensMaterial=new THREE.MeshStandardMaterial({
    color:0x37392f, emissive:0x000000, emissiveIntensity:0,
    roughness:.22, metalness:.02,
    side:THREE.DoubleSide, depthTest:false, depthWrite:false
  });

  const addPart=(geometry,material,name,renderOrder=2010)=>{
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=name;
    mesh.renderOrder=renderOrder;
    mesh.frustumCulled=false;
    mesh.castShadow=false;
    mesh.receiveShadow=false;
    flashlight.add(mesh);
    return mesh;
  };

  // The body and lens all share the flashlight's local -Z axis.
  const body=addPart(
    new THREE.CylinderGeometry(.034,.038,.36,24),
    metal,
    "LocalFlashlightBody"
  );
  body.rotation.x=Math.PI/2;

  const head=addPart(
    new THREE.CylinderGeometry(.047,.056,.09,28),
    metal,
    "LocalFlashlightHead"
  );
  head.rotation.x=Math.PI/2;
  head.position.z=-.185;

  const bezel=addPart(
    new THREE.TorusGeometry(.052,.0055,8,28),
    trim,
    "LocalFlashlightBezel"
  );
  bezel.position.z=-.235;

  const lens=addPart(
    new THREE.CylinderGeometry(.046,.046,.014,28),
    lensMaterial,
    "FlashlightLens",
    2011
  );
  lens.rotation.x=Math.PI/2;
  lens.position.z=-.239;

  const rear=addPart(
    new THREE.CylinderGeometry(.036,.036,.025,24),
    trim,
    "LocalFlashlightRearCap"
  );
  rear.rotation.x=Math.PI/2;
  rear.position.z=.187;

  // Grip grooves and a visible top switch give the torch a more readable shape.
  for(const [index,z] of [.015,.055,.095,.135].entries()){
    const rib=addPart(
      new THREE.TorusGeometry(.035,.0026,7,24),
      gripMaterial,
      "FlashlightGripRib"+index
    );
    rib.position.z=z;
  }

  const switchBase=addPart(
    new RoundedBoxGeometry(.026,.012,.038,3,.003),
    gripMaterial,
    "FlashlightSwitchBase"
  );
  switchBase.position.set(0,.035,.055);

  const powerSwitch=addPart(
    new RoundedBoxGeometry(.016,.008,.023,3,.002),
    trim,
    "FlashlightPowerSwitch"
  );
  powerSwitch.position.set(0,.043,.055);

  return {lens,flashlight};
}

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
    this.inputEnabled = false;
    this.movementFrozen = false;
    this.bobPhase = 0;
    this.bobOffset = 0;
    this.fov = 70;
    this.crouched = false;
    this.stamina = 100;
    this.lastLookInputAt = 0;
    this.stepDistance = 0;
    this.onStep = null;
    this.jumpY = 0;
    this.jumpVelocity = 0;
    this.extraCollisionBoxes = [];
    this.extraCollisionTests = [];
    this.sliding = false;
    this.slideTimer = 0;
    this.slideDistance = 0;
    this.landingKick = 0;
    this.breathTimer = 0;
    this.onBreath = null;
    this.onLand = null;
    this.onSlide = null;
    this.ignoreWorldCollision = false;
    this.adminFlyMode = false;

    this.characterModel = null;
    this.characterMixer = null;
    this.characterFlashlight = null;
    this.characterFlashlightLens = null;
    this.characterLoaded = false;

    camera.rotation.order = "YXZ";
    this.setupHands();

    this.onKeyDown = (e) => {
      const adminOverlay=document.getElementById("adminOverlay");
      if(adminOverlay?.classList.contains("open")) return;

      const target=e.target;
      const typingTarget=
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable ||
        target?.closest?.('input, textarea, [contenteditable="true"]');

      if(typingTarget) return;
      if(this.movementFrozen){
        this.keys.clear();
        if(e.code.startsWith("Arrow") || /^Key[WASD]$/.test(e.code) || e.code==="Space"){
          e.preventDefault();
        }
        return;
      }

      if (
        e.code.startsWith("Arrow") ||
        e.code === "KeyW" ||
        e.code === "KeyA" ||
        e.code === "KeyS" ||
        e.code === "KeyD" ||
        e.code === "ControlLeft" ||
        e.code === "ControlRight" ||
        (e.code === "Space" && this.adminFlyMode)
      ) {
        e.preventDefault();
      }
      if(e.repeat && (e.code === "ControlLeft" || e.code === "ControlRight" || e.code === "Space")) return;
      if((e.code === "ControlLeft" || e.code === "ControlRight") && this.movementActive && !this.adminFlyMode){
        if(!this.sliding && this.isRunning && Math.hypot(this.vel.x,this.vel.z)>3.0){
          this.sliding=true;
          this.slideTimer=.62;
          this.crouched=true;
          this.slideDistance=0;
          if(this.onSlide) this.onSlide();
        }else{
          this.crouched = !this.crouched;
        }
      }
      if(e.code === "Space" && this.movementActive && this.jumpY <= 0.001 && !this.crouched && !this.sliding){
        this.jumpVelocity = JUMP_SPEED;
        this.stamina = Math.max(0, this.stamina - 8);
      }
      this.keys.add(e.code);
    };
    this.onKeyUp = (e) => {
      if(document.getElementById("adminOverlay")?.classList.contains("open")){
        this.keys.clear();
        return;
      }
      if(
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target?.isContentEditable ||
        e.target?.closest?.('input, textarea, [contenteditable="true"]')
      ) return;
      this.keys.delete(e.code);
    };
    this.onMouseMove = (e) => {
      if (!this.locked || this.movementFrozen) return;
      this.lastLookInputAt = performance.now();
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
    // Retain the historical property name because main.js toggles this
    // camera-local container, but its only visible child is the flashlight.
    this.hands = new THREE.Group();
    this.hands.name = "PlayerFirstPersonHands";
    this.hands.visible = true;
    this.hands.renderOrder = 2999;
    this.camera.add(this.hands);

    const viewmodel=makeLocalFirstPersonFlashlight(this.hands);
    this.proceduralArmFlashlightLens=viewmodel.lens;
    this.proceduralArmFlashlight=viewmodel.flashlight;
    this.proceduralHands=null;
    this.firstPersonArmViewmodel=null;

    this.characterModel = null;
    this.characterMixer = null;
    this.characterFlashlight = null;
    this.characterLoaded = false;
    this.characterLoadFailed = false;

    this.worldAvatar = new THREE.Group();
    this.worldAvatar.name = "LocalHazmatAvatar";
    this.worldAvatar.visible = false;

    const worldRoot = this.camera.parent || this.camera;
    worldRoot.add(this.worldAvatar);

    // Defer the 16+ MB player GLB until gameplay actually starts so the
    // title screen doesn't wait for its network/decode/clone work.
    this.characterReadyPromise=null;
  }

  ensureCharacterLoaded(){
    if(this.characterLoaded) return Promise.resolve(true);
    if(this.characterReadyPromise) return this.characterReadyPromise;

    this.characterLoadFailed=false;
    this.characterReadyPromise=this.loadCharacterModel();
    return this.characterReadyPromise;
  }

  async loadCharacterModel() {
    try{
      const character = await createHazmatCharacter();

      this.characterModel = character.model;
      this.characterMixer = character.mixer;
      this.characterFlashlight = character.flashlight;
      if(this.characterFlashlight) this.characterFlashlight.visible=false;
      this.characterFlashlightLens =
        character.flashlight?.getObjectByName("FlashlightLens") || null;

      // The first-person viewmodel is now only the standalone flashlight.
      // Keep the full hazmat character for the world/multiplayer avatar.
      this.hands.visible=true;
      this.hands.renderOrder=2999;
      this.proceduralArmFlashlight.visible=true;
      if(this.characterFlashlight) this.characterFlashlight.visible=false;

      this.worldAvatar.add(character.model);
      this.characterLoaded = true;
      this.characterLoadFailed = false;

      console.log("[DeepSeeker] local hazmat avatar ready");
      return true;
    }catch(error){
      this.characterLoadFailed = true;
      // The camera-local flashlight is independent of this optional body asset,
      // so model failure must not hide the hands or flashlight.
      this.hands.visible=true;
      console.error("[DeepSeeker] local hazmat avatar failed:",error);
      return false;
    }
  }

  setFlashlightVisual(on){
    const updateLens=(lens)=>{
      if(!lens?.material) return;
      lens.material.emissive.set(0x000000);
      lens.material.emissiveIntensity=0;
      lens.material.color.set(on ? 0x696653 : 0x37392f);
    };

    updateLens(this.characterFlashlightLens);
    updateLens(this.proceduralArmFlashlightLens);

    // The hidden world-space rig never supplies first-person rendering.
    if(this.characterFlashlight) this.characterFlashlight.visible=false;
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

  get movementActive() {
    return !this.movementFrozen && (this.locked || this.inputEnabled);
  }

  get isRunning() {
    return this.movementActive && !this.crouched && this.wantsToRun && this.stamina > 1;
  }

  update(dt) {
    if(this.movementFrozen){
      this.keys.clear();
      this.vel.set(0,0,0);
      this.jumpY=0;
      this.jumpVelocity=0;
      this.sliding=false;
      this.slideTimer=0;
    }

    // Keyboard movement can continue when pointer lock is unavailable, but
    // main.js disables input while menus, phones, controls, or other overlays
    // are active.
    const k = this.keys;
    const active = this.movementActive;
    const f = active
      ? (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) -
          (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0)
      : 0;
    const s = active
      ? (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) -
          (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0)
      : 0;
    const running = active && this.isRunning && !this.sliding;
    let speed = this.adminFlyMode ? 14 : this.crouched ? CROUCH_SPEED : running ? RUN_SPEED : WALK_SPEED;

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
    if(this.sliding){
      this.slideTimer=Math.max(0,this.slideTimer-dt);
      this.slideDistance+=Math.hypot(this.vel.x,this.vel.z)*dt;
      const slideFriction=Math.exp(-2.15*dt);
      this.vel.x*=slideFriction;
      this.vel.z*=slideFriction;
      if(this.slideTimer<=0 || Math.hypot(this.vel.x,this.vel.z)<1.0){
        this.sliding=false;
      }
    }else{
      this.vel.x += (dx * speed - this.vel.x) * kSm;
      this.vel.z += (dz * speed - this.vel.z) * kSm;
    }

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
    } else if(this.sliding) {
      this.stamina = Math.max(0, this.stamina - 5 * dt);
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
    const wasAirborne = this.jumpY > 0.001;
    this.breathTimer=Math.max(0,this.breathTimer-dt);
    this.landingKick=Math.max(0,this.landingKick-dt*.75);

    if(running && this.stamina<48 && this.breathTimer<=0){
      this.breathTimer=this.stamina<18 ? .72 : 1.18;
      if(this.onBreath) this.onBreath(Math.min(1,(48-this.stamina)/30));
    }

    if(this.adminFlyMode){
      // Free flight is relative to the camera pitch instead of being a vertical-only elevator.
      // Space/Control still give direct altitude control, while W/S follow where the view points.
      const vertical=(k.has("Space")?1:0)-((k.has("ControlLeft")||k.has("ControlRight"))?1:0);
      const forwardLift=f*Math.sin(this.pitch);
      this.jumpY=THREE.MathUtils.clamp(this.jumpY+(vertical+forwardLift)*speed*dt,0,120);
      this.jumpVelocity=0;
    }else{
      this.jumpVelocity -= JUMP_GRAVITY * dt;
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
        if(wasAirborne){
          this.landingKick=.08;
          if(this.onLand) this.onLand(Math.min(1,Math.max(.25,hSpeed/RUN_SPEED)));
        }
      }
    }

    // Keep pos.y at its long-standing eye-height baseline: gameplay systems
    // such as spider scare/look logic rely on it.
    const currentEye=this.camera.position.y-this.bobOffset;
    const eye=currentEye+(targetEye-currentEye)*(1-Math.exp(-12*dt));
    this.camera.position.set(
      this.pos.x,
      eye+this.bobOffset+this.jumpY-this.landingKick,
      this.pos.z
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    if(this.characterMixer) {
      this.characterMixer.update(dt);
    }

    if(this.worldAvatar && this.characterLoaded){
      this.worldAvatar.position.set(
        this.pos.x,
        0,
        this.pos.z
      );
      this.worldAvatar.rotation.y=this.yaw + Math.PI;
      this.worldAvatar.visible=false;
    }

    // Keep the first-person arm rig camera-local and always available while
    // the player is in normal gameplay.
    if(this.hands){
      this.hands.visible=true;
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

    for (const box of this.extraCollisionBoxes) {
      // House wall proxies are deliberate, lightweight world-space AABBs.
      // Keep collision logic simple and deterministic; angled/furniture meshes
      // are excluded when the proxies are built.
      const nx = Math.max(box.minX, Math.min(x, box.maxX));
      const nz = Math.max(box.minZ, Math.min(z, box.maxZ));
      const dx = x - nx;
      const dz = z - nz;
      if (dx * dx + dz * dz < r * r) return true;
    }

    for (const test of this.extraCollisionTests) {
      if (typeof test === "function" && test(x, z)) return true;
    }

    return false;
  }
}
