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
    // Reused ray/visibility scratch objects prevent a fresh group of vectors and
    // a Raycaster from being allocated on every active-spider frame.
    this.sightOrigin=new THREE.Vector3();
    this.sightTarget=new THREE.Vector3();
    this.sightDelta=new THREE.Vector3();
    this.sightForward=new THREE.Vector3();
    this.sightFlatDirection=new THREE.Vector3();
    this.raycastDelta=new THREE.Vector3();
    this.sightRaycaster=new THREE.Raycaster();
    this.tutorialLookTarget=new THREE.Vector3();
    this.facing = 0;
    this.walkPhase = 0;
    this.speed = 0;
    this.tutorialTime = 0;
    this.tutorialStatic = false;
    this.chaseStarted = false;

    this.pathCell = 1.15;
    this.pathRadiusCells = 7;
    this.pathReplan = 0.30;
    this.catchDistance = 0.90;
    this.activationDistance = 7.5;
    this.sightRange = 24;
    this.sightFov = Math.PI * 0.82;
    this.hearSprintRange = 13;
    this.hearFlashlightRange = 9;

    this.visualRig = visualRig || new SignalStalkerRig();
    this.visualRig.root.visible = false;
    this.group.add(this.visualRig.root);
    this.group.visible = false;
    this.group.userData.spiderHunter = this;
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.path.length = 0;
    this.pathIndex = 0;
    this.onStateChange(mode);
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

  updateHunter(dt, time, target, { sprinting = false, flashlightOn = false } = {}) {
    if (this.mode === "hidden") return;

    const distance = this.position.distanceTo(target.pos);
    const visible = this.canSeeTarget(target.pos, target.eyeY ?? 1.5);
    const hearsSprint = sprinting && distance < this.hearSprintRange;
    const hearsFlashlight =
      flashlightOn && distance < this.hearFlashlightRange && visible;

    if (visible || hearsSprint) {
      this.lastSeenTime = time;
      this.lastKnownTarget.set(target.pos.x, 0, target.pos.z);

      if (this.mode === "roam" || this.mode === "investigate") {
        this.setMode(distance < 7 ? "enrage" : "hunt");
      }
    } else if (this.mode === "hunt" || this.mode === "enrage") {
      if (time - this.lastSeenTime > 4.2) {
        this.setMode("roam");
      } else {
        this.setMode("investigate");
      }
    } else if (this.mode === "investigate" && time - this.lastSeenTime > 6.2) {
      // A search is temporary; do not leave the enemy permanently in investigate.
      this.setMode("roam");
    }

    if (hearsFlashlight && this.mode === "roam") {
      this.lastKnownTarget.set(target.pos.x, 0, target.pos.z);
      this.setMode("investigate");
    }

    const speed =
      this.mode === "enrage"
        ? 6.2
        : this.mode === "hunt"
          ? 4.4
          : this.mode === "investigate"
            ? 3.2
            : 1.25;

    const destination =
      this.mode === "roam"
        ? null
        : this.lastKnownTarget;

    if (destination) {
      this.updatePath(dt, destination.x, destination.z);
      if (!this.followPath(dt, speed)) {
        this.tryDirectSteering(dt, destination.x, destination.z, speed);
      }
      this.faceToward(destination, 9);
    } else {
      this.speed = THREE.MathUtils.damp(this.speed, 0.35, 5, dt);
    }

    this.animateLegs(dt, Math.max(this.speed, speed * 0.15));
  }

  canSeeTarget(targetPosition, targetY = 1.5) {
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

    if (distance > this.sightRange || distance < 0.05) return false;

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

  updatePath(dt, targetX, targetZ) {
    this.replanTimer += dt;
    const currentX = this.position.x;
    const currentZ = this.position.z;
    const needReplan =
      this.path.length === 0 ||
      this.pathIndex >= this.path.length ||
      this.replanTimer >= this.pathReplan ||
      Math.hypot(
        targetX - (this.lastKnownTarget.x ?? targetX),
        targetZ - (this.lastKnownTarget.z ?? targetZ)
      ) > 2.0;

    if (!needReplan) return;

    this.replanTimer = 0;
    this.path = this.findLocalPath(currentX, currentZ, targetX, targetZ);
    this.pathIndex = 0;
    this.lastKnownTarget.set(targetX, 0, targetZ);
  }

  findLocalPath(startX, startZ, targetX, targetZ) {
    const cols = this.pathRadiusCells * 2 + 1;
    const start = [this.pathRadiusCells, this.pathRadiusCells];
    const targetCellX = Math.round((targetX - startX) / this.pathCell);
    const targetCellZ = Math.round((targetZ - startZ) / this.pathCell);
    const maxOffset = this.pathRadiusCells - 1;
    const goal = [
      THREE.MathUtils.clamp(targetCellX + this.pathRadiusCells, 0, cols - 1),
      THREE.MathUtils.clamp(targetCellZ + this.pathRadiusCells, 0, cols - 1)
    ];

    const open=[0];
    const openSet=new Set([0]);
    const came = new Map();
    const g = new Map([[0, 0]]);
    const f = new Map();
    f.set(0, Math.abs(goal[0] - start[0]) + Math.abs(goal[1] - start[1]));
    const blocked = new Set();

    const index = (x, z) => z * cols + x;
    const isBlocked = (cx, cz) => {
      const localX = cx - this.pathRadiusCells;
      const localZ = cz - this.pathRadiusCells;
      if (Math.abs(localX) > maxOffset || Math.abs(localZ) > maxOffset) return true;
      const wx = startX + localX * this.pathCell;
      const wz = startZ + localZ * this.pathCell;
      const key = index(cx, cz);
      if (blocked.has(key)) return true;
      if (this.isBlocked(wx, wz)) {
        blocked.add(key);
        return true;
      }
      return false;
    };

    if (isBlocked(goal[0], goal[1])) return [];

    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    while (open.length) {
      let best = 0;
      let bestF = Infinity;
      for (let i = 0; i < open.length; i++) {
        const value = f.get(open[i]) ?? Infinity;
        if (value < bestF) {
          bestF = value;
          best = i;
        }
      }

      const current=open.splice(best,1)[0];
      openSet.delete(current);
      const cx = current % cols;
      const cz = Math.floor(current / cols);

      if (cx === goal[0] && cz === goal[1]) {
        const path = [];
        let cursor = current;
        while (cursor !== 0) {
          path.unshift([
            startX + ((cursor % cols) - this.pathRadiusCells) * this.pathCell,
            startZ + (Math.floor(cursor / cols) - this.pathRadiusCells) * this.pathCell
          ]);
          cursor = came.get(cursor);
          if (cursor === undefined) break;
        }
        return path;
      }

      for (const [dx, dz] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= cols || nz >= cols) continue;
        if (isBlocked(nx, nz)) continue;

        const ni = index(nx, nz);
        const tentative = (g.get(current) ?? Infinity) + 1;
        if (tentative < (g.get(ni) ?? Infinity)) {
          came.set(ni, current);
          g.set(ni, tentative);
          f.set(
            ni,
            tentative + Math.abs(nx - goal[0]) + Math.abs(nz - goal[1])
          );
          if(!openSet.has(ni)){
            open.push(ni);
            openSet.add(ni);
          }
        }
      }
    }

    return [];
  }

  followPath(dt, speed) {
    if (!this.path.length || this.pathIndex >= this.path.length) {
      this.speed = 0;
      return false;
    }

    const [tx, tz] = this.path[this.pathIndex];
    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.55) {
      this.pathIndex += 1;
      return this.followPath(dt, speed);
    }

    const inv = 1 / Math.max(distance, 0.001);
    const step = Math.min(distance, speed * dt);
    const moveX = dx * inv * step;
    const moveZ = dz * inv * step;

    if (!this.tryMove(moveX, moveZ)) {
      this.path.length = 0;
      this.speed = 0;
      return false;
    }

    this.speed = speed;
    return true;
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

  tryMove(dx, dz) {
    const nextX = this.position.x + dx;
    const nextZ = this.position.z + dz;
    if (!this.isBlocked(nextX, nextZ)) {
      this.position.x = nextX;
      this.position.z = nextZ;
      return true;
    }
    if (!this.isBlocked(nextX, this.position.z)) {
      this.position.x = nextX;
      return true;
    }
    if (!this.isBlocked(this.position.x, nextZ)) {
      this.position.z = nextZ;
      return true;
    }
    return false;
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
