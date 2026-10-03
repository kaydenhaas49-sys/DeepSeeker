import * as THREE from "three";
import { World, EYE } from "./world.js";
import { Player } from "./player.js";
import { HorrorAudio } from "./audio.js";
import { Multiplayer } from "./multiplayer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { flashlightFlicker } from "./character.js";

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
const phoneAppName=document.getElementById("phoneAppName");
const phoneDepth=document.getElementById("phoneDepth");
const phoneDepthLabel=document.getElementById("phoneDepthLabel");
const phoneCardTitle=document.getElementById("phoneCardTitle");
const phoneCardText=document.getElementById("phoneCardText");
const phoneStory=document.getElementById("phoneStory");
const deepseekerIcon=document.getElementById("deepseekerIcon");
const phoneHome=document.getElementById("phoneHome");
const houseLoadFillHome=document.getElementById("houseLoadFillHome");
const houseLoadPercentHome=document.getElementById("houseLoadPercentHome");
const houseLoadStatusHome=document.getElementById("houseLoadStatusHome");
const houseLoadFillLobby=document.getElementById("houseLoadFillLobby");
const houseLoadPercentLobby=document.getElementById("houseLoadPercentLobby");
const houseLoadStatusLobby=document.getElementById("houseLoadStatusLobby");
let menuControlsButton=null;


const gltfLoader=new GLTFLoader();
const dracoLoader=new DRACOLoader();
dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/gltf/");
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setSize(innerWidth,innerHeight);

const BASE_PIXEL_RATIO=Math.min(devicePixelRatio,1.25);
const HOUSE_PIXEL_RATIO=0.70;
const MIN_HOUSE_PIXEL_RATIO=0.52;
let currentPixelRatio=BASE_PIXEL_RATIO;
let housePixelRatio=HOUSE_PIXEL_RATIO;
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

const hemi=new THREE.HemisphereLight(0xc2b889,0x211d12,0);
scene.add(hemi);
const ambient=new THREE.AmbientLight(0x8f815d,0);
scene.add(ambient);

const playerLight=new THREE.PointLight(0xb59b68,0,24,1.9);
scene.add(playerLight);

// Dedicated title-screen camera and lighting. The actual procedural Backrooms
// remains visible behind the menu, so the title screen uses real geometry,
// textures, fog and depth instead of a flat CSS illustration.
const menuCamera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.05,160);

function makeMenuTexture(kind){
  const canvas=document.createElement("canvas");
  canvas.width=512;
  canvas.height=512;
  const ctx=canvas.getContext("2d");

  if(kind==="wall"){
    ctx.fillStyle="#a39d6b";
    ctx.fillRect(0,0,512,512);

    // Old vinyl/paper wallpaper with a very subtle repeating pattern.
    for(let x=0;x<512;x+=42){
      ctx.fillStyle="rgba(65,62,40,.10)";
      ctx.fillRect(x,0,2,512);
      ctx.fillStyle="rgba(232,225,180,.10)";
      ctx.fillRect(x+3,0,1,512);
    }
    for(let y=0;y<512;y+=58){
      ctx.fillStyle="rgba(56,53,35,.06)";
      ctx.fillRect(0,y,512,2);
    }

    for(let i=0;i<1500;i++){
      const x=Math.random()*512;
      const y=Math.random()*512;
      const tone=Math.random()>.5?"rgba(55,52,34,.10)":"rgba(237,229,182,.08)";
      ctx.fillStyle=tone;
      ctx.fillRect(x,y,1+Math.random()*2,1+Math.random()*2);
    }
  }else if(kind==="carpet"){
    ctx.fillStyle="#4d4935";
    ctx.fillRect(0,0,512,512);

    for(let i=0;i<26000;i++){
      const x=Math.random()*512;
      const y=Math.random()*512;
      const r=Math.random();
      ctx.fillStyle=r>.52
        ?"rgba(119,111,77,.13)"
        :"rgba(20,21,17,.16)";
      ctx.fillRect(x,y,1,1);
    }

    for(let y=0;y<512;y+=8){
      ctx.fillStyle="rgba(180,169,118,.025)";
      ctx.fillRect(0,y,512,1);
    }
  }else{
    ctx.fillStyle="#777560";
    ctx.fillRect(0,0,512,512);
    for(let y=0;y<512;y+=64){
      for(let x=0;x<512;x+=64){
        ctx.strokeStyle="rgba(35,35,30,.28)";
        ctx.lineWidth=3;
        ctx.strokeRect(x+1,y+1,62,62);
        ctx.fillStyle="rgba(212,205,169,.035)";
        ctx.fillRect(x+4,y+4,56,56);
      }
    }
    for(let i=0;i<900;i++){
      ctx.fillStyle="rgba(30,30,25,.07)";
      ctx.fillRect(Math.random()*512,Math.random()*512,1,1);
    }
  }

  const texture=new THREE.CanvasTexture(canvas);
  texture.wrapS=THREE.RepeatWrapping;
  texture.wrapT=THREE.RepeatWrapping;
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);
  return texture;
}

const menuWallTexture=makeMenuTexture("wall");
menuWallTexture.repeat.set(3.2,2.2);

const menuFloorTexture=makeMenuTexture("carpet");
menuFloorTexture.repeat.set(7,7);

const menuCeilingTexture=makeMenuTexture("ceiling");
menuCeilingTexture.repeat.set(6,6);

const menuSet=new THREE.Group();
menuSet.name="LostSignalMenuSet";
menuSet.visible=false;
scene.add(menuSet);

const menuWallMaterial=new THREE.MeshStandardMaterial({
  map:menuWallTexture,
  color:0xb0a86f,
  roughness:0.94,
  metalness:0
});

const menuFloorMaterial=new THREE.MeshStandardMaterial({
  map:menuFloorTexture,
  color:0x5b5640,
  roughness:1,
  metalness:0
});

const menuCeilingMaterial=new THREE.MeshStandardMaterial({
  map:menuCeilingTexture,
  color:0x85836d,
  roughness:0.96,
  metalness:0
});

const menuTrimMaterial=new THREE.MeshStandardMaterial({
  color:0x6c6748,
  roughness:.9
});

const menuDarkMaterial=new THREE.MeshStandardMaterial({
  color:0x25261d,
  roughness:1
});

const menuLightMaterial=new THREE.MeshStandardMaterial({
  color:0xfff4c9,
  emissive:0xffe7a2,
  emissiveIntensity:1.8,
  roughness:.35
});

function addMenuBox(name,size,position,material,rotationY=0){
  const mesh=new THREE.Mesh(
    new THREE.BoxGeometry(size.x,size.y,size.z),
    material
  );
  mesh.name=name;
  mesh.position.copy(position);
  mesh.rotation.y=rotationY;
  mesh.castShadow=false;
  mesh.receiveShadow=true;
  menuSet.add(mesh);
  return mesh;
}

// Large open room. The important part is that the player sees several
// overlapping spaces rather than one perfect corridor.
addMenuBox(
  "MenuFloor",
  new THREE.Vector3(48,.18,62),
  new THREE.Vector3(0,-.09,-10),
  menuFloorMaterial
);

addMenuBox(
  "MenuCeiling",
  new THREE.Vector3(48,.18,62),
  new THREE.Vector3(0,8.1,-10),
  menuCeilingMaterial
);

addMenuBox(
  "MenuLeftWall",
  new THREE.Vector3(.18,8.1,62),
  new THREE.Vector3(-24,4.05,-10),
  menuWallMaterial
);

addMenuBox(
  "MenuRightWall",
  new THREE.Vector3(.18,8.1,62),
  new THREE.Vector3(24,4.05,-10),
  menuWallMaterial
);

addMenuBox(
  "MenuBackWall",
  new THREE.Vector3(48,8.1,.18),
  new THREE.Vector3(0,4.05,-41),
  menuWallMaterial
);

// Low trim around the room.
addMenuBox(
  "MenuLeftTrim",
  new THREE.Vector3(.22,.18,62),
  new THREE.Vector3(-23.84,.38,-10),
  menuTrimMaterial
);
addMenuBox(
  "MenuRightTrim",
  new THREE.Vector3(.22,.18,62),
  new THREE.Vector3(23.84,.38,-10),
  menuTrimMaterial
);

// Partial walls / pillars. Their irregular placement is what stops the set
// from looking like a generated hallway straight out of a tunnel.
const partials=[
  [-12,-5,7.2,4.8,2.2],
  [10,-10,5.4,4.5,-1.4],
  [-7,-18,3.8,5.7,.8],
  [12,-24,6.6,4.2,-.5],
  [-1.5,-30,5.0,4.0,.2]
];

for(let i=0;i<partials.length;i++){
  const [x,z,w,d,yaw]=partials[i];
  addMenuBox(
    "MenuPartialWall"+i,
    new THREE.Vector3(w,6.6,d),
    new THREE.Vector3(x,3.3,z),
    menuWallMaterial,
    yaw
  );
}

// A couple of narrow vertical pillars provide the classic broken-up Level 0
// rhythm without putting anything directly in the menu's text area.
for(const [x,z] of [[-17,-16],[17,-6],[-14,-32],[15,-34]]){
  addMenuBox(
    "MenuPillar",
    new THREE.Vector3(1.4,8.0,1.4),
    new THREE.Vector3(x,4,z),
    menuWallMaterial
  );
}

// Dark ceiling gaps above a few lights.
for(const [x,z] of [[-10,1],[3,-7],[14,-18],[-9,-27],[7,-34],[-17,-1]]){
  addMenuBox(
    "MenuCeilingGap",
    new THREE.Vector3(3.2,.08,1.45),
    new THREE.Vector3(x,8.0,z),
    menuDarkMaterial
  );
}

const menuLights=[
  {x:-10,z:1,power:11},
  {x:3,z:-7,power:13},
  {x:14,z:-18,power:9},
  {x:-9,z:-27,power:12},
  {x:7,z:-34,power:10},
  {x:-17,z:-1,power:7},
  {x:18,z:-31,power:5}
];

for(let i=0;i<menuLights.length;i++){
  const light=menuLights[i];

  addMenuBox(
    "MenuFluorescent",
    new THREE.Vector3(2.9,.08,1.2),
    new THREE.Vector3(light.x,7.96,light.z),
    menuLightMaterial
  );

  const point=new THREE.PointLight(0xffe7ae,light.power,13,1.8);
  point.position.set(light.x,7.45,light.z);
  point.userData.basePower=light.power;
  point.userData.phase=i*.91;
  menuSet.add(point);
}

const menuAmbient=new THREE.HemisphereLight(0xc8ba86,0x28281d,.95);
const menuFill=new THREE.PointLight(0xd4c694,7.5,26,2);
menuFill.position.set(-4,4,-4);
menuSet.add(menuAmbient,menuFill);

const menuCameraStart=new THREE.Vector3(0,2.05,10.8);
const menuCameraTarget=new THREE.Vector3(-1.2,2.45,-15.5);

let menuSceneReady=false;
let menuBackdropWasActive=false;

function updateMenuScene(t,dt){
  if(gameStarted || !homeScreen || homeScreen.classList.contains("hidden")){
    if(menuBackdropWasActive){
      menuBackdropWasActive=false;
      menuSet.visible=false;
      scene.fog.color.set(0x030302);
      scene.fog.near=14;
      scene.fog.far=62;
    }
    return false;
  }

  // The title screen uses a real photographic liminal-space background.
  // Keep the procedural menu geometry hidden so it cannot black out the image.
  if(!menuBackdropWasActive){
    menuBackdropWasActive=true;
    menuSet.visible=false;
  }

  return false;
}

const flashlight=new THREE.SpotLight(0xf0dfad,72,100,Math.PI/4.2,.78,1.1);
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
const HOUSE_MODEL_PATH="./assets/studio_apartment_vray_baked_textures_included.glb";
const HOUSE_TARGET_HEIGHT=3.0;
let houseModel=null;
let houseLoaded=false;
let houseMode=false;
let houseSpawn=new THREE.Vector3(0,EYE,0);
let pendingHouseStart=false;
let houseLoadFailed=false;
let houseLoadStarted=false;
let houseCollisionReady=false;
let houseCollisionBuildStarted=false;
let houseUnloadTimer=0;
const houseCollisionBoxes=[];
const houseFloorRaycaster=new THREE.Raycaster();
const houseViewRaycaster=new THREE.Raycaster();
let houseDoorCollisionDirty=true;
let houseCollisionRefreshTimer=0;
let houseCollisionFocusX=NaN;
let houseCollisionFocusZ=NaN;
let gameStarted=false;
let houseIntroMessageShown=false;
let lastAutoSave=0;
let pendingSaveLoad=null;
let pendingNewGameSlot=null;

const SAVE_SLOT_COUNT=3;
const SAVE_SLOT_KEY_PREFIX="deepseeker-save-slot-";
const LEGACY_SAVE_KEY="deepseeker-save-v1";
const SELECTED_SAVE_SLOT_KEY="deepseeker-selected-save-slot";
const SAVE_COOKIE_PREFIX="deepseeker-save-cookie-";
const SELECTED_SAVE_COOKIE="deepseeker-selected-save-slot";
const SAVE_COOKIE_MAX_AGE=60*60*24*365*10;

const saveCache=[null,null,null,null];
const SAVE_DB_NAME="deepseeker-save-db";
const SAVE_DB_VERSION=1;
const SAVE_DB_STORE="slots";
let saveDbPromise=null;

function openSaveDatabase(){
  if(!("indexedDB" in window)){
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if(saveDbPromise) return saveDbPromise;

  saveDbPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(SAVE_DB_NAME,SAVE_DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(SAVE_DB_STORE)){
        db.createObjectStore(SAVE_DB_STORE,{keyPath:"slot"});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("IndexedDB open failed"));
  });

  return saveDbPromise;
}

function readIndexedSaveSlot(slot){
  return openSaveDatabase().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(SAVE_DB_STORE,"readonly");
    const request=tx.objectStore(SAVE_DB_STORE).get(normalizeSaveSlot(slot));
    request.onsuccess=()=>resolve(request.result?.data||null);
    request.onerror=()=>reject(request.error||new Error("IndexedDB read failed"));
  }));
}

function writeIndexedSaveSlot(slot,data){
  return openSaveDatabase().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(SAVE_DB_STORE,"readwrite");
    tx.objectStore(SAVE_DB_STORE).put({
      slot:normalizeSaveSlot(slot),
      data
    });
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error||new Error("IndexedDB write failed"));
    tx.onabort=()=>reject(tx.error||new Error("IndexedDB write aborted"));
  }));
}

async function hydrateIndexedSaveSlots(){
  try{
    for(let slot=1;slot<=SAVE_SLOT_COUNT;slot++){
      const data=await readIndexedSaveSlot(slot);
      if(!data) continue;

      const parsed=parseSave(JSON.stringify(data));
      if(
        parsed &&
        (!saveCache[slot] ||
          Number(parsed.savedAt||0)>Number(saveCache[slot].savedAt||0))
      ){
        saveCache[slot]=parsed;
        try{
          localStorage.setItem(saveSlotKey(slot),JSON.stringify(parsed));
        }catch{}
        writeCookie(saveSlotCookieKey(slot),JSON.stringify(parsed));
      }
    }
    renderSaveSlots();
    updateSaveSlotLabels();
  }catch(error){
    console.warn("[DeepSeeker] IndexedDB save backup unavailable:",error);
  }
}

function normalizeSaveSlot(slot){
  const value=Number(slot);
  if(!Number.isInteger(value)) return 1;
  return Math.max(1,Math.min(SAVE_SLOT_COUNT,value));
}

function saveSlotKey(slot){
  return SAVE_SLOT_KEY_PREFIX+normalizeSaveSlot(slot);
}

function saveSlotCookieKey(slot){
  return SAVE_COOKIE_PREFIX+normalizeSaveSlot(slot);
}

function parseSave(raw){
  if(typeof raw!=="string" || !raw) return null;

  try{
    const parsed=JSON.parse(raw);
    if(!parsed || typeof parsed!=="object") return null;
    if(!Number.isFinite(Number(parsed.x)) || !Number.isFinite(Number(parsed.z))) return null;
    if(parsed.level!=="apartment" && parsed.level!=="backrooms" && parsed.houseMode!==true && parsed.houseMode!==false) return null;
    return parsed;
  }catch{
    return null;
  }
}

