import * as THREE from "three";
import { World, EYE } from "./world.js";
import { Player } from "./player.js";
import { HorrorAudio } from "./audio.js";
import { Multiplayer } from "./multiplayer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { Octree } from "three/addons/math/Octree.js";

const seedParam=new URLSearchParams(location.search).get("seed");
const SEED=seedParam!==null&&seedParam!==""?(parseInt(seedParam,10)||0):1337;

const container=document.getElementById("app");
const overlay=document.getElementById("overlay");
const loadingScreen=document.getElementById("loadingScreen");
const homeScreen=document.getElementById("homeScreen");
const lobbyScreen=document.getElementById("lobbyScreen");
const prompt=document.getElementById("prompt");
const newGameButton=document.getElementById("newGameButton");
const continueButton=document.getElementById("continueButton");
const createLobbyButton=document.getElementById("createLobbyButton");
const joinLobbyButton=document.getElementById("joinLobbyButton");
const saveInfo=document.getElementById("saveInfo");
const lobbyModeTitle=document.getElementById("lobbyModeTitle");
const roomCode=document.getElementById("roomCode");
const lobbyPlayers=document.getElementById("lobbyPlayers");
const lobbySlots=document.getElementById("lobbySlots");
const lobbyHostBadge=document.getElementById("lobbyHostBadge");
const startLobbyButton=document.getElementById("startLobbyButton");
const copyLobbyButton=document.getElementById("copyLobbyButton");
const leaveLobbyButton=document.getElementById("leaveLobbyButton");
const saveGameButton=document.getElementById("saveGameButton");
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

const BASE_PIXEL_RATIO=Math.min(devicePixelRatio,1.25);
let currentPixelRatio=BASE_PIXEL_RATIO;
let perfElapsed=0;
let perfFrames=0;
let perfCooldown=0;
renderer.setPixelRatio(currentPixelRatio);
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

const flashlight=new THREE.SpotLight(0xf0dfad,30,60,Math.PI/5.5,.88,1.5);
const ENABLE_SHADOWS=new URLSearchParams(location.search).get("shadows")==="1";
flashlight.castShadow=ENABLE_SHADOWS;
if(ENABLE_SHADOWS) flashlight.shadow.mapSize.set(256,256);
flashlight.target.position.set(0,0,-60);
camera.add(flashlight);
camera.add(flashlight.target);
scene.add(camera);

const player=new Player(camera,renderer.domElement,world);
const audio=new HorrorAudio();

player.hands.visible=true;

// ---------------------------------------------------------------------------
// House level — the GLB itself is the level.
// ---------------------------------------------------------------------------
const HOUSE_MODEL_PATH="./assets/house_interior.glb";
const HOUSE_TARGET_HEIGHT=7.2;
const HOUSE_TEST_PORTAL_POSITION=new THREE.Vector3(32,1.0,27);

let houseModel=null;
let houseLoaded=false;
let houseMode=false;
let houseSpawn=new THREE.Vector3(0,EYE,0);
let houseLoadFailed=false;
let houseLoadStarted=false;
let houseCollisionReady=false;
let houseCollisionBuildStarted=false;
const houseCollisionBoxes=[];
const houseRenderMeshes=[];
let houseCullTimer=0;
let gameStarted=false;
let lastAutoSave=0;
let pendingSaveLoad=null;

const SAVE_KEY="deepseeker-save-v1";

function getSavedGame(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch{
    return null;
  }
}

function refreshSaveInfo(){
  const save=getSavedGame();
  if(!save){
    saveInfo.textContent="NO SAVE DATA";
    continueButton.disabled=true;
    continueButton.style.opacity=".45";
    return;
  }

  const when=save.savedAt ? new Date(save.savedAt).toLocaleString() : "UNKNOWN";
  saveInfo.textContent=`SAVE FOUND · ${when}`;
  continueButton.disabled=false;
  continueButton.style.opacity="1";
}

function saveGame(){
  const data={
    version:1,
    seed:SEED,
    savedAt:Date.now(),
    x:player.pos.x,
    z:player.pos.z,
    yaw:player.yaw,
    pitch:player.pitch,
    storyStage,
    maxStoryDistance,
    battery,
    flashlightOn,
    houseMode
  };

  try{
    localStorage.setItem(SAVE_KEY,JSON.stringify(data));
    refreshSaveInfo();
    eventText.textContent="GAME SAVED";
    eventText.style.opacity="1";
    setTimeout(()=>{
      if(eventText.textContent==="GAME SAVED") eventText.style.opacity="0";
    },1100);
  }catch(error){
    console.error("Save failed:",error);
    eventText.textContent="SAVE FAILED";
    eventText.style.opacity="1";
  }
}

