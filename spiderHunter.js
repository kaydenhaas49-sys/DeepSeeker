import * as THREE from "three";
import { SignalStalkerRig } from "./signalStalker.js";

/**
 * SpiderHunter
 * A self-contained spider enemy controller for DeepSeeker.
 *
 * The behavior architecture is inspired by the strongest parts of the
 * imported Backrooms enemy: explicit states, perception, investigation,
 * replanning and obstacle-aware movement. The presentation and movement are
 * native to Lost Signal, so it does not depend on the donor game's maze code.
 */
export class SpiderHunter {
  constructor({
    group,
    scene,
    world,
    player,
    isBlocked = () => false,
    getOccluders = () => [],
    hasLineOfSight = null,
    getVisualHitboxDistance = null,
    onStateChange = () => {},
    visualRig = null,
    pathRadiusCells = 15,
    pathCell = 1.0,
    pathReplan = 0.55,
  }) {
    this.group = group;
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.isBlocked = isBlocked;
    this.getOccluders = getOccluders;
    this.externalLineOfSight = hasLineOfSight;
    this.getVisualHitboxDistance = getVisualHitboxDistance;
    this.onStateChange = onStateChange;

    this.mode = "hidden";
    this.position = group.position;
    this.path = [];
    this.pathIndex = 0;
    this.replanTimer = 0;
    this.lastSeenTime = -Infinity;
    this.lastKnownTarget = new THREE.Vector3();
    this.lastPathTarget = new THREE.Vector3();
    this.roamTarget = new THREE.Vector3();
    this.investigateTarget = new THREE.Vector3();
    this.sightOrigin=new THREE.Vector3();
    this.sightTarget=new THREE.Vector3();
    this.sightDelta=new THREE.Vector3();
    this.sightForward=new THREE.Vector3();
    this.sightFlatDirection=new THREE.Vector3();
    this.raycastDelta=new THREE.Vector3();
    this.soundOrigin=new THREE.Vector3();
    this.soundTarget=new THREE.Vector3();
    this.sightRaycaster=new THREE.Raycaster();
    this.tutorialLookTarget=new THREE.Vector3();
    this.lastHeardTime=-Infinity;
    this.hasPathTarget=false;
    this.hasRoamTarget=false;
    this.hasInvestigateTarget=false;
    this.investigateAtLastKnown=true;
    this.roamPauseTimer=0;
    this.investigateSearchTimer=0;
    this.facing = 0;
    this.walkPhase = 0;
    this.speed = 0;
    this.tutorialTime = 0;
    this.tutorialStatic = false;
    this.chaseStarted = false;

    this.pathCell = Math.max(0.75,pathCell);
    this.pathRadiusCells = Math.max(7,pathRadiusCells);
    this.pathReplan = Math.max(0.35,pathReplan);
    this.catchDistance = 0.90;
    this.activationDistance = 7.5;
    this.sightRange = 21;
    this.sightFov = Math.PI * 0.60;
    this.hearFlashlightRange = 9;

    this.visualRig = visualRig || new SignalStalkerRig();
    this.visualRig.root.visible = false;
    this.group.add(this.visualRig.root);
    this.group.visible = false;
    this.group.userData.spiderHunter = this;
  }

  setMode(mode) {
    if(this.mode===mode) return;
    this.mode=mode;
    this.path.length=0;
    this.pathIndex=0;
    this.hasPathTarget=false;
    if(mode==="roam"){
      this.hasRoamTarget=false;
      this.hasInvestigateTarget=false;
      this.roamPauseTimer=Math.random()*.8;
    }else if(mode==="investigate"){
      this.hasRoamTarget=false;
      this.investigateTarget.copy(this.lastKnownTarget);
      this.hasInvestigateTarget=true;
      this.investigateAtLastKnown=true;
      this.investigateSearchTimer=0;
    }else if(mode==="hunt" || mode==="enrage"){
      this.hasRoamTarget=false;
      this.hasInvestigateTarget=false;
    }else if(mode==="hidden"){
      this.hasRoamTarget=false;
      this.hasInvestigateTarget=false;
    }
    this.onStateChange(mode);
  }

