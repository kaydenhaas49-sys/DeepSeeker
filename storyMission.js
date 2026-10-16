import * as THREE from "three";

// Optional CC0 models served directly from 3DAssets.dev's immutable GLB CDN.
// These never participate in the initial loading gate: interaction markers work
// even if a decorative model request fails.
const ASSETS = Object.freeze({
  stairwell: "https://cdn.3dassets.dev/assets/25338/v1/model.glb",
  transmitter: "https://cdn.3dassets.dev/assets/30259/v1/model.glb",
  radio: "https://cdn.3dassets.dev/assets/31047/v1/model.glb",
  fireDoor: "https://cdn.3dassets.dev/assets/25820/v1/model.glb",
  poolroom: "https://cdn.3dassets.dev/assets/25335/v1/model.glb",
});

const RELAYS = Object.freeze([
  { id: 0, title: "FIELD RADIO", x: -80, z: -92, model: "radio" },
  { id: 1, title: "SIGNAL RELAY 02", x: -80, z: -238, model: "transmitter" },
  { id: 2, title: "SIGNAL RELAY 03", x: -80, z: -394, model: "transmitter" },
]);

const STAIRWELLS = Object.freeze([
  { id: "north", x: -80, z: -164, title: "LEVEL RUN ACCESS A" },
  { id: "deep", x: -80, z: -326, title: "LEVEL RUN ACCESS B" },
]);