function applySavedGame(data){
  if(!data) return;

  player.pos.set(
    Number.isFinite(data.x)?data.x:32,
    EYE,
    Number.isFinite(data.z)?data.z:32
  );
  player.yaw=Number.isFinite(data.yaw)?data.yaw:0;
  player.pitch=Number.isFinite(data.pitch)?data.pitch:0;
  player.vel.set(0,0,0);
  player.jumpY=0;
  player.jumpVelocity=0;

  battery=Number.isFinite(data.battery)?THREE.MathUtils.clamp(data.battery,0,100):100;
  flashlightOn=data.flashlightOn!==false;
  player.setFlashlightVisual(flashlightOn);

  const stage=Number.isInteger(data.storyStage)
    ?THREE.MathUtils.clamp(data.storyStage,0,STORY.length-1)
    :0;
  maxStoryDistance=Number.isFinite(data.maxStoryDistance)?data.maxStoryDistance:0;
  applyStoryStage(stage,false);

  if(data.houseMode && houseLoaded){
    setHouseMode(true);
  }else{
    setHouseMode(false);
  }
}

function showHomeScreen(){
  loadingScreen.style.display="none";
  homeScreen.classList.remove("hidden");
  lobbyScreen.classList.add("hidden");
  refreshSaveInfo();
}

function showLobbyScreen(){
  loadingScreen.style.display="none";
  homeScreen.classList.add("hidden");
  lobbyScreen.classList.remove("hidden");

  const params=new URLSearchParams(location.search);
  const code=(params.get("room")||"").toUpperCase();
  const host=params.get("host")==="1";
  roomCode.textContent=code||"------";
  lobbyModeTitle.textContent=host?"CREATE LOBBY":"JOIN LOBBY";
  startLobbyButton.textContent=host?"START GAME":"READY / START";
  startLobbyButton.style.display="block";
}

function ensureHouseLoading(){
  if(houseLoadStarted || houseLoaded || houseLoadFailed) return;

  houseLoadStarted=true;
  const start=()=>loadHouse();

  if("requestIdleCallback" in window){
    window.requestIdleCallback(start,{timeout:3500});
  }else{
    setTimeout(start,1200);
  }
}

function startGame(save=null){
  gameStarted=true;
  overlay.classList.add("hidden");
  audio.start();
  ensureHouseLoading();
  if(save) applySavedGame(save);
  player.lock();
}

function continueGame(){
  const save=getSavedGame();
  if(!save) return;

  if(save.seed!==SEED){
    const params=new URLSearchParams(location.search);
    params.set("seed",String(save.seed));
    params.delete("save");
    location.href=location.pathname+"?"+params.toString()+"&save=1";
    return;
  }

  startGame(save);
}

function resetForNewGame(){
  player.pos.set(32,EYE,32);
  player.yaw=0;
  player.pitch=0;
  player.vel.set(0,0,0);
  battery=100;
  flashlightOn=true;
  player.setFlashlightVisual(true);
  maxStoryDistance=0;
  setHouseMode(false);
  applyStoryStage(0,false);
  startGame();
}

function enterLobby(code,host){
  const clean=code.trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
  if(!clean){
    eventText.textContent="INVALID ROOM CODE";
    eventText.style.opacity="1";
    return;
  }

  location.href=location.pathname+`?room=${encodeURIComponent(clean)}&lobby=1&host=${host?1:0}`;
}

const multiplayerStatus=document.getElementById("multiplayerStatus");

