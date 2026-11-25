// world.js — seeded RNG, chunk layout generation, chunk meshes, chunk manager.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createTextures } from "./textures.js?v=20261030-finish-pass6";

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
// Each physical meter has a different reading. Players compare the needles
// and switch the cabinets from the lowest reading to the highest; no written
// equations, labels or instruction boards are placed in the room.
const BREAKER_METER_READINGS=Object.freeze([
  Object.freeze({index:1,reading:3}),
  Object.freeze({index:2,reading:4.5}),
  Object.freeze({index:3,reading:6}),
  Object.freeze({index:4,reading:7.5}),
  Object.freeze({index:5,reading:4}),
  Object.freeze({index:6,reading:2}),
  Object.freeze({index:7,reading:8.5}),
  Object.freeze({index:8,reading:10}),
]);

function isProtectedRouteCell(gx,gz){
  return (
    (gz >= 7 && gz <= 9 && gx >= -23 && gx <= 23) ||
    (gx >= -21 && gx <= -19 && gz >= MAP_MIN_CHUNK * CHUNK_CELLS && gz <= 8) ||
    // Keep the scattered signal relays on separate clear 20 m approach pads.
    (gx >= 58 && gx <= 62 && gz >= -72 && gz <= -68) ||
    (gx >= -72 && gx <= -68 && gz >= 103 && gz <= 107)
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
      emissiveIntensity: 0.18,
      roughness: 0.28,
    });
    this.fixtureDimMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff4ca,
      emissive: 0xffe2a0,
      emissiveIntensity: 0.11,
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
    this.breakerRoomLightMaterial=new THREE.MeshStandardMaterial({
      color:0x353328,emissive:0x000000,emissiveIntensity:0,roughness:0.4
    });
    this.breakerRoomLights=[];
    this.roomDoors=[];
    this.breakerSwitches=[];
    this.breakerProgress=0;
    this.breakerSequence=BREAKER_METER_READINGS.slice().sort((a,b)=>a.reading-b.reading).map(meter=>meter.index);
    this.breakerFailTimer=0;
    this.maintenanceDoor=null;
    this.maintenancePuzzleType="breakers";
    this.maintenancePuzzleSeed=1;
    this.maintenanceEntryDoor=null;
    this.breakerRoomDoor=null;
    this.breakerRoomGroup=null;
    this.breakerRoomBounds=[];
    this.maintenanceRoomGroup=null;

    this.breakerPanelMaterial=new THREE.MeshStandardMaterial({color:0x35372f,roughness:0.83,metalness:0.08});
    this.breakerHandleMaterial=new THREE.MeshStandardMaterial({color:0x97988a,roughness:0.7,metalness:0.25});
    this.breakerLampOffMaterial=new THREE.MeshStandardMaterial({color:0x4d2822,emissive:0x40100a,emissiveIntensity:0.35});
    this.breakerLampOnMaterial=new THREE.MeshStandardMaterial({color:0x9bd78b,emissive:0x42ff40,emissiveIntensity:1.15});
    this.breakerGaugeMaterials=[];
    for(const meter of BREAKER_METER_READINGS){
      const canvas=document.createElement("canvas");
      canvas.width=256;canvas.height=256;
      const ctx=canvas.getContext("2d");
      const cx=128,cy=128;
      ctx.clearRect(0,0,256,256);
      ctx.fillStyle="#0d1512";
      ctx.beginPath();ctx.arc(cx,cy,119,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="rgba(104,139,119,.5)";
      ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(cx,cy,111,0,Math.PI*2);ctx.stroke();
      const start=Math.PI*.75,sweep=Math.PI*1.5;
      ctx.strokeStyle="rgba(125,165,143,.86)";
      ctx.lineCap="square";
      for(let tick=0;tick<=10;tick++){
        const angle=start+sweep*(tick/10);
        const inner=tick%2===0?82:90;
        const outer=101;
        ctx.lineWidth=tick%2===0?4:2;
        ctx.beginPath();
        ctx.moveTo(cx+Math.cos(angle)*inner,cy+Math.sin(angle)*inner);
        ctx.lineTo(cx+Math.cos(angle)*outer,cy+Math.sin(angle)*outer);
        ctx.stroke();
      }
      const angle=start+sweep*(meter.reading/10);
      const needleX=cx+Math.cos(angle)*75;
      const needleY=cy+Math.sin(angle)*75;
      ctx.strokeStyle="#e6aa56";
      ctx.lineWidth=7;
      ctx.lineCap="round";
      ctx.shadowColor="rgba(218,148,68,.6)";
      ctx.shadowBlur=8;
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(needleX,needleY);ctx.stroke();
      ctx.shadowBlur=0;
      ctx.fillStyle="#e6aa56";
      ctx.beginPath();ctx.arc(cx,cy,10,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#202c27";
      ctx.beginPath();ctx.arc(cx,cy,4,0,Math.PI*2);ctx.fill();
      const texture=new THREE.CanvasTexture(canvas);
      texture.colorSpace=THREE.SRGBColorSpace;
      this.breakerGaugeMaterials.push(
        new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,toneMapped:false})
      );
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
    this.breakerRoomBounds=[];
    this.breakerSwitches=[];
    this.breakerRoomLights=[];
    const group=this.breakerRoomGroup;
    const wallT=.22,roomHeight=3.95,roomWidth=26.4,half=roomWidth*.5;
    const leftX=centerX-half,rightX=centerX+half;
    const partitionZ=this.maintenanceRoomFrontZ-35.5;
    const depth=partitionZ-backZ,midZ=(partitionZ+backZ)*.5;

    // A separate visual language for this room: old painted steel, oxidized
    // hardware, dark rubber cable runs and a few restrained signal colours.
    const wallCanvas=document.createElement("canvas");
    wallCanvas.width=512;wallCanvas.height=512;
    const wallCtx=wallCanvas.getContext("2d");
    wallCtx.fillStyle="#555b50";wallCtx.fillRect(0,0,512,512);
    for(let i=0;i<4200;i++){
      const v=55+Math.floor(Math.random()*45);
      wallCtx.fillStyle="rgba("+v+","+Math.floor(v*1.02)+","+Math.floor(v*.88)+","+(.035+Math.random()*.09).toFixed(3)+")";
      const x=Math.random()*512,y=Math.random()*512;
      wallCtx.fillRect(x,y,1+Math.random()*3,1+Math.random()*4);
    }
    for(let i=0;i<36;i++){
      const x=(i*83+19)%512;
      wallCtx.fillStyle="rgba(22,25,21,"+(.08+Math.random()*.12).toFixed(3)+")";
      wallCtx.fillRect(x,0,1+Math.random()*3,512);
    }

    // Decades of leaks have left broad damp blooms, soot, mineral streaks,
    // and patches where the old paint has lifted away from the concrete.
    for(let stain=0;stain<46;stain++){
      const x=Math.random()*512,y=90+Math.random()*420;
      const width=18+Math.random()*82,height=12+Math.random()*54;
      const shade=wallCtx.createRadialGradient(x,y,2,x,y,width);
      shade.addColorStop(0,"rgba(17,23,19,"+(.20+Math.random()*.16).toFixed(3)+")");
      shade.addColorStop(.62,"rgba(25,31,25,.12)");
      shade.addColorStop(1,"rgba(25,31,25,0)");
      wallCtx.fillStyle=shade;
      wallCtx.beginPath();
      wallCtx.ellipse(x,y,width,height,Math.random()*.6,0,Math.PI*2);
      wallCtx.fill();
    }
    for(let drip=0;drip<150;drip++){
      const x=Math.random()*512,y=70+Math.random()*360;
      const length=12+Math.random()*120;
      wallCtx.strokeStyle=drip%4===0?"rgba(12,18,15,.24)":"rgba(19,27,21,.12)";
      wallCtx.lineWidth=.6+Math.random()*2.2;
      wallCtx.beginPath();
      wallCtx.moveTo(x,y);
      wallCtx.lineTo(x+(Math.random()-.5)*5,Math.min(510,y+length));
      wallCtx.stroke();
    }
    for(let peel=0;peel<30;peel++){
      const x=Math.random()*500,y=100+Math.random()*390;
      const width=5+Math.random()*25,height=4+Math.random()*17;
      wallCtx.beginPath();
      wallCtx.moveTo(x,y);
      wallCtx.lineTo(x+width*.35,y-height*.45);
      wallCtx.lineTo(x+width,y+height*.12);
      wallCtx.lineTo(x+width*.72,y+height);
      wallCtx.lineTo(x+width*.12,y+height*.7);
      wallCtx.closePath();
      wallCtx.fillStyle=peel%3===0?"rgba(151,151,127,.20)":"rgba(13,19,15,.30)";
      wallCtx.fill();
      wallCtx.strokeStyle="rgba(184,177,144,.12)";
      wallCtx.lineWidth=1;
      wallCtx.stroke();
    }
    wallCtx.strokeStyle="rgba(12,17,14,.32)";
    wallCtx.lineWidth=1.4;
    for(let crack=0;crack<18;crack++){
      const x=Math.random()*512,y=130+Math.random()*340;
      wallCtx.beginPath();
      wallCtx.moveTo(x,y);
      wallCtx.lineTo(x+(Math.random()-.5)*12,y+10+Math.random()*18);
      wallCtx.lineTo(x+(Math.random()-.5)*20,y+28+Math.random()*30);
      wallCtx.stroke();
    }

    wallCtx.strokeStyle="rgba(18,22,19,.32)";
    wallCtx.lineWidth=2;
    for(let y=0;y<=512;y+=128){
      wallCtx.beginPath();wallCtx.moveTo(0,y);wallCtx.lineTo(512,y);wallCtx.stroke();
    }
    const wallTexture=new THREE.CanvasTexture(wallCanvas);
    wallTexture.colorSpace=THREE.SRGBColorSpace;
    wallTexture.wrapS=THREE.RepeatWrapping;
    wallTexture.wrapT=THREE.RepeatWrapping;
    wallTexture.repeat.set(7,2);
    const wallMaterial=new THREE.MeshStandardMaterial({
      map:wallTexture,color:0xffffff,roughness:.97,metalness:.03
    });
    const ceilingCanvas=document.createElement("canvas");
    ceilingCanvas.width=512;ceilingCanvas.height=512;
    const ceilingCtx=ceilingCanvas.getContext("2d");
    ceilingCtx.fillStyle="#242b27";
    ceilingCtx.fillRect(0,0,512,512);
    for(let stain=0;stain<38;stain++){
      const x=Math.random()*512,y=Math.random()*512;
      const radius=18+Math.random()*92;
      const damp=ceilingCtx.createRadialGradient(x,y,2,x,y,radius);
      damp.addColorStop(0,"rgba(8,14,11,.64)");
      damp.addColorStop(.72,"rgba(13,20,16,.30)");
      damp.addColorStop(1,"rgba(13,20,16,0)");
      ceilingCtx.fillStyle=damp;
      ceilingCtx.beginPath();
      ceilingCtx.ellipse(x,y,radius,radius*(.35+Math.random()*.45),Math.random(),0,Math.PI*2);
      ceilingCtx.fill();
    }
    ceilingCtx.strokeStyle="rgba(8,13,10,.52)";
    ceilingCtx.lineWidth=2;
    for(let crack=0;crack<24;crack++){
      const x=Math.random()*512,y=Math.random()*512;
      ceilingCtx.beginPath();
      ceilingCtx.moveTo(x,y);
      ceilingCtx.lineTo(x+(Math.random()-.5)*28,y+12+Math.random()*26);
      ceilingCtx.lineTo(x+(Math.random()-.5)*45,y+32+Math.random()*48);
      ceilingCtx.stroke();
    }
    const ceilingTexture=new THREE.CanvasTexture(ceilingCanvas);
    ceilingTexture.colorSpace=THREE.SRGBColorSpace;
    ceilingTexture.wrapS=THREE.RepeatWrapping;
    ceilingTexture.wrapT=THREE.RepeatWrapping;
    ceilingTexture.repeat.set(5,4);
    const ceilingMaterial=new THREE.MeshStandardMaterial({
      map:ceilingTexture,color:0xb3b8ad,roughness:.99,metalness:0
    });
    const structuralMetal=new THREE.MeshStandardMaterial({
      color:0x414944,roughness:.91,metalness:.24
    });
    const darkMetal=new THREE.MeshStandardMaterial({
      color:0x191f1c,roughness:.97,metalness:.18
    });
    const cabinetMaterial=new THREE.MeshStandardMaterial({
      color:0x353e38,roughness:.94,metalness:.19
    });
    const cabinetFaceMaterial=new THREE.MeshStandardMaterial({
      color:0x252d29,roughness:.96,metalness:.12
    });
    const rustMaterial=new THREE.MeshStandardMaterial({
      color:0x704a36,roughness:.91,metalness:.16
    });
    const rubberMaterial=new THREE.MeshStandardMaterial({
      color:0x111715,roughness:.96,metalness:0
    });
    const walkwayMaterial=new THREE.MeshStandardMaterial({
      color:0x333a36,roughness:.84,metalness:.42
    });
    const wornAmberMaterial=new THREE.MeshStandardMaterial({
      color:0x927044,roughness:.92,metalness:.08
    });
    const diffuserMaterial=new THREE.MeshStandardMaterial({
      color:0xffe7b7,emissive:0xffd28a,emissiveIntensity:.0,roughness:.35
    });
    const signalCyanMaterial=new THREE.MeshStandardMaterial({
      color:0x79d7d0,emissive:0x27b9b3,emissiveIntensity:1.15,roughness:.38
    });
    const signalAmberMaterial=new THREE.MeshStandardMaterial({
      color:0xe4aa56,emissive:0xb87526,emissiveIntensity:.8,roughness:.42
    });
    const signalRedMaterial=new THREE.MeshStandardMaterial({
      color:0x9d4638,emissive:0x8e2116,emissiveIntensity:.35,roughness:.42
    });
    this.breakerRoomAlarmMaterial=signalRedMaterial;

    const addBox=(name,sx,sy,sz,x,y,z,material,host=group)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);
      mesh.name=name;
      mesh.position.set(x,y,z);
      mesh.castShadow=false;
      mesh.receiveShadow=true;
      mesh.userData.fixtureLightOccluder=true;
      host.add(mesh);
      return mesh;
    };
    const addPipe=(name,start,end,radius,material)=>{
      const direction=end.clone().sub(start);
      const length=direction.length();
      const mesh=new THREE.Mesh(
        new THREE.CylinderGeometry(radius,radius,length,8),
        material
      );
      mesh.name=name;
      mesh.position.copy(start).add(end).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0,1,0),direction.normalize()
      );
      mesh.castShadow=false;
      mesh.receiveShadow=true;
      mesh.userData.fixtureLightOccluder=true;
      group.add(mesh);
      return mesh;
    };
    const addWall=(name,sx,sy,sz,x,y,z)=>{
      addBox(name,sx,sy,sz,x,y,z,wallMaterial);
      this.breakerRoomBounds.push({
        minX:x-sx*.5,maxX:x+sx*.5,minZ:z-sz*.5,maxZ:z+sz*.5
      });
    };

    // Architectural shell: darker walls, a low protective kick plate and
    // reinforced corners replace the empty yellow-room look.
    addWall("BreakerRoomLeftWall",wallT,roomHeight,depth,leftX,roomHeight*.5,midZ);
    addWall("BreakerRoomRightWall",wallT,roomHeight,depth,rightX,roomHeight*.5,midZ);
    const doorLeft=centerX-ROOM_DOOR_WIDTH*.5;
    const doorRight=centerX+ROOM_DOOR_WIDTH*.5;
    addWall("BreakerRoomEntryPartitionLeft",doorLeft-leftX,roomHeight,wallT,
      (leftX+doorLeft)*.5,roomHeight*.5,partitionZ);
    addWall("BreakerRoomEntryPartitionRight",rightX-doorRight,roomHeight,wallT,
      (doorRight+rightX)*.5,roomHeight*.5,partitionZ);
    addBox("BreakerRoomEntryLintel",ROOM_DOOR_WIDTH,roomHeight-ROOM_DOOR_HEIGHT,wallT,
      centerX,(roomHeight+ROOM_DOOR_HEIGHT)*.5,partitionZ,wallMaterial);
    this.breakerRoomDoor=this.buildRoomDoor(group,centerX,partitionZ,{
      doorHeight:ROOM_DOOR_HEIGHT,roomHeight,requiresPower:false,ownerChunk:null
    },this.breakerRoomBounds);

    addBox("BreakerRoomCeiling",roomWidth,.12,depth-.15,centerX,3.82,midZ,ceilingMaterial);
    addBox("BreakerRoomFrontHeader",roomWidth-.25,.16,.24,centerX,3.58,partitionZ-.30,structuralMetal);
    addBox("BreakerRoomRearHeader",roomWidth-.25,.16,.24,centerX,3.58,backZ+1.0,structuralMetal);
    for(const side of [-1,1]){
      const x=centerX+side*(half-.22);
      for(const z of [backZ+1.0,partitionZ-1.0]){
        addBox("BreakerRoomCornerColumn",.30,3.82,.34,x,1.91,z,structuralMetal);
        addBox("BreakerRoomColumnFoot",.48,.18,.48,x,.09,z,darkMetal);
        addBox("BreakerRoomColumnCap",.46,.16,.45,x,3.70,z,darkMetal);
      }
      addBox("BreakerRoomWallBaseTrim",.14,.28,depth-1.1,
        centerX+side*(half-.22),.17,midZ,structuralMetal);
      addBox("BreakerRoomWallServiceRail",.10,.12,depth-2.0,
        centerX+side*(half-.30),2.42,midZ,rustMaterial);
    }

    // A continuous service aisle gives the room a strong vanishing point.
    // The plates sit almost flush so they never interfere with player movement.
    for(let plate=0;plate<6;plate++){
      const z=partitionZ-2.55-plate*3.82;
      addBox("BreakerRoomAisleDeckPlate",4.12,.035,3.62,centerX,.028,z,walkwayMaterial);
      for(const side of [-1,1]){
        addBox("BreakerRoomAisleBolt",.045,.012,.045,
          centerX+side*1.92,.052,z-1.55,structuralMetal);
        addBox("BreakerRoomAisleBolt",.045,.012,.045,
          centerX+side*1.92,.052,z+1.55,structuralMetal);
      }
    }
    const aisleLineMaterial=wornAmberMaterial;
    for(const side of [-1,1]){
      addBox("BreakerRoomAisleEdgeMarking",.055,.008,depth-1.4,
        centerX+side*2.20,.014,midZ,aisleLineMaterial);
    }
    const puddleMaterial=new THREE.MeshStandardMaterial({
      color:0x192523,metalness:.46,roughness:.20,transparent:true,
      opacity:.62,depthWrite:false
    });
    for(const [x,z,sx,sz] of [
      [centerX-2.75,midZ+5.0,1.35,.58],
      [centerX+2.72,midZ-4.2,1.05,.48],
      [centerX+2.55,backZ+5.6,.72,.36],
      [centerX-2.58,partitionZ-4.0,.65,.28]
    ]){
      const puddle=new THREE.Mesh(new THREE.CircleGeometry(1,28),puddleMaterial);
      puddle.name="BreakerRoomFloorPuddle";
      puddle.rotation.x=-Math.PI/2;
      puddle.position.set(x,.013,z);
      puddle.scale.set(sx,sz,1);
      puddle.renderOrder=1;
      group.add(puddle);
    }
    // A floor drain and a few inset grates add scale without filling the aisle.
    addBox("BreakerRoomFloorDrain",.32,.018,depth-2.0,
      centerX-2.48,.018,midZ,darkMetal);
    for(let grate=0;grate<16;grate++){
      addBox("BreakerRoomDrainSlot",.22,.009,.055,
        centerX-2.48,.029,partitionZ-1.5-grate*1.35,structuralMetal);
    }

    // Oil, grit, old plaster and broken hardware have collected along the
    // walls. Keep the center strip clear so none of this blocks movement.
    const floorGrimeMaterials=[
      new THREE.MeshStandardMaterial({color:0x171d19,roughness:1,transparent:true,opacity:.48,depthWrite:false}),
      new THREE.MeshStandardMaterial({color:0x3b3024,roughness:1,transparent:true,opacity:.34,depthWrite:false}),
      new THREE.MeshStandardMaterial({color:0x252b27,roughness:.94,transparent:true,opacity:.38,depthWrite:false})
    ];
    for(let stain=0;stain<28;stain++){
      const side=stain%2===0?-1:1;
      const x=centerX+side*(2.65+((stain*29)%84)/10);
      const z=partitionZ-1.7-((stain*17)%Math.max(1,Math.floor(depth*10-3)))/10;
      const patch=new THREE.Mesh(
        new THREE.CircleGeometry(1,7+(stain%5)),
        floorGrimeMaterials[stain%floorGrimeMaterials.length]
      );
      patch.name="BreakerRoomOilStain";
      patch.rotation.x=-Math.PI/2;
      patch.rotation.z=(stain%7)*.19;
      patch.position.set(x,.023+(stain%3)*.002,z);
      patch.scale.set(.18+(stain%4)*.12,.12+(stain%5)*.07,1);
      patch.renderOrder=1;
      group.add(patch);
    }
    for(let shard=0;shard<32;shard++){
      const side=shard%2===0?-1:1;
      const x=centerX+side*(2.8+((shard*31)%78)/10);
      const z=partitionZ-1.8-((shard*13)%Math.max(1,Math.floor(depth*10-3)))/10;
      const width=.055+(shard%4)*.025;
      const height=.025+(shard%3)*.018;
      const depthPiece=.07+(shard%5)*.035;
      const material=shard%3===0?rustMaterial:darkMetal;
      const debris=addBox("BreakerRoomDebris",width,height,depthPiece,
        x,height*.5+.012,z,material);
      debris.rotation.y=(shard%9)*.31;
      debris.rotation.z=(shard%5-2)*.12;
    }

    // Cable trays run the length of both cabinet banks. Repeated cross-rungs
    // and conduits visibly connect the switchgear instead of floating panels.
    for(const side of [-1,1]){
      const trayX=centerX+side*(half-.78);
      addBox("BreakerRoomCableTray",.76,.20,depth-1.65,trayX,2.91,midZ,darkMetal);
      addBox("BreakerRoomCableTrayCover",.80,.045,depth-1.62,trayX,3.035,midZ,structuralMetal);
      for(const edge of [-1,1]){
        addBox("BreakerRoomCableTraySide",.055,.22,depth-1.65,
          trayX+edge*.37,2.91,midZ,structuralMetal);
      }
      for(let rung=0;rung<15;rung++){
        addBox("BreakerRoomCableTrayRung",.68,.028,.07,trayX,2.96,
          partitionZ-1.5-rung*((depth-3.0)/14),structuralMetal);
      }
      // A separate insulated feed follows the upper wall into the far relay rack.
      addPipe("BreakerRoomWallConduit",
        new THREE.Vector3(trayX,2.67,partitionZ-1.0),
        new THREE.Vector3(trayX,2.67,backZ+1.4),.065,rustMaterial);
    }
    for(const offset of [-2.35,0,2.35]){
      addPipe("BreakerRoomCeilingBus",
        new THREE.Vector3(centerX+offset,3.66,partitionZ-1.0),
        new THREE.Vector3(centerX+offset,3.66,backZ+1.0),.07,structuralMetal);
    }
    for(let beam=0;beam<6;beam++){
      const z=partitionZ-1.9-beam*((depth-3.8)/5);
      addBox("BreakerRoomCeilingCrossbeam",roomWidth-.42,.09,.14,centerX,3.70,z,structuralMetal);
    }

    // Five recessed fluorescent housings illuminate the aisle; the four real
    // point lights stay deliberately budgeted for weaker hardware.
    for(let rib=0;rib<5;rib++){
      const z=partitionZ-2.3-rib*((depth-4.6)/4);
      addBox("BreakerRoomLightHousing",4.95,.12,.58,centerX,3.61,z,darkMetal);
      const fixtureFailed=rib===1||rib===4;
      if(fixtureFailed){
        addBox("BreakerRoomDeadFluorescentSection",4.58,.028,.34,centerX,3.535,z,darkMetal);
        // Broken diffuser fragments remain caught in the housing.
        for(let fragment=0;fragment<3;fragment++){
          const shard=new THREE.Mesh(
            new THREE.BoxGeometry(.34,.018,.07),
            structuralMetal
          );
          shard.name="BreakerRoomBrokenLightGlass";
          shard.position.set(centerX-1.15+fragment*1.12,3.515,z+(fragment%2?.12:-.12));
          shard.rotation.x=(fragment-1)*.16;
          shard.rotation.y=fragment*.22;
          group.add(shard);
        }
      }else{
        addBox("BreakerRoomFluorescentStrip",4.58,.028,.34,centerX,3.535,z,this.breakerRoomLightMaterial);
      }
      addBox("BreakerRoomFixtureDiffuserLeft",.045,.035,.40,centerX-2.30,3.53,z,structuralMetal);
      addBox("BreakerRoomFixtureDiffuserRight",.045,.035,.40,centerX+2.30,3.53,z,structuralMetal);
      if(rib===0||rib===3){
        for(const side of [-1,1]){
          const light=new THREE.PointLight(0xffe7ad,0,26,1.45);
          light.name="BreakerRoomOverheadLight";
          light.position.set(centerX+side*6.35,3.35,z);
          light.visible=false;
          light.castShadow=false;
          group.add(light);
          this.breakerRoomLights.push({light,baseIntensity:6.5,phase:rib*.83+(side>0?.45:0)});
        }
      }
    }

    // One exposed ceiling service void and two sagging cable runs make the
    // place feel neglected, while keeping the rest of the ceiling deliberate.
    addBox("BreakerRoomOpenCeilingServiceVoid",2.6,.035,1.45,
      centerX+7.2,3.746,midZ-.8,darkMetal);
    for(let cable=0; cable<3; cable++){
      const x=centerX+6.35+cable*.28;
      const curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(x,3.66,midZ+1.8),
        new THREE.Vector3(x+.12,3.26,midZ+1.3),
        new THREE.Vector3(x-.08,3.17,midZ+.15),
        new THREE.Vector3(x+.20,3.51,midZ-.8)
      ]);
      const wire=new THREE.Mesh(new THREE.TubeGeometry(curve,20,.026,6,false),rubberMaterial);
      wire.name="BreakerRoomHangingCable";
      wire.castShadow=false;
      wire.receiveShadow=true;
      group.add(wire);
    }

    // Eight individual cabinets preserve every existing puzzle hit target.
    // The old flat wall boxes become recessed, bolted electrical enclosures.
    const zStart=partitionZ-3.6,zSpacing=5.3,positions=[];
    const leftFaceX=leftX+wallT*.5+.11;
    const rightFaceX=rightX-wallT*.5-.11;
    for(let row=0;row<4;row++){
      positions.push({index:row+1,x:leftFaceX,z:zStart-row*zSpacing,face:Math.PI*.5});
      positions.push({index:row+5,x:rightFaceX,z:zStart-row*zSpacing,face:-Math.PI*.5});
    }
    for(const spec of positions){
      const root=new THREE.Group();
      root.name="MaintenanceBreaker"+spec.index;
      root.position.set(spec.x,0,spec.z);
      root.rotation.y=spec.face;
      group.add(root);

      const housing=new THREE.Mesh(new THREE.BoxGeometry(1.52,2.08,.42),cabinetMaterial);
      housing.name="BreakerCabinetHousing";
      housing.position.set(0,1.04,-.005);
      housing.castShadow=false;
      root.add(housing);
      const doorFrame=new THREE.Mesh(new THREE.BoxGeometry(1.17,1.72,.10),structuralMetal);
      doorFrame.name="BreakerCabinetDoorFrame";
      doorFrame.position.set(0,1.05,.225);
      root.add(doorFrame);
      const panel=new THREE.Mesh(new THREE.BoxGeometry(1.04,1.58,.12),cabinetFaceMaterial);
      panel.name="BreakerPanelHousing";
      panel.position.set(0,1.05,.292);
      root.add(panel);

      const gaugeBezel=new THREE.Mesh(
        new THREE.CircleGeometry(.385,40),structuralMetal
      );
      gaugeBezel.name="BreakerMeterBezel";
      gaugeBezel.position.set(0,1.42,.354);
      root.add(gaugeBezel);
      const gaugeFace=new THREE.Mesh(
        new THREE.PlaneGeometry(.70,.70),this.breakerGaugeMaterials[spec.index-1]
      );
      gaugeFace.name="BreakerMeterFace";
      gaugeFace.position.set(0,1.42,.365);
      root.add(gaugeFace);

      const handle=new THREE.Mesh(new THREE.BoxGeometry(.12,.36,.085),this.breakerHandleMaterial);
      handle.name="BreakerLever";
      handle.position.set(0,.91,.375);
      handle.rotation.z=.42;
      root.add(handle);
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(.085,12,10),this.breakerLampOffMaterial);
      lamp.name="BreakerStatusLamp";
      lamp.position.set(0,1.68,.37);
      root.add(lamp);

      // Cooling slots and visible fasteners give each cabinet a believable scale.
      for(let vent=0;vent<4;vent++){
        const slot=new THREE.Mesh(new THREE.BoxGeometry(.56,.018,.025),darkMetal);
        slot.name="BreakerCabinetVent";
        slot.position.set(0,.48+vent*.055,.37);
        root.add(slot);
      }
      for(const side of [-1,1]){
        for(const y of [.30,1.80]){
          const bolt=new THREE.Mesh(new THREE.SphereGeometry(.027,8,6),rustMaterial);
          bolt.name="BreakerCabinetFastener";
          bolt.position.set(side*.68,y,.30);
          root.add(bolt);
        }
      }
      const cabinetStatus=new THREE.Mesh(
        new THREE.BoxGeometry(.035,.48,.025),signalAmberMaterial
      );
      cabinetStatus.name="BreakerCabinetStatusBar";
      cabinetStatus.position.set(-.53,1.03,.371);
      root.add(cabinetStatus);

      // Rust has crept through the seams and runoff has stained the lower
      // cabinet edges. The meter glass and lever stay completely unobstructed.
      for(let streak=0;streak<3;streak++){
        const side=streak%2===0?-1:1;
        const runoff=addBox("BreakerCabinetRustRunoff",
          .022+(streak%2)*.018,.16+(streak%3)*.055,.012,
          side*(.49+(streak%2)*.12),.66+(streak%2)*.24,.386,
          rustMaterial,root);
        runoff.rotation.z=(streak-1)*.045;
      }
      for(let chip=0;chip<2;chip++){
        const paintLoss=addBox("BreakerCabinetPaintLoss",
          .12+(chip*.035),.045,.018,
          chip===0?-.61:.59,.22+chip*.11,.377,
          rustMaterial,root);
        paintLoss.rotation.z=(chip===0?-.12:.16);
      }

      // Short drops connect each cabinet to the overhead cable tray.
      addPipe("BreakerCabinetConduit",
        new THREE.Vector3(spec.x,2.13,spec.z),
        new THREE.Vector3(spec.x,2.72,spec.z),.045,structuralMetal);

      const state={...spec,group:root,handle,lamp,ownerChunk:null,active:false};
      root.userData.interactable={
        type:"roomBreaker",
        prompt:"Flip breaker "+spec.index+" after comparing its meter reading",
        breakerIndex:spec.index,
        breakerState:state
      };
      this.breakerSwitches.push(state);
    }

    // A single signal console above the far door gives the room a clear focal
    // point. Its readout belongs to the world, not another decorative sign.
    const scopeCanvas=document.createElement("canvas");
    scopeCanvas.width=640;scopeCanvas.height=256;
    const scopeCtx=scopeCanvas.getContext("2d");
    scopeCtx.fillStyle="#06100f";
    scopeCtx.fillRect(0,0,640,256);
    scopeCtx.strokeStyle="rgba(76,161,150,.22)";
    scopeCtx.lineWidth=1;
    for(let x=0;x<=640;x+=32){
      scopeCtx.beginPath();scopeCtx.moveTo(x,0);scopeCtx.lineTo(x,256);scopeCtx.stroke();
    }
    for(let y=0;y<=256;y+=32){
      scopeCtx.beginPath();scopeCtx.moveTo(0,y);scopeCtx.lineTo(640,y);scopeCtx.stroke();
    }
    scopeCtx.strokeStyle="#79e4d1";
    scopeCtx.lineWidth=3;
    scopeCtx.beginPath();
    for(let x=0;x<=590;x+=3){
      const envelope=Math.sin(x*.016)*.10+Math.sin(x*.047)*.055;
      const pulse=Math.sin(x*.11)*(.04+Math.abs(Math.sin(x*.027))*.13);
      const y=150+(envelope+pulse)*210;
      if(x===0)scopeCtx.moveTo(x+24,y);else scopeCtx.lineTo(x+24,y);
    }
    scopeCtx.stroke();
    scopeCtx.strokeStyle="rgba(115,203,186,.22)";
    scopeCtx.beginPath();scopeCtx.moveTo(24,150);scopeCtx.lineTo(616,150);scopeCtx.stroke();
    // The old display has dead scan lines, a burned patch, and a cracked
    // corner of glass; the carrier trace still bleeds through underneath.
    for(let line=5;line<256;line+=9){
      scopeCtx.fillStyle="rgba(0,0,0,.16)";
      scopeCtx.fillRect(0,line,640,1);
    }
    scopeCtx.fillStyle="rgba(0,0,0,.42)";
    scopeCtx.fillRect(462,0,178,256);
    scopeCtx.fillStyle="rgba(13,37,31,.42)";
    scopeCtx.fillRect(475,36,165,9);
    scopeCtx.strokeStyle="rgba(190,216,196,.40)";
    scopeCtx.lineWidth=1.5;
    scopeCtx.beginPath();
    scopeCtx.moveTo(586,8);scopeCtx.lineTo(565,44);scopeCtx.lineTo(576,68);
    scopeCtx.lineTo(548,92);scopeCtx.lineTo(557,124);scopeCtx.stroke();
    scopeCtx.beginPath();
    scopeCtx.moveTo(565,44);scopeCtx.lineTo(538,32);scopeCtx.lineTo(526,9);
    scopeCtx.moveTo(576,68);scopeCtx.lineTo(606,82);scopeCtx.lineTo(629,108);
    scopeCtx.stroke();
    const scopeTexture=new THREE.CanvasTexture(scopeCanvas);
    scopeTexture.colorSpace=THREE.SRGBColorSpace;
    const scopeScreenMaterial=new THREE.MeshBasicMaterial({
      map:scopeTexture,toneMapped:false
    });
    const scopeHousing=addBox("BreakerRoomSignalConsole",5.55,.98,.26,
      centerX,3.32,backZ+.20,cabinetMaterial);
    scopeHousing.material=cabinetMaterial;
    addBox("BreakerRoomSignalConsoleBezel",3.78,.70,.08,
      centerX,3.32,backZ+.36,darkMetal);
    const scopeScreen=new THREE.Mesh(new THREE.PlaneGeometry(3.58,.55),scopeScreenMaterial);
    scopeScreen.name="BreakerRoomScopeScreen";
    scopeScreen.position.set(centerX,3.32,backZ+.405);
    group.add(scopeScreen);

    for(const side of [-1,1]){
      const gaugeX=centerX+side*2.25;
      const gaugeFace=new THREE.Mesh(new THREE.CircleGeometry(.275,32),darkMetal);
      gaugeFace.name="BreakerRoomAnalogGauge";
      gaugeFace.position.set(gaugeX,3.32,backZ+.355);
      group.add(gaugeFace);
      const gaugeRing=new THREE.Mesh(new THREE.RingGeometry(.275,.315,32),structuralMetal);
      gaugeRing.name="BreakerRoomGaugeRim";
      gaugeRing.position.set(gaugeX,3.32,backZ+.37);
      group.add(gaugeRing);
      const needle=new THREE.Mesh(new THREE.BoxGeometry(.018,.19,.018),signalAmberMaterial);
      needle.name="BreakerRoomGaugeNeedle";
      needle.position.set(gaugeX,3.32,backZ+.39);
      needle.rotation.z=side*.38;
      group.add(needle);
      for(let tick=0;tick<7;tick++){
        const angle=(-.95+tick*.31);
        const mark=new THREE.Mesh(new THREE.BoxGeometry(.018,.065,.012),signalCyanMaterial);
        mark.name="BreakerRoomGaugeMark";
        mark.position.set(
          gaugeX+Math.sin(angle)*.205,
          3.32+Math.cos(angle)*.205,
          backZ+.39
        );
        mark.rotation.z=-angle;
        group.add(mark);
      }
    }
    for(let indicator=0;indicator<8;indicator++){
      const material=indicator===0?signalRedMaterial:
        indicator===1?signalAmberMaterial:
        indicator===7?signalCyanMaterial:this.breakerLampOffMaterial;
      const led=new THREE.Mesh(new THREE.SphereGeometry(.045,10,8),material);
      led.name="BreakerRoomRelayIndicator";
      led.position.set(centerX-1.42+indicator*.405,2.79,backZ+.38);
      group.add(led);
    }

    // One old service trolley, pushed into the corner, supplies a human scale
    // cue without blocking either the aisle or any interactable.
    const cartX=centerX+10.6,cartZ=backZ+3.4;
    addBox("BreakerRoomToolTrolleyLowerShelf",1.02,.08,.66,cartX,.43,cartZ,darkMetal);
    const trolleyTop=addBox("BreakerRoomToolTrolleyTop",1.12,.08,.72,cartX,.91,cartZ,structuralMetal);
    trolleyTop.rotation.z=-.035;
    addBox("BreakerRoomToolTrolleyDrawer",.92,.37,.58,cartX,.67,cartZ,cabinetMaterial);
    addBox("BreakerRoomTrolleyRustPatch",.38,.13,.018,
      cartX+.25,.95,cartZ+.37,rustMaterial);
    addBox("BreakerRoomToolTrolleyHandle",.74,.045,.045,cartX,.83,cartZ+.33,rustMaterial);
    for(const side of [-1,1]){
      for(const front of [-1,1]){
        // One caster has snapped off; the frame sits slightly unevenly.
        if(side===1&&front===-1)continue;
        const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.095,.095,.075,12),rubberMaterial);
        wheel.name="BreakerRoomTrolleyWheel";
        wheel.rotation.z=Math.PI*.5;
        wheel.position.set(cartX+side*.43,.12,cartZ+front*.25);
        group.add(wheel);
      }
    }
    const brokenCaster=new THREE.Mesh(
      new THREE.CylinderGeometry(.035,.035,.15,8),rustMaterial
    );
    brokenCaster.name="BreakerRoomBrokenTrolleyCaster";
    brokenCaster.rotation.z=Math.PI*.5;
    brokenCaster.position.set(cartX+.43,.10,cartZ-.25);
    group.add(brokenCaster);

    // A loose cable drum sits against the opposite wall; it is deliberately
    // low and out of the route, like equipment left during a rushed repair.
    const drumX=centerX-10.5,drumZ=backZ+3.2;
    const drumCore=new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.52,24),rustMaterial);
    drumCore.name="BreakerRoomCableDrum";
    drumCore.rotation.z=Math.PI*.5;
    drumCore.position.set(drumX,.42,drumZ);
    group.add(drumCore);
    for(const side of [-1,1]){
      const flange=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.07,24),structuralMetal);
      flange.name="BreakerRoomCableDrumFlange";
      flange.rotation.z=Math.PI*.5;
      flange.position.set(drumX+side*.29,.42,drumZ);
      group.add(flange);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.085,16),darkMetal);
      hub.rotation.z=Math.PI*.5;
      hub.position.set(drumX+side*.33,.42,drumZ);
      group.add(hub);
    }
    addPipe("BreakerRoomLooseCable",
      new THREE.Vector3(drumX,.12,drumZ),
      new THREE.Vector3(drumX+1.1,.08,drumZ+1.1),.025,rubberMaterial);
    addPipe("BreakerRoomExposedCopperWire",
      new THREE.Vector3(drumX+1.1,.08,drumZ+1.1),
      new THREE.Vector3(drumX+1.45,.055,drumZ+1.45),.009,rustMaterial);

    // A cool signal source balances the warm fluorescent light; it only wakes
    // when the entrance door is open, just like the room's overhead fixtures.
    const signalLight=new THREE.PointLight(0x64c7c1,0,11,1.8);
    signalLight.name="BreakerRoomSignalGlow";
    signalLight.position.set(centerX,2.82,backZ+2.1);
    signalLight.visible=false;
    signalLight.castShadow=false;
    group.add(signalLight);
    this.breakerRoomLights.push({
      light:signalLight,baseIntensity:1.35,phase:1.8
    });

    const beaconHousing=addBox("BreakerRoomWarningBeaconHousing",.28,.10,.28,
      centerX+5.1,3.22,backZ+2.0,darkMetal);
    const beacon=new THREE.Mesh(new THREE.SphereGeometry(.105,12,10),signalRedMaterial);
    beacon.name="BreakerRoomWarningBeacon";
    beacon.position.set(centerX+5.1,3.34,backZ+2.0);
    group.add(beacon);
    this.breakerRoomBeacon=beacon;
    this.breakerRoomAlarmMaterial=signalRedMaterial;

    // Maintain all eight puzzle hit targets and the same sorted-answer logic.
    // The new geometry is visual dressing only; no breaker positions or types
    // are changed, so existing saves and interaction code remain compatible.
  }  buildRoomDoor(parent,centerX,frontZ,options={},boundsTarget=null){
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
      const gauge=new THREE.Mesh(
        new THREE.PlaneGeometry(.54,.54),this.breakerGaugeMaterials[spec.index-1]
      );
      gauge.position.set(0,1.36,.096);root.add(gauge);
      const handle=new THREE.Mesh(new THREE.BoxGeometry(.10,.32,.08),this.breakerHandleMaterial);
      handle.name="BreakerLever";handle.position.set(0,.98,.15);handle.rotation.z=.42;root.add(handle);
      const active=this.maintenanceDoor?.unlocked || this.breakerSequence.slice(0,this.breakerProgress).includes(spec.index);
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(.075,10,8),active?this.breakerLampOnMaterial:this.breakerLampOffMaterial);
      lamp.name="BreakerStatusLamp";lamp.position.set(0,1.52,.11);root.add(lamp);
      if(active)handle.rotation.z=-.42;
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
    // The breaker-room entrance also powers its lights. Restore the door's
    // target and completed animation together so reloads do not strand the
    // player in a dark room or leave a closed collision box on an open door.
    const roomDoor=this.breakerRoomDoor;
    if(roomDoor){
      roomDoor.targetOpen=Boolean(state.breakerRoomDoorOpen);
      roomDoor.openProgress=roomDoor.targetOpen?1:0;
      if(roomDoor.group){
        roomDoor.group.rotation.y=roomDoor.openProgress*Math.PI*.49*roomDoor.rotationSign;
      }
      if(roomDoor.closedCollisionBounds&&roomDoor.collisionBounds){
        Object.assign(roomDoor.collisionBounds,roomDoor.openProgress>.82
          ?{minX:1e9,maxX:1e9+1,minZ:1e9,maxZ:1e9+1}
          :roomDoor.closedCollisionBounds);
      }
    }
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
    this.breakerRoomLightMaterial.emissiveIntensity=breakerRoomLightsOn?1.05:0;
    const lightFlickerTime=performance.now()*.004;
    if(this.breakerRoomAlarmMaterial){
      this.breakerRoomAlarmMaterial.emissiveIntensity=breakerRoomLightsOn
        ?(.48+.22*Math.sin(lightFlickerTime*.8))
        :.10;
    }
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
          ?"Compare the breaker meters"
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
      const power=cracked ? .62+rng()*.18 : 1.35+rng()*.20;
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
