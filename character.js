import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const CHARACTER_PATH = "./assets/backrooms_rigged_hazmat.glb";
const CHARACTER_HEIGHT = 1.8;

let templatePromise = null;

function makeLoader(){
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(
    "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/gltf/"
  );
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

function normalizeTemplate(scene){
  scene.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const scale = CHARACTER_HEIGHT / Math.max(size.y, 0.001);

  scene.scale.multiplyScalar(scale);
  scene.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(scene);
  const center = scaledBox.getCenter(new THREE.Vector3());

  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= scaledBox.min.y;
  scene.updateMatrixWorld(true);

  scene.traverse((obj)=>{
    if(!obj.isMesh) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = true;

    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for(const mat of materials){
      if(!mat) continue;
      mat.toneMapped = true;
    }
  });

  return scene;
}

export function loadHazmatCharacter(){
  if(!templatePromise){
    templatePromise = new Promise((resolve,reject)=>{
      const loader = makeLoader();

      loader.load(
        CHARACTER_PATH,
        gltf=>{
          try{
            const scene = normalizeTemplate(gltf.scene);
            resolve({
              scene,
              animations: gltf.animations || []
            });
          }catch(error){
            reject(error);
          }
        },
        undefined,
        reject
      );
    });
  }

  return templatePromise;
}

function findRightHandBone(root){
  let best = null;

  root.traverse(obj=>{
    if(!obj.isBone) return;
    const n = (obj.name || "").toLowerCase();

    if(
      /righthand|hand_r|hand\.r|right_hand|mixamorig.*righthand|rightwrist/.test(n)
    ){
      best = best || obj;
    }
  });

  if(best) return best;

  root.traverse(obj=>{
    if(!obj.isBone || best) return;
    const n = (obj.name || "").toLowerCase();
    if(/hand|wrist/.test(n)) best = obj;
  });

  return best;
}

export function attachFlashlight(model){
  const hand = findRightHandBone(model);
  if(!hand) return null;

  const bodyMat = new THREE.MeshStandardMaterial({
    color:0x171917,
    roughness:.6,
    metalness:.35
  });

  const ringMat = new THREE.MeshStandardMaterial({
    color:0x55564c,
    roughness:.38,
    metalness:.7
  });

  const lensMat = new THREE.MeshStandardMaterial({
    color:0xf4e8be,
    emissive:0xd8bd72,
    emissiveIntensity:2.4,
    roughness:.28,
    metalness:.04
  });

  const flashlight = new THREE.Group();
  flashlight.name = "HeldFlashlight";
  flashlight.position.set(.055,-.07,-.13);
  flashlight.rotation.set(
    THREE.MathUtils.degToRad(-8),
    THREE.MathUtils.degToRad(-2),
    THREE.MathUtils.degToRad(2)
  );

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(.055,.066,.50,10),
    bodyMat
  );
  body.rotation.x=Math.PI/2;

  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(.092,.067,.15,10),
    bodyMat
  );
  head.rotation.x=Math.PI/2;
  head.position.z=-.30;

  const bezel = new THREE.Mesh(
    new THREE.TorusGeometry(.094,.011,6,14),
    ringMat
  );
  bezel.rotation.x=Math.PI/2;
  bezel.position.z=-.375;

  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(.073,.073,.022,12),
    lensMat
  );
  lens.name="FlashlightLens";
  lens.rotation.x=Math.PI/2;
  lens.position.z=-.388;

  const rear = new THREE.Mesh(
    new THREE.CylinderGeometry(.064,.064,.04,10),
    ringMat
  );
  rear.rotation.x=Math.PI/2;
  rear.position.z=.278;

  flashlight.add(body,head,bezel,lens,rear);
  flashlight.traverse(obj=>{
    obj.renderOrder=1100;
    if(obj.isMesh) obj.frustumCulled=false;
  });

  hand.add(flashlight);

  return flashlight;
}