function makeBox(parent, name, w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function placeModelOnFloor(model, { x = 0, z = 0, scale = 1, rotationY = 0 } = {}) {
  model.scale.setScalar(scale);
  model.rotation.y = rotationY;
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(x - center.x, -bounds.min.y, z - center.z);
  model.updateMatrixWorld(true);
  return model;
}

export class StoryMissionWorld {
  constructor({ scene, world, loader }) {
    this.scene = scene;
    this.world = world;
    this.loader = loader;
    this.root = new THREE.Group();
    this.root.name = "DeepSeekerStoryMission";
    this.root.visible = false;
    world.root.add(this.root);

    this.poolroomsRoot = new THREE.Group();
    this.poolroomsRoot.name = "DeepSeekerPoolrooms";
    this.poolroomsRoot.visible = false;
    scene.add(this.poolroomsRoot);

    this.interactables = [];
    this.relayCards = [];
    this.levelRunEntrances = [];
    this.poolroomsDoorCard = null;
    this.poolroomsExitCard = null;
    this.poolroomsLoaded = false;
    this.poolroomsLoadPromise = null;
    this.poolDoorMixer = null;
    this.poolDoorOpenAction = null;
    this.poolDoorGroup = null;
    this.lastGateUnlocked = false;
    this.templates = new Map();
    this.built = false;
    this.buildPromise = null;
    this.lastLoadError = "";
    this.gateDoorBounds = null;
    this.gateSideBounds = [];
    this.poolroomsBounds = [];
    this.poolBasinBounds = [];

    // Collision meshes for the poolroom are deliberately separate from its
    // render models. They keep the nine shallow basins out of the walkable deck.
    const outerMinX = -14.25, outerMaxX = 14.25;
    const outerMinZ = -4.55, outerMaxZ = 18.45;
    const wallThickness = 0.55;
    this.poolroomsBounds.push(
      { minX: outerMinX - wallThickness, maxX: outerMinX, minZ: outerMinZ - wallThickness, maxZ: outerMaxZ + wallThickness },
      { minX: outerMaxX, maxX: outerMaxX + wallThickness, minZ: outerMinZ - wallThickness, maxZ: outerMaxZ + wallThickness },
      { minX: outerMinX, maxX: outerMaxX, minZ: outerMinZ - wallThickness, maxZ: outerMinZ },
      { minX: outerMinX, maxX: outerMaxX, minZ: outerMaxZ, maxZ: outerMaxZ + wallThickness }
    );
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const centerX = (column - 1) * 9.6;
        const centerZ = row * 6.5888 + 1.0;
        this.poolBasinBounds.push({
          minX: centerX - 3.0, maxX: centerX + 3.0,
          minZ: centerZ - 1.7, maxZ: centerZ + 1.7
        });
      }
    }
    this.poolroomsBounds.push(...this.poolBasinBounds);
  }

  loadModel(key) {
    if (this.templates.has(key)) return this.templates.get(key);
    const url = ASSETS[key];
    const promise = new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    });
    this.templates.set(key, promise);
    promise.catch(error => {
      if (this.templates.get(key) === promise) this.templates.delete(key);
      this.lastLoadError = String(error?.message || error || "Asset failed to load");
      console.warn("[DeepSeeker] Optional mission model failed:", key, error);
    });
    return promise;
  }

  _signTexture(title, subtitle, status = "ACTIVE") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a100e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1b2b23";
    ctx.fillRect(12, 12, canvas.width - 24, canvas.height - 24);
    ctx.strokeStyle = "#78917a";
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
    ctx.fillStyle = "#b7c8b9";
    ctx.font = "bold 23px monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(title).slice(0, 32), 256, 66);
    ctx.fillStyle = "#e1e3d7";
    ctx.font = "20px monospace";
    ctx.fillText(String(subtitle).slice(0, 38), 256, 126);
    ctx.fillStyle = status === "LOCKED" || status === "OFFLINE" ? "#ee6565" : "#79e6a2";
    ctx.font = "bold 20px monospace";
    ctx.fillText(String(status).slice(0, 24), 256, 190);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  _addSign(parent, options) {
    const {
      x, y = 1.65, z, rotationY = 0, width = 1.5, height = 0.76,
      title, subtitle, status = "ACTIVE", interactable, register = true,
    } = options;
    const texture = this._signTexture(title, subtitle, status);
    const material = new THREE.MeshBasicMaterial({
      map: texture, side: THREE.DoubleSide, toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.name = "MissionInteractableSign";
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    mesh.userData.interactable = interactable;
    mesh.renderOrder = 4;
    parent.add(mesh);
    const card = { mesh, material, texture, config: { title, subtitle, status } };
    if (register) this.interactables.push(mesh);
    return card;
  }

  _updateCard(card, title, subtitle, status) {
    if (!card) return;
    card.texture.dispose();
    card.texture = this._signTexture(title, subtitle, status);
    card.material.map = card.texture;
    card.material.needsUpdate = true;
    card.config = { title, subtitle, status };
  }

  async build() {
    if (this.buildPromise) return this.buildPromise;
    this.buildPromise = this._build();
    return this.buildPromise;
  }

  async _build() {
    if (this.built) return;
    this.built = true;
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x303831, roughness: 0.82, metalness: 0.2 });
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x6d766b, roughness: 0.8, metalness: 0.12 });
    const gateBarrierMat = new THREE.MeshStandardMaterial({ color: 0x373e38, roughness: 0.9 });

    for (const relay of RELAYS) {
      const station = new THREE.Group();
      station.name = "StoryRelay_" + relay.id;
      station.position.set(relay.x, 0, relay.z);
      this.root.add(station);
      makeBox(station, "RelayBase", 1.5, 0.18, 1.12, 0, 0.09, 0, darkMetal);
      this.relayCards.push(this._addSign(station, {
        x: 0, y: 2.28, z: 0.55, width: 1.65, height: 0.72,
        title: relay.title, subtitle: "PRESS E TO RESTORE", status: "OFFLINE",
        interactable: { type: "storyRelay", relayIndex: relay.id, prompt: "Restore " + relay.title },
      }));
      this.loadModel(relay.model).then(gltf => {
        const instance = gltf.scene.clone(true);
        instance.name = relay.model === "radio" ? "FieldRadioModel" : "SignalTransmitterModel";
        placeModelOnFloor(instance, {
          x: 0, z: 0,
          scale: relay.model === "radio" ? 1.5 : 1
        });
        station.add(instance);
      }).catch(() => {
        // The objective sign remains usable if the optional GLB cannot load.
      });
    }

    this.loadModel("stairwell").then(gltf => {
      for (const stair of STAIRWELLS) {
        const landmark = this.root.getObjectByName("Stairwell_" + stair.id);
        if (!landmark) continue;
        const instance = gltf.scene.clone(true);
        instance.name = "GarageToStairwellModel";
        // Put a normalized, floor-aligned model just off the protected line;
        // it must not wall off the approach to the interactable marker.
        placeModelOnFloor(instance, { x: 5.1, z: -0.35, scale: 1.12 });
        landmark.add(instance);
      }
    }).catch(() => {});

    for (const stair of STAIRWELLS) {
      const landmark = new THREE.Group();
      landmark.name = "Stairwell_" + stair.id;
      landmark.position.set(stair.x, 0, stair.z);
      this.root.add(landmark);
      this.levelRunEntrances.push(this._addSign(landmark, {
        x: 0, y: 1.9, z: 2.25, width: 2.0, height: 0.82,
        title: stair.title, subtitle: "DESCEND / PRESS E", status: "READY",
        interactable: {
          type: "levelRunEntry", entryId: stair.id,
          entryDoor: { centerX: stair.x, wallZ: stair.z, face: 1 },
          prompt: "Enter " + stair.title,
        },
      }));
    }

    const gate = new THREE.Group();
    gate.name = "PoolroomsLockedDoor";
    gate.position.set(-80, 0, -472);
    this.root.add(gate);
    this.poolDoorGroup = gate;

    // A wall, jamb and lintel make the door a real threshold across the clear
    // route, instead of a freestanding prop that players can simply walk around.
    makeBox(gate, "PoolroomsGateLeftWall", 6.15, 3.3, 0.42, -4.125, 1.65, 0, gateMat);
    makeBox(gate, "PoolroomsGateRightWall", 6.15, 3.3, 0.42, 4.125, 1.65, 0, gateMat);
    makeBox(gate, "PoolroomsGateLintel", 2.1, 0.55, 0.42, 0, 3.025, 0, gateMat);
    const x = -80, z = -472, depth = 0.42;
    this.gateSideBounds = [
      { minX: x - 7.2, maxX: x - 1.05, minZ: z - depth * 0.5, maxZ: z + depth * 0.5 },
      { minX: x + 1.05, maxX: x + 7.2, minZ: z - depth * 0.5, maxZ: z + depth * 0.5 },
    ];
    this.gateDoorBounds = {
      minX: x - 1.05, maxX: x + 1.05,
      minZ: z - depth * 0.5, maxZ: z + depth * 0.5
    };
    this.world.boundaryWallBounds.push(...this.gateSideBounds, this.gateDoorBounds);

    this.poolroomsDoorCard = this._addSign(gate, {
      x: 0, y: 2.0, z: 0.235, width: 1.85, height: 0.78,
      title: "POOLROOMS", subtitle: "SIGNAL SOURCE", status: "LOCKED",
      interactable: { type: "poolroomsDoor", prompt: "Open the Poolrooms door" },
    });

    this.loadModel("fireDoor").then(gltf => {
      const instance = gltf.scene.clone(true);
      instance.name = "PoolroomsFireDoorModel";
      placeModelOnFloor(instance, { x: 0, z: 0, scale: 1.08 });
      gate.add(instance);
      if (gltf.animations?.length) {
        this.poolDoorMixer = new THREE.AnimationMixer(instance);
        const openClip = gltf.animations.find(clip => /open/i.test(clip.name));
        if (openClip) {
          this.poolDoorOpenAction = this.poolDoorMixer.clipAction(openClip);
          this.poolDoorOpenAction.setLoop(THREE.LoopOnce, 1);
          this.poolDoorOpenAction.clampWhenFinished = true;
          if (this.lastGateUnlocked) this._playOpenDoor();
        }
      }
    }).catch(() => {});

    this._buildPoolroomsArchitecture();
    this.syncState({ relays: [false, false, false], levelRunCleared: false, breakerSolved: false });
  }

  _buildPoolroomsArchitecture() {
    const root = this.poolroomsRoot;
    const wall = new THREE.MeshStandardMaterial({ color: 0x8eb9b7, roughness: 0.86 });
    const floor = new THREE.MeshStandardMaterial({ color: 0x8ca9a4, roughness: 0.56, metalness: 0.02 });
    makeBox(root, "PoolroomsLeftDryWalkway", 1.7, 0.12, 23.0, -13.35, -0.14, 6.95, floor);
    makeBox(root, "PoolroomsRightDryWalkway", 1.7, 0.12, 23.0, 13.35, -0.14, 6.95, floor);
    makeBox(root, "PoolroomsEntryDeck", 28.8, 0.12, 1.9, 0, -0.14, -3.45, floor);
    makeBox(root, "PoolroomsExitDeck", 28.8, 0.12, 1.7, 0, -0.14, 17.55, floor);
    makeBox(root, "PoolroomsCrosswalkWest", 3.35, 0.12, 23.0, -4.8, -0.14, 6.95, floor);
    makeBox(root, "PoolroomsCrosswalkEast", 3.35, 0.12, 23.0, 4.8, -0.14, 6.95, floor);
    makeBox(root, "PoolroomsNorthWall", 28.8, 5.9, 0.36, 0, 2.9, -4.55, wall);
    makeBox(root, "PoolroomsSouthWall", 28.8, 5.9, 0.36, 0, 2.9, 18.45, wall);
    makeBox(root, "PoolroomsWestWall", 0.36, 5.9, 23.0, -14.25, 2.9, 6.95, wall);
    makeBox(root, "PoolroomsEastWall", 0.36, 5.9, 23.0, 14.25, 2.9, 6.95, wall);
    const cyanLight = new THREE.PointLight(0x68e5df, 2.1, 42, 1.35);
    cyanLight.position.set(-10, 3.1, 3.5);
    cyanLight.castShadow = false;
    root.add(cyanLight);
    const paleLight = new THREE.PointLight(0xb0fff0, 1.15, 34, 1.25);
    paleLight.position.set(10, 3.0, 13);
    paleLight.castShadow = false;
    root.add(paleLight);
  }

  _playOpenDoor() {
    if (!this.poolDoorOpenAction) {
      if (this.poolDoorGroup) {
        const door = this.poolDoorGroup.getObjectByName("PoolroomsFireDoorModel");
        if (door) door.visible = false;
      }
      return;
    }
    this.poolDoorOpenAction.reset();
    this.poolDoorOpenAction.play();
  }

  _syncGate(state) {
    const relays = Array.isArray(state?.relays) ? state.relays : [];
    const unlocked = Boolean(
      state?.poolroomsUnlocked ||
      (relays.length >= 3 && relays.slice(0, 3).every(Boolean) &&
        state?.breakerSolved && state?.levelRunCleared)
    );
    for (let i = 0; i < this.relayCards.length; i++) {
      const active = Boolean(relays[i]);
      this._updateCard(this.relayCards[i], RELAYS[i].title,
        active ? "SIGNAL RESTORED" : "PRESS E TO RESTORE",
        active ? "ONLINE" : "OFFLINE");
      this.relayCards[i].mesh.userData.interactable.prompt = active
        ? RELAYS[i].title + " is already online"
        : "Restore " + RELAYS[i].title;
    }
    if (this.poolroomsDoorCard) {
      this._updateCard(this.poolroomsDoorCard, "POOLROOMS",
        unlocked ? "PRESS E TO ENTER" : "3 RELAYS + BREAKERS + RUN",
        unlocked ? "ACCESS GRANTED" : "LOCKED");
      this.poolroomsDoorCard.mesh.userData.interactable.prompt = unlocked
        ? "Enter the Poolrooms"
        : "The Poolrooms door has no power";
    }
    if (unlocked !== this.lastGateUnlocked) {
      if (unlocked) {
        const index = this.world.boundaryWallBounds.indexOf(this.gateDoorBounds);
        if (index >= 0) this.world.boundaryWallBounds.splice(index, 1);
        this._playOpenDoor();
      } else if (this.gateDoorBounds && !this.world.boundaryWallBounds.includes(this.gateDoorBounds)) {
        this.world.boundaryWallBounds.push(this.gateDoorBounds);
      }
      this.lastGateUnlocked = unlocked;
    }
  }

  syncState(state, { tutorialActive = false, poolroomsActive = false, missionVisible = true } = {}) {
    this.root.visible = Boolean(missionVisible && !tutorialActive && !poolroomsActive);
    this.poolroomsRoot.visible = Boolean(poolroomsActive && this.poolroomsLoaded);
    const relays = Array.isArray(state?.relays) ? state.relays : [];
    this._syncGate({ ...state, relays });
  }

  getInteractables() {
    if (!this.root.visible) return [];
    return this.interactables.filter(object => {
      let node = object;
      while (node) {
        if (!node.visible) return false;
        node = node.parent;
      }
      return true;
    });
  }

  getStairwellEntries() {
    return STAIRWELLS.map(item => ({ id: item.id, x: item.x, z: item.z, title: item.title }));
  }

  getRelayLocations() {
    return RELAYS.map(item => ({ id: item.id, x: item.x, z: item.z, title: item.title }));
  }

  update(dt) {
    this.poolDoorMixer?.update(dt);
  }

  async enterPoolrooms() {
    if (this.poolroomsLoadPromise) return this.poolroomsLoadPromise;
    this.poolroomsLoadPromise = this._buildPoolrooms();
    try {
      await this.poolroomsLoadPromise;
      return true;
    } catch (error) {
      this.poolroomsLoadPromise = null;
      this.lastLoadError = String(error?.message || error || "Poolrooms model failed to load");
      console.error("[DeepSeeker] Poolrooms could not load:", error);
      return false;
    }
  }

  async _buildPoolrooms() {
    if (this.poolroomsLoaded) return;
    const gltf = await this.loadModel("poolroom");
    const source = gltf.scene;
    const group = this.poolroomsRoot;

    // A 3x3 tile of real, textured poolroom modules. Repetition makes a
    // navigable indoor pool complex rather than replacing the hero architecture
    // with primitive placeholder rooms.
    const moduleScale = 1.6;
    const stepX = 6 * moduleScale;
    const stepZ = 4.118 * moduleScale;
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const instance = source.clone(true);
        instance.name = "PoolroomHall_" + row + "_" + column;
        const rotationY = (row + column) % 2 === 1 ? Math.PI : 0;
        placeModelOnFloor(instance, {
          x: (column - 1) * stepX,
          z: row * stepZ + 1.0,
          scale: moduleScale,
          rotationY
        });
        group.add(instance);
      }
    }

    this.poolroomsExitCard = this._addSign(group, {
      x: 12.15, y: 1.8, z: 16.1, rotationY: Math.PI,
      width: 2.0, height: 0.95,
      title: "SIGNAL EXIT", subtitle: "PRESS E TO FINISH", status: "OPEN",
      interactable: { type: "poolroomsExit", prompt: "Follow the signal to the exit" },
      register: false,
    });
    this.poolroomsLoaded = true;
  }

  getPoolroomsCollisionBoxes() {
    return this.poolroomsBounds;
  }

  getPoolroomsExitInteractable() {
    return this.poolroomsExitCard?.mesh || null;
  }
}
