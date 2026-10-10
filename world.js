// world.js — seeded RNG, chunk layout generation, chunk meshes, chunk manager.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createTextures } from "./textures.js";

export const CELL = 4; // meters per grid cell
export const CHUNK_CELLS = 16; // cells per chunk side
export const CHUNK_SIZE = CELL * CHUNK_CELLS; // 64 m
export const WALL_H = 9.0; // 9 m Backrooms ceiling
export const WALL_T = 0.35; // wall thickness
export const EYE = 1.6; // eye height

// Seven-by-seven 64m chunks make a finite 448m x 448m floor.
export const MAP_MIN_CHUNK = -3;
export const MAP_MAX_CHUNK = 3;

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------

// Deterministic integer hash of (chunkX, chunkZ, worldSeed) -> uint32.
export function hashSeed(cx, cz, seed) {
  let h = (seed ^ 0x9e3779b9) | 0;
  h = Math.imul(h ^ (cx | 0), 0x9e3779b1);
  h = Math.imul(h ^ (cz | 0), 0x85ebca77);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// mulberry32 — small fast PRNG, returns [0, 1).
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cellKey = (x, z) => x + "," + z;

// Two fixed, rare stairwell sightings in opposite parts of the Backrooms.
// Their footprints are reserved in procedural generation so random partitions
// cannot spawn through the entrance, steps, or narrow side walls.
const WALL_STAIRCASES = Object.freeze([
  { cx: -1, cz: 1, localX: 8, localZ: 8, face: -1 },
  { cx: 1, cz: -1, localX: 8, localZ: 8, face: 1 },
]);

function getWallStaircase(cx, cz) {
  return WALL_STAIRCASES.find(stair => stair.cx === cx && stair.cz === cz) || null;
}

function getWallStaircaseCollisionBounds(stair) {
  const centerX = (stair.cx * CHUNK_CELLS + stair.localX) * CELL;
  const wallZ = (stair.cz * CHUNK_CELLS + stair.localZ) * CELL;
  const halfT = WALL_T * 0.5;
  const wallHalfWidth = 7;
  const openingHalfWidth = 1.7;
  const stairDepth = 6.2;
  const sideMinZ = Math.min(wallZ, wallZ + stair.face * stairDepth);
  const sideMaxZ = Math.max(wallZ, wallZ + stair.face * stairDepth);
  const backZ = wallZ - stair.face * 0.23;

  return [
    // The main wall remains solid on both sides of the stair opening.
    {
      minX: centerX - wallHalfWidth, maxX: centerX - openingHalfWidth,
      minZ: wallZ - halfT, maxZ: wallZ + halfT,
    },
    {
      minX: centerX + openingHalfWidth, maxX: centerX + wallHalfWidth,
      minZ: wallZ - halfT, maxZ: wallZ + halfT,
    },
    // Narrow retaining walls guide the player up the stairwell.
    {
      minX: centerX - openingHalfWidth - halfT,
      maxX: centerX - openingHalfWidth + halfT,
      minZ: sideMinZ, maxZ: sideMaxZ,
    },
    {
      minX: centerX + openingHalfWidth - halfT,
      maxX: centerX + openingHalfWidth + halfT,
      minZ: sideMinZ, maxZ: sideMaxZ,
    },
    // This landing stays sealed until its later level link is implemented.
    {
      minX: centerX - openingHalfWidth, maxX: centerX + openingHalfWidth,
      minZ: backZ - 0.06, maxZ: backZ + 0.06,
    },
  ];
}

// ---------------------------------------------------------------------------
// Chunk layout generation
// ---------------------------------------------------------------------------
// A chunk's layout is a set of axis-aligned wall segments on the grid.
// Segments never cross chunk borders, so chunks are independent and seamless.
// Returns { cx, cz, walls: [{x, z, len, horiz}], cells: Set<"x,z"> }
// where coordinates are ABSOLUTE grid cells and `cells` is the collision set.

export function generateChunk(cx, cz, seed) {
  const rng = mulberry32(hashSeed(cx, cz, seed));
  const walls = [];
  const cells = new Set();
  const spawnClear = cx === 0 && cz === 0;
  const staircase = getWallStaircase(cx, cz);

  // Keep the spawn pocket and both stairwell footprints free of generated walls.
  const inClear = (x, z) => {
    if (spawnClear && x >= 5 && x <= 10 && z >= 5 && z <= 10) return true;
    if (!staircase) return false;
    const minZ = staircase.face < 0 ? staircase.localZ - 3 : staircase.localZ;
    const maxZ = staircase.face < 0 ? staircase.localZ : staircase.localZ + 3;
    return x >= staircase.localX - 4 && x <= staircase.localX + 4 &&
      z >= minZ && z <= maxZ;
  };

  const tryAdd = (lx, lz, len, horiz) => {
    // Never occupy the outermost cell of a chunk. The perimeter stays open so
    // the player can always cross into the next procedural chunk without
    // hitting an accidental wall seam.
    if (horiz && (lz <= 0 || lz >= CHUNK_CELLS - 1)) return false;
    if (!horiz && (lx <= 0 || lx >= CHUNK_CELLS - 1)) return false;

    for (let i = 0; i < len; i++) {
      const x = horiz ? lx + i : lx;
      const z = horiz ? lz : lz + i;
      if (x <= 0 || z <= 0 || x >= CHUNK_CELLS - 1 || z >= CHUNK_CELLS - 1) return false;
      if (inClear(x, z)) return false;
      if (cells.has(cellKey(cx * CHUNK_CELLS + x, cz * CHUNK_CELLS + z))) return false;
    }
    for (let i = 0; i < len; i++) {
      const x = horiz ? lx + i : lx;
      const z = horiz ? lz : lz + i;
      cells.add(cellKey(cx * CHUNK_CELLS + x, cz * CHUNK_CELLS + z));
    }
    walls.push({ x: cx * CHUNK_CELLS + lx, z: cz * CHUNK_CELLS + lz, len, horiz });
    return true;
  };

  // 1) Large architectural partitions — fewer, longer walls create
  // believable rooms and long Backrooms sightlines instead of a noisy maze.
  const nSeg = 22 + Math.floor(rng() * 7); // 22–28 wall attempts for more open sightlines
  for (let i = 0; i < nSeg; i++) {
    const horiz = rng() < 0.5;
    const len = 3 + Math.floor(rng() * 6); // 3–8 cells
    let lx = Math.floor(rng() * CHUNK_CELLS);
    let lz = Math.floor(rng() * CHUNK_CELLS);
    if (horiz && lx + len > CHUNK_CELLS) lx = CHUNK_CELLS - len;
    if (!horiz && lz + len > CHUNK_CELLS) lz = CHUNK_CELLS - len;
    tryAdd(lx, lz, len, horiz);
  }

  // A ring side, optionally leaving a wider doorway at `gapAt`.
  const addRingSide = (x, z, len, horiz, gapAt, gapWidth = 1) => {
    if (gapAt < 0) {
      tryAdd(x, z, len, horiz);
      return;
    }
    gapWidth = Math.min(Math.max(1, gapWidth), len);
    gapAt = Math.min(Math.max(gapAt, 0), len - gapWidth);
    if (gapAt > 0) tryAdd(x, z, gapAt, horiz);
    const rest = len - gapAt - gapWidth;
    if (rest > 0) {
      tryAdd(
        x + (horiz ? gapAt + gapWidth : 0),
        z + (horiz ? 0 : gapAt + gapWidth),
        rest,
        horiz
      );
    }
  };

  // Extra short partitions: these break up the big empty expanses and make
  // each chunk feel much more like a dense Backrooms floor plan.
  const nShort = 5 + Math.floor(rng() * 5); // 5–9 extra attempts, with fewer tight pockets
  for (let i = 0; i < nShort; i++) {
    const horiz = rng() < 0.5;
    const len = 2 + Math.floor(rng() * 4); // 2–5 cells
    let lx = 1 + Math.floor(rng() * (CHUNK_CELLS - len - 2));
    let lz = 1 + Math.floor(rng() * (CHUNK_CELLS - len - 2));
    tryAdd(lx, lz, len, horiz);
  }

  // 2) Larger side rooms / service spaces with a deliberate doorway.
  if (rng() < 0.72) {
    const w = 5 + Math.floor(rng() * 4); // 5–8 cells
    const h = 5 + Math.floor(rng() * 4); // 5–8 cells
    const x0 = 1 + Math.floor(rng() * (CHUNK_CELLS - w - 2));
    const z0 = 1 + Math.floor(rng() * (CHUNK_CELLS - h - 2));
    const side = Math.floor(rng() * 4); // 0 top, 1 bottom, 2 left, 3 right
    const gap = (n) => Math.floor(rng() * Math.max(1, n - 1));
    addRingSide(x0, z0, w, true, side === 0 ? gap(w) : -1, 2);
    addRingSide(x0, z0 + h - 1, w, true, side === 1 ? gap(w) : -1, 2);
    addRingSide(x0, z0 + 1, h - 2, false, side === 2 ? gap(h - 2) : -1, 2);
    addRingSide(x0 + w - 1, z0 + 1, h - 2, false, side === 3 ? gap(h - 2) : -1, 2);
  }

  // 3) Main corridor spines: broad, long lanes with enough breathing room
  // to create readable spaces and strong lines of sight.
  if (rng() < 0.72) {
    const horiz = rng() < 0.5;
    const len = 9 + Math.floor(rng() * 8); // 9–16 cells
    const lane = 3 + Math.floor(rng() * 2); // 3–4 cells wide for the larger spider
    const a = Math.floor(rng() * (CHUNK_CELLS - len));
    const b = Math.floor(rng() * (CHUNK_CELLS - lane - 2));
    if (horiz) {
      tryAdd(a, b, len, true);
      tryAdd(a, b + lane + 1, len, true);
    } else {
      tryAdd(a, b, len, false);
      tryAdd(a + lane + 1, b, len, false);
    }
  }

  // 4) One occasional "backroom" motif: a wide partial divider. It creates
  // a large room that still feels connected rather than becoming a dead-end box.
  if (rng() < 0.48) {
    const horiz = rng() < 0.5;
    const len = 6 + Math.floor(rng() * 6); // 6–11 cells
    const start = 2 + Math.floor(rng() * Math.max(1, CHUNK_CELLS - len - 4));
    const offset = 3 + Math.floor(rng() * 5);
    if (horiz) tryAdd(start, offset, len, true);
    else tryAdd(offset, start, len, false);
  }

  return { cx, cz, walls, cells };
}

// ---------------------------------------------------------------------------
// Chunk meshes + chunk manager
// ---------------------------------------------------------------------------

const QUALITY_PARAM=new URLSearchParams(location.search).get("quality");
// Lightweight world streaming is the default. ?quality=high opts into the heavier path.
const LOW_END_DEVICE=QUALITY_PARAM!=="high";
const R_GENERATE = LOW_END_DEVICE ? 1 : 2;
const R_DISPOSE = LOW_END_DEVICE ? 1 : 3;
// BoxGeometry face order: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z (4 verts each).
// Scale the U coordinate of a face so the wallpaper repeats every CELL meters.
function scaleFaceU(geo, face, s) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < 4; i++) {
    const idx = face * 4 + i;
    uv.setX(idx, uv.getX(idx) * s);
  }
}

