import * as THREE from "three";
import { World, EYE } from "./world.js";
import { Player } from "./player.js";
import { HorrorAudio } from "./audio.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const seedParam=new URLSearchParams(location.search).get("seed");
const SEED=seedParam!==null&&seedParam!==""?(parseInt(seedParam,10)||0):1337;

const container=document.getElementById("app");
const overlay=document.getElementById("overlay");
const prompt=document.getElementById("prompt");
const crosshair=document.getElementById("crosshair");
const controls=document.getElementById("controlsPanel");
const staminaBar=document.getElementById("staminaBar");
const staminaValue=document.getElementById("staminaValue");
const batteryBar=document.getElementById("batteryBar");
const batteryValue=document.getElementById("batteryValue");
const eventText=document.getElementById("event");
const objective=document.getElementById("objective");
const vignette=document.getElementById("vignette");
const phone=document.getElementById("phone");
const phoneDepth=document.getElementById("phoneDepth");
const phoneCardText=document.getElementById("phoneCardText");
const phoneStory=document.getElementById("phoneStory");
const deepseekerIcon=document.getElementById("deepseekerIcon");
const phoneHome=document.getElementById("phoneHome");


const gltfLoader=new GLTFLoader();
const dracoLoader=new DRACOLoader();
dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/gltf/");
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.08;
renderer.outputColorSpace=THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x000100);
scene.fog=new THREE.Fog(0x030302,14,62);

const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.08,300);
const world=new World(scene,SEED,renderer.capabilities.getMaxAnisotropy());

const hemi=new THREE.HemisphereLight(0xc2b889,0x211d12,.08);
scene.add(hemi);
const ambient=new THREE.AmbientLight(0x8f815d,.02);
scene.add(ambient);

const playerLight=new THREE.PointLight(0xb59b68,2.0,24,1.9);
scene.add(playerLight);

const flashlight=new THREE.SpotLight(0xf0dfad,27,60,Math.PI/6,.82,1.5);
flashlight.castShadow=true;
flashlight.shadow.mapSize.set(512,512);
flashlight.target.position.set(0,0,-60);
camera.add(flashlight);
camera.add(flashlight.target);
scene.add(camera);

const player=new Player(camera,renderer.domElement,world);
const audio=new HorrorAudio();

player.hands.visible=true;

// ---------------------------------------------------------------------------
// Test house level
// ---------------------------------------------------------------------------
// The imported house is a separate playable test level. The procedural world
// remains untouched; entering the house swaps the visible level cleanly.
const HOUSE_MODEL_PATH="./assets/house_fully_furnished.glb";
const HOUSE_MODEL_SCALE=4.0;
const HOUSE_LEVEL_ORIGIN=new THREE.Vector3(32,0,0);
const HOUSE_ENTRY_PAD=new THREE.Vector3(32,1.0,27);

let houseModel=null;
let houseLoaded=false;
let houseMode=false;
let houseSpawn=new THREE.Vector3(HOUSE_LEVEL_ORIGIN.x,EYE,HOUSE_LEVEL_ORIGIN.z);
const houseCollisionBoxes=[];

const houseReturnPortal=new THREE.Group();
houseReturnPortal.name="HouseReturnPortal";
const portalBody=new THREE.Mesh(
  new THREE.BoxGeometry(1.1,2.0,.28),
  new THREE.MeshStandardMaterial({
    color:0xd7b85f,
    emissive:0x8f6916,
    emissiveIntensity:3.5,
    roughness:.45
  })
);
const portalRing=new THREE.Mesh(
  new THREE.TorusGeometry(.82,.065,10,32),
  new THREE.MeshBasicMaterial({color:0xffdc70})
);
portalRing.rotation.x=Math.PI/2;
portalRing.position.y=-.78;
houseReturnPortal.add(portalBody,portalRing);
houseReturnPortal.visible=false;
scene.add(houseReturnPortal);

const houseEntryPortal=new THREE.Group();
houseEntryPortal.name="HouseEntryPortal";
houseEntryPortal.add(portalBody.clone(),portalRing.clone());
houseEntryPortal.position.copy(HOUSE_ENTRY_PAD);
scene.add(houseEntryPortal);

