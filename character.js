import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const CHARACTER_PATH = "./assets/hazmat suit 3d model.glb";
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

function hardenCharacterMaterial(material){
  if(!material) return;
  const clean=new THREE.MeshStandardMaterial({
    color:material.color?.clone?.() || new THREE.Color(0xffffff),
    map:material.map || null,
    normalMap:material.normalMap || null,
    normalScale:material.normalScale?.clone?.() || new THREE.Vector2(1,1),
    roughness:Number.isFinite(material.roughness) ? material.roughness : .72,
    metalness:Number.isFinite(material.metalness) ? material.metalness : 0,
    roughnessMap:material.roughnessMap || null,
    metalnessMap:material.metalnessMap || null,
    aoMap:material.aoMap || null,
    aoMapIntensity:Number.isFinite(material.aoMapIntensity) ? material.aoMapIntensity : 1,
    emissive:material.emissive?.clone?.() || new THREE.Color(0x000000),
    emissiveMap:material.emissiveMap || null,
    emissiveIntensity:Number.isFinite(material.emissiveIntensity) ? material.emissiveIntensity : 1,
    vertexColors:Boolean(material.vertexColors),
    side:THREE.DoubleSide,
    transparent:false, opacity:1, alphaTest:0, depthTest:true, depthWrite:true
  });
  clean.name=(material.name || "CharacterMaterial")+"__Clean";
  clean.premultipliedAlpha=false;
  if("alphaHash" in clean) clean.alphaHash=false;
  if("alphaToCoverage" in clean) clean.alphaToCoverage=false;
  clean.blending=THREE.NormalBlending;
  clean.needsUpdate=true;
  return clean;
}
function cloneCharacterMaterials(root){
  root.traverse(obj=>{
    if(!obj.isMesh) return;
    if(Array.isArray(obj.material)){
      obj.material=obj.material.map(hardenCharacterMaterial);
    }else{
      obj.material=hardenCharacterMaterial(obj.material);
    }
    if(obj.isSkinnedMesh && obj.normalizeSkinWeights) obj.normalizeSkinWeights();
    obj.frustumCulled=false;
  });
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
    obj.frustumCulled=false;

    const materials=Array.isArray(obj.material) ? obj.material : [obj.material];
    for(const mat of materials){
      if(!mat) continue;
      mat.toneMapped=true;
    }
  });

  cloneCharacterMaterials(scene);
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
    const sideOk=side==="left" ? delta.x<-.015 : delta.x>.015;
    const heightOk=p.y>.55 && p.y<1.75;
    const armShape=horizontal>.015;

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
  if(!n || n==="armature" || n==="root" || n==="hips" || n==="pelvis") return false;
  return /shoulder|clavicle|upperarm|lowerarm|forearm|elbow|wrist|hand|arm(?:l|r)$|leftarm|rightarm/.test(n);
}

function meshNameLooksLikeArm(mesh){
  const n=normalizeBoneName(mesh.name);
  // Also accept an explicit mesh called "arms", but never the rig root "Armature".
  return /shoulder|sleeve|upperarm|lowerarm|forearm|elbow|wrist|hand|glove|cuff|leftarm|rightarm|armleft|armright|arms?$/.test(n);
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

function collectArmBoneIndices(source, armRoot){
  const bones=source.skeleton?.bones || [];
  const indices=new Set();

  // Start with named arm/hand bones and all children of any named upper-arm bone.
  bones.forEach((bone,index)=>{
    if(isArmBoneName(bone.name)) indices.add(index);
  });

  const upperArms=[
    findBoneByNameParts(armRoot,["mixamorigleftupperarm","leftupperarm","leftarm","upperarml","arml"]),
    findBoneByNameParts(armRoot,["mixamorigrightupperarm","rightupperarm","rightarm","upperarmr","armr"])
  ];
  for(let i=0;i<upperArms.length;i++){
    if(!upperArms[i]) upperArms[i]=findArmBoneByHierarchy(armRoot,i===0?"left":"right");
  }
  for(const upper of upperArms){
    if(!upper) continue;
    upper.traverse(obj=>{
      if(!obj.isBone) return;
      const index=bones.indexOf(obj);
      if(index>=0) indices.add(index);
    });
  }

  // Always check spatial bone positions too. Some rigs name the forearms but
  // not the upper arms; previously one name match skipped shoulder discovery.
  if(armRoot){
    armRoot.updateMatrixWorld(true);
    const inverseRoot=armRoot.matrixWorld.clone().invert();
    const centralBones=bones.filter(bone=>/(hips|pelvis|spine|torso|root)/i.test(bone.name));
    const centerXs=centralBones.map(bone=>
      bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseRoot).x
    );
    centerXs.sort((a,b)=>a-b);
    const centerX=centerXs.length ? centerXs[Math.floor(centerXs.length/2)] : 0;

    // The asset is normalized to about 1.8 m tall. Include lateral bones
    // above the hips, plus their descendants, so custom-named hands are kept.
    const lateralBones=[];
    bones.forEach((bone,index)=>{
      const position=bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseRoot);
      if(position.y>=.52 && position.y<=1.72 && Math.abs(position.x-centerX)>.14){
        indices.add(index);
        lateralBones.push(bone);
      }
    });
    for(const lateral of lateralBones){
      lateral.traverse(obj=>{
        if(!obj.isBone) return;
        const index=bones.indexOf(obj);
        if(index>=0) indices.add(index);
      });
    }
  }

  return indices;
}