function readCookie(name){
  const prefix=encodeURIComponent(name)+"=";
  const entry=document.cookie
    .split(";")
    .map(part=>part.trim())
    .find(part=>part.startsWith(prefix));

  if(!entry) return null;

  try{
    return decodeURIComponent(entry.slice(prefix.length));
  }catch{
    return null;
  }
}

function writeCookie(name,value){
  try{
    document.cookie=
      encodeURIComponent(name)+"="+encodeURIComponent(value)+
      "; Max-Age="+SAVE_COOKIE_MAX_AGE+
      "; Path=/; SameSite=Lax"+
      (location.protocol==="https:" ? "; Secure" : "");

    return readCookie(name)!==null;
  }catch{
    return false;
  }
}

function readSaveSlot(slot){
  const key=saveSlotKey(slot);

  try{
    const local=parseSave(localStorage.getItem(key));
    if(local) return local;
  }catch{
    // Continue to cookie backup.
  }

  const cookie=parseSave(readCookie(saveSlotCookieKey(slot)));
  if(cookie){
    try{
      localStorage.setItem(key,JSON.stringify(cookie));
    }catch{
      // Cookie remains the durable fallback.
    }
  }

  return cookie;
}

function hydrateSaveSlots(){
  // Migrate the old single-save format exactly once.
  let legacy=null;
  try{
    legacy=parseSave(localStorage.getItem(LEGACY_SAVE_KEY));
  }catch{
    legacy=parseSave(readCookie(LEGACY_SAVE_KEY));
  }

  for(let slot=1;slot<=SAVE_SLOT_COUNT;slot++){
    saveCache[slot]=readSaveSlot(slot);
  }

  if(legacy && !saveCache[1]){
    saveCache[1]={...legacy,version:3,saveSlot:1};
    persistSaveSlot(1,saveCache[1]);
  }
}

function getSavedGame(slot=selectedSaveSlot){
  return saveCache[normalizeSaveSlot(slot)] || null;
}

function getSavedLevel(data){
  return data?.level==="apartment" || data?.houseMode===true
    ? "apartment"
    : "backrooms";
}

function persistSaveSlot(slot,data){
  const targetSlot=normalizeSaveSlot(slot);
  const serialized=JSON.stringify(data);

  saveCache[targetSlot]=data;

  let stored=false;
  try{
    localStorage.setItem(saveSlotKey(targetSlot),serialized);
    stored=localStorage.getItem(saveSlotKey(targetSlot))===serialized;
  }catch{}

  if(writeCookie(saveSlotCookieKey(targetSlot),serialized)){
    stored=true;
  }

  writeIndexedSaveSlot(targetSlot,data).catch(error=>{
    console.warn("[DeepSeeker] IndexedDB save backup failed:",error);
  });

  return stored;
}

function readSelectedSaveSlot(){
  let raw=null;

  try{
    raw=localStorage.getItem(SELECTED_SAVE_SLOT_KEY);
  }catch{
    raw=null;
  }

  if(!raw) raw=readCookie(SELECTED_SAVE_COOKIE);

  return normalizeSaveSlot(raw);
}

let selectedSaveSlot=readSelectedSaveSlot();
hydrateSaveSlots();
hydrateIndexedSaveSlots();

try{
  if(window.navigator?.storage?.persist){
    window.navigator.storage.persist().catch(()=>{});
  }
}catch{
  // Persistence permission is only an optimization.
}

function setSelectedSaveSlot(slot,announce=true){
  selectedSaveSlot=normalizeSaveSlot(slot);

  try{
    localStorage.setItem(SELECTED_SAVE_SLOT_KEY,String(selectedSaveSlot));
  }catch{
    // Cookie below keeps the selection across a normal storage reset.
  }
  writeCookie(SELECTED_SAVE_COOKIE,String(selectedSaveSlot));

  renderSaveSlots();
  updateSaveSlotLabels();

  if(announce){
    const save=getSavedGame(selectedSaveSlot);
    eventText.textContent=save
      ? `SLOT ${selectedSaveSlot} SELECTED`
      : `SLOT ${selectedSaveSlot} READY FOR A NEW GAME`;
    eventText.style.opacity="1";
    setTimeout(()=>{
      if(
        eventText.textContent===`SLOT ${selectedSaveSlot} SELECTED` ||
        eventText.textContent===`SLOT ${selectedSaveSlot} READY FOR A NEW GAME`
      ){
        eventText.style.opacity="0";
      }
    },1200);
  }
}

function updateSaveSlotLabels(){
  const selected=getSavedGame(selectedSaveSlot);

  if(saveInfo){
    saveInfo.textContent=selected
      ? `SLOT ${selectedSaveSlot} SELECTED · ${getSavedLevel(selected).toUpperCase()}`
      : `SLOT ${selectedSaveSlot} SELECTED · EMPTY`;
  }

  for(const button of document.querySelectorAll(".saveSlotCard")){
    const slot=normalizeSaveSlot(button.dataset.slot);
    const save=getSavedGame(slot);
    const title=button.querySelector(".saveSlotTitle");
    const detail=button.querySelector(".saveSlotDetail");
    const mode=button.querySelector(".saveSlotMode");

    button.classList.toggle("selected",slot===selectedSaveSlot);
    button.setAttribute("aria-pressed",slot===selectedSaveSlot ? "true" : "false");

    if(title) title.textContent=`SAVE SLOT ${slot}`;
    if(detail){
      detail.textContent=save
        ? (save.savedAt
            ? new Date(save.savedAt).toLocaleString()
            : "SAVE FOUND")
        : "EMPTY — NEW GAME";
    }
    if(mode){
      mode.textContent=save
        ? (save.saveType || (save.roomCode ? "MULTIPLAYER" : "SOLO"))
        : "NO SAVE";
    }

    const loadButton=button.querySelector(".saveSlotLoad");
    const newButton=button.querySelector(".saveSlotNew");
    if(loadButton){
      loadButton.disabled=!save;
      loadButton.textContent=save ? "LOAD" : "EMPTY";
    }
    if(newButton) newButton.textContent=save ? "OVERWRITE" : "NEW";
  }

  const lobbySaveChoice=document.getElementById("lobbySaveChoice");
  if(lobbySaveChoice){
    const save=getSavedGame(selectedSaveSlot);
    lobbySaveChoice.textContent=save
      ? `SLOT ${selectedSaveSlot} · ${save.saveType || (save.roomCode ? "MULTIPLAYER" : "SOLO")} · ${getSavedLevel(save).toUpperCase()}`
      : `SLOT ${selectedSaveSlot} · EMPTY · STARTS A NEW GAME`;
  }

  const continueLabel=document.getElementById("continueSlotLabel");
  if(continueLabel){
    continueLabel.textContent=`CONTINUE SLOT ${selectedSaveSlot}`;
  }
}

function renderSaveSlots(){
  const container=document.getElementById("saveSlots");
  if(!container) return;

  if(container.children.length===SAVE_SLOT_COUNT) return;

  container.innerHTML="";
  for(let slot=1;slot<=SAVE_SLOT_COUNT;slot++){
    const card=document.createElement("div");
    card.className="saveSlotCard";
    card.dataset.slot=String(slot);
    card.innerHTML=`
      <div class="saveSlotHeader">
        <span class="saveSlotTitle"></span>
        <span class="saveSlotMode"></span>
      </div>
      <span class="saveSlotDetail"></span>
      <div class="saveSlotActions">
        <button class="saveSlotLoad" type="button">LOAD</button>
        <button class="saveSlotNew" type="button">NEW</button>
      </div>
    `;

    card.addEventListener("click",event=>{
      if(event.target.closest("button")) return;
      setSelectedSaveSlot(slot);
    });

    card.querySelector(".saveSlotLoad").addEventListener("click",event=>{
      event.preventDefault();
      event.stopPropagation();
      continueGame(slot);
    });

    card.querySelector(".saveSlotNew").addEventListener("click",event=>{
      event.preventDefault();
      event.stopPropagation();
      resetForNewGame(slot);
    });

    container.appendChild(card);
  }
}

function refreshSaveInfo(){
  renderSaveSlots();
  updateSaveSlotLabels();
  updateHouseLoadingUI();
}

