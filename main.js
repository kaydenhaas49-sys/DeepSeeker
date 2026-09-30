import * as THREE from "three";
import { World, EYE } from "./world.js";
import { Player } from "./player.js";
import { HorrorAudio } from "./audio.js";

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

const hemi=new THREE.HemisphereLight(0xc2b889,0x211d12,.32);
scene.add(hemi);
const ambient=new THREE.AmbientLight(0x8f815d,.12);
scene.add(ambient);

const playerLight=new THREE.PointLight(0xb59b68,7.5,24,1.9);
scene.add(playerLight);

const flashlight=new THREE.SpotLight(0xf0dfad,11.5,34,Math.PI/6,.82,1.5);
flashlight.castShadow=true;
flashlight.shadow.mapSize.set(512,512);
flashlight.target.position.set(0,0,-1);
camera.add(flashlight);
camera.add(flashlight.target);
scene.add(camera);

const player=new Player(camera,renderer.domElement,world);
const audio=new HorrorAudio();

player.hands.visible=true;


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
  if(e.code==="KeyF" && !phoneOpen) toggleFlashlight();
  else if(e.code==="KeyM" && !phoneOpen){ muted=audio.toggleMute(); }
  else if(e.code==="KeyN" && !phoneOpen){ newSeed(); }
  else if(e.code==="KeyP" && !e.repeat) togglePhone();
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
  updateStoryProgress();
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
  flashlight.intensity=flashlightOn ? 11.0*flicker : 0;
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
    vignette.style.opacity=String(.70+.07*pulse);
    camera.position.x+=Math.sin(t*70)*pulse*.008;
    camera.position.y+=Math.sin(t*61)*pulse*.006;
    hemi.intensity=.13*(1-pulse*.55);
    ambient.intensity=.045*(1-pulse*.65);
  }else{
    vignette.style.opacity=".70";
    hemi.intensity=.32;
    ambient.intensity=.12;
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
