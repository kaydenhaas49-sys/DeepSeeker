import * as THREE from "three";
import { World, EYE } from "./world.js";
import { Player } from "./player.js";
import { HorrorAudio } from "./audio.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

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

const handLoader=new GLTFLoader();
const handUrl="https://raw.githubusercontent.com/blechdom/morphazoid/c3cd4614959e13b6eed2836ff7452dc9e8f0aea6/assets/gesticulating-hand/hand.glb";

function orientHandModel(model){
  const bones=[];
  model.traverse(obj=>{
    if(obj.isBone) bones.push(obj);
    if(obj.isMesh){
      obj.frustumCulled=false;
      obj.renderOrder=1000;
      const mats=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const mat of mats){
        if(!mat) continue;
        mat.side=THREE.DoubleSide;
        mat.depthTest=false;
        mat.depthWrite=false;
      }
    }
  });

  const findBone=name=>bones.find(b=>b.name===name);
  const wrist=findBone("handR_02");
  const middle=findBone("middle_01");
  const index=findBone("index_01");
  const pinky=findBone("pinky_01");

  if(wrist&&middle&&index&&pinky){
    const wristPoint=wrist.getWorldPosition(new THREE.Vector3());
    const middlePoint=middle.getWorldPosition(new THREE.Vector3());
    const across=index.getWorldPosition(new THREE.Vector3())
      .sub(pinky.getWorldPosition(new THREE.Vector3())).normalize();
    const up=middlePoint.sub(wristPoint).normalize();
    const normal=new THREE.Vector3().crossVectors(across,up).normalize();
    const right=new THREE.Vector3().crossVectors(up,normal).normalize();
    model.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right,up,normal).invert()
    );
  }

  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model,true);
  const size=box.getSize(new THREE.Vector3());
  const targetLength=.42;
  const scale=targetLength/Math.max(size.y,.001);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
}

handLoader.load(
  handUrl,
  gltf=>{
    const right=SkeletonUtils.clone(gltf.scene);
    const left=SkeletonUtils.clone(gltf.scene);

    orientHandModel(right);
    orientHandModel(left);

    // Mirror the right-hand mesh to create the opposite hand.
    left.scale.x*=-1;

    const handsRoot=new THREE.Group();
    handsRoot.name="RealFirstPersonHands";
    handsRoot.renderOrder=1000;

    right.position.set(.34,-.30,-.82);
    right.rotation.x=-.28;
    right.rotation.y=-.18;
    right.rotation.z=.10;

    left.position.set(-.34,-.30,-.82);
    left.rotation.x=-.28;
    left.rotation.y=.18;
    left.rotation.z=-.10;

    // Simple dark sleeves sit behind the real hand meshes.
    const sleeveMat=new THREE.MeshStandardMaterial({
      color:0x17191c,
      roughness:.95,
      metalness:0,
      depthTest:false,
      depthWrite:false
    });

    const sleeveGeo=new THREE.CylinderGeometry(.115,.135,.48,12);
    const sleeveR=new THREE.Mesh(sleeveGeo,sleeveMat);
    const sleeveL=new THREE.Mesh(sleeveGeo.clone(),sleeveMat);

    sleeveR.position.set(.35,-.46,-.91);
    sleeveL.position.set(-.35,-.46,-.91);
    sleeveR.rotation.z=-.18;
    sleeveL.rotation.z=.18;
    sleeveR.renderOrder=999;
    sleeveL.renderOrder=999;
    sleeveR.frustumCulled=false;
    sleeveL.frustumCulled=false;

    handsRoot.add(sleeveL,sleeveR,left,right);
    camera.add(handsRoot);

    player.hands.visible=false;
    player.realHands=handsRoot;
    player.realLeftHand=left;
    player.realRightHand=right;
  },
  undefined,
  err=>{
    console.warn("Could not load real hand asset:",err);
    player.hands.visible=true;
    player.realHands=null;
  }
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
  flashlight.intensity=flashlightOn ? 11.0*flicker : 0;
  playerLight.position.set(player.pos.x,EYE+.35,player.pos.z);
  if(player.realHands){
    const handSway=Math.sin(t*1.8)*.008;
    const handLift=Math.abs(Math.sin(t*1.8))*.006;
    player.realHands.position.y=handLift;
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
