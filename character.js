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

function normalizeBoneName(name){
  return (name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
}

function findBone(root, patterns){
  const list=Array.isArray(patterns)?patterns:[patterns];
  let found=null;
  let bestScore=-1;

  root.traverse(obj=>{
    if(!obj.isBone) return;

    const n=normalizeBoneName(obj.name);
    for(const pattern of list){
      let score=-1;

      if(pattern instanceof RegExp){
        if(pattern.test(n)) score=pattern.source.length;
      }else{
        const token=normalizeBoneName(pattern);
        if(token && n.includes(token)) score=token.length;
      }

      if(score>bestScore){
        bestScore=score;
        found=obj;
      }
    }
  });

  return found;
}

function findBoneByNameParts(root, parts){
  const candidates=[];
  root.traverse(obj=>{
    if(!obj.isBone) return;
    const n=normalizeBoneName(obj.name);
    const score=parts.reduce((total,part)=>{
      const token=normalizeBoneName(part);
      return total + (n.includes(token) ? token.length : 0);
    },0);
    if(score>0) candidates.push({bone:obj,score});
  });

  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0]?.bone || null;
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

function findArmBoneByHierarchy(root, side){
  const candidates=[];
  root.traverse(obj=>{
    if(!obj.isBone) return;

    const child=getBoneChild(obj);
    if(!child) return;

    const p=obj.getWorldPosition(new THREE.Vector3());
    const c=child.getWorldPosition(new THREE.Vector3());
    const delta=c.clone().sub(p);

    const horizontal=Math.hypot(delta.x,delta.z);
    const vertical=Math.abs(delta.y);
    const sideOk=side==="left" ? delta.x<-.03 : delta.x>.03;
    const heightOk=p.y>.75 && p.y<1.65;
    const armShape=horizontal>.04 && horizontal>vertical*.55;

    if(!sideOk || !heightOk || !armShape) return;

    const n=normalizeBoneName(obj.name);
    let score=horizontal*100;
    if(n.includes("shoulder") || n.includes("arm")) score+=40;
    if(n.includes("forearm") || n.includes("hand") || n.includes("wrist")) score-=80;

    candidates.push({bone:obj,score});
  });

  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0]?.bone || null;
}

