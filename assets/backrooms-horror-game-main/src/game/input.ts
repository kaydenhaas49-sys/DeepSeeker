// ============================================================================
// input.ts — Centralized keyboard + mouse + pointer-lock + touch input state.
// ============================================================================

export class InputManager {
  keys: Record<string, boolean> = {};
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  pointerLocked = false;
  flashlightToggleQueued = false;
  interactQueued = false;

  // Touch input state — set by TouchControls UI component.
  touchMoveX = 0; // -1..1 (left stick)
  touchMoveY = 0; // -1..1 (left stick)
  touchLookX = 0; // delta pixels since last consume
  touchLookY = 0;
  touchSprint = false;
  touchJumpQueued = false;

  private domElement: HTMLElement;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onPointerLockChange: () => void;

  constructor(domElement: HTMLElement) {
    this.domElement = domElement;

    this.onKeyDown = (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyF') this.flashlightToggleQueued = true;
      if (e.code === 'KeyE' || e.code === 'Space') this.interactQueued = true;
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    };
    this.onMouseMove = (e: MouseEvent) => {
      if (!this.pointerLocked) return;
      this.mouseDeltaX += e.movementX;
      this.mouseDeltaY += e.movementY;
    };
    this.onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.domElement;
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  requestPointerLock() {
    this.domElement.requestPointerLock();
  }

  exitPointerLock() {
    document.exitPointerLock();
  }

  consumeMouseDelta(): [number, number] {
    const dx = this.mouseDeltaX + this.touchLookX;
    const dy = this.mouseDeltaY + this.touchLookY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.touchLookX = 0;
    this.touchLookY = 0;
    return [dx, dy];
  }

  consumeFlashlightToggle(): boolean {
    const v = this.flashlightToggleQueued;
    this.flashlightToggleQueued = false;
    return v;
  }

  consumeInteract(): boolean {
    const v = this.interactQueued || this.touchJumpQueued;
    this.interactQueued = false;
    this.touchJumpQueued = false;
    return v;
  }

  // Returns forward/strafe/sprint from combined keyboard + touch input.
  getMovementInput(): { forward: number; strafe: number; sprint: boolean } {
    const forward =
      (this.keys['KeyW'] ? 1 : 0) -
      (this.keys['KeyS'] ? 1 : 0) +
      this.touchMoveY;
    const strafe =
      (this.keys['KeyD'] ? 1 : 0) -
      (this.keys['KeyA'] ? 1 : 0) +
      this.touchMoveX;
    const sprint =
      this.keys['ShiftLeft'] ||
      this.keys['ShiftRight'] ||
      this.touchSprint;

    return {
      forward: Math.max(-1, Math.min(1, forward)),
      strafe: Math.max(-1, Math.min(1, strafe)),
      sprint,
    };
  }

  // True if jump is requested via keyboard or touch.
  getJumpInput(): boolean {
    return this.keys['Space'] || this.touchJumpQueued;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
  }
}