const multiplayer=new Multiplayer({
  scene,
  player,
  getLevel:()=>houseMode,
  onStatus:(message)=>{
    if(!message) return;
    eventText.textContent=message;
    eventText.style.opacity="1";
    if(
      message==="MULTIPLAYER CONNECTED" ||
      message==="MULTIPLAYER OFFLINE"
    ){
      setTimeout(()=>{
        if(eventText.textContent===message) eventText.style.opacity="0";
      },1800);
    }
  },
  onCount:(count,max)=>{
    multiplayerStatus.textContent="MULTIPLAYER · "+count+"/"+max;
    multiplayerStatus.style.color=count>1 ? "#d8c98a" : "#8d8b76";
    const params=new URLSearchParams(location.search);
    if(params.get("lobby")==="1"){
      lobbyPlayers.textContent="PLAYERS "+count+"/"+max;
    }
  },
  onGameStart:()=>{
    if(!gameStarted){
      startGame();
    }
  },
  onRoster:(players)=>{
    const params=new URLSearchParams(location.search);
    if(params.get("lobby")!=="1") return;

    const host=params.get("host")==="1";
    lobbyHostBadge.textContent=host ? "HOST" : "GUEST";
    startLobbyButton.textContent=host ? "START GAME" : "WAITING FOR HOST";
    startLobbyButton.disabled=!host;
    startLobbyButton.style.opacity=host ? "1" : ".45";

    const slots=[];
    for(let i=0;i<10;i++){
      const p=players[i];
      if(p){
        slots.push(`
          <div class="lobbySlot">
            <div class="lobbySlotTop">
              <div class="lobbySlotName">${p.self ? "YOU — " : ""}${String(p.name).replace(/[<>&"]/g,"").slice(0,20)}</div>
              <div class="lobbySlotStatus">${(host && i===0) ? "HOST" : (p.self ? "YOU" : "PLAYER")}</div>
            </div>
          </div>
        `);
      }else{
        slots.push(`
          <div class="lobbySlot empty">
            <div class="lobbySlotEmpty">WAITING FOR PLAYER…</div>
          </div>
        `);
      }
    }
    lobbySlots.innerHTML=slots.join("");
  }
});

const houseDoors=[];
const houseDoorPattern=/door|doors|porte|puerta|pintu/i;
const houseOctree=new Octree();

const houseRoot=new THREE.Group();
houseRoot.name="HouseWorld";
houseRoot.visible=false;
scene.add(houseRoot);

// Warm interior illumination so the house is readable without killing the horror mood.
const houseLights=new THREE.Group();
houseLights.name="HouseLighting";
houseRoot.add(houseLights);
const houseAmbient=new THREE.HemisphereLight(0xffe6b0,0x3c2818,0.48);
houseLights.add(houseAmbient);
const houseFill=new THREE.PointLight(0xffdca0,2.2,18,1.7);
houseFill.position.set(0,2.8,0);
houseLights.add(houseFill);

// Backrooms-side teleporter. The house level itself contains only the GLB.
const housePortalGroup=new THREE.Group();
housePortalGroup.name="HouseTeleport";

const housePortal=new THREE.Mesh(
  new THREE.BoxGeometry(1.15,2.2,0.32),
  new THREE.MeshStandardMaterial({
    color:0xd7b85f,
    emissive:0x8f6916,
    emissiveIntensity:4,
    roughness:.4,
    metalness:.1
  })
);

const housePortalRing=new THREE.Mesh(
  new THREE.TorusGeometry(.9,.07,10,32),
  new THREE.MeshBasicMaterial({color:0xffdc70})
);
housePortalRing.rotation.x=Math.PI/2;
housePortalRing.position.y=-.84;
housePortalGroup.add(housePortal,housePortalRing);
housePortalGroup.position.copy(HOUSE_TEST_PORTAL_POSITION);
scene.add(housePortalGroup);

const housePortalLight=new THREE.PointLight(0xc6a85c,3.5,8,2);
housePortalLight.position.set(
  HOUSE_TEST_PORTAL_POSITION.x,
  HOUSE_TEST_PORTAL_POSITION.y+.5,
  HOUSE_TEST_PORTAL_POSITION.z-.4
);
scene.add(housePortalLight);

// Return pad lives outside the model so the GLB remains the only level asset.
const houseReturnGroup=new THREE.Group();
houseReturnGroup.name="HouseReturnPad";
houseReturnGroup.visible=false;

const houseReturn=housePortal.clone();
const houseReturnLight=housePortalLight.clone();
houseReturnGroup.add(houseReturn,houseReturnLight);
scene.add(houseReturnGroup);