function findBoneByPattern(root, patterns){
  const list=Array.isArray(patterns)?patterns:[patterns];
  let found=null;

  root.traverse(obj=>{
    if(found || !obj.isBone) return;
    const name=(obj.name || "").toLowerCase().replace(/[^a-z0-9]/g,"");
    if(list.some(pattern=>pattern.test(name))) found=obj;
  });

  return found;
}

function scoreStandingPose(root, bones){
  root.updateMatrixWorld(true);

  const p={};
  for(const [key,bone] of Object.entries(bones)){
    if(!bone) continue;
    p[key]=new THREE.Vector3();
    bone.getWorldPosition(p[key]);
  }

  let score=0;

  // A standing pose has the two feet close together and at a similar height.
  if(p.leftFoot && p.rightFoot){
    score -= Math.abs(p.leftFoot.x-p.rightFoot.x)*3;
    score -= Math.abs(p.leftFoot.z-p.rightFoot.z)*1.5;
    score -= Math.abs(p.leftFoot.y-p.rightFoot.y)*4;
  }

  // Arms should hang below the shoulders instead of being spread wide.
  if(p.leftShoulder && p.leftHand){
    score += Math.max(0,p.leftShoulder.y-p.leftHand.y)*5;
    score -= Math.abs(p.leftHand.x-p.leftShoulder.x)*1.8;
  }

  if(p.rightShoulder && p.rightHand){
    score += Math.max(0,p.rightShoulder.y-p.rightHand.y)*5;
    score -= Math.abs(p.rightHand.x-p.rightShoulder.x)*1.8;
  }

  // Penalize extreme hand separation, which is common during a running swing.
  if(p.leftHand && p.rightHand){
    score -= Math.max(0,Math.abs(p.leftHand.x-p.rightHand.x)-0.45)*1.5;
  }

  return score;
}

function sampleBestStandingFrame(model,mixer,clip){
  try{
    const bones={
      leftFoot:findBoneByPattern(model,[/leftfoot$/,/leftankle$/,/lefttoes$/]),
      rightFoot:findBoneByPattern(model,[/rightfoot$/,/rightankle$/,/righttoes$/]),
      leftHand:findBoneByPattern(model,[/lefthand$/,/leftwrist$/]),
      rightHand:findBoneByPattern(model,[/righthand$/,/rightwrist$/]),
      leftShoulder:findBoneByPattern(model,[/leftshoulder$/,/leftarm$/,/leftupperarm$/]),
      rightShoulder:findBoneByPattern(model,[/rightshoulder$/,/rightarm$/,/rightupperarm$/])
    };

    const action=mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat,Infinity);
    action.play();

    const samples=32;
    let bestTime=0;
    let bestScore=-Infinity;

    for(let i=0;i<samples;i++){
      const t=(clip.duration*i)/samples;
      mixer.setTime(t);
      const score=scoreStandingPose(model,bones);

      if(Number.isFinite(score) && score>bestScore){
        bestScore=score;
        bestTime=t;
      }
    }

    mixer.setTime(bestTime);
    action.paused=true;
    action.time=bestTime;
    mixer.update(0);

    console.log("[DeepSeeker] hazmat standing frame:",bestTime.toFixed(3),bestScore.toFixed(3));

    return {action,bestTime};
  }catch(error){
    console.warn("[DeepSeeker] hazmat pose sampling failed; using bind pose safely:",error);
    return {action:null,bestTime:0};
  }
}

export async function createHazmatCharacter(){
  const template=await loadHazmatCharacter();
  const model=cloneSkeleton(template.scene);
  const mixer=new THREE.AnimationMixer(model);

  const clip=template.animations?.[0] || null;
  let action=null;
  let idleClip=null;

  if(clip){
    const sampled=sampleBestStandingFrame(model,mixer,clip);
    action=sampled.action;
    idleClip=clip;
  }

  const flashlight=attachFlashlight(model);

  return {
    model,
    mixer,
    action,
    flashlight,
    animations:template.animations,
    idleClip
  };
}
