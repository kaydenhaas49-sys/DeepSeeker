import * as THREE from "three";

export class SecurityCameraSystem {
  constructor({scene,renderer,player,getCameras,onClose}){
    this.scene=scene;
    this.renderer=renderer;
    this.player=player;
    this.getCameras=getCameras||(()=>[]);
    this.onClose=onClose||(()=>{});
    this.active=false;
    this.index=0;
    this.camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.05,220);
    this.camera.rotation.order="YXZ";
    this.camera.matrixAutoUpdate=true;
    this._worldPosition=new THREE.Vector3();
    this._worldTarget=new THREE.Vector3();
    this.root=null;
    this.label=null;
    this._buildOverlay();
  }

  _buildOverlay(){
    const root=document.createElement("div");
    root.id="deepseekerCameras";
    root.style.cssText=[
      "position:fixed","inset:0","z-index:29","display:none","pointer-events:none",
      "font-family:ui-monospace,SFMono-Regular,Menlo,monospace"
    ].join(";");
    root.innerHTML=
      '<div style="position:absolute;inset:0;border:14px solid rgba(10,18,12,.46);box-shadow:inset 0 0 80px #000;background:repeating-linear-gradient(180deg,transparent 0 3px,rgba(255,255,255,.018) 3px 4px)"></div>'+
      '<div id="deepseekerCameraLabel" style="position:absolute;left:18px;top:18px;padding:8px 10px;background:#020602bb;border:1px solid #ffffff12;color:#b9c8b2;font-size:11px;letter-spacing:2px"></div>'+
      '<div style="position:absolute;left:18px;bottom:18px;color:#858f80;font-size:9px;letter-spacing:2px">← → SWITCH CAMERA · ESC EXIT</div>';
    document.body.appendChild(root);
    this.root=root;
    this.label=root.querySelector("#deepseekerCameraLabel");
  }

  _available(){
    return this.getCameras().filter(cam=>cam && cam.group?.parent);
  }

  open(){
    const cams=this._available();
    if(!cams.length) return false;
    this.active=true;
    this.index=Math.min(this.index,cams.length-1);
    this.player.keys.clear();
    document.exitPointerLock?.();
    this.root.style.display="block";
    this._syncCamera();
    return true;
  }

  close(){
    this.active=false;
    if(this.root) this.root.style.display="none";
    this.onClose();
  }

  cycle(direction){
    const cams=this._available();
    if(!cams.length) return;
    this.index=(this.index+direction+cams.length)%cams.length;
    this._syncCamera();
  }

  _syncCamera(){
    const cams=this._available();
    const cam=cams[this.index];
    if(!cam) return;

    // Camera positions live inside streamed chunk groups. Always resolve the
    // actual world transform instead of assuming the group's local origin.
    cam.group.updateWorldMatrix(true,true);
    cam.group.getWorldPosition(this._worldPosition);
    this.camera.position.copy(this._worldPosition);

    // The generated target is stored in world space.
    if(cam.lookAt){
      this._worldTarget.copy(cam.lookAt);
      this.camera.lookAt(this._worldTarget);
    }else{
      this._worldTarget.copy(this._worldPosition).add(
        new THREE.Vector3(0,0,-10).applyQuaternion(cam.group.getWorldQuaternion(new THREE.Quaternion()))
      );
      this.camera.lookAt(this._worldTarget);
    }

    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);

    if(this.label) this.label.textContent=(cam.name||("CAM "+String(this.index+1).padStart(2,"0")))+" · "+this.index+"/"+Math.max(0,cams.length-1);
  }

  resize(){
    this.camera.aspect=innerWidth/innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update(){
    if(!this.active) return;
    const cams=this._available();
    if(!cams.length){
      this.close();
      return;
    }
    if(this.index>=cams.length) this.index=0;
    this._syncCamera();
  }
}