function installMainMenuRedesign(){
  if(!homeScreen || homeScreen.dataset.deepseekerMenu==="redesigned") return;
  homeScreen.dataset.deepseekerMenu="redesigned";
  homeScreen.classList.add("menuHomeRedesign");
  overlay.classList.add("deepseekerMenuOverlay");

  const houseLoader=homeScreen.querySelector("#houseLoaderHome");
  const saveSlots=document.getElementById("saveSlots");

  const style=document.createElement("style");
  style.id="deepseeker-menu-redesign";
  style.textContent=`
#overlay.deepseekerMenuOverlay{
  justify-content:flex-start;
  align-items:flex-start;
  gap:0;
  overflow:hidden;
  background:transparent;
  cursor:default;
}
#overlay.deepseekerMenuOverlay::after{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  z-index:1;
  background:
    linear-gradient(90deg,
      rgba(1,2,1,.64) 0%,
      rgba(1,2,1,.34) 18%,
      rgba(1,2,1,.10) 38%,
      transparent 58%),
    linear-gradient(180deg,
      rgba(0,0,0,.18) 0%,
      transparent 28%,
      transparent 68%,
      rgba(0,0,0,.38) 100%);
}
#menuBackdrop{
  position:absolute;
  inset:0;
  pointer-events:none;
  z-index:2;
  overflow:hidden;
  background:
    linear-gradient(90deg,rgba(5,6,4,.86) 0%,rgba(8,9,6,.54) 24%,rgba(12,11,7,.12) 55%,rgba(5,5,4,.28) 100%),
    linear-gradient(180deg,rgba(58,46,17,.28),rgba(93,73,25,.12) 42%,rgba(5,5,4,.58) 100%),
    url("https://images.unsplash.com/photo-1761251946420-8b65ad19f2e7?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=88&w=2400")
    center center / cover no-repeat;
  background-color:#302e21;
  background-blend-mode:multiply,color,normal;
  filter:sepia(.38) saturate(1.18) contrast(1.08) brightness(.72);
}
#menuBackdrop::before{
  content:"";
  position:absolute;
  inset:0;
  background:
    radial-gradient(ellipse at 66% 44%,transparent 0 21%,rgba(0,0,0,.10) 44%,rgba(0,0,0,.56) 100%),
    linear-gradient(90deg,transparent 52%,rgba(215,192,116,.035) 70%,transparent 90%);
}
#menuBackdrop::after{
  content:"";
  position:absolute;
  inset:0;
  background:
    repeating-linear-gradient(180deg,transparent 0 5px,rgba(255,255,255,.007) 6px,transparent 7px),
    linear-gradient(180deg,rgba(0,0,0,.04),transparent 38%,rgba(0,0,0,.34) 100%);
  opacity:.8;
}

#homeScreen.menuHomeRedesign{
  position:absolute;
  inset:0;
  z-index:4;
  display:block;
  width:100vw;
  height:100vh;
  padding:0;
  box-sizing:border-box;
  border:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
  backdrop-filter:none;
  overflow:hidden;
}
#homeScreen.menuHomeRedesign.hidden{display:none}

.menuHomeLayout{
  position:relative;
  z-index:5;
  width:100%;
  height:100%;
}

.menuHomeLayout::before{
  content:"";
  position:absolute;
  left:0;
  top:0;
  bottom:0;
  width:min(520px,42vw);
  background:
    linear-gradient(90deg,rgba(4,5,4,.90),rgba(4,5,4,.64) 63%,transparent 100%);
  pointer-events:none;
}

.menuLogo{
  position:absolute;
  left:clamp(34px,4.2vw,72px);
  top:clamp(34px,5.5vh,62px);
  max-width:390px;
  color:#f2ead1;
  text-shadow:0 3px 22px #000,0 0 40px rgba(0,0,0,.65);
}
.menuLogoMain{
  display:flex;
  flex-direction:column;
  line-height:.86;
  font-weight:600;
  letter-spacing:clamp(3px,.45vw,7px);
}
.menuLogoMain span{
  font-size:clamp(17px,1.8vw,29px);
  color:#d9d2bf;
}
.menuLogoMain strong{
  margin-top:6px;
  font-size:clamp(31px,3.55vw,58px);
  font-weight:600;
  color:#d8b865;
  letter-spacing:clamp(4px,.58vw,9px);
}
.menuLogoSub{
  margin-top:13px;
  padding-left:2px;
  font-size:8px;
  letter-spacing:3.1px;
  color:#8d8979;
}

.menuNav{
  position:absolute;
  left:clamp(28px,4.2vw,72px);
  top:clamp(232px,28vh,292px);
  width:min(360px,32vw);
  display:flex;
  flex-direction:column;
  gap:19px;
}

.menuNavGroup{
  position:relative;
}
.menuNavGroup + .menuNavGroup{
  margin-top:0;
}

.menuNavGroupLabel{
  display:flex;
  align-items:center;
  gap:11px;
  margin:0 0 6px 4px;
  font-size:7px;
  letter-spacing:2.8px;
  color:#777363;
  text-shadow:0 2px 8px #000;
}
.menuNavGroupLabel::before{
  content:"";
  width:16px;
  height:1px;
  background:#c6a65c;
  opacity:.6;
}
.menuNavGroupLabel::after{
  content:"";
  flex:1;
  height:1px;
  background:linear-gradient(90deg,rgba(226,211,164,.14),transparent);
}

.menuNavButton{
  position:relative;
  width:100%;
  min-height:48px;
  padding:0 15px 0 18px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  border:1px solid rgba(235,224,179,.09);
  border-left:2px solid transparent;
  border-radius:4px;
  background:linear-gradient(90deg,rgba(13,14,12,.48),rgba(13,14,12,.18));
  color:#cbc5b2;
  font:inherit;
  text-align:left;
  font-size:clamp(11px,.82vw,14px);
  letter-spacing:1.8px;
  cursor:pointer;
  transition:
    background .16s,
    color .16s,
    border-color .16s,
    transform .16s,
    box-shadow .16s;
  text-shadow:0 2px 8px #000;
  backdrop-filter:blur(3px);
}
.menuNavButton::before{
  content:"";
  position:absolute;
  left:0;
  top:8px;
  bottom:8px;
  width:2px;
  background:#d7b35d;
  opacity:0;
  transition:opacity .16s;
}
.menuNavButton:hover{
  background:linear-gradient(90deg,rgba(31,31,25,.72),rgba(31,31,25,.25));
  color:#fff5d9;
  border-color:rgba(223,190,107,.22);
  transform:translateX(4px);
  box-shadow:0 7px 24px rgba(0,0,0,.25);
}
.menuNavButton:hover::before,
.menuNavButton.active::before{
  opacity:1;
}
.menuNavButton.active,
.menuNavButton:focus-visible{
  background:linear-gradient(90deg,rgba(114,88,34,.38),rgba(47,39,23,.13));
  border-color:rgba(223,190,107,.30);
  border-left-color:#d7b35d;
  color:#fff3cb;
  outline:none;
  box-shadow:0 8px 28px rgba(0,0,0,.30),inset 0 1px rgba(255,255,255,.05);
}
.menuNavButton:disabled{
  opacity:.34;
  cursor:not-allowed;
  transform:none!important;
}
.menuNavArrow{
  font-size:21px;
  line-height:1;
  color:#666254;
  transition:transform .16s,color .16s;
}
.menuNavButton:hover .menuNavArrow{
  transform:translateX(4px);
  color:#e7be68;
}
.menuNavButton.active .menuNavArrow{
  color:#e2b253;
}

.menuSlotBar{
  position:absolute;
  left:clamp(28px,4.2vw,72px);
  bottom:clamp(30px,4vh,48px);
  width:min(560px,46vw);
  color:#8c8675;
  text-shadow:0 2px 8px #000;
}
.menuSlotHeader{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:7px;
  padding:0 1px;
  font-size:7px;
  letter-spacing:2.2px;
}
.menuSlotHeader strong{
  color:#d2c8a5;
  font-weight:500;
}
.menuHomeRedesign #saveSlots{
  width:100%;
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:10px;
}
.menuHomeRedesign .saveSlotCard{
  min-width:0;
  min-height:96px;
  padding:13px 12px;
  border:1px solid rgba(231,220,171,.09);
  border-radius:4px;
  background:rgba(5,6,5,.32);
  color:#b2ac99;
  display:flex;
  flex-direction:column;
  justify-content:center;
  box-shadow:inset 0 1px rgba(255,255,255,.018);
  backdrop-filter:blur(3px);
}
.menuHomeRedesign .saveSlotCard:hover{
  background:rgba(223,173,69,.08);
  border-color:rgba(231,220,171,.18);
}
.menuHomeRedesign .saveSlotCard.selected{
  border-color:rgba(223,173,69,.66);
  background:rgba(223,173,69,.11);
  box-shadow:0 0 18px rgba(223,173,69,.05);
}
.menuHomeRedesign .saveSlotTitle{
  font-size:9px;
  letter-spacing:1.7px;
  color:#ddd4b9;
}
.menuHomeRedesign .saveSlotMode{
  font-size:7px;
  color:#7e796d;
}
.menuHomeRedesign .saveSlotDetail{
  display:block;
  margin-top:7px;
  font-size:8px;
  color:#676258;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.menuHomeRedesign .saveSlotActions{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:6px;
  margin-top:9px;
}
.menuHomeRedesign .saveSlotActions button{
  padding:7px 4px;
  border:1px solid rgba(231,220,171,.07);
  border-radius:3px;
  background:rgba(255,255,255,.018);
  color:#8e8877;
  font:inherit;
  font-size:7px;
  letter-spacing:1px;
  cursor:pointer;
}
.menuHomeRedesign .saveSlotActions button:hover{
  background:rgba(223,173,69,.075);
  color:#e7dabd;
}
.menuHomeRedesign .saveSlotActions button:disabled{
  opacity:.27;
  cursor:not-allowed;
}
.menuSaveStatus{
  margin-top:5px;
  padding-left:1px;
  font-size:7px;
  letter-spacing:1.2px;
  color:#625e54;
}

.menuRightPanel{
  position:absolute;
  left:clamp(420px,31vw,540px);
  right:auto;
  top:clamp(218px,25vh,275px);
  bottom:auto;
  width:min(300px,24vw);
  padding:14px 0 0 16px;
  border:0;
  border-left:1px solid rgba(223,173,69,.30);
  color:#918b79;
  text-shadow:0 2px 8px #000;
  opacity:.92;
}
.menuRightHeader{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:12px;
  font-size:7px;
  letter-spacing:2px;
  color:#8b8573;
}
.menuSignalState{
  display:flex;
  align-items:center;
  gap:8px;
  margin-bottom:9px;
  font-size:14px;
  letter-spacing:2.2px;
  color:#ddd1a7;
}
.menuSignalDot{
  width:6px;
  height:6px;
  border-radius:50%;
  background:#d2a13c;
  box-shadow:0 0 10px rgba(223,173,69,.55);
}
.menuRightLead{
  margin:0 0 12px;
  max-width:250px;
  font-size:9px;
  line-height:1.8;
  color:#777165;
}
.menuRightRule{
  height:1px;
  background:rgba(226,211,164,.08);
  margin:11px 0 13px;
}
.menuRightSectionLabel{
  margin-bottom:5px;
  font-size:7px;
  letter-spacing:2.2px;
  color:#9c9580;
}
.menuHomeRedesign .houseLoader{
  width:100%;
  margin:8px 0 0;
  text-align:left;
}
.menuHomeRedesign .houseLoaderTop{
  color:#817b6c;
}
.menuHomeRedesign .houseLoaderStatus{
  color:#646055;
  min-height:14px;
}
.menuRightMeta{
  display:grid;
  gap:6px;
  margin-top:10px;
}
.menuRightMetaRow{
  display:flex;
  justify-content:space-between;
  gap:12px;
  font-size:7px;
  letter-spacing:1.3px;
}
.menuRightMetaRow span:first-child{color:#514e46}
.menuRightMetaRow span:last-child{color:#878071}

.menuFooter{
  position:absolute;
  left:clamp(28px,4.2vw,72px);
  right:clamp(28px,4.2vw,72px);
  bottom:14px;
  display:flex;
  justify-content:space-between;
  gap:22px;
  font-size:7px;
  line-height:1.6;
  letter-spacing:1.4px;
  color:#5b574e;
  text-shadow:0 2px 8px #000;
}
.menuFooter span:last-child{text-align:right}

.menuEditButton{
  position:absolute;
  top:18px;
  right:20px;
  z-index:12;
  min-width:78px;
  height:34px;
  padding:0 13px;
  border:1px solid rgba(235,224,179,.20);
  border-radius:4px;
  background:rgba(5,6,5,.55);
  color:#d8cfb5;
  font:inherit;
  font-size:8px;
  letter-spacing:2px;
  cursor:pointer;
  backdrop-filter:blur(8px);
  box-shadow:0 7px 24px rgba(0,0,0,.28);
}
.menuEditButton:hover{
  color:#fff3cf;
  border-color:rgba(223,190,107,.48);
  background:rgba(31,31,25,.72);
}
.menuEditor{
  position:absolute;
  top:60px;
  right:20px;
  z-index:20;
  display:none;
  width:min(390px,calc(100vw - 40px));
  max-height:calc(100vh - 82px);
  overflow:auto;
  padding:18px;
  box-sizing:border-box;
  border:1px solid rgba(231,220,171,.17);
  border-radius:7px;
  background:rgba(7,8,6,.95);
  box-shadow:0 24px 80px rgba(0,0,0,.58);
  backdrop-filter:blur(14px);
  color:#c8c0a7;
}
.menuEditor.open{display:block}
.menuEditorTitle{font-size:11px;letter-spacing:2.3px;color:#eee5ca}
.menuEditorSub{margin-top:5px;font-size:8px;line-height:1.6;color:#777261}
.menuEditorGrid{display:grid;gap:11px;margin-top:15px}
.menuEditorRow{display:grid;gap:5px}
.menuEditorRow label{font-size:7px;letter-spacing:1.7px;color:#938b76}
.menuEditorRow input[type="text"]{
  width:100%;
  box-sizing:border-box;
  padding:9px 10px;
  border:1px solid rgba(231,220,171,.11);
  border-radius:4px;
  background:#020302;
  color:#e5ddc4;
  font:inherit;
  font-size:9px;
  outline:none;
}
.menuEditorRow input[type="text"]:focus{border-color:rgba(223,190,107,.42)}
.menuEditorRange{display:grid;grid-template-columns:1fr 48px;gap:8px;align-items:center}
.menuEditorRange input[type="range"]{width:100%;accent-color:#d3ad58}
.menuEditorRange output{text-align:right;font-size:8px;color:#b9af93}
.menuEditorActions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:15px}
.menuEditorActions button{
  min-height:35px;
  border:1px solid rgba(231,220,171,.12);
  border-radius:4px;
  background:rgba(255,255,255,.035);
  color:#cfc5a8;
  font:inherit;
  font-size:8px;
  letter-spacing:1.3px;
  cursor:pointer;
}
.menuEditorActions button:hover{background:rgba(223,173,69,.10);border-color:rgba(223,173,69,.28)}
.menuEditorStatus{min-height:13px;margin-top:9px;font-size:7px;letter-spacing:1px;color:#77705e}

@media(max-width:1000px){
  .menuNav{width:min(320px,38vw)}
  .menuSlotBar{width:min(480px,50vw)}
  .menuRightPanel{right:20px;width:min(250px,30vw)}
}
@media(max-width:750px){
  .menuLogoMain span{font-size:23px}
  .menuLogoMain strong{font-size:31px}
  .menuNav{top:170px;left:20px;width:min(320px,82vw)}
  .menuSlotBar{left:20px;bottom:62px;width:calc(100vw - 40px)}
  .menuHomeRedesign #saveSlots{grid-template-columns:1fr}
  .menuRightPanel{display:none}
  .menuFooter{left:20px;right:20px;bottom:17px}
  .menuFooter span:last-child{display:none}
  .menuHomeLayout::before{left:18px;top:160px;bottom:60px}
  .menuLogo{left:20px;top:22px}
}
`;
  document.head.appendChild(style);

  if(!document.getElementById("menuBackdrop")){
    const backdrop=document.createElement("div");
    backdrop.id="menuBackdrop";
    backdrop.innerHTML=`
      <div class="menuSignalNoise"></div>
    `;
    overlay.insertBefore(backdrop,homeScreen);
  }

  homeScreen.innerHTML="";
  const layout=document.createElement("div");
  layout.className="menuHomeLayout";

  const logo=document.createElement("div");
  logo.className="menuLogo";
  logo.innerHTML=`
    <div class="menuLogoMain"><span>BACKROOMS</span><strong>LOST SIGNAL</strong></div>
    <div class="menuLogoSub">LIMINAL HORROR // SIGNAL NODE 01</div>
  `;

  const nav=document.createElement("nav");
  nav.className="menuNav";
  nav.setAttribute("aria-label","Main menu");

  const configureButton=(button,label,active=false)=>{
    button.className="menuNavButton"+(active?" active":"");
    button.type="button";
    if(button===continueButton){
      button.innerHTML=`<span id="continueSlotLabel">CONTINUE SLOT ${selectedSaveSlot}</span><span class="menuNavArrow">›</span>`;
    }else{
      button.innerHTML=`<span>${label}</span><span class="menuNavArrow">›</span>`;
    }
  };

  const createNavGroup=(label)=>{
    const group=document.createElement("div");
    group.className="menuNavGroup";
    const heading=document.createElement("div");
    heading.className="menuNavGroupLabel";
    heading.textContent=label;
    group.appendChild(heading);
    nav.appendChild(group);
    return group;
  };

  const hasSelectedSave=Boolean(getSavedGame(selectedSaveSlot));
  configureButton(continueButton,"CONTINUE",hasSelectedSave);
  configureButton(newGameButton,"NEW GAME",!hasSelectedSave);
  configureButton(createLobbyButton,"HOST LOBBY");
  configureButton(joinLobbyButton,"JOIN LOBBY");

  menuControlsButton=document.createElement("button");
  configureButton(menuControlsButton,"CONTROLS");
  menuControlsButton.addEventListener("click",()=>showControls());

  const playGroup=createNavGroup("PLAY");
  playGroup.append(continueButton,newGameButton);

  const multiplayerGroup=createNavGroup("MULTIPLAYER");
  multiplayerGroup.append(createLobbyButton,joinLobbyButton);

  const systemGroup=createNavGroup("SYSTEM");
  systemGroup.append(menuControlsButton);

  const slotBar=document.createElement("div");
  slotBar.className="menuSlotBar";
  slotBar.innerHTML=`
    <div class="menuSlotHeader"><strong>LOCAL SAVES</strong><span>SELECT A SLOT</span></div>
  `;
  if(saveSlots) slotBar.appendChild(saveSlots);

  const saveStatus=document.createElement("div");
  saveStatus.className="menuSaveStatus";
  saveStatus.appendChild(saveInfo);
  slotBar.appendChild(saveStatus);

  const right=document.createElement("aside");
  right.className="menuRightPanel";
  right.innerHTML=`
    <div class="menuRightHeader"><span>FIELD TERMINAL</span><span>DS-01</span></div>
    <div class="menuSignalState"><span class="menuSignalDot"></span><span>SIGNAL: LOST</span></div>
    <p class="menuRightLead">The apartment is only the entrance. Something is waiting in the halls beyond it.</p>
    <div class="menuRightRule"></div>
    <div class="menuRightSectionLabel">ENTRY SYSTEM</div>
  `;
  if(houseLoader){
    const loaderLabel=document.createElement("div");
    loaderLabel.style.cssText="margin-top:13px;font-size:8px;letter-spacing:2px;color:#b5ae96;";
    loaderLabel.textContent="APARTMENT";
    right.appendChild(loaderLabel);
    right.appendChild(houseLoader);
  }
  const meta=document.createElement("div");
  meta.className="menuRightMeta";
  meta.innerHTML=`
    <div class="menuRightMetaRow"><span>WORLD</span><span>BACKROOMS</span></div>
    <div class="menuRightMetaRow"><span>ENTRY</span><span>APARTMENT</span></div>
    <div class="menuRightMetaRow"><span>LINK</span><span>STANDBY</span></div>
  `;
  right.appendChild(meta);



  const footer=document.createElement("div");
  footer.className="menuFooter";
  footer.innerHTML=`<span>TAB · CONTROLS &nbsp;&nbsp; ESC · RELEASE MOUSE</span><span>STAY IN THE LIGHT. KEEP MOVING.</span>`;

  const editButton=document.createElement("button");
  editButton.type="button";
  editButton.className="menuEditButton";
  editButton.textContent="EDIT";

  const editor=document.createElement("section");
  editor.className="menuEditor";
  editor.innerHTML=
    '<div class="menuEditorTitle">MENU EDITOR</div>'+
    '<div class="menuEditorSub">Preview changes live. SAVE LOCAL remembers them on this browser. GITHUB EXPORT copies the values for committing to the repository.</div>'+
    '<div class="menuEditorGrid">'+
      '<div class="menuEditorRow"><label>BACKGROUND IMAGE URL</label><input id="menuEditorUrl" type="text" spellcheck="false"></div>'+
      '<div class="menuEditorRow"><label>HORIZONTAL POSITION</label><div class="menuEditorRange"><input id="menuEditorX" type="range" min="0" max="100" value="50"><output id="menuEditorXOut">50%</output></div></div>'+
      '<div class="menuEditorRow"><label>VERTICAL POSITION</label><div class="menuEditorRange"><input id="menuEditorY" type="range" min="0" max="100" value="50"><output id="menuEditorYOut">50%</output></div></div>'+
      '<div class="menuEditorRow"><label>BRIGHTNESS</label><div class="menuEditorRange"><input id="menuEditorBrightness" type="range" min="40" max="120" value="72"><output id="menuEditorBrightnessOut">72%</output></div></div>'+
      '<div class="menuEditorRow"><label>SATURATION</label><div class="menuEditorRange"><input id="menuEditorSaturation" type="range" min="50" max="160" value="118"><output id="menuEditorSaturationOut">118%</output></div></div>'+
      '<div class="menuEditorRow"><label>SEPIA</label><div class="menuEditorRange"><input id="menuEditorSepia" type="range" min="0" max="100" value="38"><output id="menuEditorSepiaOut">38%</output></div></div>'+
    '</div>'+
    '<div class="menuEditorActions">'+
      '<button id="menuEditorApply" type="button">APPLY</button>'+
      '<button id="menuEditorReset" type="button">RESET</button>'+
      '<button id="menuEditorLocal" type="button">SAVE LOCAL</button>'+
      '<button id="menuEditorGithub" type="button">GITHUB EXPORT</button>'+
    '</div>'+
    '<div id="menuEditorStatus" class="menuEditorStatus"></div>';

  const applyButton=editor.querySelector("#menuEditorApply");
  const resetButton=editor.querySelector("#menuEditorReset");
  const localButton=editor.querySelector("#menuEditorLocal");
  const githubButton=editor.querySelector("#menuEditorGithub");
  const urlInput=editor.querySelector("#menuEditorUrl");
  const xInput=editor.querySelector("#menuEditorX");
  const yInput=editor.querySelector("#menuEditorY");
  const brightnessInput=editor.querySelector("#menuEditorBrightness");
  const saturationInput=editor.querySelector("#menuEditorSaturation");
  const sepiaInput=editor.querySelector("#menuEditorSepia");
  const status=editor.querySelector("#menuEditorStatus");
  const outputX=editor.querySelector("#menuEditorXOut");
  const outputY=editor.querySelector("#menuEditorYOut");
  const outputB=editor.querySelector("#menuEditorBrightnessOut");
  const outputS=editor.querySelector("#menuEditorSaturationOut");
  const outputP=editor.querySelector("#menuEditorSepiaOut");

  const defaultMenuConfig={
    url:"https://images.unsplash.com/photo-1761251946420-8b65ad19f2e7?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=88&w=2400",
    x:50,
    y:50,
    brightness:72,
    saturation:118,
    sepia:38
  };
  let menuConfig={...defaultMenuConfig};
  try{
    const saved=JSON.parse(localStorage.getItem("deepseeker-menu-config")||"null");
    if(saved && typeof saved==="object") menuConfig={...menuConfig,...saved};
  }catch{}

  function syncMenuEditor(){
    urlInput.value=String(menuConfig.url||defaultMenuConfig.url);
    xInput.value=String(menuConfig.x);
    yInput.value=String(menuConfig.y);
    brightnessInput.value=String(menuConfig.brightness);
    saturationInput.value=String(menuConfig.saturation);
    sepiaInput.value=String(menuConfig.sepia);
    outputX.textContent=xInput.value+"%";
    outputY.textContent=yInput.value+"%";
    outputB.textContent=brightnessInput.value+"%";
    outputS.textContent=saturationInput.value+"%";
    outputP.textContent=sepiaInput.value+"%";
  }

  function readMenuEditor(){
    return {
      url:String(urlInput.value||"").trim(),
      x:Number(xInput.value),
      y:Number(yInput.value),
      brightness:Number(brightnessInput.value),
      saturation:Number(saturationInput.value),
      sepia:Number(sepiaInput.value)
    };
  }

  function applyMenuEditor(config){
    menuConfig={...defaultMenuConfig,...config};
    const safeUrl=String(menuConfig.url||defaultMenuConfig.url).replace(/"/g,"");
    backdrop.style.backgroundImage=
      "linear-gradient(90deg,rgba(5,6,4,.86) 0%,rgba(8,9,6,.54) 24%,rgba(12,11,7,.12) 55%,rgba(5,5,4,.28) 100%),"+
      "linear-gradient(180deg,rgba(58,46,17,.28),rgba(93,73,25,.12) 42%,rgba(5,5,4,.58) 100%),"+
      "url(\"" + safeUrl + "\")";
    backdrop.style.backgroundPosition=String(menuConfig.x)+"% "+String(menuConfig.y)+"%";
    backdrop.style.backgroundSize="cover";
    backdrop.style.filter=
      "sepia("+String(menuConfig.sepia)+"%) saturate("+String(menuConfig.saturation)+"%) contrast(1.08) brightness("+String(menuConfig.brightness)+"%)";
    syncMenuEditor();
  }

  for(const input of [xInput,yInput,brightnessInput,saturationInput,sepiaInput]){
    input.addEventListener("input",()=>{
      outputX.textContent=xInput.value+"%";
      outputY.textContent=yInput.value+"%";
      outputB.textContent=brightnessInput.value+"%";
      outputS.textContent=saturationInput.value+"%";
      outputP.textContent=sepiaInput.value+"%";
      applyMenuEditor(readMenuEditor());
    });
  }

  applyButton.addEventListener("click",()=>{
    applyMenuEditor(readMenuEditor());
    status.textContent="APPLIED";
  });

  resetButton.addEventListener("click",()=>{
    menuConfig={...defaultMenuConfig};
    applyMenuEditor(menuConfig);
    status.textContent="RESET";
  });

  localButton.addEventListener("click",()=>{
    menuConfig=readMenuEditor();
    applyMenuEditor(menuConfig);
    localStorage.setItem("deepseeker-menu-config",JSON.stringify(menuConfig));
    status.textContent="SAVED ON THIS BROWSER";
  });

  githubButton.addEventListener("click",async()=>{
    menuConfig=readMenuEditor();
    const snippet="const MENU_BACKGROUND_CONFIG="+JSON.stringify(menuConfig,null,2)+";";
    try{
      await navigator.clipboard.writeText(snippet);
      status.textContent="GITHUB CONFIG COPIED";
    }catch{
      window.prompt("Copy this config into the repo:",snippet);
    }
  });

  editButton.addEventListener("click",()=>{
    editor.classList.toggle("open");
    editButton.textContent=editor.classList.contains("open")?"CLOSE":"EDIT";
  });

  layout.append(editButton,editor);
  layout.append(logo,nav,slotBar,right,footer);



  homeScreen.appendChild(layout);

  window.__deepseekerMenu={};
}

function updateHouseLoadingUI(progress=null,status=null){
  const value=Number.isFinite(progress)
    ? Math.max(0,Math.min(100,Math.round(progress)))
    : (houseLoaded && houseCollisionReady ? 100 : houseLoaded ? 76 : 0);

  const message=status || (
    houseLoadFailed
      ? "APARTMENT FAILED TO LOAD."
      : houseCollisionReady
        ? "APARTMENT LOADED — READY WHEN NEEDED."
        : houseLoaded
          ? "PROCESSING APARTMENT — BUILDING COLLISION."
          : "APARTMENT LOADS ONLY WHEN THIS LEVEL IS NEEDED."
  );

  for(const fill of [houseLoadFillHome,houseLoadFillLobby]){
    if(fill) fill.style.width=value+"%";
  }
  for(const label of [houseLoadPercentHome,houseLoadPercentLobby]){
    if(label) label.textContent=value+"%";
  }
  for(const label of [houseLoadStatusHome,houseLoadStatusLobby]){
    if(label) label.textContent=message;
  }

  const save=getSavedGame(selectedSaveSlot);
  if(newGameButton) newGameButton.disabled=false;
  if(continueButton) continueButton.disabled=!save;

  if(startLobbyButton && !new URLSearchParams(location.search).has("lobby")){
    startLobbyButton.disabled=false;
  }

  for(const button of [newGameButton,continueButton,startLobbyButton]){
    if(!button) continue;
    button.style.opacity=button.disabled ? ".38" : "1";
  }
}

async function saveGame(slot=selectedSaveSlot){
  const targetSlot=normalizeSaveSlot(slot);
  setSelectedSaveSlot(targetSlot,false);

  const params=new URLSearchParams(location.search);
  const roomCode=(params.get("room")||"").trim().toUpperCase();

  let playerName="Player";
  try{
    playerName=multiplayer.getPlayerName();
  }catch{}

  const data={
    version:5,
    seed:SEED,
    level:houseMode ? "apartment" : "backrooms",
    savedAt:Date.now(),
    saveSlot:targetSlot,
    saveType:roomCode ? "MULTIPLAYER" : "SOLO",
    roomCode:roomCode || null,
    playerName,
    x:Number(player.pos.x),
    z:Number(player.pos.z),
    yaw:Number(player.yaw),
    pitch:Number(player.pitch),
    storyStage,
    maxStoryDistance,
    battery,
    flashlightOn,
    houseMode
  };

  const stored=persistSaveSlot(targetSlot,data);
  let indexedStored=false;

  try{
    indexedStored=await writeIndexedSaveSlot(targetSlot,data);
  }catch(error){
    console.warn("[DeepSeeker] IndexedDB save failed:",error);
  }

  const verified=getSavedGame(targetSlot);
  const verifiedOk=Boolean(
    verified &&
    verified.saveSlot===targetSlot &&
    verified.savedAt===data.savedAt &&
    Number(verified.x)===data.x &&
    Number(verified.z)===data.z
  );

  if(!stored && !indexedStored){
    console.error("[DeepSeeker] No persistent save backend accepted slot",targetSlot);
    eventText.textContent=`SAVE FAILED · SLOT ${targetSlot}`;
    eventText.style.opacity="1";
    return false;
  }

  if(!verifiedOk){
    console.warn("[DeepSeeker] Save verified only from fallback cache",{
      slot:targetSlot,
      verified
    });
  }

  refreshSaveInfo();
  updateSaveSlotLabels();

  eventText.textContent=`GAME SAVED · SLOT ${targetSlot}`;
  eventText.style.opacity="1";
  setTimeout(()=>{
    if(eventText.textContent===`GAME SAVED · SLOT ${targetSlot}`){
      eventText.style.opacity="0";
    }
  },1100);

  return true;
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
  player.keys.clear();

  battery=Number.isFinite(data.battery)
    ? THREE.MathUtils.clamp(data.battery,0,100)
    : 100;
  flashlightOn=data.flashlightOn!==false;
  player.setFlashlightVisual(flashlightOn);

  const stage=Number.isInteger(data.storyStage)
    ? THREE.MathUtils.clamp(data.storyStage,0,STORY.length-1)
    : 0;
  maxStoryDistance=Number.isFinite(data.maxStoryDistance)
    ? data.maxStoryDistance
    : 0;
  applyStoryStage(stage,false);

  const savedLevel=getSavedLevel(data);
  if(savedLevel==="apartment" && houseLoaded){
    setHouseMode(true,{announceFall:false});
  }else{
    setHouseMode(false,{announceFall:false});
  }
}

function showHomeScreen(){
  loadingScreen.style.display="none";
  homeScreen.classList.remove("hidden");
  lobbyScreen.classList.add("hidden");
  refreshSaveInfo();
  updateHouseLoadingUI();
}

function showLobbyScreen(){
  loadingScreen.style.display="none";
  homeScreen.classList.add("hidden");
  lobbyScreen.classList.remove("hidden");
  updateHouseLoadingUI();

  const params=new URLSearchParams(location.search);
  const code=(params.get("room")||"").toUpperCase();
  const host=params.get("host")==="1";
  roomCode.textContent=code||"------";
  lobbyModeTitle.textContent=host?"CREATE LOBBY":"JOIN LOBBY";
  const save=getSavedGame(selectedSaveSlot);
  startLobbyButton.textContent=host
    ? (save ? `CONTINUE SLOT ${selectedSaveSlot}` : `START NEW SLOT ${selectedSaveSlot}`)
    : "READY / START";
  startLobbyButton.style.display="block";
  updateSaveSlotLabels();
}

function disposeHouseResources(){
  if(!houseModel) return;

  houseRoot.remove(houseModel);

  houseModel.traverse(obj=>{
    if(!obj.isMesh) return;

    if(obj.geometry){
      obj.geometry.dispose();
    }

    const materials=Array.isArray(obj.material)
      ? obj.material
      : [obj.material];

    for(const material of materials){
      if(!material) continue;
      material.dispose();
    }
  });

  houseModel=null;
  houseCollisionBoxes.length=0;
  houseCollisionRefreshTimer=0;
  houseCollisionFocusX=NaN;
  houseCollisionFocusZ=NaN;
  houseReturnPortal.visible=false;
  houseReturnPortal.userData.active=false;

  houseLoaded=false;
  houseCollisionReady=false;
  houseCollisionBuildStarted=false;
  houseLoadStarted=false;
  houseDoorCollisionDirty=true;

  updateHouseLoadingUI(0,"HOUSE UNLOADED — WILL RELOAD WHEN NEEDED.");
  console.log("[DeepSeeker] house fully unloaded from memory");
}

function shouldKeepHouseLoaded(){
  return houseMode || multiplayer.hasPlayerInHouse();
}

function updateHouseMemoryState(dt){
  if(!gameStarted) return;

  if(shouldKeepHouseLoaded()){
    houseUnloadTimer=0;
    return;
  }

  // Give the level a small grace period after leaving so a rapid return does
  // not immediately destroy and rebuild the GLB.
  houseUnloadTimer+=dt;
  if(houseUnloadTimer>=1.5 && houseLoaded && !houseLoadStarted){
    disposeHouseResources();
    houseUnloadTimer=0;
  }
}

function ensureHouseLoading(){
  if(houseLoadStarted || houseLoaded) return;

  if(houseLoadFailed){
    houseLoadFailed=false;
  }

  houseLoadStarted=true;
  updateHouseLoadingUI(0,"HOUSE IS STARTING TO LOAD…");
  const start=()=>loadHouse();

  if("requestIdleCallback" in window){
    window.requestIdleCallback(start,{timeout:3500});
  }else{
    setTimeout(start,1200);
  }
}

function startGame(save=null,saveSlot=selectedSaveSlot){
  setSelectedSaveSlot(saveSlot,false);
  // New games begin in the apartment. Continue only loads the apartment when
  // the saved level says the player was actually there.
  const needsApartment=!save || getSavedLevel(save)==="apartment";

  if(needsApartment && (!houseLoaded || !houseCollisionReady)){
    pendingHouseStart=true;
    pendingSaveLoad=save;
    pendingNewGameSlot=save ? null : normalizeSaveSlot(saveSlot);
    ensureHouseLoading();

    prompt.textContent=houseLoadFailed
      ? "APARTMENT FAILED TO LOAD"
      : "LOADING APARTMENT…";
    eventText.textContent=houseLoadFailed
      ? "APARTMENT FAILED TO LOAD"
      : "APARTMENT STILL LOADING...";
    eventText.style.opacity="1";
    return false;
  }

  gameStarted=true;
  ensureSpiderLoading();
  overlay.classList.add("hidden");
  audio.start();

  pendingHouseStart=false;
  pendingSaveLoad=null;
  pendingNewGameSlot=null;

  if(save){
    applySavedGame(save);
  }else{
    setHouseMode(true,{announceFall:false});
  }

  player.lock();

  // Creating a new slot immediately writes an initial checkpoint instead of
  // leaving the slot empty until the 20-second autosave.
  if(!save){
    saveGame(saveSlot);
  }

  return true;
}

function continueGame(slot=selectedSaveSlot){
  setSelectedSaveSlot(slot,false);
  const save=getSavedGame(slot);
  if(!save) return;

  if(save.seed!==SEED){
    const params=new URLSearchParams(location.search);
    params.set("seed",String(save.seed));
    params.set("save","1");
    params.set("saveSlot",String(slot));
    location.href=location.pathname+"?"+params.toString();
    return;
  }

  startGame(save,slot);
}

function resetForNewGame(slot=selectedSaveSlot){
  const targetSlot=normalizeSaveSlot(slot);

  // A NEW slot must always be a fresh run, even when another game or
  // an unfinished apartment load is still active.
  setSelectedSaveSlot(targetSlot,false);
  pendingHouseStart=false;
  pendingSaveLoad=null;
  toggleMultiplayerMap(false);
  houseIntroMessageShown=false;
  lastAutoSave=0;

  backroomsFallTimer=0;
  backroomsFallElapsed=0;
  backroomsFallStartAt=0;
  fallCameraOffset=0;

  spiderActive=false;
  spiderJumpscareTimer=0;
  spiderBehaviorState="idle";
  spiderBehaviorTime=0;
  spiderEntity.visible=false;

  gameStarted=false;

  player.pos.set(32,EYE,32);
  player.yaw=0;
  player.pitch=0;
  player.vel.set(0,0,0);
  player.keys.clear();
  player.jumpY=0;
  player.jumpVelocity=0;
  battery=100;
  flashlightOn=true;
  player.setFlashlightVisual(true);
  maxStoryDistance=0;

  // Reset the level state without relying on the previous run's state.
  if(houseMode){
    setHouseMode(false,{announceFall:false});
  }else{
    world.root.visible=true;
    houseRoot.visible=false;
    player.ignoreWorldCollision=false;
    player.extraCollisionBoxes=[];
  }

  applyStoryStage(0,false);
  eventText.textContent=`STARTING NEW GAME · SLOT ${targetSlot}`;
  eventText.style.opacity="1";

  startGame(null,targetSlot);
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
const usernameInputs=[
  document.getElementById("usernameInput"),
  document.getElementById("lobbyUsernameInput")
].filter(Boolean);
const usernameSaveButton=document.getElementById("usernameSaveButton");
const chatPanel=document.getElementById("chatPanel");
const chatMessages=document.getElementById("chatMessages");
const chatInput=document.getElementById("chatInput");
let chatOpen=false;
let chatHideTimer=0;

const multiplayer=new Multiplayer({
  scene,
  player,
  getLevel:()=>houseMode,
  getFlashlightOn:()=>flashlightOn,
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
      startGame(getSavedGame(selectedSaveSlot),selectedSaveSlot);
    }
  },
  onSharedFall:(startedAt)=>{
    startBackroomsFall(startedAt,false);
  },
  onChat:({sender,message,self=false})=>{
    const row=document.createElement("div");
    row.className="chatMessage";
    const name=document.createElement("span");
    name.className="chatName";
    name.textContent=self ? "YOU" : String(sender||"PLAYER").slice(0,20);
    const text=document.createElement("span");
    text.className="chatText";
    text.textContent=String(message||"").slice(0,120);
    row.append(name,text);
    chatMessages.appendChild(row);
    while(chatMessages.children.length>30) chatMessages.firstChild.remove();

    chatPanel.classList.add("visible");
    clearTimeout(chatHideTimer);
    if(!chatOpen){
      chatHideTimer=setTimeout(()=>{
        if(!chatOpen) chatPanel.classList.remove("visible");
      },6500);
    }
    chatMessages.scrollTop=chatMessages.scrollHeight;
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
    const self=players.find(p=>p.self);
    if(self){
      usernameInputs.forEach(input=>{
        if(document.activeElement!==input) input.value=String(self.name||"");
      });
    }
  }
});


