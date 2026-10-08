// ============================================================================
// player.ts — First-person player controller with physics, collision,
// head-bobbing, and stamina. Drives the camera.
// ============================================================================

import * as THREE from 'three';
import { PLAYER } from './constants';
import { InputManager } from './input';
import type { World } from './world';

export interface PlayerState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  stamina: number;
  isSprinting: boolean;
  isMoving: boolean;
  onGround: boolean;
  footstepTrigger: number; // increments on each step
}

export class Player {
  state: PlayerState;
  camera: THREE.PerspectiveCamera;
  private world: World;
  private input: InputManager;
  private bobPhase = 0;
  private footstepTimer = 0;
  private mouseSensitivity = 0.0022;

  constructor(
    camera: THREE.PerspectiveCamera,
    world: World,
    input: InputManager,
    startPos: THREE.Vector3
  ) {
    this.camera = camera;
    this.world = world;
    this.input = input;
    this.state = {
      position: startPos.clone(),
      velocity: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      stamina: PLAYER.STAMINA_MAX,
      isSprinting: false,
      isMoving: false,
      onGround: true,
      footstepTrigger: 0,
    };
  }

  update(dt: number): void {
    const s = this.state;

    // ---- Look -----------------------------------------------------------
    const [mdx, mdy] = this.input.consumeMouseDelta();
    s.yaw -= mdx * this.mouseSensitivity;
    s.pitch -= mdy * this.mouseSensitivity;
    s.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, s.pitch));

    // ---- Movement input (keyboard + touch) -----------------------------
    const { forward, strafe, sprint: wantSprint } = this.input.getMovementInput();

    // Sprint only if moving forward and has stamina.
    s.isSprinting = wantSprint && forward > 0 && s.stamina > PLAYER.STAMINA_MIN_SPRINT;

    // Stamina.
    if (s.isSprinting && (forward !== 0 || strafe !== 0)) {
      s.stamina = Math.max(0, s.stamina - PLAYER.STAMINA_DRAIN * dt);
    } else {
      s.stamina = Math.min(PLAYER.STAMINA_MAX, s.stamina + PLAYER.STAMINA_REGEN * dt);
    }

    const speed = s.isSprinting ? PLAYER.SPRINT_SPEED : PLAYER.WALK_SPEED;

    // Desired direction in XZ plane.
    const dir = new THREE.Vector3();
    const cos = Math.cos(s.yaw);
    const sin = Math.sin(s.yaw);
    // Forward vector: (-sin(yaw), 0, -cos(yaw)) — standard FPS.
    dir.x += -sin * forward + cos * strafe;
    dir.z += -cos * forward - sin * strafe;
    if (dir.lengthSq() > 0) dir.normalize();

    // Accelerate toward desired velocity.
    const targetVel = dir.multiplyScalar(speed);
    const accel = s.isMoving ? PLAYER.ACCEL : PLAYER.ACCEL * 0.8;
    s.velocity.x = THREE.MathUtils.damp(s.velocity.x, targetVel.x, accel, dt);
    s.velocity.z = THREE.MathUtils.damp(s.velocity.z, targetVel.z, accel, dt);

    // Gravity & jump.
    s.velocity.y -= PLAYER.GRAVITY * dt;
    if (this.input.getJumpInput() && s.onGround) {
      s.velocity.y = PLAYER.JUMP_FORCE;
      s.onGround = false;
    }

    s.isMoving = Math.abs(s.velocity.x) + Math.abs(s.velocity.z) > 0.5;

    // ---- Collision & movement -------------------------------------------
    const nextX = s.position.x + s.velocity.x * dt;
    const nextZ = s.position.z + s.velocity.z * dt;
    const nextY = s.position.y + s.velocity.y * dt;

    // X axis.
    if (!this.world.isBlocked(nextX, s.position.z, PLAYER.RADIUS)) {
      s.position.x = nextX;
    } else {
      s.velocity.x = 0;
    }
    // Z axis.
    if (!this.world.isBlocked(s.position.x, nextZ, PLAYER.RADIUS)) {
      s.position.z = nextZ;
    } else {
      s.velocity.z = 0;
    }
    // Y axis (floor only — ceiling handled by wall height).
    if (nextY <= 0) {
      s.position.y = 0;
      s.velocity.y = 0;
      s.onGround = true;
    } else {
      s.position.y = nextY;
      s.onGround = false;
    }

    // ---- Head-bobbing ---------------------------------------------------
    if (s.isMoving && s.onGround) {
      const bobFreq = PLAYER.HEADBOB_FREQ * (s.isSprinting ? 1.35 : 1);
      const bobAmp = s.isSprinting ? PLAYER.HEADBOB_SPRINT_AMP : PLAYER.HEADBOB_AMP;
      this.bobPhase += dt * bobFreq;
      // Footstep trigger when bob crosses the bottom.
      const stepInterval = s.isSprinting
        ? PLAYER.FOOTSTEP_INTERVAL_SPRINT
        : PLAYER.FOOTSTEP_INTERVAL;
      this.footstepTimer += dt;
      if (this.footstepTimer >= stepInterval) {
        this.footstepTimer = 0;
        s.footstepTrigger++;
      }
    } else {
      this.bobPhase = THREE.MathUtils.damp(this.bobPhase, 0, 8, dt);
      this.footstepTimer = 0;
    }

    const bobY = Math.sin(this.bobPhase * 2) * (s.isMoving ? PLAYER.HEADBOB_AMP : 0);
    const bobX = Math.cos(this.bobPhase) * (s.isMoving ? PLAYER.HEADBOB_AMP * 0.5 : 0);

    // ---- Apply to camera ------------------------------------------------
    this.camera.position.copy(s.position);
    this.camera.position.y += PLAYER.EYE_HEIGHT + bobY;
    // Apply small lateral bob by offsetting along right vector.
    const rightX = cos;
    const rightZ = -sin;
    this.camera.position.x += rightX * bobX;
    this.camera.position.z += rightZ * bobX;

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = s.yaw;
    this.camera.rotation.x = s.pitch;
  }

  get position(): THREE.Vector3 {
    return this.state.position;
  }

  get eyePosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.state.position.x,
      this.state.position.y + PLAYER.EYE_HEIGHT,
      this.state.position.z
    );
  }
}
