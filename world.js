// world.js — seeded RNG, chunk layout generation, chunk meshes, chunk manager.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createTextures } from "./textures.js?v=20261023-worn-materials";

export const CELL = 4; // meters per grid cell
export const CHUNK_CELLS = 16; // cells per chunk side
export const CHUNK_SIZE = CELL * CHUNK_CELLS; // 64 m
export const WALL_H = 9.0; // 9 m Backrooms ceiling
export const WALL_T = 0.35; // wall thickness
export const EYE = 1.6; // eye height

// Twenty-one-by-twenty-one 64m chunks create a finite 1344m x 1344m floor.
export const MAP_MIN_CHUNK = -10;
export const MAP_MAX_CHUNK = 10;

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
const ROOM_DOOR_WIDTH=2.05;
const ROOM_DOOR_HEIGHT=2.85;
const ROOM_WALL_THICKNESS=0.24;
const ROOM_HEIGHT=3.35;
const OUTER_ROOM_DOOR=Object.freeze({cx:-2,cz:-3,localX:12});
const BREAKER_MATH_PROBLEMS=Object.freeze([
  Object.freeze({index:1,expression:"18 ÷ 3",answer:6}),
  Object.freeze({index:2,expression:"4 + 5",answer:9}),
  Object.freeze({index:3,expression:"3 × 4",answer:12}),
  Object.freeze({index:4,expression:"20 − 7",answer:13}),
  Object.freeze({index:5,expression:"16 ÷ 2",answer:8}),
  Object.freeze({index:6,expression:"30 ÷ 6",answer:5}),
  Object.freeze({index:7,expression:"7 + 8",answer:15}),
  Object.freeze({index:8,expression:"5 × 4",answer:20}),
]);

