// world.js — seeded RNG, chunk layout generation, chunk meshes, chunk manager.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createTextures } from "./textures.js";

export const CELL = 4; // meters per grid cell
export const CHUNK_CELLS = 16; // cells per chunk side
export const CHUNK_SIZE = CELL * CHUNK_CELLS; // 64 m
export const WALL_H = 3; // wall / ceiling height
export const WALL_T = 0.35; // wall thickness
export const EYE = 1.6; // eye height

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

  // Keep a 6x6-cell area around spawn (center of chunk 0,0) open.
  const inClear = (x, z) => spawnClear && x >= 5 && x <= 10 && z >= 5 && z <= 10;

  const tryAdd = (lx, lz, len, horiz) => {
    for (let i = 0; i < len; i++) {
      const x = horiz ? lx + i : lx;
      const z = horiz ? lz : lz + i;
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

  // 1) Freestanding wall segments — the sparse partitions of the reference.
  const nSeg = 6 + Math.floor(rng() * 5); // 6–10
  for (let i = 0; i < nSeg; i++) {
    const horiz = rng() < 0.5;
    const len = 2 + Math.floor(rng() * 7); // 2–8 cells
    let lx = Math.floor(rng() * CHUNK_CELLS);
    let lz = Math.floor(rng() * CHUNK_CELLS);
    if (horiz && lx + len > CHUNK_CELLS) lx = CHUNK_CELLS - len;
    if (!horiz && lz + len > CHUNK_CELLS) lz = CHUNK_CELLS - len;
    tryAdd(lx, lz, len, horiz);
  }

  // A ring side, optionally leaving a 1-cell doorway at `gapAt`.
  const addRingSide = (x, z, len, horiz, gapAt) => {
    if (gapAt < 0) {
      tryAdd(x, z, len, horiz);
      return;
    }
    gapAt = Math.min(Math.max(gapAt, 0), len - 1);
    if (gapAt > 0) tryAdd(x, z, gapAt, horiz);
    const rest = len - gapAt - 1;
    if (rest > 0)
      tryAdd(x + (horiz ? gapAt + 1 : 0), z + (horiz ? 0 : gapAt + 1), rest, horiz);
  };

  // 2) Occasional enclosed room with one doorway.
  if (rng() < 0.15) {
    const w = 3 + Math.floor(rng() * 3); // 3–5 cells
    const h = 3 + Math.floor(rng() * 3);
    const x0 = 1 + Math.floor(rng() * (CHUNK_CELLS - w - 2));
    const z0 = 1 + Math.floor(rng() * (CHUNK_CELLS - h - 2));
    const side = Math.floor(rng() * 4); // 0 top, 1 bottom, 2 left, 3 right
    const gap = (n) => Math.floor(rng() * Math.max(1, n));
    addRingSide(x0, z0, w, true, side === 0 ? gap(w) : -1);
    addRingSide(x0, z0 + h - 1, w, true, side === 1 ? gap(w) : -1);
    addRingSide(x0, z0 + 1, h - 2, false, side === 2 ? gap(h - 2) : -1);
    addRingSide(x0 + w - 1, z0 + 1, h - 2, false, side === 3 ? gap(h - 2) : -1);
  }

  // 3) Occasional long corridor: two parallel walls with an open lane between.
  if (rng() < 0.15) {
    const horiz = rng() < 0.5;
    const len = 8 + Math.floor(rng() * 9); // 8–16 cells
    const lane = 1 + Math.floor(rng() * 2); // 1–2 cells wide
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

  return { cx, cz, walls, cells };
}

// ---------------------------------------------------------------------------
// Chunk meshes + chunk manager
// ---------------------------------------------------------------------------

const R_GENERATE = 2; // keep chunks within this Chebyshev radius
const R_DISPOSE = 3; // ...and drop anything farther than this
const PANEL_W = 2.2; // light fixture size (m)
const PANEL_D = 0.5;
const PANEL_SPACING = 8; // m between fixtures

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
    this.chunks = new Map(); // "cx,cz" -> { data, group }
    this.root = new THREE.Group();
    scene.add(this.root);

    const tex = createTextures(anisotropy);
    this.materials = {
      wall: new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.92 }),
      floor: new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 1.0 }),
      ceiling: new THREE.MeshStandardMaterial({ map: tex.ceiling, roughness: 0.95 }),
      panel: new THREE.MeshBasicMaterial({ map: tex.panel, color: 0x62605a }),
      panelOff: new THREE.MeshBasicMaterial({ color: 0x2b2921 }),
      flicker: [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ map: tex.panel, color: 0x68655e })),
    };

    // Shared per-chunk geometry templates (never disposed per chunk).
    this.floorGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
    this.floorGeo.rotateX(-Math.PI / 2);
    this.ceilGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
    this.ceilGeo.rotateX(Math.PI / 2); // face down
    this.panelGeo = new THREE.PlaneGeometry(PANEL_W, PANEL_D);
    this.panelGeo.rotateX(Math.PI / 2); // face down
  }

  // -- chunk lifecycle -------------------------------------------------------

  spawnChunk(cx, cz) {
    const data = generateChunk(cx, cz, this.seed);
    const group = this.buildChunkMeshes(data, cx, cz);
    this.root.add(group);
    this.chunks.set(cellKey(cx, cz), { data, group });
  }

  disposeChunk(key) {
    const entry = this.chunks.get(key);
    if (!entry) return;
    this.root.remove(entry.group);
    entry.group.traverse((o) => {
      if (o.isMesh && o.geometry !== this.floorGeo && o.geometry !== this.ceilGeo) {
        o.geometry.dispose();
      }
    });
    this.chunks.delete(key);
  }

  // Called every frame with the player position.
  update(px, pz) {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);

    // Generate missing chunks within radius, nearest first (1–2 per frame).
    const missing = [];
    for (let dz = -R_GENERATE; dz <= R_GENERATE; dz++) {
      for (let dx = -R_GENERATE; dx <= R_GENERATE; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (!this.chunks.has(cellKey(cx, cz))) {
          missing.push([cx, cz, dx * dx + dz * dz]);
        }
      }
    }
    missing.sort((a, b) => a[2] - b[2]);
    let budget = 2;
    for (const [cx, cz] of missing) {
      if (budget-- <= 0) break;
      this.spawnChunk(cx, cz);
    }

    // Dispose chunks beyond the dispose radius.
    for (const key of [...this.chunks.keys()]) {
      const [cx, cz] = key.split(",").map(Number);
      const d = Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
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

    if (data.walls.length > 0) {
      const geos = data.walls.map((w) => {
        const g = wallGeometry(w.len, w.horiz);
        g.translate(
          (w.x + w.len / 2) * CELL, // center along the segment
          0,
          (w.z + (w.horiz ? 0.5 : w.len / 2)) * CELL
        );
        return g;
      });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      group.add(new THREE.Mesh(merged, this.materials.wall));
    }

    this.buildPanels(group, data, ox, oz);
    return group;
  }

  buildPanels(group, data, ox, oz) {
    // Fixture grid: local 4 + 8i (i = 0..7) — continuous across chunk borders.
    // ~15% dead, ~10% flickering (3 shared animated materials), rest on.
    const prng = mulberry32(hashSeed(data.cx * 3 + 7, data.cz * 3 + 13, this.seed ^ 0x9e3779b9));
    const on = [];
    const off = [];
    const flick = [[], [], []];
    for (let j = 0; j < CHUNK_CELLS / 2; j++) {
      for (let i = 0; i < CHUNK_CELLS / 2; i++) {
        const r = prng();
        const x = ox + 4 + i * PANEL_SPACING;
        const z = oz + 4 + j * PANEL_SPACING;
        const geo = this.panelGeo.clone();
        geo.translate(x, WALL_H - 0.03, z);
        if (r < 0.15) off.push(geo);
        else if (r < 0.25) flick[Math.floor(prng() * 3)].push(geo);
        else on.push(geo);
      }
    }
    const addMerged = (geos, mat) => {
      if (!geos.length) return;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      group.add(new THREE.Mesh(merged, mat));
    };
    addMerged(on, this.materials.panel);
    addMerged(off, this.materials.panelOff);
    for (let i = 0; i < 3; i++) addMerged(flick[i], this.materials.flicker[i]);
  }

  // Animate the three shared flicker materials (called every frame).
  updateFlicker(t) {
    for (let i = 0; i < 3; i++) {
      const ph = i * 2.7;
      const n =
        Math.sin(t * 11.3 + ph) * Math.sin(t * 5.7 + ph * 1.7) +
        Math.sin(t * 23.7 + ph * 0.9);
      const v = n > 1.2 ? 0.12 : n > 0.8 ? 0.55 : 1.0;
      this.materials.flicker[i].color.setScalar(v);
    }
  }
}