  startRoaming(position) {
    this.position.copy(position);
    this.position.y=0.02;
    this.group.rotation.x=0;
    this.group.rotation.z=0;
    this.facing=Math.random()*Math.PI*2;
    this.group.rotation.y=this.facing;
    this.lastKnownTarget.set(position.x,0,position.z);
    this.lastSeenTime=-Infinity;
    this.lastHeardTime=-Infinity;
    this.lastPathTarget.set(NaN,0,NaN);
    this.path.length=0;
    this.pathIndex=0;
    this.replanTimer=0;
    this.hasPathTarget=false;
    this.hasRoamTarget=false;
    this.hasInvestigateTarget=false;
    this.roamPauseTimer=.25+Math.random()*1.15;
    this.investigateSearchTimer=0;
    this.tutorialStatic=false;
    this.chaseStarted=false;
    this.speed=0;
    this.visualRig.setFrozen(false);
    this.setMode("roam");
    this.visualRig.root.visible=true;
    this.group.visible=true;
    return true;
  }

  isSoundOccluded(sourceX,sourceZ) {
    const dx=sourceX-this.position.x,dz=sourceZ-this.position.z;
    const length=Math.hypot(dx,dz);
    if(length<.25) return false;
    this.soundOrigin.set(this.position.x,this.position.y+.45,this.position.z);
    this.soundTarget.set(sourceX,.75,sourceZ);
    this.raycastDelta.copy(this.soundTarget).sub(this.soundOrigin).normalize();
    this.sightRaycaster.set(this.soundOrigin,this.raycastDelta);
    this.sightRaycaster.near=0;
    this.sightRaycaster.far=Math.max(0,length-.15);
    const occluders=this.getOccluders()||[];
    return this.sightRaycaster.intersectObjects(occluders,true).length>0;
  }

  hearNoise(sourceX,sourceZ,{time=0,intensity=.5,running=false,crouched=false}={}) {
    if(this.mode==="hidden" || !Number.isFinite(sourceX) || !Number.isFinite(sourceZ)) return false;
    const dx=sourceX-this.position.x,dz=sourceZ-this.position.z;
    const distance=Math.hypot(dx,dz);
    const loudness=THREE.MathUtils.clamp(Number(intensity)||0,0,1);
    let range=crouched ? 3.8+loudness*3.5
      : running ? 19+loudness*7
      : 8.5+loudness*5.5;
    // Walls soften a sound instead of relaying exact player coordinates.
    if(this.isSoundOccluded(sourceX,sourceZ)) range*=.58;
    if(distance>range) return false;

    const uncertainty=THREE.MathUtils.clamp(
      distance*(crouched?.08:running?.18:.14)+(running?1.05:.55),
      .55,running?4.8:3.4
    );
    const angle=Math.random()*Math.PI*2,offset=Math.random()*uncertainty;
    this.lastKnownTarget.set(
      sourceX+Math.cos(angle)*offset,0,
      sourceZ+Math.sin(angle)*offset
    );
    this.lastHeardTime=time;
    if(this.mode==="roam" || this.mode==="investigate" ||
       ((this.mode==="hunt" || this.mode==="enrage") && time-this.lastSeenTime>.75)){
      if(this.mode!=="investigate") this.setMode("investigate");
      else{
        this.path.length=0;
        this.pathIndex=0;
        this.hasPathTarget=false;
        this.investigateSearchTimer=0;
      }
      this.investigateTarget.copy(this.lastKnownTarget);
      this.hasInvestigateTarget=true;
      this.investigateAtLastKnown=true;
    }
    return true;
  }

  hide() {
    this.setMode("hidden");
    this.group.visible = false;
    this.visualRig.root.visible = false;
    this.speed = 0;
    this.tutorialTime = 0;
    this.chaseStarted = false;
    this.position.y = 0.02;
    this.group.rotation.x = 0;
    this.group.rotation.z = 0;
    this.visualRig.setFrozen(true);
  }

