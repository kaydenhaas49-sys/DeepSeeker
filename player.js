// player.js — pointer lock, WASD+SHIFT movement, collision, head bob / FOV kick.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EYE, WALL_H } from "./world.js";
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


function makeFirstPersonArmMesh(group,geometry,material,name,renderOrder=2000){
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=name;
  mesh.renderOrder=renderOrder;
  mesh.frustumCulled=false;
  mesh.castShadow=false;
  mesh.receiveShadow=false;
  group.add(mesh);
  return mesh;
}

function makeFirstPersonCapsuleSegment(group,start,end,radius,material,name,renderOrder=2000){
  const direction=end.clone().sub(start);
  const length=direction.length();
  if(length<.001) return null;
  const geometry=new THREE.CapsuleGeometry(radius,Math.max(.001,length-2*radius),5,14);
  const mesh=makeFirstPersonArmMesh(group,geometry,material,name,renderOrder);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  return mesh;
}

function makeFirstPersonPalm(group,position,material,name,rotationZ=0){
  const mesh=makeFirstPersonArmMesh(
    group,
    new RoundedBoxGeometry(.158,.126,.176,4,.043),
    material,
    name
  );
  mesh.position.copy(position);
  mesh.rotation.z=rotationZ;
  return mesh;
}

function makeFirstPersonGloveDetail(group,position,scale,material,name){
  const mesh=makeFirstPersonArmMesh(group,new THREE.SphereGeometry(1,16,12),material,name);
  mesh.position.copy(position);
  mesh.scale.set(scale.x,scale.y,scale.z);
  return mesh;
}

function makeSleeveBand(group,position,direction,radius,material,name){
  const mesh=makeFirstPersonArmMesh(
    group,new THREE.TorusGeometry(radius,.007,8,24),material,name
  );
  mesh.position.copy(position);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0,0,1),direction.clone().normalize()
  );
  return mesh;
}