function isProtectedRouteCell(gx,gz){
  return (
    (gz >= 7 && gz <= 9 && gx >= -23 && gx <= 23) ||
    (gx >= -21 && gx <= -19 && gz >= MAP_MIN_CHUNK * CHUNK_CELLS && gz <= 8)
  );
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
  // Random enclosed side rooms are intentionally disabled; keep the main maze open.
  const rooms = [];


  // Reserve the spawn corridor and the approach to the new maintenance-room door.
  const inClear = (x, z) => {
    if (spawnClear && x >= 5 && x <= 10 && z >= 5 && z <= 10) return true;
    const gx=cx*CHUNK_CELLS+x, gz=cz*CHUNK_CELLS+z;
    if(isProtectedRouteCell(gx,gz)) return true;
    return false;
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

  return { cx, cz, walls, cells, rooms };
}

// ---------------------------------------------------------------------------
// Chunk meshes + chunk manager
// ---------------------------------------------------------------------------

const QUALITY_PARAM=new URLSearchParams(location.search).get("quality");
function detectWorldHardware(){
 const cores=navigator.hardwareConcurrency||4,memory=navigator.deviceMemory||4;let gpu="";
 try{const canvas=document.createElement("canvas"),gl=canvas.getContext("webgl2")||canvas.getContext("webgl");
 const ext=gl?.getExtension("WEBGL_debug_renderer_info");
 gpu=ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)||""):String(gl?.getParameter(gl.RENDERER)||"");
 gl?.getExtension("WEBGL_lose_context")?.loseContext();}catch{}
 const software=/swiftshader|llvmpipe|software rasterizer|microsoft basic render/i.test(gpu);
 const oldIntel=/intel(?:r)?\s+hd\s+graphics|mesa.*intel\s+hd/i.test(gpu);
 const weakCpu=cores<=4&&memory<=4;
 const discreteGpu=/nvidia|geforce|radeon\s+rx|arc\s*[ab]\d+/i.test(gpu);
 return {low:software||oldIntel||weakCpu,discreteGpu};
}
const WORLD_HARDWARE=detectWorldHardware();
const WORLD_QUALITY_PROFILES={
 low:{lowEnd:true,generate:1,dispose:1,lightBudget:6,lightInterval:170,buildInterval:135,anisotropy:2},
 medium:{lowEnd:false,generate:1,dispose:2,lightBudget:10,lightInterval:125,buildInterval:90,anisotropy:4},
 high:{lowEnd:false,generate:2,dispose:3,lightBudget:14,lightInterval:100,buildInterval:65,anisotropy:8},
 ultra:{lowEnd:false,generate:2,dispose:3,lightBudget:18,lightInterval:80,buildInterval:50,anisotropy:16}
};
function readWorldQualityPreset(){
 try{const saved=localStorage.getItem("deepseeker-quality-v1");if(["auto","low","medium","high","ultra"].includes(saved))return saved;}catch{}
 if(QUALITY_PARAM==="low"||QUALITY_PARAM==="potato")return "low";
 return ["auto","medium","high","ultra"].includes(QUALITY_PARAM)?QUALITY_PARAM:"auto";
}
// Nearby ceiling fixtures stay electrically on around the player even when turned away.
const FIXTURE_LOCAL_ON_RADIUS=32;
let worldQualityPreset=readWorldQualityPreset(),LOW_END_DEVICE=false,R_GENERATE=2,R_DISPOSE=3,LIGHT_BUDGET=4,LIGHT_INTERVAL=100,CHUNK_BUILD_INTERVAL=65;
function configureWorldQuality(preset){
 worldQualityPreset=["auto","low","medium","high","ultra"].includes(preset)?preset:"auto";
 const effective=worldQualityPreset==="auto"?(WORLD_HARDWARE.low?"low":WORLD_HARDWARE.discreteGpu?"high":"medium"):worldQualityPreset;
 const profile=WORLD_QUALITY_PROFILES[effective]||WORLD_QUALITY_PROFILES.high;
 LOW_END_DEVICE=profile.lowEnd;R_GENERATE=profile.generate;R_DISPOSE=profile.dispose;
 LIGHT_BUDGET=profile.lightBudget;LIGHT_INTERVAL=profile.lightInterval;CHUNK_BUILD_INTERVAL=profile.buildInterval;
}
configureWorldQuality(worldQualityPreset);
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
    this.maxAnisotropy = anisotropy;
    this.chunks = new Map(); // "cx,cz" -> { data, group, wallBounds }
    this.root = new THREE.Group();
    this.lastStreamCX = null;
    this.lastStreamCZ = null;
    this.streamNeedsWork = true;
    this.lastChunkBuildAt = 0;
    this.wallQueryScratch = [];
    scene.add(this.root);

    const effectiveQuality=worldQualityPreset==="auto"?(LOW_END_DEVICE?"low":"high"):worldQualityPreset;
    const tex = createTextures(Math.min(anisotropy,WORLD_QUALITY_PROFILES[effectiveQuality]?.anisotropy||8));
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
      emissiveIntensity: 0.30,
      roughness: 0.28,
    });
    this.fixtureDimMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff4ca,
      emissive: 0xffe2a0,
      emissiveIntensity: 0.19,
      roughness: 0.30,
    });
    this.fixtureBlackMaterial = new THREE.MeshStandardMaterial({
      color: 0x10100e,
      roughness: 0.96,
    });
    // Muted, worn institutional hardware: painted steel, dull stainless trim,
    // and dark wired safety glass rather than glossy decorative sci-fi panels.
    const doorPaintCanvas=document.createElement("canvas");
    doorPaintCanvas.width=256;doorPaintCanvas.height=512;
    const doorPaintCtx=doorPaintCanvas.getContext("2d");
    doorPaintCtx.fillStyle="#85877b";
    doorPaintCtx.fillRect(0,0,256,512);
    const grime=doorPaintCtx.createLinearGradient(0,0,0,512);
    grime.addColorStop(0,"rgba(255,255,244,0.025)");
    grime.addColorStop(0.58,"rgba(35,37,31,0.035)");
    grime.addColorStop(1,"rgba(24,26,22,0.22)");
    doorPaintCtx.fillStyle=grime;doorPaintCtx.fillRect(0,0,256,512);
    for(let i=0;i<30;i++){
      const x=(i*73+17)%256;
      doorPaintCtx.fillStyle=i%3===0?"rgba(28,31,25,0.10)":"rgba(225,222,201,0.055)";
      doorPaintCtx.fillRect(x,(i*61)%390,1+(i%3),25+(i*19)%125);
    }
    for(let i=0;i<24;i++){
      const x=(i*47+9)%256,y=350+(i*29)%150;
      doorPaintCtx.strokeStyle=i%2===0?"rgba(30,31,27,0.18)":"rgba(223,218,197,0.13)";
      doorPaintCtx.lineWidth=1;
      doorPaintCtx.beginPath();doorPaintCtx.moveTo(x,y);doorPaintCtx.lineTo(x+3+(i%9),y-1-(i%5));doorPaintCtx.stroke();
    }
    const doorPaintTexture=new THREE.CanvasTexture(doorPaintCanvas);
    doorPaintTexture.colorSpace=THREE.SRGBColorSpace;
    this.roomDoorMaterial=new THREE.MeshStandardMaterial({map:doorPaintTexture,roughness:0.96,metalness:0.03});
    this.roomDoorTrimMaterial=new THREE.MeshStandardMaterial({color:0x484b43,roughness:0.9,metalness:0.08});
    this.roomDoorMetalMaterial=new THREE.MeshStandardMaterial({color:0x77786f,roughness:0.68,metalness:0.34});
    this.roomDoorGlassMaterial=new THREE.MeshStandardMaterial({color:0x27312f,roughness:0.3,metalness:0.05});
    const signCanvas=document.createElement("canvas");
    signCanvas.width=256;signCanvas.height=96;
    const signCtx=signCanvas.getContext("2d");
    signCtx.fillStyle="#603a32";signCtx.fillRect(0,0,256,96);
    signCtx.strokeStyle="#c8c0ac";signCtx.lineWidth=4;signCtx.strokeRect(5,5,246,86);
    signCtx.fillStyle="#e4deca";signCtx.font="bold 35px Arial, sans-serif";
    signCtx.textAlign="center";signCtx.textBaseline="middle";signCtx.fillText("SERVICE",128,49);
    const signTexture=new THREE.CanvasTexture(signCanvas);
    signTexture.colorSpace=THREE.SRGBColorSpace;
    this.roomDoorSignMaterial=new THREE.MeshStandardMaterial({map:signTexture,roughness:0.88,metalness:0.02,side:THREE.DoubleSide});
    this.breakerRoomLightMaterial=new THREE.MeshStandardMaterial({
      color:0x353328,emissive:0x000000,emissiveIntensity:0,roughness:0.4
    });
    this.breakerRoomLights=[];
    this.roomDoors=[];
    this.breakerSwitches=[];
    this.breakerProgress=0;
    this.breakerSequence=BREAKER_MATH_PROBLEMS.slice().sort((a,b)=>a.answer-b.answer).map(problem=>problem.index);
    this.breakerFailTimer=0;
    this.maintenanceDoor=null;
    this.maintenancePuzzleType="breakers";
    this.maintenancePuzzleSeed=1;
    this.maintenanceEntryDoor=null;
    this.breakerRoomDoor=null;
    this.breakerRoomGroup=null;
    this.breakerRoomBounds=[];
    this.maintenanceRoomGroup=null;

    const breakerCanvas=document.createElement("canvas");
    breakerCanvas.width=512;breakerCanvas.height=192;
    const breakerCtx=breakerCanvas.getContext("2d");
    breakerCtx.fillStyle="#20261e";breakerCtx.fillRect(0,0,512,192);
    breakerCtx.strokeStyle="#c3b891";breakerCtx.lineWidth=5;breakerCtx.strokeRect(8,8,496,176);
    breakerCtx.fillStyle="#d6d0b8";breakerCtx.textAlign="center";breakerCtx.textBaseline="middle";
    breakerCtx.font="bold 29px Arial, sans-serif";breakerCtx.fillText("SOLVE EACH EQUATION",256,58);
    breakerCtx.font="bold 25px Arial, sans-serif";breakerCtx.fillText("LOWEST ANSWER TO HIGHEST",256,126);
    const breakerTexture=new THREE.CanvasTexture(breakerCanvas);
    breakerTexture.colorSpace=THREE.SRGBColorSpace;
    this.breakerNoteMaterial=new THREE.MeshBasicMaterial({map:breakerTexture,side:THREE.DoubleSide,toneMapped:false});
    this.breakerPanelMaterial=new THREE.MeshStandardMaterial({color:0x35372f,roughness:0.83,metalness:0.08});
    this.breakerHandleMaterial=new THREE.MeshStandardMaterial({color:0x97988a,roughness:0.7,metalness:0.25});
    this.breakerLampOffMaterial=new THREE.MeshStandardMaterial({color:0x4d2822,emissive:0x40100a,emissiveIntensity:0.35});
    this.breakerLampOnMaterial=new THREE.MeshStandardMaterial({color:0x9bd78b,emissive:0x42ff40,emissiveIntensity:1.15});
    this.breakerMathLabelMaterials=[];
    for(const problem of BREAKER_MATH_PROBLEMS){
      const canvas=document.createElement("canvas");canvas.width=256;canvas.height=128;
      const ctx=canvas.getContext("2d");ctx.fillStyle="#1e231c";ctx.fillRect(0,0,256,128);
      ctx.strokeStyle="#8c9277";ctx.lineWidth=4;ctx.strokeRect(5,5,246,118);
      ctx.fillStyle="#e1dec7";ctx.font="bold 34px Arial, sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText(problem.expression,128,64);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      this.breakerMathLabelMaterials.push(new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false}));
    }
    // Ceiling fixtures use a tiny real-light budget. They only activate when
    // the player's camera is actually looking toward them.
    this.fixtureLights = [];
    this.wallOccluders = [];
    this.fixtureLightLastUpdate = 0;
    this.fixtureLightCamera = null;
    this.fixtureLightFrustum = new THREE.Frustum();
    this.fixtureLightProjectionView = new THREE.Matrix4();
    this.fixtureLightSphere = new THREE.Sphere(new THREE.Vector3(),1.8);
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
    const minX=MAP_MIN_CHUNK*CHUNK_SIZE;
    const maxX=(MAP_MAX_CHUNK+1)*CHUNK_SIZE;
    const minZ=MAP_MIN_CHUNK*CHUNK_SIZE;
    const maxZ=(MAP_MAX_CHUNK+1)*CHUNK_SIZE;
    const thickness=1.2,height=WALL_H+4;
    const width=maxX-minX,depth=maxZ-minZ;
    const midX=(minX+maxX)*.5,midZ=(minZ+maxZ)*.5;
    const doorCenterX=(OUTER_ROOM_DOOR.cx*CHUNK_CELLS+OUTER_ROOM_DOOR.localX)*CELL;

    const addWall=(name,geometry,x,z,bounds,horizontal)=>{
      const length=horizontal?geometry.parameters.width:geometry.parameters.depth;
      if(horizontal){
        scaleFaceU(geometry,4,length/CELL);scaleFaceU(geometry,5,length/CELL);
        scaleFaceU(geometry,0,thickness/CELL);scaleFaceU(geometry,1,thickness/CELL);
      }else{
        scaleFaceU(geometry,0,length/CELL);scaleFaceU(geometry,1,length/CELL);
        scaleFaceU(geometry,4,thickness/CELL);scaleFaceU(geometry,5,thickness/CELL);
      }
      const mesh=new THREE.Mesh(geometry,this.boundaryMaterial);
      mesh.name=name;mesh.position.set(x,height*0.5,z);
      mesh.castShadow=false;mesh.receiveShadow=false;mesh.userData.fixtureLightOccluder=true;
      this.boundaryGroup.add(mesh);this.wallOccluders.push(mesh);this.boundaryWallBounds.push(bounds);
    };

    // Only the north wall has a real doorway; the former openings are now just one doorway.
    const halfOpening=ROOM_DOOR_WIDTH*0.5+0.16;
    const openingLeft=doorCenterX-halfOpening,openingRight=doorCenterX+halfOpening;
    const wallMinX=minX-thickness,wallMaxX=maxX+thickness;
    const addNorthSegment=(name,x1,x2)=>{
      if(x2<=x1)throw new Error("Invalid maintenance room opening segment");
      addWall(name,new THREE.BoxGeometry(x2-x1,height,thickness),(x1+x2)*.5,
        minZ+thickness*.5,
        {minX:x1,maxX:x2,minZ,maxZ:minZ+thickness},true);
    };
    addNorthSegment("BoundaryNorthWest",wallMinX,openingLeft);
    addNorthSegment("BoundaryNorthEast",openingRight,wallMaxX);
    const lintelTop=new THREE.Mesh(
      new THREE.BoxGeometry(openingRight-openingLeft,height-ROOM_DOOR_HEIGHT,thickness),
      this.boundaryMaterial
    );
    lintelTop.name="BoundaryNorthMaintenanceLintel";
    lintelTop.position.set(doorCenterX,(height+ROOM_DOOR_HEIGHT)*.5,minZ+thickness*.5);
    lintelTop.castShadow=false;lintelTop.receiveShadow=false;lintelTop.userData.fixtureLightOccluder=true;
    this.boundaryGroup.add(lintelTop);this.wallOccluders.push(lintelTop);

    addWall("BoundarySouth",new THREE.BoxGeometry(width+2*thickness,height,thickness),
      midX,maxZ-thickness*.5,
      {minX:minX-thickness,maxX:maxX+thickness,minZ:maxZ-thickness,maxZ},true);
    addWall("BoundaryWest",new THREE.BoxGeometry(thickness,height,depth+2*thickness),
      minX+thickness*.5,midZ,
      {minX,minZ:minZ-thickness,maxX:minX+thickness,maxZ:maxZ+thickness},false);
    addWall("BoundaryEast",new THREE.BoxGeometry(thickness,height,depth+2*thickness),
      maxX-thickness*.5,midZ,
      {minX:maxX-thickness,maxX,minZ:minZ-thickness,maxZ:maxZ+thickness},false);

    this.buildOuterMaintenanceRoom(doorCenterX,minZ,thickness);
  }

  buildOuterMaintenanceRoom(centerX,minZ,boundaryThickness){
    const roomWidth=32,roomDepth=60,roomHeight=4.25,wallT=ROOM_WALL_THICKNESS;
    const frontZ=minZ+boundaryThickness,backZ=frontZ-roomDepth,centerZ=(backZ+frontZ)*.5;
    this.maintenanceRoomFrontZ=frontZ;this.maintenanceRoomBackZ=backZ;
    this.maintenanceRoomCenterX=centerX;this.maintenanceRoomWidth=roomWidth;
    this.maintenanceRoomDepth=roomDepth;this.maintenanceRoomCenterZ=centerZ;
    const room=this.maintenanceRoomGroup=new THREE.Group();
    room.name="OuterMaintenanceRoom";this.boundaryGroup.add(room);
    const addBox=(name,sx,sy,sz,x,y,z,material,host=room)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);
      mesh.name=name;mesh.position.set(x,y,z);mesh.castShadow=false;mesh.receiveShadow=true;
      mesh.userData.fixtureLightOccluder=true;host.add(mesh);return mesh;
    };
    addBox("MaintenanceRoomFloor",roomWidth-.08,.07,roomDepth-.05,centerX,-.025,centerZ,this.materials.floor);
    addBox("MaintenanceRoomLeftWall",wallT,roomHeight,roomDepth,centerX-roomWidth*.5,roomHeight*.5,centerZ,this.materials.wall);
    addBox("MaintenanceRoomRightWall",wallT,roomHeight,roomDepth,centerX+roomWidth*.5,roomHeight*.5,centerZ,this.materials.wall);
    addBox("MaintenanceRoomCeiling",roomWidth,.13,roomDepth-.18,centerX,roomHeight,centerZ,this.materials.ceiling);
    const leftEdge=centerX-roomWidth*.5,rightEdge=centerX+roomWidth*.5;
    this.boundaryWallBounds.push(
      {minX:leftEdge-wallT*.5,maxX:leftEdge+wallT*.5,minZ:backZ,maxZ:frontZ},
      {minX:rightEdge-wallT*.5,maxX:rightEdge+wallT*.5,minZ:backZ,maxZ:frontZ}
    );

    this.maintenanceEntryDoor=this.buildRoomDoor(room,centerX,frontZ,{
      doorHeight:ROOM_DOOR_HEIGHT,roomHeight,requiresPower:false,ownerChunk:null
    },this.boundaryWallBounds);
    const doorLeft=centerX-ROOM_DOOR_WIDTH*.5,doorRight=centerX+ROOM_DOOR_WIDTH*.5;
    addBox("MaintenanceRoomBackWallLeft",doorLeft-leftEdge,roomHeight,wallT,(leftEdge+doorLeft)*.5,roomHeight*.5,backZ,this.materials.wall);
    addBox("MaintenanceRoomBackWallRight",rightEdge-doorRight,roomHeight,wallT,(doorRight+rightEdge)*.5,roomHeight*.5,backZ,this.materials.wall);
    addBox("MaintenanceRoomBackDoorLintel",ROOM_DOOR_WIDTH,roomHeight-ROOM_DOOR_HEIGHT,wallT,
      centerX,(roomHeight+ROOM_DOOR_HEIGHT)*.5,backZ,this.materials.wall);
    this.boundaryWallBounds.push(
      {minX:leftEdge,maxX:doorLeft,minZ:backZ-wallT*.5,maxZ:backZ+wallT*.5},
      {minX:doorRight,maxX:rightEdge,minZ:backZ-wallT*.5,maxZ:backZ+wallT*.5}
    );
    this.maintenanceDoor=this.buildRoomDoor(room,centerX,backZ,{
      doorHeight:ROOM_DOOR_HEIGHT,roomHeight,requiresPower:true,ownerChunk:null
    },this.boundaryWallBounds);

    this.breakerRoomGroup=new THREE.Group();this.breakerRoomGroup.name="BreakerControlRoom";
    this.breakerRoomGroup.visible=this.maintenancePuzzleType==="breakers";room.add(this.breakerRoomGroup);
    this.buildBreakerControlRoom(centerX,backZ);
    if(this.maintenancePuzzleType==="breakers")this.boundaryWallBounds.push(...this.breakerRoomBounds);

  }

  buildBreakerControlRoom(centerX,backZ){
    this.breakerRoomBounds=[];this.breakerSwitches=[];this.breakerRoomLights=[];
    const group=this.breakerRoomGroup,wallT=.22,roomHeight=3.95,roomWidth=26.4,half=roomWidth*.5;
    const leftX=centerX-half,rightX=centerX+half,partitionZ=this.maintenanceRoomFrontZ-35.5;
    const depth=partitionZ-backZ,midZ=(partitionZ+backZ)*.5;
    const addBox=(name,sx,sy,sz,x,y,z,material)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);
      mesh.name=name;mesh.position.set(x,y,z);mesh.castShadow=false;mesh.receiveShadow=true;
      mesh.userData.fixtureLightOccluder=true;group.add(mesh);return mesh;
    };
    const addWall=(name,sx,sy,sz,x,y,z)=>{
      addBox(name,sx,sy,sz,x,y,z,this.materials.wall);
      this.breakerRoomBounds.push({minX:x-sx*.5,maxX:x+sx*.5,minZ:z-sz*.5,maxZ:z+sz*.5});
    };
    addWall("BreakerRoomLeftWall",wallT,roomHeight,depth,leftX,roomHeight*.5,midZ);
    addWall("BreakerRoomRightWall",wallT,roomHeight,depth,rightX,roomHeight*.5,midZ);
    const doorLeft=centerX-ROOM_DOOR_WIDTH*.5,doorRight=centerX+ROOM_DOOR_WIDTH*.5;
    addWall("BreakerRoomEntryPartitionLeft",doorLeft-leftX,roomHeight,wallT,(leftX+doorLeft)*.5,roomHeight*.5,partitionZ);
    addWall("BreakerRoomEntryPartitionRight",rightX-doorRight,roomHeight,wallT,(doorRight+rightX)*.5,roomHeight*.5,partitionZ);
    addBox("BreakerRoomEntryLintel",ROOM_DOOR_WIDTH,roomHeight-ROOM_DOOR_HEIGHT,wallT,
      centerX,(roomHeight+ROOM_DOOR_HEIGHT)*.5,partitionZ,this.materials.wall);
    this.breakerRoomDoor=this.buildRoomDoor(group,centerX,partitionZ,{
      doorHeight:ROOM_DOOR_HEIGHT,roomHeight,requiresPower:false,ownerChunk:null
    },this.breakerRoomBounds);

    addBox("BreakerRoomCeiling",roomWidth,.10,depth-.15,centerX,3.82,midZ,this.materials.ceiling);
    for(let rib=0;rib<5;rib++){
      const z=partitionZ-2.2-rib*((depth-4.4)/4);
      const fixtureZ=z+.72;
      addBox("BreakerRoomCeilingCrossbrace",roomWidth-.35,.10,.12,centerX,3.68,z,this.roomDoorMetalMaterial);
      addBox("BreakerRoomFluorescentStrip",3.8,.06,.18,centerX,3.59,fixtureZ,this.breakerRoomLightMaterial);

      // Keep the fluorescent strips across the ceiling, but use only four
      // real point lights for the whole room. Ten overlapping point lights
      // made every visible material expensive to shade on lower-end GPUs.
      // Two lights on each of two rows still reach both breaker walls.
      if(rib===0||rib===3){
        for(const side of [-1,1]){
          const light=new THREE.PointLight(0xffe7ad,0,26,1.45);
          light.name="BreakerRoomOverheadLight";
          light.position.set(centerX+side*6.35,3.35,fixtureZ);
          light.visible=false;
          light.castShadow=false;
          group.add(light);
          this.breakerRoomLights.push({
            light,
            baseIntensity:10,
            phase:rib*.83+(side>0?.45:0)
          });
        }
      }
    }
    const boardZ=backZ+.24;
    addBox("BreakerMathInstructionBoard",5.9,.70,.14,centerX,3.50,boardZ,this.breakerPanelMaterial);
    const instruction=new THREE.Mesh(new THREE.PlaneGeometry(5.58,.50),this.breakerNoteMaterial);
    instruction.name="BreakerMathInstructions";instruction.position.set(centerX,3.50,backZ+.315);
    instruction.castShadow=false;group.add(instruction);

    const zStart=partitionZ-3.6,zSpacing=5.3;
    const leftFaceX=leftX+wallT*.5+.11,rightFaceX=rightX-wallT*.5-.11,positions=[];
    for(let row=0;row<4;row++){
      positions.push({index:row+1,x:leftFaceX,z:zStart-row*zSpacing,face:Math.PI*.5});
      positions.push({index:row+5,x:rightFaceX,z:zStart-row*zSpacing,face:-Math.PI*.5});
    }
    for(const spec of positions){
      const root=new THREE.Group();root.name="MaintenanceBreaker"+spec.index;
      root.position.set(spec.x,0,spec.z);root.rotation.y=spec.face;group.add(root);
      const panel=new THREE.Mesh(new THREE.BoxGeometry(.94,1.32,.20),this.breakerPanelMaterial);
      panel.name="BreakerPanelHousing";panel.position.set(0,1.02,0);root.add(panel);
      const label=new THREE.Mesh(new THREE.PlaneGeometry(.86,.30),this.breakerMathLabelMaterials[spec.index-1]);
      label.name="BreakerMathExpression";label.position.set(0,1.43,.112);root.add(label);
      const handle=new THREE.Mesh(new THREE.BoxGeometry(.12,.36,.09),this.breakerHandleMaterial);
      handle.name="BreakerLever";handle.position.set(0,.91,.16);handle.rotation.z=.42;root.add(handle);
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(.085,10,8),this.breakerLampOffMaterial);
      lamp.name="BreakerStatusLamp";lamp.position.set(0,1.64,.11);root.add(lamp);
      const state={...spec,group:root,handle,lamp,ownerChunk:null,active:false};
      root.userData.interactable={type:"roomBreaker",prompt:"Flip breaker "+spec.index+" after solving its equation",breakerIndex:spec.index,breakerState:state};
      this.breakerSwitches.push(state);
    }
  }


  buildRoomDoor(parent,centerX,frontZ,options={},boundsTarget=null){
    const doorWidth=ROOM_DOOR_WIDTH,doorHeight=options.doorHeight||ROOM_DOOR_HEIGHT;
    const frameMat=this.roomDoorTrimMaterial,metalMat=this.roomDoorMetalMaterial;
    const addBox=(name,sx,sy,sz,x,y,z,material,host=parent)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);
      mesh.name=name;mesh.position.set(x,y,z);mesh.castShadow=false;mesh.receiveShadow=true;host.add(mesh);return mesh;
    };
    addBox("RoomDoorFrameLeft",.12,doorHeight,.28,centerX-doorWidth*.5-.06,doorHeight*.5,frontZ,frameMat);
    addBox("RoomDoorFrameRight",.12,doorHeight,.28,centerX+doorWidth*.5+.06,doorHeight*.5,frontZ,frameMat);
    addBox("RoomDoorFrameTop",doorWidth+.16,.12,.28,centerX,doorHeight+.06,frontZ,frameMat);

    const pivot=new THREE.Group();pivot.name=options.requiresPower?"MaintenanceRoomDoor":"ProceduralRoomDoor";
    pivot.position.set(centerX-doorWidth*.5,0,frontZ);parent.add(pivot);
    addBox("RoomDoorPanel",doorWidth-.07,doorHeight-.06,.13,doorWidth*.5,doorHeight*.5,0,this.roomDoorMaterial,pivot);
    addBox("RoomDoorVisionGlass",.36,.47,.025,doorWidth*.5,doorHeight*.72,.079,this.roomDoorGlassMaterial,pivot);
    addBox("RoomDoorVisionFrameTop",.44,.045,.035,doorWidth*.5,doorHeight*.72+.255,.088,metalMat,pivot);
    addBox("RoomDoorVisionFrameBottom",.44,.045,.035,doorWidth*.5,doorHeight*.72-.255,.088,metalMat,pivot);
    addBox("RoomDoorHandle",.24,.055,.06,doorWidth*.73,doorHeight*.48,.10,metalMat,pivot);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(.64,.17),this.roomDoorSignMaterial);
    sign.name="RoomDoorServicePlate";sign.position.set(doorWidth*.5,doorHeight*.9,.071);pivot.add(sign);

    const bounds={minX:centerX-doorWidth*.5,maxX:centerX+doorWidth*.5,minZ:frontZ-.10,maxZ:frontZ+.10};
    const state={
      group:pivot,ownerChunk:options.ownerChunk||null,centerX,frontZ,doorZ:frontZ,face:1,doorWidth,doorHeight,
      requiresPower:Boolean(options.requiresPower),unlocked:!options.requiresPower,targetOpen:false,openProgress:0,
      rotationSign:1,collisionBounds:bounds,closedCollisionBounds:{...bounds},
      toggle(){
        if(this.requiresPower&&!this.unlocked)return false;
        this.targetOpen=!this.targetOpen;return true;
      }
    };
    const interactable={
      type:"roomDoor",
      prompt:state.requiresPower&&!state.unlocked?"Door has no power":"Open door",
      doorState:state,toggle:()=>state.toggle(),isOpen:()=>state.openProgress>.82
    };
    state.interactable=interactable;pivot.userData.interactable=interactable;
    if(boundsTarget)boundsTarget.push(bounds);
    this.roomDoors.push(state);
    return state;
  }

  buildProceduralRoom(group,room,cx,cz){
    const left=(cx*CHUNK_CELLS+room.x0)*CELL;
    const back=(cz*CHUNK_CELLS+room.z0)*CELL;
    const width=room.w*CELL,depth=room.h*CELL;
    const right=left+width,front=back+depth;
    const centerX=(left+right)*.5,centerZ=(back+front)*.5;
    const wallT=ROOM_WALL_THICKNESS;
    const roomHeight=ROOM_HEIGHT;
    const bounds=group.userData.roomWallBounds;
    const addBox=(name,sx,sy,sz,x,y,z,material)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);
      mesh.name=name;mesh.position.set(x,y,z);mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);return mesh;
    };
    const addBound=(minX,maxX,minZ,maxZ)=>bounds.push({minX,maxX,minZ,maxZ});
    const floor=new THREE.Mesh(new THREE.BoxGeometry(width-.15,.065,depth-.15),this.materials.floor);
    floor.name="ServiceRoomFloor";
    floor.position.set(centerX,-.02,centerZ);group.add(floor);
    addBox("RoomBackWall",width,roomHeight,wallT,centerX,roomHeight*.5,back,this.materials.wall);
    addBound(left,right,back-wallT*.5,back+wallT*.5);

    if(room.kind==="door"){
      addBox("RoomLeftWall",wallT,roomHeight,depth,left,roomHeight*.5,centerZ,this.materials.wall);
      addBox("RoomRightWall",wallT,roomHeight,depth,right,roomHeight*.5,centerZ,this.materials.wall);
      addBound(left-wallT*.5,left+wallT*.5,back,front);
      addBound(right-wallT*.5,right+wallT*.5,back,front);
      const doorLeft=centerX-ROOM_DOOR_WIDTH*.5,doorRight=centerX+ROOM_DOOR_WIDTH*.5;
      const leftWidth=doorLeft-left,rightWidth=right-doorRight;
      if(leftWidth>.1){
        addBox("RoomFrontWallLeft",leftWidth,roomHeight,wallT,(left+doorLeft)*.5,roomHeight*.5,front,this.materials.wall);
        addBound(left,doorLeft,front-wallT*.5,front+wallT*.5);
      }
      if(rightWidth>.1){
        addBox("RoomFrontWallRight",rightWidth,roomHeight,wallT,(doorRight+right)*.5,roomHeight*.5,front,this.materials.wall);
        addBound(doorRight,right,front-wallT*.5,front+wallT*.5);
      }
      addBox("RoomFrontLintel",ROOM_DOOR_WIDTH,roomHeight-ROOM_DOOR_HEIGHT,wallT,
        centerX,(roomHeight+ROOM_DOOR_HEIGHT)*.5,front,this.materials.wall);
      const roof=new THREE.Mesh(new THREE.BoxGeometry(width,.12,depth),this.materials.ceiling);
      roof.name="RoomCeiling";roof.position.set(centerX,roomHeight,centerZ);group.add(roof);
      this.buildRoomDoor(group,centerX,front,{
        doorHeight:ROOM_DOOR_HEIGHT,roomHeight,ownerChunk:group
      },bounds).ownerChunk=group;
    }
  }

  buildMaintenanceBreakers(roomGroup,centerX,backZ){
    const switchZ=backZ+ROOM_WALL_THICKNESS*.5+.09;
    const positions=[
      {index:1,x:centerX-2.65,z:switchZ},
      {index:2,x:centerX,z:switchZ},
      {index:3,x:centerX+2.65,z:switchZ}
    ];
    roomGroup.userData.breakerSwitches=[];
    for(const spec of positions){
      const root=new THREE.Group();root.name="MaintenanceBreaker"+spec.index;
      root.visible=this.maintenancePuzzleType==="breakers";
      root.position.set(spec.x,0,spec.z);roomGroup.add(root);
      const panel=new THREE.Mesh(new THREE.BoxGeometry(.78,1.18,.18),this.breakerPanelMaterial);
      panel.name="BreakerPanelHousing";panel.position.set(0,1.02,0);root.add(panel);
      const label=new THREE.Mesh(new THREE.PlaneGeometry(.34,.17),this.breakerNumberMaterials[spec.index-1]);
      label.position.set(0,1.36,.096);root.add(label);
      const handle=new THREE.Mesh(new THREE.BoxGeometry(.10,.32,.08),this.breakerHandleMaterial);
      handle.name="BreakerLever";handle.position.set(0,.98,.15);handle.rotation.z=.42;root.add(handle);
      const active=this.maintenanceDoor?.unlocked || this.breakerSequence.slice(0,this.breakerProgress).includes(spec.index);
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(.075,10,8),active?this.breakerLampOnMaterial:this.breakerLampOffMaterial);
      lamp.name="BreakerStatusLamp";lamp.position.set(0,1.52,.11);root.add(lamp);
      if(active)handle.rotation.z=-.42;
      if(spec.index===3){
        const board=new THREE.Mesh(new THREE.BoxGeometry(1.85,.76,.10),this.breakerPanelMaterial);
        board.name="BreakerResetNoteBoard";board.position.set(0,2.02,.015);root.add(board);
        const note=new THREE.Mesh(new THREE.PlaneGeometry(1.70,.63),this.breakerNoteMaterial);
        note.name="BreakerResetSequence";note.position.set(0,2.02,.073);root.add(note);
      }
      const state={...spec,group:root,handle,lamp,ownerChunk:null,active};
      root.userData.interactable={
        type:"roomBreaker",prompt:"Flip breaker "+spec.index,
        breakerIndex:spec.index,breakerState:state
      };
      roomGroup.userData.breakerSwitches.push(state);
    }
  }

  setMaintenancePuzzleType(_type,seed=1){
    this.maintenancePuzzleType="breakers";
    this.maintenancePuzzleSeed=(Number(seed)>>>0);
    this.breakerProgress=0;
    this.breakerFailTimer=0;
    for(const door of this.roomDoors){
      if(!door)continue;
      door.targetOpen=false;door.openProgress=0;
      if(door.group)door.group.rotation.y=0;
      if(door.closedCollisionBounds)Object.assign(door.collisionBounds,door.closedCollisionBounds);
    }
    if(this.maintenanceDoor)this.maintenanceDoor.unlocked=false;
    for(const bound of this.breakerRoomBounds){
      const index=this.boundaryWallBounds.indexOf(bound);
      if(index>=0)this.boundaryWallBounds.splice(index,1);
    }
    this.boundaryWallBounds.push(...this.breakerRoomBounds);
    if(this.breakerRoomGroup)this.breakerRoomGroup.visible=true;
    for(const item of this.breakerSwitches){
      if(!item?.group)continue;
      item.group.visible=true;item.active=false;
      item.handle.rotation.z=.42;item.lamp.material=this.breakerLampOffMaterial;
    }
  }

  restoreMaintenancePuzzleState(state={}){
    if(state.unlocked){
      this.completeMaintenancePuzzle(this.maintenancePuzzleType);
      return;
    }
    this.breakerProgress=this.maintenancePuzzleType==="breakers"
      ?THREE.MathUtils.clamp(Math.floor(Number(state.breakerProgress)||0),0,this.breakerSequence.length)
      :0;
    for(const item of this.breakerSwitches){
      const active=this.breakerProgress>0&&this.breakerSequence.slice(0,this.breakerProgress).includes(item.index);
      item.active=active;
      item.handle.rotation.z=active?-.42:.42;
      item.lamp.material=active?this.breakerLampOnMaterial:this.breakerLampOffMaterial;
      item.group.visible=this.maintenancePuzzleType==="breakers";
    }
  }

  completeMaintenancePuzzle(type=this.maintenancePuzzleType){
    if(type!==this.maintenancePuzzleType||!this.maintenanceDoor)return false;
    this.maintenanceDoor.unlocked=true;this.maintenanceDoor.targetOpen=true;
    if(type==="breakers"){
      this.breakerProgress=this.breakerSequence.length;
      for(const item of this.breakerSwitches){item.active=true;item.handle.rotation.z=-.42;item.lamp.material=this.breakerLampOnMaterial;}
    }
    if(this.maintenanceDoor.interactable)this.maintenanceDoor.interactable.prompt="Open door";
    return true;
  }

  activateBreaker(index){
    if(this.maintenancePuzzleType!=="breakers")return {correct:false,complete:false,wrongPuzzle:true};
    if(!this.maintenanceDoor)return {correct:false,complete:false,missingDoor:true};
    if(this.maintenanceDoor.unlocked)return {correct:true,complete:true,alreadyPowered:true};
    const switchState=this.breakerSwitches.find(item=>item.index===index);
    if(!switchState)return {correct:false,complete:false,missingSwitch:true};
    if(index!==this.breakerSequence[this.breakerProgress]){
      this.breakerProgress=0;this.breakerFailTimer=1.8;
      for(const item of this.breakerSwitches){
        item.active=false;item.handle.rotation.z=.42;item.lamp.material=this.breakerLampOffMaterial;
      }
      return {correct:false,complete:false,progress:0};
    }
    this.breakerProgress++;
    switchState.active=true;switchState.handle.rotation.z=-.42;
    switchState.lamp.material=this.breakerLampOnMaterial;
    if(this.breakerProgress>=this.breakerSequence.length){
      this.breakerProgress=this.breakerSequence.length;
      this.completeMaintenancePuzzle("breakers");
      return {correct:true,complete:true,progress:this.breakerProgress};
    }
    return {correct:true,complete:false,progress:this.breakerProgress};
  }

  // -- chunk lifecycle -------------------------------------------------------

  spawnChunk(cx, cz) {
    const data=generateChunk(cx,cz,this.seed);
    const group=this.buildChunkMeshes(data,cx,cz);
    const wallBounds=data.walls.map(w=>{
      if(w.horiz){
        const minX=w.x*CELL,maxX=(w.x+w.len)*CELL;
        const midZ=(w.z+.5)*CELL,halfT=WALL_T*.5;
        return {minX,maxX,minZ:midZ-halfT,maxZ:midZ+halfT};
      }
      const midX=(w.x+.5)*CELL,halfT=WALL_T*.5;
      const minZ=w.z*CELL,maxZ=(w.z+w.len)*CELL;
      return {minX:midX-halfT,maxX:midX+halfT,minZ,maxZ};
    });
    wallBounds.push(...(group.userData.roomWallBounds||[]));
    for(const state of (group.userData.roomDoorStates||[])){
      state.ownerChunk=group;
      wallBounds.push(state.collisionBounds);
    }
    this.breakerSwitches.push(...(group.userData.breakerSwitches||[]));
    this.root.add(group);
    this.chunks.set(cellKey(cx,cz),{data,group,wallBounds});
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
    this.roomDoors=this.roomDoors.filter(door=>door.ownerChunk!==entry.group);
    this.breakerSwitches=this.breakerSwitches.filter(item=>item.ownerChunk!==entry.group);
    this.chunks.delete(key);
  }

  setQualityPreset(preset){
    configureWorldQuality(preset);this.streamNeedsWork=true;this.lastChunkBuildAt=0;
    const effective=worldQualityPreset==="auto"?(LOW_END_DEVICE?"low":"high"):worldQualityPreset;
    const anisotropy=Math.min(this.maxAnisotropy,WORLD_QUALITY_PROFILES[effective]?.anisotropy||8);
    for(const material of Object.values(this.materials)){const map=material?.map;if(map){map.anisotropy=anisotropy;map.needsUpdate=true;}}
  }

  // Called every frame with the player position.
  updateFixtureLights(px,pz){
    const now=performance.now();
    const interval=LIGHT_INTERVAL;

    if(now-this.fixtureLightLastUpdate<interval) return;
    this.fixtureLightLastUpdate=now;

    this.fixtureLights=this.fixtureLights.filter(item=>
      item.light.parent && this.root.children.includes(item.light.parent)
    );
    this.wallOccluders=this.wallOccluders.filter(mesh=>
      mesh.parent && this.root.children.includes(mesh.parent)
    );

    const flickerTime=now*.003;
    const lightBudget=LIGHT_BUDGET;
    const camera=this.fixtureLightCamera;
    if(camera){
      camera.updateMatrixWorld(true);
      this.fixtureLightProjectionView.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      this.fixtureLightFrustum.setFromProjectionMatrix(this.fixtureLightProjectionView);
      camera.getWorldPosition(this.fixtureLightViewOrigin);
    }
    const nearestLights=this.fixtureLights
      .map(item=>({
        item,
        distanceSq:(item.x-px)*(item.x-px)+(item.z-pz)*(item.z-pz)
      }))
      .filter(entry=>{
        // Increase the activation range and only spend real-light budget on
        // fixtures actually in the camera's view, not lamps behind the player.
        const range=entry.item.light.distance||48;
        if(entry.distanceSq>range*range) return false;
        // Within this local radius, keep the fixture illuminated regardless of
        // camera direction. Farther fixtures can still turn on when in view.
        if(!camera || entry.distanceSq<=FIXTURE_LOCAL_ON_RADIUS*FIXTURE_LOCAL_ON_RADIUS) return true;
        entry.item.light.getWorldPosition(this.fixtureLightTarget);
        this.fixtureLightSphere.center.copy(this.fixtureLightTarget);
        return this.fixtureLightFrustum.intersectsSphere(this.fixtureLightSphere);
      })
      .sort((a,b)=>a.distanceSq-b.distanceSq)
      .slice(0,lightBudget);
    const activeLights=new Set(nearestLights.map(entry=>entry.item));

    for(const item of this.fixtureLights){
      const active=activeLights.has(item)&&this.breakerFailTimer<=0;
      item.light.visible=active;
      if(!active){
        item.light.intensity=0;
        continue;
      }
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

    // Chunk meshes require CPU-side geometry creation and merging. Space builds
    // apart so streaming cannot produce a burst of expensive work in adjacent frames.
    const now=performance.now();
    const buildInterval=CHUNK_BUILD_INTERVAL;
    if(this.lastChunkBuildAt && now-this.lastChunkBuildAt<buildInterval) return;

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
    let built=0;
    for (const [cx, cz] of missing) {
      if(built>=1) break;
      this.spawnChunk(cx, cz);
      built++;
    }
    if(built) this.lastChunkBuildAt=performance.now();

    this.streamNeedsWork=missing.length>built;

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

  updateRoomDoors(dt){
    this.breakerFailTimer=Math.max(0,this.breakerFailTimer-dt);
    const breakerRoomLightsOn=Boolean(
      this.breakerRoomDoor &&
      this.breakerRoomDoor.openProgress>.05 &&
      this.breakerFailTimer<=0
    );
    // The fluorescent strips are dark when the door is shut. Opening it wakes
    // the fixtures and their actual light sources together.
    this.breakerRoomLightMaterial.color.setHex(
      breakerRoomLightsOn?0xffe8b5:0x353328
    );
    this.breakerRoomLightMaterial.emissive.setHex(
      breakerRoomLightsOn?0xffd98d:0x000000
    );
    this.breakerRoomLightMaterial.emissiveIntensity=breakerRoomLightsOn?1.65:0;
    const lightFlickerTime=performance.now()*.004;
    for(const item of this.breakerRoomLights){
      item.light.visible=breakerRoomLightsOn;
      item.light.intensity=breakerRoomLightsOn
        ? item.baseIntensity*(.97+.03*Math.sin(lightFlickerTime+item.phase))
        : 0;
    }
    for(const door of this.roomDoors){
      if(!door.group?.parent)continue;
      const direction=door.targetOpen?1:-1;
      door.openProgress=THREE.MathUtils.clamp(door.openProgress+direction*dt*2.6,0,1);
      door.group.rotation.y=door.openProgress*Math.PI*.49*door.rotationSign;
      if(door.openProgress>.82){
        Object.assign(door.collisionBounds,{minX:1e9,maxX:1e9+1,minZ:1e9,maxZ:1e9+1});
      }else{
        Object.assign(door.collisionBounds,door.closedCollisionBounds);
      }
      if(door.interactable){
        door.interactable.prompt=door.requiresPower&&!door.unlocked
          ?"Solve the breaker equations"
          :door===this.breakerRoomDoor
            ?(door.targetOpen?"Close breaker room":"Enter breaker room")
            :(door.targetOpen?"Close door":"Open door");
      }
    }
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

    group.userData.roomWallBounds=[];
    group.userData.roomDoorStates=[];
    group.userData.breakerSwitches=[];
    const floor=new THREE.Mesh(this.floorGeo,this.materials.floor);
    floor.position.set(ox+mid,0,oz+mid);
    floor.name="BackroomsFloor";
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

    for(const room of (data.rooms||[])) this.buildProceduralRoom(group,room,cx,cz);
    group.userData.roomDoorStates=this.roomDoors.filter(door=>door.ownerChunk===group);
    this.buildCeilingFixtures(group,cx,cz);
    return group;
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
      const power=cracked ? .95+rng()*.30 : 2.0+rng()*.45;
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
        100,
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
    return [
      ...this.roomDoors.filter(door=>door.group?.parent&&(door!==this.breakerRoomDoor||this.maintenancePuzzleType==="breakers")).map(door=>door.group),
      ...(this.maintenancePuzzleType==="breakers"
        ?this.breakerSwitches.filter(item=>item.group?.parent&&item.group.visible).map(item=>item.group)
        :[]),
    ];
  }

  getSecurityCameras() {
    return [];
  }

  updateAtmosphereEffects() {}

}
