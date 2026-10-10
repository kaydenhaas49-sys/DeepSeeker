import * as THREE from "three";
import { World, EYE, WALL_H, WALL_T, CHUNK_SIZE, MAP_MIN_CHUNK, MAP_MAX_CHUNK, mulberry32 } from "./world.js";
import { createTextures } from "./textures.js";
import { Player } from "./player.js";
import { HorrorAudio } from "./audio.js";
import { Multiplayer } from "./multiplayer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { flashlightFlicker } from "./character.js";
import { InteractionSystem } from "./interaction.js";
import { NavigationSystem } from "./navigation.js";
import { ComputerSystem } from "./computer.js";
import { SecurityCameraSystem } from "./securityCameras.js";
import { createFunnyDuckEntity, getArachnophobiaMode, setArachnophobiaMode, preloadBiscuitTexture } from "./entityMode.js";
import { SpiderHunter } from "./spiderHunter.js";

let arachnophobiaMode=getArachnophobiaMode();

const urlParams=new URLSearchParams(location.search);
const seedParam=urlParams.get("seed");
const SEED=seedParam!==null&&seedParam!==""?(parseInt(seedParam,10)||0):1337;
const QUALITY_PARAM=urlParams.get("quality");

function detectLowEndHardware(){
  const cores=navigator.hardwareConcurrency||4;
  const memory=navigator.deviceMemory||4;
  let gpu="";
  try{
    const canvas=document.createElement("canvas");
    const gl=canvas.getContext("webgl2")||canvas.getContext("webgl");
    const ext=gl?.getExtension("WEBGL_debug_renderer_info");
    gpu=ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)||"")
      : String(gl?.getParameter(gl.RENDERER)||"");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }catch{}

  // Modern Chromebook Intel UHD/Iris graphics are not automatically treated as
  // potato hardware anymore. Reserve the lowest visual tier for software
  // rendering, old Intel HD-class GPUs, or very small CPU/RAM systems.
  const softwareRasterizer=/swiftshader|llvmpipe|software rasterizer|microsoft basic render/i.test(gpu);
  const oldIntelGpu=/intel(?:r)?\s+hd\s+graphics|mesa.*intel\s+hd/i.test(gpu);
  const weakCpu=cores<=4 && memory<=4;
  const forcedLow=QUALITY_PARAM==="low";
  const forcedPotato=QUALITY_PARAM==="potato";

  return {
    low:forcedLow || forcedPotato || softwareRasterizer || oldIntelGpu || weakCpu,
    ultraLow:forcedPotato || softwareRasterizer || (cores<=2 && memory<=2)
  };
}

const PERFORMANCE_TIER=detectLowEndHardware();
const LOW_END_PERFORMANCE=QUALITY_PARAM!=="high" && PERFORMANCE_TIER.low;
const ULTRA_LOW_PERFORMANCE=QUALITY_PARAM!=="high" && PERFORMANCE_TIER.ultraLow;
if(LOW_END_PERFORMANCE) document.documentElement.classList.add("deepseeker-low");

const container=document.getElementById("app");
const overlay=document.getElementById("overlay");
const loadingScreen=document.getElementById("loadingScreen");
const homeScreen=document.getElementById("homeScreen");
const lobbyScreen=document.getElementById("lobbyScreen");
const arachnophobiaWarning=document.getElementById("arachnophobiaWarning");
const arachnophobiaModeButton=document.getElementById("arachnophobiaModeButton");
const arachnophobiaModeStatus=document.getElementById("arachnophobiaModeStatus");
const arachnophobiaContinueButton=document.getElementById("arachnophobiaContinueButton");
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
const fitScreenButton=document.getElementById("fitScreenButton");
const staminaBar=document.getElementById("staminaBar");
const staminaValue=document.getElementById("staminaValue");
const batteryBar=document.getElementById("batteryBar");
const batteryValue=document.getElementById("batteryValue");
const eventText=document.getElementById("event");
const objective=document.getElementById("objective");
const hudRight=document.getElementById("hudRight");

const tutorialGuide=document.createElement("div");
tutorialGuide.id="tutorialGuide";
tutorialGuide.style.cssText=[
  "position:fixed",
  "left:50%",
  "bottom:7%",
  "transform:translateX(-50%) translateY(10px)",
  "width:min(520px,calc(100vw - 36px))",
  "box-sizing:border-box",
  "padding:16px 18px 14px",
  "border:1px solid rgba(226,214,166,.24)",
  "border-radius:9px",
  "background:linear-gradient(180deg,rgba(10,12,9,.92),rgba(4,6,4,.96))",
  "box-shadow:0 16px 50px rgba(0,0,0,.55),inset 0 1px rgba(255,255,255,.045)",
  "backdrop-filter:blur(7px)",
  "color:#eee7c9",
  "z-index:18",
  "pointer-events:none",
  "opacity:0",
  "transition:opacity .22s ease,transform .22s ease"
].join(";");
tutorialGuide.innerHTML=
  '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px">'+
    '<span id="tutorialGuideLabel" style="font-size:8px;letter-spacing:3px;color:#989174">FIELD TUTORIAL</span>'+
    '<span id="tutorialGuideStep" style="font:10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:1.5px;color:#7f7c69">01/09</span>'+
  '</div>'+
  '<div id="tutorialGuideAction" style="font-size:15px;letter-spacing:1.4px;color:#eee8cb"></div>'+
  '<div id="tutorialGuideHint" style="margin-top:6px;font-size:10px;line-height:1.45;letter-spacing:.8px;color:#9f9a84"></div>';
document.body.appendChild(tutorialGuide);
const tutorialGuideStep=document.getElementById("tutorialGuideStep");
const tutorialGuideAction=document.getElementById("tutorialGuideAction");
const tutorialGuideHint=document.getElementById("tutorialGuideHint");
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
const adminIcon=document.getElementById("adminIcon");
const adminOverlay=document.getElementById("adminOverlay");
const adminAuthCard=document.getElementById("adminAuthCard");
const adminPanelCard=document.getElementById("adminPanelCard");
const adminPasswordInput=document.getElementById("adminPassword");
const adminUnlockButton=document.getElementById("adminUnlockButton");
const adminCloseButton=document.getElementById("adminCloseButton");
const adminAdminCloseButton=document.getElementById("adminAdminCloseButton");
const adminLockButton=document.getElementById("adminLockButton");
const adminFlyButton=document.getElementById("adminFlyButton");
const adminWaterGunButton=document.getElementById("adminWaterGunButton");
const adminWaterRpgButton=document.getElementById("adminWaterRpgButton");
const adminClearWaterButton=document.getElementById("adminClearWaterButton");
const adminAuthStatus=document.getElementById("adminAuthStatus");
const adminPanelStatus=document.getElementById("adminPanelStatus");
const houseLoadFillHome=document.getElementById("houseLoadFillHome");
const houseLoadPercentHome=document.getElementById("houseLoadPercentHome");
const houseLoadStatusHome=document.getElementById("houseLoadStatusHome");
const houseLoadFillLobby=document.getElementById("houseLoadFillLobby");
const houseLoadPercentLobby=document.getElementById("houseLoadPercentLobby");
const houseLoadStatusLobby=document.getElementById("houseLoadStatusLobby");
let menuControlsButton=null;

document.addEventListener("click",(event)=>{
  const target=event.target?.closest?.("#newGameButton");
  if(!target) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if(gameStarted) return;

  try{
    resetForNewGame(selectedSaveSlot,{skipConfirm:true});
  }catch(error){
    console.error("[DeepSeeker] NEW GAME click failed:",error);
    const message=String(error?.message||error||"Unknown error");
    if(eventText){
      eventText.textContent="NEW GAME ERROR · "+message.slice(0,140);
      eventText.style.opacity="1";
    }
  }
},true);


const gltfLoader=new GLTFLoader();
const dracoLoader=new DRACOLoader();
dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/gltf/");
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

// Warm the geometry decoders during the boot screen so the first playable
// scene never has to pause for decoder initialization after the menu appears.
let geometryDecoderReady=false;
const geometryDecoderPromise=(async()=>{
  try{
    dracoLoader.preload();
    if(MeshoptDecoder?.ready){
      await MeshoptDecoder.ready;
    }
  }catch(error){
    console.warn("[DeepSeeker] Geometry decoder warmup failed; loaders will retry on demand:",error);
  }
  geometryDecoderReady=true;
})();

const renderer=new THREE.WebGLRenderer({
  // Keep antialiasing on for normal Chromebook/low-end hardware. Only the
  // ultra-low tier disables it because aliasing was a major part of the
  // blurry/cheap look on ChromeOS.
  antialias:!ULTRA_LOW_PERFORMANCE,
  powerPreference:"high-performance",
  precision:ULTRA_LOW_PERFORMANCE?"mediump":"highp",
  alpha:false,
  stencil:false
});
renderer.setSize(innerWidth,innerHeight,false);

const BASE_PIXEL_RATIO=LOW_END_PERFORMANCE
  ? Math.min(devicePixelRatio,ULTRA_LOW_PERFORMANCE?.55:.78)
  : Math.min(devicePixelRatio,1.0);
const HOUSE_PIXEL_RATIO=LOW_END_PERFORMANCE
  ? (ULTRA_LOW_PERFORMANCE?.50:.70)
  : .66;
const MIN_HOUSE_PIXEL_RATIO=LOW_END_PERFORMANCE
  ? (ULTRA_LOW_PERFORMANCE?.34:.54)
  : .52;
const PERFORMANCE_TARGET_FPS=60;
let currentPixelRatio=BASE_PIXEL_RATIO;
let housePixelRatio=HOUSE_PIXEL_RATIO;
let perfElapsed=0;
let perfFrames=0;
let perfCooldown=0;
let uiRefreshElapsed=0;
let storyRefreshElapsed=0;
let debugPerfElapsed=0;
renderer.setPixelRatio(currentPixelRatio);
// Keep the game's contrast/lighting response intact on Chromebooks.
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.08;
renderer.outputColorSpace=THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x000100);
scene.fog=new THREE.Fog(
  0x030302,
  LOW_END_PERFORMANCE?13:14,
  LOW_END_PERFORMANCE?56:62
);

const camera=new THREE.PerspectiveCamera(
  70,
  innerWidth/innerHeight,
  .08,
  LOW_END_PERFORMANCE?180:300
);
const world=new World(scene,SEED,Math.min(renderer.capabilities.getMaxAnisotropy(),4));

const tutorialOpenRoomRoot=new THREE.Group();
tutorialOpenRoomRoot.name="DeepSeekerTutorialOpenRoom";
tutorialOpenRoomRoot.visible=false;
scene.add(tutorialOpenRoomRoot);

const tutorialOpenRoomCollisionBoxes=[];
const tutorialHiddenWallMeshes=[];
const tutorialOpenRoomLights=[];
const tutorialOpenRoomOccluders=[];
let tutorialOpenRoomLightLastUpdate=0;
const tutorialOpenRoomLightOrigin=new THREE.Vector3();
const tutorialOpenRoomLightDirection=new THREE.Vector3();
const tutorialOpenRoomLightTarget=new THREE.Vector3();
const tutorialOpenRoomLightTargetDirection=new THREE.Vector3();
const tutorialOpenRoomLightRaycaster=new THREE.Raycaster();
let tutorialOpenRoomActive=false;
let tutorialMascotRoot=null;
let tutorialMascotReady=false;
let tutorialMascotTime=0;
let tutorialMascotMouth=null;
let tutorialMascotFlashlight=null;
let tutorialMascotFlashlightLens=null;
let tutorialMascotBlasterBeam=null;
let tutorialMascotSpeechStage=-1;
let tutorialMascotSpeechTimer=0;
let tutorialMascotVoiceWaiter=null;
let tutorialMascotPendingSpeechStage=-1;
const tutorialMascotPosition=new THREE.Vector3();
const tutorialMascotRight=new THREE.Vector3();
const tutorialMascotForward=new THREE.Vector3();
const tutorialMascotAimLocal=new THREE.Vector3(-.55,.08,-1).normalize();
const tutorialMascotAimQuaternion=new THREE.Quaternion();
tutorialMascotAimQuaternion.setFromUnitVectors(
  new THREE.Vector3(1,0,0),
  tutorialMascotAimLocal
);

function createTutorialMascot(){
  if(tutorialMascotReady) return;

  // Badgey is a tiny helper robot projected above the left arm: head, face,
  // little body, arms, and feet. Keep the shape friendly and unmistakably
  // character-like instead of an isolated glowing ball.
  tutorialMascotRoot=new THREE.Group();
  tutorialMascotRoot.name="BadgeyHologram";
  tutorialMascotRoot.visible=false;
  tutorialMascotRoot.position.set(-.235,-.30,-.86);
  player.hands.add(tutorialMascotRoot);

  const holo=new THREE.MeshBasicMaterial({
    color:0x5cefff,transparent:true,opacity:.80,
    depthTest:false,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,toneMapped:false
  });
  const edge=new THREE.MeshBasicMaterial({
    color:0xc4ffff,transparent:true,opacity:.96,
    depthTest:false,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,toneMapped:false
  });
  const visor=new THREE.MeshBasicMaterial({
    color:0x043448,transparent:true,opacity:.96,
    depthTest:false,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,toneMapped:false
  });
  const eyes=new THREE.MeshBasicMaterial({
    color:0xf2ffff,depthTest:false,depthWrite:false,
    blending:THREE.AdditiveBlending,toneMapped:false
  });
  const softGlow=new THREE.MeshBasicMaterial({
    color:0x27cde8,transparent:true,opacity:.65,
    depthTest:false,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,toneMapped:false
  });

  const part=(name,geometry,material,position,scale,rotation)=>{
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=name;
    mesh.position.set(position[0],position[1],position[2]);
    if(scale) mesh.scale.set(scale[0],scale[1],scale[2]);
    if(rotation) mesh.rotation.set(rotation[0]||0,rotation[1]||0,rotation[2]||0);
    mesh.frustumCulled=false;
    mesh.renderOrder=3010;
    tutorialMascotRoot.add(mesh);
    return mesh;
  };

  // Head and broad visor.
  part("BadgeyHead",new THREE.SphereGeometry(.065,16,12),holo,[0,.052,0],[1.18,.90,.68]);
  part("BadgeyVisor",new THREE.SphereGeometry(.051,16,12),visor,[0,.054,.039],[1,.68,.28]);
  part("BadgeyEyeLeft",new THREE.SphereGeometry(.009,10,8),eyes,[-.021,.061,.051],[1,1,.60]);
  part("BadgeyEyeRight",new THREE.SphereGeometry(.009,10,8),eyes,[.021,.061,.051],[1,1,.60]);

  tutorialMascotMouth=part(
    "BadgeySmile",new THREE.TorusGeometry(.012,.0027,5,14,Math.PI),edge,
    [0,.034,.052],[1,1,.45],[0,0,Math.PI]
  );

  // Neck and torso make the head read as a small character rather than an orb.
  part("BadgeyNeck",new THREE.CylinderGeometry(.014,.018,.020,10),edge,[0,-.010,0]);
  part("BadgeyTorso",new THREE.CapsuleGeometry(.032,.050,4,10),holo,[0,-.055,0],[1,.86,.78]);
  part("BadgeyChestLight",new THREE.SphereGeometry(.010,10,8),edge,[0,-.051,.027],[1,1,.45]);
  part("BadgeyShoulderLeft",new THREE.SphereGeometry(.016,10,8),softGlow,[-.038,-.028,0]);
  part("BadgeyShoulderRight",new THREE.SphereGeometry(.016,10,8),softGlow,[.038,-.028,0]);

  for(const side of [-1,1]){
    part(
      "BadgeyArm",new THREE.CapsuleGeometry(.008,.031,3,8),holo,
      [side*.064,-.040,0],[1,1,1],[0,0,side*Math.PI/2]
    );
    part("BadgeyHand",new THREE.SphereGeometry(.010,9,7),edge,[side*.085,-.061,.002],[1,.85,.8]);
    part("BadgeyLeg",new THREE.CapsuleGeometry(.009,.023,3,8),holo,[side*.020,-.105,0]);
    part("BadgeyFoot",new THREE.SphereGeometry(.013,9,7),edge,[side*.021,-.129,.005],[1,.65,1]);
  }

  // A tiny antenna and a pair of side fins give Badgey a recognizable outline.
  part("BadgeyAntenna",new THREE.CylinderGeometry(.0025,.0035,.018,7),edge,[0,.122,0]);
  part("BadgeyAntennaLight",new THREE.SphereGeometry(.007,9,7),edge,[0,.132,0]);
  for(const side of [-1,1]){
    part("BadgeyFin",new THREE.SphereGeometry(.016,10,8),holo,[side*.076,.049,0],[.72,1,.64]);
  }

  const ring=new THREE.Mesh(new THREE.TorusGeometry(.074,.0028,5,20),edge);
  ring.name="BadgeyProjectionRing";
  ring.rotation.x=Math.PI/2;
  ring.position.set(0,-.145,0);
  ring.frustumCulled=false;
  ring.renderOrder=3009;
  tutorialMascotRoot.add(ring);

  const glow=new THREE.PointLight(0x22eaff,.12,.32);
  glow.position.set(0,.025,.02);
  tutorialMascotRoot.add(glow);

  tutorialMascotReady=true;
}

function speakTutorialMascot(stage){
  const lines={
    1:"Hey, let's start with WASD. Move around a bit.",
    2:"Nice. Space makes you jump.",
    3:"Control lets you crouch. Handy.",
    4:"Hold Shift when you need to run.",
    5:"Tap F for your flashlight. Better already.",
    6:"Press P if you need your phone.",
    7:"Check that message, then close your phone when you're done.",
    8:"Let's head toward that object. I'll stay with you.",
    9:"Time to go. We can panic while we're moving."
  };
  const text=lines[stage];
  if(!text || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance==="undefined") return;

  const speech=window.speechSynthesis;
  if(tutorialMascotSpeechStage===stage) return;
  const voices=speech.getVoices();

  // Voice lists can arrive after the tutorial starts. Wait for them once;
  // never fall back to an obviously robotic synth just to force audio output.
  if(!voices.length){
    tutorialMascotPendingSpeechStage=stage;
    if(!tutorialMascotVoiceWaiter && typeof speech.addEventListener==="function"){
      tutorialMascotVoiceWaiter=()=>{
        if(!speech.getVoices().length) return;
        speech.removeEventListener("voiceschanged",tutorialMascotVoiceWaiter);
        tutorialMascotVoiceWaiter=null;
        const pending=tutorialMascotPendingSpeechStage;
        tutorialMascotPendingSpeechStage=-1;
        if(pending===houseTutorialStage && tutorialMascotSpeechStage!==pending){
          speakTutorialMascot(pending);
        }
      };
      speech.addEventListener("voiceschanged",tutorialMascotVoiceWaiter);
    }
    window.setTimeout(()=>{
      if(tutorialMascotPendingSpeechStage!==stage) return;
      if(speech.getVoices().length){
        if(tutorialMascotVoiceWaiter){
          speech.removeEventListener("voiceschanged",tutorialMascotVoiceWaiter);
          tutorialMascotVoiceWaiter=null;
        }
        tutorialMascotPendingSpeechStage=-1;
        if(houseTutorialStage===stage && tutorialMascotSpeechStage!==stage){
          speakTutorialMascot(stage);
        }
        return;
      }
      if(tutorialMascotVoiceWaiter){
        speech.removeEventListener("voiceschanged",tutorialMascotVoiceWaiter);
        tutorialMascotVoiceWaiter=null;
      }
      tutorialMascotPendingSpeechStage=-1;
      tutorialMascotSpeechStage=stage;
      console.info("[DeepSeeker] No speech voice loaded; Badgey's tutorial captions remain available.");
    },1600);
    return;
  }

  const english=voices.filter(voice=>/^en([_-]|$)/i.test(voice.lang||""));
  const badVoice=/espeak|festival|flite|mbrola|robot|compact/i;
  const naturalVoice=/neural|natural|online|premium|aria|jenny|ava|samantha|alex|daniel|guy|sonia|libby|james|zira|david|ryan|sara|google.*english|microsoft.*(?:natural|online|david|zira|aria|jenny|guy|ryan)/i;
  const candidates=english.filter(voice=>{
    const name=voice.name||"";
    return !badVoice.test(name) && (naturalVoice.test(name) || voice.localService===false);
  });
  const qualityScore=voice=>{
    const name=voice.name||"";
    let score=0;
    if(/neural|natural|online|premium/i.test(name)) score+=160;
    if(/aria|jenny|ava|samantha|alex|daniel|guy|sonia|libby|james|zira|david|ryan|sara|google.*english|microsoft/i.test(name)) score+=80;
    if(/en[-_]CA/i.test(voice.lang||"")) score+=20;
    else if(/en[-_]US/i.test(voice.lang||"")) score+=12;
    if(voice.localService===false) score+=8;
    return score;
  };
  candidates.sort((a,b)=>qualityScore(b)-qualityScore(a));

  // Linux browsers often expose only eSpeak. Captions are preferable to
  // forcing that robotic voice on everyone; use a known natural/online voice.
  if(!candidates.length){
    tutorialMascotSpeechStage=stage;
    tutorialMascotPendingSpeechStage=-1;
    console.info("[DeepSeeker] No natural English voice found; keeping Badgey silent instead of using a robotic system voice.");
    return;
  }

  tutorialMascotSpeechStage=stage;
  tutorialMascotPendingSpeechStage=-1;
  try{
    speech.cancel();
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang=candidates[0].lang||"en-US";
    utterance.voice=candidates[0];
    utterance.rate=.98;
    utterance.pitch=1.02;
    utterance.volume=.78;
    speech.speak(utterance);
  }catch(error){
    console.debug("[DeepSeeker] Natural Badgey voice unavailable; use the visible tutorial captions:",error);
  }
}
function updateTutorialMascot(dt){
  if(!tutorialMascotRoot || !tutorialMascotReady) return;

  if(player.characterFlashlight) player.characterFlashlight.visible=false;
  player.setFlashlightVisual(flashlightOn && battery>0);

  tutorialMascotTime+=dt;
  tutorialMascotSpeechTimer=Math.max(0,tutorialMascotSpeechTimer-dt);
  const shouldShow=
    gameStarted &&
    !houseMode &&
    tutorialOpenRoomActive &&
    houseTutorialStage>=1 &&
    houseTutorialStage<=9;

  if(!shouldShow){
    tutorialMascotRoot.visible=false;
    if("speechSynthesis" in window && houseTutorialStage>=10){
      window.speechSynthesis.cancel();
    }
    return;
  }

  tutorialMascotRoot.visible=true;
  tutorialMascotRoot.position.set(
    -.235,
    -.29+Math.sin(tutorialMascotTime*2.1)*.006,
    -.86
  );

  const talkActive=
    tutorialMascotSpeechTimer>0 ||
    (tutorialMascotSpeechStage===houseTutorialStage && tutorialMascotTime%2.8<.34);
  if(tutorialMascotMouth){
    tutorialMascotMouth.scale.y=talkActive
      ? .8+Math.abs(Math.sin(tutorialMascotTime*8))*.22
      : 1;
  }
  if(tutorialMascotSpeechStage!==houseTutorialStage){
    speakTutorialMascot(houseTutorialStage);
    tutorialMascotSpeechTimer=1.7;
  }

  tutorialMascotRoot.scale.setScalar(.99+Math.sin(tutorialMascotTime*3.0)*.01);
}

function clearTutorialOpenRoomGeometry(){
  tutorialOpenRoomLights.length=0;
  tutorialOpenRoomOccluders.length=0;
  tutorialOpenRoomLightLastUpdate=0;
  while(tutorialOpenRoomRoot.children.length){
    const child=tutorialOpenRoomRoot.children.pop();
    if(!child) continue;

    child.traverse(obj=>{
      if(obj.userData?.tutorialOwnedMaterial && obj.material){
        const materials=Array.isArray(obj.material) ? obj.material : [obj.material];
        for(const material of materials) material.dispose();
      }
      if(obj.userData?.tutorialOwnedGeometry && obj.geometry){
        obj.geometry.dispose();
      }
    });
  }
  tutorialOpenRoomRoot.visible=false;
}

function ensureTutorialOpenRoom(){
  if(tutorialOpenRoomActive) return;

  // Seed the real procedural world in the background, but keep it completely
  // out of the tutorial render path. The tutorial must never depend on a chunk
  // mesh, chunk light, or world-material lighting state to be visible.
  world.update(32,32);
  world.root.visible=false;

  tutorialOpenRoomCollisionBoxes.length=0;
  clearTutorialOpenRoomGeometry();
  createTutorialMascot();

  const min=4;
  const max=60;
  const h=WALL_H;
  const t=WALL_T;

  const wallMaterial=new THREE.MeshStandardMaterial({
    map:world.materials.wall.map,
    color:0xb6a13f,
    roughness:.92
  });
  const floorMaterial=new THREE.MeshStandardMaterial({
    map:world.materials.floor.map,
    color:0x8f876f,
    roughness:1,
    side:THREE.DoubleSide
  });
  const ceilingMaterial=new THREE.MeshStandardMaterial({
    map:world.materials.ceiling.map,
    color:0x3a382e,
    roughness:.96,
    side:THREE.DoubleSide
  });
  const fixtureMaterial=new THREE.MeshStandardMaterial({
    color:0xffedbd,
    emissive:0xffe7ad,
    emissiveIntensity:1.8,
    roughness:.35
  });

  const addTutorialMesh=(geometry,material,position)=>{
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.copy(position);
    mesh.frustumCulled=false;
    mesh.userData.tutorialOwnedGeometry=true;
    mesh.userData.tutorialOwnedMaterial=true;
    tutorialOpenRoomRoot.add(mesh);
    return mesh;
  };

  const floor=addTutorialMesh(
    new THREE.PlaneGeometry(max-min,max-min),
    floorMaterial,
    new THREE.Vector3((min+max)*.5,0,(min+max)*.5)
  );
  floor.rotation.x=-Math.PI/2;

  const ceiling=addTutorialMesh(
    new THREE.BoxGeometry(max-min,.16,max-min),
    ceilingMaterial,
    new THREE.Vector3((min+max)*.5,h+.08,(min+max)*.5)
  );
  ceiling.castShadow=true;
  ceiling.receiveShadow=true;

  const walls=[
    {size:[max-min,h,t],position:[(min+max)*.5,h*.5,min]},
    {size:[max-min,h,t],position:[(min+max)*.5,h*.5,max]},
    {size:[t,h,max-min],position:[min,h*.5,(min+max)*.5]},
    {size:[t,h,max-min],position:[max,h*.5,(min+max)*.5]}
  ];

  for(const wall of walls){
    const mesh=addTutorialMesh(
      new THREE.BoxGeometry(...wall.size),
      wallMaterial,
      new THREE.Vector3(...wall.position)
    );
    tutorialOpenRoomOccluders.push(mesh);
  }

  // Four permanent fluorescent fixtures, one near each corner of the tutorial.
  // The tutorial is tiny enough that keeping all four on has negligible cost.
  const tutorialFixturePositions=[[12,12],[52,12],[12,52],[52,52]];
  for(const [x,z] of tutorialFixturePositions){
    const fixtureMesh=addTutorialMesh(
      new THREE.BoxGeometry(4,.10,.95),
      fixtureMaterial.clone(),
      new THREE.Vector3(x,h-.055,z)
    );
    fixtureMesh.material.emissiveIntensity=.34;

    const light=new THREE.PointLight(0xffe6a8,11.5,30,1.35);
    light.position.set(x,h-.75,z);
    light.castShadow=false;
    light.visible=true;
    light.name="TutorialFluorescentLight";
    tutorialOpenRoomRoot.add(light);
    tutorialOpenRoomLights.push({
      light,
      mesh:fixtureMesh,
      x,
      z,
      phase:Math.random()*Math.PI*2,
      baseIntensity:11.5
    });
  }

  const half=t*.5;
  tutorialOpenRoomCollisionBoxes.push(
    {minX:min,maxX:max,minZ:min-half,maxZ:min+half},
    {minX:min,maxX:max,minZ:max-half,maxZ:max+half},
    {minX:min-half,maxX:min+half,minZ:min,maxZ:max},
    {minX:max-half,maxX:max+half,minZ:min,maxZ:max}
  );

  tutorialOpenRoomRoot.visible=true;
  tutorialOpenRoomActive=true;
  renderer.shadowMap.enabled=true;
  flashlight.castShadow=true;
  flashlight.shadow.mapSize.set(256,256);
  flashlight.shadow.bias=-0.0004;
  flashlight.shadow.normalBias=0.018;
  player.ignoreWorldCollision=true;
  player.extraCollisionBoxes=tutorialOpenRoomCollisionBoxes;
}

function updateTutorialOpenRoomLights(){
  if(!tutorialOpenRoomActive || !tutorialOpenRoomLights.length) return;

  for(const item of tutorialOpenRoomLights){
    item.light.visible=true;
    item.light.intensity=item.baseIntensity;
    if(item.mesh?.material?.emissiveIntensity!==undefined){
      item.mesh.material.emissiveIntensity=2.1;
    }
  }
}

function disableTutorialOpenRoom(){
  if(!tutorialOpenRoomActive && tutorialOpenRoomRoot.children.length===0) return;

  clearTutorialOpenRoomGeometry();
  tutorialOpenRoomCollisionBoxes.length=0;
  tutorialOpenRoomActive=false;

  world.root.visible=true;
  renderer.shadowMap.enabled=ENABLE_SHADOWS;
  flashlight.castShadow=ENABLE_SHADOWS;
  player.ignoreWorldCollision=false;
  player.extraCollisionBoxes=[];
}

const hemi=new THREE.HemisphereLight(0xc2b889,0x211d12,0.16);
scene.add(hemi);
const ambient=new THREE.AmbientLight(0x8f815d,0.035);
scene.add(ambient);


// Dedicated title-screen camera and lighting. The actual procedural Backrooms
// remains visible behind the menu, so the title screen uses real geometry,
// textures, fog and depth instead of a flat CSS illustration.
const menuCamera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.05,160);

const menuScene=new THREE.Scene();
menuScene.background=new THREE.Color(0x4d4a34);
menuScene.fog=new THREE.Fog(0x55513a,15,76);

const menuSet=new THREE.Group();
menuSet.name="RuinedBackroomsMenuSet";
menuSet.visible=false;
menuScene.add(menuSet);