function makeContinuousSleeve(group,points,material,name){
  const curve=new THREE.CatmullRomCurve3(points,false,"catmullrom",.25);
  const ringCount=40;
  const radialCount=20;
  const positions=new Float32Array((ringCount+1)*(radialCount+1)*3);
  const uvs=new Float32Array((ringCount+1)*(radialCount+1)*2);
  const indices=[];
  const referenceUp=new THREE.Vector3(0,1,0);
  const referenceSide=new THREE.Vector3(1,0,0);
  const sideVector=new THREE.Vector3();
  const normalVector=new THREE.Vector3();

  const radiusAt=(t)=>{
    const stops=[
      [0,.178],[.16,.163],[.34,.145],[.50,.126],
      [.67,.108],[.82,.093],[.94,.082],[1,.078]
    ];
    for(let i=1;i<stops.length;i++){
      if(t<=stops[i][0]){
        const [t0,r0]=stops[i-1];
        const [t1,r1]=stops[i];
        const p=(t-t0)/(t1-t0);
        return THREE.MathUtils.lerp(r0,r1,p);
      }
    }
    return stops[stops.length-1][1];
  };

  for(let ring=0;ring<=ringCount;ring++){
    const t=ring/ringCount;
    const center=curve.getPointAt(t);
    const tangent=curve.getTangentAt(t).normalize();
    const reference=Math.abs(tangent.dot(referenceUp))>.92 ? referenceSide : referenceUp;
    sideVector.crossVectors(tangent,reference).normalize();
    normalVector.crossVectors(sideVector,tangent).normalize();
    const radius=radiusAt(t);

    for(let segment=0;segment<=radialCount;segment++){
      const angle=segment/radialCount*Math.PI*2;
      const around=normalVector.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(sideVector,Math.sin(angle));
      const vertex=center.clone().addScaledVector(around,radius);
      const offset=(ring*(radialCount+1)+segment);
      positions[offset*3]=vertex.x;
      positions[offset*3+1]=vertex.y;
      positions[offset*3+2]=vertex.z;
      uvs[offset*2]=segment/radialCount;
      uvs[offset*2+1]=t;
    }
  }

  for(let ring=0;ring<ringCount;ring++){
    for(let segment=0;segment<radialCount;segment++){
      const a=ring*(radialCount+1)+segment;
      const b=a+radialCount+1;
      const c=b+1;
      const d=a+1;
      indices.push(a,d,b,b,d,c);
    }
  }

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
  geometry.setAttribute("uv",new THREE.BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const sleeve=makeFirstPersonArmMesh(group,geometry,material,name,2000);
  sleeve.userData.sleeveCurve=curve;
  sleeve.userData.radiusAt=radiusAt;
  return sleeve;
}

function makeLocalFirstPersonArms(group){
  // A conventional first-person pose: upper sleeves emerge below the frame,
  // elbows sit wide, and forearms angle inward toward hands in the lower third.
  // Wrist and glove positions stay inside the camera frustum at the game's FOV.
  const suit=new THREE.MeshStandardMaterial({
    color:0xb2aa82, roughness:.94, metalness:0,
    side:THREE.DoubleSide, depthTest:false, depthWrite:false
  });
  const seamMaterial=new THREE.MeshStandardMaterial({
    color:0x5b5944, roughness:.95, metalness:0,
    side:THREE.DoubleSide, depthTest:false, depthWrite:false
  });
  const hazardBand=new THREE.MeshStandardMaterial({
    color:0xd3c878, roughness:.82, metalness:0,
    side:THREE.DoubleSide, depthTest:false, depthWrite:false
  });
  const glove=new THREE.MeshStandardMaterial({
    color:0x30372f, roughness:.9, metalness:0,
    side:THREE.DoubleSide, depthTest:false, depthWrite:false
  });
  const gloveHighlight=new THREE.MeshStandardMaterial({
    color:0x4b5547, roughness:.93, metalness:0,
    side:THREE.DoubleSide, depthTest:false, depthWrite:false
  });

  // Arms enter off-screen at the lower corners, move forward past the elbows,
  // then angle inward toward the wrists instead of flaring out toward the edges.
  const wristPositions={};
  for(const side of [-1,1]){
    const name=side<0?"Left":"Right";
    const points=[
      new THREE.Vector3(side*.93,-1.02,-.34),  // shoulder / upper sleeve, cropped naturally
      new THREE.Vector3(side*.78,-.84,-.57),   // upper arm
      new THREE.Vector3(side*.61,-.69,-.80),   // elbow and forearm
      new THREE.Vector3(side*.445,-.565,-1.055) // wrist stays clearly in view
    ];

    const sleeve=makeContinuousSleeve(group,points,suit,name+"ContinuousHazmatSleeve");
    const curve=sleeve.userData.sleeveCurve;
    const cuffT=.94;
    makeSleeveBand(
      group,curve.getPointAt(cuffT),curve.getTangentAt(cuffT).normalize(),
      .084,hazardBand,name+"WristReflectiveCuff"
    );
    const seamT=.57;
    makeSleeveBand(
      group,curve.getPointAt(seamT),curve.getTangentAt(seamT).normalize(),
      .118,seamMaterial,name+"ForearmSeam"
    );
    wristPositions[name]=curve.getPointAt(1);
  }

  // Left hand: rounded palm meets the sleeve with the fingers aimed ahead and
  // slightly down. The small inward-facing thumb avoids a splayed / claw pose.
  const leftPalm=wristPositions.Left.clone().add(new THREE.Vector3(-.008,-.005,-.105));
  makeFirstPersonPalm(group,leftPalm,glove,"LeftGlovePalm",-.035);
  makeFirstPersonGloveDetail(
    group,leftPalm.clone().add(new THREE.Vector3(0,.035,-.006)),
    new THREE.Vector3(.083,.018,.075),gloveHighlight,"LeftGloveBackPanel"
  );

  for(let finger=0;finger<4;finger++){
    const spread=(finger-1.5)*.031;
    const base=new THREE.Vector3(leftPalm.x+spread,leftPalm.y-.012,leftPalm.z-.060);
    const joint=new THREE.Vector3(
      leftPalm.x+spread*.92,leftPalm.y-.036-Math.abs(finger-1.5)*.002,leftPalm.z-.098
    );
    const tip=new THREE.Vector3(
      leftPalm.x+spread*.78,leftPalm.y-.052-Math.abs(finger-1.5)*.002,leftPalm.z-.121
    );
    makeFirstPersonCapsuleSegment(group,base,joint,.0175,glove,"LeftGloveFinger"+finger+"A");
    makeFirstPersonCapsuleSegment(group,joint,tip,.0145,glove,"LeftGloveFinger"+finger+"B");
    makeFirstPersonGloveDetail(
      group,joint,new THREE.Vector3(.017,.017,.017),gloveHighlight,"LeftGloveKnuckle"+finger
    );
  }

  const leftThumbBase=leftPalm.clone().add(new THREE.Vector3(.071,.004,-.008));
  const leftThumbJoint=leftPalm.clone().add(new THREE.Vector3(.091,-.023,-.047));
  const leftThumbTip=leftPalm.clone().add(new THREE.Vector3(.062,-.046,-.079));
  makeFirstPersonCapsuleSegment(group,leftThumbBase,leftThumbJoint,.021,glove,"LeftGloveThumbA");
  makeFirstPersonCapsuleSegment(group,leftThumbJoint,leftThumbTip,.0175,glove,"LeftGloveThumbB");

  // Right glove is built relative to its wrist, so its palm, grip and flashlight
  // move together. Fingers curve over the torch barrel instead of floating near it.
  const rightPalm=wristPositions.Right.clone().add(new THREE.Vector3(.008,-.005,-.105));
  makeFirstPersonPalm(group,rightPalm,glove,"RightGlovePalm",.035);
  makeFirstPersonGloveDetail(
    group,rightPalm.clone().add(new THREE.Vector3(.006,.035,-.006)),
    new THREE.Vector3(.083,.018,.075),gloveHighlight,"RightGloveBackPanel"
  );

  for(let finger=0;finger<4;finger++){
    const z=rightPalm.z+.075-finger*.040;
    const base=new THREE.Vector3(rightPalm.x+.066,rightPalm.y+.060-finger*.006,z);
    const joint=new THREE.Vector3(rightPalm.x,rightPalm.y+.028-finger*.006,z-.012);
    const tip=new THREE.Vector3(rightPalm.x-.061,rightPalm.y-.007-finger*.004,z-.023);
    makeFirstPersonCapsuleSegment(group,base,joint,.020,glove,"RightGripFinger"+finger+"A",2020);
    makeFirstPersonCapsuleSegment(group,joint,tip,.017,glove,"RightGripFinger"+finger+"B",2020);
    makeFirstPersonGloveDetail(
      group,joint,new THREE.Vector3(.020,.020,.020),gloveHighlight,"RightGripKnuckle"+finger,2020
    );
  }

  const rightThumbBase=rightPalm.clone().add(new THREE.Vector3(-.056,.032,.070));
  const rightThumbJoint=rightPalm.clone().add(new THREE.Vector3(-.101,-.008,.010));
  const rightThumbTip=rightPalm.clone().add(new THREE.Vector3(-.076,-.033,-.055));
  makeFirstPersonCapsuleSegment(group,rightThumbBase,rightThumbJoint,.024,glove,"RightGripThumbA",2020);
  makeFirstPersonCapsuleSegment(group,rightThumbJoint,rightThumbTip,.019,glove,"RightGripThumbB",2020);
  makeFirstPersonGloveDetail(
    group,rightThumbJoint,new THREE.Vector3(.023,.023,.023),gloveHighlight,"RightGripThumbJoint",2020
  );

  const flashlight=new THREE.Group();
  flashlight.name="LocalFirstPersonFlashlight";
  flashlight.position.copy(rightPalm).add(new THREE.Vector3(-.025,.018,.005));
  flashlight.rotation.set(THREE.MathUtils.degToRad(-2),0,THREE.MathUtils.degToRad(-2));
  group.add(flashlight);

  const metal=new THREE.MeshStandardMaterial({
    color:0x252923, roughness:.52, metalness:.32,
    side:THREE.DoubleSide, depthTest:false, depthWrite:false,
    emissive:0x000000, emissiveIntensity:.08
  });
  const trim=new THREE.MeshStandardMaterial({
    color:0x626451, roughness:.4, metalness:.55,
    side:THREE.DoubleSide, depthTest:false, depthWrite:false
  });
  const lensMaterial=new THREE.MeshStandardMaterial({
    color:0x514f40, emissive:0x514f40, emissiveIntensity:.08,
    roughness:.28, metalness:.03,
    side:THREE.DoubleSide, depthTest:false, depthWrite:false
  });
  const body=makeFirstPersonArmMesh(
    flashlight,new THREE.CylinderGeometry(.043,.05,.36,16),
    metal,"LocalFlashlightBody",2010
  );
  body.rotation.x=Math.PI/2;
  const head=makeFirstPersonArmMesh(
    flashlight,new THREE.CylinderGeometry(.067,.05,.105,16),
    metal,"LocalFlashlightHead",2010
  );
  head.rotation.x=Math.PI/2;
  head.position.z=-.225;
  const bezel=makeFirstPersonArmMesh(
    flashlight,new THREE.TorusGeometry(.067,.008,8,20),
    trim,"LocalFlashlightBezel",2010
  );
  bezel.rotation.x=Math.PI/2;
  bezel.position.z=-.281;
  const lens=makeFirstPersonArmMesh(
    flashlight,new THREE.CylinderGeometry(.052,.052,.012,16),
    lensMaterial,"FlashlightLens",2011
  );
  lens.rotation.x=Math.PI/2;
  lens.position.z=-.286;
  const rear=makeFirstPersonArmMesh(
    flashlight,new THREE.CylinderGeometry(.047,.047,.025,16),
    trim,"LocalFlashlightRearCap",2010
  );
  rear.rotation.x=Math.PI/2;
  rear.position.z=.19;

  group.traverse(obj=>{
    if(obj.isMesh){
      obj.frustumCulled=false;
      obj.castShadow=false;
      obj.receiveShadow=false;
    }
  });
  return lens;
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

    // Real-time camera-local sleeves and gloves render immediately and never
    // enter the full-body character model used by multiplayer.
    this.proceduralArmFlashlightLens=makeLocalFirstPersonArms(this.hands);

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

      // First-person arms are our separate camera-local hazmat viewmodel.
      // Keep the asset's flashlight hidden with the non-rendered local avatar.
      this.hands.visible=true;
      this.hands.renderOrder=2999;
      if(this.characterFlashlight) this.characterFlashlight.visible=false;

      this.worldAvatar.add(character.model);
      this.characterLoaded = true;
      this.characterLoadFailed = false;

      console.log("[DeepSeeker] local hazmat avatar ready");
      return true;
    }catch(error){
      this.characterLoadFailed = true;
      // The camera-local gloves are independent of this optional body asset,
      // so model failure must not hide the hands or flashlight.
      this.hands.visible=true;
      console.error("[DeepSeeker] local hazmat avatar failed:",error);
      return false;
    }
  }

  setFlashlightVisual(on){
    const updateLens=(lens)=>{
      if(!lens?.material) return;
      lens.material.emissiveIntensity=on ? 2.8 : .08;
      lens.material.color.set(on ? 0xf4e8be : 0x514f40);
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
