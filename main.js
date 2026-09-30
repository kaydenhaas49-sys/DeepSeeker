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

// Keep the built-in arms visible until the external model has loaded successfully.

function makeFirstPersonHands(){
  const canvas=document.createElement("canvas");
  canvas.width=1600;
  canvas.height=900;
  const ctx=canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const skin="#c99778";
  const skinLight="#dfb092";
  const skinDark="#9b6953";
  const sleeve="#15181b";

  function hand(side){
    ctx.save();
    if(side==="left"){
      ctx.translate(0,0);
    }else{
      ctx.translate(1600,0);
      ctx.scale(-1,1);
    }

    // Forearm / sleeve
    ctx.fillStyle=sleeve;
    ctx.beginPath();
    ctx.moveTo(95,900);
    ctx.lineTo(210,900);
    ctx.quadraticCurveTo(300,820,345,700);
    ctx.lineTo(455,610);
    ctx.lineTo(325,545);
    ctx.quadraticCurveTo(240,650,175,760);
    ctx.quadraticCurveTo(125,830,95,900);
    ctx.fill();

    // Forearm skin
    const grad=ctx.createLinearGradient(250,850,450,500);
    grad.addColorStop(0,skinDark);
    grad.addColorStop(.32,skin);
    grad.addColorStop(.72,skinLight);
    grad.addColorStop(1,skin);
    ctx.fillStyle=grad;

    ctx.beginPath();
    ctx.moveTo(250,900);
    ctx.quadraticCurveTo(265,815,330,715);
    ctx.quadraticCurveTo(380,635,435,570);
    ctx.lineTo(540,620);
    ctx.quadraticCurveTo(475,700,430,775);
    ctx.quadraticCurveTo(390,845,375,900);
    ctx.closePath();
    ctx.fill();

    // Palm
    ctx.beginPath();
    ctx.moveTo(395,650);
    ctx.quadraticCurveTo(365,595,385,535);
    ctx.quadraticCurveTo(405,480,455,455);
    ctx.quadraticCurveTo(505,432,558,458);
    ctx.quadraticCurveTo(603,481,620,532);
    ctx.quadraticCurveTo(636,582,614,640);
    ctx.quadraticCurveTo(590,690,530,708);
    ctx.quadraticCurveTo(455,720,395,650);
    ctx.fill();

    // Fingers: relaxed, slightly curled, short and broad
    const fingers=[
      {x:585,y:505,w:48,h:145,a:-.16},
      {x:540,y:463,w:49,h:158,a:-.08},
      {x:492,y:450,w:48,h:164,a:.02},
      {x:445,y:463,w:46,h:150,a:.10}
    ];
    for(const f of fingers){
      ctx.save();
      ctx.translate(f.x,f.y);
      ctx.rotate(f.a);
      const fg=ctx.createLinearGradient(0,0,0,f.h);
      fg.addColorStop(0,skinLight);
      fg.addColorStop(.72,skin);
      fg.addColorStop(1,skinDark);
      ctx.fillStyle=fg;
      ctx.beginPath();
      ctx.roundRect(-f.w/2,0,f.w,f.h,f.w*.42);
      ctx.fill();
      ctx.strokeStyle="rgba(104,67,53,.22)";
      ctx.lineWidth=5;
      ctx.beginPath();
      ctx.moveTo(-f.w*.27,f.h*.72);
      ctx.quadraticCurveTo(0,f.h*.77,f.w*.27,f.h*.72);
      ctx.stroke();
      ctx.restore();
    }

    // Thumb
    ctx.fillStyle=skin;
    ctx.beginPath();
    ctx.moveTo(410,565);
    ctx.quadraticCurveTo(350,515,305,555);
    ctx.quadraticCurveTo(270,588,315,618);
    ctx.quadraticCurveTo(370,650,430,620);
    ctx.closePath();
    ctx.fill();

    // Palm creases / knuckle detail
    ctx.strokeStyle="rgba(95,61,49,.28)";
    ctx.lineWidth=6;
    ctx.lineCap="round";
    ctx.beginPath();
    ctx.moveTo(425,585);
    ctx.quadraticCurveTo(475,610,545,590);
    ctx.moveTo(445,625);
    ctx.quadraticCurveTo(500,647,555,624);
    ctx.stroke();

    ctx.restore();
  }

  hand("left");
  hand("right");

  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);

  const material=new THREE.MeshBasicMaterial({
    map:texture,
    transparent:true,
    depthTest:false,
    depthWrite:false,
    toneMapped:false
  });

  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.7778,1),material);
  mesh.name="CleanFirstPersonHands";
  mesh.renderOrder=1000;
  mesh.frustumCulled=false;
  camera.add(mesh);

  function fit(){
    const dist=1.0;
    const h=2*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*dist;
    const w=h*camera.aspect;
    const aspect=1600/900;
    const height=Math.max(h,w/aspect)*1.02;
    mesh.scale.set(height*aspect,height,1);
    mesh.position.set(0,-.02,-dist);
  }

  fit();
  return {mesh,fit};
}

const firstPersonHands=makeFirstPersonHands();
player.hands.visible=false;
player.realHands=firstPersonHands.mesh;

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
  flashlight.intensity=flashlightOn ? 11.0*flicker : 0;
  playerLight.position.set(player.pos.x,EYE+.35,player.pos.z);
  if(player.realHands){
    const handSway=Math.sin(t*1.8)*.004;
    const handLift=Math.abs(Math.sin(t*1.8))*.004;
    player.realHands.position.y=-0.02+handLift;
    player.realHands.rotation.z=handSway;
  }

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
