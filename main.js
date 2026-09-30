import * as THREE from "three";
import { World, EYE } from "./world.js";
import { Player } from "./player.js";

const seedParam=new URLSearchParams(location.search).get("seed");
const SEED=seedParam!==null&&seedParam!==""?(parseInt(seedParam,10)||0):1337;

const container=document.getElementById("app");
const overlay=document.getElementById("overlay");
const prompt=document.getElementById("prompt");
const crosshair=document.getElementById("crosshair");

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.95;
renderer.outputColorSpace=THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x020202);
scene.fog=new THREE.Fog(0x050505,22,76);

const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.1,300);
const world=new World(scene,SEED,renderer.capabilities.getMaxAnisotropy());

scene.add(new THREE.HemisphereLight(0xfff0c0,0x6b5f38,.48));
scene.add(new THREE.AmbientLight(0xffd9a0,.25));

const playerLight=new THREE.PointLight(0xffe6b0,33,38,1.8);
scene.add(playerLight);

const player=new Player(camera,renderer.domElement,world);
player.attach();

overlay.addEventListener("click",()=>player.lock());

document.addEventListener("pointerlockchange",()=>{
  const locked=document.pointerLockElement===renderer.domElement;
  overlay.classList.toggle("hidden",locked);
  crosshair.style.display=locked?"block":"none";
  prompt.textContent=locked?"CLICK TO ENTER":"CLICK TO RESUME";
});

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
  playerLight.position.set(player.pos.x,EYE+.4,player.pos.z);
  renderer.render(scene,camera);
}
animate();

window.__deepseeker={player,world,camera,renderer,seed:SEED};