// A wall segment as a thin box, with UVs remapped so the wallpaper is to
// scale (1 texture tile per 4 m) along the long faces and the end caps.
function wallGeometry(len, horiz) {
  const L = len * CELL;
  const geo = horiz
    ? new THREE.BoxGeometry(L, WALL_H, WALL_T)
    : new THREE.BoxGeometry(WALL_T, WALL_H, L);
  if (horiz) {
    scaleFaceU(geo, 4, L / CELL); // +z long face
    scaleFaceU(geo, 5, L / CELL); // -z long face
    scaleFaceU(geo, 0, WALL_T / CELL); // +x end cap
    scaleFaceU(geo, 1, WALL_T / CELL); // -x end cap
  } else {
    scaleFaceU(geo, 0, L / CELL); // +x long face
    scaleFaceU(geo, 1, L / CELL); // -x long face
    scaleFaceU(geo, 4, WALL_T / CELL); // +z end cap
    scaleFaceU(geo, 5, WALL_T / CELL); // -z end cap
  }
  geo.translate(0, WALL_H / 2, 0); // sit on the floor
  return geo;
}

export class World {
  constructor(scene, seed, anisotropy) {
    this.scene = scene;
    this.seed = seed;
    this.chunks = new Map(); // "cx,cz" -> { data, group, wallBounds }
    this.root = new THREE.Group();
    this.lastStreamCX = null;
    this.lastStreamCZ = null;
    this.streamNeedsWork = true;
    this.wallQueryScratch = [];
    scene.add(this.root);

    const tex = createTextures(anisotropy);
    this.materials = {
      wall: new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.92 }),
      floor: new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 1.0 }),
      // The drop ceiling sits directly under the player's light sources, so a
      // white StandardMaterial gets blown out and reads as a flat white roof.
      // Keep the real tile texture, darken the base, and render both sides so
      // there is never a disappearing ceiling when the camera crosses a chunk.
      ceiling: new THREE.MeshStandardMaterial({
        map: tex.ceiling,
        color: 0x77725e,
        roughness: 0.98,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    };

    // Shared fluorescent materials. Fixture meshes are per-chunk so they are
    // disposed with the chunk, while these materials are reused everywhere.
    this.fixtureMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff4ca,
      emissive: 0xffe2a0,
      emissiveIntensity: 0.55,
      roughness: 0.28,
    });
    this.fixtureDimMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff4ca,
      emissive: 0xffe2a0,
      emissiveIntensity: 0.34,
      roughness: 0.30,
    });
    this.fixtureBlackMaterial = new THREE.MeshStandardMaterial({
      color: 0x10100e,
      roughness: 0.96,
    });
    this.stairStepMaterial = new THREE.MeshStandardMaterial({
      color: 0x39372f, roughness: 0.98, metalness: 0,
    });
    this.stairRailMaterial = new THREE.MeshStandardMaterial({
      color: 0x353a32, roughness: 0.82, metalness: 0.12,
    });

    // Ceiling fixtures use a tiny real-light budget. They only activate when
    // the player's camera is actually looking toward them.
    this.fixtureLights = [];
    this.wallOccluders = [];
    this.fixtureLightLastUpdate = 0;
    this.fixtureLightCamera = null;
    this.fixtureLightRaycaster = new THREE.Raycaster();
    this.fixtureLightViewOrigin = new THREE.Vector3();
    this.fixtureLightDirection = new THREE.Vector3();
    this.fixtureLightTargetDirection = new THREE.Vector3();
    this.fixtureLightToTarget = new THREE.Vector3();
    this.fixtureLightTarget = new THREE.Vector3();

    // Permanent outer walls survive chunk streaming and block both players and AI.
    this.boundaryWallBounds = [];
    this.boundaryGroup = new THREE.Group();
    this.boundaryGroup.name = "BackroomsMapBoundary";
    this.boundaryMaterial = this.materials.wall.clone();
    this.boundaryMaterial.color.multiplyScalar(0.78);
    this.root.add(this.boundaryGroup);
    this.buildMapBoundary();

    // Shared per-chunk geometry templates (never disposed per chunk).
    this.floorGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
    this.floorGeo.rotateX(-Math.PI / 2);
    this.ceilGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
    this.ceilGeo.rotateX(Math.PI / 2); // face down
  }

  // -- fixed map boundary ----------------------------------------------------

  buildMapBoundary() {
    const minX = MAP_MIN_CHUNK * CHUNK_SIZE;
    const maxX = (MAP_MAX_CHUNK + 1) * CHUNK_SIZE;
    const minZ = MAP_MIN_CHUNK * CHUNK_SIZE;
    const maxZ = (MAP_MAX_CHUNK + 1) * CHUNK_SIZE;
    const thickness = 1.2;
    const height = WALL_H + 4.0;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const midX = (minX + maxX) * 0.5;
    const midZ = (minZ + maxZ) * 0.5;

    const addWall = (name, geometry, x, z, bounds, horizontal) => {
      if (horizontal) {
        scaleFaceU(geometry, 4, (width + 2 * thickness) / CELL);
        scaleFaceU(geometry, 5, (width + 2 * thickness) / CELL);
        scaleFaceU(geometry, 0, thickness / CELL);
        scaleFaceU(geometry, 1, thickness / CELL);
      } else {
        scaleFaceU(geometry, 0, (depth + 2 * thickness) / CELL);
        scaleFaceU(geometry, 1, (depth + 2 * thickness) / CELL);
        scaleFaceU(geometry, 4, thickness / CELL);
        scaleFaceU(geometry, 5, thickness / CELL);
      }
      const mesh = new THREE.Mesh(geometry, this.boundaryMaterial);
      mesh.name = name;
      mesh.position.set(x, height * 0.5, z);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.fixtureLightOccluder = true;
      this.boundaryGroup.add(mesh);
      this.wallOccluders.push(mesh);
      this.boundaryWallBounds.push(bounds);
    };

    // Overlap the corners so there are no gaps to slip through.
    addWall(
      "BoundaryNorth",
      new THREE.BoxGeometry(width + 2 * thickness, height, thickness),
      midX, minZ + thickness * 0.5,
      { minX: minX - thickness, maxX: maxX + thickness, minZ, maxZ: minZ + thickness },
      true
    );
    addWall(
      "BoundarySouth",
      new THREE.BoxGeometry(width + 2 * thickness, height, thickness),
      midX, maxZ - thickness * 0.5,
      { minX: minX - thickness, maxX: maxX + thickness, minZ: maxZ - thickness, maxZ },
      true
    );
    addWall(
      "BoundaryWest",
      new THREE.BoxGeometry(thickness, height, depth + 2 * thickness),
      minX + thickness * 0.5, midZ,
      { minX, maxX: minX + thickness, minZ: minZ - thickness, maxZ: maxZ + thickness },
      false
    );
    addWall(
      "BoundaryEast",
      new THREE.BoxGeometry(thickness, height, depth + 2 * thickness),
      maxX - thickness * 0.5, midZ,
      { minX: maxX - thickness, maxX, minZ: minZ - thickness, maxZ: maxZ + thickness },
      false
    );
  }

  // -- chunk lifecycle -------------------------------------------------------

  spawnChunk(cx, cz) {
    const data = generateChunk(cx, cz, this.seed);
    const group = this.buildChunkMeshes(data, cx, cz);
    const wallBounds = data.walls.map((w) => {
      if (w.horiz) {
        const minX = w.x * CELL;
        const maxX = (w.x + w.len) * CELL;
        const midZ = (w.z + 0.5) * CELL;
        const halfT = WALL_T * 0.5;
        return { minX, maxX, minZ: midZ - halfT, maxZ: midZ + halfT };
      }

      const midX = (w.x + 0.5) * CELL;
      const halfT = WALL_T * 0.5;
      const minZ = w.z * CELL;
      const maxZ = (w.z + w.len) * CELL;
      return { minX: midX - halfT, maxX: midX + halfT, minZ, maxZ };
    });

    const staircase = getWallStaircase(cx, cz);
    if (staircase) wallBounds.push(...getWallStaircaseCollisionBounds(staircase));

    this.root.add(group);
    this.chunks.set(cellKey(cx, cz), { data, group, wallBounds });
  }

  disposeChunk(key) {
    const entry = this.chunks.get(key);
    if (!entry) return;
    this.root.remove(entry.group);
    // Detached children keep their .parent, so check live root membership.
    this.wallOccluders=this.wallOccluders.filter(mesh=>
      mesh.parent && this.root.children.includes(mesh.parent)
    );
    entry.group.traverse((o) => {
      if (o.isMesh && o.geometry !== this.floorGeo && o.geometry !== this.ceilGeo) {
        o.geometry.dispose();
      }
    });

    this.fixtureLights = this.fixtureLights.filter(item=>
      item.light.parent && this.root.children.includes(item.light.parent)
    );
    this.chunks.delete(key);
  }

  // Called every frame with the player position.
  updateFixtureLights(px,pz){
    const now=performance.now();
    const interval=LOW_END_DEVICE ? 140 : 100;

    if(now-this.fixtureLightLastUpdate<interval) return;
    this.fixtureLightLastUpdate=now;

    // Keep every fixture in currently streamed chunks active, not only the
    // nearest light that happens to be inside the camera view.
    this.fixtureLights=this.fixtureLights.filter(item=>
      item.light.parent && this.root.children.includes(item.light.parent)
    );
    this.wallOccluders=this.wallOccluders.filter(mesh=>
      mesh.parent && this.root.children.includes(mesh.parent)
    );

    const flickerTime=now*.003;
    for(const item of this.fixtureLights){
      item.light.visible=true;

      const flicker=item.cracked
        ? .88+.10*Math.sin(flickerTime*item.flickerSpeed+item.phase)
        : .95+.035*Math.sin(flickerTime*item.flickerSpeed+item.phase);

      item.light.intensity=item.baseIntensity*flicker;
    }
  }

  update(px, pz) {
    this.updateFixtureLights(px,pz);
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);

    const movedChunk=pcx!==this.lastStreamCX || pcz!==this.lastStreamCZ;

    if(movedChunk){
      this.lastStreamCX=pcx;
      this.lastStreamCZ=pcz;
      this.streamNeedsWork=true;
    }

    if(!this.streamNeedsWork){
      return;
    }

    // Generate missing chunks within radius, nearest first (1–2 per frame).
    const missing = [];
    for (let dz = -R_GENERATE; dz <= R_GENERATE; dz++) {
      for (let dx = -R_GENERATE; dx <= R_GENERATE; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (
          cx < MAP_MIN_CHUNK || cx > MAP_MAX_CHUNK ||
          cz < MAP_MIN_CHUNK || cz > MAP_MAX_CHUNK
        ) continue;
        if (!this.chunks.has(cellKey(cx, cz))) {
          missing.push([cx, cz, dx * dx + dz * dz]);
        }
      }
    }
    missing.sort((a, b) => a[2] - b[2]);
    let budget = LOW_END_DEVICE ? 1 : 2;
    for (const [cx, cz] of missing) {
      if (budget-- <= 0) break;
      this.spawnChunk(cx, cz);
    }

    this.streamNeedsWork=missing.length> (LOW_END_DEVICE ? 1 : 2);

    // Dispose chunks beyond the dispose radius.
    for (const [key, entry] of this.chunks) {
      const d = Math.max(
        Math.abs(entry.data.cx - pcx),
        Math.abs(entry.data.cz - pcz)
      );
      if (d > R_DISPOSE) this.disposeChunk(key);
    }
  }

  // -- collision -------------------------------------------------------------

  isCellBlocked(ax, az) {
    const chunk = this.chunks.get(
      cellKey(Math.floor(ax / CHUNK_CELLS), Math.floor(az / CHUNK_CELLS))
    );
    return chunk ? chunk.data.cells.has(cellKey(ax, az)) : false;
  }

  // Return the actual axis-aligned wall rectangles near a world position.
  // Collision uses these real bounds instead of treating an entire 4m cell as solid.
  getNearbyWallBounds(px, pz, radius = 1.0) {
    const minCx = Math.floor((px - radius) / CHUNK_SIZE);
    const maxCx = Math.floor((px + radius) / CHUNK_SIZE);
    const minCz = Math.floor((pz - radius) / CHUNK_SIZE);
    const maxCz = Math.floor((pz + radius) / CHUNK_SIZE);

    this.wallQueryScratch.length = 0;
    const query = {
      minX: px - radius, maxX: px + radius,
      minZ: pz - radius, maxZ: pz + radius
    };
    const overlaps = bounds =>
      bounds.maxX >= query.minX && bounds.minX <= query.maxX &&
      bounds.maxZ >= query.minZ && bounds.minZ <= query.maxZ;

    for (const bounds of this.boundaryWallBounds) {
      if (overlaps(bounds)) this.wallQueryScratch.push(bounds);
    }

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const entry = this.chunks.get(cellKey(cx, cz));
        if (!entry) continue;
        for (const bounds of entry.wallBounds) {
          if (overlaps(bounds)) this.wallQueryScratch.push(bounds);
        }
      }
    }

    return this.wallQueryScratch;
  }

  // -- mesh building ---------------------------------------------------------

  buildChunkMeshes(data, cx, cz) {
    const group = new THREE.Group();
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const mid = CHUNK_SIZE / 2;

    const floor = new THREE.Mesh(this.floorGeo, this.materials.floor);
    floor.position.set(ox + mid, 0, oz + mid);
    group.add(floor);

    const ceiling = new THREE.Mesh(this.ceilGeo, this.materials.ceiling);
    ceiling.position.set(ox + mid, WALL_H, oz + mid);
    group.add(ceiling);

    let wallMesh=null;
    if (data.walls.length > 0) {
      const geos = data.walls.map((w) => {
        const g = wallGeometry(w.len, w.horiz);
        g.translate(
          (w.x + (w.horiz ? w.len / 2 : 0.5)) * CELL,
          0,
          (w.z + (w.horiz ? 0.5 : w.len / 2)) * CELL
        );
        return g;
      });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      wallMesh=new THREE.Mesh(merged, this.materials.wall);
      wallMesh.name="BackroomsWallOccluder";
      wallMesh.userData.fixtureLightOccluder=true;
      group.add(wallMesh);
      this.wallOccluders.push(wallMesh);
    }

    const staircase = getWallStaircase(cx, cz);
    if (staircase) this.buildWallStaircase(group, staircase);

    this.buildCeilingFixtures(group, cx, cz);

    return group;
  }

  buildWallStaircase(group, staircase) {
    const centerX = (staircase.cx * CHUNK_CELLS + staircase.localX) * CELL;
    const wallZ = (staircase.cz * CHUNK_CELLS + staircase.localZ) * CELL;
    const face = staircase.face;
    const wallHalfWidth = 7;
    const openingHalfWidth = 1.7;
    const openingHeight = 3.75;
    const stairWidth = 3.05;
    const stairCount = 14;
    const stepDepth = 0.42;
    const stepRise = 0.22;
    const stairDepth = stairCount * stepDepth;
    const sideWallHeight = 4.25;

    const addBox = (name, size, position, material, blocksSight = false) => {
      const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
      geometry.translate(position[0], position[1], position[2]);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      group.add(mesh);
      if (blocksSight) {
        mesh.userData.fixtureLightOccluder = true;
        this.wallOccluders.push(mesh);
      }
      return mesh;
    };

    const addTexturedWall = (name, widthCells, x, z) => {
      const geometry = wallGeometry(widthCells, true);
      geometry.translate(x, 0, z);
      const mesh = new THREE.Mesh(geometry, this.materials.wall);
      mesh.name = name;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.fixtureLightOccluder = true;
      group.add(mesh);
      this.wallOccluders.push(mesh);
      return mesh;
    };

    // Full-height wall panels leave one unmistakable stair-shaped opening.
    const sidePanelWidth = wallHalfWidth - openingHalfWidth;
    const sidePanelOffset = (wallHalfWidth + openingHalfWidth) * 0.5;
    addTexturedWall("StairwellWallLeft", sidePanelWidth / CELL,
      centerX - sidePanelOffset, wallZ);
    addTexturedWall("StairwellWallRight", sidePanelWidth / CELL,
      centerX + sidePanelOffset, wallZ);
    addBox("StairwellLintel",
      [openingHalfWidth * 2, WALL_H - openingHeight, WALL_T],
      [centerX, (WALL_H + openingHeight) * 0.5, wallZ],
      this.materials.wall, true);

    // Side walls are deliberately low enough to read as a narrow stairwell,
    // with a dark landing that makes the top disappear into the wall.
    const sideWallGeometry = wallGeometry(stairDepth / CELL, false);
    sideWallGeometry.scale(1, sideWallHeight / WALL_H, 1);
    const sideCenterZ = wallZ + face * stairDepth * 0.5;
    for (const side of [-1, 1]) {
      const geometry = sideWallGeometry.clone();
      geometry.translate(centerX + side * openingHalfWidth, 0, sideCenterZ);
      const mesh = new THREE.Mesh(geometry, this.materials.wall);
      mesh.name = side < 0 ? "StairwellInnerWallLeft" : "StairwellInnerWallRight";
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.fixtureLightOccluder = true;
      group.add(mesh);
      this.wallOccluders.push(mesh);
    }
    sideWallGeometry.dispose();

    addBox("StairwellDarkLanding",
      [openingHalfWidth * 2 - 0.1, 4.7, 0.12],
      [centerX, 2.35, wallZ - face * 0.23],
      this.fixtureBlackMaterial, true);

    // Merge all treads into one mesh to keep this rare prop cheap to render.
    const stepGeometries = [];
    for (let i = 0; i < stairCount; i++) {
      const geometry = new THREE.BoxGeometry(stairWidth, stepRise, stepDepth);
      geometry.translate(
        centerX,
        (i + 0.5) * stepRise,
        wallZ + face * (stairCount - i - 0.5) * stepDepth
      );
      stepGeometries.push(geometry);
    }
    const mergedSteps = mergeGeometries(stepGeometries, false);
    for (const geometry of stepGeometries) geometry.dispose();
    if (mergedSteps) {
      const steps = new THREE.Mesh(mergedSteps, this.stairStepMaterial);
      steps.name = "HiddenWallStairFlight";
      steps.castShadow = false;
      steps.receiveShadow = true;
      group.add(steps);
    }

    // Worn rails climb toward the dark opening; no bright lights reveal them
    // from across the room, so both entrances remain easy to miss.
    const railStartY = 0.68;
    const railEndY = stairCount * stepRise + 0.42;
    const railLength = Math.hypot(stairDepth - 0.25, railEndY - railStartY);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, railLength, 7),
        this.stairRailMaterial
      );
      rail.name = side < 0 ? "StairwellRailLeft" : "StairwellRailRight";
      rail.position.set(
        centerX + side * 1.36,
        (railStartY + railEndY) * 0.5,
        wallZ + face * (stairDepth * 0.5)
      );
      rail.rotation.x = -face * Math.atan2(
        railEndY - railStartY,
        stairDepth - 0.25
      );
      rail.castShadow = false;
      rail.receiveShadow = false;
      group.add(rail);
    }
  }

  buildCeilingFixtures(group, cx, cz) {
    const fixturePositions = [
      [18,18],
      [48,46],
    ];
    const rng = mulberry32(hashSeed(cx, cz, this.seed) ^ 0x6f31a9);

    const crackedPattern = [
      [
        {w:1.02,x:-1.16,y:.012,z:.01,rx:-.030,rz:-.018},
        {w:.78,x:-.08,y:-.020,z:-.02,rx:.015,rz:.035,black:true},
        {w:1.12,x:1.00,y:.016,z:.02,rx:-.022,rz:-.028},
      ],
      [
        {w:.72,x:-1.28,y:-.012,z:-.03,rx:.020,rz:.045},
        {w:1.22,x:-.18,y:.010,z:.015,rx:-.010,rz:-.020},
        {w:.86,x:1.13,y:-.026,z:-.018,rx:.030,rz:.065},
      ],
      [
        {w:.92,x:-1.12,y:.018,z:.025,rx:-.035,rz:.020,black:true},
        {w:1.04,x:-.02,y:-.010,z:-.012,rx:.020,rz:-.040},
        {w:.62,x:1.05,y:.022,z:.030,rx:-.050,rz:.080},
      ],
      [
        {w:1.30,x:-1.02,y:-.018,z:-.015,rx:.012,rz:-.050},
        {w:.58,x:.16,y:.028,z:.035,rx:-.040,rz:.070},
        {w:.98,x:1.10,y:-.008,z:-.020,rx:.030,rz:-.015},
      ],
      [
        {w:.80,x:-1.24,y:.020,z:.005,rx:-.025,rz:-.075,black:true},
        {w:.90,x:-.16,y:-.030,z:-.028,rx:.040,rz:.050},
        {w:1.25,x:1.05,y:.014,z:.018,rx:-.018,rz:-.030},
      ],
      [
        {w:1.10,x:-1.10,y:-.008,z:-.025,rx:.018,rz:.025},
        {w:.68,x:-.08,y:.024,z:.030,rx:-.045,rz:-.080},
        {w:.96,x:1.02,y:-.022,z:-.012,rx:.050,rz:.060},
      ],
    ];

    const intactGeos=[];
    const dimGeos=[];
    const blackGeos=[];
    const addBoxGeometry=(target,w,h,d,x,y,z,rx=0,ry=0,rz=0)=>{
      const geometry=new THREE.BoxGeometry(w,h,d);
      const rotation=new THREE.Euler(rx,ry,rz,"XYZ");
      geometry.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x,y,z),
          new THREE.Quaternion().setFromEuler(rotation),
          new THREE.Vector3(1,1,1)
        )
      );
      target.push(geometry);
    };

    for(let index=0; index<fixturePositions.length; index++){
      const [localX,localZ]=fixturePositions[index];

      // Keep one strong reference fixture per chunk; the rest are usually damaged.
      const cracked=index!==0 && rng()<.82;
      const phase=rng()*Math.PI*2;
      const power=cracked ? 2.5+rng()*.6 : 4.8+rng()*1.2;
      const x=cx*CHUNK_SIZE+localX;
      const z=cz*CHUNK_SIZE+localZ;
      const y=WALL_H-.035;

      if(cracked){
        const pieces=crackedPattern[index%crackedPattern.length];
        for(const piece of pieces){
          const target=piece.black ? blackGeos : dimGeos;
          addBoxGeometry(
            target,
            piece.w,.065,.84,
            x+piece.x,y+piece.y,z+piece.z,
            piece.rx,0,piece.rz
          );
        }
      }else{
        addBoxGeometry(
          intactGeos,
          3.5,.10,.95,
          x,y,z
        );
      }

      // Cracked fixtures are real light sources, not just emissive meshes.
      // Keep every fixture registered, then enable only the nearest few at runtime.
      const point=new THREE.PointLight(
        0xffe6a8,
        power,
        cracked ? 26 : 32,
        1.3
      );
      // The emitter sits just below the ceiling panel so its real light cone
      // washes across the surrounding walls and floor.
      point.position.set(x,y-.20,z);
      point.castShadow=false;
      point.visible=false;
      point.name=cracked ? "CrackedFluorescentLight" : "FluorescentLight";
      group.add(point);
      this.fixtureLights.push({
        light:point,
        x,
        z,
        cracked,
        baseIntensity:power,
        phase,
        flickerSpeed:cracked ? (8+rng()*5) : (4+rng()*3)
      });
    }

    const mergeFixtureGeometries=(geometries,material,name)=>{
      if(!geometries.length) return;
      const merged=mergeGeometries(geometries,false);
      for(const geometry of geometries) geometry.dispose();
      const mesh=new THREE.Mesh(merged,material);
      mesh.name=name;
      group.add(mesh);
    };

    mergeFixtureGeometries(intactGeos,this.fixtureMaterial,"FluorescentDiffusers");
    mergeFixtureGeometries(dimGeos,this.fixtureDimMaterial,"CrackedDiffusers");
    mergeFixtureGeometries(blackGeos,this.fixtureBlackMaterial,"CrackedBlackSections");
  }
  // Compatibility hooks for feature-branch systems. The main Backrooms
  // generator has no imported interactables/camera records or animated
  // atmosphere layer, so expose safe empty/no-op APIs for those callers.
  getInteractables() {
    return [];
  }

  getSecurityCameras() {
    return [];
  }

  updateAtmosphereEffects() {}

}
