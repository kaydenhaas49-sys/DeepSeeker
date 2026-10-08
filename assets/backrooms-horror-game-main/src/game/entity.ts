// ============================================================================
// entity.ts — The Hunter. State machine: ROAM → INVESTIGATE → HUNT → ENRAGE.
// Uses line-of-sight, hearing (sprint/flashlight), and A* pathfinding.
// ============================================================================

import * as THREE from 'three';
import { ENTITY, MAZE, COLORS } from './constants';
import { findPath, simplifyPath, type Path } from './pathfinder';
import { cellToWorld, type MazeGrid } from './maze';
import type { World } from './world';
import type { Player } from './player';

export type EntityMode = 'roam' | 'investigate' | 'hunt' | 'enrage';

export interface EntityCallbacks {
  onFootstep: (intensity: number) => void;
  onCatch: () => void;
  onStateChange: (mode: EntityMode) => void;
}

export class Entity {
  group: THREE.Group;
  mode: EntityMode = 'roam';
  position: THREE.Vector3;
  private world: World;
  private grid: MazeGrid;
  private cols: number;
  private rows: number;
  private path: Path = [];
  private pathIndex = 0;
  private pathTimer = 0;
  private roamTimer = 0;
  private roamTarget: [number, number] | null = null;
  private lastSeenPlayerTime = -999;
  private lastKnownPlayerCell: [number, number] | null = null;
  private facing = 0;
  private footstepDistance = 0;
  private callbacks: EntityCallbacks;
  private model: THREE.Object3D | null = null;
  private baseModelY = 0;

  constructor(
    scene: THREE.Scene,
    world: World,
    startPos: THREE.Vector3,
    model: THREE.Object3D | null,
    callbacks: EntityCallbacks
  ) {
    this.world = world;
    this.grid = world.grid;
    this.cols = world.cols;
    this.rows = world.rows;
    this.callbacks = callbacks;
    this.position = startPos.clone();

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    if (model) {
      this.model = model;
      this.group.add(model);
      this.baseModelY = 0;
    } else {
      this.model = buildFallbackEntity();
      this.group.add(this.model);
    }

    scene.add(this.group);
  }

  update(dt: number, time: number, player: Player, playerIsSprinting: boolean, flashlightOn: boolean): void {
    const playerCell = this.world.getCellAt(player.position.x, player.position.z);
    const entityCell = this.world.getCellAt(this.position.x, this.position.z);
    const distToPlayer = this.position.distanceTo(player.position);

    // ---- Perception -----------------------------------------------------
    const canSee = this.checkLineOfSight(player.eyePosition);
    const hearsSprint =
      playerIsSprinting && distToPlayer < ENTITY.HEAR_SPRINT_RANGE;
    const hearsFlashlight =
      flashlightOn && distToPlayer < ENTITY.HEAR_FLASHLIGHT_RANGE && canSee;

    // ---- State transitions ---------------------------------------------
    if (canSee || hearsSprint) {
      this.lastSeenPlayerTime = time;
      this.lastKnownPlayerCell = playerCell;
      if (this.mode === 'roam' || this.mode === 'investigate') {
        this.setMode(distToPlayer < 8 ? 'enrage' : 'hunt');
      }
    } else if (this.mode === 'hunt' || this.mode === 'enrage') {
      if (time - this.lastSeenPlayerTime > ENTITY.GIVEUP_TIME) {
        this.setMode('roam');
      } else {
        this.setMode('investigate');
      }
    }

    // ---- Pathfinding ---------------------------------------------------
    this.pathTimer += dt;
    if (this.pathTimer >= ENTITY.PATH_REPLAN_INTERVAL || this.path.length === 0) {
      this.pathTimer = 0;
      this.replanPath(entityCell, playerCell);
    }

    // ---- Movement -------------------------------------------------------
    const speed =
      this.mode === 'enrage'
        ? ENTITY.ENRAGE_SPEED
        : this.mode === 'hunt'
        ? ENTITY.HUNT_SPEED
        : this.mode === 'investigate'
        ? ENTITY.HUNT_SPEED * 0.7
        : ENTITY.ROAM_SPEED;

    this.moveAlongPath(dt, speed);

    // ---- Catch check ----------------------------------------------------
    if (distToPlayer < ENTITY.CATCH_DISTANCE) {
      this.callbacks.onCatch();
      return;
    }

    // ---- Footstep audio -------------------------------------------------
    const stepDist = speed * 0.5;
    this.footstepDistance += speed * dt;
    if (this.footstepDistance >= stepDist) {
      this.footstepDistance = 0;
      const intensity = Math.max(0, 1 - distToPlayer / 30);
      this.callbacks.onFootstep(intensity);
    }

    // ---- Update group ---------------------------------------------------
    this.group.position.copy(this.position);
    if (this.path.length > 0 && this.pathIndex < this.path.length) {
      const [tx, ty] = this.path[this.pathIndex];
      const [wx, wz] = cellToWorld(tx, ty);
      const targetAngle = Math.atan2(wx - this.position.x, wz - this.position.z);
      this.facing = THREE.MathUtils.damp(this.facing, targetAngle, 8, dt);
    }
    this.group.rotation.y = this.facing;

    if (this.model) {
      this.model.position.y = this.baseModelY + Math.sin(time * 4) * 0.03;
    }
  }