const entryLight=new THREE.PointLight(0xc6a85c,3.5,7,2);
entryLight.position.set(HOUSE_ENTRY_PAD.x,HOUSE_ENTRY_PAD.y+.5,HOUSE_ENTRY_PAD.z-.4);
scene.add(entryLight);

const houseFill=new THREE.HemisphereLight(0xffe9c5,0x3b342b,1.25);
houseFill.visible=false;
scene.add(houseFill);

const houseLamp=new THREE.PointLight(0xffe6b0,1.4,18,1.8);
houseLamp.visible=false;
scene.add(houseLamp);

const houseFloor=new THREE.Mesh(
  new THREE.PlaneGeometry(36,36),
  new THREE.MeshStandardMaterial({color:0x11100d,roughness:1})
);
houseFloor.rotation.x=-Math.PI/2;
houseFloor.position.set(HOUSE_LEVEL_ORIGIN.x,-.02,HOUSE_LEVEL_ORIGIN.z);
houseFloor.visible=false;
scene.add(houseFloor);

function boxContainsPlayer(box,x,z,r=.42){
  const nx=Math.max(box.min.x,Math.min(x,box.max.x));
  const nz=Math.max(box.min.z,Math.min(z,box.max.z));
  const dx=x-nx;
  const dz=z-nz;
  return dx*dx+dz*dz<r*r;
}

function estimateHouseFloorY(x,z,bounds){
  const floors=[];
  houseModel.traverse((obj)=>{
    if(!obj.isMesh) return;
    const b=new THREE.Box3().setFromObject(obj);
    const size=b.getSize(new THREE.Vector3());
    if(size.y>.5) return;
    if(size.x<2.5 || size.z<2.5) return;
    if(x<b.min.x-.25 || x>b.max.x+.25 || z<b.min.z-.25 || z>b.max.z+.25) return;
    floors.push(b.max.y);
  });
  return floors.length ? Math.min(...floors) : bounds.min.y;
}

function findHouseSpawn(bounds){
  const center=bounds.getCenter(new THREE.Vector3());

  for(let radius=1;radius<12;radius+=1.5){
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI/6){
      const x=center.x+Math.cos(angle)*radius;
      const z=center.z+Math.sin(angle)*radius;
      const y=estimateHouseFloorY(x,z,bounds)+EYE;
      let blocked=false;
      for(const box of houseCollisionBoxes){
        if(boxContainsPlayer(box,x,z)) { blocked=true; break; }
      }
      if(!blocked && Number.isFinite(y)) return new THREE.Vector3(x,y,z);
    }
  }

  return new THREE.Vector3(center.x,estimateHouseFloorY(center.x,center.z,bounds)+EYE,center.z);
}

