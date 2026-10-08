// ============================================================================
// game.ts — Main game orchestrator. Owns the Three.js scene, renderer,
// camera, and all subsystems. Exposes a simple API for the React UI.
// ============================================================================

import * as THREE from 'three';
import { MAZE, COLORS, PLAYER } from './constants';
import { InputManager } from './input';
import { buildWorld, type World } from './world';
import { Player } from './player';
import { Flashlight } from './flashlight';
import { Entity, type EntityMode } from './entity';
import { PostProcessing } from './postProcessing';
import { AudioManager } from './audioManager';
import { loadAllAssets, type LoadedAssets } from './assetLoader';
import { cellToWorld } from './maze';
import type { HUDState, GameState } from './types';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;

  input: InputManager;
  private world!: World;
  private player!: Player;
  private flashlight!: Flashlight;
  private entity!: Entity;
  private post!: PostProcessing;
  private audio: AudioManager;

  private assets: LoadedAssets | null = null;
  private state: GameState = 'menu';
  private rafId = 0;
  private container: HTMLElement;

  private growlTimer = 0;
  private jumpscareTimer = 0;
  private jumpscareActive = false;
  private caughtFlash = 0;

  onHUDUpdate: ((hud: HUDState) => void) | null = null;

  private hud: HUDState = {
    stamina: 100,
    staminaActive: false,
    battery: 100,
    flashlightOn: true,
    pagesCollected: 0,
    pagesTotal: MAZE.PAGE_COUNT,
    state: 'menu',
    message: '',
    loadProgress: 0,
    loadLabel: '',
  };

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );

    const ambient = new THREE.AmbientLight(COLORS.AMBIENT, 0.3);
    this.scene.add(ambient);

    this.clock = new THREE.Clock();
    this.input = new InputManager(this.renderer.domElement);
    this.audio = new AudioManager();

    window.addEventListener('resize', this.onResize);
  }

  async start() {
    this.setState('loading');
    this.pushHUD();

    this.audio.init();
    this.audio.resume();

    this.assets = await loadAllAssets((p) => {
      this.hud.loadProgress = p.progress;
      this.hud.loadLabel = p.label;
      this.pushHUD();
    });

    this.setupGame();
    this.setState('playing');
    this.audio.startAmbient();
    this.clock.start();
    this.loop();
    this.pushHUD();
  }

  restart() {
    this.cleanupGame();
    this.setupGame();
    this.setState('playing');
    this.clock.start();
    this.loop();
    this.pushHUD();
  }

  requestPointerLock() {
    this.input.requestPointerLock();
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.audio.dispose();
    this.post?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private setupGame() {
    const tex = this.assets?.textures ?? {
      wallpaper: { color: null, normal: null, roughness: null },
      carpet: { color: null, normal: null, roughness: null },
      ceiling: { color: null, normal: null, roughness: null },
      page: { color: null, normal: null, roughness: null },
    };

    this.world = buildWorld(this.scene, tex);

    const [sx, sz] = cellToWorld(1, 1);
    const startPos = new THREE.Vector3(sx, 0, sz);
    this.player = new Player(this.camera, this.world, this.input, startPos);

    this.flashlight = new Flashlight(this.scene);

    const farCells = this.world.getRandomFloorCell();
    let ex = farCells[0];
    let ey = farCells[1];
    for (let i = 0; i < 20; i++) {
      const c = this.world.getRandomFloorCell();
      const [wx, wz] = cellToWorld(c[0], c[1]);
      if (Math.hypot(wx - sx, wz - sz) > MAZE.CELL_SIZE * 8) {
        ex = c[0];
        ey = c[1];
        break;
      }
    }
    const [exW, ezW] = cellToWorld(ex, ey);
    const entityPos = new THREE.Vector3(exW, 0, ezW);

    this.entity = new Entity(
      this.scene,
      this.world,
      entityPos,
      this.assets?.entityModel ?? null,
      {
        onFootstep: (intensity) => {
          this.audio.playEntityFootstep(intensity);
        },
        onCatch: () => {
          this.triggerCatch();
        },
        onStateChange: (mode: EntityMode) => {
          if (mode === 'hunt' || mode === 'enrage') {
            this.audio.playStateStinger();
          }
        },
      }
    );

    this.post = new PostProcessing(this.renderer, this.scene, this.camera);

    this.hud.stamina = 100;
    this.hud.battery = 100;
    this.hud.pagesCollected = 0;
    this.hud.pagesTotal = this.world.pages.length;
    this.hud.flashlightOn = true;
    this.jumpscareActive = false;
    this.jumpscareTimer = 0;
    this.caughtFlash = 0;
  }

  private cleanupGame() {
    const toRemove: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj !== this.scene && !(obj instanceof THREE.AmbientLight)) {
        toRemove.push(obj);
      }
    });
    toRemove.forEach((obj) => this.scene.remove(obj));
  }

  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;

    if (this.state === 'playing') {
      this.update(dt, time);
    }

    this.post.update(time);
    this.post.render();
  };

  private update(dt: number, time: number) {
    this.player.update(dt);
    this.flashlight.update(dt, this.player, this.input);
    this.world.update(dt, time);
    this.entity.update(dt, time, this.player, this.player.state.isSprinting, this.flashlight.on);

    const prevTrigger = this.hud._lastFootstep ?? 0;
    if (this.player.state.footstepTrigger !== prevTrigger) {
      this.hud._lastFootstep = this.player.state.footstepTrigger;
      this.audio.playFootstep(this.player.state.isSprinting);
    }

    if (this.flashlight.on !== this.hud.flashlightOn) {
      this.hud.flashlightOn = this.flashlight.on;
      this.audio.playClick();
    }

    if (this.entity.mode === 'hunt' || this.entity.mode === 'enrage') {
      this.growlTimer += dt;
      if (this.growlTimer > 2.5) {
        this.growlTimer = 0;
        const dist = this.entity.position.distanceTo(this.player.position);
        this.audio.playGrowl(Math.max(0, 1 - dist / 25));
      }
    }

    if (this.input.consumeInteract()) {
      this.tryCollectPage();
    }
    this.checkPageProximity();

    this.hud.stamina = this.player.state.stamina;
    this.hud.staminaActive = this.player.state.isSprinting;
    this.hud.battery = this.flashlight.battery;

    if (this.jumpscareActive) {
      this.jumpscareTimer += dt;
      this.caughtFlash = Math.min(1, this.caughtFlash + dt * 3);
      const dir = new THREE.Vector3()
        .subVectors(this.entity.position, this.player.state.position)
        .normalize();
      this.camera.rotation.x = -0.1;
      this.camera.rotation.y = Math.atan2(dir.x, dir.z);
      const shake = this.jumpscareTimer * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
      if (this.jumpscareTimer > 1.2) {
        this.setState('caught');
      }
    }

    this.pushHUD();
  }

  private tryCollectPage() {
    for (const page of this.world.pages) {
      if (page.collected) continue;
      const dist = page.position.distanceTo(this.player.eyePosition);
      if (dist < 1.5) {
        this.collectPage(page);
        break;
      }
    }
  }

  private checkPageProximity() {
    for (const page of this.world.pages) {
      if (page.collected) continue;
      const dist = page.position.distanceTo(this.player.state.position);
      if (dist < 0.9) {
        this.collectPage(page);
        break;
      }
    }
  }

  private collectPage(page: { group: THREE.Group; collected: boolean; cell: [number, number] }) {
    page.collected = true;
    this.world.group.remove(page.group);
    this.hud.pagesCollected++;
    this.audio.playPagePickup();

    if (this.hud.pagesCollected >= this.hud.pagesTotal) {
      this.setState('won');
    }
  }

  private triggerCatch() {
    if (this.jumpscareActive) return;
    this.jumpscareActive = true;
    this.jumpscareTimer = 0;
    this.audio.playJumpscare();
  }

  private setState(state: GameState) {
    this.state = state;
    this.hud.state = state;
    if (state === 'caught' || state === 'won') {
      this.input.exitPointerLock();
    }
    this.pushHUD();
  }

  private pushHUD() {
    this.onHUDUpdate?.({ ...this.hud });
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post?.resize();
  };
}