// Use the exact procedural textures from the playable Backrooms so the title screen
// has the same wallpaper and drop-ceiling language as the actual game.
const menuTextures=createTextures(Math.min(renderer.capabilities.getMaxAnisotropy(),4));
const menuWallTexture=menuTextures.wall;
const menuFloorTexture=menuTextures.floor;
const menuCeilingTexture=menuTextures.ceiling;

menuFloorTexture.repeat.set(28,29.5);

const menuWallMaterial=new THREE.MeshStandardMaterial({
  map:menuWallTexture,
  color:0xffffff,
  roughness:.92
});
const menuFloorMaterial=new THREE.MeshStandardMaterial({
  map:menuFloorTexture,
  color:0x5b5743,
  roughness:1
});
const menuCeilingMaterial=new THREE.MeshStandardMaterial({
  map:menuCeilingTexture,
  color:0xffffff,
  roughness:.95
});
const menuDarkMaterial=new THREE.MeshStandardMaterial({
  color:0x0b0d0a,
  roughness:1
});
const menuRuinMaterial=new THREE.MeshStandardMaterial({
  color:0x303129,
  roughness:.98
});
const menuTrimMaterial=new THREE.MeshStandardMaterial({
  color:0x494638,
  roughness:1
});
const menuStainMaterial=new THREE.MeshStandardMaterial({
  color:0x4a4738,
  roughness:1,
  transparent:true,
  opacity:.72
});
const menuWetMaterial=new THREE.MeshStandardMaterial({
  color:0x242722,
  roughness:.18,
  metalness:.10,
  transparent:true,
  opacity:.72
});
const menuLightMaterial=new THREE.MeshStandardMaterial({
  color:0xfff4ca,
  emissive:0xffe2a0,
  emissiveIntensity:3.3,
  roughness:.23
});

function addMenuBox(name,size,position,material,rotationY=0,rotationX=0,rotationZ=0){
  let meshMaterial=material;

  // The gameplay walls are textured at real 4m scale. Give each menu wall its
  // own map transform so long perimeter walls and short partitions keep the
  // same wallpaper density instead of stretching one shared texture.
  if(material===menuWallMaterial && material.map){
    meshMaterial=material.clone();
    meshMaterial.map=material.map.clone();
    const wallSpan=Math.max(size.x,size.z);
    meshMaterial.map.repeat.set(
      Math.max(1,wallSpan/4),
      1
    );
    meshMaterial.map.needsUpdate=true;
  }

  // Gameplay ceiling tiles use a 1m grid. Match that scale on every menu tile.
  if(material===menuCeilingMaterial && material.map){
    meshMaterial=material.clone();
    meshMaterial.map=material.map.clone();
    meshMaterial.map.repeat.set(
      Math.max(1,size.x/4),
      Math.max(1,size.z/4)
    );
    meshMaterial.map.needsUpdate=true;
  }

  const mesh=new THREE.Mesh(
    new THREE.BoxGeometry(size.x,size.y,size.z),
    meshMaterial
  );
  mesh.name=name;
  mesh.position.copy(position);
  mesh.rotation.set(rotationX,rotationY,rotationZ);
  menuSet.add(mesh);
  return mesh;
}

// Rebuilt true-3D menu: a wide ruined Level-0 office space with damaged ceiling,
// repeating yellow walls, irregular columns, office debris, damp carpet, and deep side rooms.
// ---------------------------------------------------------------------------
// 3D title-screen environment.
// No flat image is used here: the menu is a real Three.js room with depth,
// geometry, materials, fog and animated fluorescent lighting.
// ---------------------------------------------------------------------------
const menuFloorBox=addMenuBox(
  "FloorCollisionVolume",
  new THREE.Vector3(112,.22,118),
  new THREE.Vector3(0,-.11,-7),
  menuFloorMaterial
);
menuFloorBox.visible=false;

const menuFloorSurfaceMaterial=menuFloorMaterial.clone();
menuFloorSurfaceMaterial.side=THREE.DoubleSide;
const menuFloorSurface=new THREE.Mesh(
  new THREE.PlaneGeometry(112,118),
  menuFloorSurfaceMaterial
);
menuFloorSurface.name="MenuFloorSurface";
menuFloorSurface.rotation.x=-Math.PI/2;
menuFloorSurface.position.set(0,.012,-7);
menuSet.add(menuFloorSurface);

addMenuBox("LeftWall",new THREE.Vector3(.34,9.4,118),new THREE.Vector3(-56,4.7,-7),menuWallMaterial);
addMenuBox("RightWall",new THREE.Vector3(.34,9.4,118),new THREE.Vector3(56,4.7,-7),menuWallMaterial);
addMenuBox("BackWall",new THREE.Vector3(112,9.4,.34),new THREE.Vector3(0,4.7,-66),menuWallMaterial);

// Match the playable Backrooms ceiling: one continuous flat drop-ceiling surface
// using the same 1m tile texture scale as World.buildChunkMeshes().
menuCeilingTexture.repeat.set(28,29.5);
const menuCeilingGeometry=new THREE.PlaneGeometry(112,118);
menuCeilingGeometry.rotateX(Math.PI/2); // face down, like the gameplay ceiling
const menuCeilingMesh=new THREE.Mesh(menuCeilingGeometry,menuCeilingMaterial);
menuCeilingMesh.name="MenuCeiling";
menuCeilingMesh.position.set(0,9,-7);
menuSet.add(menuCeilingMesh);

// A few panels are missing. Dark void cards sit over the continuous ceiling so
// those spots read as open service cavities without introducing a second grid.
for(const [x,z,w,d] of [
  [-7,-35,6.5,6.4],
  [14,-49,6.5,6.4],
  [28,-21,6.5,6.4],
  [-28,7,6.5,6.4],
  [7,28,6.5,6.4]
]){
  addMenuBox("CeilingVoid",new THREE.Vector3(w,.10,d),new THREE.Vector3(x,9.055,z),menuDarkMaterial);
}

// Irregular columns and partial walls make the room read as a real ruined
// level rather than a flat hallway.
for(const [x,z,h,w,rot] of [
  [-39,16,7.8,2.8,.015],[-18,-1,7.1,2.5,-.012],[4,13,7.6,2.8,.018],
  [25,3,6.9,2.5,-.018],[43,17,7.3,2.6,.012],[-33,-21,7.0,2.5,-.015],
  [-8,-19,7.8,2.8,.016],[16,-30,6.9,2.5,-.012],[37,-36,6.2,2.4,.015],
  [-28,-47,6.5,2.6,-.016],[-3,-51,6.0,2.4,.014],[24,-53,5.7,2.2,-.012]
]){
  addMenuBox("Column",new THREE.Vector3(w,h,w),new THREE.Vector3(x,h/2,z),menuWallMaterial,rot);
  addMenuBox("ColumnBase",new THREE.Vector3(w+.16,.22,w+.16),new THREE.Vector3(x,.11,z),menuTrimMaterial,rot);
}

for(const [x,z,w,d,h,rot] of [
  [-47,-7,.34,19,5.7,.012],[-36,-40,17,.34,5.3,-.018],
  [-7,-10,15,.34,4.9,.022],[20,-13,.34,18,5.2,-.02],
  [46,-28,.34,18,5.0,.014],[10,-43,18,.34,4.6,-.016],
  [-22,25,15,.34,4.7,.018],[31,24,.34,14,4.9,-.016]
]){
  addMenuBox("Partition",new THREE.Vector3(w,h,d),new THREE.Vector3(x,h/2,z),menuWallMaterial,rot);
}

// No artificial center frame: keep the menu view built from the same wall geometry
// language as the playable Backrooms instead of introducing a separate gray/black structure.

// The main visual anchor: a deep open bay that disappears into fog.
addMenuBox("DeepBayFrameTop",new THREE.Vector3(24,1.05,.5),new THREE.Vector3(1.5,7.95,-64.5),menuRuinMaterial);
addMenuBox("DeepBayLeft",new THREE.Vector3(.55,7.0,8.0),new THREE.Vector3(-10.5,3.5,-64),menuRuinMaterial);
addMenuBox("DeepBayRight",new THREE.Vector3(.55,7.0,8.0),new THREE.Vector3(13.5,3.5,-64),menuRuinMaterial);
addMenuBox("DeepBayDark",new THREE.Vector3(23.0,6.7,.20),new THREE.Vector3(1.5,3.35,-65.1),menuDarkMaterial);

// Side openings give the camera somewhere to look besides the center bay.
for(const [x,z,w,d] of [
  [-55,-15,.10,14], [55,-37,.10,16], [-55,20,.10,11], [55,11,.10,13]
]){
  addMenuBox("SideVoid",new THREE.Vector3(w,5.7,d),new THREE.Vector3(x,2.9,z),menuDarkMaterial);
}

// Damp floor patches and torn carpet details.
for(const [x,z,w,d,rot] of [
  [-28,12,8.5,2.4,.12],[19,7,7.5,2.0,-.14],[-42,-10,6.2,2.1,.20],
  [-12,-28,8.5,2.3,-.16],[29,-29,7.1,1.9,.18],[-24,-43,8.0,2.1,-.15],
  [7,-50,8.4,2.0,.18]
]){
  addMenuBox("DampCarpet",new THREE.Vector3(w,.028,d),new THREE.Vector3(x,.015,z),menuStainMaterial,rot);
  addMenuBox("WetPatch",new THREE.Vector3(w*.58,.015,d*.52),new THREE.Vector3(x,.036,z),menuWetMaterial,rot);
}

// Sparse office debris makes the floor readable without cluttering the shot.
for(const [x,z,rot] of [
  [-29,23,.10],[-2,18,-.16],[32,21,.08],[-40,-31,.18],[39,-46,-.11]
]){
  addMenuBox("Cabinet",new THREE.Vector3(1.8,2.2,1.05),new THREE.Vector3(x,1.1,z),menuRuinMaterial,rot);
  addMenuBox("CabinetTop",new THREE.Vector3(2.0,.12,1.15),new THREE.Vector3(x,2.22,z),menuTrimMaterial,rot);
}
for(const [x,z,rot] of [[-8,27,.10],[20,18,-.12],[-25,-34,.16],[21,-43,-.15]]){
  addMenuBox("DeskTop",new THREE.Vector3(3.6,.22,1.6),new THREE.Vector3(x,1.55,z),menuRuinMaterial,rot);
  addMenuBox("DeskLegA",new THREE.Vector3(.18,1.48,.18),new THREE.Vector3(x-1.4,.74,z-.52),menuTrimMaterial,rot);
  addMenuBox("DeskLegB",new THREE.Vector3(.18,1.48,.18),new THREE.Vector3(x+1.4,.74,z+.52),menuTrimMaterial,rot);
}
for(const [x,z,w,d,rot] of [
  [-43,26,1.7,1.0,.10],[-23,18,1.2,.8,-.18],[-1,21,1.7,.9,.18],[24,15,1.0,1.6,-.10],
  [-36,-4,1.3,.9,.28],[4,-7,1.8,.7,-.20],[30,-13,1.4,1.0,.10],
  [-17,-23,1.6,.8,-.18],[32,-27,1.3,.9,.16],[-30,-39,1.8,1.0,.28],[6,-55,1.4,.8,-.10]
]){
  addMenuBox("FloorDebris",new THREE.Vector3(w,.05,d),new THREE.Vector3(x,.03,z),menuTrimMaterial,rot);
}

// Hanging wires descend from several damaged ceiling panels.
function addHangingCable(x,z,length,sway){
  const curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(x,8.98,z),
    new THREE.Vector3(x+sway*.18,8.05,z),
    new THREE.Vector3(x+sway*.56,7.0,z+.35),
    new THREE.Vector3(x+sway,8.98-length,z+.62)
  ]);
  const mesh=new THREE.Mesh(
    new THREE.TubeGeometry(curve,18,.045,6,false),
    menuRuinMaterial
  );
  mesh.name="HangingCable";
  menuSet.add(mesh);
}
for(const args of [
  [-15,-18,3.7,-1.0],[2,-31,3.5,.8],[18,-42,4.2,-.9],
  [-6,-49,3.0,-.7],[29,-55,3.8,.9]
]) addHangingCable(...args);

// Fluorescent fixtures: each light is real geometry + a real point light.

function addFixtureCracks(fixture,x,z,index,rotationY=0){
  const crackedIndices=new Set([
    0,1,2,4,5,7,8,9,10,12,13,14,15,16,17,18,20,21,22,24,25,26,27,29,30
  ]);
  if(!crackedIndices.has(index)) return;

  const crackMaterial=new THREE.LineBasicMaterial({
    color:0x1a1a15,
    transparent:true,
    opacity:.88
  });

  const makeCrack=(points,offsetX=0,offsetZ=0)=>{
    const geometry=new THREE.BufferGeometry().setFromPoints(
      points.map(([px,pz])=>new THREE.Vector3(px+offsetX,0.058,pz+offsetZ))
    );
    const line=new THREE.Line(geometry,crackMaterial);
    line.rotation.y=rotationY;
    line.position.set(x,8.885,z);
    line.name="FixtureCrack";
    menuSet.add(line);
  };

  const variants=[
    [[-1.35,-.22],[-.96,-.02],[-.68,-.24],[-.30,-.06],[.08,-.22],[.46,-.02],[.82,-.20],[1.38,-.06]],
    [[-1.18,.20],[-.82,.02],[-.48,.23],[-.16,.05],[.22,.21],[.58,.04],[.96,.22],[1.35,.08]],
    [[-.52,-.02],[-.25,-.30],[.04,-.10],[.28,-.34],[.58,-.12],[.86,-.28],[1.22,-.08]],
    [[-1.40,.10],[-1.05,-.16],[-.72,.04],[-.38,-.18],[-.02,.08],[.38,-.14],[.74,.02],[1.30,-.20]],
    [[-1.26,-.08],[-.92,.18],[-.54,-.04],[-.14,.20],[.20,-.02],[.62,.16],[1.00,-.06],[1.34,.14]],
    [[-1.38,.22],[-1.00,.02],[-.62,.24],[-.28,-.08],[.12,.06],[.44,-.20],[.84,.12],[1.40,-.04]]
  ];

  const chosen=variants[index%variants.length];
  makeCrack(chosen);

  // Cracked fixtures often have a second branching fracture.
  if(index%3!==1){
    makeCrack(
      [[-.18,.02],[.00,-.24],[.24,-.10],[.42,-.30],[.70,-.17]],
      index%2===0 ? -.18 : .12,
      index%2===0 ? .08 : -.04
    );
  }

  // One short side branch makes the fracture look like broken diffuser plastic
  // instead of a single painted line.
  if(index%4===0){
    makeCrack(
      [[-.42,.02],[-.66,.24],[-.86,.10]],
      .08,
      -.02
    );
  }
}

const menuLightFixtures3D=[
  [-46,25,4.8,.2],[-31,26,6.0,.7],[-15,25,7.5,1.2],[1,25,5.6,1.7],[17,25,8.0,2.2],[34,25,5.0,2.7],
  [-40,10,7.0,3.1],[-23,11,5.2,3.6],[-7,10,8.5,4.1],[10,10,6.4,4.6],[27,10,7.8,5.1],
  [-45,-5,5.6,5.6],[-28,-7,8.5,6.2],[-11,-5,6.2,6.8],[6,-7,9.2,7.4],[23,-6,5.7,8.0],[40,-8,7.4,8.6],
  [-42,-23,6.8,9.1],[-25,-24,5.4,9.7],[-8,-22,8.8,10.3],[10,-24,6.0,10.9],[27,-23,8.0,11.5],
  [-38,-41,5.2,12.0],[-20,-43,7.8,12.6],[-2,-42,5.8,13.2],[16,-43,8.6,13.8],[34,-41,5.0,14.4],
  [-22,-57,7.2,15.0],[0,-56,5.4,15.6],[22,-57,7.8,16.2],[42,-55,5.5,16.8]
];

const menuBrokenLightMaterial=new THREE.MeshStandardMaterial({
  color:0x10100e,
  roughness:.96
});

function addCrackedFixtureModel(x,z,index){
  const group=new THREE.Group();
  group.name="FluorescentCracked";
  group.position.set(x,8.97,z);

  // Different broken fixtures use different diffuser splits, offsets and missing
  // sections so the damage does not repeat like a copied prop.
  const variants=[
    [
      {w:1.02,x:-1.16,y:.012,z:.01,rx:-.030,rz:-.018},
      {w:.78,x:-.08,y:-.020,z:-.02,rx:.015,rz:.035,black:true},
      {w:1.12,x:1.00,y:.016,z:.02,rx:-.022,rz:-.028}
    ],
    [
      {w:.72,x:-1.28,y:-.012,z:-.03,rx:.020,rz:.045},
      {w:1.22,x:-.18,y:.010,z:.015,rx:-.010,rz:-.020},
      {w:.86,x:1.13,y:-.026,z:-.018,rx:.030,rz:.065}
    ],
    [
      {w:.92,x:-1.12,y:.018,z:.025,rx:-.035,rz:.020,black:true},
      {w:1.04,x:-.02,y:-.010,z:-.012,rx:.020,rz:-.040},
      {w:.62,x:1.05,y:.022,z:.030,rx:-.050,rz:.080}
    ],
    [
      {w:1.30,x:-1.02,y:-.018,z:-.015,rx:.012,rz:-.050},
      {w:.58,x:.16,y:.028,z:.035,rx:-.040,rz:.070},
      {w:.98,x:1.10,y:-.008,z:-.020,rx:.030,rz:-.015}
    ],
    [
      {w:.80,x:-1.24,y:.020,z:.005,rx:-.025,rz:-.075,black:true},
      {w:.90,x:-.16,y:-.030,z:-.028,rx:.040,rz:.050},
      {w:1.25,x:1.05,y:.014,z:.018,rx:-.018,rz:-.030}
    ],
    [
      {w:1.10,x:-1.10,y:-.008,z:-.025,rx:.018,rz:.025},
      {w:.68,x:-.08,y:.024,z:.030,rx:-.045,rz:-.080},
      {w:.96,x:1.02,y:-.022,z:-.012,rx:.050,rz:.060}
    ]
  ];

  const pieces=variants[index%variants.length];
  for(const piece of pieces){
    const mesh=new THREE.Mesh(
      new THREE.BoxGeometry(piece.w,.065,.84),
      piece.black ? menuBrokenLightMaterial : menuLightMaterial
    );
    mesh.position.set(piece.x,piece.y,piece.z);
    mesh.rotation.set(piece.rx,0,piece.rz);
    mesh.name=piece.black ? "CrackedBlackSection" : "CrackedDiffuserPiece";
    group.add(mesh);
  }

  // Some fixtures lose a different little fragment, with the fragment position
  // following the variant instead of repeating one placement.
  const shardVariants=[
    null,
    {x:-1.56,y:.040,z:.12,rz:-.22},
    {x:1.54,y:.052,z:-.10,rz:.18},
    null,
    {x:-1.48,y:.030,z:-.14,rz:.28},
    {x:1.50,y:.048,z:.14,rz:-.16}
  ];
  const shard=shardVariants[index%shardVariants.length];
  if(shard){
    const mesh=new THREE.Mesh(
      new THREE.BoxGeometry(.28,.048,.30),
      menuLightMaterial
    );
    mesh.position.set(shard.x,shard.y,shard.z);
    mesh.rotation.set(.06,0,shard.rz);
    mesh.name="CrackedDiffuserShard";
    group.add(mesh);
  }

  menuSet.add(group);
  return group;
}

const menuFlickerNodes=[];
const menuActiveLightIndices=new Set([6,14,22,30]);
for(let fixtureIndex=0;fixtureIndex<menuLightFixtures3D.length;fixtureIndex++){
  const [x,z,power,phase]=menuLightFixtures3D[fixtureIndex];
  const cracked=[0,1,2,4,5,7,8,9,10,12,13,14,15,16,17,18,20,21,22,24,25,26,27,29,30].includes(fixtureIndex);
  const lightPower=cracked ? power*.24 : power;

  const fixture=cracked
    ? addCrackedFixtureModel(x,z,fixtureIndex)
    : addMenuBox(
      "Fluorescent",
      new THREE.Vector3(3.5,.10,.95),
      new THREE.Vector3(x,8.97,z),
      menuLightMaterial
    );

  fixture.userData.basePower=lightPower;
  fixture.userData.phase=phase;
  fixture.userData.cracked=cracked;

  const point=new THREE.PointLight(0xffe6a8,lightPower,18,2);
  point.position.set(x,8.08,z);
  point.userData.basePower=lightPower;
  point.userData.phase=phase;
  point.userData.cracked=cracked;
  point.visible=menuActiveLightIndices.has(fixtureIndex);
  menuSet.add(point);
  menuFlickerNodes.push(fixture,point);
  addFixtureCracks(fixture,x,z,fixtureIndex,0);
}

// A few weak pools of practical light keep the 3D geometry readable.
const menuAmbient=new THREE.HemisphereLight(0xd5c995,0x10110e,.56);
menuSet.add(menuAmbient);

const menuFill=new THREE.PointLight(0xd5b96f,2.7,48,2);
menuFill.position.set(-9,4,-6);
menuSet.add(menuFill);

const menuNearLight=new THREE.PointLight(0xffe2a0,1.15,32,2);
menuNearLight.position.set(-2,3,21);
menuSet.add(menuNearLight);

const menuFarLight=new THREE.PointLight(0xffd98e,.95,38,2);
menuFarLight.position.set(4,3,-50);
menuSet.add(menuFarLight);

// Subtle dust motes are actual 3D points floating in the room.
const dustPositions=[];
const dustRng=mulberry32(SEED^0x5a17);
for(let i=0;i<220;i++){
  dustPositions.push(
    (dustRng()-.5)*92,
    .5+dustRng()*7.6,
    -61+dustRng()*88
  );
}
const dustGeometry=new THREE.BufferGeometry();
dustGeometry.setAttribute("position",new THREE.Float32BufferAttribute(dustPositions,3));
const dustMaterial=new THREE.PointsMaterial({
  color:0xc9c39a,
  size:.035,
  transparent:true,
  opacity:.26,
  depthWrite:false
});
const menuDust=new THREE.Points(dustGeometry,dustMaterial);
menuDust.name="MenuDust";
menuSet.add(menuDust);

// The title screen uses a clone of the real Spider-Psionic rig loaded by the
// gameplay spider. This keeps the menu model authentic without sharing the
// gameplay entity, transform, or animation mixer.
const MENU_SPIDER_SCALE=.04;
const MENU_DUCK_SCALE=.82;
const MENU_SPIDER_CEILING_Y=8.98;
// Put the duck on the foreground floor, centered in front of the title camera.
const MENU_DUCK_MENU_X=-8.4;
const MENU_DUCK_MENU_Y=0;
const MENU_DUCK_MENU_Z=8.5;
const MENU_DUCK_SPIN_SPEED=1.35;
const MENU_SPIDER_PATH_CENTER_X=3.0;
const MENU_SPIDER_PATH_CENTER_Z=-18.0;
const MENU_SPIDER_PATH_RADIUS_X=22.0;
const MENU_SPIDER_PATH_RADIUS_Z=16.0;
const MENU_SPIDER_PATH_SPEED=.072;

const menuSpider=new THREE.Group();
menuSpider.name="MenuSpider";
menuSpider.position.set(
  MENU_SPIDER_PATH_CENTER_X,
  MENU_SPIDER_CEILING_Y,
  MENU_SPIDER_PATH_CENTER_Z
);
menuSpider.rotation.y=0;
menuSpider.visible=false;
menuSet.add(menuSpider);

let menuSpiderActual=null;
let menuSpiderMixer=null;
let menuSpiderLoadRequested=false;

function stopSpiderOverlapAnimation(){
  const echo=spiderOriginalModel?.getObjectByName("SpiderOverlapEcho");
  if(spiderOverlapMixer){
    spiderOverlapMixer.stopAllAction();
    if(echo) spiderOverlapMixer.uncacheRoot(echo);
  }
  spiderOverlapMixer=null;
  spiderOverlapActions.clear();
}

function rebuildSpiderOverlapAnimation(){
  stopSpiderOverlapAnimation();
  if(arachnophobiaMode || !spiderOriginalModel || !spiderAnimationClips.size) return;

  const echo=spiderOriginalModel.getObjectByName("SpiderOverlapEcho");
  if(!echo) return;

  spiderOverlapMixer=new THREE.AnimationMixer(echo);
  for(const [name,clip] of spiderAnimationClips){
    const action=spiderOverlapMixer.clipAction(clip);
    const oneShot=name.startsWith("die") || name.startsWith("attack");
    action.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat,oneShot ? 1 : Infinity);
    if(oneShot) action.clampWhenFinished=true;
    spiderOverlapActions.set(name,action);
  }
}

function applyArachnophobiaVisual(){
  if(!spiderOriginalModel) return;

  if(spiderModel && spiderModel.parent===spiderEntity){
    spiderEntity.remove(spiderModel);
  }

  spiderActions.clear();
  spiderMixer?.stopAllAction();
  spiderMixer=null;
  stopSpiderOverlapAnimation();
  spiderAnimationState="";

  if(arachnophobiaMode){
    if(!funnyDuckModel){
      funnyDuckModel=createFunnyDuckEntity();
    }
    spiderModel=funnyDuckModel;
    spiderEntity.add(funnyDuckModel);
  }else{
    spiderModel=spiderOriginalModel;
    spiderEntity.add(spiderOriginalModel);
  }

  if(menuSpiderActual){
    menuSpider.remove(menuSpiderActual);
    menuSpiderActual=null;
    menuSpiderMixer=null;
  }

  if(!arachnophobiaMode && spiderAnimationClips.size){
    // Rebuild normal spider animation actions when switching back.
    const animationRoot=
      spiderModel.getObjectByName("SpiderSource") ||
      spiderModel.children[0] ||
      spiderModel;
    spiderMixer=new THREE.AnimationMixer(animationRoot);
    for(const [name,clip] of spiderAnimationClips){
      const action=spiderMixer.clipAction(clip);
      const oneShot=name.startsWith("die") || name.startsWith("attack");
      action.setLoop(
        oneShot ? THREE.LoopOnce : THREE.LoopRepeat,
        oneShot ? 1 : Infinity
      );
      if(oneShot) action.clampWhenFinished=true;
      spiderActions.set(name,action);
    }
    rebuildSpiderOverlapAnimation();
    setSpiderAnimation(spiderWantedState);
  }

  if(spiderModel){
    spiderModel.visible=true;
    spiderEntity.visible=spiderActive || (
      tutorialOpenRoomActive &&
      houseTutorialSpiderPrepared
    );
  }

  syncTutorialSpiderFromGameplayModel(true);
  syncMenuSpiderFromGameplayModel();
}

function syncMenuSpiderFromGameplayModel(){
  if(menuSpiderActual || !spiderModel) return;

  // Do not clone the gameplay wrapper: it contains world-space placement
  // for the tutorial/gameplay entity. Clone only the authored model itself.
  const sourceModel=
    spiderModel.getObjectByName("SpiderModelScaleRoot") ||
    spiderModel.getObjectByName("SpiderSource") ||
    spiderModel.children[0] ||
    spiderModel;

  if(arachnophobiaMode){
    menuSpiderActual=SkeletonUtils.clone(sourceModel);
  }else{
    // Keep the imported model's fitted scale beneath the menu's presentation
    // scale, just as the tutorial clone does.
    menuSpiderActual=new THREE.Group();
    menuSpiderActual.add(SkeletonUtils.clone(sourceModel));
  }
  menuSpiderActual.name="MenuSpiderActualModel";
  menuSpiderActual.visible=true;

  // Presentation owns its own scale and placement.
  menuSpiderActual.position.set(0,0,0);
  menuSpiderActual.rotation.set(0,0,0);
  menuSpiderActual.scale.setScalar(
    arachnophobiaMode ? MENU_DUCK_SCALE : MENU_SPIDER_SCALE
  );

  // Center only the menu clone. The gameplay model remains untouched.
  menuSpiderActual.updateMatrixWorld(true);
  if(!arachnophobiaMode){
    const menuBounds=new THREE.Box3().setFromObject(menuSpiderActual);
    const menuCenter=menuBounds.getCenter(new THREE.Vector3());
    menuSpiderActual.position.sub(menuCenter);
    menuSpiderActual.updateMatrixWorld(true);
  }

  // The shared visual is centered around its origin. Flip this wrapper around
  // X so the spider hangs below the ceiling instead of sitting on top of it.
  menuSpiderActual.rotation.set(
    arachnophobiaMode ? 0 : Math.PI,
    0,
    0
  );

  // SkeletonUtils.clone shares geometry and materials. Clone each menu material
  // once before changing depth flags, or the title screen alters gameplay too.
  const menuMaterialCopies=new Map();
  const copyMenuMaterial=(material)=>{
    if(!material) return material;
    if(!menuMaterialCopies.has(material)){
      menuMaterialCopies.set(material,material.clone());
    }
    return menuMaterialCopies.get(material);
  };

  menuSpiderActual.traverse(node=>{
    if(!node.isMesh) return;

    node.frustumCulled=false;
    node.castShadow=false;
    node.receiveShadow=false;
    node.renderOrder=50;

    if(!node.material) return;
    node.material=Array.isArray(node.material)
      ? node.material.map(copyMenuMaterial)
      : copyMenuMaterial(node.material);

    const materials=Array.isArray(node.material)
      ? node.material
      : [node.material];

    for(const material of materials){
      if(arachnophobiaMode){
        material.transparent=false;
        material.opacity=1;
        material.depthTest=true;
        material.depthWrite=true;
      }else{
        // The menu ceiling is solid. Disable depth writes so the underside
        // cannot disappear into the ceiling surface.
        material.depthTest=false;
        material.depthWrite=false;
      }
      material.needsUpdate=true;
    }
  });

  menuSpider.add(menuSpiderActual);
  menuSpider.updateMatrixWorld(true);

  if(arachnophobiaMode){
    menuSpiderMixer=null;
    menuSpider.visible=true;
    return;
  }

  menuSpiderMixer=new THREE.AnimationMixer(menuSpiderActual);
  const menuClip=
    spiderAnimationClips.get("walk") ||
    spiderAnimationClips.get("idle1") ||
    spiderAnimationClips.get("idle2");

  if(menuClip){
    const action=menuSpiderMixer.clipAction(menuClip);
    action.setLoop(THREE.LoopRepeat,Infinity);
    action.timeScale=.42;
    action.play();
  }

  menuSpider.visible=true;
}