function loadHouse(){
  const houseUrl=new URL(HOUSE_MODEL_PATH,import.meta.url).href;
  gltfLoader.load(
    houseUrl,
    (gltf)=>{
      houseModel=gltf.scene;
      houseModel.name="DeepSeekerHouse";
      houseModel.scale.setScalar(HOUSE_MODEL_SCALE);
      houseModel.visible=false;
      scene.add(houseModel);

      let meshCount=0;
      houseModel.traverse((obj)=>{
        if(!obj.isMesh) return;
        meshCount++;
        obj.castShadow=false;
        obj.receiveShadow=false;
        obj.frustumCulled=true;
        const materials=Array.isArray(obj.material)?obj.material:[obj.material];
        for(const material of materials){
          if(material){
            material.side=THREE.DoubleSide;
            material.toneMapped=true;
          }
        }
      });

      if(!meshCount) throw new Error("House GLB contains no meshes.");

      houseModel.updateMatrixWorld(true);
      let bounds=new THREE.Box3().setFromObject(houseModel);
      const center=bounds.getCenter(new THREE.Vector3());

      // Only the imported GLB is scaled/translated here.
      houseModel.position.x=HOUSE_LEVEL_ORIGIN.x-center.x;
      houseModel.position.z=HOUSE_LEVEL_ORIGIN.z-center.z;
      houseModel.position.y=-bounds.min.y;
      houseModel.updateMatrixWorld(true);
      bounds=new THREE.Box3().setFromObject(houseModel);

      const candidates=[];
      houseModel.traverse((obj)=>{
        if(!obj.isMesh) return;
        const b=new THREE.Box3().setFromObject(obj);
        const size=b.getSize(new THREE.Vector3());
        if(size.y<.18 || size.x<.25 || size.z<.25) return;
        if(size.x>45 && size.z>45) return;
        candidates.push({box:b,volume:size.x*size.y*size.z});
      });
      candidates.sort((a,b)=>b.volume-a.volume);
      houseCollisionBoxes.length=0;
      for(let i=0;i<Math.min(70,candidates.length);i++) houseCollisionBoxes.push(candidates[i].box);

      houseSpawn=findHouseSpawn(bounds);

      // The return portal lives inside the imported house.
      houseReturnPortal.position.set(
        houseSpawn.x,
        houseSpawn.y-EYE+.05,
        houseSpawn.z+2.3
      );

      houseLamp.position.set(
        houseSpawn.x,
        houseSpawn.y+2.4,
        houseSpawn.z
      );

      houseLoaded=true;
      objective.textContent="House ready. Walk to the yellow portal and press E.";
      eventText.textContent="HOUSE TEST LEVEL READY";
      eventText.style.opacity="1";
      setTimeout(()=>eventText.style.opacity="0",1800);
    },
    xhr=>{
      objective.textContent=xhr.total
        ? "Loading house asset… "+Math.round(xhr.loaded/xhr.total*100)+"%"
        : "Loading house asset…";
    },
    error=>{
      console.error("Failed to load house:",houseUrl,error);
      objective.textContent="House failed to load — check the browser console.";
      eventText.textContent="HOUSE LOAD FAILED";
      eventText.style.opacity="1";
    }
  );
}

function setHouseMode(enabled){
  if(enabled && !houseLoaded) return;
  houseMode=enabled;

  world.root.visible=!houseMode;
  houseEntryPortal.visible=!houseMode;
  entryLight.visible=!houseMode;

  if(houseModel) houseModel.visible=houseMode;
  houseReturnPortal.visible=houseMode;
  houseFloor.visible=houseMode;
  houseFill.visible=houseMode;
  houseLamp.visible=houseMode;

  player.ignoreWorldCollision=houseMode;
  player.extraCollisionBoxes=houseMode ? houseCollisionBoxes : [];

  figure.visible=false;
  figureLife=0;

  if(houseMode){
    player.pos.set(houseSpawn.x,houseSpawn.y-EYE,houseSpawn.z);
    player.vel.x=0;
    player.vel.z=0;
    player.jumpY=0;
    player.jumpVelocity=0;
    objective.textContent="Explore the house. Press E at the glowing portal to return.";
    eventText.textContent="HOUSE";
    eventText.style.opacity="1";
    setTimeout(()=>eventText.style.opacity="0",1200);
  }else{
    player.pos.set(32,EYE,32);
    player.vel.x=0;
    player.vel.z=0;
    player.jumpY=0;
    player.jumpVelocity=0;
    objective.textContent=STORY[storyStage].objective;
  }
}

function tryHouseTeleport(){
  if(!houseLoaded){
    eventText.textContent="HOUSE STILL LOADING...";
    eventText.style.opacity="1";
    setTimeout(()=>eventText.style.opacity="0",900);
    return;
  }

  if(houseMode){
    const d=Math.hypot(
      player.pos.x-houseReturnPortal.position.x,
      player.pos.z-houseReturnPortal.position.z
    );
    if(d<2.8) setHouseMode(false);
    return;
  }

  const d=Math.hypot(
    player.pos.x-houseEntryPortal.position.x,
    player.pos.z-houseEntryPortal.position.z
  );
  if(d<3.0) setHouseMode(true);
}

loadHouse();

const figure=new THREE.Group();
figure.name="BackroomsBacteriaEntity";
figure.visible=false;
scene.add(figure);

const fallbackFigure=new THREE.Group();
const figureMat=new THREE.MeshStandardMaterial({color:0x020202,roughness:1,metalness:0});
const figureBody=new THREE.Mesh(new THREE.CapsuleGeometry(.28,.95,6,10),figureMat);
figureBody.position.y=1.05;
const figureHead=new THREE.Mesh(new THREE.SphereGeometry(.24,10,8),figureMat);
figureHead.position.y=1.85;
fallbackFigure.add(figureBody,figureHead);
fallbackFigure.visible=false;
figure.add(fallbackFigure);

