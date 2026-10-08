// ============================================================================
// maze.ts — Recursive backtracker maze generation + helpers.
// ============================================================================

import { MAZE } from './constants';

export type MazeGrid = Uint8Array; // 1 = wall, 0 = floor

export function generateMaze(cols: number, rows: number): MazeGrid {
  // Ensure odd dimensions.
  if (cols % 2 === 0) cols++;
  if (rows % 2 === 0) rows++;

  const grid = new Uint8Array(cols * rows).fill(1);

  const idx = (x: number, y: number) => y * cols + x;
  const inBounds = (x: number, y: number) =>
    x > 0 && y > 0 && x < cols - 1 && y < rows - 1;

  // Recursive backtracker (iterative with stack).
  const stack: [number, number][] = [];
  const startX = 1;
  const startY = 1;
  grid[idx(startX, startY)] = 0;
  stack.push([startX, startY]);

  const dirs: [number, number][] = [
    [0, -2],
    [2, 0],
    [0, 2],
    [-2, 0],
  ];

  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    // Shuffle directions.
    const order = dirs
      .map((d) => ({ d, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map((o) => o.d);

    let carved = false;
    for (const [dx, dy] of order) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (inBounds(nx, ny) && grid[idx(nx, ny)] === 1) {
        grid[idx(cx + dx / 2, cy + dy / 2)] = 0;
        grid[idx(nx, ny)] = 0;
        stack.push([nx, ny]);
        carved = true;
        break;
      }
    }
    if (!carved) stack.pop();
  }

  // Add loops to break dead-ends and make it less maze-like, more Backrooms.
  const loopChance = 0.12;
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (grid[idx(x, y)] === 1) {
        // Only knock down walls between two floor cells.
        const horiz =
          grid[idx(x - 1, y)] === 0 && grid[idx(x + 1, y)] === 0;
        const vert =
          grid[idx(x, y - 1)] === 0 && grid[idx(x, y + 1)] === 0;
        if ((horiz || vert) && Math.random() < loopChance) {
          grid[idx(x, y)] = 0;
        }
      }
    }
  }

  return grid;
}

export function getFloorCells(grid: MazeGrid, cols: number, rows: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y * cols + x] === 0) cells.push([x, y]);
    }
  }
  return cells;
}

export function isWallAt(grid: MazeGrid, cols: number, rows: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= cols || y >= rows) return true;
  return grid[y * cols + x] === 1;
}

// Convert grid cell to world position (center of cell).
export function cellToWorld(cx: number, cy: number): [number, number] {
  return [
    (cx - MAZE.COLS / 2) * MAZE.CELL_SIZE,
    (cy - MAZE.ROWS / 2) * MAZE.CELL_SIZE,
  ];
}

// Convert world position to grid cell.
export function worldToCell(wx: number, wz: number): [number, number] {
  return [
    Math.round(wx / MAZE.CELL_SIZE + MAZE.COLS / 2),
    Math.round(wz / MAZE.CELL_SIZE + MAZE.ROWS / 2),
  ];
}