  distanceToHitbox(x, z) {
    if (typeof this.getVisualHitboxDistance === "function") {
      const distance = this.getVisualHitboxDistance(x, z);
      if (Number.isFinite(distance)) return distance;
    }
    return this.visualRig.distanceToHitbox(x, z);
  }

  intersectsHitbox(x, z, padding = 0) {
    return this.group.visible && this.mode !== "hidden" &&
      this.distanceToHitbox(x, z) <= Math.max(0, padding);
  }

  prepareTutorial(position, lookAtPosition) {
    this.position.copy(position);
    this.position.y = 0.02;
    this.group.rotation.x = 0;
    this.group.rotation.z = 0;
    this.group.scale.setScalar(1);
    this.tutorialTime = 0;
    this.tutorialStatic = true;
    this.chaseStarted = false;
    this.visualRig.setFrozen(true);
    this.lastKnownTarget.copy(lookAtPosition);
    const dx = lookAtPosition.x - this.position.x;
    const dz = lookAtPosition.z - this.position.z;
    if (Math.hypot(dx, dz) > 0.001) {
      this.facing = Math.atan2(dx, dz);
      this.group.rotation.y = this.facing;
    }
    this.setMode("roam");
    this.visualRig.root.visible = true;
    this.group.visible = true;
    this.speed = 0;
    return true;
  }

  beginChase() {
    this.tutorialStatic = false;
    this.chaseStarted = true;
    this.visualRig.setFrozen(false);
    this.tutorialTime = 0;
    this.path.length = 0;
    this.pathIndex = 0;
    this.setMode("hunt");
    this.visualRig.root.visible = true;
    this.group.visible = true;
  }

  updateTutorial(dt, target) {
    if (!this.group.visible || this.mode === "hidden") {
      return { triggered: false, finished: false };
    }

    this.tutorialTime += dt;
    const distanceToSurface = this.distanceToHitbox(target.pos.x, target.pos.z);

    if (!this.chaseStarted) {
      // Absolutely still until the player approaches the real creature shape.
      this.speed = 0;
      if (distanceToSurface <= this.activationDistance) {
        this.beginChase();
        return { triggered: true, finished: false };
      }
      return { triggered: false, finished: false };
    }

    const finished =
      distanceToSurface <= this.catchDistance || this.tutorialTime >= 7.0;
    if (finished) {
      return { triggered: false, finished: true };
    }

    this.lastKnownTarget.set(target.pos.x, 0, target.pos.z);

    const moved = this.tryDirectSteering(dt, target.pos.x, target.pos.z, 6.0);
    if (!moved) {
      this.updatePath(dt, target.pos.x, target.pos.z);
      this.followPath(dt, 6.0);
    }

    const remainingDx = target.pos.x - this.position.x;
    const remainingDz = target.pos.z - this.position.z;
    const remainingDistance = Math.hypot(remainingDx, remainingDz);
    if (remainingDistance > 0.001) {
      this.tutorialLookTarget.set(target.pos.x,this.position.y,target.pos.z);
      this.faceToward(this.tutorialLookTarget,9);
    }

    this.animateLegs(dt, 6.0);
    return { triggered: false, finished: false };
  }

  updateHunter(dt,time,target,{sprinting=false,flashlightOn=false,crouched=false}={}) {
    if(this.mode==="hidden") return;
    const distance=Math.hypot(this.position.x-target.pos.x,this.position.z-target.pos.z);
    const visible=this.canSeeTarget(target.pos,target.eyeY??1.5,flashlightOn,crouched);

    if(visible){
      this.lastSeenTime=time;
      this.lastKnownTarget.set(target.pos.x,0,target.pos.z);
      if(this.mode==="roam" || this.mode==="investigate"){
        this.setMode(distance<7?"enrage":"hunt");
      }
    }else if((this.mode==="hunt" || this.mode==="enrage") && time-this.lastSeenTime>.72){
      // Follow the last seen point, not the live player position through a wall.
      this.setMode("investigate");
    }

    const lastClueTime=Math.max(this.lastSeenTime,this.lastHeardTime);
    if(this.mode==="investigate" && time-lastClueTime>8.5) this.setMode("roam");

    if(this.mode==="roam"){
      this.updateRoaming(dt);
      this.animateLegs(dt,Math.max(this.speed,.12));
      return;
    }
    if(this.mode==="investigate"){
      this.updateInvestigation(dt);
      this.animateLegs(dt,Math.max(this.speed,.10));
      return;
    }

    const speed=this.mode==="enrage"?6.2:4.4;
    this.updatePath(dt,this.lastKnownTarget.x,this.lastKnownTarget.z);
    const moved=this.followPath(dt,speed);
    if(!moved && !this.path.length) this.speed=THREE.MathUtils.damp(this.speed,0,8,dt);
    const waypoint=this.path[this.pathIndex];
    if(waypoint) this.faceToward({x:waypoint[0],z:waypoint[1]},9);
    else this.faceToward(this.lastKnownTarget,7);
    this.animateLegs(dt,Math.max(this.speed,.15));
  }