let bacteriaLoaded=false;
const bacteriaModels=new Map();
const bacteriaMixers=new Map();
let bacteriaState="";
let generatedBacteriaFailures=0;
const debugSpawnBacteria=false;

function fitBacteriaModel(model){
  model.traverse((obj)=>{
    if(!obj.isMesh) return;
    obj.frustumCulled=false;
    obj.castShadow=true;
    obj.receiveShadow=true;
  });

  const box=new THREE.Box3().setFromObject(model);
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  const targetHeight=6.2;
  const scale=targetHeight/Math.max(size.y,0.001);

  model.position.set(
    -center.x*scale,
    -box.min.y*scale,
    -center.z*scale
  );
  model.scale.set(scale*1.65,scale,scale*1.65);
}

function setBacteriaAnimation(name){
  const actualName=bacteriaModels.has(name)
    ? name
    : bacteriaModels.has("idle")
      ? "idle"
      : bacteriaModels.keys().next().value;

  if(!actualName || bacteriaState===actualName) return;

  const entry=bacteriaModels.get(actualName);
  if(!entry) return;

  for(const [key,item] of bacteriaModels){
    item.model.visible=key===actualName;
  }

  for(const [key,mixer] of bacteriaMixers){
    const action=mixer._bacteriaAction;
    if(!action) continue;
    if(key===actualName){
      action.reset();
      action.play();
    }else{
      action.stop();
    }
  }

  bacteriaState=actualName;
}

function spawnBacteriaAtPlayer(){
  const dx=-Math.sin(player.yaw);
  const dz=-Math.cos(player.yaw);
  figure.position.set(
    player.pos.x+dx*5,
    0,
    player.pos.z+dz*5
  );
  figure.rotation.y=player.yaw+Math.PI;
  figureLife=Infinity;
  figure.visible=true;
  setBacteriaAnimation("stalk");
}

function loadStaticFallback(){
  const fallbackLoader=new GLTFLoader();
  fallbackLoader.load(
    "./assets/backrooms_bacteria_rigged_3d_model_unofficial.glb",
    (gltf)=>{
      const model=gltf.scene;
      model.name="BacteriaModelFallback";
      fitBacteriaModel(model);
      figure.add(model);
      bacteriaLoaded=true;
      fallbackFigure.visible=false;

      if(debugSpawnBacteria) spawnBacteriaAtPlayer();

      eventText.textContent="BACTERIA STATIC FALLBACK";
      eventText.style.opacity="1";
      setTimeout(()=>{eventText.style.opacity="0";},2200);
    },
    undefined,
    ()=>{
      fallbackFigure.visible=true;
      const dx=-Math.sin(player.yaw);
      const dz=-Math.cos(player.yaw);
      figure.position.set(player.pos.x+dx*5,0,player.pos.z+dz*5);
      figure.rotation.y=player.yaw+Math.PI;
      figureLife=Infinity;
      figure.visible=true;
      eventText.textContent="BACTERIA LOAD FAILED";
      eventText.style.opacity="1";
    }
  );
}

const bacteriaLoader=new GLTFLoader();
const bacteriaAnimationPaths={
  idle:"./assets/bacteria/generated/bacteria_idle.glb",
  stalk:"./assets/bacteria/generated/bacteria_stalk.glb",
  chase:"./assets/bacteria/generated/bacteria_chase.glb",
  attack:"./assets/bacteria/generated/bacteria_attack.glb"
};