  private setMode(mode: EntityMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.path = [];
    this.callbacks.onStateChange(mode);
  }

  private replanPath(entityCell: [number, number], playerCell: [number, number]) {
    let target: [number, number];
    if (this.mode === 'hunt' || this.mode === 'enrage') {
      target = playerCell;
    } else if (this.mode === 'investigate' && this.lastKnownPlayerCell) {
      target = this.lastKnownPlayerCell;
      if (entityCell[0] === target[0] && entityCell[1] === target[1]) {
        this.setMode('roam');
        return;
      }
    } else {
      this.roamTimer += ENTITY.PATH_REPLAN_INTERVAL;
      if (
        !this.roamTarget ||
        (entityCell[0] === this.roamTarget[0] && entityCell[1] === this.roamTarget[1]) ||
        this.roamTimer > ENTITY.ROAM_PICK_INTERVAL
      ) {
        this.roamTarget = this.world.getRandomFloorCell();
        this.roamTimer = 0;
      }
      target = this.roamTarget;
    }

    const path = findPath(this.grid, this.cols, this.rows, entityCell, target);
    this.path = simplifyPath(path);
    this.pathIndex = 0;
  }

  private moveAlongPath(dt: number, speed: number) {
    if (this.path.length === 0 || this.pathIndex >= this.path.length) return;

    const [tx, ty] = this.path[this.pathIndex];
    const [wx, wz] = cellToWorld(tx, ty);
    const dx = wx - this.position.x;
    const dz = wz - this.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.3) {
      this.pathIndex++;
      return;
    }

    const moveX = (dx / dist) * speed * dt;
    const moveZ = (dz / dist) * speed * dt;
    this.position.x += moveX;
    this.position.z += moveZ;
  }

  private checkLineOfSight(playerEye: THREE.Vector3): boolean {
    const eyePos = new THREE.Vector3(
      this.position.x,
      this.position.y + ENTITY.HEIGHT * 0.7,
      this.position.z
    );
    const toPlayer = new THREE.Vector3().subVectors(playerEye, eyePos);
    const dist = toPlayer.length();
    if (dist > ENTITY.SIGHT_RANGE) return false;

    const forward = new THREE.Vector3(
      Math.sin(this.facing),
      0,
      Math.cos(this.facing)
    );
    const dirToPlayer = toPlayer.clone().normalize();
    const dot = forward.dot(dirToPlayer);
    const angleCos = Math.cos(ENTITY.SIGHT_FOV / 2);
    if (dot < angleCos && dist > 2) return false;

    return !this.isWallBetween(eyePos, playerEye);
  }

  private isWallBetween(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const steps = Math.ceil(a.distanceTo(b) / (MAZE.CELL_SIZE * 0.4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;
      const [cx, cz] = this.world.getCellAt(px, pz);
      if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return true;
      if (this.grid[cz * this.cols + cx] === 1) return true;
    }
    return false;
  }
}

function buildFallbackEntity(): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    roughness: 1,
    metalness: 0,
    emissive: 0x000000,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  const bodyGeo = new THREE.CylinderGeometry(0.18, 0.42, 2.0, 8, 4);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.0;
  body.castShadow = true;
  group.add(body);

  const headGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = 2.15;
  head.scale.set(0.8, 1.3, 0.8);
  head.castShadow = true;
  group.add(head);

  const armGeo = new THREE.CylinderGeometry(0.06, 0.04, 1.1, 6);
  const armL = new THREE.Mesh(armGeo, bodyMat);
  armL.position.set(-0.28, 1.3, 0);
  armL.rotation.z = 0.15;
  armL.castShadow = true;
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.28;
  armR.rotation.z = -0.15;
  group.add(armR);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  const eyeGeo = new THREE.SphereGeometry(0.04, 6, 4);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.08, 2.18, 0.18);
  group.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.08;
  group.add(eyeR);

  const eyeLight = new THREE.PointLight(0xff2200, 0.5, 4, 2);
  eyeLight.position.set(0, 2.18, 0.2);
  group.add(eyeLight);

  return group;
}