function attachHouseDoor(obj,index){
  const parent=obj.parent;
  if(!parent) return;

  const pivot=new THREE.Group();
  pivot.name="DoorPivot_"+(obj.name||("Door_"+index));

  obj.updateMatrixWorld(true);
  const worldMatrix=new THREE.Matrix4().copy(obj.matrixWorld);
  const worldPosition=new THREE.Vector3().setFromMatrixPosition(worldMatrix);
  const invParent=new THREE.Matrix4().copy(parent.matrixWorld).invert();

  worldPosition.applyMatrix4(invParent);
  pivot.position.copy(worldPosition);
  parent.add(pivot);
  pivot.updateMatrixWorld(true);

  const localMatrix=new THREE.Matrix4().multiplyMatrices(
    new THREE.Matrix4().copy(pivot.matrixWorld).invert(),
    worldMatrix
  );

  pivot.add(obj);
  localMatrix.decompose(obj.position,obj.quaternion,obj.scale);

  houseDoors.push({
    pivot,
    target:0,
    angle:index%2===0?Math.PI/2:-Math.PI/2,
    functional:index%4===0,
    collisionBox:{minX:0,maxX:0,minZ:0,maxZ:0}
  });
}

function setupHouseDoors(root){
  houseDoors.length=0;

  const candidates=[];
  const excluded=/window|wall|frame|cabinet|wardrobe|closet|table|chair|bed|shelf|counter|stairs?|rail|column|floor|ceiling/i;

  root.traverse((obj)=>{
    if(obj===root || !obj.isMesh) return;

    if(obj.name && houseDoorPattern.test(obj.name)){
      candidates.push(obj);
      return;
    }

    if(obj.name && excluded.test(obj.name)) return;
    if(!obj.geometry) return;

    if(!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    const box=obj.geometry.boundingBox;
    if(!box) return;

    const size=box.getSize(new THREE.Vector3());
    const vertical=size.y>=1.55 && size.y<=3.1;
    const width=Math.max(size.x,size.z);
    const depth=Math.min(size.x,size.z);

    // Generic-name fallback for common game-ready door panels.
    if(vertical && width>=.55 && width<=1.55 && depth>=.04 && depth<=.42){
      candidates.push(obj);
    }
  });

  const unique=[];
  for(const obj of candidates){
    if(!unique.includes(obj)) unique.push(obj);
  }

  unique.forEach((obj,index)=>attachHouseDoor(obj,index));

  console.log(
    "[DeepSeeker] doors found:",
    houseDoors.map((d,i)=>({
      index:i,
      name:d.pivot.name,
      functional:d.functional
    }))
  );
}
function updateHouseDoors(dt){
  for(const door of houseDoors){
    const current=door.pivot.userData.openProgress||0;
    const next=THREE.MathUtils.lerp(
      current,
      door.pivot.userData.target||0,
      Math.min(1,dt*6)
    );
    door.pivot.userData.openProgress=next;
    door.pivot.rotation.y=door.angle*next;
  }
}


function buildHouseCollisionProxies(root){
  houseCollisionBoxes.length=0;

  // The exported house GLB uses generic FrontSide/BackSide mesh names, so
  // name-based wall detection misses most of the actual architecture.
  // Build lightweight AABB collision proxies directly from the normalized
  // world-space mesh bounds instead. The model is only ~126 meshes, so this
  // stays cheap while covering walls/partitions/frames reliably.
  root.updateMatrixWorld(true);

  root.traverse((obj)=>{
    if(!obj.isMesh || !obj.geometry) return;
    if(obj.userData.houseCollisionDoor) return;

    const box=new THREE.Box3().setFromObject(obj);
    const size=box.getSize(new THREE.Vector3());

    const horizontal=Math.max(size.x,size.z);
    const vertical=size.y;

    // Ignore tiny decorative geometry. Keep anything tall enough to be a
    // wall/partition/door/furniture obstacle and anything substantial that
    // intersects the player's normal standing range.
    const tallObstacle =
      vertical >= 1.0 &&
      horizontal >= 0.45 &&
      box.max.y >= 0.45 &&
      box.min.y <= EYE + 0.25;

    const lowObstacle =
      vertical >= 0.35 &&
      horizontal >= 0.9 &&
      box.max.y >= 0.45 &&
      box.min.y <= 1.35;

    if(!tallObstacle && !lowObstacle) return;

    houseCollisionBoxes.push({
      minX:box.min.x,
      maxX:box.max.x,
      minZ:box.min.z,
      maxZ:box.max.z
    });
  });

  console.log("[DeepSeeker] house collision proxies:",houseCollisionBoxes.length);
}

function prepareHouseRenderCulling(root){
  houseRenderMeshes.length=0;
  root.traverse((obj)=>{
    if(!obj.isMesh) return;
    obj.userData.houseCullCenter=new THREE.Vector3();
    obj.getWorldPosition(obj.userData.houseCullCenter);
    obj.userData.houseCullRadius=new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).length()*0.5;
    houseRenderMeshes.push(obj);
    obj.visible=false;
  });
}

