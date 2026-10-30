import * as THREE from "three";

export class SpiderSurfaceController {
  constructor({entity,getWallMeshes,isBlocked,moveOnPlane,getPlayerPosition,canPlayerSee,setAnimation,groundY=0.08,bodyRadius=1.85}){
    this.entity=entity;this.getWallMeshes=getWallMeshes||(()=>[]);
    this.isBlocked=isBlocked||(()=>false);this.moveOnPlane=moveOnPlane||(()=>{});
    this.getPlayerPosition=getPlayerPosition||(()=>new THREE.Vector3());
    this.canPlayerSee=canPlayerSee||(()=>false);this.setAnimation=setAnimation||(()=>{});
    this.groundY=groundY;this.bodyRadius=bodyRadius;
    this.raycaster=new THREE.Raycaster();this.rayOrigin=new THREE.Vector3();
    this.rayDirection=new THREE.Vector3();this.wallNormal=new THREE.Vector3();
    this.wallApproach=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);
    this.down=new THREE.Vector3(0,-1,0);this.forward=new THREE.Vector3();
    this.normalMatrix=new THREE.Matrix3();this.wallQuaternion=new THREE.Quaternion();
    this.ceilingQuaternion=new THREE.Quaternion();this.floorQuaternion=new THREE.Quaternion();
    this.pounceStart=new THREE.Vector3();this.pounceTarget=new THREE.Vector3();
    this.retreatTarget=new THREE.Vector3();this.retreatDirection=new THREE.Vector3();
    this.phase="idle";this.kind=null;this.elapsed=0;this.cornerDuration=1.15;
    this.pounceDuration=1.18;this.fadeDuration=1.35;this.ceilingY=9;
    this.route=null;this.pounceStartedPending=false;this.pounceLandedPending=false;
    this.completedPending=false;this.fadeStartScale=1;
  }

  get active(){return this.phase!=="idle";}
  get behavior(){
    if(["approach","wall","corner"].includes(this.phase))return this.kind==="retreat"?"retreat-climb":"climbing";
    if(this.phase==="ceiling-approach")return "ceiling-stalk";
    if(this.phase==="ceiling-retreat")return "retreat-ceiling";
    if(this.phase==="pounce"||this.phase==="landed")return "pounce";
    if(["fallback","fade","complete"].includes(this.phase))return "retreating";
    return "idle";
  }

  reset(){
    this.phase="idle";this.kind=null;this.elapsed=0;this.route=null;
    this.pounceStartedPending=false;this.pounceLandedPending=false;this.completedPending=false;
    this.entity.scale.setScalar(1);
  }

  _orientation(normal,forward,output=new THREE.Quaternion()){
    const n=normal.clone().normalize();
    const f=forward.clone().addScaledVector(n,-forward.dot(n));
    if(f.lengthSq()<1e-5){f.set(0,0,-1);f.addScaledVector(n,-f.dot(n));}
    f.normalize();
    const right=new THREE.Vector3().crossVectors(n,f).normalize();
    f.crossVectors(right,n).normalize();
    return output.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,n,f));
  }

  _applyOrientation(normal,forward,dt,snap=false){
    this.entity.quaternion.slerp(this._orientation(normal,forward),snap?1:1-Math.exp(-7.5*Math.max(0,dt)));
  }

  _findClimbRoute(maxDistance){
    const meshes=this.getWallMeshes().filter(mesh=>mesh?.isMesh&&mesh.visible);
    if(!meshes.length)return null;
    this.rayOrigin.copy(this.entity.position);this.rayOrigin.y+=1.15;
    this.raycaster.near=.05;this.raycaster.far=maxDistance;
    let best=null;
    for(let i=0;i<16;i++){
      const angle=i/16*Math.PI*2;
      this.rayDirection.set(Math.cos(angle),0,Math.sin(angle));
      this.raycaster.set(this.rayOrigin,this.rayDirection);
      for(const hit of this.raycaster.intersectObjects(meshes,false)){
        if(!hit.face||!hit.object)continue;
        hit.object.updateWorldMatrix?.(true,false);
        this.normalMatrix.getNormalMatrix(hit.object.matrixWorld);
        const normal=hit.face.normal.clone().applyMatrix3(this.normalMatrix).normalize();
        if(Math.abs(normal.y)>.22)continue;
        if(normal.dot(this.rayDirection)>0)normal.negate();
        if(normal.dot(this.rayDirection)>-.35)continue;
        const bounds=new THREE.Box3().setFromObject(hit.object),ceilingY=bounds.max.y;
        if(!Number.isFinite(ceilingY)||ceilingY<3.45||ceilingY>10.5)continue;
        if(hit.point.y<.25||hit.point.y>ceilingY-.35)continue;
        const approach=hit.point.clone().addScaledVector(normal,this.bodyRadius+.48);
        approach.y=this.groundY;
        if(this.isBlocked(approach.x,approach.z))continue;
        const distance=Math.hypot(approach.x-this.entity.position.x,approach.z-this.entity.position.z);
        if(distance>maxDistance)continue;
        if(!best||distance<best.distance)best={approach,normal,ceilingY,distance};
      }
    }
    return best;
  }

  startAmbush(){
    if(this.active)return false;
    const route=this._findClimbRoute(13);
    if(!route)return false;
    this._startRoute(route,"ambush");
    return true;
  }

  startRetreat(){
    if(this.active)return false;
    const route=this._findClimbRoute(15);
    this.kind="retreat";this.elapsed=0;this.entity.scale.setScalar(1);
    const player=this.getPlayerPosition();
    this.retreatDirection.set(this.entity.position.x-player.x,0,this.entity.position.z-player.z);
    if(this.retreatDirection.lengthSq()<1e-4)this.retreatDirection.set(Math.cos(this.entity.rotation.y),0,Math.sin(this.entity.rotation.y));
    this.retreatDirection.normalize();
    if(!route){
      this.phase="fallback";
      this.retreatTarget.copy(this.entity.position).addScaledVector(this.retreatDirection,9);
      this.retreatTarget.y=this.groundY;this.setAnimation("walk");return true;
    }
    this._startRoute(route,"retreat");
    return true;
  }

  _startRoute(route,kind){
    this.kind=kind;this.route=route;this.ceilingY=route.ceilingY;
    this.wallNormal.copy(route.normal);this.wallApproach.copy(route.approach);
    this.elapsed=0;this.phase="approach";this.entity.scale.setScalar(1);this.setAnimation("walk");
  }

  _beginCorner(){
    this._orientation(this.wallNormal,new THREE.Vector3(0,1,0),this.wallQuaternion);
    const target=this.getPlayerPosition();
    const ceilingForward=new THREE.Vector3(target.x-this.entity.position.x,0,target.z-this.entity.position.z);
    if(this.kind==="retreat")ceilingForward.copy(this.retreatDirection);
    this._orientation(this.down,ceilingForward,this.ceilingQuaternion);
    this.elapsed=0;this.phase="corner";
  }

  _beginCeilingMovement(){
    this.entity.position.y=this.ceilingY-.08;this.entity.quaternion.copy(this.ceilingQuaternion);
    if(this.kind==="ambush")this.phase="ceiling-approach";
    else{
      this.retreatTarget.copy(this.entity.position).addScaledVector(this.retreatDirection,14);
      this.retreatTarget.y=this.ceilingY-.08;this.phase="ceiling-retreat";
    }
    this.elapsed=0;this.setAnimation("walk");
  }

  _beginPounce(player){
    this.pounceStart.copy(this.entity.position);
    this.pounceTarget.set(player.pos.x,this.groundY,player.pos.z);
    this.elapsed=0;this.phase="pounce";this.pounceStartedPending=true;
    const forward=this.pounceTarget.clone().sub(this.pounceStart);forward.y=0;
    this._orientation(this.down,forward,this.ceilingQuaternion);
    this._orientation(this.up,forward,this.floorQuaternion);
    this.setAnimation("jump");
  }

  completePounce(){
    this.entity.position.copy(this.pounceTarget);this.entity.position.y=this.groundY;
    const heading=Math.atan2(this.pounceTarget.x-this.pounceStart.x,this.pounceTarget.z-this.pounceStart.z);
    this.entity.quaternion.identity();this.entity.rotation.set(0,heading,0);
    this.phase="idle";this.kind=null;this.elapsed=0;this.route=null;
    this.pounceStartedPending=false;this.pounceLandedPending=false;this.entity.scale.setScalar(1);
  }

  _beginFade(){
    this.phase="fade";this.elapsed=0;this.fadeStartScale=this.entity.scale.x||1;this.setAnimation("walk");
  }

  _tickFade(dt){
    this.elapsed+=dt;
    const t=THREE.MathUtils.clamp(this.elapsed/this.fadeDuration,0,1);
    this.entity.scale.setScalar(Math.max(.015,this.fadeStartScale*(1-t)));
    if(t>=1){this.phase="complete";this.completedPending=true;}
  }

  update(dt,player){
    const events={pounceStarted:false,pounceLanded:false,completed:false,failed:false,behavior:this.behavior};
    if(!this.active)return events;
    const step=THREE.MathUtils.clamp(Number(dt)||0,0,.05);
    this.elapsed+=step;

    if(this.phase==="approach"){
      const dx=this.wallApproach.x-this.entity.position.x,dz=this.wallApproach.z-this.entity.position.z;
      this.moveOnPlane(step,this.wallApproach.x,this.wallApproach.z,3.0);
      this._applyOrientation(this.up,new THREE.Vector3(dx,0,dz),step);
      const remaining=Math.hypot(this.wallApproach.x-this.entity.position.x,this.wallApproach.z-this.entity.position.z);
      if(remaining<.82){this.phase="wall";this.elapsed=0;}
      else if(this.elapsed>12){
        if(this.kind==="retreat")this._beginFade();
        else{this.phase="idle";events.failed=true;}
      }
    }else if(this.phase==="wall"){
      this.entity.position.x=this.wallApproach.x;this.entity.position.z=this.wallApproach.z;
      this.entity.position.y=Math.min(this.ceilingY-.08,this.entity.position.y+step*3.25);
      this._applyOrientation(this.wallNormal,this.up,step);
      if(this.entity.position.y>=this.ceilingY-.1)this._beginCorner();
    }else if(this.phase==="corner"){
      const t=THREE.MathUtils.clamp(this.elapsed/this.cornerDuration,0,1),eased=t*t*(3-2*t);
      this.entity.position.y=this.ceilingY-.08;
      this.entity.quaternion.copy(this.wallQuaternion).slerp(this.ceilingQuaternion,eased);
      if(t>=1)this._beginCeilingMovement();
    }else if(this.phase==="ceiling-approach"){
      const target=player.pos;
      this.moveOnPlane(step,target.x,target.z,2.55);
      this.forward.set(target.x-this.entity.position.x,0,target.z-this.entity.position.z);
      this._applyOrientation(this.down,this.forward,step);
      if(Math.hypot(this.forward.x,this.forward.z)<2.55)this._beginPounce(player);
      else if(this.elapsed>18){this.phase="idle";events.failed=true;}
    }else if(this.phase==="ceiling-retreat"){
      this.moveOnPlane(step,this.retreatTarget.x,this.retreatTarget.z,2.65);
      this.forward.set(this.retreatTarget.x-this.entity.position.x,0,this.retreatTarget.z-this.entity.position.z);
      this._applyOrientation(this.down,this.forward,step);
      const distance=Math.hypot(this.forward.x,this.forward.z);
      if(distance<1){
        if(this.canPlayerSee()&&this.elapsed<18)this.retreatTarget.addScaledVector(this.retreatDirection,7);
        else this._beginFade();
      }else if(this.elapsed>22)this._beginFade();
    }else if(this.phase==="pounce"){
      const t=THREE.MathUtils.clamp(this.elapsed/this.pounceDuration,0,1),eased=t*t*(3-2*t);
      this.entity.position.lerpVectors(this.pounceStart,this.pounceTarget,eased);
      this.entity.position.y+=Math.sin(Math.PI*t)*.55;
      this.entity.quaternion.copy(this.ceilingQuaternion).slerp(this.floorQuaternion,eased);
      if(t>=1){this.entity.position.copy(this.pounceTarget);this.phase="landed";this.elapsed=0;this.pounceLandedPending=true;}
    }else if(this.phase==="fallback"){
      this.moveOnPlane(step,this.retreatTarget.x,this.retreatTarget.z,2.4);
      this.forward.set(this.retreatTarget.x-this.entity.position.x,0,this.retreatTarget.z-this.entity.position.z);
      this._applyOrientation(this.up,this.forward,step);
      if(Math.hypot(this.forward.x,this.forward.z)<1.2||this.elapsed>6)this._beginFade();
    }else if(this.phase==="fade")this._tickFade(step);
    else if(this.phase==="complete")events.completed=true;

    if(this.pounceStartedPending){events.pounceStarted=true;this.pounceStartedPending=false;}
    if(this.pounceLandedPending){events.pounceLanded=true;this.pounceLandedPending=false;}
    if(this.completedPending){events.completed=true;this.completedPending=false;}
    events.behavior=this.behavior;
    return events;
  }
}