let multiplayerMapOpen=false;
const multiplayerMap=document.createElement("div");
multiplayerMap.id="multiplayerMap";
multiplayerMap.innerHTML="<div id='multiplayerMapHeader'><span>MULTIPLAYER MAP</span><span id='multiplayerMapLevel'>BACKROOMS</span></div><canvas id='multiplayerMapCanvas' width='240' height='240'></canvas><div id='multiplayerMapLegend'>N · CLOSE MAP</div>";
document.body.appendChild(multiplayerMap);

const multiplayerMapCanvas=document.getElementById("multiplayerMapCanvas");
const multiplayerMapContext=multiplayerMapCanvas.getContext("2d");
const multiplayerMapLevel=document.getElementById("multiplayerMapLevel");

const multiplayerMapStyle=document.createElement("style");
multiplayerMapStyle.textContent=`
#multiplayerMap{position:fixed;top:18px;right:18px;width:min(252px,34vw);min-width:210px;aspect-ratio:1;z-index:8;display:none;padding:9px;box-sizing:border-box;border:1px solid rgba(216,201,138,.28);border-radius:16px;background:rgba(5,7,5,.82);box-shadow:0 18px 55px rgba(0,0,0,.52),inset 0 1px rgba(255,255,255,.04);backdrop-filter:blur(8px);pointer-events:none}
#multiplayerMap.visible{display:block}
#multiplayerMapHeader{position:absolute;top:10px;left:12px;right:12px;display:flex;justify-content:space-between;gap:8px;font-size:8px;letter-spacing:1.7px;color:#d5cda8;text-shadow:0 2px 8px #000;z-index:2}
#multiplayerMapLevel{color:#8e8a72}
#multiplayerMapCanvas{width:100%;height:100%;display:block;border-radius:11px}
#multiplayerMapLegend{position:absolute;left:12px;bottom:10px;font-size:7px;letter-spacing:1.4px;color:#8f8a73;text-shadow:0 2px 8px #000}
@media(max-width:700px){#multiplayerMap{width:210px;min-width:0}}
`;
document.head.appendChild(multiplayerMapStyle);