for(const [name,path] of Object.entries(bacteriaAnimationPaths)){
  bacteriaLoader.load(
    path,
    (gltf)=>{
      const model=gltf.scene;
      model.name="BacteriaModel_"+name;
      fitBacteriaModel(model);
      model.visible=false;
      figure.add(model);

      const mixer=new THREE.AnimationMixer(model);
      const clip=gltf.animations?.[0];
      if(clip){
        const action=mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat,Infinity);
        mixer._bacteriaAction=action;
        bacteriaMixers.set(name,mixer);
      }

      bacteriaModels.set(name,{model,gltf});
      bacteriaLoaded=true;

      if(name==="stalk"){
        setBacteriaAnimation("stalk");
        if(debugSpawnBacteria) spawnBacteriaAtPlayer();
      }else if(!bacteriaState){
        setBacteriaAnimation("idle");
      }

      if(bacteriaModels.size===Object.keys(bacteriaAnimationPaths).length){
        eventText.textContent="BACTERIA ANIMATIONS READY";
        eventText.style.opacity="1";
        setTimeout(()=>{eventText.style.opacity="0";},2200);
      }
    },
    undefined,
    ()=>{
      generatedBacteriaFailures++;
      if(generatedBacteriaFailures===Object.keys(bacteriaAnimationPaths).length){
        loadStaticFallback();
      }
    }
  );
}
let figureLife=0;
player.onStep=({intensity})=>audio.step(intensity);

let flashlightOn=true;
let battery=100;
let controlsOpen=false;
let pulse=0;
let nextEvent=24+Math.random()*16;
let eventCooldown=0;
let muted=false;
let phoneOpen=false;

let deepseekerAppOpen=false;
let storyStage=0;
let maxStoryDistance=0;

const STORY = [
  {
    distance: 0,
    depth: 0,
    title: "NOCLIP",
    text: "You fell through the floor. The carpet is wet. The lights will not stop buzzing.",
    objective: "Find a way out."
  },
  {
    distance: 45,
    depth: 0,
    title: "M — ENTRY 01",
    text: "If you found this, you're probably where I was. Don't panic. Keep moving. There are no doors where you think there should be.",
    objective: "Follow the trail. Stay in the light."
  },
  {
    distance: 90,
    depth: 1,
    title: "M — ENTRY 02",
    text: "I tried to map the place. Every time I turned around, the corridors were different. I think the building knows when we're looking.",
    objective: "Keep exploring. Do not stay in one place."
  },
  {
    distance: 150,
    depth: 1,
    title: "M — ENTRY 03",
    text: "Don't trust the levels. I found the same room three times today, but none of them had the same exit.",
    objective: "Something is wrong with the layout."
  },
  {
    distance: 230,
    depth: 2,
    title: "M — ENTRY 04",
    text: "If you see someone who looks like you, don't follow them. I made that mistake once.",
    objective: "If you see someone, keep your distance."
  },
  {
    distance: 330,
    depth: 3,
    title: "DEEPSEEKER FILE 01",
    text: "Found a record with the name DEEPSEEKER. They weren't trying to escape. They were going deeper on purpose.",
    objective: "Find out what the DeepSeeker was looking for."
  },
  {
    distance: 450,
    depth: 4,
    title: "M — ENTRY 05",
    text: "We're close. I can hear something underneath the walls. The others want to turn back. I don't think there is a way back anymore.",
    objective: "Keep going deeper."
  },
  {
    distance: 600,
    depth: 5,
    title: "M — FINAL ENTRY",
    text: "We found the bottom. You are not following my trail. I'm following yours.",
    objective: "Find the bottom."
  }
];



function renderStoryLog(){
  const unlocked=STORY.slice(0,storyStage+1);
  phoneStory.innerHTML=unlocked.map(entry=>`
    <div class="storyEntry">
      <div class="storyMeta">${entry.title} · DEPTH ${entry.depth}</div>
      <div class="storyText">${entry.text}</div>
    </div>
  `).join("");
}

function applyStoryStage(index, announce=true){
  storyStage=index;
  const entry=STORY[storyStage];
  phoneDepth.textContent=String(entry.depth);
  phoneCardText.textContent=entry.objective;
  objective.textContent=entry.objective;
  renderStoryLog();

  if(announce && storyStage>0){
    eventText.textContent=entry.title==="DEEPSEEKER FILE 01" ? "NEW DEEPSEEKER FILE" : "NEW MESSAGE FROM M";
    eventText.style.opacity="1";
    setTimeout(()=>{eventText.style.opacity="0";},2200);
  }
}

function updateStoryProgress(){
  const dx=player.pos.x-32;
  const dz=player.pos.z-32;
  maxStoryDistance=Math.max(maxStoryDistance,Math.hypot(dx,dz));

  let nextStage=storyStage;
  while(nextStage+1<STORY.length && maxStoryDistance>=STORY[nextStage+1].distance){
    nextStage++;
  }
  if(nextStage!==storyStage){
    applyStoryStage(nextStage,true);
  }
}

