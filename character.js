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

function pickIdleAnimation(clips){
  // This hazmat asset exports one animation clip and it is a locomotion
  // cycle, not a true idle. Use it only to establish a useful standing pose;
  // createHazmatCharacter() freezes that pose immediately.
  return clips?.[0] || null;
}
function findBone(root, pattern){
  let found=null;
  root.traverse(obj=>{
    if(found || !obj.isBone) return;
    if(pattern.test((obj.name || "").toLowerCase())) found=obj;
  });
  return found;
}

function pointBoneToward(bone, targetDirection){
  if(!bone) return false;
  const child=bone.children.find(child=>child.isBone);
  if(!child) return false;

  bone.updateMatrixWorld(true);
  child.updateMatrixWorld(true);

  const from=new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
  const to=new THREE.Vector3().setFromMatrixPosition(child.matrixWorld);
  const current=to.sub(from);
  if(current.lengthSq()<1e-8) return false;
  current.normalize();

  const target=targetDirection.clone().normalize();
  const delta=new THREE.Quaternion().setFromUnitVectors(current,target);

  const worldQuat=new THREE.Quaternion();
  bone.getWorldQuaternion(worldQuat);
  worldQuat.premultiply(delta);

  if(bone.parent){
    const parentWorld=new THREE.Quaternion();
    bone.parent.getWorldQuaternion(parentWorld);
    parentWorld.invert();
    bone.quaternion.copy(parentWorld.multiply(worldQuat));
  }else{
    bone.quaternion.copy(worldQuat);
  }

  bone.updateMatrixWorld(true);
  return true;
}

function applyNeutralStandingPose(model){
  const leftArm=findBone(model,/(?:mixamorig[:._-]?)?leftarm$/i) ||
               findBone(model,/left.*upper.*arm|upper.*arm.*left/i);
  const rightArm=findBone(model,/(?:mixamorig[:._-]?)?rightarm$/i) ||
                findBone(model,/right.*upper.*arm|upper.*arm.*right/i);

  const leftForeArm=findBone(model,/(?:mixamorig[:._-]?)?leftforearm$/i) ||
                    findBone(model,/left.*forearm|left.*lower.*arm/i);
  const rightForeArm=findBone(model,/(?:mixamorig[:._-]?)?rightforearm$/i) ||
                     findBone(model,/right.*forearm|right.*lower.*arm/i);

  // Drop the arms from the rig's T/rest position to a relaxed standing pose.
  pointBoneToward(leftArm,new THREE.Vector3(0.10,-0.99,0.03));
  model.updateMatrixWorld(true);
  pointBoneToward(rightArm,new THREE.Vector3(-0.10,-0.99,0.03));
  model.updateMatrixWorld(true);

  // Give the elbows a tiny natural bend rather than perfectly straight arms.
  pointBoneToward(leftForeArm,new THREE.Vector3(0.08,-0.98,0.10));
  model.updateMatrixWorld(true);
  pointBoneToward(rightForeArm,new THREE.Vector3(-0.08,-0.98,0.10));
  model.updateMatrixWorld(true);
}

export async function createHazmatCharacter(){
  const template = await loadHazmatCharacter();
  const model = cloneSkeleton(template.scene);

  // Do not use the asset's single locomotion clip. It has no real idle
  // animation, so any sampled frame looks like a frozen running pose.
  // Instead, pose the rig itself into a neutral standing stance.
  applyNeutralStandingPose(model);

  const flashlight = attachFlashlight(model);

  return {
    model,
    mixer: null,
    action: null,
    flashlight,
    animations: template.animations,
    idleClip: null
  };
}
