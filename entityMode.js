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
  root.name="ArachnophobiaBiscuit";
  root.scale.setScalar(1.0);

  // Transparent biscuit image used as the harmless arachnophobia replacement.
  const texture=new THREE.TextureLoader().load("./assets/biscuit.svg");
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.needsUpdate=true;

  const material=new THREE.SpriteMaterial({
    map:texture,
    transparent:true,
    depthTest:true,
    depthWrite:true,
    sizeAttenuation:true
  });

  const sprite=new THREE.Sprite(material);
  sprite.name="BiscuitImage";
  sprite.scale.set(2.75,2.33,1);
  sprite.position.y=1.05;
  root.add(sprite);

  root.userData.entityReplacement="biscuit";
  root.userData.entityLabel="BISCUIT";
  return root;
}