  chooseRoamTarget(){
    for(let attempt=0;attempt<8;attempt++){
      const angle=Math.random()*Math.PI*2,distance=3.5+Math.random()*8.5;
      const x=this.position.x+Math.cos(angle)*distance;
      const z=this.position.z+Math.sin(angle)*distance;
      if(this.isBlocked(x,z)) continue;
      const path=this.findLocalPath(this.position.x,this.position.z,x,z);
      if(!path.length) continue;
      this.roamTarget.set(x,0,z);
      this.path=path;
      this.pathIndex=0;
      this.replanTimer=0;
      this.lastPathTarget.set(x,0,z);
      this.hasPathTarget=true;
      this.hasRoamTarget=true;
      return true;
    }
    this.hasRoamTarget=false;
    this.roamPauseTimer=.45+Math.random()*.55;
    this.speed=0;
    return false;
  }

  updateRoaming(dt){
    this.roamPauseTimer=Math.max(0,this.roamPauseTimer-dt);
    if(this.roamPauseTimer>0){
      this.speed=THREE.MathUtils.damp(this.speed,0,6,dt);
      return;
    }
    if(!this.hasRoamTarget && !this.chooseRoamTarget()) return;
    const distance=Math.hypot(this.roamTarget.x-this.position.x,this.roamTarget.z-this.position.z);
    if(distance<.7){
      this.hasRoamTarget=false;
      this.path.length=0;
      this.pathIndex=0;
      this.hasPathTarget=false;
      this.roamPauseTimer=.5+Math.random()*1.8;
      this.speed=0;
      return;
    }
    this.updatePath(dt,this.roamTarget.x,this.roamTarget.z);
    const moved=this.followPath(dt,1.2);
    if(!moved && !this.path.length){
      this.hasRoamTarget=false;
      this.roamPauseTimer=.4;
      this.speed=0;
      return;
    }
    const waypoint=this.path[this.pathIndex];
    if(waypoint) this.faceToward({x:waypoint[0],z:waypoint[1]},5.5);
    else this.faceToward(this.roamTarget,5.5);
  }

  chooseInvestigationTarget(){
    for(let attempt=0;attempt<8;attempt++){
      const angle=Math.random()*Math.PI*2,distance=1.4+Math.random()*3.2;
      const x=this.lastKnownTarget.x+Math.cos(angle)*distance;
      const z=this.lastKnownTarget.z+Math.sin(angle)*distance;
      if(this.isBlocked(x,z)) continue;
      const path=this.findLocalPath(this.position.x,this.position.z,x,z);
      if(!path.length) continue;
      this.investigateTarget.set(x,0,z);
      this.path=path;
      this.pathIndex=0;
      this.replanTimer=0;
      this.lastPathTarget.set(x,0,z);
      this.hasPathTarget=true;
      this.hasInvestigateTarget=true;
      this.investigateAtLastKnown=false;
      return true;
    }
    this.investigateTarget.copy(this.lastKnownTarget);
    this.hasInvestigateTarget=true;
    this.investigateAtLastKnown=false;
    return false;
  }

