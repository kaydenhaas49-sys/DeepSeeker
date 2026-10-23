import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Optional CC0 models. They never participate in the initial loading gate:
// interaction markers still work if a decorative model request fails.
const ASSETS = Object.freeze({
  poolroom: "https://cdn.3dassets.dev/assets/25335/v1/model.glb",
});

const RELAYS = Object.freeze([
  { id: 0, title: "FIELD RADIO", x: -80, z: -92, device: "radio" },
  { id: 1, title: "SIGNAL RELAY 02", x: -80, z: -238, device: "transmitter" },
  { id: 2, title: "SIGNAL RELAY 03", x: -80, z: -394, device: "transmitter" },
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
    addDeviceMesh(root,"RadioCradle",new RoundedBoxGeometry(0.88,0.075,0.49,5,0.018),
      trim,0,0.205,0.01);
    addDeviceMesh(root,"RadioHousing",new RoundedBoxGeometry(0.76,0.68,0.34,8,0.055),
      housing,0,0.53,0.01);
    addDeviceMesh(root,"RadioFrontBezel",new RoundedBoxGeometry(0.708,0.622,0.028,7,0.022),
      trim,0,0.53,0.184);
    addDeviceMesh(root,"RadioFrontPanel",new RoundedBoxGeometry(0.674,0.589,0.026,7,0.022),
      panelMat,0,0.53,0.203);
    for(const x of [-0.37,0.37]){
      addDeviceMesh(root,"RadioRubberSideGrip",new RoundedBoxGeometry(0.048,0.45,0.055,5,0.012),
        rubber,x,0.52,0.035);
      for(let i=0;i<5;i++){
        addDeviceMesh(root,"RadioGripRidge",new RoundedBoxGeometry(0.012,0.035,0.009,2,0.003),
          trim,x,0.36+i*0.075,0.065);
      }
    }
    addDeviceMesh(root,"RadioScreenFrame",new RoundedBoxGeometry(0.405,0.225,0.025,5,0.012),
      edgeMetal,-0.085,0.665,0.225);
    addDeviceMesh(root,"RadioScreenGasket",new RoundedBoxGeometry(0.375,0.195,0.013,4,0.006),
      rubber,-0.085,0.665,0.244);
    addDeviceMesh(root,"RadioSignalScreen",new THREE.PlaneGeometry(0.345,0.155),
      screenMat,-0.085,0.665,0.253);
    addDeviceMesh(root,"RadioSpeakerPlate",new RoundedBoxGeometry(0.30,0.115,0.016,4,0.006),
      rubber,-0.105,0.385,0.229);
    for(let row=0;row<4;row++){
      for(let col=0;col<7;col++){
        addDeviceMesh(root,"RadioSpeakerSlot",new RoundedBoxGeometry(0.021,0.006,0.005,2,0.001),
          edgeMetal,-0.198+col*0.031,0.347+row*0.025,0.239);
      }
    }
    for(const [sx,sy] of [[-.29,.775],[.29,.775],[-.29,.285],[.29,.285]]){
      addDeviceMesh(root,"RadioCaseScrew",new THREE.CylinderGeometry(0.012,0.012,0.009,10),
        edgeMetal,sx,sy,0.239,[Math.PI/2,0,0]);
      addDeviceMesh(root,"RadioScrewSlot",new THREE.BoxGeometry(0.012,0.002,0.002),
        rubber,sx,sy,0.245);
    }
    addDeviceMesh(root,"RadioTuningKnobRing",new THREE.TorusGeometry(0.052,0.007,6,18),
      edgeMetal,0.235,0.705,0.232,[Math.PI/2,0,0]);
    addDeviceMesh(root,"RadioTuningKnob",new THREE.CylinderGeometry(0.043,0.047,0.042,20),
      trim,0.235,0.705,0.248,[Math.PI/2,0,0]);
    addDeviceMesh(root,"RadioVolumeKnobRing",new THREE.TorusGeometry(0.045,0.006,6,18),
      edgeMetal,0.235,0.535,0.232,[Math.PI/2,0,0]);
    addDeviceMesh(root,"RadioVolumeKnob",new THREE.CylinderGeometry(0.034,0.039,0.042,18),
      edgeMetal,0.235,0.535,0.248,[Math.PI/2,0,0]);
    addDeviceMesh(root,"RadioTuningIndex",new THREE.BoxGeometry(0.004,0.015,0.004),
      amberLed,0.235,0.736,0.273);
    addDeviceMesh(root,"RadioAntennaFoot",new THREE.CylinderGeometry(0.042,0.05,0.052,14),
      trim,0.285,0.88,-0.085);
    for(let i=0;i<4;i++){
      addDeviceMesh(root,"RadioAntennaCoil",new THREE.TorusGeometry(0.021,0.0045,6,14),
        edgeMetal,0.285,0.915+i*0.018,-0.085,[Math.PI/2,0,0]);
    }
    addDeviceMesh(root,"RadioAntenna",new THREE.CylinderGeometry(0.006,0.011,0.37,12),
      edgeMetal,0.285,1.105,-0.085,[0,0,-0.035]);
    addDeviceMesh(root,"RadioHandleBase",new THREE.CylinderGeometry(0.018,0.02,0.055,12),
      trim,-0.06,0.87,-0.075);
    addDeviceMesh(root,"RadioHandle",new THREE.TorusGeometry(0.145,0.018,8,28),
      trim,-0.06,0.91,-0.075);
    statusLed=addDeviceMesh(root,"RadioLinkStatusLED",new THREE.SphereGeometry(0.026,14,10),
      redLed,0.19,0.79,0.273);
    addDeviceMesh(root,"RadioStatusButton",new THREE.SphereGeometry(0.024,12,8),
      amberLed,0.16,0.405,0.272);
    addDeviceMesh(root,"RadioChannelButton",new THREE.CylinderGeometry(0.016,0.016,0.018,12),
      rubber,0.18,0.45,0.259,[Math.PI/2,0,0]);
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


function buildProceduralPoolroomsGateDoor(parent) {
  const door=new THREE.Group();
  door.name="PoolroomsProceduralGateDoor";
  parent.add(door);

  const frameMat=new THREE.MeshStandardMaterial({color:0x26302e,roughness:0.62,metalness:0.58});
  const shellMat=new THREE.MeshStandardMaterial({color:0x52615a,roughness:0.72,metalness:0.38});
  const insetMat=new THREE.MeshStandardMaterial({color:0x26332f,roughness:0.66,metalness:0.46});
  const ribMat=new THREE.MeshStandardMaterial({color:0x78837a,roughness:0.48,metalness:0.66});
  const darkMat=new THREE.MeshStandardMaterial({color:0x0c1412,roughness:0.86,metalness:0.12});
  const cautionMat=new THREE.MeshStandardMaterial({color:0xc39445,roughness:0.58,metalness:0.18});
  const cyanMat=new THREE.MeshStandardMaterial({
    color:0x44d2d5,emissive:0x168e9c,emissiveIntensity:1.3,roughness:0.28,metalness:0.12
  });
  const amberMat=new THREE.MeshStandardMaterial({
    color:0xdca45a,emissive:0x65330b,emissiveIntensity:0.75,roughness:0.32
  });
  const add=(name,w,h,d,x,y,z,material,radius=0.015)=>
    addDeviceMesh(door,name,
      new RoundedBoxGeometry(w,h,d,4,Math.min(radius,Math.min(w,h,d)*0.22)),
      material,x,y,z);

  // A heavy, sealed double-leaf gate fitted to the original doorway opening.
  add("GateFrameLeft",0.12,2.68,0.23,-0.99,1.37,0.11,frameMat,0.018);
  add("GateFrameRight",0.12,2.68,0.23,0.99,1.37,0.11,frameMat,0.018);
  add("GateFrameHeader",2.03,0.14,0.23,0,2.69,0.11,frameMat,0.018);
  add("GateThreshold",1.98,0.09,0.30,0,0.045,0.10,frameMat,0.012);

  for(const side of [-1,1]){
    const x=side*0.435;
    add("GateDoorLeaf",0.84,2.52,0.16,x,1.34,0.095,shellMat,0.026);
    add("GateDoorInset",0.68,2.08,0.035,x,1.38,0.193,insetMat,0.014);
    add("GateDoorInnerPlate",0.57,1.86,0.025,x,1.39,0.218,darkMat,0.009);
    for(const y of [0.57,0.91,1.87,2.21]){
      add("GateReinforcementRib",0.61,0.035,0.028,x,y,0.239,ribMat,0.008);
    }
    add("GateVerticalReinforcement",0.035,2.19,0.032,x+side*0.30,1.36,0.238,ribMat,0.007);
    add("GateStatusLight",0.075,0.16,0.035,x,2.42,0.239,cyanMat,0.012);
    add("GateLockHousing",0.095,0.37,0.075,x-side*0.11,1.29,0.235,frameMat,0.012);
    add("GateLockHandle",0.035,0.22,0.035,x-side*0.11,1.29,0.281,ribMat,0.007);
    for(const y of [0.39,2.29]){
      addDeviceMesh(door,"GateRivet",new THREE.SphereGeometry(0.019,8,6),
        ribMat,x-side*0.31,y,0.242);
      addDeviceMesh(door,"GateRivet",new THREE.SphereGeometry(0.019,8,6),
        ribMat,x+side*0.31,y,0.242);
    }
    for(let i=0;i<4;i++){
      const stripe=addDeviceMesh(door,"GateHazardStripe",
        new THREE.BoxGeometry(0.12,0.022,0.018),
        i%2===0?cautionMat:darkMat,x-0.24+i*0.16,0.20,0.23);
      stripe.rotation.z=-0.48;
    }
  }

  add("GateCentreSeam",0.032,2.43,0.04,0,1.35,0.205,darkMat,0.006);
  add("GateTopSignalPlate",0.52,0.12,0.04,0,2.48,0.232,frameMat,0.008);
  for(const x of [-0.20,-0.10,0,0.10,0.20]){
    add("GateTopSignalSegment",0.045,0.035,0.012,x,2.48,0.259,cyanMat,0.005);
  }
  for(const x of [-0.76,0.76]){
    add("GateVerticalSignalStrip",0.024,2.20,0.025,x,1.36,0.228,cyanMat,0.006);
    addDeviceMesh(door,"GateWarningLamp",new THREE.SphereGeometry(0.035,12,8),
      amberMat,x,0.24,0.25);
  }
  door.userData.procedural=true;
  return door;
}

function buildProceduralSignalPortal(parent,x,y,z,rotationY=Math.PI) {
  const portal=new THREE.Group();
  portal.name="ProceduralSignalExitPortal";
  portal.position.set(x,y,z);
  portal.rotation.y=rotationY;
  parent.add(portal);

  const frameMat=new THREE.MeshStandardMaterial({color:0x253330,roughness:0.56,metalness:0.62});
  const trimMat=new THREE.MeshStandardMaterial({color:0x718a80,roughness:0.42,metalness:0.72});
  const cyanMat=new THREE.MeshStandardMaterial({
    color:0x4ddce8,emissive:0x1ab3c7,emissiveIntensity:1.1,roughness:0.24,metalness:0.1
  });
  const darkMat=new THREE.MeshBasicMaterial({color:0x02090c,toneMapped:false});
  const add=(name,w,h,d,px,py,pz,material,radius=0.012)=>
    addDeviceMesh(portal,name,
      new RoundedBoxGeometry(w,h,d,4,Math.min(radius,Math.min(w,h,d)*0.22)),
      material,px,py,pz);

  add("SignalExitFrameLeft",0.15,2.78,0.28,-0.96,1.39,0,frameMat,0.025);
  add("SignalExitFrameRight",0.15,2.78,0.28,0.96,1.39,0,frameMat,0.025);
  add("SignalExitFrameHeader",2.06,0.16,0.28,0,2.70,0,frameMat,0.025);
  add("SignalExitThreshold",1.98,0.10,0.34,0,0.05,0.02,frameMat,0.016);
  addDeviceMesh(portal,"SignalExitVoid",new THREE.PlaneGeometry(1.70,2.48),
    darkMat,0,1.24,0.08);
  add("SignalExitInnerTrimLeft",0.035,2.42,0.04,-0.84,1.24,0.105,cyanMat,0.008);
  add("SignalExitInnerTrimRight",0.035,2.42,0.04,0.84,1.24,0.105,cyanMat,0.008);
  add("SignalExitInnerTrimTop",1.72,0.035,0.04,0,2.49,0.105,cyanMat,0.008);

  const bars=[];
  for(let i=0;i<11;i++){
    const width=0.28+((i*7)%6)*0.16;
    const x=Math.sin(i*1.71)*0.20;
    const py=0.19+i*0.205;
    const material=new THREE.MeshBasicMaterial({
      color:i%3===0?0x7bf2ed:0x28a9c3,
      transparent:true,opacity:0.42,depthWrite:false,toneMapped:false
    });
    const mesh=addDeviceMesh(portal,"SignalExitScanBar",
      new RoundedBoxGeometry(width,0.014,0.014,3,0.005),
      material,x,py,0.112);
    bars.push({mesh,material,phase:i*0.71,baseX:x});
  }

  for(const x of [-0.67,-0.50,-0.33,0.33,0.50,0.67]){
    add("SignalExitSideTick",0.025,0.055,0.018,x,
      0.22+((Math.abs(x)*100)%4)*0.24,0.12,trimMat,0.005);
  }
  const light=new THREE.PointLight(0x39cfe3,0.85,6.5,2);
  light.position.set(0,1.25,0.22);
  light.castShadow=false;
  portal.add(light);
  portal.userData.procedural=true;
  return {root:portal,bars,light};
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
    this.poolroomsDoorCard = null;
    this.poolroomsExitCard = null;
    this.poolroomsLoaded = false;
    this.poolroomsLoadPromise = null;
    this.signalBeacons = [];
    this.signalClock = 0;
    this.signalTrackMaterial = null;
    this.portalSignalBars = [];
    this.portalSignalLight = null;
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
    const outerMinX = -14.4, outerMaxX = 14.4;
    const outerMinZ = -4.55, outerMaxZ = 18.45;
    const wallThickness = 0.55;
    this.poolroomsBounds.push(
      { minX: outerMinX - wallThickness, maxX: outerMinX, minZ: outerMinZ - wallThickness, maxZ: outerMaxZ + wallThickness },
      { minX: outerMaxX, maxX: outerMaxX + wallThickness, minZ: outerMinZ - wallThickness, maxZ: outerMaxZ + wallThickness },
      { minX: outerMinX, maxX: outerMaxX, minZ: outerMinZ - wallThickness, maxZ: outerMinZ },
      // Leave the same exit aperture as the visible south wall.
      { minX: outerMinX, maxX: 10.9, minZ: outerMaxZ, maxZ: outerMaxZ + wallThickness },
      { minX: 13.4, maxX: outerMaxX, minZ: outerMaxZ, maxZ: outerMaxZ + wallThickness }
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

    const gate = new THREE.Group();
    gate.name = "PoolroomsLockedDoor";
    gate.position.set(-80, 0, -472);
    this.root.add(gate);

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

    buildProceduralPoolroomsGateDoor(gate);
    this.poolroomsDoorCard = this._addSign(gate, {
      x: -1.86, y: 2.0, z: 0.235, width: 1.42, height: 0.78,
      title: "POOLROOMS", subtitle: "SIGNAL SOURCE", status: "LOCKED",
      interactable: { type: "poolroomsDoor", prompt: "Open the Poolrooms door" },
    });

    this._buildPoolroomsArchitecture();
    this.syncState({ relays: [false, false, false], breakerSolved: false });
  }

  _buildPoolroomsArchitecture() {
    const root = this.poolroomsRoot;
    const wall = new THREE.MeshStandardMaterial({ color: 0x8eb9b7, roughness: 0.86 });
    const floor = new THREE.MeshStandardMaterial({ color: 0x8ca9a4, roughness: 0.56, metalness: 0.02 });
    // This level is separate from the deliberately dark Backrooms lighting.
    // Give the tiled surfaces a cool, soft fill so their materials read clearly.
    const poolroomsFill = new THREE.HemisphereLight(0xcaf6f1, 0x183535, 0.72);
    poolroomsFill.name = "PoolroomsAmbientFill";
    root.add(poolroomsFill);
    // Walkway tops sit exactly at y=0, the GLB modules' floor plane.
    makeBox(root, "PoolroomsLeftDryWalkway", 1.7, 0.12, 23.0, -13.35, -0.06, 6.95, floor);
    makeBox(root, "PoolroomsRightDryWalkway", 1.7, 0.12, 23.0, 13.35, -0.06, 6.95, floor);
    makeBox(root, "PoolroomsEntryDeck", 28.8, 0.12, 1.9, 0, -0.06, -3.45, floor);
    makeBox(root, "PoolroomsExitDeck", 28.8, 0.12, 1.7, 0, -0.06, 17.55, floor);
    makeBox(root, "PoolroomsCrosswalkWest", 3.35, 0.12, 23.0, -4.8, -0.06, 6.95, floor);
    makeBox(root, "PoolroomsCrosswalkEast", 3.35, 0.12, 23.0, 4.8, -0.06, 6.95, floor);
    makeBox(root, "PoolroomsNorthWall", 28.8, 5.9, 0.36, 0, 2.9, -4.55, wall);
    // Cut a real doorway into the exit wall; the signal portal must not sit
    // in front of a continuous wall or be clipped into the last GLB module.
    makeBox(root, "PoolroomsSouthWallLeft", 25.3, 5.9, 0.36, -1.75, 2.9, 18.45, wall);
    makeBox(root, "PoolroomsSouthWallRight", 1.0, 5.9, 0.36, 13.9, 2.9, 18.45, wall);
    makeBox(root, "PoolroomsSouthWallLintel", 2.5, 3.0, 0.36, 12.15, 4.4, 18.45, wall);
    // Keep perimeter walls just outside the modules instead of interpenetrating them.
    makeBox(root, "PoolroomsWestWall", 0.36, 5.9, 23.0, -14.58, 2.9, 6.95, wall);
    makeBox(root, "PoolroomsEastWall", 0.36, 5.9, 23.0, 14.58, 2.9, 6.95, wall);
    this._buildPoolroomSignalPath(root);
  }

  _buildPoolroomSignalPath(root) {
    const baseMat=new THREE.MeshStandardMaterial({color:0x26312f,roughness:0.65,metalness:0.48});
    const trimMat=new THREE.MeshStandardMaterial({color:0x657971,roughness:0.42,metalness:0.68});
    const mastMat=new THREE.MeshStandardMaterial({color:0x354540,roughness:0.52,metalness:0.56});
    const trackMat=new THREE.MeshBasicMaterial({
      color:0x277c89,transparent:true,opacity:0.48,toneMapped:false
    });
    this.signalTrackMaterial=trackMat;

    // Beacons are generated along the crosswalk, then turn toward the exit deck.
    const points=[
      {x:5.82,z:-1.35},
      {x:5.82,z:2.0},
      {x:5.82,z:5.5},
      {x:5.82,z:9.0},
      {x:5.82,z:12.5},
      {x:5.82,z:15.7},
      {x:7.35,z:17.72},
      {x:9.25,z:17.72},
      {x:10.55,z:17.72},
    ];
    const add=(parent,name,geometry,material,x,y,z)=>{
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name=name;
      mesh.position.set(x,y,z);
      mesh.castShadow=false;
      mesh.receiveShadow=false;
      parent.add(mesh);
      return mesh;
    };

    points.forEach((point,index)=>{
      const beacon=new THREE.Group();
      beacon.name="ProceduralPoolroomSignalBeacon_"+String(index+1).padStart(2,"0");
      beacon.position.set(point.x,0,point.z);
      root.add(beacon);
      add(beacon,"SignalBeaconBase",new RoundedBoxGeometry(0.36,0.12,0.32,4,0.025),
        baseMat,0,0.06,0);
      add(beacon,"SignalBeaconMast",new THREE.CylinderGeometry(0.035,0.052,0.29,10),
        mastMat,0,0.235,0);
      add(beacon,"SignalBeaconCap",new THREE.CylinderGeometry(0.095,0.12,0.06,14),
        trimMat,0,0.40,0);

      const lensMaterial=new THREE.MeshStandardMaterial({
        color:0x55e6ed,emissive:0x1aaabb,emissiveIntensity:1.1,
        roughness:0.24,metalness:0.08
      });
      add(beacon,"SignalBeaconLens",new RoundedBoxGeometry(0.12,0.18,0.065,4,0.018),
        lensMaterial,0,0.51,0.025);
      for(const y of [0.16,0.34]){
        const ring=new THREE.Mesh(new THREE.TorusGeometry(0.105,0.009,6,18),lensMaterial);
        ring.name="SignalBeaconRing";
        ring.rotation.x=Math.PI/2;
        ring.position.set(0,y,0);
        ring.castShadow=false;
        beacon.add(ring);
      }

      let light=null;
      if(index%2===0){
        light=new THREE.PointLight(0x3bd5e8,0.30,4.6,2);
        light.position.set(0,0.47,0);
        light.castShadow=false;
        beacon.add(light);
      }
      this.signalBeacons.push({lensMaterial,light,phase:index*0.82,baseIntensity:0.30});
    });

    const firstZ=-1.35,lastZ=15.7;
    add(root,"ProceduralSignalTrackLong",new THREE.BoxGeometry(0.028,0.012,lastZ-firstZ),
      trackMat,5.82,0.01,(firstZ+lastZ)/2);
    const trackStart=5.82,trackEnd=12.15;
    add(root,"ProceduralSignalTrackTurn",new THREE.BoxGeometry(trackEnd-trackStart,0.012,0.028),
      trackMat,(trackStart+trackEnd)/2,0.01,17.72);
  }



  _syncGate(state) {
    const relays = Array.isArray(state?.relays) ? state.relays : [];
    const unlocked = Boolean(
      state?.poolroomsUnlocked ||
      (relays.length >= 3 && relays.slice(0, 3).every(Boolean) &&
        state?.breakerSolved)
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

  getRelayLocations() {
    return RELAYS.map(item => ({ id: item.id, x: item.x, z: item.z, title: item.title }));
  }

  update(dt) {
    if(!Number.isFinite(dt)||dt<=0) return;
    this.signalClock+=Math.min(dt,0.1);
    if(!this.poolroomsRoot.visible) return;

    for(const beacon of this.signalBeacons){
      const wave=0.5+0.5*Math.sin(this.signalClock*2.15+beacon.phase);
      beacon.lensMaterial.emissiveIntensity=0.75+1.3*wave;
      if(beacon.light) beacon.light.intensity=beacon.baseIntensity*(0.55+0.85*wave);
    }
    for(const bar of this.portalSignalBars){
      const wave=0.5+0.5*Math.sin(this.signalClock*2.4+bar.phase);
      bar.material.opacity=0.20+0.68*wave;
      bar.mesh.position.x=bar.baseX+Math.sin(this.signalClock*1.7+bar.phase)*0.025;
    }
    if(this.portalSignalLight){
      this.portalSignalLight.intensity=0.55+0.45*(0.5+0.5*Math.sin(this.signalClock*1.85));
    }
    if(this.signalTrackMaterial){
      this.signalTrackMaterial.opacity=0.30+0.24*(0.5+0.5*Math.sin(this.signalClock*1.4));
    }
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
        // Keep each row consistently oriented; alternate row direction so
        // the room reads as connected pool bays rather than a checkerboard.
        const rotationY = row % 2 === 1 ? Math.PI : 0;
        placeModelOnFloor(instance, {
          x: (column - 1) * stepX,
          z: row * stepZ + 1.0,
          scale: moduleScale,
          rotationY
        });
        group.add(instance);
      }
    }

    const exitPortal=buildProceduralSignalPortal(group,12.15,0,17.78,Math.PI);
    this.portalSignalBars=exitPortal.bars;
    this.portalSignalLight=exitPortal.light;
    this.poolroomsExitCard = this._addSign(group, {
      x: 10.15, y: 1.8, z: 17.48, rotationY: Math.PI,
      width: 1.4, height: 0.76,
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
