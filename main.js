import * as THREE from "three";
import { World, EYE } from "./world.js";
import { Player } from "./player.js";
import { HorrorAudio } from "./audio.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.56;
renderer.outputColorSpace=THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x000100);
scene.fog=new THREE.Fog(0x000100,7,34);

const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.08,300);
const world=new World(scene,SEED,renderer.capabilities.getMaxAnisotropy());

const hemi=new THREE.HemisphereLight(0xb1a47d,0x060604,.085);
scene.add(hemi);
const ambient=new THREE.AmbientLight(0x7f7354,.022);
scene.add(ambient);

const playerLight=new THREE.PointLight(0xa88d63,2.8,18,1.9);
scene.add(playerLight);

const flashlight=new THREE.SpotLight(0xe2cf9e,5.2,24,Math.PI/6,.82,1.5);
flashlight.castShadow=true;
flashlight.shadow.mapSize.set(512,512);
flashlight.target.position.set(0,0,-1);
camera.add(flashlight);
camera.add(flashlight.target);
scene.add(camera);

const player=new Player(camera,renderer.domElement,world);
const audio=new HorrorAudio();

player.hands.visible=false;

const armsLoader=new GLTFLoader();
const armsUrl="https://raw.githubusercontent.com/Grumoth/godot-character-creator/master/MainCharacter/Mesh/Parts/arms.glb";

armsLoader.load(
  armsUrl,
  (gltf)=>{
    const arms=gltf.scene;
    arms.name="ImportedRealArms";

    arms.traverse((obj)=>{
      if(!obj.isMesh) return;
      obj.castShadow=false;
      obj.receiveShadow=false;

      // The source file contains a whole humanoid rig. Keep only the
      // visible upper-body/arm pieces for the first-person viewmodel.
      const n=(obj.name||"").toLowerCase();
      if(/leg|thigh|shin|foot|toe|pelvis|head|neck|torso|spine|shoulder/.test(n)){
        obj.visible=false;
      }
    });

    arms.position.set(0,-1.38,-1.08);
    arms.rotation.set(0,Math.PI,0);
    arms.scale.setScalar(.42);

    camera.add(arms);
    player.importedArms=arms;
  },
  undefined,
  (err)=>console.warn("Could not load imported arms:",err)
);

const figure=new THREE.Group();
const figureMat=new THREE.MeshStandardMaterial({color:0x020202,roughness:1,metalness:0});
const figureBody=new THREE.Mesh(new THREE.CapsuleGeometry(.28,.95,6,10),figureMat);
figureBody.position.y=1.05;
const figureHead=new THREE.Mesh(new THREE.SphereGeometry(.24,10,8),figureMat);
figureHead.position.y=1.85;
figure.add(figureBody,figureHead);
figure.visible=false;
scene.add(figure);

let figureLife=0;
player.onStep=({intensity})=>audio.step(intensity);

let flashlightOn=true;
let battery=100;
let controlsOpen=false;
let pulse=0;
let nextEvent=24+Math.random()*16;
let eventCooldown=0;
let muted=false;

function toggleFlashlight(){
  flashlightOn=!flashlightOn;
}

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

overlay.addEventListener("click",()=>{
  audio.start();
  player.lock();
});

controls.addEventListener("click",e=>{
  if(e.target===controls) hideControls();
});

document.addEventListener("pointerlockchange",()=>{
  const locked=document.pointerLockElement===renderer.domElement;
  if(!controlsOpen) overlay.classList.toggle("hidden",locked);
  crosshair.style.display=locked?"block":"none";
  prompt.textContent="CLICK TO RESUME";
});

document.addEventListener("keydown",e=>{
  if(e.code==="KeyF") toggleFlashlight();
  else if(e.code==="KeyM"){ muted=audio.toggleMute(); }
  else if(e.code==="KeyN"){ newSeed(); }
  else if(e.code==="Tab"){
    e.preventDefault();
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
  setTimeout(()=>{eventText.style.opacity="0";},1800);
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

  player.update(dt);
  world.update(player.pos.x,player.pos.z);
  world.updateFlicker(t);
  audio && audio.ctx && audio.ctx.state==="suspended" && audio.start();

  if(flashlightOn && battery>0){
    battery=Math.max(0,battery-dt*.72);
  }else{
    battery=Math.min(100,battery+dt*.38);
  }
  if(battery<=0) flashlightOn=false;

  const flicker=.78+.22*Math.sin(t*17.1)*Math.sin(t*7.3);
  flashlight.intensity=flashlightOn ? 5.2*flicker : 0;
  playerLight.position.set(player.pos.x,EYE+.35,player.pos.z);

  if(figureLife>0){
    figureLife=Math.max(0,figureLife-dt);
    figure.visible=true;
    const fade=figureLife>0.85 ? 1 : figureLife/0.85;
    figure.scale.setScalar(.96 + .08*Math.sin(t*12));
    figureBody.material.opacity=fade;
    figureHead.material.opacity=fade;
    figureBody.material.transparent=true;
    figureHead.material.transparent=true;
  }else{
    figure.visible=false;
  }

  if(eventCooldown>0) eventCooldown-=dt;
  if(eventCooldown<=0 && t>nextEvent){
    triggerEvent();
    nextEvent=t+28+Math.random()*35;
  }

  if(pulse>0){
    pulse=Math.max(0,pulse-dt*2.8);
    vignette.style.opacity=String(.94+.05*pulse);
    camera.position.x+=Math.sin(t*70)*pulse*.008;
    camera.position.y+=Math.sin(t*61)*pulse*.006;
    hemi.intensity=.055*(1-pulse*.85);
    ambient.intensity=.012*(1-pulse*.92);
  }else{
    vignette.style.opacity=".94";
    hemi.intensity=.055;
    ambient.intensity=.012;
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

window.__deepseeker={player,world,camera,renderer,seed:SEED};