  updateInvestigation(dt){
    this.investigateSearchTimer+=dt;
    if(!this.hasInvestigateTarget){
      this.investigateTarget.copy(this.lastKnownTarget);
      this.hasInvestigateTarget=true;
      this.investigateAtLastKnown=true;
    }
    const distance=Math.hypot(
      this.investigateTarget.x-this.position.x,
      this.investigateTarget.z-this.position.z
    );
    if(distance<.85){
      if(this.investigateAtLastKnown){
        this.chooseInvestigationTarget();
      }else{
        this.investigateTarget.copy(this.lastKnownTarget);
        this.hasInvestigateTarget=true;
        this.investigateAtLastKnown=true;
        this.path.length=0;
        this.pathIndex=0;
        this.hasPathTarget=false;
        this.roamPauseTimer=.25+Math.random()*.35;
      }
    }
    if(this.roamPauseTimer>0){
      this.roamPauseTimer=Math.max(0,this.roamPauseTimer-dt);
      this.speed=THREE.MathUtils.damp(this.speed,0,6,dt);
      return;
    }
    this.updatePath(dt,this.investigateTarget.x,this.investigateTarget.z);
    const moved=this.followPath(dt,2.8);
    if(!moved && !this.path.length) this.speed=THREE.MathUtils.damp(this.speed,0,8,dt);
    const waypoint=this.path[this.pathIndex];
    if(waypoint) this.faceToward({x:waypoint[0],z:waypoint[1]},7);
    else this.faceToward(this.investigateTarget,7);
  }

  canSeeTarget(targetPosition, targetY = 1.5, flashlightOn = false, crouched = false) {
    const origin=this.sightOrigin.set(
      this.position.x,
      this.position.y+.62,
      this.position.z
    );
    const target=this.sightTarget.set(
      targetPosition.x,
      targetY,
      targetPosition.z
    );
    const delta=this.sightDelta.copy(target).sub(origin);
    const distance=delta.length();

    const range=this.sightRange+(flashlightOn?5:0)-(crouched?3:0);
    if(distance>range || distance<0.05) return false;

    const forward=this.sightForward.set(
      Math.sin(this.facing),
      0,
      Math.cos(this.facing)
    );
    const direction=this.sightFlatDirection.copy(delta).setY(0).normalize();
    if (distance > 2 && forward.dot(direction) < Math.cos(this.sightFov * 0.5)) {
      return false;
    }

    return this.externalLineOfSight
      ? this.externalLineOfSight(origin, target)
      : this.raycastLineOfSight(origin, target);
  }

  raycastLineOfSight(origin, target) {
    const delta=this.raycastDelta.copy(target).sub(origin);
    const length=delta.length();
    if(length<.05) return true;
    delta.normalize();

    this.sightRaycaster.set(origin,delta);
    this.sightRaycaster.near=0;
    this.sightRaycaster.far=Math.max(0,length-.12);
    const occluders=this.getOccluders()||[];
    return this.sightRaycaster.intersectObjects(occluders,true).length===0;
  }

  updatePath(dt,targetX,targetZ) {
    this.replanTimer+=dt;
    const targetShift=!this.hasPathTarget ||
      Math.hypot(targetX-this.lastPathTarget.x,targetZ-this.lastPathTarget.z)>2.4;
    const retryEmpty=this.path.length===0 &&
      (!this.hasPathTarget || this.replanTimer>=this.pathReplan);
    const finished=this.path.length>0 && this.pathIndex>=this.path.length;
    if(!retryEmpty && !finished && this.replanTimer<this.pathReplan && !targetShift) return;
    this.replanTimer=0;
    this.path=this.findLocalPath(this.position.x,this.position.z,targetX,targetZ);
    this.pathIndex=0;
    this.lastPathTarget.set(targetX,0,targetZ);
    this.hasPathTarget=true;
  }