function toggleMultiplayerMap(force=null){
  if(!gameStarted && force!==true) return;
  multiplayerMapOpen=force===null ? !multiplayerMapOpen : Boolean(force);
  multiplayerMap.classList.toggle("visible",multiplayerMapOpen);
  if(multiplayerMapOpen) updateMultiplayerMap();
}

function projectMapPoint(x,z,centerX,centerY,scale,yaw){
  const dx=x-player.pos.x;
  const dz=z-player.pos.z;
  const forwardX=-Math.sin(yaw);
  const forwardZ=-Math.cos(yaw);
  const rightX=Math.cos(yaw);
  const rightZ=-Math.sin(yaw);
  return {
    x:centerX+(dx*rightX+dz*rightZ)*scale,
    y:centerY-(dx*forwardX+dz*forwardZ)*scale
  };
}

function updateMultiplayerMap(){
  if(!multiplayerMapOpen) return;

  const ctx=multiplayerMapContext;
  const width=multiplayerMapCanvas.width;
  const height=multiplayerMapCanvas.height;
  const centerX=width/2;
  const centerY=height/2;
  const radius=width*.42;
  const range=55;
  const scale=radius/range;
  const currentLevel=houseMode ? "house" : "backrooms";

  ctx.clearRect(0,0,width,height);
  ctx.fillStyle="rgba(7,9,7,.94)";
  ctx.fillRect(0,0,width,height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX,centerY,radius,0,Math.PI*2);
  ctx.clip();

  ctx.strokeStyle="rgba(216,201,138,.08)";
  ctx.lineWidth=1;
  for(let ring=1;ring<=3;ring++){
    ctx.beginPath();
    ctx.arc(centerX,centerY,radius*ring/3,0,Math.PI*2);
    ctx.stroke();
  }

  if(currentLevel==="backrooms"){
    const walls=world.getNearbyWallBounds(player.pos.x,player.pos.z,range+6);
    for(const wall of walls){
      const corners=[
        projectMapPoint(wall.minX,wall.minZ,centerX,centerY,scale,player.yaw),
        projectMapPoint(wall.maxX,wall.minZ,centerX,centerY,scale,player.yaw),
        projectMapPoint(wall.maxX,wall.maxZ,centerX,centerY,scale,player.yaw),
        projectMapPoint(wall.minX,wall.maxZ,centerX,centerY,scale,player.yaw)
      ];

      ctx.strokeStyle="rgba(196,188,151,.34)";
      ctx.lineWidth=3;
      ctx.beginPath();
      ctx.moveTo(corners[0].x,corners[0].y);
      for(let i=1;i<corners.length;i++) ctx.lineTo(corners[i].x,corners[i].y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  for(const remote of multiplayer.players.values()){
    const state=remote.current || remote.target;
    if(!state || state.level!==currentLevel) continue;

    const raw=projectMapPoint(state.x,state.z,centerX,centerY,scale,player.yaw);
    const dx=raw.x-centerX;
    const dy=raw.y-centerY;
    const distance=Math.hypot(dx,dy);
    const maxRadius=radius-10;
    const clamped=Math.min(distance,maxRadius);
    const ratio=distance>0 ? clamped/distance : 0;
    const pointX=centerX+dx*ratio;
    const pointY=centerY+dy*ratio;
    const onEdge=distance>maxRadius;

    ctx.save();
    ctx.translate(pointX,pointY);

    if(onEdge){
      ctx.rotate(Math.atan2(dy,dx)+Math.PI/2);
      ctx.fillStyle="#d8c98a";
      ctx.beginPath();
      ctx.moveTo(0,-8);
      ctx.lineTo(6,7);
      ctx.lineTo(-6,7);
      ctx.closePath();
      ctx.fill();
    }else{
      ctx.fillStyle="#d8c98a";
      ctx.beginPath();
      ctx.arc(0,0,5,0,Math.PI*2);
      ctx.fill();

      ctx.fillStyle="#17170f";
      ctx.beginPath();
      ctx.arc(0,0,2,0,Math.PI*2);
      ctx.fill();

      ctx.font="600 10px system-ui, sans-serif";
      ctx.textAlign="center";
      ctx.textBaseline="top";
      ctx.fillStyle="rgba(238,231,198,.92)";
      ctx.fillText(String(remote.name||"PLAYER").slice(0,14),0,8);
    }

    ctx.restore();
  }

  ctx.fillStyle="#eee4b8";
  ctx.beginPath();
  ctx.arc(centerX,centerY,7,0,Math.PI*2);
  ctx.fill();

  ctx.strokeStyle="#17170f";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(centerX,centerY);
  ctx.lineTo(centerX,centerY-10);
  ctx.stroke();

  ctx.restore();

  ctx.strokeStyle="rgba(216,201,138,.34)";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.arc(centerX,centerY,radius,0,Math.PI*2);
  ctx.stroke();

  multiplayerMapLevel.textContent=currentLevel==="house" ? "APARTMENT" : "BACKROOMS";
  if(!multiplayer.playerId) multiplayerMapLevel.textContent="CONNECTING";
}

function refreshUsernameInputs(){
  const name=multiplayer.getPlayerName();
  usernameInputs.forEach(input=>input.value=name);
}

function saveUsername(name){
  const clean=multiplayer.setPlayerName(name);
  usernameInputs.forEach(input=>input.value=clean);
  eventText.textContent="USERNAME SAVED";
  eventText.style.opacity="1";
  setTimeout(()=>{
    if(eventText.textContent==="USERNAME SAVED") eventText.style.opacity="0";
  },1200);
}

function openChat(){
  if(!gameStarted || phoneOpen || controlsOpen) return;
  chatOpen=true;
  chatPanel.classList.add("visible","open");
  clearTimeout(chatHideTimer);
  if(document.pointerLockElement===renderer.domElement) document.exitPointerLock();
  chatInput.value="";
  setTimeout(()=>chatInput.focus(),0);
}

function closeChat(resume=true){
  chatOpen=false;
  chatPanel.classList.remove("open");
  chatInput.blur();
  clearTimeout(chatHideTimer);
  chatHideTimer=setTimeout(()=>{
    if(!chatOpen) chatPanel.classList.remove("visible");
  },4500);
  if(resume && gameStarted && !phoneOpen && !controlsOpen) player.lock();
}

const houseDoors=[];
const houseRoot=new THREE.Group();
houseRoot.name="ApartmentWorld";
houseRoot.visible=false;
scene.add(houseRoot);

const houseReturnPortal=new THREE.Group();
houseReturnPortal.name="HouseHiddenReturnTeleporter";

// The apartment's magazine is the teleporter target. The group itself stays
// invisible; the real magazine remains exactly as authored in the GLB.
houseReturnPortal.visible=false;
houseReturnPortal.userData.active=false;
houseRoot.add(houseReturnPortal);

// Low-cost apartment ambience. The flashlight handles local illumination.
const houseAmbient=new THREE.HemisphereLight(0xffe6b0,0x3c2818,0.55);
houseRoot.add(houseAmbient);

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
  // The new asset is an open-plan studio apartment. Do not carry over the
  // old house-specific door removal rules.
  houseDoors.length=0;
  console.log("[DeepSeeker] apartment doors left in place; no interactive house doors configured");
}

function updateHouseDoors(dt){
  let changed=false;

  for(const door of houseDoors){
    const current=door.pivot.userData.openProgress||0;
    const next=THREE.MathUtils.lerp(
      current,
      door.pivot.userData.target||0,
      Math.min(1,dt*6)
    );

    if(Math.abs(next-current)>0.0005) changed=true;

    door.pivot.userData.openProgress=next;
    door.pivot.rotation.y=door.angle*next;
  }

  if(changed) houseDoorCollisionDirty=true;
}


function buildHouseCollisionProxies(root){
  houseCollisionBoxes.length=0;
  root.updateMatrixWorld(true);

  // Use the apartment's actual vertical wall faces instead of whole-mesh
  // bounding-box guesses. This catches walls inside combined meshes.
  const skipPattern=/chair|sofa|couch|table|desk|bed|cabinet|wardrobe|shelf|bookcase|lamp|light|plant|tv|monitor|computer|counter|stool|oven|fridge|refrigerator|sink|toilet|bathtub|shower|curtain|rug|carpet|painting|picture|decor|drawer|coffee|cup/i;

  const a=new THREE.Vector3();
  const b=new THREE.Vector3();
  const d=new THREE.Vector3();
  const e1=new THREE.Vector3();
  const e2=new THREE.Vector3();
  const normal=new THREE.Vector3();
  const worldA=new THREE.Vector3();
  const worldB=new THREE.Vector3();
  const worldC=new THREE.Vector3();

  root.traverse((obj)=>{
    if(!obj.isMesh || !obj.geometry) return;
    if(obj.userData.houseCollisionDoor || obj.userData.houseRemovedDoor) return;
    if(skipPattern.test(String(obj.name||""))) return;

    const geometry=obj.geometry;
    const position=geometry.attributes.position;
    if(!position) return;

    const index=geometry.index;
    const triCount=index ? Math.floor(index.count/3) : Math.floor(position.count/3);

    for(let tri=0;tri<triCount;tri++){
      const ia=index ? index.getX(tri*3) : tri*3;
      const ib=index ? index.getX(tri*3+1) : tri*3+1;
      const ic=index ? index.getX(tri*3+2) : tri*3+2;

      a.fromBufferAttribute(position,ia);
      b.fromBufferAttribute(position,ib);
      d.fromBufferAttribute(position,ic);

      worldA.copy(a).applyMatrix4(obj.matrixWorld);
      worldB.copy(b).applyMatrix4(obj.matrixWorld);
      worldC.copy(d).applyMatrix4(obj.matrixWorld);

      const minY=Math.min(worldA.y,worldB.y,worldC.y);
      const maxY=Math.max(worldA.y,worldB.y,worldC.y);
      const height=maxY-minY;

      if(height<1.15 || maxY<0.55 || minY>1.75) continue;

      e1.subVectors(worldB,worldA);
      e2.subVectors(worldC,worldA);
      normal.crossVectors(e1,e2);
      const normalLength=normal.length();
      if(normalLength<1e-5) continue;
      normal.multiplyScalar(1/normalLength);

      // Only near-vertical faces can block horizontal player movement.
      if(Math.abs(normal.y)>0.38) continue;

      const minX=Math.min(worldA.x,worldB.x,worldC.x);
      const maxX=Math.max(worldA.x,worldB.x,worldC.x);
      const minZ=Math.min(worldA.z,worldB.z,worldC.z);
      const maxZ=Math.max(worldA.z,worldB.z,worldC.z);
      if(Math.max(maxX-minX,maxZ-minZ)<0.55) continue;

      // Ignore tiny decorative slivers.
      if(normalLength*.5<0.08) continue;

      const pad=.055;
      houseCollisionBoxes.push({
        minX:minX-pad,
        maxX:maxX+pad,
        minZ:minZ-pad,
        maxZ:maxZ+pad
      });
    }
  });

  console.log("[DeepSeeker] apartment wall-face collision boxes:",houseCollisionBoxes.length);
}

function freezeStaticHouseTransforms(root){
  root.traverse((obj)=>{
    if(obj===root) return;
    obj.updateMatrix();
    obj.matrixAutoUpdate=false;
    obj.matrixWorldNeedsUpdate=true;
  });
  root.updateMatrixWorld(true);
}

function prepareHouseRenderCulling(root){
  root.traverse((obj)=>{
    if(!obj.isMesh) return;
    obj.visible=!obj.userData.houseRemovedDoor;
    obj.frustumCulled=true;
  });
}

function updateHouseDoorCollisions(){
  // Do not give the player every house collider at once. The GLB contains
  // furniture-sized AABBs as well as walls, and checking all of them every
  // movement sample can trap the player against distant geometry.
  //
  // Refresh this small local list a few times per second. Collision itself
  // then checks only nearby boxes every frame.
  const boxes=[];
  const px=player.pos.x;
  const pz=player.pos.z;
  const range=9;
  const rangeSq=range*range;

  for(const box of houseCollisionBoxes){
    const nx=Math.max(box.minX,Math.min(px,box.maxX));
    const nz=Math.max(box.minZ,Math.min(pz,box.maxZ));
    const dx=px-nx;
    const dz=pz-nz;
    if(dx*dx+dz*dz<=rangeSq){
      boxes.push(box);
    }
  }

  for(const door of houseDoors){
    const open=door.pivot.userData.openProgress||0;

    // Locked doors always block. Functional doors only block while closed.
    if(door.functional && open>0.72) continue;

    door.pivot.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(door.pivot);

    const centerX=(box.min.x+box.max.x)*.5;
    const centerZ=(box.min.z+box.max.z)*.5;
    const dx=centerX-px;
    const dz=centerZ-pz;
    if(dx*dx+dz*dz>rangeSq) continue;

    // A small horizontal padding prevents squeezing through door geometry.
    const pad=.08;
    door.collisionBox.minX=box.min.x-pad;
    door.collisionBox.maxX=box.max.x+pad;
    door.collisionBox.minZ=box.min.z-pad;
    door.collisionBox.maxZ=box.max.z+pad;
    door.collisionBox.rotationY=0;

    // Same spawn protection for door pivots. A door accidentally discovered
    // at the center should not make the initial player position immovable.
    const doorOverlapsSpawn =
      houseSpawn.x >= door.collisionBox.minX-.65 &&
      houseSpawn.x <= door.collisionBox.maxX+.65 &&
      houseSpawn.z >= door.collisionBox.minZ-.65 &&
      houseSpawn.z <= door.collisionBox.maxZ+.65;

    if(!doorOverlapsSpawn){
      boxes.push(door.collisionBox);
    }
  }

  player.extraCollisionBoxes=boxes;
  houseCollisionFocusX=px;
  houseCollisionFocusZ=pz;
  houseCollisionRefreshTimer=.12;
  houseDoorCollisionDirty=false;
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
  houseDoorCollisionDirty=true;
  eventText.textContent=best.pivot.userData.target ? "DOOR OPENING" : "DOOR CLOSING";
  eventText.style.opacity="1";
  setTimeout(()=>{eventText.style.opacity="0";},700);
  return true;
}

function chooseSafeHouseSpawn(root){
  if(!root) return false;

  const bounds=new THREE.Box3().setFromObject(root);
  const width=Math.max(.1,bounds.max.x-bounds.min.x);
  const depth=Math.max(.1,bounds.max.z-bounds.min.z);

  const blocked=(x,z,radius=.55)=>{
    for(const box of houseCollisionBoxes){
      const nx=Math.max(box.minX,Math.min(x,box.maxX));
      const nz=Math.max(box.minZ,Math.min(z,box.maxZ));
      const dx=x-nx;
      const dz=z-nz;
      if(dx*dx+dz*dz<radius*radius) return true;
    }
    return false;
  };

  const floorYAt=(x,z)=>{
    houseFloorRaycaster.set(
      new THREE.Vector3(x,bounds.max.y+.5,z),
      new THREE.Vector3(0,-1,0)
    );
    const hits=houseFloorRaycaster.intersectObject(root,true);

    for(const hit of hits){
      if(!hit.face) continue;
      const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if(normal.y<.72) continue;
      if(hit.point.y<-.05 || hit.point.y>.22) continue;
      return hit.point.y;
    }
    return null;
  };

  // Sample the real apartment footprint instead of the old house's
  // hard-coded living-room coordinates.
  const candidates=[];
  const fractions=[
    [0,0],
    [-.12,0],[.12,0],[0,-.12],[0,.12],
    [-.22,-.12],[.22,-.12],[-.22,.12],[.22,.12],
    [-.30,0],[.30,0],[0,-.30],[0,.30]
  ];

  for(const [fx,fz] of fractions){
    const x=THREE.MathUtils.clamp(fx*width,bounds.min.x+.8,bounds.max.x-.8);
    const z=THREE.MathUtils.clamp(fz*depth,bounds.min.z+.8,bounds.max.z-.8);

    if(blocked(x,z,.55)) continue;
    const y=floorYAt(x,z);
    if(y===null) continue;

    let clearance=999;
    for(const box of houseCollisionBoxes){
      const nx=Math.max(box.minX,Math.min(x,box.maxX));
      const nz=Math.max(box.minZ,Math.min(z,box.maxZ));
      clearance=Math.min(clearance,Math.hypot(x-nx,z-nz));
    }

    candidates.push({
      x,z,y,clearance,
      centerDistance:Math.hypot(fx,fz)
    });
  }

  candidates.sort((a,b)=>
    (b.clearance-b.centerDistance*.8)-
    (a.clearance-a.centerDistance*.8)
  );

  if(candidates.length){
    const best=candidates[0];
    houseSpawn.set(best.x,EYE,best.z);
    console.log("[DeepSeeker] apartment spawn:",{
      x:Number(best.x.toFixed(2)),
      z:Number(best.z.toFixed(2)),
      floorY:Number(best.y.toFixed(2))
    });
    return true;
  }

  houseSpawn.set(0,EYE,0);
  console.warn("[DeepSeeker] no sampled apartment floor position found; using center");
  return true;
}

function placeHouseMagazineTeleporter(root){
  if(!root) return false;

  const magazinePattern=/magazine|newspaper|journal|brochure|catalog|paper|book/i;
  const couchPattern=/sofa|couch|sectional|loveseat|settee/i;
  const candidates=[];
  const couches=[];
  const box=new THREE.Box3();
  const size=new THREE.Vector3();
  const center=new THREE.Vector3();

  root.updateMatrixWorld(true);

  root.traverse((obj)=>{
    if(!obj.isMesh || !obj.geometry) return;

    box.setFromObject(obj);
    box.getSize(size);
    box.getCenter(center);

    if(size.x<.06 || size.z<.06) return;

    const name=String(obj.name||"");

    if(couchPattern.test(name)){
      couches.push({
        object:obj,
        box:box.clone(),
        size:size.clone(),
        center:center.clone()
      });
    }

    if(!magazinePattern.test(name)) return;

    const horizontal=Math.max(size.x,size.z);
    const vertical=size.y;

    if(horizontal>1.5 || vertical>0.35 || vertical>horizontal*.45) return;

    candidates.push({
      object:obj,
      box:box.clone(),
      size:size.clone(),
      center:center.clone(),
      name
    });
  });

  const scoreCandidate=(candidate)=>{
    let score=0;

    for(const couch of couches){
      const onCouch =
        candidate.center.x>=couch.box.min.x-.45 &&
        candidate.center.x<=couch.box.max.x+.45 &&
        candidate.center.z>=couch.box.min.z-.45 &&
        candidate.center.z<=couch.box.max.z+.45 &&
        candidate.box.max.y>=couch.box.min.y+.15 &&
        candidate.box.min.y<=couch.box.max.y+.55;

      if(onCouch){
        const dx=candidate.center.x-couch.center.x;
        const dz=candidate.center.z-couch.center.z;
        score+=1000-Math.hypot(dx,dz)*60;
      }
    }

    score+=Math.max(0,1-candidate.size.y/.35)*80;
    return score;
  };

  candidates.sort((a,b)=>scoreCandidate(b)-scoreCandidate(a));

  if(candidates.length){
    const best=candidates[0];
    houseReturnPortal.position.set(
      best.center.x,
      best.box.max.y+.015,
      best.center.z
    );
    houseReturnPortal.rotation.y=0;
    houseReturnPortal.userData.active=true;
    houseReturnPortal.userData.targetType="magazine";
    houseReturnPortal.userData.targetName=best.name;

    console.log("[DeepSeeker] magazine teleporter target:",{
      name:best.name,
      x:Number(best.center.x.toFixed(2)),
      y:Number((best.box.max.y+.015).toFixed(2)),
      z:Number(best.center.z.toFixed(2))
    });
    return true;
  }

  // Name-independent fallback: put the interaction point on the couch rather
  // than creating another fake prop or putting it on the apartment floor.
  if(couches.length){
    const couch=couches[0];
    houseReturnPortal.position.set(
      couch.center.x,
      couch.box.max.y+.02,
      couch.center.z
    );
    houseReturnPortal.rotation.y=0;
    houseReturnPortal.userData.active=true;
    houseReturnPortal.userData.targetType="couch";
    houseReturnPortal.userData.targetName=String(couch.object.name||"couch");
    console.warn("[DeepSeeker] magazine mesh was not named; using couch target");
    return true;
  }

  houseReturnPortal.userData.active=false;
  console.warn("[DeepSeeker] could not locate magazine/couch target");
  return false;
}

function useHouseReturnTeleporter(){
  if(!houseMode || backroomsFallTimer>0) return false;

  const d=Math.hypot(
    player.pos.x-houseReturnPortal.position.x,
    player.pos.z-houseReturnPortal.position.z
  );

  if(d>2.2) return false;

  player.keys.clear();
  player.vel.set(0,0,0);
  return startBackroomsFall(Date.now(),true);
}

function ensureHouseCollisionSetup(){
  if(!houseLoaded || houseCollisionReady || houseCollisionBuildStarted || !houseModel) return;

  houseCollisionBuildStarted=true;
  const build=()=>{
    const started=performance.now();

    updateHouseLoadingUI(82,"PROCESSING HOUSE — PREPARING COLLISION…");
    setupHouseDoors(houseModel);
    updateHouseLoadingUI(86,"PROCESSING HOUSE — BUILDING WALL COLLISION…");
    for(const door of houseDoors){
      door.pivot.traverse(obj=>{
        obj.userData.houseCollisionDoor=true;
      });
    }

    buildHouseCollisionProxies(houseModel);
    updateHouseLoadingUI(91,"PROCESSING HOUSE — FINALIZING STATIC HOUSE…");
    freezeStaticHouseTransforms(houseModel);
    chooseSafeHouseSpawn(houseModel);
    placeHouseMagazineTeleporter(houseModel);
    houseCollisionReady=true;
    houseCollisionBuildStarted=false;

    console.log("[DeepSeeker] house collision ready in",Math.round(performance.now()-started),"ms");
    updateHouseLoadingUI(100,"HOUSE LOADED — GAME READY.");

    // A start request may have been queued while the GLB or collision setup
    // was loading. Only enter the playable level after both are ready.
    if(pendingHouseStart && !gameStarted){
      pendingHouseStart=false;
      gameStarted=true;
      overlay.classList.add("hidden");

      if(pendingSaveLoad){
        const queuedSave=pendingSaveLoad;
        pendingSaveLoad=null;
        applySavedGame(queuedSave);
      }else{
        setHouseMode(true);
      }

      audio.start();
      player.lock();

      // The pending new-game path bypasses startGame() while the apartment
      // finishes loading, so create the slot checkpoint here too.
      if(pendingNewGameSlot!==null){
        const newSlot=pendingNewGameSlot;
        pendingNewGameSlot=null;
        saveGame(newSlot);
      }
    }else if(gameStarted){
      if(pendingHouseStart){
        pendingHouseStart=false;
        setHouseMode(true);
      }else{
        eventText.textContent="APARTMENT READY";
        eventText.style.opacity="1";
        setTimeout(()=>{eventText.style.opacity="0";},1000);
      }
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

      // The imported model is the entire apartment level.
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

      prepareHouseRenderCulling(houseModel);

      houseLoaded=true;
      houseLoadFailed=false;
      updateHouseLoadingUI(76,"HOUSE DOWNLOADED — PROCESSING MODEL…");
      houseRoot.visible=false;

      // The asset is now safe to start from. Collision setup can finish in the
      // background without letting the player enter before the GLB exists.
      ensureHouseCollisionSetup();

      if(pendingHouseStart && !gameStarted && houseCollisionReady){
        pendingHouseStart=false;
        setHouseMode(true);
        gameStarted=true;
        overlay.classList.add("hidden");
        audio.start();
        player.lock();
      }

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
        const downloadPercent=Math.min(
          100,
          Math.max(0,Math.round(xhr.loaded/xhr.total*100))
        );
        const overallPercent=Math.round(downloadPercent*.75);

        updateHouseLoadingUI(
          overallPercent,
          `DOWNLOADING HOUSE… ${downloadPercent}%`
        );
        objective.textContent="Loading house… "+downloadPercent+"%";
        prompt.textContent="LOADING HOUSE… "+downloadPercent+"%";
      }else{
        updateHouseLoadingUI(10,"DOWNLOADING HOUSE…");
        objective.textContent="Loading house…";
        prompt.textContent="LOADING HOUSE…";
      }
    },
    error=>{
      console.error("Failed to load house:",houseUrl,error);
      houseLoaded=false;
      houseLoadFailed=true;
      houseLoadStarted=false;
      updateHouseLoadingUI(0,"HOUSE FAILED TO LOAD — RETRY TO TRY AGAIN.");

      if(!gameStarted){
        eventText.textContent="HOUSE FAILED TO LOAD";
        eventText.style.opacity="1";
      }
    }
  );
}

function setHouseMode(enabled,options={}){
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

  const houseModeWasActive=houseMode;
  houseMode=enabled;
  houseUnloadTimer=0;

  // Only switch the two level roots. The procedural Backrooms is otherwise untouched.
  world.root.visible=!houseMode;
  houseRoot.visible=houseMode;
  houseReturnPortal.visible=houseMode && houseReturnPortal.userData.active;

  player.ignoreWorldCollision=houseMode;
  player.extraCollisionBoxes=[];
  houseDoorCollisionDirty=true;

  spiderEntity.visible=false;
  spiderActive=false;
  spiderBehaviorState="idle";
  spiderBehaviorTime=0;

  if(houseMode){
    renderer.setPixelRatio(housePixelRatio);
    flashlight.castShadow=false;
    playerLight.intensity=0;

    player.pos.copy(houseSpawn);
    player.vel.set(0,0,0);
    player.jumpY=0;
    player.jumpVelocity=0;

    objective.textContent="Find the magazine on the couch. Press E to interact with it.";
    eventText.textContent="APARTMENT LEVEL";
    eventText.style.opacity="1";
    showHouseIntroPhoneMessage();
    setTimeout(()=>{eventText.style.opacity="0";},1400);
  }else{
    renderer.setPixelRatio(currentPixelRatio);
    flashlight.castShadow=ENABLE_SHADOWS;
    playerLight.intensity=0;

    if(options.forceBackroomsSpawn || houseModeWasActive){
      player.pos.set(32,EYE,32);
    }
    player.vel.set(0,0,0);
    player.jumpY=0;
    player.jumpVelocity=0;

    objective.textContent=STORY[storyStage].objective;

    if(gameStarted){
      spawnSpiderAtPlayer();
    }

    if(options.announceFall){
      eventText.textContent="YOU FELL.";
      eventText.style.opacity="1";
      setTimeout(()=>{
        if(eventText.textContent==="YOU FELL.") eventText.style.opacity="0";
      },1600);
    }
  }
}

installMainMenuRedesign();

const initialParams=new URLSearchParams(location.search);
const querySaveSlot=initialParams.get("saveSlot");
if(querySaveSlot!==null){
  setSelectedSaveSlot(querySaveSlot,false);
}
if(initialParams.get("save")==="1"){
  pendingSaveLoad=getSavedGame(selectedSaveSlot);
}

if(new URLSearchParams(location.search).get("lobby")==="1"){
  showLobbyScreen();
}else{
  showHomeScreen();
}

// Apartment loading is now lazy: only start it for a new game or an
// apartment-level Continue save.

player.hands.visible=true;


const spiderEntity=new THREE.Group();
spiderEntity.name="SpiderEntity";
spiderEntity.visible=false;
const spiderRevealLight=new THREE.PointLight(0xff7a38,0,18,1.6);
spiderRevealLight.position.set(0,1.2,0);
spiderEntity.add(spiderRevealLight);
scene.add(spiderEntity);

let spiderLoaded=false;
let spiderLoadStarted=false;
let spiderModel=null;
let spiderMixer=null;
const spiderActions=new Map();
let spiderAnimationState="";
let spiderWantedState="idle";
let spiderBehaviorState="idle";
let spiderBehaviorTime=0;
let spiderAttackPlayed=false;
let spiderActive=false;
let spiderJumpscareTimer=0;
let spiderJumpscareStartY=0;
let spiderJumpscareDirection=new THREE.Vector3();
let spiderJumpscareScale=1;
let spiderAutoLookTimer=0;
let spiderAutoLookStarted=false;

const SPIDER_STALK_TIME=4.5;
const SPIDER_AUTO_LOOK_DURATION=1.0;
const SPIDER_ATTACK_RANGE=1.65;
const SPIDER_SPEED=2.35;
const SPIDER_RADIUS=.55;
const SPIDER_GROUND_OFFSET=.08;
const SPIDER_TARGET_SPAN=2.4;

const SPIDER_ANIMATION_RANGES={
  idle1:[164,213],
  idle2:[214,249],
  walk:[0,45],
  attack1:[46,65],
  attack2:[66,85],
  eat:[86,99],
  defend:[100,120],
  hit1:[121,134],
  hit2:[135,149],
  crouch:[150,155],
  stand:[157,162],
  jump:[250,269],
  sidestep:[270,279],
  die1:[280,299],
  die2:[300,329]
};

const SPIDER_ANIMATION_ALIAS={
  idle:"idle1",
  stalk:"idle2",
  chase:"walk",
  attack:"attack1",
  hit:"hit1",
  death:"die1"
};


function fitSpiderModel(model){
  model.traverse(obj=>{
    if(!obj.isMesh) return;
    obj.visible=true;
    obj.frustumCulled=false;
    obj.castShadow=true;
    obj.receiveShadow=true;

    if(Array.isArray(obj.material)){
      obj.material=obj.material.map(material=>material||new THREE.MeshStandardMaterial({
        color:0x38251f,
        roughness:.8,
        metalness:.04
      }));
    }else if(!obj.material){
      obj.material=new THREE.MeshStandardMaterial({
        color:0x38251f,
        roughness:.8,
        metalness:.04
      });
    }

    const materials=Array.isArray(obj.material)?obj.material:[obj.material];
    for(const material of materials){
      material.visible=true;
      material.transparent=false;
      material.opacity=1;
      material.depthTest=true;
      material.depthWrite=true;
      material.side=THREE.DoubleSide;
      material.needsUpdate=true;
    }
  });

  model.updateMatrixWorld(true);
  const rawBox=new THREE.Box3().setFromObject(model);
  const rawSize=rawBox.getSize(new THREE.Vector3());
  const maxDimension=Math.max(rawSize.x,rawSize.y,rawSize.z);

  if(!Number.isFinite(maxDimension) || maxDimension<.0001){
    throw new Error("Spider model has invalid or empty bounds.");
  }

  model.scale.setScalar(SPIDER_TARGET_SPAN/maxDimension);
  model.updateMatrixWorld(true);

  const fittedBox=new THREE.Box3().setFromObject(model);
  const center=fittedBox.getCenter(new THREE.Vector3());

  model.position.x-=center.x;
  model.position.z-=center.z;
  model.position.y+=SPIDER_GROUND_OFFSET-fittedBox.min.y;
  model.updateMatrixWorld(true);
}
function setSpiderAnimation(name){
  spiderWantedState=name;
  const actualName=SPIDER_ANIMATION_ALIAS[name] || name;
  const action=spiderActions.get(actualName);
  if(!action || spiderAnimationState===actualName) return;

  for(const [key,item] of spiderActions){
    if(key===actualName){
      item.reset();
      item.fadeIn(.08);
      item.play();
    }else{
      item.fadeOut(.08);
    }
  }

  spiderAnimationState=actualName;
}

function groundSpiderEntity(){
  if(!spiderEntity.visible) return;

  const activeModel=spiderModel;
  if(!activeModel) return;

  activeModel.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(activeModel);
  if(!Number.isFinite(box.min.y)) return;

  const correction=SPIDER_GROUND_OFFSET-box.min.y;
  if(Math.abs(correction)>.0005){
    spiderEntity.position.y+=correction;
  }
}

function isSpiderBlocked(x,z){
  const walls=world.getNearbyWallBounds(x,z,SPIDER_RADIUS+.35);
  for(const wall of walls){
    const nx=Math.max(wall.minX,Math.min(x,wall.maxX));
    const nz=Math.max(wall.minZ,Math.min(z,wall.maxZ));
    const dx=x-nx;
    const dz=z-nz;
    if(dx*dx+dz*dz<SPIDER_RADIUS*SPIDER_RADIUS) return true;
  }
  return false;
}

const spiderSightRaycaster=new THREE.Raycaster();
const spiderSightOrigin=new THREE.Vector3();
const spiderSightTarget=new THREE.Vector3();

function playerHasLineOfSightToSpider(){
  const dx=spiderEntity.position.x-camera.position.x;
  const dz=spiderEntity.position.z-camera.position.z;
  const distance=Math.hypot(dx,dz);

  if(distance<.25 || distance>18) return false;

  spiderSightOrigin.copy(camera.position);
  spiderSightTarget.set(
    spiderEntity.position.x,
    spiderEntity.position.y+.8,
    spiderEntity.position.z
  );

  const direction=spiderSightTarget.clone().sub(spiderSightOrigin);
  const length=direction.length();
  if(length<.001) return true;

  direction.normalize();
  spiderSightRaycaster.set(spiderSightOrigin,direction);
  spiderSightRaycaster.far=Math.max(0,length-.15);

  const hits=spiderSightRaycaster.intersectObjects(world.root.children,true);
  return hits.length===0;
}

function rotatePlayerTowardSpider(dt){
  if(performance.now()-player.lastLookInputAt<220) return;

  const targetX=spiderEntity.position.x;
  const targetY=spiderEntity.position.y+.72;
  const targetZ=spiderEntity.position.z;

  const dx=targetX-player.pos.x;
  const dy=targetY-(player.pos.y+player.jumpY);
  const dz=targetZ-player.pos.z;
  const horizontal=Math.hypot(dx,dz);
  if(horizontal<.001) return;

  const targetYaw=Math.atan2(dx,dz);
  let yawDelta=targetYaw-player.yaw;
  while(yawDelta>Math.PI) yawDelta-=Math.PI*2;
  while(yawDelta<-Math.PI) yawDelta+=Math.PI*2;

  const targetPitch=-Math.atan2(dy,horizontal);
  const pitchDelta=targetPitch-player.pitch;
  const turnSpeed=7.5;

  player.yaw+=yawDelta*Math.min(1,dt*turnSpeed);
  player.pitch+=pitchDelta*Math.min(1,dt*turnSpeed);
  player.pitch=Math.max(-Math.PI/2+.02,Math.min(Math.PI/2-.02,player.pitch));
}

function findSpiderSpawnPosition(){
  const forwardX=-Math.sin(player.yaw);
  const forwardZ=-Math.cos(player.yaw);
  const rightX=Math.cos(player.yaw);
  const rightZ=-Math.sin(player.yaw);

  const candidates=[
    [14,0],[16,0],[15,4],[15,-4],
    [18,5],[18,-5],[20,3],[20,-3]
  ];

  for(const [distance,side] of candidates){
    const x=player.pos.x+forwardX*distance+rightX*side;
    const z=player.pos.z+forwardZ*distance+rightZ*side;
    if(!isSpiderBlocked(x,z)){
      return {x,z};
    }
  }

  return {
    x:player.pos.x+forwardX*12,
    z:player.pos.z+forwardZ*12
  };
}

function moveSpiderTowardPlayer(dt){
  const dx=player.pos.x-spiderEntity.position.x;
  const dz=player.pos.z-spiderEntity.position.z;
  const distance=Math.hypot(dx,dz);

  if(distance<=SPIDER_ATTACK_RANGE){
    return distance;
  }

  const inv=1/Math.max(distance,.001);
  const desiredX=dx*inv;
  const desiredZ=dz*inv;
  const step=Math.min(SPIDER_SPEED*dt,Math.max(0,distance-SPIDER_ATTACK_RANGE));

  let bestX=0;
  let bestZ=0;
  let bestScore=-Infinity;

  const angles=[0,.28,-.28,.56,-.56,.9,-.9,1.25,-1.25,1.6,-1.6,2.0,-2.0,2.55,-2.55];
  for(const angle of angles){
    const cos=Math.cos(angle);
    const sin=Math.sin(angle);
    const dirX=desiredX*cos-desiredZ*sin;
    const dirZ=desiredX*sin+desiredZ*cos;
    const nextX=spiderEntity.position.x+dirX*step;
    const nextZ=spiderEntity.position.z+dirZ*step;

    if(isSpiderBlocked(nextX,nextZ)) continue;

    const score=dirX*desiredX+dirZ*desiredZ;
    if(score>bestScore){
      bestScore=score;
      bestX=dirX;
      bestZ=dirZ;
    }
  }

  if(bestScore>-Infinity){
    spiderEntity.position.x+=bestX*step;
    spiderEntity.position.z+=bestZ*step;
  }

  return distance;
}

function startSpiderJumpscare(){
  spiderBehaviorState="jumpscare";
  spiderBehaviorTime=0;
  spiderJumpscareTimer=1.05;
  spiderJumpscareStartY=camera.position.y;
  spiderJumpscareDirection.set(0,0,-1);
  camera.getWorldDirection(spiderJumpscareDirection);

  const scarePosition=camera.position.clone().add(
    spiderJumpscareDirection.clone().multiplyScalar(1.22)
  );

  spiderEntity.position.copy(scarePosition);
  spiderEntity.position.y=camera.position.y-.82;
  spiderEntity.rotation.y=Math.atan2(
    camera.position.x-spiderEntity.position.x,
    camera.position.z-spiderEntity.position.z
  );
  spiderJumpscareScale=1.16;
  spiderEntity.scale.setScalar(spiderJumpscareScale);
  spiderEntity.visible=true;

  setSpiderAnimation("attack2");
  player.keys.clear();
  player.vel.set(0,0,0);
  player.jumpVelocity=0;
  pulse=1.25;

  eventText.textContent="CAUGHT";
  eventText.style.opacity="1";
}

function resetPlayerAfterSpiderCatch(){
  const teammate=multiplayer.getClosestBackroomsPlayerPosition(
    player.pos.x,
    player.pos.z
  );

  if(teammate){
    const dx=player.pos.x-teammate.x;
    const dz=player.pos.z-teammate.z;
    const distance=Math.hypot(dx,dz);
    const inv=1/Math.max(distance,.001);
    const spawnX=teammate.x+(distance>.001?dx*inv:1)*2.2;
    const spawnZ=teammate.z+(distance>.001?dz*inv:0)*2.2;

    if(!isSpiderBlocked(spawnX,spawnZ)){
      player.pos.set(spawnX,EYE,spawnZ);
    }else{
      player.pos.set(teammate.x,EYE,teammate.z);
    }

    eventText.textContent="YOU GOT CAUGHT — RESET TO YOUR TEAMMATE.";
  }else{
    player.pos.set(32,EYE,32);
    eventText.textContent="YOU GOT CAUGHT — RESET TO THE START OF THE LEVEL.";
  }

  player.vel.set(0,0,0);
  player.keys.clear();
  player.jumpY=0;
  player.jumpVelocity=0;
  player.yaw=0;
  player.pitch=0;

  spiderJumpscareTimer=0;
  spiderJumpscareScale=1;
  spiderBehaviorState="chase";
  spiderBehaviorTime=0;
  spiderAutoLookTimer=0;
  spiderAutoLookStarted=true;
  spiderEntity.scale.setScalar(1);
  spiderEntity.position.y=SPIDER_GROUND_OFFSET;
  setSpiderAnimation("chase");
  spiderEntity.visible=true;
  pulse=1;
  eventText.style.opacity="1";
}

function finishSpiderJumpscare(){
  resetPlayerAfterSpiderCatch();
}

function spawnSpiderAtPlayer(){
  if(!gameStarted || houseMode) return false;
  if(spiderActive) return true;

  const spawn=findSpiderSpawnPosition();
  spiderEntity.position.set(spawn.x,SPIDER_GROUND_OFFSET,spawn.z);
  spiderEntity.rotation.y=Math.atan2(
    player.pos.x-spawn.x,
    player.pos.z-spawn.z
  );

  spiderBehaviorState="stalk";
  spiderBehaviorTime=0;
  spiderAutoLookTimer=SPIDER_AUTO_LOOK_DURATION;
  spiderAutoLookStarted=true;
  spiderAttackPlayed=false;
  spiderActive=true;
  spiderEntity.visible=true;
  setSpiderAnimation("stalk");
  return true;
}

async function loadSpiderFromPack(){
  const spiderUrl="./assets/Spider-Psionic-runtime/spider.glb";

  gltfLoader.load(
    spiderUrl,
    gltf=>{
      const model=gltf.scene;
      model.name="SpiderVisual";
      model.visible=true;

      let meshCount=0;
      model.traverse(obj=>{
        if(!obj.isMesh) return;
        meshCount++;
        obj.visible=true;
        obj.frustumCulled=false;
        obj.castShadow=true;
        obj.receiveShadow=true;

        const materials=Array.isArray(obj.material)?obj.material:[obj.material];
        for(const material of materials){
          if(!material) continue;
          material.visible=true;
          material.transparent=false;
          material.opacity=1;
          material.depthTest=true;
          material.depthWrite=true;
          material.side=THREE.DoubleSide;
          material.needsUpdate=true;
        }
      });

      if(meshCount===0){
        throw new Error("Converted Spider GLB contains no meshes.");
      }

      fitSpiderModel(model);

      spiderModel=model;
      spiderEntity.add(model);
      spiderLoaded=true;

      spiderMixer=null;
      spiderActions.clear();
      spiderAnimationState="";

      const sourceClip=gltf.animations?.[0] || null;
      if(sourceClip){
        const sourceFPS=329/Math.max(sourceClip.duration,.001);
        spiderMixer=new THREE.AnimationMixer(model);

        for(const [name,[startFrame,endFrame]] of Object.entries(SPIDER_ANIMATION_RANGES)){
          const clip=THREE.AnimationUtils.subclip(
            sourceClip,
            "spider_"+name,
            startFrame,
            endFrame+1,
            sourceFPS
          );
          const action=spiderMixer.clipAction(clip);
          action.setLoop(
            name.startsWith("die") ? THREE.LoopOnce : THREE.LoopRepeat,
            name.startsWith("die") ? 1 : Infinity
          );
          if(name.startsWith("die")) action.clampWhenFinished=true;
          spiderActions.set(name,action);
        }

        setSpiderAnimation(spiderWantedState);
      }else{
        spiderWantedState="idle";
      }

      console.log(
        "[DeepSeeker] exact uploaded Spider-Psionic model loaded as GLB",
        {
          animations:gltf.animations?.map(animation=>animation.name)||[],
          meshCount
        }
      );

      eventText.textContent=sourceClip ? "SPIDER READY" : "SPIDER READY (STATIC)";
      eventText.style.opacity="1";
      setTimeout(()=>{
        if(
          eventText.textContent==="SPIDER READY" ||
          eventText.textContent==="SPIDER READY (STATIC)"
        ){
          eventText.style.opacity="0";
        }
      },1800);
    },
    undefined,
    error=>{
      spiderLoaded=false;
      spiderModel=null;
      spiderMixer=null;
      spiderActions.clear();
      spiderAnimationState="";
      console.error("[DeepSeeker] converted Spider-Psionic GLB failed:",error);
      // A missing entity is a gameplay asset problem, not a menu problem.
      // Only surface the message after a run has actually started.
      if(gameStarted){
        eventText.textContent="SPIDER GLB FAILED TO LOAD";
        eventText.style.opacity="1";
      }
    }
  );
}

function ensureSpiderLoading(){
  if(spiderLoadStarted || spiderLoaded) return;
  spiderLoadStarted=true;
  loadSpiderFromPack();
}

player.onStep=({intensity})=>audio.step(intensity);

const BACKROOMS_FALL_DURATION=1.8;
let backroomsFallTimer=0;
let backroomsFallElapsed=0;
let backroomsFallStartY=0;
let backroomsFallStartAt=0;
let fallCameraOffset=0;

function startBackroomsFall(sharedStartAt=Date.now(),broadcast=false){
  if(!gameStarted || !houseMode || backroomsFallTimer>0) return false;

  const startAt=Number.isFinite(Number(sharedStartAt))
    ? Number(sharedStartAt)
    : Date.now();
  const elapsed=Math.max(0,(Date.now()-startAt)/1000);

  if(elapsed>=BACKROOMS_FALL_DURATION){
    setHouseMode(false,{announceFall:true,forceBackroomsSpawn:true});
    return true;
  }

  backroomsFallStartAt=startAt;
  backroomsFallElapsed=elapsed;
  backroomsFallTimer=BACKROOMS_FALL_DURATION-elapsed;
  backroomsFallStartY=camera.position.y;
  fallCameraOffset=0;
  pulse=.35;

  if(broadcast){
    multiplayer.broadcastFall(startAt);
  }

  eventText.textContent="THE FLOOR GAVE WAY.";
  eventText.style.opacity="1";
  return true;
}

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
function refreshPhoneContent(){
  phoneAppName.textContent="DEEPSEEKER";
  phoneDepth.textContent=String(STORY[storyStage].depth);
  phoneDepthLabel.textContent="DEPTH";
  phoneCardTitle.textContent="CURRENT OBJECTIVE";
  phoneCardText.textContent=STORY[storyStage].objective;
  renderStoryLog();
}

function showHouseIntroPhoneMessage(){
  if(houseIntroMessageShown) return;
  houseIntroMessageShown=true;

  phoneOpen=true;
  deepseekerAppOpen=true;
  phone.classList.add("open","app-open");
  phone.setAttribute("aria-hidden","false");
  crosshair.style.display="none";

  phoneAppName.textContent="MESSAGE FROM M";
  phoneDepth.textContent="!";
  phoneDepthLabel.textContent="NEW MESSAGE";
  phoneCardTitle.textContent="LOOK FOR THE MAGAZINE";
  phoneCardText.textContent="It's on the couch. When you find it, press E to interact with it.";

  renderStoryLog();
  phoneStory.insertAdjacentHTML("afterbegin",`
    <div class="storyEntry">
      <div class="storyMeta">M · HOUSE MESSAGE</div>
      <div class="storyText">Look for the magazine. It's on the couch. When you find it, press E to interact with it.</div>
    </div>
  `);
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
    refreshPhoneContent();
  }else if(!controlsOpen){
    player.lock();
  }
}

