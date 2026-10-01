import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const CHARACTER_PATH = "./assets/hazmat_suit_pack-_character_a.glb";
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

  scene.traverse(obj=>{
    if(!obj.isMesh) return;

    obj.castShadow=false;
    obj.receiveShadow=false;
    obj.frustumCulled=true;

    const materials=Array.isArray(obj.material) ? obj.material : [obj.material];
    for(const mat of materials){
      if(!mat) continue;
      mat.toneMapped=true;
    }
  });

  return scene;
}

export function loadHazmatCharacter(){
  if(!templatePromise){
    templatePromise=new Promise((resolve,reject)=>{
      const loader=makeLoader();

      loader.load(
        CHARACTER_PATH,
        gltf=>{
          try{
            resolve({
              scene:normalizeTemplate(gltf.scene),
              animations:gltf.animations || []
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
  let best=null;

  root.traverse(obj=>{
    if(!obj.isBone || best) return;
    const n=(obj.name || "").toLowerCase().replace(/[^a-z0-9]/g,"");

    if(
      /righthand|rightwrist|handr$|wristr$|mixamorigrighthand/.test(n)
    ){
      best=obj;
    }
  });

  if(best) return best;

  root.traverse(obj=>{
    if(!obj.isBone || best) return;
    const n=(obj.name || "").toLowerCase();
    if(/hand|wrist/.test(n)) best=obj;
  });

  return best;
}

export function attachFlashlight(model){
  const hand=findRightHandBone(model);
  if(!hand) return null;

  const bodyMat=new THREE.MeshStandardMaterial({
    color:0x171917,
    roughness:.6,
    metalness:.35
  });

  const ringMat=new THREE.MeshStandardMaterial({
    color:0x55564c,
    roughness:.38,
    metalness:.7
  });

  const lensMat=new THREE.MeshStandardMaterial({
    color:0xf4e8be,
    emissive:0xd8bd72,
    emissiveIntensity:2.4,
    roughness:.28,
    metalness:.04
  });

  const flashlight=new THREE.Group();
  flashlight.name="HeldFlashlight";
  flashlight.position.set(.055,-.07,-.13);
  flashlight.rotation.set(
    THREE.MathUtils.degToRad(-8),
    THREE.MathUtils.degToRad(-2),
    THREE.MathUtils.degToRad(2)
  );

  const body=new THREE.Mesh(
    new THREE.CylinderGeometry(.055,.066,.50,10),
    bodyMat
  );
  body.rotation.x=Math.PI/2;

  const head=new THREE.Mesh(
    new THREE.CylinderGeometry(.092,.067,.15,10),
    bodyMat
  );
  head.rotation.x=Math.PI/2;
  head.position.z=-.30;

  const bezel=new THREE.Mesh(
    new THREE.TorusGeometry(.094,.011,6,14),
    ringMat
  );
  bezel.rotation.x=Math.PI/2;
  bezel.position.z=-.375;

  const lens=new THREE.Mesh(
    new THREE.CylinderGeometry(.073,.073,.022,12),
    lensMat
  );
  lens.name="FlashlightLens";
  lens.rotation.x=Math.PI/2;
  lens.position.z=-.388;

  const rear=new THREE.Mesh(
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

function findBone(root, patterns){
  const list=Array.isArray(patterns)?patterns:[patterns];
  let found=null;

  root.traverse(obj=>{
    if(found || !obj.isBone) return;
    const n=(obj.name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
    if(list.some(rx=>rx.test(n))) found=obj;
  });

  return found;
}

function findDescendantBone(root, patterns){
  return findBone(root, patterns);
}

function getBoneChild(bone){
  if(!bone) return null;
  for(const child of bone.children){
    if(child.isBone) return child;
  }
  return null;
}

function aimBoneAtWorldDirection(bone, worldDirection){
  const child=getBoneChild(bone);
  if(!bone || !child) return false;

  const current=child.getWorldPosition(new THREE.Vector3())
    .sub(bone.getWorldPosition(new THREE.Vector3()))
    .normalize();

  const target=worldDirection.clone().normalize();
  if(current.lengthSq() < 1e-8 || target.lengthSq() < 1e-8) return false;

  const delta=new THREE.Quaternion().setFromUnitVectors(current,target);
  const worldQ=bone.getWorldQuaternion(new THREE.Quaternion());
  worldQ.premultiply(delta);

  if(bone.parent){
    const parentQ=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(parentQ.multiply(worldQ));
  }else{
    bone.quaternion.copy(worldQ);
  }

  return true;
}

function applyNeutralMixamoPose(model){
  model.updateMatrixWorld(true);

  const leftUpper=findBone(model,[
    /mixamorigleftarm$/,/mixamorigleftupperarm$/,/leftupperarm$/,/leftarm$/
  ]);
  const rightUpper=findBone(model,[
    /mixamorigrightarm$/,/mixamorigrightupperarm$/,/rightupperarm$/,/rightarm$/
  ]);

  const leftForearm=findBone(model,[
    /mixamorigleftforearm$/,/leftforearm$/,/leftlowerarm$/,/leftelbow/
  ]);
  const rightForearm=findBone(model,[
    /mixamorigrightforearm$/,/rightforearm$/,/rightlowerarm$/,/rightelbow/
  ]);

  // Do not assume a particular Mixamo Euler axis. Instead, aim each
  // arm segment from its actual current bind-pose direction into a
  // natural relaxed/downward pose.
  const leftDown=new THREE.Vector3(-0.08,-0.98,-0.12).normalize();
  const rightDown=new THREE.Vector3(0.08,-0.98,-0.12).normalize();
  const leftHandDir=new THREE.Vector3(-0.12,-0.96,-0.22).normalize();
  const rightHandDir=new THREE.Vector3(0.12,-0.96,-0.22).normalize();

  aimBoneAtWorldDirection(leftUpper,leftDown);
  aimBoneAtWorldDirection(rightUpper,rightDown);

  model.updateMatrixWorld(true);

  aimBoneAtWorldDirection(leftForearm,leftHandDir);
  aimBoneAtWorldDirection(rightForearm,rightHandDir);

  model.updateMatrixWorld(true);
}

function pickIdleAnimation(clips){
  if(!clips?.length) return null;

  const ranked=clips.map((clip,index)=>{
    const n=(clip.name||"").toLowerCase();
    let score=0;

    if(/idle|standing|stand|rest|neutral|breath/.test(n)) score+=1000;
    if(/walk|walking/.test(n)) score+=50;
    if(/run|running|sprint|jog|jump|fall|attack|hit|death|roll|slide/.test(n)) score-=1000;

    if(clip.duration>=1 && clip.duration<=8) score+=20;
    score-=index*.01;

    return {clip,score};
  });

  ranked.sort((x,y)=>y.score-x.score);
  return ranked[0]?.score>=500 ? ranked[0].clip : null;
}

export function createRemoteFlashlight(scene){
  const target=new THREE.Object3D();
  const light=new THREE.SpotLight(0xf0dfad,27,60,Math.PI/5.5,.88,1.5);
  light.castShadow=false;
  scene.add(light);
  scene.add(target);
  light.target=target;

  return {
    light,
    target,
    origin:new THREE.Vector3(),
    direction:new THREE.Vector3()
  };
}

export function updateRemoteFlashlight(remoteLight, origin, yaw, pitch, enabled){
  remoteLight.light.position.copy(origin);
  remoteLight.direction.set(
    -Math.sin(yaw)*Math.cos(pitch),
    -Math.sin(pitch),
    -Math.cos(yaw)*Math.cos(pitch)
  );
  remoteLight.target.position.copy(origin).addScaledVector(remoteLight.direction,60);
  remoteLight.light.visible=enabled;
  remoteLight.light.intensity=enabled ? 27 : 0;
}

export function disposeRemoteFlashlight(scene, remoteLight){
  if(!remoteLight) return;
  scene.remove(remoteLight.light);
  scene.remove(remoteLight.target);
}

export function flashlightFlicker(time){
  return .78 + .22 * Math.sin(time * 12.0) * Math.sin(time * 5.2);
}

export async function createHazmatCharacter(){
  const template=await loadHazmatCharacter();
  const model=cloneSkeleton(template.scene);

  // The supplied rig has a bind-pose/animation combination that can
  // snap back to a T-pose. Use a deterministic relaxed pose instead
  // until a verified humanoid idle clip is available.
  const idleClip=null;
  const mixer=null;
  const action=null;

  applyNeutralMixamoPose(model);

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