const menuCameraStart=new THREE.Vector3(-13.5,2.72,18.5);
const menuCameraTarget=new THREE.Vector3(5.5,3.02,-18.5);
menuCamera.fov=76;
menuCamera.near=.05;
menuCamera.far=180;
menuCamera.updateProjectionMatrix();

let menuBackdropWasActive=false;
let menuFixtureUpdateTimer=0;

function updateMenuScene(t,dt){
  const menuBackdropElement=document.getElementById("menuBackdrop");

  if(gameStarted || !homeScreen || homeScreen.classList.contains("hidden")){
    if(menuBackdropWasActive){
      menuBackdropWasActive=false;
      menuSet.visible=false;
      world.root.visible=true;
      if(menuBackdropElement) menuBackdropElement.style.display="none";
      scene.background.set(0x000100);
      scene.fog.color.set(0x030302);
      scene.fog.near=14;
      scene.fog.far=62;
    }
    return false;
  }

  if(!menuBackdropWasActive){
    menuBackdropWasActive=true;
    world.root.visible=false;

    menuSet.visible=true;
    if(menuBackdropElement) menuBackdropElement.style.display="none";

    if(LOW_END_PERFORMANCE){
      menuScene.background.set(0x15150f);
      menuScene.fog.color.set(0x3c3a2a);
      menuScene.fog.near=12;
      menuScene.fog.far=50;
    }else{
      menuScene.background.set(0x29291d);
      menuScene.fog.color.set(0x45422f);
      menuScene.fog.near=8;
      menuScene.fog.far=78;
    }
  }

  // Slow camera drift — enough motion to keep the menu alive without feeling
  // like a gameplay camera.
  menuCamera.position.x=menuCameraStart.x+Math.sin(t*.030)*.34;
  menuCamera.position.y=menuCameraStart.y+Math.sin(t*.061)*.035;
  menuCamera.position.z=menuCameraStart.z+Math.cos(t*.026)*.28;

  menuCamera.lookAt(
    menuCameraTarget.x+Math.sin(t*.023)*.55,
    menuCameraTarget.y+Math.sin(t*.031)*.035,
    menuCameraTarget.z+Math.cos(t*.018)*.35
  );

  // Very slow dust movement gives the room depth instead of a frozen backdrop.
  menuDust.position.x=Math.sin(t*.035)*.7;
  menuDust.position.y=Math.sin(t*.052)*.12;
  menuDust.position.z=Math.cos(t*.029)*.55;
  menuSet.rotation.y=Math.sin(t*.008)*.004;

  // Load the real Spider-Psionic pack for the title screen; the menu gets an isolated clone.
  if(!menuSpiderActual){
    if(!menuSpiderLoadRequested){
      menuSpiderLoadRequested=true;
      // Share the guarded loader with gameplay so the menu and game cannot
      // start two concurrent imports of the same spider rig.
      ensureSpiderLoading(true);
    }
  }else if(arachnophobiaMode){
    // In arachnophobia mode the spider is replaced by a harmless biscuit image.
    // Keep it on the foreground floor, centered in the shot, and spin the
    // image in screen space so it never disappears edge-on.
    menuSpider.position.set(
      MENU_DUCK_MENU_X,
      MENU_DUCK_MENU_Y,
      MENU_DUCK_MENU_Z
    );
    // Keep the biscuit's world position completely fixed. Only rotate the
    // sprite itself around its own center so it does not bob or orbit vertically.
    menuSpider.rotation.set(0,0,0);

    menuSpiderActual?.traverse(node=>{
      if(!node.isSprite) return;
      node.frustumCulled=false;
      node.rotation.z=t*MENU_DUCK_SPIN_SPEED*4.5;
    });
  }else{
    const phase=t*MENU_SPIDER_PATH_SPEED;
    const nextPhase=(t+dt)*MENU_SPIDER_PATH_SPEED;
    const x=Math.sin(phase)*MENU_SPIDER_PATH_RADIUS_X;
    const z=Math.cos(phase*.78)*MENU_SPIDER_PATH_RADIUS_Z;
    const nx=Math.sin(nextPhase)*MENU_SPIDER_PATH_RADIUS_X;
    const nz=Math.cos(nextPhase*.78)*MENU_SPIDER_PATH_RADIUS_Z;

    menuSpider.position.x=MENU_SPIDER_PATH_CENTER_X+x;
    menuSpider.position.y=MENU_SPIDER_CEILING_Y;
    menuSpider.position.z=MENU_SPIDER_PATH_CENTER_Z+z;
    menuSpider.rotation.y=Math.atan2(nx-x,nz-z)+Math.PI;
    menuSpider.rotation.z=Math.sin(t*.35)*.015;

    if(menuSpiderMixer) menuSpiderMixer.update(dt);
  }

  menuFixtureUpdateTimer-=dt;
  if(menuFixtureUpdateTimer<=0){
    menuFixtureUpdateTimer=.08;
    for(const node of menuFlickerNodes){
      const phase=node.userData.phase||0;
    const base=node.userData.basePower;
    const wave=Math.sin(t*1.55+phase)*.055;
    const cracked=node.userData.cracked===true;
    const crackedDim=cracked ? .52 : 1;
    const dropout=Math.sin(t*3.65+phase*3.3)>.996 ? -.82 : 0;

    if(node.isLight){
      node.intensity=Math.max(.025,base*crackedDim*(1+wave+dropout));
    }else if(node.material?.emissiveIntensity!==undefined){
      node.material.emissiveIntensity=Math.max(
        .06,
        (cracked ? 1.28 : 3.15)*
          (1+Math.sin(t*1.55+phase)*.045+dropout*.55)
      );
    }
  }

  }
  return true;
}


const FLASHLIGHT_BASE_DISTANCE=LOW_END_PERFORMANCE?46:58;
const flashlight=new THREE.SpotLight(
  0xf0dfad,
  LOW_END_PERFORMANCE?17:20,
  FLASHLIGHT_BASE_DISTANCE,
  LOW_END_PERFORMANCE?Math.PI/6.0:Math.PI/6.6,
  LOW_END_PERFORMANCE?.72:.68,
  1.35
);
const ENABLE_SHADOWS=new URLSearchParams(location.search).get("shadows")==="1";
flashlight.castShadow=ENABLE_SHADOWS;
if(ENABLE_SHADOWS) flashlight.shadow.mapSize.set(256,256);
flashlight.shadow.bias=-0.0004;
flashlight.shadow.normalBias=0.018;
flashlight.target.position.set(0,0,-FLASHLIGHT_BASE_DISTANCE);
scene.add(camera);

const player=new Player(camera,renderer.domElement,world);

// Mount the actual light to the same camera-local torch as the visible prop.
// This stops the beam from appearing to originate at the middle of the camera.
function mountFlashlightOnHeldProp(mount){
  if(!mount) return;
  camera.remove(flashlight);
  camera.remove(flashlight.target);
  mount.add(flashlight);
  mount.add(flashlight.target);
  flashlight.position.set(0,0,0);
  flashlight.target.position.set(0,0,-FLASHLIGHT_BASE_DISTANCE);
}
mountFlashlightOnHeldProp(player.proceduralArmFlashlight);

const audio=new HorrorAudio();

player.onBreath=(intensity=.65)=>audio.breath(intensity);
player.onLand=(intensity=.7)=>audio.land(intensity);
player.onSlide=()=>audio.slide(.8);

player.hands.visible=true;

// ---------------------------------------------------------------------------
// House level — the GLB itself is the level.
// ---------------------------------------------------------------------------
const HOUSE_MODEL_PATH="./assets/studio_apartment_vray_baked_textures_included.glb";
const HOUSE_TARGET_HEIGHT=3.0;
let houseModel=null;
let houseLoaded=false;
let houseMode=false;
// Retain the apartment in memory if a save slot actually uses this level.
let initialHouseRequired=false;
let houseSpawn=new THREE.Vector3(0,EYE,0);
let pendingHouseStart=false;
let houseLoadFailed=false;
let houseLoadStarted=false;
let houseCollisionReady=false;
let houseCollisionBuildStarted=false;
let houseUnloadTimer=0;
const houseCollisionBoxes=[];
const houseRenderMeshes=[];
const houseLowMaterialCache=new Map();
let houseRenderCullAt=0;
const houseFloorRaycaster=new THREE.Raycaster();
const houseViewRaycaster=new THREE.Raycaster();
let houseDoorCollisionDirty=true;
let houseCollisionRefreshTimer=0;
let houseCollisionFocusX=NaN;
let houseCollisionFocusZ=NaN;
let gameStarted=false;
let lastAutoSave=0;
let houseIntroMessageShown=false;

// First-room tutorial state. The apartment teaches movement, flashlight,
// interaction, and finally gives the player one controlled spider encounter.
let houseTutorialStage=0;
let houseTutorialStartX=0;
let houseTutorialStartZ=0;
let houseTutorialSpiderState="hidden";
let houseTutorialSpiderTime=0;
let houseTutorialSpiderStuckTime=0;
let houseTutorialSpiderPrepared=false;
const houseTutorialSpiderPosition=new THREE.Vector3();
const houseTutorialSpiderTarget=new THREE.Vector3();
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
    if(parsed.level==="apartment" || parsed.houseMode===true){
      parsed.level="backrooms";
      parsed.houseMode=false;
      parsed.x=32;
      parsed.z=32;
    }
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
const initialSaveHydrationPromise=hydrateIndexedSaveSlots();

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
    linear-gradient(90deg,rgba(1,2,1,.88) 0%,rgba(1,2,1,.58) 24%,rgba(1,2,1,.18) 45%,transparent 67%),
    linear-gradient(180deg,rgba(0,0,0,.16) 0%,transparent 35%,rgba(0,0,0,.54) 100%);
}
#menuBackdrop{
  display:none!important;
  position:absolute;
  inset:0;
  z-index:0;
  pointer-events:none;
}
.menuBGRuined{
  position:absolute;
  inset:-1%;
  width:102%;
  height:102%;
  display:block;
  filter:saturate(.88) contrast(1.05) brightness(.82);
  transform:scale(1.015);
}
.menuBGRuined .fixture{animation:menuRuinedFlicker 6.2s steps(1,end) infinite}
.menuBGRuined .fixture.delay{animation-delay:2.1s}
@keyframes menuRuinedFlicker{
  0%,100%{opacity:.92}
  38%{opacity:.92}
  39%{opacity:.30}
  40%{opacity:.76}
  46%{opacity:.70}
  47%{opacity:.08}
  49%{opacity:.62}
  51%{opacity:.20}
  54%{opacity:.84}
  72%{opacity:.78}
}
#menuBackdrop::before{
  content:"";
  position:absolute;
  inset:0;
  z-index:2;
  background:
    linear-gradient(90deg,rgba(3,3,2,.84) 0%,rgba(3,3,2,.55) 27%,rgba(3,3,2,.06) 63%,rgba(2,2,2,.24) 100%),
    radial-gradient(ellipse at 73% 47%,transparent 0 15%,rgba(0,0,0,.10) 36%,rgba(0,0,0,.82) 100%),
    linear-gradient(180deg,rgba(0,0,0,.05),transparent 30%,rgba(0,0,0,.44) 100%);
}
#menuBackdrop::after{
  content:"";
  position:absolute;
  inset:0;
  z-index:3;
  background:repeating-linear-gradient(180deg,transparent 0 7px,rgba(255,255,255,.008) 8px,transparent 9px);
  opacity:.72;
}
.menuBGPhoto,
#menuBackdrop .menuBGScene,
#menuBackdrop .menuBGHall,
#menuBackdrop .menuBGCeiling,
#menuBackdrop .menuBGFloor,
#menuBackdrop .menuBGWallL,
#menuBackdrop .menuBGWallR,
#menuBackdrop .menuBGLight,
#menuBackdrop .menuBGGlow,
#menuBackdrop .menuBGScan{display:none}
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
.menuHomeLayout::before{
  content:"";
  position:absolute;
  left:0;
  top:0;
  bottom:0;
  width:min(500px,46vw);
  background:linear-gradient(90deg,rgba(3,4,3,.96),rgba(3,4,3,.72) 65%,transparent 100%);
  pointer-events:none;
}

.menuLogo{
  position:absolute;
  left:clamp(24px,4vw,60px);
  top:clamp(24px,4vh,48px);
  max-width:420px;
  color:#f2ead1;
  text-shadow:0 3px 22px #000;
}
.menuLogoMain{
  display:flex;
  flex-direction:column;
  line-height:.86;
  font-weight:600;
  letter-spacing:clamp(3px,.45vw,7px);
}
.menuLogoMain span{
  font-size:clamp(18px,1.9vw,30px);
  color:#d9d2bf;
}
.menuLogoMain strong{
  margin-top:6px;
  font-size:clamp(31px,3.6vw,58px);
  color:#d8b865;
  font-weight:600;
  letter-spacing:clamp(4px,.58vw,9px);
}
.menuLogoSub{
  margin-top:12px;
  padding-left:2px;
  font-size:8px;
  letter-spacing:3px;
  color:#8d8979;
}