function extractArmGeometry(source, armRoot){
  const geometry=source.geometry;
  const position=geometry.getAttribute("position");
  if(!position || !geometry.getAttribute("skinIndex") || !geometry.getAttribute("skinWeight")) return null;

  const bones=source.skeleton?.bones || [];
  const armBoneIndices=collectArmBoneIndices(source,armRoot || source);
  if(!armBoneIndices.size) return null;

  const sourceIndex=geometry.index;
  const triangleCount=sourceIndex ? Math.floor(sourceIndex.count/3) : Math.floor(position.count/3);
  const keptVertices=[];
  const keptMaterialIndices=[];
  const groups=geometry.groups || [];

  const materialForTriangle=(triangleIndex)=>{
    const sourceOffset=triangleIndex*3;
    for(const group of groups){
      if(sourceOffset>=group.start && sourceOffset<group.start+group.count){
        return group.materialIndex || 0;
      }
    }
    return 0;
  };

  for(let tri=0;tri<triangleCount;tri++){
    const vertices=[
      sourceIndex ? sourceIndex.getX(tri*3) : tri*3,
      sourceIndex ? sourceIndex.getX(tri*3+1) : tri*3+1,
      sourceIndex ? sourceIndex.getX(tri*3+2) : tri*3+2
    ];
    const weights=vertices.map(index=>vertexArmWeight(source,index,armBoneIndices));
    const average=(weights[0]+weights[1]+weights[2])/3;
    const strongVertices=weights.filter(weight=>weight>=.08).length;
    const maxWeight=Math.max(...weights);

    if(
      (average>=.035 && strongVertices>=1) ||
      maxWeight>=.12
    ){
      keptVertices.push(...vertices);
      keptMaterialIndices.push(materialForTriangle(tri));
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

  for(const [name,targets] of Object.entries(geometry.morphAttributes || {})){
    result.morphAttributes[name]=targets.map(attribute=>{
      const values=[];
      for(const sourceVertex of keptVertices){
        for(let component=0;component<attribute.itemSize;component++){
          values.push(attributeComponent(attribute,sourceVertex,component));
        }
      }
      return new THREE.BufferAttribute(
        new attribute.array.constructor(values),
        attribute.itemSize,
        attribute.normalized
      );
    });
  }
  result.morphTargetsRelative=geometry.morphTargetsRelative;

  let runStart=0;
  let runMaterial=keptMaterialIndices[0] ?? 0;
  for(let i=1;i<=keptMaterialIndices.length;i++){
    const material=keptMaterialIndices[i];
    if(i<keptMaterialIndices.length && material===runMaterial) continue;
    const runCount=(i-runStart)*3;
    if(runCount>0) result.addGroup(runStart*3,runCount,runMaterial);
    runStart=i;
    runMaterial=material ?? 0;
  }

  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

function applyFirstPersonArmPose(root){
  root.updateMatrixWorld(true);

  let leftUpper=findBoneByNameParts(root,[
    "mixamorigleftupperarm","leftupperarm","leftarm","upperarml","arml"
  ]);
  let rightUpper=findBoneByNameParts(root,[
    "mixamorigrightupperarm","rightupperarm","rightarm","upperarmr","armr"
  ]);

  if(!leftUpper) leftUpper=findArmBoneByHierarchy(root,"left");
  if(!rightUpper) rightUpper=findArmBoneByHierarchy(root,"right");

  const leftForearm=findBoneByNameParts(root,[
    "mixamorigleftforearm","leftforearm","leftlowerarm","leftelbow","forearml"
  ]) || getBoneChild(leftUpper);
  const rightForearm=findBoneByNameParts(root,[
    "mixamorigrightforearm","rightforearm","rightlowerarm","rightelbow","forearmr"
  ]) || getBoneChild(rightUpper);

  aimBoneAtWorldDirection(leftUpper,new THREE.Vector3(-.34,-.34,-.88).normalize());
  aimBoneAtWorldDirection(rightUpper,new THREE.Vector3(.34,-.34,-.88).normalize());

  root.updateMatrixWorld(true);

  aimBoneAtWorldDirection(leftForearm,new THREE.Vector3(.04,-.12,-.99).normalize());
  aimBoneAtWorldDirection(rightForearm,new THREE.Vector3(-.04,-.12,-.99).normalize());

  root.updateMatrixWorld(true);
}

export function createFirstPersonArms(model){
  // Work from the real skinned hazmat model, pose its arms, and bake the
  // deformed arm triangles into camera-local meshes. This avoids depending
  // on the renderer's skin-palette update to keep a tiny extracted rig visible.
  const rig=cloneSkeleton(model);
  cloneCharacterMaterials(rig);
  rig.name="FirstPersonArmExtractionRig";
  rig.rotation.set(0,Math.PI,0);
  applyFirstPersonArmPose(rig);
  rig.updateMatrixWorld(true);
  rig.traverse(obj=>{
    if(obj.isSkinnedMesh && obj.skeleton) obj.skeleton.update();
  });
  rig.updateMatrixWorld(true);

  const inverseRigWorld=rig.matrixWorld.clone().invert();
  const positionScratch=new THREE.Vector3();
  const rawScratch=new THREE.Vector3();
  const armMeshes=[];
  const armBounds=new THREE.Box3();
  let armTriangleCount=0;
  let sourceArmMeshCount=0;

  // Compute the unposed silhouette bounds. The fallback region test uses this
  // to find the left and right arm areas even if the rig uses custom bone names.
  const modelBounds=new THREE.Box3();
  rig.traverse(obj=>{
    if(!obj.isMesh || !obj.geometry) return;
    if(obj.name==="HeldFlashlight" || obj.parent?.name==="HeldFlashlight") return;
    const geometry=obj.geometry;
    if(!geometry.boundingBox) geometry.computeBoundingBox();
    if(geometry.boundingBox){
      const toRigLocal=inverseRigWorld.clone().multiply(obj.matrixWorld);
      modelBounds.union(geometry.boundingBox.clone().applyMatrix4(toRigLocal));
    }
  });
  const modelSize=modelBounds.getSize(new THREE.Vector3());
  const modelCenter=modelBounds.getCenter(new THREE.Vector3());
  const torsoHalfWidth=Math.max(modelSize.y*.15,modelSize.x*.105);
  const armBandMinY=modelBounds.min.y+modelSize.y*.50;
  const armBandMaxY=modelBounds.min.y+modelSize.y*.93;
  const armOutermostX=Math.max(modelSize.x*.14,modelSize.y*.16);

  const isNearModelArmRegion=(points)=>{
    const center=points.reduce((sum,point)=>sum+point.x/3,0);
    const cy=points.reduce((sum,point)=>sum+point.y/3,0);
    const anyOutside=points.some(point=>Math.abs(point.x-modelCenter.x)>torsoHalfWidth);
    const outerEnough=points.some(point=>Math.abs(point.x-modelCenter.x)>armOutermostX);
    return anyOutside && outerEnough && cy>=armBandMinY && cy<=armBandMaxY;
  };

  const triangleIndices=(geometry,triangle)=>{
    const index=geometry.index;
    const offset=triangle*3;
    return index
      ? [index.getX(offset),index.getX(offset+1),index.getX(offset+2)]
      : [offset,offset+1,offset+2];
  };
  const triangleMaterialIndex=(geometry,triangle)=>{
    const start=triangle*3;
    for(const group of geometry.groups||[]){
      if(start>=group.start && start<group.start+group.count) return group.materialIndex||0;
    }
    return 0;
  };

  const buildBakedArmMesh=(source,filterByArmWeights)=>{
    const geometry=source.geometry;
    const sourcePosition=geometry?.getAttribute("position");
    if(!sourcePosition) return null;
    const skinned=source.isSkinnedMesh && source.skeleton;
    const armBoneIndices=skinned ? collectArmBoneIndices(source,rig) : new Set();
    const skinIndex=geometry.getAttribute("skinIndex");
    const skinWeight=geometry.getAttribute("skinWeight");
    const canWeightFilter=skinned && skinIndex && skinWeight && armBoneIndices.size>0;
    const uv=geometry.getAttribute("uv");
    const uv2=geometry.getAttribute("uv2");
    const color=geometry.getAttribute("color");
    const positions=[],uvs=[],uvs2=[],colors=[],materialIndices=[];
    const triCount=geometry.index
      ? Math.floor(geometry.index.count/3)
      : Math.floor(sourcePosition.count/3);
    const localPoints=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];

    for(let tri=0;tri<triCount;tri++){
      const indices=triangleIndices(geometry,tri);
      const rawPoints=[];
      const armWeights=[];
      for(let k=0;k<3;k++){
        const vertexIndex=indices[k];
        rawScratch.fromBufferAttribute(sourcePosition,vertexIndex);
        rawPoints.push(rawScratch.clone().applyMatrix4(source.matrixWorld).applyMatrix4(inverseRigWorld));
        armWeights.push(canWeightFilter ? vertexArmWeight(source,vertexIndex,armBoneIndices) : 0);
      }

      // Prefer real arm skin weights. If this GLB's arm weights are poorly
      // named/painted, fall back to its actual T-pose shoulder/arm silhouette.
      const maximumWeight=Math.max(...armWeights);
      const averageWeight=(armWeights[0]+armWeights[1]+armWeights[2])/3;
      const strongCount=armWeights.filter(weight=>weight>=.08).length;
      const weightedArm=canWeightFilter && (
        (averageWeight>=.035 && strongCount>=1) ||
        maximumWeight>=.12
      );
      const namedLooseArm=meshNameLooksLikeArm(source) && !canWeightFilter;
      const spatialArm=isNearModelArmRegion(rawPoints);
      const keep=filterByArmWeights
        ? (weightedArm || spatialArm || namedLooseArm)
        : true;
      if(!keep) continue;

      for(let k=0;k<3;k++){
        const vertexIndex=indices[k];
        positionScratch.fromBufferAttribute(sourcePosition,vertexIndex);
        if(skinned && typeof source.getVertexPosition==="function"){
          source.getVertexPosition(vertexIndex,positionScratch);
        }
        positionScratch
          .applyMatrix4(source.matrixWorld)
          .applyMatrix4(inverseRigWorld);
        positions.push(positionScratch.x,positionScratch.y,positionScratch.z);
        if(uv) uvs.push(uv.getX(vertexIndex),uv.getY(vertexIndex));
        if(uv2) uvs2.push(uv2.getX(vertexIndex),uv2.getY(vertexIndex));
        if(color){
          for(let component=0;component<color.itemSize;component++){
            colors.push(attributeComponent(color,vertexIndex,component));
          }
        }
      }
      materialIndices.push(triangleMaterialIndex(geometry,tri));
    }

    if(!materialIndices.length) return null;
    const baked=new THREE.BufferGeometry();
    baked.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    if(uv) baked.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
    if(uv2) baked.setAttribute("uv2",new THREE.Float32BufferAttribute(uvs2,2));
    if(color) baked.setAttribute("color",new THREE.Float32BufferAttribute(colors,color.itemSize));

    let runStart=0,runMaterial=materialIndices[0]??0;
    for(let i=1;i<=materialIndices.length;i++){
      const mat=materialIndices[i];
      if(i<materialIndices.length && mat===runMaterial) continue;
      const count=(i-runStart)*3;
      if(count>0) baked.addGroup(runStart*3,count,runMaterial);
      runStart=i;
      runMaterial=mat??0;
    }
    baked.computeVertexNormals();
    baked.computeBoundingBox();
    baked.computeBoundingSphere();
    const mesh=new THREE.Mesh(baked,source.material);
    mesh.name="BakedHazmatArmSurface";
    mesh.frustumCulled=false;
    mesh.castShadow=false;
    mesh.receiveShadow=false;
    mesh.renderOrder=2000;
    armBounds.union(baked.boundingBox.clone());
    armTriangleCount+=materialIndices.length;
    sourceArmMeshCount++;
    return mesh;
  };

  const viewmodel=new THREE.Group();
  viewmodel.name="FirstPersonActualHazmatArms";
  rig.updateMatrixWorld(true);
  rig.traverse(obj=>{
    if(!obj.isMesh || !obj.geometry) return;
    if(obj.name==="HeldFlashlight" || obj.parent?.name==="HeldFlashlight") return;
    const meshName=normalizeBoneName(obj.name);
    const explicitArmMesh=meshNameLooksLikeArm(obj);
    const extracted=buildBakedArmMesh(obj,true);
    if(extracted){
      viewmodel.add(extracted);
    }else if(explicitArmMesh && !obj.isSkinnedMesh){
      const loose=buildBakedArmMesh(obj,false);
      if(loose) viewmodel.add(loose);
    }
  });

  // The primary extraction already uses arm bone weights, explicit arm mesh
  // names, and a geometric T-pose fallback on the original model triangles.
  // Keep the actual model's scale/orientation but center its posed arm surfaces
  // on the lower part of the camera view, like a first-person model.
  viewmodel.quaternion.copy(rig.quaternion);
  viewmodel.scale.copy(rig.scale);
  if(!armBounds.isEmpty()){
    const center=armBounds.getCenter(new THREE.Vector3())
      .multiply(viewmodel.scale)
      .applyQuaternion(viewmodel.quaternion);
    viewmodel.position.set(-center.x,-.40-center.y,-.84-center.z);
  }else{
    viewmodel.position.set(0,-.40,-.84);
  }

  // Re-parent the rig's own flashlight using its posed right-hand transform.
  const sourceFlashlight=rig.getObjectByName("HeldFlashlight");
  if(sourceFlashlight){
    rig.updateMatrixWorld(true);
    const relativeMatrix=inverseRigWorld.clone().multiply(sourceFlashlight.matrixWorld);
    const held=sourceFlashlight.clone(true);
    const pos=new THREE.Vector3(),rot=new THREE.Quaternion(),scale=new THREE.Vector3();
    relativeMatrix.decompose(pos,rot,scale);
    held.position.copy(pos);
    held.quaternion.copy(rot);
    held.scale.copy(scale);
    held.visible=true;
    held.name="HeldFlashlight";
    held.traverse(obj=>{
      if(!obj.isMesh) return;
      obj.frustumCulled=false;
      obj.renderOrder=2010;
      obj.castShadow=false;
      obj.receiveShadow=false;
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const mat of materials){
        if(!mat) continue;
        mat.depthTest=false;
        mat.depthWrite=false;
        mat.needsUpdate=true;
      }
    });
    viewmodel.add(held);
  }

  viewmodel.userData.extractedArmMeshCount=sourceArmMeshCount;
  viewmodel.userData.extractedArmTriangleCount=armTriangleCount;
  console.log("[DeepSeeker] baked real hazmat arm viewmodel",{
    sourceArmMeshCount,
    armTriangleCount,
    armBounds:armBounds.isEmpty()?null:{
      min:armBounds.min.toArray(),
      max:armBounds.max.toArray()
    },
    scale:viewmodel.scale.toArray(),
    position:viewmodel.position.toArray()
  });
  return viewmodel;
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
  // Keep the normal beam subtle and slow. Fast strobing is especially
  // unpleasant at low battery, where the separate battery modulation also runs.
  return .94 + .06 * Math.sin(time * 4.2) * Math.sin(time * 2.15);
}

export async function createHazmatCharacter(){
  const template=await loadHazmatCharacter();
  const model=cloneSkeleton(template.scene);
  cloneCharacterMaterials(model);

  // The supplied rig has a bind-pose/animation combination that can
  // snap back to a T-pose. Use a deterministic relaxed pose instead
  // until a verified humanoid idle clip is available.
  const idleClip=null;
  const mixer=null;
  const action=null;

  // Keep the authored bind pose on the full model; pose only the first-person clone.
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
