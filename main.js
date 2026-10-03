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

  const usernameRow=homeScreen.querySelector(".usernameRow");
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
  background:
    linear-gradient(90deg,rgba(2,4,3,.96) 0%,rgba(2,4,3,.83) 18%,rgba(2,4,3,.24) 42%,transparent 66%),
    linear-gradient(180deg,rgba(0,0,0,.70) 0%,transparent 22%,transparent 70%,rgba(0,0,0,.72) 100%);
  z-index:1;
}
#menuBackdrop{
  position:absolute;
  inset:0;
  overflow:hidden;
  pointer-events:none;
  z-index:0;
  background:
    radial-gradient(circle at 73% 34%,rgba(216,194,118,.20),transparent 19%),
    radial-gradient(circle at 63% 62%,rgba(72,89,67,.19),transparent 26%),
    linear-gradient(180deg,#151a17 0%,#0b100d 50%,#040604 100%);
}
#menuBackdrop::before{
  content:"";
  position:absolute;
  inset:-10%;
  background:
    linear-gradient(90deg,transparent 0 11%,rgba(230,222,183,.08) 11.15%,transparent 11.4% 28%,rgba(230,222,183,.035) 28.15%,transparent 28.4% 46%,rgba(230,222,183,.055) 46.15%,transparent 46.4% 70%,rgba(230,222,183,.045) 70.15%,transparent 70.4%),
    linear-gradient(180deg,transparent 0 19%,rgba(230,222,183,.055) 19.15%,transparent 19.45% 48%,rgba(230,222,183,.035) 48.15%,transparent 48.45% 78%,rgba(230,222,183,.045) 78.15%,transparent 78.45%);
  transform:perspective(900px) rotateX(62deg) translateY(10%);
  transform-origin:center bottom;
  opacity:.58;
}
#menuBackdrop::after{
  content:"";
  position:absolute;
  inset:0;
  background:
    radial-gradient(ellipse at 74% 44%,transparent 0 12%,rgba(0,0,0,.08) 30%,rgba(0,0,0,.70) 100%),
    repeating-linear-gradient(180deg,transparent 0 5px,rgba(255,255,255,.012) 6px,transparent 7px);
  mix-blend-mode:screen;
  opacity:.56;
}
.menuBackdropGlow{
  position:absolute;
  width:48vw;
  height:48vw;
  min-width:480px;
  min-height:480px;
  right:-8vw;
  top:-14vw;
  border-radius:50%;
  background:radial-gradient(circle,rgba(232,211,145,.18),rgba(232,211,145,.04) 30%,transparent 69%);
  filter:blur(12px);
  animation:menuGlow 8s ease-in-out infinite alternate;
}
.menuBackdropScan{
  position:absolute;
  inset:0;
  background:linear-gradient(90deg,transparent,rgba(213,201,153,.06),transparent);
  width:34vw;
  transform:translateX(-40vw) skewX(-10deg);
  animation:menuSweep 11s ease-in-out infinite;
  opacity:.28;
}
.menuBackdropArchitecture{
  position:absolute;
  inset:0;
  background:
    linear-gradient(90deg,transparent 53%,rgba(211,200,157,.08) 53.15%,transparent 53.4% 61%,rgba(211,200,157,.05) 61.15%,transparent 61.4%),
    linear-gradient(180deg,transparent 28%,rgba(211,200,157,.06) 28.15%,transparent 28.45% 59%,rgba(211,200,157,.05) 59.15%,transparent 59.4%);
  opacity:.62;
}
.menuBackdropTower{
  position:absolute;
  right:15vw;
  bottom:7vh;
  width:14vw;
  height:50vh;
  min-width:140px;
  background:
    linear-gradient(90deg,rgba(0,0,0,.2),rgba(220,209,162,.08),rgba(0,0,0,.28)),
    repeating-linear-gradient(180deg,transparent 0 34px,rgba(231,220,177,.055) 35px 36px,transparent 37px);
  border:1px solid rgba(226,215,171,.10);
  transform:skewY(-4deg);
  box-shadow:0 0 80px rgba(216,201,138,.06);
  opacity:.44;
}
.menuBackdropTower::before,
.menuBackdropTower::after{
  content:"";
  position:absolute;
  top:-8vh;
  width:3px;
  height:66vh;
  background:linear-gradient(180deg,transparent,rgba(230,218,171,.16),transparent);
}
.menuBackdropTower::before{left:22%}
.menuBackdropTower::after{right:18%}
.menuBackdropPipe{
  position:absolute;
  right:3vw;
  bottom:18vh;
  width:34vw;
  max-width:520px;
  height:4px;
  background:linear-gradient(90deg,transparent,rgba(215,203,160,.08) 10%,rgba(234,222,178,.55) 45%,rgba(234,222,178,.15) 80%,transparent);
  box-shadow:0 0 24px rgba(229,214,159,.11);
  transform:rotate(-5deg);
  opacity:.65;
}
.menuBackdropLight{
  position:absolute;
  right:12vw;
  top:14vh;
  width:min(31vw,480px);
  height:5px;
  background:linear-gradient(90deg,transparent,rgba(244,237,203,.20),rgba(244,237,203,.86),rgba(244,237,203,.15),transparent);
  box-shadow:0 0 26px rgba(239,222,166,.22),0 0 88px rgba(239,222,166,.09);
  transform:rotate(-2deg);
  animation:menuLightPulse 5.8s ease-in-out infinite;
  opacity:.85;
}
.menuBackdropLight.secondary{
  top:25vh;
  right:25vw;
  width:min(23vw,350px);
  opacity:.28;
  animation-delay:-2.5s;
}
.menuBackdropHaze{
  position:absolute;
  inset:0;
  background:
    radial-gradient(ellipse at 74% 42%,rgba(217,201,138,.06),transparent 22%),
    linear-gradient(90deg,transparent 35%,rgba(206,197,164,.03) 73%,transparent);
  filter:blur(24px);
  animation:menuHaze 13s ease-in-out infinite alternate;
}
@keyframes menuGlow{
  from{transform:translate3d(-2%,2%,0) scale(.94);opacity:.60}
  to{transform:translate3d(3%,-1%,0) scale(1.06);opacity:1}
}
@keyframes menuLightPulse{
  0%,100%{opacity:.48;filter:brightness(.84)}
  46%{opacity:.92;filter:brightness(1.18)}
  50%{opacity:.62;filter:brightness(.70)}
  54%{opacity:.90;filter:brightness(1.08)}
}
@keyframes menuSweep{
  0%{transform:translateX(-40vw) skewX(-10deg)}
  46%,100%{transform:translateX(130vw) skewX(-10deg)}
}
@keyframes menuHaze{
  from{transform:translate3d(-2%,0,0) scale(1)}
  to{transform:translate3d(2%,-1%,0) scale(1.04)}
}

