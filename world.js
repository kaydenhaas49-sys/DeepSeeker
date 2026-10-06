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
// Performance profile
// ---------------------------------------------------------------------------

const QUALITY_PARAM=new URLSearchParams(location.search).get("quality");

function detectLowEndHardware(){
  const cores=navigator.hardwareConcurrency||4;
  const memory=navigator.deviceMemory||4;
  let gpu="";
  try{
    const canvas=document.createElement("canvas");
    const gl=canvas.getContext("webgl2")||canvas.getContext("webgl");
    const ext=gl?.getExtension("WEBGL_debug_renderer_info");
    gpu=ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)||"")
      : String(gl?.getParameter(gl.RENDERER)||"");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }catch{}
  return /swiftshader|llvmpipe|software rasterizer|intel(?:r)?\s+(?:hd|uhd|iris)|mesa.*intel|microsoft basic render/i.test(gpu)
    || (cores<=4 && memory<=4);
}

const LOW_END_DEVICE=
  QUALITY_PARAM==="low" ||
  QUALITY_PARAM==="potato" ||
  (QUALITY_PARAM!=="high" && detectLowEndHardware());

const R_GENERATE=LOW_END_DEVICE ? 1 : 2;
const R_DISPOSE=LOW_END_DEVICE ? 1 : 3;
const CHUNK_RENDER_DISTANCE=LOW_END_DEVICE ? 74 : Infinity;

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
  const nSeg = LOW_END_DEVICE
    ? 22 + Math.floor(rng() * 7)
    : 32 + Math.floor(rng() * 11); // weak: 22–28, normal: 32–42 wall attempts
  for (let i = 0; i < nSeg; i++) {
    const horiz = rng() < 0.5;
    const len = 3 + Math.floor(rng() * 6); // 3–8 cells
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

  // Extra short partitions: these break up the big empty expanses and make
  // each chunk feel much more like a dense Backrooms floor plan.
  const nShort = LOW_END_DEVICE
    ? 6 + Math.floor(rng() * 5)
    : 12 + Math.floor(rng() * 8); // weak: 6–10, normal: 12–19 extra attempts
  for (let i = 0; i < nShort; i++) {
    const horiz = rng() < 0.5;
    const len = 2 + Math.floor(rng() * 4); // 2–5 cells
    let lx = 1 + Math.floor(rng() * (CHUNK_CELLS - len - 2));
    let lz = 1 + Math.floor(rng() * (CHUNK_CELLS - len - 2));
    tryAdd(lx, lz, len, horiz);
  }

  // 2) Larger side rooms / service spaces with a deliberate doorway.
  if (rng() < 0.82) {
    const w = 4 + Math.floor(rng() * 5); // 4–8 cells
    const h = 4 + Math.floor(rng() * 5);
    const x0 = 1 + Math.floor(rng() * (CHUNK_CELLS - w - 2));
    const z0 = 1 + Math.floor(rng() * (CHUNK_CELLS - h - 2));
    const side = Math.floor(rng() * 4); // 0 top, 1 bottom, 2 left, 3 right
    const gap = (n) => Math.floor(rng() * Math.max(1, n));
    addRingSide(x0, z0, w, true, side === 0 ? gap(w) : -1);
    addRingSide(x0, z0 + h - 1, w, true, side === 1 ? gap(w) : -1);
    addRingSide(x0, z0 + 1, h - 2, false, side === 2 ? gap(h - 2) : -1);
    addRingSide(x0 + w - 1, z0 + 1, h - 2, false, side === 3 ? gap(h - 2) : -1);
  }

  // 3) Main corridor spines: broad, long lanes with enough breathing room
  // to create readable spaces and strong lines of sight.
  if (rng() < 0.72) {
    const horiz = rng() < 0.5;
    const len = 9 + Math.floor(rng() * 8); // 9–16 cells
    const lane = 2 + Math.floor(rng() * 2); // 2–3 cells wide
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
  if (rng() < 0.68) {
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

    const tex = createTextures(
      LOW_END_DEVICE ? 1 : Math.min(anisotropy,4)
    );
    this.materials = {
      wall: new THREE.MeshLambertMaterial({ map: tex.wall }),
      floor: LOW_END_DEVICE
        ? new THREE.MeshBasicMaterial({ map: tex.floor, color: 0x8f876f })
        : new THREE.MeshLambertMaterial({ map: tex.floor }),
      ceiling: new THREE.MeshBasicMaterial({
        map: tex.ceiling,
        color: LOW_END_DEVICE ? 0xbab6a8 : 0xffffff
      }),
    };

    // Shared fluorescent materials. Fixture meshes are per-chunk so they are
    // disposed with the chunk, while these materials are reused everywhere.
    this.fixtureMaterial = LOW_END_DEVICE
      ? new THREE.MeshBasicMaterial({color:0xffedbd})
      : new THREE.MeshStandardMaterial({
          color: 0xfff4ca,
          emissive: 0xffe2a0,
          emissiveIntensity: 4.00,
          roughness: 0.28,
        });
    this.fixtureDimMaterial = LOW_END_DEVICE
      ? new THREE.MeshBasicMaterial({color:0x8f896f})
      : new THREE.MeshStandardMaterial({
          color: 0xfff4ca,
          emissive: 0xffe2a0,
          emissiveIntensity: 3.00,
          roughness: 0.30,
        });
    this.fixtureBlackMaterial = new THREE.MeshBasicMaterial({
      color: 0x10100e,
    });

    // Every ceiling fixture gets a real PointLight. Only the nearest handful
    // are enabled at once so the damaged lights can illuminate the room without
    // recreating the severe multi-light performance hit.
    this.fixtureLights = [];
    this.activeFixtureLights = [];
    this.fixtureLightRefreshAt = 0;
    this.fixtureLightSelectionX = Infinity;
    this.fixtureLightSelectionZ = Infinity;
    this.renderCullRefreshAt = 0;
    this.interactables = [];
    this.securityCameras = [];
    this.atmosphereEffects = [];

    // Shared per-chunk geometry templates (never disposed per chunk).
    this.floorGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
    this.floorGeo.rotateX(-Math.PI / 2);
    this.ceilGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
    this.ceilGeo.rotateX(Math.PI / 2); // face down
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

    this.root.add(group);
    this.chunks.set(cellKey(cx, cz), { data, group, wallBounds });
    this.fixtureLightRefreshAt = 0;
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

    this.activeFixtureLights = this.activeFixtureLights.filter(item => item.light.parent);
    for(const item of this.activeFixtureLights) item.light.visible=false;
    this.fixtureLights = this.fixtureLights.filter(item => item.light.parent);
    this.interactables = this.interactables.filter(item => item?.parent);
    this.securityCameras = this.securityCameras.filter(item => item?.group?.parent);
    this.atmosphereEffects = this.atmosphereEffects.filter(item => item?.group?.parent);
    this.chunks.delete(key);
  }

  // Called every frame with the player position.
  updateFixtureLights(px,pz){
    if(LOW_END_DEVICE) return;

    const maxActive=6;
    const maxDistance=18;
    const maxDistanceSq=maxDistance*maxDistance;
    const now=performance.now();

    const movedEnough=
      !Number.isFinite(this.fixtureLightSelectionX) ||
      !Number.isFinite(this.fixtureLightSelectionZ) ||
      Math.abs(px-this.fixtureLightSelectionX)>1.5 ||
      Math.abs(pz-this.fixtureLightSelectionZ)>1.5;

    if(now>=this.fixtureLightRefreshAt || movedEnough){
      const candidates=[];

      for(const item of this.activeFixtureLights||[]){
        item.light.visible=false;
      }

      this.fixtureLights=this.fixtureLights.filter(item=>item.light.parent);

      for(const item of this.fixtureLights){
        const dx=item.x-px;
        const dz=item.z-pz;
        const distanceSq=dx*dx+dz*dz;
        if(distanceSq>maxDistanceSq) continue;
        const priority=distanceSq*(item.cracked ? .78 : 1);
        candidates.push({item,priority});
      }

      candidates.sort((a,b)=>a.priority-b.priority);

      this.activeFixtureLights=candidates
        .slice(0,maxActive)
        .map(entry=>entry.item);

      for(const item of this.activeFixtureLights){
        item.light.visible=true;
      }

      this.fixtureLightSelectionX=px;
      this.fixtureLightSelectionZ=pz;
      this.fixtureLightRefreshAt=now+120;
    }

    const flickerTime=now*.003;
    for(const item of this.activeFixtureLights){
      const flicker=.93+.07*Math.sin(
        flickerTime*item.flickerSpeed+item.phase
      );
      item.light.intensity=item.baseIntensity*flicker;
    }
  }

  updateAtmosphereEffects(dt, px, pz){
    if(LOW_END_DEVICE) return;
    this.atmosphereEffects=this.atmosphereEffects.filter(item=>item?.group?.parent);
    const maxDistance=42;
    const maxDistanceSq=maxDistance*maxDistance;

    for(const effect of this.atmosphereEffects){
      const dx=effect.x-px;
      const dz=effect.z-pz;
      if(dx*dx+dz*dz>maxDistanceSq){
        effect.group.visible=false;
        continue;
      }
      effect.group.visible=true;

      effect.time+=dt;
      if(effect.type==="leak"){
        for(let i=0;i<effect.drops.length;i++){
          const drop=effect.drops[i];
          drop.position.y-=drop.speed*dt;
          if(drop.position.y<.08){
            drop.position.y=drop.startY;
          }
        }
      }else if(effect.type==="gust"){
        effect.particles.rotation.y+=dt*.35;
        effect.particles.position.x=Math.sin(effect.time*.75+effect.phase)*.18;
      }
    }
  }

  update(px, pz) {
    this.updateFixtureLights(px,pz);

    if(LOW_END_DEVICE){
      const now=performance.now();
      if(now>=this.renderCullRefreshAt){
        this.renderCullRefreshAt=now+120;
        const maxDistSq=CHUNK_RENDER_DISTANCE*CHUNK_RENDER_DISTANCE;
        for(const entry of this.chunks.values()){
          const minX=entry.data.cx*CHUNK_SIZE;
          const maxX=minX+CHUNK_SIZE;
          const minZ=entry.data.cz*CHUNK_SIZE;
          const maxZ=minZ+CHUNK_SIZE;
          const nx=Math.max(minX,Math.min(px,maxX));
          const nz=Math.max(minZ,Math.min(pz,maxZ));
          const dx=px-nx;
          const dz=pz-nz;
          entry.group.visible=(dx*dx+dz*dz)<=maxDistSq;
        }
      }
    }

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

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const entry = this.chunks.get(cellKey(cx, cz));
        if (!entry) continue;
        this.wallQueryScratch.push(...entry.wallBounds);
      }
    }

    return this.wallQueryScratch;
  }

  // -- mesh building ---------------------------------------------------------

  buildAtmosphereEffects(group, data, cx, cz) {
    if(LOW_END_DEVICE) return;
    const rng=mulberry32(hashSeed(cx,cz,this.seed)^0x7a4d21);
    if(rng()>0.22) return;

    const candidates=[];
    for(let lx=2;lx<=CHUNK_CELLS-3;lx++){
      for(let lz=2;lz<=CHUNK_CELLS-3;lz++){
        const gx=cx*CHUNK_CELLS+lx;
        const gz=cz*CHUNK_CELLS+lz;
        if(!data.cells.has(cellKey(gx,gz))) candidates.push({lx,lz});
      }
    }
    if(!candidates.length) return;

    const chosen=candidates[Math.floor(rng()*candidates.length)];
    const x=(cx*CHUNK_CELLS+chosen.lx+.5)*CELL;
    const z=(cz*CHUNK_CELLS+chosen.lz+.5)*CELL;

    if(rng()<.62){
      const effectGroup=new THREE.Group();
      effectGroup.name="CeilingLeak";
      effectGroup.position.set(x,WALL_H-.25,z);

      const pipeMat=new THREE.MeshStandardMaterial({color:0x5d5e57,roughness:.92});
      const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.7,8),pipeMat);
      pipe.position.y=.30;
      effectGroup.add(pipe);

      const dropMat=new THREE.MeshBasicMaterial({color:0xc4cfcb,transparent:true,opacity:.42});
      const drops=[];
      for(let i=0;i<5;i++){
        const drop=new THREE.Mesh(new THREE.SphereGeometry(.035+.015*rng(),7,7),dropMat);
        drop.position.set((rng()-.5)*.18,.55+rng()*.55,(rng()-.5)*.18);
        drop.startY=drop.position.y;
        drop.speed=.7+rng()*.9;
        effectGroup.add(drop);
        drops.push(drop);
      }

      group.add(effectGroup);
      this.atmosphereEffects.push({
        type:"leak",
        group:effectGroup,
        drops,
        x,z,
        time:0
      });
    }else{
      const effectGroup=new THREE.Group();
      effectGroup.name="VentilationGust";
      effectGroup.position.set(x,WALL_H-1.2,z);

      const particleMat=new THREE.PointsMaterial({
        color:0xb8b7a4,
        size:.045,
        transparent:true,
        opacity:.17,
        depthWrite:false
      });
      const positions=new Float32Array(45*3);
      for(let i=0;i<45;i++){
        positions[i*3]=(rng()-.5)*2.8;
        positions[i*3+1]=(rng()-.5)*1.1;
        positions[i*3+2]=(rng()-.5)*2.8;
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
      const particles=new THREE.Points(geometry,particleMat);
      effectGroup.add(particles);
      group.add(effectGroup);

      this.atmosphereEffects.push({
        type:"gust",
        group:effectGroup,
        particles,
        x,z,
        phase:rng()*Math.PI*2,
        time:0
      });
    }
  }

  buildComputerProps(group, data, cx, cz) {
    const rng = mulberry32(hashSeed(cx, cz, this.seed) ^ 0x44a91d);
    if (rng() > (LOW_END_DEVICE ? 0.10 : 0.28)) return;

    const candidates = [];
    for (let lx = 2; lx <= CHUNK_CELLS - 3; lx++) {
      for (let lz = 2; lz <= CHUNK_CELLS - 3; lz++) {
        const gx = cx * CHUNK_CELLS + lx;
        const gz = cz * CHUNK_CELLS + lz;
        const open =
          !data.cells.has(cellKey(gx, gz)) &&
          !data.cells.has(cellKey(gx + 1, gz)) &&
          !data.cells.has(cellKey(gx - 1, gz)) &&
          !data.cells.has(cellKey(gx, gz + 1)) &&
          !data.cells.has(cellKey(gx, gz - 1));
        if (open) candidates.push({ lx, lz });
      }
    }
    if (!candidates.length) return;

    const chosen = candidates[Math.floor(rng() * candidates.length)];
    const x = (cx * CHUNK_CELLS + chosen.lx + 0.5) * CELL;
    const z = (cz * CHUNK_CELLS + chosen.lz + 0.5) * CELL;
    const groupId = "FIELD_PC_" + cx + "_" + cz;
    const security = rng() < 0.45;

    const station = new THREE.Group();
    station.name = groupId;
    station.position.set(x, 0, z);
    station.rotation.y = Math.floor(rng() * 4) * Math.PI / 2;

    const wood = LOW_END_DEVICE
      ? new THREE.MeshBasicMaterial({color:0x302b24})
      : new THREE.MeshStandardMaterial({color:0x302b24,roughness:.88});
    const dark = LOW_END_DEVICE
      ? new THREE.MeshBasicMaterial({color:0x111312})
      : new THREE.MeshStandardMaterial({color:0x111312,roughness:.45});
    const screen = LOW_END_DEVICE
      ? new THREE.MeshBasicMaterial({color:security?0x3e7047:0x31503b})
      : new THREE.MeshStandardMaterial({
          color: security ? 0x162617 : 0x142019,
          emissive: security ? 0x447a48 : 0x223c2a,
          emissiveIntensity: security ? 1.8 : 1.15,
          roughness: .35
        });

    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.3, .12, 1.0), wood);
    desk.position.y = .82;
    station.add(desk);

    const monitor = new THREE.Mesh(new THREE.BoxGeometry(1.35, .78, .10), dark);
    monitor.position.set(0, 1.42, -.18);
    station.add(monitor);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.12, .56, .025), screen);
    panel.position.set(0, 1.43, -.235);
    station.add(panel);

    const stem = new THREE.Mesh(new THREE.BoxGeometry(.12, .45, .12), dark);
    stem.position.set(0, 1.02, -.18);
    station.add(stem);

    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(.72, .035, .30), dark);
    keyboard.position.set(0, .91, .22);
    station.add(keyboard);

    if(!LOW_END_DEVICE){
      const glow = new THREE.PointLight(
        security ? 0x6fba75 : 0x6f9a76,
        security ? 1.8 : .7,
        6,
        2
      );
      glow.position.set(0, 1.45, -.55);
      station.add(glow);
    }

    station.userData.interactable = {
      type: "computer",
      id: groupId,
      action: "USE COMPUTER",
      prompt: security ? "ACCESS SECURITY TERMINAL" : "USE COMPUTER",
      security
    };

    group.add(station);
    this.interactables.push(station);

    if (security) {
      const cameraCount = 1 + (rng() < .35 ? 1 : 0);
      for (let index = 0; index < cameraCount; index++) {
        const angle = Math.floor(rng() * 8) * Math.PI / 4;
        const radius = 10 + rng() * 12;
        const cameraX = x + Math.cos(angle) * radius;
        const cameraZ = z + Math.sin(angle) * radius;

        const camGroup = new THREE.Group();
        camGroup.name = "SECURITY_CAM_" + cx + "_" + cz + "_" + index;
        camGroup.position.set(cameraX, WALL_H - 1.35, cameraZ);

        const housingMaterial = new THREE.MeshStandardMaterial({ color: 0x111313, roughness: .75 });
        const housing = new THREE.Mesh(new THREE.BoxGeometry(.42, .28, .55), housingMaterial);
        housing.rotation.x = -.18;
        camGroup.add(housing);

        const lensMaterial = new THREE.MeshBasicMaterial({ color: 0x77b985 });
        const lens = new THREE.Mesh(new THREE.SphereGeometry(.065, 8, 8), lensMaterial);
        lens.position.set(0, -.02, -.30);
        camGroup.add(lens);

        group.add(camGroup);

        const target = new THREE.Vector3(
          cameraX + Math.cos(angle) * 14,
          1.7,
          cameraZ + Math.sin(angle) * 14
        );

        this.securityCameras.push({
          id: camGroup.name,
          name: "CAM " + String((Math.abs(cx * 17 + cz * 31 + index)) % 99 + 1).padStart(2, "0"),
          group: camGroup,
          position: new THREE.Vector3(cameraX, WALL_H - 1.35, cameraZ),
          lookAt: target
        });
      }
    }
  }

  getInteractables() {
    this.interactables = this.interactables.filter(item => item?.parent);
    return this.interactables;
  }

  getSecurityCameras() {
    this.securityCameras = this.securityCameras.filter(item => item?.group?.parent);
    return this.securityCameras;
  }

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
          (w.x + (w.horiz ? w.len / 2 : 0.5)) * CELL,
          0,
          (w.z + (w.horiz ? 0.5 : w.len / 2)) * CELL
        );
        return g;
      });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      group.add(new THREE.Mesh(merged, this.materials.wall));
    }

    this.buildCeilingFixtures(group, cx, cz);
    this.buildComputerProps(group, data, cx, cz);
    this.buildAtmosphereEffects(group, data, cx, cz);

    return group;
  }

  buildCeilingFixtures(group, cx, cz) {
    const fixturePositions = [
      [12,12],
      [32,12],
      [52,12],
      [12,40],
      [32,40],
      [52,40],
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
      if(LOW_END_DEVICE && index%2===1) continue;

      // Keep one strong reference fixture per chunk; the rest are usually damaged.
      const cracked=index!==0 && rng()<.82;
      const phase=rng()*Math.PI*2;
      const power=cracked ? 7.2+rng()*2.0 : 9.5+rng()*2.5;
      const x=cx*CHUNK_SIZE+localX;
      const z=cz*CHUNK_SIZE+localZ;
      const y=WALL_H-.055;

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
      if(!LOW_END_DEVICE){
        const point=new THREE.PointLight(
          0xffe6a8,
          power,
          cracked ? 23 : 27,
          1.8
        );
        point.position.set(x,y-.78,z);
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
}
