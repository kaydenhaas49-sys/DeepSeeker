// ============================================================================
// flashlight.ts — Handheld flashlight with dynamic shadows, battery drain,
// and tension-building flicker.
// ============================================================================

import * as THREE from 'three';
import { FLASHLIGHT } from './constants';
import type { Player } from './player';
import type { InputManager } from './input';

export class Flashlight {
  light: THREE.SpotLight;
  battery: number;
  on: boolean;
  flickering = false;
  private flickerTimer = 0;
  private flickerDuration = 0;
  private target: THREE.Object3D;

  constructor(scene: THREE.Scene) {
    this.light = new THREE.SpotLight(
      0xfff0d0,
      FLASHLIGHT.INTENSITY,
      FLASHLIGHT.DISTANCE,
      FLASHLIGHT.ANGLE,
      FLASHLIGHT.PENUMBRA,
      FLASHLIGHT.DECAY
    );
    this.light.castShadow = true;
    this.light.shadow.mapSize.width = FLASHLIGHT.SHADOW_MAP_SIZE;
    this.light.shadow.mapSize.height = FLASHLIGHT.SHADOW_MAP_SIZE;
    this.light.shadow.camera.near = 0.5;
    this.light.shadow.camera.far = FLASHLIGHT.DISTANCE;
    this.light.shadow.bias = FLASHLIGHT.SHADOW_BIAS;
    this.light.shadow.focus = 1;

    this.target = new THREE.Object3D();
    scene.add(this.light);
    scene.add(this.target);
    this.light.target = this.target;

    this.battery = FLASHLIGHT.BATTERY_MAX;
    this.on = true;
  }

  update(dt: number, player: Player, input: InputManager): void {
    // Toggle.
    if (input.consumeFlashlightToggle() && this.battery > 0) {
      this.on = !this.on;
    }

    // Battery drain.
    if (this.on) {
      this.battery = Math.max(0, this.battery - FLASHLIGHT.BATTERY_DRAIN * dt);
      if (this.battery <= 0) this.on = false;
    }

    // Flicker logic — random brief flickers, more frequent at low battery.
    const flickerChance =
      FLASHLIGHT.FLICKER_CHANCE * (this.battery < 25 ? 3 : 1);
    if (!this.flickering && this.on && Math.random() < flickerChance) {
      this.flickering = true;
      this.flickerDuration = 0.08 + Math.random() * 0.2;
      this.flickerTimer = 0;
    }
    if (this.flickering) {
      this.flickerTimer += dt;
      if (this.flickerTimer >= this.flickerDuration) {
        this.flickering = false;
      }
    }

    // Compute effective intensity.
    let intensity = 0;
    if (this.on) {
      intensity = FLASHLIGHT.INTENSITY;
      // Battery affects brightness subtly.
      intensity *= 0.5 + 0.5 * (this.battery / FLASHLIGHT.BATTERY_MAX);
      if (this.flickering) {
        // Rapid on/off within flicker.
        intensity *= Math.sin(this.flickerTimer * 80) > 0 ? 0.15 : 1;
      }
    }
    this.light.intensity = intensity;

    // Position flashlight at camera, aim forward.
    const cam = player.camera;
    this.light.position.copy(cam.position);

    // Target is a point in front of the camera.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.target.position.copy(cam.position).add(forward.multiplyScalar(10));
    this.target.updateMatrixWorld();
  }

  dispose() {
    this.light.dispose();
  }
}
