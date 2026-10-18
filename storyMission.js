import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Optional CC0 models. They never participate in the initial loading gate:
// interaction markers still work if a decorative model request fails.
const ASSETS = Object.freeze({
  stairwell: "https://cdn.3dassets.dev/assets/25338/v1/model.glb",
  fireDoor: "https://cdn.3dassets.dev/assets/25820/v1/model.glb",
  poolroom: "https://cdn.3dassets.dev/assets/25335/v1/model.glb",
});

const RELAYS = Object.freeze([
  { id: 0, title: "FIELD RADIO", x: -80, z: -92, device: "radio" },
  { id: 1, title: "SIGNAL RELAY 02", x: -80, z: -238, device: "transmitter" },
  { id: 2, title: "SIGNAL RELAY 03", x: -80, z: -394, device: "transmitter" },
]);

const STAIRWELLS = Object.freeze([
  { id: "north", x: -80, z: -164, title: "LEVEL RUN ACCESS A" },
  { id: "deep", x: -80, z: -326, title: "LEVEL RUN ACCESS B" },
]);

function makeBox(parent, name, w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}



function addDeviceMesh(parent, name, geometry, material, x=0, y=0, z=0, rotation=[0,0,0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(x,y,z);
  mesh.rotation.set(rotation[0],rotation[1],rotation[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addDeviceTube(parent, name, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  return addDeviceMesh(parent,name,new THREE.TubeGeometry(curve,24,radius,8,false),material);
}

function makeRelayDisplayTexture(relay, active=false) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#06100d";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "#436957";
  ctx.lineWidth = 5;
  ctx.strokeRect(7,7,370,178);
  ctx.fillStyle = "#85c59c";
  ctx.font = "bold 24px monospace";
  ctx.fillText(relay.device === "radio" ? "FIELD LINK" : "RF TRANSMITTER",20,38);
  ctx.fillStyle = "#bde9c7";
  ctx.font = "bold 36px monospace";
  ctx.fillText("CH 0"+(relay.id+1),20,91);
  ctx.fillStyle = "#df9a54";
  ctx.font = "bold 23px monospace";
  ctx.fillText(active ? "SIGNAL LOCKED" : "NO CARRIER",20,127);
  ctx.fillStyle = "#345a45";
  for(let i=0;i<14;i++){
    const h=8+((i*17+relay.id*11)%30);
    ctx.fillRect(20+i*24,164-h,12,h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeDishGeometry(radius=0.23, depth=0.12, radialSegments=12, segments=28) {
  const positions=[];
  const indices=[];
  for(let ring=0;ring<=radialSegments;ring++){
    const t=ring/radialSegments;
    const r=radius*t;
    const z=-depth*(1-t*t);
    for(let segment=0;segment<=segments;segment++){
      const angle=segment/segments*Math.PI*2;
      positions.push(Math.cos(angle)*r,Math.sin(angle)*r,z);
    }
  }
  for(let ring=0;ring<radialSegments;ring++){
    for(let segment=0;segment<segments;segment++){
      const a=ring*(segments+1)+segment;
      const b=a+segments+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildRelayDevice(station, relay, baseMaterial) {
  const root=new THREE.Group();
  root.name=relay.device==="radio" ? "DetailedFieldRadio" : "DetailedSignalTransmitter";
  station.add(root);

  const housing=new THREE.MeshStandardMaterial({
    color:relay.device==="radio"?0x505847:(relay.id===1?0x434a43:0x45433a),
    roughness:0.76,metalness:0.22
  });
  const trim=new THREE.MeshStandardMaterial({color:0x252c28,roughness:0.54,metalness:0.52});
  const edgeMetal=new THREE.MeshStandardMaterial({color:0x73776b,roughness:0.42,metalness:0.66});
  const panelMat=new THREE.MeshStandardMaterial({color:0x171c19,roughness:0.48,metalness:0.32});
  const rubber=new THREE.MeshStandardMaterial({color:0x101512,roughness:0.94,metalness:0.02});
  let screenTexture=makeRelayDisplayTexture(relay);
  const screenMat=screenTexture ? new THREE.MeshBasicMaterial({map:screenTexture,toneMapped:false}) : null;
  const redLed=new THREE.MeshStandardMaterial({color:0xb33a27,emissive:0x601005,emissiveIntensity:0.8,roughness:0.3});
  const greenLed=new THREE.MeshStandardMaterial({color:0x58b87e,emissive:0x087432,emissiveIntensity:1.05,roughness:0.24});
  const amberLed=new THREE.MeshStandardMaterial({color:0xe5a64d,emissive:0x82440b,emissiveIntensity:0.72,roughness:0.28});

  addDeviceMesh(station,"SignalRelayPedestal",
    new RoundedBoxGeometry(1.72,0.16,1.32,4,0.045),baseMaterial,0,0.08,0);
  for(const x of [-0.72,0.72]){
    for(const z of [-0.52,0.52]){
      addDeviceMesh(root,"PedestalBolt",new THREE.CylinderGeometry(0.025,0.025,0.018,10),edgeMetal,x,0.165,z);
    }
  }

  let statusLed;
  if(relay.device==="radio"){
    // Self-contained field radio: no network model request, so it cannot
    // silently disappear when a third-party asset host blocks a GLB download.
    addDeviceMesh(root,"RadioHousing",new RoundedBoxGeometry(0.76,0.68,0.34,6,0.05),
      housing,0,0.53,0.01);
    addDeviceMesh(root,"RadioFrontPanel",new RoundedBoxGeometry(0.69,0.60,0.025,5,0.018),
      panelMat,0,0.53,0.187);
    addDeviceMesh(root,"RadioScreenFrame",new RoundedBoxGeometry(0.38,0.20,0.022,4,0.008),
      edgeMetal,-0.085,0.665,0.207);
    addDeviceMesh(root,"RadioSignalScreen",new THREE.PlaneGeometry(0.345,0.155),
      screenMat,-0.085,0.665,0.221);
    addDeviceMesh(root,"RadioSpeakerPlate",new RoundedBoxGeometry(0.29,0.10,0.012,3,0.004),
      rubber,-0.105,0.385,0.207);
    for(let row=0;row<3;row++){
      for(let col=0;col<5;col++){
        addDeviceMesh(root,"RadioSpeakerSlot",new RoundedBoxGeometry(0.027,0.009,0.006,2,0.002),
          edgeMetal,-0.205+col*0.05,0.355+row*0.027,0.218);
      }
    }
    addDeviceMesh(root,"RadioTuningKnob",new THREE.CylinderGeometry(0.046,0.046,0.04,18),
      trim,0.235,0.705,0.215,[Math.PI/2,0,0]);
    addDeviceMesh(root,"RadioVolumeKnob",new THREE.CylinderGeometry(0.038,0.038,0.04,16),
      edgeMetal,0.235,0.535,0.215,[Math.PI/2,0,0]);
    addDeviceMesh(root,"RadioAntennaFoot",new THREE.CylinderGeometry(0.038,0.045,0.045,12),
      trim,0.285,0.88,-0.085);
    addDeviceMesh(root,"RadioAntenna",new THREE.CylinderGeometry(0.007,0.012,0.39,10),
      edgeMetal,0.285,1.095,-0.085);
    addDeviceMesh(root,"RadioHandle",new THREE.TorusGeometry(0.135,0.016,8,24),
      trim,-0.06,0.90,-0.075);
    statusLed=addDeviceMesh(root,"RadioLinkStatusLED",new THREE.SphereGeometry(0.026,14,10),
      redLed,0.20,0.79,0.222);
    addDeviceMesh(root,"RadioStatusButton",new THREE.SphereGeometry(0.024,12,8),
      amberLed,0.16,0.405,0.222);
  }else{
    addDeviceMesh(root,"TransmitterCabinet",new RoundedBoxGeometry(0.91,1.10,0.49,5,0.045),
      housing,0,0.76,0);
    addDeviceMesh(root,"TransmitterFrontPlate",new RoundedBoxGeometry(0.73,0.84,0.035,4,0.012),
      panelMat,0,0.76,0.258);
    addDeviceMesh(root,"TransmitterScreenFrame",new RoundedBoxGeometry(0.43,0.19,0.018,3,0.008),
      edgeMetal,-0.04,1.075,0.283);
    addDeviceMesh(root,"TransmitterSignalScreen",new THREE.PlaneGeometry(0.38,0.14),
      screenMat,-0.04,1.075,0.295);
    for(const x of [-0.49,0.49]){
      addDeviceMesh(root,"CabinetSideRail",new RoundedBoxGeometry(0.055,0.74,0.13,3,0.014),
        trim,x,0.78,-0.055);
    }
    for(let i=0;i<8;i++){
      addDeviceMesh(root,"TransmitterVent",new RoundedBoxGeometry(0.045,0.012,0.012,2,0.004),
        rubber,-0.24+i*0.068,0.47,0.284);
    }
    for(let i=0;i<3;i++){
      addDeviceMesh(root,"SignalStrengthLED",new THREE.SphereGeometry(0.025,12,8),
        i===0?redLed:(i===1?amberLed:greenLed),0.22+i*0.075,0.91,0.286);
    }
    statusLed=addDeviceMesh(root,"RelayOnlineLED",new THREE.SphereGeometry(0.034,14,10),
      redLed,0.25,0.67,0.288);

    addDeviceMesh(root,"DishMastBase",new THREE.CylinderGeometry(0.065,0.078,0.13,16),
      edgeMetal,-0.27,1.385,-0.08);
    addDeviceMesh(root,"DishAntennaMast",new THREE.CylinderGeometry(0.012,0.022,0.60,12),
      edgeMetal,-0.27,1.73,-0.08);
    for(let i=0;i<5;i++){
      const y=1.49+i*0.035;
      addDeviceMesh(root,"MastTunerCoil",new THREE.TorusGeometry(0.035,0.008,6,16),
        amberLed,-0.27,y,-0.08,[Math.PI/2,0,0]);
    }
    addDeviceTube(root,"DishSupportArm",
      [[-0.17,1.39,-0.02],[-0.05,1.49,0.12],[0.08,1.59,0.27],[0.15,1.66,0.32]],
      0.022,edgeMetal);
    const dishMat=new THREE.MeshStandardMaterial({
      color:0x7d8578,roughness:0.5,metalness:0.58,side:THREE.DoubleSide
    });
    addDeviceMesh(root,"ParabolicSignalDish",makeDishGeometry(),dishMat,0.15,1.70,0.43);
    addDeviceMesh(root,"DishOuterRim",new THREE.TorusGeometry(0.23,0.016,8,32),
      edgeMetal,0.15,1.70,0.43);
    addDeviceMesh(root,"DishFeedArm",new THREE.CylinderGeometry(0.010,0.018,0.17,10),
      edgeMetal,0.15,1.70,0.365,[Math.PI/2,0,0]);
    addDeviceMesh(root,"DishFeedHorn",new THREE.SphereGeometry(0.035,14,10),
      amberLed,0.15,1.70,0.465);
    addDeviceMesh(root,"AuxAntennaFoot",new THREE.CylinderGeometry(0.035,0.045,0.07,12),
      edgeMetal,0.31,1.35,-0.12);
    addDeviceMesh(root,"AuxAntenna",new THREE.CylinderGeometry(0.007,0.014,0.51,10),
      edgeMetal,0.31,1.64,-0.12);
    addDeviceTube(root,"TransmitterCable",
      [[0.47,0.56,-0.08],[0.56,0.47,-0.11],[0.53,0.27,-0.20],[0.34,0.22,-0.30]],
      0.022,rubber);
  }

  return {
    root,
    setActive(active){
      const online=Boolean(active);
      statusLed.material=online?greenLed:redLed;
      if(root.userData.online!==online){
        root.userData.online=online;
        if(screenTexture && screenMat){
          screenTexture.dispose();
          screenTexture=makeRelayDisplayTexture(relay,online);
          screenMat.map=screenTexture;
          screenMat.needsUpdate=true;
        }
      }
    }
  };
}

function placeModelOnFloor(model, { x = 0, z = 0, scale = 1, rotationY = 0 } = {}) {
  model.scale.setScalar(scale);
  model.rotation.y = rotationY;
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(x - center.x, -bounds.min.y, z - center.z);
  model.updateMatrixWorld(true);
  return model;
}

export class StoryMissionWorld {
  constructor({ scene, world, loader }) {
    this.scene = scene;
    this.world = world;
    this.loader = loader;
    this.root = new THREE.Group();
    this.root.name = "DeepSeekerStoryMission";
    this.root.visible = false;
    world.root.add(this.root);

    this.poolroomsRoot = new THREE.Group();
    this.poolroomsRoot.name = "DeepSeekerPoolrooms";
    this.poolroomsRoot.visible = false;
    scene.add(this.poolroomsRoot);

    this.interactables = [];
    this.relayCards = [];
    this.relayDevices = [];
    this.levelRunEntrances = [];
    this.poolroomsDoorCard = null;
    this.poolroomsExitCard = null;
    this.poolroomsLoaded = false;
    this.poolroomsLoadPromise = null;
    this.poolDoorMixer = null;
    this.poolDoorOpenAction = null;
    this.poolDoorGroup = null;
    this.lastGateUnlocked = false;
    this.templates = new Map();
    this.built = false;
    this.buildPromise = null;
    this.lastLoadError = "";
    this.gateDoorBounds = null;
    this.gateSideBounds = [];
    this.poolroomsBounds = [];
    this.poolBasinBounds = [];

    // Collision meshes for the poolroom are deliberately separate from its
    // render models. They keep the nine shallow basins out of the walkable deck.
    const outerMinX = -14.25, outerMaxX = 14.25;
    const outerMinZ = -4.55, outerMaxZ = 18.45;
    const wallThickness = 0.55;
    this.poolroomsBounds.push(
      { minX: outerMinX - wallThickness, maxX: outerMinX, minZ: outerMinZ - wallThickness, maxZ: outerMaxZ + wallThickness },
      { minX: outerMaxX, maxX: outerMaxX + wallThickness, minZ: outerMinZ - wallThickness, maxZ: outerMaxZ + wallThickness },
      { minX: outerMinX, maxX: outerMaxX, minZ: outerMinZ - wallThickness, maxZ: outerMinZ },
      { minX: outerMinX, maxX: outerMaxX, minZ: outerMaxZ, maxZ: outerMaxZ + wallThickness }
    );
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const centerX = (column - 1) * 9.6;
        const centerZ = row * 6.5888 + 1.0;
        this.poolBasinBounds.push({
          minX: centerX - 3.0, maxX: centerX + 3.0,
          minZ: centerZ - 1.7, maxZ: centerZ + 1.7
        });
      }
    }
    this.poolroomsBounds.push(...this.poolBasinBounds);
  }

  loadModel(key) {
    if (this.templates.has(key)) return this.templates.get(key);
    const url = ASSETS[key];
    const promise = new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    });
    this.templates.set(key, promise);
    promise.catch(error => {
      if (this.templates.get(key) === promise) this.templates.delete(key);
      this.lastLoadError = String(error?.message || error || "Asset failed to load");
      console.warn("[DeepSeeker] Optional mission model failed:", key, error);
    });
    return promise;
  }

  _signTexture(title, subtitle, status = "ACTIVE") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a100e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1b2b23";
    ctx.fillRect(12, 12, canvas.width - 24, canvas.height - 24);
    ctx.strokeStyle = "#78917a";
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
    ctx.fillStyle = "#b7c8b9";
    ctx.font = "bold 23px monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(title).slice(0, 32), 256, 66);
    ctx.fillStyle = "#e1e3d7";
    ctx.font = "20px monospace";
    ctx.fillText(String(subtitle).slice(0, 38), 256, 126);
    ctx.fillStyle = status === "LOCKED" || status === "OFFLINE" ? "#ee6565" : "#79e6a2";
    ctx.font = "bold 20px monospace";
    ctx.fillText(String(status).slice(0, 24), 256, 190);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  _addSign(parent, options) {
    const {
      x, y = 1.65, z, rotationY = 0, width = 1.5, height = 0.76,
      title, subtitle, status = "ACTIVE", interactable, register = true,
    } = options;
    const texture = this._signTexture(title, subtitle, status);
    const material = new THREE.MeshBasicMaterial({
      map: texture, side: THREE.DoubleSide, toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.name = "MissionInteractableSign";
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    mesh.userData.interactable = interactable;
    mesh.renderOrder = 4;
    parent.add(mesh);
    const card = { mesh, material, texture, config: { title, subtitle, status } };
    if (register) this.interactables.push(mesh);
    return card;
  }

  _updateCard(card, title, subtitle, status) {
    if (!card) return;
    card.texture.dispose();
    card.texture = this._signTexture(title, subtitle, status);
    card.material.map = card.texture;
    card.material.needsUpdate = true;
    card.config = { title, subtitle, status };
  }

  async build() {
    if (this.buildPromise) return this.buildPromise;
    this.buildPromise = this._build();
    return this.buildPromise;
  }

  async _build() {
    if (this.built) return;
    this.built = true;
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x303831, roughness: 0.82, metalness: 0.2 });
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x6d766b, roughness: 0.8, metalness: 0.12 });
    const gateBarrierMat = new THREE.MeshStandardMaterial({ color: 0x373e38, roughness: 0.9 });

    for (const relay of RELAYS) {
      const station = new THREE.Group();
      station.name = "StoryRelay_" + relay.id;
      station.position.set(relay.x, 0, relay.z);
      this.root.add(station);
      const device=buildRelayDevice(station,relay,darkMetal);
      this.relayDevices.push(device);
      device.root.userData.interactable = {
        type: "storyRelay",
        relayIndex: relay.id,
        prompt: relay.id === 0 ? "Pick up the field radio" : "Tune " + relay.title,
      };
      // Raycast the actual device meshes; the overhead sign is no longer needed.
      this.interactables.push(device.root);
    }

    this.loadModel("stairwell").then(gltf => {
      for (const stair of STAIRWELLS) {
        const landmark = this.root.getObjectByName("Stairwell_" + stair.id);
        if (!landmark) continue;
        const instance = gltf.scene.clone(true);
        instance.name = "GarageToStairwellModel";
        // Put a normalized, floor-aligned model just off the protected line;
        // it must not wall off the approach to the interactable marker.
        placeModelOnFloor(instance, { x: 5.1, z: -0.35, scale: 1.12 });
        landmark.add(instance);
      }
    }).catch(() => {});

    for (const stair of STAIRWELLS) {
      const landmark = new THREE.Group();
      landmark.name = "Stairwell_" + stair.id;
      landmark.position.set(stair.x, 0, stair.z);
      this.root.add(landmark);
      this.levelRunEntrances.push(this._addSign(landmark, {
        x: 0, y: 1.9, z: 2.25, width: 2.0, height: 0.82,
        title: stair.title, subtitle: "DESCEND / PRESS E", status: "READY",
        interactable: {
          type: "levelRunEntry", entryId: stair.id,
          entryDoor: { centerX: stair.x, wallZ: stair.z, face: 1 },
          prompt: "Enter " + stair.title,
        },
      }));
    }

    const gate = new THREE.Group();
    gate.name = "PoolroomsLockedDoor";
    gate.position.set(-80, 0, -472);
    this.root.add(gate);
    this.poolDoorGroup = gate;

    // A wall, jamb and lintel make the door a real threshold across the clear
    // route, instead of a freestanding prop that players can simply walk around.
    makeBox(gate, "PoolroomsGateLeftWall", 6.15, 3.3, 0.42, -4.125, 1.65, 0, gateMat);
    makeBox(gate, "PoolroomsGateRightWall", 6.15, 3.3, 0.42, 4.125, 1.65, 0, gateMat);
    makeBox(gate, "PoolroomsGateLintel", 2.1, 0.55, 0.42, 0, 3.025, 0, gateMat);
    const x = -80, z = -472, depth = 0.42;
    this.gateSideBounds = [
      { minX: x - 7.2, maxX: x - 1.05, minZ: z - depth * 0.5, maxZ: z + depth * 0.5 },
      { minX: x + 1.05, maxX: x + 7.2, minZ: z - depth * 0.5, maxZ: z + depth * 0.5 },
    ];
    this.gateDoorBounds = {
      minX: x - 1.05, maxX: x + 1.05,
      minZ: z - depth * 0.5, maxZ: z + depth * 0.5
    };
    this.world.boundaryWallBounds.push(...this.gateSideBounds, this.gateDoorBounds);

    this.poolroomsDoorCard = this._addSign(gate, {
      x: 0, y: 2.0, z: 0.235, width: 1.85, height: 0.78,
      title: "POOLROOMS", subtitle: "SIGNAL SOURCE", status: "LOCKED",
      interactable: { type: "poolroomsDoor", prompt: "Open the Poolrooms door" },
    });

    this.loadModel("fireDoor").then(gltf => {
      const instance = gltf.scene.clone(true);
      instance.name = "PoolroomsFireDoorModel";
      placeModelOnFloor(instance, { x: 0, z: 0, scale: 1.08 });
      gate.add(instance);
      if (gltf.animations?.length) {
        this.poolDoorMixer = new THREE.AnimationMixer(instance);
        const openClip = gltf.animations.find(clip => /open/i.test(clip.name));
        if (openClip) {
          this.poolDoorOpenAction = this.poolDoorMixer.clipAction(openClip);
          this.poolDoorOpenAction.setLoop(THREE.LoopOnce, 1);
          this.poolDoorOpenAction.clampWhenFinished = true;
          // The Poolrooms gate remains shut in the demo build.
        }
      }
    }).catch(() => {});

    this._buildPoolroomsArchitecture();
    this.syncState({ relays: [false, false, false], levelRunCleared: false, breakerSolved: false });
  }

  _buildPoolroomsArchitecture() {
    const root = this.poolroomsRoot;
    const wall = new THREE.MeshStandardMaterial({ color: 0x8eb9b7, roughness: 0.86 });
    const floor = new THREE.MeshStandardMaterial({ color: 0x8ca9a4, roughness: 0.56, metalness: 0.02 });
    makeBox(root, "PoolroomsLeftDryWalkway", 1.7, 0.12, 23.0, -13.35, -0.14, 6.95, floor);
    makeBox(root, "PoolroomsRightDryWalkway", 1.7, 0.12, 23.0, 13.35, -0.14, 6.95, floor);
    makeBox(root, "PoolroomsEntryDeck", 28.8, 0.12, 1.9, 0, -0.14, -3.45, floor);
    makeBox(root, "PoolroomsExitDeck", 28.8, 0.12, 1.7, 0, -0.14, 17.55, floor);
    makeBox(root, "PoolroomsCrosswalkWest", 3.35, 0.12, 23.0, -4.8, -0.14, 6.95, floor);
    makeBox(root, "PoolroomsCrosswalkEast", 3.35, 0.12, 23.0, 4.8, -0.14, 6.95, floor);
    makeBox(root, "PoolroomsNorthWall", 28.8, 5.9, 0.36, 0, 2.9, -4.55, wall);
    makeBox(root, "PoolroomsSouthWall", 28.8, 5.9, 0.36, 0, 2.9, 18.45, wall);
    makeBox(root, "PoolroomsWestWall", 0.36, 5.9, 23.0, -14.25, 2.9, 6.95, wall);
    makeBox(root, "PoolroomsEastWall", 0.36, 5.9, 23.0, 14.25, 2.9, 6.95, wall);
    const cyanLight = new THREE.PointLight(0x68e5df, 2.1, 42, 1.35);
    cyanLight.position.set(-10, 3.1, 3.5);
    cyanLight.castShadow = false;
    root.add(cyanLight);
    const paleLight = new THREE.PointLight(0xb0fff0, 1.15, 34, 1.25);
    paleLight.position.set(10, 3.0, 13);
    paleLight.castShadow = false;
    root.add(paleLight);
  }

  _playOpenDoor() {
    if (!this.poolDoorOpenAction) {
      if (this.poolDoorGroup) {
        const door = this.poolDoorGroup.getObjectByName("PoolroomsFireDoorModel");
        if (door) door.visible = false;
      }
      return;
    }
    this.poolDoorOpenAction.reset();
    this.poolDoorOpenAction.play();
  }

  _syncGate(state) {
    const relays = Array.isArray(state?.relays) ? state.relays : [];
    const unlocked = Boolean(
      state?.poolroomsUnlocked ||
      (relays.length >= 3 && relays.slice(0, 3).every(Boolean) &&
        state?.breakerSolved && state?.levelRunCleared)
    );
    for (let i = 0; i < this.relayDevices.length; i++) {
      const active = Boolean(relays[i]);
      const device = this.relayDevices[i];
      device?.setActive(active);
      const interactable = device?.root?.userData?.interactable;
      if (interactable) {
        interactable.prompt = active
          ? (i === 0 ? "Field radio already collected" : RELAYS[i].title + " already online")
          : (i === 0 ? "Pick up the field radio" : "Tune " + RELAYS[i].title);
      }
      // Picking up the first radio removes its whole pedestal from the world.
      if (i === 0 && device?.root?.parent) device.root.parent.visible = !active;
    }
    if (this.poolroomsDoorCard) {
      this._updateCard(this.poolroomsDoorCard, "POOLROOMS",
        unlocked ? "FINISH DEMO" : "3 RELAYS + BREAKERS + RUN",
        unlocked ? "GATE SEALED" : "LOCKED");
      this.poolroomsDoorCard.mesh.userData.interactable.prompt = unlocked
        ? "Finish the demo"
        : "The Poolrooms door has no power";
    }
    // The Poolrooms are future content. Even after the demo objectives are
    // complete, retain the physical gate collider and never play its open animation.
    if (this.gateDoorBounds && !this.world.boundaryWallBounds.includes(this.gateDoorBounds)) {
      this.world.boundaryWallBounds.push(this.gateDoorBounds);
    }
    this.lastGateUnlocked = unlocked;
  }

  syncState(state, { tutorialActive = false, poolroomsActive = false, missionVisible = true } = {}) {
    this.root.visible = Boolean(missionVisible && !tutorialActive && !poolroomsActive);
    this.poolroomsRoot.visible = Boolean(poolroomsActive && this.poolroomsLoaded);
    const relays = Array.isArray(state?.relays) ? state.relays : [];
    this._syncGate({ ...state, relays });
  }

  getInteractables() {
    if (!this.root.visible) return [];
    return this.interactables.filter(object => {
      let node = object;
      while (node) {
        if (!node.visible) return false;
        node = node.parent;
      }
      return true;
    });
  }

  getStairwellEntries() {
    return STAIRWELLS.map(item => ({ id: item.id, x: item.x, z: item.z, title: item.title }));
  }

  getRelayLocations() {
    return RELAYS.map(item => ({ id: item.id, x: item.x, z: item.z, title: item.title }));
  }

  update(dt) {
    this.poolDoorMixer?.update(dt);
  }

  async enterPoolrooms() {
    if (this.poolroomsLoadPromise) return this.poolroomsLoadPromise;
    this.poolroomsLoadPromise = this._buildPoolrooms();
    try {
      await this.poolroomsLoadPromise;
      return true;
    } catch (error) {
      this.poolroomsLoadPromise = null;
      this.lastLoadError = String(error?.message || error || "Poolrooms model failed to load");
      console.error("[DeepSeeker] Poolrooms could not load:", error);
      return false;
    }
  }

  async _buildPoolrooms() {
    if (this.poolroomsLoaded) return;
    const gltf = await this.loadModel("poolroom");
    const source = gltf.scene;
    const group = this.poolroomsRoot;

    // A 3x3 tile of real, textured poolroom modules. Repetition makes a
    // navigable indoor pool complex rather than replacing the hero architecture
    // with primitive placeholder rooms.
    const moduleScale = 1.6;
    const stepX = 6 * moduleScale;
    const stepZ = 4.118 * moduleScale;
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const instance = source.clone(true);
        instance.name = "PoolroomHall_" + row + "_" + column;
        const rotationY = (row + column) % 2 === 1 ? Math.PI : 0;
        placeModelOnFloor(instance, {
          x: (column - 1) * stepX,
          z: row * stepZ + 1.0,
          scale: moduleScale,
          rotationY
        });
        group.add(instance);
      }
    }

    this.poolroomsExitCard = this._addSign(group, {
      x: 12.15, y: 1.8, z: 16.1, rotationY: Math.PI,
      width: 2.0, height: 0.95,
      title: "SIGNAL EXIT", subtitle: "PRESS E TO FINISH", status: "OPEN",
      interactable: { type: "poolroomsExit", prompt: "Follow the signal to the exit" },
      register: false,
    });
    this.poolroomsLoaded = true;
  }

  getPoolroomsCollisionBoxes() {
    return this.poolroomsBounds;
  }

  getPoolroomsExitInteractable() {
    return this.poolroomsExitCard?.mesh || null;
  }
}
