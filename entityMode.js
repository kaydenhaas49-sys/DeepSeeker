import * as THREE from "three";

const STORAGE_KEY="deepseeker-arachnophobia-mode";

let biscuitTexture=null;
let biscuitTexturePromise=null;
const pendingBiscuitMaterials=new Set();

export function preloadBiscuitTexture(){
  if(biscuitTexture) return Promise.resolve(biscuitTexture);
  if(biscuitTexturePromise) return biscuitTexturePromise;

  biscuitTexturePromise=new Promise((resolve,reject)=>{
    new THREE.TextureLoader().load(
      "./assets/biscuit.svg",
      texture=>{
        texture.colorSpace=THREE.SRGBColorSpace;
        biscuitTexture=texture;
        for(const material of pendingBiscuitMaterials){
          material.map=texture;
          material.needsUpdate=true;
        }
        pendingBiscuitMaterials.clear();
        resolve(texture);
      },
      undefined,
      reject
    );
  });

  return biscuitTexturePromise;
}

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

  // The small SVG is preloaded behind the startup screen. If a duck is created
  // before it finishes, the shared promise attaches the texture when ready.
  const material=new THREE.SpriteMaterial({
    map:biscuitTexture,
    transparent:true,
    depthTest:true,
    depthWrite:true,
    sizeAttenuation:true
  });
  if(!biscuitTexture){
    pendingBiscuitMaterials.add(material);
    preloadBiscuitTexture().catch(error=>{
      console.error("[DeepSeeker] Biscuit texture failed to load:",error);
    });
  }

  const sprite=new THREE.Sprite(material);
  sprite.name="BiscuitImage";
  sprite.scale.set(2.75,2.33,1);
  sprite.position.y=1.05;
  root.add(sprite);

  root.userData.entityReplacement="biscuit";
  root.userData.entityLabel="BISCUIT";
  return root;
}