#homeScreen.menuHomeRedesign{
  position:absolute;
  inset:0;
  z-index:3;
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
  z-index:4;
  width:100%;
  height:100%;
}
.menuLogo{
  position:absolute;
  left:clamp(34px,4vw,64px);
  top:clamp(28px,5vh,54px);
  color:#f3edd5;
  text-shadow:0 4px 24px rgba(0,0,0,.9);
}
.menuLogoMain{
  display:flex;
  flex-direction:column;
  gap:1px;
  line-height:.92;
  letter-spacing:clamp(4px,.55vw,8px);
  font-weight:600;
}
.menuLogoMain span{
  font-size:clamp(24px,2.8vw,43px);
  color:#f4efd9;
}
.menuLogoMain strong{
  font-size:clamp(34px,4.2vw,64px);
  font-weight:600;
  color:#d9b65c;
  letter-spacing:clamp(5px,.7vw,11px);
}
.menuLogoSub{
  margin-top:12px;
  font-size:8px;
  letter-spacing:3.5px;
  color:#9f987f;
}
.menuNav{
  position:absolute;
  left:clamp(28px,4vw,58px);
  top:clamp(210px,29vh,300px);
  width:min(360px,31vw);
  display:flex;
  flex-direction:column;
  gap:3px;
}
.menuNavButton{
  position:relative;
  width:100%;
  min-height:52px;
  padding:0 18px 0 22px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  border:0;
  border-left:3px solid transparent;
  border-radius:0 2px 2px 0;
  background:linear-gradient(90deg,rgba(5,7,6,.12),transparent);
  color:#d7d1bd;
  font:inherit;
  text-align:left;
  font-size:clamp(13px,1vw,16px);
  letter-spacing:1.5px;
  cursor:pointer;
  transition:background .16s,color .16s,border-color .16s,transform .16s;
  text-shadow:0 2px 10px rgba(0,0,0,.9);
}
.menuNavButton:hover{
  background:linear-gradient(90deg,rgba(223,173,69,.10),transparent);
  color:#fff7dc;
  transform:translateX(4px);
}
.menuNavButton.active,
.menuNavButton:focus-visible{
  background:linear-gradient(90deg,rgba(223,173,69,.21),rgba(223,173,69,.035) 70%,transparent);
  border-left-color:#dfad45;
  color:#fff4cf;
  outline:none;
}
.menuNavButton:disabled{opacity:.42;cursor:not-allowed;transform:none!important}
.menuNavArrow{
  font-size:20px;
  color:#767264;
  transition:transform .16s,color .16s;
}
.menuNavButton:hover .menuNavArrow{transform:translateX(4px);color:#edc269}
.menuNavButton.active .menuNavArrow{color:#e4b75c}

.menuSlotBar{
  position:absolute;
  left:clamp(28px,4vw,58px);
  bottom:clamp(74px,8vh,104px);
  width:min(540px,46vw);
  color:#989381;
  text-shadow:0 2px 8px #000;
}
.menuSlotHeader{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:8px;
  padding:0 1px;
  font-size:8px;
  letter-spacing:2.4px;
}
.menuSlotHeader strong{color:#d4cba9;font-weight:500}
.menuHomeRedesign #saveSlots{
  width:100%;
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:7px;
}
.menuHomeRedesign .saveSlotCard{
  min-width:0;
  min-height:106px;
  padding:13px 12px;
  border:1px solid rgba(231,220,171,.13);
  border-radius:2px;
  background:linear-gradient(180deg,rgba(7,9,8,.56),rgba(3,5,4,.30));
  color:#bbb5a1;
  display:flex;
  flex-direction:column;
  justify-content:center;
  box-shadow:inset 0 1px rgba(255,255,255,.025);
}
.menuHomeRedesign .saveSlotCard:hover{
  background:linear-gradient(180deg,rgba(223,173,69,.09),rgba(223,173,69,.025));
  border-color:rgba(231,220,171,.24);
}
.menuHomeRedesign .saveSlotCard.selected{
  border-color:rgba(223,173,69,.72);
  background:linear-gradient(180deg,rgba(223,173,69,.15),rgba(223,173,69,.045));
  box-shadow:0 0 22px rgba(223,173,69,.06),inset 0 1px rgba(255,237,180,.08);
}
.menuHomeRedesign .saveSlotTitle{
  font-size:8px;
  letter-spacing:1.6px;
  color:#e1d9bf;
}
.menuHomeRedesign .saveSlotMode{
  font-size:7px;
  color:#8e8979;
}
.menuHomeRedesign .saveSlotDetail{
  display:block;
  margin-top:5px;
  font-size:8px;
  color:#777466;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.menuHomeRedesign .saveSlotActions{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:7px}
.menuHomeRedesign .saveSlotActions button{
  padding:6px 3px;
  border:1px solid rgba(231,220,171,.10);
  border-radius:2px;
  background:rgba(255,255,255,.025);
  color:#a9a28d;
  font:inherit;
  font-size:7px;
  letter-spacing:1.2px;
  cursor:pointer;
}
.menuHomeRedesign .saveSlotActions button:hover{background:rgba(223,173,69,.09);color:#e9dec0}
.menuHomeRedesign .saveSlotActions button:disabled{opacity:.35;cursor:not-allowed}
.menuSaveStatus{
  margin-top:7px;
  font-size:8px;
  letter-spacing:1.4px;
  color:#777466;
}
.menuRightPanel{
  position:absolute;
  top:clamp(110px,15vh,150px);
  right:clamp(24px,4vw,62px);
  bottom:clamp(72px,8vh,104px);
  width:min(365px,28vw);
  min-height:0;
  padding:26px 24px;
  border-left:2px solid rgba(223,173,69,.34);
  border-right:1px solid rgba(231,220,171,.07);
  background:linear-gradient(90deg,rgba(4,6,5,.17),rgba(5,7,6,.48));
  backdrop-filter:blur(6px);
  color:#9a9581;
  text-shadow:0 2px 8px #000;
  overflow:auto;
}
.menuRightHeader{
  display:flex;
  justify-content:space-between;
  gap:14px;
  font-size:8px;
  letter-spacing:2px;
  color:#b9b198;
  margin-bottom:16px;
}
.menuSignalState{
  display:flex;
  align-items:center;
  gap:8px;
  margin-bottom:14px;
  font-size:18px;
  letter-spacing:3px;
  color:#e4d4aa;
}
.menuSignalDot{
  width:7px;
  height:7px;
  border-radius:50%;
  background:#d3a43f;
  box-shadow:0 0 12px rgba(223,173,69,.55);
  animation:menuSignalPulse 2.2s ease-in-out infinite;
}
@keyframes menuSignalPulse{
  0%,100%{opacity:.35;box-shadow:0 0 6px rgba(223,173,69,.25)}
  50%{opacity:1;box-shadow:0 0 15px rgba(223,173,69,.70)}
}
.menuRightLead{
  margin:0 0 16px;
  max-width:290px;
  font-size:10px;
  line-height:1.75;
  color:#8d8a79;
}
.menuRightRule{height:1px;background:rgba(226,211,164,.10);margin:13px 0 16px}
.menuRightSectionLabel{
  font-size:8px;
  letter-spacing:2px;
  color:#b5ae96;
  margin-bottom:7px;
}
.menuHomeRedesign .usernameRow{width:100%;margin:0}
.menuHomeRedesign .usernameInput{
  width:100%;
  box-sizing:border-box;
  background:rgba(2,4,3,.54);
  border-color:rgba(231,220,171,.12);
  border-radius:2px;
  color:#e2dcc0;
}
.menuHomeRedesign .usernameButton{
  border-color:rgba(231,220,171,.12);
  background:rgba(255,255,255,.035);
  border-radius:2px;
  color:#c4b894;
}
.menuHomeRedesign .houseLoader{width:100%;margin:12px 0 0;text-align:left}
.menuHomeRedesign .houseLoaderTop{color:#96907d}
.menuHomeRedesign .houseLoaderStatus{color:#777466;min-height:14px}
.menuNameGate{
  position:absolute;
  inset:0;
  z-index:20;
  display:none;
  place-items:center;
  background:rgba(0,0,0,.50);
  backdrop-filter:blur(5px);
}
.menuNameGate.open{display:grid}
.menuNameGateCard{
  width:min(430px,calc(100vw - 40px));
  padding:24px;
  border:1px solid rgba(226,211,164,.18);
  border-radius:3px;
  background:linear-gradient(145deg,rgba(8,11,9,.94),rgba(3,5,4,.96));
  box-shadow:0 28px 100px rgba(0,0,0,.62);
}
.menuNameGateTitle{
  font-size:16px;
  letter-spacing:3px;
  color:#f0e7c8;
  margin-bottom:8px;
}
.menuNameGateText{
  margin:0 0 17px;
  font-size:9px;
  line-height:1.7;
  letter-spacing:1.4px;
  color:#8f8b79;
}
.menuNameGateActions{
  display:flex;
  gap:7px;
  margin-top:9px;
}
.menuNameGateActions button{
  flex:1;
  min-height:38px;
  border:1px solid rgba(231,220,171,.14);
  border-radius:2px;
  background:rgba(255,255,255,.04);
  color:#cfc6a9;
  font:inherit;
  font-size:9px;
  letter-spacing:1.5px;
  cursor:pointer;
}
.menuNameGateActions button.primary{
  border-color:rgba(223,173,69,.42);
  background:rgba(223,173,69,.10);
  color:#f0dfaf;
}
.menuNameGateActions button:hover{background:rgba(223,173,69,.10)}
.menuNameGate .usernameRow{width:100%;margin:0}
.menuNameGate .usernameInput{
  background:rgba(1,3,2,.82);
  border-color:rgba(231,220,171,.14);
  border-radius:2px;
}
.menuFooter{
  position:absolute;
  left:clamp(22px,3vw,52px);
  right:clamp(22px,3vw,52px);
  bottom:clamp(18px,3vh,28px);
  display:flex;
  justify-content:space-between;
  gap:22px;
  font-size:7px;
  line-height:1.6;
  letter-spacing:1.4px;
  color:#68655a;
  text-shadow:0 2px 8px #000;
}
.menuFooter span:last-child{text-align:right}
@media(max-width:1000px){
  .menuNav{width:min(330px,38vw)}
  .menuSlotBar{width:min(510px,52vw)}
  .menuRightPanel{right:20px;width:min(330px,32vw)}
}
@media(max-width:750px){
  .menuLogoMain span{font-size:24px}
  .menuLogoMain strong{font-size:32px}
  .menuNav{top:172px;left:20px;width:min(320px,82vw)}
  .menuSlotBar{left:20px;bottom:64px;width:calc(100vw - 40px)}
  .menuHomeRedesign #saveSlots{grid-template-columns:1fr}
  .menuRightPanel{display:none}
  .menuFooter{left:20px;right:20px;bottom:17px}
  .menuFooter span:last-child{display:none}
  .menuLogo{left:20px;top:22px}
}
`;
  document.head.appendChild(style);

  if(!document.getElementById("menuBackdrop")){
    const backdrop=document.createElement("div");
    backdrop.id="menuBackdrop";
    backdrop.innerHTML=`
      <div class="menuBackdropGlow"></div>
      <div class="menuBackdropScan"></div>
      <div class="menuBackdropArchitecture"></div>
      <div class="menuBackdropTower"></div>
      <div class="menuBackdropPipe"></div>
      <div class="menuBackdropLight"></div>
      <div class="menuBackdropLight secondary"></div>
      <div class="menuBackdropHaze"></div>
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

  configureButton(continueButton,"CONTINUE",true);
  configureButton(newGameButton,"NEW GAME");
  configureButton(createLobbyButton,"HOST LOBBY");
  configureButton(joinLobbyButton,"JOIN LOBBY");

  menuControlsButton=document.createElement("button");
  configureButton(menuControlsButton,"CONTROLS");
  menuControlsButton.addEventListener("click",()=>showControls());

  nav.append(continueButton,newGameButton,createLobbyButton,joinLobbyButton,menuControlsButton);

  const slotBar=document.createElement("div");
  slotBar.className="menuSlotBar";
  slotBar.innerHTML=`
    <div class="menuSlotHeader"><strong>LOCAL SAVES</strong><span>SELECT A SLOT</span></div>
  `;
  if(saveSlots) slotBar.appendChild(saveSlots);

  const saveStatus=document.createElement("div");
  saveStatus.className="menuSaveStatus";
  saveStatus.appendChild(saveInfo);

  const right=document.createElement("aside");
  right.className="menuRightPanel";
  right.innerHTML=`
    <div class="menuRightHeader"><span>FIELD TERMINAL</span><span>BUILD ${new Date().getFullYear()}</span></div>
    <div class="menuSignalState"><span class="menuSignalDot"></span><span>SIGNAL: LOST</span></div>
    <p class="menuRightLead">The apartment is only the entrance. Something is waiting in the halls beyond it.</p>
    <div class="menuRightRule"></div>
    <div class="menuRightSectionLabel">SYSTEM STATUS</div>
  `;
  if(houseLoader){
    const loaderLabel=document.createElement("div");
    loaderLabel.style.cssText="margin-top:13px;font-size:8px;letter-spacing:2px;color:#b5ae96;";
    loaderLabel.textContent="APARTMENT";
    right.appendChild(loaderLabel);
    right.appendChild(houseLoader);
  }
  right.appendChild(saveStatus);

  const nameGate=document.createElement("div");
  nameGate.className="menuNameGate";
  nameGate.innerHTML=`
    <div class="menuNameGateCard">
      <div class="menuNameGateTitle">IDENTIFY YOURSELF</div>
      <p class="menuNameGateText">Choose the name that other players will see. Your name is saved locally for future sessions.</p>
    </div>
  `;
  const nameCard=nameGate.firstElementChild;
  if(usernameRow) nameCard.appendChild(usernameRow);

  const nameActions=document.createElement("div");
  nameActions.className="menuNameGateActions";
  const nameCancel=document.createElement("button");
  nameCancel.type="button";
  nameCancel.textContent="CANCEL";
  const nameContinue=document.createElement("button");
  nameContinue.type="button";
  nameContinue.className="primary";
  nameContinue.textContent="CONTINUE";
  nameActions.append(nameCancel,nameContinue);
  nameCard.appendChild(nameActions);
  layout.appendChild(nameGate);

  const footer=document.createElement("div");
  footer.className="menuFooter";
  footer.innerHTML=`<span>TAB · CONTROLS &nbsp;&nbsp; ESC · RELEASE MOUSE</span><span>STAY IN THE LIGHT. KEEP MOVING.</span>`;

  layout.append(logo,nav,slotBar,right,footer);

  let pendingMenuAction=null;
  const openNameGate=(action)=>{
    pendingMenuAction=action;
    const key="deepseeker-player-name";
    let current="";
    try{ current=localStorage.getItem(key)||""; }catch{}
    const input=usernameRow?.querySelector(".usernameInput");
    if(input) input.value=current;
    nameGate.classList.add("open");
    setTimeout(()=>input?.focus(),0);
  };
  const closeNameGate=()=>{
    pendingMenuAction=null;
    nameGate.classList.remove("open");
  };
  const submitNameGate=()=>{
    const input=usernameRow?.querySelector(".usernameInput");
    const name=String(input?.value||"").replace(/[<>]/g,"").replace(/\\s+/g," ").trim().slice(0,20);
    if(!name){
      input?.focus();
      return;
    }
    try{ localStorage.setItem("deepseeker-player-name",name); }catch{}
    const action=pendingMenuAction;
    pendingMenuAction=null;
    nameGate.classList.remove("open");
    if(action) action();
  };
  nameCancel.addEventListener("click",closeNameGate);
  nameContinue.addEventListener("click",submitNameGate);
  usernameRow?.querySelector(".usernameInput")?.addEventListener("keydown",event=>{
    if(event.key==="Enter"){
      event.preventDefault();
      submitNameGate();
    }else if(event.key==="Escape"){
      event.preventDefault();
      closeNameGate();
    }
  });
  usernameRow?.querySelector(".usernameButton")?.addEventListener("click",event=>{
    event.preventDefault();
    submitNameGate();
  });

  homeScreen.appendChild(layout);

  window.__deepseekerMenu={
    openNameGate,
    closeNameGate
  };
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
      eventText.textContent="SPIDER GLB FAILED TO LOAD";
      eventText.style.opacity="1";
    }
  );
}

loadSpiderFromPack();
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
  if(window.__deepseekerMenu?.openNameGate){
    window.__deepseekerMenu.openNameGate(()=>resetForNewGame(selectedSaveSlot));
  }
});

continueButton.addEventListener("click",()=>{
  continueGame(selectedSaveSlot);
});

createLobbyButton.addEventListener("click",()=>{
  const code=Math.random().toString(36).slice(2,8).toUpperCase();
  if(window.__deepseekerMenu?.openNameGate){
    window.__deepseekerMenu.openNameGate(()=>enterLobby(code,true));
  }
});

joinLobbyButton.addEventListener("click",()=>{
  const code=window.prompt("Enter the lobby code:");
  if(code && window.__deepseekerMenu?.openNameGate){
    window.__deepseekerMenu.openNameGate(()=>enterLobby(code,false));
  }
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
  }else if(e.code==="KeyF" && !phoneOpen && !controlsOpen) toggleFlashlight();
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
    world.update(player.pos.x,player.pos.z);
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

  renderer.render(scene,camera);
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
  renderer,
  seed:SEED,
  house:{model:()=>houseModel,spawn:()=>houseSpawn,active:()=>houseMode,toggle:()=>setHouseMode(!houseMode)}
};