function applyNeutralMixamoPose(model){
  model.updateMatrixWorld(true);

  let leftUpper=findBoneByNameParts(model,[
    "mixamorigleftupperarm","mixamorigleftarm","leftupperarm","leftarm","upperarml","arml"
  ]);
  let rightUpper=findBoneByNameParts(model,[
    "mixamorigrightupperarm","mixamorigrightarm","rightupperarm","rightarm","upperarmr","armr"
  ]);

  if(!leftUpper) leftUpper=findArmBoneByHierarchy(model,"left");
  if(!rightUpper) rightUpper=findArmBoneByHierarchy(model,"right");

  const leftForearm=findBoneByNameParts(model,[
    "mixamorigleftforearm","leftforearm","leftlowerarm","leftelbow","forearml"
  ]) || getBoneChild(leftUpper);

  const rightForearm=findBoneByNameParts(model,[
    "mixamorigrightforearm","rightforearm","rightlowerarm","rightelbow","forearmr"
  ]) || getBoneChild(rightUpper);

  // Aim real skeleton segments downward instead of guessing Euler axes.
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


function isArmBoneName(name){
  const n=normalizeBoneName(name);
  return /shoulder|clavicle|upperarm|lowerarm|forearm|elbow|wrist|hand|arm/.test(n);
}

function meshNameLooksLikeArm(mesh){
  const n=normalizeBoneName(mesh.name);
  return /shoulder|sleeve|upperarm|lowerarm|forearm|elbow|wrist|hand|glove|cuff|arm/.test(n);
}

function attributeComponent(attribute,index,component){
  if(component===0) return attribute.getX(index);
  if(component===1) return attribute.getY(index);
  if(component===2) return attribute.getZ(index);
  return attribute.getW(index);
}

function vertexArmWeight(skinnedMesh,vertexIndex,armBoneIndices){
  const geometry=skinnedMesh.geometry;
  const skinIndex=geometry.getAttribute("skinIndex");
  const skinWeight=geometry.getAttribute("skinWeight");
  if(!skinIndex || !skinWeight) return 0;

  let total=0;
  for(let i=0;i<4;i++){
    const boneIndex=attributeComponent(skinIndex,vertexIndex,i);
    const weight=attributeComponent(skinWeight,vertexIndex,i);
    if(armBoneIndices.has(boneIndex)) total+=weight;
  }
  return total;
}

function extractArmGeometry(source){
  const geometry=source.geometry;
  const position=geometry.getAttribute("position");
  if(!position || !geometry.getAttribute("skinIndex") || !geometry.getAttribute("skinWeight")) return null;

  const armBoneIndices=new Set();
  source.skeleton?.bones.forEach((bone,index)=>{
    if(isArmBoneName(bone.name)) armBoneIndices.add(index);
  });
  if(!armBoneIndices.size) return null;

  const sourceIndex=geometry.index;
  const triangleCount=sourceIndex
    ? Math.floor(sourceIndex.count/3)
    : Math.floor(position.count/3);
  const keptVertices=[];

  for(let tri=0;tri<triangleCount;tri++){
    const vertices=[
      sourceIndex ? sourceIndex.getX(tri*3) : tri*3,
      sourceIndex ? sourceIndex.getX(tri*3+1) : tri*3+1,
      sourceIndex ? sourceIndex.getX(tri*3+2) : tri*3+2
    ];
    const weights=vertices.map(index=>vertexArmWeight(source,index,armBoneIndices));
    const average=(weights[0]+weights[1]+weights[2])/3;
    const strongVertices=weights.filter(weight=>weight>=.18).length;

    if(average>=.22 && strongVertices>=2){
      keptVertices.push(...vertices);
    }
  }

  if(!keptVertices.length) return null;

  const result=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    const values=[];
    for(const sourceVertex of keptVertices){
      for(let component=0;component<attribute.itemSize;component++){
        values.push(attributeComponent(attribute,sourceVertex,component));
      }
    }

    result.setAttribute(
      name,
      new THREE.BufferAttribute(
        new attribute.array.constructor(values),
        attribute.itemSize,
        attribute.normalized
      )
    );
  }

  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

function applyFirstPersonArmPose(root){
  root.updateMatrixWorld(true);

  const leftUpper=findBoneByNameParts(root,[
    "mixamorigleftupperarm","leftupperarm","leftarm","upperarml","arml"
  ]);
  const rightUpper=findBoneByNameParts(root,[
    "mixamorigrightupperarm","rightupperarm","rightarm","upperarmr","armr"
  ]);
  const leftForearm=findBoneByNameParts(root,[
    "mixamorigleftforearm","leftforearm","leftlowerarm","leftelbow","forearml"
  ]) || getBoneChild(leftUpper);
  const rightForearm=findBoneByNameParts(root,[
    "mixamorigrightforearm","rightforearm","rightlowerarm","rightelbow","forearmr"
  ]) || getBoneChild(rightUpper);

  aimBoneAtWorldDirection(leftUpper,new THREE.Vector3(-.16,-.06,-.986).normalize());
  aimBoneAtWorldDirection(rightUpper,new THREE.Vector3(.16,-.06,-.986).normalize());

  root.updateMatrixWorld(true);

  aimBoneAtWorldDirection(leftForearm,new THREE.Vector3(-.10,-.03,-.995).normalize());
  aimBoneAtWorldDirection(rightForearm,new THREE.Vector3(.10,-.03,-.995).normalize());

  root.updateMatrixWorld(true);
}

export function createFirstPersonArms(model){
  const root=cloneSkeleton(model);
  root.name="FirstPersonActualArms";
  root.visible=true;

  const sourceMeshes=[];
  root.traverse(obj=>{
    if(obj.isMesh) sourceMeshes.push(obj);
  });

  for(const source of sourceMeshes){
    source.visible=false;

    if(source.isSkinnedMesh){
      const armGeometry=extractArmGeometry(source);
      if(armGeometry){
        const armMesh=new THREE.SkinnedMesh(
          armGeometry,
          Array.isArray(source.material)
            ? source.material.map(material=>material.clone())
            : source.material?.clone?.() || source.material
        );

        armMesh.position.copy(source.position);
        armMesh.quaternion.copy(source.quaternion);
        armMesh.scale.copy(source.scale);
        armMesh.renderOrder=1000;
        armMesh.frustumCulled=false;
        armMesh.bind(source.skeleton,source.bindMatrix);
        armMesh.bindMatrixInverse.copy(source.bindMatrixInverse);
        source.parent.add(armMesh);
      }
    }else if(meshNameLooksLikeArm(source)){
      source.visible=true;
      source.renderOrder=1000;
      source.frustumCulled=false;
    }
  }

  applyFirstPersonArmPose(root);
  root.updateMatrixWorld(true);

  const leftHand=findBoneByNameParts(root,[
    "mixamoriglefthand","lefthand","handl","wristl"
  ]);
  const rightHand=findBoneByNameParts(root,[
    "mixamorigrighthand","righthand","handr","wristr"
  ]);

  // Place the real hands into the lower-middle of the camera view. This is
  // derived from their actual skeleton positions, so model changes do not
  // silently push them below the screen again.
  if(leftHand && rightHand){
    const leftWorld=leftHand.getWorldPosition(new THREE.Vector3());
    const rightWorld=rightHand.getWorldPosition(new THREE.Vector3());
    const handCenter=leftWorld.add(rightWorld).multiplyScalar(.5);

    root.position.x-=handCenter.x;
    root.position.y+=(-.22-handCenter.y);
    root.position.z+=(-.92-handCenter.z);
    root.updateMatrixWorld(true);
  }else{
    // Fallback only when the rig has no discoverable hand bones.
    root.position.set(0,-.55,-.92);
  }

  root.traverse(obj=>{
    if(!obj.isMesh) return;
    obj.frustumCulled=false;
    obj.renderOrder=1000;
    obj.castShadow=false;
    obj.receiveShadow=false;
  });

  return root;
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
