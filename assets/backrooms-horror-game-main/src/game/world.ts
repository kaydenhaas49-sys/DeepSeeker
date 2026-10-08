// ============================================================================
// world.ts — Builds the 3D Backrooms world: walls, floor, ceiling, lighting,
// page pickups. Handles collision queries against the maze grid.
// ============================================================================

import * as THREE from 'three';
import { MAZE, COLORS, FOG, FLUORESCENT } from './constants';
import {
  generateMaze,
  getFloorCells,
  isWallAt,
  cellToWorld,
  type MazeGrid,
} from './maze';
import {
  genWallpaper,
  genCarpet,
  genCeiling,
  genNormalMap,
  genRoughnessMap,
  genPage,
} from './textureGenerator';
import { type TextureSet } from './assetLoader';

export interface PagePickup {
  group: THREE.Group;
  position: THREE.Vector3;
  collected: boolean;
  cell: [number, number];
}

export interface World {
  group: THREE.Group;
  grid: MazeGrid;
  cols: number;
  rows: number;
  pages: PagePickup[];
  lights: FluorescentLight[];
  update(dt: number, time: number): void;
  isBlocked(x: number, z: number, radius: number): boolean;
  getRandomFloorCell(): [number, number];
  getCellAt(x: number, z: number): [number, number];
}

interface FluorescentLight {
  light: THREE.PointLight;
  baseIntensity: number;
  fixtureMesh: THREE.Mesh;
  flickerPhase: number;
  isOut: boolean;
}

function makeWallMaterial(tex: TextureSet): THREE.MeshStandardMaterial {
  const colorMap = tex.color ?? genWallpaper();
  const normalMap = tex.normal ?? genNormalMap(canvasFromTexture(colorMap), 2);
  const roughMap = tex.roughness ?? genRoughnessMap(3, 0.88, 0.1);
  return new THREE.MeshStandardMaterial({
    map: colorMap,
    normalMap,
    roughnessMap: roughMap,
    roughness: 1,
    metalness: 0,
    color: 0xffffff,
  });
}

function makeFloorMaterial(tex: TextureSet): THREE.MeshStandardMaterial {
  const colorMap = tex.color ?? genCarpet();
  colorMap.repeat.set(MAZE.COLS, MAZE.ROWS);
  const normalMap = tex.normal ?? genNormalMap(canvasFromTexture(colorMap), 3);
  normalMap.repeat.set(MAZE.COLS, MAZE.ROWS);
  const roughMap = tex.roughness ?? genRoughnessMap(5, 0.95, 0.08);
  return new THREE.MeshStandardMaterial({
    map: colorMap,
    normalMap,
    roughnessMap: roughMap,
    roughness: 1,
    metalness: 0,
  });
}

function makeCeilingMaterial(tex: TextureSet): THREE.MeshStandardMaterial {
  const colorMap = tex.color ?? genCeiling();
  colorMap.repeat.set(MAZE.COLS / 2, MAZE.ROWS / 2);
  return new THREE.MeshStandardMaterial({
    map: colorMap,
    roughness: 0.92,
    metalness: 0,
    color: 0xffffff,
  });
}

function canvasFromTexture(tex: THREE.Texture): HTMLCanvasElement {
  if (tex instanceof THREE.CanvasTexture && tex.image instanceof HTMLCanvasElement) {
    return tex.image;
  }
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  return c;
}

