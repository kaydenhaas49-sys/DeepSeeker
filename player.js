// player.js — pointer lock, WASD+SHIFT movement, collision, head bob / FOV kick.
import * as THREE from "three";
import { EYE, WALL_H } from "./world.js";
import { createHazmatCharacter, createFirstPersonArms } from "./character.js";

const WALK_SPEED = 4; // m/s
const RUN_SPEED = 8; // m/s
const CROUCH_SPEED = 2.2; // m/s
const PLAYER_RADIUS = 0.4; // m
const MOUSE_SENS = 0.0022;
const ACCEL = 12; // velocity smoothing (per second)
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const JUMP_SPEED = 3.2;
const JUMP_GRAVITY = 20;

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

    this.characterModel = null;
    this.characterMixer = null;
    this.characterFlashlight = null;
    this.characterFlashlightLens = null;
    this.viewmodelFlashlightLens = null;
    this.actualArmViewmodel = null;
    this.actualArmFlashlightLens = null;
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
        e.code === "ControlRight"
      ) {
        e.preventDefault();
      }
      if(e.repeat && (e.code === "ControlLeft" || e.code === "ControlRight" || e.code === "Space")) return;
      if((e.code === "ControlLeft" || e.code === "ControlRight") && this.movementActive){
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
    // The hazmat is the actual player character, not a camera prop.
    // First-person keeps the world-space body hidden to avoid clipping through
    // the camera; multiplayer renders the same full-body model.
    this.hands = new THREE.Group();
    this.hands.name = "PlayerCharacterRoot";
    this.hands.visible = true;
    this.hands.renderOrder = 2999;
    this.camera.add(this.hands);

    // Create camera-local hazmat sleeves/gloves immediately. First-person
    // visibility must not depend on the imported character's skinning data.
    this.ensureFallbackArmViewmodel();

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
    // title screen does not wait for its network/decode/clone work.
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

      // Use a skinned clone of the hazmat model's own arm/hand geometry.
      // Keep the lightweight viewmodel only as a failure fallback.
      const actualArmsInstalled=this.installActualArmViewmodel(character.model);
      if(!actualArmsInstalled){
        this.ensureFallbackArmViewmodel().visible=true;
      }
      this.hands.visible=true;
      this.hands.renderOrder=2999;

      // Keep the full model for the world avatar. Its separate flashlight
      // remains hidden; the cloned first-person rig holds its own copy.
      if(this.characterFlashlight){
        this.characterFlashlight.parent?.remove(this.characterFlashlight);
        this.camera.add(this.characterFlashlight);
        this.characterFlashlight.visible=false;
        this.characterFlashlight.position.set(.30,-.22,-.58);
        this.characterFlashlight.rotation.set(
          THREE.MathUtils.degToRad(-4),
          THREE.MathUtils.degToRad(-4),
          THREE.MathUtils.degToRad(2)
        );
        this.characterFlashlight.renderOrder=1100;
      }

      this.worldAvatar.add(character.model);
      this.characterLoaded = true;
      this.characterLoadFailed = false;

      console.log("[DeepSeeker] local hazmat avatar ready");
      return true;
    }catch(error){
      this.characterLoadFailed = true;
      // If the model fails to load, preserve the simple fallback so gameplay
      // still has visible arms and a flashlight.
      this.ensureFallbackArmViewmodel();
      this.hands.visible=true;
      console.error("[DeepSeeker] local hazmat avatar failed:",error);
      return false;
    }
  }

  installActualArmViewmodel(sourceModel){
    let viewmodel=null;
    try{
      viewmodel=createFirstPersonArms(sourceModel);
    }catch(error){
      console.warn("[DeepSeeker] Could not build first-person arms from hazmat rig:",error);
      return false;
    }
    if(!viewmodel) return false;

    let visibleMeshCount=0;
    viewmodel.traverse(obj=>{
      if(obj.isMesh && obj.visible) visibleMeshCount++;
    });
    const extractedArmMeshCount=Number(viewmodel.userData.extractedArmMeshCount)||0;
    if(extractedArmMeshCount===0 && visibleMeshCount===0){
      console.warn("[DeepSeeker] No visible arm geometry was found; keeping fallback viewmodel.");
      return false;
    }

    viewmodel.name="FirstPersonActualHazmatArms";
    viewmodel.traverse(obj=>{
      if(!obj.isMesh) return;
      obj.frustumCulled=false;
      obj.castShadow=false;
      obj.receiveShadow=false;
      obj.renderOrder=2000;
      const materials=Array.isArray(obj.material) ? obj.material : [obj.material];
      for(const material of materials){
        if(!material) continue;
        // First-person sleeves should stay readable even when they overlap
        // nearby scenery, like a conventional FPS viewmodel.
        material.depthTest=false;
        material.depthWrite=false;
        material.needsUpdate=true;
      }
    });

    // The character utility attaches a real flashlight to the rig's right-hand
    // bone. Reveal that copy inside the cloned arm rig so the hand holds it.
    const heldFlashlight=viewmodel.getObjectByName("HeldFlashlight");
    if(heldFlashlight){
      heldFlashlight.visible=true;
      heldFlashlight.traverse(obj=>{
        if(!obj.isMesh) return;
        obj.visible=true;
        obj.frustumCulled=false;
        obj.renderOrder=2010;
        const materials=Array.isArray(obj.material) ? obj.material : [obj.material];
        for(const material of materials){
          if(!material) continue;
          material.depthTest=false;
          material.depthWrite=false;
          material.needsUpdate=true;
        }
      });
    }

    this.actualArmFlashlightLens=viewmodel.getObjectByName("FlashlightLens") || null;
    this.actualArmViewmodel=viewmodel;
    this.hands.add(viewmodel);
    this.hands.visible=true;
    if(this.fallbackArmViewmodel) this.fallbackArmViewmodel.visible=false;

    console.log("[DeepSeeker] using actual hazmat arms",{
      extractedArmMeshCount,
      visibleMeshCount,
      flashlightFound:!!heldFlashlight
    });
    return true;
  }

  ensureFallbackArmViewmodel(){
    if(this.fallbackArmViewmodel){
      this.fallbackArmViewmodel.visible=true;
      return this.fallbackArmViewmodel;
    }

    // Simple, camera-local hazmat viewmodel: both forearms extend forward
    // in parallel instead of curling down into the middle of the screen.
    const root=new THREE.Group();
    root.name="FirstPersonHazmatArms3D";

    const material=(color,emissive,emissiveIntensity,roughness=.82,metalness=0)=>new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity,
      roughness,
      metalness,
      depthTest:false,
      depthWrite:false
    });
    const suitMaterial=material(0xc1b697,0x62563e,.55,.9);
    const gloveMaterial=material(0x292e29,0x11150f,.55,.78,.02);
    const cuffMaterial=material(0x42483c,0x1b2118,.45,.72,.06);
    const seamMaterial=material(0x8b8066,0x30291b,.32,.9);
    const flashlightMaterial=material(0x202522,0x070a08,.25,.48,.5);
    const flashlightRingMaterial=material(0x6d7167,0x20231e,.25,.33,.72);
    const lensMaterial=new THREE.MeshStandardMaterial({
      color:0x514e40,
      emissive:0x17160e,
      emissiveIntensity:.08,
      roughness:.24,
      metalness:.05,
      transparent:true,
      opacity:.96,
      depthTest:false,
      depthWrite:false
    });

    const addSleeveBand=(x,y,z,radius,materialRef)=>{
      const band=new THREE.Mesh(
        new THREE.TorusGeometry(radius,.005,5,14),
        materialRef
      );
      band.position.set(x,y,z);
      band.renderOrder=2999;
      root.add(band);
      return band;
    };
    const addGloveMesh=(geometry,materialRef,position,rotation,scale,order=3002)=>{
      const mesh=new THREE.Mesh(geometry,materialRef);
      mesh.position.set(position[0],position[1],position[2]);
      if(rotation) mesh.rotation.set(rotation[0]||0,rotation[1]||0,rotation[2]||0);
      if(scale) mesh.scale.set(scale[0],scale[1],scale[2]);
      mesh.renderOrder=order;
      mesh.frustumCulled=false;
      root.add(mesh);
      return mesh;
    };

    const armX={left:-.235,right:.235};
    for(const side of ["left","right"]){
      const x=armX[side];
      // Long, nearly straight sleeves; their cylinder axis is rotated into -Z.
      const sleeve=new THREE.Mesh(
        new THREE.CylinderGeometry(.078,.096,.49,16,1,false),
        suitMaterial
      );
      sleeve.position.set(x,-.285,-.575);
      sleeve.rotation.x=-Math.PI/2;
      sleeve.renderOrder=2998;
      root.add(sleeve);

      // Two low-profile fabric seams and a dark wrist cuff, not armour plates.
      addSleeveBand(x,-.285,-.43,.086,seamMaterial);
      addSleeveBand(x,-.285,-.69,.078,seamMaterial);
      const cuff=addGloveMesh(
        new THREE.TorusGeometry(.079,.010,6,16),
        cuffMaterial,[x,-.285,-.812],null,null,3000
      );
      cuff.rotation.x=0;

      // The wrist and palm line up with the forearm so the hand reaches out.
      addGloveMesh(
        new THREE.SphereGeometry(1,12,10),gloveMaterial,
        [x,-.29,-.85],null,[.070,.050,.075],3001
      );

      if(side==="left"){
        // Open left hand: four fingers point forward, with a separate thumb.
        for(let i=0;i<4;i++){
          const fingerX=x+(i-1.5)*.031;
          const fingerLength=[.040,.052,.049,.036][i];
          addGloveMesh(
            new THREE.CapsuleGeometry(.010,fingerLength,3,7),gloveMaterial,
            [fingerX,-.30,-.918],[-Math.PI/2,0,(i-1.5)*-.035],null,3003
          );
        }
        addGloveMesh(
          new THREE.CapsuleGeometry(.012,.045,3,7),gloveMaterial,
          [x+.066,-.295,-.885],[0,0,-.70],null,3003
        );
      }
    }

    // The right hand visibly wraps around a real flashlight body. Its lens
    // points down the same -Z direction as the player's view and beam.
    const torchX=.235;
    const torchY=-.265;
    const torchBarrel=new THREE.Mesh(
      new THREE.CylinderGeometry(.030,.037,.32,12,1,false),
      flashlightMaterial
    );
    torchBarrel.position.set(torchX,torchY,-1.005);
    torchBarrel.rotation.x=-Math.PI/2;
    torchBarrel.renderOrder=3004;
    root.add(torchBarrel);

    const torchHead=new THREE.Mesh(
      new THREE.CylinderGeometry(.050,.040,.085,12,1,false),
      flashlightMaterial
    );
    torchHead.position.set(torchX,torchY,-1.205);
    torchHead.rotation.x=-Math.PI/2;
    torchHead.renderOrder=3004;
    root.add(torchHead);

    const torchRing=new THREE.Mesh(
      new THREE.TorusGeometry(.047,.006,6,14),
      flashlightRingMaterial
    );
    torchRing.position.set(torchX,torchY,-1.249);
    torchRing.renderOrder=3005;
    root.add(torchRing);

    this.viewmodelFlashlightLens=new THREE.Mesh(
      new THREE.CylinderGeometry(.037,.037,.010,12,1,false),
      lensMaterial
    );
    this.viewmodelFlashlightLens.name="ViewmodelFlashlightLens";
    this.viewmodelFlashlightLens.position.set(torchX,torchY,-1.253);
    this.viewmodelFlashlightLens.rotation.x=-Math.PI/2;
    this.viewmodelFlashlightLens.renderOrder=3006;
    root.add(this.viewmodelFlashlightLens);

    // Three rounded fingers cross the handle, making the grip read as a hand
    // holding a torch rather than a separate floating object.
    for(let i=0;i<3;i++){
      addGloveMesh(
        new THREE.CapsuleGeometry(.009,.045,3,7),gloveMaterial,
        [torchX,-.292-i*.014,-.905],[0,0,-Math.PI/2],null,3007
      );
    }
    addGloveMesh(
      new THREE.CapsuleGeometry(.012,.042,3,7),gloveMaterial,
      [torchX-.055,-.267,-.905],[0,0,-.72],null,3007
    );

    root.traverse(obj=>{
      if(!obj.isMesh) return;
      obj.visible=true;
      obj.frustumCulled=false;
      obj.castShadow=false;
      obj.receiveShadow=false;
    });

    this.fallbackArmViewmodel=root;
    this.hands.add(root);
    root.visible=true;
    this.setFlashlightVisual(false);
    return root;
  }

  setFlashlightVisual(on){
    const updateLens=(lens)=>{
      if(!lens?.material) return;
      lens.material.emissiveIntensity=on ? 2.8 : .08;
      lens.material.color.set(on ? 0xf4e8be : 0x514f40);
    };

    updateLens(this.viewmodelFlashlightLens);
    updateLens(this.characterFlashlightLens);
    updateLens(this.actualArmFlashlightLens);

    // The source model's separate flashlight is never used for first-person;
    // the copy attached to the skinned right hand is the visible one.
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
    let speed = this.crouched ? CROUCH_SPEED : running ? RUN_SPEED : WALK_SPEED;

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

    const currentEye = this.camera.position.y - this.bobOffset;
    const eye = currentEye + (targetEye - currentEye) * (1 - Math.exp(-12 * dt));
    this.camera.position.set(this.pos.x, eye + this.bobOffset + this.jumpY - this.landingKick, this.pos.z);
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