function openDeepSeekerApp(){
  if(!phoneOpen) return;
  deepseekerAppOpen=true;
  phone.classList.add("app-open");
}

const phoneSaveStatus=document.getElementById("phoneSaveStatus");
document.querySelectorAll(".phoneSaveSlot").forEach(button=>{
  button.addEventListener("click",async()=>{
    const slot=normalizeSaveSlot(button.dataset.slot);
    if(phoneSaveStatus) phoneSaveStatus.textContent=`SAVING SLOT ${slot}…`;
    const saved=await saveGame(slot);
    if(phoneSaveStatus){
      phoneSaveStatus.textContent=saved
        ? `SAVED TO SLOT ${slot}`
        : `SAVE FAILED — SLOT ${slot}`;
    }
  });
});

newGameButton.addEventListener("click",event=>{
  event.preventDefault();
  resetForNewGame(selectedSaveSlot);
});

continueButton.addEventListener("click",()=>{
  continueGame(selectedSaveSlot);
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

  // A populated slot resumes that personal snapshot; an empty slot starts fresh.
  // Every player keeps their own slot, so solo and multiplayer saves are independent.
  startGame(getSavedGame(selectedSaveSlot),selectedSaveSlot);

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

if(usernameSaveButton){
  usernameSaveButton.addEventListener("click",()=>{
    saveUsername(usernameInputs[0]?.value||"");
  });
}
usernameInputs.forEach(input=>{
  input.addEventListener("keydown",e=>{
    if(e.code==="Enter"){
      e.preventDefault();
      saveUsername(input.value);
    }
  });
});
refreshUsernameInputs();

chatInput.addEventListener("keydown",e=>{
  if(e.code==="Enter"){
    e.preventDefault();
    const message=chatInput.value.trim();
    if(message) multiplayer.sendChat(message);
    closeChat();
  }else if(e.code==="Escape"){
    e.preventDefault();
    closeChat();
  }
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

player.attach();
prompt.textContent="READY — START A GAME";
applyStoryStage(0,false);

overlay.addEventListener("click",(e)=>{
  if(e.target!==overlay) return;
  if(!houseLoaded && !gameStarted){
    prompt.textContent=houseLoadFailed
      ? "APARTMENT FAILED TO LOAD"
      : "START A GAME TO LOAD THE APARTMENT";
    return;
  }
  if(gameStarted){
    audio.start();
    player.lock();
  }
});

renderer.domElement.addEventListener("click",()=>{
  if(gameStarted && !phoneOpen && !controlsOpen && !chatOpen && document.pointerLockElement!==renderer.domElement){
    audio.start();
    player.lock();
  }
});

controls.addEventListener("click",e=>{
  if(e.target===controls) hideControls();
});

document.addEventListener("pointerlockchange",()=>{
  const locked=document.pointerLockElement===renderer.domElement;
  if(!controlsOpen && !phoneOpen && !chatOpen){
    if(locked){
      overlay.classList.add("hidden");
    }else if(gameStarted){
      if(multiplayerMapOpen) toggleMultiplayerMap(false);
      loadingScreen.style.display="flex";
      homeScreen.classList.add("hidden");
      lobbyScreen.classList.add("hidden");
      prompt.textContent="CLICK TO RESUME";
      overlay.classList.remove("hidden");
    }
  }
  crosshair.style.display=locked && !chatOpen?"block":"none";
  if(locked && phoneOpen){
    phoneOpen=false;
    deepseekerAppOpen=false;
    phone.classList.remove("open","app-open");
    phone.setAttribute("aria-hidden","true");
  }
});

document.addEventListener("keydown",e=>{
  if(e.code==="Enter" && !e.repeat && gameStarted && !phoneOpen && !controlsOpen && !chatOpen){
    e.preventDefault();
    openChat();
    return;
  }

  if(chatOpen) return;

  if(e.code==="KeyE" && !e.repeat && !phoneOpen && !controlsOpen && !chatOpen){
    if(useHouseReturnTeleporter()){
      return;
    }
  }else if(e.code==="KeyF" && gameStarted && !phoneOpen && !controlsOpen) toggleFlashlight();
  else if(e.code==="KeyM" && !phoneOpen && !controlsOpen){ muted=audio.toggleMute(); }
  else if(e.code==="KeyN" && !e.repeat){
    if(gameStarted && !phoneOpen && !controlsOpen){
      e.preventDefault();
      toggleMultiplayerMap();
    }
  }else if(e.code==="KeyP" && !e.repeat){
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

  if(!spiderLoaded || spiderActive){
    audio.scare();
  }else{
    spawnSpiderAtPlayer();
    audio.scare();
  }

  objective.textContent=Math.random()>.5
    ? "Something moved nearby."
    : "Something is following you.";

  eventText.textContent=Math.random()>.5
    ? "DID YOU HEAR THAT?"
    : "RUN.";

  eventText.style.opacity="1";
  setTimeout(()=>{
    eventText.style.opacity="0";
    objective.textContent=STORY[storyStage].objective;
  },1800);
}

addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  menuCamera.aspect=innerWidth/innerHeight;
  menuCamera.updateProjectionMatrix();
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
      const baseRatio=houseMode ? housePixelRatio : currentPixelRatio;
      let nextRatio=baseRatio;

      if(fps<42){
        nextRatio=Math.max(houseMode ? MIN_HOUSE_PIXEL_RATIO : 0.8,baseRatio-0.08);
      }else if(fps>58){
        nextRatio=Math.min(houseMode ? HOUSE_PIXEL_RATIO : BASE_PIXEL_RATIO,baseRatio+0.08);
      }

      if(Math.abs(nextRatio-baseRatio)>=0.05){
        if(houseMode){
          housePixelRatio=Number(nextRatio.toFixed(2));
          renderer.setPixelRatio(housePixelRatio);
        }else{
          currentPixelRatio=Number(nextRatio.toFixed(2));
          renderer.setPixelRatio(currentPixelRatio);
        }
        perfCooldown=2.0;
      }
    }
  }

  updateHouseMemoryState(dt);

  if(backroomsFallTimer>0){
    backroomsFallElapsed=backroomsFallStartAt
      ? Math.max(0,(Date.now()-backroomsFallStartAt)/1000)
      : backroomsFallElapsed+dt;
    backroomsFallTimer=Math.max(0,BACKROOMS_FALL_DURATION-backroomsFallElapsed);

    player.keys.clear();
    player.vel.set(0,0,0);

    const progress=Math.min(1,backroomsFallElapsed/BACKROOMS_FALL_DURATION);
    const eased=progress*progress*(3-2*progress);
    const fallDistance=3.8*eased;

    if(gameStarted && houseMode){
      // Let the apartment remain visible while the camera sinks through its
      // floor, then switch levels at the end of the fall.
      fallCameraOffset=-fallDistance;
    }

    if(backroomsFallTimer<=0){
      fallCameraOffset=0;
      setHouseMode(false,{announceFall:true});
    }
  }

  if(houseMode){
    updateHouseDoors(dt);

    houseCollisionRefreshTimer-=dt;
    const movedEnough=
      !Number.isFinite(houseCollisionFocusX) ||
      !Number.isFinite(houseCollisionFocusZ) ||
      Math.hypot(
        player.pos.x-houseCollisionFocusX,
        player.pos.z-houseCollisionFocusZ
      )>=1.5;

    if(houseDoorCollisionDirty || houseCollisionRefreshTimer<=0 || movedEnough){
      updateHouseDoorCollisions();
    }
  }else{
    player.extraCollisionBoxes=[];
  }

  player.update(dt);

  if(backroomsFallTimer>0 && gameStarted && houseMode){
    camera.position.y+=fallCameraOffset;
  }

  multiplayer.update(dt);
  if(multiplayerMapOpen) updateMultiplayerMap();

  // Keep the flashlight cone exactly centered on the camera/crosshair.
    if(!houseMode) updateStoryProgress();

  if(gameStarted){
    if(t-lastAutoSave>20){
      lastAutoSave=t;
      saveGame();
    }
  }

  if(!houseMode){
    if(!gameStarted){
      // Keep the title-screen camera centered on a known open section of
      // chunk 0,0 while the game remains on the menu.
      player.pos.set(MENU_WORLD_X,EYE,MENU_WORLD_Z);
      player.vel.set(0,0,0);
      player.jumpY=0;
      player.jumpVelocity=0;
      world.update(MENU_WORLD_X,MENU_WORLD_Z);
    }else{
      world.update(player.pos.x,player.pos.z);
    }
  }
  audio && audio.ctx && audio.ctx.state==="suspended" && audio.start();

  if(flashlightOn && battery>0){
    battery=Math.max(0,battery-dt*.30);
  }else{
    battery=Math.min(100,battery+dt*1.0);
  }
  if(battery<=0){
    flashlightOn=false;
    player.setFlashlightVisual(false);
  }

  const flicker=flashlightFlicker(t);
  let flashlightStrength=68.0*flicker;

  if(flashlightOn && !houseMode && spiderActive){
    const spiderDistance=Math.hypot(
      player.pos.x-spiderEntity.position.x,
      player.pos.z-spiderEntity.position.z
    );

    // Normal outside the danger zone, then rapidly dim as the spider closes in.
    const proximity=THREE.MathUtils.clamp(
      (12-spiderDistance)/10,
      0,
      1
    );
    const dimmedStrength=THREE.MathUtils.lerp(
      flashlightStrength,
      7.0*flicker,
      proximity*proximity
    );

    flashlightStrength=dimmedStrength;

    if(spiderJumpscareTimer>0){
      flashlightStrength=4.0*flicker;
    }
  }

  flashlight.intensity=flashlightOn ? flashlightStrength : 0;
  if(!houseMode){
    playerLight.position.set(player.pos.x,EYE+.35,player.pos.z);
  }

  if(!houseMode && spiderMixer && spiderActive){
    spiderMixer.update(dt);
  }

  if(spiderJumpscareTimer<=0){
    groundSpiderEntity();
  }

  spiderRevealLight.intensity=(!houseMode && spiderActive)
    ? (spiderJumpscareTimer>0 ? 9.5 : 6.5)
    : 0;

  if(spiderActive && !houseMode){
    if(spiderJumpscareTimer>0){
      spiderJumpscareTimer=Math.max(0,spiderJumpscareTimer-dt);
      spiderBehaviorTime+=dt;

      const jumpProgress=THREE.MathUtils.clamp(
        1-spiderJumpscareTimer/1.05,
        0,
        1
      );
      const easeOut=1-Math.pow(1-jumpProgress,3);

      spiderEntity.position.copy(camera.position).addScaledVector(
        spiderJumpscareDirection,
        THREE.MathUtils.lerp(1.22,.56,easeOut)
      );
      spiderEntity.position.y=
        camera.position.y-.82+Math.sin(jumpProgress*Math.PI)*.06;

      const scale=THREE.MathUtils.lerp(
        spiderJumpscareScale,
        1.72,
        easeOut
      ) + Math.sin(spiderBehaviorTime*34)*.035;

      spiderEntity.scale.setScalar(scale);
      spiderEntity.rotation.y=Math.atan2(
        camera.position.x-spiderEntity.position.x,
        camera.position.z-spiderEntity.position.z
      );

      if(jumpProgress<.42){
        setSpiderAnimation("attack2");
      }else{
        setSpiderAnimation("attack1");
      }

      player.keys.clear();
      player.vel.set(0,0,0);

      const shake=jumpProgress*jumpProgress;
      camera.position.x+=Math.sin(spiderBehaviorTime*76)*.012*shake;
      camera.position.y+=Math.cos(spiderBehaviorTime*68)*.009*shake;

      if(spiderJumpscareTimer<=0){
        finishSpiderJumpscare();
      }
    }else{
    spiderBehaviorTime+=dt;

    const targetDistance=Math.hypot(
      player.pos.x-spiderEntity.position.x,
      player.pos.z-spiderEntity.position.z
    );

    if(spiderAutoLookTimer>0){
      spiderAutoLookTimer=Math.max(
        0,
        spiderAutoLookTimer-dt
      );
      rotatePlayerTowardSpider(dt);
    }

    if(spiderBehaviorState==="stalk"){
      setSpiderAnimation("stalk");

      if(spiderBehaviorTime>=SPIDER_STALK_TIME){
        spiderBehaviorState="chase";
        spiderBehaviorTime=0;
        setSpiderAnimation("chase");
      }
    }else if(spiderBehaviorState==="chase"){
      setSpiderAnimation("chase");

      const distance=moveSpiderTowardPlayer(dt);

      if(distance<=SPIDER_ATTACK_RANGE){
        spiderAttackPlayed=false;
        audio.scare();
        startSpiderJumpscare();
      }
    }else if(spiderBehaviorState==="attack"){
      setSpiderAnimation("attack");

      if(!spiderAttackPlayed){
        spiderAttackPlayed=true;
        pulse=1;
      }

      if(spiderBehaviorTime>=1.0){
        spiderBehaviorState="chase";
        spiderBehaviorTime=0;
        setSpiderAnimation("chase");
      }
    }

    spiderEntity.rotation.y=Math.atan2(
      player.pos.x-spiderEntity.position.x,
      player.pos.z-spiderEntity.position.z
    );
    spiderEntity.visible=true;
    }
  }else{
    spiderEntity.visible=false;
    spiderBehaviorState="idle";
    spiderBehaviorTime=0;
    spiderAutoLookTimer=0;
    spiderAutoLookStarted=false;
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
    hemi.intensity=0;
    ambient.intensity=0;
  }else{
    vignette.style.opacity=".70";
    hemi.intensity=0;
    ambient.intensity=0;
  }

  const stamina=player.stamina;
  staminaBar.style.width=stamina+"%";
  staminaValue.textContent=Math.round(stamina);
  batteryBar.style.width=battery+"%";
  batteryValue.textContent=Math.round(battery)+"%";
  batteryBar.style.opacity=flashlightOn?1:.45;

  const menuIsVisible=!gameStarted && !homeScreen.classList.contains("hidden");
  const usingMenuCamera=menuIsVisible && updateMenuScene(t,dt);

  renderer.render(
    scene,
    usingMenuCamera ? menuCamera : camera
  );
}
animate();

window.addEventListener("beforeunload",()=>{
  if(gameStarted) saveGame();
});

if(pendingSaveLoad){
  const save=pendingSaveLoad;
  pendingSaveLoad=null;
  setTimeout(()=>startGame(save,selectedSaveSlot),0);
}

window.__deepseeker={
  player,
  world,
  camera,
  menuCamera,
  renderer,
  seed:SEED,
  house:{model:()=>houseModel,spawn:()=>houseSpawn,active:()=>houseMode,toggle:()=>setHouseMode(!houseMode)}
};
