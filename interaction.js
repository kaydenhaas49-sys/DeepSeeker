import * as THREE from "three";

export class InteractionSystem {
  constructor({camera, domElement, getCandidates, onInteract}){
    this.camera=camera;
    this.dom=domElement;
    this.getCandidates=getCandidates||(()=>[]);
    this.onInteract=onInteract||(()=>false);
    this.raycaster=new THREE.Raycaster();
    this.raycaster.far=3.2;
    this.active=null;
    this.elapsed=0;
    this.prompt=null;
    this._ensurePrompt();
  }

  _ensurePrompt(){
    if(document.getElementById("deepseekerInteractionPrompt")){
      this.prompt=document.getElementById("deepseekerInteractionPrompt");
      return;
    }
    const el=document.createElement("div");
    el.id="deepseekerInteractionPrompt";
    el.style.cssText=[
      "position:fixed","left:50%","bottom:13%","transform:translate(-50%,50%)",
      "z-index:18","pointer-events:none","opacity:0",
      "padding:9px 14px","border:1px solid rgba(229,218,170,.16)",
      "border-radius:10px","background:rgba(5,6,5,.78)",
      "color:#e8e3c8","font:10px/1.2 system-ui,sans-serif",
      "letter-spacing:2px","text-transform:uppercase",
      "backdrop-filter:blur(5px)","transition:opacity .12s"
    ].join(";");
    document.body.appendChild(el);
    this.prompt=el;
  }

  _findInteractable(object){
    let node=object;
    while(node){
      if(node.userData?.interactable) return node.userData.interactable;
      node=node.parent;
    }
    return null;
  }

  update(dt=.016){
    if(!this.camera || document.pointerLockElement!==this.dom){
      this.setActive(null);
      return;
    }

    this.elapsed+=dt;
    if(this.elapsed<.05) return;
    this.elapsed=0;

    const candidates=this.getCandidates().filter(Boolean);
    if(!candidates.length){
      this.setActive(null);
      return;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(0,0),this.camera);
    const hits=this.raycaster.intersectObjects(candidates,true);

    let found=null;
    for(const hit of hits){
      const interactable=this._findInteractable(hit.object);
      if(interactable){
        found={...interactable,object:hit.object,distance:hit.distance};
        break;
      }
    }

    this.setActive(found);
  }

  setActive(value){
    this.active=value;
    if(!this.prompt) return;
    if(!value){
      this.prompt.style.opacity="0";
      return;
    }
    const label=value.prompt || value.action || "INTERACT";
    this.prompt.textContent="E · "+label;
    this.prompt.style.opacity="1";
  }

  interact(){
    if(!this.active) return false;
    return Boolean(this.onInteract(this.active));
  }

  clear(){
    this.setActive(null);
  }
}