function updateHouseRenderCulling(x,z){
  const maxDistance=22;
  const candidates=[];

  for(const mesh of houseRenderMeshes){
    const p=mesh.userData.houseCullCenter;
    if(!p){
      mesh.visible=false;
      continue;
    }

    const dx=p.x-x;
    const dz=p.z-z;
    const r=mesh.userData.houseCullRadius||0;
    const distanceSq=dx*dx+dz*dz;

    if(distanceSq <= (maxDistance+r)*(maxDistance+r)){
      candidates.push({mesh,distanceSq});
    }

    mesh.visible=false;
  }

  candidates.sort((a,b)=>a.distanceSq-b.distanceSq);

  // Keep the active house draw budget bounded.
  const limit=450;
  for(let i=0;i<Math.min(limit,candidates.length);i++){
    candidates[i].mesh.visible=true;
  }
}

function updateHouseDoorCollisions(){
  const px=player.pos.x;
  const pz=player.pos.z;
  const range=6.0;
  const rangeSq=range*range;

  const boxes=houseCollisionBoxes.filter(box=>{
    const cx=(box.minX+box.maxX)*.5;
    const cz=(box.minZ+box.maxZ)*.5;
    const dx=cx-px;
    const dz=cz-pz;
    return dx*dx+dz*dz<=rangeSq;
  });

  for(const door of houseDoors){
    const open=door.pivot.userData.openProgress||0;

    // Locked doors always block. Functional doors only block while closed.
    if(door.functional && open>0.72) continue;

    door.pivot.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(door.pivot);

    // A small horizontal padding prevents squeezing through door geometry.
    const pad=.08;
    door.collisionBox.minX=box.min.x-pad;
    door.collisionBox.maxX=box.max.x+pad;
    door.collisionBox.minZ=box.min.z-pad;
    door.collisionBox.maxZ=box.max.z+pad;

    boxes.push(door.collisionBox);
  }

  player.extraCollisionBoxes=boxes;
}

function toggleHouseDoor(){
  let best=null;
  let bestDist=2.7;
  const p=player.pos;
  const wp=new THREE.Vector3();

  for(const door of houseDoors){
    door.pivot.getWorldPosition(wp);
    const d=Math.hypot(wp.x-p.x,wp.z-p.z);
    if(d<bestDist){
      best=door;
      bestDist=d;
    }
  }

  if(!best) return false;

  if(!best.functional){
    eventText.textContent="DOOR LOCKED";
    eventText.style.opacity="1";
    setTimeout(()=>{eventText.style.opacity="0";},700);
    return true;
  }

  best.pivot.userData.target=(best.pivot.userData.target||0)>0.5?0:1;
  eventText.textContent=best.pivot.userData.target ? "DOOR OPENING" : "DOOR CLOSING";
  eventText.style.opacity="1";
  setTimeout(()=>{eventText.style.opacity="0";},700);
  return true;
}

function ensureHouseCollisionSetup(){
  if(!houseLoaded || houseCollisionReady || houseCollisionBuildStarted || !houseModel) return;

  houseCollisionBuildStarted=true;
  const build=()=>{
    const started=performance.now();

    setupHouseDoors(houseModel);
    for(const door of houseDoors){
      door.pivot.traverse(obj=>{
        obj.userData.houseCollisionDoor=true;
      });
    }
    buildHouseCollisionProxies(houseModel);

    houseCollisionReady=true;
    houseCollisionBuildStarted=false;

    console.log("[DeepSeeker] house collision ready in",Math.round(performance.now()-started),"ms");

    if(gameStarted){
      eventText.textContent="HOUSE READY";
      eventText.style.opacity="1";
      setTimeout(()=>{eventText.style.opacity="0";},1000);
    }
  };

  if("requestIdleCallback" in window){
    window.requestIdleCallback(build,{timeout:2500});
  }else{
    setTimeout(build,100);
  }
}