  findLocalPath(startX,startZ,targetX,targetZ) {
    const radius=this.pathRadiusCells,maxOffset=radius-1,cols=radius*2+1,total=cols*cols;
    const cellIndex=(x,z)=>z*cols+x;
    const worldX=cx=>startX+(cx-radius)*this.pathCell;
    const worldZ=cz=>startZ+(cz-radius)*this.pathCell;
    const startNode=cellIndex(radius,radius);
    const blockedCache=new Int8Array(total);
    blockedCache.fill(-1);
    const blocked=(cx,cz)=>{
      if(cx<1||cz<1||cx>=cols-1||cz>=cols-1) return true;
      const id=cellIndex(cx,cz);
      if(blockedCache[id]===-1) blockedCache[id]=this.isBlocked(worldX(cx),worldZ(cz))?1:0;
      return blockedCache[id]===1;
    };
    if(blocked(radius,radius)) return [];

    const rawX=Math.round((targetX-startX)/this.pathCell);
    const rawZ=Math.round((targetZ-startZ)/this.pathCell);
    const goalX=THREE.MathUtils.clamp(rawX,-maxOffset,maxOffset)+radius;
    const goalZ=THREE.MathUtils.clamp(rawZ,-maxOffset,maxOffset)+radius;
    const goalFlags=new Uint8Array(total);
    let goalsFound=false;
    for(let ring=0;ring<=maxOffset && !goalsFound;ring++){
      for(let dz=-ring;dz<=ring;dz++){
        for(let dx=-ring;dx<=ring;dx++){
          if(ring>0 && Math.abs(dx)!==ring && Math.abs(dz)!==ring) continue;
          const cx=goalX+dx,cz=goalZ+dz;
          if(Math.abs(cx-radius)>maxOffset || Math.abs(cz-radius)>maxOffset || blocked(cx,cz)) continue;
          goalFlags[cellIndex(cx,cz)]=1;
          goalsFound=true;
        }
      }
    }
    if(!goalsFound) return [];

    const gScore=new Float64Array(total);gScore.fill(Infinity);
    const fScore=new Float64Array(total);fScore.fill(Infinity);
    const cameFrom=new Int32Array(total);cameFrom.fill(-1);
    const closed=new Uint8Array(total);
    const heapNodes=[],heapScores=[];
    let poppedScore=Infinity;
    const heuristic=(cx,cz)=>{
      const dx=Math.abs(cx-goalX),dz=Math.abs(cz-goalZ);
      return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz);
    };
    const push=(node,score)=>{
      let child=heapNodes.length;heapNodes.push(node);heapScores.push(score);
      while(child>0){
        const parent=Math.floor((child-1)/2);
        if(heapScores[parent]<=score)break;
        heapNodes[child]=heapNodes[parent];heapScores[child]=heapScores[parent];child=parent;
      }
      heapNodes[child]=node;heapScores[child]=score;
    };
    const pop=()=>{
      const node=heapNodes[0];poppedScore=heapScores[0];
      const lastNode=heapNodes.pop(),lastScore=heapScores.pop();
      if(heapNodes.length){
        let parent=0;
        while(true){
          const left=parent*2+1;if(left>=heapNodes.length)break;
          const right=left+1;
          let child=left;
          if(right<heapNodes.length && heapScores[right]<heapScores[left])child=right;
          if(heapScores[child]>=lastScore)break;
          heapNodes[parent]=heapNodes[child];heapScores[parent]=heapScores[child];parent=child;
        }
        heapNodes[parent]=lastNode;heapScores[parent]=lastScore;
      }
      return node;
    };
    const reconstruct=goal=>{
      const result=[];let cursor=goal;
      while(cursor!==startNode){
        result.unshift([worldX(cursor%cols),worldZ(Math.floor(cursor/cols))]);
        cursor=cameFrom[cursor];
        if(cursor<0)return [];
      }
      return result;
    };

