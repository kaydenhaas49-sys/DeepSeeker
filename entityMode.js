import * as THREE from "three";

const STORAGE_KEY="deepseeker-arachnophobia-mode";

export function getArachnophobiaMode(){
  try{
    return localStorage.getItem(STORAGE_KEY)==="1";
  }catch{
    return false;
  }
}

export function setArachnophobiaMode(enabled){
  try{
    localStorage.setItem(STORAGE_KEY,enabled?"1":"0");
  }catch{}
  return Boolean(enabled);
}

export function createFunnyDuckEntity(){
  const root=new THREE.Group();
  root.name="ArachnophobiaRubberDuck";
  root.scale.setScalar(1.10);

  const yellow=new THREE.MeshStandardMaterial({
    color:0xffd83d,
    emissive:0x6f5600,
    emissiveIntensity:.20,
    roughness:.65,
    metalness:.02
  });
  const orange=new THREE.MeshStandardMaterial({
    color:0xe58b25,
    roughness:.72
  });
  const black=new THREE.MeshBasicMaterial({color:0x101010});

  const body=new THREE.Mesh(
    new THREE.SphereGeometry(.72,20,14),
    yellow
  );
  body.scale.set(1,.86,1.2);
  body.position.y=.72;
  root.add(body);

  const head=new THREE.Mesh(
    new THREE.SphereGeometry(.56,20,16),
    yellow
  );
  head.position.set(0,1.42,.06);
  root.add(head);

  const beak=new THREE.Mesh(
    new THREE.SphereGeometry(.22,16,10),
    orange
  );
  beak.scale.set(1,.45,1.35);
  beak.position.set(0,1.38,-.52);
  root.add(beak);

  for(const x of [-.19,.19]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.095,10,8),black);
    eye.position.set(x,1.60,-.43);
    root.add(eye);
  }

  for(const x of [-.63,.63]){
    const wing=new THREE.Mesh(new THREE.SphereGeometry(.34,14,10),yellow);
    wing.scale.set(.68,1.08,.46);
    wing.position.set(x*.88,.76,.03);
    wing.rotation.z=x<0 ? .32 : -.32;
    root.add(wing);
  }

  for(const x of [-.28,.28]){
    const foot=new THREE.Mesh(
      new THREE.CapsuleGeometry(.10,.36,6,10),
      orange
    );
    foot.rotation.z=Math.PI/2;
    foot.position.set(x,.19,-.03);
    root.add(foot);
  }

  root.userData.entityReplacement="rubber_duck";
  root.userData.entityLabel="RUBBER DUCK";
  return root;
}