function loadHouse(){
  const houseUrl=new URL(HOUSE_MODEL_PATH,import.meta.url).href;

  gltfLoader.load(
    houseUrl,
    (gltf)=>{
      houseModel=gltf.scene;
      houseModel.name="DeepSeekerHouse";

      // The imported model is the entire house level.
      houseRoot.add(houseModel);

      let meshCount=0;
      houseModel.traverse((obj)=>{
        if(!obj.isMesh) return;
        meshCount++;

        obj.castShadow=false;
        obj.receiveShadow=false;
        obj.frustumCulled=true;

        const materials=Array.isArray(obj.material)
          ? obj.material
          : [obj.material];

        for(const material of materials){
          if(!material) continue;
          material.side=THREE.FrontSide;
          material.toneMapped=true;
        }
      });

      if(meshCount===0){
        throw new Error("House GLB contains no meshes.");
      }

      // Normalize the actual model only:
      // centered on X/Z and sitting directly on Y=0.
      let box=new THREE.Box3().setFromObject(houseModel);
      const size=box.getSize(new THREE.Vector3());
      const scale=HOUSE_TARGET_HEIGHT/Math.max(size.y,.001);

      houseModel.scale.setScalar(scale);
      houseModel.updateMatrixWorld(true);

      box=new THREE.Box3().setFromObject(houseModel);
      const center=box.getCenter(new THREE.Vector3());

      houseModel.position.set(
        -center.x,
        -box.min.y,
        -center.z
      );
      houseModel.updateMatrixWorld(true);

      // Add a few interior lights based on the normalized house bounds.
      houseLights.clear();
      houseLights.add(houseAmbient);
      houseLights.add(houseFill);

      const houseBox=new THREE.Box3().setFromObject(houseModel);
      const houseSize=houseBox.getSize(new THREE.Vector3());
      const min=houseBox.min;
      const max=houseBox.max;

      const lightPositions=[
        new THREE.Vector3((min.x+max.x)*.5,Math.min(max.y-1.0,2.8),(min.z+max.z)*.5),
        new THREE.Vector3(min.x+houseSize.x*.22,Math.min(max.y-1.2,2.4),min.z+houseSize.z*.28),
        new THREE.Vector3(max.x-houseSize.x*.22,Math.min(max.y-1.2,2.4),min.z+houseSize.z*.72),
        new THREE.Vector3(min.x+houseSize.x*.74,Math.min(max.y-1.2,2.4),max.z-houseSize.z*.24)
      ];

      for(const position of lightPositions){
        const light=new THREE.PointLight(0xffd7a1,1.35,11,1.8);
        light.position.copy(position);
        houseLights.add(light);
      }

      // Spawn at the model's normalized center.
      houseSpawn.set(0,EYE,0);

      prepareHouseRenderCulling(houseModel);

      houseLoaded=true;
      houseLoadFailed=false;
      houseRoot.visible=false;

      // Door discovery + lightweight collision are deliberately deferred.
      // Building the Octree is one of the most expensive parts of loading
      // this level and should never block the main menu.
      ensureHouseCollisionSetup();

      if(pendingSaveLoad && pendingSaveLoad.houseMode && gameStarted){
        setHouseMode(true);
        pendingSaveLoad=null;
      }

      if(gameStarted){
        eventText.textContent="HOUSE READY";
        eventText.style.opacity="1";
        setTimeout(()=>{eventText.style.opacity="0";},1100);
      }
    },
    xhr=>{
      if(xhr.total){
        const percent=Math.min(100,Math.max(0,Math.round(xhr.loaded/xhr.total*100)));
        objective.textContent="Loading house… "+percent+"%";
        prompt.textContent="LOADING HOUSE… "+percent+"%";
      }else{
        objective.textContent="Loading house…";
        prompt.textContent="LOADING HOUSE…";
      }
    },
    error=>{
      console.error("Failed to load house:",houseUrl,error);
      houseLoaded=false;
      houseLoadFailed=true;
      houseLoadStarted=false;

      if(!gameStarted){
        eventText.textContent="HOUSE FAILED TO LOAD";
        eventText.style.opacity="1";
      }
    }
  );
}