    gScore[startNode]=0;fScore[startNode]=heuristic(radius,radius);push(startNode,fScore[startNode]);
    let bestFallback=startNode,bestDistance=(startX-targetX)**2+(startZ-targetZ)**2;
    const dirs=[
      [1,0,1],[-1,0,1],[0,1,1],[0,-1,1],
      [1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]
    ];
    while(heapNodes.length){
      const current=pop();
      if(poppedScore>fScore[current]+1e-7 || closed[current])continue;
      closed[current]=1;
      const cx=current%cols,cz=Math.floor(current/cols);
      const distance=(worldX(cx)-targetX)**2+(worldZ(cz)-targetZ)**2;
      if(distance<bestDistance){bestFallback=current;bestDistance=distance;}
      if(goalFlags[current])return reconstruct(current);

      for(const [dx,dz,cost] of dirs){
        const nx=cx+dx,nz=cz+dz;
        if(blocked(nx,nz))continue;
        if(dx!==0&&dz!==0&&(blocked(cx+dx,cz)||blocked(cx,cz+dz)))continue;
        const next=cellIndex(nx,nz);
        if(closed[next])continue;
        const tentative=gScore[current]+cost;
        if(tentative+1e-8<gScore[next]){
          cameFrom[next]=current;gScore[next]=tentative;
          fScore[next]=tentative+heuristic(nx,nz);
          push(next,fScore[next]);
        }
      }
    }
    // A reachable partial path lets the search window recenter instead of
    // replacing navigation with a direct line through a wall.
    return bestFallback===startNode?[]:reconstruct(bestFallback);
  }

  followPath(dt,speed) {
    while(this.path.length && this.pathIndex<this.path.length){
      const [tx,tz]=this.path[this.pathIndex];
      const dx=tx-this.position.x,dz=tz-this.position.z;
      const distance=Math.hypot(dx,dz);
      if(distance<.48){this.pathIndex++;continue;}
      const step=Math.min(distance,Math.max(0,speed*dt));
      const inv=1/Math.max(distance,.001);
      if(!this.tryMove(dx*inv*step,dz*inv*step)){
        this.path.length=0;this.pathIndex=0;this.hasPathTarget=false;this.speed=0;return false;
      }
      this.speed=speed;return true;
    }
    this.speed=0;return false;
  }

  tryDirectSteering(dt, targetX, targetZ, speed) {
    const dx = targetX - this.position.x;
    const dz = targetZ - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.01) {
      this.speed = 0;
      return;
    }

    const inv = 1 / distance;
    const step = Math.min(distance, speed * dt);
    const moveX = dx * inv * step;
    const moveZ = dz * inv * step;

    if (this.tryMove(moveX, moveZ)) {
      this.speed = speed;
      return true;
    }

    const slideA = this.tryMove(moveX, 0);
    const slideB = this.tryMove(0, moveZ);
    if (slideA || slideB) {
      this.speed = speed * 0.72;
      return true;
    }

    this.speed = 0;
    return false;
  }

  tryMove(dx,dz) {
    const distance=Math.hypot(dx,dz);
    if(distance<1e-7)return true;
    const steps=Math.max(1,Math.ceil(distance/.20));
    const stepX=dx/steps,stepZ=dz/steps;
    let moved=false;
    for(let i=0;i<steps;i++){
      const nextX=this.position.x+stepX,nextZ=this.position.z+stepZ;
      if(!this.isBlocked(nextX,nextZ)){
        this.position.x=nextX;this.position.z=nextZ;moved=true;continue;
      }
      let slid=false;
      if(Math.abs(stepX)>.0001&&!this.isBlocked(nextX,this.position.z)){
        this.position.x=nextX;moved=true;slid=true;
      }
      if(Math.abs(stepZ)>.0001&&!this.isBlocked(this.position.x,nextZ)){
        this.position.z=nextZ;moved=true;slid=true;
      }
      if(!slid)return moved;
    }
    return moved;
  }

  faceToward(target, damp = 8) {
    const point = target instanceof THREE.Vector3
      ? target
      : new THREE.Vector3(target.x, this.position.y, target.z);
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    if (Math.hypot(dx, dz) < 0.001) return;

    const targetAngle = Math.atan2(dx, dz);
    let delta = targetAngle - this.facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const amount = Math.min(1, damp * (this._lastDt ?? 0.016));
    this.facing += delta * amount;
    this.group.rotation.y = this.facing;
  }

  animateLegs(dt, moveSpeed) {
    this.visualRig.update(dt, moveSpeed, this.mode);
    this.group.position.y = 0.02;
  }

  step(dt) {
    this._lastDt = dt;
    this.visualRig.root.updateMatrixWorld(true);
    this.group.updateMatrixWorld(true);
  }
}
