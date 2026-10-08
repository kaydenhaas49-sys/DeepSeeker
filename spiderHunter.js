import * as THREE from "three";

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
    onStateChange = () => {},
  }) {
    this.group = group;
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.isBlocked = isBlocked;
    this.getOccluders = getOccluders;
    this.externalLineOfSight = hasLineOfSight;
    this.onStateChange = onStateChange;

    this.mode = "hidden";
    this.position = group.position;
    this.path = [];
    this.pathIndex = 0;
    this.replanTimer = 0;
    this.lastSeenTime = -Infinity;
    this.lastKnownTarget = new THREE.Vector3();
    this.facing = 0;
    this.walkPhase = 0;
    this.speed = 0;
    this.tutorialTime = 0;
    this.tutorialStatic = false;
    this.chaseStarted = false;

    this.pathCell = 1.15;
    this.pathRadiusCells = 7;
    this.pathReplan = 0.30;
    this.catchDistance = 1.1;
    this.sightRange = 24;
    this.sightFov = Math.PI * 0.82;
    this.hearSprintRange = 13;
    this.hearFlashlightRange = 9;

    this.legMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0808,
      roughness: 0.82,
      metalness: 0.08,
      flatShading: true,
    });
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x121010,
      roughness: 0.72,
      metalness: 0.12,
      flatShading: true,
    });
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff321e });
    this.underMaterial = new THREE.MeshStandardMaterial({
      color: 0x050404,
      roughness: 0.95,
      flatShading: true,
    });

    this.legs = [];
    this.buildVisual();

    this.group.visible = false;
    this.group.userData.spiderHunter = this;
  }

  buildVisual() {
    const abdomen = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 14, 9),
      this.bodyMaterial
    );
    abdomen.name = "SpiderAbdomen";
    abdomen.scale.set(1.18, 0.86, 1.34);
    abdomen.position.set(0, 0.58, 0.20);
    abdomen.castShadow = true;

    const abdomenTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 12, 8),
      this.bodyMaterial
    );
    abdomenTop.name = "SpiderBackPlate";
    abdomenTop.scale.set(1.05, 0.55, 1.28);
    abdomenTop.position.set(0, 0.76, 0.15);
    abdomenTop.castShadow = true;

    const thorax = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 12, 8),
      this.bodyMaterial
    );
    thorax.name = "SpiderThorax";
    thorax.scale.set(1.12, 0.72, 1.18);
    thorax.position.set(0, 0.50, -0.53);
    thorax.castShadow = true;

    const underside = new THREE.Mesh(
      new THREE.SphereGeometry(0.43, 12, 7),
      this.underMaterial
    );
    underside.scale.set(1.06, 0.52, 1.14);
    underside.position.set(0, 0.30, -0.12);

    this.group.add(abdomen, abdomenTop, thorax, underside);

    const eyePositions = [
      [-0.16, 0.61, -0.96, 0.052],
      [0.16, 0.61, -0.96, 0.052],
      [-0.30, 0.55, -0.89, 0.034],
      [0.30, 0.55, -0.89, 0.034],
      [-0.40, 0.48, -0.79, 0.026],
      [0.40, 0.48, -0.79, 0.026],
      [-0.10, 0.44, -0.91, 0.022],
      [0.10, 0.44, -0.91, 0.022],
    ];
    for (const [x, y, z, r] of eyePositions) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(r, 7, 5),
        this.eyeMaterial
      );
      eye.position.set(x, y, z);
      eye.userData.spiderEye = true;
      this.group.add(eye);
    }

    const fangGeo = new THREE.ConeGeometry(0.065, 0.30, 7);
    for (const x of [-0.14, 0.14]) {
      const fang = new THREE.Mesh(fangGeo, this.underMaterial);
      fang.position.set(x, 0.31, -0.96);
      fang.rotation.x = Math.PI;
      this.group.add(fang);
    }

    const hipRows = [-0.62, -0.23, 0.18, 0.58];
    for (let row = 0; row < hipRows.length; row++) {
      for (const side of [-1, 1]) {
        const upper = new THREE.Mesh(
          new THREE.CylinderGeometry(0.060, 0.085, 1, 6),
          this.legMaterial
        );
        const lower = new THREE.Mesh(
          new THREE.CylinderGeometry(0.047, 0.065, 1, 6),
          this.legMaterial
        );
        const joint = new THREE.Mesh(
          new THREE.SphereGeometry(0.082, 7, 5),
          this.legMaterial
        );

        upper.castShadow = lower.castShadow = joint.castShadow = true;
        this.group.add(upper, lower, joint);

        const frontBias = row < 2 ? -0.10 : 0.12;
        const footZ = hipRows[row] + frontBias;
        const reach = 1.15 + (row === 0 ? 0.16 : row === 3 ? -0.02 : 0);

        this.legs.push({
          side,
          row,
          hipLocal: new THREE.Vector3(0.32 * side, 0.43, hipRows[row]),
          footBase: new THREE.Vector3(reach * side, 0.045, footZ),
          upper,
          lower,
          joint,
          phase: (row * 1.72 + (side > 0 ? 0 : Math.PI)) % (Math.PI * 2),
          foot: new THREE.Vector3(),
          prevFoot: new THREE.Vector3(),
        });
      }
    }
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
    this.speed = 0;
    this.tutorialTime = 0;
    this.chaseStarted = false;
    this.position.y = 0.02;
    this.group.rotation.x = 0;
    this.group.rotation.z = 0;
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
    this.lastKnownTarget.copy(lookAtPosition);
    this.faceToward(lookAtPosition, 1);
    this.setMode("roam");
    this.group.visible = true;
    this.speed = 0;
    return true;
  }

  beginChase() {
    this.tutorialStatic = false;
    this.chaseStarted = true;
    this.tutorialTime = 0;
    this.path.length = 0;
    this.pathIndex = 0;
    this.setMode("hunt");
    this.group.visible = true;
  }

  updateTutorial(dt, target) {
    if (!this.group.visible || this.mode === "hidden") {
      return { triggered: false, finished: false };
    }

    this.tutorialTime += dt;
    const dx = target.pos.x - this.position.x;
    const dz = target.pos.z - this.position.z;
    const distance = Math.hypot(dx, dz);

    if (!this.chaseStarted) {
      this.speed = 0;
      this.faceToward(
        new THREE.Vector3(target.pos.x, this.position.y, target.pos.z),
        10
      );
      this.animateLegs(dt, 0);
      if (distance <= 5.2) {
        this.beginChase();
        return { triggered: true, finished: false };
      }
      return { triggered: false, finished: false };
    }

    const finished =
      distance <= this.catchDistance || this.tutorialTime >= 3.25;
    if (finished) {
      return { triggered: false, finished: true };
    }

    this.lastKnownTarget.set(target.pos.x, 0, target.pos.z);

    const moved = this.tryDirectSteering(dt, target.pos.x, target.pos.z, 5.5);
    if (!moved) {
      this.updatePath(dt, target.pos.x, target.pos.z);
      this.followPath(dt, 5.5);
    }

    const remainingDx = target.pos.x - this.position.x;
    const remainingDz = target.pos.z - this.position.z;
    const remainingDistance = Math.hypot(remainingDx, remainingDz);
    if (remainingDistance > 0.001) {
      this.faceToward(
        new THREE.Vector3(target.pos.x, this.position.y, target.pos.z),
        9
      );
    }

    this.animateLegs(dt, 5.5);
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
    const origin = new THREE.Vector3(
      this.position.x,
      this.position.y + 0.62,
      this.position.z
    );
    const target = new THREE.Vector3(
      targetPosition.x,
      targetY,
      targetPosition.z
    );
    const delta = target.clone().sub(origin);
    const distance = delta.length();

    if (distance > this.sightRange || distance < 0.05) return false;

    const forward = new THREE.Vector3(
      Math.sin(this.facing),
      0,
      Math.cos(this.facing)
    );
    const direction = delta.clone().setY(0).normalize();
    if (distance > 2 && forward.dot(direction) < Math.cos(this.sightFov * 0.5)) {
      return false;
    }

    return this.externalLineOfSight
      ? this.externalLineOfSight(origin, target)
      : this.raycastLineOfSight(origin, target);
  }

  raycastLineOfSight(origin, target) {
    const delta = target.clone().sub(origin);
    const length = delta.length();
    if (length < 0.05) return true;
    delta.normalize();

    const raycaster = new THREE.Raycaster(origin, delta, 0, Math.max(0, length - 0.12));
    const occluders = this.getOccluders() || [];
    return raycaster.intersectObjects(occluders, true).length === 0;
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

    const open = [0];
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

      const current = open.splice(best, 1)[0];
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
          if (!open.includes(ni)) open.push(ni);
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
    const moving = moveSpeed > 0.15;
    this.walkPhase += dt * (moving ? 5.6 + moveSpeed * 1.15 : 0.8);

    const bodyBob = moving
      ? Math.sin(this.walkPhase * 2) * 0.018
      : Math.sin(this.walkPhase * 0.7) * 0.006;

    this.group.position.y = 0.02 + bodyBob;
    this.group.rotation.x = moving ? Math.sin(this.walkPhase * 0.5) * 0.035 : 0;
    this.group.rotation.z = moving ? Math.sin(this.walkPhase) * 0.018 : 0;

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      const phase = this.walkPhase + leg.phase;
      const stride = moving ? Math.sin(phase) * 0.11 : Math.sin(phase) * 0.015;
      const lift = moving ? Math.max(0, Math.sin(phase)) * 0.08 : 0.015;

      const footLocal = leg.footBase.clone();
      footLocal.z += stride * (leg.row < 2 ? -1 : 1);
      footLocal.x += Math.sin(phase * 0.5 + leg.row) * 0.025 * leg.side;
      footLocal.y = 0.04 + lift;

      leg.prevFoot.copy(leg.foot);
      leg.foot.copy(footLocal);

      const hip = leg.hipLocal.clone();
      const knee = footLocal.clone();
      const outward = Math.sign(footLocal.x || leg.side) * 0.13;
      knee.x = (hip.x + footLocal.x) * 0.5 + outward;
      knee.y = 0.28 + Math.sin(phase) * 0.035;
      knee.z = (hip.z + footLocal.z) * 0.5;

      this.placeLimb(leg.upper, hip, knee);
      this.placeLimb(leg.lower, knee, footLocal);
      leg.joint.position.copy(knee);
    }
  }

  placeLimb(mesh, a, b) {
    const delta = b.clone().sub(a);
    const length = delta.length();
    mesh.position.copy(a.clone().add(b).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize()
    );
    mesh.scale.set(1, Math.max(0.001, length), 1);
  }

  step(dt) {
    this._lastDt = dt;
    this.group.updateMatrixWorld();
    for (const leg of this.legs) {
      leg.upper.updateMatrixWorld();
      leg.lower.updateMatrixWorld();
    }
  }
}