function setHouseMode(enabled){
  if(enabled && !houseLoaded){
    ensureHouseLoading();
    eventText.textContent="HOUSE STILL LOADING...";
    eventText.style.opacity="1";
    setTimeout(()=>{eventText.style.opacity="0";},1000);
    return;
  }

  if(enabled && !houseCollisionReady){
    ensureHouseCollisionSetup();
    eventText.textContent="HOUSE PREPARING...";
    eventText.style.opacity="1";
    setTimeout(()=>{eventText.style.opacity="0";},1000);
    return;
  }

  houseMode=enabled;

  // Only switch the two level roots. The procedural Backrooms is otherwise untouched.
  world.root.visible=!houseMode;
  houseRoot.visible=houseMode;

  housePortalGroup.visible=!houseMode;
  housePortalLight.visible=!houseMode;
  houseReturnGroup.visible=houseMode;

  player.ignoreWorldCollision=houseMode;
  player.houseOctree=null;
  player.extraCollisionBoxes=[];

  figure.visible=false;
  figureLife=0;

  if(houseMode){
    renderer.setPixelRatio(Math.min(currentPixelRatio,1.0));
    flashlight.castShadow=false;
    playerLight.intensity=1.0;

    player.pos.copy(houseSpawn);
    updateHouseRenderCulling(houseSpawn.x,houseSpawn.z);
    player.vel.set(0,0,0);
    player.jumpY=0;
    player.jumpVelocity=0;

    houseReturnGroup.position.set(0,0,0);

    objective.textContent="Explore the house. Press E at the return pad.";
    eventText.textContent="HOUSE LEVEL";
    eventText.style.opacity="1";
    setTimeout(()=>{eventText.style.opacity="0";},1400);
  }else{
    renderer.setPixelRatio(currentPixelRatio);
    flashlight.castShadow=ENABLE_SHADOWS;
    playerLight.intensity=2.0;

    player.pos.set(32,EYE,32);
    player.vel.set(0,0,0);
    player.jumpY=0;
    player.jumpVelocity=0;

    houseReturnGroup.visible=false;
    objective.textContent=STORY[storyStage].objective;
  }
}

function tryHouseTeleport(){
  if(!houseLoaded){
    ensureHouseLoading();
    eventText.textContent="HOUSE STILL LOADING...";
    eventText.style.opacity="1";
    setTimeout(()=>{eventText.style.opacity="0";},1200);
    return;
  }

  if(!houseCollisionReady){
    ensureHouseCollisionSetup();
    eventText.textContent="HOUSE PREPARING...";
    eventText.style.opacity="1";
    setTimeout(()=>{eventText.style.opacity="0";},1200);
    return;
  }

  if(houseMode){
    if(toggleHouseDoor()) return;
    const d=Math.hypot(player.pos.x,player.pos.z);
    if(d<2.6) setHouseMode(false);
    return;
  }

  const d=Math.hypot(
    player.pos.x-HOUSE_TEST_PORTAL_POSITION.x,
    player.pos.z-HOUSE_TEST_PORTAL_POSITION.z
  );

  if(d<3) setHouseMode(true);
}

const initialParams=new URLSearchParams(location.search);
if(initialParams.get("save")==="1"){
  pendingSaveLoad=getSavedGame();
}

if(new URLSearchParams(location.search).get("lobby")==="1"){
  showLobbyScreen();
}else{
  showHomeScreen();
}

setTimeout(()=>ensureHouseLoading(),900);

player.hands.visible=true;


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
  player.setFlashlightVisual(flashlightOn);
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

if(saveGameButton){
  saveGameButton.addEventListener("click",()=>{
    saveGame();
  });
}

newGameButton.addEventListener("click",()=>{
  resetForNewGame();
});

continueButton.addEventListener("click",()=>{
  continueGame();
});

createLobbyButton.addEventListener("click",()=>{
  const code=Math.random().toString(36).slice(2,8).toUpperCase();
  enterLobby(code,true);
});

joinLobbyButton.addEventListener("click",()=>{
  const code=window.prompt("Enter the lobby code:");
  if(code) enterLobby(code,false);
});

startLobbyButton.addEventListener("click",()=>{
  const params=new URLSearchParams(location.search);
  if(params.get("host")!=="1") return;

  // Start the host immediately so the button can never appear dead.
  startGame();

  // Then tell everyone else in the room to start too.
  multiplayer.startGameRoom();
});