export function buildWorld(
  scene: THREE.Scene,
  textures: { wallpaper: TextureSet; carpet: TextureSet; ceiling: TextureSet; page: TextureSet }
): World {
  const cols = MAZE.COLS;
  const rows = MAZE.ROWS;
  const grid = generateMaze(cols, rows);
  const group = new THREE.Group();

  // ---- Floor -------------------------------------------------------------
  const floorGeo = new THREE.PlaneGeometry(
    cols * MAZE.CELL_SIZE,
    rows * MAZE.CELL_SIZE
  );
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, makeFloorMaterial(textures.carpet));
  floor.receiveShadow = true;
  group.add(floor);

  // ---- Ceiling ----------------------------------------------------------
  const ceilGeo = new THREE.PlaneGeometry(
    cols * MAZE.CELL_SIZE,
    rows * MAZE.CELL_SIZE
  );
  ceilGeo.rotateX(Math.PI / 2);
  const ceiling = new THREE.Mesh(ceilGeo, makeCeilingMaterial(textures.ceiling));
  ceiling.position.y = MAZE.WALL_HEIGHT;
  ceiling.receiveShadow = true;
  group.add(ceiling);

  // ---- Walls (instanced for performance) ---------------------------------
  const wallMat = makeWallMaterial(textures.wallpaper);
  const wallGeo = new THREE.BoxGeometry(MAZE.CELL_SIZE, MAZE.WALL_HEIGHT, MAZE.CELL_SIZE);

  const wallCells: [number, number][] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y * cols + x] === 1) wallCells.push([x, y]);
    }
  }

  const instMesh = new THREE.InstancedMesh(wallGeo, wallMat, wallCells.length);
  instMesh.castShadow = true;
  instMesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  wallCells.forEach(([cx, cy], i) => {
    const [wx, wz] = cellToWorld(cx, cy);
    dummy.position.set(wx, MAZE.WALL_HEIGHT / 2, wz);
    dummy.updateMatrix();
    instMesh.setMatrixAt(i, dummy.matrix);
  });
  instMesh.instanceMatrix.needsUpdate = true;
  group.add(instMesh);

  // ---- Fluorescent lights at intervals -----------------------------------
  const lights: FluorescentLight[] = [];
  const lightSpacing = 3;
  const fixtureGeo = new THREE.BoxGeometry(1.2, 0.08, 0.3);
  const fixtureMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff8d0,
    emissiveIntensity: 0.6,
  });
  for (let y = 1; y < rows - 1; y += lightSpacing) {
    for (let x = 1; x < cols - 1; x += lightSpacing) {
      if (grid[y * cols + x] === 0) {
        const [wx, wz] = cellToWorld(x, y);
        const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
        fixture.position.set(wx, MAZE.WALL_HEIGHT - 0.06, wz);
        group.add(fixture);

        const light = new THREE.PointLight(
          0xfff5d0,
          FLUORESCENT.BASE_INTENSITY,
          MAZE.CELL_SIZE * 4,
          1.8
        );
        light.position.set(wx, MAZE.WALL_HEIGHT - 0.15, wz);
        light.castShadow = false;
        group.add(light);

        lights.push({
          light,
          baseIntensity: FLUORESCENT.BASE_INTENSITY,
          fixtureMesh: fixture,
          flickerPhase: Math.random() * Math.PI * 2,
          isOut: Math.random() < 0.15,
        });
      }
    }
  }

  // ---- Page pickups ------------------------------------------------------
  const pages: PagePickup[] = [];
  const pageTex = textures.page.color ?? genPage();
  const pageGeo = new THREE.PlaneGeometry(0.5, 0.65);
  const pageMat = new THREE.MeshStandardMaterial({
    map: pageTex,
    side: THREE.DoubleSide,
    emissive: COLORS.PAGE,
    emissiveIntensity: 0.15,
    roughness: 0.9,
  });

  const floorCells = getFloorCells(grid, cols, rows);
  const shuffled = [...floorCells].sort(() => Math.random() - 0.5);
  const placed: [number, number][] = [];
  const startCell: [number, number] = [1, 1];

  for (const cell of shuffled) {
    if (pages.length >= MAZE.PAGE_COUNT) break;
    const distFromStart = Math.hypot(cell[0] - startCell[0], cell[1] - startCell[1]);
    if (distFromStart < 6) continue;
    let tooClose = false;
    for (const p of placed) {
      if (Math.hypot(cell[0] - p[0], cell[1] - p[1]) < 5) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const [wx, wz] = cellToWorld(cell[0], cell[1]);
    const pageGroup = new THREE.Group();
    const pageMesh = new THREE.Mesh(pageGeo, pageMat);
    pageMesh.castShadow = true;
    pageGroup.add(pageMesh);
    const glow = new THREE.PointLight(COLORS.PAGE, 0.4, 3, 2);
    glow.position.set(0, 0, 0);
    pageGroup.add(glow);
    pageGroup.position.set(wx, 1.4, wz);
    pageGroup.userData.spawnTime = 0;
    group.add(pageGroup);

    pages.push({
      group: pageGroup,
      position: pageGroup.position.clone(),
      collected: false,
      cell,
    });
    placed.push(cell);
  }

  scene.add(group);

  // ---- Fog ---------------------------------------------------------------
  scene.fog = new THREE.Fog(FOG.COLOR, FOG.NEAR, FOG.FAR);
  scene.background = new THREE.Color(FOG.COLOR);

  // ---- Collision helper --------------------------------------------------
  const isBlocked = (x: number, z: number, radius: number): boolean => {
    const cellX = Math.floor(x / MAZE.CELL_SIZE + cols / 2);
    const cellZ = Math.floor(z / MAZE.CELL_SIZE + rows / 2);
    if (isWallAt(grid, cols, rows, cellX, cellZ)) return true;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cellX + dx;
        const ny = cellZ + dy;
        if (!isWallAt(grid, cols, rows, nx, ny)) continue;
        const [wx, wz] = cellToWorld(nx, ny);
        const closestX = Math.max(wx - MAZE.CELL_SIZE / 2, Math.min(x, wx + MAZE.CELL_SIZE / 2));
        const closestZ = Math.max(wz - MAZE.CELL_SIZE / 2, Math.min(z, wz + MAZE.CELL_SIZE / 2));
        const distX = x - closestX;
        const distZ = z - closestZ;
        if (distX * distX + distZ * distZ < radius * radius) return true;
      }
    }
    return false;
  };

  const getRandomFloorCell = (): [number, number] => {
    const cells = getFloorCells(grid, cols, rows);
    return cells[Math.floor(Math.random() * cells.length)];
  };

  const getCellAt = (x: number, z: number): [number, number] => {
    const cellX = Math.floor(x / MAZE.CELL_SIZE + cols / 2);
    const cellZ = Math.floor(z / MAZE.CELL_SIZE + rows / 2);
    return [cellX, cellZ];
  };

  // ---- Update loop for lights and pages ----------------------------------
  const update = (dt: number, time: number) => {
    for (const fl of lights) {
      if (fl.isOut) {
        fl.light.intensity = 0;
        (fl.fixtureMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
        continue;
      }
      const flicker = Math.sin(time * 12 + fl.flickerPhase) * 0.04;
      const noise = Math.random() < FLUORESCENT.FLICKER_CHANCE
        ? Math.random() * 0.5
        : 0;
      fl.light.intensity = fl.baseIntensity + flicker - noise;
      (fl.fixtureMesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.6 + flicker - noise;

      if (Math.random() < FLUORESCENT.OUTAGE_CHANCE) {
        fl.isOut = true;
        setTimeout(() => {
          fl.isOut = false;
        }, 1500 + Math.random() * 3000);
      }
    }

    for (const page of pages) {
      if (page.collected) continue;
      const t = time + page.cell[0] * 0.3;
      page.group.position.y = 1.4 + Math.sin(t * 1.5) * 0.08;
      page.group.rotation.y = t * 0.6;
    }
  };

  return {
    group,
    grid,
    cols,
    rows,
    pages,
    lights,
    update,
    isBlocked,
    getRandomFloorCell,
    getCellAt,
  };
}