function toggleFlashlight(){
  flashlightOn=!flashlightOn;
}
function togglePhone(){
  phoneOpen=!phoneOpen;
  deepseekerAppOpen=false;
  phone.classList.toggle("open",phoneOpen);
  phone.classList.remove("app-open");
  phone.setAttribute("aria-hidden",String(!phoneOpen));

  if(phoneOpen){
    if(document.pointerLockElement===renderer.domElement) document.exitPointerLock();
    crosshair.style.display="none";
    phoneDepth.textContent=String(STORY[storyStage].depth);
    phoneCardText.textContent=STORY[storyStage].objective;
    renderStoryLog();
  }else if(!controlsOpen){
    player.lock();
  }
}

function openDeepSeekerApp(){
  if(!phoneOpen) return;
  deepseekerAppOpen=true;
  phone.classList.add("app-open");
}

deepseekerIcon.addEventListener("click",openDeepSeekerApp);
phoneHome.addEventListener("click",()=>{
  if(!phoneOpen) return;
  deepseekerAppOpen=false;
  phone.classList.remove("app-open");
});


function showControls(){
  controlsOpen=true;
  controls.classList.remove("hidden");
  if(document.pointerLockElement===renderer.domElement) document.exitPointerLock();
}
function hideControls(){
  controlsOpen=false;
  controls.classList.add("hidden");
}

function newSeed(){
  const seed=Math.floor(Math.random()*2147483647);
  location.href=location.pathname+"?seed="+seed;
}

player.attach();
applyStoryStage(0,false);

overlay.addEventListener("click",()=>{
  audio.start();
  player.lock();
});

renderer.domElement.addEventListener("click",()=>{
  if(!phoneOpen && !controlsOpen && document.pointerLockElement!==renderer.domElement){
    audio.start();
    player.lock();
  }
});

controls.addEventListener("click",e=>{
  if(e.target===controls) hideControls();
});

document.addEventListener("pointerlockchange",()=>{
  const locked=document.pointerLockElement===renderer.domElement;
  if(!controlsOpen && !phoneOpen) overlay.classList.toggle("hidden",locked);
  crosshair.style.display=locked?"block":"none";
  prompt.textContent="CLICK TO RESUME";
  if(locked && phoneOpen){
    phoneOpen=false;
    deepseekerAppOpen=false;
    phone.classList.remove("open","app-open");
    phone.setAttribute("aria-hidden","true");
  }
});

document.addEventListener("keydown",e=>{
  if(e.code==="KeyE" && !e.repeat && !phoneOpen && !controlsOpen){
    tryHouseTeleport();
    return;
  }
  if(e.code==="KeyF" && !phoneOpen && !controlsOpen) toggleFlashlight();
  else if(e.code==="KeyM" && !phoneOpen && !controlsOpen){ muted=audio.toggleMute(); }
  else if(e.code==="KeyN" && !phoneOpen && !controlsOpen){ newSeed(); }
  else if(e.code==="KeyP" && !e.repeat){
    if(controlsOpen) hideControls();
    else togglePhone();
  }else if(e.code==="Tab"){
    e.preventDefault();
    if(phoneOpen) return;
    controlsOpen?hideControls():showControls();
  }
});

function triggerEvent(){
  eventCooldown=3.5;
  pulse=1;
  figureLife=1.25;
  const dx=-Math.sin(player.yaw), dz=-Math.cos(player.yaw);
  const side=Math.random()>.5?1:-1;
  figure.position.set(
    player.pos.x + dx*(9+Math.random()*7) + Math.cos(player.yaw)*side*2.5,
    0,
    player.pos.z + dz*(9+Math.random()*7) - Math.sin(player.yaw)*side*2.5
  );
  figure.rotation.y=player.yaw+Math.PI;
  figure.visible=true;
  audio.scare();
  objective.textContent=Math.random()>.5 ? "Something moved nearby." : "The lights don't feel right.";
  eventText.textContent=Math.random()>.5 ? "DID YOU HEAR THAT?" : "THE LIGHTS ARE FLICKERING";
  eventText.style.opacity="1";
  setTimeout(()=>{
    eventText.style.opacity="0";
    objective.textContent=STORY[storyStage].objective;
  },1800);
}

addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05);
  const t=clock.elapsedTime;

  if(houseMode){
    for(const item of houseLights){
      const flicker=0.78+0.18*Math.sin(t*7.5+item.phase)+0.08*Math.sin(t*19.0+item.phase*1.7);
      item.light.intensity=1.2*Math.max(0.35,flicker);
    }
    housePortalGroup.rotation.y=Math.sin(t*1.4)*0.04;
    houseExitPortal.rotation.y=-Math.sin(t*1.4)*0.04;
  }else{
    housePortalGroup.rotation.y=Math.sin(t*1.4)*0.04;
  }

  player.update(dt);
  if(!houseMode) updateStoryProgress();
  world.update(player.pos.x,player.pos.z);
  world.updateFlicker(t);
  audio && audio.ctx && audio.ctx.state==="suspended" && audio.start();

  if(flashlightOn && battery>0){
    battery=Math.max(0,battery-dt*.30);
  }else{
    battery=Math.min(100,battery+dt*2.0);
  }
  if(battery<=0) flashlightOn=false;

  const flicker=.78+.22*Math.sin(t*17.1)*Math.sin(t*7.3);
  flashlight.intensity=flashlightOn ? 27.0*flicker : 0;
  playerLight.position.set(player.pos.x,EYE+.35,player.pos.z);

  for(const mixer of bacteriaMixers.values()){
    mixer.update(dt);
  }

  if(Number.isFinite(figureLife) && figureLife>0 && bacteriaLoaded){
    const elapsed=1.25-figureLife;
    if(elapsed<0.28) setBacteriaAnimation("stalk");
    else if(elapsed<0.72) setBacteriaAnimation("chase");
    else setBacteriaAnimation("attack");
  }

  if(figureLife>0){
    if (Number.isFinite(figureLife)) figureLife=Math.max(0,figureLife-dt);
    figure.visible=true;
    const fade=!Number.isFinite(figureLife) ? 1 : (figureLife>0.85 ? 1 : figureLife/0.85);
    if(bacteriaLoaded){
      for(const child of figure.children){
        if(child===fallbackFigure) continue;
        child.traverse((obj)=>{
          if(!obj.isMesh || !obj.material) return;
          const mats=Array.isArray(obj.material)?obj.material:[obj.material];
          for(const mat of mats){
            if(!mat) continue;
            mat.transparent=fade<1;
            mat.opacity=fade;
          }
        });
      }
    }
    fallbackFigure.visible=!bacteriaLoaded && fade>0.01;
    fallbackFigure.scale.setScalar(.96 + .08*Math.sin(t*12));
    figure.rotation.y=figure.rotation.y;
  }else{
    figure.visible=false;
    fallbackFigure.visible=false;
  }

  if(eventCooldown>0) eventCooldown-=dt;
  if(!houseMode && eventCooldown<=0 && t>nextEvent){
    triggerEvent();
    nextEvent=t+28+Math.random()*35;
  }

  if(pulse>0){
    pulse=Math.max(0,pulse-dt*2.8);
    vignette.style.opacity=String(.70+.07*pulse);
    camera.position.x+=Math.sin(t*70)*pulse*.008;
    camera.position.y+=Math.sin(t*61)*pulse*.006;
    hemi.intensity=.13*(1-pulse*.55);
    ambient.intensity=.045*(1-pulse*.65);
  }else{
    vignette.style.opacity=".70";
    hemi.intensity=.08;
    ambient.intensity=.02;
  }

  const stamina=player.stamina;
  staminaBar.style.width=stamina+"%";
  staminaValue.textContent=Math.round(stamina);
  batteryBar.style.width=battery+"%";
  batteryValue.textContent=Math.round(battery)+"%";
  batteryBar.style.opacity=flashlightOn?1:.45;

  renderer.render(scene,camera);
}
animate();

window.__deepseeker={
  player,
  world,
  camera,
  renderer,
  seed:SEED,
  house:{model:()=>houseModel,spawn:()=>houseSpawn,active:()=>houseMode,toggle:()=>setHouseMode(!houseMode)}
};