copyLobbyButton.addEventListener("click",async()=>{
  const params=new URLSearchParams(location.search);
  const code=(params.get("room")||"").toUpperCase();
  const link=location.origin+location.pathname+`?room=${encodeURIComponent(code)}&lobby=1&host=0`;

  try{
    await navigator.clipboard.writeText(link);
    copyLobbyButton.textContent="COPIED";
    setTimeout(()=>copyLobbyButton.textContent="COPY ROOM LINK",1000);
  }catch{
    window.prompt("Copy this lobby link:",link);
  }
});

leaveLobbyButton.addEventListener("click",()=>{
  location.href=location.pathname;
});

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
prompt.textContent="LOADING HOUSE…";
applyStoryStage(0,false);

overlay.addEventListener("click",(e)=>{
  if(e.target!==overlay) return;
  if(!houseLoaded){
    prompt.textContent=houseLoadFailed
      ? "HOUSE FAILED TO LOAD"
      : "PLEASE WAIT — HOUSE LOADING";
    return;
  }
  if(gameStarted){
    startGame();
  }
});

renderer.domElement.addEventListener("click",()=>{
  if(!houseLoaded) return;
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
  if(!controlsOpen && !phoneOpen){
    if(locked){
      overlay.classList.add("hidden");
    }else if(gameStarted){
      loadingScreen.style.display="flex";
      homeScreen.classList.add("hidden");
      lobbyScreen.classList.add("hidden");
      prompt.textContent="CLICK TO RESUME";
      overlay.classList.remove("hidden");
    }
  }
  crosshair.style.display=locked?"block":"none";
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

  perfElapsed+=dt;
  perfFrames++;
  perfCooldown=Math.max(0,perfCooldown-dt);

  if(perfElapsed>=0.5){
    const fps=perfFrames/perfElapsed;
    perfElapsed=0;
    perfFrames=0;

    if(perfCooldown<=0){
      let nextRatio=currentPixelRatio;

      if(fps<42){
        nextRatio=Math.max(0.8,currentPixelRatio-0.1);
      }else if(fps>58){
        nextRatio=Math.min(BASE_PIXEL_RATIO,currentPixelRatio+0.1);
      }

      if(Math.abs(nextRatio-currentPixelRatio)>=0.05){
        currentPixelRatio=Number(nextRatio.toFixed(2));
        renderer.setPixelRatio(houseMode
          ? Math.min(currentPixelRatio,1.0)
          : currentPixelRatio
        );
        perfCooldown=2.0;
      }
    }
  }

  if(houseMode){
    updateHouseDoors(dt);
    updateHouseDoorCollisions();

    houseCullTimer+=dt;
    if(houseCullTimer>=0.25){
      houseCullTimer=0;
      updateHouseRenderCulling(player.pos.x,player.pos.z);
    }
  }else{
    houseCullTimer=0;
    player.houseOctree=null;
    player.extraCollisionBoxes=[];
  }

  player.update(dt);
  multiplayer.update(dt);

  // Keep the flashlight cone exactly centered on the camera/crosshair.
  flashlight.target.position.set(0,0,-80);
  if(!houseMode) updateStoryProgress();

  if(gameStarted){
    if(t-lastAutoSave>20){
      lastAutoSave=t;
      saveGame();
    }
  }

  world.update(player.pos.x,player.pos.z);
  world.updateFlicker(t);
  audio && audio.ctx && audio.ctx.state==="suspended" && audio.start();

  if(flashlightOn && battery>0){
    battery=Math.max(0,battery-dt*.30);
  }else{
    battery=Math.min(100,battery+dt*2.0);
  }
  if(battery<=0){
    flashlightOn=false;
    player.setFlashlightVisual(false);
  }

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

window.addEventListener("beforeunload",()=>{
  if(gameStarted) saveGame();
});

if(pendingSaveLoad){
  const save=pendingSaveLoad;
  pendingSaveLoad=null;
  setTimeout(()=>startGame(save),0);
}

window.__deepseeker={
  player,
  world,
  camera,
  renderer,
  seed:SEED,
  house:{model:()=>houseModel,spawn:()=>houseSpawn,active:()=>houseMode,toggle:()=>setHouseMode(!houseMode)}
};