/* Save slots replace the old field terminal on the right side. */
.menuSlotBar{
  position:absolute;
  right:clamp(24px,4vw,60px);
  top:clamp(114px,20vh,136px);
  width:min(540px,calc(100vw - 48px));
  color:#8c8675;
  text-shadow:0 2px 8px #000;
  padding-left:14px;
  border-left:1px solid rgba(223,173,69,.32);
  box-sizing:border-box;
}
.menuSlotHeader{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
  margin-bottom:9px;
  padding:0 1px;
  font-size:8px;
  letter-spacing:2.4px;
}
.menuSlotHeader strong{color:#d2c8a5;font-weight:500}
.menuSlotHeader span{color:#625e54}
.menuHomeRedesign #saveSlots{
  width:100%;
  display:grid;
  grid-template-columns:1fr;
  gap:8px;
  max-height:none;
  overflow:visible;
}
.menuHomeRedesign .saveSlotCard{
  min-width:0;
  min-height:112px;
  padding:12px 11px;
  border:1px solid rgba(231,220,171,.09);
  border-radius:4px;
  background:rgba(5,6,5,.34);
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
}
.menuHomeRedesign .saveSlotTitle{font-size:9px;letter-spacing:1.7px;color:#ddd4b9}
.menuHomeRedesign .saveSlotMode{font-size:7px;color:#7e796d}
.menuHomeRedesign .saveSlotDetail{
  margin-top:4px;
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
  margin-top:8px;
}
.menuHomeRedesign .saveSlotActions button{
  padding:5px 4px;
  border:1px solid rgba(231,220,171,.07);
  border-radius:3px;
  background:rgba(255,255,255,.018);
  color:#8e8877;
  font:inherit;
  font-size:7px;
  letter-spacing:1px;
  cursor:pointer;
}
.menuHomeRedesign .saveSlotActions button:hover{background:rgba(223,173,69,.075);color:#e7dabd}
.menuHomeRedesign .saveSlotActions button:disabled{opacity:.27;cursor:not-allowed}
.menuSaveStatus{
  margin-top:7px;
  padding-left:1px;
  font-size:7px;
  letter-spacing:1.2px;
  color:#625e54;
}

/* Play buttons below the save slots. */
.menuNav{
  position:absolute;
  left:clamp(24px,4vw,60px);
  top:clamp(315px,52vh,345px);
  width:min(390px,calc(100vw - 48px));
  display:flex;
  flex-direction:column;
  gap:12px;
}
.menuNavGroup{position:relative}
.menuNavGroup + .menuNavGroup{margin-top:0}
.menuNavGroupLabel{
  display:flex;
  align-items:center;
  gap:9px;
  margin:0 0 5px 2px;
  font-size:7px;
  letter-spacing:2.5px;
  color:#777363;
  text-shadow:0 2px 8px #000;
}
.menuNavGroupLabel::before{
  content:"";
  width:14px;
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
  width:100%;
  min-height:43px;
  padding:0 14px 0 16px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  border:1px solid rgba(235,224,179,.09);
  border-left:2px solid transparent;
  border-radius:4px;
  background:linear-gradient(90deg,rgba(13,14,12,.54),rgba(13,14,12,.18));
  color:#cbc5b2;
  font:inherit;
  font-size:clamp(11px,.82vw,14px);
  letter-spacing:1.8px;
  cursor:pointer;
  transition:background .16s,color .16s,border-color .16s,transform .16s,box-shadow .16s;
  text-shadow:0 2px 8px #000;
  backdrop-filter:blur(3px);
}
.menuNavButton:hover{
  background:linear-gradient(90deg,rgba(31,31,25,.72),rgba(31,31,25,.25));
  color:#fff5d9;
  border-color:rgba(223,190,107,.22);
  transform:translateX(4px);
  box-shadow:0 7px 24px rgba(0,0,0,.25);
}
.menuNavButton.active{
  background:linear-gradient(90deg,rgba(114,88,34,.38),rgba(47,39,23,.13));
  border-color:rgba(223,190,107,.30);
  border-left-color:#d7b35d;
  color:#fff3cb;
  box-shadow:0 8px 28px rgba(0,0,0,.30);
}
.menuNavButton:focus-visible{outline:1px solid rgba(223,190,107,.45);outline-offset:2px}
.menuNavButton:disabled{opacity:.34;cursor:not-allowed;transform:none!important}
.menuNavArrow{font-size:21px;line-height:1;color:#666254}
.menuNavButton:hover .menuNavArrow{transform:translateX(4px);color:#e7be68}
.menuNavButton.active .menuNavArrow{color:#e2b253}

@media (min-width:1200px) and (max-width:1450px) and (min-height:700px) and (max-height:820px){
  .menuLogo{
    left:46px;
    top:30px;
  }
  .menuHomeLayout::before{
    width:500px;
  }
  .menuSlotBar{
    right:46px;
    top:116px;
    width:520px;
  }
  .menuHomeRedesign #saveSlots{
    gap:76px;
  }
  .menuHomeRedesign .saveSlotCard{
    min-height:104px;
    padding:10px;
  }
  .menuNav{
    left:46px;
    top:298px;
    width:380px;
    gap:9px;
  }
  .menuNavButton{
    min-height:39px;
  }
}
@media(max-width:750px){
  .menuHomeLayout::before{width:100%;background:linear-gradient(90deg,rgba(3,4,3,.93),rgba(3,4,3,.58) 80%,transparent)}
  .menuLogo{left:20px;top:20px}
  .menuNav,.menuSlotBar{
    left:20px;
    right:auto;
    width:calc(100vw - 40px);
  }
  .menuSlotBar{
    top:105px;
    padding-left:12px;
  }
  .menuHomeRedesign #saveSlots{
    grid-template-columns:1fr;
    gap:72px;
  }
  .menuHomeRedesign .saveSlotCard{
    min-height:94px;
    padding:9px 7px;
  }
  .menuNav{top:290px}
}
`;
  document.head.appendChild(style);

  const backdrop=document.createElement("div");
  backdrop.id="menuBackdrop";
  backdrop.innerHTML=`
    <svg class="menuBGRuined" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id="rr-wall" width="76" height="54" patternUnits="userSpaceOnUse">
          <rect width="76" height="54" fill="#a9a565"/>
          <path d="M0 27 19 9 38 27 57 9 76 27" fill="none" stroke="#5d603e" stroke-width="3.8" opacity=".52"/>
          <path d="M0 27 19 45 38 27 57 45 76 27" fill="none" stroke="#d8cf92" stroke-width="2.2" opacity=".21"/>
        </pattern>
        <linearGradient id="rr-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#6e684b"/><stop offset=".45" stop-color="#57533f"/><stop offset="1" stop-color="#252720"/>
        </linearGradient>
        <linearGradient id="rr-ceil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#cbc7b5"/><stop offset=".7" stop-color="#9c998d"/><stop offset="1" stop-color="#55544e"/>
        </linearGradient>
        <linearGradient id="rr-depth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#11130f" stop-opacity=".02"/><stop offset=".55" stop-color="#090b08" stop-opacity=".18"/><stop offset="1" stop-color="#030403" stop-opacity=".82"/>
        </linearGradient>
        <radialGradient id="rr-light">
          <stop offset="0" stop-color="#fff6c7" stop-opacity=".85"/><stop offset=".3" stop-color="#f4dd99" stop-opacity=".3"/><stop offset="1" stop-color="#ecd18a" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="rr-wet">
          <stop offset="0" stop-color="#d6ca8e" stop-opacity=".18"/><stop offset=".5" stop-color="#81774e" stop-opacity=".07"/><stop offset="1" stop-color="#15170f" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="rr-vignette">
          <stop offset=".4" stop-color="#000" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity=".8"/>
        </radialGradient>
        <filter id="rr-noise">
          <feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="4" seed="83"/>
          <feColorMatrix type="saturate" values="0"/>
          <feComponentTransfer><feFuncA type="table" tableValues="0 .065"/></feComponentTransfer>
        </filter>
        <filter id="rr-blur"><feGaussianBlur stdDeviation="12"/></filter>
      </defs>

      <!-- Wide office-like Level-0 room: low ceiling, square columns, repeating yellow walls. -->
      <polygon points="0,0 1600,0 1240,325 360,325" fill="url(#rr-ceil)"/>
      <polygon points="0,0 360,325 360,900 0,900" fill="url(#rr-wall)"/>
      <polygon points="1600,0 1240,325 1240,900 1600,900" fill="url(#rr-wall)"/>
      <polygon points="0,900 360,325 1240,325 1600,900" fill="url(#rr-floor)"/>

      <!-- Drop-ceiling grid from the reference photos. -->
      <g stroke="#737266" stroke-width="4" opacity=".64" fill="none">
        <path d="M0 80H1600"/><path d="M0 160H1600"/><path d="M0 240H1600"/>
        <path d="M180 0 500 325"/><path d="M440 0 655 325"/><path d="M700 0 800 325"/>
        <path d="M960 0 930 325"/><path d="M1220 0 1060 325"/><path d="M1480 0 1185 325"/>
      </g>

      <!-- Water-stained tiles and holes. -->
      <g opacity=".64">
        <path d="M520 0H760L735 82H545Z" fill="#7a776c"/>
        <path d="M565 8H716L695 55H584Z" fill="#3b3b35"/>
        <path d="M1080 0H1255L1223 78H1098Z" fill="#77746a"/>
        <path d="M1305 154H1450L1420 210H1277Z" fill="#6d6b61"/>
      </g>

      <!-- Harsh fluorescent panels scattered at realistic depths. -->
      <g class="fixture">
        <ellipse cx="800" cy="322" rx="285" ry="96" fill="url(#rr-light)" filter="url(#rr-blur)"/>
        <rect x="655" y="305" width="290" height="18" rx="3" fill="#d9d4bd"/>
        <rect x="700" y="309" width="198" height="7" fill="#fff5c7"/>
      </g>
      <g class="fixture delay">
        <ellipse cx="797" cy="228" rx="175" ry="60" fill="url(#rr-light)" filter="url(#rr-blur)"/>
        <rect x="710" y="216" width="174" height="12" rx="3" fill="#c4c1b1"/>
        <rect x="746" y="219" width="103" height="5" fill="#eee4bb"/>
      </g>
      <g class="fixture">
        <ellipse cx="797" cy="135" rx="106" ry="40" fill="url(#rr-light)" filter="url(#rr-blur)"/>
        <rect x="744" y="124" width="106" height="9" rx="2" fill="#b4b1a5"/>
      </g>
      <g class="fixture delay">
        <ellipse cx="1268" cy="293" rx="125" ry="44" fill="url(#rr-light)" filter="url(#rr-blur)"/>
        <rect x="1213" y="283" width="112" height="9" rx="2" fill="#aaa79a"/>
      </g>
      <g class="fixture delay">
        <ellipse cx="240" cy="345" rx="78" ry="28" fill="url(#rr-light)" filter="url(#rr-blur)"/>
        <rect x="202" y="339" width="76" height="7" rx="2" fill="#aaa79a"/>
      </g>

      <!-- Square columns and partial walls: open, messy office geometry instead of a hallway. -->
      <g>
        <polygon points="242,311 324,316 301,625 198,652" fill="#77724c"/>
        <polygon points="242,311 324,316 326,348 245,342" fill="#b0a96e"/>
        <polygon points="267,311 301,314 279,620 240,635" fill="#57543d"/>

        <polygon points="1275,318 1359,309 1397,631 1295,604" fill="#716d4b"/>
        <polygon points="1275,318 1359,309 1364,342 1278,350" fill="#aaa368"/>
        <polygon points="1334,312 1360,309 1397,631 1359,619" fill="#4d4c39"/>

        <polygon points="505,324 560,325 548,507 492,512" fill="#656246"/>
        <polygon points="1050,323 1106,320 1115,509 1058,505" fill="#615e43"/>
      </g>

      <!-- Side rooms/openings. -->
      <polygon points="42,356 220,333 228,568 33,610" fill="#79744d"/>
      <polygon points="76,366 195,349 198,536 76,559" fill="#13150f"/>
      <polygon points="1372,340 1554,356 1563,606 1387,570" fill="#726e4a"/>
      <polygon points="1402,358 1526,369 1530,552 1415,531" fill="#0b0d09"/>

      <!-- Far open bay, not a door: another room disappearing into darkness. -->
      <polygon points="610,325 1012,325 1100,638 532,638" fill="#8c8658"/>
      <polygon points="696,350 924,350 971,625 620,625" fill="#22231c"/>
      <polygon points="756,370 865,370 896,623 690,623" fill="#080a07"/>

      <!-- Peeling wallpaper inspired by the damaged reference photos. -->
      <g opacity=".82">
        <path d="M32 158 155 181 124 340 25 321Z" fill="#d6cb83"/>
        <path d="M88 219 198 233 166 319 82 306Z" fill="#e2d9a4"/>
        <path d="M1460 160 1588 146 1598 305 1492 324Z" fill="#c7bb74"/>
        <path d="M1432 472 1549 449 1578 548 1458 578Z" fill="#b3a560"/>
        <path d="M130 568 286 539 302 660 151 699Z" fill="#c0b36b"/>
      </g>
      <g fill="#454532" opacity=".5">
        <path d="M80 337 197 356 169 454 64 434Z"/>
        <path d="M1494 331 1570 321 1592 427 1510 444Z"/>
      </g>

      <!-- Loose ceiling tiles, scraps and rubble on the carpet. -->
      <g fill="#393a31" opacity=".92">
        <rect x="498" y="390" width="104" height="18" transform="rotate(9 498 390)"/>
        <rect x="970" y="427" width="93" height="17" transform="rotate(-12 970 427)"/>
        <rect x="310" y="645" width="126" height="18" transform="rotate(-6 310 645)"/>
        <path d="M1082 644 1176 613 1218 636 1122 666Z"/>
        <path d="M390 739 497 705 535 726 429 757Z"/>
        <path d="M1120 790 1247 758 1290 780 1170 820Z"/>
      </g>

      <!-- Exposed wires through the missing ceiling panels. -->
      <g fill="none" stroke="#20221c" stroke-width="11">
        <path d="M720 14 C686 66 750 101 714 154 C684 200 709 245 683 300"/>
        <path d="M870 8 C906 58 856 100 896 149 C927 195 893 244 922 302"/>
        <path d="M1022 22 C990 77 1033 116 1002 162 C975 207 1000 254 984 305"/>
      </g>
      <g fill="none" stroke="#8f8460" stroke-width="2" opacity=".78">
        <path d="M720 14 C686 66 750 101 714 154 C684 200 709 245 683 300"/>
        <path d="M870 8 C906 58 856 100 896 149 C927 195 893 244 922 302"/>
        <path d="M1022 22 C990 77 1033 116 1002 162 C975 207 1000 254 984 305"/>
      </g>

      <!-- Damp carpet and irregular wet patches. -->
      <ellipse cx="520" cy="705" rx="280" ry="58" fill="#11130f" opacity=".46"/>
      <ellipse cx="1090" cy="700" rx="270" ry="63" fill="#0d0f0b" opacity=".5"/>
      <ellipse cx="810" cy="835" rx="390" ry="76" fill="#0b0d0a" opacity=".45"/>
      <ellipse cx="995" cy="700" rx="174" ry="48" fill="url(#rr-wet)"/>
      <ellipse cx="610" cy="690" rx="138" ry="38" fill="url(#rr-wet)"/>

      <!-- Dirty carpet seams and staining. -->
      <g fill="none" stroke="#8b8159" stroke-width="5" opacity=".17">
        <path d="M72 900 402 315"/><path d="M320 900 570 315"/><path d="M1518 900 1197 315"/><path d="M1282 900 1035 315"/>
      </g>
      <g fill="#56503a" opacity=".5">
        <ellipse cx="420" cy="618" rx="78" ry="21"/>
        <ellipse cx="1180" cy="597" rx="86" ry="23"/>
        <ellipse cx="876" cy="732" rx="103" ry="25"/>
      </g>

      <!-- Foreground torn carpet and fragments. -->
      <g fill="#191b16" opacity=".95">
        <path d="M50 820 280 751 381 784 118 872Z"/>
        <path d="M1182 840 1368 770 1498 819 1220 892Z"/>
        <rect x="414" y="808" width="132" height="20" rx="3" transform="rotate(-7 414 808)"/>
        <rect x="1017" y="775" width="104" height="18" rx="3" transform="rotate(9 1017 775)"/>
        <path d="M728 865 848 828 920 851 798 886Z"/>
      </g>

      <!-- Far-edge darkness keeps the menu controls readable. -->
      <rect width="1600" height="900" fill="url(#rr-depth)"/>
      <rect width="1600" height="900" filter="url(#rr-noise)" opacity=".52"/>
      <rect width="1600" height="900" fill="url(#rr-vignette)"/>
    </svg>
  `;
  overlay.insertBefore(backdrop,homeScreen);

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
    const labelHtml=button===continueButton
      ? '<span id="continueSlotLabel">CONTINUE SLOT '+selectedSaveSlot+'</span>'
      : '<span>'+label+'</span>';
    button.innerHTML=
      '<span class="menuNavLabel">'+labelHtml+'</span>'+
      '<span class="menuNavArrow">›</span>';
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

  // The old FIELD TERMINAL has been replaced by the live LOCAL SAVES panel.
  // Keep the existing save-slot DOM so selection/new-game/continue logic remains
  // shared with the rest of the menu.

  layout.append(logo,slotBar,nav);
  homeScreen.appendChild(layout);

  window.__deepseekerMenu={
    refreshElementEditor:()=>{},
    getElementStyles:()=>({})
  };
}

function updateHouseLoadingUI(progress=null,status=null){
  const value=Number.isFinite(progress)
    ? Math.max(0,Math.min(100,Math.round(progress)))
    : (houseLoaded && houseCollisionReady ? 100 : houseLoaded ? 76 : 0);
  window.__deepseekerHouseLoadProgress=value;

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
  if(newGameButton){
    newGameButton.disabled=false;
    newGameButton.removeAttribute("disabled");
  }
  if(continueButton) continueButton.disabled=!save;

  if(startLobbyButton && !new URLSearchParams(location.search).has("lobby")){
    startLobbyButton.disabled=false;
  }

  for(const button of [newGameButton,continueButton,startLobbyButton]){
    if(!button) continue;
    button.style.opacity=button.disabled ? ".38" : "1";
  }
}

async function saveGame(slot=selectedSaveSlot,{confirmOverwrite=true}={}){
  const targetSlot=normalizeSaveSlot(slot);

  if(confirmOverwrite && getSavedGame(targetSlot) && !window.confirm("SLOT "+targetSlot+" ALREADY HAS A SAVE. OVERWRITE IT?")){
    eventText.textContent="SAVE CANCELLED · SLOT "+targetSlot;
    eventText.style.opacity="1";
    return false;
  }

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
    level:"backrooms",
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

  const disposedMaterials=new Set();
  houseModel.traverse(obj=>{
    if(!obj.isMesh) return;

    if(obj.geometry){
      obj.geometry.dispose();
    }

    const materials=Array.isArray(obj.material)
      ? obj.material
      : [obj.material];

    for(const material of materials){
      if(!material || disposedMaterials.has(material)) continue;
      disposedMaterials.add(material);
      material.dispose();
    }
  });

  for(const material of houseLowMaterialCache.values()){
    if(!disposedMaterials.has(material)) material.dispose();
  }
  houseLowMaterialCache.clear();
  houseRenderMeshes.length=0;

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

  if(shouldKeepHouseLoaded() || initialHouseRequired){
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
  flashlightOn=false;
  player.setFlashlightVisual(false);
  gameStarted=true;
  overlay.classList.add("hidden");
  audio.start();

  // Core player/spider assets are now readiness-gated before the menu or
  // gameplay can start; no model download is kicked off from this path.
  pendingHouseStart=false;
  pendingSaveLoad=null;
  pendingNewGameSlot=null;

  if(save){
    applySavedGame(save);
  }else{
    houseMode=false;
    ensureTutorialOpenRoom();
    player.pos.set(32,EYE,32);
    player.vel.set(0,0,0);
    player.jumpY=0;
    player.jumpVelocity=0;
    player.keys.clear();
    setHouseTutorialStage(1);
  }

  player.lock();

  // The tutorial spider pack was required by the boot loading gate.

  // Creating a new slot immediately writes an initial checkpoint instead of
  // leaving the slot empty until the 20-second autosave.
  if(!save){
    saveGame(saveSlot,{confirmOverwrite:false});
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

function resetForNewGame(slot=selectedSaveSlot,{skipConfirm=false}={}){
  const targetSlot=normalizeSaveSlot(slot);

  if(!skipConfirm && getSavedGame(targetSlot) && !window.confirm("SLOT "+targetSlot+" ALREADY HAS A SAVE. STARTING NEW GAME WILL OVERWRITE IT. CONTINUE?")){
    eventText.textContent="NEW GAME CANCELLED · SLOT "+targetSlot;
    eventText.style.opacity="1";
    return;
  }

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
  spiderSpawnPending=false;
  spiderJumpscareTimer=0;
  spiderBehaviorState="idle";
  spiderBehaviorTime=0;
  spiderEntity.visible=false;
  resetHouseTutorial();

  gameStarted=false;

  player.pos.set(32,EYE,32);
  player.yaw=0;
  player.pitch=0;
  player.vel.set(0,0,0);
  player.keys.clear();
  player.jumpY=0;
  player.jumpVelocity=0;
  player.crouched=false;
  player.sliding=false;
  player.slideTimer=0;
  player.stamina=100;
  player.landingKick=0;
  battery=100;
  flashlightOn=true;
  player.setFlashlightVisual(true);
  maxStoryDistance=0;

  // Reset the level state without relying on the previous run's state.
  houseMode=false;
  disableTutorialOpenRoom();
  world.root.visible=true;
  houseRoot.visible=false;
  player.ignoreWorldCollision=false;
  player.extraCollisionBoxes=[];

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
  getLevel:()=>houseMode ? "house" : "backrooms",
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
  onWorldEvent:(event)=>{
    if(event?.type==="spider_snapshot"){
      if(event.playerId!==multiplayer.getWorldAuthorityId()) return;
      const payload=event.payload||{};
      const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
      remoteSpiderSnapshot={
        active:Boolean(payload.active),
        x:finite(payload.x),
        y:finite(payload.y,.08),
        z:finite(payload.z),
        rotationX:finite(payload.rotationX),
        rotationY:finite(payload.rotationY),
        scale:THREE.MathUtils.clamp(finite(payload.scale,1),.1,3),
        behavior:String(payload.behavior||"idle").slice(0,24),
        animation:String(payload.animation||"idle").slice(0,24),
        jumpscareTimer:THREE.MathUtils.clamp(finite(payload.jumpscareTimer),0,2)
      };
      remoteSpiderSnapshotReceivedAt=performance.now();
      return;
    }
    if(event?.type==="computer_opened"){
      eventText.textContent="REMOTE TERMINAL ACTIVE · "+(event.id||"NODE");
      eventText.style.opacity="1";
      setTimeout(()=>{
        if(eventText.textContent.startsWith("REMOTE TERMINAL ACTIVE")){
          eventText.style.opacity="0";
        }
      },1600);
    }
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

const navigation=new NavigationSystem({
  player,
  getLevelName:()=>houseMode ? "APARTMENT" : "BACKROOMS"
});

const securityCameras=new SecurityCameraSystem({
  scene,
  renderer,
  player,
  getCameras:()=>world.getSecurityCameras(),
  onClose:()=>{ if(gameStarted) player.lock(); }
});

const computerSystem=new ComputerSystem({
  onOpenCameras:()=>{
    computerSystem.close();
    if(!securityCameras.open()){
      eventText.textContent="NO SECURITY CAMERAS AVAILABLE";
      eventText.style.opacity="1";
      setTimeout(()=>{eventText.style.opacity="0";},1500);
    }
  },
  onWorldEvent:(event)=>{
    if(multiplayer?.socket){
      multiplayer.broadcastWorldEvent(event.type,event.id,event);
    }
  },
  onClose:()=>{ if(gameStarted) player.lock(); }
});

const interaction=new InteractionSystem({
  camera,
  domElement:renderer.domElement,
  getCandidates:()=>world.getInteractables(),
  onInteract:(target)=>{
    if(!gameStarted || houseMode) return false;
    if(target.type==="computer"){
      computerSystem.open(target);
      return true;
    }
    if(target.type==="stairwellDoor" && typeof target.toggle==="function"){
      return target.toggle();
    }
    return false;
  }
});

function toggleArachnophobia(){
  arachnophobiaMode=setArachnophobiaMode(!arachnophobiaMode);
  applyArachnophobiaVisual();
  if(controlsOpen){
    const button=document.getElementById("deepseekerArachnophobiaToggle");
    if(button) button.textContent="ARACHNOPHOBIA MODE: "+(arachnophobiaMode?"ON · RUBBER DUCK":"OFF");
  }
  eventText.textContent=arachnophobiaMode
    ? "ARACHNOPHOBIA MODE · RUBBER DUCK ENABLED"
    : "ARACHNOPHOBIA MODE DISABLED";
  eventText.style.opacity="1";
  setTimeout(()=>{eventText.style.opacity="0";},1700);
}

function updateArachnophobiaWarningUI(){
  if(!arachnophobiaModeButton) return;

  arachnophobiaModeButton.textContent=arachnophobiaMode
    ? "ARACHNOPHOBIA MODE: ON · RUBBER DUCK"
    : "ARACHNOPHOBIA MODE: OFF · SPIDER";

  if(arachnophobiaModeStatus){
    arachnophobiaModeStatus.textContent=arachnophobiaMode
      ? "SPIDER REPLACED WITH RUBBER DUCK"
      : "SPIDER ENTITY ENABLED";
  }
}

function showArachnophobiaWarning(){
  if(!arachnophobiaWarning) return;

  loadingScreen.style.display="none";
  homeScreen.classList.add("hidden");
  lobbyScreen.classList.add("hidden");
  arachnophobiaWarning.classList.remove("hidden");
  arachnophobiaWarning.setAttribute("aria-hidden","false");
  updateArachnophobiaWarningUI();
}

function continueFromArachnophobiaWarning(){
  if(!arachnophobiaWarning) return;

  arachnophobiaWarning.classList.add("hidden");
  arachnophobiaWarning.setAttribute("aria-hidden","true");

  if(new URLSearchParams(location.search).get("lobby")==="1"){
    showLobbyScreen();
  }else{
    showHomeScreen();
  }
}

function installArachnophobiaControl(){
  const box=document.getElementById("controlsBox");
  if(!box || document.getElementById("deepseekerArachnophobiaToggle")) return;
  const button=document.createElement("button");
  button.id="deepseekerArachnophobiaToggle";
  button.type="button";
  button.textContent="ARACHNOPHOBIA MODE: "+(arachnophobiaMode?"ON · RUBBER DUCK":"OFF");
  button.style.cssText=[
    "display:block","margin:14px auto 0","padding:9px 12px",
    "border:1px solid rgba(229,218,170,.16)","border-radius:9px",
    "background:#ffffff06","color:#bdb695","font:9px system-ui,sans-serif",
    "letter-spacing:1.6px","cursor:pointer"
  ].join(";");
  button.addEventListener("click",toggleArachnophobia);
  box.appendChild(button);
}

installArachnophobiaControl();

arachnophobiaModeButton?.addEventListener("click",()=>{
  toggleArachnophobia();
  updateArachnophobiaWarningUI();
});

arachnophobiaContinueButton?.addEventListener("click",continueFromArachnophobiaWarning);

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
  const currentLevel="backrooms";

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

  multiplayerMapLevel.textContent="BACKROOMS";
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
  houseRenderMeshes.length=0;

  root.traverse((obj)=>{
    if(!obj.isMesh) return;

    obj.visible=!obj.userData.houseRemovedDoor;
    obj.frustumCulled=true;

    if(LOW_END_PERFORMANCE){
      const box=new THREE.Box3().setFromObject(obj);
      const sphere=box.getBoundingSphere(new THREE.Sphere());
      obj.userData.houseCullCenter=sphere.center.clone();
      obj.userData.houseCullRadius=Math.max(.5,sphere.radius);
      houseRenderMeshes.push(obj);
    }
  });
}

function updateHouseRenderCulling(){
  if(!LOW_END_PERFORMANCE || !houseMode || !houseRenderMeshes.length) return;

  const maxDistance=38;
  const px=player.pos.x;
  const pz=player.pos.z;

  for(const mesh of houseRenderMeshes){
    if(mesh.userData.houseRemovedDoor){
      mesh.visible=false;
      continue;
    }

    const center=mesh.userData.houseCullCenter;
    const radius=mesh.userData.houseCullRadius||.5;
    const dx=px-center.x;
    const dz=pz-center.z;
    const limit=maxDistance+radius;
    mesh.visible=(dx*dx+dz*dz)<=limit*limit;
  }
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
    const interactionBox={minX:best.box.min.x,maxX:best.box.max.x,minZ:best.box.min.z,maxZ:best.box.max.z};
    for(const part of candidates){
      const nearX=Math.abs(part.center.x-best.center.x)<=Math.max(best.size.x,part.size.x)+.75;
      const nearZ=Math.abs(part.center.z-best.center.z)<=Math.max(best.size.z,part.size.z)+.75;
      if(nearX && nearZ){
        interactionBox.minX=Math.min(interactionBox.minX,part.box.min.x);
        interactionBox.maxX=Math.max(interactionBox.maxX,part.box.max.x);
        interactionBox.minZ=Math.min(interactionBox.minZ,part.box.min.z);
        interactionBox.maxZ=Math.max(interactionBox.maxZ,part.box.max.z);
      }
    }
    houseReturnPortal.userData.interactionBounds=interactionBox;
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
    houseReturnPortal.userData.interactionBounds={minX:couch.box.min.x,maxX:couch.box.max.x,minZ:couch.box.min.z,maxZ:couch.box.max.z};
    houseReturnPortal.userData.targetType="couch";
    houseReturnPortal.userData.targetName=String(couch.object.name||"couch");
    console.warn("[DeepSeeker] magazine mesh was not named; using couch target");
    return true;
  }

  houseReturnPortal.userData.active=false;
  houseReturnPortal.userData.interactionBounds=null;
  console.warn("[DeepSeeker] could not locate magazine/couch target");
  return false;
}

function useHouseReturnTeleporter(){
  if(!houseMode || backroomsFallTimer>0) return false;

  if(houseTutorialStage<5){
    eventText.textContent=houseTutorialStage>=3
      ? "IT IS NOT SAFE YET."
      : "EXPLORE THE ROOM FIRST.";
    eventText.style.opacity="1";
    setTimeout(()=>{
      if(eventText.textContent==="IT IS NOT SAFE YET." || eventText.textContent==="EXPLORE THE ROOM FIRST."){
        eventText.style.opacity="0";
      }
    },900);
    return false;
  }

  const bounds=houseReturnPortal.userData.interactionBounds;
  if(bounds){
    const nx=THREE.MathUtils.clamp(player.pos.x,bounds.minX,bounds.maxX);
    const nz=THREE.MathUtils.clamp(player.pos.z,bounds.minZ,bounds.maxZ);
    if(Math.hypot(player.pos.x-nx,player.pos.z-nz)>1.6) return false;
  }else{
    const d=Math.hypot(player.pos.x-houseReturnPortal.position.x,player.pos.z-houseReturnPortal.position.z);
    if(d>2.2) return false;
  }

  player.keys.clear();
  player.vel.set(0,0,0);
  return startBackroomsFall(Date.now(),true);
}

function ensureHouseCollisionSetup(){
  if(!houseLoaded || houseCollisionReady || houseCollisionBuildStarted || !houseModel) return;

  houseCollisionBuildStarted=true;
  const build=()=>{
    const started=performance.now();

    try{
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
    }catch(error){
      houseCollisionReady=false;
      houseCollisionBuildStarted=false;
      houseLoadFailed=true;
      initialStartupError=String(error?.message||error||"Apartment collision preparation failed");
      console.error("[DeepSeeker] Apartment collision preparation failed:",error);
      updateHouseLoadingUI(0,"APARTMENT PREPARATION FAILED — RELOAD TO RETRY.");
      return;
    }

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
        saveGame(newSlot,{confirmOverwrite:false});
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

  // During the boot gate, run immediately so startup readiness cannot depend
  // on browser idle scheduling. Later reloads may still use idle time.
  if(!gameStarted){
    setTimeout(build,0);
  }else if("requestIdleCallback" in window){
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

        if(LOW_END_PERFORMANCE){
          const simplified=materials.map(source=>{
            if(!source) return source;

            const cacheKey=source.uuid;
            const cached=houseLowMaterialCache.get(cacheKey);
            if(cached) return cached;

            const material=new THREE.MeshLambertMaterial({
              map:source.map||null,
              color:source.color?.clone?.()||0xffffff,
              alphaMap:source.alphaMap||null,
              transparent:Boolean(source.transparent),
              opacity:Number.isFinite(source.opacity)?source.opacity:1,
              vertexColors:Boolean(source.vertexColors),
              side:THREE.FrontSide,
              fog:true
            });
            houseLowMaterialCache.set(cacheKey,material);
            return material;
          });

          obj.material=Array.isArray(obj.material) ? simplified : simplified[0];
        }else{
          for(const material of materials){
            if(!material) continue;
            material.side=THREE.FrontSide;
            material.toneMapped=true;
          }
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

  resetHouseTutorial();

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
    spiderSpawnPending=false;
    renderer.setPixelRatio(housePixelRatio);
    flashlight.castShadow=false;

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

    spiderSpawnPending=true;
    ensureSpiderLoading();

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
installArachnophobiaControl();

const initialParams=new URLSearchParams(location.search);
const querySaveSlot=initialParams.get("saveSlot");
if(querySaveSlot!==null){
  setSelectedSaveSlot(querySaveSlot,false);
}
if(initialParams.get("save")==="1"){
  pendingSaveLoad=getSavedGame(selectedSaveSlot);
}

let initialLandingShown=false;
let initialLoadingTimer=null;
let initialStartupPrepared=false;
let initialStartupError="";
let biscuitTextureReady=false;
let initialHouseDecisionMade=false;
const INITIAL_WORLD_CHUNK_KEYS=[-1,0,1].flatMap(cx=>
  [-1,0,1].map(cz=>cx+","+cz)
);

function prepareInitialStartupAssets(){
  if(initialStartupPrepared) return true;

  try{
    // Build the tutorial companion during the boot screen. It is procedural,
    // but preparing it here guarantees NEW GAME does not do surprise work.
    createTutorialMascot();
    initialStartupPrepared=true;
    initialStartupError="";
    return true;
  }catch(error){
    initialStartupPrepared=false;
    initialStartupError=String(error?.message||error||"Unknown startup asset error");
    console.error("[DeepSeeker] Initial startup asset preparation failed:",error);
    return false;
  }
}

function ensureInitialWorldRegion(){
  if(!world || typeof world.spawnChunk!=="function" || !world.chunks) return false;

  // Do not depend on the normal gameplay streamer to advance the boot screen:
  // create one missing starting chunk directly on each loading tick.
  for(const key of INITIAL_WORLD_CHUNK_KEYS){
    if(world.chunks.has(key)) continue;
    const [cx,cz]=key.split(",").map(Number);
    try{
      world.spawnChunk(cx,cz);
      return true;
    }catch(error){
      initialStartupError="STARTING WORLD CHUNK "+key+" FAILED TO GENERATE.";
      console.error("[DeepSeeker] Initial Backrooms chunk generation failed:",{key,error});
      return false;
    }
  }

  return true;
}

function updateInitialLoadingScreen(){
  if(initialLandingShown) return;
  if(!initialStartupError) ensureInitialWorldRegion();

  const saveReady=Boolean(window.__deepseekerSaveHydrationDone);
  if(saveReady && !initialHouseDecisionMade){
    initialHouseDecisionMade=true;
    const apartmentSaveExists=Array.from(
      {length:SAVE_SLOT_COUNT},
      (_,index)=>getSavedGame(index+1)
    ).some(save=>Boolean(save) && getSavedLevel(save)==="apartment");
    initialHouseRequired=apartmentSaveExists;
    if(initialHouseRequired) ensureHouseLoading();
  }

  const saveProgress=saveReady?100:0;
  const decoderProgress=geometryDecoderReady?100:0;
  const startupProgress=initialStartupPrepared?100:0;
  const characterReady=player.characterLoaded || player.characterLoadFailed;
  const characterProgress=characterReady?100:0;
  const spiderProgress=spiderLoaded?100:0;
  const loadedWorldChunks=INITIAL_WORLD_CHUNK_KEYS.filter(key=>world.chunks.has(key)).length;
  const worldProgress=loadedWorldChunks/INITIAL_WORLD_CHUNK_KEYS.length*100;
  const houseProgress=!initialHouseDecisionMade
    ? 0
    : !initialHouseRequired
      ? 100
      : houseCollisionReady
        ? 100
        : Math.max(0,Math.min(99,Number(window.__deepseekerHouseLoadProgress)||0));
  const total=Math.max(0,Math.min(100,Math.round(
    decoderProgress*.10 +
    startupProgress*.06 +
    saveProgress*.08 +
    characterProgress*.22 +
    spiderProgress*.22 +
    worldProgress*.12 +
    (biscuitTextureReady?100:0)*.10 +
    houseProgress*.10
  )));

  const fill=document.getElementById("initialLoadFill");
  const percent=document.getElementById("initialLoadPercent");
  const status=document.getElementById("initialLoadStatus");
  if(fill) fill.style.width=total+"%";
  if(percent) percent.textContent=total+"%";

  if(status){
    if(initialStartupError){
      status.textContent="STARTUP PREPARATION FAILED — RELOAD TO RETRY.";
    }else if(!geometryDecoderReady){
      status.textContent="INITIALIZING GEOMETRY DECODERS…";
    }else if(!initialStartupPrepared){
      status.textContent="PREPARING FIRST-ROOM ASSETS…";
    }else if(!saveReady){
      status.textContent="FINALIZING SAVE DATA…";
    }else if(!biscuitTextureReady){
      status.textContent="LOADING ARAchnOPHOBIA REPLACEMENT TEXTURE…";
    }else if(!characterReady){
      status.textContent="LOADING HAZMAT CHARACTER + FIRST-PERSON GEAR…";
    }else if(!spiderLoaded){
      status.textContent=spiderStartupFailed
        ? "SPIDER PACK FAILED — RETRYING…"
        : "LOADING SPIDER MODEL + ANIMATIONS…";
    }else if(loadedWorldChunks<INITIAL_WORLD_CHUNK_KEYS.length){
      status.textContent="GENERATING STARTING BACKROOMS REGION… "+
        loadedWorldChunks+"/"+INITIAL_WORLD_CHUNK_KEYS.length+" CHUNKS READY.";
    }else if(initialHouseRequired && !houseCollisionReady){
      status.textContent=houseLoadFailed
        ? "SAVED APARTMENT FAILED TO LOAD — RELOAD TO RETRY."
        : "LOADING SAVED APARTMENT + BUILDING COLLISION…";
    }else if(player.characterLoadFailed && !player.characterLoaded){
      status.textContent="PLAYER MODEL UNAVAILABLE — FALLBACK HANDS READY.";
    }else{
      status.textContent="ALL REQUIRED GAME ASSETS READY — FINALIZING STARTUP.";
    }
  }

  prompt.textContent="PREPARING WORLD… "+total+"%";
}

function finishInitialLoading(){
  if(initialLandingShown) return;
  updateInitialLoadingScreen();

  const characterReady=player.characterLoaded || player.characterLoadFailed;
  const worldReady=INITIAL_WORLD_CHUNK_KEYS.every(key=>world.chunks.has(key));
  const houseReady=!initialHouseRequired || (houseLoaded && houseCollisionReady);
  if(
    initialStartupError ||
    !geometryDecoderReady ||
    !initialStartupPrepared ||
    !window.__deepseekerSaveHydrationDone ||
    !biscuitTextureReady ||
    !initialHouseDecisionMade ||
    !characterReady ||
    !spiderLoaded ||
    !worldReady ||
    !houseReady
  ){
    return;
  }

  initialLandingShown=true;
  if(initialLoadingTimer!==null){
    clearInterval(initialLoadingTimer);
    initialLoadingTimer=null;
  }

  // URL-based save continuation must also wait for all required assets.
  if(initialParams.get("save")==="1"){
    const save=pendingSaveLoad || getSavedGame(selectedSaveSlot);
    pendingSaveLoad=null;
    if(save){
      startGame(save,selectedSaveSlot);
      return;
    }
  }

  showArachnophobiaWarning();
}

function beginInitialLoading(){
  loadingScreen.style.display="flex";
  homeScreen.classList.add("hidden");
  lobbyScreen.classList.add("hidden");
  window.__deepseekerSaveHydrationDone=false;

  initialSaveHydrationPromise.finally(()=>{
    window.__deepseekerSaveHydrationDone=true;
  });

  // All core first-session dependencies begin behind the boot screen.
  // The first nine procedural chunks are generated here before the menu exits.
  prepareInitialStartupAssets();
  preloadBiscuitTexture().then(()=>{
    biscuitTextureReady=true;
  }).catch(error=>{
    initialStartupError="Biscuit replacement texture failed to load.";
    console.error("[DeepSeeker] Biscuit texture startup load failed:",error);
  });
  player.ensureCharacterLoaded().catch(error=>{
    console.error("[DeepSeeker] Player model startup load failed:",error);
  });
  world.update(32,32);
  ensureSpiderLoading(true);

  // Decoder warmup is already running; keep the same boot gate for it.
  void geometryDecoderPromise;

  updateInitialLoadingScreen();
  initialLoadingTimer=setInterval(()=>{
    updateInitialLoadingScreen();
    finishInitialLoading();
  },80);
}

// The initial loading gate is started at the end of module initialization,
 // after the gameplay, spider, and rendering state have all been created.

player.hands.visible=true;


const spiderEntity=new THREE.Group();
spiderEntity.name="SpiderEntity";
spiderEntity.visible=false;
const spiderRevealLight=new THREE.PointLight(0xff160f,0,42,1.45);
spiderRevealLight.position.set(0,1.2,0);
spiderEntity.add(spiderRevealLight);

scene.add(spiderEntity);

// The regular Backrooms uses the tutorial controller with the imported spider
// mesh. Avoid constructing a second procedural creature whose visuals are never
// rendered; only the tutorial needs the full SignalStalkerRig placeholder.
const normalSpiderHiddenRig={
  root:new THREE.Group(),
  setFrozen(){},
  update(){},
  distanceToHitbox(){return Infinity;}
};
normalSpiderHiddenRig.root.name="HiddenBackroomsSpiderRig";
normalSpiderHiddenRig.root.visible=false;

const normalSpiderHunter=new SpiderHunter({
  group:spiderEntity,
  scene,
  world,
  player,
  visualRig:normalSpiderHiddenRig,
  isBlocked:(x,z)=>isSpiderBlocked(x,z),
  getOccluders:()=>world.wallOccluders,
  // Enlarged contact radius catches the body sooner; articulated legs stay visual-only.
  getVisualHitboxDistance:(x,z)=>Math.max(
    0,
    Math.hypot(x-spiderEntity.position.x,z-spiderEntity.position.z)-
      SPIDER_TARGET_SPAN*(1.4/SPIDER_BASE_TARGET_SPAN)
  ),
  onStateChange:(mode)=>{
    if(mode==="roam"){
      spiderBehaviorState="peek";
      spiderVisibleToPlayer=true;
      spiderRevealLight.visible=false;
      spiderMixer?.stopAllAction();
      spiderAnimationState="";
      spiderWantedState="stalk";
    }else if(mode==="investigate"){
      spiderBehaviorState="chase";
      setSpiderAnimation("chase");
    }else if(mode==="hunt" || mode==="enrage"){
      spiderBehaviorState="chase";
      spiderRevealLight.visible=spiderVisibleToPlayer;
      spiderRevealLight.intensity=4.2;
      setSpiderAnimation("chase");
    }else if(mode==="hidden"){
      spiderBehaviorState="idle";
      spiderMixer?.stopAllAction();
      spiderAnimationState="";
      spiderWantedState="idle";
    }
  }
});
normalSpiderHunter.visualRig.root.visible=false;

const tutorialSpiderEntity=new THREE.Group();
tutorialSpiderEntity.name="TutorialSignalStalkerEntity";
tutorialSpiderEntity.visible=false;
const tutorialSpiderRevealLight=new THREE.PointLight(0xff160f,0,42,1.45);
tutorialSpiderRevealLight.position.set(0,1.3,0);
tutorialSpiderEntity.add(tutorialSpiderRevealLight);
scene.add(tutorialSpiderEntity);

const spiderHunter=new SpiderHunter({
  group:tutorialSpiderEntity,
  scene,
  world,
  player,
  getVisualHitboxDistance:(x,z)=>tutorialSpiderHitboxDistance(x,z),
  isBlocked:(x,z)=>{
    if(tutorialOpenRoomActive){
      for(const box of tutorialOpenRoomCollisionBoxes){
        const nx=Math.max(box.minX,Math.min(x,box.maxX));
        const nz=Math.max(box.minZ,Math.min(z,box.maxZ));
        const dx=x-nx;
        const dz=z-nz;
        if(dx*dx+dz*dz<=1.4*1.4) return true;
      }
      return false;
    }

    const walls=world.getNearbyWallBounds(x,z,0.9);
    for(const wall of walls){
      const nx=Math.max(wall.minX,Math.min(x,wall.maxX));
      const nz=Math.max(wall.minZ,Math.min(z,wall.maxZ));
      const dx=x-nx;
      const dz=z-nz;
      if(dx*dx+dz*dz<=0.68*0.68) return true;
    }
    return false;
  },
  getOccluders:()=>tutorialOpenRoomActive ? tutorialOpenRoomOccluders : world.root.children,
  onStateChange:(mode)=>{
    if(mode==="hunt" && !arachnophobiaMode){
      tutorialSpiderRevealLight.intensity=4.2;
    }
  }
});

// Keep the tutorial spider collision tight around its body. Its long legs
// stay visual-only, so they do not block the player from too far away.
player.extraCollisionTests.push((x,z)=>
  tutorialOpenRoomActive &&
  tutorialSpiderEntity.visible &&
  spiderHunter.intersectsHitbox(x,z,0.75)
);

let spiderLoaded=false;
let spiderLoadStarted=false;
let spiderStartupFailed=false;
let spiderRetryTimer=null;
let spiderModel=null;
let spiderModelHalfHeight=0;
let spiderMixer=null;
let spiderOverlapMixer=null;
const spiderActions=new Map();
const spiderOverlapActions=new Map();
const spiderAnimationClips=new Map();
let spiderAnimationState="";
let spiderWantedState="idle";
let spiderBehaviorState="idle";
let spiderBehaviorTime=0;
let spiderAttackPlayed=false;
let spiderActive=false;
let spiderSyncElapsed=0;
let spiderSyncAuthorityId=null;
let spiderSyncNeedsInitial=true;
let spiderSyncLastActive=false;
let remoteSpiderSnapshot=null;
let remoteSpiderSnapshotReceivedAt=0;
let remoteSpiderPositionInitialized=false;
let spiderSpawnPending=false;
let spiderJumpscareTimer=0;
let spiderCaughtFreezeTimer=0;
let spiderCaughtPlayerPosition=new THREE.Vector3();
let spiderJumpscareStartY=0;
let spiderJumpscareDirection=new THREE.Vector3();
let spiderJumpscareScale=1;
let spiderPounceStart=new THREE.Vector3();
let spiderPounceTarget=new THREE.Vector3();
let spiderAutoLookTimer=0;
let spiderAutoLookStarted=false;
let spiderChaseDuration=5;
let spiderOriginalModel=null;
let funnyDuckModel=null;
let tutorialSpiderActual=null;
let tutorialSpiderMixer=null;
let tutorialSpiderWalkAction=null;
let tutorialSpiderUsesDuck=false;
let spiderVisibleToPlayer=true;
let spiderRunbyStart=new THREE.Vector3();
let spiderRunbyTarget=new THREE.Vector3();
let spiderPath=[];
let spiderPathIndex=0;
let spiderPathRepathTimer=0;
let spiderPathTargetX=NaN;
let spiderPathTargetZ=NaN;
let spiderStuckTime=0;
let spiderLastMoveX=NaN;
let spiderLastMoveZ=NaN;
let spiderScareRevealTimer=0;

const SPIDER_RUNBY_SPEED=7.2;
const SPIDER_RUNBY_DURATION=3.2;
const SPIDER_POUNCE_DURATION=.58;
const SPIDER_POUNCE_HEIGHT=1.15;
const SPIDER_SPEED=2.65;
const SPIDER_ATTACK_RANGE=2.5;
const SPIDER_HITBOX_PADDING=0.85;
const SPIDER_CAUGHT_FREEZE_TIME=1.35;
const SPIDER_CHASE_MIN_TIME=5.0;
const SPIDER_CHASE_MAX_TIME=8.0;
const SPIDER_CHASE_SPEED=3.8;
const SPIDER_RUSH_SPEED=10.5;
const SPIDER_RUSH_DURATION=1.35;
const SPIDER_RADIUS=1.02;
const SPIDER_MIN_SPAWN_DISTANCE=13;
const SPIDER_MAX_SPAWN_DISTANCE=21;
const SPIDER_GROUND_OFFSET=.08;
const SPIDER_BASE_TARGET_SPAN=8.2;
const SPIDER_SCALE_MULTIPLIER=1.5;
const SPIDER_TARGET_SPAN=SPIDER_BASE_TARGET_SPAN*SPIDER_SCALE_MULTIPLIER;

const SPIDER_PATH_CELL_SIZE=LOW_END_PERFORMANCE?1.8:1.35;
const SPIDER_PATH_GRID_SIZE=LOW_END_PERFORMANCE?19:31;
const SPIDER_PATH_REPATH_TIME=LOW_END_PERFORMANCE?1.05:.55;
const SPIDER_PATH_WAYPOINT_REACH=LOW_END_PERFORMANCE?.9:.72;
const SPIDER_PATH_TARGET_SHIFT=LOW_END_PERFORMANCE?3.6:2.4;
const SPIDER_STALK_MIN_SPAWN_DISTANCE=18;
const SPIDER_STALK_MAX_SPAWN_DISTANCE=34;
const SPIDER_NORMAL_ENCOUNTER_MAX_TIME=72;

const SPIDER_ANIMATION_RANGES={
  idle1:[164,213],
  idle2:[214,249],
  walk:[3,44],
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
  runby:"walk",
  attack:"attack1",
  hit:"hit1",
  death:"die1"
};


function stopTutorialSpiderAnimation(){
  if(tutorialSpiderMixer){
    tutorialSpiderMixer.stopAllAction();
    if(tutorialSpiderActual){
      tutorialSpiderMixer.uncacheRoot(tutorialSpiderActual);
    }
  }
  tutorialSpiderMixer=null;
  tutorialSpiderWalkAction=null;
}

function startTutorialSpiderAnimation(){
  if(!tutorialSpiderActual || arachnophobiaMode || !spiderAnimationClips.size) return;

  const walkClip=
    spiderAnimationClips.get("walk") ||
    spiderAnimationClips.get("idle1") ||
    spiderAnimationClips.get("idle2");

  if(!walkClip) return;
  stopTutorialSpiderAnimation();
  tutorialSpiderMixer=new THREE.AnimationMixer(tutorialSpiderActual);
  tutorialSpiderWalkAction=tutorialSpiderMixer.clipAction(walkClip);
  tutorialSpiderWalkAction.reset();
  tutorialSpiderWalkAction.setLoop(THREE.LoopRepeat,Infinity);
  tutorialSpiderWalkAction.setEffectiveTimeScale(1.12);
  tutorialSpiderWalkAction.play();
}

const SPIDER_WALL_CLIP_LIMIT=48;
const SPIDER_WALL_CLIP_HEIGHT=WALL_H+1.25;
const spiderWallClipUniformSets=new Set();
let spiderWallClipRefreshElapsed=1;

function installSpiderWallClipMaterial(material){
  if(!material || material._deepseekerSpiderWallClipInstalled) return;
  material._deepseekerSpiderWallClipInstalled=true;
  const state={
    count:{value:0},
    bounds:Array.from({length:SPIDER_WALL_CLIP_LIMIT},()=>new THREE.Vector4())
  };
  spiderWallClipUniformSets.add(state);

  const previousOnBeforeCompile=material.onBeforeCompile;
  material.onBeforeCompile=function(shader,renderer){
    if(typeof previousOnBeforeCompile==="function") previousOnBeforeCompile.call(this,shader,renderer);
    const worldPositionMarker="#include <worldpos_vertex>";
    const opaqueFragmentMarker="#include <opaque_fragment>";
    if(!shader.vertexShader.includes(worldPositionMarker) || !shader.fragmentShader.includes(opaqueFragmentMarker)){
      console.warn("[DeepSeeker] Spider wall clipping skipped for an unsupported material shader.");
      return;
    }
    shader.uniforms.uDeepseekerSpiderWallCount=state.count;
    shader.uniforms.uDeepseekerSpiderWallBounds={value:state.bounds};
    shader.vertexShader=shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vDeepseekerSpiderWorldPosition;"
    );
    shader.vertexShader=shader.vertexShader.replace(
      worldPositionMarker,
      worldPositionMarker+"\nvDeepseekerSpiderWorldPosition = worldPosition.xyz;"
    );
    shader.fragmentShader=shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vDeepseekerSpiderWorldPosition;\n"+
      "uniform int uDeepseekerSpiderWallCount;\n"+
      "uniform vec4 uDeepseekerSpiderWallBounds["+SPIDER_WALL_CLIP_LIMIT+"];"
    );
    const clipFragment =
      "\nfor(int deepseekerWallIndex=0; deepseekerWallIndex<"+SPIDER_WALL_CLIP_LIMIT+"; deepseekerWallIndex++){\n"+
      "  if(deepseekerWallIndex>=uDeepseekerSpiderWallCount) break;\n"+
      "  vec4 deepseekerWall=uDeepseekerSpiderWallBounds[deepseekerWallIndex];\n"+
      "  bool deepseekerInsideWall =\n"+
      "    vDeepseekerSpiderWorldPosition.x>=deepseekerWall.x &&\n"+
      "    vDeepseekerSpiderWorldPosition.x<=deepseekerWall.y &&\n"+
      "    vDeepseekerSpiderWorldPosition.z>=deepseekerWall.z &&\n"+
      "    vDeepseekerSpiderWorldPosition.z<=deepseekerWall.w &&\n"+
      "    vDeepseekerSpiderWorldPosition.y>=-0.08 &&\n"+
      "    vDeepseekerSpiderWorldPosition.y<="+SPIDER_WALL_CLIP_HEIGHT.toFixed(3)+";\n"+
      "  if(deepseekerInsideWall) discard;\n"+
      "}\n";
    shader.fragmentShader=shader.fragmentShader.replace(opaqueFragmentMarker,clipFragment+opaqueFragmentMarker);
  };
  const previousProgramCacheKey=material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey=()=>previousProgramCacheKey()+"|deepseeker-spider-wall-clip-v1";
  material.needsUpdate=true;
}

function updateSpiderWallClipBounds(dt){
  spiderWallClipRefreshElapsed+=Math.max(0,Math.min(Number(dt)||0,.25));
  if(spiderWallClipRefreshElapsed<.12) return;
  spiderWallClipRefreshElapsed=0;
  let originX=0,originZ=0,wallBounds=[];
  if(!gameStarted || arachnophobiaMode){
    wallBounds=[];
  }else if(tutorialOpenRoomActive && tutorialSpiderActual?.visible){
    originX=tutorialSpiderEntity.position.x;
    originZ=tutorialSpiderEntity.position.z;
    wallBounds=tutorialOpenRoomCollisionBoxes;
  }else if(!houseMode && spiderActive && spiderModel){
    originX=spiderEntity.position.x;
    originZ=spiderEntity.position.z;
    wallBounds=world.getNearbyWallBounds(originX,originZ,SPIDER_TARGET_SPAN*.58+1);
  }
  const reach=SPIDER_TARGET_SPAN*.58+.5;
  const nearby=[...wallBounds].filter(wall=>{
    if(!wall || !Number.isFinite(wall.minX) || !Number.isFinite(wall.maxX) ||
       !Number.isFinite(wall.minZ) || !Number.isFinite(wall.maxZ)) return false;
    const nx=Math.max(wall.minX,Math.min(originX,wall.maxX));
    const nz=Math.max(wall.minZ,Math.min(originZ,wall.maxZ));
    const dx=originX-nx,dz=originZ-nz;
    return dx*dx+dz*dz<=reach*reach;
  });
  nearby.sort((a,b)=>{
    const ax=Math.max(a.minX,Math.min(originX,a.maxX));
    const az=Math.max(a.minZ,Math.min(originZ,a.maxZ));
    const bx=Math.max(b.minX,Math.min(originX,b.maxX));
    const bz=Math.max(b.minZ,Math.min(originZ,b.maxZ));
    return (originX-ax)**2+(originZ-az)**2-((originX-bx)**2+(originZ-bz)**2);
  });
  const count=Math.min(nearby.length,SPIDER_WALL_CLIP_LIMIT);
  for(const state of spiderWallClipUniformSets){
    state.count.value=count;
    for(let index=0;index<count;index++){
      const wall=nearby[index];
      state.bounds[index].set(wall.minX-.035,wall.maxX+.035,wall.minZ-.035,wall.maxZ+.035);
    }
  }
}

function applyTutorialSpiderMaterialPass(model,{darken=true}={}){
  const copiedMaterials=new Map();

  const darkenMaterial=(original,meshName)=>{
    if(!original) return original;
    if(copiedMaterials.has(original)) return copiedMaterials.get(original);

    // Preserve the downloaded model's maps while layering on a darker,
    // subtly glossy chitin finish. No gameplay materials are shared or mutated.
    const material=original.isMeshStandardMaterial
      ? new THREE.MeshPhysicalMaterial().copy(original)
      : original.clone();
    const label=(String(meshName||"")+" "+String(original.name||"")).toLowerCase();
    const eyeLike=/(eye|optic|pupil)/.test(label);
    const furLike=/(hair|fur|bristle|seta)/.test(label);

    if(darken && material.color){
      const tint=eyeLike
        ? new THREE.Color(0.42,0.16,0.17)
        : furLike
          ? new THREE.Color(0.36,0.27,0.24)
          : new THREE.Color(0.48,0.36,0.33);
      material.color.multiply(tint);
    }
    if(darken && typeof material.roughness==="number"){
      material.roughness=THREE.MathUtils.clamp(
        material.roughness*(eyeLike ? 0.7 : 0.82),
        eyeLike ? 0.16 : 0.30,
        0.78
      );
    }
    if(darken && typeof material.metalness==="number"){
      material.metalness=Math.min(material.metalness,0.045);
    }
    if(darken && "clearcoat" in material){
      material.clearcoat=Math.max(Number(material.clearcoat)||0,eyeLike ? 0.38 : 0.22);
      material.clearcoatRoughness=Math.min(
        Number.isFinite(material.clearcoatRoughness) ? material.clearcoatRoughness : 0.4,
        eyeLike ? 0.09 : 0.34
      );
    }
    if(darken && material.emissive) material.emissive.multiplyScalar(0.16);
    if(darken && typeof material.emissiveIntensity==="number"){
      material.emissiveIntensity=Math.min(material.emissiveIntensity,0.16);
    }
    material.needsUpdate=true;
    installSpiderWallClipMaterial(material);
    copiedMaterials.set(original,material);
    return material;
  };

  model.traverse(node=>{
    if(!node.isMesh || !node.material) return;
    node.material=Array.isArray(node.material)
      ? node.material.map(material=>darkenMaterial(material,node.name))
      : darkenMaterial(node.material,node.name);
    node.castShadow=true;
    node.receiveShadow=true;
  });
}

function syncTutorialSpiderFromGameplayModel(force=false){
  // Clone whichever visual the main spider currently uses, so the tutorial
  // respects the harmless duck toggle and never shares live bones/materials.
  const sourceEntity=arachnophobiaMode
    ? (funnyDuckModel || (funnyDuckModel=createFunnyDuckEntity()))
    : spiderOriginalModel;
  if(!sourceEntity) return false;

  if(
    tutorialSpiderActual &&
    !force &&
    tutorialSpiderUsesDuck===Boolean(arachnophobiaMode)
  ){
    const shouldShow=Boolean(houseTutorialSpiderPrepared && tutorialOpenRoomActive);
    tutorialSpiderActual.visible=shouldShow;
    spiderHunter.visualRig.root.visible=!shouldShow;
    return true;
  }

  stopTutorialSpiderAnimation();
  if(tutorialSpiderActual?.parent){
    tutorialSpiderEntity.remove(tutorialSpiderActual);
  }

  const sourceModel=arachnophobiaMode
    ? (
        sourceEntity.getObjectByName("SpiderSource") ||
        sourceEntity.children[0] ||
        sourceEntity
      )
    : (
        sourceEntity.getObjectByName("SpiderModelScaleRoot") ||
        sourceEntity.getObjectByName("SpiderSource") ||
        sourceEntity.children[0] ||
        sourceEntity
      );
  if(arachnophobiaMode){
    tutorialSpiderActual=SkeletonUtils.clone(sourceModel);
  }else{
    // Clone the scale wrapper too. It carries the tutorial-sized world scale
    // outside the animated SpiderSource root, exactly as normal gameplay does.
    tutorialSpiderActual=new THREE.Group();
    tutorialSpiderActual.add(SkeletonUtils.clone(sourceModel));
  }
  tutorialSpiderActual.name=arachnophobiaMode
    ? "TutorialHarmlessDuck"
    : "TutorialSpiderPsionic";
  tutorialSpiderActual.visible=false;
  tutorialSpiderActual.position.set(0,0,0);
  tutorialSpiderActual.rotation.set(0,0,0);
  // Keep the tutorial at its baseline size; regular Backrooms uses the
  // explicit 1.5x multiplier without allowing animation clips to shrink it.
  tutorialSpiderActual.scale.setScalar(
    arachnophobiaMode ? MENU_DUCK_SCALE : (SPIDER_BASE_TARGET_SPAN/SPIDER_TARGET_SPAN)
  );

  tutorialSpiderActual.updateMatrixWorld(true);
  if(!arachnophobiaMode){
    // The original gameplay wrapper supplies centering and floor placement.
    // Recreate those transforms locally on this independent tutorial clone.
    const bounds=new THREE.Box3().setFromObject(tutorialSpiderActual);
    if(Number.isFinite(bounds.min.y) && Number.isFinite(bounds.max.y)){
      const center=bounds.getCenter(new THREE.Vector3());
      tutorialSpiderActual.position.x-=center.x;
      tutorialSpiderActual.position.y-=bounds.min.y;
      tutorialSpiderActual.position.z-=center.z;
    }
    applyTutorialSpiderMaterialPass(tutorialSpiderActual,{darken:false});
  }

  tutorialSpiderActual.updateMatrixWorld(true);
  tutorialSpiderEntity.add(tutorialSpiderActual);
  tutorialSpiderUsesDuck=Boolean(arachnophobiaMode);

  const shouldShow=Boolean(houseTutorialSpiderPrepared && tutorialOpenRoomActive);
  tutorialSpiderActual.visible=shouldShow;
  spiderHunter.visualRig.root.visible=!shouldShow;

  if(shouldShow && houseTutorialSpiderState==="chase" && !arachnophobiaMode){
    startTutorialSpiderAnimation();
  }
  return true;
}

function tutorialSpiderHitboxDistance(worldX,worldZ){
  // The body is the collision target; long articulated legs are visual only.
  // This avoids the oversized empty area inside the model's bounding box.
  if(!tutorialSpiderActual || !tutorialSpiderActual.visible){
    return spiderHunter.visualRig.distanceToHitbox(worldX,worldZ);
  }

  const bodyRadius=1.1;
  const dx=worldX-tutorialSpiderEntity.position.x;
  const dz=worldZ-tutorialSpiderEntity.position.z;
  return Math.max(0,Math.hypot(dx,dz)-bodyRadius);
}

function fitSpiderModel(model){
  // Use the same neutral root orientation and origin as the tutorial clone.
  // The gameplay instance keeps its full-size scale, but not the source
  // wrapper's stray offset or rotation.
  model.position.set(0,0,0);
  model.rotation.set(0,0,0);
  model.updateMatrixWorld(true);

  const rawBox=new THREE.Box3().setFromObject(model);
  const rawSize=rawBox.getSize(new THREE.Vector3());
  const maxDimension=Math.max(rawSize.x,rawSize.y,rawSize.z);

  if(!Number.isFinite(maxDimension) || maxDimension<.0001){
    throw new Error("Spider model has invalid or empty bounds.");
  }

  // Normalize scale after matching the tutorial's root transform. Keep the
  // imported geometry, textures and skeleton intact.
  const scaleFactor=SPIDER_TARGET_SPAN/maxDimension;
  model.scale.multiplyScalar(scaleFactor);
  model.updateMatrixWorld(true);

  const scaledBox=new THREE.Box3().setFromObject(model);
  const scaledSize=scaledBox.getSize(new THREE.Vector3());
  spiderModelHalfHeight=Math.max(.001,scaledSize.y*.5);
}

function setSpiderAnimation(name){
  spiderWantedState=name;

  const requestedName=SPIDER_ANIMATION_ALIAS[name] || name;
  let actualName=requestedName;
  let action=spiderActions.get(actualName);

  // Some GLBs only contain one safe animation. Never invent a missing attack,
  // walk, or death clip and never let a bad state transition disturb the rig.
  if(!action){
    const fallbackNames=["walk","idle1","idle2"];
    actualName=fallbackNames.find(key=>spiderActions.has(key)) || "";
    action=actualName ? spiderActions.get(actualName) : null;
  }

  if(!action || !actualName || spiderAnimationState===actualName) return;

  const timeScale=name==="runby" ? 1.8 : name==="chase" ? 1.12 : 1;
  const transitionActions=(actions)=>{
    for(const [key,item] of actions){
      if(key===actualName){
        item.reset();
        item.setEffectiveTimeScale(timeScale);
        item.fadeIn(.06);
        item.play();
      }else{
        item.setEffectiveTimeScale(1);
        item.fadeOut(.06);
      }
    }
  };
  transitionActions(spiderActions);
  transitionActions(spiderOverlapActions);
  spiderAnimationState=actualName;
}

function groundSpiderEntity(){
  if(!spiderEntity.visible || !spiderModel) return;

  spiderModel.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(spiderModel);
  if(!Number.isFinite(box.min.y)) return;

  const correction=SPIDER_GROUND_OFFSET-box.min.y;
  if(Math.abs(correction)>.0005){
    spiderEntity.position.y+=correction;
  }
}

const BACKROOMS_MAP_MIN=MAP_MIN_CHUNK*CHUNK_SIZE;
const BACKROOMS_MAP_MAX=(MAP_MAX_CHUNK+1)*CHUNK_SIZE;

function isSpiderSpawnInsideMap(x,z,padding=SPIDER_RADIUS+.5){
  return Number.isFinite(x) && Number.isFinite(z) &&
    x>=BACKROOMS_MAP_MIN+padding &&
    x<=BACKROOMS_MAP_MAX-padding &&
    z>=BACKROOMS_MAP_MIN+padding &&
    z<=BACKROOMS_MAP_MAX-padding;
}

function isSpiderBlocked(x,z){
  const walls=world.getNearbyWallBounds(x,z,SPIDER_RADIUS+.22);
  for(const wall of walls){
    const nx=Math.max(wall.minX,Math.min(x,wall.maxX));
    const nz=Math.max(wall.minZ,Math.min(z,wall.maxZ));
    const dx=x-nx;
    const dz=z-nz;
    if(dx*dx+dz*dz<=SPIDER_RADIUS*SPIDER_RADIUS) return true;
  }
  return false;
}

function tryMoveSpiderGround(dx,dz){
  const x=spiderEntity.position.x;
  const z=spiderEntity.position.z;
  const nextX=x+dx;
  const nextZ=z+dz;

  if(!isSpiderBlocked(nextX,nextZ)){
    spiderEntity.position.x=nextX;
    spiderEntity.position.z=nextZ;
    return true;
  }

  // Slide along corners instead of freezing when the ideal path touches a wall.
  if(!isSpiderBlocked(nextX,z)){
    spiderEntity.position.x=nextX;
    return true;
  }

  if(!isSpiderBlocked(x,nextZ)){
    spiderEntity.position.z=nextZ;
    return true;
  }

  return false;
}

const spiderSightRaycaster=new THREE.Raycaster();
const spiderSightOrigin=new THREE.Vector3();
const spiderSightTarget=new THREE.Vector3();
const spiderSightDirection=new THREE.Vector3();

function playerHasLineOfSightToSpider(entity=spiderEntity){
  // Use the full 3D ray even when the spider is horizontally very close;
  // the old shortcut could hide it incorrectly during a close-up catch.
  spiderSightOrigin.copy(camera.position);
  spiderSightTarget.set(
    entity.position.x,
    entity.position.y+.8,
    entity.position.z
  );

  const direction=spiderSightTarget.clone().sub(spiderSightOrigin);
  const length=direction.length();
  if(length<.001) return true;

  direction.normalize();
  spiderSightRaycaster.set(spiderSightOrigin,direction);
  spiderSightRaycaster.far=Math.min(140,Math.max(0,length-.03));

  // Raycast against actual wall meshes, not the whole scene root. This makes
  // occlusion depend on Backrooms walls and tutorial room blockers explicitly.
  const occluders=tutorialOpenRoomActive
    ? tutorialOpenRoomOccluders
    : (world.wallOccluders?.length ? world.wallOccluders : world.root.children);
  const hits=spiderSightRaycaster.intersectObjects(occluders,true);
  return hits.length===0;
}

function isSpiderPointVisibleToPlayer(x,z){
  camera.getWorldPosition(spiderSightOrigin);
  camera.getWorldDirection(spiderSightDirection).normalize();
  spiderSightTarget.set(x,SPIDER_GROUND_OFFSET+1.0,z);
  const delta=spiderSightTarget.clone().sub(spiderSightOrigin);
  const distance=delta.length();
  if(distance<.1 || distance>SPIDER_STALK_MAX_SPAWN_DISTANCE+4)return false;
  const minDot=Math.cos(THREE.MathUtils.degToRad((camera.fov||70)*.5+8));
  const direction=delta.normalize();
  if(spiderSightDirection.dot(direction)<minDot)return false;
  spiderSightRaycaster.set(spiderSightOrigin,direction);
  spiderSightRaycaster.near=0;
  spiderSightRaycaster.far=Math.max(0,distance-.12);
  const occluders=world.wallOccluders?.length?world.wallOccluders:world.root.children;
  return spiderSightRaycaster.intersectObjects(occluders,true).length===0;
}

function isHouseTutorialSpiderBlocked(x,z){
  for(const box of tutorialOpenRoomCollisionBoxes){
    const nx=Math.max(box.minX,Math.min(x,box.maxX));
    const nz=Math.max(box.minZ,Math.min(z,box.maxZ));
    const dx=x-nx;
    const dz=z-nz;
    if(dx*dx+dz*dz<=SPIDER_RADIUS*SPIDER_RADIUS) return true;
  }
  return false;
}

function houseTutorialSpiderSegmentClear(ax,az,bx,bz){
  const distance=Math.hypot(bx-ax,bz-az);
  const samples=Math.max(8,Math.ceil(distance/.55));
  for(let i=1;i<samples;i++){
    const t=i/samples;
    const x=THREE.MathUtils.lerp(ax,bx,t);
    const z=THREE.MathUtils.lerp(az,bz,t);
    if(isHouseTutorialSpiderBlocked(x,z)) return false;
  }
  return true;
}

function houseTutorialSpiderCanBeSeen(){
  if(!houseTutorialSpiderPrepared) return false;
  return playerHasLineOfSightToSpider(tutorialSpiderEntity);
}

function hideHouseTutorialSpider(){
  houseTutorialSpiderState="hidden";
  houseTutorialSpiderTime=0;
  houseTutorialSpiderStuckTime=0;
  houseTutorialSpiderPrepared=false;
  if(tutorialSpiderActual) tutorialSpiderActual.visible=false;
  stopTutorialSpiderAnimation();
  spiderHunter.hide();
  tutorialSpiderRevealLight.visible=false;
}

function resetHouseTutorial(){
  houseTutorialStage=0;
  houseTutorialStartX=player.pos.x;
  houseTutorialStartZ=player.pos.z;
  hideHouseTutorialSpider();
  updateTutorialGuide();
}

function showHouseTutorialMessage(message,duration=1500){
  eventText.textContent=message;
  eventText.style.opacity="1";
  setTimeout(()=>{
    if(eventText.textContent===message){
      eventText.style.opacity="0";
    }
  },duration);
}

function prepareHouseTutorialSpider(){
  if(houseMode || !tutorialOpenRoomActive) return false;

  const forwardX=-Math.sin(player.yaw);
  const forwardZ=-Math.cos(player.yaw);
  const roomMin=6.0;
  const roomMax=58.0;
  const clampRoom=(value)=>THREE.MathUtils.clamp(value,roomMin,roomMax);
  const candidates=[];

  for(let i=0;i<14;i++){
    const angle=Math.atan2(forwardX,forwardZ)+(i-6.5)*.19;
    const distance=9.0+(i%4)*1.2;
    candidates.push({
      x:clampRoom(player.pos.x+Math.sin(angle)*distance),
      z:clampRoom(player.pos.z+Math.cos(angle)*distance)
    });
  }

  let chosen=null;
  for(const candidate of candidates){
    let blocked=false;
    for(const box of tutorialOpenRoomCollisionBoxes){
      const nx=Math.max(box.minX,Math.min(candidate.x,box.maxX));
      const nz=Math.max(box.minZ,Math.min(candidate.z,box.maxZ));
      const dx=candidate.x-nx;
      const dz=candidate.z-nz;
      if(dx*dx+dz*dz<=1.4*1.4){
        blocked=true;
        break;
      }
    }
    if(blocked) continue;
    chosen=candidate;
    break;
  }

  if(!chosen){
    chosen={
      x:clampRoom(player.pos.x+forwardX*18),
      z:clampRoom(player.pos.z+forwardZ*18)
    };
  }

  const position=new THREE.Vector3(
    chosen.x,
    0.02,
    chosen.z
  );
  const lookTarget=new THREE.Vector3(player.pos.x,0.02,player.pos.z);

  if(!spiderHunter.prepareTutorial(position,lookTarget)){
    return false;
  }
  syncTutorialSpiderFromGameplayModel();

  // Dedicated tutorial group prevents the old Backrooms mesh stacking here.
  spiderEntity.visible=false;
  spiderRevealLight.visible=false;
  tutorialSpiderEntity.visible=true;
  tutorialSpiderRevealLight.visible=true;
  tutorialSpiderRevealLight.intensity=1.1;
  houseTutorialSpiderPrepared=true;
  houseTutorialSpiderState="static";
  houseTutorialSpiderTime=0;
  houseTutorialSpiderStuckTime=0;
  if(tutorialSpiderActual){
    tutorialSpiderActual.visible=true;
    spiderHunter.visualRig.root.visible=false;
  }
  return true;
}

function updateTutorialGuide(){
  if(!tutorialGuide || !gameStarted || houseMode || houseTutorialStage<=0 || houseTutorialStage>=10){
    tutorialGuide.style.opacity="0";
    tutorialGuide.style.transform="translateX(-50%) translateY(10px)";
    return;
  }

  const lessons={
    1:["MOVE","W A S D","Walk around the room until the lesson completes."],
    2:["JUMP","SPACE","Jump once. You do not need to jump high."],
    3:["CROUCH","CTRL","Hold CTRL until you crouch."],
    4:["SPRINT","SHIFT","Hold SHIFT and sprint across the room."],
    5:["FLASHLIGHT","F","Your flashlight is off. Turn it on."],
    6:["PHONE","P","Open the DeepSeeker phone."],
    7:["MESSAGE","P","Read M's message, then close the phone."],
    8:["APPROACH","W A S D","Move toward the figure ahead. Do not freeze."],
    9:["RUN","SHIFT","Hold SHIFT and get away from it."]
  };
  const lesson=lessons[houseTutorialStage];
  if(!lesson){
    tutorialGuide.style.opacity="0";
    return;
  }

  tutorialGuideStep.textContent=String(houseTutorialStage).padStart(2,"0")+"/09";
  tutorialGuideAction.textContent=lesson[0]+" · "+lesson[1];
  tutorialGuideHint.textContent=lesson[2];
  speakTutorialMascot(houseTutorialStage);
  tutorialGuide.style.opacity="1";
  tutorialGuide.style.transform="translateX(-50%) translateY(0)";
}

function setHouseTutorialStage(stage){
  if(!gameStarted || houseMode) return;

  houseTutorialStage=stage;

  // Hard-reset the normal director for every tutorial stage. This covers stale
  // chases, pounces, pending asset loads, and timers from a previous run.
  if(stage>=1 && stage<=9){
    spiderActive=false;
    spiderSpawnPending=false;
    spiderJumpscareTimer=0;
    spiderJumpscareScale=1;
    spiderBehaviorState="idle";
    spiderBehaviorTime=0;
    spiderScareRevealTimer=0;
    spiderVisibleToPlayer=true;
    spiderStuckTime=0;
    clearSpiderPath();
    spiderEntity.visible=false;
    spiderRevealLight.visible=false;
    spiderEntity.rotation.x=0;
    spiderEntity.scale.setScalar(1);
    if(spiderModel) spiderModel.visible=true;
  }

  updateTutorialGuide();

  if(stage===1){
    houseTutorialStartX=player.pos.x;
    houseTutorialStartZ=player.pos.z;
    objective.textContent="MOVE AROUND THE ROOM · W A S D";
    showHouseTutorialMessage("W A S D · MOVE",1500);
  }else if(stage===2){
    objective.textContent="JUMP OVER THE FLOOR MARK · SPACE";
    showHouseTutorialMessage("SPACE · JUMP",1500);
  }else if(stage===3){
    objective.textContent="CROUCH DOWN AND STAY LOW · CTRL";
    showHouseTutorialMessage("CTRL · CROUCH",1500);
  }else if(stage===4){
    houseTutorialStartX=player.pos.x;
    houseTutorialStartZ=player.pos.z;
    objective.textContent="SPRINT ACROSS THE ROOM · HOLD SHIFT";
    showHouseTutorialMessage("SHIFT · SPRINT",1500);
  }else if(stage===5){
    flashlightOn=false;
    player.setFlashlightVisual(false);
    flashlight.visible=false;
    flashlight.intensity=0;
    objective.textContent="TURN THE FLASHLIGHT ON · F";
    showHouseTutorialMessage("F · FLASHLIGHT",1500);
  }else if(stage===6){
    objective.textContent="OPEN THE DEEPSEEKER PHONE · P";
    showHouseTutorialMessage("P · OPEN PHONE",1500);
    eventText.textContent="BADGE AI ONLINE";
    eventText.style.opacity="1";
  }else if(stage===7){
    objective.textContent="READ M'S MESSAGE, THEN CLOSE THE PHONE · P";
    showHouseTutorialMessage("CHECK THE DEEPSEEKER.",1700);
  }else if(stage===8){
    objective.textContent="MOVE TOWARD THE FIGURE AT THE END OF THE ROOM.";
    if(!houseTutorialSpiderPrepared){
      prepareHouseTutorialSpider();
    }
    showHouseTutorialMessage(
      arachnophobiaMode ? "THERE IS A DUCK AHEAD." : "SOMETHING IS WAITING AHEAD.",
      1900
    );
  }else if(stage===9){
    objective.textContent="RUN. HOLD SHIFT AND GET AWAY FROM IT.";
    showHouseTutorialMessage(
      arachnophobiaMode ? "THE DUCK IS CHASING YOU." : "IT MOVED. RUN.",
      1600
    );
  }else if(stage===10){
    objective.textContent="TUTORIAL COMPLETE · FOLLOW THE SIGNAL DEEPER.";
    showHouseTutorialMessage(
      arachnophobiaMode ? "YOU LOST THE DUCK." : "IT STOPPED.",
      1600
    );
    updateTutorialGuide();
    disableTutorialOpenRoom();

    // Resume normal encounters only after a fresh post-tutorial delay.
    spiderSpawnPending=false;
    eventCooldown=0;
    nextEvent=clock.elapsedTime+24+Math.random()*24;
  }
}

function startHouseTutorialSpiderChase(){
  if(houseTutorialSpiderState!=="static") return;

  setHouseTutorialStage(9);
  houseTutorialSpiderState="chase";
  houseTutorialSpiderTime=0;
  houseTutorialSpiderStuckTime=0;
  spiderHunter.beginChase();
  if(tutorialSpiderActual){
    tutorialSpiderActual.visible=true;
    spiderHunter.visualRig.root.visible=false;
    startTutorialSpiderAnimation();
  }
  spiderEntity.visible=false;
  spiderRevealLight.visible=false;
  tutorialSpiderEntity.visible=true;
  tutorialSpiderRevealLight.visible=true;
  tutorialSpiderRevealLight.intensity=4.2;
  pulse=.8;

  if(arachnophobiaMode){
    audio.quack();
  }else{
    audio.scare();
  }
}

function finishHouseTutorialSpiderChase(){
  hideHouseTutorialSpider();

  if(!houseMode && houseTutorialStage===9){
    setHouseTutorialStage(10);
  }
}

function updateHouseTutorialSpider(dt){
  if(
    houseMode ||
    !gameStarted ||
    !tutorialOpenRoomActive
  ){
    if(houseTutorialSpiderState!=="hidden"){
      hideHouseTutorialSpider();
    }
    return;
  }

  if(houseTutorialStage===1){
    const movedDistance=Math.hypot(
      player.pos.x-houseTutorialStartX,
      player.pos.z-houseTutorialStartZ
    );
    if(movedDistance>=4.0) setHouseTutorialStage(2);
    return;
  }

  if(houseTutorialStage===2){
    if(player.jumpY>.25 || player.jumpVelocity>1.2) setHouseTutorialStage(3);
    return;
  }

  if(houseTutorialStage===3){
    if(player.crouched) setHouseTutorialStage(4);
    return;
  }

  if(houseTutorialStage===4){
    const sprintDistance=Math.hypot(
      player.pos.x-houseTutorialStartX,
      player.pos.z-houseTutorialStartZ
    );
    const sprinting=player.isRunning && Math.hypot(player.vel.x,player.vel.z)>2.0;
    if(sprinting && sprintDistance>=4.0) setHouseTutorialStage(5);
    return;
  }

  if(houseTutorialStage<8) return;

  if(!houseTutorialSpiderPrepared && !prepareHouseTutorialSpider()){
    return;
  }

  houseTutorialSpiderTime+=dt;
  const result=spiderHunter.updateTutorial(dt,player);

  if(houseTutorialStage===8 && result.triggered){
    startHouseTutorialSpiderChase();
    return;
  }

  if(houseTutorialStage===9 && result.finished){
    finishHouseTutorialSpiderChase();
    return;
  }

  spiderEntity.visible=false;
  spiderRevealLight.visible=false;
  tutorialSpiderEntity.visible=true;
  tutorialSpiderRevealLight.visible=houseTutorialSpiderState==="chase";
  tutorialSpiderRevealLight.intensity=houseTutorialSpiderState==="chase" ? 4.2 : 1.1;
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

  // Player forward is (-sin(yaw), -cos(yaw)), so the target angles must
  // use the opposite signs of the raw world-space delta.
  const targetYaw=Math.atan2(-dx,-dz);
  let yawDelta=targetYaw-player.yaw;
  while(yawDelta>Math.PI) yawDelta-=Math.PI*2;
  while(yawDelta<-Math.PI) yawDelta+=Math.PI*2;

  const targetPitch=Math.atan2(dy,horizontal);
  const pitchDelta=targetPitch-player.pitch;
  const turnSpeed=7.5;

  player.yaw+=yawDelta*Math.min(1,dt*turnSpeed);
  player.pitch+=pitchDelta*Math.min(1,dt*turnSpeed);
  player.pitch=Math.max(-Math.PI/2+.02,Math.min(Math.PI/2-.02,player.pitch));
}

function findSpiderSpawnPosition(minDistance=SPIDER_MIN_SPAWN_DISTANCE,maxDistance=SPIDER_MAX_SPAWN_DISTANCE){
  const hidden=[];
  const visible=[];

  for(let i=0;i<40;i++){
    const angle=Math.random()*Math.PI*2;
    const distance=THREE.MathUtils.lerp(
      minDistance,
      maxDistance,
      Math.random()
    );
    const x=player.pos.x+Math.cos(angle)*distance;
    const z=player.pos.z+Math.sin(angle)*distance;

    if(!isSpiderSpawnInsideMap(x,z)) continue;
    if(isSpiderBlocked(x,z)) continue;

    const hiddenFromPlayer=!spiderPathSegmentClear(
      player.pos.x,
      player.pos.z,
      x,
      z
    );

    (hiddenFromPlayer ? hidden : visible).push({x,z});
  }

  if(hidden.length){
    return hidden[Math.floor(Math.random()*hidden.length)];
  }

  if(visible.length){
    return visible[Math.floor(Math.random()*visible.length)];
  }

  // Do not fall back to an arbitrary position that could sit outside the
  // finite map boundary. If all candidates are blocked, skip this encounter.
  return null;
}

function clearSpiderPath(){
  spiderPath.length=0;
  spiderPathIndex=0;
  spiderPathRepathTimer=0;
  spiderPathTargetX=NaN;
  spiderPathTargetZ=NaN;
}

function findSpiderStalkSpawnPosition(
  minDistance=SPIDER_STALK_MIN_SPAWN_DISTANCE,
  maxDistance=SPIDER_STALK_MAX_SPAWN_DISTANCE
){
  for(let attempt=0;attempt<72;attempt++){
    const angle=Math.random()*Math.PI*2;
    const distance=Math.sqrt(minDistance*minDistance+
      Math.random()*(maxDistance*maxDistance-minDistance*minDistance));
    const x=player.pos.x+Math.cos(angle)*distance;
    const z=player.pos.z+Math.sin(angle)*distance;
    if(!isSpiderSpawnInsideMap(x,z)||isSpiderBlocked(x,z)||isSpiderPointVisibleToPlayer(x,z))continue;
    return {x,z};
  }
  return null;
}

function startBackroomsStalker(){
  if(!gameStarted||houseMode||tutorialOpenRoomActive||
     !multiplayer.isWorldAuthority()||spiderActive)return false;
  if(!spiderLoaded){ensureSpiderLoading();return false;}
  const spawn=findSpiderStalkSpawnPosition();
  if(!spawn)return false;

  spiderActive=true;
  spiderBehaviorTime=0;
  spiderStuckTime=0;
  spiderJumpscareTimer=0;
  spiderCaughtFreezeTimer=0;
  spiderVisibleToPlayer=false;
  spiderEntity.scale.setScalar(1);
  spiderEntity.position.y=SPIDER_GROUND_OFFSET;
  spiderEntity.rotation.x=0;
  spiderEntity.rotation.z=0;
  spiderRevealLight.visible=false;
  spiderRevealLight.intensity=0;
  clearSpiderPath();
  if(!normalSpiderHunter.startRoaming(new THREE.Vector3(spawn.x,SPIDER_GROUND_OFFSET,spawn.z))){
    spiderActive=false;spiderEntity.visible=false;return false;
  }
  spiderEntity.visible=true;
  if(spiderModel)spiderModel.visible=false;
  spiderBehaviorState="peek";
  spiderVisibleToPlayer=false;
  setSpiderAnimation("stalk");
  return true;
}

function findSpiderVisibleSpawnPosition(minDistance=7,maxDistance=11){
  const forwardAngle=player.yaw;
  const candidates=[];

  for(let i=0;i<28;i++){
    const angle=forwardAngle+THREE.MathUtils.lerp(-.72,.72,Math.random());
    const distance=THREE.MathUtils.lerp(minDistance,maxDistance,Math.random());
    const x=player.pos.x-Math.sin(angle)*distance;
    const z=player.pos.z-Math.cos(angle)*distance;

    if(!isSpiderSpawnInsideMap(x,z)) continue;
    if(isSpiderBlocked(x,z)) continue;
    if(!spiderPathSegmentClear(player.pos.x,player.pos.z,x,z)) continue;

    candidates.push({x,z});
  }

  if(candidates.length){
    return candidates[Math.floor(Math.random()*candidates.length)];
  }

  return null;
}

function showSpiderScareMessage(message,duration=900){
  eventText.textContent=message;
  eventText.style.opacity="1";
  setTimeout(()=>{
    if(eventText.textContent===message){
      eventText.style.opacity="0";
    }
  },duration);
}

function startTutorialStyleBackroomsSpider(minDistance=9,maxDistance=15){
  if(!multiplayer.isWorldAuthority() || tutorialOpenRoomActive || houseMode) return false;

  const spawn=
    findSpiderVisibleSpawnPosition(minDistance,maxDistance) ||
    findSpiderSpawnPosition(minDistance,maxDistance);
  if(!spawn) return false;

  const position=new THREE.Vector3(spawn.x,SPIDER_GROUND_OFFSET,spawn.z);
  const lookTarget=new THREE.Vector3(player.pos.x,SPIDER_GROUND_OFFSET,player.pos.z);

  spiderActive=true;
  spiderBehaviorState="peek";
  spiderBehaviorTime=0;
  spiderScareRevealTimer=0;
  spiderStuckTime=0;
  spiderJumpscareTimer=0;
  spiderCaughtFreezeTimer=0;
  spiderVisibleToPlayer=true;
  clearSpiderPath();

  // Reuse the tutorial rig/controller, but don't use its wait-for-player
  // tutorial state in normal gameplay: the normal encounter moves immediately.
  if(!normalSpiderHunter.prepareTutorial(position,lookTarget)){
    spiderActive=false;
    spiderEntity.visible=false;
    return false;
  }
  spiderEntity.position.y=SPIDER_GROUND_OFFSET;
  normalSpiderHunter.lastKnownTarget.set(player.pos.x,0,player.pos.z);
  normalSpiderHunter.lastSeenTime=clock.elapsedTime;
  normalSpiderHunter.beginChase();

  normalSpiderHunter.visualRig.root.visible=false;
  spiderEntity.visible=true;
  spiderEntity.scale.setScalar(1);
  if(spiderModel) spiderModel.visible=true;
  spiderRevealLight.visible=false;
  spiderRevealLight.intensity=0;
  // Normal Backrooms bypasses the tutorial's frozen waiting stage and starts hunting immediately.
  pulse=Math.max(pulse,.22);
  return true;
}

function startSpiderPeek(){
  return startTutorialStyleBackroomsSpider(11,18);
}

function startSpiderRush(){
  return startTutorialStyleBackroomsSpider(9,14);
}

function startSpiderChase(){
  return startTutorialStyleBackroomsSpider(9,15);
}

function spiderPathSegmentClear(ax,az,bx,bz){
  const dx=bx-ax;
  const dz=bz-az;
  const distance=Math.hypot(dx,dz);
  const samples=Math.max(2,Math.ceil(distance/(SPIDER_PATH_CELL_SIZE*.45)));

  for(let i=1;i<samples;i++){
    const t=i/samples;
    if(isSpiderBlocked(ax+dx*t,az+dz*t)) return false;
  }
  return true;
}

function buildSpiderPath(){
  const startX=spiderEntity.position.x;
  const startZ=spiderEntity.position.z;
  const goalX=player.pos.x;
  const goalZ=player.pos.z;
  const size=SPIDER_PATH_GRID_SIZE;
  const cellSize=SPIDER_PATH_CELL_SIZE;
  const halfSpan=size*cellSize*.5;
  const minX=(startX+goalX)*.5-halfSpan;
  const minZ=(startZ+goalZ)*.5-halfSpan;
  const total=size*size;
  const indexOf=(col,row)=>row*size+col;

  const toCell=(x,z)=>({
    col:Math.max(0,Math.min(size-1,Math.floor((x-minX)/cellSize))),
    row:Math.max(0,Math.min(size-1,Math.floor((z-minZ)/cellSize)))
  });

  const walkable=new Uint8Array(total);
  for(let row=0;row<size;row++){
    for(let col=0;col<size;col++){
      const x=minX+(col+.5)*cellSize;
      const z=minZ+(row+.5)*cellSize;
      walkable[indexOf(col,row)]=isSpiderBlocked(x,z)?0:1;
    }
  }

  const findOpenCell=(cell)=>{
    if(walkable[indexOf(cell.col,cell.row)]) return cell;
    for(let radius=1;radius<=5;radius++){
      for(let row=cell.row-radius;row<=cell.row+radius;row++){
        for(let col=cell.col-radius;col<=cell.col+radius;col++){
          if(col<0||row<0||col>=size||row>=size) continue;
          if(Math.max(Math.abs(col-cell.col),Math.abs(row-cell.row))!==radius) continue;
          if(walkable[indexOf(col,row)]) return {col,row};
        }
      }
    }
    return null;
  };

  const actualStart=findOpenCell(toCell(startX,startZ));
  const actualGoal=findOpenCell(toCell(goalX,goalZ));
  if(!actualStart || !actualGoal){
    clearSpiderPath();
    return false;
  }

  const startIndex=indexOf(actualStart.col,actualStart.row);
  const goalIndex=indexOf(actualGoal.col,actualGoal.row);
  const cameFrom=new Int32Array(total);
  cameFrom.fill(-1);
  const gScore=new Float32Array(total);
  const fScore=new Float32Array(total);
  gScore.fill(Infinity);
  fScore.fill(Infinity);

  const heuristic=(index)=>{
    const row=Math.floor(index/size);
    const col=index-row*size;
    return Math.hypot(actualGoal.col-col,actualGoal.row-row);
  };

  const open=[startIndex];
  const closed=new Uint8Array(total);
  gScore[startIndex]=0;
  fScore[startIndex]=heuristic(startIndex);

  const dirs=[
    [-1,-1,1.41421356],[-1,0,1],[-1,1,1.41421356],
    [0,-1,1],[0,1,1],
    [1,-1,1.41421356],[1,0,1],[1,1,1.41421356]
  ];

  while(open.length){
    let bestPos=0;
    let current=open[0];
    for(let i=1;i<open.length;i++){
      if(fScore[open[i]]<fScore[current]){
        current=open[i];
        bestPos=i;
      }
    }
    open.splice(bestPos,1);

    if(current===goalIndex) break;
    if(closed[current]) continue;
    closed[current]=1;

    const row=Math.floor(current/size);
    const col=current-row*size;

    for(const [dc,dr,cost] of dirs){
      const nc=col+dc;
      const nr=row+dr;
      if(nc<0||nr<0||nc>=size||nr>=size) continue;

      const next=indexOf(nc,nr);
      if(closed[next] || !walkable[next]) continue;

      if(dc!==0&&dr!==0){
        if(
          !walkable[indexOf(col+dc,row)] ||
          !walkable[indexOf(col,row+dr)]
        ) continue;
      }

      const tentative=gScore[current]+cost;
      if(tentative>=gScore[next]) continue;

      cameFrom[next]=current;
      gScore[next]=tentative;
      fScore[next]=tentative+heuristic(next);
      if(!open.includes(next)) open.push(next);
    }
  }

  if(startIndex!==goalIndex && cameFrom[goalIndex]===-1){
    clearSpiderPath();
    return false;
  }

  const cells=[];
  let cursor=goalIndex;
  cells.push(cursor);
  while(cursor!==startIndex){
    cursor=cameFrom[cursor];
    if(cursor<0){
      clearSpiderPath();
      return false;
    }
    cells.push(cursor);
  }
  cells.reverse();

  const raw=[];
  for(let i=1;i<cells.length;i++){
    const row=Math.floor(cells[i]/size);
    const col=cells[i]-row*size;
    raw.push(new THREE.Vector3(
      minX+(col+.5)*cellSize,
      spiderEntity.position.y,
      minZ+(row+.5)*cellSize
    ));
  }

  if(!raw.length){
    raw.push(new THREE.Vector3(goalX,spiderEntity.position.y,goalZ));
  }

  const smooth=[];
  let anchorX=startX;
  let anchorZ=startZ;

  for(let i=0;i<raw.length;){
    let farthest=i;
    for(let j=raw.length-1;j>i;j--){
      if(spiderPathSegmentClear(anchorX,anchorZ,raw[j].x,raw[j].z)){
        farthest=j;
        break;
      }
    }

    smooth.push(raw[farthest].clone());
    anchorX=raw[farthest].x;
    anchorZ=raw[farthest].z;
    i=farthest+1;
  }

  const last=smooth[smooth.length-1];
  if(last && spiderPathSegmentClear(last.x,last.z,goalX,goalZ)){
    last.x=goalX;
    last.z=goalZ;
  }else if(!last || Math.hypot(last.x-goalX,last.z-goalZ)>.8){
    smooth.push(new THREE.Vector3(
      goalX,
      spiderEntity.position.y,
      goalZ
    ));
  }

  spiderPath=smooth;
  spiderPathIndex=0;
  spiderPathRepathTimer=SPIDER_PATH_REPATH_TIME;
  spiderPathTargetX=goalX;
  spiderPathTargetZ=goalZ;
  return true;
}

function moveSpiderTowardPlayer(dt){
  const dx=player.pos.x-spiderEntity.position.x;
  const dz=player.pos.z-spiderEntity.position.z;
  const distance=Math.hypot(dx,dz);

  if(distance<=SPIDER_ATTACK_RANGE || normalSpiderHitboxTouchesPlayer()){
    return distance;
  }

  spiderPathRepathTimer=Math.max(0,spiderPathRepathTimer-dt);

  const targetShift=Number.isFinite(spiderPathTargetX)
    ? Math.hypot(player.pos.x-spiderPathTargetX,player.pos.z-spiderPathTargetZ)
    : Infinity;

  if(
    !spiderPath.length ||
    spiderPathRepathTimer<=0 ||
    targetShift>SPIDER_PATH_TARGET_SHIFT ||
    spiderPathIndex>=spiderPath.length
  ){
    buildSpiderPath();
  }

  let waypoint=spiderPath[spiderPathIndex];
  if(!waypoint){
    const inv=1/Math.max(distance,.001);
    waypoint=new THREE.Vector3(
      spiderEntity.position.x+dx*inv,
      spiderEntity.position.y,
      spiderEntity.position.z+dz*inv
    );
  }

  let waypointDx=waypoint.x-spiderEntity.position.x;
  let waypointDz=waypoint.z-spiderEntity.position.z;
  let waypointDistance=Math.hypot(waypointDx,waypointDz);

  if(waypointDistance<SPIDER_PATH_WAYPOINT_REACH){
    spiderPathIndex++;
    waypoint=spiderPath[spiderPathIndex]||new THREE.Vector3(
      player.pos.x,
      spiderEntity.position.y,
      player.pos.z
    );
    waypointDx=waypoint.x-spiderEntity.position.x;
    waypointDz=waypoint.z-spiderEntity.position.z;
    waypointDistance=Math.hypot(waypointDx,waypointDz);
  }

  if(waypointDistance>.001){
    const inv=1/waypointDistance;
    const step=Math.min(SPIDER_SPEED*dt,waypointDistance);
    if(!tryMoveSpiderGround(
      waypointDx*inv*step,
      waypointDz*inv*step
    )){
      spiderPathRepathTimer=0;
      buildSpiderPath();
    }

    spiderEntity.rotation.y=Math.atan2(
      waypoint.x-spiderEntity.position.x,
      waypoint.z-spiderEntity.position.z
    );
  }

  const movedDistance=Math.hypot(
    spiderEntity.position.x-(Number.isFinite(spiderLastMoveX) ? spiderLastMoveX : spiderEntity.position.x),
    spiderEntity.position.z-(Number.isFinite(spiderLastMoveZ) ? spiderLastMoveZ : spiderEntity.position.z)
  );

  if(movedDistance<.003){
    spiderStuckTime+=dt;
  }else{
    spiderStuckTime=0;
  }

  spiderLastMoveX=spiderEntity.position.x;
  spiderLastMoveZ=spiderEntity.position.z;

  if(spiderStuckTime>0.65){
    spiderStuckTime=0;
    spiderActive=false;
    spiderEntity.visible=false;
    spiderRevealLight.visible=false;
  }

  return distance;
}

function configureSpiderRunBy(){
  const travel=new THREE.Vector3();
  const normal=new THREE.Vector3();

  for(let attempt=0;attempt<28;attempt++){
    const angle=Math.random()*Math.PI*2;
    travel.set(Math.cos(angle),0,Math.sin(angle));
    normal.set(-travel.z,0,travel.x);

    const lateral=THREE.MathUtils.lerp(3.5,6.5,Math.random());
    const startDistance=THREE.MathUtils.lerp(16,21,Math.random());
    const endDistance=THREE.MathUtils.lerp(16,21,Math.random());

    spiderRunbyStart.set(
      player.pos.x-travel.x*startDistance+normal.x*lateral,
      SPIDER_GROUND_OFFSET,
      player.pos.z-travel.z*startDistance+normal.z*lateral
    );
    spiderRunbyTarget.set(
      player.pos.x+travel.x*endDistance+normal.x*lateral,
      SPIDER_GROUND_OFFSET,
      player.pos.z+travel.z*endDistance+normal.z*lateral
    );

    if(
      !isSpiderBlocked(spiderRunbyStart.x,spiderRunbyStart.z) &&
      !isSpiderBlocked(spiderRunbyTarget.x,spiderRunbyTarget.z) &&
      spiderPathSegmentClear(
        spiderRunbyStart.x,spiderRunbyStart.z,
        spiderRunbyTarget.x,spiderRunbyTarget.z
      )
    ) return true;
  }
  return false;
}

function startSpiderRunBy(){
  return startSpiderRush();
}

function startSpiderJumpscare(){
  spiderBehaviorState="jumpscare";
  spiderBehaviorTime=0;
  spiderJumpscareTimer=SPIDER_POUNCE_DURATION;

  spiderPounceStart.copy(spiderEntity.position);
  spiderPounceStart.y=SPIDER_GROUND_OFFSET;

  spiderJumpscareDirection.set(
    player.pos.x-spiderEntity.position.x,
    0,
    player.pos.z-spiderEntity.position.z
  );

  if(spiderJumpscareDirection.lengthSq()<.0001){
    spiderJumpscareDirection.set(
      -Math.sin(player.yaw),
      0,
      -Math.cos(player.yaw)
    );
  }else{
    spiderJumpscareDirection.normalize();
  }

  spiderPounceTarget.set(
    player.pos.x-spiderJumpscareDirection.x*.82,
    SPIDER_GROUND_OFFSET,
    player.pos.z-spiderJumpscareDirection.z*.82
  );

  const crossesWall=!spiderPathSegmentClear(
    spiderPounceStart.x,
    spiderPounceStart.z,
    spiderPounceTarget.x,
    spiderPounceTarget.z
  );

  if(isSpiderBlocked(spiderPounceTarget.x,spiderPounceTarget.z) || crossesWall){
    let safe=null;
    const baseAngle=Math.random()*Math.PI*2;

    for(let i=0;i<24;i++){
      const angle=baseAngle+(i/24)*Math.PI*2;
      const distance=THREE.MathUtils.lerp(1.15,2.0,(i%6)/5);
      const x=player.pos.x+Math.cos(angle)*distance;
      const z=player.pos.z+Math.sin(angle)*distance;

      if(
        !isSpiderBlocked(x,z) &&
        spiderPathSegmentClear(
          spiderPounceStart.x,
          spiderPounceStart.z,
          x,
          z
        )
      ){
        safe={x,z};
        break;
      }
    }

    if(safe){
      spiderPounceTarget.set(
        safe.x,
        SPIDER_GROUND_OFFSET,
        safe.z
      );
    }else{
      spiderPounceTarget.copy(spiderPounceStart);
      spiderPounceTarget.y=SPIDER_GROUND_OFFSET;
    }
  }

  spiderJumpscareScale=1;
  spiderEntity.scale.setScalar(1);
  spiderEntity.rotation.x=0;
  spiderEntity.rotation.y=Math.atan2(
    player.pos.x-spiderEntity.position.x,
    player.pos.z-spiderEntity.position.z
  );
  spiderEntity.visible=true;

  setSpiderAnimation("jump");
  pulse=.35;
  if(arachnophobiaMode) audio.quack();
  eventText.textContent=arachnophobiaMode ? "QUACK." : "RUN.";
  eventText.style.opacity="1";
}

function normalSpiderHitboxDistanceTo(worldX,worldZ){
  if(!spiderModel){
    return Math.max(
      0,
      Math.hypot(worldX-spiderEntity.position.x,worldZ-spiderEntity.position.z)-
        SPIDER_TARGET_SPAN*.3
    );
  }

  spiderEntity.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(spiderModel);
  if(
    !Number.isFinite(bounds.min.x) ||
    !Number.isFinite(bounds.max.x) ||
    !Number.isFinite(bounds.min.z) ||
    !Number.isFinite(bounds.max.z)
  ){
    return Math.max(
      0,
      Math.hypot(worldX-spiderEntity.position.x,worldZ-spiderEntity.position.z)-
        SPIDER_TARGET_SPAN*.3
    );
  }

  const closestX=THREE.MathUtils.clamp(worldX,bounds.min.x,bounds.max.x);
  const closestZ=THREE.MathUtils.clamp(worldZ,bounds.min.z,bounds.max.z);
  return Math.hypot(worldX-closestX,worldZ-closestZ);
}

function normalSpiderHitboxTouchesPlayer(){
  return normalSpiderHitboxDistanceTo(player.pos.x,player.pos.z)<=SPIDER_HITBOX_PADDING;
}

function startSpiderCatchFreeze(){
  spiderCaughtFreezeTimer=SPIDER_CAUGHT_FREEZE_TIME;
  spiderCaughtPlayerPosition.copy(player.pos);
  player.movementFrozen=true;
  player.keys.clear();
  player.vel.set(0,0,0);
  player.jumpY=0;
  player.jumpVelocity=0;
  spiderJumpscareTimer=0;
  spiderBehaviorState="caught";
  spiderBehaviorTime=0;
  spiderEntity.position.y=SPIDER_GROUND_OFFSET;
  spiderEntity.rotation.x=0;
  spiderEntity.rotation.y=Math.atan2(
    player.pos.x-spiderEntity.position.x,
    player.pos.z-spiderEntity.position.z
  );
  setSpiderAnimation("attack");
  pulse=1;
  eventText.textContent=arachnophobiaMode ? "CAUGHT. QUACK." : "IT GOT YOU.";
  eventText.style.opacity="1";
}

function resetPlayerAfterSpiderCatch(){
  player.movementFrozen=false;
  spiderCaughtFreezeTimer=0;
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
  spiderBehaviorTime=0;
  spiderStuckTime=0;
  spiderLastMoveX=NaN;
  spiderLastMoveZ=NaN;
  spiderAutoLookTimer=0;
  spiderAutoLookStarted=true;
  spiderEntity.scale.setScalar(1);
  spiderEntity.position.y=SPIDER_GROUND_OFFSET;
  spiderEntity.rotation.x=0;
  normalSpiderHunter.hide();
  spiderActive=false;
  spiderEntity.visible=false;
  spiderRevealLight.visible=false;
  spiderBehaviorState="idle";
  nextEvent=clock.elapsedTime+14+Math.random()*18;
  pulse=1;
  eventText.style.opacity="1";
}

function finishSpiderJumpscare(){
  spiderJumpscareTimer=0;
  spiderJumpscareScale=1;
  spiderBehaviorState="chase";
  spiderBehaviorTime=0;
  spiderStuckTime=0;
  clearSpiderPath();
  spiderChaseDuration=THREE.MathUtils.lerp(
    SPIDER_CHASE_MIN_TIME,
    SPIDER_CHASE_MAX_TIME,
    Math.random()
  );
  spiderEntity.position.y=SPIDER_GROUND_OFFSET;
  spiderEntity.scale.setScalar(1);
  spiderEntity.rotation.x=0;
  spiderEntity.rotation.y=Math.atan2(
    player.pos.x-spiderEntity.position.x,
    player.pos.z-spiderEntity.position.z
  );
  setSpiderAnimation("chase");
}

function spawnSpiderAtPlayer(){
  // The scripted tutorial owns the shared spider entity. Never allow a normal
  // spawn path to start or queue an encounter inside the tutorial room.
  if(!gameStarted || houseMode || tutorialOpenRoomActive) return false;
  if(spiderActive) return true;

  if(!spiderLoaded){
    spiderSpawnPending=true;
    ensureSpiderLoading();
    return false;
  }

  spiderAutoLookTimer=0;
  spiderAutoLookStarted=false;
  spiderAttackPlayed=false;
  spiderActive=true;
  spiderStuckTime=0;

  if(!startSpiderRunBy()){
    spiderActive=false;
    return false;
  }

  if(arachnophobiaMode) audio.quack();
  eventText.textContent=arachnophobiaMode ? "QUACK." : "SOMETHING RAN PAST.";
  eventText.style.opacity="1";
  setTimeout(()=>{
    if(eventText.textContent==="SOMETHING RAN PAST."||eventText.textContent==="QUACK."){
      eventText.style.opacity="0";
    }
  },1200);
  return true;
}

async function extractSpiderPack(zipUrl){
  const response=await fetch(zipUrl,{cache:"no-store"});
  if(!response.ok){
    throw new Error(`Spider pack request failed: ${response.status} ${response.statusText}`);
  }

  const buffer=await response.arrayBuffer();
  const view=new DataView(buffer);
  const minOffset=Math.max(0,buffer.byteLength-65558);
  let eocdOffset=-1;

  for(let offset=buffer.byteLength-22;offset>=minOffset;offset--){
    if(view.getUint32(offset,true)===0x06054b50){
      eocdOffset=offset;
      break;
    }
  }

  if(eocdOffset<0){
    throw new Error("Spider ZIP has no end-of-central-directory record.");
  }

  const entryCount=view.getUint16(eocdOffset+10,true);
  const centralSize=view.getUint32(eocdOffset+12,true);
  const centralOffset=view.getUint32(eocdOffset+16,true);
  const decoder=new TextDecoder();
  const entries=[];
  let offset=centralOffset;

  for(let i=0;i<entryCount;i++){
    if(offset>=centralOffset+centralSize || view.getUint32(offset,true)!==0x02014b50){
      throw new Error("Spider ZIP central directory is invalid.");
    }

    const compression=view.getUint16(offset+10,true);
    const compressedSize=view.getUint32(offset+20,true);
    const fileNameLength=view.getUint16(offset+28,true);
    const extraLength=view.getUint16(offset+30,true);
    const commentLength=view.getUint16(offset+32,true);
    const localHeaderOffset=view.getUint32(offset+42,true);
    const fileName=decoder.decode(
      new Uint8Array(buffer,offset+46,fileNameLength)
    );

    entries.push({
      name:fileName,
      lower:fileName.toLowerCase(),
      compression,
      compressedSize,
      localHeaderOffset
    });

    offset+=46+fileNameLength+extraLength+commentLength;
  }

  const modelCandidates=entries
    .filter(entry=>
      entry.lower.endsWith(".fbx") ||
      entry.lower.endsWith(".obj") ||
      entry.lower.endsWith(".glb")
    )
    .sort((a,b)=>{
      const score=(entry)=>{
        const modelScore=
          entry.lower.endsWith(".fbx") ? 130 :
          entry.lower.endsWith(".obj") ? 120 :
          50;
        const spiderScore=entry.lower.includes("spider") ? 25 : 0;
        return modelScore+spiderScore;
      };
      return score(b)-score(a) || b.compressedSize-a.compressedSize;
    });

  const modelEntry=modelCandidates[0];
  if(!modelEntry){
    throw new Error("Spider pack contains neither an FBX nor a GLB model.");
  }

  const imageEntries=entries.filter(entry=>
    /.(png|jpe?g|webp|tga|bmp)$/i.test(entry.name)
  );

  const readEntry=async(entry)=>{
    if(view.getUint32(entry.localHeaderOffset,true)!==0x04034b50){
      throw new Error(`Spider ZIP local header is invalid: ${entry.name}`);
    }

    const localNameLength=view.getUint16(entry.localHeaderOffset+26,true);
    const localExtraLength=view.getUint16(entry.localHeaderOffset+28,true);
    const dataOffset=
      entry.localHeaderOffset+
      30+
      localNameLength+
      localExtraLength;

    const compressedData=new Uint8Array(
      buffer,
      dataOffset,
      entry.compressedSize
    );

    if(entry.compression===0){
      return new Uint8Array(compressedData);
    }

    if(entry.compression===8){
      if(typeof DecompressionStream!=="function"){
        throw new Error("This browser cannot decompress the Spider ZIP.");
      }

      const stream=new Blob([compressedData])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    throw new Error(
      `Unsupported Spider ZIP compression method ${entry.compression}: ${entry.name}`
    );
  };

  const mimeForName=(name)=>{
    const ext=name.toLowerCase().split(".").pop();
    return {
      fbx:"application/octet-stream",
      glb:"model/gltf-binary",
      png:"image/png",
      jpg:"image/jpeg",
      jpeg:"image/jpeg",
      webp:"image/webp",
      tga:"image/x-tga",
      bmp:"image/bmp"
    }[ext] || "application/octet-stream";
  };

  const normalizeName=(value)=>{
    let normalized=String(value||"").replace(/\\/g,"/").split("?")[0].split("#")[0];
    try{
      normalized=decodeURIComponent(normalized);
    }catch(_error){}
    return normalized.toLowerCase();
  };

  const basename=(value)=>{
    const normalized=normalizeName(value);
    return normalized.slice(normalized.lastIndexOf("/")+1);
  };

  // Keep every model format from the pack so the runtime can fall back
  // between OBJ, FBX, and GLB without re-fetching the ZIP.
  const selectedEntries=[...modelCandidates,...imageEntries];
  const resourceBlobs=new Map();

  for(const entry of selectedEntries){
    const bytes=await readEntry(entry);
    const blob=new Blob([bytes],{type:mimeForName(entry.name)});
    const fullName=normalizeName(entry.name);
    const shortName=basename(entry.name);
    resourceBlobs.set(fullName,blob);
    if(!resourceBlobs.has(shortName)){
      resourceBlobs.set(shortName,blob);
    }
  }

  const normalizedModelName=basename(modelEntry.name);
  const normalizedModelPath=normalizeName(modelEntry.name);
  const slashIndex=normalizedModelPath.lastIndexOf("/");
  const modelDirectory=slashIndex>=0
    ? normalizedModelPath.slice(0,slashIndex+1)
    : "";

  return {
    modelType:
      modelEntry.lower.endsWith(".obj") ? "obj" :
      modelEntry.lower.endsWith(".fbx") ? "fbx" :
      "glb",
    modelName:normalizedModelName,
    modelDirectory,
    modelBytes:await readEntry(modelEntry),
    sourceName:modelEntry.name,
    resourceBlobs
  };
}


function finishSpiderModel(model,animations,sourceName){
  model.name="SpiderSource";
  model.visible=true;

  let meshCount=0;
  model.traverse(obj=>{
    if(!obj.isMesh) return;
    meshCount++;
    obj.visible=true;
  });

  if(meshCount===0){
    throw new Error("Spider model contains no meshes.");
  }

  model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model);
  const size=bounds.getSize(new THREE.Vector3());

  if(
    !Number.isFinite(size.x) ||
    !Number.isFinite(size.y) ||
    !Number.isFinite(size.z) ||
    Math.max(size.x,size.y,size.z)<.001
  ){
    throw new Error("Spider model has zero or invalid bounds.");
  }

  // Normal Backrooms and tutorial use the same imported rig. Match the
  // tutorial's darker chitin finish in normal gameplay too, without changing
  // the model's authored proportions or skeleton.
  // Match the tutorial spider exactly: preserve its authored colors/maps and
  // apply only the tutorial's copied-material/shadow setup.
  applyTutorialSpiderMaterialPass(model,{darken:false});
  fitSpiderModel(model);

  // Stop both rigs before replacing the current model tree.
  spiderMixer?.stopAllAction();
  spiderMixer=null;
  stopSpiderOverlapAnimation();

  // A menu/gameplay load race must not leave an older full-size rig attached
  // underneath the replacement. Keep exactly one normal spider model in-scene.
  if(spiderOriginalModel?.parent===spiderEntity){
    spiderEntity.remove(spiderOriginalModel);
  }

  // Keep the fitted world-space scale outside the animated model root. Some
  // animation clips key the root scale; putting normalization on this wrapper
  // prevents those clips from shrinking the normal Backrooms spider.
  const modelScaleRoot=new THREE.Group();
  modelScaleRoot.name="SpiderModelScaleRoot";
  modelScaleRoot.scale.copy(model.scale);
  model.scale.set(1,1,1);
  model.updateMatrixWorld(true);
  modelScaleRoot.add(model);
  modelScaleRoot.updateMatrixWorld(true);

  const visualRoot=new THREE.Group();
  visualRoot.name="SpiderVisualRoot";
  visualRoot.visible=true;
  visualRoot.add(modelScaleRoot);

  // Keep one source rig, at the same scale used by the tutorial clone.
  const placedBounds=new THREE.Box3().setFromObject(modelScaleRoot);
  const placedCenter=placedBounds.getCenter(new THREE.Vector3());
  const placedMinY=placedBounds.min.y;
  visualRoot.position.set(
    -placedCenter.x,
    -placedMinY,
    -placedCenter.z
  );

  spiderModel=visualRoot;
  spiderOriginalModel=visualRoot;
  spiderEntity.add(visualRoot);
  spiderLoaded=true;
  spiderStartupFailed=false;

  if(gameStarted && !houseMode){
    nextEvent=Math.min(nextEvent,clock.elapsedTime+8);
  }

  if(spiderRetryTimer!==null){
    clearTimeout(spiderRetryTimer);
    spiderRetryTimer=null;
  }

  spiderMixer=null;
  spiderActions.clear();
  spiderAnimationClips.clear();
  spiderAnimationState="";

  const documentedClipNames=[
    "walk","attack1","attack2","eat","defend",
    "hit1","hit2","crouch","stand","idle1","idle2",
    "jump","sidestep","die1","die2"
  ];

  const normalizeAnimationKey=(value)=>String(value||"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ");

  const animationAliases={
    walk:["walk","walking"],
    attack1:["attack 1","attack1","attack 01","attack01"],
    attack2:["attack 2","attack2","attack 02","attack02"],
    eat:["eat"],
    defend:["defend","defence"],
    hit1:["hit 1","hit1","hit 01","hit01"],
    hit2:["hit 2","hit2","hit 02","hit02"],
    crouch:["crouch"],
    stand:["stand"],
    idle1:["idle 1","idle1"],
    idle2:["idle 2","idle2"],
    jump:["jump"],
    sidestep:["side step","sidestep"],
    die1:["die 1","die1","death 1","death1"],
    die2:["die 2","die2","death 2","death2"]
  };

  const animatedNodeNames=new Set();

  model.traverse(obj=>{
    const nodeName=String(obj.name||"").toLowerCase();
    if(nodeName) animatedNodeNames.add(nodeName);

    if(!obj.isSkinnedMesh || !obj.skeleton) return;
    for(const bone of obj.skeleton.bones){
      const boneName=String(bone.name||"").toLowerCase();
      if(boneName) animatedNodeNames.add(boneName);
    }
  });

  const trackTargetNames=(track)=>{
    if(!track?.name) return [];
    const raw=String(track.name);
    const names=new Set();

    // Three.js PropertyBinding understands glTF paths such as
    // "Armature.bones[Bone_01].quaternion". Use it when possible.
    try{
      const parsed=THREE.PropertyBinding.parseTrackName(raw);
      if(parsed?.nodeName){
        names.add(String(parsed.nodeName).toLowerCase());
      }
    }catch(_error){}

    // Keep explicit bone names too, because imported rigs can encode them in
    // bracket paths that vary slightly between exporters.
    const bracketMatches=raw.matchAll(/bones\[([^\]]+)\]/gi);
    for(const match of bracketMatches){
      names.add(String(match[1]).toLowerCase());
    }

    const dot=raw.lastIndexOf(".");
    if(dot>0){
      const fallback=raw
        .slice(0,dot)
        .split("|")
        .pop()
        .split(":")
        .pop()
        .toLowerCase();
      if(fallback) names.add(fallback);
    }

    return [...names];
  };

  const makeStableSpiderClip=(clip)=>{
    if(!clip) return null;
    const stable=clip.clone();

    // Keep only tracks that can actually bind to this imported rig. This
    // prevents partial/invalid animation paths from deforming the spider.
    let validTrackCount=0;
    stable.tracks=stable.tracks.filter(track=>{
      if(track.name.endsWith(".morphTargetInfluences")) return false;
      const targets=trackTargetNames(track);
      const valid=targets.some(target=>animatedNodeNames.has(target));
      if(valid) validTrackCount++;
      return valid;
    });

    if(!validTrackCount) return null;

    stable.resetDuration();
    return stable;
  };

  const directClips=new Map();
  const claimedAnimations=new Set();

  if(animations?.length>1){
    for(const documentedName of documentedClipNames){
      const aliases=animationAliases[documentedName]||[documentedName];
      const match=animations.find((clip,index)=>{
        if(claimedAnimations.has(index)) return false;
        const name=normalizeAnimationKey(clip.name);
        return aliases.some(alias=>name.includes(normalizeAnimationKey(alias)));
      });

      if(!match) continue;

      const index=animations.indexOf(match);
      claimedAnimations.add(index);
      const stable=makeStableSpiderClip(match);
      if(stable) directClips.set(documentedName,stable);
    }

    if(
      directClips.size<documentedClipNames.length &&
      animations.length>=documentedClipNames.length
    ){
      for(let i=0;i<documentedClipNames.length;i++){
        const documentedName=documentedClipNames[i];
        if(directClips.has(documentedName)) continue;

        const clip=
          animations.find((candidate,index)=>
            index===i && !claimedAnimations.has(index)
          ) ||
          animations.find((candidate,index)=>
            !claimedAnimations.has(index)
          );

        if(!clip) continue;

        const index=animations.indexOf(clip);
        claimedAnimations.add(index);
        const stable=makeStableSpiderClip(clip);
        if(stable) directClips.set(documentedName,stable);
      }
    }
  }

  if(animations?.length===1){
    const sourceClip=animations[0];

    // The 329-frame slices below belong only to the original FBX pack.
    // A standalone GLB has its own timeline; slicing it with those legacy
    // ranges can create empty/out-of-range clips and badly deform the rig.
    const isLegacyFbx=String(sourceName||"").toLowerCase().endsWith(".fbx");

    if(isLegacyFbx){
      const sourceFPS=329/Math.max(sourceClip.duration,.001);

      for(const [name,[startFrame,endFrame]] of Object.entries(SPIDER_ANIMATION_RANGES)){
        const clip=THREE.AnimationUtils.subclip(
          sourceClip,
          "spider_"+name,
          startFrame,
          endFrame+1,
          sourceFPS
        );
        const stable=makeStableSpiderClip(clip);
        if(stable) directClips.set(name,stable);
      }
    }else{
      const stable=makeStableSpiderClip(sourceClip);
      if(stable){
        // One trustworthy clip is better than fabricating animation ranges.
        // It becomes the safe movement/idle animation; missing special states
        // fall back to it instead of touching unknown rig transforms.
        for(const name of ["idle1","idle2","walk"]){
          directClips.set(name,stable.clone());
        }
      }
    }
  }

  for(const [name,clip] of directClips){
    if(clip) spiderAnimationClips.set(name,clip);
  }

  if(directClips.size){
    spiderMixer=new THREE.AnimationMixer(model);

    for(const [name,clip] of directClips){
      const action=spiderMixer.clipAction(clip);
      const oneShot=name.startsWith("die") || name.startsWith("attack");

      action.setLoop(
        oneShot ? THREE.LoopOnce : THREE.LoopRepeat,
        oneShot ? 1 : Infinity
      );
      if(oneShot) action.clampWhenFinished=true;
      spiderActions.set(name,action);
    }

    console.log("[DeepSeeker] Spider animation map",{
      selected:[...directClips.keys()],
      tracks:[...directClips.entries()].map(([name,clip])=>[
        name,
        clip?.tracks?.length||0
      ])
    });

    rebuildSpiderOverlapAnimation();
    setSpiderAnimation(spiderWantedState);
  }else{
    stopSpiderOverlapAnimation();
    spiderWantedState="idle";
  }

  console.log("[DeepSeeker] Spider-Psionic rig loaded",{
    source:sourceName,
    format:sourceName.toLowerCase().endsWith(".fbx") ? "FBX" : "GLB",
    animations:animations?.map(animation=>animation.name)||[],
    animationCount:animations?.length||0,
    meshCount,
    halfHeight:spiderModelHalfHeight
  });

  syncTutorialSpiderFromGameplayModel(true);
  syncMenuSpiderFromGameplayModel();

  spiderLoadStarted=false;

  if(spiderSpawnPending && gameStarted && !houseMode){
    spiderSpawnPending=false;
    spawnSpiderAtPlayer();
  }

  eventText.textContent=spiderActions.size
    ? "SPIDER READY"
    : "SPIDER READY (STATIC)";
  eventText.style.opacity="1";

  setTimeout(()=>{
    if(
      eventText.textContent==="SPIDER READY" ||
      eventText.textContent==="SPIDER READY (STATIC)"
    ){
      eventText.style.opacity="0";
    }
  },1800);
}

async function loadSpiderFromPack(){
  const preferredSpiderUrl="./assets/animated_spider.glb";
  const packUrl="./assets/Spider-Psionic.zip";
  let objectUrls=[];

  const failSpiderLoad=(error,message)=>{
    spiderLoaded=false;
    spiderStartupFailed=true;
    spiderModel=null;
    spiderMixer=null;
    spiderActions.clear();
    spiderAnimationState="";
    spiderLoadStarted=false;
    spiderSpawnPending=
      gameStarted &&
      !houseMode &&
      !tutorialOpenRoomActive;

    for(const url of objectUrls){
      URL.revokeObjectURL(url);
    }
    objectUrls=[];

    console.error("[DeepSeeker] Spider-Psionic pack load failed:",error);

    if(gameStarted){
      eventText.textContent=message+" · RETRYING";
      eventText.style.opacity="1";
      setTimeout(()=>{
        if(eventText.textContent===(message+" · RETRYING")){
          eventText.style.opacity="0";
        }
      },1800);
    }

    if(spiderRetryTimer===null){
      spiderRetryTimer=setTimeout(()=>{
        spiderRetryTimer=null;
        if(!spiderLoaded && !spiderLoadStarted){
          spiderStartupFailed=false;
          spiderLoadStarted=true;
          loadSpiderFromPack();
        }
      },4000);
    }
  };

  try{
    // Prefer the standalone glTF asset. It avoids the FBX skinning path that
    // caused deformed limbs/poses in browsers while keeping the ZIP as a
    // compatibility fallback for deployments missing the new asset.
    try{
      await new Promise((resolve,reject)=>{
        const preferredLoader=new GLTFLoader();
        preferredLoader.setDRACOLoader(dracoLoader);
        preferredLoader.setMeshoptDecoder(MeshoptDecoder);
        preferredLoader.load(
          preferredSpiderUrl,
          gltf=>{
            try{
              finishSpiderModel(
                gltf.scene,
                gltf.animations||[],
                preferredSpiderUrl
              );
              console.log("[DeepSeeker] using standalone animated spider GLB");
              resolve();
            }catch(error){
              reject(error);
            }
          },
          undefined,
          reject
        );
      });
      return;
    }catch(preferredError){
      console.warn(
        "[DeepSeeker] Standalone animated spider GLB failed; using Spider-Psionic fallback:",
        preferredError
      );
    }

    const extracted=await extractSpiderPack(packUrl);
    const packManager=new THREE.LoadingManager();
    const resourceUrls=new Map();

    for(const [name,blob] of extracted.resourceBlobs){
      const url=URL.createObjectURL(blob);
      resourceUrls.set(name,url);
      objectUrls.push(url);
    }

    const cleanupPackUrls=()=>{
      for(const url of objectUrls){
        URL.revokeObjectURL(url);
      }
      objectUrls=[];
    };
    packManager.onLoad=cleanupPackUrls;

    packManager.setURLModifier((url)=>{
      const normalized=String(url||"")
        .replace(/\\/g,"/")
        .split("?")[0]
        .split("#")[0]
        .toLowerCase();

      const decoded=(()=>{
        try{
          return decodeURIComponent(normalized);
        }catch(_error){
          return normalized;
        }
      })();

      const shortName=decoded.slice(decoded.lastIndexOf("/")+1);
      return resourceUrls.get(decoded) ||
        resourceUrls.get(shortName) ||
        url;
    });

    packManager.onError=(url)=>{
      console.warn(
        "[DeepSeeker] Spider pack resource could not be resolved:",
        url
      );
    };

    const handleLoaded=(model,animations,sourceName=extracted.sourceName)=>{
      try{
        finishSpiderModel(model,animations,sourceName);
      }catch(error){
        cleanupPackUrls();
        failSpiderLoad(error,"SPIDER MODEL FAILED TO LOAD");
      }
    };

    if(extracted.modelType==="fbx"){
      const loader=new FBXLoader(packManager);

      try{
        const object=loader.parse(
          extracted.modelBytes.buffer,
          extracted.modelDirectory
        );

        handleLoaded(object,object.animations||[],extracted.sourceName);
        console.log("[DeepSeeker] using rigged FBX spider visual");
      }catch(fbxError){
        console.warn(
          "[DeepSeeker] FBX visual failed; using static OBJ fallback:",
          fbxError
        );

        const objEntry=[...extracted.resourceBlobs.keys()]
          .find(name=>name.endsWith(".obj"));

        if(!objEntry){
          failSpiderLoad(
            fbxError,
            "SPIDER MODEL PARSE FAILED"
          );
          return;
        }

        try{
          const objBlob=extracted.resourceBlobs.get(objEntry);
          const objLoader=new OBJLoader(packManager);
          const object=objLoader.parse(
            new TextDecoder().decode(await objBlob.arrayBuffer())
          );

          handleLoaded(object,[],objEntry);
          console.log("[DeepSeeker] using static OBJ spider fallback");
        }catch(objError){
          failSpiderLoad(
            objError,
            "SPIDER MODEL PARSE FAILED"
          );
        }
      }
      return;
    }

    const loader=new GLTFLoader(packManager);
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      extracted.modelName,
      gltf=>handleLoaded(
        gltf.scene,
        gltf.animations||[],
        extracted.sourceName
      ),
      undefined,
      error=>failSpiderLoad(error,"SPIDER GLB FAILED TO LOAD")
    );
  }catch(error){
    failSpiderLoad(error,"SPIDER PACK FAILED TO LOAD");
  }
}

function ensureSpiderLoading(immediate=false){
  if(spiderLoadStarted || spiderLoaded) return;
  spiderLoadStarted=true;

  const start=()=>loadSpiderFromPack();
  if(immediate){
    start();
    return;
  }
  if("requestIdleCallback" in window){
    window.requestIdleCallback(start,{timeout:1800});
  }else{
    setTimeout(start,180);
  }
}


player.onStep=({intensity,running,crouched})=>{
  audio.step(intensity);
  if(gameStarted&&spiderActive&&!houseMode&&!tutorialOpenRoomActive&&multiplayer.isWorldAuthority()){
    normalSpiderHunter.hearNoise(player.pos.x,player.pos.z,{
      time:clock.elapsedTime,intensity,running,crouched
    });
  }
};

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

let flashlightOn=false;
let battery=100;
let controlsOpen=false;
let pulse=0;
let nextEvent=24+Math.random()*16;
let eventCooldown=0;
let muted=false;
let phoneOpen=false;

let deepseekerAppOpen=false;
let adminUnlocked=false;
let adminFlyEnabled=false;
let adminTool=null;
const adminProjectiles=[];
const ADMIN_PASSWORD="DEEPSEEKER";
let storyStage=0;
let maxStoryDistance=0;
let gameEnded=false;
let endingOverlay=null;
const ENDING_MARKUP="<div class=\"endingGlitch\"></div><div class=\"endingCenter\"><div class=\"endingKicker\">DEEPSEEKER // LOST SIGNAL</div><div class=\"endingTitle\" id=\"endingTitle\">THE BOTTOM</div><div class=\"endingLine\" id=\"endingLine\">YOU FOUND IT.</div><button id=\"endingReturn\" type=\"button\">RETURN TO TITLE</button></div>";
const ENDING_DISTANCE=660;

function beginGameEnding(){
  if(gameEnded || !gameStarted) return;

  gameEnded=true;
  player.keys.clear();
  player.vel.set(0,0,0);

  spiderActive=false;
  spiderEntity.visible=false;
  spiderRevealLight.visible=false;

  flashlightOn=false;
  flashlight.visible=false;
  player.setFlashlightVisual(false);

  if(document.pointerLockElement===renderer.domElement){
    document.exitPointerLock();
  }

  controlsOpen=false;
  phoneOpen=false;
  deepseekerAppOpen=false;
  chatOpen=false;
  controls.classList.add("hidden");
  phone.classList.remove("open","app-open");
  phone.setAttribute("aria-hidden","true");
  crosshair.style.display="none";

  if(!endingOverlay){
    endingOverlay=document.createElement("div");
    endingOverlay.id="deepseekerEnding";
    endingOverlay.innerHTML=ENDING_MARKUP;
    endingOverlay.style.cssText=[
      "position:fixed",
      "inset:0",
      "z-index:10000",
      "display:grid",
      "place-items:center",
      "background:#000",
      "color:#e7dfbb",
      "opacity:0",
      "transition:opacity 1.2s ease",
      "font-family:ui-monospace,SFMono-Regular,Menlo,monospace",
      "user-select:none",
      "overflow:hidden"
    ].join(";");

    const style=document.createElement("style");
    style.textContent=
      "#deepseekerEnding .endingGlitch{position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(255,255,255,.018) 0 1px,transparent 1px 5px),radial-gradient(circle at 50% 50%,rgba(214,198,132,.055),transparent 34%);mix-blend-mode:screen;pointer-events:none;}"+
      "#deepseekerEnding .endingCenter{position:relative;width:min(760px,86vw);text-align:center;padding:32px;}"+
      "#deepseekerEnding .endingKicker{font-size:10px;letter-spacing:4px;color:#77715e;margin-bottom:28px;}"+
      "#deepseekerEnding .endingTitle{font-size:clamp(34px,7vw,82px);letter-spacing:clamp(8px,1.8vw,18px);color:#e8dfb8;font-weight:400;text-shadow:0 0 28px rgba(216,201,138,.08);}"+
      "#deepseekerEnding .endingLine{min-height:28px;margin-top:20px;font-size:12px;letter-spacing:3px;line-height:1.7;color:#aaa487;}"+
      "#deepseekerEnding #endingReturn{margin-top:42px;padding:13px 22px;border:1px solid rgba(229,218,170,.24);border-radius:10px;background:rgba(255,255,255,.04);color:#d9d1af;font:inherit;font-size:9px;letter-spacing:2.5px;cursor:pointer;opacity:0;transition:opacity .5s,background .2s,border-color .2s;}"+
      "#deepseekerEnding #endingReturn:hover{background:rgba(216,201,138,.10);border-color:rgba(216,201,138,.55);}";

    document.head.appendChild(style);
    document.body.appendChild(endingOverlay);

    endingOverlay.querySelector("#endingReturn").addEventListener("click",()=>{
      location.href=location.pathname;
    });
  }

  const title=endingOverlay.querySelector("#endingTitle");
  const line=endingOverlay.querySelector("#endingLine");
  const button=endingOverlay.querySelector("#endingReturn");

  title.textContent="THE BOTTOM";
  line.textContent="YOU FOUND IT.";
  button.style.opacity="0";
  endingOverlay.style.opacity="1";

  audio.scare();

  setTimeout(()=>{
    if(!gameEnded) return;
    title.textContent="NO FLOOR. NO EXIT.";
    line.textContent="THE SIGNAL WAS NEVER BELOW YOU.";
  },1800);

  setTimeout(()=>{
    if(!gameEnded) return;
    title.textContent="DEEPSEEKER";
    line.textContent="YOU WERE FOLLOWING YOUR OWN SIGNAL.";
  },4000);

  setTimeout(()=>{
    if(!gameEnded) return;
    title.textContent="SIGNAL TERMINATED";
    line.textContent="LOST SIGNAL // CONNECTION CLOSED";
    button.style.opacity="1";
  },6500);
}

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
    objective: "Find the bottom. Find the source of the signal."
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

  if(
    !gameEnded &&
    storyStage===STORY.length-1 &&
    maxStoryDistance>=ENDING_DISTANCE
  ){
    beginGameEnding();
  }
}

function toggleFlashlight(){
  flashlightOn=!flashlightOn;
  player.setFlashlightVisual(flashlightOn);
  multiplayer.sendState(true);

  if(!houseMode && gameStarted && houseTutorialStage===5 && flashlightOn){
    setHouseTutorialStage(6);
  }
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
  phoneCardTitle.textContent="KEEP MOVING";
  phoneCardText.textContent="You're in the Backrooms. Move around the room first. When this message closes, try your flashlight.";

  renderStoryLog();
  phoneStory.insertAdjacentHTML("afterbegin",`
    <div class="storyEntry">
      <div class="storyMeta">M · ENTRY TUTORIAL</div>
      <div class="storyText">You're in the Backrooms. Move around the room first. When this message closes, try your flashlight.</div>
    </div>
  `);
}

function setAdminStatus(message){
  if(adminAuthStatus) adminAuthStatus.textContent=message;
  if(adminPanelStatus) adminPanelStatus.textContent=message;
}
function openAdminAccess(){
  if(!phoneOpen) return;
  player.keys.clear();
  player.vel.set(0,0,0);
  if(document.pointerLockElement===renderer.domElement) document.exitPointerLock();
  adminOverlay.classList.add("open");
  adminOverlay.setAttribute("aria-hidden","false");
  adminAuthCard.style.display=adminUnlocked ? "none" : "block";
  adminPanelCard.classList.toggle("open",adminUnlocked);
  adminPasswordInput.value="";
  setAdminStatus(adminUnlocked ? "ADMIN UNLOCKED" : "");
  if(!adminUnlocked) setTimeout(()=>adminPasswordInput.focus(),0);
}
function closeAdminAccess(){
  adminOverlay.classList.remove("open");
  adminOverlay.setAttribute("aria-hidden","true");
  adminPasswordInput.value="";
}
function lockAdminAccess(){
  adminUnlocked=false;
  adminFlyEnabled=false;
  adminTool=null;
  player.jumpY=0;
  player.jumpVelocity=0;
  adminFlyButton.textContent="FLY: OFF";
  adminWaterGunButton.classList.remove("active");
  adminWaterRpgButton.classList.remove("active");
  adminAuthCard.style.display="block";
  adminPanelCard.classList.remove("open");
  setAdminStatus("ADMIN LOCKED");
}
function setAdminTool(tool){
  adminTool=adminTool===tool ? null : tool;
  adminWaterGunButton.classList.toggle("active",adminTool==="waterGun");
  adminWaterRpgButton.classList.toggle("active",adminTool==="waterRpg");
  adminPanelStatus.textContent=adminTool ? (adminTool==="waterGun" ? "WATER GUN ARMED" : "WATER RPG ARMED") : "TOOL DISARMED";
}
function clearAdminProjectiles(){
  for(const item of adminProjectiles){
    scene.remove(item.mesh);
    item.mesh.geometry.dispose();
    item.mesh.material.dispose();
  }
  adminProjectiles.length=0;
}
function fireAdminWater(kind){
  if(!adminUnlocked || !gameStarted || phoneOpen) return;
  const direction=new THREE.Vector3();
  camera.getWorldDirection(direction);
  const isRpg=kind==="waterRpg";
  const material=new THREE.MeshBasicMaterial({color:isRpg ? 0x8fcce8 : 0x6fb8d1,transparent:true,opacity:isRpg ? .88 : .78});
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(isRpg ? .24 : .075,isRpg ? 12 : 8,isRpg ? 12 : 8),material);
  mesh.position.copy(camera.position).addScaledVector(direction,.75);
  scene.add(mesh);
  adminProjectiles.push({mesh,direction:direction.clone(),velocity:isRpg ? 17 : 28,life:isRpg ? 1.8 : 1.0,gravity:isRpg ? 1.5 : .35});
}
function updateAdminProjectiles(dt){
  for(let i=adminProjectiles.length-1;i>=0;i--){
    const item=adminProjectiles[i];
    item.life-=dt;
    item.direction.y-=item.gravity*dt;
    item.direction.normalize();
    item.mesh.position.addScaledVector(item.direction,item.velocity*dt);
    if(item.life<=0){
      scene.remove(item.mesh);
      item.mesh.geometry.dispose();
      item.mesh.material.dispose();
      adminProjectiles.splice(i,1);
    }
  }
}
function updateAdminFly(dt){
  if(!adminFlyEnabled || !gameStarted || houseMode) return;
  const rise=player.keys.has("Space") ? 1 : ((player.keys.has("ControlLeft") || player.keys.has("ControlRight")) ? -1 : 0);
  if(rise!==0){
    const amount=7*dt*rise;
    player.jumpY=THREE.MathUtils.clamp(player.jumpY+amount,0,20);
    player.jumpVelocity=0;
    camera.position.y+=amount;
  }
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

    if(!houseMode && gameStarted && houseTutorialStage===6){
      setHouseTutorialStage(7);
    }
  }else{
    adminOverlay.classList.remove("open");
    adminOverlay.setAttribute("aria-hidden","true");

    if(!houseMode && gameStarted){
      if(houseTutorialStage===0){
        setHouseTutorialStage(1);
      }else if(houseTutorialStage===7){
        setHouseTutorialStage(8);
      }
    }

    if(!controlsOpen) player.lock();
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

// NEW GAME uses the document-level capture handler above so the menu can safely rebuild its DOM.

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
adminIcon.addEventListener("click",e=>{ e.preventDefault(); e.stopPropagation(); openAdminAccess(); });
adminCloseButton.addEventListener("click",closeAdminAccess);
adminAdminCloseButton.addEventListener("click",closeAdminAccess);
adminUnlockButton.addEventListener("click",()=>{
  if(adminPasswordInput.value===ADMIN_PASSWORD){
    adminUnlocked=true;
    adminAuthCard.style.display="none";
    adminPanelCard.classList.add("open");
    adminPasswordInput.value="";
    setAdminStatus("ADMIN UNLOCKED");
  }else{
    setAdminStatus("WRONG PASSWORD");
    adminPasswordInput.select();
  }
});
adminPasswordInput.addEventListener("keydown",e=>{ if(e.code==="Enter"){ e.preventDefault(); adminUnlockButton.click(); } });
adminLockButton.addEventListener("click",lockAdminAccess);
adminFlyButton.addEventListener("click",()=>{
  if(!adminUnlocked) return;
  adminFlyEnabled=!adminFlyEnabled;
  adminFlyButton.textContent="FLY: "+(adminFlyEnabled ? "ON" : "OFF");
  adminPanelStatus.textContent=adminFlyEnabled ? "FLY ENABLED" : "FLY DISABLED";
});
adminWaterGunButton.addEventListener("click",()=>{ if(adminUnlocked) setAdminTool("waterGun"); });
adminWaterRpgButton.addEventListener("click",()=>{ if(adminUnlocked) setAdminTool("waterRpg"); });
adminClearWaterButton.addEventListener("click",()=>{ if(adminUnlocked){ clearAdminProjectiles(); adminPanelStatus.textContent="WATER CLEARED"; } });


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
if(hudRight) hudRight.style.display="none";
prompt.textContent="READY — START A GAME";
applyStoryStage(0,false);

overlay.addEventListener("click",(e)=>{
  if(e.target!==overlay) return;
  if(gameStarted){
    audio.start();
    player.lock();
  }
});

renderer.domElement.addEventListener("mousedown",e=>{
  if(e.button===0 && adminUnlocked && adminTool && gameStarted && !phoneOpen){
    fireAdminWater(adminTool);
    e.preventDefault();
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

fitScreenButton?.addEventListener("click",()=>{
  toggleFitScreen();
});

document.addEventListener("pointerlockchange",()=>{
  const locked=document.pointerLockElement===renderer.domElement;

  // CCTV intentionally releases pointer lock. Do not turn that intentional
  // transition into the normal gameplay pause/loading overlay.
  if(securityCameras.active){
    overlay.classList.add("hidden");
    crosshair.style.display="none";
    return;
  }

  if(!controlsOpen && !phoneOpen && !chatOpen){
    if(locked){
      overlay.classList.add("hidden");
    }else if(gameStarted){
      if(multiplayerMapOpen) toggleMultiplayerMap(false);
      loadingScreen.style.display="none";
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

document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    player.keys.clear();
    return;
  }

  fitGameToScreen();

  if(
    gameStarted &&
    !gameEnded &&
    !controlsOpen &&
    !phoneOpen &&
    !chatOpen &&
    document.pointerLockElement!==renderer.domElement
  ){
    loadingScreen.style.display="none";
    homeScreen.classList.add("hidden");
    lobbyScreen.classList.add("hidden");
    prompt.textContent="CLICK TO RESUME";
    overlay.classList.remove("hidden");
    crosshair.style.display="none";
  }
});

document.addEventListener("keydown",e=>{
  if(e.code==="F11"){
    e.preventDefault();
    toggleFitScreen();
    return;
  }

  if(adminOverlay?.classList.contains("open")) return;
  if(gameEnded) return;

  if(securityCameras.active){
    if(e.code==="Escape"){
      e.preventDefault();
      securityCameras.close();
      return;
    }
    if(e.code==="ArrowLeft"){
      e.preventDefault();
      securityCameras.cycle(-1);
      return;
    }
    if(e.code==="ArrowRight"){
      e.preventDefault();
      securityCameras.cycle(1);
      return;
    }
    return;
  }

  if(computerSystem.openState){
    if(e.code==="Escape"){
      e.preventDefault();
      computerSystem.close();
    }
    return;
  }

  if(e.code==="Enter" && !e.repeat && gameStarted && !phoneOpen && !controlsOpen && !chatOpen){
    e.preventDefault();
    openChat();
    return;
  }

  if(chatOpen) return;

  if(e.code==="KeyE" && !e.repeat && !phoneOpen && !controlsOpen && !chatOpen){
    if(interaction.interact()){
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
  if(!multiplayer.isWorldAuthority()||tutorialOpenRoomActive||houseMode||spiderActive)return;
  eventCooldown=4.5;
  if(!spiderLoaded){ensureSpiderLoading();return;}
  // Start from out of sight; a chase begins only after the spider detects a clue.
  startBackroomsStalker();
}

function publishMultiplayerSpiderSnapshot(dt){
  const authorityId=multiplayer.getWorldAuthorityId();
  if(!multiplayer.isWorldAuthority() || !authorityId) return;

  if(authorityId!==spiderSyncAuthorityId){
    spiderSyncAuthorityId=authorityId;
    spiderSyncNeedsInitial=true;
    spiderSyncLastActive=false;
    spiderSyncElapsed=0;
  }

  spiderSyncElapsed+=dt;
  const active=Boolean(spiderActive && !houseMode && !tutorialOpenRoomActive && gameStarted);
  if(!active){
    if(spiderSyncLastActive || spiderSyncNeedsInitial){
      multiplayer.broadcastWorldEvent("spider_snapshot","main-spider",{
        active:false,
        behavior:"idle",
        animation:"idle",
        x:spiderEntity.position.x,
        y:SPIDER_GROUND_OFFSET,
        z:spiderEntity.position.z,
        rotationX:0,
        rotationY:spiderEntity.rotation.y,
        scale:1,
        jumpscareTimer:0
      });
      spiderSyncLastActive=false;
      spiderSyncNeedsInitial=false;
      spiderSyncElapsed=0;
    }
    return;
  }

  if(spiderSyncElapsed<.10 && spiderSyncLastActive && !spiderSyncNeedsInitial) return;
  spiderSyncElapsed=0;
  spiderSyncLastActive=true;
  spiderSyncNeedsInitial=false;
  multiplayer.broadcastWorldEvent("spider_snapshot","main-spider",{
    active:true,
    behavior:spiderBehaviorState,
    animation:spiderBehaviorState==="peek" ? "static" : (spiderWantedState||"chase"),
    x:spiderEntity.position.x,
    y:spiderEntity.position.y,
    z:spiderEntity.position.z,
    rotationX:spiderEntity.rotation.x,
    rotationY:spiderEntity.rotation.y,
    scale:spiderEntity.scale.x,
    jumpscareTimer:spiderJumpscareTimer
  });
}

function applyRemoteSpiderSnapshot(dt){
  if(multiplayer.isWorldAuthority() || houseMode || tutorialOpenRoomActive) return;
  const snapshot=remoteSpiderSnapshot;
  const fresh=snapshot && performance.now()-remoteSpiderSnapshotReceivedAt<1200;
  if(!fresh || !snapshot.active){
    spiderActive=false;
    spiderBehaviorState="idle";
    spiderJumpscareTimer=0;
    spiderCaughtFreezeTimer=0;
    player.movementFrozen=false;
    spiderEntity.visible=false;
    spiderRevealLight.visible=false;
    if(spiderModel) spiderModel.visible=true;
    remoteSpiderPositionInitialized=false;
    return;
  }

  spiderActive=true;
  spiderBehaviorState=snapshot.behavior;
  spiderJumpscareTimer=snapshot.jumpscareTimer;
  spiderCaughtFreezeTimer=0;
  player.movementFrozen=false;

  if(!remoteSpiderPositionInitialized){
    spiderEntity.position.set(snapshot.x,snapshot.y,snapshot.z);
    spiderEntity.rotation.set(snapshot.rotationX,snapshot.rotationY,0);
    remoteSpiderPositionInitialized=true;
  }else{
    const alpha=1-Math.exp(-20*Math.max(0,dt));
    spiderEntity.position.lerp(new THREE.Vector3(snapshot.x,snapshot.y,snapshot.z),alpha);
    const deltaYaw=THREE.MathUtils.euclideanModulo(
      snapshot.rotationY-spiderEntity.rotation.y+Math.PI,
      Math.PI*2
    )-Math.PI;
    spiderEntity.rotation.y+=deltaYaw*alpha;
    spiderEntity.rotation.x=THREE.MathUtils.lerp(spiderEntity.rotation.x,snapshot.rotationX,alpha);
  }
  spiderEntity.scale.setScalar(snapshot.scale);
  spiderEntity.visible=true;
  if(snapshot.animation==="static"){
    if(spiderAnimationState || spiderWantedState!=="stalk"){
      spiderMixer?.stopAllAction();
      spiderAnimationState="";
      spiderWantedState="stalk";
    }
  }else if(spiderWantedState!==snapshot.animation || !spiderAnimationState){
    setSpiderAnimation(snapshot.animation);
  }
  spiderVisibleToPlayer=playerHasLineOfSightToSpider();
  // Let the renderer's depth buffer hide the model behind real walls. The
  // binary raycast visibility test can falsely hide the entire normal spider
  // when any nearby wall intersects the ray; tutorial rendering is separate.
  if(spiderModel) spiderModel.visible=true;
  spiderRevealLight.visible=spiderVisibleToPlayer;
  spiderRevealLight.intensity=spiderVisibleToPlayer
    ? (spiderJumpscareTimer>0?5:4.2)
    : 0;
}

function getDisplaySize(){
  const viewport=window.visualViewport;
  return {
    width:Math.max(1,Math.round(viewport?.width||innerWidth)),
    height:Math.max(1,Math.round(viewport?.height||innerHeight))
  };
}

function fitGameToScreen(){
  const {width,height}=getDisplaySize();

  camera.aspect=width/height;
  camera.updateProjectionMatrix();

  menuCamera.aspect=width/height;
  menuCamera.updateProjectionMatrix();

  securityCameras.resize();
  renderer.setSize(width,height,false);

  // Keep CSS and WebGL aligned to the exact viewport currently available.
  renderer.domElement.style.width="100%";
  renderer.domElement.style.height="100%";

  document.documentElement.style.setProperty("--deepseeker-vw",width+"px");
  document.documentElement.style.setProperty("--deepseeker-vh",height+"px");
}

async function toggleFitScreen(){
  try{
    if(document.fullscreenElement){
      await document.exitFullscreen();
    }else{
      const fullscreenTarget=document.documentElement || document.body;
      if(!fullscreenTarget?.requestFullscreen){
        throw new Error("Fullscreen API unavailable in this browser.");
      }

      try{
        await fullscreenTarget.requestFullscreen({navigationUI:"hide"});
      }catch(_optionsError){
        // Firefox/browser builds that reject navigationUI should still enter
        // fullscreen normally.
        await fullscreenTarget.requestFullscreen();
      }
    }
  }catch(error){
    console.warn("[DeepSeeker] Fullscreen unavailable:",error);
  }finally{
    requestAnimationFrame(fitGameToScreen);
  }
}

addEventListener("resize",fitGameToScreen);

if(window.visualViewport){
  window.visualViewport.addEventListener("resize",fitGameToScreen);
}

document.addEventListener("fullscreenchange",fitGameToScreen);
fitGameToScreen();

const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05);
  const t=clock.elapsedTime;

  // The title screen is independent of gameplay. Render it before the
  // gameplay simulation so an unrelated gameplay error cannot black out the menu.
  if(hudRight) hudRight.style.display=gameStarted ? "block" : "none";
  const menuIsVisible=!gameStarted && !homeScreen.classList.contains("hidden");
  navigation.root.style.display=(gameStarted && !securityCameras.active) ? "flex" : "none";

  if(securityCameras.active){
    securityCameras.update();
    renderer.render(scene,securityCameras.camera);
    return;
  }

  if(menuIsVisible){
    try{
      const usingMenuCamera=updateMenuScene(t,dt);
      renderer.render(
        usingMenuCamera ? menuScene : scene,
        usingMenuCamera ? menuCamera : camera
      );
    }catch(error){
      console.error("[DeepSeeker] Menu render error:",error);

      let errorBox=document.getElementById("menuRuntimeError");
      if(!errorBox){
        errorBox=document.createElement("div");
        errorBox.id="menuRuntimeError";
        errorBox.style.cssText=[
          "position:fixed",
          "left:16px",
          "right:16px",
          "bottom:16px",
          "z-index:9999",
          "padding:12px 14px",
          "border:1px solid rgba(255,120,120,.45)",
          "border-radius:8px",
          "background:rgba(18,5,5,.92)",
          "color:#ffd7d7",
          "font:12px/1.4 monospace",
          "white-space:pre-wrap",
          "pointer-events:none"
        ].join(";");
        document.body.appendChild(errorBox);
      }
      errorBox.textContent="MENU RENDER ERROR\\n"+String(error?.stack||error);
    }
    return;
  }

  perfElapsed+=dt;
  perfFrames++;
  perfCooldown=Math.max(0,perfCooldown-dt);
  uiRefreshElapsed+=dt;
  storyRefreshElapsed+=dt;
  debugPerfElapsed+=dt;

  if(perfElapsed>=0.5){
    const fps=perfFrames/perfElapsed;
    perfElapsed=0;
    perfFrames=0;

    if(perfCooldown<=0){
      const baseRatio=houseMode ? housePixelRatio : currentPixelRatio;
      let nextRatio=baseRatio;
      const minRatio=houseMode
        ? MIN_HOUSE_PIXEL_RATIO
        : LOW_END_PERFORMANCE?.34:.42;
      const maxRatio=houseMode ? HOUSE_PIXEL_RATIO : BASE_PIXEL_RATIO;

      if(fps<PERFORMANCE_TARGET_FPS-8){
        nextRatio=Math.max(minRatio,baseRatio-(LOW_END_PERFORMANCE?.06:.08));
      }else if(fps>PERFORMANCE_TARGET_FPS+12){
        nextRatio=Math.min(maxRatio,baseRatio+(LOW_END_PERFORMANCE?.035:.08));
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

    if(LOW_END_PERFORMANCE){
      houseRenderCullAt-=dt;
      if(houseRenderCullAt<=0){
        houseRenderCullAt=.12;
        updateHouseRenderCulling();
      }
    }

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
  }else if(!tutorialOpenRoomActive){
    player.extraCollisionBoxes=[];
  }

  // Animate stairwell doors and update their collider before player movement.
  world.updateStairwellDoors(dt);

  player.inputEnabled=(
    gameStarted &&
    !gameEnded &&
    !phoneOpen &&
    !controlsOpen &&
    !chatOpen &&
    !securityCameras.active &&
    !adminOverlay.classList.contains("open") &&
    !computerSystem.openState
  );
  player.update(dt);
  updateTutorialOpenRoomLights();
  updateAdminFly(dt);
  updateAdminProjectiles(dt);
  updateTutorialMascot(dt);

  if(backroomsFallTimer>0 && gameStarted && houseMode){
    camera.position.y+=fallCameraOffset;
  }

  multiplayer.update(dt);
  interaction.update(dt);
  navigation.update(dt);

  if(multiplayerMapOpen){
    multiplayerMapRefreshTimer-=dt;
    if(multiplayerMapRefreshTimer<=0){
      multiplayerMapRefreshTimer=.10;
      updateMultiplayerMap();
    }
  }

  // Keep the flashlight cone exactly centered on the camera/crosshair.
    if(!houseMode && storyRefreshElapsed>=(
    LOW_END_PERFORMANCE?.08:.02
  )){
    storyRefreshElapsed=0;
    updateStoryProgress();
  }

  if(gameStarted){
    if(t-lastAutoSave>20){
      lastAutoSave=t;
      saveGame(undefined,{confirmOverwrite:false});
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
      world.updateAtmosphereEffects(dt,player.pos.x,player.pos.z);
    }
  }
  audio && audio.ctx && audio.ctx.state==="suspended" && audio.start();
  audio.update(dt,{
    playing:gameStarted,
    threat:spiderActive&&!houseMode,
    threatDistance:spiderActive&&!houseMode
      ? Math.hypot(
          player.pos.x-spiderEntity.position.x,
          player.pos.z-spiderEntity.position.z
        )
      : Infinity
  });

  if(flashlightOn && battery>0){
    battery=Math.max(0,battery-dt*.30);
  }else{
    battery=Math.min(100,battery+dt*1.0);
  }
  if(battery<=0 && flashlightOn){
    flashlightOn=false;
    player.setFlashlightVisual(false);
    multiplayer.sendState(true);
  }

  applyRemoteSpiderSnapshot(dt);
  const flicker=flashlightFlicker(t);
  const lowBattery=Math.pow(THREE.MathUtils.clamp((35-battery)/35,0,1),1.15);

  // Low battery should feel unstable, not become a high-frequency strobe.
  // Keep the modulation deliberately slow and smooth so the beam breathes
  // between dim/bright states instead of snapping dozens of times per second.
  const lowBatteryWave=
    .5+
    .5*Math.sin(
      t*(1.15+lowBattery*1.1)+
      Math.sin(t*.37)*.7+
      battery*.035
    );
  const lowBatteryDrop=
    lowBattery>0
      ? THREE.MathUtils.lerp(1,.58,lowBattery*lowBatteryWave)
      : 1;

  let flashlightStrength=20.0*flicker*lowBatteryDrop;

  if(flashlightOn && !houseMode && spiderActive){
    const spiderDistance=Math.hypot(
      player.pos.x-spiderEntity.position.x,
      player.pos.z-spiderEntity.position.z
    );

    // Normal outside the danger zone, then rapidly dim as the spider closes in.
    const proximity=THREE.MathUtils.clamp(
      (16-spiderDistance)/14,
      0,
      1
    );
    const dimmedStrength=THREE.MathUtils.lerp(
      flashlightStrength,
      5.0*flicker,
      proximity*proximity
    );

    flashlightStrength=dimmedStrength;

    if(spiderJumpscareTimer>0){
      flashlightStrength=6.0*flicker;
    }
  }

  flashlight.intensity=flashlightOn ? flashlightStrength : 0;
  flashlight.visible=flashlightOn && battery>0;
  // The beam now follows the hand-held torch rather than a camera-center fill.
  // Keep beam range and aim stable. Wall-hit occlusion was changing the
  // spotlight target dozens of times per second and could make surfaces snap
  // or flicker as the center ray crossed a wall edge.
  let activeFlashlightDistance=FLASHLIGHT_BASE_DISTANCE;
  if(tutorialOpenRoomActive){
    camera.getWorldPosition(tutorialOpenRoomLightOrigin);
    camera.getWorldDirection(tutorialOpenRoomLightDirection);
    if(tutorialOpenRoomLightDirection.y>.001){
      const ceilingDistance=(WALL_H-.06-tutorialOpenRoomLightOrigin.y) /
        tutorialOpenRoomLightDirection.y;
      if(Number.isFinite(ceilingDistance) && ceilingDistance>0.25){
        activeFlashlightDistance=Math.min(
          activeFlashlightDistance,
          ceilingDistance
        );
      }
    }
  }
  flashlight.distance=activeFlashlightDistance;
  flashlight.target.position.set(0,0,-activeFlashlightDistance);
  if(
    spiderMixer &&
    spiderActive
  ){
    spiderMixer.timeScale=1;
    spiderMixer.update(dt);
    if(spiderOverlapMixer){
      spiderOverlapMixer.timeScale=1;
      spiderOverlapMixer.update(dt);
    }

    // Kill a bad animation immediately instead of allowing one corrupted
    // bone transform to poison every rendered frame.
    let animationHealthy=true;
    if(spiderModel){
      spiderModel.traverse(obj=>{
        if(!animationHealthy || !obj.isSkinnedMesh || !obj.skeleton) return;
        for(const bone of obj.skeleton.bones){
          const values=[
            bone.position.x,bone.position.y,bone.position.z,
            bone.quaternion.x,bone.quaternion.y,bone.quaternion.z,bone.quaternion.w,
            bone.scale.x,bone.scale.y,bone.scale.z
          ];
          if(values.some(value=>!Number.isFinite(value)) ||
             Math.abs(bone.position.x)>100 ||
             Math.abs(bone.position.y)>100 ||
             Math.abs(bone.position.z)>100 ||
             Math.abs(bone.scale.x)>20 ||
             Math.abs(bone.scale.y)>20 ||
             Math.abs(bone.scale.z)>20){
            animationHealthy=false;
            return;
          }
        }
      });
    }

    if(!animationHealthy){
      console.warn("[DeepSeeker] disabling unstable spider animation frame");
      spiderMixer.stopAllAction();
      spiderMixer=null;
      if(spiderOverlapMixer) spiderOverlapMixer.stopAllAction();
      spiderOverlapMixer=null;
      spiderOverlapActions.clear();
      spiderActions.clear();
      spiderAnimationClips.clear();
      spiderAnimationState="";
      spiderWantedState="idle";
    }
  }

  if(!tutorialOpenRoomActive){
    if(multiplayer.isWorldAuthority() && !houseMode){
      if(spiderActive){
        spiderBehaviorTime+=dt;

        if(spiderCaughtFreezeTimer>0){
          player.movementFrozen=true;
          player.pos.copy(spiderCaughtPlayerPosition);
          player.vel.set(0,0,0);
          player.keys.clear();
          player.jumpY=0;
          player.jumpVelocity=0;
          spiderCaughtFreezeTimer=Math.max(0,spiderCaughtFreezeTimer-dt);
          if(spiderCaughtFreezeTimer<=0){
            player.movementFrozen=false;
            resetPlayerAfterSpiderCatch();
          }
        }else{
          normalSpiderHunter.updateHunter(dt,t,player,{
            sprinting:player.isRunning,
            flashlightOn,
            crouched:player.crouched
          });
          normalSpiderHunter.step(dt);

          // Use the scaled body hitbox; the long legs remain visual-only.
          if(normalSpiderHunter.distanceToHitbox(player.pos.x,player.pos.z)<=.06){
            startSpiderCatchFreeze();
          }else if(
            spiderBehaviorTime>=SPIDER_NORMAL_ENCOUNTER_MAX_TIME
          ){
            spiderActive=false;
            spiderBehaviorState="idle";
            spiderCaughtFreezeTimer=0;
            spiderRevealLight.visible=false;
            spiderRevealLight.intensity=0;
            normalSpiderHunter.hide();
            spiderEntity.visible=false;
            clearSpiderPath();
            nextEvent=clock.elapsedTime+24+Math.random()*28;
            showSpiderScareMessage("THE SIGNAL FADES.",850);
          }
        }

        if(spiderActive){
          normalSpiderHunter.visualRig.root.visible=false;
          spiderEntity.visible=true;
          spiderBehaviorState=
            normalSpiderHunter.mode==="roam" && normalSpiderHunter.speed<.15 ? "peek" :
            normalSpiderHunter.mode==="hidden" ? "idle" : "chase";
          if(normalSpiderHunter.mode==="roam" || normalSpiderHunter.mode==="investigate"){
            setSpiderAnimation(normalSpiderHunter.speed>.22 ? "chase" : "stalk");
          }
          spiderVisibleToPlayer=playerHasLineOfSightToSpider(spiderEntity);
          // Keep the normal model renderable; wall depth testing handles real
          // occlusion without making the whole spider vanish on a raycast hit.
          if(spiderModel) spiderModel.visible=true;
          spiderRevealLight.visible=
            spiderVisibleToPlayer &&
            (normalSpiderHunter.mode==="hunt" || normalSpiderHunter.mode==="enrage");
          spiderRevealLight.intensity=spiderRevealLight.visible ? 4.2 : 0;
        }else{
          spiderEntity.visible=false;
          spiderRevealLight.visible=false;
          spiderRevealLight.intensity=0;
        }
      }else{
        if(normalSpiderHunter.mode!=="hidden" || spiderEntity.visible){
          normalSpiderHunter.hide();
        }
        spiderEntity.visible=false;
        spiderRevealLight.visible=false;
        spiderRevealLight.intensity=0;
        spiderVisibleToPlayer=true;
        spiderBehaviorState="idle";
        spiderBehaviorTime=0;
        spiderJumpscareTimer=0;
        spiderCaughtFreezeTimer=0;
        clearSpiderPath();
        spiderEntity.rotation.x=0;
        spiderEntity.scale.setScalar(1);
        if(spiderModel) spiderModel.visible=true;
      }
    }else if(spiderActive && !houseMode){
      // Clients only interpolate the authority's snapshot; AI stays host-owned.
      normalSpiderHunter.visualRig.root.visible=false;
      normalSpiderHunter.step(dt);
    }else{
      if(normalSpiderHunter.mode!=="hidden") normalSpiderHunter.hide();
      spiderEntity.visible=false;
      spiderRevealLight.visible=false;
      spiderRevealLight.intensity=0;
    }
  }

  publishMultiplayerSpiderSnapshot(dt);

  // The normal spider system is Backrooms-only. The apartment gets one
  // deliberately scripted teaching encounter on top of it.
  if(houseMode || tutorialOpenRoomActive){
    if(tutorialOpenRoomActive){
      spiderEntity.visible=false;
      spiderRevealLight.visible=false;
    }
    updateHouseTutorialSpider(dt);
    spiderHunter.step(dt);
    if(
      tutorialSpiderMixer &&
      tutorialSpiderActual?.visible &&
      houseTutorialSpiderState==="chase" &&
      !arachnophobiaMode
    ){
      tutorialSpiderMixer.update(dt);
    }
  }

  if(eventCooldown>0) eventCooldown-=dt;
  if(!houseMode && !tutorialOpenRoomActive && !spiderActive &&
     eventCooldown<=0 && t>nextEvent){
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

  if(uiRefreshElapsed>=(
    LOW_END_PERFORMANCE?.075:.033
  )){
    uiRefreshElapsed=0;
    const stamina=player.stamina;
    staminaBar.style.width=stamina+"%";
    staminaValue.textContent=Math.round(stamina);
    batteryBar.style.width=battery+"%";
    batteryValue.textContent=Math.round(battery)+"%";
    batteryBar.style.opacity=flashlightOn?1:.45;
  }

  if(urlParams.get("perf")==="1" && debugPerfElapsed>=.5){
    debugPerfElapsed=0;
    console.debug("[DeepSeeker PERF]",{
      fps:Math.round(perfFrames/Math.max(perfElapsed,.001)),
      calls:renderer.info.render.calls,
      triangles:renderer.info.render.triangles,
      pixelRatio:houseMode?housePixelRatio:currentPixelRatio,
      lowEnd:LOW_END_PERFORMANCE
    });
  }

  updateSpiderWallClipBounds(dt);

  renderer.render(scene,camera);
}
beginInitialLoading();
animate();

window.addEventListener("beforeunload",()=>{
  if(gameStarted) saveGame(undefined,{confirmOverwrite:false});
});

// URL-based save continuation is consumed by finishInitialLoading() only
// after the selected save's assets and starting world region are ready.

window.__deepseeker={
  player,
  world,
  camera,
  menuCamera,
  renderer,
  seed:SEED,
  house:{model:()=>houseModel,spawn:()=>houseSpawn,active:()=>houseMode,toggle:()=>setHouseMode(!houseMode)}
};
